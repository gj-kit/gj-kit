/**
 * `@gj-kit/nest-notifications/core` — 프레임워크·전송·저장소·언어를 모르는 알림 파이프라인.
 *
 * 이 서브패스의 산출물은 `@nestjs/*`·`rxjs`·`reflect-metadata`를 **한 줄도** import하지
 * 않고, 어떤 provider SDK도 알지 못하며, 비영어 문자열 리터럴을 담지 않는다
 * (`tests/unit/guards/*`가 소스와 dist 양쪽에서 기계적으로 확인한다). Nest 없는 워커·람다·
 * `node --test` 프로세스가 이 엔트리만 로드해 릴레이와 디스패처를 돌릴 수 있다.
 */
export {
  assertNotificationCommand,
  notificationPriorityFrom,
} from './core/contracts';
export type {
  NotificationAction,
  NotificationBatch,
  NotificationCommand,
  NotificationJsonPrimitive,
  NotificationJsonValue,
  NotificationPriority,
  NotificationPublisher,
  NotificationStageResult,
  NotificationTiming,
} from './core/contracts';

export { isNotificationsError, NotificationsError, safeErrorCode } from './core/errors';
export type { NotificationsErrorCode } from './core/errors';

export { silentNotificationLogger } from './core/logger';
export type { NotificationLogger } from './core/logger';

export { systemNotificationRuntime } from './core/runtime';
export type { NotificationClock, NotificationRuntime } from './core/runtime';

export {
  createQuietHoursPolicy,
  DEFAULT_BATCH_WINDOW_MS,
  notificationBatchPolicyKey,
  notificationFollowUpBatchPolicyKey,
} from './core/policy';
export type {
  NotificationBatchWindow,
  NotificationQuietHours,
  NotificationSchedulingPolicy,
  QuietHoursPolicyOptions,
  ResolveDeliveryInput,
} from './core/policy';

export { notificationRecipientKey } from './core/recipient-key';

export type {
  NotificationPresentation,
  NotificationPresentationInput,
  NotificationPresenter,
} from './core/presentation';

export type {
  NotificationPushEndpoint,
  NotificationPushGateway,
  NotificationPushPayload,
  NotificationPushResult,
} from './core/push';

export {
  DEFAULT_CLAIM_STALE_MS,
  DEFAULT_DISPATCH_PAGE_SIZE,
  DEFAULT_RELAY_PAGE_SIZE,
} from './core/store';
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
  NotificationDeliveryStore,
  NotificationDispatchTransaction,
  NotificationEndpointDisableTarget,
  NotificationEndpointStore,
  NotificationRelayStore,
  NotificationRelayTransaction,
  ObservedNotificationEndpoint,
  OpenBatchDelivery,
  RelayClaimRequest,
  RelayCompleteRequest,
  RelayReleaseRequest,
  RelayTransactionRequest,
} from './core/store';

export type {
  NotificationAccountLifecycle,
  NotificationRecipientLiveness,
} from './core/lifecycle';

export { createNotificationRelay } from './core/relay';
export type {
  NotificationRelay,
  NotificationRelayOptions,
  NotificationRelayOutcome,
  NotificationRelaySummary,
} from './core/relay';

export { createNotificationDispatcher } from './core/dispatch';
export type {
  NotificationDispatcher,
  NotificationDispatcherOptions,
  NotificationDispatchSummary,
} from './core/dispatch';

export { createNotificationWakeup } from './core/wakeup';
export type {
  NotificationPipelineWakeup,
  NotificationWakeupOptions,
} from './core/wakeup';
