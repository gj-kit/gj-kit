/**
 * Nest 배선(설계 §3.8.2).
 *
 * `@Global()`을 붙이지 않는다 — 전역 오염은 호스트의 결정이지 라이브러리의 결정이 아니다.
 * 조립 시점에 설정을 검증해 **부팅에서** 죽인다: 스케줄러의 첫 호출까지 살아남는 설정 오류를
 * 만들지 않는다. `applicationKey` 형태 오류만 `ERR_NOTIFICATION_APPLICATION_KEY_INVALID`로
 * 따로 나가고(그 값이 무엇을 가르는지가 §7-8이다 — 두 환경이 같은 키를 쓰면 스테이징이
 * 프로덕션 사용자에게 보낸다), 나머지는 `ERR_NOTIFICATION_CONFIG_INVALID`다.
 */
import { Logger, Module } from '@nestjs/common';
import type { DynamicModule, InjectionToken, Provider } from '@nestjs/common';

import type { NotificationPublisher } from '../core/contracts';
import { createNotificationDispatcher } from '../core/dispatch';
import type { NotificationDispatcherOptions } from '../core/dispatch';
import { NotificationsError } from '../core/errors';
import type { NotificationLogger } from '../core/logger';
import type { NotificationSchedulingPolicy } from '../core/policy';
import type { NotificationPresenter } from '../core/presentation';
import type { NotificationPushGateway } from '../core/push';
import { createNotificationRelay } from '../core/relay';
import type { NotificationRelayOptions } from '../core/relay';
import type { NotificationRuntime } from '../core/runtime';
import { systemNotificationRuntime } from '../core/runtime';
import type {
  NotificationDeliveryStore,
  NotificationEndpointStore,
  NotificationRelayStore,
} from '../core/store';
import { createNotificationWakeup } from '../core/wakeup';
import type { NotificationPipelineWakeup } from '../core/wakeup';
import {
  NOTIFICATION_APPLICATION_KEY,
  NOTIFICATION_DELIVERY_STORE,
  NOTIFICATION_ENDPOINT_STORE,
  NOTIFICATION_LOGGER,
  NOTIFICATION_PIPELINE_WAKEUP,
  NOTIFICATION_PRESENTER,
  NOTIFICATION_PUBLISHER,
  NOTIFICATION_PUSH_GATEWAY,
  NOTIFICATION_RELAY_STORE,
  NOTIFICATION_RUNTIME,
  NOTIFICATION_SCHEDULING_POLICY,
} from './inject';
import { fromNestLogger } from './logger';
import { NotificationDispatchRunner, NotificationRelayRunner } from './runners';

const LOGGER_CONTEXT = 'Notifications';

export interface NestNotificationsOptions {
  readonly applicationKey: string;
  readonly relayStore: NotificationRelayStore;
  readonly deliveryStore: NotificationDeliveryStore;
  readonly endpointStore: NotificationEndpointStore;
  readonly pushGateway: NotificationPushGateway;
  readonly presenter: NotificationPresenter;
  readonly policy: NotificationSchedulingPolicy;
  /** Which endpoint providers the gateway handles. Must be non-empty. */
  readonly providers: readonly string[];
  /**
   * Exposed through `NOTIFICATION_PUBLISHER` for source-domain code. The pipeline
   * never calls it: staging happens in the host's own transaction.
   */
  readonly publisher?: NotificationPublisher<never> | undefined;
  readonly logger?: NotificationLogger | undefined;
  /**
   * Shared by the relay, the dispatcher and the wakeup hint - one instance, not
   * three. Defaults to `systemNotificationRuntime()`. Without this a consumer
   * wired through `forRoot` cannot fix the clock, so their own quiet-hours and
   * batch-window behaviour is untestable, and `defer` cannot be swapped for a
   * serverless host (design 0.2-12).
   */
  readonly runtime?: NotificationRuntime | undefined;
  readonly wakeup?: { readonly enabled?: boolean | undefined } | undefined;
  readonly relay?:
    | Pick<NotificationRelayOptions, 'pageSize' | 'claimStaleMs' | 'maxAttempts'>
    | undefined;
  readonly dispatch?:
    | Pick<
        NotificationDispatcherOptions,
        'pageSize' | 'claimStaleMs' | 'maxAttempts' | 'disableRejectedEndpoints'
      >
    | undefined;
}

