import { Logger, Module } from '@nestjs/common';
import type { DynamicModule, InjectionToken, Provider } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { createJobTriggerAuthenticator } from '../core/auth';
import type { JobTriggerAuthOptions } from '../core/auth';
import { systemJobClock } from '../core/clock';
import type { JobClock } from '../core/clock';
import type { JobLogger } from '../core/logger';
import { createJobRunner } from '../core/runner';
import type { JobReapScope, JobRunner } from '../core/runner';
import type { JobRunStore } from '../core/store';
import { createOperationsJobsController } from './controller';
import { OperationsJobsGuard } from './guard';
import {
  JOB_CLOCK,
  JOB_REGISTRY,
  JOB_RUN_STORE,
  JOB_RUNNER,
  JOB_TRIGGER_AUTHENTICATOR,
} from './inject';
import { fromNestLogger } from './logger';
import { createDeferredJobRegistry, OperationsJobsRegistrar } from './registry.provider';
import type { DeferredJobRegistry } from './registry.provider';

const LOGGER_CONTEXT = 'OperationsJob';

export interface OperationsJobsModuleOptions {
  readonly store: JobRunStore;
  /** Required. Wiring a trigger surface with no authentication is a boot error. */
  readonly auth: JobTriggerAuthOptions;
  /**
   * Registers the trigger controller at this path (e.g. `'internal/jobs'`).
   * Omit it for CLI-only hosts or hosts that expose their own controllers.
   */
  readonly trigger?:
    | { readonly path: string; readonly triggeredByHeader?: string | undefined }
    | undefined;
  /** Defaults to the Nest logger under the `OperationsJob` context. */
  readonly logger?: JobLogger | undefined;
  readonly clock?: JobClock | undefined;
  readonly heartbeatIntervalMs?: number | undefined;
  readonly staleRunAfterMs?: number | undefined;
  readonly defaultTimeoutMs?: number | undefined;
  readonly reapScope?: JobReapScope | undefined;
  readonly reapLimit?: number | undefined;
  readonly serviceRevision?: string | null | undefined;
  /** Defaults to true — one runner per application is the natural unit. */
  readonly global?: boolean | undefined;
}

export interface OperationsJobsModuleAsyncOptions {
  readonly imports?: DynamicModule['imports'] | undefined;
  readonly inject?: readonly InjectionToken[] | undefined;
  readonly useFactory: (
    ...deps: readonly any[]
  ) => OperationsJobsModuleOptions | Promise<OperationsJobsModuleOptions>;
  readonly global?: boolean | undefined;
}

/** @internal 팩토리 산출물을 러너·가드 프로바이더가 공유하기 위한 토큰. */
const RESOLVED_OPTIONS: unique symbol = Symbol.for(
  '@gj-kit/nest-operations-jobs:resolved-options',
);

interface ResolvedOptions {
  readonly options: OperationsJobsModuleOptions;
  readonly authenticator: ReturnType<typeof createJobTriggerAuthenticator>;
}

function defaultLogger(): JobLogger {
  return fromNestLogger(new Logger(LOGGER_CONTEXT), LOGGER_CONTEXT);
}

function resolve(options: OperationsJobsModuleOptions): ResolvedOptions {
  // 설정 오류는 부팅에서 죽어야 한다 — 스케줄러의 첫 호출이 아니라.
  return { options, authenticator: createJobTriggerAuthenticator(options.auth) };
}

function buildRunner(resolved: ResolvedOptions, registry: DeferredJobRegistry): JobRunner {
  const options = resolved.options;
  return createJobRunner({
    registry,
    store: options.store,
    logger: options.logger ?? defaultLogger(),
    clock: options.clock ?? systemJobClock(),
    ...(options.heartbeatIntervalMs === undefined
      ? {}
      : { heartbeatIntervalMs: options.heartbeatIntervalMs }),
    ...(options.staleRunAfterMs === undefined ? {} : { staleRunAfterMs: options.staleRunAfterMs }),
    ...(options.defaultTimeoutMs === undefined ? {} : { defaultTimeoutMs: options.defaultTimeoutMs }),
    ...(options.reapScope === undefined ? {} : { reapScope: options.reapScope }),
    ...(options.reapLimit === undefined ? {} : { reapLimit: options.reapLimit }),
    ...(options.serviceRevision === undefined ? {} : { serviceRevision: options.serviceRevision }),
  });
}

