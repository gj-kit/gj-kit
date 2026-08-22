// `"./testing"` — **네이티브 seam**의 인메모리 페이크 (설계 §3.5 · §5.4).
//
// 핵심: 페이크하는 것은 `WorkoutsApi`가 **아니라** `NativeWorkoutsModule`이다. 그래야 페이크 위에서
// 도는 것이 `src/core/api.ts`의 진짜 코드가 되고, DTO 정규화 · sentinel 정리 · 에러 코드 매핑 ·
// 스트림 래퍼와 취소 · 창 검증이 CI에서 우회되지 않는다.
//
// 여기는 **노브가 많아도 된다** — 최소화 예산은 프로덕션 표면에만 적용된다. 노브 하나가 곧
// 재현 가능한 Phase 0 상태다. Phase 3의 목표는 "Phase 0가 측정한 모든 상태에 도달 가능"이며,
// 도달 **불가능한** 것은 `createFakeNativeWorkouts`의 JSDoc에 이름을 적어 남긴다.

import {
  ANDROID_HISTORY_PERMISSION,
  ANDROID_READ_PERMISSIONS,
  ANDROID_WRITE_PERMISSIONS,
  IOS_SCOPE_TYPES,
  SCOPES,
  createWorkoutsApi,
  requiredWriteScopes,
  type Availability,
  type AuthorizationSnapshotDto,
  type AuthorizationState,
  type AvailabilityDto,
  type CursorResetReason,
  type DeleteRefDto,
  type DrainBatchDto,
  type ExistingWorkoutDto,
  type HeartRateDto,
  type HeartRateSample,
  type MetricRowDto,
  type MetricTypeDto,
  type NativePayloadDto,
  type NativeWorkoutsModule,
  type PermissionOutcomeDto,
  type PermissionRequestDto,
  type QuantityKindDto,
  type ReadBudget,
  type RouteAccess,
  type RouteHandleDto,
  type RoutePoint,
  type RoutePointDto,
  type RouteState,
  type RouteWriteOutcome,
  type SaveOutcomeDto,
  type Scope,
  type WindowDto,
  type Workout,
  type WorkoutDto,
  type WorkoutKind,
  type WorkoutPageDto,
  type WorkoutWriteDto,
  type WorkoutsApi,
  type WorkoutsPlatform,
  type WorkoutsSyncCursor,
  androidExerciseTypeFromKind,
  iosActivityTypeFromKind,
} from './core';

/** 결정적 기본 instant — 스냅샷과 예산 테스트가 흔들리지 않게 고정돼 있다. */
const DEFAULT_NOW_MS = 1_755_000_000_000;

/** scope 집합을 seed와 컨트롤에서 같은 모양으로 받는다. */
export interface FakeScopeGrants {
  readonly read?: readonly Scope[] | undefined;
  readonly write?: readonly Scope[] | undefined;
  readonly history?: boolean | undefined;
}

/** 권한 요청이 어떻게 끝나는가 — 셋 다 Phase 0가 실제로 관측한 결말이다. */
export type FakePermissionOutcome =
  /** 사용자가 요청 집합을 전부 허용한다. */
  | 'grant'
  /** 사용자가 "Don't allow"를 누른다 — 결론적인 거부다. */
  | 'deny'
  /** f120: 온보딩 "Go back". 19.6 s 뒤 **빈 집합**, 전면 거부와 API 표면에서 구별 불가. */
  | 'inconclusive';

export interface FakeWorkoutInput {
  /** 생략하면 페이크가 결정적 UUID를 만든다. */
  readonly nativeId?: string | undefined;
  readonly clientId?: string | undefined;
  readonly isOwn?: boolean | undefined;
  readonly kind?: WorkoutKind | undefined;
  readonly indoor?: boolean | undefined;
  readonly startMs: number;
  readonly endMs: number;
  readonly distanceM?: number | undefined;
  readonly activeEnergyKcal?: number | undefined;
  readonly elevationGainM?: number | undefined;
  readonly steps?: number | undefined;
  readonly heartRate?: readonly HeartRateSample[] | undefined;
  /** 있으면 `routeState`는 기본적으로 `'available'`이 된다. */
  readonly route?: readonly RoutePoint[] | undefined;
  readonly routeState?: RouteState | undefined;
  readonly sourceId?: string | undefined;
}

export interface FakeSeed {
  readonly platform: WorkoutsPlatform;
  readonly availability?: Availability | undefined;
  readonly authorization?: AuthorizationState | undefined;
  /** 이미 부여된 scope. 생략하면 **전부 부여**돼 있다 — 대부분의 테스트가 인가를 소재로 하지 않는다. */
  readonly granted?: FakeScopeGrants | undefined;
  /** 이 빌드가 **선언한** scope (config plugin). 생략하면 전부. 선언 밖 요청은 `invalidArgument`다. */
  readonly declared?: FakeScopeGrants | undefined;
  readonly workouts?: readonly FakeWorkoutInput[] | undefined;
  /** Deterministic clock. Defaults to a fixed instant so snapshots and budget tests are stable. */
  readonly nowMs?: number | undefined;
  /** `createFakeWorkouts`가 만드는 API에 그대로 넘어간다. `null`이면 읽기 페이서를 끈다. */
  readonly budget?: ReadBudget | null | undefined;
  /** per-route 동의 상한 (f104). 짧은 값 + `hangNext('openRoute')`가 그 상태를 재현한다. */
  readonly routeConsentTimeoutMs?: number | undefined;
}

