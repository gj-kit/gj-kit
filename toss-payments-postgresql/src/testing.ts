/**
 * 엔트리 "./testing" — PostgreSQL 없는 `TossPaymentsPostgres` 대역.
 *
 * 소비 앱 unit 테스트가 lock·rollback·protector·dedupe 계약을 jest.fn()으로 다시 흉내
 * 내지 않게 하는 in-process 구현이다. DB 드라이버·Nest peer 어느 것도 import하지 않는다.
 * 프로덕션 사용 금지 — 프로세스 생존 기간만 상태를 유지한다.
 */
export {
  MemoryLockContractError,
  createMemoryTossPaymentsPostgres,
  isMemoryLockContractError,
} from './testing/memory-postgres';
export type {
  MemoryCleanupEvent,
  MemoryLockAcquiredEvent,
  MemoryLockApi,
  MemoryLockClass,
  MemoryLockContractErrorCode,
  MemoryLockReleasedEvent,
  MemoryLockRequestedEvent,
  MemoryMigrateEvent,
  MemoryStoreEvent,
  MemoryStoreName,
  MemoryTossPaymentsPostgres,
  MemoryTossPaymentsPostgresEvent,
  MemoryTossPaymentsPostgresOptions,
  MemoryTossPaymentsPostgresRecorded,
  MemoryWebhookInboxRow,
} from './testing/memory-postgres';

// 테스트 파일이 루트 엔트리 없이도 lock key를 만들고 대역의 타입을 읽을 수 있게 재export
export { createOpaqueAdvisoryLockKey } from './opaque-advisory-locks';
export type { OpaqueAdvisoryLockKey, PgOpaqueAdvisoryLocks } from './opaque-advisory-locks';
export { unsafePlaintextSensitiveValueProtector } from './sensitive-values';
export type { SensitiveValueContext, SensitiveValueProtector } from './sensitive-values';
export type { CleanupResult, TossPaymentsPostgres } from './factory';
export type { MigrationResult } from './migrations';
export type { PgBillingKeyMutation, PgBillingKeySnapshot, PgBillingKeyStore } from './stores/billing-keys';
