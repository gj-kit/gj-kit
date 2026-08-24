// 사전 갱신 스케줄러 — H7·H8 + §3.5 TTL 우선순위·지수 백오프 (설계 문서 §5.2 매트릭스).

import { describe, expect, it } from 'vitest';

import type { RefreshOutcome } from '../../src/core/outcome';
import { createAuthSession } from '../../src/core/session';
import type { AuthClock, TokenPair, TokenStorage } from '../../src/core/types';
import { createManualClock } from '../../src/testing/clock';
import { createMemoryTokenStorage } from '../../src/testing/memoryStorage';
import { createScriptedRefreshRequest, createUnsignedTestJwt } from '../../src/testing/refresh';

const START_MS = 1_700_000_000_000;
const startSeconds = Math.floor(START_MS / 1000);

function jwtPair(ttlSeconds: number, refreshToken: string): TokenPair {
  return {
    accessToken: createUnsignedTestJwt({ exp: startSeconds + ttlSeconds }),
    refreshToken,
  };
}
const OPAQUE_PAIR: TokenPair = { accessToken: 'opaque-access', refreshToken: 'refresh-1' };

describe('스케줄러 — 지연 계산 3분기 (H7)', () => {
  it('ttl 900s → 810s(= ttl − lead 90s)에 발화', async () => {
    const clock = createManualClock({ startMs: START_MS });
    const storage = createMemoryTokenStorage({ tokens: jwtPair(900, 'refresh-1') });
    const scripted = createScriptedRefreshRequest([
      { status: 'rotated', tokens: jwtPair(900, 'refresh-2') },
    ]);
    const session = createAuthSession({ storage, refresh: scripted.request, clock });

    await session.scheduleRefresh();
    await clock.advance(809_999);
    expect(scripted.calls.length).toBe(0);
    await clock.advance(1);
    expect(scripted.calls.length).toBe(1);
    session.dispose();
  });

  it('ttl 60s → minDelay 30s로 클램프', async () => {
    const clock = createManualClock({ startMs: START_MS });
    const storage = createMemoryTokenStorage({ tokens: jwtPair(60, 'refresh-1') });
    const scripted = createScriptedRefreshRequest([
      { status: 'rotated', tokens: jwtPair(900, 'refresh-2') },
    ]);
    const session = createAuthSession({ storage, refresh: scripted.request, clock });

    await session.scheduleRefresh();
    await clock.advance(29_999);
    expect(scripted.calls.length).toBe(0);
    await clock.advance(1);
    expect(scripted.calls.length).toBe(1);
    session.dispose();
  });

  it('ttl 불명(비JWT) → fallback 840s − 90s = 750s에 발화', async () => {
    const clock = createManualClock({ startMs: START_MS });
    const storage = createMemoryTokenStorage({ tokens: OPAQUE_PAIR });
    const scripted = createScriptedRefreshRequest([
      { status: 'rotated', tokens: jwtPair(900, 'refresh-2') },
    ]);
    const session = createAuthSession({ storage, refresh: scripted.request, clock });

    await session.scheduleRefresh();
    await clock.advance(749_999);
    expect(scripted.calls.length).toBe(0);
    await clock.advance(1);
    expect(scripted.calls.length).toBe(1);
    session.dispose();
  });
});

