// `./testing`의 페이크가 **Phase 0가 측정한 상태에 전부 도달하는가** (설계 §5.4 · §9.1).
//
// 페이크가 도달할 수 없는 상태는 곧 **테스트 불가능한 코드 경로**다. 아래 한 줄 한 줄이 RESULTS의
// 사실 번호 하나에 대응하고, 그 위에서 도는 것은 `src/core/api.ts`의 진짜 코드다.

import { describe, expect, it } from 'vitest';

import {
  ReadBudget,
  SCOPES,
  isWorkoutsError,
  workoutsErrorCode,
  type RoutePoint,
  type WorkoutWrite,
} from '../../src/core';
import { createFakeWorkouts } from '../../src/testing';

const START = 1_754_000_000_000;
const END = START + 600_000;
const NOW = START + 3_600_000;

async function code(promise: Promise<unknown>): Promise<string | null> {
  try {
    await promise;
    return null;
  } catch (error) {
    expect(isWorkoutsError(error)).toBe(true);
    return workoutsErrorCode(error);
  }
}

function points(count: number, from = START): readonly RoutePoint[] {
  return Array.from({ length: count }, (_, i) => ({
    t: from + i * 10,
    lat: 37.5 + i * 1e-6,
    lon: 127.0 + i * 1e-6,
  }));
}

const BASE_WRITE: WorkoutWrite = {
  id: 'write-1',
  version: 1,
  kind: 'running',
  startMs: START,
  endMs: END,
  route: 'none',
};

describe('scope 준수 — 읽기 함정이 Node에서 재현된다 (소유자 결정 ② · §6.1-㉖)', () => {
  it("read: ['workouts']만 쥔 Android는 모든 총계가 undefined다 — 0이 아니다", async () => {
    const fake = createFakeWorkouts({
      platform: 'android',
      nowMs: NOW,
      granted: { read: ['workouts'], write: [] },
      workouts: [{ clientId: 'w', isOwn: true, kind: 'running', startMs: START, endMs: END, distanceM: 5000, activeEnergyKcal: 300, steps: 6000 }],
    });
    const page = await fake.api.listWorkouts({ fromMs: START - 1000, toMs: END });
    expect(page.items).toHaveLength(1);
    expect(page.items[0]?.distanceM).toBeUndefined();
    expect(page.items[0]?.activeEnergyKcal).toBeUndefined();
    expect(page.items[0]?.steps).toBeUndefined();
  });

  it('scope를 쥐면 같은 워크아웃이 채워진다 — 그리고 provenance는 derived다 (§8.4)', async () => {
    const fake = createFakeWorkouts({
      platform: 'android',
      nowMs: NOW,
      granted: { read: ['workouts', 'distance', 'activeEnergy', 'steps', 'heartRate'], write: [] },
      workouts: [
        {
          clientId: 'w',
          isOwn: true,
          kind: 'running',
          startMs: START,
          endMs: END,
          distanceM: 5000,
          activeEnergyKcal: 300,
          steps: 6000,
          heartRate: [
            { t: START + 1000, bpm: 120 },
            { t: START + 2000, bpm: 160 },
          ],
        },
      ],
    });
    const page = await fake.api.listWorkouts({ fromMs: START - 1000, toMs: END });
    expect(page.items[0]?.distanceM).toBe(5000);
    // Health Connect의 메트릭 레코드는 세션에 연관돼 있지 않다 — 창으로 골라 합산한 것이다.
    expect(page.items[0]?.distanceProvenance).toBe('derived');
    expect(page.items[0]?.activeEnergyKcal).toBe(300);
    expect(page.items[0]?.steps).toBe(6000);
    expect(page.items[0]?.heartRate).toEqual({ avgBpm: 140, minBpm: 120, maxBpm: 160 });
  });

  it('f109 — 메트릭이 하나도 오지 않으면 undefined이고 절대 0이 아니다', async () => {
    const fake = createFakeWorkouts({
      platform: 'android',
      nowMs: NOW,
      workouts: [{ clientId: 'w', isOwn: true, startMs: START, endMs: END, distanceM: 5000 }],
    });
    fake.setMetricsMissing(true);
    const page = await fake.api.listWorkouts({ fromMs: START - 1000, toMs: END });
    expect(page.items[0]?.distanceM).toBeUndefined();
    expect(page.items[0]?.distanceM).not.toBe(0);
  });
});

