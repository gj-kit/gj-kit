// 가용성 · 인가 (설계 §5.2 · §8.8). 순수 TS — 플랫폼 호출 없이 Node에서 전부 검증된다.

import { WorkoutsError } from './errors';
import type { AuthorizationSnapshotDto, PermissionOutcomeDto } from './native-contract';
import {
  SCOPES,
  type Scope,
  type ScopeStatus,
  type RouteAccess,
  type WorkoutBase,
  type WorkoutWrite,
  type WorkoutsPlatform,
} from './types';

export type Availability =
  | { readonly status: 'available' }
  | { readonly status: 'unavailable'; readonly reason: 'platformTooOld' | 'notSupported' }
  /** Android 9–13 without the Play Health Connect provider. Pair with `openStoreListing()`. */
  | { readonly status: 'updateRequired' };

export interface AuthorizationRequest {
  /**
   * Coarse form — one token, and the recipe to copy:
   * `read: [...WORKOUT_TOTALS_SCOPES, 'routes']`.
   * Fine form — name the members: `read: ['workouts', 'heartRate']`.
   *
   * ⚠ A metric scope without `'workouts'` is `invalidArgument`. `read: ['distance']` alone is a
   *   100 % mistake — no API in this library reads distance except through a workout — so `./core`
   *   rejects it before any platform call.
   */
  readonly read: readonly Scope[];
  readonly write?: readonly Scope[] | undefined;
  /**
   * D10, opt-in. Android only. Without it, reads are walled to the last 30 days and a wider window
   * throws `historyRequired`. It ALSO needs the config-plugin `history: true` prop; requesting it
   * without the manifest entry throws `invalidArgument` naming the missing prop.
   */
  readonly history?: boolean | undefined;
}

/**
 * Availability and authorization fused into ONE union. Reading a scope's status on a platform that
 * has no usable health store is **unrepresentable** rather than merely discouraged.
 */
export type AuthorizationState =
  | { readonly availability: 'unavailable'; readonly reason: 'platformTooOld' | 'notSupported' }
  | { readonly availability: 'updateRequired' }
  | {
      readonly availability: 'available';
      /** Every scope is always present — no `undefined` holes to guard. */
      readonly read: Readonly<Record<Scope, ScopeStatus>>;
      readonly write: Readonly<Record<Scope, ScopeStatus>>;
      /** Android READ_HEALTH_DATA_HISTORY. Always `'unknown'` on iOS — that platform has no wall,
       *  and reporting a grant the user never gave would be a lying field. */
      readonly history: ScopeStatus;
      readonly routeAccess: RouteAccess;
    };

/**
 * `requestAuthorization`'s result: the state afterwards, plus whether we can attribute it to the
 * user. `conclusive: false` means the OS returned an answer we cannot attribute — on Android,
 * bouncing off Health Connect's first-run onboarding with "Go back" returns an EMPTY permission set
 * after ~20 s, byte-identical to denying everything. Treat it as "ask again later", NEVER as denial.
 */
export type AuthorizationResult = AuthorizationState & { readonly conclusive: boolean };

/** What a settings screen should do next. */
export type AuthorizationAdvice =
  | 'ready'
  | 'requestable'
  | 'openSettings'
  | 'openStoreListing'
  | 'unsupported';

/** Input for the pure derivation, so a second consumer can re-derive it from facts it stored earlier. */
export interface AuthorizationFacts {
  readonly state: AuthorizationState;
  /** The scopes THIS screen actually needs — may be narrower than everything the build declares. */
  readonly requiredRead: readonly Scope[];
  readonly requiredWrite?: readonly Scope[] | undefined;
  readonly requiresHistory?: boolean | undefined;
}

/**
 * Our opinion about what a settings screen should render, as a PURE function rather than a field on
 * `AuthorizationState`: if the platform's permission UI changes, an opinion baked into the contract
 * would be wrong in a way the raw facts would not have been. Adopt it or re-implement it.
 *
 * The one rule that matters: `'unknown'` NEVER produces `'openSettings'`. Every iOS read scope is
 * permanently `'unknown'`, so treating it as a problem would show every iOS user "go check
 * Settings" forever.
 */
