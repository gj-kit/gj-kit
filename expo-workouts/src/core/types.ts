// 공개 도메인 타입 + I/O 타입 (설계 §5.1 · §5.2 io-types).
//
// peer 0 · DOM 0. 이 파일은 `tsconfig.core.json`의 컴파일 대상이며, `expo`·`react-native`가
// 여기 들어오는 순간 `nodom-source-guard`와 `entry-guard`가 동시에 실패한다.

/** The health store a workout came from. Also the discriminator of the `Workout` union. */
export type WorkoutsPlatform = 'ios' | 'android';

/**
 * D11, as amended by the product owner on 2026-08-22 (the original D11 named five members:
 * running | walking | hiking | cycling | other).
 *
 * Anything the platform reports that is not one of the eight named kinds collapses to `'other'`;
 * the raw value survives under `platformData` (iOS only — see below). CLOSED for 1.x; a member may
 * still be added in 0.x as a MINOR, which breaks exhaustive switches.
 *
 * Every member maps to a NON-DEPRECATED constant on BOTH platforms — the full table with raw
 * integers lives in `activity.ts` and is pinned by `tests/fixtures/activity-vectors.json`.
 *
 * ⚠ `indoor` is STORED on iOS and DERIVED on Android. Health Connect's `ExerciseSessionRecord` has
 *   no indoor field, so `indoor` survives an Android round-trip only for the four kinds that have a
 *   constant PAIR (`running`, `cycling`, `swimming`, `rowing`). For `walking`, `hiking`, `strength`,
 *   `wheelchair` and `other` it is written nowhere on Android and reads back `undefined`.
 * ⚠ The escape hatch is asymmetric. On iOS an unmapped `HKWorkoutActivityType` arrives intact in
 *   `platformData.ios.activityTypeRaw`. On Android the value is already destroyed before it reaches
 *   us — Health Connect collapses any unmapped int to 0 on BOTH the read and the write IPC path —
 *   so `platformData.android.exerciseType` reads 0 and `'other'` is all the information that exists.
 */
export const WORKOUT_KINDS = [
  'running',
  'walking',
  'hiking',
  'cycling',
  'swimming',
  'rowing',
  'strength',
  'wheelchair',
  'other',
] as const;
export type WorkoutKind = (typeof WORKOUT_KINDS)[number];

/**
 * One authorization vocabulary for both platforms. Read calls have NO `include` flags — capability
 * is chosen once, at authorization time. CLOSED for 1.x.
 *
 * Owner decision ② (2026-08-22) split this union from four members to seven so the consuming
 * developer chooses the granularity. Use `WORKOUT_TOTALS_SCOPES` for the coarse form; name the
 * members individually for the fine form.
 *
 * ⚠ **`'workouts'` no longer implies totals.** `read: ['workouts']` is valid code before and after
 *   this change and means something materially different after: ONE Android permission row instead
 *   of four, and `distanceM` / `activeEnergyKcal` / `elevationGainM` `undefined` on EVERY workout.
 *
 * - `workouts`     — the exercise SESSION and its intrinsic fields only.
 * - `distance`     — gates `Workout.distanceM` + `distanceProvenance`. iOS requests BOTH
 *                    `.distanceWalkingRunning` AND `.distanceCycling`, always both.
 * - `activeEnergy` — gates `Workout.activeEnergyKcal` + `activeEnergyProvenance`. Named
 *                    `activeEnergy` and NOT `energy`: `TotalCaloriesBurnedRecord` is forbidden as a
 *                    fallback because it silently mixes in BMR.
 * - `elevation`    — gates `Workout.elevationGainM`. ⚠ On iOS this maps to the EMPTY HealthKit set
 *                    and therefore ALIASES `workouts`.
 * - `routes`       — read maps to READ_EXERCISE_ROUTES, which is manifest-declared and NEVER
 *                    requestable at runtime; write maps to WRITE_EXERCISE_ROUTE (singular).
 * - `heartRate` / `steps` — the READ_/WRITE_ pair for that type; each also gates its own top-level
 *                    read function.
 */
export const SCOPES = [
  'workouts',
  'distance',
  'activeEnergy',
  'elevation',
  'routes',
  'heartRate',
  'steps',
] as const;
export type Scope = (typeof SCOPES)[number];

