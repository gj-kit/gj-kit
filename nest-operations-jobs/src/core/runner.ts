import { randomUUID } from 'node:crypto';
import { assertJobDurationMs, systemJobClock } from './clock';
import type { JobClock, JobTimerCancel } from './clock';
import { OperationsJobsError } from './errors';
import { DEFAULT_JOB_TIMEOUT_MS } from './job';
import type { AnyOperationsJob, JobSummary, OperationsJobContext } from './job';
import type { JobLogger } from './logger';
import type { JobRegistryView } from './registry';
import type {
  JobRunReapRequest,
  JobRunStore,
  JobSkipReason,
  JobTerminalStatus,
  JobTrigger,
} from './store';

export const DEFAULT_HEARTBEAT_INTERVAL_MS = 30_000;
export const DEFAULT_STALE_RUN_AFTER_MS = 300_000;
export const DEFAULT_ERROR_TEXT_LIMIT = 4_000;

/**
 * `staleRunAfterMs` must outlast this many heartbeat intervals. The defaults
 * (30_000 / 300_000) leave a factor of 10; two is the floor below which a
 * healthy run's watermark is older than the liveness budget between its own
 * beats, which makes every concurrent trigger eligible to reap it.
 */
const MIN_STALE_RUN_HEARTBEAT_RATIO = 2;

/**
 * How many microtask turns an already-finished body gets after an abort wins the
 * race. `Promise.race` hands the abort unconditional priority when both settle
 * in the same drain, and recording a body that succeeded as "aborted" is the
 * double-execution this package exists to prevent. The grace is microtasks only:
 * a body still waiting on I/O cannot settle inside it, so an orphan is still
 * recorded as aborted.
 */
const BODY_SETTLE_GRACE_TURNS = 8;

export type JobReapScope = 'overlap-key' | 'all' | 'off';

export interface JobRunnerOptions {
  readonly registry: JobRegistryView;
  readonly store: JobRunStore;
  /** Required: a silent runner hides exactly the failures this package exists to surface. */
  readonly logger: JobLogger;
  readonly clock?: JobClock | undefined;
  /**
   * Beat cadence, defaulting to {@link DEFAULT_HEARTBEAT_INTERVAL_MS}.
   *
   * **Invariant: `staleRunAfterMs` must be at least twice this value**, and
   * `createJobRunner` throws `ERR_JOB_INVALID` when it is not. A liveness budget
   * shorter than the beat cadence makes a perfectly healthy run look stale
   * between its own beats, so any concurrent trigger reaps it and starts a
   * second body — the single-execution guarantee is gone. The defaults leave a
   * factor of 10.
   */
  readonly heartbeatIntervalMs?: number | undefined;
  /**
   * Liveness budget, defaulting to {@link DEFAULT_STALE_RUN_AFTER_MS}. Sent to
   * the store as a duration on every reap, and used as the runner's own patience
   * for failing heartbeats: once nothing has been written for this long, the run
   * aborts itself rather than wait to be reaped by another instance.
   *
   * Must be at least twice `heartbeatIntervalMs` — see that option. Lowering it
   * for faster dead-instance recovery is the natural first tuning move, and it
   * is exactly the move that voids overlap prevention if taken too far.
   */
  readonly staleRunAfterMs?: number | undefined;
  readonly defaultTimeoutMs?: number | undefined;
  /** Defaults to `'overlap-key'`: only free the key this execution is about to claim. */
  readonly reapScope?: JobReapScope | undefined;
  readonly reapLimit?: number | undefined;
  /**
   * The deploying revision or build id, recorded on every run row so a failure
   * can be tied to what was deployed. The host reads it from wherever its
   * platform publishes it; this library reads no environment variable.
   */
  readonly serviceRevision?: string | null | undefined;
  readonly errorTextLimit?: number | undefined;
  /** Run-scoped id generator for overlap suffixes. Defaults to a random UUID. */
  readonly newId?: (() => string) | undefined;
}

