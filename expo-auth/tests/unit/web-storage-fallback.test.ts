// 웹 분기(storage.web.ts)의 스토리지 부재(SSR·plain node) 메모리 후퇴 — §2.4 · §3.8.
// node 환경에는 localStorage/sessionStorage가 없다 — 이 프로젝트(unit)가 그 환경이다.
// (jsdom이 있는 실스토리지 시나리오는 tests/web의 web 프로젝트가 맡는다 — §5.2.)

import { describe, expect, it } from 'vitest';

import { isAuthError } from '../../src/core/errors';
import { createTokenStorage } from '../../src/storage.web';
import { createWebLocksRefreshLock } from '../../src/storage/webLock';

const PAIR_1 = { accessToken: 'access-1', refreshToken: 'refresh-1' };

describe('storage.web — SSR/노드 메모리 후퇴 (§2.4)', () => {
  it('스토리지 부재에서 throw 없이 set/get/clear가 동작한다', async () => {
    const storage = createTokenStorage({ keyPrefix: 'ssr.auth' });
    expect(await storage.getTokens()).toBeNull();
    await storage.setTokens(PAIR_1, { persistence: 'durable' });
    expect(await storage.getTokens()).toEqual(PAIR_1);
    await storage.clearTokens();
    expect(await storage.getTokens()).toBeNull();
  });

  it('메모리 후퇴는 팩토리 스코프다 — 인스턴스 2개는 서로를 보지 못한다', async () => {
    const a = createTokenStorage({ keyPrefix: 'ssr.auth' });
    const b = createTokenStorage({ keyPrefix: 'ssr.auth' });
    await a.setTokens(PAIR_1, { persistence: 'durable' });
    expect(await b.getTokens()).toBeNull();
  });

  it('빈·공백 keyPrefix → AuthError("invalid-key-prefix") (§4.1-ⓐ)', () => {
    for (const bad of ['', '   ', '\t\n']) {
      let thrown: unknown = null;
      try {
        createTokenStorage({ keyPrefix: bad });
      } catch (error) {
        thrown = error;
      }
      expect(isAuthError(thrown)).toBe(true);
      if (isAuthError(thrown)) expect(thrown.code).toBe('invalid-key-prefix');
    }
  });
});

describe('createWebLocksRefreshLock — 부재 폴백 (H5)', () => {
  it('navigator.locks 부재(node) → 직행 실행 폴백', async () => {
    const lock = createWebLocksRefreshLock({ name: 'ssr.auth' });
    expect(await lock.acquire(async () => 'ran')).toBe('ran');
  });

  it('빈 name → AuthError("invalid-key-prefix")', () => {
    let thrown: unknown = null;
    try {
      createWebLocksRefreshLock({ name: ' ' });
    } catch (error) {
      thrown = error;
    }
    expect(isAuthError(thrown)).toBe(true);
  });
});