/**
 * The coarse form of owner decision ②, in ONE token: the session plus every total the common
 * `Workout` model carries. Spread it in place —
 *
 * ```ts
 * await requestAuthorization({ read: [...WORKOUT_TOTALS_SCOPES, 'routes'] });
 * ```
 *
 * This is the recipe to copy unless you have a reason not to. Naming the members individually is
 * the NARROW case and should be a deliberate act.
 *
 * It DELIBERATELY EXCLUDES `'routes'`: a convenience constant must never hide a non-requestable
 * scope inside itself, or it lies about what the permission dialog will show.
 *
 * ⚠ Spread it; do not `.concat()` it (TS2769), and do not park it in an un-annotated intermediate
 *   (`string[]`, then TS2322 at the use site). Add `satisfies readonly Scope[]` if you need a
 *   variable.
 */
export const WORKOUT_TOTALS_SCOPES = [
  'workouts',
  'distance',
  'activeEnergy',
  'elevation',
] as const satisfies readonly Scope[];

/**
 * - 'granted'      — proceed.
 * - 'denied'       — the user said no. `openSettings()`; asking again will not help.
 * - 'undetermined' — never asked, OR the last request was inconclusive. Call `requestAuthorization()`.
 * - 'unknown'      — unknowable by platform design. EVERY iOS read scope that has already been asked
 *                    about reports this, permanently. Proceed, and treat an empty result as
 *                    ambiguous rather than as "no data".
 * CLOSED for 1.x.
 */
export type ScopeStatus = 'granted' | 'denied' | 'undetermined' | 'unknown';

/**
 * Whether a GPS route can be read for a workout, RECOMPUTED ON EVERY READ.
 * Never cache this across app sessions: on Android an app can lose read access to routes it wrote
 * itself once both route scopes are revoked.
 *
 * - 'available'       — the route can be streamed with `getRoute()` right now.
 * - 'consentRequired' — a route EXISTS but is not readable. **Never collapse this to 'none'.**
 * - 'none'            — there is no route at all. On iOS this is also what a denied read looks like.
 * CLOSED for 1.x.
 */
export type RouteState = 'available' | 'consentRequired' | 'none';

/**
 * How far route reads reach right now.
 * - 'all'      — the route permission is held AND the app is in the foreground.
 * - 'own'      — only routes this app wrote read inline.
 * - 'perRoute' — nothing reads inline; each route needs `getRoute(id, { consent: 'prompt' })`.
 *
 * ⚠ On iOS this is always `'all'` and is NOT evidence of anything — read it together with
 *   `read.routes === 'unknown'`.
 * ⚠ On Android `'all'` does NOT guarantee a route read succeeds: Health Connect's first-run
 *   onboarding is an undocumented further precondition. `'all'` + `getRoute` throwing
 *   `consentRequired` is the signature of incomplete onboarding — send the user to `openSettings()`.
 * CLOSED for 1.x.
 */
export type RouteAccess = 'all' | 'own' | 'perRoute';

/**
 * Where a distance/energy number came from.
 * - 'associated' — summed from samples explicitly associated with the workout.
 * - 'total'      — a total the writer stated but did not back with samples (iOS legacy workouts).
 * - 'derived'    — summed over the workout's window from whatever samples were there.
 *                  **May include other sources.** Treat `derived` as a hint, never as the workout's
 *                  own number.
 */
export type MetricProvenance = 'associated' | 'total' | 'derived';

/** Opaque. Persist it verbatim; never parse, compare or construct one. */
export type WorkoutsSyncCursor = string;
/** Opaque, and NOT interchangeable with a sync cursor — the two carry different magic prefixes. */
export type WorkoutsPageToken = string;

/**
 * Epoch-ms half-open window. Everywhere in this library it means: the record's **START instant** in
 * `[fromMs, toMs)`. There is no overlap variant and no local-day variant — day bucketing is your
 * job, done afterwards from `utcOffsetMin`.
 *
 * Both bounds are validated against `EPOCH_MS_FLOOR`: a value in `(0, 1e11)` is rejected with
 * `invalidArgument` because it is a seconds timestamp in a milliseconds field.
 */
export interface TimeWindow {
  /** Inclusive. Epoch MILLISECONDS, integer. */
  readonly fromMs: number;
  /** EXCLUSIVE. Epoch MILLISECONDS, integer, > `fromMs`. */
  readonly toMs: number;
}

export interface Interval {
  readonly startMs: number;
  readonly endMs: number;
}
/** `auto` is true for platform-detected pauses (HK motionPaused / HC REST-flagged segments). */
export interface Pause extends Interval {
  readonly auto?: boolean | undefined;
}
export interface Lap extends Interval {
  readonly distanceM?: number | undefined;
}