export interface JobExecuteOptions {
  /**
   * Aborts the job in addition to the deadline — e.g. graceful shutdown.
   *
   * A signal that is **already aborted** short-circuits before the reap and the
   * claim: `execute` throws `ERR_JOB_ABORTED`, no row is written and the body
   * never runs. Work the host explicitly declined to start must not produce side
   * effects, nor a FAILED run row for an operator to chase.
   */
  readonly signal?: AbortSignal | undefined;
}

/** Whether the returned `status` and the stored row agree. */
export type JobRunRecordOutcome =
  /** The completing write was accepted: the row says exactly what `status` says. */
  | 'settled'
  /** A reaper had already finalised the row as TIMED_OUT; `status` describes this body only. */
  | 'superseded'
  /** The completing write failed. The row is still RUNNING until the next reap. */
  | 'unrecorded';

interface JobExecutionBase {
  readonly runId: string;
  readonly jobKey: string;
  readonly durationMs: number;
  /**
   * `status` is always the truth about this runner's body; this says whether the
   * stored row agrees. Anything but `'settled'` means the record is not this
   * run's to trust, and — for `'superseded'` — that a second body may be running
   * under a different `runId`.
   */
  readonly recorded: JobRunRecordOutcome;
}

export type JobExecutionResult =
  | (JobExecutionBase & { readonly status: 'SUCCEEDED'; readonly summary?: JobSummary | undefined })
  | (JobExecutionBase & {
      readonly status: 'FAILED';
      readonly summary?: JobSummary | undefined;
      readonly error: OperationsJobsError;
    })
  | (JobExecutionBase & { readonly status: 'TIMED_OUT'; readonly error: OperationsJobsError })
  | (JobExecutionBase & { readonly status: 'SKIPPED'; readonly reason: JobSkipReason });

export interface JobRunner {
  /**
   * Run one job end to end.
   *
   * Throws only when this runner will not finalise a row: unknown key
   * (`ERR_JOB_UNKNOWN`), rejected input (`ERR_JOB_INPUT_INVALID` /
   * `ERR_JOB_INPUT_UNEXPECTED`), a caller signal that was already aborted before
   * the run started (`ERR_JOB_ABORTED`) or a store failure while claiming
   * (`ERR_JOB_STORE`). The first three leave no row at all; a claim that committed
   * before its response was lost can leave an orphan RUNNING row that the next
   * reap settles. Every outcome that ran the body — including failure and
   * timeout — is returned, never thrown, with `recorded` saying whether the
   * stored row agrees with the returned `status`.
   */
  execute(
    jobKey: string,
    body: unknown,
    trigger: JobTrigger,
    options?: JobExecuteOptions,
  ): Promise<JobExecutionResult>;
  /**
   * Abandon stale RUNNING rows across every key, using the runner's
   * `staleRunAfterMs`. For a host-owned sweeper job: `execute` only reaps around
   * the key it is about to claim, so a job that is never triggered again needs
   * this to release its orphaned rows.
   *
   * A store failure raises `ERR_JOB_STORE`, like every other store call in this
   * package — the driver's own error never escapes.
   */
  reapStaleRuns(options?: { readonly limit?: number | undefined }): Promise<number>;
}

/** 비객체 반환은 요약이 아니다 — 타입이 허용 범위를 말하고, 런타임이 접는다. */
function toSummary(value: unknown): JobSummary | undefined {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    return value as JobSummary;
  }
  return undefined;
}

function describeError(error: unknown, limit: number): string {
  if (error instanceof Error) {
    const stack = typeof error.stack === 'string' ? error.stack : '';
    return [error.message, stack].filter((part) => part.length > 0).join('\n').slice(0, limit);
  }
  return String(error).slice(0, limit);
}

function isEmptyBody(body: unknown): boolean {
  if (body === undefined || body === null) return true;
  return (
    typeof body === 'object' &&
    !Array.isArray(body) &&
    Object.keys(body as Record<string, unknown>).length === 0
  );
}