describe('스케줄러 — 타이머 지연 클램프 (32비트 setTimeout 오버플로 방지)', () => {
  // 플랫폼 setTimeout은 지연을 32비트 부호 있는 정수로 저장한다: 2^31−1ms(~24.86일)를 넘는
  // 지연은 (사실상) 즉시 발화한다. 클램프가 없으면 30일 TTL이 "즉시 갱신 → 같은 오버플로
  // 재장전" 핫 루프가 된다 — §7-8이 막으려던 self-DoS가 성공 경로로 재유입되는 셈이다.
  function delaySpyClock(manual: ReturnType<typeof createManualClock>): {
    readonly clock: AuthClock;
    readonly delays: readonly number[];
  } {
    const delays: number[] = [];
    return {
      delays,
      clock: {
        nowMs: () => manual.nowMs(),
        setTimeout: (callback, delayMs) => {
          delays.push(delayMs);
          return manual.setTimeout(callback, delayMs);
        },
        clearTimeout: (handle) => {
          manual.clearTimeout(handle);
        },
      },
    };
  }

  it('30일 TTL signIn → clock.setTimeout에 전달되는 지연은 2^31−1 이하로 클램프된다', async () => {
    const manual = createManualClock({ startMs: START_MS });
    const spy = delaySpyClock(manual);
    const storage = createMemoryTokenStorage();
    const scripted = createScriptedRefreshRequest([]);
    const session = createAuthSession({ storage, refresh: scripted.request, clock: spy.clock });

    await session.signIn(OPAQUE_PAIR, {
      persistence: 'durable',
      accessTtlSeconds: 30 * 24 * 3600, // (30일 − 90s) × 1000 = 2,591,910,000ms > 2^31−1
    });

    expect(spy.delays.length).toBe(1);
    expect(spy.delays[0]).toBe(2 ** 31 - 1);
    // 클램프 시점(~24.86일)까지는 발화하지 않는다 — 즉시 발화 핫 루프가 아니다.
    await manual.advance(2 ** 31 - 2);
    expect(scripted.calls.length).toBe(0);
    session.dispose();
  });

  it('비유한 TTL(NaN 전략)은 fallback으로 후퇴한다 — NaN 지연이 armTimer에 닿지 않는다', async () => {
    const manual = createManualClock({ startMs: START_MS });
    const spy = delaySpyClock(manual);
    const storage = createMemoryTokenStorage({ tokens: OPAQUE_PAIR });
    const scripted = createScriptedRefreshRequest([]);
    const session = createAuthSession({
      storage,
      refresh: scripted.request,
      clock: spy.clock,
      accessTokenTtlSeconds: () => Number.NaN,
    });

    await session.scheduleRefresh();
    expect(spy.delays).toEqual([750_000]); // fallback 840s − lead 90s
    session.dispose();
  });
});

describe('TTL 출처 우선순위 (§3.5)', () => {
  it('①: signIn({ accessTtlSeconds: 600 }) → 510s 발화 — 비JWT 토큰이라도 fallback이 아니다', async () => {
    const clock = createManualClock({ startMs: START_MS });
    const storage = createMemoryTokenStorage();
    const scripted = createScriptedRefreshRequest([
      { status: 'rotated', tokens: jwtPair(900, 'refresh-2') },
    ]);
    const session = createAuthSession({ storage, refresh: scripted.request, clock });

    await session.signIn(OPAQUE_PAIR, { persistence: 'durable', accessTtlSeconds: 600 });
    await clock.advance(509_999);
    expect(scripted.calls.length).toBe(0);
    await clock.advance(1);
    expect(scripted.calls.length).toBe(1);
    session.dispose();
  });

  it('①: 갱신 응답의 accessTtlSeconds가 재스케줄 TTL을 결정한다', async () => {
    const clock = createManualClock({ startMs: START_MS });
    const storage = createMemoryTokenStorage({ tokens: OPAQUE_PAIR });
    const scripted = createScriptedRefreshRequest([
      { status: 'rotated', tokens: { accessToken: 'opaque-2', refreshToken: 'refresh-2' }, accessTtlSeconds: 300 },
      { status: 'rotated', tokens: { accessToken: 'opaque-3', refreshToken: 'refresh-3' } },
    ]);
    const session = createAuthSession({ storage, refresh: scripted.request, clock });

    await session.refresh(); // 'refreshed' — 재스케줄까지 마친 뒤 반환 (§3.5)
    // 300s − 90s = 210s 뒤 발화해야 한다 (fallback 750s가 아니라).
    await clock.advance(209_999);
    expect(scripted.calls.length).toBe(1);
    await clock.advance(1);
    expect(scripted.calls.length).toBe(2);
    session.dispose();
  });

  it('②: 커스텀 accessTokenTtlSeconds 전략이 JWT 디코드를 대체한다', async () => {
    const clock = createManualClock({ startMs: START_MS });
    const storage = createMemoryTokenStorage({ tokens: OPAQUE_PAIR });
    const scripted = createScriptedRefreshRequest([
      { status: 'rotated', tokens: jwtPair(900, 'refresh-2') },
    ]);
    const session = createAuthSession({
      storage,
      refresh: scripted.request,
      clock,
      accessTokenTtlSeconds: () => 200,
    });

    await session.scheduleRefresh();
    await clock.advance(109_999); // 200 − 90 = 110s
    expect(scripted.calls.length).toBe(0);
    await clock.advance(1);
    expect(scripted.calls.length).toBe(1);
    session.dispose();
  });
});

