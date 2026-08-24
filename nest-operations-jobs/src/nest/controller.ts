import { Body, Controller, Headers, HttpCode, Inject, Param, Post, UseGuards } from '@nestjs/common';
import type { Type } from '@nestjs/common';
import { isOperationsJobsError } from '../core/errors';
import type { JobRunner } from '../core/runner';
import type { JobTrigger } from '../core/store';
import { toHttpException } from './http';
import { OperationsJobsGuard } from './guard';
import { JOB_RUNNER } from './inject';

export interface OperationsJobsControllerOptions {
  /** Route namespace this controller occupies, e.g. `'internal/jobs'`. */
  readonly path: string;
  /**
   * Request header naming the scheduler job that fired, recorded as
   * `trigger.triggeredBy`. No default: no header is read unless one is named.
   * Google Cloud Scheduler sends `'x-cloudscheduler-jobname'`.
   */
  readonly triggeredByHeader?: string | undefined;
}

/**
 * Build the trigger controller. The host owns the route namespace, so the path
 * is an argument rather than a decorator constant baked into the library.
 *
 * `POST {path}/:jobKey/run` -> 200 with the execution result. Failure, timeout
 * and every construction error go through {@link toHttpException}, whose body
 * carries a stable code and never the job's own error text.
 */
export function createOperationsJobsController(
  options: OperationsJobsControllerOptions,
): Type<unknown> {
  const headerName = options.triggeredByHeader?.toLowerCase();

  @Controller(options.path)
  @UseGuards(OperationsJobsGuard)
  class OperationsJobsController {
    constructor(@Inject(JOB_RUNNER) private readonly runner: JobRunner) {}

    @Post(':jobKey/run')
    @HttpCode(200)
    async run(
      @Param('jobKey') jobKey: string,
      @Body() body: unknown,
      @Headers() headers: Record<string, string | string[] | undefined>,
    ): Promise<Record<string, unknown>> {
      const trigger: JobTrigger = {
        source: 'SCHEDULER',
        triggeredBy: readTriggeredBy(headers, headerName),
      };

      let result;
      try {
        result = await this.runner.execute(jobKey, body, trigger);
      } catch (error) {
        if (isOperationsJobsError(error)) {
          const mapped = toHttpException(error);
          if (mapped !== null) throw mapped;
        }
        throw error;
      }

      const failure = toHttpException(result);
      if (failure !== null) throw failure;

      if (result.status === 'SKIPPED') {
        return {
          runId: result.runId,
          jobKey: result.jobKey,
          status: result.status,
          reason: result.reason,
          durationMs: result.durationMs,
          recorded: result.recorded,
        };
      }
      return {
        runId: result.runId,
        jobKey: result.jobKey,
        status: result.status,
        durationMs: result.durationMs,
        recorded: result.recorded,
        ...(result.status === 'SUCCEEDED' && result.summary !== undefined
          ? { summary: result.summary }
          : {}),
      };
    }
  }

  return OperationsJobsController;
}

function readTriggeredBy(
  headers: Record<string, string | string[] | undefined>,
  headerName: string | undefined,
): string | null {
  if (headerName === undefined) return null;
  const raw = headers?.[headerName];
  const value = Array.isArray(raw) ? raw[0] : raw;
  return typeof value === 'string' && value.length > 0 ? value : null;
}
