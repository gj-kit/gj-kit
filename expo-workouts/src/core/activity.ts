// 활동 매핑 — 읽기와 쓰기 양방향 (설계 §8.3, D11 개정 후 9종).
//
// 표의 모든 정수는 설계 세션에서 **설치된 산출물에서 직접 읽은 것**이다:
//   iOS  — `iPhoneOS26.5.sdk/.../HealthKit.framework/Headers/HKWorkout.h`의 `HKWorkoutActivityType`
//   HC   — `connect-client-1.1.0.aar` → `javap -constants -p .../ExerciseSessionRecord.class`
//
// ⚠ **정수 우연의 함정.** iOS `Hiking`은 24이고 HC `HIKING`은 37인데 iOS `Running`이 37이다.
//   iOS `WheelchairWalkPace`는 70이고 HC `STRENGTH_TRAINING`도 70이다. `.other`는 3000,
//   `OTHER_WORKOUT`은 0이다. **두 플랫폼 사이에 정수를 재사용하는 표는 전부 틀린다** —
//   쓰기 방향 매퍼를 passthrough로 쓰면 안 되는 이유이자 `activity-vectors.json`이 존재하는 이유다.

import type { WorkoutKind } from './types';

/** 매핑 한 행. `hcIndoor`가 있으면 그 kind는 Android에서 `indoor`가 왕복한다(= 쌍이 있다). */
interface ActivityRow {
  readonly kind: WorkoutKind;
  /** HKWorkoutActivityType raw. */
  readonly ios: number;
  /** Health Connect `exerciseType` for the outdoor / unqualified form. */
  readonly hc: number;
  /** Health Connect `exerciseType` for the indoor form — only the four PAIRED kinds have one. */
  readonly hcIndoor?: number | undefined;
}

/**
 * 정본 매핑표 (설계 §8.3). 행 순서는 `WORKOUT_KINDS`와 같다.
 *
 * ⚠ 이 표를 손으로 고치지 말고 `tests/fixtures/activity-vectors.json`을 함께 고쳐라 —
 *   세 언어(TS · Swift · Kotlin)가 그 파일 하나를 읽는다.
 */
const ACTIVITY_TABLE: readonly ActivityRow[] = [
  { kind: 'running', ios: 37, hc: 56, hcIndoor: 57 },
  { kind: 'walking', ios: 52, hc: 79 },
  { kind: 'hiking', ios: 24, hc: 37 },
  { kind: 'cycling', ios: 13, hc: 8, hcIndoor: 9 },
  // SWIMMING_OPEN_WATER(73) = outdoor, SWIMMING_POOL(74) = indoor.
  { kind: 'swimming', ios: 46, hc: 73, hcIndoor: 74 },
  { kind: 'rowing', ios: 35, hc: 53, hcIndoor: 54 },
  { kind: 'strength', ios: 50, hc: 70 },
  { kind: 'wheelchair', ios: 70, hc: 82 },
  { kind: 'other', ios: 3000, hc: 0 },
];

/**
 * READ-ALIASES — 쓰기 방향이 **절대 내지 않는** 두 iOS 상수.
 * 20 `FunctionalStrengthTraining` → `'strength'` (Apple Watch 근력 워크아웃이 `'other'`가 되지 않게)
 * 71 `WheelchairRunPace`          → `'wheelchair'` (우리 모델에 페이스 개념이 없다; 쓰기는 언제나 70)
 *
 * Android에는 alias가 없다 — 받는 상수는 전부 내보내기도 한다.
 */
const IOS_READ_ALIASES: ReadonlyMap<number, WorkoutKind> = new Map([
  [20, 'strength'],
  [71, 'wheelchair'],
] as const);

const BY_KIND: ReadonlyMap<WorkoutKind, ActivityRow> = new Map(
  ACTIVITY_TABLE.map((row) => [row.kind, row] as const),
);

const IOS_TO_KIND: ReadonlyMap<number, WorkoutKind> = new Map([
  ...ACTIVITY_TABLE.map((row) => [row.ios, row.kind] as const),
  ...IOS_READ_ALIASES,
]);

/** raw -> { kind, indoor }. `indoor`는 쌍이 있는 넷에서만 결정된다. */
type AndroidReading = { readonly kind: WorkoutKind; readonly indoor?: boolean | undefined };

const HC_TO_KIND: ReadonlyMap<number, AndroidReading> = new Map<number, AndroidReading>([
  ...ACTIVITY_TABLE.map(
    (row): readonly [number, AndroidReading] => [
      row.hc,
      // 쌍이 있는 넷의 outdoor 상수는 "실내가 아님"을 **적극적으로** 뜻한다 -> `false`.
      // 쌍이 없는 다섯에는 indoor 정보가 존재하지 않는다 -> `undefined`.
      { kind: row.kind, indoor: row.hcIndoor === undefined ? undefined : false },
    ],
  ),
  ...ACTIVITY_TABLE.filter((row) => row.hcIndoor !== undefined).map(
    (row): readonly [number, AndroidReading] => [row.hcIndoor as number, { kind: row.kind, indoor: true }],
  ),
]);

