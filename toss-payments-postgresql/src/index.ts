/**
 * @gj-kit/toss-payments-postgresql — 코어 저장소 seam의 PostgreSQL 구현 (설계 정본:
 * docs/design/toss-payments-postgresql-v1.md).
 *
 * 원칙 경계: direct runtime dependency 0 — `pg`조차 peer가 아니다(구조적 타입만 소비).
 * 코어 공개 계약을 **구현만** 하며 재정의·확장하지 않는다. NestJS 배선은 `/nestjs`
 * 서브패스 전용이다(optional peer 격리).
 */

// SqlClient seam + pg Pool 어댑터 (설계 §2)
export { fromPgPool } from './sql';
export type {
  PgPoolClientLike,
  PgPoolLike,
  PgQueryResultLike,
  SqlClient,
  SqlExecutor,
  SqlResult,
  SqlRow,
} from './sql';

// 에러 (설계 §5)
export { TossPostgresError, isTossPostgresError } from './errors';
export type { TossPostgresErrorCode } from './errors';

// 식별자 규칙 — 소비자가 자기 설정 검증에 재사용할 수 있게 공개
export { DEFAULT_SCHEMA, IDENTIFIER_PATTERN } from './identifiers';

// 민감값 at-rest 보호 seam — 암호 알고리즘/KMS는 소비자 소유, 평문은 명시적 unsafe opt-in만 허용
export {
  SENSITIVE_VALUE_PURPOSE,
  createSensitiveValueContext,
  unsafePlaintextSensitiveValueProtector,
} from './sensitive-values';
export type {
  PgSensitiveStoreOptions,
  SensitiveValueContext,
  SensitiveValueProtector,
  SensitiveValuePurpose,
} from './sensitive-values';

// 마이그레이션 (설계 §4)
export { advisoryLockKey, migrate, renderMigrationSql } from './migrations';
export type { MigrateOptions, MigrationResult } from './migrations';

// 스토어 6종 (설계 §3)
export { createPgOrderStore } from './stores/orders';
export type { PgStoreOptions } from './stores/orders';
export { createPgDepositSecretStore } from './stores/deposit-secrets';
export { createPgBillingKeyStore } from './stores/billing-keys';
export type { PgBillingKeyMutation, PgBillingKeySnapshot, PgBillingKeyStore } from './stores/billing-keys';
export { createPgCancelRetryStore } from './stores/cancel-retries';
export { createPgWebhookDedupeStore } from './stores/webhook-dedupe';
export type { PgWebhookDedupeStoreOptions } from './stores/webhook-dedupe';
export { createPgAuditSink } from './stores/audit';
export type { PgAuditSink } from './stores/audit';

// 웹훅 inbox (설계 §3.7)
export { createPgWebhookInboxStore, withWebhookInbox } from './stores/inbox';
export type { WebhookInboxStore, WithWebhookInboxOptions } from './stores/inbox';

// 팩토리 + cleanup (설계 §5·§6)
export { createTossPaymentsPostgres } from './factory';
export type { CleanupResult, TossPaymentsPostgres, TossPaymentsPostgresOptions } from './factory';
