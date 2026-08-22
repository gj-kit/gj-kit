// `"./core"` 배럴 — **peer 0**.
//
// 여기서 재export되는 것만이 공개 표면이다. 일부러 빠져 있는 것들:
//   `routeChunkPoints`         — 1000이 공개되면 조정이 breaking이 된다(D8, `chunk-constant-guard`).
//   `encodeCursor`/`decodeCursor`/`encodePageToken`/`decodePageToken` — 커서는 불투명하다.
//   `reduceSyncPage`·`workoutFromDto`·`writeDtoFrom`·sentinel 정리 — 내부 정규화 경로다.
// 이 목록은 `dist-peer-graph`·`entry-guard`가 지키는 불변식의 일부다.

export {
  WORKOUT_KINDS,
  SCOPES,
  WORKOUT_TOTALS_SCOPES,
  type AndroidWorkout,
  type AndroidWorkoutData,
  type CursorResetReason,
  type DeleteResult,
  type GetRouteOptions,
  type HeartRateSample,
  type Interval,
  type IosWorkout,
  type IosWorkoutData,
  type Lap,
  type ListQuery,
  type MetricProvenance,
  type Pause,
  type RemovedWorkout,
  type RouteAccess,
  type RoutePoint,
  type RouteState,
  type RouteWriteOutcome,
  type SaveResult,
  type Scope,
  type ScopeStatus,
  type StepTotal,
  type SyncPage,
  type SyncResult,
  type TimeWindow,
  type Workout,
  type WorkoutBase,
  type WorkoutHeartRateSummary,
  type WorkoutKind,
  type WorkoutPage,
  type WorkoutRef,
  type WorkoutSource,
  type WorkoutWrite,
  type WorkoutsPageToken,
  type WorkoutsPlatform,
  type WorkoutsSyncCursor,
} from './core/types';

export {
  WORKOUTS_ERROR_CODES,
  WorkoutsError,
  assertNeverWorkoutsCode,
  isWorkoutsError,
  workoutsErrorCode,
  type WorkoutsErrorCode,
  type WorkoutsErrorOptions,
} from './core/errors';

export {
  nativeErrorCodeFor,
  workoutsExceptionClassName,
  NATIVE_ERROR_CODES,
} from './core/mapErrors';

export type {
  AuthorizationSnapshotDto,
  AvailabilityDto,
  DeleteRefDto,
  DrainBatchDto,
  ExistingWorkoutDto,
  HeartRateDto,
  HeartRateSummaryDto,
  LapDto,
  MetricRowDto,
  MetricTypeDto,
  NativePayloadDto,
  NativeWorkoutsModule,
  PauseDto,
  PermissionOutcomeDto,
  PermissionRequestDto,
  QuantityKindDto,
  RemovedDto,
  RouteHandleDto,
  RoutePointDto,
  SaveOutcomeDto,
  SourceDto,
  WindowDto,
  WorkoutDto,
  WorkoutPageDto,
  WorkoutWriteDto,
} from './core/native-contract';

export { createWorkoutsApi, type CreateWorkoutsApiOptions, type WorkoutsApi } from './core/api';

export {
  ANDROID_HISTORY_PERMISSION,
  ANDROID_READ_PERMISSIONS,
  ANDROID_WRITE_PERMISSIONS,
  IOS_SCOPE_TYPES,
  WORKOUT_METRIC_SCOPES,
  androidRequestPermissions,
  androidRuntimeRequestPermissions,
  authorizationAdvice,
  deniedFromOutcome,
  deriveAuthorizationState,
  iosRequestIdentifiers,
  missingDeclarations,
  requiredWriteScopes,
  unpopulatedWorkoutMetrics,
  type AuthorizationAdvice,
  type AuthorizationDerivationFacts,
  type AuthorizationFacts,
  type AuthorizationRequest,
  type AuthorizationResult,
  type AuthorizationState,
  type Availability,
  type DirectedPermissions,
  type WorkoutMetricField,
} from './core/authorization';

export {
  androidExerciseTypeFromKind,
  hasAndroidIndoorPair,
  iosActivityTypeFromKind,
  kindFromAndroidExerciseType,
  kindFromIosActivityType,
} from './core/activity';

export {
  ANDROID_HISTORY_WINDOW_MS,
  EPOCH_MS_FLOOR,
  MAX_HEART_RATE_WINDOW_MS,
  activeDurationS,
} from './core/time';

export {
  collectRoute,
  derivePauses,
  normalizeRouteForWrite,
  routeDistanceM,
  routeElevationGainM,
} from './core/route';

export { MAX_ANDROID_ROUTE_POINTS, estimateAndroidRecordBytes } from './core/size';

export { ReadBudget, type ReadBudgetOptions } from './core/budget';

export {
  CURSOR_FORMAT_VERSION,
  READABLE_CURSOR_VERSIONS,
  describeCursor,
  type CursorInfo,
} from './core/sync/cursor';

export { reconcileSyncPage } from './core/sync/reduce';