export interface WorkoutSource {
  /** iOS bundle identifier / Android package name. Apple Watch first-party reads as
   *  `com.apple.health.<UUID>`. */
  readonly id: string;
  /** iOS only — Android's DataOrigin carries a package name and nothing else. */
  readonly name?: string | undefined;
  readonly version?: string | undefined;
  readonly deviceModel?: string | undefined;
}

export interface WorkoutHeartRateSummary {
  readonly avgBpm?: number | undefined;
  readonly minBpm?: number | undefined;
  readonly maxBpm?: number | undefined;
}

/** One heart-rate reading. The same shape on read and on write. */
export interface HeartRateSample {
  /** Epoch MILLISECONDS. */
  readonly t: number;
  /** Integer beats per minute, 1..300. Samples outside that range are dropped on write. */
  readonly bpm: number;
}

/**
 * One GPS fix. SI units, unit in the field name.
 *
 * Negative CoreLocation sentinels (`-1`) are mapped to `undefined` for `hAccM`, `vAccM`, `speedMps`
 * and `courseDeg`; an explicit `0` is PRESERVED as `0`, because HealthKit preserves it.
 * `altM` is passed through verbatim — a negative altitude is a legal value (Dead Sea), not a
 * sentinel; `vAccM` is the actual validity flag for it.
 */
export interface RoutePoint {
  /** Epoch MILLISECONDS. Strictly increasing after our normalisation. */
  readonly t: number;
  /** WGS84 degrees, -90..90. Out of range is `invalidArgument` on BOTH platforms. */
  readonly lat: number;
  /** WGS84 degrees, -180..180. */
  readonly lon: number;
  readonly altM?: number | undefined;
  /** Horizontal accuracy, metres. */
  readonly hAccM?: number | undefined;
  /** Vertical accuracy, metres. */
  readonly vAccM?: number | undefined;
  /** iOS only — Health Connect's `ExerciseRoute.Location` has no speed field. */
  readonly speedMps?: number | undefined;
  /** iOS only. */
  readonly courseDeg?: number | undefined;
}

/** Raw iOS values the common model deliberately does not model. */
export interface IosWorkoutData {
  /** Raw HKWorkoutActivityType — the escape hatch for everything D11 collapses into 'other'. */
  readonly activityTypeRaw: number;
  readonly bundleIdentifier: string;
  readonly productType?: string | undefined;
  readonly osVersion?: string | undefined;
  /** IANA identifier from HKMetadataKeyTimeZone, present only when the writer supplied one. */
  readonly timeZoneId?: string | undefined;
  readonly elevationDescendedM?: number | undefined;
  /** `(endMs - startMs) / 1000`. Differs from `activeDurationS`, which honours the writer's own
   *  `duration` argument. */
  readonly wallClockS: number;
  readonly syncIdentifier?: string | undefined;
  readonly syncVersion?: number | undefined;
  /** Number of HKWorkoutActivity entries (multi-sport workouts). */
  readonly activityCount: number;
  /** Whether the HKIndoorWorkout metadata key was present — the only honest indoor discriminator. */
  readonly hasIndoorMetadataKey: boolean;
  readonly routeSampleCount: number;
}

/** Raw Android values the common model deliberately does not model. */
export interface AndroidWorkoutData {
  /** Raw ExerciseSessionRecord.exerciseType. */
  readonly exerciseType: number;
  readonly packageName: string;
  readonly recordingMethod: number;
  readonly deviceType?: number | undefined;
  /**
   * The writer's own client record id. Foreign apps' values ARE visible here — treat it as PUBLIC
   * data, never as a private namespace.
   */
  readonly clientRecordId?: string | undefined;
  readonly clientRecordVersion?: number | undefined;
  readonly endUtcOffsetMin?: number | undefined;
  /** Foreign-app authored text. This library never writes a title or notes. */
  readonly title?: string | undefined;
  readonly notes?: string | undefined;
  /** Every segment, including REST (44), which `pauses` deliberately excludes. PAUSE is 39. */
  readonly segments: readonly {
    readonly type: number;
    readonly startMs: number;
    readonly endMs: number;
  }[];
}

