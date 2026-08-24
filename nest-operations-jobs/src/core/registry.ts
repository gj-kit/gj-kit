import { MAX_JOB_TIMER_MS } from './clock';
import { OperationsJobsError } from './errors';
import type { AnyOperationsJob, JobSchedule } from './job';

/** Read side used by the runner and by catalog projections. */
export interface JobRegistryView {
  get(key: string): AnyOperationsJob | undefined;
  /** Sorted by key, so catalogs and admin listings are stable. */
  list(): readonly AnyOperationsJob[];
}

export interface JobRegistry extends JobRegistryView {
  /** Rejects malformed keys, duplicate keys and malformed schedule metadata. */
  register(job: AnyOperationsJob): void;
}

/** `domain.action`: lower-case alphanumerics and hyphens on both sides of one dot. */
export const JOB_KEY_PATTERN: RegExp = /^[a-z0-9-]+\.[a-z0-9-]+$/;

/** A key lands in a database column, a scheduler job name and a URL path at once. */
export const MAX_JOB_KEY_LENGTH = 100;

export function isJobKey(value: unknown): value is string {
  return (
    typeof value === 'string' && value.length <= MAX_JOB_KEY_LENGTH && JOB_KEY_PATTERN.test(value)
  );
}

/**
 * Throws `ERR_JOB_SCHEDULE_INVALID` for a malformed cron shape or unknown IANA
 * zone. Only the shape is checked — semantic parsing belongs to the scheduler;
 * what this catches is writing `"0 9 * *"` when `"0 9 * * *"` was meant.
 */
export function assertJobSchedule(schedule: JobSchedule, jobKey: string): void {
  const cron = schedule.cron;
  if (typeof cron !== 'string') {
    throw new OperationsJobsError(
      'ERR_JOB_SCHEDULE_INVALID',
      `operations job "${jobKey}" has a non-string cron expression`,
      { jobKey },
    );
  }
  const fields = cron.trim().split(/\s+/u).filter((field) => field.length > 0);
  if (fields.length < 5 || fields.length > 6) {
    throw new OperationsJobsError(
      'ERR_JOB_SCHEDULE_INVALID',
      `operations job "${jobKey}" cron must have 5 or 6 fields, got ${fields.length}: "${cron}"`,
      { jobKey },
    );
  }
  const timeZone = schedule.timeZone;
  if (typeof timeZone !== 'string' || timeZone.length === 0) {
    throw new OperationsJobsError(
      'ERR_JOB_SCHEDULE_INVALID',
      `operations job "${jobKey}" is missing an IANA time zone`,
      { jobKey },
    );
  }
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
  } catch {
    throw new OperationsJobsError(
      'ERR_JOB_SCHEDULE_INVALID',
      `operations job "${jobKey}" declares an unknown IANA time zone: "${timeZone}"`,
      { jobKey },
    );
  }
}

function describeJob(job: AnyOperationsJob): string {
  const name = (job as { constructor?: { name?: string } }).constructor?.name;
  return typeof name === 'string' && name.length > 0 ? name : 'unknown class';
}

/**
 * Create the in-memory registry. Every rejection here is a boot failure by
 * design: a misregistered job must never survive into request handling.
 */
export function createJobRegistry(jobs?: Iterable<AnyOperationsJob>): JobRegistry {
  const byKey = new Map<string, AnyOperationsJob>();

  const registry: JobRegistry = {
    register(job: AnyOperationsJob): void {
      if (job === null || typeof job !== 'object' || typeof job.run !== 'function') {
        throw new OperationsJobsError(
          'ERR_JOB_INVALID',
          'an operations job must be an object with a run(input, context) method',
        );
      }
      if (!isJobKey(job.key)) {
        throw new OperationsJobsError(
          'ERR_JOB_KEY_INVALID',
          `operations job key must look like "domain.action" (lower-case, hyphens, at most ${MAX_JOB_KEY_LENGTH} chars): got "${String(job.key)}" (${describeJob(job)})`,
        );
      }
      if (byKey.has(job.key)) {
        throw new OperationsJobsError(
          'ERR_JOB_DUPLICATE_KEY',
          `duplicate operations job key: "${job.key}" (${describeJob(job)})`,
          { jobKey: job.key },
        );
      }
      if (job.timeoutMs !== undefined) {
        if (typeof job.timeoutMs !== 'number' || !Number.isFinite(job.timeoutMs) || job.timeoutMs <= 0) {
          throw new OperationsJobsError(
            'ERR_JOB_INVALID',
            `operations job "${job.key}" declares a non-positive timeoutMs: ${String(job.timeoutMs)}`,
            { jobKey: job.key },
          );
        }
        // 상한도 부팅에서 죽인다: 32비트 타이머는 이 값을 넘으면 조용히 1ms로 접히고,
        // 그 잡은 본문이 한 줄도 돌기 전에 매 실행 TIMED_OUT이 된다. 유일한 진단은
        // stderr 경고 한 줄이므로, 여기서 잡지 않으면 아무도 알아채지 못한다.
        if (job.timeoutMs > MAX_JOB_TIMER_MS) {
          throw new OperationsJobsError(
            'ERR_JOB_INVALID',
            `operations job "${job.key}" declares a timeoutMs above the ${MAX_JOB_TIMER_MS}ms timer ceiling: ${String(job.timeoutMs)}. A larger delay overflows the 32-bit timer and fires after 1ms, so every run would end on its deadline.`,
            { jobKey: job.key },
          );
        }
      }
      if (job.schedule !== undefined && job.schedule !== null) {
        assertJobSchedule(job.schedule, job.key);
      }
      byKey.set(job.key, job);
    },
    get(key: string): AnyOperationsJob | undefined {
      return byKey.get(key);
    },
    list(): readonly AnyOperationsJob[] {
      return [...byKey.values()].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
    },
  };

  if (jobs !== undefined) {
    for (const job of jobs) registry.register(job);
  }
  return registry;
}
