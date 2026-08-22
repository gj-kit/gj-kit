// 타입 픽스처 — 설계 §6.3의 ①–㉗ 중 Phase 2에서 **포팅 가능한 전부**.
//
// directive 위생 규칙(§9.2): `@ts-expect-error`가 하나도 장식이 아니어야 한다. 하나가 거짓이 되면
// TS2578(미사용 directive)로 스위트가 **스스로 감지**한다 — 설계 §6.3의 옛 ⑪ 라인이 소유자 결정 ②로
// 거짓이 됐을 때 실제로 그렇게 발각됐다.
//
// Phase 3으로 미룬 것 (전부 런타임 구현이 아니라 **모듈 위치** 문제다):
//   ⑰의 `typeof import('@gj-kit/expo-workouts').workouts` — 패키지 지정자 자기참조가 필요하다.
//      아래 ⑰'에서 `src/index.unsupported`로 같은 성질을 잠근다.
//   ⑩의 `requestRouteAccess` 부재 — 존재한 적이 없는 심볼이라 지금은 TS2304이고, 그것을 픽스처로
//      고정하면 오타 하나가 통과한다. `./core` 표면 전수 단언(아래)이 같은 일을 더 정확히 한다.

import { expectTypeOf } from 'vitest';

import {
  SCOPES,
  WORKOUT_KINDS,
  WORKOUT_METRIC_SCOPES,
  WORKOUT_TOTALS_SCOPES,
  assertNeverWorkoutsCode,
  derivePauses,
  describeCursor,
  requiredWriteScopes,
  routeElevationGainM,
  unpopulatedWorkoutMetrics,
  type AuthorizationRequest,
  type AuthorizationState,
  type CursorResetReason,
  type RouteAccess,
  type RoutePoint,
  type RouteState,
  type Scope,
  type ScopeStatus,
  type SaveResult,
  type SyncResult,
  type Workout,
  type WorkoutKind,
  type WorkoutMetricField,
  type WorkoutWrite,
  type WorkoutsApi,
  type WorkoutsErrorCode,
} from '../../src/core';
import type { GjKitWorkoutsPluginProps } from '../../src/plugin-types';
import { createFakeNativeWorkouts, createFakeWorkouts } from '../../src/testing';
import * as unsupportedEntry from '../../src/index.unsupported';

declare const api: WorkoutsApi;

// ① availability가 unavailable이면 scope에 도달할 수 없다 (V6)
declare const state: AuthorizationState;
// @ts-expect-error 'read' does not exist until `availability === 'available'`
state.read;
if (state.availability === 'available') {
  expectTypeOf(state.read.heartRate).toEqualTypeOf<ScopeStatus>();
  expectTypeOf(state.routeAccess).toEqualTypeOf<RouteAccess>();
}

// ② pendingUnlock 브랜치에 nativeId가 없다 (V5 — f70을 컴파일 타임으로 끌어온다)
declare const saved: SaveResult;
// @ts-expect-error 'nativeId' does not exist on the pendingUnlock branch
saved.nativeId;
if (saved.status === 'saved') expectTypeOf(saved.nativeId).toBeString();

// ③ route는 필수이고, 의도를 말해야 한다 (V8 — f95를 컴파일 에러로)
declare const base: Omit<WorkoutWrite, 'route'>;
// @ts-expect-error `route` is required — say `'none'` out loud
const w1: WorkoutWrite = { ...base };
const w2: WorkoutWrite = { ...base, route: 'none' };
const w3: WorkoutWrite = { ...base, route: [] }; // 컴파일은 되고 런타임 invalidArgument다
void w1;
void w2;
void w3;

// ④ WorkoutRef는 배타적이다 (V2/V3 — 후보안의 픽스처가 실제로는 통과했던 자리)
// @ts-expect-error id 종류를 밝혀야 한다
api.deleteWorkout('some-id');
// @ts-expect-error 두 키를 함께 줄 수 없다 (`?: never`가 없으면 이 줄은 통과한다)
api.deleteWorkout({ clientId: 'a', nativeId: 'b' });
void api.deleteWorkout({ clientId: 'a' });
void api.deleteWorkout({ nativeId: 'b' });

// ⑤ platformData는 platform으로 좁혀진다 — 캐스트 0 (V4)
declare const workout: Workout;
if (workout.platform === 'android') expectTypeOf(workout.platformData.exerciseType).toBeNumber();
// @ts-expect-error ios 분기에 android 필드가 없다
if (workout.platform === 'ios') workout.platformData.exerciseType;
// @ts-expect-error narrowing 없이는 읽을 수 없다
workout.platformData.activityTypeRaw;