export function authorizationAdvice(facts: AuthorizationFacts): AuthorizationAdvice {
  const state = facts.state;
  if (state.availability === 'unavailable') return 'unsupported';
  if (state.availability === 'updateRequired') return 'openStoreListing';

  const statuses: ScopeStatus[] = [
    ...facts.requiredRead.map((scope) => state.read[scope]),
    ...(facts.requiredWrite ?? []).map((scope) => state.write[scope]),
  ];
  if (facts.requiresHistory === true) statuses.push(state.history);

  // 'unknown'은 고발하지 않는다 (§1-5) — iOS read scope는 영구히 'unknown'이다.
  if (statuses.some((status) => status === 'denied')) return 'openSettings';
  if (statuses.some((status) => status === 'undetermined')) return 'requestable';
  return 'ready';
}

/**
 * The single table that ties every optional `Workout` metric to the ONE scope that gates it. The
 * `satisfies` clause is a live guard, not decoration: a key that is not a `WorkoutBase` field and a
 * value that is not a `Scope` are BOTH compile errors, so this table cannot drift away from
 * `Workout` or from `Scope`.
 *
 * `routeState` is deliberately absent: it is per-workout and recomputed on every read, so it can
 * never be answered from an `AuthorizationState` snapshot.
 */
export const WORKOUT_METRIC_SCOPES = {
  distanceM: 'distance',
  activeEnergyKcal: 'activeEnergy',
  elevationGainM: 'elevation',
  heartRate: 'heartRate',
  steps: 'steps',
} as const satisfies { readonly [K in keyof WorkoutBase]?: Scope };

export type WorkoutMetricField = keyof typeof WORKOUT_METRIC_SCOPES;

/**
 * READ-side answer to "why is this field `undefined` on every workout?", without a device.
 *
 * Returns the `Workout` FIELD names — not scope names — whose gating read scope is `'denied'` or
 * `'undetermined'`. `'undetermined'` is the load-bearing half: it is the exact shape of the
 * `read: ['workouts']` trap (never asked), and an implementation that only looked for `'denied'`
 * would miss the trap entirely.
 *
 * It returns ONLY what we positively know:
 * - `'unknown'` NEVER produces an accusation, so on iOS this always returns `[]`.
 * - On an unavailable / updateRequired platform it returns `[]`.
 */
export function unpopulatedWorkoutMetrics(state: AuthorizationState): readonly WorkoutMetricField[] {
  if (state.availability !== 'available') return [];
  const fields = Object.keys(WORKOUT_METRIC_SCOPES) as readonly WorkoutMetricField[];
  return fields.filter((field) => {
    const status = state.read[WORKOUT_METRIC_SCOPES[field]];
    return status === 'denied' || status === 'undetermined';
  });
}

/**
 * WRITE-side pre-flight. Derives, from the fields a `WorkoutWrite` ACTUALLY CARRIES, which write
 * scopes its single `insertRecords` transaction will need. A workout with no `distanceM` needs no
 * `'distance'` scope, so nothing is over-demanded.
 *
 * `saveWorkout` calls this BEFORE touching the store and throws `notAuthorized` naming the missing
 * scope. Without it, owner decision ②'s split would ship a hard REGRESSION: Android writes the
 * session and all five metric records in ONE transaction, so a missing `WRITE_DISTANCE` fails the
 * whole transaction and the workout is not saved at all.
 *
 * `'routes'` is the documented exception and is NEVER a throw: a missing route scope stays the
 * established non-fatal path (`SaveResult.route === 'notPermitted'`).
 *
 * `steps <= 0` deliberately does NOT demand `'steps'`: Health Connect throws on a zero-count
 * `StepsRecord`, so the library never writes one.
 */
