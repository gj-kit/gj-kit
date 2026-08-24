// refresh()의 결말 매트릭스 — H1·H2·H2b·H3·H4 (설계 문서 §0.3 · §5.2).
// 모킹 0: 전 시나리오가 "./testing" 페이크 4종으로 돈다 (test-purity-guard가 강제).

import { describe, expect, it } from 'vitest';

import { createAuthSession } from '../../src/core/session';
import type { RefreshRequestResult, TokenPair } from '../../src/core/types';
import { createManualClock } from '../../src/testing/clock';
import { createFakeRefreshLock } from '../../src/testing/lock';
import { createMemoryTokenStorage } from '../../src/testing/memoryStorage';
import { createScriptedRefreshRequest } from '../../src/testing/refresh';

const PAIR_1: TokenPair = { accessToken: 'access-1', refreshToken: 'refresh-1' };
const PAIR_2: TokenPair = { accessToken: 'access-2', refreshToken: 'refresh-2' };
const PAIR_3: TokenPair = { accessToken: 'access-3', refreshToken: 'refresh-3' };

// 게이트 갱신 콜백 — release가 호출될 때까지 요청을 in-flight 상태로 붙잡아 둔다.
// vi.mock이 아니라 평범한 promise 한 개다 (test-purity-guard 규율 그대로).
function gatedRefreshRequest(): {
  readonly request: () => Promise<RefreshRequestResult>;
  readonly release: (result: RefreshRequestResult) => void;
} {
  let release!: (result: RefreshRequestResult) => void;
  const gate = new Promise<RefreshRequestResult>((resolve) => {
    release = resolve;
  });
  return { request: () => gate, release };
}

describe('refresh() — 단일 비행 (H4)', () => {
  it('동시 refresh() 10회 → 콜백 1회, 전원 동일 outcome', async () => {
    const storage = createMemoryTokenStorage({ tokens: PAIR_1 });
    const scripted = createScriptedRefreshRequest([{ status: 'rotated', tokens: PAIR_2 }]);
    const clock = createManualClock();
    const session = createAuthSession({ storage, refresh: scripted.request, clock });

    const outcomes = await Promise.all(
      Array.from({ length: 10 }, () => session.refresh())
    );

    expect(scripted.calls.length).toBe(1);
    expect(scripted.calls[0]).toEqual({ refreshToken: 'refresh-1' });
    for (const outcome of outcomes) {
      // 인스턴스 내 동시 호출은 하나의 in-flight 결과를 공유한다 — 전부 같은 객체다.
      expect(outcome).toBe(outcomes[0]);
      expect(outcome).toEqual({ status: 'refreshed', tokens: PAIR_2 });
    }
    expect(await storage.getTokens()).toEqual(PAIR_2);
    session.dispose();
  });

  it('비행 종료 후의 refresh()는 새 비행이다 (promise 재사용 아님)', async () => {
    const storage = createMemoryTokenStorage({ tokens: PAIR_1 });
    const scripted = createScriptedRefreshRequest([
      { status: 'rotated', tokens: PAIR_2 },
      { status: 'rotated', tokens: PAIR_3 },
    ]);
    const clock = createManualClock();
    const session = createAuthSession({ storage, refresh: scripted.request, clock });

    await session.refresh();
    const second = await session.refresh();
    expect(scripted.calls.length).toBe(2);
    expect(second).toEqual({ status: 'refreshed', tokens: PAIR_3 });
    session.dispose();
  });
});

