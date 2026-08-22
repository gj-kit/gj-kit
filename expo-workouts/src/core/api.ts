// 함수 12종의 **유일한** 구현 (설계 §5.3 · §3.1).
//
// `.`은 이 팩토리를 네이티브 모듈로, `index.unsupported`는 `null`로, `./testing`은 같은 seam의
// 인메모리 페이크로 호출한다. 세 곳에서 도는 JS 계층이 **같은 코드**이므로 `pnpm test`가 프로덕션
// 경로를 실행한다.
//
// ⚠ Phase 3 결함 A: **seam 호출은 하나도 빠짐없이 `mapNativeError`로 감싼다.** Phase 2에서
//   `syncWorkouts`의 `takeCheckpoint()` · `grantedScopeFingerprint()` · `platform()`의
//   `authorizationSnapshot()`이 try 밖에 있었고, 그래서 네이티브 예외가 **매핑되지 않은 채**
//   호출자에게 도달했다 — example 앱이 `rejected non-WorkoutsError`로 그것을 잡아냈다.
//   아래 `guard()`가 그 실수를 구조적으로 불가능하게 만든다: 네이티브를 부르는 모든 자리가
//   같은 헬퍼를 통과한다.

import {
  androidRequestPermissions,
  assertAuthorizationRequest,
  deniedFromOutcome,
  deriveAuthorizationState,
  iosRequestIdentifiers,
  missingDeclarations,
  requiredWriteScopes,
  type AuthorizationRequest,
  type AuthorizationResult,
  type AuthorizationState,
  type Availability,
  type DirectedPermissions,
} from './authorization';
import {
  androidExerciseTypeFromKind,
  iosActivityTypeFromKind,
  kindFromAndroidExerciseType,
  kindFromIosActivityType,
} from './activity';
import { ReadBudget } from './budget';
import { WorkoutsError } from './errors';
import { mapNativeError } from './mapErrors';
import type {
  AuthorizationSnapshotDto,
  AvailabilityDto,
  MetricTypeDto,
  NativeWorkoutsModule,
  WorkoutDto,
  WorkoutWriteDto,
} from './native-contract';
import {
  normalizeHeartRateSamples,
  normalizeRouteForWrite,
  routeChunkPoints,
  sanitizeRoutePointFromNative,
} from './route';
import { estimateAndroidRecordBytes, ANDROID_RECORD_BYTE_LIMIT, MAX_ANDROID_ROUTE_POINTS } from './size';
import {
  decodeCursor,
  decodePageToken,
  encodeCursor,
  encodePageToken,
} from './sync/cursor';
import { reduceSyncPage } from './sync/reduce';
import { assertEpochMs, assertTimeWindow, MAX_HEART_RATE_WINDOW_MS, normalizeUtcOffsetMin } from './time';
import type {
  CursorResetReason,
  DeleteResult,
  GetRouteOptions,
  HeartRateSample,
  ListQuery,
  MetricProvenance,
  RoutePoint,
  SaveResult,
  Scope,
  StepTotal,
  SyncResult,
  TimeWindow,
  Workout,
  WorkoutHeartRateSummary,
  WorkoutPage,
  WorkoutRef,
  WorkoutWrite,
  WorkoutsPlatform,
  WorkoutsSyncCursor,
} from './types';

/** iOS 200 / Android 50 — 노브가 아니다(f116). 페이지 크기는 플랫폼이 정한다. */
const PAGE_SIZE: Readonly<Record<WorkoutsPlatform, number>> = { ios: 200, android: 50 };
/** 한 드레인 배치의 상한. */
const DRAIN_LIMIT = 200;
/**
 * per-route 동의 다이얼로그의 상한 (f104). Intent 오버플로에서 ActivityResult 콜백은 **영원히
 * 오지 않으므로**, Kotlin의 10 s 타임아웃이 실패하거나 없는 빌드에서도 스트림이 멈추지 않도록
 * JS 쪽에도 상한을 둔다. 타임아웃은 **에러가 아니라 빈 스트림**이다(§5.7 33행).
 */
const ROUTE_CONSENT_TIMEOUT_MS = 12_000;
const WRITE_ID_PATTERN = /^[A-Za-z0-9._:-]{1,120}$/;
const UUID_PATTERN = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/** §8.4의 메트릭 타입 -> 그것을 여는 read scope. */
const METRIC_SCOPES: Readonly<Record<MetricTypeDto, Scope>> = {
  distance: 'distance',
  activeEnergy: 'activeEnergy',
  elevation: 'elevation',
  steps: 'steps',
};

/**
 * Every function of `.`, as one interface. `.`'s `workouts` and `./testing`'s `api` are both
 * instances of it, produced by the SAME factory.
 */