export function requiredWriteScopes(workout: WorkoutWrite): readonly Scope[] {
  const needed = new Set<Scope>(['workouts']);
  if (workout.distanceM !== undefined) needed.add('distance');
  if (workout.activeEnergyKcal !== undefined) needed.add('activeEnergy');
  if (workout.elevationGainM !== undefined) needed.add('elevation');
  if (workout.steps !== undefined && workout.steps > 0) needed.add('steps');
  if (workout.heartRate !== undefined && workout.heartRate.length > 0) needed.add('heartRate');
  if (workout.route !== 'none' && workout.route.length > 0) needed.add('routes');
  return SCOPES.filter((scope) => needed.has(scope));
}

// ── §8.8 scope → 플랫폼 권한 (정본). `tests/fixtures/scope-mapping.json`이 이 표를 핀으로 박는다.

/** HealthKit 타입 식별자. `elevation`이 **빈 집합**인 것이 이 표의 핵심이다. */
export const IOS_SCOPE_TYPES: Readonly<Record<Scope, readonly string[]>> = {
  workouts: ['HKWorkoutTypeIdentifier'],
  // 인가는 워크아웃을 하나도 읽기 전에 단 한 번 일어난다 — 활동을 모르므로 **언제나 둘 다**.
  distance: ['HKQuantityTypeIdentifierDistanceWalkingRunning', 'HKQuantityTypeIdentifierDistanceCycling'],
  activeEnergy: ['HKQuantityTypeIdentifierActiveEnergyBurned'],
  // `HKMetadataKeyElevationAscended`는 워크아웃 위의 메타데이터라 자기 HKObjectType이 없다 →
  // iOS에서 이 scope는 `workouts`를 alias한다. 모델 전체에서 두 scope가 독립이 아닌 유일한 자리다.
  elevation: [],
  routes: ['HKWorkoutRouteTypeIdentifier'],
  heartRate: ['HKQuantityTypeIdentifierHeartRate'],
  steps: ['HKQuantityTypeIdentifierStepCount'],
};

const ANDROID_PERMISSION_PREFIX = 'android.permission.health.';

/** Health Connect READ 권한. `routes`는 **매니페스트 전용**이며 런타임 요청 집합에 넣지 않는다(f110). */
export const ANDROID_READ_PERMISSIONS: Readonly<Record<Scope, string>> = {
  workouts: `${ANDROID_PERMISSION_PREFIX}READ_EXERCISE`,
  distance: `${ANDROID_PERMISSION_PREFIX}READ_DISTANCE`,
  activeEnergy: `${ANDROID_PERMISSION_PREFIX}READ_ACTIVE_CALORIES_BURNED`,
  elevation: `${ANDROID_PERMISSION_PREFIX}READ_ELEVATION_GAINED`,
  routes: `${ANDROID_PERMISSION_PREFIX}READ_EXERCISE_ROUTES`,
  heartRate: `${ANDROID_PERMISSION_PREFIX}READ_HEART_RATE`,
  steps: `${ANDROID_PERMISSION_PREFIX}READ_STEPS`,
};

/** Health Connect WRITE 권한. `routes`만 단수형(`WRITE_EXERCISE_ROUTE`)이다. */
export const ANDROID_WRITE_PERMISSIONS: Readonly<Record<Scope, string>> = {
  workouts: `${ANDROID_PERMISSION_PREFIX}WRITE_EXERCISE`,
  distance: `${ANDROID_PERMISSION_PREFIX}WRITE_DISTANCE`,
  activeEnergy: `${ANDROID_PERMISSION_PREFIX}WRITE_ACTIVE_CALORIES_BURNED`,
  elevation: `${ANDROID_PERMISSION_PREFIX}WRITE_ELEVATION_GAINED`,
  routes: `${ANDROID_PERMISSION_PREFIX}WRITE_EXERCISE_ROUTE`,
  heartRate: `${ANDROID_PERMISSION_PREFIX}WRITE_HEART_RATE`,
  steps: `${ANDROID_PERMISSION_PREFIX}WRITE_STEPS`,
};

/** D10. 매니페스트와 런타임 요청 양쪽에 필요한 history 권한. */
export const ANDROID_HISTORY_PERMISSION = `${ANDROID_PERMISSION_PREFIX}READ_HEALTH_DATA_HISTORY`;