/** The fields both platforms share. Never used directly — see `Workout`. */
export interface WorkoutBase {
  /** The PLATFORM id: HKWorkout.uuid / ExerciseSessionRecord.metadata.id. Pass this to `getRoute`. */
  readonly id: string;
  /**
   * The id the WRITING app used (HKMetadataKeySyncIdentifier / clientRecordId), when present.
   * It is the STABLE upsert key for own writes: on iOS `id` changes when a workout is replaced while
   * `clientId` does not. It is visible cross-app, so never put anything sensitive in it.
   */
  readonly clientId?: string | undefined;
  /** True when this app wrote it. Nothing is filtered on your behalf — the sync loop needs to see
   *  its own echo to reconcile native ids. Filter on this yourself. */
  readonly isOwn: boolean;
  readonly kind: WorkoutKind;
  /**
   * `undefined` when the platform cannot tell. iOS raw `locationType` 3 means "outdoor OR unknown",
   * so an absent HKIndoorWorkout metadata key leaves this undefined rather than `false`.
   *
   * ⚠ **Platform-asymmetric, by construction.** On iOS this is STORED, so it round-trips for every
   *   `kind`. On Android it is DERIVED from `exerciseType` alone, so it survives only for the four
   *   kinds with a constant pair (`running`, `cycling`, `swimming`, `rowing`) and reads back
   *   `undefined` for the other five. On those four paired kinds the opposite rounding happens:
   *   `indoor: undefined` normalizes to `false` after an Android round-trip.
   */
  readonly indoor?: boolean | undefined;
  readonly startMs: number;
  readonly endMs: number;
  /**
   * Active seconds. iOS: the store's own `duration`, which honours the writer's explicit value and
   * can differ from `endMs - startMs`. Android: `(endMs - startMs)` minus every PAUSE segment.
   */
  readonly activeDurationS: number;
  /** Minutes east of UTC at the workout's start. Use this for day bucketing. */
  readonly utcOffsetMin?: number | undefined;
  readonly source: WorkoutSource;
  /**
   * Metres. `undefined` means UNKNOWN — never 0.
   * ⚠ Populated only when the `'distance'` read scope is granted. With `read: ['workouts']` alone
   *   this field is `undefined` on EVERY workout. `unpopulatedWorkoutMetrics(state)` answers "which
   *   fields can never be filled with the permissions I hold" without a device.
   */
  readonly distanceM?: number | undefined;
  readonly distanceProvenance?: MetricProvenance | undefined;
  /**
   * Active kcal, never total/BMR-inclusive. `undefined` means UNKNOWN — never 0.
   * ⚠ Populated only when the `'activeEnergy'` read scope is granted.
   */
  readonly activeEnergyKcal?: number | undefined;
  readonly activeEnergyProvenance?: MetricProvenance | undefined;
  /**
   * Metres of cumulative ascent. ⚠ Populated only when the `'elevation'` read scope is granted.
   * On iOS that scope maps to the EMPTY HealthKit set and therefore aliases `'workouts'`.
   */
  readonly elevationGainM?: number | undefined;
  /** ⚠ Populated only when the `'heartRate'` read scope is granted. */
  readonly heartRate?: WorkoutHeartRateSummary | undefined;
  /** ⚠ Populated only when the `'steps'` read scope is granted. */
  readonly steps?: number | undefined;
  /** Explicit pause segments only. */
  readonly pauses: readonly Pause[];
  readonly laps: readonly Lap[];
  readonly routeState: RouteState;
  readonly lastModifiedMs?: number | undefined;
}

export interface IosWorkout extends WorkoutBase {
  readonly platform: 'ios';
  readonly platformData: IosWorkoutData;
}
export interface AndroidWorkout extends WorkoutBase {
  readonly platform: 'android';
  readonly platformData: AndroidWorkoutData;
}
/** Discriminated by `platform` — `if (w.platform === 'ios')` narrows `platformData` with ZERO casts. */
export type Workout = IosWorkout | AndroidWorkout;

// ── I/O 타입 (설계 §5.2 io-types) ─────────────────────────────────────────────

export interface ListQuery extends TimeWindow {
  /** From a previous page's `nextPageToken`. **NOT a sync cursor** — the two carry different magic. */
  readonly pageToken?: WorkoutsPageToken | undefined;
}

export interface WorkoutPage {
  /** DESCENDING by start instant — most recent first. The order is part of the contract, because it
   *  is what makes a multi-launch backfill resumable. */
  readonly items: readonly Workout[];
  /** Absent = last page. */
  readonly nextPageToken?: WorkoutsPageToken | undefined;
}

