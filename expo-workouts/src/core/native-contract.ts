// 네이티브 seam — 순수 타입 (설계 §3.2). `./testing`이 이것을 구현한다.
//
// 여기에 있는 것만 네이티브가 구현한다. DTO는 전부 JSON-직렬화 가능한 평면 구조이며 플랫폼 타입이
// 하나도 넘어오지 않는다. 그래서 `./testing`의 인메모리 페이크 위에서 도는 것이 `src/core/api.ts`의
// **진짜 코드**가 된다.
//
// ⚠ optional 필드는 전부 `| null | undefined`다. 네이티브 브리지는 "없음"을 `null`로도 키 부재로도
//   보낼 수 있고, `./core`가 그 둘을 `undefined`("모름")로 접는 유일한 지점이다.

import type {
  AndroidWorkoutData,
  IosWorkoutData,
  MetricProvenance,
  RouteState,
  RouteAccess,
  RouteWriteOutcome,
  WorkoutsPlatform,
} from './types';

export type AvailabilityDto =
  | { readonly status: 'available' }
  | { readonly status: 'unavailable'; readonly reason: 'platformTooOld' | 'notSupported' }
  | { readonly status: 'updateRequired' };

/**
 * 인가 스냅샷. **판정은 하지 않는다** — 원시 사실만 넘긴다.
 * iOS: `authorizationStatus`(공유) + `statusForAuthorizationRequest`(시트 여부).
 * Android: `getGrantedPermissions()` + `processImportance()` + `declaredPermissions()`.
 */
export interface AuthorizationSnapshotDto {
  readonly platform: WorkoutsPlatform;
  readonly availability: AvailabilityDto;
  /** Android: granted permission strings. iOS: share-authorized HK type identifiers. */
  readonly granted: readonly string[];
  /**
   * iOS only, and the reason `write.*` can say `'denied'` rather than a permanent `'undetermined'`:
   * `HKHealthStore.authorizationStatus(for:)` per DECLARED type identifier, already reduced to our
   * vocabulary (`sharingAuthorized` -> `'granted'`, `sharingDenied` -> `'denied'`,
   * `notDetermined` -> `'undetermined'`). It is a SHARE-side fact only — HealthKit never reports a
   * read status, which is exactly why every iOS read scope is permanently `'unknown'`.
   * `null` on Android, where the direction is encoded in the permission string and `granted` is
   * already the whole truth.
   */
  readonly statuses?: Readonly<Record<string, 'granted' | 'denied' | 'undetermined'>> | null | undefined;
  /** Manifest / Info.plist 선언 집합. 선언되지 않은 scope 요청은 `invalidArgument`가 된다. */
  readonly declared: readonly string[];
  /** iOS only: a sheet would still appear for at least one requested type. */
  readonly wouldPrompt: boolean;
  /** Android only: the process is at IMPORTANCE_FOREGROUND (a hard precondition for foreign routes). */
  readonly foreground: boolean;
  /** AOSP `getExerciseRouteReadAccessType`, already reduced to our vocabulary. iOS: always `'all'`. */
  readonly routeAccess: RouteAccess;
  /** Android READ_HEALTH_DATA_HISTORY. `null` on iOS — that platform has no wall. */
  readonly history: boolean | null;
}

/**
 * 권한 요청의 원시 결과. **before/after 비교가 판정의 유일한 근거다** — contract의 반환 집합을
 * "사용자가 방금 부여한 것"으로 읽지 않는다.
 * `conclusive: false`는 플랫폼이 아무것도 돌려주지 않았다는 뜻이며(f120), 그때 scope 상태는 불변이다.
 */
