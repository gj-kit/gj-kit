/**
 * BillingKeyStore PostgreSQL 구현 (설계 §3.3).
 *
 * 코어 계약의 핵심 불변식:
 * - 토스에 빌링키 조회 API가 없다 — **저장 실패 = 복구 불가**. 이 테이블이 유일한
 *   보관 수단이므로 save는 드라이버 에러를 감추지 않고 그대로 던진다(코어가 감쌈).
 * - `save`는 upsert(customer_key)다 — issue/import 양쪽에서 호출되는 계약이고 코어가
 *   교체 정책을 규정하지 않으므로 최신 발급본을 유지한다.
 * - `billing_key`에는 BillingKeyRecord 전체의 보호된 JSON 문자열만 쓴다. `card`와
 *   `transfers`까지 함께 보호해 계좌번호 등 부수 메타데이터가 jsonb에 평문으로 남지
 *   않게 한다. method/issued_at은 운영 조회용 비밀이 아닌 최소 메타데이터로만 남긴다.
 * - ⚠ 보안 불변식(코어 stores.ts): 어떤 에러 메시지에도 billing_key 값을 싣지 않고,
 *   customerKey와 billingKey를 같은 문자열(로그 한 줄)에 함께 두지 않는다 — 토스의
 *   빌링 보안 모델이 이 쌍의 분리에 의존한다. 이 파일의 메시지는 둘 다 싣지 않는다.
 */
import type {
  BillingKeyDeleteRequest,
  BillingKeyRecord,
  BillingKeySaveOptions,
  BillingKeyStore,
} from '@gj-kit/toss-payments/server';

import { DEFAULT_SCHEMA, assertSqlIdentifier, schemaRef } from '../identifiers';
import {
  createOpaqueAdvisoryLockAcquirer,
  createOpaqueAdvisoryLockKey,
} from '../opaque-advisory-locks';
import type { OpaqueAdvisoryLockKey } from '../opaque-advisory-locks';
import { requireSensitiveValueProtector } from '../sensitive-values';
import type { PgSensitiveStoreOptions } from '../sensitive-values';
import type { SqlClient, SqlExecutor } from '../sql';
import {
  assertRecordCustomerKey,
  billingKeysEqualConstantTime,
  fingerprintOperationId,
  operationFingerprintFromReplacement,
  operationFingerprintsEqual,
  protectBillingKeyRecord,
  readOperationFingerprint,
  recordFromReplacement,
  snapshotFromLoaded,
  unprotectBillingKeyRecord,
} from './billing-key-codec';
import type { LockedBillingKeySnapshot, PgBillingKeySnapshot } from './billing-key-codec';

export type { PgBillingKeySnapshot } from './billing-key-codec';

// `hashtext` + two-int advisory lock은 지원 PostgreSQL 범위에 널리 존재한다. 해시 충돌은
// 서로 다른 customer의 작업을 추가 직렬화할 뿐, 동일 customer fence의 안전성은 약화하지
// 않는다. `hashtextextended`처럼 새 PostgreSQL 버전에만 있는 함수에 의존하지 않는다.
const BILLING_KEY_MUTATION_LOCK_SQL =
  'SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))';
const BILLING_KEY_MUTATION_LOCK_PREFIX = '@gj-kit/toss-payments-postgresql:billing-key:';
/**
 * `withMutationLock` callback에만 전달되는 customerKey-고정 mutation handle.
 *
 * 핸들은 lock을 잡은 customerKey 하나만 조작한다. callback 안에서 바깥
 * `pg.billingKeys`를 다시 호출하면 다른 커넥션이 같은 advisory lock을 기다려 deadlock이
 * 되므로, 모든 billing key 작업은 이 handle을 통해 수행해야 한다.
 */
export interface PgBillingKeyMutation {
  readonly customerKey: BillingKeyRecord['customerKey'];
  find(): Promise<BillingKeyRecord | null>;
  save(record: BillingKeyRecord, options?: BillingKeySaveOptions): Promise<void>;
  /**
   * 현재 raw billing key와 일치할 때만 삭제한다. 무조건 삭제 API는 의도적으로 없다.
   */
  delete(expectedBillingKey: BillingKeyRecord['billingKey']): Promise<boolean>;
  replaceAndGetPrevious(
    record: BillingKeyRecord,
    options?: BillingKeySaveOptions,
  ): Promise<PgBillingKeySnapshot | null>;
  /**
   * 저장 당시의 nonsecret operationId fingerprint가 예상 operationId와 같은지 확인한다.
   * callback 내부에서만 쓰며 raw operationId/fingerprint 어느 것도 반환하지 않는다.
   */
  isCurrentOperationId(operationId: string): Promise<boolean>;
  deleteIfBillingKeyMatches(expectedBillingKey: BillingKeyRecord['billingKey']): Promise<boolean>;
  replaceIfBillingKeyMatches(
    expectedBillingKey: BillingKeyRecord['billingKey'],
    replacement: BillingKeyRecord | PgBillingKeySnapshot | null,
  ): Promise<boolean>;
}

