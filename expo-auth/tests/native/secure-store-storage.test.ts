// storage.ts (네이티브 분기) — SecureStore 구현 계약 (설계 문서 §3.8 · H10 · H12 · H14).
// expo-secure-store는 vitest alias로 secure-store.fake.ts에 대체돼 있다 (vitest.config.ts).

import { beforeEach, describe, expect, it } from 'vitest';

import { isAuthError } from '../../src/core/errors';
import { createTokenStorage } from '../../src/storage';
import { __getItemCallCount, __rawStore, __reset, __setReadGate } from './secure-store.fake';

const PREFIX = 'testapp.auth';
const ACCESS_KEY = `${PREFIX}.accessToken`;
const REFRESH_KEY = `${PREFIX}.refreshToken`;
const PAIR_1 = { accessToken: 'access-1', refreshToken: 'refresh-1' };
const PAIR_2 = { accessToken: 'access-2', refreshToken: 'refresh-2' };

beforeEach(() => {
  __reset();
});

describe('createTokenStorage (네이티브 분기) — durable', () => {
  it("'durable' 왕복: 두 SecureStore 키 (`{keyPrefix}.accessToken`/`{keyPrefix}.refreshToken`)", async () => {
    const storage = createTokenStorage({ keyPrefix: PREFIX });
    await storage.setTokens(PAIR_1, { persistence: 'durable' });
    expect(__rawStore().get(ACCESS_KEY)).toBe('access-1');
    expect(__rawStore().get(REFRESH_KEY)).toBe('refresh-1');
    // 재시작 시뮬레이션 — 새 팩토리 인스턴스가 SecureStore에서 복원한다.
    const restored = createTokenStorage({ keyPrefix: PREFIX });
    expect(await restored.getTokens()).toEqual(PAIR_1);
  });

  it('H10: 연속 getTokens → 기저 read는 1회분(키 2개)뿐', async () => {
    const storage = createTokenStorage({ keyPrefix: PREFIX });
    await storage.setTokens(PAIR_1, { persistence: 'durable' });
    __reset();
    __rawStore().set(ACCESS_KEY, 'access-1');
    __rawStore().set(REFRESH_KEY, 'refresh-1');
    const fresh = createTokenStorage({ keyPrefix: PREFIX });
    await fresh.getTokens();
    await fresh.getTokens();
    await fresh.getTokens();
    expect(__getItemCallCount()).toBe(2); // 키 2개 × 1회 — 이후는 캐시 (단일 프로세스라 안전, §3.8)
  });

  it('H12: 한 키 삭제 → 새 인스턴스 getTokens null 수렴', async () => {
    const storage = createTokenStorage({ keyPrefix: PREFIX });
    await storage.setTokens(PAIR_1, { persistence: 'durable' });
    __rawStore().delete(REFRESH_KEY);
    const fresh = createTokenStorage({ keyPrefix: PREFIX });
    expect(await fresh.getTokens()).toBeNull();
  });
});

describe("createTokenStorage (네이티브 분기) — 'session' = 프로세스 수명 메모리 (§7-5)", () => {
  it('SecureStore에서 제거하고 메모리에만 보관한다', async () => {
    const storage = createTokenStorage({ keyPrefix: PREFIX });
    await storage.setTokens(PAIR_1, { persistence: 'durable' });
    await storage.setTokens(PAIR_2, { persistence: 'session' });
    expect(__rawStore().size).toBe(0); // durable 사본 제거 — 재시작이 세션을 부활시키지 못한다
    expect(await storage.getTokens()).toEqual(PAIR_2); // 같은 프로세스에서는 살아 있다
  });

  it('프로세스 재시작(새 인스턴스) → 세션 토큰은 사라진다 = 로그아웃', async () => {
    const storage = createTokenStorage({ keyPrefix: PREFIX });
    await storage.setTokens(PAIR_1, { persistence: 'session' });
    const afterRestart = createTokenStorage({ keyPrefix: PREFIX });
    expect(await afterRestart.getTokens()).toBeNull();
  });

  it('H14: session 모드에서 옵션 없는 회전은 durable로 승격되지 않는다', async () => {
    const storage = createTokenStorage({ keyPrefix: PREFIX });
    await storage.setTokens(PAIR_1, { persistence: 'session' });
    await storage.setTokens(PAIR_2); // 내부 회전 — 모드 스티키
    expect(__rawStore().size).toBe(0);
    expect(await storage.getTokens()).toEqual(PAIR_2);
  });
});

