/**
 * `@gj-kit/nest-operations-jobs` — NestJS 어댑터.
 *
 * 이 배럴은 `./core`의 **런타임 값**을 재수출하지 않는다. 같은 심볼이 두 경로로
 * 보이면 CJS 이중 로드에서 토큰 동일성과 `instanceof` 판정이 깨지기 때문이다.
 * 코어 타입은 타입으로만 재수출한다 — 런타임 값의 출처는 `./core` 하나다.
 */
export {
  InjectJobRegistry,
  InjectJobRunner,
  InjectJobRunStore,
  JOB_CLOCK,
  JOB_REGISTRY,
  JOB_RUN_STORE,
  JOB_RUNNER,
  JOB_TRIGGER_AUTHENTICATOR,
} from './nest/inject';

export { OPERATIONS_JOB_METADATA, OperationsJobDefinition } from './nest/decorator';

export { OperationsJobsModule } from './nest/module';
export type {
  OperationsJobsModuleAsyncOptions,
  OperationsJobsModuleOptions,
} from './nest/module';

export { OperationsJobsGuard } from './nest/guard';
export { createOperationsJobsController } from './nest/controller';
export type { OperationsJobsControllerOptions } from './nest/controller';
export { toHttpException } from './nest/http';
export { fromNestLogger } from './nest/logger';
export { OPERATIONS_JOB_CLI_EXIT, runOperationsJobCli } from './nest/cli';
export type { OperationsJobCliOptions } from './nest/cli';

/**
 * `OperationsJobsError`는 **클래스**다. `export type { OperationsJobsError }`로 내면
 * dts 롤업이 `type` 수식어를 떨어뜨려 산출 선언이 이 이름을 런타임 값으로 광고하고,
 * 소비자의 `import { OperationsJobsError }`가 타입 검사만 통과한 뒤 ESM에서
 * 모듈 인스턴스화 실패로 프로세스를 죽인다. 그래서 값이 될 수 없는 **별칭**으로 낸다.
 * 생성과 판정은 여전히 `./core`의 몫이다(`isOperationsJobsError`가 정본, §3.8).
 */
export type OperationsJobsError = import('./core').OperationsJobsError;

/**
 * 코어 타입 재수출 — **타입만**이다. `createJobRunner`·`memoryJobRunStore` 같은
 * 런타임 값은 `@gj-kit/nest-operations-jobs/core` 또는 `/testing`에서 가져온다.
 */
export type {
  AnyOperationsJob,
  JobCatalogEntry,
  JobClock,
  JobExecuteOptions,
  JobExecutionResult,
  JobInputValidator,
  JobLogger,
  JobOverlapPolicy,
  JobReapScope,
  JobRegistry,
  JobRegistryView,
  JobRunClaim,
  JobRunClaimRequest,
  JobRunCompleteRequest,
  JobRunHeartbeatRequest,
  JobRunner,
  JobRunnerOptions,
  JobRunReapRequest,
  JobRunRecordOutcome,
  JobRunSkippedRequest,
  JobRunStatus,
  JobRunStore,
  JobSchedule,
  JobSkipReason,
  JobSummary,
  JobTerminalStatus,
  JobTimerCancel,
  JobTrigger,
  JobTriggerAuthOptions,
  JobTriggerIdentity,
  JobTriggerSource,
  JobTriggerTokenVerifier,
  OperationsJob,
  OperationsJobContext,
  OperationsJobsErrorCode,
  OperationsJobsErrorContext,
  SchedulerHttpTarget,
  SchedulerHttpTargetOptions,
} from './core';
