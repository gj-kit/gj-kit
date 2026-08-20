/**
 * §3.5 webhook_dedupe — 단일 문 원자 전이.
 *
 * 코어 verifier 계약: claim은 원자적이어야 하고(조회 후 생성 2단계 = TOCTOU 금지),
 * outcome 미확정 극단 레이스에서는 'processing'을 반환해 어댑터가 503 → 토스 재전송으로
 * 흐르게 한다(fail-closed). 원자성 자체는 integration 소관 — 여기서는 SQL 형태·파라미터·
 * outcome 매핑을 고정한다.
 */
import { describe, expect, it } from 'vitest';

import { createPgWebhookDedupeStore } from '../../src/stores/webhook-dedupe';
import { createFakeSql, norm } from './helpers/fake-sql';

const KEY = 'evt-dedupe-0001';

describe('§3.5 claim — SQL 형태와 파라미터', () => {
  it('INSERT ... ON CONFLICT DO UPDATE + CTE 단일 문으로 전이한다', async () => {
    const fake = createFakeSql();
    const store = createPgWebhookDedupeStore(fake);

    await store.claim(KEY);

    expect(fake.calls).toHaveLength(1); // 단일 문 — 2단계 조회/생성이 아니다
    const text = norm(fake.calls[0]?.text ?? '');
    expect(text).toContain('INSERT INTO "toss_payments".webhook_dedupe');
    expect(text).toContain('ON CONFLICT (dedupe_key) DO UPDATE');
    // crash-recovery: lease 만료된 processing만 재점유한다
    expect(text).toContain("WHERE webhook_dedupe.state = 'processing'");
    expect(text).toContain('webhook_dedupe.lease_expires_at <= now()');
    expect(text).toContain("RETURNING 'claimed'::text AS outcome");
  });

  it('leaseSeconds 기본 60이 $2 파라미터로 전달된다', async () => {
    const fake = createFakeSql();
    const store = createPgWebhookDedupeStore(fake);

    await store.claim(KEY);

    expect(fake.calls[0]?.params).toEqual([KEY, 60]);
  });

  it('leaseSeconds 옵션이 파라미터로 전달된다', async () => {
    const fake = createFakeSql();
    const store = createPgWebhookDedupeStore(fake, { leaseSeconds: 5 });

    await store.claim(KEY);

    expect(fake.calls[0]?.params).toEqual([KEY, 5]);
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    '잘못된 leaseSeconds(%s)는 조립 시점에 TypeError로 거부한다',
    (leaseSeconds) => {
      const fake = createFakeSql();
      expect(() => createPgWebhookDedupeStore(fake, { leaseSeconds })).toThrow(TypeError);
      expect(fake.calls).toHaveLength(0);
    },
  );
});

describe('§3.5 claim — outcome 매핑', () => {
  it.each([
    ['claimed', 'claimed'],
    ['processing', 'processing'],
    ['completed', 'completed'],
  ] as const)("outcome '%s' → '%s'", async (outcome, expected) => {
    const fake = createFakeSql();
    fake.enqueueRows([{ outcome }]);
    const store = createPgWebhookDedupeStore(fake);

    await expect(store.claim(KEY)).resolves.toBe(expected);
  });

  it.each([
    ['outcome null(극단 레이스: 사이에 행 삭제)', [{ outcome: null }]],
    ['rows 자체가 빈 경우', []],
    ['예기치 못한 outcome 값', [{ outcome: 'garbage' }]],
  ])("%s → 보수적으로 'processing'(fail-closed)", async (_label, rows) => {
    const fake = createFakeSql();
    fake.enqueueRows(rows);
    const store = createPgWebhookDedupeStore(fake);

    await expect(store.claim(KEY)).resolves.toBe('processing');
  });
});

describe('§3.5 complete / release', () => {
  it('complete: completed 전이 + completed_at 기록 + lease 해제', async () => {
    const fake = createFakeSql();
    const store = createPgWebhookDedupeStore(fake);

    await store.complete(KEY);

    const text = norm(fake.calls[0]?.text ?? '');
    expect(text).toBe(
      `UPDATE "toss_payments".webhook_dedupe SET state = 'completed', completed_at = now(), lease_expires_at = NULL WHERE dedupe_key = $1`,
    );
    expect(fake.calls[0]?.params).toEqual([KEY]);
  });

  it('release: processing 행만 지운다 — completed는 절대 지우지 않는다', async () => {
    const fake = createFakeSql();
    const store = createPgWebhookDedupeStore(fake);

    await store.release(KEY);

    const text = norm(fake.calls[0]?.text ?? '');
    expect(text).toBe(
      `DELETE FROM "toss_payments".webhook_dedupe WHERE dedupe_key = $1 AND state = 'processing'`,
    );
    expect(fake.calls[0]?.params).toEqual([KEY]);
  });
});