/**
 * PostgreSQL이 제공하는 BillingKeyStore 확장.
 *
 * 코어 `BillingKeyStore`도 expected billing key를 받는 조건부 삭제를 강제한다. 이 확장은
 * 지연된 `BILLING_DELETED`, projection 보상, 발급 후 host lifecycle을 같은 customerKey
 * fence 안에서 끝내야 하는 호출자를 위한 PostgreSQL 전용 API다.
 *
 * `replaceAndGetPrevious`와 두 conditional 메서드는 하나의 커넥션/트랜잭션에서
 * customerKey별 advisory lock → `SELECT … FOR UPDATE` → decrypt → constant-time
 * compare → UPSERT/UPDATE/DELETE를 수행한다. 따라서 같은 customerKey의 더 최신
 * issuance가 먼저 저장됐다면 conditional 호출은 false를 반환하고, 이 호출이 먼저
 * 잠갔다면 뒤의 issuance는 commit 뒤에 실행되어 최신 issuance를 보존한다.
 */
export interface PgBillingKeyStore extends BillingKeyStore {
  /**
   * customerKey별 PostgreSQL advisory transaction lock을 callback 전체에 유지한다.
   *
   * 같은 customerKey의 generic 저장과 앱 projection을 순서대로 끝내야 할 때의
   * cross-instance fence다. 모든 경쟁 issuance/deletion/compensation이 이 API를 사용해야
   * 한다. callback 성공 시 commit, throw 시 generic billing key 변경은 rollback된다.
   * callback 안에서는 전달된 mutation handle만 사용하고 바깥 store를 재호출하지 않는다.
   */
  withMutationLock<T>(
    customerKey: BillingKeyRecord['customerKey'],
    operation: (mutation: PgBillingKeyMutation) => T | Promise<T>,
  ): Promise<T>;

  /**
   * opaque lifecycle lock과 customerKey mutation lock을 **같은 PostgreSQL connection과
   * transaction**에서 `opaque → customer` 순서로 획득한다.
   *
   * credential issuance/revocation/compensation처럼 host lifecycle과 generic billing-key
   * mutation을 함께 직렬화해야 할 때의 유일한 composable API다. callback은 두 lock을 모두
   * 얻은 뒤에만 기존 customer-bound mutation handle을 받는다. callback 안에서는 handle만
   * 사용하고 `opaqueLocks.withLock` 또는 outer billing store를 재진입하지 않는다.
   *
   * `opaqueLocks.withLock(key, () => withMutationLock(...))`처럼 두 public API를 중첩하면
   * 서로 다른 `withConnection`을 열어 pool max=1에서 self-deadlock할 수 있고, 한
   * transaction이라는 보장도 잃는다. 모든 결합 경로의 global lock order는 이 메서드가
   * 강제하는 **opaque → customer**다.
   */
  withOpaqueMutationLock<T>(
    opaqueKey: OpaqueAdvisoryLockKey,
    customerKey: BillingKeyRecord['customerKey'],
    operation: (mutation: PgBillingKeyMutation) => T | Promise<T>,
  ): Promise<T>;

  /**
   * record를 저장하고, 같은 트랜잭션에서 잠근 직전 snapshot을 반환한다.
   *
   * 단일 generic write의 snapshot/보상에는 `find()` 뒤 `save()`보다 안전하다. 다만 앱
   * projection까지 순서 보장이 필요하면 이 단독 메서드가 아니라 `withMutationLock` 안의
   * 같은 이름 메서드를 사용한다. 그 callback 안에서 반환된 snapshot(첫 발급이면 null)을
   * 이후 `replaceIfBillingKeyMatches(record.billingKey, previous)`에 전달하면 현재 값이
   * 여전히 record일 때만 원자 복원/삭제할 수 있다. snapshot 원본을 그대로 넘기면 prior
   * operation fingerprint까지 보존한다.
   */
  replaceAndGetPrevious(
    record: BillingKeyRecord,
    options?: BillingKeySaveOptions,
  ): Promise<PgBillingKeySnapshot | null>;