export interface NestNotificationsAsyncOptions {
  readonly imports?: DynamicModule['imports'] | undefined;
  readonly inject?: readonly InjectionToken[] | undefined;
  readonly useFactory: (
    ...deps: readonly any[]
  ) => NestNotificationsOptions | Promise<NestNotificationsOptions>;
}

/** @internal 팩토리 산출물을 프로바이더들이 공유하기 위한 토큰. 공개 표면이 아니다. */
const RESOLVED_OPTIONS: unique symbol = Symbol.for(
  '@gj-kit/nest-notifications:resolved-options',
);

interface Assembled {
  readonly options: NestNotificationsOptions;
  readonly runtime: NotificationRuntime;
  readonly logger: NotificationLogger;
  readonly relayRunner: NotificationRelayRunner;
  readonly dispatchRunner: NotificationDispatchRunner;
  readonly wakeup: NotificationPipelineWakeup;
}

function configInvalid(message: string): never {
  throw new NotificationsError('ERR_NOTIFICATION_CONFIG_INVALID', message);
}

function applicationKeyInvalid(message: string): never {
  throw new NotificationsError('ERR_NOTIFICATION_APPLICATION_KEY_INVALID', message);
}

function assemble(options: NestNotificationsOptions): Assembled {
  if (typeof options.applicationKey !== 'string' || options.applicationKey.trim().length === 0) {
    applicationKeyInvalid('applicationKey must be a non-empty string.');
  }
  if (!Array.isArray(options.providers) || options.providers.length === 0) {
    configInvalid('providers must list at least one endpoint provider.');
  }

  const runtime = options.runtime ?? systemNotificationRuntime();
  const logger = options.logger ?? fromNestLogger(new Logger(LOGGER_CONTEXT), LOGGER_CONTEXT);

  const relay = createNotificationRelay({
    applicationKey: options.applicationKey,
    store: options.relayStore,
    policy: options.policy,
    runtime,
    logger,
    ...(options.relay?.pageSize === undefined ? {} : { pageSize: options.relay.pageSize }),
    ...(options.relay?.claimStaleMs === undefined
      ? {}
      : { claimStaleMs: options.relay.claimStaleMs }),
    ...(options.relay?.maxAttempts === undefined
      ? {}
      : { maxAttempts: options.relay.maxAttempts }),
  });

  const dispatcher = createNotificationDispatcher({
    applicationKey: options.applicationKey,
    store: options.deliveryStore,
    endpoints: options.endpointStore,
    pushGateway: options.pushGateway,
    presenter: options.presenter,
    providers: options.providers,
    runtime,
    logger,
    ...(options.dispatch?.pageSize === undefined ? {} : { pageSize: options.dispatch.pageSize }),
    ...(options.dispatch?.claimStaleMs === undefined
      ? {}
      : { claimStaleMs: options.dispatch.claimStaleMs }),
    ...(options.dispatch?.maxAttempts === undefined
      ? {}
      : { maxAttempts: options.dispatch.maxAttempts }),
    ...(options.dispatch?.disableRejectedEndpoints === undefined
      ? {}
      : { disableRejectedEndpoints: options.dispatch.disableRejectedEndpoints }),
  });

  const wakeup = createNotificationWakeup({
    relay,
    dispatcher,
    runtime,
    logger,
    ...(options.wakeup?.enabled === undefined ? {} : { enabled: options.wakeup.enabled }),
  });

  return {
    options,
    runtime,
    logger,
    relayRunner: new NotificationRelayRunner(relay),
    dispatchRunner: new NotificationDispatchRunner(dispatcher),
    wakeup,
  };
}

const EXPORTED = [
  NOTIFICATION_APPLICATION_KEY,
  NOTIFICATION_PUBLISHER,
  NOTIFICATION_RELAY_STORE,
  NOTIFICATION_DELIVERY_STORE,
  NOTIFICATION_ENDPOINT_STORE,
  NOTIFICATION_PUSH_GATEWAY,
  NOTIFICATION_PRESENTER,
  NOTIFICATION_SCHEDULING_POLICY,
  NOTIFICATION_PIPELINE_WAKEUP,
  NOTIFICATION_RUNTIME,
  NOTIFICATION_LOGGER,
  NotificationRelayRunner,
  NotificationDispatchRunner,
];