describe('인가 도출 — iOS unknown · f120 inconclusive · 선언 밖 요청', () => {
  it('iOS read scope는 두 값만 갖는다: 시트가 아직 뜰 수 있으면 undetermined, 아니면 영구히 unknown (idx f14)', async () => {
    const fake = createFakeWorkouts({ platform: 'ios', nowMs: NOW, granted: { read: [], write: [] } });
    // 아직 아무것도 묻지 않았다 -> 시트가 뜬다 -> `undetermined`("requestAuthorization을 불러라").
    const before = await fake.api.getAuthorizationState();
    expect(before.availability).toBe('available');
    if (before.availability !== 'available') return;
    expect(before.read.workouts).toBe('undetermined');

    // 전부 물어본 뒤에는 더 물어볼 것이 없다 -> read는 **영구히** `unknown`이다.
    const result = await fake.api.requestAuthorization({
      read: [...SCOPES],
      write: [...SCOPES],
    });
    expect(result.availability).toBe('available');
    if (result.availability !== 'available') return;
    expect(result.conclusive).toBe(true);
    for (const scope of SCOPES) expect(result.read[scope], scope).toBe('unknown');
    // share는 알 수 있다 — 그것이 `statuses`가 seam에 있는 이유다.
    expect(result.write.workouts).toBe('granted');
    // iOS에는 히스토리 벽이 없다. `granted`라고 말하는 것이 거짓말이다.
    expect(result.history).toBe('unknown');
  });

  it('f120 — 온보딩 "Go back"의 빈 집합은 거부가 아니다. 상태는 불변이고 conclusive가 false다', async () => {
    const fake = createFakeWorkouts({
      platform: 'android',
      nowMs: NOW,
      granted: { read: [], write: [], history: false },
    });
    fake.setNextPermissionOutcome('inconclusive');
    const result = await fake.api.requestAuthorization({ read: ['workouts'] });
    expect(result.conclusive).toBe(false);
    if (result.availability !== 'available') return;
    // 절대 'denied'로 뒤집지 않는다 — 다시 물어봐도 된다는 뜻의 'undetermined'다.
    expect(result.read.workouts).toBe('undetermined');
  });

  it('결론적인 거부만 denied가 된다 (before/after 비교)', async () => {
    const fake = createFakeWorkouts({
      platform: 'android',
      nowMs: NOW,
      granted: { read: [], write: [], history: false },
    });
    fake.setNextPermissionOutcome('deny');
    const result = await fake.api.requestAuthorization({ read: ['workouts', 'distance'] });
    expect(result.conclusive).toBe(true);
    if (result.availability !== 'available') return;
    expect(result.read.workouts).toBe('denied');
    expect(result.read.distance).toBe('denied');
    // read.routes는 런타임에 요청할 수 없으므로 절대 denied가 되지 않는다 (f110).
    expect(result.read.routes).not.toBe('denied');
  });

  it('선언 밖 scope 요청은 플랫폼을 건드리기 전에 invalidArgument이고 prop 이름을 말한다 (§5.7 58행)', async () => {
    const fake = createFakeWorkouts({ platform: 'android', nowMs: NOW });
    fake.setDeclared({ read: ['workouts'], write: [], history: false });
    let message = '';
    try {
      await fake.api.requestAuthorization({ read: ['workouts', 'heartRate'], history: true });
    } catch (error) {
      message = error instanceof Error ? error.message : '';
      expect(workoutsErrorCode(error)).toBe('invalidArgument');
    }
    expect(message).toContain("read: ['heartRate']");
    expect(message).toContain('history: true');
    // 요청 자체가 플랫폼에 가지 않았다.
    expect(fake.calls.some((entry) => entry.fn === 'requestPermissions')).toBe(false);
  });

  it("read: ['distance'] 단독은 invalidArgument다 (§5.7 62행)", async () => {
    const fake = createFakeWorkouts({ platform: 'ios', nowMs: NOW });
    expect(await code(fake.api.requestAuthorization({ read: ['distance'] }))).toBe('invalidArgument');
  });
});