// ⑥ reset은 boolean으로 읽히면서 resetReason을 강제한다 (V7)
declare const page: SyncResult;
const isReset: boolean = page.reset; // OK — 미션 스케치와 읽기 호환
void isReset;
// @ts-expect-error resetReason is unreachable without narrowing
page.resetReason;
if (page.reset) expectTypeOf(page.resetReason).toEqualTypeOf<CursorResetReason>();

// ⑦ 시간 인자에 단위가 붙는다
// @ts-expect-error from/to가 아니라 fromMs/toMs
void api.listWorkouts({ from: 0, to: 1 });

// ⑧ 동기화 커서와 페이지 토큰은 다른 표면이다
// @ts-expect-error SyncQuery라는 객체 형태는 없다 — 커서는 위치 인자다
void api.syncWorkouts({ cursor: null });
// @ts-expect-error 첫 호출은 null을 소리내어 말해야 한다
void api.syncWorkouts();

// ⑨ getRoute는 Promise가 아니라 청크의 AsyncIterable이다
expectTypeOf(api.getRoute('x')).toExtend<AsyncIterable<readonly RoutePoint[]>>();
expectTypeOf(api.getRoute('x')).not.toExtend<Promise<unknown>>();
// @ts-expect-error 'always'는 consent 모드가 아니다
api.getRoute('x', { consent: 'always' });

// ⑪ 닫힌 유니언
expectTypeOf<RouteState>().toEqualTypeOf<'available' | 'consentRequired' | 'none'>();
expectTypeOf<Workout['indoor']>().toEqualTypeOf<boolean | undefined>(); // f76 — false가 아니다
// @ts-expect-error 'walk'는 WorkoutKind가 아니다
const k: WorkoutKind = 'walk';
void k;

// ⑫ EOP 소비자 보호 — undefined는 흘려도 되고 null은 안 된다
declare const maybe: number | undefined;
const ok: WorkoutWrite = { ...base, route: 'none', distanceM: maybe };
void ok;
// @ts-expect-error 모노레포 EOP 규약: null은 받지 않는다
const bad: WorkoutWrite = { ...base, route: 'none', distanceM: null };
void bad;

// ⑬ 읽기 결과는 깊게 readonly
// @ts-expect-error
workout.pauses.push({ startMs: 0, endMs: 1 });
declare const syncPage: Extract<SyncResult, { reset: false }>;
// @ts-expect-error
syncPage.removed[0].id = 'x';

// ⑭ 플랫폼 토큰은 공개 표면에 없다
declare const info: NonNullable<ReturnType<typeof describeCursor>>;
// @ts-expect-error 원시 앵커/토큰은 반환되지 않는다
info.nativeToken;

// ⑮ 순수 유틸에 방어할 수 없는 기본값이 없다
declare const pts: readonly RoutePoint[];
// @ts-expect-error minRiseM은 필수다
routeElevationGainM(pts);
// @ts-expect-error minGapMs는 필수다
derivePauses(pts);

// ⑯ 소비자의 좁은 활동 유니언이 그대로 대입된다 (마찰 0의 타입 증거)
type ConsumerActivityType = 'walking' | 'hiking' | 'running' | 'cycling';
expectTypeOf<ConsumerActivityType>().toExtend<WorkoutKind>();

// ⑰ 페이크와 실물이 같은 계약이다 — 그리고 같은 팩토리의 산출물이다
expectTypeOf(createFakeWorkouts({ platform: 'ios' }).api).toEqualTypeOf<WorkoutsApi>();
expectTypeOf(createFakeNativeWorkouts()).toExtend<import('../../src/core').NativeWorkoutsModule>();

// ⑰' `.`의 표면이 `WorkoutsApi`와 정확히 같다 (패키지 지정자 자기참조 없이 같은 성질을 잠근다)
expectTypeOf(unsupportedEntry.workouts).toEqualTypeOf<WorkoutsApi>();

// ⑱ 에러 코드 소진 (닫힌 유니언 정책이 이것을 정직하게 만든다)
declare const code: WorkoutsErrorCode;
switch (code) {
  case 'unavailable':
  case 'updateRequired':
  case 'notAuthorized':
  case 'consentRequired':
  case 'historyRequired':
  case 'rateLimited':
  case 'busy':
  case 'invalidArgument':
  case 'routeTooLarge':
  case 'staleVersion':
  case 'storeLocked':
  case 'cancelled':
  case 'io':
  case 'internal':
    break;
  default:
    assertNeverWorkoutsCode(code);
}

// ⑲ 플러그인 privacyPolicyUrl은 필수다
// @ts-expect-error
const props: GjKitWorkoutsPluginProps = { read: ['workouts'] };
void props;

// ⑳ 두 "." 브랜치의 export 집합이 같다 (§2.4-D 패리티를 타입으로도 고정)
expectTypeOf<typeof import('../../src/index.unsupported')>().toEqualTypeOf<
  typeof import('../../src/index')
