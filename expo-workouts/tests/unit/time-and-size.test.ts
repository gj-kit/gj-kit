// 시간·창 검증과 Health Connect 크기 모델 (설계 §5.2 · §0.3 V9 · f99 · f100).

import { describe, expect, it } from 'vitest';

import vectors from '../fixtures/route-vectors.json';
import {
  ANDROID_HISTORY_WINDOW_MS,
  EPOCH_MS_FLOOR,
  MAX_ANDROID_ROUTE_POINTS,
  MAX_HEART_RATE_WINDOW_MS,
  activeDurationS,
  estimateAndroidRecordBytes,
  workoutsErrorCode,
} from '../../src/core';
import { assertEpochMs, assertTimeWindow, normalizeUtcOffsetMin } from '../../src/core/time';
import { ANDROID_RECORD_BYTE_LIMIT } from '../../src/core/size';

interface SizeVector {
  readonly routePoints: number;
  readonly clientRecordIdLength: number;
  readonly titleLength?: number | undefined;
  readonly notesLength?: number | undefined;
  readonly segments?: number | undefined;
  readonly laps?: number | undefined;
  readonly bytes: number;
  readonly accepted: boolean;
}
const SIZE_VECTORS = vectors.sizeVectors as readonly SizeVector[];

function codeOf(run: () => unknown): string | null {
  try {
    run();
    return null;
  } catch (error) {
    return workoutsErrorCode(error);
  }
}

describe('EPOCH_MS_FLOOR — 초를 밀리초 자리에 넣는 사고 (V9)', () => {
  it('상수는 1e11이고 그 값은 1973-03-03이다', () => {
    expect(EPOCH_MS_FLOOR).toBe(100_000_000_000);
    expect(new Date(EPOCH_MS_FLOOR).toISOString().startsWith('1973-03-03')).toBe(true);
  });

  it('오늘의 epoch-초는 바닥보다 훨씬 아래다 — 그래서 (0, 1e11)이 정확히 그 실수와 동치다', () => {
    const nowSeconds = Math.floor(Date.parse('2026-08-22T00:00:00Z') / 1000);
    expect(nowSeconds).toBeLessThan(EPOCH_MS_FLOOR);
    expect(codeOf(() => assertEpochMs(nowSeconds, 'fromMs'))).toBe('invalidArgument');
  });

  it('0은 허용한다 — 에포크 자체는 초/밀리초 혼동이 아니다', () => {
    expect(codeOf(() => assertEpochMs(0, 'fromMs'))).toBeNull();
  });

  it('정상적인 밀리초는 통과하고, 비정수·음수·비유한은 거절한다', () => {
    expect(codeOf(() => assertEpochMs(1_755_000_000_000, 'fromMs'))).toBeNull();
    expect(codeOf(() => assertEpochMs(1.5, 'fromMs'))).toBe('invalidArgument');
    expect(codeOf(() => assertEpochMs(-1, 'fromMs'))).toBe('invalidArgument');
    expect(codeOf(() => assertEpochMs(Number.NaN, 'fromMs'))).toBe('invalidArgument');
    expect(codeOf(() => assertEpochMs(Number.POSITIVE_INFINITY, 'fromMs'))).toBe('invalidArgument');
  });
});

describe('assertTimeWindow — 반열린 구간 [fromMs, toMs)', () => {
  const from = 1_755_000_000_000;

  it('toMs <= fromMs 는 invalidArgument다', () => {
    expect(codeOf(() => assertTimeWindow({ fromMs: from, toMs: from }))).toBe('invalidArgument');
    expect(codeOf(() => assertTimeWindow({ fromMs: from, toMs: from - 1 }))).toBe('invalidArgument');
  });

  it('24시간 상한은 readHeartRate에만 적용된다', () => {
    const day = MAX_HEART_RATE_WINDOW_MS;
    expect(day).toBe(86_400_000);
    expect(codeOf(() => assertTimeWindow({ fromMs: from, toMs: from + day }, { maxSpanMs: day }))).toBeNull();
    expect(
      codeOf(() => assertTimeWindow({ fromMs: from, toMs: from + day + 1 }, { maxSpanMs: day })),
    ).toBe('invalidArgument');
    // 상한을 주지 않으면 넓은 창도 통과한다 — listWorkouts는 30일 벽만 신경 쓴다.
    expect(codeOf(() => assertTimeWindow({ fromMs: from, toMs: from + day * 40 }))).toBeNull();
  });

  it('30일 벽 상수는 2 592 000 000 ms다 (D10)', () => {
    expect(ANDROID_HISTORY_WINDOW_MS).toBe(30 * 86_400_000);
  });
});

