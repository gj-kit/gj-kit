// 네이티브 seam 계약 — `./testing`의 페이크가 `NativeWorkoutsModule` 전수를 구현하고,
// 그 위에서 도는 것이 `src/core/api.ts`의 **진짜 코드**임을 확인한다 (설계 §3.2 · §3.5 · §9.1).
//
// 이 계층이 `native` vitest 프로젝트인 이유: `tests/unit`은 "모킹 0" 규율의 대상이고, 여기는
// seam 자체(= 네이티브가 구현할 표면)를 다루는 계약 테스트다. peer는 여전히 하나도 쓰지 않는다.

import { describe, expect, it } from 'vitest';

import {
  createFakeNativeWorkouts,
  createFakeWorkouts,
  drainSync,
  type FakeSeed,
} from '../../src/testing';
import { describeCursor, workoutsErrorCode, type NativeWorkoutsModule, type RoutePoint } from '../../src/core';

/** `.rejects` 매처 대신 코드를 직접 본다 — 우리가 단언하려는 것은 **어떤 code로** 실패하는가다. */
async function rejectCode(promise: Promise<unknown>): Promise<string | null> {
  try {
    await promise;
    return null;
  } catch (error) {
    return workoutsErrorCode(error);
  }
}

/** §3.2가 선언한 seam 12+4종. 하나라도 빠지면 Phase 3 네이티브가 붙을 자리가 없다. */
const SEAM_METHODS: readonly (keyof NativeWorkoutsModule)[] = [
  'availability',
  'authorizationSnapshot',
  'requestPermissions',
  'grantedScopeFingerprint',
  'readWorkoutPage',
  'readMetricRecords',
  'readHeartRateSamples',
  'hasAssociatedSamples',
  'takeCheckpoint',
  'drainCheckpoint',
  'openRoute',
  'readRouteChunk',
  'closeRoute',
  'findBySyncIdentifier',
  'saveWorkout',
  'readBackVersion',
  'deleteWorkout',
  'openSettings',
  'openStoreListing',
];

const START = 1_754_000_000_000;
const END = START + 600_000;

function route(count: number): readonly RoutePoint[] {
  return Array.from({ length: count }, (_, i) => ({
    t: START + i * 1000,
    lat: 37.5 + i * 0.0001,
    lon: 127.0 + i * 0.0001,
  }));
}

const SEED: FakeSeed = {
  platform: 'android',
  workouts: [
    { clientId: 'w-1', isOwn: true, kind: 'running', indoor: false, startMs: START, endMs: END, distanceM: 5000, route: route(2500) },
    { kind: 'hiking', startMs: START - 86_400_000, endMs: START - 86_000_000, sourceId: 'com.other.app' },
  ],
};

describe('NativeWorkoutsModule — 페이크가 전수 구현한다', () => {
  it('seam 메서드가 하나도 빠지지 않았다', () => {
    const fake = createFakeNativeWorkouts({ platform: 'ios' });
    for (const method of SEAM_METHODS) {
      expect(typeof (fake as unknown as Record<string, unknown>)[method], method).toBe('function');
    }
    expect(SEAM_METHODS.length).toBe(19);
  });

  it('시나리오 컨트롤이 전수 존재한다 — 노브 하나가 곧 재현 가능한 Phase 0 상태다', () => {
    const fake = createFakeNativeWorkouts({ platform: 'ios' });
    for (const control of [
      'setAvailability',
      'setAuthorization',
      'addWorkout',
      'replaceWorkout',
      'removeWorkout',
      'purgeDeletion',
      'emitNoOpUpsertion',
      'expireCursor',
      'setRouteAccess',
      'setForeground',
      'setOnboarded',
      'setStoreLocked',
      'nextSaveIsPendingUnlock',
      'failNext',
    ] as const) {
      expect(typeof (fake as unknown as Record<string, unknown>)[control], control).toBe('function');
    }
    expect(fake.openRouteHandles).toBe(0);
    expect(Array.isArray(fake.calls)).toBe(true);
  });

  it('createFakeWorkouts().api는 같은 팩토리의 산출물이며 컨트롤을 그대로 갖는다', () => {
    const fake = createFakeWorkouts(SEED);
    expect(typeof fake.api.syncWorkouts).toBe('function');
    expect(typeof fake.addWorkout).toBe('function');
  });
});

