/**
 * AuditSink PostgreSQL 구현 (설계 §3.6).
 *
 * 코어 계약의 핵심 불변식(core/audit.ts TSDoc):
 * - `record()`는 코어가 **await하지 않는다**(fire-and-forget) — audit 오류가 결제
 *   경로의 지연·실패에 영향을 주지 않는다. insert 실패는 코어
 *   `AuditOptions.onSinkError`로만 통지되므로 여기서 추가 통지 채널을 만들지 않는다.
 * - 동일 id 재호출은 `ON CONFLICT (id) DO NOTHING`으로 멱등 — id는 crypto.randomUUID,
 *   시도 1건 = 엔트리 1건.
 * - entry는 코어 redaction 통과본이다(Authorization은 구조적 부재) — 이 스토어는
 *   내용을 다시 만지지 않고 통짜 jsonb로 보존한다.
 * - createFileAuditSink의 다중 프로세스 한계를 대체하는 것이 존재 이유 — 다중 인스턴스
 *   동시 insert에 안전하다(PK 충돌만 무시).
 *
 * v1은 즉시 INSERT(배치 없음) — 코어가 비동기 fire-and-forget이라 결제 경로 지연이
 * 없고, in-flight Set + `flush()`로 graceful shutdown 시 유실을 막는다.
 */
import type { AuditEntry, AuditSink } from '@gj-kit/toss-payments';

import { schemaRef } from '../identifiers';
import type { SqlExecutor } from '../sql';
import { serializeJsonb } from './jsonb';
import type { PgStoreOptions } from './orders';

/** flush 가능한 AuditSink — graceful shutdown 훅(예: Nest onApplicationShutdown). */
export interface PgAuditSink extends AuditSink {
  /**
   * 코어 계약(`void | Promise<void>`)의 반환을 `Promise<void>`로 협착 선언한다 —
   * 이 구현은 항상 Promise를 반환하므로(즉시 INSERT), 소비자가 flush/셧다운 코드에서
   * `.catch()`를 바로 걸 수 있게 한다. 반환 공변이라 `AuditSink` 대입성은 유지된다.
   */
  record(entry: AuditEntry): Promise<void>;
  /** 호출 시점까지 시작된(및 flush 중 새로 시작된) 모든 insert의 정착을 기다린다. 실패는 삼킨다. */
  flush(): Promise<void>;
}

export function createPgAuditSink(sql: SqlExecutor, options?: PgStoreOptions): PgAuditSink {
  const qs = schemaRef(options?.schema);

  const insertSql = `INSERT INTO ${qs}.audit_entries
  (id, at, env, method, path, attempt, idempotency_key, trace_id, duration_ms, outcome_kind, entry)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
ON CONFLICT (id) DO NOTHING`;

  // in-flight insert 추적 — 코어가 await하지 않는 record의 Promise를 flush가 회수한다.
  const inFlight = new Set<Promise<void>>();

  return {
    record(entry) {
      const insert = sql
        .query(insertSql, [
          entry.id,
          entry.at,
          entry.env,
          entry.method,
          entry.path,
          entry.attempt,
          entry.idempotencyKey,
          entry.traceId,
          entry.durationMs,
          entry.outcome.kind,
          // requestBody에는 소비자 입력(orderName 등)이 들어온다 — jsonb가 거부하는
          // U+0000·비페어 서로게이트를 정화해 감사 엔트리 유실을 막는다(redaction은 코어 소관).
          serializeJsonb(entry),
        ])
        .then(() => undefined);
      const tracked: Promise<void> = insert.finally(() => {
        inFlight.delete(tracked);
      });
      inFlight.add(tracked);
      // rejection은 반환 Promise로 전파된다 — 코어가 삼키고 onSinkError로 통지(계약).
      return tracked;
    },

    async flush() {
      // flush 도중 record가 추가될 수 있어 빌 때까지 반복한다. allSettled라 insert
      // 실패는 flush를 실패시키지 않는다(실패 통지는 onSinkError 경로가 이미 담당).
      while (inFlight.size > 0) {
        await Promise.allSettled([...inFlight]);
      }
    },
  };
}
