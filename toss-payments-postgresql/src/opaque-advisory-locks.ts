/**
 * 앱 lifecycle용 opaque PostgreSQL advisory lock.
 *
 * 이 모듈은 결제 정책·식별자 원본·HMAC secret을 소유하지 않는다. 호출 앱이 이미 만든
 * nonsecret HMAC/blind-index 문자열만 받아, 그 값 자체는 SQL 파라미터에도 흘리지 않고
 * domain-separated SHA-256 fingerprint로 한 번 더 축약한 뒤 transaction-scoped advisory
 * lock을 잡는다. 같은 PostgreSQL DB를 보는 여러 프로세스/인스턴스의 짧은 lifecycle
 * finalization을 순서화하기 위한 narrow seam이다.
 */
import { createHash } from 'node:crypto';

import { DEFAULT_SCHEMA, assertSqlIdentifier } from './identifiers';
import type { SqlClient, SqlExecutor } from './sql';

const OPAQUE_ADVISORY_LOCK_SQL =
  'SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))';
const OPAQUE_ADVISORY_LOCK_NAMESPACE =
  '@gj-kit/toss-payments-postgresql:opaque-advisory-lock';
const MAX_OPAQUE_ADVISORY_LOCK_KEY_BYTES = 512;

/**
 * 앱이 만든 nonsecret HMAC/blind-index lifecycle key임을 나타내는 nominal type.
 *
 * 원본 customer ID·email·authorization secret·billing key를 직접 대입할 수 없게 해,
 * 호출부에서 `createOpaqueAdvisoryLockKey(appBlindIndex(...))`라는 보안 결정을 명시한다.
 * runtime 값은 문자열이므로 DB 스키마나 새 peer dependency는 필요 없다.
 */
declare const opaqueAdvisoryLockKeyBrand: unique symbol;
export type OpaqueAdvisoryLockKey = string & {
  readonly [opaqueAdvisoryLockKeyBrand]: 'OpaqueAdvisoryLockKey';
};

/**
 * lifecycle work를 short-lived PostgreSQL advisory transaction lock 아래 실행하는 표면.
 *
 * callback에 SQL session을 전달하지 않는다. 이 API의 목적은 host DB transaction/worker
 * lifecycle의 **순서화**이며, 다른 ORM connection의 transaction과 2PC 원자성을 만들지
 * 않는다. callback은 local durable work만 수행하고 provider/HTTP 같은 긴 network I/O는
 * 넣지 않아야 한다. callback 안에서 같은 key로 이 facility를 재진입하면 다른 connection이
 * 바깥 transaction의 xact lock을 기다려 self-deadlock하므로, 연관 작업은 한 callback에 둔다.
 */
export interface PgOpaqueAdvisoryLocks {
  withLock<T>(
    key: OpaqueAdvisoryLockKey,
    operation: () => T | Promise<T>,
  ): Promise<T>;
}

/** 개별 factory 사용 시 aggregate와 같은 schema namespace를 선택하는 옵션. */
export interface PgOpaqueAdvisoryLocksOptions {
  /** 기본 `'toss_payments'`. aggregate는 자신의 검증된 schema를 자동 전달한다. */
  readonly schema?: string;
}

/**
 * @internal
 *
 * 같은 `SqlClient.withConnection` transaction 안에서 opaque advisory lock만 먼저
 * 획득하는 internal helper. `PgBillingKeyStore.withOpaqueMutationLock`이 standalone
 * `withLock()`을 중첩하지 않고 opaque → customer 순서의 한 transaction을 만들 때 쓴다.
 * 이 모듈은 package root export에서 의도적으로 제외된다.
 */
export interface OpaqueAdvisoryLockAcquirer {
  acquire(session: SqlExecutor, key: OpaqueAdvisoryLockKey): Promise<void>;
}

/**
 * 앱이 만든 HMAC/blind-index를 opaque lock key로 명시적으로 표시한다.
 *
 * 이 함수는 HMAC을 생성하거나 원본 식별자를 보호하지 않는다. 앱의 key management와
 * canonicalization은 앱 소유이다. empty/비정상적으로 큰 입력만 fail-fast로 거부하며,
 * 오류 메시지에는 전달된 값을 포함하지 않는다.
 */
