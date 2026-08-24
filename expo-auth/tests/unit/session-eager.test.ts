// refreshIfExpiringSoon — 포그라운드 복귀 eager 갱신 (H9, 설계 문서 §3.5 · §5.2).

import { describe, expect, it } from 'vitest';

import { createAuthSession } from '../../src/core/session';
import { createManualClock } from '../../src/testing/clock';
import { createMemoryTokenStorage } from '../../src/testing/memoryStorage';
import { createScriptedRefreshRequest, createUnsignedTestJwt } from '../../src/testing/refresh';

const START_MS = 1_700_000_000_000;
const startSeconds = Math.floor(START_MS / 1000);

function setup(ttlSeconds: number | 'opaque') {
  const clock = createManualClock({ startMs: START_MS });
  const accessToken =
    ttlSeconds === 'opaque'
      ? 'opaque-access'
      : createUnsignedTestJwt({ exp: startSeconds + ttlSeconds });
  const storage = createMemoryTokenStorage({ tokens: { accessToken, refreshToken: 'refresh-1' } });
  const scripted = createScriptedRefreshRequest([
    {
      status: 'rotated',
      tokens: { accessToken: createUnsignedTestJwt({ exp: startSeconds + 900 }), refreshToken: 'refresh-2' },
    },
  ]);
  const session = createAuthSession({ storage, refresh: scripted.request, clock });
  return { session, scripted };
}

describe('refreshIfExpiringSoon (H9) — 임계 경계 ±1s (기본 120s)', () => {
  it('ttl 121s → not-needed, 콜백 0회', async () => {
    const { session, scripted } = setup(121);
    expect(await session.refreshIfExpiringSoon()).toEqual({ status: 'not-needed' });
    expect(scripted.calls.length).toBe(0);
    session.dispose();
  });

  it('ttl 120s(경계) → refresh 수행', async () => {
    const { session, scripted } = setup(120);
    const outcome = await session.refreshIfExpiringSoon();
    expect(outcome.status).toBe('refreshed');
    expect(scripted.calls.length).toBe(1);
    session.dispose();
  });

  it('ttl 119s → refresh 수행', async () => {
    const { session, scripted } = setup(119);
    expect((await session.refreshIfExpiringSoon()).status).toBe('refreshed');
    expect(scripted.calls.length).toBe(1);
    session.dispose();
  });

  it('thresholdSeconds 옵션이 경계를 옮긴다', async () => {
    const { session, scripted } = setup(500);
    expect(await session.refreshIfExpiringSoon({ thresholdSeconds: 499 })).toEqual({
      status: 'not-needed',
    });
    expect((await session.refreshIfExpiringSoon({ thresholdSeconds: 500 })).status).toBe(
      'refreshed'
    );
    expect(scripted.calls.length).toBe(1);
    session.dispose();
  });

  it('ttl 불명(비JWT + 전략 없음) → not-needed, refresh 0회 — 원본 동작 보존', async () => {
    const { session, scripted } = setup('opaque');
    expect(await session.refreshIfExpiringSoon()).toEqual({ status: 'not-needed' });
    expect(scripted.calls.length).toBe(0);
    session.dispose();
  });

  it('토큰 없음 → not-needed', async () => {
    const clock = createManualClock({ startMs: START_MS });
    const storage = createMemoryTokenStorage();
    const scripted = createScriptedRefreshRequest([]);
    const session = createAuthSession({ storage, refresh: scripted.request, clock });
    expect(await session.refreshIfExpiringSoon()).toEqual({ status: 'not-needed' });
    expect(scripted.calls.length).toBe(0);
    session.dispose();
  });
});