/**
 * 권한 요청의 **방향이 있는** 입력 (Phase 3 결함 B). 플랫폼별 문자열 어휘:
 *  - Android — `android.permission.health.READ_*` / `…WRITE_*`. `read`와 `write`의 합집합이
 *    contract 집합이며, `READ_EXERCISE_ROUTES`는 **절대 여기 들어오지 않는다**(f110).
 *  - iOS — HealthKit 타입 식별자. `read`는 `requestAuthorization(read:)`, `write`는 `toShare:`다.
 *    같은 식별자가 양쪽에 동시에 나타나는 것이 정상이다.
 */
export interface PermissionRequestDto {
  readonly read: readonly string[];
  readonly write: readonly string[];
}

export interface PermissionOutcomeDto {
  readonly before: readonly string[];
  readonly after: readonly string[];
  readonly conclusive: boolean;
}

export interface WindowDto {
  readonly fromMs: number;
  readonly toMs: number;
}

export type MetricTypeDto = 'distance' | 'activeEnergy' | 'elevation' | 'steps';
/** iOS provenance 판별에 쓰이는 두 종류 (RESULTS 206 / f71). */
export type QuantityKindDto = 'distance' | 'activeEnergy';

export interface SourceDto {
  readonly id: string;
  readonly name?: string | null | undefined;
  readonly version?: string | null | undefined;
  readonly deviceModel?: string | null | undefined;
}

export interface PauseDto {
  readonly startMs: number;
  readonly endMs: number;
  readonly auto?: boolean | null | undefined;
}

export interface LapDto {
  readonly startMs: number;
  readonly endMs: number;
  readonly distanceM?: number | null | undefined;
}

export interface HeartRateSummaryDto {
  readonly avgBpm?: number | null | undefined;
  readonly minBpm?: number | null | undefined;
  readonly maxBpm?: number | null | undefined;
}

/**
 * 한 워크아웃의 평면 DTO.
 *
 * ⚠ `kind`가 없다 — **활동 매핑은 `./core`가 한다.** 네이티브는 raw 정수(`activityTypeRaw`)만
 *   보내고 `activity.ts`가 `WorkoutKind`로 접는다. 그래야 매핑표가 Node에서 fuzz된다.
 * ⚠ `indoor`도 마찬가지로 iOS에서만 채워진다(메타데이터 사다리의 결과). Android는 `null`이고
 *   `./core`가 `exerciseType`에서 파생한다.
 */
export interface WorkoutDto {
  readonly platform: WorkoutsPlatform;
  readonly id: string;
  readonly clientId?: string | null | undefined;
  readonly isOwn: boolean;
  /** HKWorkoutActivityType (iOS) / ExerciseSessionRecord.exerciseType (Android). */
  readonly activityTypeRaw: number;
  /** iOS only. Android sends `null` — `./core` derives it from `activityTypeRaw`. */
  readonly indoor?: boolean | null | undefined;
  readonly startMs: number;
  readonly endMs: number;
  readonly activeDurationS: number;
  readonly utcOffsetMin?: number | null | undefined;
  readonly source: SourceDto;
  readonly distanceM?: number | null | undefined;
  readonly distanceProvenance?: MetricProvenance | null | undefined;
  readonly activeEnergyKcal?: number | null | undefined;
  readonly activeEnergyProvenance?: MetricProvenance | null | undefined;
  readonly elevationGainM?: number | null | undefined;
  readonly heartRate?: HeartRateSummaryDto | null | undefined;
  readonly steps?: number | null | undefined;
  readonly pauses: readonly PauseDto[];
  readonly laps: readonly LapDto[];
  readonly routeState: RouteState;
  readonly lastModifiedMs?: number | null | undefined;
  /** Exactly one of these is present, matching `platform`. */
  readonly ios?: IosWorkoutData | null | undefined;
  readonly android?: AndroidWorkoutData | null | undefined;
}

export interface WorkoutPageDto {
  readonly items: readonly WorkoutDto[];
  /** The platform's own opaque token. `./core` wraps it in the `gjp1.` page-token magic. */
  readonly nextPageToken?: string | null | undefined;
}