describe('createTokenStorage (네이티브 분기) — H10 캐시 vs 팩토리 자신의 동시 쓰기 (§3.1 freshness)', () => {
  // "외부 쓰기 주체가 없다"는 H10 면제는 이 팩토리 자신의 동시 쓰기를 덮지 않는다:
  // 부팅 시점 cold read(비동기 네이티브 IPC)가 signIn/signOut과 경합할 때, 늦게 도착한
  // stale 읽기가 캐시를 되살리면 로그아웃 무효화·유효한 새 세션 오폐기(H3 오폭)로 직결된다.

  it('cold read in-flight 중 setTokens → 이후 getTokens는 NEW 쌍 (stale 읽기가 캐시를 못 되살린다)', async () => {
    __rawStore().set(ACCESS_KEY, 'access-old');
    __rawStore().set(REFRESH_KEY, 'refresh-old');
    const storage = createTokenStorage({ keyPrefix: PREFIX });

    let open!: () => void;
    __setReadGate(new Promise<void>((resolve) => (open = resolve)));
    const inFlightRead = storage.getTokens(); // OLD 쌍의 cold read 시작

    await storage.setTokens(PAIR_2, { persistence: 'durable' }); // 읽기 완료 전의 쓰기

    open();
    await inFlightRead; // stale 읽기가 쓰기 이후에 완료된다

    expect(await storage.getTokens()).toEqual(PAIR_2);
  });

  it('cold read in-flight 중 clearTokens(signOut) → clear가 관철된다 (구세션 부활 금지)', async () => {
    __rawStore().set(ACCESS_KEY, 'access-old');
    __rawStore().set(REFRESH_KEY, 'refresh-old');
    const storage = createTokenStorage({ keyPrefix: PREFIX });

    let open!: () => void;
    __setReadGate(new Promise<void>((resolve) => (open = resolve)));
    const inFlightRead = storage.getTokens();

    await storage.clearTokens(); // signOut
    expect(__rawStore().size).toBe(0); // SecureStore는 실제로 비었다

    open();
    await inFlightRead;

    // clearTokens가 resolve된 뒤 어떤 reader도 구토큰을 다시 볼 수 없다.
    expect(await storage.getTokens()).toBeNull();
  });

  it('H10: 동시 cold read는 하나의 in-flight 읽기를 공유한다 (기저 read 1회분)', async () => {
    __rawStore().set(ACCESS_KEY, 'access-1');
    __rawStore().set(REFRESH_KEY, 'refresh-1');
    const storage = createTokenStorage({ keyPrefix: PREFIX });

    const [a, b, c] = await Promise.all([
      storage.getTokens(),
      storage.getTokens(),
      storage.getTokens(),
    ]);
    expect(a).toEqual(PAIR_1);
    expect(b).toEqual(PAIR_1);
    expect(c).toEqual(PAIR_1);
    expect(__getItemCallCount()).toBe(2); // 키 2개 × 1회 — 동시 호출도 읽기를 공유한다
  });
});

describe('createTokenStorage (네이티브 분기) — clear·검증', () => {
  it('clearTokens: 멱등, 캐시·SecureStore 모두 제거, 모드 기본값 리셋', async () => {
    const storage = createTokenStorage({ keyPrefix: PREFIX });
    await storage.setTokens(PAIR_1, { persistence: 'session' });
    await storage.clearTokens();
    await storage.clearTokens();
    expect(await storage.getTokens()).toBeNull();
    await storage.setTokens(PAIR_2); // 리셋 후 생략 = defaultPersistence('durable')
    expect(__rawStore().get(ACCESS_KEY)).toBe('access-2');
  });

  it('defaultPersistence 옵션이 최초 생략 호출의 모드를 정한다', async () => {
    const storage = createTokenStorage({ keyPrefix: PREFIX, defaultPersistence: 'session' });
    await storage.setTokens(PAIR_1);
    expect(__rawStore().size).toBe(0); // session — SecureStore에 쓰지 않는다
    expect(await storage.getTokens()).toEqual(PAIR_1);
  });

  it('빈·공백 keyPrefix → AuthError("invalid-key-prefix") (§4.1-ⓐ)', () => {
    let thrown: unknown = null;
    try {
      createTokenStorage({ keyPrefix: '  ' });
    } catch (error) {
      thrown = error;
    }
    expect(isAuthError(thrown)).toBe(true);
    if (isAuthError(thrown)) expect(thrown.code).toBe('invalid-key-prefix');
  });
});
