import { OperationsJobsError } from './errors';
import { DEFAULT_JOB_TIMEOUT_MS } from './job';
import type { AnyOperationsJob, JobOverlapPolicy, JobSchedule } from './job';

/**
 * 순수 카탈로그 투영. I/O도, 자식 프로세스도, 클라우드 개념도 없다 — 라이브러리는
 * **무엇을 스케줄해야 하는가**를 소유하고, 호스트가 **어디에 어떻게 만드는가**를 소유한다.
 */

const DEFAULT_ROUTE_PREFIX = 'internal/jobs';
const DEFAULT_ATTEMPT_DEADLINE_MARGIN_MS = 60_000;
/** Google Cloud Scheduler's documented maximum attempt deadline, in seconds. */
const DEFAULT_MAX_ATTEMPT_DEADLINE_SECONDS = 1_800;

export interface JobCatalogEntry {
  readonly key: string;
  readonly description: string;
  readonly schedule: JobSchedule | null;
  readonly schedulerHttpSync: boolean;
  readonly overlapPolicy: JobOverlapPolicy;
  /** Effective timeout: the job's own value or the supplied default. */
  readonly timeoutMs: number;
  readonly acceptsInput: boolean;
}

/** Project registered jobs into the stable shape an admin API or sync tool consumes. */
export function jobCatalog(
  jobs: Iterable<AnyOperationsJob>,
  options?: { readonly defaultTimeoutMs?: number | undefined },
): readonly JobCatalogEntry[] {
  const defaultTimeoutMs = options?.defaultTimeoutMs ?? DEFAULT_JOB_TIMEOUT_MS;
  const entries: JobCatalogEntry[] = [];
  for (const job of jobs) {
    entries.push({
      key: job.key,
      description: job.description,
      schedule: job.schedule ?? null,
      schedulerHttpSync: job.schedulerHttpSync ?? true,
      overlapPolicy: job.overlapPolicy ?? 'forbid',
      timeoutMs: job.timeoutMs ?? defaultTimeoutMs,
      acceptsInput: job.inputSchema !== undefined && job.inputSchema !== null,
    });
  }
  return entries;
}

export interface SchedulerHttpTarget {
  readonly key: string;
  readonly description: string;
  /** `${baseUrl}/${routePrefix}/${key}/run` with duplicate slashes collapsed. */
  readonly uri: string;
  readonly httpMethod: 'POST';
  readonly cron: string;
  readonly timeZone: string;
  /**
   * `ceil(timeoutMs / 1000) + margin` — the job must finish first.
   *
   * Never clamped down to `maxAttemptDeadlineSeconds`: a target that gives up
   * before the runner does is a contradiction, not a compromise, so
   * {@link schedulerHttpTargets} raises `ERR_JOB_INVALID` instead of emitting one.
   */
  readonly attemptDeadlineSeconds: number;
}

export interface SchedulerHttpTargetOptions {
  /** Absolute http(s) origin, no trailing slash required. */
  readonly baseUrl: string;
  /** Defaults to `'internal/jobs'`; must match the trigger controller's path. */
  readonly routePrefix?: string | undefined;
  /** Defaults to 60_000. Head room between the job deadline and the HTTP deadline. */
  readonly attemptDeadlineMarginMs?: number | undefined;
  /**
   * Defaults to 1_800 seconds. That number is the most common documented ceiling
   * rather than a statement about any one scheduler — hosts on a different
   * platform pass their own.
   *
   * A job whose deadline plus margin does not fit under it raises
   * `ERR_JOB_INVALID` naming the key: either lower that job's `timeoutMs` or
   * raise this ceiling to whatever the platform actually allows.
   */
  readonly maxAttemptDeadlineSeconds?: number | undefined;
}

/** `'storage.recurring-billing'` -> `'storage-recurring-billing'`. Prefix it yourself. */
export function jobKeySlug(key: string): string {
  return key.split('.').join('-');
}

/** `'internal/jobs/storage.recurring-billing/run'`. */
export function jobTriggerPath(key: string, routePrefix?: string): string {
  const prefix = (routePrefix ?? DEFAULT_ROUTE_PREFIX).replace(/^\/+|\/+$/gu, '');
  const path = prefix.length > 0 ? `${prefix}/${key}/run` : `${key}/run`;
  return path.replace(/\/{2,}/gu, '/');
}

function joinUri(baseUrl: string, path: string): string {
  const base = baseUrl.replace(/\/+$/u, '');
  const rest = path.replace(/^\/+/u, '');
  return `${base}/${rest}`;
}

/**
 * Entries with a schedule and `schedulerHttpSync !== false`, in catalog order.
 *
 * Throws `ERR_JOB_INVALID` when a job's deadline plus margin exceeds
 * `maxAttemptDeadlineSeconds`. Clamping it would emit a target that abandons the
 * attempt while the first body is still running: the scheduler records a
 * deadline-exceeded failure and retries, the retry is answered SKIPPED/200 for a
 * `forbid` job, and the operator ends up with a permanently red scheduler job
 * whose runs all succeed. The sync tool must not be handed that shape.
 */
export function schedulerHttpTargets(
  catalog: Iterable<JobCatalogEntry>,
  options: SchedulerHttpTargetOptions,
): readonly SchedulerHttpTarget[] {
  const routePrefix = options.routePrefix ?? DEFAULT_ROUTE_PREFIX;
  const marginMs = options.attemptDeadlineMarginMs ?? DEFAULT_ATTEMPT_DEADLINE_MARGIN_MS;
  const maxSeconds = options.maxAttemptDeadlineSeconds ?? DEFAULT_MAX_ATTEMPT_DEADLINE_SECONDS;

  const targets: SchedulerHttpTarget[] = [];
  for (const entry of catalog) {
    if (entry.schedule === null) continue;
    if (!entry.schedulerHttpSync) continue;
    const attemptDeadlineSeconds =
      Math.ceil(entry.timeoutMs / 1000) + Math.ceil(marginMs / 1000);
    if (attemptDeadlineSeconds > maxSeconds) {
      throw new OperationsJobsError(
        'ERR_JOB_INVALID',
        `operations job "${entry.key}" needs an attempt deadline of ${attemptDeadlineSeconds}s (timeoutMs ${entry.timeoutMs} plus margin) but maxAttemptDeadlineSeconds is ${maxSeconds}: a target that gives up before the job does turns every long run into a scheduler failure plus a retry. Lower this job's timeoutMs or raise maxAttemptDeadlineSeconds to what the platform allows.`,
        { jobKey: entry.key },
      );
    }
    targets.push({
      key: entry.key,
      description: entry.description,
      uri: joinUri(options.baseUrl, jobTriggerPath(entry.key, routePrefix)),
      httpMethod: 'POST',
      cron: entry.schedule.cron,
      timeZone: entry.schedule.timeZone,
      attemptDeadlineSeconds,
    });
  }
  return targets;
}