/** An in-memory `NativeWorkoutsModule`. THIS is what tests drive; the real JS layer runs on top. */
export interface FakeNativeWorkouts extends NativeWorkoutsModule {
  // -- scenario controls — each one maps to a Phase 0 measurement ------------
  setAvailability(availability: Availability): void;
  setAuthorization(state: AuthorizationState): void;
  /** Grant scopes directly — the shape the fake actually stores. */
  authorize(grants: FakeScopeGrants): void;
  /** What this build DECLARED. Requesting outside it is `invalidArgument` naming the missing prop. */
  setDeclared(declared: FakeScopeGrants): void;
  /** How the NEXT `requestPermissions` ends. `'inconclusive'` is f120's onboarding "Go back". */
  setNextPermissionOutcome(outcome: FakePermissionOutcome): void;
  /** Returns the native id. */
  addWorkout(workout: FakeWorkoutInput): string;
  /** Platform-faithful replacement: iOS mints a NEW native id and emits `removed{replaced:true}`
   *  in the same drain batch; Android keeps the SAME id and emits only an upsertion change. */
  replaceWorkout(nativeId: string, patch: Partial<FakeWorkoutInput>): string;
  removeWorkout(nativeId: string): void;
  /** HealthKit purging a deletion record before we drain it — the workout vanishes with no `removed`. */
  purgeDeletion(nativeId: string): void;
  /** Android: emit an upsertion change carrying an UNCHANGED record — the undetectable stale-version no-op. */
  emitNoOpUpsertion(nativeId: string): void;
  /** Force `reset: true` with a chosen reason on the next sync — reaches all six `CursorResetReason`s. */
  expireCursor(reason?: CursorResetReason | undefined): void;
  setRouteAccess(access: RouteAccess): void;
  /** Process importance — the only way to reach the background-route path without a device. */
  setForeground(foreground: boolean): void;
  /** Health Connect first-run onboarding: foreign routes read `consentRequired` while this is false
   *  even with the permission held and the app in the foreground. */
  setOnboarded(onboarded: boolean): void;
  /** iOS: protected data unavailable — the `storeLocked` pre-check path. */
  setStoreLocked(locked: boolean): void;
  /** iOS: make the next save return (nil workout, nil error) — the case Phase 0 could not reproduce. */
  nextSaveIsPendingUnlock(): void;
  /** f102: every read primitive raises Health Connect's overloaded `errorCode 7` while this is on. */
  setRateLimited(rateLimited: boolean): void;
  /** f109: `readMetricRecords` returns NOTHING, so every total stays `undefined` — never `0`. */
  setMetricsMissing(missing: boolean): void;
  /** Make the next call to one seam primitive throw a platform-shaped payload, so the error MAPPING
   *  (not just the mapped result) is what the test exercises. */
  failNext(primitive: keyof NativeWorkoutsModule, payload: NativePayloadDto): void;
  /**
   * f104: make the next call to one seam primitive **never settle**. The Intent-overflow failure is
   * not an error — the ActivityResult callback simply never fires — so the only faithful fake is a
   * promise that hangs and lets the caller's timeout be the thing under test.
   */
  hangNext(primitive: keyof NativeWorkoutsModule): void;
  /** Unreleased route handles. A test asserts this is 0 after every `for await`. */
  readonly openRouteHandles: number;
  readonly calls: readonly { readonly fn: keyof NativeWorkoutsModule; readonly atMs: number }[];
}

/** Convenience wrapper: `createWorkoutsApi(native)` plus the same controls. */
export interface FakeWorkouts extends FakeNativeWorkouts {
  readonly api: WorkoutsApi;
}

interface StoredWorkout {
  nativeId: string;
  input: FakeWorkoutInput;
  version: number;
}

function availabilityToDto(availability: Availability): AvailabilityDto {
  if (availability.status === 'available') return { status: 'available' };
  if (availability.status === 'updateRequired') return { status: 'updateRequired' };
  return { status: 'unavailable', reason: availability.reason };
}

function scopeSet(scopes: readonly Scope[] | undefined, fallback: readonly Scope[]): Set<Scope> {
  return new Set(scopes ?? fallback);
}

/**
 * Produce a cursor that forces one specific `CursorResetReason`, so a test can reach all SIX
 * without hand-rolling cursor strings. Three of them (`expired`, `scopesChanged`, `noCursor`) are
 * facts about the store or the call rather than about the string — for those this returns the
 * cursor unchanged (`null` for `noCursor`) and `expireCursor()` is the control that produces them.
 */
export function corruptCursor(cursor: WorkoutsSyncCursor, reason: CursorResetReason): WorkoutsSyncCursor | null {
  switch (reason) {
    case 'noCursor':
      return null;
    case 'malformed':
      return 'definitely-not-one-of-our-cursors';
    case 'formatUnsupported':
      return cursor.replace(/^gjw\d+\./, 'gjw9999.');
    case 'platformMismatch':
      return cursor.replace(/^(gjw\d+)\.([ia])\./, (_all, head: string, tag: string) =>
        `${head}.${tag === 'i' ? 'a' : 'i'}.`,
      );
    default:
      return cursor;
  }
}

/**
 * An in-memory `NativeWorkoutsModule`.
 *
 * ⚠ **The fake HONOURS SCOPES**: seed a fully-populated workout, authorize with only `['workouts']`,
 * and `listWorkouts` hands back `distanceM: undefined`. The read trap becomes reproducible in
 * `pnpm test`, on Node, in the CONSUMER'S OWN suite. The write side is symmetric: saving a workout
 * whose `requiredWriteScopes()` are not all granted rejects with `notAuthorized` naming the missing
 * scope, exactly as Android would.
 *
 * **States this fake still cannot reach** (they are platform facts with no seam representation):
 *  - iOS `pendingUnlock` caused by `finishRoute` failing while locked — the seam reports one
 *    `SaveOutcomeDto`, so the fake can produce `pendingUnlock`, but not the sub-case where the
 *    workout landed and only the route builder failed (f70 was never reproduced on a device either).
 *  - Health Connect's 30-day history wall silently TRUNCATING a large read (f46 in §5.7) — the
 *    platform gives no signal, so nothing downstream can be asserted.
 *  - `FLAG_PERMISSION_USER_FIXED` ("routes never work again, silently") — Phase 0 never reached it,
 *    so there is no measured behaviour to imitate.
 */
