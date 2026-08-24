import { Inject, Injectable, ServiceUnavailableException } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { isOperationsJobsError } from '../core/errors';
import type { createJobTriggerAuthenticator } from '../core/auth';
import { toHttpException } from './http';
import { JOB_TRIGGER_AUTHENTICATOR } from './inject';

type JobTriggerAuthenticator = ReturnType<typeof createJobTriggerAuthenticator>;

interface AuthenticatedRequest {
  headers?: Record<string, string | string[] | undefined> | undefined;
}

/** Body discriminator for the outage branch — the code alone cannot separate it from a 401. */
const VERIFIER_UNAVAILABLE = 'verifier_unavailable';

/**
 * Authenticates every job trigger. Applied by the controller factory, so a
 * handler cannot forget it — the structural fix for per-handler assert calls.
 *
 * A rejected credential is a 401 with one fixed body, mapped by
 * {@link toHttpException} like every other library outcome — this class decides
 * no status codes of its own. A verifier that throws is an outage, not a
 * rejection: it becomes a 503 so the scheduler retries, and its body carries
 * `reason: 'verifier_unavailable'` so an alert rule can tell "the caller's token
 * was refused" from "our verifier is down".
 */
@Injectable()
export class OperationsJobsGuard implements CanActivate {
  constructor(
    @Inject(JOB_TRIGGER_AUTHENTICATOR) private readonly authenticate: JobTriggerAuthenticator,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const header = request?.headers?.authorization;
    try {
      await this.authenticate(header);
    } catch (error) {
      if (isOperationsJobsError(error)) {
        const mapped = toHttpException(error);
        if (mapped !== null) throw mapped;
      }
      throw new ServiceUnavailableException({
        error: { code: 'ERR_JOB_UNAUTHORIZED' },
        reason: VERIFIER_UNAVAILABLE,
      });
    }
    return true;
  }
}
