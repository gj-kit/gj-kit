// 활동 매핑 — 설계 §8.3의 표를 **양방향 전수**로 잠근다 (§9.1 · §9.4).
//
// 이 스위트가 하는 일은 "매핑이 맞다"가 아니라 **"표가 기억이 아니라 핀 박힌 데이터다"**를
// 유지하는 것이다. 정수 하나가 조용히 바뀌면 여기서 죽는다.

import { describe, expect, it } from 'vitest';

import vectors from '../fixtures/activity-vectors.json';
import {
  WORKOUT_KINDS,
  androidExerciseTypeFromKind,
  hasAndroidIndoorPair,
  iosActivityTypeFromKind,
  kindFromAndroidExerciseType,
  kindFromIosActivityType,
  type WorkoutKind,
} from '../../src/core';

const INDOOR_VALUES: readonly (boolean | undefined)[] = [true, false, undefined];

/** JSON 모듈의 추론 타입은 행마다 키가 달라 유니언이 된다 — 픽스처의 계약을 여기서 한 번만 적는다. */
interface KindVector {
  readonly kind: string;
  readonly pairedOnAndroid: boolean;
  readonly ios: number;
  readonly hc: number;
  readonly hcIndoor?: number | undefined;
}
const KIND_VECTORS = vectors.kinds as readonly KindVector[];
const ALIASES = vectors.iosReadAliases as readonly { readonly raw: number; readonly kind: string }[];

describe('activity — §8.3 골든 벡터', () => {
  it('WORKOUT_KINDS는 9종이고 픽스처와 같은 순서다 (D11 개정)', () => {
    expect(WORKOUT_KINDS.length).toBe(9);
    expect(KIND_VECTORS.map((row) => row.kind)).toEqual([...WORKOUT_KINDS]);
  });

  it('정수 22개가 값으로 고정돼 있다 — 미래의 편집이 하나를 조용히 바꿀 수 없다', () => {
    for (const row of KIND_VECTORS) {
      const kind = row.kind as WorkoutKind;
      expect(iosActivityTypeFromKind(kind), `${kind} ios`).toBe(row.ios);
      expect(androidExerciseTypeFromKind(kind, false), `${kind} hc`).toBe(row.hc);
      if (row.hcIndoor === undefined) continue;
      expect(androidExerciseTypeFromKind(kind, true), `${kind} hcIndoor`).toBe(row.hcIndoor);
    }
  });

  it('쌍 존재 여부가 픽스처와 일치한다', () => {
    for (const row of KIND_VECTORS) {
      expect(hasAndroidIndoorPair(row.kind as WorkoutKind), row.kind).toBe(row.pairedOnAndroid);
    }
  });

  it('정수 우연의 함정 — 두 플랫폼이 같은 정수를 다른 뜻으로 쓴다', () => {
    // iOS Hiking(24) != HC HIKING(37), 그리고 iOS Running 이 바로 그 37이다.
    expect(iosActivityTypeFromKind('hiking')).toBe(24);
    expect(androidExerciseTypeFromKind('hiking')).toBe(37);
    expect(iosActivityTypeFromKind('running')).toBe(37);
    // iOS WheelchairWalkPace(70) 와 HC STRENGTH_TRAINING(70).
    expect(iosActivityTypeFromKind('wheelchair')).toBe(70);
    expect(androidExerciseTypeFromKind('strength')).toBe(70);
    // .other = 3000 vs OTHER_WORKOUT = 0.
    expect(iosActivityTypeFromKind('other')).toBe(3000);
    expect(androidExerciseTypeFromKind('other')).toBe(0);
  });
});