describe('페이크 위에서 도는 것은 진짜 JS 계층이다', () => {
  it('listWorkouts — 창 필터 · 내림차순 · 페이지 토큰 왕복', async () => {
    const fake = createFakeWorkouts(SEED);
    const page = await fake.api.listWorkouts({ fromMs: START - 1000, toMs: END });
    expect(page.items.length).toBe(1);
    expect(page.items[0]?.clientId).toBe('w-1');
    // 활동 매핑이 seam DTO의 raw 정수에서 파생됐다 — 페이크가 kind를 직접 넘기지 않는다.
    expect(page.items[0]?.kind).toBe('running');
    expect(page.items[0]?.indoor).toBe(false);
    expect(page.items[0]?.platform).toBe('android');
  });

  it('listWorkouts — 초를 밀리초 자리에 넣으면 플랫폼 호출 전에 invalidArgument다', async () => {
    const fake = createFakeWorkouts(SEED);
    expect(await rejectCode(fake.api.listWorkouts({ fromMs: 1_754_000_000, toMs: 1_754_000_600 }))).toBe(
      'invalidArgument',
    );
  });

  it('getRoute — 1000점 청크로 스트리밍하고 다 읽으면 핸들이 0이다', async () => {
    const fake = createFakeWorkouts(SEED);
    const page = await fake.api.listWorkouts({ fromMs: START - 1000, toMs: END });
    const id = page.items[0]?.id ?? '';
    const sizes: number[] = [];
    for await (const chunk of fake.api.getRoute(id)) sizes.push(chunk.length);
    expect(sizes).toEqual([1000, 1000, 500]);
    expect(fake.openRouteHandles).toBe(0);
  });

  it('getRoute — 중간에 break해도 핸들이 반납된다 (㉑)', async () => {
    const fake = createFakeWorkouts(SEED);
    const page = await fake.api.listWorkouts({ fromMs: START - 1000, toMs: END });
    const id = page.items[0]?.id ?? '';
    for await (const chunk of fake.api.getRoute(id)) {
      expect(chunk.length).toBe(1000);
      break;
    }
    expect(fake.openRouteHandles).toBe(0);
  });

  it('getRoute — 빈 문자열과 비-UUID는 IPC 전에 invalidArgument다 (f96 · f112의 비대칭 제거)', async () => {
    const fake = createFakeWorkouts(SEED);
    for (const bad of ['', 'not-a-uuid']) {
      let code: string | null = null;
      try {
        for await (const chunk of fake.api.getRoute(bad)) void chunk;
      } catch (error) {
        code = workoutsErrorCode(error);
      }
      expect(code, bad).toBe('invalidArgument');
    }
    expect(fake.openRouteHandles).toBe(0);
  });

  it('getRoute — route가 없으면 빈 스트림이고 에러가 아니다 (idx f13 · f118)', async () => {
    const fake = createFakeWorkouts(SEED);
    const page = await fake.api.listWorkouts({ fromMs: START - 86_400_000, toMs: START - 86_000_000 });
    const id = page.items[0]?.id ?? '';
    const chunks: RoutePoint[][] = [];
    for await (const chunk of fake.api.getRoute(id)) chunks.push([...chunk]);
    expect(chunks).toEqual([]);
    expect(fake.openRouteHandles).toBe(0);
  });

  it('readHeartRate — 창 검증 후 정규화된 샘플이 나온다', async () => {
    const fake = createFakeWorkouts({
      platform: 'ios',
      workouts: [
        {
          clientId: 'hr',
          isOwn: true,
          startMs: START,
          endMs: END,
          heartRate: [
            { t: START + 2000, bpm: 150 },
            { t: START + 1000, bpm: 140 },
            { t: START + 1000, bpm: 140 },
            { t: START + 3000, bpm: 400 },
          ],
        },
      ],
    });
    expect(await fake.api.readHeartRate({ fromMs: START, toMs: END })).toEqual([
      { t: START + 1000, bpm: 140 },
      { t: START + 2000, bpm: 150 },
    ]);
  });

  it('readHeartRate — 24시간을 넘는 창은 거절한다', async () => {
    const fake = createFakeWorkouts(SEED);
    expect(await rejectCode(fake.api.readHeartRate({ fromMs: START, toMs: START + 86_400_001 }))).toBe(
      'invalidArgument',
    );
  });

  it('readSteps — 여러 origin이 있으면 합이 아니라 **가장 큰 단일 origin**이다', async () => {
    const fake = createFakeWorkouts({
      platform: 'android',
      workouts: [
        { startMs: START, endMs: END, steps: 3000, sourceId: 'com.phone' },
        { startMs: START + 1000, endMs: END, steps: 4000, sourceId: 'com.watch' },
        { startMs: START + 2000, endMs: END, steps: 1000, sourceId: 'com.watch' },
      ],
    });
    expect(await fake.api.readSteps({ fromMs: START, toMs: END })).toEqual({ count: 5000 });
  });

  it('deleteWorkout — 없는 id는 에러가 아니라 { deleted: false }다 (f96)', async () => {
    const fake = createFakeWorkouts(SEED);
    expect(await fake.api.deleteWorkout({ clientId: 'nope' })).toEqual({ deleted: false });
    expect(await fake.api.deleteWorkout({ clientId: 'w-1' })).toEqual({ deleted: true });
  });

  it('deleteWorkout — 잘못된 형태의 ref는 invalidArgument다', async () => {
    const fake = createFakeWorkouts(SEED);
    expect(await rejectCode(fake.api.deleteWorkout({ nativeId: 'not-a-uuid' }))).toBe('invalidArgument');
  });
});