/** 한 메트릭 레코드 행. 세션당이 아니라 **페이지 창당** 한 번 읽는다(§8.4). */
export interface MetricRowDto {
  readonly type: MetricTypeDto;
  readonly startMs: number;
  readonly endMs: number;
  readonly value: number;
  /** `dataOrigin.packageName` — 소스별 합산을 `./core`가 하기 위해 필요하다. */
  readonly origin: string;
}

export interface HeartRateDto {
  readonly t: number;
  readonly bpm: number;
}

export interface RemovedDto {
  readonly id: string;
  readonly replaced: boolean;
}

/** 드레인 한 배치. `checkpoint`는 **이 배치를 만들기 전에** 잡힌 값이다. */
export interface DrainBatchDto {
  readonly added: readonly WorkoutDto[];
  readonly removed: readonly RemovedDto[];
  readonly checkpoint: string;
  readonly hasMore: boolean;
  /** Android `ChangesResponse.changesTokenExpired`. */
  readonly expired: boolean;
}

export interface RouteHandleDto {
  /** 핸들 문자열. `closeRoute(handle)`에 그대로 되돌려준다. */
  readonly handle: string;
  /** 이 워크아웃의 route 상태 — **매 읽기마다 재계산된 값**이다(f114, 절대 캐시 금지). */
  readonly state: RouteState;
}

export interface RoutePointDto {
  readonly t: number;
  readonly lat: number;
  readonly lon: number;
  readonly altM?: number | null | undefined;
  readonly hAccM?: number | null | undefined;
  readonly vAccM?: number | null | undefined;
  readonly speedMps?: number | null | undefined;
  readonly courseDeg?: number | null | undefined;
}

export interface ExistingWorkoutDto {
  readonly nativeId: string;
  readonly version: number;
}

export interface WorkoutWriteDto {
  readonly clientId: string;
  readonly version: number;
  /** 이미 매핑된 플랫폼 정수 — `activity.ts`가 계산한다. */
  readonly activityTypeRaw: number;
  /** `undefined`면 키를 아예 쓰지 않는다(iOS). Android는 정수 선택에 이미 반영돼 있다. */
  readonly indoor?: boolean | undefined;
  readonly startMs: number;
  readonly endMs: number;
  readonly utcOffsetMin?: number | undefined;
  readonly timeZoneId?: string | undefined;
  readonly pauses: readonly PauseDto[];
  readonly laps: readonly LapDto[];
  readonly distanceM?: number | undefined;
  readonly activeEnergyKcal?: number | undefined;
  readonly elevationGainM?: number | undefined;
  /** `<= 0`이면 `./core`가 이미 제거했다 — Health Connect가 0-count StepsRecord에 throw한다. */
  readonly steps?: number | undefined;
  readonly heartRate: readonly HeartRateDto[];
  /** 이미 위생을 통과한 점들. 빈 배열은 "route 없음"을 뜻한다. */
  readonly route: readonly RoutePointDto[];
}

export interface SaveOutcomeDto {
  readonly status: 'saved' | 'pendingUnlock';
  readonly nativeId?: string | null | undefined;
  readonly route: RouteWriteOutcome;
  readonly routePointsWritten: number;
}

export interface DeleteRefDto {
  readonly nativeId?: string | null | undefined;
  readonly clientId?: string | null | undefined;
}

/** 네이티브가 던지는 예외의 평면 표현 — `mapErrors.ts`의 입력이다. */
export interface NativePayloadDto {
  /** `ERR_WORKOUTS_*` — Expo 런타임이 예외 클래스명에서 만든 코드. */
  readonly code?: string | null | undefined;
  /** 템플릿으로 만든 짧은 진단 문자열. 좌표·건강값·제목·메모는 절대 들어가지 않는다. */
  readonly message?: string | null | undefined;
  /** Health Connect `HealthConnectException` errorCode / HKError code. */
  readonly platformCode?: number | null | undefined;
  readonly exceptionClass?: string | null | undefined;
}

