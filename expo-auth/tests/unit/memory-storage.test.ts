// createMemoryTokenStorage — "./testing" seam 자체의 계약 (설계 문서 §5.1 · H14 · §3.1 freshness).

import { describe, expect, it } from 'vitest';

import { createMemoryTokenStorage } from '../../src/testing/memoryStorage';

const PAIR_1 = { accessToken: 'access-1', refreshToken: 'refresh-1' };
const PAIR_2 = { accessToken: 'access-2', refreshToken: 'refresh-2' };

describe('createMemoryTokenStorage', () => {
  it('read-through: simulateExternalRotation이 다음 getTokens에 즉시 보인다 (§3.1 freshness)', async () => {
    const storage = createMemoryTokenStorage({ tokens: PAIR_1 });
    storage.simulateExternalRotation(PAIR_2);
    expect(await storage.getTokens()).toEqual(PAIR_2);
    storage.simulateExternalClear();
    expect(await storage.getTokens()).toBeNull();
  });

  it('readCount가 기저 read 횟수를 센다', async () => {
    const storage = createMemoryTokenStorage();
    expect(storage.readCount).toBe(0);
    await storage.getTokens();
    await storage.getTokens();
    expect(storage.readCount).toBe(2);
  });

  it('H14: persistence 생략 setTokens는 현재 모드를 유지한다', async () => {
    const storage = createMemoryTokenStorage();
    await storage.setTokens(PAIR_1, { persistence: 'session' });
    expect(storage.persistence).toBe('session');
    await storage.setTokens(PAIR_2); // 회전 — 모드 스티키
    expect(storage.persistence).toBe('session');
    expect(await storage.getTokens()).toEqual(PAIR_2);
  });

  it('clearTokens는 멱등이고 모드를 기본값(durable)으로 리셋한다', async () => {
    const storage = createMemoryTokenStorage({ tokens: PAIR_1, persistence: 'session' });
    await storage.clearTokens();
    await storage.clearTokens();
    expect(await storage.getTokens()).toBeNull();
    expect(storage.persistence).toBe('durable');
  });

  it('initial 옵션 — tokens·persistence', async () => {
    const storage = createMemoryTokenStorage({ tokens: PAIR_1, persistence: 'session' });
    expect(await storage.getTokens()).toEqual(PAIR_1);
    expect(storage.persistence).toBe('session');
  });
});