  /**
   * 현재 billing key가 `expectedBillingKey`와 같을 때만 행을 삭제한다.
   *
   * 행이 없거나 현재 키가 다르면 false이고, 보호 payload 손상/복호화 실패는 숨기지 않고
   * throw한다. false는 삭제되지 않았다는 안전한 결과이지 저장소 장애를 뜻하지 않는다.
   */
  deleteIfBillingKeyMatches(request: BillingKeyDeleteRequest): Promise<boolean>;

  /**
   * 현재 billing key가 `expectedBillingKey`와 같을 때만 replacement로 교체한다.
   *
   * `replacement`가 null이면 조건부 삭제다. 보상 경로에서는 발급 직후 저장한 새 키를
   * expected로, 이전 snapshot(또는 첫 발급이면 null)을 replacement로 전달한다. replacement의
   * customerKey는 첫 인자와 반드시 같아야 한다.
   */
  replaceIfBillingKeyMatches(
    customerKey: BillingKeyRecord['customerKey'],
    expectedBillingKey: BillingKeyRecord['billingKey'],
    replacement: BillingKeyRecord | PgBillingKeySnapshot | null,
  ): Promise<boolean>;
}

/**
 * BillingKeyStore의 조건부 delete는 protected payload를 같은 transaction에서 복호화·비교해야
 * 한다. 따라서 `withConnection` 없는 SqlExecutor는 지원하지 않고 SqlClient가 필수다.
 */
export function createPgBillingKeyStore(
  sql: SqlClient,
  options: PgSensitiveStoreOptions,
): PgBillingKeyStore {
  const schema = assertSqlIdentifier(options.schema ?? DEFAULT_SCHEMA, 'schema');
  const qs = schemaRef(schema);
  const sensitiveValueProtector = requireSensitiveValueProtector(options.sensitiveValueProtector);
  const opaqueLockAcquirer = createOpaqueAdvisoryLockAcquirer({ schema });

  const upsertSql = `INSERT INTO ${qs}.billing_keys (customer_key, billing_key, method, issued_at, card, transfers, operation_fingerprint)
VALUES ($1, $2, $3, $4, $5, $6, $7)
ON CONFLICT (customer_key) DO UPDATE
  SET billing_key = excluded.billing_key,
      method      = excluded.method,
      issued_at   = excluded.issued_at,
      card        = excluded.card,
      transfers   = excluded.transfers,
      operation_fingerprint = excluded.operation_fingerprint,
      updated_at  = now()`;

  const selectSql = `SELECT billing_key, operation_fingerprint
FROM ${qs}.billing_keys
WHERE customer_key = $1`;

  const selectForUpdateSql = `${selectSql}
FOR UPDATE`;

  const conditionalDeleteSql = `DELETE FROM ${qs}.billing_keys
WHERE customer_key = $1
RETURNING 1 AS deleted`;

  const conditionalReplaceSql = `UPDATE ${qs}.billing_keys
SET billing_key = $2,
    method      = $3,
    issued_at   = $4,
    card        = $5,
    transfers   = $6,
    operation_fingerprint = $7,
    updated_at  = now()
WHERE customer_key = $1
RETURNING 1 AS replaced`;

  const withMutationLock: PgBillingKeyStore['withMutationLock'] = (customerKey, operation) =>
    withBillingKeyMutationTransaction(sql, schema, customerKey, (session) =>
      operation(
        createLockedBillingKeyMutation({
          session,
          customerKey,
          sensitiveValueProtector,
          upsertSql,
          selectSql,
          selectForUpdateSql,
          conditionalDeleteSql,
          conditionalReplaceSql,
        }),
      ),
    );

  const withOpaqueMutationLock: PgBillingKeyStore['withOpaqueMutationLock'] = (
    opaqueKey,
    customerKey,
    operation,
  ) => {
    // JS/any caller도 connection을 얻기 전 fail-fast한다. internal acquirer도 독립 사용
    // 경로를 막기 위해 다시 검사하지만, invalid key 때문에 BEGIN/ROLLBACK을 만들 필요는 없다.
    const normalizedOpaqueKey = createOpaqueAdvisoryLockKey(opaqueKey);
    return withBillingKeyMutationTransaction(
      sql,
      schema,
      customerKey,
      (session) =>
        operation(
          createLockedBillingKeyMutation({
            session,
            customerKey,
            sensitiveValueProtector,
            upsertSql,
            selectSql,
            selectForUpdateSql,
            conditionalDeleteSql,
            conditionalReplaceSql,
          }),
        ),
      {
        // 고정 순서: opaque app lifecycle gate를 먼저, customer generic key gate를 다음.
        // 두 lock과 callback이 아래 하나의 SqlClient connection/transaction에 남는다.
        beforeCustomerLock: (session) => opaqueLockAcquirer.acquire(session, normalizedOpaqueKey),
      },
    );
  };

  const replaceAndGetPrevious: PgBillingKeyStore['replaceAndGetPrevious'] = (record, options) =>
    withMutationLock(record.customerKey, (mutation) =>
      mutation.replaceAndGetPrevious(record, options),
    );

  const replaceIfBillingKeyMatches: PgBillingKeyStore['replaceIfBillingKeyMatches'] = (
    customerKey,
    expectedBillingKey,
    replacement,
  ) =>
    withMutationLock(customerKey, (mutation) =>
      mutation.replaceIfBillingKeyMatches(expectedBillingKey, replacement),
    );

  const deleteIfBillingKeyMatches: PgBillingKeyStore['deleteIfBillingKeyMatches'] = (request) =>
    withMutationLock(request.customerKey, (mutation) =>
      mutation.deleteIfBillingKeyMatches(request.expectedBillingKey),
    );

  const guardedStore: PgBillingKeyStore = {
    async save(record, options) {
      await replaceAndGetPrevious(record, options);
    },
    async find(customerKey) {
      const result = await sql.query(selectSql, [customerKey]);
      const row = result.rows[0];
      if (row === undefined) return null;
      return unprotectBillingKeyRecord(row['billing_key'], customerKey, sensitiveValueProtector);
    },
    async delete(request) {
      return withMutationLock(request.customerKey, (mutation) =>
        mutation.delete(request.expectedBillingKey),
      );
    },
    withMutationLock,
    withOpaqueMutationLock,
    replaceAndGetPrevious,
    replaceIfBillingKeyMatches,
    deleteIfBillingKeyMatches,
  };
  return guardedStore;
}