export interface WorkoutsApi {
  getAvailability(): Promise<Availability>;
  requestAuthorization(request: AuthorizationRequest): Promise<AuthorizationResult>;
  getAuthorizationState(): Promise<AuthorizationState>;
  listWorkouts(query: ListQuery): Promise<WorkoutPage>;
  syncWorkouts(cursor: WorkoutsSyncCursor | null): Promise<SyncResult>;
  getRoute(workoutId: string, options?: GetRouteOptions): AsyncIterable<readonly RoutePoint[]>;
  readHeartRate(window: TimeWindow): Promise<readonly HeartRateSample[]>;
  readSteps(window: TimeWindow): Promise<StepTotal>;
  saveWorkout(workout: WorkoutWrite): Promise<SaveResult>;
  deleteWorkout(ref: WorkoutRef): Promise<DeleteResult>;
  openSettings(): Promise<void>;
  openStoreListing(): Promise<void>;
}

/** `createWorkoutsApi`의 주입 지점. 전부 테스트가 시간·예산을 소유하기 위한 것이다. */
export interface CreateWorkoutsApiOptions {
  readonly now?: (() => number) | undefined;
  /**
   * 클라이언트측 읽기 페이서. 기본값은 **Android에서만** 켜진 `ReadBudget` 하나이고
   * (f102의 계수는 Health Connect의 것이며 HealthKit에는 대응물이 없다), `null`이면 끈다.
   */
  readonly budget?: ReadBudget | null | undefined;
  /** per-route 동의 다이얼로그 상한 (f104). 테스트가 짧은 값으로 hang을 재현한다. */
  readonly routeConsentTimeoutMs?: number | undefined;
}

function unavailable(): WorkoutsError {
  return new WorkoutsError(
    'unavailable',
    'No usable health store in this runtime. Hide the feature; getAvailability() says so without throwing.',
  );
}

function availabilityFromDto(dto: AvailabilityDto): Availability {
  if (dto.status === 'available') return { status: 'available' };
  if (dto.status === 'updateRequired') return { status: 'updateRequired' };
  return { status: 'unavailable', reason: dto.reason };
}

/** `listWorkouts`가 §8.4의 페이지-창 읽기로 채운 값. DTO가 이미 준 값은 절대 덮지 않는다. */
export interface WorkoutMetricOverrides {
  readonly distanceM?: number | undefined;
  readonly distanceProvenance?: MetricProvenance | undefined;
  readonly activeEnergyKcal?: number | undefined;
  readonly activeEnergyProvenance?: MetricProvenance | undefined;
  readonly elevationGainM?: number | undefined;
  readonly steps?: number | undefined;
  readonly heartRate?: WorkoutHeartRateSummary | undefined;
}

/** DTO -> `Workout`. 활동 매핑과 sentinel 정리를 여기서 **한 번만** 한다. */
export function workoutFromDto(dto: WorkoutDto, metrics?: WorkoutMetricOverrides | undefined): Workout {
  const heartRateDto =
    dto.heartRate === null || dto.heartRate === undefined
      ? undefined
      : {
          avgBpm: dto.heartRate.avgBpm ?? undefined,
          minBpm: dto.heartRate.minBpm ?? undefined,
          maxBpm: dto.heartRate.maxBpm ?? undefined,
        };
  const base = {
    id: dto.id,
    clientId: dto.clientId ?? undefined,
    isOwn: dto.isOwn,
    startMs: dto.startMs,
    endMs: dto.endMs,
    activeDurationS: dto.activeDurationS,
    utcOffsetMin: normalizeUtcOffsetMin(dto.utcOffsetMin),
    source: {
      id: dto.source.id,
      name: dto.source.name ?? undefined,
      version: dto.source.version ?? undefined,
      deviceModel: dto.source.deviceModel ?? undefined,
    },
    distanceM: dto.distanceM ?? metrics?.distanceM,
    distanceProvenance: dto.distanceProvenance ?? metrics?.distanceProvenance,
    activeEnergyKcal: dto.activeEnergyKcal ?? metrics?.activeEnergyKcal,
    activeEnergyProvenance: dto.activeEnergyProvenance ?? metrics?.activeEnergyProvenance,
    elevationGainM: dto.elevationGainM ?? metrics?.elevationGainM,
    heartRate: heartRateDto ?? metrics?.heartRate,
    steps: dto.steps ?? metrics?.steps,
    pauses: dto.pauses.map((pause) => ({
      startMs: pause.startMs,
      endMs: pause.endMs,
      auto: pause.auto ?? undefined,
    })),
    laps: dto.laps.map((lap) => ({
      startMs: lap.startMs,
      endMs: lap.endMs,
      distanceM: lap.distanceM ?? undefined,
    })),
    routeState: dto.routeState,
    lastModifiedMs: dto.lastModifiedMs ?? undefined,
  };

  if (dto.platform === 'ios') {
    const ios = dto.ios;
    if (ios === null || ios === undefined) {
      throw new WorkoutsError('internal', 'An iOS workout arrived without its platform block.');
    }
    // iOS의 `indoor`는 활동 정수가 아니라 메타데이터 사다리에서 온다(f76).
    return {
      ...base,
      kind: kindFromIosActivityType(dto.activityTypeRaw).kind,
      indoor: dto.indoor ?? undefined,
      platform: 'ios',
      platformData: ios,
    };
  }

  const android = dto.android;
  if (android === null || android === undefined) {
    throw new WorkoutsError('internal', 'An Android workout arrived without its platform block.');
  }
  const derived = kindFromAndroidExerciseType(dto.activityTypeRaw);
  return {
    ...base,
    kind: derived.kind,
    indoor: derived.indoor,
    platform: 'android',
    platformData: android,
  };
}