/**
 * 런타임 요청 집합. `'routes'`의 READ는 **절대 포함하지 않는다** — 플랫폼이 조용히 걸러내고
 * 설정 화면이나 per-route 다이얼로그에서만 부여된다(f110, f121).
 */
export function androidRuntimeRequestPermissions(request: AuthorizationRequest): readonly string[] {
  const out = new Set<string>();
  for (const scope of request.read) {
    if (scope === 'routes') continue;
    out.add(ANDROID_READ_PERMISSIONS[scope]);
  }
  for (const scope of request.write ?? []) out.add(ANDROID_WRITE_PERMISSIONS[scope]);
  if (request.history === true) out.add(ANDROID_HISTORY_PERMISSION);
  return [...out].sort();
}

/**
 * 요청 형태 검증 — 플랫폼 호출 **전에** 던진다 (§5.7 62행).
 * 메트릭 scope만 있고 `'workouts'`가 없는 요청은 100 % 실수다: 워크아웃을 통하지 않고 거리를 읽는
 * API가 이 라이브러리에 존재하지 않는다.
 */
export function assertAuthorizationRequest(request: AuthorizationRequest): void {
  const known = new Set<string>(SCOPES);
  for (const scope of [...request.read, ...(request.write ?? [])]) {
    if (!known.has(scope)) {
      throw new WorkoutsError('invalidArgument', `Unknown scope: ${String(scope)}.`);
    }
  }
  if (request.read.length === 0 && (request.write ?? []).length === 0) {
    throw new WorkoutsError('invalidArgument', 'requestAuthorization needs at least one scope.');
  }
  const metricOnly = request.read.length > 0 && !request.read.includes('workouts');
  const wantsMetric = request.read.some((scope) => scope !== 'workouts' && scope !== 'routes');
  if (metricOnly && wantsMetric) {
    throw new WorkoutsError(
      'invalidArgument',
      "A metric read scope requires 'workouts' as well — nothing in this library reads a metric except through a workout.",
    );
  }
}

// ── §8.8 도출 (Phase 3) — 스냅샷 -> `AuthorizationState`, 그리고 요청 -> seam 입력 ────────────
//
// 전부 순수 함수다. 네이티브는 **판정하지 않고** 원시 사실만 넘기고(§3.2), 판정은 여기서 한 번만
// 일어난다 — 그래서 Node에서 전수 테스트가 가능하고, Swift·Kotlin이 같은 규칙을 두 번 구현하지
// 않는다.

/** `read`/`write` 두 방향의 플랫폼 문자열. `native-contract.ts`의 `PermissionRequestDto`와 같은 모양. */
export interface DirectedPermissions {
  readonly read: readonly string[];
  readonly write: readonly string[];
}

/**
 * iOS: scope -> HK 타입 식별자, **방향별로**. 같은 식별자가 양쪽에 나오는 것이 정상이다 —
 * HealthKit은 하나의 타입에 대해 read와 share를 따로 인가한다.
 * `'elevation'`은 빈 집합이므로 어느 쪽에도 아무것도 더하지 않는다(§8.8).
 */
export function iosRequestIdentifiers(request: AuthorizationRequest): DirectedPermissions {
  const read = new Set<string>();
  const write = new Set<string>();
  for (const scope of request.read) for (const id of IOS_SCOPE_TYPES[scope]) read.add(id);
  for (const scope of request.write ?? []) for (const id of IOS_SCOPE_TYPES[scope]) write.add(id);
  return { read: [...read].sort(), write: [...write].sort() };
}

/**
 * Android: scope -> `android.permission.health.*`, 방향별로.
 * `'routes'`의 READ는 **절대 포함하지 않는다** — 플랫폼이 조용히 걸러내고 설정 화면이나 per-route
 * 다이얼로그에서만 부여된다(f110, f121). `history`는 READ 쪽에 실린다(D10).
 */