describe('refresh() — 채택 (H2·H2b·H3)', () => {
  it('H2: 요청 in-flight 중 외부 회전 + invalid 응답 → adopted, 저장 토큰 보존', async () => {
    const storage = createMemoryTokenStorage({ tokens: PAIR_1 });
    const clock = createManualClock();
    // 콜백 실행 중(= 요청 in-flight 중) 다른 탭의 회전을 흉내 낸다.
    const session = createAuthSession({
      storage,
      clock,
      refresh: async () => {
        storage.simulateExternalRotation(PAIR_2);
        return { status: 'invalid' };
      },
    });

    const outcome = await session.refresh();
    expect(outcome).toEqual({ status: 'adopted', tokens: PAIR_2 });
    // H3 규율의 결과이기도 하다 — invalid 응답에도 회전된 저장 토큰은 절대 지워지지 않는다.
    expect(await storage.getTokens()).toEqual(PAIR_2);
    session.dispose();
  });

  it('H2: transient 실패 중 외부 회전 → adopted (원본과 동일하게 실패 종류 무관)', async () => {
    const storage = createMemoryTokenStorage({ tokens: PAIR_1 });
    const clock = createManualClock();
    const session = createAuthSession({
      storage,
      clock,
      refresh: async () => {
        storage.simulateExternalRotation(PAIR_2);
        return { status: 'transient' };
      },
    });

    expect(await session.refresh()).toEqual({ status: 'adopted', tokens: PAIR_2 });
    session.dispose();
  });

  it('H3: 회전 없이 invalid → tokensCleared:true + 저장소 clear', async () => {
    const storage = createMemoryTokenStorage({ tokens: PAIR_1 });
    const scripted = createScriptedRefreshRequest([{ status: 'invalid' }]);
    const clock = createManualClock();
    const session = createAuthSession({ storage, refresh: scripted.request, clock });

    expect(await session.refresh()).toEqual({ status: 'invalid', tokensCleared: true });
    expect(await storage.getTokens()).toBeNull();
    session.dispose();
  });

  it('H3: 시도 중 외부 clear + invalid → tokensCleared:false (지운 것은 우리가 아니다)', async () => {
    const storage = createMemoryTokenStorage({ tokens: PAIR_1 });
    const clock = createManualClock();
    const session = createAuthSession({
      storage,
      clock,
      refresh: async () => {
        storage.simulateExternalClear();
        return { status: 'invalid' };
      },
    });

    expect(await session.refresh()).toEqual({ status: 'invalid', tokensCleared: false });
    expect(await storage.getTokens()).toBeNull();
    session.dispose();
  });

  it('저장소가 비어 있으면 signed-out — 콜백 호출 0회', async () => {
    const storage = createMemoryTokenStorage();
    const scripted = createScriptedRefreshRequest([]);
    const clock = createManualClock();
    const session = createAuthSession({ storage, refresh: scripted.request, clock });

    expect(await session.refresh()).toEqual({ status: 'signed-out' });
    expect(scripted.calls.length).toBe(0);
    session.dispose();
  });
});

describe("refresh() — 'rotated' persist 규율 (H3의 재읽기를 성공 경로에 적용)", () => {
  it('in-flight 중 signOut → 회전을 폐기하고 signed-out — 로그아웃이 관철된다', async () => {
    const storage = createMemoryTokenStorage({ tokens: PAIR_1 });
    const clock = createManualClock();
    const gated = gatedRefreshRequest();
    const session = createAuthSession({ storage, clock, refresh: gated.request });

    const flight = session.refresh();
    await clock.advance(0); // 요청이 in-flight 상태에 도달할 시간

    await session.signOut(); // 사용자가 로그아웃을 탭
    expect(await storage.getTokens()).toBeNull();
    expect(clock.pendingTimerCount).toBe(0);

    gated.release({ status: 'rotated', tokens: PAIR_2 });
    expect(await flight).toEqual({ status: 'signed-out' });

    // 로그아웃이 관철된다: 회전이 세션을 부활시키지 않고, 타이머도 재장전되지 않는다.
    expect(await storage.getTokens()).toBeNull();
    expect(clock.pendingTimerCount).toBe(0);
    session.dispose();
  });

  it('in-flight 중 signIn(새 계정) → 구계정 회전이 새 쌍을 덮지 않고 adopted', async () => {
    const storage = createMemoryTokenStorage({ tokens: PAIR_1 });
    const clock = createManualClock();
    const gated = gatedRefreshRequest();
    const session = createAuthSession({ storage, clock, refresh: gated.request });

    const flight = session.refresh();
    await clock.advance(0);

    // 구갱신이 in-flight인 동안 (다른 계정으로) 재인증
    await session.signIn(PAIR_3, { persistence: 'durable' });

    gated.release({ status: 'rotated', tokens: PAIR_2 });
    expect(await flight).toEqual({ status: 'adopted', tokens: PAIR_3 });
    expect(await storage.getTokens()).toEqual(PAIR_3);
    session.dispose();
  });

  it("크로스탭: 요청 중 다른 탭의 clear → 'rotated' persist가 이를 덮지 않는다", async () => {
    const storage = createMemoryTokenStorage({ tokens: PAIR_1 });
    const clock = createManualClock();
    const session = createAuthSession({
      storage,
      clock,
      refresh: async () => {
        storage.simulateExternalClear(); // 다른 탭이 요청 중 로그아웃
        return { status: 'rotated', tokens: PAIR_2 };
      },
    });

    expect(await session.refresh()).toEqual({ status: 'signed-out' });
    expect(await storage.getTokens()).toBeNull();
    session.dispose();
  });

  it('크로스탭: 요청 중 다른 탭의 회전 → 그 쌍을 adopted, 우리 회전은 폐기', async () => {
    const storage = createMemoryTokenStorage({ tokens: PAIR_1 });
    const clock = createManualClock();
    const session = createAuthSession({
      storage,
      clock,
      refresh: async () => {
        storage.simulateExternalRotation(PAIR_3);
        return { status: 'rotated', tokens: PAIR_2 };
      },
    });

    expect(await session.refresh()).toEqual({ status: 'adopted', tokens: PAIR_3 });
    expect(await storage.getTokens()).toEqual(PAIR_3);
    session.dispose();
  });
});