function assertWorkoutId(workoutId: string, field: string): void {
  if (typeof workoutId !== 'string' || workoutId.length === 0) {
    throw new WorkoutsError('invalidArgument', `${field} must be a non-empty platform id.`);
  }
  if (!UUID_PATTERN.test(workoutId)) {
    // 같은 문자열이 route 경로에서는 조용한 null을, delete 경로에서는 hard throw를 낸다(f96, f112).
    // 여기서 잡아 그 비대칭을 없앤다.
    throw new WorkoutsError('invalidArgument', `${field} must be a platform UUID.`);
  }
}

function assertWorkoutWrite(workout: WorkoutWrite, nowMs: number): void {
  if (!WRITE_ID_PATTERN.test(workout.id)) {
    throw new WorkoutsError('invalidArgument', 'WorkoutWrite.id must match /^[A-Za-z0-9._:-]{1,120}$/.');
  }
  if (!Number.isSafeInteger(workout.version) || workout.version < 1) {
    throw new WorkoutsError('invalidArgument', 'WorkoutWrite.version must be a safe integer >= 1.');
  }
  assertEpochMs(workout.startMs, 'startMs');
  assertEpochMs(workout.endMs, 'endMs');
  if (workout.endMs <= workout.startMs) {
    throw new WorkoutsError('invalidArgument', 'WorkoutWrite.endMs must be greater than startMs.');
  }
  if (workout.endMs > nowMs) {
    throw new WorkoutsError('invalidArgument', 'WorkoutWrite.endMs must not be in the future.');
  }
}

function writeDtoFrom(
  workout: WorkoutWrite,
  activityTypeRaw: number,
  routePoints: readonly RoutePoint[],
): WorkoutWriteDto {
  const window = { startMs: workout.startMs, endMs: workout.endMs };
  return {
    clientId: workout.id,
    version: workout.version,
    activityTypeRaw,
    indoor: workout.indoor,
    startMs: workout.startMs,
    endMs: workout.endMs,
    utcOffsetMin: workout.utcOffsetMin,
    timeZoneId: workout.timeZoneId,
    pauses: workout.pauses ?? [],
    laps: workout.laps ?? [],
    distanceM: workout.distanceM,
    activeEnergyKcal: workout.activeEnergyKcal,
    elevationGainM: workout.elevationGainM,
    // `<= 0`인 step은 아예 쓰지 않는다 — Health Connect가 0-count StepsRecord에 throw한다(idx f44).
    steps: workout.steps !== undefined && workout.steps > 0 ? workout.steps : undefined,
    heartRate: normalizeHeartRateSamples(workout.heartRate ?? [], window),
    route: routePoints,
  };
}

/**
 * 타이머 접근. `./core`는 `lib: ["ES2022"]`로 컴파일되므로 DOM의 `setTimeout`도 Node의 것도
 * 타입에 없다(`nodom-source-guard`). 그래서 `globalThis`에서 **런타임에** 찾고, 없으면 상한을
 * 두지 않는다 — 타이머가 없는 런타임에서 기능이 죽는 것보다 상한이 없는 편이 낫다.
 */