/**
 * customerKey별 transaction mutex + transaction wrapper.
 *
 * `SELECT … FOR UPDATE`는 존재하는 행만 잠그므로, 첫 발급처럼 아직 행이 없는 경우에는
 * row lock만으로 동시 conditional issuance를 직렬화할 수 없다. package-owned aggregate의
 * save/replace/delete 모두 이 advisory lock에 참여시켜 missing-row 경우까지 보호한다.
 * lock 이름은 DB에 값으로 전달되며 SQL에 보간하지 않는다.
 */
async function withBillingKeyMutationTransaction<T>(
  sql: SqlClient,
  schema: string,
  customerKey: BillingKeyRecord['customerKey'],
  operation: (session: SqlExecutor) => T | Promise<T>,
  options?: {
    /** combined lifecycle path only — customer advisory lock 전에 같은 session에서 실행한다. */
    readonly beforeCustomerLock?: (session: SqlExecutor) => Promise<void>;
  },
): Promise<T> {
  return sql.withConnection(async (session) => {
    let transactionOpen = false;
    try {
      await session.query('BEGIN');
      transactionOpen = true;
      // `withOpaqueMutationLock` only: nested withConnection 없이 opaque→customer order를
      // 한 transaction에서 만든다. standalone `opaqueLocks.withLock`과 중첩하면 안 된다.
      await options?.beforeCustomerLock?.(session);
      await session.query(BILLING_KEY_MUTATION_LOCK_SQL, [
        BILLING_KEY_MUTATION_LOCK_PREFIX,
        `${schema}:${customerKey}`,
      ]);
      const value = await operation(session);
      await session.query('COMMIT');
      transactionOpen = false;
      return value;
    } catch (cause) {
      if (transactionOpen) {
        try {
          await session.query('ROLLBACK');
        } catch {
          // 원래 실패 원인이 더 유용하고, fromPgPool은 이 throw를 받아 커넥션을 폐기한다.
        }
      }
      throw cause;
    }
  });
}

interface LockedBillingKeyMutationOptions {
  readonly session: SqlExecutor;
  readonly customerKey: BillingKeyRecord['customerKey'];
  readonly sensitiveValueProtector: PgSensitiveStoreOptions['sensitiveValueProtector'];
  readonly upsertSql: string;
  readonly selectSql: string;
  readonly selectForUpdateSql: string;
  readonly conditionalDeleteSql: string;
  readonly conditionalReplaceSql: string;
}