describe('스케줄러 — 연속 transient 지수 백오프 (H8·§7-8)', () => {
  it('30s·60s·120s·…·transientMaxDelayMs 클램프, refreshed 후 카운터 리셋', async () => {
    const clock = createManualClock({ startMs: START_MS });
    const storage = createMemoryTokenStorage({ tokens: jwtPair(900, 'refresh-1') });
    const scripted = createScriptedRefreshRequest([
      { status: 'transient' },
      { status: 'transient' },
      { status: 'transient' },
      { status: 'transient' },
      // 회전 시점에는 시계가 이미 ~1140s 전진해 있어 START 기준 JWT exp는 만료 상태다 —
      // 서버 권위 TTL(①순위)로 900s를 준다 (§3.5).
      { status: 'rotated', tokens: { accessToken: 'opaque-next', refreshToken: 'refresh-2' }, accessTtlSeconds: 900 },
      { status: 'transient' },
    ]);
    const outcomes: RefreshOutcome['status'][] = [];
    const session = createAuthSession({
      storage,
      refresh: scripted.request,
      clock,
      schedule: { transientMaxDelayMs: 120_000 },
      onScheduledOutcome: (outcome) => {
        outcomes.push(outcome.status);
      },
    });

    await session.scheduleRefresh();
    await clock.advance(810_000); // 1차 발화 → transient #1
    expect(scripted.calls.length).toBe(1);
    await clock.advance(30_000); // 백오프 1: 30s
    expect(scripted.calls.length).toBe(2);
    await clock.advance(59_999); // 백오프 2: 60s
    expect(scripted.calls.length).toBe(2);
    await clock.advance(1);
    expect(scripted.calls.length).toBe(3);
    await clock.advance(120_000); // 백오프 3: 120s
    expect(scripted.calls.length).toBe(4);
    await clock.advance(120_000); // 백오프 4: 상한 클램프 — 240s가 아니라 120s
    expect(scripted.calls.length).toBe(5); // → 'rotated' 성공, 카운터 리셋 + 정상 재스케줄(810s)
    await clock.advance(810_000);
    expect(scripted.calls.length).toBe(6); // → transient — 리셋됐으므로 다음 재시도는 다시 30s
    await clock.advance(30_000);
    // 각본 소진: 7번째 호출은 scripted가 throw → 'transient'(cause)로 표면화된다.
    expect(scripted.calls.length).toBe(7);
    expect(outcomes.slice(0, 5)).toEqual([
      'transient',
      'transient',
      'transient',
      'transient',
      'refreshed',
    ]);
    session.dispose();
  });
});

describe('스케줄러 — 예기치 못한 rejection에도 죽지 않는다 (H1 방향·§3.4 진단 채널)', () => {
  it('발화 중 storage 어댑터 reject → transient(cause) 통지 + 백오프 재장전 (침묵 사망 금지)', async () => {
    const clock = createManualClock({ startMs: START_MS });
    const inner = createMemoryTokenStorage({ tokens: jwtPair(900, 'refresh-1') });
    const keychainDown = new Error('keychain unavailable');
    let failReads = false;
    // 페이크 위임 래퍼 — iOS 키체인 잠김 등으로 어댑터 read가 reject하는 상황을 재현한다.
    const storage: TokenStorage = {
      getTokens: () => (failReads ? Promise.reject(keychainDown) : inner.getTokens()),
      setTokens: (tokens, options) => inner.setTokens(tokens, options),
      clearTokens: () => inner.clearTokens(),
    };
    const outcomes: RefreshOutcome[] = [];
    const session = createAuthSession({
      storage,
      refresh: async () => ({ status: 'transient' }),
      clock,
      onScheduledOutcome: (outcome) => {
        outcomes.push(outcome);
      },
    });

    await session.scheduleRefresh();
    expect(clock.pendingTimerCount).toBe(1);
    failReads = true;

    await clock.advance(810_000); // 예약 발화 → performRefresh의 storage read가 reject
    // 스케줄러는 죽지 않는다: transient(cause)로 통지되고 백오프 재시도가 장전돼 있다.
    expect(outcomes).toEqual([{ status: 'transient', cause: keychainDown }]);
    expect(clock.pendingTimerCount).toBe(1);

    failReads = false;
    await clock.advance(30_000); // 백오프 1: 30s — 콜백이 transient를 정상 보고
    expect(outcomes.length).toBe(2);
    expect(outcomes[1]).toEqual({ status: 'transient' });
    session.dispose();
  });
});

