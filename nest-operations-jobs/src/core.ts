/**
 * `@gj-kit/nest-operations-jobs/core` — 프레임워크 없는 잡 실행 파이프라인.
 *
 * 이 서브패스의 산출물은 `@nestjs/*`·`rxjs`·`reflect-metadata`를 **한 줄도**
 * import하지 않는다(tests/unit/guards/peer-graph.test.ts가 소스와 dist 양쪽에서
 * 기계적으로 확인한다). Nest 없는 워커·람다·`node --test` 프로세스가 이 엔트리만
 * 로드해 러너를 돌릴 수 있다.
 */
export type { JobClock, JobTimerCancel } from './core/clock';
export { systemJobClock } from './core/clock';

export { isOperationsJobsError, OperationsJobsError } from './core/errors';
export type { OperationsJobsErrorCode, OperationsJobsErrorContext } from './core/errors';

export { DEFAULT_JOB_TIMEOUT_MS } from './core/job';
export type {
  AnyOperationsJob,
  JobInputValidator,
  JobOverlapPolicy,
  JobSchedule,
  JobSummary,
  OperationsJob,
  OperationsJobContext,
} from './core/job';

export { silentJobLogger } from './core/logger';
export type { JobLogger } from './core/logger';

export {
  assertJobSchedule,
  createJobRegistry,
  isJobKey,
  JOB_KEY_PATTERN,
  MAX_JOB_KEY_LENGTH,
} from './core/registry';
export type { JobRegistry, JobRegistryView } from './core/registry';

export type {
  JobRunClaim,
  JobRunClaimRequest,
  JobRunCompleteRequest,
  JobRunHeartbeatRequest,
  JobRunReapRequest,
  JobRunSkippedRequest,
  JobRunStatus,
  JobRunStore,
  JobSkipReason,
  JobTerminalStatus,
  JobTrigger,
  JobTriggerSource,
} from './core/store';

export {
  assertJobSucceeded,
  createJobRunner,
  DEFAULT_ERROR_TEXT_LIMIT,
  DEFAULT_HEARTBEAT_INTERVAL_MS,
  DEFAULT_STALE_RUN_AFTER_MS,
} from './core/runner';
export type {
  JobExecuteOptions,
  JobExecutionResult,
  JobReapScope,
  JobRunner,
  JobRunnerOptions,
  JobRunRecordOutcome,
} from './core/runner';

export { jobCatalog, jobKeySlug, jobTriggerPath, schedulerHttpTargets } from './core/catalog';
export type {
  JobCatalogEntry,
  SchedulerHttpTarget,
  SchedulerHttpTargetOptions,
} from './core/catalog';

export {
  bearerToken,
  createJobTriggerAuthenticator,
  looksLikeJwt,
  timingSafeSecretMatch,
} from './core/auth';
export type {
  JobTriggerAuthOptions,
  JobTriggerIdentity,
  JobTriggerTokenVerifier,
} from './core/auth';