export interface RemovedWorkout {
  readonly id: string;
  /**
   * `true` only with POSITIVE evidence that the same logical workout still exists under a different
   * native id. **Always `false` on Android** — an upsert there keeps the same deterministic UUID.
   *
   * `false` does NOT mean "definitely and permanently deleted": HealthKit may purge deletion records
   * before we ever see them, so a workout can vanish with no `removed` entry at all.
   */
  readonly replaced: boolean;
}

export interface SyncPage {
  /**
   * An idempotent UPSERT SET keyed by `id` (or by `clientId` for own writes), never a delta append.
   * The same workout may legitimately appear in two consecutive results. Health Connect emits an
   * upsertion change even for a write that changed nothing, so the presence of a workout here is not
   * a claim that it changed.
   */
  readonly added: readonly Workout[];
  /** May contain ids this app never held. `remove(unknown id)` MUST be a no-op. */
  readonly removed: readonly RemovedWorkout[];
  /**
   * Persist this together with `added`/`removed` **IN ONE TRANSACTION**. Persisting the cursor
   * without the items loses those workouts permanently and the library cannot prevent it.
   */
  readonly cursor: WorkoutsSyncCursor;
  /** `true` = call `syncWorkouts(result.cursor)` again immediately. */
  readonly hasMore: boolean;
}

export type CursorResetReason =
  /** `cursor === null` — a fresh start. */
  | 'noCursor'
  /** Bad magic / bad base64url / bad JSON / failed shape validation. */
  | 'malformed'
  /** Magic ok, format version not in `READABLE_CURSOR_VERSIONS`. */
  | 'formatUnsupported'
  /** Minted on the other platform (server-synced cursor, device switch, restore). */
  | 'platformMismatch'
  /** Android: `ChangesResponse.changesTokenExpired === true` (30-day idle). */
  | 'expired'
  /** The granted-scope fingerprint differs from the one baked into the cursor. */
  | 'scopesChanged';

/**
 * Discriminated on `reset`, so `resetReason` is unreachable without narrowing and unforgettable when
 * present. `const b: boolean = result.reset` still compiles, so this stays read-compatible with the
 * mission's `reset: boolean` sketch at every call site.
 */
export type SyncResult =
  | (SyncPage & { readonly reset: false })
  | (SyncPage & {
      readonly added: readonly [];
      readonly removed: readonly [];
      readonly hasMore: false;
      readonly reset: true;
      readonly resetReason: CursorResetReason;
    });

export interface StepTotal {
  /**
   * Steps in the window. `0` is a real answer.
   * When several apps wrote steps over the window this is the LARGEST SINGLE-`dataOrigin` total, not
   * the sum — a phone + watch device is never double-counted. It will therefore disagree with the
   * number Health Connect's own UI shows, which merges by an app-priority list we cannot read.
   * On iOS a denied read scope is indistinguishable from no data, so `0` can also mean "not granted".
   */
  readonly count: number;
}

/**
 * Identify a workout without ambiguity. Two id spaces exist and both are UUIDs, so no runtime
 * heuristic can tell them apart — the type makes the choice unmissable.
 * The `?: never` members are load-bearing: a bare `{a} | {b}` union ACCEPTS both keys together.
 */
export type WorkoutRef =
  /** The platform id from `Workout.id`. */
  | { readonly nativeId: string; readonly clientId?: never }
  /** Your own `WorkoutWrite.id`. */
  | { readonly clientId: string; readonly nativeId?: never };

export interface DeleteResult {
  /** `false` for an id that was not there. Deleting something absent is never an error. */
  readonly deleted: boolean;
}

export interface GetRouteOptions {
  /**
   * What to do when `routeState === 'consentRequired'` (Android only — HealthKit has no per-route
   * consent).
   * - `'skip'` (default) — throw `consentRequired`. Never shows UI, never blocks.
   * - `'prompt'`         — show the platform's per-route dialog and, if the user allows, stream the
   *   route from that same call. Can block for tens of seconds, so it must be driven by an explicit
   *   user gesture. Only one prompt may be in flight per process; a concurrent call throws `busy`.
   */
  readonly consent?: 'skip' | 'prompt' | undefined;
}

/**
 * Full-state input for `saveWorkout`. There is NO partial-update path: on Android an upsert that
 * omits the route DELETES the stored route, so the only safe contract is "send everything".
 */
