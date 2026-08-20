/**
 * WebhookDedupeStore PostgreSQL 구현 (설계 §3.5).
 *
 * 코어 계약의 핵심 불변식(verifier.ts TSDoc):
 * - **claim은 원자적이어야 한다** — 조회 후 생성하는 2단계 구현은 TOCTOU 레이스라
 *   금지. 그래서 INSERT ... ON CONFLICT DO UPDATE + CTE **단일 문**으로 전이한다.
 * - processing 레코드는 lease 만료 후 재점유 가능해야 한다(crash-recovery).
 * - completed에는 토스의 최장 재전송 기간보다 긴 TTL(권장 5일)을 적용한다 —
 *   TTL 삭제는 cleanup()(팩토리) 소관이며 이 스토어는 지우지 않는다.
 * - `complete`는 비즈니스 핸들러의 내구적 처리 완료 후에만, `release`는 처리 실패 시
 *   재전송 재점유를 위해 호출된다 — release는 completed 행을 절대 지우지 않는다.
 * - ⚠ 알려진 계약 한계: 코어 `release(dedupeKey)`에는 소유 토큰(fencing token)이
 *   없다 — lease 만료 후 다른 워커가 재점유한 뒤에 도착한 원래 워커의 늦은 release가
 *   새 claim의 processing 행을 지울 수 있는 창이 이론상 존재한다(이후 재전송이
 *   'claimed'를 받아 동시 처리 창이 열림). 스토어 구현만으로는 어느 워커의 release인지
 *   판별할 수 없어 이 계층에서 완전 차단이 불가능하다(코어 계약 보완 후보). 실전
 *   완화책은 `dedupe.leaseSeconds`(기본 60)를 핸들러 최대 처리 시간보다 길게 잡는 것.
 */
import type { WebhookClaimState, WebhookDedupeStore } from '@gj-kit/toss-payments/webhook';

import { schemaRef } from '../identifiers';
import type { SqlExecutor } from '../sql';
import type { PgStoreOptions } from './orders';

export interface PgWebhookDedupeStoreOptions extends PgStoreOptions {
  /** processing 행의 crash-recovery lease(초). 기본 60. */
  readonly leaseSeconds?: number;
}

const DEFAULT_LEASE_SECONDS = 60;

export function createPgWebhookDedupeStore(
  sql: SqlExecutor,
  options?: PgWebhookDedupeStoreOptions,
): WebhookDedupeStore {
  const qs = schemaRef(options?.schema);
  const leaseSeconds = options?.leaseSeconds ?? DEFAULT_LEASE_SECONDS;
  if (!Number.isFinite(leaseSeconds) || leaseSeconds <= 0) {
    throw new TypeError(
      '[@gj-kit/toss-payments-postgresql] dedupe.leaseSeconds는 양의 유한 숫자여야 합니다.',
    );
  }

  // 단일 문 원자 전이: 신규 insert 또는 lease 만료 processing 재점유 → 'claimed',
  // 아니면 기존 행의 상태를 그대로 보고. ON CONFLICT DO UPDATE의 WHERE가 거짓이면
  // attempt CTE는 빈 결과가 되고, coalesce 두 번째 가지가 기존 상태를 읽는다.
  const claimSql = `WITH attempt AS (
  INSERT INTO ${qs}.webhook_dedupe (dedupe_key, state, lease_expires_at)
  VALUES ($1, 'processing', now() + make_interval(secs => $2))
  ON CONFLICT (dedupe_key) DO UPDATE
    SET state = 'processing', lease_expires_at = now() + make_interval(secs => $2)
    WHERE webhook_dedupe.state = 'processing'
      AND webhook_dedupe.lease_expires_at <= now()
  RETURNING 'claimed'::text AS outcome
)
SELECT coalesce(
  (SELECT outcome FROM attempt),
  (SELECT CASE WHEN state = 'completed' THEN 'completed' ELSE 'processing' END
     FROM ${qs}.webhook_dedupe WHERE dedupe_key = $1)
) AS outcome`;

  const completeSql = `UPDATE ${qs}.webhook_dedupe
SET state = 'completed', completed_at = now(), lease_expires_at = NULL
WHERE dedupe_key = $1`;

  const releaseSql = `DELETE FROM ${qs}.webhook_dedupe
WHERE dedupe_key = $1 AND state = 'processing'`;

  return {
    async claim(dedupeKey) {
      const result = await sql.query(claimSql, [dedupeKey, leaseSeconds]);
      const outcome = result.rows[0]?.['outcome'];
      return mapOutcome(outcome);
    },
    async complete(dedupeKey) {
      await sql.query(completeSql, [dedupeKey]);
    },
    async release(dedupeKey) {
      await sql.query(releaseSql, [dedupeKey]);
    },
  };
}

/**
 * outcome이 null이거나 예기치 못한 값이면 보수적으로 'processing'을 반환한다 —
 * 극단 레이스(동시 커밋이 스냅샷에 안 보임 등)에서 어댑터가 503을 내고 토스가
 * 재전송하게 하는 fail-closed 선택이다. 중복 처리(잘못된 'claimed')보다 재전송
 * 1회가 싸다.
 */
function mapOutcome(outcome: unknown): WebhookClaimState {
  if (outcome === 'claimed') return 'claimed';
  if (outcome === 'completed') return 'completed';
  return 'processing';
}
