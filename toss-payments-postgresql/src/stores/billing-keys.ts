/**
 * BillingKeyStore PostgreSQL 구현 (설계 §3.3).
 *
 * 코어 계약의 핵심 불변식:
 * - 토스에 빌링키 조회 API가 없다 — **저장 실패 = 복구 불가**. 이 테이블이 유일한
 *   보관 수단이므로 save는 드라이버 에러를 감추지 않고 그대로 던진다(코어가 감쌈).
 * - `save`는 upsert(customer_key)다 — issue/import 양쪽에서 호출되는 계약이고 코어가
 *   교체 정책을 규정하지 않으므로 최신 발급본을 유지한다.
 * - ⚠ 보안 불변식(코어 stores.ts): 어떤 에러 메시지에도 billing_key 값을 싣지 않고,
 *   customerKey와 billingKey를 같은 문자열(로그 한 줄)에 함께 두지 않는다 — 토스의
 *   빌링 보안 모델이 이 쌍의 분리에 의존한다. 이 파일의 메시지는 둘 다 싣지 않는다.
 */
import type { BillingKeyRecord, BillingKeyStore } from '@gj-kit/toss-payments/server';

import { TossPostgresError } from '../errors';
import { schemaRef } from '../identifiers';
import type { SqlExecutor } from '../sql';
import { serializeJsonb } from './jsonb';
import type { PgStoreOptions } from './orders';

const METHODS: ReadonlySet<string> = new Set(['카드', '계좌이체']);

export function createPgBillingKeyStore(
  sql: SqlExecutor,
  options?: PgStoreOptions,
): BillingKeyStore {
  const qs = schemaRef(options?.schema);

  const upsertSql = `INSERT INTO ${qs}.billing_keys (customer_key, billing_key, method, issued_at, card, transfers)
VALUES ($1, $2, $3, $4, $5, $6)
ON CONFLICT (customer_key) DO UPDATE
  SET billing_key = excluded.billing_key,
      method      = excluded.method,
      issued_at   = excluded.issued_at,
      card        = excluded.card,
      transfers   = excluded.transfers,
      updated_at  = now()`;

  const selectSql = `SELECT billing_key, method, issued_at, card, transfers
FROM ${qs}.billing_keys
WHERE customer_key = $1`;

  const deleteSql = `DELETE FROM ${qs}.billing_keys WHERE customer_key = $1`;

  return {
    async save(record) {
      await sql.query(upsertSql, [
        record.customerKey,
        record.billingKey,
        record.method,
        record.issuedAt,
        // jsonb 파라미터는 드라이버 중립을 위해 직접 직렬화한다(객체 자동 직렬화는 pg 전용 동작).
        // serializeJsonb: jsonb가 하드 거부하는 U+0000·비페어 서로게이트를 정화한다 —
        // 저장 실패 = 복구 불가(조회 API 없음)이므로 저장 가능성이 문자 보존보다 우선한다.
        record.card === null ? null : serializeJsonb(record.card),
        record.transfers === null ? null : serializeJsonb(record.transfers),
      ]);
    },

    async find(customerKey) {
      const result = await sql.query(selectSql, [customerKey]);
      const row = result.rows[0];
      if (row === undefined) return null;

      const billingKey = row['billing_key'];
      const method = row['method'];
      const issuedAt = row['issued_at'];
      if (
        typeof billingKey !== 'string' ||
        typeof method !== 'string' ||
        !METHODS.has(method) ||
        typeof issuedAt !== 'string'
      ) {
        // 보안 불변식 — 메시지에 billingKey/customerKey 어느 쪽도 싣지 않는다.
        throw new TossPostgresError(
          'invalid-row',
          'billing_keys 행이 BillingKeyRecord 계약 형태가 아닙니다.',
        );
      }
      return {
        customerKey,
        billingKey,
        method: method as BillingKeyRecord['method'],
        issuedAt,
        card: parseJsonColumn<BillingKeyRecord['card']>(row['card'], 'billing_keys.card'),
        transfers: parseJsonColumn<BillingKeyRecord['transfers']>(
          row['transfers'],
          'billing_keys.transfers',
        ),
      };
    },

    async delete(customerKey) {
      await sql.query(deleteSql, [customerKey]);
    },
  };
}

/**
 * jsonb 컬럼 복원 — pg는 파싱된 객체를, 커스텀 SqlClient는 JSON 문자열을 내려줄 수
 * 있어 양쪽을 수용한다. 저장 시 이 스토어가 직렬화한 값의 왕복이므로 구조 재검증은
 * 하지 않는다(코어 타입이 원본).
 */
function parseJsonColumn<T>(value: unknown, label: string): T | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as T;
    } catch (cause) {
      throw new TossPostgresError('invalid-row', `${label} 컬럼의 JSON 파싱에 실패했습니다.`, {
        cause,
      });
    }
  }
  if (typeof value === 'object') return value as T;
  throw new TossPostgresError('invalid-row', `${label} 컬럼이 JSON 형태가 아닙니다.`);
}