export function createOpaqueAdvisoryLockKey(value: string): OpaqueAdvisoryLockKey {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    Buffer.byteLength(value, 'utf8') > MAX_OPAQUE_ADVISORY_LOCK_KEY_BYTES
  ) {
    throw new TypeError(
      '[@gj-kit/toss-payments-postgresql] opaque advisory lock key는 1~512 UTF-8 byte 문자열이어야 합니다.',
    );
  }
  return value as OpaqueAdvisoryLockKey;
}

/** @internal — aggregate의 combined billing-key mutation lock용 composition seam. */
export function createOpaqueAdvisoryLockAcquirer(
  options: PgOpaqueAdvisoryLocksOptions = {},
): OpaqueAdvisoryLockAcquirer {
  const schema = assertSqlIdentifier(options.schema ?? DEFAULT_SCHEMA, 'schema');
  const namespace = `${OPAQUE_ADVISORY_LOCK_NAMESPACE}:${schema}`;

  return {
    async acquire(session, key) {
      // branded type은 compile-time aid다. JS 소비자/any 경로도 fail-fast 계약을 받는다.
      const normalizedKey = createOpaqueAdvisoryLockKey(key);
      const fingerprint = fingerprintOpaqueAdvisoryLockKey(normalizedKey);
      // 원본 opaque key는 query parameter/driver error/slow-query log에 넘기지 않는다.
      // PostgreSQL의 two-int lock은 충돌 시 서로 다른 작업을 추가 직렬화할 뿐, 같은
      // fingerprint의 상호 배제를 약화하지 않는다.
      await session.query(OPAQUE_ADVISORY_LOCK_SQL, [namespace, fingerprint]);
    },
  };
}

/**
 * PostgreSQL advisory transaction lock factory.
 *
 * `BEGIN → pg_advisory_xact_lock → callback → COMMIT`은 SqlClient가 보장하는 하나의
 * connection에서 실행된다. callback 또는 lock/commit이 실패하면 best-effort ROLLBACK 후
 * 원래 오류를 그대로 rethrow한다. `pg_advisory_xact_lock`은 commit/rollback과 함께 자동
 * 해제되므로 session-level lock 누수 경로가 없다.
 */
export function createPgOpaqueAdvisoryLocks(
  sql: SqlClient,
  options: PgOpaqueAdvisoryLocksOptions = {},
): PgOpaqueAdvisoryLocks {
  const acquirer = createOpaqueAdvisoryLockAcquirer(options);

  return {
    async withLock(key, operation) {
      // branded type은 compile-time aid다. JS 소비자/any 경로도 fail-fast 계약을 받는다.
      const normalizedKey = createOpaqueAdvisoryLockKey(key);

      return sql.withConnection(async (session) => {
        let transactionOpen = false;
        try {
          await session.query('BEGIN');
          transactionOpen = true;
          await acquirer.acquire(session, normalizedKey);
          const value = await operation();
          await session.query('COMMIT');
          transactionOpen = false;
          return value;
        } catch (cause) {
          if (transactionOpen) {
            try {
              await session.query('ROLLBACK');
            } catch {
              // 원래 실패 원인이 더 유용하며, fromPgPool은 이 throw를 받아 connection을 폐기한다.
            }
          }
          throw cause;
        }
      });
    },
  };
}

/**
 * DB에는 raw opaque key 대신 domain-separated SHA-256 hex만 전달한다. 앱 HMAC/blind
 * index는 원래 nonsecret이어야 하지만, 이 추가 축약은 query logging/observability의
 * 노출면도 줄인다. 이 fingerprint는 authorization secret 또는 durable DB identifier가
 * 아니며, lock namespace 안에서의 비교 전용이다.
 */
function fingerprintOpaqueAdvisoryLockKey(key: OpaqueAdvisoryLockKey): string {
  return createHash('sha256')
    .update(OPAQUE_ADVISORY_LOCK_NAMESPACE, 'utf8')
    .update('\u0000', 'utf8')
    .update(key, 'utf8')
    .digest('hex');
}