describe('activity — 왕복 전수 (9 kind × indoor 3값 = 27조합)', () => {
  it('iOS: kind는 9종 전부 왕복한다', () => {
    for (const kind of WORKOUT_KINDS) {
      for (const indoor of INDOOR_VALUES) {
        const raw = iosActivityTypeFromKind(kind, indoor);
        expect(kindFromIosActivityType(raw).kind, `${kind}/${String(indoor)}`).toBe(kind);
      }
    }
  });

  it('iOS: indoor는 이 매퍼가 운반하지 않는다 — HKIndoorWorkout 메타데이터의 몫이다 (f76)', () => {
    for (const kind of WORKOUT_KINDS) {
      expect(kindFromIosActivityType(iosActivityTypeFromKind(kind, true)).indoor).toBeUndefined();
    }
  });

  it('Android: kind는 9종 전부 왕복한다', () => {
    for (const kind of WORKOUT_KINDS) {
      for (const indoor of INDOOR_VALUES) {
        const raw = androidExerciseTypeFromKind(kind, indoor);
        expect(kindFromAndroidExerciseType(raw).kind, `${kind}/${String(indoor)}`).toBe(kind);
      }
    }
  });

  it('Android: 쌍이 있는 넷만 indoor가 왕복하고, undefined는 false로 정규화된다', () => {
    for (const kind of WORKOUT_KINDS) {
      const paired = hasAndroidIndoorPair(kind);
      expect(kindFromAndroidExerciseType(androidExerciseTypeFromKind(kind, true)).indoor).toBe(
        paired ? true : undefined,
      );
      for (const indoor of [false, undefined] as const) {
        // RUNNING(56) · BIKING(8) · ROWING(53) · SWIMMING_OPEN_WATER(73)는 "실내가 아님"을
        // 적극적으로 뜻하므로 `undefined`가 보존되지 **않는다**. 버그가 아니라 계약이다.
        expect(
          kindFromAndroidExerciseType(androidExerciseTypeFromKind(kind, indoor)).indoor,
          `${kind}/${String(indoor)}`,
        ).toBe(paired ? false : undefined);
      }
    }
  });

  it("'other' 왕복은 손실적이다 — kind만 왕복하고 원래 활동은 돌아오지 않는다", () => {
    // HC 25 (ELLIPTICAL) 는 우리 표에 없다 -> 'other'. 다시 쓰면 0이 되고 25는 사라진다.
    expect(kindFromAndroidExerciseType(25).kind).toBe('other');
    expect(androidExerciseTypeFromKind('other')).toBe(0);
  });
});

describe('activity — read-alias와 total성', () => {
  it('iOS 20 -> strength, 71 -> wheelchair 이고 쓰기는 그 둘을 절대 내지 않는다', () => {
    for (const alias of ALIASES) {
      expect(kindFromIosActivityType(alias.raw).kind).toBe(alias.kind);
    }
    const emitted = WORKOUT_KINDS.flatMap((kind) =>
      INDOOR_VALUES.map((indoor) => iosActivityTypeFromKind(kind, indoor)),
    );
    expect(emitted).not.toContain(20);
    expect(emitted).not.toContain(71);
  });

  it('두 kindFrom*은 number 전역에서 total이다 (음수 · 비정수 · 거대값 포함)', () => {
    for (const raw of [-1, 1.5, 2 ** 31 - 1, Number.MAX_SAFE_INTEGER, 999_999]) {
      expect(kindFromIosActivityType(raw), `ios ${String(raw)}`).toEqual({
        kind: 'other',
        indoor: undefined,
      });
      expect(kindFromAndroidExerciseType(raw), `hc ${String(raw)}`).toEqual({
        kind: 'other',
        indoor: undefined,
      });
    }
  });

  it('iOS의 비대칭: 16(Elliptical)은 other로 접히지만 raw는 살아 있다', () => {
    expect(kindFromIosActivityType(16).kind).toBe('other');
    // 그 raw 16은 `platformData.ios.activityTypeRaw`에 보존된다 — Android 쪽에는 대응 단언이
    // 없다. IntDefMappingsKt가 읽기·쓰기 양방향에서 미매핑 정수를 0으로 접어버리기 때문이다.
    expect(vectors.unknownIntegers).toContain(16);
  });

  it('HC 0은 OTHER_WORKOUT이고, 그것은 "모름"이 아니라 실재하는 상수다', () => {
    expect(kindFromAndroidExerciseType(0)).toEqual({ kind: 'other', indoor: undefined });
  });
});