describe('refresh() — transient (H1)', () => {
  it('transient 각본 → storage 무변경 + cause undefined', async () => {
    const storage = createMemoryTokenStorage({ tokens: PAIR_1 });
    const scripted = createScriptedRefreshRequest([{ status: 'transient' }]);
    const clock = createManualClock();
    const session = createAuthSession({ storage, refresh: scripted.request, clock });

    const outcome = await session.refresh();
    expect(outcome.status).toBe('transient');
    if (outcome.status === 'transient') {
      expect(outcome.cause).toBeUndefined();
      expect('cause' in outcome).toBe(false);
    }
    // H1 — 절대 로그아웃하지 않는다: 토큰 보존.
    expect(await storage.getTokens()).toEqual(PAIR_1);
    session.dispose();
  });

  it('콜백 throw → transient + cause === 던진 값 보존 (fail-safe 방향 + 진단 채널, §3.4)', async () => {
    const storage = createMemoryTokenStorage({ tokens: PAIR_1 });
    const thrown = new Error('classifier bug');
    const clock = createManualClock();
    const session = createAuthSession({
      storage,
      clock,
      refresh: async () => {
        throw thrown;
      },
    });

    const outcome = await session.refresh();
    expect(outcome.status).toBe('transient');
    if (outcome.status === 'transient') {
      expect(outcome.cause).toBe(thrown);
    }
    expect(await storage.getTokens()).toEqual(PAIR_1);
    session.dispose();
  });
});

describe('refresh() — 잠금 (H5·H2b·§3.5 잠금 경계)', () => {
  it('두 세션(두 탭 시뮬레이션)이 잠금을 공유하면 직렬화되고 두 번째는 채택한다', async () => {
    const storage = createMemoryTokenStorage({ tokens: PAIR_1 });
    const lock = createFakeRefreshLock();
    const scripted = createScriptedRefreshRequest([{ status: 'rotated', tokens: PAIR_2 }]);
    const clockA = createManualClock();
    const clockB = createManualClock();
    const sessionA = createAuthSession({ storage, refresh: scripted.request, lock, clock: clockA });
    const sessionB = createAuthSession({ storage, refresh: scripted.request, lock, clock: clockB });

    const [a, b] = await Promise.all([sessionA.refresh(), sessionB.refresh()]);
    expect(lock.maxObservedConcurrency).toBe(1); // H5
    expect(scripted.calls.length).toBe(1); // 두 번째 탭은 회전을 소비하지 않는다 (H2b)
    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual(['adopted', 'refreshed']);
    sessionA.dispose();
    sessionB.dispose();
  });

  it('H2b: 잠금 대기 중 외부 회전 → releaseNext 후 adopted, 콜백 호출 0회', async () => {
    const storage = createMemoryTokenStorage({ tokens: PAIR_1 });
    const lock = createFakeRefreshLock();
    const scripted = createScriptedRefreshRequest([]);
    const clock = createManualClock();
    const session = createAuthSession({ storage, refresh: scripted.request, lock, clock });

    lock.hold();
    const pending = session.refresh();
    // 진입 전 스냅샷 read가 완료되고 acquire가 게이트에 걸릴 시간을 준다.
    await clock.advance(0);
    storage.simulateExternalRotation(PAIR_2);
    lock.releaseNext();

    expect(await pending).toEqual({ status: 'adopted', tokens: PAIR_2 });
    expect(scripted.calls.length).toBe(0);
    session.dispose();
  });

  it('§3.5 잠금 경계: 잠금 해제 관측 전에 회전 쌍 persist 완료', async () => {
    const storage = createMemoryTokenStorage({ tokens: PAIR_1 });
    const fake = createFakeRefreshLock();
    let storedAtRelease: TokenPair | null = null;
    // acquire 래핑 데코레이터 — run 완료 직후(= 해제 직전)의 저장 상태를 관측한다.
    const observingLock = {
      acquire: <T,>(run: () => Promise<T>): Promise<T> =>
        fake.acquire(async () => {
          const result = await run();
          storedAtRelease = await storage.getTokens();
          return result;
        }),
    };
    const scripted = createScriptedRefreshRequest([{ status: 'rotated', tokens: PAIR_2 }]);
    const clock = createManualClock();
    const session = createAuthSession({ storage, refresh: scripted.request, lock: observingLock, clock });

    await session.refresh();
    // 해제가 persist에 선행하면 다음 탭이 소비된 single-use 토큰을 재사용한다 (§3.5 불변식).
    expect(storedAtRelease).toEqual(PAIR_2);
    session.dispose();
  });
});