export function createFakeNativeWorkouts(seed?: FakeSeed): FakeNativeWorkouts {
  const platform: WorkoutsPlatform = seed?.platform ?? 'ios';
  const nowMs = seed?.nowMs ?? DEFAULT_NOW_MS;
  let availability: Availability = seed?.availability ?? { status: 'available' };
  let grantedRead = scopeSet(seed?.granted?.read, SCOPES);
  let grantedWrite = scopeSet(seed?.granted?.write, SCOPES);
  let grantedHistory = seed?.granted?.history ?? true;
  let declaredRead = scopeSet(seed?.declared?.read, SCOPES);
  let declaredWrite = scopeSet(seed?.declared?.write, SCOPES);
  let declaredHistory = seed?.declared?.history ?? true;
  let deniedRead = new Set<Scope>();
  let deniedWrite = new Set<Scope>();
  let routeAccess: RouteAccess = platform === 'ios' ? 'all' : 'own';
  let foreground = true;
  let onboarded = true;
  let storeLocked = false;
  let pendingUnlockNext = false;
  let rateLimited = false;
  let metricsMissing = false;
  let permissionOutcome: FakePermissionOutcome = 'grant';
  let forcedReset: CursorResetReason | null = null;

  const store = new Map<string, StoredWorkout>();
  /**
   * **재생 가능한** 변경 로그. 체크포인트는 이 배열의 워터마크(문자열 정수)이고, 같은 체크포인트로
   * 두 번 드레인하면 **같은 답**이 나온다 — HK 앵커와 HC changes token이 실제로 그렇게 동작하고,
   * 그것이 §4.4의 갭 없음 증명의 전제다. 큐를 splice하던 Phase 2 페이크는 크래시 재개를
   * 표현할 수 없었다(재개하면 그 페이지가 영영 사라졌다).
   */
  const changeLog: { readonly id: string; readonly op: 'added' | 'removed'; readonly replaced: boolean }[] = [];
  const handles = new Map<string, { nativeId: string; offset: number }>();
  const failures = new Map<string, NativePayloadDto>();
  const hangs = new Set<string>();
  const calls: { fn: keyof NativeWorkoutsModule; atMs: number }[] = [];

  let idCounter = 0;
  let handleCounter = 0;

  const mintId = (): string => {
    idCounter += 1;
    const suffix = String(idCounter).padStart(12, '0');
    return `00000000-0000-4000-8000-${suffix}`;
  };

  const READ_PRIMITIVES: ReadonlySet<string> = new Set([
    'readWorkoutPage',
    'readMetricRecords',
    'readHeartRateSamples',
    'drainCheckpoint',
  ]);

  /** 모든 seam 진입점이 여기를 지난다 — 호출 기록 · 주입 실패 · 무응답 · 레이트 리밋. */
  const record = (fn: keyof NativeWorkoutsModule): 'hang' | 'go' => {
    calls.push({ fn, atMs: nowMs });
    if (hangs.has(fn)) {
      hangs.delete(fn);
      return 'hang';
    }
    const failure = failures.get(fn);
    if (failure !== undefined) {
      failures.delete(fn);
      throw failure;
    }
    if (rateLimited && READ_PRIMITIVES.has(fn)) {
      // f101/f102 — `errorCode 7`은 rate limit과 레코드 크기 초과를 겸한다. 메시지가 판별자다.
      throw { platformCode: 7, message: 'API call quota exceeded' } satisfies NativePayloadDto;
    }
    return 'go';
  };

  /** 무응답(f104) 재현 — **절대 settle하지 않는** promise. */
  const hang = <T>(): Promise<T> => new Promise<T>(() => undefined);

  const grantedPermissionStrings = (): readonly string[] => {
    if (platform === 'ios') {
      // iOS의 granted는 **share 인가된 타입 식별자**다 — HealthKit은 읽기 상태를 돌려주지 않는다.
      const out = new Set<string>();
      for (const scope of grantedWrite) for (const id of IOS_SCOPE_TYPES[scope]) out.add(id);
      return [...out].sort();
    }
    const out = new Set<string>();
    for (const scope of grantedRead) {
      out.add(ANDROID_READ_PERMISSIONS[scope]);
    }
    for (const scope of grantedWrite) out.add(ANDROID_WRITE_PERMISSIONS[scope]);
    if (grantedHistory) out.add(ANDROID_HISTORY_PERMISSION);
    return [...out].sort();
  };

  const declaredPermissionStrings = (): readonly string[] => {
    const out = new Set<string>();
    if (platform === 'ios') {
      for (const scope of declaredRead) for (const id of IOS_SCOPE_TYPES[scope]) out.add(id);
      for (const scope of declaredWrite) for (const id of IOS_SCOPE_TYPES[scope]) out.add(id);
      return [...out].sort();
    }
    for (const scope of declaredRead) out.add(ANDROID_READ_PERMISSIONS[scope]);
    for (const scope of declaredWrite) out.add(ANDROID_WRITE_PERMISSIONS[scope]);
    if (declaredHistory) out.add(ANDROID_HISTORY_PERMISSION);
    return [...out].sort();
  };

  const iosStatuses = (): Readonly<Record<string, 'granted' | 'denied' | 'undetermined'>> => {
    const out: Record<string, 'granted' | 'denied' | 'undetermined'> = {};
    for (const scope of SCOPES) {
      for (const id of IOS_SCOPE_TYPES[scope]) {
        if (grantedWrite.has(scope)) out[id] = 'granted';
        else if (deniedWrite.has(scope)) out[id] = 'denied';
        else out[id] ??= 'undetermined';
      }
    }
    return out;
  };

  /** iOS는 read 인가를 돌려주지 않으므로, 읽기 게이팅은 페이크 내부 사실로만 쓴다. */
  const canRead = (scope: Scope): boolean => grantedRead.has(scope);

  const toDto = (stored: StoredWorkout): WorkoutDto => {
    const input = stored.input;
    const kind: WorkoutKind = input.kind ?? 'other';
    const activityTypeRaw =
      platform === 'ios'
        ? iosActivityTypeFromKind(kind, input.indoor)
        : androidExerciseTypeFromKind(kind, input.indoor);
    const points = input.route ?? [];
    const routeState: RouteState = input.routeState ?? (points.length > 0 ? 'available' : 'none');
    // iOS는 네이티브가 3-tier 사다리로 총계를 채운다(§8.7). Android는 별도 메트릭 레코드라
    // DTO에 오지 않고 `readMetricRecords`로 온다(§8.4) — 그 비대칭이 여기서 그대로 재현된다.
    const iosMetrics =
      platform === 'ios'
        ? {
            distanceM: canRead('distance') ? input.distanceM : undefined,
            distanceProvenance: canRead('distance') && input.distanceM !== undefined ? ('associated' as const) : undefined,
            activeEnergyKcal: canRead('activeEnergy') ? input.activeEnergyKcal : undefined,
            activeEnergyProvenance:
              canRead('activeEnergy') && input.activeEnergyKcal !== undefined ? ('associated' as const) : undefined,
            elevationGainM: canRead('elevation') ? input.elevationGainM : undefined,
            steps: canRead('steps') ? input.steps : undefined,
          }
        : {};
    const shared = {
      platform,
      id: stored.nativeId,
      clientId: input.clientId,
      isOwn: input.isOwn ?? input.clientId !== undefined,
      activityTypeRaw,
      startMs: input.startMs,
      endMs: input.endMs,
      activeDurationS: (input.endMs - input.startMs) / 1000,
      utcOffsetMin: 0,
      source: { id: input.sourceId ?? 'kit.gj.workouts.fake' },
      ...iosMetrics,
      pauses: [],
      laps: [],
      routeState,
      lastModifiedMs: nowMs,
    } as const;

    if (platform === 'ios') {
      return {
        ...shared,
        platform: 'ios',
        indoor: input.indoor,
        ios: {
          activityTypeRaw,
          bundleIdentifier: shared.source.id,
          wallClockS: (input.endMs - input.startMs) / 1000,
          syncIdentifier: input.clientId,
          syncVersion: stored.version,
          activityCount: 1,
          hasIndoorMetadataKey: input.indoor !== undefined,
          routeSampleCount: points.length,
        },
      };
    }
    return {
      ...shared,
      platform: 'android',
      indoor: null,
      android: {
        exerciseType: activityTypeRaw,
        packageName: shared.source.id,
        recordingMethod: 0,
        clientRecordId: input.clientId,
        clientRecordVersion: stored.version,
        segments: [],
      },
    };
  };

  const fake: FakeNativeWorkouts = {
    // -- seam ----------------------------------------------------------------
    async availability(): Promise<AvailabilityDto> {
      if (record('availability') === 'hang') return hang();
      return availabilityToDto(availability);
    },

    async authorizationSnapshot(): Promise<AuthorizationSnapshotDto> {
      if (record('authorizationSnapshot') === 'hang') return hang();
      return {
        platform,
        availability: availabilityToDto(availability),
        granted: grantedPermissionStrings(),
        declared: declaredPermissionStrings(),
        // iOS: 아직 결정되지 않은 **실제 타입**이 하나라도 있으면 시트가 뜬다.
        // `elevation`은 빈 집합이라 시트에 등장할 행 자체가 없으므로 여기서 세지 않는다(§8.8).
        wouldPrompt:
          platform === 'ios' &&
          SCOPES.some(
            (scope) =>
              IOS_SCOPE_TYPES[scope].length > 0 && !grantedWrite.has(scope) && !deniedWrite.has(scope),
          ),
        foreground,
        routeAccess,
        history: platform === 'ios' ? null : grantedHistory,
        ...(platform === 'ios' ? { statuses: iosStatuses() } : {}),
      };
    },

    async requestPermissions(request: PermissionRequestDto): Promise<PermissionOutcomeDto> {
      if (record('requestPermissions') === 'hang') return hang();
      const before = [...grantedPermissionStrings()];
      const asked = [...new Set([...request.read, ...request.write])].sort();
      if (permissionOutcome === 'inconclusive') {
        // f120 — 온보딩 "Go back": 19.6 s 뒤 빈 집합. 상태는 **불변**이고 conclusive가 false다.
        return { before, after: before, conclusive: false };
      }
      const scopesOf = (permissions: readonly string[], table: Readonly<Record<Scope, string>>): Scope[] =>
        SCOPES.filter((scope) => permissions.includes(table[scope]));

      if (permissionOutcome === 'grant') {
        if (platform === 'ios') {
          for (const scope of SCOPES) {
            if (IOS_SCOPE_TYPES[scope].length === 0) continue;
            if (IOS_SCOPE_TYPES[scope].every((id) => request.write.includes(id))) {
              grantedWrite.add(scope);
              deniedWrite.delete(scope);
            }
            if (IOS_SCOPE_TYPES[scope].every((id) => request.read.includes(id))) grantedRead.add(scope);
          }
        } else {
          for (const scope of scopesOf(request.read, ANDROID_READ_PERMISSIONS)) {
            grantedRead.add(scope);
            deniedRead.delete(scope);
          }
          for (const scope of scopesOf(request.write, ANDROID_WRITE_PERMISSIONS)) {
            grantedWrite.add(scope);
            deniedWrite.delete(scope);
          }
          if (request.read.includes(ANDROID_HISTORY_PERMISSION)) grantedHistory = true;
        }
      } else {
        if (platform === 'ios') {
          for (const scope of SCOPES) {
            if (IOS_SCOPE_TYPES[scope].length === 0) continue;
            if (IOS_SCOPE_TYPES[scope].every((id) => request.write.includes(id))) {
              grantedWrite.delete(scope);
              deniedWrite.add(scope);
            }
          }
        } else {
          for (const scope of scopesOf(request.read, ANDROID_READ_PERMISSIONS)) {
            grantedRead.delete(scope);
            deniedRead.add(scope);
          }
          for (const scope of scopesOf(request.write, ANDROID_WRITE_PERMISSIONS)) {
            grantedWrite.delete(scope);
            deniedWrite.add(scope);
          }
          if (request.read.includes(ANDROID_HISTORY_PERMISSION)) grantedHistory = false;
        }
      }
      void asked;
      return { before, after: [...grantedPermissionStrings()], conclusive: true };
    },

    async grantedScopeFingerprint(): Promise<string> {
      if (record('grantedScopeFingerprint') === 'hang') return hang();
      return forcedReset === 'scopesChanged' ? 'changed' : 'stable';
    },

    async readWorkoutPage(
      query: WindowDto & { readonly pageSize: number; readonly pageToken?: string | undefined },
    ): Promise<WorkoutPageDto> {
      if (record('readWorkoutPage') === 'hang') return hang();
      const all = [...store.values()]
        .filter((entry) => entry.input.startMs >= query.fromMs && entry.input.startMs < query.toMs)
        // DESCENDING by start instant — 계약이다(§5.2 `WorkoutPage`).
        .sort((a, b) => b.input.startMs - a.input.startMs);
      const offset = query.pageToken === undefined ? 0 : Number(query.pageToken);
      const slice = all.slice(offset, offset + query.pageSize);
      const nextOffset = offset + slice.length;
      return {
        items: slice.map(toDto),
        nextPageToken: nextOffset < all.length ? String(nextOffset) : null,
      };
    },

    async readMetricRecords(
      query: WindowDto & { readonly type: MetricTypeDto; readonly origins: readonly string[] },
    ): Promise<readonly MetricRowDto[]> {
      if (record('readMetricRecords') === 'hang') return hang();
      // f109 — `aggregate()`가 모든 지표에 null이던 상태의 표면적 결과: 아무 행도 오지 않는다.
      // 그때 총계는 `undefined`("모름")여야 하고 절대 `0`이 되어서는 안 된다.
      if (metricsMissing) return [];
      const scope: Scope =
        query.type === 'distance'
          ? 'distance'
          : query.type === 'activeEnergy'
            ? 'activeEnergy'
            : query.type === 'elevation'
              ? 'elevation'
              : 'steps';
      if (!canRead(scope)) return [];
      const rows: MetricRowDto[] = [];
      for (const entry of store.values()) {
        if (entry.input.endMs <= query.fromMs || entry.input.startMs >= query.toMs) continue;
        const value =
          query.type === 'distance'
            ? entry.input.distanceM
            : query.type === 'activeEnergy'
              ? entry.input.activeEnergyKcal
              : query.type === 'elevation'
                ? entry.input.elevationGainM
                : entry.input.steps;
        if (value === undefined) continue;
        rows.push({
          type: query.type,
          startMs: entry.input.startMs,
          endMs: entry.input.endMs,
          value,
          origin: entry.input.sourceId ?? 'kit.gj.workouts.fake',
        });
      }
      return rows;
    },

    async readHeartRateSamples(query: WindowDto): Promise<readonly HeartRateDto[]> {
      if (record('readHeartRateSamples') === 'hang') return hang();
      if (!canRead('heartRate')) return [];
      const out: HeartRateDto[] = [];
      for (const entry of store.values()) {
        for (const sample of entry.input.heartRate ?? []) {
          if (sample.t >= query.fromMs && sample.t < query.toMs) out.push({ t: sample.t, bpm: sample.bpm });
        }
      }
      return out.sort((a, b) => a.t - b.t);
    },

    async hasAssociatedSamples(nativeId: string, quantity: QuantityKindDto): Promise<boolean> {
      if (record('hasAssociatedSamples') === 'hang') return hang();
      const entry = store.get(nativeId);
      if (entry === undefined) return false;
      return quantity === 'distance'
        ? entry.input.distanceM !== undefined
        : entry.input.activeEnergyKcal !== undefined;
    },

    async takeCheckpoint(): Promise<string> {
      if (record('takeCheckpoint') === 'hang') return hang();
      // 아무것도 읽지 않는다 — 워터마크만 잡는다(§4.4).
      return String(changeLog.length);
    },

    async drainCheckpoint(checkpoint: string, limit: number): Promise<DrainBatchDto> {
      if (record('drainCheckpoint') === 'hang') return hang();
      const expired = forcedReset === 'expired';
      if (expired) forcedReset = null;
      if (expired) {
        return { added: [], removed: [], checkpoint: String(changeLog.length), hasMore: false, expired: true };
      }
      const parsed = Number(checkpoint);
      const from = Number.isSafeInteger(parsed) && parsed >= 0 ? Math.min(parsed, changeLog.length) : 0;
      const slice = changeLog.slice(from, from + Math.max(1, limit));
      const added: WorkoutDto[] = [];
      const removed: { id: string; replaced: boolean }[] = [];
      for (const entry of slice) {
        if (entry.op === 'removed') {
          removed.push({ id: entry.id, replaced: entry.replaced });
          continue;
        }
        const stored = store.get(entry.id);
        // 이미 사라진 것에 대한 upsertion은 드레인에 나타나지 않는다 — 플랫폼도 그렇다.
        if (stored !== undefined) added.push(toDto(stored));
      }
      const next = from + slice.length;
      return {
        added,
        removed,
        checkpoint: String(next),
        hasMore: next < changeLog.length,
        expired: false,
      };
    },

    async openRoute(nativeId: string, consent: 'skip' | 'prompt'): Promise<RouteHandleDto> {
      if (record('openRoute') === 'hang') return hang();
      const entry = store.get(nativeId);
      const points = entry?.input.route ?? [];
      let state: RouteState = entry?.input.routeState ?? (points.length > 0 ? 'available' : 'none');
      // f113 · f115 — 백그라운드이거나 온보딩 미완료면 외부 route는 읽히지 않는다.
      if (state === 'available' && (!foreground || !onboarded) && entry?.input.isOwn !== true) {
        state = consent === 'prompt' && foreground ? 'available' : 'consentRequired';
      }
      // f114 — 두 route scope를 모두 잃으면 **자기가 쓴 route도** 못 읽는다.
      if (state === 'available' && !grantedRead.has('routes') && !grantedWrite.has('routes')) {
        state = consent === 'prompt' && foreground ? 'available' : 'consentRequired';
      }
      handleCounter += 1;
      const handle = `route-${String(handleCounter)}`;
      handles.set(handle, { nativeId, offset: 0 });
      return { handle, state };
    },

    async readRouteChunk(handle: string, maxPoints: number): Promise<readonly RoutePointDto[] | null> {
      if (record('readRouteChunk') === 'hang') return hang();
      const open = handles.get(handle);
      if (open === undefined) return null;
      const points = store.get(open.nativeId)?.input.route ?? [];
      if (open.offset >= points.length) return null;
      const chunk = points.slice(open.offset, open.offset + maxPoints);
      open.offset += chunk.length;
      return chunk.map((point) => ({ ...point }));
    },

    async closeRoute(handle: string): Promise<void> {
      if (record('closeRoute') === 'hang') return hang();
      handles.delete(handle);
    },

    async findBySyncIdentifier(clientId: string): Promise<ExistingWorkoutDto | null> {
      if (record('findBySyncIdentifier') === 'hang') return hang();
      if (platform === 'android') return null;
      for (const entry of store.values()) {
        if (entry.input.clientId === clientId) return { nativeId: entry.nativeId, version: entry.version };
      }
      return null;
    },

    async saveWorkout(spec: WorkoutWriteDto): Promise<SaveOutcomeDto> {
      if (record('saveWorkout') === 'hang') return hang();
      if (storeLocked || pendingUnlockNext) {
        pendingUnlockNext = false;
        return { status: 'pendingUnlock', nativeId: null, route: 'deferred', routePointsWritten: 0 };
      }
      // `WorkoutWriteDto`의 point는 `| null`을 허용하지만 `./core`의 위생이 이미 통과시킨 값이므로
      // 여기서 `null`은 절대 오지 않는다. 타입만 좁혀서 도메인 모양으로 되돌린다.
      const specPoints: RoutePoint[] = spec.route.map((entry) => ({
        t: entry.t,
        lat: entry.lat,
        lon: entry.lon,
        altM: entry.altM ?? undefined,
        hAccM: entry.hAccM ?? undefined,
        vAccM: entry.vAccM ?? undefined,
        speedMps: entry.speedMps ?? undefined,
        courseDeg: entry.courseDeg ?? undefined,
      }));
      // Android는 단일 트랜잭션이므로 write scope가 하나라도 없으면 **통째로** SecurityException이다.
      const needed = requiredWriteScopes({
        id: spec.clientId,
        version: spec.version,
        kind: 'other',
        startMs: spec.startMs,
        endMs: spec.endMs,
        distanceM: spec.distanceM,
        activeEnergyKcal: spec.activeEnergyKcal,
        elevationGainM: spec.elevationGainM,
        steps: spec.steps,
        heartRate: spec.heartRate,
        route: specPoints.length === 0 ? 'none' : specPoints,
      });
      const missingScopes = needed.filter((scope) => scope !== 'routes' && !grantedWrite.has(scope));
      if (missingScopes.length > 0) {
        throw {
          code: 'ERR_WORKOUTS_NOT_AUTHORIZED',
          message: `Not authorized: ${missingScopes.join(',')}`,
        } satisfies NativePayloadDto;
      }

      const existing = [...store.values()].find((entry) => entry.input.clientId === spec.clientId);
      // f93 — 낮은 version은 `insertRecords`에서 **정상 반환**하고 같은 UUID를 돌려주며 아무것도
      // 바꾸지 않는다. 탐지 수단은 read-back뿐이다(f94).
      if (existing !== undefined && platform === 'android' && existing.version > spec.version) {
        return {
          status: 'saved',
          nativeId: existing.nativeId,
          route: 'none',
          routePointsWritten: 0,
        };
      }

      const nativeId =
        existing === undefined ? mintId() : platform === 'ios' ? mintId() : existing.nativeId;
      if (existing !== undefined && platform === 'ios' && existing.nativeId !== nativeId) {
        store.delete(existing.nativeId);
        changeLog.push({ id: existing.nativeId, op: 'removed', replaced: true });
      }
      // f95 — 전상태 쓰기다. route를 빼고 업서트하면 저장된 route가 파괴된다.
      const routeAllowed = grantedWrite.has('routes');
      const storedPoints: readonly RoutePoint[] = routeAllowed ? specPoints : [];
      const routeOutcome: RouteWriteOutcome =
        spec.route.length === 0 ? 'none' : routeAllowed ? 'stored' : 'notPermitted';
      store.set(nativeId, {
        nativeId,
        version: spec.version,
        input: {
          nativeId,
          clientId: spec.clientId,
          isOwn: true,
          indoor: spec.indoor,
          startMs: spec.startMs,
          endMs: spec.endMs,
          distanceM: spec.distanceM,
          activeEnergyKcal: spec.activeEnergyKcal,
          elevationGainM: spec.elevationGainM,
          steps: spec.steps,
          heartRate: spec.heartRate.map((sample) => ({ t: sample.t, bpm: sample.bpm })),
          route: storedPoints,
        },
      });
      changeLog.push({ id: nativeId, op: 'added', replaced: false });
      return {
        status: 'saved',
        nativeId,
        route: routeOutcome,
        routePointsWritten: storedPoints.length,
      };
    },

    async readBackVersion(clientId: string): Promise<number | null> {
      if (record('readBackVersion') === 'hang') return hang();
      for (const entry of store.values()) {
        if (entry.input.clientId === clientId) return entry.version;
      }
      return null;
    },

    async deleteWorkout(ref: DeleteRefDto): Promise<boolean> {
      if (record('deleteWorkout') === 'hang') return hang();
      for (const entry of store.values()) {
        const matches =
          (ref.nativeId !== undefined && ref.nativeId !== null && entry.nativeId === ref.nativeId) ||
          (ref.clientId !== undefined && ref.clientId !== null && entry.input.clientId === ref.clientId);
        if (!matches) continue;
        store.delete(entry.nativeId);
        changeLog.push({ id: entry.nativeId, op: 'removed', replaced: false });
        return true;
      }
      // 없는 id 삭제는 **에러가 아니다**(f96).
      return false;
    },

    async openSettings(): Promise<void> {
      if (record('openSettings') === 'hang') return hang();
    },

    async openStoreListing(): Promise<void> {
      if (record('openStoreListing') === 'hang') return hang();
    },

    // -- scenario controls ---------------------------------------------------
    setAvailability(next: Availability): void {
      availability = next;
    },
    setAuthorization(next: AuthorizationState): void {
      if (next.availability !== 'available') {
        availability = next.availability === 'updateRequired'
          ? { status: 'updateRequired' }
          : { status: 'unavailable', reason: next.reason };
        return;
      }
      availability = { status: 'available' };
      grantedRead = new Set(
        // iOS의 read는 영구히 `'unknown'`이므로 그것도 "읽을 수 있다"로 되돌린다 (§1-5).
        SCOPES.filter((scope) => next.read[scope] === 'granted' || next.read[scope] === 'unknown'),
      );
      grantedWrite = new Set(SCOPES.filter((scope) => next.write[scope] === 'granted'));
      deniedRead = new Set(SCOPES.filter((scope) => next.read[scope] === 'denied'));
      deniedWrite = new Set(SCOPES.filter((scope) => next.write[scope] === 'denied'));
      grantedHistory = next.history === 'granted';
      routeAccess = next.routeAccess;
    },
    authorize(grants: FakeScopeGrants): void {
      if (grants.read !== undefined) {
        grantedRead = new Set(grants.read);
        deniedRead = new Set(SCOPES.filter((scope) => !grantedRead.has(scope)));
      }
      if (grants.write !== undefined) {
        grantedWrite = new Set(grants.write);
        deniedWrite = new Set(SCOPES.filter((scope) => !grantedWrite.has(scope)));
      }
      if (grants.history !== undefined) grantedHistory = grants.history;
    },
    setDeclared(next: FakeScopeGrants): void {
      if (next.read !== undefined) declaredRead = new Set(next.read);
      if (next.write !== undefined) declaredWrite = new Set(next.write);
      if (next.history !== undefined) declaredHistory = next.history;
    },
    setNextPermissionOutcome(next: FakePermissionOutcome): void {
      permissionOutcome = next;
    },
    addWorkout(input: FakeWorkoutInput): string {
      const nativeId = input.nativeId ?? mintId();
      store.set(nativeId, { nativeId, input: { ...input, nativeId }, version: 1 });
      changeLog.push({ id: nativeId, op: 'added', replaced: false });
      return nativeId;
    },
    replaceWorkout(nativeId: string, patch: Partial<FakeWorkoutInput>): string {
      const entry = store.get(nativeId);
      if (entry === undefined) return nativeId;
      const merged = { ...entry.input, ...patch };
      if (platform === 'ios') {
        // iOS는 재저장마다 **새 UUID**를 만들고 같은 배치에 removed{replaced:true}를 낸다(idx f26).
        const next = mintId();
        store.delete(nativeId);
        store.set(next, { nativeId: next, input: { ...merged, nativeId: next }, version: entry.version + 1 });
        changeLog.push({ id: nativeId, op: 'removed', replaced: true });
        changeLog.push({ id: next, op: 'added', replaced: false });
        return next;
      }
      // Android는 **같은 UUID**를 재사용하고 upsertion만 낸다 — removal이 없다(f92, f97).
      store.set(nativeId, { nativeId, input: merged, version: entry.version + 1 });
      changeLog.push({ id: nativeId, op: 'added', replaced: false });
      return nativeId;
    },
    removeWorkout(nativeId: string): void {
      if (!store.delete(nativeId)) return;
      changeLog.push({ id: nativeId, op: 'removed', replaced: false });
    },
    purgeDeletion(nativeId: string): void {
      // HealthKit이 삭제 기록을 purge한 경우 — 워크아웃이 `removed` 없이 사라진다(idx f17).
      store.delete(nativeId);
      // HealthKit이 purge하면 삭제 **기록 자체**가 사라진다 — 드레인이 그 워크아웃을 언급조차 하지
      // 않고, 그래서 §4.4 증명의 전제가 무너지는 유일한 지점이 된다.
      for (let i = changeLog.length - 1; i >= 0; i -= 1) {
        if (changeLog[i]?.id === nativeId) changeLog.splice(i, 1);
      }
    },
    emitNoOpUpsertion(nativeId: string): void {
      // f94 — upsertion change가 왔다는 것은 무언가 바뀌었다는 증거가 되지 않는다.
      if (store.has(nativeId)) changeLog.push({ id: nativeId, op: 'added', replaced: false });
    },
    expireCursor(reason?: CursorResetReason | undefined): void {
      forcedReset = reason ?? 'expired';
    },
    setRouteAccess(access: RouteAccess): void {
      routeAccess = access;
    },
    setForeground(next: boolean): void {
      foreground = next;
    },
    setOnboarded(next: boolean): void {
      onboarded = next;
    },
    setStoreLocked(locked: boolean): void {
      storeLocked = locked;
    },
    nextSaveIsPendingUnlock(): void {
      pendingUnlockNext = true;
    },
    setRateLimited(next: boolean): void {
      rateLimited = next;
    },
    setMetricsMissing(next: boolean): void {
      metricsMissing = next;
    },
    failNext(primitive: keyof NativeWorkoutsModule, payload: NativePayloadDto): void {
      failures.set(primitive, payload);
    },
    hangNext(primitive: keyof NativeWorkoutsModule): void {
      hangs.add(primitive);
    },
    get openRouteHandles(): number {
      return handles.size;
    },
    get calls(): readonly { readonly fn: keyof NativeWorkoutsModule; readonly atMs: number }[] {
      return calls;
    },
  };

  for (const input of seed?.workouts ?? []) fake.addWorkout(input);
  if (seed?.authorization !== undefined) fake.setAuthorization(seed.authorization);
  // 시드로 심은 것은 "이미 있던 것"이므로 변경 로그를 비운다 — 첫 sync가 백필을 흉내내지 않게.
  changeLog.length = 0;
  return fake;
}