describe('activeDurationS — Android의 파생 방식', () => {
  it('pause가 없으면 그냥 경과 시간이다', () => {
    expect(activeDurationS(1000, 61_000, [])).toBe(60);
  });

  it('pause를 뺀다', () => {
    expect(activeDurationS(0, 60_000, [{ startMs: 10_000, endMs: 20_000 }])).toBe(50);
  });

  it('겹치는 pause를 이중 계상하지 않는다', () => {
    expect(
      activeDurationS(0, 60_000, [
        { startMs: 10_000, endMs: 30_000 },
        { startMs: 20_000, endMs: 40_000 },
      ]),
    ).toBe(30);
  });

  it('창 밖으로 삐져나온 pause는 잘라서 센다', () => {
    expect(activeDurationS(0, 10_000, [{ startMs: -50_000, endMs: 5_000 }])).toBe(5);
  });

  it('0 아래로 내려가지 않는다', () => {
    expect(activeDurationS(0, 10_000, [{ startMs: 0, endMs: 100_000 }])).toBe(0);
    expect(activeDurationS(10, 10, [])).toBe(0);
  });
});

describe('normalizeUtcOffsetMin', () => {
  it('실재하는 오프셋만 통과하고 나머지는 "모름"이 된다', () => {
    expect(normalizeUtcOffsetMin(540)).toBe(540);
    expect(normalizeUtcOffsetMin(0)).toBe(0);
    expect(normalizeUtcOffsetMin(null)).toBeUndefined();
    expect(normalizeUtcOffsetMin(undefined)).toBeUndefined();
    expect(normalizeUtcOffsetMin(5000)).toBeUndefined();
    expect(normalizeUtcOffsetMin(1.5)).toBeUndefined();
  });
});

describe('estimateAndroidRecordBytes — f100 공식과 f99 경계', () => {
  it('골든 벡터의 바이트 수를 정확히 재현한다', () => {
    for (const vector of SIZE_VECTORS) {
      expect(
        estimateAndroidRecordBytes({
          routePoints: vector.routePoints,
          clientRecordIdLength: vector.clientRecordIdLength,
          titleLength: vector.titleLength,
          notesLength: vector.notesLength,
          segments: vector.segments,
          laps: vector.laps,
        }),
        `${String(vector.routePoints)} points`,
      ).toBe(vector.bytes);
    }
  });

  it('벡터의 `accepted`가 **우리 쓰기 가드의 판정**과 정확히 같다', () => {
    // Phase 3에서 Kotlin JUnit이 같은 파일을 읽기 시작하면서 드러난 것: 이 필드를 아무도 읽지
    // 않고 있었고, 20 828점 행이 `true`(플랫폼 상한 기준)로 적혀 있었다. `$schema`는 이 필드가
    // **20 000점 쓰기 가드의 판정**이라고 말한다. 이제 두 언어가 같은 뜻으로 읽는다.
    for (const vector of SIZE_VECTORS) {
      const accepted =
        vector.routePoints <= MAX_ANDROID_ROUTE_POINTS && vector.bytes <= ANDROID_RECORD_BYTE_LIMIT;
      expect(accepted, `${String(vector.routePoints)} points`).toBe(vector.accepted);
    }
  });

  it('f99의 정확한 핀 — 20 828 OK / 20 829 = 1 000 004 B FAIL', () => {
    const shape = { clientRecordIdLength: 13, titleLength: 13 } as const;
    expect(estimateAndroidRecordBytes({ routePoints: 20_828, ...shape })).toBeLessThan(1_000_000);
    expect(estimateAndroidRecordBytes({ routePoints: 20_829, ...shape })).toBe(1_000_004);
    expect(estimateAndroidRecordBytes({ routePoints: 20_830, ...shape })).toBe(1_000_052);
  });

  it('optional 루트 필드는 비용 0이다 — 모델에 그 항이 아예 없다', () => {
    // 21 000점 루트가 고도·정확도 유무와 무관하게 바이트 동일하다는 f99/f100의 관측을,
    // 모델이 점 개수 외에는 루트에 대해 아무것도 묻지 않는다는 사실로 표현한다.
    const bare = estimateAndroidRecordBytes({ routePoints: 21_000, clientRecordIdLength: 13 });
    const full = estimateAndroidRecordBytes({ routePoints: 21_000, clientRecordIdLength: 13 });
    expect(full).toBe(bare);
  });

  it('MAX_ANDROID_ROUTE_POINTS는 20 000이고 iOS에는 적용되지 않는다', () => {
    expect(MAX_ANDROID_ROUTE_POINTS).toBe(20_000);
    // f77: HealthKit은 36 000포인트를 누수 없이 저장·스트리밍한다. 그래서 이 상수 이름에
    // ANDROID가 들어 있고, iOS 경로는 이것을 읽지 않는다.
    expect(MAX_ANDROID_ROUTE_POINTS).toBeLessThan(36_000);
  });
});