describe('routeState 3종과 getRoute (f114 · f118 · f104 · f113 · f115)', () => {
  it('Data / NoData / ConsentRequired가 각각 available · none · consentRequired다', async () => {
    const fake = createFakeWorkouts({
      platform: 'android',
      nowMs: NOW,
      workouts: [
        { clientId: 'has', isOwn: true, startMs: START, endMs: END, route: points(3) },
        { clientId: 'empty', isOwn: true, startMs: START + 1, endMs: END },
        { clientId: 'locked', isOwn: true, startMs: START + 2, endMs: END, routeState: 'consentRequired' },
      ],
    });
    const page = await fake.api.listWorkouts({ fromMs: START - 1000, toMs: END });
    const byClient = new Map(page.items.map((workout) => [workout.clientId, workout]));
    expect(byClient.get('has')?.routeState).toBe('available');
    expect(byClient.get('empty')?.routeState).toBe('none');
    // 절대 'none'으로 붕괴시키지 않는다 — "루트가 있는데 못 본다"는 뜻이다.
    expect(byClient.get('locked')?.routeState).toBe('consentRequired');
  });

  it("consentRequired + consent:'skip'은 consentRequired를 던지고 핸들을 반납한다", async () => {
    const fake = createFakeWorkouts({
      platform: 'android',
      nowMs: NOW,
      workouts: [{ nativeId: '00000000-0000-4000-8000-0000000000aa', startMs: START, endMs: END, routeState: 'consentRequired', route: points(3) }],
    });
    let seen: string | null = null;
    try {
      for await (const chunk of fake.api.getRoute('00000000-0000-4000-8000-0000000000aa')) void chunk;
    } catch (error) {
      seen = workoutsErrorCode(error);
    }
    expect(seen).toBe('consentRequired');
    expect(fake.openRouteHandles).toBe(0);
  });

  it('f113 — 백그라운드에서는 외부 route가 읽히지 않는다', async () => {
    const fake = createFakeWorkouts({
      platform: 'android',
      nowMs: NOW,
      workouts: [{ nativeId: '00000000-0000-4000-8000-0000000000bb', isOwn: false, sourceId: 'com.other', startMs: START, endMs: END, route: points(3) }],
    });
    fake.setForeground(false);
    expect(
      await code(
        (async () => {
          for await (const chunk of fake.api.getRoute('00000000-0000-4000-8000-0000000000bb')) void chunk;
        })(),
      ),
    ).toBe('consentRequired');
  });

  it('f115 — 온보딩 미완료면 전경·권한 보유에도 외부 route가 consentRequired다', async () => {
    const fake = createFakeWorkouts({
      platform: 'android',
      nowMs: NOW,
      workouts: [{ nativeId: '00000000-0000-4000-8000-0000000000cc', isOwn: false, sourceId: 'com.other', startMs: START, endMs: END, route: points(3) }],
    });
    fake.setOnboarded(false);
    expect(
      await code(
        (async () => {
          for await (const chunk of fake.api.getRoute('00000000-0000-4000-8000-0000000000cc')) void chunk;
        })(),
      ),
    ).toBe('consentRequired');
  });

  it('f104 — Intent 오버플로에서 콜백이 영영 오지 않아도 스트림은 상한에서 끝난다 (에러가 아니다)', async () => {
    const fake = createFakeWorkouts({
      platform: 'android',
      nowMs: NOW,
      routeConsentTimeoutMs: 25,
      workouts: [{ nativeId: '00000000-0000-4000-8000-0000000000dd', startMs: START, endMs: END, routeState: 'consentRequired', route: points(3) }],
    });
    fake.hangNext('openRoute');
    const chunks: number[] = [];
    const started = Date.now();
    for await (const chunk of fake.api.getRoute('00000000-0000-4000-8000-0000000000dd', { consent: 'prompt' })) {
      chunks.push(chunk.length);
    }
    expect(chunks).toEqual([]);
    expect(Date.now() - started).toBeGreaterThanOrEqual(20);
    expect(fake.openRouteHandles).toBe(0);
  });

  it('f114 — 두 route scope를 모두 잃으면 자기가 쓴 route도 못 읽는다', async () => {
    const fake = createFakeWorkouts({
      platform: 'android',
      nowMs: NOW,
      granted: { read: ['workouts'], write: ['workouts'] },
      workouts: [{ nativeId: '00000000-0000-4000-8000-0000000000ee', isOwn: true, startMs: START, endMs: END, route: points(3) }],
    });
    expect(
      await code(
        (async () => {
          for await (const chunk of fake.api.getRoute('00000000-0000-4000-8000-0000000000ee')) void chunk;
        })(),
      ),
    ).toBe('consentRequired');
  });
});