/**
 * 네이티브 모듈 계약. `./testing`의 `createFakeNativeWorkouts()`가 이것을 인메모리로 구현하고,
 * 실물은 `requireOptionalNativeModule('GjKitWorkouts')`가 돌려준다.
 */
export interface NativeWorkoutsModule {
  // -- 가용성/인가 (데이터 읽기 예산을 소비하지 않는다) --
  availability(): Promise<AvailabilityDto>;
  authorizationSnapshot(): Promise<AuthorizationSnapshotDto>;
  /**
   * No internal timeout (f120, f122). Returns the raw before/after granted sets.
   *
   * ⚠ **Phase 3 correction (design defect found by running the example app).** This member used to
   *   take ONE flat `readonly string[]`. That is lossless on Android — the direction lives in the
   *   permission string itself (`READ_EXERCISE` vs `WRITE_EXERCISE`) — but on iOS the SAME type
   *   identifier serves both directions, so a flat array cannot express what
   *   `HKHealthStore.requestAuthorization(toShare:read:)` requires: the iOS lane could only either
   *   over-request share access or silently drop it. The two sets are now explicit.
   *   `read`/`write` are Android permission strings on Android and HK type identifiers on iOS.
   *   `history` is Android's `READ_HEALTH_DATA_HISTORY` and rides in `read`.
   */
  requestPermissions(request: PermissionRequestDto): Promise<PermissionOutcomeDto>;
  /** 커서의 `g` 지문을 만드는 원시 연산. 정렬된 granted 권한 문자열 목록을 그대로 준다. */
  grantedScopeFingerprint(): Promise<string>;

  // -- 읽기 원시 연산 --
  /** Start instant in `[fromMs, toMs)`. iOS `.strictStartDate`, Android `TimeRangeFilter.between`. */
  readWorkoutPage(
    query: WindowDto & { readonly pageSize: number; readonly pageToken?: string | undefined },
  ): Promise<WorkoutPageDto>;
  /** One call per metric type per PAGE WINDOW - never per session (§8.4). Never `aggregate()` (f109). */
  readMetricRecords(
    query: WindowDto & { readonly type: MetricTypeDto; readonly origins: readonly string[] },
  ): Promise<readonly MetricRowDto[]>;
  readHeartRateSamples(query: WindowDto): Promise<readonly HeartRateDto[]>;
  /** iOS provenance discriminator required by RESULTS 206 / f71. */
  hasAssociatedSamples(nativeId: string, quantity: QuantityKindDto): Promise<boolean>;

  // -- 동기화 원시 연산 (그 위의 전부가 순수 TS다) --
  takeCheckpoint(): Promise<string>;
  drainCheckpoint(checkpoint: string, limit: number): Promise<DrainBatchDto>;

  // -- 루트: pull 기반 핸들 (for await의 break가 closeRoute로 매핑된다) --
  openRoute(nativeId: string, consent: 'skip' | 'prompt'): Promise<RouteHandleDto>;
  readRouteChunk(handle: string, maxPoints: number): Promise<readonly RoutePointDto[] | null>;
  closeRoute(handle: string): Promise<void>;

  // -- 쓰기 원시 연산 --
  /** iOS: look the workout up by sync identifier BEFORE writing (idx f26). Android: `null`. */
  findBySyncIdentifier(clientId: string): Promise<ExistingWorkoutDto | null>;
  saveWorkout(spec: WorkoutWriteDto): Promise<SaveOutcomeDto>;
  /** Android only, ALWAYS called after a save (f93, f94). `null` when nothing was found. */
  readBackVersion(clientId: string): Promise<number | null>;
  deleteWorkout(ref: DeleteRefDto): Promise<boolean>;

  // -- 플랫폼 통합 --
  openSettings(): Promise<void>;
  openStoreListing(): Promise<void>;
}
