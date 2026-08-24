import { randomUUID } from 'node:crypto';
import { systemJobClock } from '../core/clock';
import type { JobClock } from '../core/clock';
import type { JobSummary } from '../core/job';
import type {
  JobRunClaim,
  JobRunClaimRequest,
  JobRunCompleteRequest,
  JobRunHeartbeatRequest,
  JobRunReapRequest,
  JobRunSkippedRequest,
  JobRunStatus,
  JobRunStore,
  JobTrigger,
} from '../core/store';

export interface StoredJobRun {
  readonly runId: string;
  readonly jobKey: string;
  readonly overlapKey: string | null;
  readonly status: JobRunStatus;
  readonly trigger: JobTrigger;
  readonly input: unknown;
  readonly summary: JobSummary | undefined;
  readonly error: string | undefined;
  /** Epoch ms, exactly as the runner supplied it (S6, recording axis). */
  readonly startedAt: number;
  /**
   * Epoch ms on the **store's** clock (S6, liveness axis): set when the run is
   * claimed, advanced by every accepted heartbeat, compared by `reapStale`.
   * Never null — a null watermark is unreapable and holds the overlap key forever.
   */
  readonly heartbeatAt: number;
  /** Epoch ms. The runner's value for a completed run, the store's for a reaped one. */
  readonly finishedAt: number | undefined;
  readonly durationMs: number | undefined;
  readonly serviceRevision: string | null;
}

interface MutableRow {
  runId: string;
  jobKey: string;
  overlapKey: string | null;
  status: JobRunStatus;
  trigger: JobTrigger;
  input: unknown;
  summary: JobSummary | undefined;
  error: string | undefined;
  startedAt: number;
  heartbeatAt: number;
  finishedAt: number | undefined;
  durationMs: number | undefined;
  serviceRevision: string | null;
}

/** S7 — 저장 불가 값은 조용히 버리지 않고 예외로 알린다. */
function jsonRoundTrip<T>(value: T): T {
  if (value === undefined) return value;
  return JSON.parse(JSON.stringify(value)) as T;
}

function snapshot(row: MutableRow): StoredJobRun {
  return {
    runId: row.runId,
    jobKey: row.jobKey,
    overlapKey: row.overlapKey,
    status: row.status,
    trigger: { ...row.trigger },
    input: jsonRoundTrip(row.input),
    summary: row.summary === undefined ? undefined : jsonRoundTrip(row.summary),
    error: row.error,
    startedAt: row.startedAt,
    heartbeatAt: row.heartbeatAt,
    finishedAt: row.finishedAt,
    durationMs: row.durationMs,
    serviceRevision: row.serviceRevision,
  };
}

export interface MemoryJobRunStore extends JobRunStore {
  /** Side-effect-free inspection; returns defensive copies. */
  runs(): readonly StoredJobRun[];
  runOf(runId: string): StoredJobRun | undefined;
}

export interface MemoryJobRunStoreOptions {
  readonly newId?: (() => string) | undefined;
  /**
   * The store's own clock — the liveness axis of S6. Defaults to the system
   * clock. Pass the same `fakeJobClock` the runner uses to make staleness
   * deterministic, or a second one to simulate clock skew.
   */
  readonly clock?: JobClock | undefined;
}

/**
 * In-memory `JobRunStore` honouring S1-S7. Single-process only: its atomicity
 * comes from the absence of `await` between read and write, which no networked
 * store can rely on. **Never use it in production** — a real deployment needs a
 * partial unique index and an atomic reap statement, and
 * `jobRunStoreContractCases()` is how a host proves it has them.
 */
