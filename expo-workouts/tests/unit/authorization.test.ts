// 인가 도출 2종 + advice + §8.8 매핑 (설계 §5.2 · §6.1-㉖㉗ · §9.1).

import { describe, expect, it } from 'vitest';

import mapping from '../fixtures/scope-mapping.json';
import {
  ANDROID_HISTORY_PERMISSION,
  ANDROID_READ_PERMISSIONS,
  ANDROID_WRITE_PERMISSIONS,
  IOS_SCOPE_TYPES,
  SCOPES,
  WORKOUT_METRIC_SCOPES,
  WORKOUT_TOTALS_SCOPES,
  androidRuntimeRequestPermissions,
  authorizationAdvice,
  requiredWriteScopes,
  unpopulatedWorkoutMetrics,
  workoutsErrorCode,
  type AuthorizationState,
  type Scope,
  type ScopeStatus,
  type WorkoutWrite,
} from '../../src/core';
import { assertAuthorizationRequest } from '../../src/core/authorization';

function stateWith(read: Partial<Record<Scope, ScopeStatus>>, write: Partial<Record<Scope, ScopeStatus>> = {}): AuthorizationState {
  const fill = (partial: Partial<Record<Scope, ScopeStatus>>): Record<Scope, ScopeStatus> => {
    const out = {} as Record<Scope, ScopeStatus>;
    for (const scope of SCOPES) out[scope] = partial[scope] ?? 'undetermined';
    return out;
  };
  return {
    availability: 'available',
    read: fill(read),
    write: fill(write),
    history: 'undetermined',
    routeAccess: 'own',
  };
}

const BASE_WRITE: WorkoutWrite = {
  id: 'workout-1',
  version: 1,
  kind: 'running',
  startMs: 1_755_000_000_000,
  endMs: 1_755_000_600_000,
  route: 'none',
};

describe('Scope 어휘 (소유자 결정 ②)', () => {
  it('7종으로 닫혀 있고 순서가 고정돼 있다', () => {
    expect([...SCOPES]).toEqual([
      'workouts',
      'distance',
      'activeEnergy',
      'elevation',
      'routes',
      'heartRate',
      'steps',
    ]);
  });

  it("WORKOUT_TOTALS_SCOPES는 'routes'를 일부러 포함하지 않는다", () => {
    expect([...WORKOUT_TOTALS_SCOPES]).toEqual(['workouts', 'distance', 'activeEnergy', 'elevation']);
    expect(WORKOUT_TOTALS_SCOPES).not.toContain('routes');
  });

  it('메트릭 표는 실재하는 Workout 필드만 담고 routeState는 담지 않는다', () => {
    expect(Object.keys(WORKOUT_METRIC_SCOPES).sort()).toEqual([
      'activeEnergyKcal',
      'distanceM',
      'elevationGainM',
      'heartRate',
      'steps',
    ]);
    expect(Object.keys(WORKOUT_METRIC_SCOPES)).not.toContain('routeState');
  });
});

describe('unpopulatedWorkoutMetrics — 읽기 함정을 기기 없이 이름으로 답한다 (㉖)', () => {
  it("read: ['workouts']만이면 다섯 필드 전부를 돌려준다", () => {
    expect(unpopulatedWorkoutMetrics(stateWith({ workouts: 'granted' }))).toEqual([
      'distanceM',
      'activeEnergyKcal',
      'elevationGainM',
      'heartRate',
      'steps',
    ]);
  });

  it('totals가 전부 granted면 heartRate·steps만 남는다', () => {
    const granted = Object.fromEntries(
      WORKOUT_TOTALS_SCOPES.map((scope) => [scope, 'granted' as ScopeStatus]),
    ) as Partial<Record<Scope, ScopeStatus>>;
    expect(unpopulatedWorkoutMetrics(stateWith(granted))).toEqual(['heartRate', 'steps']);
  });

  it("'undetermined'가 'denied'와 동등하게 잡힌다 — 그것이 함정의 실제 모양이다", () => {
    const denied = unpopulatedWorkoutMetrics(stateWith({ distance: 'denied' }));
    const never = unpopulatedWorkoutMetrics(stateWith({ distance: 'undetermined' }));
    expect(denied).toContain('distanceM');
    expect(never).toContain('distanceM');
  });

  it("iOS처럼 전부 'unknown'이면 []다 — 'unknown'은 고발하지 않는다 (§1-5)", () => {
    const unknown = Object.fromEntries(SCOPES.map((scope) => [scope, 'unknown' as ScopeStatus]));
    expect(unpopulatedWorkoutMetrics(stateWith(unknown))).toEqual([]);
  });

  it('unavailable / updateRequired면 []다', () => {
    expect(unpopulatedWorkoutMetrics({ availability: 'unavailable', reason: 'notSupported' })).toEqual([]);
    expect(unpopulatedWorkoutMetrics({ availability: 'updateRequired' })).toEqual([]);
  });
});