interface TimerHost {
  setTimeout(callback: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

function timerHost(): TimerHost | null {
  const host = globalThis as unknown as Partial<TimerHost>;
  return typeof host.setTimeout === 'function' && typeof host.clearTimeout === 'function'
    ? (host as TimerHost)
    : null;
}

/** 두 구간이 겹치는가 (`[a, b)` 반열림). */
function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

/**
 * The ONLY implementation of the twelve functions.
 *
 * With `native === null` every function rejects with `unavailable` except `getAvailability()`,
 * which resolves to `{ status: 'unavailable', reason: 'notSupported' }`. That is the whole
 * difference between the two `.` branches — the surfaces are structurally identical, which is what
 * `export-parity-guard` locks down.
 */
export function createWorkoutsApi(
  native: NativeWorkoutsModule | null,
  options?: CreateWorkoutsApiOptions,
): WorkoutsApi {
  const now = options?.now ?? ((): number => Date.now());

  if (native === null) {
    const reject = async (): Promise<never> => {
      throw unavailable();
    };
    return {
      // 이 런타임에는 헬스 스토어가 없다는 사실은 **에러가 아니다**. 그래서 이 하나만 resolve한다.
      getAvailability: async (): Promise<Availability> => ({
        status: 'unavailable',
        reason: 'notSupported',
      }),
      requestAuthorization: reject,
      getAuthorizationState: reject,
      listWorkouts: reject,
      syncWorkouts: reject,
      // AsyncIterable을 반환하는 유일한 함수 — 반복을 시작해야 던진다(lazy 계약 유지).
      getRoute: (): AsyncIterable<readonly RoutePoint[]> => ({
        [Symbol.asyncIterator]: (): AsyncIterator<readonly RoutePoint[]> => ({
          next: async (): Promise<IteratorResult<readonly RoutePoint[]>> => {
            throw unavailable();
          },
        }),
      }),
      readHeartRate: reject,
      readSteps: reject,
      saveWorkout: reject,
      deleteWorkout: reject,
      openSettings: reject,
      openStoreListing: reject,
    };
  }

  const module = native;
  const consentTimeoutMs = options?.routeConsentTimeoutMs ?? ROUTE_CONSENT_TIMEOUT_MS;
  let snapshotCache: AuthorizationSnapshotDto | null = null;
  let stateCache: AuthorizationState | null = null;
  let budgetCache: ReadBudget | null | undefined = options?.budget;

  /**
   * **결함 A의 구조적 수정.** 네이티브를 부르는 자리는 예외 없이 여기를 통과한다 — 그래서
   * "try/catch를 하나 빠뜨렸다"가 표현 불가능해진다.
   */
  async function guard<T>(fallbackMessage: string, run: () => Promise<T>): Promise<T> {
    try {
      return await run();
    } catch (error) {
      throw mapNativeError(error, fallbackMessage);
    }
  }

  async function snapshot(refresh = false): Promise<AuthorizationSnapshotDto> {
    if (!refresh && snapshotCache !== null) return snapshotCache;
    const fresh = await guard('Reading the authorization snapshot failed.', () =>
      module.authorizationSnapshot(),
    );
    snapshotCache = fresh;
    return fresh;
  }

  async function platform(): Promise<WorkoutsPlatform> {
    return (await snapshot()).platform;
  }

  /** f102의 계수는 Health Connect의 것이다. iOS에는 대응물이 없으므로 페이서를 끼우지 않는다. */
  async function budgetFor(os: WorkoutsPlatform): Promise<ReadBudget | null> {
    if (budgetCache !== undefined) return budgetCache;
    budgetCache = os === 'android' ? new ReadBudget({ now }) : null;
    return budgetCache;
  }

  /** 플랫폼 읽기 **전에** 예산을 청구한다. 초과면 `rateLimited`로 즉시 거절하고 블로킹하지 않는다. */
  async function spend(os: WorkoutsPlatform, count = 1): Promise<void> {
    (await budgetFor(os))?.spend(count);
  }

  async function authorizationState(refresh = false): Promise<AuthorizationState> {
    if (!refresh && stateCache !== null) return stateCache;
    const derived = deriveAuthorizationState(await snapshot(refresh));
    stateCache = derived;
    return derived;
  }

  function grantedReadScopes(state: AuthorizationState): ReadonlySet<Scope> {
    const out = new Set<Scope>();
    if (state.availability !== 'available') return out;
    for (const [scope, status] of Object.entries(state.read) as readonly (readonly [Scope, string])[]) {
      // `'unknown'`도 통과시킨다 — iOS의 모든 read scope가 영구히 그 값이고, 그것을 "없음"으로
      // 읽으면 iOS에서 메트릭 경로 전체가 죽는다(§1-5).
      if (status === 'granted' || status === 'unknown') out.add(scope);
    }
    return out;
  }

  /**
   * §8.4 — 메트릭은 **페이지 창당 1회**만 읽는다. 세션당 읽으면 40일·200세션 백필이 15분 예산을
   * 통째로 태운다(1004요청 vs 최악 36요청, 27배).
   */
  async function readPageMetrics(
    os: WorkoutsPlatform,
    items: readonly WorkoutDto[],
  ): Promise<ReadonlyMap<string, WorkoutMetricOverrides>> {
    const out = new Map<string, WorkoutMetricOverrides>();
    // iOS는 네이티브가 3-tier 사다리로 DTO를 이미 채운다(§8.7). 여기서 할 일이 없다.
    if (os !== 'android' || items.length === 0) return out;
    const state = await authorizationState();
    const scopes = grantedReadScopes(state);

    const startMs = Math.min(...items.map((item) => item.startMs));
    const endMs = Math.max(...items.map((item) => item.endMs));
    const longestMs = Math.max(...items.map((item) => item.endMs - item.startMs));
    // 하한을 페이지 내 최장 세션만큼 넓힌다 — `readRecords`는 **start instant** 기준이라(f107)
    // 세션 시작 전에 시작한 Distance/Steps 레코드를 그냥 놓친다. 매직 상수가 아니라 파생값이다.
    const window = { fromMs: Math.max(0, startMs - longestMs), toMs: endMs };
    const origins = [...new Set(items.map((item) => item.source.id))];

    const rowsByType = new Map<MetricTypeDto, readonly { start: number; end: number; value: number; origin: string }[]>();
    for (const type of ['distance', 'activeEnergy', 'elevation', 'steps'] as const) {
      if (!scopes.has(METRIC_SCOPES[type])) continue;
      await spend(os);
      const rows = await guard('Reading the page metric records failed.', () =>
        module.readMetricRecords({ ...window, type, origins }),
      );
      rowsByType.set(
        type,
        rows.map((row) => ({ start: row.startMs, end: row.endMs, value: row.value, origin: row.origin })),
      );
    }

    let samples: readonly { readonly t: number; readonly bpm: number }[] = [];
    if (scopes.has('heartRate')) {
      await spend(os);
      samples = await guard('Reading the page heart-rate samples failed.', () =>
        module.readHeartRateSamples(window),
      );
    }

    for (const item of items) {
      const sum = (type: MetricTypeDto): number | undefined => {
        const rows = rowsByType.get(type);
        if (rows === undefined) return undefined;
        let total = 0;
        let seen = false;
        for (const row of rows) {
          if (row.origin !== item.source.id) continue;
          if (!overlaps(row.start, row.end, item.startMs, item.endMs)) continue;
          total += row.value;
          seen = true;
        }
        // null은 언제나 `undefined`("모름")다 — `0 m` / `0 kcal`로 새지 않는다(f109).
        return seen ? total : undefined;
      };

      const inWindow = samples.filter((sample) => sample.t >= item.startMs && sample.t < item.endMs);
      const heartRate: WorkoutHeartRateSummary | undefined =
        inWindow.length === 0
          ? undefined
          : {
              avgBpm: inWindow.reduce((acc, sample) => acc + sample.bpm, 0) / inWindow.length,
              minBpm: Math.min(...inWindow.map((sample) => sample.bpm)),
              maxBpm: Math.max(...inWindow.map((sample) => sample.bpm)),
            };

      const distanceM = sum('distance');
      const activeEnergyKcal = sum('activeEnergy');
      out.set(item.id, {
        distanceM,
        // Health Connect의 레코드는 세션에 **연관되어 있지 않다** — 우리가 창으로 골라 합산한 것이다.
        // 그래서 provenance는 언제나 `'derived'`이고, 다른 앱의 값이 섞였을 수 있다는 뜻이다.
        distanceProvenance: distanceM === undefined ? undefined : 'derived',
        activeEnergyKcal,
        activeEnergyProvenance: activeEnergyKcal === undefined ? undefined : 'derived',
        elevationGainM: sum('elevation'),
        steps: sum('steps'),
        heartRate,
      });
    }
    return out;
  }

  return {
    async getAvailability(): Promise<Availability> {
      try {
        return availabilityFromDto(await module.availability());
      } catch (error) {
        // 이 함수는 절대 던지지 않는다는 것이 계약이다 — 던질 수 있는 유일한 경로를 여기서 닫는다.
        void error;
        return { status: 'unavailable', reason: 'notSupported' };
      }
    },

    async requestAuthorization(request: AuthorizationRequest): Promise<AuthorizationResult> {
      assertAuthorizationRequest(request);
      const before = await snapshot(true);
      if (before.availability.status !== 'available') {
        stateCache = deriveAuthorizationState(before);
        return { ...stateCache, conclusive: false };
      }

      const absent = missingDeclarations(request, before.platform, before.declared);
      if (absent.length > 0) {
        // §5.7 58행 — 메시지가 **빠진 config-plugin prop 이름**을 말한다. 런타임에 고칠 수 없는
        // 빌드 시점 실수이므로 플랫폼을 건드리기 전에 던진다.
        throw new WorkoutsError(
          'invalidArgument',
          `This build never declared: ${absent.join(', ')}. Add them to the withGjKitWorkouts config-plugin props and rebuild.`,
        );
      }

      const directed: DirectedPermissions =
        before.platform === 'ios' ? iosRequestIdentifiers(request) : androidRequestPermissions(request);
      const outcome = await guard('The permission request failed.', () =>
        module.requestPermissions({ read: directed.read, write: directed.write }),
      );

      // f120 — 온보딩 "Go back"은 19.6 s 뒤 **빈 집합**을 돌려주며 전면 거부와 API 표면에서
      // 구별되지 않는다. 그래서 결론적이지 않은 결과는 어느 scope도 `'denied'`로 뒤집지 않는다.
      const requested =
        before.platform === 'ios' ? [] : [...directed.read, ...directed.write];
      const denied = deniedFromOutcome(requested, outcome);
      const after = await snapshot(true);
      const state = deriveAuthorizationState(after, { denied });
      stateCache = state;
      return { ...state, conclusive: outcome.conclusive };
    },

    getAuthorizationState: async (): Promise<AuthorizationState> => authorizationState(true),

    async listWorkouts(query: ListQuery): Promise<WorkoutPage> {
      assertTimeWindow(query);
      const os = await platform();
      const pageToken =
        query.pageToken === undefined ? undefined : decodePageToken(query.pageToken, os);
      await spend(os);
      const page = await guard('Reading a page of workouts failed.', () =>
        module.readWorkoutPage({
          fromMs: query.fromMs,
          toMs: query.toMs,
          pageSize: PAGE_SIZE[os],
          pageToken,
        }),
      );
      const metrics = await readPageMetrics(os, page.items);
      const next = page.nextPageToken;
      return {
        items: page.items.map((dto) => workoutFromDto(dto, metrics.get(dto.id))),
        nextPageToken:
          next === null || next === undefined || next.length === 0
            ? undefined
            : encodePageToken(os, next),
      };
    },

    async syncWorkouts(cursor: WorkoutsSyncCursor | null): Promise<SyncResult> {
      if (cursor !== null && typeof cursor !== 'string') {
        throw new WorkoutsError('invalidArgument', 'syncWorkouts takes a cursor string or null.');
      }
      const os = await platform();
      const fingerprint = await guard('Reading the granted-scope fingerprint failed.', () =>
        module.grantedScopeFingerprint(),
      );

      /** reset 한 형태 — 아무것도 읽지 않고 체크포인트만 잡는다(§4.4). */
      const reset = async (reason: CursorResetReason): Promise<SyncResult> => {
        const checkpoint = await guard('Taking the sync checkpoint failed.', () =>
          module.takeCheckpoint(),
        );
        return {
          added: [],
          removed: [],
          cursor: encodeCursor(os, { k: checkpoint, g: fingerprint, s: now() }),
          hasMore: false,
          reset: true,
          resetReason: reason,
        };
      };

      if (cursor === null) return reset('noCursor');
      const decoded = decodeCursor(cursor, os, fingerprint);
      if (!decoded.ok) return reset(decoded.reason);

      await spend(os);
      const batch = await guard('Draining the sync checkpoint failed.', () =>
        module.drainCheckpoint(decoded.payload.k, DRAIN_LIMIT),
      );
      if (batch.expired) return reset('expired');
      const metrics = await readPageMetrics(os, batch.added);
      const folded = reduceSyncPage({
        added: batch.added.map((dto) => workoutFromDto(dto, metrics.get(dto.id))),
        removed: batch.removed.map((entry) => ({ id: entry.id, replaced: entry.replaced })),
      });
      return {
        added: folded.added,
        removed: folded.removed,
        cursor: encodeCursor(os, { k: batch.checkpoint, g: fingerprint, s: now() }),
        hasMore: batch.hasMore,
        reset: false,
      };
    },

    getRoute(workoutId: string, routeOptions?: GetRouteOptions): AsyncIterable<readonly RoutePoint[]> {
      const consent = routeOptions?.consent ?? 'skip';
      if (consent !== 'skip' && consent !== 'prompt') {
        throw new WorkoutsError('invalidArgument', "getRoute consent must be 'skip' or 'prompt'.");
      }
      // Lazy: 반복을 시작하기 전에는 아무 일도 일어나지 않는다.
      return {
        [Symbol.asyncIterator](): AsyncIterator<readonly RoutePoint[]> {
          let handle: string | null = null;
          let done = false;
          return {
            async next(): Promise<IteratorResult<readonly RoutePoint[]>> {
              if (done) return { done: true, value: undefined };
              try {
                if (handle === null) {
                  assertWorkoutId(workoutId, 'workoutId');
                  const opened = await guard('Opening the route failed.', async () => {
                    const attempt = module.openRoute(workoutId, consent);
                    // f104 — Intent 오버플로에서 ActivityResult 콜백은 **영원히 오지 않는다**.
                    // `'skip'`은 UI를 띄우지 않으므로 상한이 필요 없다.
                    const host = timerHost();
                    if (consent !== 'prompt' || host === null) return attempt;
                    let timer: unknown;
                    const timeout = new Promise<null>((resolve) => {
                      timer = host.setTimeout(() => {
                        resolve(null);
                      }, consentTimeoutMs);
                    });
                    try {
                      return await Promise.race([attempt, timeout]);
                    } finally {
                      host.clearTimeout(timer);
                    }
                  });
                  // 타임아웃은 에러가 아니라 **빈 스트림**이다(§5.7 33행). 절대 루프에서 재시도하지
                  // 않는다 — 20 000점 요청은 Health Connect 컨트롤러 프로세스를 죽인다(f105).
                  if (opened === null) {
                    done = true;
                    return { done: true, value: undefined };
                  }
                  if (opened.state === 'consentRequired' && consent === 'skip') {
                    await module.closeRoute(opened.handle);
                    done = true;
                    throw new WorkoutsError(
                      'consentRequired',
                      "A route exists but is not readable. Retry from the foreground with { consent: 'prompt' }.",
                    );
                  }
                  handle = opened.handle;
                }
                const chunk = await guard('Streaming the route failed.', () =>
                  module.readRouteChunk(handle as string, routeChunkPoints()),
                );
                if (chunk === null || chunk.length === 0) {
                  done = true;
                  await module.closeRoute(handle);
                  return { done: true, value: undefined };
                }
                return { done: false, value: chunk.map(sanitizeRoutePointFromNative) };
              } catch (error) {
                done = true;
                if (handle !== null) await module.closeRoute(handle);
                throw mapNativeError(error, 'Streaming the route failed.');
              }
            },
            // `break`가 여기로 온다 — 핸들 누수를 구조적으로 막는 지점이다.
            async return(): Promise<IteratorResult<readonly RoutePoint[]>> {
              if (!done && handle !== null) await module.closeRoute(handle);
              done = true;
              return { done: true, value: undefined };
            },
          };
        },
      };
    },

    async readHeartRate(window: TimeWindow): Promise<readonly HeartRateSample[]> {
      assertTimeWindow(window, { maxSpanMs: MAX_HEART_RATE_WINDOW_MS });
      const os = await platform();
      await spend(os);
      const samples = await guard('Reading heart-rate samples failed.', () =>
        module.readHeartRateSamples({ fromMs: window.fromMs, toMs: window.toMs }),
      );
      return normalizeHeartRateSamples(
        samples.map((sample) => ({ t: sample.t, bpm: sample.bpm })),
        { startMs: window.fromMs, endMs: window.toMs },
      );
    },

    async readSteps(window: TimeWindow): Promise<StepTotal> {
      assertTimeWindow(window);
      const os = await platform();
      await spend(os);
      const rows = await guard('Reading steps failed.', () =>
        module.readMetricRecords({
          fromMs: window.fromMs,
          toMs: window.toMs,
          type: 'steps',
          origins: [],
        }),
      );
      // 여러 앱이 걸음을 썼다면 **가장 큰 단일 origin 합계**다 — 폰 + 워치를 이중 계상하지 않는다.
      const byOrigin = new Map<string, number>();
      for (const row of rows) byOrigin.set(row.origin, (byOrigin.get(row.origin) ?? 0) + row.value);
      let count = 0;
      for (const total of byOrigin.values()) count = Math.max(count, total);
      return { count };
    },

    async saveWorkout(workout: WorkoutWrite): Promise<SaveResult> {
      assertWorkoutWrite(workout, now());
      const os = await platform();

      // §8.5-0 — 쓰기는 Android에서 **단일 트랜잭션**이다. scope가 하나라도 없으면 세션까지 통째로
      // 실패하므로, 플랫폼을 건드리기 전에 빠진 이름을 담아 거절한다. `'routes'`는 예외로 남는다
      // (비치명 경로 `route: 'notPermitted'`가 그 자리를 지킨다).
      const state = await authorizationState();
      if (state.availability === 'available') {
        const needed = requiredWriteScopes(workout).filter((scope) => scope !== 'routes');
        const absent = needed.filter((scope) => state.write[scope] === 'denied' || state.write[scope] === 'undetermined');
        if (absent.length > 0) {
          throw new WorkoutsError(
            'notAuthorized',
            `saveWorkout needs write access this app does not hold: ${absent.join(', ')}. Call requestAuthorization({ write: [...] }) first.`,
          );
        }
      }

      const hygienic =
        workout.route === 'none'
          ? []
          : normalizeRouteForWrite(workout.route, { startMs: workout.startMs, endMs: workout.endMs });

      if (os === 'android' && hygienic.length > 0) {
        const bytes = estimateAndroidRecordBytes({
          routePoints: hygienic.length,
          clientRecordIdLength: workout.id.length,
          segments: (workout.pauses ?? []).length,
          laps: (workout.laps ?? []).length,
        });
        if (hygienic.length > MAX_ANDROID_ROUTE_POINTS || bytes > ANDROID_RECORD_BYTE_LIMIT) {
          throw new WorkoutsError(
            'routeTooLarge',
            `This route would exceed Health Connect's single-record ceiling. Downsample to at most ${String(MAX_ANDROID_ROUTE_POINTS)} points.`,
          );
        }
      }

      // iOS: 같은 sync identifier로 이미 저장된 것이 있으면 **쓰기 전에** 본다(idx f26). 동등하거나
      // 낮은 version으로 재저장하면 새 UUID가 만들어지고 이전 샘플·루트가 고아가 된다.
      if (os === 'ios') {
        const existing = await guard('Looking the workout up by sync identifier failed.', () =>
          module.findBySyncIdentifier(workout.id),
        );
        if (existing !== null && existing.version > workout.version) {
          throw new WorkoutsError(
            'staleVersion',
            'The stored workout is newer than the version supplied. Re-read your own state and retry.',
          );
        }
      }

      const activityTypeRaw =
        os === 'ios'
          ? iosActivityTypeFromKind(workout.kind, workout.indoor)
          : androidExerciseTypeFromKind(workout.kind, workout.indoor);

      const outcome = await guard('Saving the workout failed.', () =>
        module.saveWorkout(writeDtoFrom(workout, activityTypeRaw, hygienic)),
      );

      if (outcome.status === 'pendingUnlock') {
        return { status: 'pendingUnlock', id: workout.id, route: 'deferred', routePointsWritten: 0 };
      }

      // Android: read-back은 **옵션이 아니다**(소유자 결정 ④). 낮은 version은 `insertRecords`에서
      // 정상 반환하고 같은 UUID를 돌려주며, 직후의 드레인조차 바뀌지 않은 레코드를 담은
      // upsertion 1건을 낸다(f93, f94). 읽어보는 것 말고 탐지 수단이 없다.
      if (os === 'android') {
        const stored = await guard('Reading the written workout back failed.', () =>
          module.readBackVersion(workout.id),
        );
        if (stored !== null && stored > workout.version) {
          throw new WorkoutsError(
            'staleVersion',
            'The stored workout is newer than the version supplied. Re-read your own state and retry.',
          );
        }
      }

      const nativeId = outcome.nativeId;
      if (nativeId === null || nativeId === undefined || nativeId.length === 0) {
        throw new WorkoutsError('internal', 'The store reported a saved workout without an id.');
      }
      if (outcome.route === 'deferred') {
        throw new WorkoutsError('internal', "A saved workout reported route: 'deferred'.");
      }
      return {
        status: 'saved',
        id: workout.id,
        nativeId,
        // 보낸 점이 있는데 하나도 살아남지 않았으면 워크아웃은 저장되고 route만 버려진다(f84).
        route: workout.route === 'none' ? 'none' : hygienic.length === 0 ? 'dropped' : outcome.route,
        routePointsWritten: outcome.routePointsWritten,
      };
    },

    async deleteWorkout(ref: WorkoutRef): Promise<DeleteResult> {
      if (typeof ref !== 'object' || ref === null) {
        throw new WorkoutsError('invalidArgument', 'deleteWorkout takes { nativeId } or { clientId }.');
      }
      if (ref.nativeId !== undefined) assertWorkoutId(ref.nativeId, 'nativeId');
      else if (ref.clientId === undefined || !WRITE_ID_PATTERN.test(ref.clientId)) {
        throw new WorkoutsError('invalidArgument', 'deleteWorkout clientId must be one of your own write ids.');
      }
      const deleted = await guard('Deleting the workout failed.', () =>
        module.deleteWorkout({ nativeId: ref.nativeId, clientId: ref.clientId }),
      );
      return { deleted };
    },

    async openSettings(): Promise<void> {
      await guard('Nothing on this device can open the health settings screen.', () =>
        module.openSettings(),
      );
    },

    async openStoreListing(): Promise<void> {
      await guard('Nothing on this device can open the store listing.', () => module.openStoreListing());
    },
  };
}
