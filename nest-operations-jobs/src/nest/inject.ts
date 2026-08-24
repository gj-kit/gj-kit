/**
 * DI 토큰 + 명시적 주입 데코레이터.
 *
 * - `Symbol.for` 사용 근거: dual-package(ESM/CJS 이중 로드) 상황에서도 전역 심볼
 *   레지스트리를 경유해 동일 토큰이 보장된다(형제 toss-payments-nestjs 선례).
 * - 모든 주입이 명시적 `@Inject(토큰)`이다 — 이 패키지의 어떤 코드도 `design:type`/
 *   `design:paramtypes` 메타데이터를 읽지 않으므로 `emitDecoratorMetadata` 없는
 *   SWC/esbuild 빌드에서도 무설정으로 동작한다.
 */
import { Inject } from '@nestjs/common';

/** `JobRunner` binding. */
export const JOB_RUNNER: unique symbol = Symbol.for('@gj-kit/nest-operations-jobs:runner');
/** `JobRegistry` binding. Reads throw `ERR_JOB_REGISTRY_NOT_READY` until bootstrap ends. */
export const JOB_REGISTRY: unique symbol = Symbol.for('@gj-kit/nest-operations-jobs:registry');
/** The host-supplied `JobRunStore`. */
export const JOB_RUN_STORE: unique symbol = Symbol.for('@gj-kit/nest-operations-jobs:run-store');
/** The `JobClock` the runner reads. */
export const JOB_CLOCK: unique symbol = Symbol.for('@gj-kit/nest-operations-jobs:clock');
/** The trigger authenticator the guard delegates to. */
export const JOB_TRIGGER_AUTHENTICATOR: unique symbol = Symbol.for(
  '@gj-kit/nest-operations-jobs:trigger-authenticator',
);

/** Inject the runner: `constructor(@InjectJobRunner() private readonly runner: JobRunner) {}` */
export const InjectJobRunner = (): ParameterDecorator => Inject(JOB_RUNNER);
/** Inject the registry view used by catalog projections. */
export const InjectJobRegistry = (): ParameterDecorator => Inject(JOB_REGISTRY);
/** Inject the host's run store, e.g. to attach admin listings to it. */
export const InjectJobRunStore = (): ParameterDecorator => Inject(JOB_RUN_STORE);