describe('쓰기 — 사전 검사 · pendingUnlock · staleVersion · notPermitted · routeTooLarge', () => {
  it('§8.5-0 — 빠진 write scope 이름을 담아 플랫폼 호출 전에 notAuthorized다', async () => {
    const fake = createFakeWorkouts({
      platform: 'android',
      nowMs: NOW,
      granted: { read: [], write: [] },
    });
    let message = '';
    try {
      await fake.api.saveWorkout({ ...BASE_WRITE, distanceM: 5000 });
    } catch (error) {
      message = error instanceof Error ? error.message : '';
      expect(workoutsErrorCode(error)).toBe('notAuthorized');
    }
    expect(message).toContain('workouts');
    expect(message).toContain('distance');
    expect(fake.calls.some((entry) => entry.fn === 'saveWorkout')).toBe(false);
  });

  it('f70 — pendingUnlock에는 nativeId가 존재하지 않고, 같은 (id, version) 재시도가 멱등이다', async () => {
    const fake = createFakeWorkouts({ platform: 'ios', nowMs: NOW });
    fake.nextSaveIsPendingUnlock();
    const first = await fake.api.saveWorkout({ ...BASE_WRITE, route: points(10) });
    expect(first.status).toBe('pendingUnlock');
    expect(first.route).toBe('deferred');
    expect(first.routePointsWritten).toBe(0);
    // @ts-expect-error — nativeId는 이 브랜치에 **존재하지 않는다**(§5.2 SaveResult).
    expect(first.nativeId).toBeUndefined();

    const retry = await fake.api.saveWorkout({ ...BASE_WRITE, route: points(10) });
    expect(retry.status).toBe('saved');
    if (retry.status !== 'saved') return;
    expect(retry.routePointsWritten).toBe(10);
    const page = await fake.api.listWorkouts({ fromMs: START - 1000, toMs: END });
    expect(page.items.filter((workout) => workout.clientId === BASE_WRITE.id)).toHaveLength(1);
  });

  it('f93 · f94 — Android의 낮은 version은 조용한 no-op이고 read-back만이 잡는다', async () => {
    const fake = createFakeWorkouts({ platform: 'android', nowMs: NOW });
    await fake.api.saveWorkout({ ...BASE_WRITE, version: 2 });
    expect(await code(fake.api.saveWorkout({ ...BASE_WRITE, version: 1 }))).toBe('staleVersion');
    // read-back이 실제로 일어났다는 것 자체가 계약이다 (소유자 결정 ④).
    expect(fake.calls.filter((entry) => entry.fn === 'readBackVersion').length).toBeGreaterThan(0);
  });

  it('idx f26 — iOS는 sync identifier 사전 조회가 쓰기 전에 잡는다', async () => {
    const fake = createFakeWorkouts({ platform: 'ios', nowMs: NOW });
    await fake.api.saveWorkout({ ...BASE_WRITE, version: 5 });
    const before = fake.calls.filter((entry) => entry.fn === 'saveWorkout').length;
    expect(await code(fake.api.saveWorkout({ ...BASE_WRITE, version: 4 }))).toBe('staleVersion');
    expect(fake.calls.filter((entry) => entry.fn === 'saveWorkout').length).toBe(before);
  });

  it('f95 — route write scope가 없으면 워크아웃은 저장되고 route만 notPermitted다', async () => {
    const fake = createFakeWorkouts({
      platform: 'android',
      nowMs: NOW,
      granted: { read: ['workouts'], write: ['workouts'] },
    });
    const result = await fake.api.saveWorkout({ ...BASE_WRITE, route: points(10) });
    expect(result.status).toBe('saved');
    if (result.status !== 'saved') return;
    expect(result.route).toBe('notPermitted');
    expect(result.routePointsWritten).toBe(0);
  });

  it('f84 — 위생 후 0점이면 워크아웃은 저장되고 route는 dropped다', async () => {
    const fake = createFakeWorkouts({ platform: 'ios', nowMs: NOW });
    // 전부 창 밖 -> 전부 드롭.
    const result = await fake.api.saveWorkout({
      ...BASE_WRITE,
      route: points(5, START - 3_600_000),
    });
    expect(result.status).toBe('saved');
    if (result.status !== 'saved') return;
    expect(result.route).toBe('dropped');
  });

  it('f99 — Android는 20 000점을 넘으면 플랫폼 호출 전에 routeTooLarge다. iOS에는 적용하지 않는다', async () => {
    const android = createFakeWorkouts({ platform: 'android', nowMs: NOW });
    expect(await code(android.api.saveWorkout({ ...BASE_WRITE, route: points(20_001) }))).toBe('routeTooLarge');
    expect(android.calls.some((entry) => entry.fn === 'saveWorkout')).toBe(false);

    const ios = createFakeWorkouts({ platform: 'ios', nowMs: NOW });
    const result = await ios.api.saveWorkout({ ...BASE_WRITE, route: points(20_001) });
    expect(result.status).toBe('saved');
  });
});