export function memoryJobRunStore(options?: MemoryJobRunStoreOptions): MemoryJobRunStore {
  const rows = new Map<string, MutableRow>();
  const newId = options?.newId ?? (() => randomUUID());
  const clock = options?.clock ?? systemJobClock();

  const holdsOverlapKey = (overlapKey: string): boolean => {
    for (const row of rows.values()) {
      if (row.status === 'RUNNING' && row.overlapKey === overlapKey) return true;
    }
    return false;
  };

  return {
    async claim(request: JobRunClaimRequest): Promise<JobRunClaim | null> {
      // read와 write 사이에 await가 없다 = 이 프로세스 안에서의 원자성.
      if (holdsOverlapKey(request.overlapKey)) return null;
      const input = jsonRoundTrip(request.input);
      const runId = newId();
      rows.set(runId, {
        runId,
        jobKey: request.jobKey,
        overlapKey: request.overlapKey,
        status: 'RUNNING',
        trigger: { ...request.trigger },
        input,
        summary: undefined,
        error: undefined,
        startedAt: request.startedAt,
        // S6 — liveness 워터마크는 저장소 자기 시계로 반드시 초기화한다.
        heartbeatAt: clock.now(),
        finishedAt: undefined,
        durationMs: undefined,
        serviceRevision: request.serviceRevision ?? null,
      });
      return { runId };
    },

    async heartbeat(request: JobRunHeartbeatRequest): Promise<boolean> {
      const row = rows.get(request.runId);
      if (row === undefined || row.status !== 'RUNNING') return false;
      const progress = request.progress === undefined ? undefined : jsonRoundTrip(request.progress);
      // S2 — 워터마크는 뒤로 가지 않는다.
      row.heartbeatAt = Math.max(row.heartbeatAt, clock.now());
      if (progress !== undefined) row.summary = progress;
      return true;
    },

    async complete(request: JobRunCompleteRequest): Promise<boolean> {
      const row = rows.get(request.runId);
      // S3 — RUNNING -> terminal 전이일 때만 쓴다.
      if (row === undefined || row.status !== 'RUNNING') return false;
      const summary = request.summary === undefined ? undefined : jsonRoundTrip(request.summary);
      row.status = request.status;
      row.finishedAt = request.finishedAt;
      row.durationMs = request.durationMs;
      if (summary !== undefined) row.summary = summary;
      if (request.error !== undefined) row.error = request.error;
      return true;
    },

    async recordSkipped(request: JobRunSkippedRequest): Promise<JobRunClaim> {
      const input = jsonRoundTrip(request.input);
      const runId = newId();
      rows.set(runId, {
        runId,
        jobKey: request.jobKey,
        // 부분 유니크는 RUNNING만 겨냥하므로 SKIPPED 행은 key를 쥐지 않는다.
        overlapKey: null,
        status: 'SKIPPED',
        trigger: { ...request.trigger },
        input,
        summary: { reason: request.reason },
        error: undefined,
        startedAt: request.at,
        heartbeatAt: clock.now(),
        finishedAt: request.at,
        durationMs: 0,
        serviceRevision: request.serviceRevision ?? null,
      });
      return { runId };
    },

    async reapStale(request: JobRunReapRequest): Promise<number> {
      const cutoff = clock.now() - request.staleAfterMs;
      const candidates: MutableRow[] = [];
      for (const row of rows.values()) {
        if (row.status !== 'RUNNING') continue;
        if (request.jobKey !== undefined && row.jobKey !== request.jobKey) continue;
        if (request.overlapKey !== undefined && row.overlapKey !== request.overlapKey) continue;
        // `<=` 이므로 staleAfterMs: 0은 방금 claim한 행도 대상이 된다 — 적합성 케이스
        // S6-liveness가 워터마크 미초기화(NULL) 구현을 이 비교로 떨어뜨린다.
        if (row.heartbeatAt <= cutoff) candidates.push(row);
      }
      candidates.sort((a, b) => a.heartbeatAt - b.heartbeatAt);
      const limit = request.limit ?? candidates.length;
      let reaped = 0;
      const finishedAt = clock.now();
      for (const row of candidates) {
        if (reaped >= limit) break;
        row.status = 'TIMED_OUT';
        row.finishedAt = finishedAt;
        row.error = 'heartbeat stale: the running instance is assumed gone';
        reaped += 1;
      }
      return reaped;
    },

    runs(): readonly StoredJobRun[] {
      return [...rows.values()].map(snapshot);
    },

    runOf(runId: string): StoredJobRun | undefined {
      const row = rows.get(runId);
      return row === undefined ? undefined : snapshot(row);
    },
  };
}
