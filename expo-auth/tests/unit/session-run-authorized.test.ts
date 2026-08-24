// runAuthorized — 401→refresh→재시도 정확히 1회 (H6, 설계 문서 §3.5 · §5.2).

import { describe, expect, it } from 'vitest';

import { createAuthSession } from '../../src/core/session';
import type { TokenPair } from '../../src/core/types';
import { createManualClock } from '../../src/testing/clock';
import { createMemoryTokenStorage } from '../../src/testing/memoryStorage';
import { createScriptedRefreshRequest } from '../../src/testing/refresh';

const PAIR_1: TokenPair = { accessToken: 'access-1', refreshToken: 'refresh-1' };
const PAIR_2: TokenPair = { accessToken: 'access-2', refreshToken: 'refresh-2' };

type FakeApiError = Error & { readonly status: number };
function apiError(status: number, label: string): FakeApiError {
  return Object.assign(new Error(label), { status });
}
const shouldRetryAfterRefresh = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && (error as { status?: unknown }).status === 401;

describe('runAuthorized (H6)', () => {
  it('401 → refresh → 새 토큰으로 재시도 1회 성공', async () => {
    const storage = createMemoryTokenStorage({ tokens: PAIR_1 });
    const scripted = createScriptedRefreshRequest([{ status: 'rotated', tokens: PAIR_2 }]);
    const clock = createManualClock();
    const session = createAuthSession({ storage, refresh: scripted.request, clock });

    const seen: (string | null)[] = [];
    const result = await session.runAuthorized(
      async (accessToken) => {
        seen.push(accessToken);
        if (accessToken === PAIR_1.accessToken) throw apiError(401, 'expired');
        return 'ok';
      },
      { shouldRetryAfterRefresh }
    );

    expect(result).toBe('ok');
    // run은 매 시도마다 그 시점의 access 토큰을 인자로 받는다 — 만료 헤더 재사용 원천 차단.
    expect(seen).toEqual([PAIR_1.accessToken, PAIR_2.accessToken]);
    expect(scripted.calls.length).toBe(1);
    session.dispose();
  });

  it('두 번 연속 401 → refresh 1회·run 2회·최종은 두 번째 에러 (재시도-두 번은 표현 불가)', async () => {
    const storage = createMemoryTokenStorage({ tokens: PAIR_1 });
    const scripted = createScriptedRefreshRequest([{ status: 'rotated', tokens: PAIR_2 }]);
    const clock = createManualClock();
    const session = createAuthSession({ storage, refresh: scripted.request, clock });

    const first = apiError(401, 'first');
    const second = apiError(401, 'second');
    let runCount = 0;
    await expect(
      session.runAuthorized(
        async () => {
          runCount += 1;
          throw runCount === 1 ? first : second;
        },
        { shouldRetryAfterRefresh }
      )
    ).rejects.toBe(second);

    expect(runCount).toBe(2);
    expect(scripted.calls.length).toBe(1);
    session.dispose();
  });

  it('shouldRetryAfterRefresh false → refresh 0회, 원본 에러 재던짐', async () => {
    const storage = createMemoryTokenStorage({ tokens: PAIR_1 });
    const scripted = createScriptedRefreshRequest([]);
    const clock = createManualClock();
    const session = createAuthSession({ storage, refresh: scripted.request, clock });

    const serverError = apiError(500, 'boom');
    await expect(
      session.runAuthorized(
        async () => {
          throw serverError;
        },
        { shouldRetryAfterRefresh }
      )
    ).rejects.toBe(serverError);
    expect(scripted.calls.length).toBe(0);
    session.dispose();
  });

  it('refresh가 transient면 원본 401을 재던진다 — 토큰은 그대로라 상위 재시도 정책이 이어받는다 (H1)', async () => {
    const storage = createMemoryTokenStorage({ tokens: PAIR_1 });
    const scripted = createScriptedRefreshRequest([{ status: 'transient' }]);
    const clock = createManualClock();
    const session = createAuthSession({ storage, refresh: scripted.request, clock });

    const original = apiError(401, 'original');
    let runCount = 0;
    await expect(
      session.runAuthorized(
        async () => {
          runCount += 1;
          throw original;
        },
        { shouldRetryAfterRefresh }
      )
    ).rejects.toBe(original);
    expect(runCount).toBe(1); // 재시도 없음 — refresh가 성공/채택이 아니었다
    expect(await storage.getTokens()).toEqual(PAIR_1);
    session.dispose();
  });

  it('토큰이 없었으면(access null) refresh 경로에 진입하지 않는다', async () => {
    const storage = createMemoryTokenStorage();
    const scripted = createScriptedRefreshRequest([]);
    const clock = createManualClock();
    const session = createAuthSession({ storage, refresh: scripted.request, clock });

    const unauthorized = apiError(401, 'anonymous');
    let received: string | null = 'sentinel';
    await expect(
      session.runAuthorized(
        async (accessToken) => {
          received = accessToken;
          throw unauthorized;
        },
        { shouldRetryAfterRefresh }
      )
    ).rejects.toBe(unauthorized);
    expect(received).toBeNull();
    expect(scripted.calls.length).toBe(0);
    session.dispose();
  });

  it('재시도 실행분의 성공 값이 최종이다', async () => {
    const storage = createMemoryTokenStorage({ tokens: PAIR_1 });
    const scripted = createScriptedRefreshRequest([{ status: 'rotated', tokens: PAIR_2 }]);
    const clock = createManualClock();
    const session = createAuthSession({ storage, refresh: scripted.request, clock });

    const value = await session.runAuthorized(
      async (accessToken) =>
        accessToken === PAIR_2.accessToken
          ? { me: 'loaded' }
          : (() => {
              throw apiError(401, 'expired');
            })(),
      { shouldRetryAfterRefresh }
    );
    expect(value).toEqual({ me: 'loaded' });
    session.dispose();
  });
});
