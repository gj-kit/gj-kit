import type { JobSummary } from './job';

/**
 * 저장소 포트와 동시성 계약(S1–S7). 라이브러리는 테이블·ORM·마이그레이션을 소유하지
 * 않는다. 대신 저장소가 무엇을 원자적으로 해야 하는지를 여기에 문장으로 못 박고,
 * `./testing`의 `jobRunStoreContractCases()`가 그 문장을 실행 가능한 검사로 바꾼다.
 */

export type JobRunStatus = 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'TIMED_OUT' | 'SKIPPED';
export type JobTerminalStatus = Exclude<JobRunStatus, 'RUNNING'>;

/**
 * Who triggered the run. The listed values are conventions with completion
 * support; any other string is accepted because trigger sources are host facts.
 */
export type JobTriggerSource = 'SCHEDULER' | 'CLI' | 'ADMIN' | (string & {});

export interface JobTrigger {
  readonly source: JobTriggerSource;
  readonly triggeredBy?: string | null | undefined;
}

export type JobSkipReason = 'overlap';

export interface JobRunClaimRequest {
  readonly jobKey: string;
  /**
   * Opaque overlap token. The store must treat it as a bare string: uniqueness
   * among RUNNING rows is the entire contract, and the runner owns how it is
   * derived from the job's overlap policy.
   */
  readonly overlapKey: string;
  readonly trigger: JobTrigger;
  /** Already validated by the runner. Persist as JSON, or `null` when absent. */
  readonly input: unknown;
  /**
   * Epoch milliseconds from the runner's injected clock, recorded verbatim (S6).
   * The store additionally initialises the run's liveness watermark from its own
   * clock, which is the value `reapStale` compares against — see S6.
   */
  readonly startedAt: number;
  readonly serviceRevision?: string | null | undefined;
}

export interface JobRunClaim {
  readonly runId: string;
}

/**
 * Deliberately carries no timestamp: the liveness watermark is the store's own
 * clock (S6). A caller-supplied instant would sit on one of N runner clocks
 * while the reaper compares it on another — the one comparison that decides
 * whether a job body runs twice.
 */
export interface JobRunHeartbeatRequest {
  readonly runId: string;
  readonly progress?: JobSummary | undefined;
}

export interface JobRunCompleteRequest {
  readonly runId: string;
  readonly status: JobTerminalStatus;
  /** Epoch milliseconds from the runner's injected clock, recorded verbatim (S6). */
  readonly finishedAt: number;
  readonly durationMs: number;
  readonly summary?: JobSummary | undefined;
  /** Already truncated by the runner. Never returned to an HTTP caller. */
  readonly error?: string | undefined;
}

export interface JobRunSkippedRequest {
  readonly jobKey: string;
  readonly trigger: JobTrigger;
  readonly input: unknown;
  /** Epoch milliseconds from the runner's injected clock, recorded verbatim (S6). */
  readonly at: number;
  readonly reason: JobSkipReason;
  readonly serviceRevision?: string | null | undefined;
}

export interface JobRunReapRequest {
  /**
   * Liveness budget in milliseconds. A RUNNING row is abandoned when its
   * watermark is older than this **on the store's own clock** (S6): the runner
   * sends a duration, never an instant, because with N runner instances there
   * are N process clocks and exactly one store clock. The store also stamps the
   * reaped rows' `finishedAt` from that same clock.
   */
  readonly staleAfterMs: number;
  /**
   * Narrow to one job's rows. The runner uses this for `allow`-policy jobs,
   * whose overlap keys are minted per run and therefore match no existing row.
   */
  readonly jobKey?: string | undefined;
  /** Narrow to one overlap key — the key the runner is about to claim. */
  readonly overlapKey?: string | undefined;
  /** Upper bound on rows this call may move. */
  readonly limit?: number | undefined;
}

/**
 * Persistence port for job runs. The library owns no schema; a host maps these
 * five operations onto its own table.
 *
 * The concurrency obligations below are part of the contract, and
 * `jobRunStoreContractCases()` from the `./testing` subpath checks them.
 *
 * - **S1 single-claimer** — for one `overlapKey` at most one `RUNNING` row exists
 *   at any instant. `claim` is an atomic compare-and-set, never "read, then
 *   insert if absent". The loser returns `null` rather than throwing. The only
 *   exception convertible to `null` is the overlap uniqueness violation; every
 *   other constraint violation, connection error or serialisation failure must
 *   be rethrown so the runner reports `ERR_JOB_STORE`. Implement with a
 *   **partial** unique index (`WHERE status = 'RUNNING'`) and narrow the caught
 *   violation by constraint name — swallowing every uniqueness violation turns a
 *   permanently blocked job into a stream of green SKIPPED responses.
 * - **S2 monotonic heartbeat** — `heartbeat` advances the liveness watermark to
 *   the store's own current time and returns `true` only while the row is
 *   `RUNNING`. The watermark never moves backwards. A row that is no longer
 *   `RUNNING` is left untouched and answered `false`.
 * - **S3 idempotent completion** — `complete` writes only on a
 *   `RUNNING -> terminal` transition and returns `true`. An already-settled row
 *   is left untouched and answered `false`. Terminal is final.
 * - **S4 atomic reap** — `reapStale` transitions matching stale `RUNNING` rows to
 *   `TIMED_OUT` in a single statement and returns only the count it actually
 *   moved, so two concurrent reapers never double-count. Releasing the overlap
 *   key is immediate.
 * - **S5 run id uniqueness** — ids returned by `claim` and `recordSkipped` are
 *   globally unique and immutable for the row's lifetime.
 * - **S6 clock axis split** — recording instants (`startedAt`, `at`,
 *   `finishedAt`) come from the runner's injected clock and are stored verbatim.
 *   Liveness instants (the heartbeat watermark and the stale cutoff) come from
 *   the store's own clock only. `claim` must initialise the watermark from that
 *   clock; a null watermark is never reapable and would hold the overlap key
 *   forever.
 * - **S7 input/summary round trip** — `input` and `summary` are stored as
 *   JSON-round-trippable values; a value that cannot be stored raises rather
 *   than being silently dropped.
 */
export interface JobRunStore {
  /** Atomically take the overlap key. `null` means another run holds it. */
  claim(request: JobRunClaimRequest): Promise<JobRunClaim | null>;
  /** `false` means the run is no longer RUNNING and the claim is gone. */
  heartbeat(request: JobRunHeartbeatRequest): Promise<boolean>;
  /** `false` means the run was already settled; the stored outcome is unchanged. */
  complete(request: JobRunCompleteRequest): Promise<boolean>;
  /** Record a run that never executed. Returns the new run's id. */
  recordSkipped(request: JobRunSkippedRequest): Promise<JobRunClaim>;
  /** Abandon stale RUNNING rows as TIMED_OUT. Returns how many this call moved. */
  reapStale(request: JobRunReapRequest): Promise<number>;
}
