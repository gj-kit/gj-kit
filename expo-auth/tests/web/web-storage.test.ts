// storage.web.ts — jsdom 실스토리지 시나리오 (설계 문서 §5.2 웹 단락 · §3.8 · H11 대체 구조).

import { beforeEach, describe, expect, it } from 'vitest';

import { createAuthSession } from '../../src/core/session';
import { createTokenStorage } from '../../src/storage.web';
import { createWebLocksRefreshLock } from '../../src/storage/webLock';
import { createManualClock } from '../../src/testing/clock';
import { createFakeRefreshLock } from '../../src/testing/lock';
import { createScriptedRefreshRequest } from '../../src/testing/refresh';

const PREFIX = 'testapp.auth';
const ACCESS_KEY = `${PREFIX}.accessToken`;
const REFRESH_KEY = `${PREFIX}.refreshToken`;
const PAIR_1 = { accessToken: 'access-1', refreshToken: 'refresh-1' };
const PAIR_2 = { accessToken: 'access-2', refreshToken: 'refresh-2' };

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

describe('createTokenStorage (웹 분기) — 배치와 모드 파생', () => {
  it("'durable' → localStorage 두 키, sessionStorage 비움", async () => {
    const storage = createTokenStorage({ keyPrefix: PREFIX });
    await storage.setTokens(PAIR_1, { persistence: 'durable' });
    expect(localStorage.getItem(ACCESS_KEY)).toBe('access-1');
    expect(localStorage.getItem(REFRESH_KEY)).toBe('refresh-1');
    expect(sessionStorage.getItem(ACCESS_KEY)).toBeNull();
    expect(await storage.getTokens()).toEqual(PAIR_1);
  });

  it("'session' → sessionStorage에만, durable 잔재 제거", async () => {
    const storage = createTokenStorage({ keyPrefix: PREFIX });
    await storage.setTokens(PAIR_1, { persistence: 'durable' });
    await storage.setTokens(PAIR_2, { persistence: 'session' });
    expect(sessionStorage.getItem(ACCESS_KEY)).toBe('access-2');
    expect(localStorage.getItem(ACCESS_KEY)).toBeNull();
    expect(await storage.getTokens()).toEqual(PAIR_2);
  });

  it('H14: session 저장 → 옵션 없는 setTokens → sessionStorage에만 존재 (durable 승격 없음)', async () => {
    const storage = createTokenStorage({ keyPrefix: PREFIX });
    await storage.setTokens(PAIR_1, { persistence: 'session' });
    await storage.setTokens(PAIR_2); // 내부 회전 — 모드 스티키
    expect(sessionStorage.getItem(ACCESS_KEY)).toBe('access-2');
    expect(localStorage.getItem(ACCESS_KEY)).toBeNull();
  });

  it('H14: 모드는 토큰의 실제 위치에서 파생된다 — 새 팩토리 인스턴스에서도 스티키', async () => {
    const first = createTokenStorage({ keyPrefix: PREFIX });
    await first.setTokens(PAIR_1, { persistence: 'session' });
    // 인메모리 상태가 없는 새 인스턴스(페이지 리로드 시뮬레이션)에서도 모드가 유지된다.
    const second = createTokenStorage({ keyPrefix: PREFIX });
    await second.setTokens(PAIR_2);
    expect(sessionStorage.getItem(ACCESS_KEY)).toBe('access-2');
    expect(localStorage.getItem(ACCESS_KEY)).toBeNull();
  });

  it('getTokens는 sessionStorage 우선 — 세션 로그인 탭이 durable 잔재를 줍지 않는다', async () => {
    localStorage.setItem(ACCESS_KEY, 'stale-access');
    localStorage.setItem(REFRESH_KEY, 'stale-refresh');
    sessionStorage.setItem(ACCESS_KEY, 'access-1');
    sessionStorage.setItem(REFRESH_KEY, 'refresh-1');
    const storage = createTokenStorage({ keyPrefix: PREFIX });
    expect(await storage.getTokens()).toEqual(PAIR_1);
  });

  it('clearTokens는 멱등이고 모드를 기본값으로 리셋한다', async () => {
    const storage = createTokenStorage({ keyPrefix: PREFIX });
    await storage.setTokens(PAIR_1, { persistence: 'session' });
    await storage.clearTokens();
    await storage.clearTokens();
    expect(await storage.getTokens()).toBeNull();
    await storage.setTokens(PAIR_2); // 모드 리셋 후의 생략 = defaultPersistence('durable')
    expect(localStorage.getItem(ACCESS_KEY)).toBe('access-2');
  });
});

