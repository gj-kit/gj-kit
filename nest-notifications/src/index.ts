/**
 * `@gj-kit/nest-notifications` — NestJS 어댑터.
 *
 * 이 배럴은 `./core`의 **런타임 값**을 재수출하지 않는다. 같은 심볼이 두 경로로 보이면
 * CJS 이중 로드에서 토큰 동일성과 `instanceof` 판정이 깨지기 때문이다. 코어 타입은 타입으로만
 * 재수출한다 — 런타임 값의 출처는 `./core`(그리고 `./expo`·`./testing`) 하나다.
 */
export {
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
} from './nest/inject';

export { NestNotificationsModule } from './nest/module';
export type { NestNotificationsAsyncOptions, NestNotificationsOptions } from './nest/module';

export { NotificationDispatchRunner, NotificationRelayRunner } from './nest/runners';

export { fromNestLogger } from './nest/logger';

/**
 * `NotificationsError`는 **클래스**다. `export type { NotificationsError }`로 내면 dts
 * 롤업이 `type` 수식어를 떨어뜨려 산출 선언이 이 이름을 런타임 값으로 광고하고, 소비자의
 * `import { NotificationsError }`가 타입 검사만 통과한 뒤 ESM에서 모듈 인스턴스화 실패로
 * 프로세스를 죽인다(CJS에서는 `undefined`). 그래서 값이 될 수 없는 **별칭**으로 낸다.
 * 생성과 판정은 `./core`의 몫이다(`isNotificationsError`가 정본, §2.5).
 * 형제 `nest-operations-jobs`가 같은 결함에 같은 처방을 냈다.
 */
export type NotificationsError = import('./core').NotificationsError;

/**
 * 코어 타입 재수출 — **타입만**이다. `createNotificationRelay`·`createQuietHoursPolicy`
 * 같은 런타임 값은 `@gj-kit/nest-notifications/core`에서 가져온다.
 *
 * 이 목록에는 **값 의미를 가진 이름이 하나도 없어야 한다** — 클래스·함수·상수를 여기 넣으면
 * 위 `NotificationsError` 주석의 실패가 그대로 재현된다. `tests/unit/dual-build.test.ts`가
 * `dist/index.js`의 실제 export 집합으로 그 사실을 고정한다.
 */
export type {
  AppendItemInput,
  BatchIdentity,
  ClaimedNotificationCommand,
  ClaimedNotificationDelivery,
  CreateDeliveryInput,
  CreateDeliveryResult,
  DispatchClaimRequest,
  DispatchCompleteRequest,
  DispatchReleaseRequest,
  DispatchTransactionRequest,
  EnsureMessageInput,
  MergeBatchInput,
  NotificationAccountLifecycle,
  NotificationAction,
  NotificationBatch,
  NotificationBatchWindow,
  NotificationClock,
  NotificationCommand,
  NotificationDeliveryStore,
  NotificationDispatcher,
  NotificationDispatcherOptions,
  NotificationDispatchSummary,
  NotificationDispatchTransaction,
  NotificationEndpointDisableTarget,
  NotificationEndpointStore,
  NotificationJsonPrimitive,
  NotificationJsonValue,
  NotificationLogger,
  NotificationPipelineWakeup,
  NotificationPresentation,
  NotificationPresentationInput,
  NotificationPresenter,
  NotificationPriority,
  NotificationPublisher,
  NotificationPushEndpoint,
  NotificationPushGateway,
  NotificationPushPayload,
  NotificationPushResult,
  NotificationQuietHours,
  NotificationRecipientLiveness,
  NotificationRelay,
  NotificationRelayOptions,
  NotificationRelayOutcome,
  NotificationRelayStore,
  NotificationRelaySummary,
  NotificationRelayTransaction,
  NotificationSchedulingPolicy,
  NotificationsErrorCode,
  NotificationStageResult,
  NotificationTiming,
  NotificationWakeupOptions,
  ObservedNotificationEndpoint,
  OpenBatchDelivery,
  QuietHoursPolicyOptions,
  RelayClaimRequest,
  RelayCompleteRequest,
  RelayReleaseRequest,
  RelayTransactionRequest,
  ResolveDeliveryInput,
} from './core';