/** Convenience wrapper: `createWorkoutsApi(native)` plus the same controls. */
export function createFakeWorkouts(seed?: FakeSeed): FakeWorkouts {
  const native = createFakeNativeWorkouts(seed);
  const nowMs = seed?.nowMs ?? DEFAULT_NOW_MS;
  const api = createWorkoutsApi(native, {
    now: () => nowMs,
    // 페이크의 기본은 페이서 **꺼짐**이다: 고정 클록에서는 슬라이딩 윈도가 절대 움직이지 않으므로
    // 켜 두면 긴 fuzz 하나가 예산을 태우고 그 뒤 전부 `rateLimited`가 된다. 예산 자체는
    // `tests/unit/budget.test.ts`가 주입 클록으로 직접 검증한다.
    budget: seed?.budget ?? null,
    ...(seed?.routeConsentTimeoutMs === undefined
      ? {}
      : { routeConsentTimeoutMs: seed.routeConsentTimeoutMs }),
  });
  // `native` 자체에 `api`를 붙인다 — 스프레드로 새 객체를 만들면 `openRouteHandles`·`calls`
  // 게터가 한 번 평가된 스냅샷으로 굳어 시나리오 컨트롤이 거짓말을 하게 된다.
  Object.defineProperty(native, 'api', { value: api, enumerable: true });
  return native as FakeWorkouts;
}

