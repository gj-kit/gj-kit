// `"."`의 node/browser 브랜치 — **Phase 2에서 완결된 경로** (설계 §2.2 · §3.1 · §5.7 2행).
//
// 이 스위트가 미션 §4.1의 "import는 절대 던지지 않고, 결정적으로 unavailable을 돌려준다"를
// 사실로 만든다. 소스가 아니라 실제 모듈을 로드해서 12개 함수를 전부 호출한다.

import { describe, expect, it } from 'vitest';

import { createWorkoutsApi, isWorkoutsError, workoutsErrorCode, type WorkoutsApi } from '../../src/core';
import * as unsupportedEntry from '../../src/index.unsupported';

const REJECTING: readonly (keyof WorkoutsApi)[] = [
  'requestAuthorization',
  'getAuthorizationState',
  'listWorkouts',
  'syncWorkouts',
  'readHeartRate',
  'readSteps',
  'saveWorkout',
  'deleteWorkout',
  'openSettings',
  'openStoreListing',
];

describe('createWorkoutsApi(null) — 12개 함수 전수', () => {
  const api = createWorkoutsApi(null);

  it('getAvailability만 resolve한다 — 이 런타임에 스토어가 없다는 것은 에러가 아니다', async () => {
    await expect(api.getAvailability()).resolves.toEqual({
      status: 'unavailable',
      reason: 'notSupported',
    });
  });

  for (const name of REJECTING) {
    it(`${name}는 unavailable로 reject한다`, async () => {
      const fn = api[name] as (...args: readonly unknown[]) => Promise<unknown>;
      try {
        await fn({ fromMs: 1_755_000_000_000, toMs: 1_755_000_600_000 });
        throw new Error('reject했어야 한다');
      } catch (error) {
        expect(isWorkoutsError(error), `${name}가 우리 에러를 던지지 않았다`).toBe(true);
        expect(workoutsErrorCode(error)).toBe('unavailable');
      }
    });
  }

  it('getRoute는 **lazy**하다 — 반복을 시작해야 던진다 (AsyncIterable 계약)', async () => {
    const stream = api.getRoute('00000000-0000-4000-8000-000000000001');
    expect(typeof stream[Symbol.asyncIterator]).toBe('function');
    try {
      for await (const chunk of stream) void chunk;
      throw new Error('reject했어야 한다');
    } catch (error) {
      expect(workoutsErrorCode(error)).toBe('unavailable');
    }
  });

  it('함수는 정확히 12개다', () => {
    expect(REJECTING.length + 2).toBe(12);
  });
});

describe('src/index.unsupported — 엔트리 표면', () => {
  it('12개 이름과 workouts 객체를 내보낸다', () => {
    for (const name of [...REJECTING, 'getAvailability', 'getRoute'] as const) {
      expect(typeof (unsupportedEntry as unknown as Record<string, unknown>)[name], name).toBe(
        'function',
      );
    }
    expect(typeof unsupportedEntry.workouts).toBe('object');
  });

  it('구조분해된 함수는 `workouts`의 프로퍼티 **그 자체**다 (두 번째 구현이 아니다)', () => {
    expect(unsupportedEntry.getAvailability).toBe(unsupportedEntry.workouts.getAvailability);
    expect(unsupportedEntry.syncWorkouts).toBe(unsupportedEntry.workouts.syncWorkouts);
  });

  it('`./core`의 표면을 그대로 재export한다', () => {
    expect(unsupportedEntry.WORKOUT_KINDS.length).toBe(9);
    expect(typeof unsupportedEntry.createWorkoutsApi).toBe('function');
    expect(typeof unsupportedEntry.isWorkoutsError).toBe('function');
  });

  it('모듈을 로드하는 것만으로는 아무 일도 일어나지 않는다 — top-level side effect 0', async () => {
    await expect(unsupportedEntry.getAvailability()).resolves.toEqual({
      status: 'unavailable',
      reason: 'notSupported',
    });
  });
});