describe('requiredWriteScopes — 쓰기 회귀 방지 (㉗)', () => {
  it("맨 { route: 'none' } 워크아웃은 ['workouts']만 필요하다", () => {
    expect(requiredWriteScopes(BASE_WRITE)).toEqual(['workouts']);
  });

  it("전부 채운 워크아웃 + steps:0 -> 'steps'가 **없다** (idx f44)", () => {
    const full: WorkoutWrite = {
      ...BASE_WRITE,
      distanceM: 5000,
      activeEnergyKcal: 300,
      elevationGainM: 40,
      steps: 0,
      heartRate: [{ t: BASE_WRITE.startMs + 1, bpm: 150 }],
      route: [{ t: BASE_WRITE.startMs + 1, lat: 37.5, lon: 127 }],
    };
    expect(requiredWriteScopes(full)).toEqual([
      'workouts',
      'distance',
      'activeEnergy',
      'elevation',
      'routes',
      'heartRate',
    ]);
  });

  it('steps > 0이면 steps scope가 붙는다', () => {
    expect(requiredWriteScopes({ ...BASE_WRITE, steps: 10 })).toContain('steps');
  });

  it("route: 'none'은 'routes'를 요구하지 않는다", () => {
    expect(requiredWriteScopes(BASE_WRITE)).not.toContain('routes');
  });

  it('결과는 언제나 SCOPES의 선언 순서를 따른다 — 메시지가 안정적이어야 한다', () => {
    const scopes = requiredWriteScopes({
      ...BASE_WRITE,
      steps: 5,
      distanceM: 1,
      heartRate: [{ t: BASE_WRITE.startMs, bpm: 100 }],
    });
    expect(scopes).toEqual([...scopes].sort((a, b) => SCOPES.indexOf(a) - SCOPES.indexOf(b)));
  });
});

describe('authorizationAdvice — unknown은 절대 openSettings를 만들지 않는다', () => {
  it('unavailable -> unsupported, updateRequired -> openStoreListing', () => {
    expect(
      authorizationAdvice({
        state: { availability: 'unavailable', reason: 'platformTooOld' },
        requiredRead: ['workouts'],
      }),
    ).toBe('unsupported');
    expect(
      authorizationAdvice({ state: { availability: 'updateRequired' }, requiredRead: ['workouts'] }),
    ).toBe('openStoreListing');
  });

  it('denied가 하나라도 있으면 openSettings다', () => {
    expect(
      authorizationAdvice({ state: stateWith({ workouts: 'denied' }), requiredRead: ['workouts'] }),
    ).toBe('openSettings');
  });

  it('undetermined면 requestable이다', () => {
    expect(
      authorizationAdvice({ state: stateWith({ workouts: 'undetermined' }), requiredRead: ['workouts'] }),
    ).toBe('requestable');
  });

  it('iOS처럼 전부 unknown이면 ready다 — 그러지 않으면 모든 iOS 사용자가 영원히 설정 화면을 본다', () => {
    const unknown = Object.fromEntries(SCOPES.map((scope) => [scope, 'unknown' as ScopeStatus]));
    expect(
      authorizationAdvice({ state: stateWith(unknown), requiredRead: [...SCOPES] }),
    ).toBe('ready');
  });

  it('필요한 것만 본다 — 화면이 요구하지 않은 scope의 denied는 무시된다', () => {
    expect(
      authorizationAdvice({
        state: stateWith({ workouts: 'granted', steps: 'denied' }),
        requiredRead: ['workouts'],
      }),
    ).toBe('ready');
  });

  it('history가 필요하면 그 상태도 본다', () => {
    const state = stateWith({ workouts: 'granted' });
    expect(
      authorizationAdvice({ state, requiredRead: ['workouts'], requiresHistory: true }),
    ).toBe('requestable');
  });
});