describe('f102 — rateLimited 두 경로', () => {
  it('플랫폼이 errorCode 7을 던지면 rateLimited다', async () => {
    const fake = createFakeWorkouts({ platform: 'android', nowMs: NOW });
    fake.setRateLimited(true);
    expect(await code(fake.api.listWorkouts({ fromMs: START, toMs: END }))).toBe('rateLimited');
  });

  it('우리 ReadBudget은 플랫폼 호출 **전에** 거절하고 retryAfterMs를 준다 — 지연시키지 않는다', async () => {
    let clock = NOW;
    const budget = new ReadBudget({ now: () => clock });
    const fake = createFakeWorkouts({ platform: 'android', nowMs: NOW, budget });
    // 15분 창 한도(900)를 소진한다.
    budget.spend(900);
    let caught: unknown;
    try {
      await fake.api.listWorkouts({ fromMs: START, toMs: END });
    } catch (error) {
      caught = error;
    }
    expect(workoutsErrorCode(caught)).toBe('rateLimited');
    expect((caught as { retryAfterMs?: number }).retryAfterMs).toBeGreaterThan(0);
    // 플랫폼은 건드리지 않았다.
    expect(fake.calls.some((entry) => entry.fn === 'readWorkoutPage')).toBe(false);
    // 창이 지나가면 다시 열린다.
    clock += 900_001;
    await expect(fake.api.listWorkouts({ fromMs: START, toMs: END })).resolves.toBeDefined();
  });
});

describe('가용성 — getAvailability는 절대 던지지 않는다', () => {
  it('네이티브가 던져도 unavailable로 resolve한다', async () => {
    const fake = createFakeWorkouts({ platform: 'android', nowMs: NOW });
    fake.failNext('availability', { code: 'ERR_WORKOUTS_IO' });
    await expect(fake.api.getAvailability()).resolves.toEqual({ status: 'unavailable', reason: 'notSupported' });
  });

  it('updateRequired 상태에서 다른 호출은 실패하지만 getAvailability는 말해준다', async () => {
    const fake = createFakeWorkouts({ platform: 'android', nowMs: NOW });
    fake.setAvailability({ status: 'updateRequired' });
    await expect(fake.api.getAvailability()).resolves.toEqual({ status: 'updateRequired' });
    const state = await fake.api.getAuthorizationState();
    expect(state.availability).toBe('updateRequired');
  });
});

describe('결함 A의 회귀 방지 — seam이 던지면 언제나 WorkoutsError다', () => {
  it('19개 seam 원시 연산 어느 것이 던져도 호출자는 WorkoutsError를 본다', async () => {
    const wrapped = (member: string, run: (fake: ReturnType<typeof createFakeWorkouts>) => Promise<unknown>) => ({ member, run });
    const cases = [
      wrapped('authorizationSnapshot', (fake) => fake.api.getAuthorizationState()),
      wrapped('takeCheckpoint', (fake) => fake.api.syncWorkouts(null)),
      wrapped('grantedScopeFingerprint', (fake) => fake.api.syncWorkouts(null)),
      wrapped('readWorkoutPage', (fake) => fake.api.listWorkouts({ fromMs: START, toMs: END })),
      wrapped('readHeartRateSamples', (fake) => fake.api.readHeartRate({ fromMs: START, toMs: END })),
      wrapped('readMetricRecords', (fake) => fake.api.readSteps({ fromMs: START, toMs: END })),
      wrapped('deleteWorkout', (fake) => fake.api.deleteWorkout({ clientId: 'x' })),
      wrapped('openSettings', (fake) => fake.api.openSettings()),
      wrapped('openStoreListing', (fake) => fake.api.openStoreListing()),
      wrapped('saveWorkout', (fake) => fake.api.saveWorkout(BASE_WRITE)),
      wrapped('findBySyncIdentifier', (fake) => fake.api.saveWorkout(BASE_WRITE)),
    ];
    for (const entry of cases) {
      const fake = createFakeWorkouts({ platform: 'ios', nowMs: NOW });
      // 이것이 example 앱이 iOS에서 실제로 본 모양이다: ExpoModulesCore가 한 겹 감싼 예외.
      fake.failNext(entry.member as never, {
        message: `FunctionCallException: Calling the '${entry.member}' function has failed\n→ Caused by: WorkoutsIoException: I/O failure`,
      });
      let seen: unknown;
      try {
        await entry.run(fake);
      } catch (error) {
        seen = error;
      }
      expect(isWorkoutsError(seen), entry.member).toBe(true);
      expect(workoutsErrorCode(seen), entry.member).toBe('io');
    }
  });
});