export function createJobRunner(options: JobRunnerOptions): JobRunner {
  const registry = options.registry;
  const store = options.store;
  const logger = options.logger;
  const clock = options.clock ?? systemJobClock();
  const heartbeatIntervalMs = assertJobDurationMs(
    options.heartbeatIntervalMs ?? DEFAULT_HEARTBEAT_INTERVAL_MS,
    'operations job runner option heartbeatIntervalMs',
  );
  const staleRunAfterMs = assertJobDurationMs(
    options.staleRunAfterMs ?? DEFAULT_STALE_RUN_AFTER_MS,
    'operations job runner option staleRunAfterMs',
  );
  // 순서가 뒤집힌 쌍은 조용히 단일 실행 보장을 지운다: 건강한 run의 워터마크가
  // 자기 비트 사이에서 항상 예산보다 오래돼 보이고, 그 사이의 어떤 트리거든
  // 그 행을 reap하고 두 번째 본문을 시작한다.
  if (staleRunAfterMs < heartbeatIntervalMs * MIN_STALE_RUN_HEARTBEAT_RATIO) {
    throw new OperationsJobsError(
      'ERR_JOB_INVALID',
      `operations job runner needs staleRunAfterMs (${staleRunAfterMs}ms) to be at least ${MIN_STALE_RUN_HEARTBEAT_RATIO}x heartbeatIntervalMs (${heartbeatIntervalMs}ms): a liveness budget that expires between two beats makes every healthy run reapable by the next trigger, which starts a second body. The defaults are ${DEFAULT_HEARTBEAT_INTERVAL_MS} and ${DEFAULT_STALE_RUN_AFTER_MS}.`,
    );
  }
  const defaultTimeoutMs = assertJobDurationMs(
    options.defaultTimeoutMs ?? DEFAULT_JOB_TIMEOUT_MS,
    'operations job runner option defaultTimeoutMs',
  );
  const reapScope: JobReapScope = options.reapScope ?? 'overlap-key';
  const reapLimit = options.reapLimit;
  const serviceRevision = options.serviceRevision;
  const errorTextLimit = options.errorTextLimit ?? DEFAULT_ERROR_TEXT_LIMIT;
  const newId = options.newId ?? (() => randomUUID());

  function parseInput(job: AnyOperationsJob, body: unknown): unknown {
    const empty = isEmptyBody(body);
    if (job.inputSchema === undefined || job.inputSchema === null) {
      if (!empty) {
        throw new OperationsJobsError(
          'ERR_JOB_INPUT_UNEXPECTED',
          `operations job "${job.key}" does not accept input`,
          { jobKey: job.key },
        );
      }
      return undefined;
    }
    try {
      // 빈 body는 {}로 정규화한다: 전 필드 optional 스키마는 통과하고,
      // 필수 필드가 있는 스키마는 여기서 거부된다.
      return job.inputSchema.parse(empty ? {} : body);
    } catch (error) {
      throw new OperationsJobsError(
        'ERR_JOB_INPUT_INVALID',
        `operations job "${job.key}" rejected its input`,
        { jobKey: job.key, cause: error },
      );
    }
  }

  async function reap(request: JobRunReapRequest, jobKey: string): Promise<number> {
    try {
      const count = await store.reapStale(request);
      if (count > 0) {
        logger.warn({ jobKey, reaped: count }, 'stale RUNNING job runs reaped');
      }
      return count;
    } catch (error) {
      // reap은 안전망이지 전제가 아니다 — 실패해도 실행은 계속한다.
      logger.warn(
        { jobKey, err: describeError(error, errorTextLimit) },
        'stale job run reap failed',
      );
      return 0;
    }
  }

  async function execute(
    jobKey: string,
    body: unknown,
    trigger: JobTrigger,
    executeOptions?: JobExecuteOptions,
  ): Promise<JobExecutionResult> {
    // 1. 조회
    const job = registry.get(jobKey);
    if (job === undefined) {
      throw new OperationsJobsError('ERR_JOB_UNKNOWN', `unknown operations job: "${jobKey}"`, {
        jobKey,
      });
    }

    // 2. 입력 검증 — 실패하면 행을 만들지 않는다.
    const input = parseInput(job, body);

    // 2.5 이미 abort된 호출자 시그널 — reap도 claim도 하지 않고 여기서 끝난다.
    //     우아한 종료 중에 "시작하지 않기로 한 일"이 부수효과를 돌리고 FAILED 실행
    //     기록까지 남겨 운영자를 깨우면 안 된다. 행을 만들지 않는다는 점에서
    //     ERR_JOB_INPUT_INVALID와 같은 자리다.
    const externalSignal = executeOptions?.signal;
    if (externalSignal !== undefined && externalSignal.aborted) {
      throw new OperationsJobsError(
        'ERR_JOB_ABORTED',
        `operations job "${job.key}" was aborted by its caller before it started`,
        { jobKey: job.key },
      );
    }

    // 3. reap — claim하려는 범위만, 컷오프가 아니라 기간을 보낸다(S6).
    const overlapPolicy = job.overlapPolicy ?? 'forbid';
    const overlapKey = overlapPolicy === 'allow' ? `${job.key}#${newId()}` : job.key;
    if (reapScope !== 'off') {
      const request: JobRunReapRequest = {
        staleAfterMs: staleRunAfterMs,
        ...(reapLimit === undefined ? {} : { limit: reapLimit }),
        ...(reapScope === 'all'
          ? {}
          : overlapPolicy === 'allow'
            ? // allow 잡의 overlap key는 매 run 새로 만들어지므로 그 key로 좁히면
              // 어떤 행도 못 잡는다 — 죽은 allow run은 jobKey 범위로만 마감된다.
              { jobKey: job.key }
            : { overlapKey }),
      };
      await reap(request, job.key);
    }

    // 4. claim
    const startedAt = clock.now();
    let claim;
    try {
      claim = await store.claim({
        jobKey: job.key,
        overlapKey,
        trigger,
        input: input ?? null,
        startedAt,
        ...(serviceRevision === undefined ? {} : { serviceRevision }),
      });
    } catch (error) {
      throw new OperationsJobsError(
        'ERR_JOB_STORE',
        `the run store failed while claiming operations job "${job.key}"`,
        { jobKey: job.key, cause: error },
      );
    }

    if (claim === null) {
      // SKIPPED는 성공 코드로 나간다 — 이 경고가 영구 스킵의 유일한 관측 지점이다.
      logger.warn(
        { jobKey: job.key, overlapKey, trigger: trigger.source },
        `job skipped: ${job.key} (overlap key already held)`,
      );
      const reason: JobSkipReason = 'overlap';
      let skipped;
      try {
        skipped = await store.recordSkipped({
          jobKey: job.key,
          trigger,
          input: input ?? null,
          at: startedAt,
          reason,
          ...(serviceRevision === undefined ? {} : { serviceRevision }),
        });
      } catch (error) {
        throw new OperationsJobsError(
          'ERR_JOB_STORE',
          `the run store failed while recording a skipped run of "${job.key}"`,
          { jobKey: job.key, cause: error },
        );
      }
      return {
        runId: skipped.runId,
        jobKey: job.key,
        durationMs: 0,
        recorded: 'settled',
        status: 'SKIPPED',
        reason,
      };
    }

    const runId = claim.runId;
    logger.info(
      { jobKey: job.key, runId, trigger: trigger.source },
      `job started: ${job.key}`,
    );

    // 5. 실행
    const timeoutMs = job.timeoutMs ?? defaultTimeoutMs;
    const deadlineAt = startedAt + timeoutMs;
    const controller = new AbortController();
    let settled = false;
    let lastOkHeartbeatAt = clock.now();

    const abortWith = (error: OperationsJobsError): void => {
      if (!controller.signal.aborted) controller.abort(error);
    };

    let detachExternal: (() => void) | undefined;
    if (externalSignal !== undefined) {
      const onExternalAbort = (): void => {
        abortWith(
          new OperationsJobsError(
            'ERR_JOB_ABORTED',
            `operations job "${job.key}" was aborted by its caller`,
            { jobKey: job.key, runId },
          ),
        );
      };
      if (externalSignal.aborted) onExternalAbort();
      else {
        externalSignal.addEventListener('abort', onExternalAbort, { once: true });
        detachExternal = () => externalSignal.removeEventListener('abort', onExternalAbort);
      }
    }

    const cancelDeadline: JobTimerCancel = clock.after(timeoutMs, () => {
      abortWith(
        new OperationsJobsError(
          'ERR_JOB_TIMEOUT',
          `operations job "${job.key}" timed out after ${timeoutMs}ms`,
          { jobKey: job.key, runId },
        ),
      );
    });

    const claimLost = (): OperationsJobsError =>
      new OperationsJobsError(
        'ERR_JOB_ABORTED',
        `operations job "${job.key}" lost its claim and was aborted`,
        { jobKey: job.key, runId },
      );

    const cancelHeartbeat: JobTimerCancel = clock.every(heartbeatIntervalMs, () => {
      void (async () => {
        if (settled) return;
        let ok = false;
        try {
          const alive = await store.heartbeat({ runId });
          if (settled) return;
          if (alive) {
            lastOkHeartbeatAt = clock.now();
            ok = true;
          } else {
            logger.warn({ jobKey: job.key, runId }, 'job heartbeat rejected: claim lost');
            abortWith(claimLost());
            return;
          }
        } catch (error) {
          logger.warn(
            { jobKey: job.key, runId, err: describeError(error, errorTextLimit) },
            'job heartbeat write failed',
          );
        }
        // 저장소가 죽어 있으면 false가 도착할 통로가 없다 — 다른 인스턴스가 이 행을
        // reap할 자격을 갖는 바로 그 시점에 스스로 멈춘다.
        if (!ok && !settled && clock.now() - lastOkHeartbeatAt >= staleRunAfterMs) {
          logger.warn(
            { jobKey: job.key, runId, staleRunAfterMs },
            'job heartbeat unverifiable for the full liveness budget: aborting',
          );
          abortWith(claimLost());
        }
      })();
    });

    const context: OperationsJobContext = {
      runId,
      jobKey: job.key,
      trigger,
      logger,
      signal: controller.signal,
      deadlineAt,
      heartbeat: async (progress?: JobSummary): Promise<boolean> => {
        if (settled) return false;
        try {
          const alive = await store.heartbeat(
            progress === undefined ? { runId } : { runId, progress },
          );
          if (settled) return false;
          if (!alive) {
            abortWith(claimLost());
            return false;
          }
          lastOkHeartbeatAt = clock.now();
          return true;
        } catch (error) {
          logger.warn(
            { jobKey: job.key, runId, err: describeError(error, errorTextLimit) },
            'job heartbeat write failed',
          );
          return true;
        }
      },
    };

    const abortPromise = new Promise<never>((_resolve, reject) => {
      if (controller.signal.aborted) {
        reject(controller.signal.reason);
        return;
      }
      controller.signal.addEventListener(
        'abort',
        () => {
          reject(controller.signal.reason);
        },
        { once: true },
      );
    });
    // 본문을 시작하지 않는 경로에서는 아무도 이 rejection을 소비하지 않는다.
    void abortPromise.catch(() => undefined);

    // 본문 정산은 race와 **독립적으로** 관측한다. 그러지 않으면 abort와 본문 완료가
    // 같은 microtask drain에 도착했을 때 Promise.race가 abort에 무조건 우선권을 주고,
    // 이미 성공한 본문이 "claim을 잃었다"로 기록된다 — 스케줄러가 재시도하고,
    // 이 패키지가 막으려는 이중 실행이 바로 그렇게 열린다.
    let bodyStarted = false;
    let bodySettled = false;
    let bodyValue: JobSummary | void = undefined;
    let bodyError: unknown;
    let bodyThrew = false;

    const observeLateSettlement = (error?: unknown): void => {
      logger.warn(
        error === undefined
          ? { jobKey: job.key, runId }
          : { jobKey: job.key, runId, err: describeError(error, errorTextLimit) },
        'job body settled after the run was recorded',
      );
    };

    if (controller.signal.aborted) {
      // claim 도중 호출자가 abort했다 — 본문은 시작조차 하지 않는다.
      logger.warn(
        { jobKey: job.key, runId },
        'job aborted before its body started: the caller signal fired during the claim',
      );
    } else {
      bodyStarted = true;
      let bodyPromise: Promise<JobSummary | void>;
      try {
        bodyPromise = Promise.resolve(job.run(input as never, context));
      } catch (error) {
        bodyPromise = Promise.reject(error);
      }
      // 이 핸들러가 bodyPromise의 **첫** 소비자다: 정산 사실을 여기서 잡고,
      // 시그널을 무시한 잡(orphan)의 늦은 rejection도 여기서 소비해 프로세스를 지킨다.
      const settlement = bodyPromise.then(
        (value) => {
          if (settled) {
            observeLateSettlement();
            return;
          }
          bodySettled = true;
          bodyValue = value;
        },
        (error: unknown) => {
          if (settled) {
            observeLateSettlement(error);
            return;
          }
          bodySettled = true;
          bodyThrew = true;
          bodyError = error;
        },
      );

      try {
        await Promise.race([settlement, abortPromise]);
      } catch {
        // abort가 먼저 도착했다. 같은 drain에서 이미 끝난 본문에만 유예를 준다 —
        // I/O를 기다리는 본문은 이 안에서 정산할 수 없으므로 orphan은 그대로 abort로 남는다.
        for (let turn = 0; turn < BODY_SETTLE_GRACE_TURNS && !bodySettled; turn += 1) {
          await Promise.resolve();
        }
      }
    }

    // 7. 마감 — 타이머를 먼저 끊고 settled를 세운 뒤 정확히 한 번 complete한다.
    cancelDeadline();
    cancelHeartbeat();
    detachExternal?.();
    settled = true;

    const finishedAt = clock.now();
    const elapsedMs = finishedAt - startedAt;
    if (elapsedMs < 0) {
      // 주입 시계가 뒤로 갔다(NTP step 등). 음수를 그대로 저장하면 duration 대시보드가
      // 조용히 왜곡되고 finished_at < started_at이 범위 쿼리를 깬다 — 0으로 바닥을 깔되
      // 사실 자체는 로그로 드러낸다.
      logger.warn(
        { jobKey: job.key, runId, startedAt, finishedAt, elapsedMs },
        'job run clock moved backwards during the run: durationMs floored to 0',
      );
    }
    const durationMs = Math.max(0, elapsedMs);

    // 6. 분류 — abort된 실행은 던져진 값을 보지 않고 signal.reason으로만 정한다.
    //    유일한 예외는 본문이 abort보다 먼저(또는 같은 turn에) **성공 정산**한 경우다:
    //    그 abort는 아무것도 끊지 않았고, 끝난 일을 "중단됨"으로 적을 이유가 없다.
    //    본문이 던진 경우는 예외가 아니다 — abort를 관측하고 던진 잡이 흔하고,
    //    그때 정본은 여전히 signal.reason이다.
    let status: JobTerminalStatus;
    let summary: JobSummary | undefined;
    let failure: OperationsJobsError | undefined;
    let errorText: string | undefined;

    const bodySucceeded = bodyStarted && bodySettled && !bodyThrew;

    if (controller.signal.aborted && !bodySucceeded) {
      const reason = controller.signal.reason as OperationsJobsError;
      status = reason.code === 'ERR_JOB_TIMEOUT' ? 'TIMED_OUT' : 'FAILED';
      failure = reason;
      errorText = describeError(reason, errorTextLimit);
    } else if (bodyThrew) {
      status = 'FAILED';
      failure = new OperationsJobsError(
        'ERR_JOB_FAILED',
        `operations job "${job.key}" threw`,
        { jobKey: job.key, runId, cause: bodyError },
      );
      errorText = describeError(bodyError, errorTextLimit);
    } else {
      summary = toSummary(bodyValue);
      if (summary?.ok === false) {
        status = 'FAILED';
        failure = new OperationsJobsError(
          'ERR_JOB_FAILED',
          `operations job "${job.key}" reported ok: false`,
          { jobKey: job.key, runId },
        );
        errorText = 'job reported ok: false';
      } else {
        status = 'SUCCEEDED';
      }
    }

    if (controller.signal.aborted && bodySucceeded) {
      const reason = controller.signal.reason as OperationsJobsError | undefined;
      logger.warn(
        { jobKey: job.key, runId, code: reason?.code, status },
        'job body completed in the same turn the run was aborted: recording the body result, not the abort',
      );
    }

    let recorded: JobRunRecordOutcome;
    try {
      const accepted = await store.complete({
        runId,
        status,
        finishedAt,
        durationMs,
        ...(summary === undefined ? {} : { summary }),
        ...(errorText === undefined ? {} : { error: errorText }),
      });
      recorded = accepted ? 'settled' : 'superseded';
      if (!accepted) {
        logger.warn(
          { jobKey: job.key, runId, status },
          'job run was already settled by a reaper: this body may be a second run',
        );
      }
    } catch (error) {
      recorded = 'unrecorded';
      logger.error(
        { jobKey: job.key, runId, status, err: describeError(error, errorTextLimit) },
        'job run finalize failed: the row stays RUNNING until the next reap',
      );
    }

    if (status === 'SUCCEEDED') {
      logger.info(
        { jobKey: job.key, runId, durationMs, recorded, summary },
        `job finished: ${job.key}`,
      );
      return {
        runId,
        jobKey: job.key,
        durationMs,
        recorded,
        status: 'SUCCEEDED',
        ...(summary === undefined ? {} : { summary }),
      };
    }

    const error = failure as OperationsJobsError;
    logger.error(
      { jobKey: job.key, runId, durationMs, recorded, code: error.code },
      `job ${status === 'TIMED_OUT' ? 'timed out' : 'failed'}: ${job.key}`,
    );
    if (status === 'TIMED_OUT') {
      return { runId, jobKey: job.key, durationMs, recorded, status: 'TIMED_OUT', error };
    }
    return {
      runId,
      jobKey: job.key,
      durationMs,
      recorded,
      status: 'FAILED',
      ...(summary === undefined ? {} : { summary }),
      error,
    };
  }

  return {
    execute,
    async reapStaleRuns(reapOptions?: { readonly limit?: number | undefined }): Promise<number> {
      const limit = reapOptions?.limit ?? reapLimit;
      try {
        return await store.reapStale({
          staleAfterMs: staleRunAfterMs,
          ...(limit === undefined ? {} : { limit }),
        });
      } catch (error) {
        // 이 패키지가 던지는 에러 타입은 하나다 — 드라이버 예외를 그대로 흘리면
        // toHttpException이 매핑하지 못하고 원문 메시지가 응답으로 샌다.
        throw new OperationsJobsError(
          'ERR_JOB_STORE',
          'the run store failed while reaping stale operations job runs',
          { cause: error },
        );
      }
    },
  };
}

/** Narrow a result to the success branch, throwing the recorded failure otherwise. */
export function assertJobSucceeded(
  result: JobExecutionResult,
): asserts result is Extract<JobExecutionResult, { status: 'SUCCEEDED' }> {
  if (result.status === 'SUCCEEDED') return;
  if (result.status === 'SKIPPED') {
    throw new OperationsJobsError(
      'ERR_JOB_ABORTED',
      `operations job "${result.jobKey}" was skipped: ${result.reason}`,
      { jobKey: result.jobKey, runId: result.runId },
    );
  }
  throw result.error;
}
