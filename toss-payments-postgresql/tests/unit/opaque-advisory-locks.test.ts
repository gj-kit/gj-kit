/**
 * opaque advisory lifecycle lock — app이 제공한 HMAC/blind-index를 원본 없이
 * PostgreSQL transaction advisory lock으로 범위 직렬화한다.
 */
import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  createOpaqueAdvisoryLockKey,
  createPgOpaqueAdvisoryLocks,
} from '../../src/opaque-advisory-locks';
import { createFakeSql, normTexts } from './helpers/fake-sql';

const LOCK_SQL = 'SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))';
const LOCK_NAMESPACE = '@gj-kit/toss-payments-postgresql:opaque-advisory-lock';

function fingerprint(value: string): string {
  return createHash('sha256')
    .update(LOCK_NAMESPACE, 'utf8')
    .update('\u0000', 'utf8')
    .update(value, 'utf8')
    .digest('hex');
}

describe('opaque advisory lifecycle lock', () => {
  it('same-connection BEGIN → advisory xact lock → callback → COMMIT으로 짧은 lifecycle을 직렬화한다', async () => {
    const fake = createFakeSql();
    const locks = createPgOpaqueAdvisoryLocks(fake, { schema: 'app_payments' });
    const opaqueBlindIndex = 'v1:customer-lifecycle:Kk8WS0_pP4aH2mK5KZ1nGg';
    let callsWhenCallbackStarted = -1;

    const result = await locks.withLock(createOpaqueAdvisoryLockKey(opaqueBlindIndex), async () => {
      callsWhenCallbackStarted = fake.calls.length;
      return { finalized: true };
    });

    expect(result).toEqual({ finalized: true });
    expect(callsWhenCallbackStarted).toBe(2);
    expect(fake.connections).toBe(1);
    expect(normTexts(fake)).toEqual(['BEGIN', LOCK_SQL, 'COMMIT']);
    expect(fake.calls.every((call) => call.via === 'session')).toBe(true);
    expect(fake.calls[1]?.params).toEqual([
      `${LOCK_NAMESPACE}:app_payments`,
      fingerprint(opaqueBlindIndex),
    ]);
    // HMAC/blind-index 원본은 DB query parameter와 SQL text에 남기지 않는다.
    expect(fake.calls[1]?.params).not.toContain(opaqueBlindIndex);
    expect(fake.calls.some((call) => call.text.includes(opaqueBlindIndex))).toBe(false);
  });

  it('callback failure에서는 같은 connection에서 ROLLBACK하고 원래 오류를 그대로 전달한다', async () => {
    const fake = createFakeSql();
    const locks = createPgOpaqueAdvisoryLocks(fake);
    const cause = new Error('host lifecycle failed');

    await expect(
      locks.withLock(createOpaqueAdvisoryLockKey('v1:subscription:blind-index'), async () => {
        throw cause;
      }),
    ).rejects.toBe(cause);

    expect(fake.connections).toBe(1);
    expect(normTexts(fake)).toEqual(['BEGIN', LOCK_SQL, 'ROLLBACK']);
    expect(fake.calls.every((call) => call.via === 'session')).toBe(true);
  });

  it('advisory lock acquisition 자체가 실패하면 callback 없이 ROLLBACK한다', async () => {
    const fake = createFakeSql();
    const locks = createPgOpaqueAdvisoryLocks(fake);
    const cause = new Error('database unavailable');
    // BEGIN은 성공하고 두 번째 쿼리(락 획득)가 실패한다.
    fake.enqueueRows([]);
    fake.enqueueError(cause);
    let callbackRan = false;

    await expect(
      locks.withLock(createOpaqueAdvisoryLockKey('v1:subscription:blind-index'), () => {
        callbackRan = true;
      }),
    ).rejects.toBe(cause);

    expect(callbackRan).toBe(false);
    expect(normTexts(fake)).toEqual(['BEGIN', LOCK_SQL, 'ROLLBACK']);
  });

  it.each([
    ['빈 문자열', ''],
    ['512 byte 초과', 'x'.repeat(513)],
    ['string이 아님', 42 as never],
  ])('raw identifier를 의도치 않게 감싸지 않도록 %s는 fail-fast로 거부한다', (_label, value) => {
    let thrown: unknown;
    try {
      createOpaqueAdvisoryLockKey(value);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(TypeError);
    // 빈 문자열은 모든 문자열에 포함되므로, 실제 전달값이 있는 case만 non-disclosure를 본다.
    if (String(value).length > 0) {
      expect(thrown instanceof Error ? thrown.message : '').not.toContain(String(value));
    }
  });
});