export interface WorkoutWrite {
  /**
   * A stable id this app owns — the idempotency key. Becomes HKMetadataKeySyncIdentifier /
   * Health Connect `clientRecordId`.
   * ⚠ Other apps CAN read this value on Android. Use an opaque UUID.
   * Must match `/^[A-Za-z0-9._:-]{1,120}$/`.
   */
  readonly id: string;
  /**
   * A safe integer >= 1, non-decreasing per `id`, that increases whenever the content changes.
   * Derive it from your own record's `updatedAt` (epoch ms) or from an edit counter.
   * ⚠ NEVER `Date.now()` at call time: a crash retry would write a fresh version and, on iOS, mint a
   *   second workout object and orphan the first one's samples and route.
   * An EQUAL version replaces the stored workout; a LOWER one throws `staleVersion` and writes nothing.
   */
  readonly version: number;
  /**
   * Nine members since owner decision ③. `'other'` is the documented lossy sink — it stores
   * OTHER_WORKOUT(0) / `.other`(3000) and the original activity is not recoverable.
   */
  readonly kind: WorkoutKind;
  /**
   * Drives the platform activity constant on write.
   * ⚠ On Android it is only representable for `running`, `cycling`, `swimming` and `rowing`; for
   *   every other kind it is silently dropped and reads back `undefined`. On iOS it is written to
   *   `HKMetadataKeyIndoorWorkout` for every kind — but only when you actually set it: leaving it
   *   `undefined` OMITS the key rather than writing `@NO`.
   */
  readonly indoor?: boolean | undefined;
  readonly startMs: number;
  /** Must be > `startMs` and <= now. */
  readonly endMs: number;
  readonly utcOffsetMin?: number | undefined;
  /** IANA zone id (e.g. `'Asia/Seoul'`). iOS metadata only; Android stores only the offset. */
  readonly timeZoneId?: string | undefined;
  readonly pauses?: readonly Pause[] | undefined;
  readonly laps?: readonly Lap[] | undefined;
  readonly distanceM?: number | undefined;
  readonly activeEnergyKcal?: number | undefined;
  readonly elevationGainM?: number | undefined;
  /** Omitted from the write when <= 0 — Health Connect throws on `StepsRecord(count = 0)`. */
  readonly steps?: number | undefined;
  /** Samples outside 1..300 bpm or outside `[startMs, endMs)` are dropped before writing. */
  readonly heartRate?: readonly HeartRateSample[] | undefined;
  /**
   * REQUIRED, and `'none'` is not the same call shape as an empty array.
   *
   * ⚠ This is the one place where forgetting a field DESTROYS user data: an Android upsert that
   *   omits the route while holding the route write scope DELETES the stored route. Making the field
   *   required turns that silent, irreversible mistake into a compile error, and `'none'` forces the
   *   intent to be stated out loud.
   * An empty array is `invalidArgument` — say `'none'`.
   */
  readonly route: readonly RoutePoint[] | 'none';
}

/**
 * What happened to `route`.
 *  - 'stored'       — written and readable.
 *  - 'none'         — you passed `'none'`.
 *  - 'dropped'      — you passed points but NOTHING survived hygiene; the workout was still saved.
 *  - 'notPermitted' — Android: WRITE_EXERCISE_ROUTE is not granted; the workout was still saved.
 *                     ⚠ On a re-save this means the previously stored route is now GONE.
 *  - 'deferred'     — `status === 'pendingUnlock'`; the retry will attach it.
 */
export type RouteWriteOutcome = 'stored' | 'none' | 'dropped' | 'notPermitted' | 'deferred';

/**
 * A discriminated union, so `nativeId` does not EXIST on the `pendingUnlock` branch. That branch
 * only ever appears on a locked device, i.e. never during development, so a type that merely made
 * `nativeId` optional would be forgotten by everyone.
 */
export type SaveResult =
  | {
      readonly status: 'saved';
      /** Echo of `WorkoutWrite.id`. */
      readonly id: string;
      /** The platform's own id for the stored workout. */
      readonly nativeId: string;
      readonly route: Exclude<RouteWriteOutcome, 'deferred'>;
      /** How many points actually reached the store. Compare it against what you sent to see how
       *  much our mandatory hygiene removed. */
      readonly routePointsWritten: number;
    }
  | {
      /**
       * The store accepted the workout but cannot confirm it while the device is locked.
       * **Do not re-save blindly.** Call `saveWorkout` again with the SAME `id` and `version` once
       * the device is unlocked; that call is idempotent and completes the route.
       */
      readonly status: 'pendingUnlock';
      readonly id: string;
      readonly route: 'deferred';
      readonly routePointsWritten: 0;
    };
