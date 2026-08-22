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
import type { BillingKeyRecord, BillingKeyStore } from '@gj-kit/toss-payments/server';

import { TossPostgresError } from '../errors';
import { schemaRef } from '../identifiers';
import {
  SENSITIVE_VALUE_PURPOSE,
  createSensitiveValueContext,
  requireProtectedString,
  requireSensitiveValueProtector,
} from '../sensitive-values';
import type { PgSensitiveStoreOptions } from '../sensitive-values';
import type { SqlExecutor } from '../sql';

const METHODS: ReadonlySet<string> = new Set(['카드', '계좌이체']);

export function createPgBillingKeyStore(
  sql: SqlExecutor,
  options: PgSensitiveStoreOptions,
): BillingKeyStore {
  const qs = schemaRef(options.schema);
  const sensitiveValueProtector = requireSensitiveValueProtector(options.sensitiveValueProtector);

  const upsertSql = `INSERT INTO ${qs}.billing_keys (customer_key, billing_key, method, issued_at, card, transfers)
VALUES ($1, $2, $3, $4, $5, $6)
ON CONFLICT (customer_key) DO UPDATE
  SET billing_key = excluded.billing_key,
      method      = excluded.method,
      issued_at   = excluded.issued_at,
      card        = excluded.card,
      transfers   = excluded.transfers,
      updated_at  = now()`;

  const selectSql = `SELECT billing_key
FROM ${qs}.billing_keys
WHERE customer_key = $1`;

  const deleteSql = `DELETE FROM ${qs}.billing_keys WHERE customer_key = $1`;

  return {
    async save(record) {
      const protectedRecord = requireProtectedString(
        await sensitiveValueProtector.encrypt(
          JSON.stringify(record),
          createSensitiveValueContext(SENSITIVE_VALUE_PURPOSE.billingKey, record.customerKey),
        ),
        'encrypt',
      );
      await sql.query(upsertSql, [
        record.customerKey,
        protectedRecord,
        record.method,
        record.issuedAt,
        // BillingKeyRecord 전체가 $2의 보호된 payload에 들어 있다. 기존 0001 컬럼은
        // nullable이므로 card/transfers에는 어떤 평문 메타데이터도 남기지 않는다.
        null,
        null,
      ]);
    },

    async find(customerKey) {
      const result = await sql.query(selectSql, [customerKey]);
      const row = result.rows[0];
      if (row === undefined) return null;

      const protectedRecord = row['billing_key'];
      if (typeof protectedRecord !== 'string') {
        // 보안 불변식 — 메시지에 billingKey/customerKey 어느 쪽도 싣지 않는다.
        throw new TossPostgresError(
          'invalid-row',
          'billing_keys 행의 보호된 레코드가 문자열이 아닙니다.',
        );
      }
      const serialized = requireProtectedString(
        await sensitiveValueProtector.decrypt(
          protectedRecord,
          createSensitiveValueContext(SENSITIVE_VALUE_PURPOSE.billingKey, customerKey),
        ),
        'decrypt',
      );
      return parseBillingKeyRecord(serialized, customerKey);
    },

    async delete(customerKey) {
      await sql.query(deleteSql, [customerKey]);
    },
  };
}

/**
 * 보호된 payload 복원. 암호문이 다른 customerKey의 행으로 옮겨졌다면 제대로 AAD를 쓴
 * 보호기는 decrypt 단계에서 먼저 거부한다. 그 구현 실수를 방어하고 data corruption을
 * 조용히 전파하지 않기 위해 payload 안의 customerKey도 조회 키와 일치시킨다.
 */
function parseBillingKeyRecord(serialized: string, customerKey: string): BillingKeyRecord {
  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized);
  } catch {
    // 복호화 평문은 민감하다. JSON 파서 cause는 런타임에 따라 입력 일부를 포함할 수 있어
    // 의도적으로 cause 체인에 보존하지 않는다.
    throw new TossPostgresError(
      'invalid-row',
      'billing_keys 보호된 레코드의 JSON 파싱에 실패했습니다.',
    );
  }

  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new TossPostgresError('invalid-row', 'billing_keys 행이 BillingKeyRecord 계약 형태가 아닙니다.');
  }
  const record = parsed as Record<string, unknown>;
  const billingKey = record['billingKey'];
  const method = record['method'];
  const issuedAt = record['issuedAt'];
  const storedCustomerKey = record['customerKey'];
  const card = record['card'];
  const transfers = record['transfers'];
  if (
    typeof billingKey !== 'string' ||
    typeof method !== 'string' ||
    !METHODS.has(method) ||
    typeof issuedAt !== 'string' ||
    storedCustomerKey !== customerKey ||
    (card !== null && (typeof card !== 'object' || Array.isArray(card))) ||
    (transfers !== null && !Array.isArray(transfers))
  ) {
    throw new TossPostgresError('invalid-row', 'billing_keys 행이 BillingKeyRecord 계약 형태가 아닙니다.');
  }
  return {
    customerKey,
    billingKey,
    method: method as BillingKeyRecord['method'],
    issuedAt,
    card: card as BillingKeyRecord['card'],
    transfers: transfers as BillingKeyRecord['transfers'],
  };
}