/**
 * The operations job platform. Job definitions live as providers in the host's
 * own domain modules (`@OperationsJobDefinition()`); this module owns only the
 * execution environment: registry collection, the runner, trigger
 * authentication and — optionally — the trigger controller.
 */
@Module({})
export class OperationsJobsModule {
  /**
   * Synchronous wiring. Authentication is validated here, at assembly time: a
   * deployment with neither a shared secret nor a token verifier fails to boot
   * instead of failing on the scheduler's first call.
   *
   * The registry and the runner are bound as **factories**, so each DI container
   * built from the returned module gets its own pair. Binding instances would
   * make the returned object stateful: the host module that holds this call is
   * evaluated once, and every later application built from it — an e2e suite's
   * second `Test.createTestingModule`, a warm serverless re-init, HMR — would
   * re-register the same jobs into the already-populated registry and die with
   * `ERR_JOB_DUPLICATE_KEY` blaming the job class.
   */
  static forRoot(options: OperationsJobsModuleOptions): DynamicModule {
    // 조립 시점 1회 — 인증 미설정은 여기서 죽어야 한다(§4-9).
    const resolved = resolve(options);

    const providers: Provider[] = [
      { provide: JOB_REGISTRY, useFactory: () => createDeferredJobRegistry() },
      { provide: JOB_RUN_STORE, useValue: options.store },
      { provide: JOB_CLOCK, useFactory: () => options.clock ?? systemJobClock() },
      { provide: JOB_TRIGGER_AUTHENTICATOR, useValue: resolved.authenticator },
      {
        provide: JOB_RUNNER,
        inject: [JOB_REGISTRY],
        useFactory: (registry: DeferredJobRegistry) => buildRunner(resolved, registry),
      },
      OperationsJobsRegistrar,
      OperationsJobsGuard,
    ];

    return {
      module: OperationsJobsModule,
      global: options.global ?? true,
      imports: [DiscoveryModule],
      controllers:
        options.trigger === undefined ? [] : [createOperationsJobsController(options.trigger)],
      providers,
      exports: [JOB_REGISTRY, JOB_RUNNER, JOB_RUN_STORE, JOB_CLOCK, JOB_TRIGGER_AUTHENTICATOR],
    };
  }

  /**
   * Asynchronous wiring, for hosts whose store or secret comes from another
   * provider. `auth` is validated immediately after the factory resolves, so the
   * boot-failure guarantee survives this path.
   *
   * The trigger controller cannot be registered from here — a Nest module's
   * controller list is fixed before the factory runs. Async hosts put
   * `createOperationsJobsController({ path })` in their own module's
   * `controllers` array.
   */
  static forRootAsync(options: OperationsJobsModuleAsyncOptions): DynamicModule {
    const providers: Provider[] = [
      {
        provide: RESOLVED_OPTIONS,
        inject: options.inject === undefined ? [] : [...options.inject],
        useFactory: async (...deps: readonly unknown[]): Promise<ResolvedOptions> =>
          resolve(await options.useFactory(...deps)),
      },
      { provide: JOB_REGISTRY, useFactory: () => createDeferredJobRegistry() },
      {
        provide: JOB_RUN_STORE,
        inject: [RESOLVED_OPTIONS],
        useFactory: (resolved: ResolvedOptions) => resolved.options.store,
      },
      {
        provide: JOB_CLOCK,
        inject: [RESOLVED_OPTIONS],
        useFactory: (resolved: ResolvedOptions) => resolved.options.clock ?? systemJobClock(),
      },
      {
        provide: JOB_TRIGGER_AUTHENTICATOR,
        inject: [RESOLVED_OPTIONS],
        useFactory: (resolved: ResolvedOptions) => resolved.authenticator,
      },
      {
        provide: JOB_RUNNER,
        inject: [RESOLVED_OPTIONS, JOB_REGISTRY],
        useFactory: (resolved: ResolvedOptions, registry: DeferredJobRegistry) =>
          buildRunner(resolved, registry),
      },
      OperationsJobsRegistrar,
      OperationsJobsGuard,
    ];

    return {
      module: OperationsJobsModule,
      global: options.global ?? true,
      imports: [DiscoveryModule, ...(options.imports ?? [])],
      providers,
      exports: [JOB_REGISTRY, JOB_RUNNER, JOB_RUN_STORE, JOB_CLOCK, JOB_TRIGGER_AUTHENTICATOR],
    };
  }
}