export function androidRequestPermissions(request: AuthorizationRequest): DirectedPermissions {
  const read = new Set<string>();
  const write = new Set<string>();
  for (const scope of request.read) {
    if (scope === 'routes') continue;
    read.add(ANDROID_READ_PERMISSIONS[scope]);
  }
  for (const scope of request.write ?? []) write.add(ANDROID_WRITE_PERMISSIONS[scope]);
  if (request.history === true) read.add(ANDROID_HISTORY_PERMISSION);
  return { read: [...read].sort(), write: [...write].sort() };
}

/**
 * 이 빌드가 **선언한** 집합(`declared`) 밖의 것을 요청했는지. 반환값은 소비자가 고쳐야 할
 * **config-plugin prop 이름**이다 (§5.7 58행: 메시지가 빠진 prop 이름을 말해야 한다).
 *
 * `'elevation'`은 iOS에서 빈 집합이라 선언할 것이 없으므로 여기서 절대 걸리지 않는다.
 */
export function missingDeclarations(
  request: AuthorizationRequest,
  platform: WorkoutsPlatform,
  declared: readonly string[],
): readonly string[] {
  const have = new Set(declared);
  const missing = new Set<string>();
  const needed =
    platform === 'ios' ? iosRequestIdentifiers(request) : androidRequestPermissions(request);
  const note = (scope: Scope, direction: 'read' | 'write'): void => {
    missing.add(`${direction}: ['${scope}']`);
  };
  for (const scope of request.read) {
    const ids =
      platform === 'ios'
        ? IOS_SCOPE_TYPES[scope]
        : scope === 'routes'
          ? [ANDROID_READ_PERMISSIONS[scope]]
          : [ANDROID_READ_PERMISSIONS[scope]];
    if (ids.some((id) => !have.has(id))) note(scope, 'read');
  }
  for (const scope of request.write ?? []) {
    const ids = platform === 'ios' ? IOS_SCOPE_TYPES[scope] : [ANDROID_WRITE_PERMISSIONS[scope]];
    if (ids.some((id) => !have.has(id))) note(scope, 'write');
  }
  if (request.history === true && platform === 'android' && !have.has(ANDROID_HISTORY_PERMISSION)) {
    missing.add('history: true');
  }
  void needed;
  return [...missing].sort();
}

/** 스냅샷에서 상태를 도출할 때 필요한 부가 사실. 전부 optional이며 없으면 보수적으로 판정한다. */
export interface AuthorizationDerivationFacts {
  /**
   * 방금 끝난 **결론적인** 요청에서 사용자가 실제로 거부한 플랫폼 문자열. `before`/`after` 비교의
   * 결과이며(f120이 강제하는 유일한 정직한 판정 근거), 요청이 `conclusive: false`였다면 **비어
   * 있어야 한다** — 그때 scope 상태는 불변이다.
   */
  readonly denied?: readonly string[] | undefined;
}

function iosReadStatus(snapshot: AuthorizationSnapshotDto, scope: Scope): ScopeStatus {
  // HealthKit은 읽기 인가 상태를 **원리적으로** 돌려주지 않는다(idx f14). 시트가 아직 뜰 수 있다면
  // "아직 안 물어봤다", 아니면 영구히 "알 수 없다". 이 둘 말고 다른 답은 거짓말이다.
  const ids = IOS_SCOPE_TYPES[scope];
  // `elevation`은 빈 집합이라 `workouts`를 alias한다 (§8.8).
  const effective = ids.length === 0 ? IOS_SCOPE_TYPES.workouts : ids;
  const declared = new Set(snapshot.declared);
  if (effective.some((id) => !declared.has(id))) return 'undetermined';
  return snapshot.wouldPrompt ? 'undetermined' : 'unknown';
}

