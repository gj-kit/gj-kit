import type { INestApplicationContext } from '@nestjs/common';
import { isOperationsJobsError } from '../core/errors';
import type { JobRunner } from '../core/runner';
import type { JobTrigger } from '../core/store';
import { JOB_RUNNER } from './inject';

/** Exit codes an external scheduler actually reads. */
export const OPERATIONS_JOB_CLI_EXIT = { OK: 0, FAILED: 1, USAGE: 2 } as const;

export interface OperationsJobCliOptions {
  /**
   * The application context, or a factory that creates one. When a factory is
   * given the CLI owns `close()`; when an instance is given the caller does.
   */
  readonly context: INestApplicationContext | (() => Promise<INestApplicationContext>);
  readonly jobKey: string | undefined;
  /** Defaults to `{ source: 'CLI', triggeredBy: null }`. */
  readonly trigger?: JobTrigger | undefined;
  readonly usage?: string | undefined;
}

/**
 * Shared entry point for container job runners, Kubernetes CronJobs and manual
 * runs. The same runner as the HTTP trigger, so run records, overlap prevention
 * and timeouts apply identically.
 *
 * Returns the exit code instead of setting a global, and never terminates the
 * process: the caller decides. A context the CLI created is always closed,
 * including on failure, so pooled database connections cannot leak.
 *
 * `SUCCEEDED` and `SKIPPED` exit 0 — a skipped duplicate is not an error.
 * `FAILED`, `TIMED_OUT` and any throw exit 1. A missing job key exits 2 without
 * booting the application. A run whose record is not `'settled'` still uses the
 * status-derived code and reports the mismatch as a warning: that fact is for an
 * operator to read, not a retry signal for the scheduler.
 */
export async function runOperationsJobCli(options: OperationsJobCliOptions): Promise<0 | 1 | 2> {
  const jobKey = options.jobKey;
  if (typeof jobKey !== 'string' || jobKey.trim().length === 0) {
    console.error(options.usage ?? 'Usage: <entry> <jobKey>');
    return OPERATIONS_JOB_CLI_EXIT.USAGE;
  }

  const ownsContext = typeof options.context === 'function';
  const context = ownsContext
    ? await (options.context as () => Promise<INestApplicationContext>)()
    : (options.context as INestApplicationContext);

  try {
    const runner = context.get<JobRunner>(JOB_RUNNER);
    const result = await runner.execute(
      jobKey,
      undefined,
      options.trigger ?? { source: 'CLI', triggeredBy: null },
    );
    if (result.recorded !== 'settled') {
      console.warn(
        `operations job ${jobKey} finished as ${result.status} but its run record is "${result.recorded}"`,
      );
    }
    return result.status === 'SUCCEEDED' || result.status === 'SKIPPED'
      ? OPERATIONS_JOB_CLI_EXIT.OK
      : OPERATIONS_JOB_CLI_EXIT.FAILED;
  } catch (error) {
    const code = isOperationsJobsError(error) ? error.code : 'ERR_JOB_FAILED';
    console.error(`operations job ${jobKey} failed: ${code}`, error);
    return OPERATIONS_JOB_CLI_EXIT.FAILED;
  } finally {
    if (ownsContext) await context.close();
  }
}
