// signIn 모드·dispose·getTokens/getAccessToken — §3.5 · §4.1-ⓑ · H14 조합.

import { describe, expect, it } from 'vitest';

import { isAuthError } from '../../src/core/errors';
import { createAuthSession } from '../../src/core/session';
import type { TokenPair } from '../../src/core/types';
import { createManualClock } from '../../src/testing/clock';
import { createMemoryTokenStorage } from '../../src/testing/memoryStorage';
import { createScriptedRefreshRequest } from '../../src/testing/refresh';

const PAIR_1: TokenPair = { accessToken: 'access-1', refreshToken: 'refresh-1' };
const PAIR_2: TokenPair = { accessToken: 'access-2', refreshToken: 'refresh-2' };

function setup() {
  const clock = createManualClock();
  const storage = createMemoryTokenStorage();
  const scripted = createScriptedRefreshRequest([{ status: 'rotated', tokens: PAIR_2 }]);
  const session = createAuthSession({ storage, refresh: scripted.request, clock });
  return { clock, storage, scripted, session };
}

describe('signIn/getTokens', () => {
  it('signIn은 persistence를 저장소에 그대로 전달하고 스케줄을 등록한다', async () => {
    const { clock, storage, session } = setup();
    await session.signIn(PAIR_1, { persistence: 'session' });
    expect(storage.persistence).toBe('session');
    expect(await session.getTokens()).toEqual(PAIR_1);
    expect(await session.getAccessToken()).toBe(PAIR_1.accessToken);
    expect(clock.pendingTimerCount).toBe(1);
    session.dispose();
  });

  it('세션 로그인 뒤 내부 회전은 모드-스티키다 (H14): 갱신이 durable로 승격시키지 않는다', async () => {
    const { storage, session } = setup();
    await session.signIn(PAIR_1, { persistence: 'session' });
    await session.refresh();
    expect(await storage.getTokens()).toEqual(PAIR_2);
    expect(storage.persistence).toBe('session');
    session.dispose();
  });
});

describe('dispose (§4.1-ⓑ)', () => {
  it('dispose 후 세션 메서드는 AuthError("session-disposed")', async () => {
    const { session } = setup();
    session.dispose();
    for (const call of [
      () => session.getTokens(),
      () => session.getAccessToken(),
      () => session.refresh(),
      () => session.refreshIfExpiringSoon(),
      () => session.signIn(PAIR_1, { persistence: 'durable' }),
      () => session.signOut(),
      () => session.scheduleRefresh(),
      () =>
        session.runAuthorized(async () => 1, { shouldRetryAfterRefresh: () => false }),
    ]) {
      let thrown: unknown = null;
      try {
        await call();
      } catch (error) {
        thrown = error;
      }
      expect(isAuthError(thrown)).toBe(true);
      if (isAuthError(thrown)) expect(thrown.code).toBe('session-disposed');
    }
    expect(() => session.cancelScheduledRefresh()).toThrowError();
  });

  it('dispose 후 refresh()는 동기 throw가 아니라 reject한다 — Promise 반환 메서드의 실패 채널 통일', async () => {
    const { session } = setup();
    session.dispose();
    // `session.refresh().catch(handleAuthError)` 패턴이 dispose 경합에서도 안전해야 한다:
    // 동기 throw는 .catch를 지나쳐 터진다.
    let syncThrew = false;
    let pending: Promise<unknown> | null = null;
    try {
      pending = session.refresh();
    } catch {
      syncThrew = true;
    }
    expect(syncThrew).toBe(false);
    let rejected: unknown = null;
    await (pending as Promise<unknown>).catch((error: unknown) => {
      rejected = error;
    });
    expect(isAuthError(rejected)).toBe(true);
    if (isAuthError(rejected)) expect(rejected.code).toBe('session-disposed');
  });

  it('dispose는 멱등이고 대기 중 타이머를 해제한다', async () => {
    const { clock, session } = setup();
    await session.signIn(PAIR_1, { persistence: 'durable' });
    expect(clock.pendingTimerCount).toBe(1);
    session.dispose();
    expect(clock.pendingTimerCount).toBe(0);
    session.dispose(); // no throw
  });
});