function iosWriteStatus(snapshot: AuthorizationSnapshotDto, scope: Scope): ScopeStatus {
  const ids = IOS_SCOPE_TYPES[scope];
  // 빈 집합인 `elevation`은 `write.workouts`를 그대로 따른다 (§8.8).
  const effective = ids.length === 0 ? IOS_SCOPE_TYPES.workouts : ids;
  const granted = new Set(snapshot.granted);
  const statuses = snapshot.statuses ?? undefined;
  if (effective.every((id) => granted.has(id))) return 'granted';
  if (statuses !== undefined && statuses !== null) {
    if (effective.some((id) => statuses[id] === 'denied')) return 'denied';
  }
  return 'undetermined';
}

function androidStatus(
  permission: string,
  snapshot: AuthorizationSnapshotDto,
  denied: ReadonlySet<string>,
  neverDenied: boolean,
): ScopeStatus {
  if (new Set(snapshot.granted).has(permission)) return 'granted';
  if (neverDenied) return 'undetermined';
  if (denied.has(permission)) return 'denied';
  // 매니페스트에 없으면 영원히 부여될 수 없다. `'undetermined'`라고 말하면 소비자가 절대 끝나지
  // 않는 요청 루프를 돌게 되므로, "다시 물어봐야 소용없다"는 뜻의 `'denied'`가 덜 거짓말이다.
  return new Set(snapshot.declared).has(permission) ? 'undetermined' : 'denied';
}

/**
 * `AuthorizationSnapshotDto` -> `AuthorizationState`. The ONE place the platform's raw facts become
 * our vocabulary (design §8.8 + the iOS "read is permanently `unknown`" rule + the before/after
 * comparison that f120 makes the only honest source of `'denied'`).
 *
 * Every scope is always present in both records — there are no `undefined` holes to guard.
 */
export function deriveAuthorizationState(
  snapshot: AuthorizationSnapshotDto,
  facts?: AuthorizationDerivationFacts | undefined,
): AuthorizationState {
  const availability = snapshot.availability;
  if (availability.status === 'unavailable') {
    return { availability: 'unavailable', reason: availability.reason };
  }
  if (availability.status === 'updateRequired') return { availability: 'updateRequired' };

  const denied = new Set(facts?.denied ?? []);
  const read = {} as Record<Scope, ScopeStatus>;
  const write = {} as Record<Scope, ScopeStatus>;

  for (const scope of SCOPES) {
    if (snapshot.platform === 'ios') {
      read[scope] = iosReadStatus(snapshot, scope);
      write[scope] = iosWriteStatus(snapshot, scope);
      continue;
    }
    // `read.routes`는 절대 `'denied'`가 되지 않는다 — 런타임 요청 집합에 넣을 수 없는 scope를
    // 사용자가 거부했다고 말할 수는 없다(f110). 설정 화면에서만 부여된다.
    read[scope] = androidStatus(ANDROID_READ_PERMISSIONS[scope], snapshot, denied, scope === 'routes');
    write[scope] = androidStatus(ANDROID_WRITE_PERMISSIONS[scope], snapshot, denied, false);
  }

  const history: ScopeStatus =
    snapshot.platform === 'ios'
      ? // iOS에는 히스토리 벽이 없다. 사용자가 준 적 없는 권한을 `'granted'`라고 말하는 것은
        // 거짓말이고, `'denied'`도 사실이 아니다 — 알 수 없음이 정확하다(§5.2).
        'unknown'
      : snapshot.history === true
        ? 'granted'
        : androidStatus(ANDROID_HISTORY_PERMISSION, snapshot, denied, false);

  return {
    availability: 'available',
    read,
    write,
    history,
    routeAccess: snapshot.routeAccess,
  };
}

/**
 * f120's rule, as a function: a request is only evidence of DENIAL when the platform actually
 * answered. An empty returned set after the Android onboarding "Go back" is byte-identical to
 * denying everything, so it must never flip a scope to `'denied'`.
 *
 * Returns the permission strings we asked for and did not get back, or `[]` when the outcome was
 * inconclusive.
 */
export function deniedFromOutcome(
  requested: readonly string[],
  outcome: PermissionOutcomeDto,
): readonly string[] {
  if (!outcome.conclusive) return [];
  const after = new Set(outcome.after);
  return requested.filter((permission) => !after.has(permission));
}