>();

// ㉑ Scope는 7종으로 닫혀 있고 'workouts'는 세션 scope다
expectTypeOf<Scope>().toEqualTypeOf<
  'workouts' | 'distance' | 'activeEnergy' | 'elevation' | 'routes' | 'heartRate' | 'steps'
>();
expectTypeOf<(typeof SCOPES)[number]>().toEqualTypeOf<Scope>();

// ㉑a 명명 오용 3종
// @ts-expect-error 'energy'가 아니라 'activeEnergy'다 — 이 자격어는 일부러 붙였다
const sc1: Scope = 'energy';
// @ts-expect-error 'calories'는 Android 쪽 어휘다
const sc2: Scope = 'calories';
// @ts-expect-error 'workoutRoutes'는 Android 권한 이름의 복수형이다
const sc3: Scope = 'workoutRoutes';
void sc1;
void sc2;
void sc3;

// ㉒ coarse 경로가 애노테이션 0으로 타입이 붙는다 — 결정 ② 전체가 이 픽스처에 걸려 있다
const r1: AuthorizationRequest = { read: [...WORKOUT_TOTALS_SCOPES, 'routes'] };
const r2: AuthorizationRequest = { read: WORKOUT_TOTALS_SCOPES };
const r3: AuthorizationRequest = { read: ['workouts'] };
const r4: AuthorizationRequest = {
  read: ['workouts'],
  write: [...WORKOUT_TOTALS_SCOPES, 'routes'],
};
void r1;
void r2;
void r3;
void r4;

// ㉓ 상수는 얼어 있다
// @ts-expect-error readonly tuple에는 push가 없다 (TS2339)
WORKOUT_TOTALS_SCOPES.push('routes');
// @ts-expect-error readonly tuple 원소는 대입 불가 (TS2540)
WORKOUT_TOTALS_SCOPES[0] = 'routes';
// @ts-expect-error 'elevationGain'은 Scope가 아니다 — TS가 'elevation'을 제안한다
const badScopes: readonly Scope[] = [...WORKOUT_TOTALS_SCOPES, 'elevationGain'];
void badScopes;

// ㉔ routeAccess는 ScopeStatus가 **아니다**
declare const available: Extract<AuthorizationState, { availability: 'available' }>;
expectTypeOf(available.read.routes).toEqualTypeOf<ScopeStatus>();
expectTypeOf(available.routeAccess).toEqualTypeOf<RouteAccess>();
// @ts-expect-error 두 어휘는 구조적으로 겹치지 않는다 (TS2367 'no overlap')
const overlap = available.routeAccess === 'granted';
void overlap;

// ㉔a Record<Scope, ScopeStatus>는 7키 전수다
// @ts-expect-error 여섯 키가 빠졌다 (TS2740)
const partialScopes: Readonly<Record<Scope, ScopeStatus>> = { workouts: 'granted' };
void partialScopes;

// ㉕ 메트릭 표는 실재하는 Workout 필드만 담고 routeState는 담지 않는다
expectTypeOf<WorkoutMetricField>().toEqualTypeOf<
  'distanceM' | 'activeEnergyKcal' | 'elevationGainM' | 'heartRate' | 'steps'
>();
// @ts-expect-error routeState는 워크아웃별이라 AuthorizationState 스냅샷에서 답할 수 없다
WORKOUT_METRIC_SCOPES.routeState;

// ㉕a 읽기 측 파생은 **필드 이름**으로 답한다 (scope 이름이 아니다)
// @ts-expect-error TS가 'distanceM'에 대해 'distance'를 제안한다 — 이 픽스처가 막는 혼동 그 자체
const asScopes: readonly Scope[] = unpopulatedWorkoutMetrics(available);
void asScopes;

// ㉖ 쓰기 측 파생은 **scope**로 답하고, 결정 ①이 여기까지 전파된다
expectTypeOf(requiredWriteScopes({ ...base, route: 'none' })).toEqualTypeOf<readonly Scope[]>();
// @ts-expect-error `route` 없는 WorkoutWrite는 존재하지 않는다 (TS2345)
requiredWriteScopes({ id: 'x', version: 1, kind: 'running', startMs: 1, endMs: 2 });

// ㉗ WorkoutKind는 9종이다 (D11 개정)
expectTypeOf<(typeof WORKOUT_KINDS)[number]>().toEqualTypeOf<WorkoutKind>();
const k1: WorkoutKind = 'swimming';
const k2: WorkoutKind = 'wheelchair';
void k1;
void k2;
// @ts-expect-error 'skiing'은 §8.3 기각표의 항목이다 (플랫폼 간 의미 불일치)
const k3: WorkoutKind = 'skiing';
void k3;