describe('assertAuthorizationRequest — 플랫폼 호출 전에 거절한다 (§5.7 62행)', () => {
  it("read: ['distance'] 단독은 invalidArgument다", () => {
    try {
      assertAuthorizationRequest({ read: ['distance'] });
      throw new Error('던졌어야 한다');
    } catch (error) {
      expect(workoutsErrorCode(error)).toBe('invalidArgument');
    }
  });

  it("read: ['routes'] 단독은 허용한다 — routes는 메트릭이 아니다", () => {
    expect(() => assertAuthorizationRequest({ read: ['routes'] })).not.toThrow();
  });

  it('coarse 레시피는 그대로 통과한다', () => {
    expect(() =>
      assertAuthorizationRequest({ read: [...WORKOUT_TOTALS_SCOPES, 'routes'] }),
    ).not.toThrow();
  });

  it('빈 요청과 모르는 scope는 invalidArgument다', () => {
    expect(workoutsErrorCode(catchOf(() => assertAuthorizationRequest({ read: [] })))).toBe('invalidArgument');
    expect(
      workoutsErrorCode(catchOf(() => assertAuthorizationRequest({ read: ['energy' as Scope] }))),
    ).toBe('invalidArgument');
  });
});

describe('§8.8 scope -> 플랫폼 권한 — 골든 파일과 대조', () => {
  it('iOS 타입 표가 픽스처와 일치한다 (elevation은 빈 집합이다)', () => {
    for (const scope of SCOPES) {
      expect([...IOS_SCOPE_TYPES[scope]], scope).toEqual(mapping.ios[scope]);
    }
    expect(IOS_SCOPE_TYPES.elevation).toEqual([]);
    // distance는 **언제나 둘 다** — 인가 시점에 워크아웃의 활동을 알 수 없다.
    expect(IOS_SCOPE_TYPES.distance.length).toBe(2);
  });

  it('Android READ/WRITE 표가 픽스처와 일치한다', () => {
    for (const scope of SCOPES) {
      expect(ANDROID_READ_PERMISSIONS[scope], scope).toBe(mapping.androidRead[scope]);
      expect(ANDROID_WRITE_PERMISSIONS[scope], scope).toBe(mapping.androidWrite[scope]);
    }
    expect(ANDROID_HISTORY_PERMISSION).toBe(mapping.androidHistory);
    // 단수형은 route write 하나뿐이다.
    expect(ANDROID_WRITE_PERMISSIONS.routes.endsWith('WRITE_EXERCISE_ROUTE')).toBe(true);
  });

  it('READ_EXERCISE_ROUTES는 런타임 요청 집합에 **절대** 들어가지 않는다 (f110)', () => {
    const requested = androidRuntimeRequestPermissions({ read: [...SCOPES], write: ['routes'] });
    expect(requested).not.toContain(ANDROID_READ_PERMISSIONS.routes);
    expect(mapping.manifestOnly).toContain(ANDROID_READ_PERMISSIONS.routes);
    // 반면 WRITE_EXERCISE_ROUTE는 요청 가능하다.
    expect(requested).toContain(ANDROID_WRITE_PERMISSIONS.routes);
  });

  it('history: true면 READ_HEALTH_DATA_HISTORY가 붙는다 (D10)', () => {
    expect(androidRuntimeRequestPermissions({ read: ['workouts'], history: true })).toContain(
      ANDROID_HISTORY_PERMISSION,
    );
    expect(androidRuntimeRequestPermissions({ read: ['workouts'] })).not.toContain(
      ANDROID_HISTORY_PERMISSION,
    );
  });
});

function catchOf(run: () => unknown): unknown {
  try {
    run();
    return null;
  } catch (error) {
    return error;
  }
}