/**
 * 하나의 `withMutationLock` callback에 귀속되는 store view.
 *
 * 모든 read-modify-write는 이미 잡힌 advisory lock과 같은 transaction session을 사용한다.
 * public store를 다시 호출하지 않아 nested connection/advisory-lock deadlock을 만들지 않는다.
 */
function createLockedBillingKeyMutation(
  options: LockedBillingKeyMutationOptions,
): PgBillingKeyMutation {
  const {
    session,
    customerKey,
    sensitiveValueProtector,
    upsertSql,
    selectSql,
    selectForUpdateSql,
    conditionalDeleteSql,
    conditionalReplaceSql,
  } = options;

  const loadForUpdate = async (): Promise<LockedBillingKeySnapshot | null> => {
    const selected = await session.query(selectForUpdateSql, [customerKey]);
    const row = selected.rows[0];
    if (row === undefined) return null;
    return {
      record: await unprotectBillingKeyRecord(row['billing_key'], customerKey, sensitiveValueProtector),
      operationFingerprint: readOperationFingerprint(row['operation_fingerprint']),
    };
  };

  const replaceIfBillingKeyMatches: PgBillingKeyMutation['replaceIfBillingKeyMatches'] = async (
    expectedBillingKey,
    replacement,
  ) => {
    if (typeof expectedBillingKey !== 'string') return false;
    const replacementRecord = replacement === null ? null : recordFromReplacement(replacement);
    if (replacementRecord !== null) {
      assertRecordCustomerKey(replacementRecord, customerKey, 'replacement');
    }
    const replacementFingerprint =
      replacement === null ? null : operationFingerprintFromReplacement(replacement);

    const current = await loadForUpdate();
    if (
      current === null ||
      !billingKeysEqualConstantTime(current.record.billingKey, expectedBillingKey)
    ) {
      return false;
    }

    if (replacementRecord === null) {
      const deleted = await session.query(conditionalDeleteSql, [customerKey]);
      return deleted.rows.length === 1;
    }

    const protectedReplacement = await protectBillingKeyRecord(
      replacementRecord,
      sensitiveValueProtector,
    );
    const replaced = await session.query(conditionalReplaceSql, [
      customerKey,
      protectedReplacement,
      replacementRecord.method,
      replacementRecord.issuedAt,
      null,
      null,
      replacementFingerprint,
    ]);
    return replaced.rows.length === 1;
  };

  return {
    customerKey,

    async find() {
      const selected = await session.query(selectSql, [customerKey]);
      const row = selected.rows[0];
      return row === undefined
        ? null
        : unprotectBillingKeyRecord(row['billing_key'], customerKey, sensitiveValueProtector);
    },

    async save(record, saveOptions) {
      assertRecordCustomerKey(record, customerKey, 'record');
      await saveBillingKeyRecord(session, upsertSql, sensitiveValueProtector, record, saveOptions);
    },

    async delete(expectedBillingKey) {
      return replaceIfBillingKeyMatches(expectedBillingKey, null);
    },

    async replaceAndGetPrevious(record, saveOptions) {
      assertRecordCustomerKey(record, customerKey, 'record');
      const previous = await loadForUpdate();
      await saveBillingKeyRecord(session, upsertSql, sensitiveValueProtector, record, saveOptions);
      return previous === null ? null : snapshotFromLoaded(previous);
    },

    async isCurrentOperationId(operationId) {
      if (typeof operationId !== 'string') return false;
      const current = await loadForUpdate();
      if (current === null || current.operationFingerprint === null) return false;
      return operationFingerprintsEqual(
        current.operationFingerprint,
        fingerprintOperationId(operationId),
      );
    },

    async deleteIfBillingKeyMatches(expectedBillingKey) {
      return replaceIfBillingKeyMatches(expectedBillingKey, null);
    },

    replaceIfBillingKeyMatches,
  };
}

async function saveBillingKeyRecord(
  sql: SqlExecutor,
  upsertSql: string,
  sensitiveValueProtector: PgSensitiveStoreOptions['sensitiveValueProtector'],
  record: BillingKeyRecord,
  options?: BillingKeySaveOptions,
): Promise<void> {
  const protectedRecord = await protectBillingKeyRecord(record, sensitiveValueProtector);
  await sql.query(upsertSql, [
    record.customerKey,
    protectedRecord,
    record.method,
    record.issuedAt,
    // BillingKeyRecord 전체가 $2의 보호된 payload에 들어 있다. 기존 0001 컬럼은
    // nullable이므로 card/transfers에는 어떤 평문 메타데이터도 남기지 않는다.
    null,
    null,
    fingerprintOperationId(options?.operationId),
  ]);
}