describe('스케줄러 — invalid·onScheduledOutcome (§3.5)', () => {
  it('발화 결과 invalid → 타이머 0 + onScheduledOutcome 통지', async () => {
    const clock = createManualClock({ startMs: START_MS });
    const storage = createMemoryTokenStorage({ tokens: jwtPair(900, 'refresh-1') });
    const scripted = createScriptedRefreshRequest([{ status: 'invalid' }]);
    const outcomes: RefreshOutcome[] = [];
    const session = createAuthSession({
      storage,
      refresh: scripted.request,
      clock,
      onScheduledOutcome: (outcome) => {
        outcomes.push(outcome);
      },
    });

    await session.scheduleRefresh();
    expect(clock.pendingTimerCount).toBe(1);
    await clock.advance(810_000);
    expect(outcomes).toEqual([{ status: 'invalid', tokensCleared: true }]);
    expect(clock.pendingTimerCount).toBe(0); // 타이머 정지
    expect(await storage.getTokens()).toBeNull();
    session.dispose();
  });

  it('caller-initiated refresh()에는 onScheduledOutcome이 호출되지 않는다', async () => {
    const clock = createManualClock({ startMs: START_MS });
    const storage = createMemoryTokenStorage({ tokens: jwtPair(900, 'refresh-1') });
    const scripted = createScriptedRefreshRequest([
      { status: 'rotated', tokens: jwtPair(900, 'refresh-2') },
    ]);
    let notified = 0;
    const session = createAuthSession({
      storage,
      refresh: scripted.request,
      clock,
      onScheduledOutcome: () => {
        notified += 1;
      },
    });

    await session.refresh();
    expect(notified).toBe(0);
    session.dispose();
  });

  it('signOut은 타이머를 정지하고 clear한다 — 멱등', async () => {
    const clock = createManualClock({ startMs: START_MS });
    const storage = createMemoryTokenStorage({ tokens: jwtPair(900, 'refresh-1') });
    const scripted = createScriptedRefreshRequest([]);
    const session = createAuthSession({ storage, refresh: scripted.request, clock });

    await session.scheduleRefresh();
    expect(clock.pendingTimerCount).toBe(1);
    await session.signOut();
    expect(clock.pendingTimerCount).toBe(0);
    expect(await storage.getTokens()).toBeNull();
    await session.signOut(); // 멱등
    expect(await storage.getTokens()).toBeNull();
    session.dispose();
  });

  it('빈 저장소의 scheduleRefresh → 타이머 0, 유령 signed-out 통지 없음 (§3.5 — 토큰 기준 등록)', async () => {
    const clock = createManualClock({ startMs: START_MS });
    const storage = createMemoryTokenStorage(); // 로그인한 적 없는 앱
    const scripted = createScriptedRefreshRequest([]);
    const outcomes: RefreshOutcome[] = [];
    const session = createAuthSession({
      storage,
      refresh: scripted.request,
      clock,
      onScheduledOutcome: (outcome) => {
        outcomes.push(outcome);
      },
    });

    await session.scheduleRefresh();
    expect(clock.pendingTimerCount).toBe(0); // fallback 타이머를 장전하지 않는다
    await clock.advance(3_600_000);
    expect(scripted.calls.length).toBe(0);
    expect(outcomes).toEqual([]); // 부팅 ~12.5분 뒤 유령 'signed-out' 통지가 없다
    session.dispose();
  });

  it('cancelScheduledRefresh는 타이머만 정지한다', async () => {
    const clock = createManualClock({ startMs: START_MS });
    const storage = createMemoryTokenStorage({ tokens: jwtPair(900, 'refresh-1') });
    const scripted = createScriptedRefreshRequest([]);
    const session = createAuthSession({ storage, refresh: scripted.request, clock });

    await session.scheduleRefresh();
    session.cancelScheduledRefresh();
    expect(clock.pendingTimerCount).toBe(0);
    await clock.advance(3_600_000);
    expect(scripted.calls.length).toBe(0);
    expect(await storage.getTokens()).not.toBeNull();
    session.dispose();
  });
});
