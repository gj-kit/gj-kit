/**
 * DepositSecretStore PostgreSQL 구현 (설계 §3.2).
 *
 * 코어 계약의 핵심 불변식:
 * - `saveSecret`은 **upsert 시맨틱 계약**이다(코어 TSDoc) — 기존 수동 저장과 병용해도
 *   이중 저장이 무해해야 한다.
 * - 한 객체가 confirm측 자동 저장 + 웹훅측 getSecret 대조 양쪽에 배선된다 — 저장 누락
 *   → DEPOSIT_CALLBACK 전부 unknown-order 거부가 되는 사고를 구조로 막는 §3.1 seam.
 * - ⚠ secret 값은 어떤 에러 메시지·로그에도 싣지 않는다.
 */
import type { DepositSecretStore } from '@gj-kit/toss-payments/server';

import { TossPostgresError } from '../errors';
import { schemaRef } from '../identifiers';
import type { SqlExecutor } from '../sql';
import type { PgStoreOptions } from './orders';

export function createPgDepositSecretStore(
  sql: SqlExecutor,
  options?: PgStoreOptions,
): DepositSecretStore {
  const qs = schemaRef(options?.schema);

  const upsertSql = `INSERT INTO ${qs}.deposit_secrets (order_id, secret)
VALUES ($1, $2)
ON CONFLICT (order_id) DO UPDATE
  SET secret = excluded.secret, updated_at = now()`;

  const selectSql = `SELECT secret FROM ${qs}.deposit_secrets WHERE order_id = $1`;

  return {
    async saveSecret(orderId, secret) {
      await sql.query(upsertSql, [orderId, secret]);
    },
    async getSecret(orderId) {
      const result = await sql.query(selectSql, [orderId]);
      const row = result.rows[0];
      if (row === undefined) return null;
      const secret = row['secret'];
      if (typeof secret !== 'string') {
        // secret 값 자체는 절대 메시지에 싣지 않는다 — 형태 위반 사실만 보고.
        throw new TossPostgresError(
          'invalid-row',
          `deposit_secrets.secret 컬럼이 문자열이 아닙니다(orderId: ${orderId}).`,
        );
      }
      return secret;
    },
  };
}
