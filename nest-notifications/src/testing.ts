/**
 * `@gj-kit/nest-notifications/testing` — 인메모리 저장소 스위트·가짜 런타임·적합성 케이스.
 *
 * 프로덕션 번들에 들어가면 안 되는 표면이라 서브패스로 분리한다(형제 3종의 관행). 이 서브패스도
 * `@nestjs/*`·`rxjs`·`reflect-metadata`를 import하지 않는다 — 인메모리 저장소는 코어 위에만 선다.
 */
export { memoryNotificationStores } from './testing/memory-stores';
export type {
  MemoryNotificationSnapshot,
  MemoryNotificationStores,
  NotificationStoreSuite,
} from './testing/memory-stores';

export { fakeNotificationRuntime } from './testing/fake-runtime';
export type { FakeNotificationRuntime } from './testing/fake-runtime';

export { recordingNotificationLogger } from './testing/recording-logger';
export type { LogEntry, RecordingNotificationLogger } from './testing/recording-logger';

export { passthroughPresenter } from './testing/passthrough';

export { notificationStoreContractCases } from './testing/store-contract';
export type {
  NotificationObligation,
  NotificationStoreContractOptions,
  StoreContractCase,
} from './testing/store-contract';
