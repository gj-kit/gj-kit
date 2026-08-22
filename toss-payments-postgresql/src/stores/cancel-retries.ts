/**
 * CancelRetryStore PostgreSQL 구현 (설계 §3.4).
 *
 * 코어 계약의 핵심 불변식:
 * - `CancelRetryRecord.bodyJson`은 **멱등 재생의 바이트 계약**이다 — 재시도 시 동일
 *   멱등키 + 동일 바이트를 다시 보내야 한다. 그래서 record_json 컬럼은 jsonb가 아니라
 *   **text**다: JSON.stringify한 record 전체를 보호한 뒤 text로 저장하고 JSON.parse
 *   왕복해 문자열 필드를 무손실 복원한다. jsonb 정규화(NUL 거부, 이스케이프/키 정렬
 *   변형)는 원문을 바꿀 위험이 있어 사용하지 않는다.
 * - 멱등키 15일 TTL — 삭제는 cleanup()(팩토리) 소관이며 이 스토어는 지우지 않는다.
 * - ⚠ record에는 환불 계좌 정보가 평문으로 들어올 수 있다. 레코드 전체를 보호기에
 *   넘긴 뒤 저장하며, 어떤 에러 메시지에도 record 내용을 싣지 않는다.
 */
import type { CancelRetryRecord, CancelRetryStore } from '@gj-kit/toss-payments/server';

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

export function createPgCancelRetryStore(
  sql: SqlExecutor,
  options: PgSensitiveStoreOptions,
): CancelRetryStore {
  const qs = schemaRef(options.schema);
  const sensitiveValueProtector = requireSensitiveValueProtector(options.sensitiveValueProtector);

  // 재저장(동일 ticketId)은 record만 교체하고 recorded_at은 유지한다 —
  // TTL(15일) 기준점이 재시도 때마다 미끄러지지 않게 최초 저장 시각에 고정.
  const upsertSql = `INSERT INTO ${qs}.cancel_retries (ticket_id, record_json)
VALUES ($1, $2)
ON CONFLICT (ticket_id) DO UPDATE
  SET record_json = excluded.record_json`;

  const selectSql = `SELECT record_json FROM ${qs}.cancel_retries WHERE ticket_id = $1`;

  const deleteSql = `DELETE FROM ${qs}.cancel_retries WHERE ticket_id = $1`;

  return {
    async save(record) {
      const protectedRecord = requireProtectedString(
        await sensitiveValueProtector.encrypt(
          JSON.stringify(record),
          createSensitiveValueContext(SENSITIVE_VALUE_PURPOSE.cancelRetryRecord, record.ticketId),
        ),
        'encrypt',
      );
      await sql.query(upsertSql, [record.ticketId, protectedRecord]);
    },

    async load(ticketId) {
      const result = await sql.query(selectSql, [ticketId]);
      const row = result.rows[0];
      if (row === undefined) return null;
      const protectedRecord = row['record_json'];
      if (typeof protectedRecord !== 'string') {
        throw new TossPostgresError(
          'invalid-row',
          `cancel_retries.record_json 컬럼이 문자열이 아닙니다(ticketId: ${ticketId}).`,
        );
      }
      const json = requireProtectedString(
        await sensitiveValueProtector.decrypt(
          protectedRecord,
          createSensitiveValueContext(SENSITIVE_VALUE_PURPOSE.cancelRetryRecord, ticketId),
        ),
        'decrypt',
      );
      let parsed: unknown;
      try {
        parsed = JSON.parse(json);
      } catch {
        // 복호화 평문에는 환불 계좌가 있을 수 있다. JSON parser cause가 런타임에 따라
        // 입력 일부를 포함할 수 있어 의도적으로 cause 체인에 보존하지 않는다.
        throw new TossPostgresError(
          'invalid-row',
          `cancel_retries.record_json JSON 파싱에 실패했습니다(ticketId: ${ticketId}).`,
        );
      }
      if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new TossPostgresError(
          'invalid-row',
          `cancel_retries.record_json이 CancelRetryRecord 형태가 아닙니다(ticketId: ${ticketId}).`,
        );
      }
      // 저장 시 이 스토어가 JSON.stringify한 CancelRetryRecord의 왕복 — 필드 재검증은
      // 코어(restoreSealedRecord)가 수행하므로 여기서는 형태만 확인하고 그대로 반환한다.
      return parsed as CancelRetryRecord;
    },

    async delete(ticketId) {
      await sql.query(deleteSql, [ticketId]);
    },
  };
}