function valueProviders(assembled: Assembled): Provider[] {
  const options = assembled.options;
  return [
    { provide: NOTIFICATION_APPLICATION_KEY, useValue: options.applicationKey },
    { provide: NOTIFICATION_PUBLISHER, useValue: options.publisher ?? null },
    { provide: NOTIFICATION_RELAY_STORE, useValue: options.relayStore },
    { provide: NOTIFICATION_DELIVERY_STORE, useValue: options.deliveryStore },
    { provide: NOTIFICATION_ENDPOINT_STORE, useValue: options.endpointStore },
    { provide: NOTIFICATION_PUSH_GATEWAY, useValue: options.pushGateway },
    { provide: NOTIFICATION_PRESENTER, useValue: options.presenter },
    { provide: NOTIFICATION_SCHEDULING_POLICY, useValue: options.policy },
    { provide: NOTIFICATION_RUNTIME, useValue: assembled.runtime },
    { provide: NOTIFICATION_LOGGER, useValue: assembled.logger },
    { provide: NOTIFICATION_PIPELINE_WAKEUP, useValue: assembled.wakeup },
    { provide: NotificationRelayRunner, useValue: assembled.relayRunner },
    { provide: NotificationDispatchRunner, useValue: assembled.dispatchRunner },
  ];
}

/**
 * The notification pipeline as a Nest module.
 *
 * Deliberately not `@Global()`: a host that wants these providers everywhere says
 * so itself. Everything the pipeline needs is a required option, because a
 * silently working default would mean the library chose someone's product policy
 * — the store trio, the presenter, the policy and the application key have no
 * defaults for exactly that reason.
 */
@Module({})
export class NestNotificationsModule {
  /**
   * Synchronous wiring. Configuration is validated here, at assembly time: an
   * empty `applicationKey` or `providers` list fails to boot rather than failing
   * on the scheduler's first call.
   */
  static forRoot(options: NestNotificationsOptions): DynamicModule {
    const assembled = assemble(options);
    return {
      module: NestNotificationsModule,
      providers: valueProviders(assembled),
      exports: EXPORTED,
    };
  }

  /**
   * Asynchronous wiring, for hosts whose stores or policy come from other
   * providers. The same assembly-time validation runs immediately after the
   * factory resolves, so the boot-failure guarantee survives this path.
   */
  static forRootAsync(options: NestNotificationsAsyncOptions): DynamicModule {
    const resolved: Provider = {
      provide: RESOLVED_OPTIONS,
      inject: options.inject === undefined ? [] : [...options.inject],
      useFactory: async (...deps: readonly unknown[]): Promise<Assembled> =>
        assemble(await options.useFactory(...deps)),
    };

    const derived = <T>(token: InjectionToken, pick: (assembled: Assembled) => T): Provider => ({
      provide: token,
      inject: [RESOLVED_OPTIONS],
      useFactory: (assembled: Assembled): T => pick(assembled),
    });

    const providers: Provider[] = [
      resolved,
      derived(NOTIFICATION_APPLICATION_KEY, (a) => a.options.applicationKey),
      derived(NOTIFICATION_PUBLISHER, (a) => a.options.publisher ?? null),
      derived(NOTIFICATION_RELAY_STORE, (a) => a.options.relayStore),
      derived(NOTIFICATION_DELIVERY_STORE, (a) => a.options.deliveryStore),
      derived(NOTIFICATION_ENDPOINT_STORE, (a) => a.options.endpointStore),
      derived(NOTIFICATION_PUSH_GATEWAY, (a) => a.options.pushGateway),
      derived(NOTIFICATION_PRESENTER, (a) => a.options.presenter),
      derived(NOTIFICATION_SCHEDULING_POLICY, (a) => a.options.policy),
      derived(NOTIFICATION_RUNTIME, (a) => a.runtime),
      derived(NOTIFICATION_LOGGER, (a) => a.logger),
      derived(NOTIFICATION_PIPELINE_WAKEUP, (a) => a.wakeup),
      derived(NotificationRelayRunner, (a) => a.relayRunner),
      derived(NotificationDispatchRunner, (a) => a.dispatchRunner),
    ];

    return {
      module: NestNotificationsModule,
      imports: [...(options.imports ?? [])],
      providers,
      exports: EXPORTED,
    };
  }
}
