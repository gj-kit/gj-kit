import type { JobLogger } from './logger';
import type { JobTrigger } from './store';

/** Free-form structured result of a job run. Persisted verbatim as the run summary. */
export type JobSummary = Record<string, unknown>;

/**
 * Structural input validator. A Zod schema satisfies this shape as-is
 * (`ZodType.parse(value: unknown): Output`), and so do valibot wrappers,
 * ArkType morphs and hand-written functions. The library never imports a
 * validation library: it only calls `parse` and treats any throw as invalid input.
 */
export interface JobInputValidator<Input> {
  parse(value: unknown): Input;
}

/** Cron metadata. Documentation and scheduler-sync input; the runner never reads it. */
export interface JobSchedule {
  /** 5 or 6 whitespace-separated fields. Shape-checked at boot, not semantically parsed. */
  readonly cron: string;
  /** IANA time zone name. Validated at boot with `Intl.DateTimeFormat`. */
  readonly timeZone: string;
}

export type JobOverlapPolicy = 'forbid' | 'allow';

/** Default job timeout: 10 minutes. Keep below the external scheduler's attempt deadline. */
export const DEFAULT_JOB_TIMEOUT_MS = 600_000;

/**
 * Operations job contract. A job owns business logic only — authentication,
 * overlap prevention, timeouts, run records and logging belong to the runner.
 *
 * Returning a summary whose `ok` is exactly `false` marks the run FAILED while
 * preserving the summary, so an external scheduler retries and alerting fires.
 * Any other value of `ok` (including `0`, `''`, `undefined`) is a success.
 */
export interface OperationsJob<Input = void> {
  /** Unique key shaped `domain.action`, lower-case and hyphenated, at most 100 chars. */
  readonly key: string;
  readonly description: string;
  /** Absent means the job takes no input; a non-empty request body is then rejected. */
  readonly inputSchema?: JobInputValidator<Input> | undefined;
  /** Defaults to {@link DEFAULT_JOB_TIMEOUT_MS}. */
  readonly timeoutMs?: number | undefined;
  /**
   * Defaults to `'forbid'`: a second trigger while one run holds the key is SKIPPED.
   *
   * Overlap prevention buys liveness with a bounded safety gap: a runner that is
   * stalled rather than dead has its row reaped, and a second body then starts.
   * The window is one heartbeat interval plus the job's abort reaction time, and
   * while the store itself is unreachable it widens to `staleRunAfterMs` plus
   * that reaction time. Only the job's own domain-level idempotency closes it.
   */
  readonly overlapPolicy?: JobOverlapPolicy | undefined;
  /** Documentation and scheduler-sync metadata only. `null` means "no declared cron". */
  readonly schedule?: JobSchedule | null | undefined;
  /** Defaults to true. False means an external non-HTTP trigger owns this schedule. */
  readonly schedulerHttpSync?: boolean | undefined;
  run(input: Input, context: OperationsJobContext): Promise<JobSummary | void>;
}

/**
 * Heterogeneous collection element type. `any` is deliberate: `run` is
 * contravariant in `Input`, so `OperationsJob<unknown>` would reject every
 * concrete job. Consumers never construct this type; the registry does.
 */
export type AnyOperationsJob = OperationsJob<any>;

export interface OperationsJobContext {
  readonly runId: string;
  readonly jobKey: string;
  readonly trigger: JobTrigger;
  readonly logger: JobLogger;
  /**
   * Aborted when the deadline passes, when the runner loses its claim, or when
   * the caller's own signal aborts. The abort reason is an
   * `OperationsJobsError`. Long batch loops must check it.
   *
   * The library guarantees that the signal aborts at the right instant, that the
   * settling record is written exactly once, and that a body outliving its
   * deadline cannot corrupt that record. It cannot guarantee that side effects
   * stop: a job that ignores this signal keeps writing.
   */
  readonly signal: AbortSignal;
  /** Epoch milliseconds at which the run times out, from the injected clock. */
  readonly deadlineAt: number;
  /**
   * Refresh the heartbeat immediately, optionally recording intermediate progress.
   *
   * Resolves `false` when this run no longer holds its claim — it was reaped as
   * stale or already settled — and the job should stop. After the runner has
   * settled the run this is a no-op that resolves `false` without touching the
   * store, so a job that outlives its deadline can never overwrite the record.
   *
   * A failed store write is logged and resolves `true`: one transient error must
   * not be read as "claim lost". Sustained failure is not forgiven, though —
   * once nothing has been written for `staleRunAfterMs`, the runner aborts the
   * run with `ERR_JOB_ABORTED` exactly as if the store had answered `false`,
   * because by then another instance is entitled to reap this run's row.
   */
  heartbeat(progress?: JobSummary): Promise<boolean>;
}