/**
 * Run the full sync loop to convergence against any `WorkoutsApi`. Test helper only — it holds the
 * whole store in memory and does NOT model the one-transaction rule, so a production app must write
 * the loop itself. `killAfterPages` reproduces a crash and reports whether the cursor was persisted
 * without the items, which is the one failure the library cannot prevent.
 */
export async function drainSync(
  api: Pick<WorkoutsApi, 'syncWorkouts' | 'listWorkouts'>,
  opts: {
    readonly backfillFromMs: number;
    readonly cursor?: WorkoutsSyncCursor | null | undefined;
    readonly maxPages?: number | undefined;
    readonly killAfterPages?: number | undefined;
  },
): Promise<{
  readonly cursor: WorkoutsSyncCursor;
  readonly store: ReadonlyMap<string, Workout>;
  readonly pages: number;
  readonly resets: readonly CursorResetReason[];
}> {
  const store = new Map<string, Workout>();
  // §4.7의 세 번째 호출자 의무를 실제로 이행하는 부분: 로컬 키는 `clientId ?? id`인데 removal은
  // **플랫폼 id만** 싣고 온다(f97). 그래서 소비자는 native id -> 로컬 키 색인을 들고 있어야 하고,
  // 이 헬퍼가 그것을 흉내내지 않으면 `remove`가 조용히 빗나가 테스트가 거짓 초록이 된다.
  const keyByNativeId = new Map<string, string>();
  const resets: CursorResetReason[] = [];
  const maxPages = opts.maxPages ?? 100;
  let cursor: WorkoutsSyncCursor | null = opts.cursor ?? null;
  let pages = 0;

  const upsert = (workout: Workout): void => {
    const key = workout.clientId ?? workout.id;
    store.set(key, workout);
    keyByNativeId.set(workout.id, key);
  };
  const remove = (nativeId: string): void => {
    const key = keyByNativeId.get(nativeId) ?? nativeId;
    // `remove(모르는 id)`는 no-op이어야 한다 — 두 번째 호출자 의무(§4.4).
    const current = store.get(key);
    // 교체로 새 native id가 이미 같은 키를 차지했다면 그 행을 지우면 안 된다.
    if (current !== undefined && current.id !== nativeId && current.clientId !== undefined) {
      keyByNativeId.delete(nativeId);
      return;
    }
    store.delete(key);
    keyByNativeId.delete(nativeId);
  };

  for (;;) {
    const page = await api.syncWorkouts(cursor);
    pages += 1;
    if (page.reset) {
      resets.push(page.resetReason);
      let pageToken: string | undefined;
      for (;;) {
        const backfill = await api.listWorkouts({
          fromMs: opts.backfillFromMs,
          toMs: Number.MAX_SAFE_INTEGER,
          ...(pageToken === undefined ? {} : { pageToken }),
        });
        for (const workout of backfill.items) upsert(workout);
        pageToken = backfill.nextPageToken;
        if (pageToken === undefined) break;
      }
    }
    for (const workout of page.added) upsert(workout);
    for (const entry of page.removed) remove(entry.id);
    cursor = page.cursor;
    if (opts.killAfterPages !== undefined && pages >= opts.killAfterPages) break;
    if (!page.hasMore || pages >= maxPages) break;
  }

  return { cursor: cursor ?? '', store, pages, resets };
}