describe('동기화 — 커서 왕복이 실제 seam 위에서 돈다', () => {
  it('syncWorkouts(null)은 아무것도 읽지 않고 reset:noCursor를 준다 (§4.4)', async () => {
    const fake = createFakeWorkouts(SEED);
    const first = await fake.api.syncWorkouts(null);
    expect(first.reset).toBe(true);
    if (!first.reset) return;
    expect(first.resetReason).toBe('noCursor');
    expect(first.added).toEqual([]);
    expect(first.removed).toEqual([]);
    expect(first.hasMore).toBe(false);
    expect(describeCursor(first.cursor)?.platform).toBe('android');
  });

  it('증분 드레인이 새 워크아웃을 added로 돌려준다', async () => {
    const fake = createFakeWorkouts(SEED);
    const first = await fake.api.syncWorkouts(null);
    fake.addWorkout({ clientId: 'w-2', isOwn: true, kind: 'cycling', startMs: START, endMs: END });
    const second = await fake.api.syncWorkouts(first.cursor);
    expect(second.reset).toBe(false);
    expect(second.added.map((workout) => workout.clientId)).toEqual(['w-2']);
  });

  it('망가진 커서는 던지지 않고 reset:malformed다', async () => {
    const fake = createFakeWorkouts(SEED);
    const result = await fake.api.syncWorkouts('not-a-cursor');
    expect(result.reset).toBe(true);
    if (!result.reset) return;
    expect(result.resetReason).toBe('malformed');
  });

  it('scope 지문이 바뀌면 reset:scopesChanged다', async () => {
    const fake = createFakeWorkouts(SEED);
    const first = await fake.api.syncWorkouts(null);
    fake.expireCursor('scopesChanged');
    const second = await fake.api.syncWorkouts(first.cursor);
    expect(second.reset).toBe(true);
    if (!second.reset) return;
    expect(second.resetReason).toBe('scopesChanged');
  });

  it('drainSync 헬퍼가 백필 + 드레인을 수렴시킨다', async () => {
    const fake = createFakeWorkouts(SEED);
    const result = await drainSync(fake.api, { backfillFromMs: START - 86_400_000 });
    expect(result.resets).toEqual(['noCursor']);
    expect(result.store.size).toBe(2);
    expect(result.pages).toBe(1);
  });
});

describe('failNext — 에러 **매핑**이 테스트 대상이 된다', () => {
  it('네이티브 페이로드가 공개 코드로 접힌다', async () => {
    const fake = createFakeWorkouts(SEED);
    fake.failNext('readWorkoutPage', { code: 'ERR_WORKOUTS_HISTORY_REQUIRED' });
    expect(await rejectCode(fake.api.listWorkouts({ fromMs: START, toMs: END }))).toBe('historyRequired');
  });

  it('한 번만 발화한다 — 다음 호출은 정상이다', async () => {
    const fake = createFakeWorkouts(SEED);
    fake.failNext('readHeartRateSamples', { platformCode: 8 });
    expect(await rejectCode(fake.api.readHeartRate({ fromMs: START, toMs: END }))).toBe('busy');
    expect(await fake.api.readHeartRate({ fromMs: START, toMs: END })).toEqual([]);
  });
});
