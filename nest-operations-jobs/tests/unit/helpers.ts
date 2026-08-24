import { createJobRegistry } from '../../src/core/registry';
import { createJobRunner } from '../../src/core/runner';
import type { JobRunnerOptions, JobRunner } from '../../src/core/runner';
import type { AnyOperationsJob } from '../../src/core/job';
import type {
  JobRunClaim,
  JobRunClaimRequest,
  JobRunCompleteRequest,
  JobRunHeartbeatRequest,
  JobRunReapRequest,
  JobRunSkippedRequest,
  JobRunStore,
  JobTrigger,
} from '../../src/core/store';
import { fakeJobClock } from '../../src/testing/fake-clock';
import type { FakeJobClock } from '../../src/testing/fake-clock';
import { memoryJobRunStore } from '../../src/testing/memory-store';
import type { MemoryJobRunStore } from '../../src/testing/memory-store';
import { recordingJobLogger } from '../../src/testing/recording-logger';
import type { RecordingJobLogger } from '../../src/testing/recording-logger';

export const TRIGGER: JobTrigger = { source: 'SCHEDULER', triggeredBy: null };

export interface StoreCallLog {
  claims: JobRunClaimRequest[];
  heartbeats: JobRunHeartbeatRequest[];
  completes: JobRunCompleteRequest[];
  skips: JobRunSkippedRequest[];
  reaps: JobRunReapRequest[];
}

export interface ObservedStore extends JobRunStore {
  readonly calls: StoreCallLog;
}

/** 포트 호출을 그대로 기록하는 얇은 래퍼 — 어떤 인자가 실렸는지가 계약이다. */
export function observeStore(inner: JobRunStore): ObservedStore {
  const calls: StoreCallLog = {
    claims: [],
    heartbeats: [],
    completes: [],
    skips: [],
    reaps: [],
  };
  return {
    calls,
    claim: (request) => {
      calls.claims.push(request);
      return inner.claim(request);
    },
    heartbeat: (request) => {
      calls.heartbeats.push(request);
      return inner.heartbeat(request);
    },
    complete: (request) => {
      calls.completes.push(request);
      return inner.complete(request);
    },
    recordSkipped: (request) => {
      calls.skips.push(request);
      return inner.recordSkipped(request);
    },
    reapStale: (request) => {
      calls.reaps.push(request);
      return inner.reapStale(request);
    },
  };
}

export interface Harness {
  readonly clock: FakeJobClock;
  readonly memory: MemoryJobRunStore;
  readonly store: ObservedStore;
  readonly logger: RecordingJobLogger;
  readonly runner: JobRunner;
}

export type HarnessOverrides = Partial<
  Omit<JobRunnerOptions, 'registry' | 'store' | 'clock' | 'logger'>
> & {
  readonly store?: JobRunStore | undefined;
  readonly clock?: FakeJobClock | undefined;
};

export function harness(jobs: readonly AnyOperationsJob[], overrides: HarnessOverrides = {}): Harness {
  const { store: outerStore, clock: outerClock, ...runnerOverrides } = overrides;
  const clock = outerClock ?? fakeJobClock();
  const memory = memoryJobRunStore({ clock });
  const store = observeStore(outerStore ?? memory);
  const logger = recordingJobLogger();
  const registry = createJobRegistry(jobs);
  const runner = createJobRunner({ registry, store, logger, clock, ...runnerOverrides });
  return { clock, memory, store, logger, runner };
}

/** 대기 중인 마이크로태스크를 비운다 — execute가 타이머를 세울 때까지 진행시킨다. */
export async function tick(turns = 20): Promise<void> {
  for (let turn = 0; turn < turns; turn += 1) {
    await Promise.resolve();
  }
}

export function deferred<T = void>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

export function stubClaim(runId: string): JobRunClaim {
  return { runId };
}