describe('read-through — 캐시 없음 (§3.8 — 구판 H11의 구조 대체)', () => {
  it('storage 이벤트 전달 없는 외부 쓰기가 다음 getTokens에 즉시 보인다', async () => {
    const storage = createTokenStorage({ keyPrefix: PREFIX });
    await storage.setTokens(PAIR_1, { persistence: 'durable' });
    expect(await storage.getTokens()).toEqual(PAIR_1);
    // 다른 탭의 회전 — jsdom 동일 창에서는 storage 이벤트가 아예 발화하지 않는다.
    // 이벤트 없이도 보인다는 것이 read-through의 증명이다.
    localStorage.setItem(ACCESS_KEY, 'access-2');
    localStorage.setItem(REFRESH_KEY, 'refresh-2');
    expect(await storage.getTokens()).toEqual(PAIR_2);
  });

  it('localStorage.clear() → 다음 getTokens null (구판의 event.key===null 누락 버그 상속 차단)', async () => {
    const storage = createTokenStorage({ keyPrefix: PREFIX });
    await storage.setTokens(PAIR_1, { persistence: 'durable' });
    localStorage.clear();
    expect(await storage.getTokens()).toBeNull();
  });

  it('H12: 한 키 삭제(반쪽 상태) → null 수렴', async () => {
    const storage = createTokenStorage({ keyPrefix: PREFIX });
    await storage.setTokens(PAIR_1, { persistence: 'durable' });
    localStorage.removeItem(REFRESH_KEY);
    expect(await storage.getTokens()).toBeNull();
  });
});

describe('H2b — 이벤트 태스크 순서 무의존 (웹 세션 + FakeRefreshLock 조합, §5.2)', () => {
  it('잠금 grant 전에 이벤트가 오지 않아도(전달 자체가 없어도) 재읽기가 adopted를 반환한다', async () => {
    const storage = createTokenStorage({ keyPrefix: PREFIX });
    await storage.setTokens(PAIR_1, { persistence: 'durable' });
    const lock = createFakeRefreshLock();
    const scripted = createScriptedRefreshRequest([]);
    const clock = createManualClock();
    const session = createAuthSession({ storage, refresh: scripted.request, lock, clock });

    lock.hold();
    const pending = session.refresh();
    await clock.advance(0); // 진입 스냅샷 read 완료 + acquire 게이트 도달
    // 다른 탭의 회전 — storage 이벤트는 전달되지 않는다(잠금 grant 뒤로 무한 지연과 등가).
    localStorage.setItem(ACCESS_KEY, 'access-2');
    localStorage.setItem(REFRESH_KEY, 'refresh-2');
    lock.releaseNext();

    expect(await pending).toEqual({ status: 'adopted', tokens: PAIR_2 });
    expect(scripted.calls.length).toBe(0); // 회전을 소비하지 않았다
    session.dispose();
  });
});

describe('createWebLocksRefreshLock — jsdom', () => {
  it('navigator.locks가 없으면 직행 폴백으로 실행한다 (H5 폴백)', async () => {
    // jsdom은 Web Locks API를 구현하지 않는다 — 폴백 경로가 web에서도 유효함을 확인한다.
    const lock = createWebLocksRefreshLock({ name: PREFIX });
    expect(await lock.acquire(async () => 'ran')).toBe('ran');
  });
});