/** 이 kind가 Android에서 `indoor`를 왕복시키는가 (= 상수 쌍이 있는가). */
export function hasAndroidIndoorPair(kind: WorkoutKind): boolean {
  return BY_KIND.get(kind)?.hcIndoor !== undefined;
}

/**
 * Raw HKWorkoutActivityType → WorkoutKind. TOTAL over `number`: anything not in the table —
 * including negative, non-integer and huge values that only the JS boundary can produce — returns
 * `{ kind: 'other' }` with `indoor` left `undefined`.
 *
 * ⚠ **`indoor` never comes from this function on iOS.** HealthKit carries it in the
 *   `HKIndoorWorkout` metadata key (and, for swimming, in `HKMetadataKeySwimmingLocationType`),
 *   orthogonally to the activity type. The return shape keeps `indoor` for symmetry with the
 *   Android mapper and is always `undefined` here.
 *
 * ⚠ **Nothing collapses on iOS.** `HKWorkoutActivityType` is a plain `NSUInteger`, so an unknown
 *   value (e.g. 16 = Elliptical) arrives intact and IS preserved in
 *   `platformData.ios.activityTypeRaw` — an app can recover it. Contrast
 *   `kindFromAndroidExerciseType`.
 *
 * READ-ALIASES: 20 (FunctionalStrengthTraining) → `'strength'` and 71 (WheelchairRunPace) →
 * `'wheelchair'` map INTO kinds the write direction never emits, so the two mapper directions are
 * NOT literal inverses. The asserted property is write-then-read only.
 */
export function kindFromIosActivityType(raw: number): {
  kind: WorkoutKind;
  indoor?: boolean | undefined;
} {
  const kind = Number.isInteger(raw) ? IOS_TO_KIND.get(raw) : undefined;
  return { kind: kind ?? 'other', indoor: undefined };
}

/**
 * Health Connect exerciseType → WorkoutKind + indoor. TOTAL over `number`, same contract as above.
 *
 * ⚠ **The raw value is already destroyed before it reaches us.** Health Connect's
 *   `IntDefMappingsKt` collapses any unmapped int to 0 (`EXERCISE_TYPE_OTHER_WORKOUT`) on BOTH the
 *   read and the write IPC path. So for a future activity `platformData.android.exerciseType` reads
 *   0, not the real value, and `'other'` is all the information that exists.
 *
 * `indoor` is only decidable for the four kinds with a constant PAIR; for the other five it is
 * `undefined` because Health Connect stores the fact nowhere.
 *
 * Android has no read-aliases: every Health Connect constant we accept, we also emit.
 */
export function kindFromAndroidExerciseType(raw: number): {
  kind: WorkoutKind;
  indoor?: boolean | undefined;
} {
  const hit = Number.isInteger(raw) ? HC_TO_KIND.get(raw) : undefined;
  if (hit === undefined) return { kind: 'other', indoor: undefined };
  return { kind: hit.kind, indoor: hit.indoor };
}

/**
 * WRITE direction, iOS. `indoor` is NOT part of the integer choice on this platform — it is written
 * separately to `HKMetadataKeyIndoorWorkout` (and `HKMetadataKeySwimmingLocationType` for swimming),
 * and OMITTED entirely when `undefined` so the read side can keep telling "outdoor" and "unknown"
 * apart.
 * ⚠ `kind: 'other'` writes `.other`(3000) and is NOT recoverable on read.
 * ⚠ Never emits 20 or 71 — those are read-aliases only.
 */
export function iosActivityTypeFromKind(kind: WorkoutKind, indoor?: boolean | undefined): number {
  void indoor;
  const row = BY_KIND.get(kind);
  // 표는 `WorkoutKind` 전수를 담으므로 이 폴백은 도달 불가다. 유니언이 minor로 넓어졌는데
  // 표를 안 고친 경우에만 `'other'`로 안전하게 떨어진다.
  return row?.ios ?? 3000;
}

/**
 * WRITE direction, Android. `indoor` selects between the constant PAIR where one exists
 * (running / cycling / swimming / rowing) and is otherwise silently dropped — Health Connect has
 * nowhere to store it.
 * ⚠ `kind: 'other'` writes OTHER_WORKOUT(0) and is NOT recoverable on read.
 */
export function androidExerciseTypeFromKind(kind: WorkoutKind, indoor?: boolean | undefined): number {
  const row = BY_KIND.get(kind);
  if (row === undefined) return 0;
  if (indoor === true && row.hcIndoor !== undefined) return row.hcIndoor;
  return row.hc;
}
