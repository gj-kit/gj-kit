// 루트 위생 · 파생 유틸 (설계 §8.2 · §9.1).
//
// 위생 케이스는 `tests/fixtures/route-vectors.json`에서 온다 — 같은 파일이 Swift·Kotlin 테스트도
// 구동하므로 여기서 하드코딩하면 세 언어의 표류를 놓친다.

import { describe, expect, it } from 'vitest';

import vectors from '../fixtures/route-vectors.json';
import {
  collectRoute,
  derivePauses,
  isWorkoutsError,
  normalizeRouteForWrite,
  routeDistanceM,
  routeElevationGainM,
  workoutsErrorCode,
  type RoutePoint,
} from '../../src/core';
import { normalizeHeartRateSamples, sanitizeRoutePointFromNative } from '../../src/core/route';

const WINDOW = { startMs: vectors.window.startMs, endMs: vectors.window.endMs };

/** 픽스처 행의 계약. JSON 모듈의 추론 타입은 행마다 키가 달라 유니언이 되므로 여기서 고정한다. */
interface HygieneCase {
  readonly name: string;
  readonly points: readonly RoutePoint[];
  readonly throws?: string | undefined;
  readonly survivorTimes?: readonly number[] | undefined;
  readonly survivorLats?: readonly number[] | undefined;
}
interface SentinelCase {
  readonly name: string;
  readonly input: {
    readonly t: number;
    readonly lat: number;
    readonly lon: number;
    readonly altM?: number | null | undefined;
    readonly hAccM?: number | null | undefined;
    readonly vAccM?: number | null | undefined;
    readonly speedMps?: number | null | undefined;
    readonly courseDeg?: number | null | undefined;
  };
  readonly expect: {
    readonly altM?: number | null | undefined;
    readonly hAccM?: number | null | undefined;
    readonly vAccM?: number | null | undefined;
    readonly speedMps?: number | null | undefined;
    readonly courseDeg?: number | null | undefined;
  };
}
const HYGIENE = vectors.hygiene as readonly HygieneCase[];
const SENTINELS = vectors.sentinels as readonly SentinelCase[];

describe('normalizeRouteForWrite — §8.2의 규칙 순서를 골든 벡터로', () => {
  for (const testCase of HYGIENE) {
    it(testCase.name, () => {
      const points = testCase.points;
      if (testCase.throws !== undefined) {
        try {
          normalizeRouteForWrite(points, WINDOW);
          throw new Error('던졌어야 한다');
        } catch (error) {
          expect(isWorkoutsError(error)).toBe(true);
          expect(workoutsErrorCode(error)).toBe(testCase.throws);
        }
        return;
      }
      const survivors = normalizeRouteForWrite(points, WINDOW);
      expect(survivors.map((point) => point.t)).toEqual(testCase.survivorTimes);
      if (testCase.survivorLats !== undefined) {
        expect(survivors.map((point) => point.lat)).toEqual(testCase.survivorLats);
      }
    });
  }

  it('살아남는 점이 0이어도 던지지 않는다 — 그것은 route: "dropped"의 입력이다 (f84)', () => {
    expect(normalizeRouteForWrite([{ t: 1, lat: 0, lon: 0 }], WINDOW)).toEqual([]);
  });
});

describe('sanitizeRoutePointFromNative — sentinel 정리 (f83)', () => {
  for (const testCase of SENTINELS) {
    it(testCase.name, () => {
      const cleaned = sanitizeRoutePointFromNative(testCase.input);
      expect(cleaned.altM).toBe(testCase.expect.altM ?? undefined);
      expect(cleaned.hAccM).toBe(testCase.expect.hAccM ?? undefined);
      expect(cleaned.vAccM).toBe(testCase.expect.vAccM ?? undefined);
      // 픽스처 규약: JSON의 `null`은 `undefined`(모름)를 뜻한다 — JSON에 undefined가 없어서다.
      expect(cleaned.speedMps).toBe(testCase.expect.speedMps ?? undefined);
      expect(cleaned.courseDeg).toBe(testCase.expect.courseDeg ?? undefined);
    });
  }
});

describe('route 파생 유틸', () => {
  it('routeDistanceM — 위도 0에서 경도 1도는 약 111.3 km다', () => {
    const distance = routeDistanceM([
      { t: 1, lat: 0, lon: 0 },
      { t: 2, lat: 0, lon: 1 },
    ]);
    expect(distance).toBeGreaterThan(111_000);
    expect(distance).toBeLessThan(111_500);
  });

  it('routeDistanceM — 점이 0개나 1개면 0이다', () => {
    expect(routeDistanceM([])).toBe(0);
    expect(routeDistanceM([{ t: 1, lat: 1, lon: 1 }])).toBe(0);
  });

  it('routeElevationGainM — 히스테리시스가 노이즈를 걸러낸다', () => {
    const points: readonly RoutePoint[] = [
      { t: 1, lat: 0, lon: 0, altM: 100 },
      { t: 2, lat: 0, lon: 0, altM: 101 },
      { t: 3, lat: 0, lon: 0, altM: 100 },
      { t: 4, lat: 0, lon: 0, altM: 120 },
    ];
    expect(routeElevationGainM(points, 5)).toBe(20);
    expect(routeElevationGainM(points, 0.5)).toBe(21);
  });

  it('routeElevationGainM — altM이 없는 점은 건너뛴다', () => {
    expect(
      routeElevationGainM(
        [
          { t: 1, lat: 0, lon: 0, altM: 10 },
          { t: 2, lat: 0, lon: 0 },
          { t: 3, lat: 0, lon: 0, altM: 30 },
        ],
        5,
      ),
    ).toBe(20);
  });

  it('derivePauses — minGapMs 이상의 간격만 pause가 된다', () => {
    const pauses = derivePauses(
      [
        { t: 0, lat: 0, lon: 0 },
        { t: 1_000, lat: 0, lon: 0 },
        { t: 61_000, lat: 0, lon: 0 },
      ],
      30_000,
    );
    expect(pauses).toEqual([{ startMs: 1_000, endMs: 61_000 }]);
  });

  it('방어할 수 없는 기본값이 없다 — 두 임계값은 필수이고 잘못된 값은 invalidArgument다', () => {
    expect(workoutsErrorCode(catchOf(() => routeElevationGainM([], -1)))).toBe('invalidArgument');
    expect(workoutsErrorCode(catchOf(() => derivePauses([], 0)))).toBe('invalidArgument');
  });

  it('collectRoute — 스트림을 하나의 배열로 잇는다', async () => {
    async function* chunks(): AsyncGenerator<readonly RoutePoint[]> {
      yield [{ t: 1, lat: 0, lon: 0 }];
      yield [
        { t: 2, lat: 0, lon: 0 },
        { t: 3, lat: 0, lon: 0 },
      ];
    }
    expect((await collectRoute(chunks())).map((point) => point.t)).toEqual([1, 2, 3]);
  });
});

describe('normalizeHeartRateSamples — 창 밖과 범위 밖을 드롭하고 중복을 접는다', () => {
  it('1..300 bpm 밖과 창 밖을 드롭한다', () => {
    const samples = normalizeHeartRateSamples(
      [
        { t: WINDOW.startMs + 1, bpm: 0 },
        { t: WINDOW.startMs + 2, bpm: 301 },
        { t: WINDOW.startMs - 1, bpm: 120 },
        { t: WINDOW.endMs, bpm: 120 },
        { t: WINDOW.startMs + 3, bpm: 120 },
      ],
      WINDOW,
    );
    expect(samples).toEqual([{ t: WINDOW.startMs + 3, bpm: 120 }]);
  });

  it('동일한 (t, bpm) 쌍은 접히고 결과는 t 오름차순이다', () => {
    expect(
      normalizeHeartRateSamples([
        { t: 20, bpm: 100 },
        { t: 10, bpm: 100 },
        { t: 10, bpm: 100 },
        { t: 10, bpm: 101 },
      ]),
    ).toEqual([
      { t: 10, bpm: 100 },
      { t: 10, bpm: 101 },
      { t: 20, bpm: 100 },
    ]);
  });
});

function catchOf(run: () => unknown): unknown {
  try {
    run();
    return null;
  } catch (error) {
    return error;
  }
}

// ── 픽스처가 구동하는 파생 유틸 골든 벡터 (설계 §9.4) ──────────────────────────
// 위와 달리 여기서는 값이 코드가 아니라 `route-vectors.json`에 있다. XCTest·JUnit이 같은 행을 읽는다.

interface DerivedCase {
  readonly name: string;
  readonly fn: 'routeDistanceM' | 'routeElevationGainM' | 'derivePauses';
  readonly points: readonly RoutePoint[];
  readonly arg?: number | undefined;
  readonly expect: number | readonly { readonly startMs: number; readonly endMs: number }[];
  readonly tolerance?: number | undefined;
}

describe('파생 유틸 골든 벡터 — 세 언어가 같은 파일을 읽는다', () => {
  const derived = vectors.derived as readonly DerivedCase[];

  it('벡터가 비어 있지 않다 — 픽스처가 사라지면 이 스위트가 조용히 통과하지 않게', () => {
    expect(derived.length).toBeGreaterThanOrEqual(8);
    expect(new Set(derived.map((entry) => entry.fn))).toEqual(
      new Set(['routeDistanceM', 'routeElevationGainM', 'derivePauses']),
    );
  });

  for (const entry of derived) {
    it(`${entry.fn} — ${entry.name}`, () => {
      if (entry.fn === 'derivePauses') {
        expect(derivePauses(entry.points, entry.arg ?? 1)).toEqual(entry.expect);
        return;
      }
      const actual =
        entry.fn === 'routeDistanceM'
          ? routeDistanceM(entry.points)
          : routeElevationGainM(entry.points, entry.arg ?? 0);
      expect(typeof entry.expect).toBe('number');
      expect(Math.abs(actual - (entry.expect as number))).toBeLessThanOrEqual(entry.tolerance ?? 0);
    });
  }
});

describe('청크 수열 골든 벡터 — 1000이라는 상수는 공개되지 않지만 결과는 계약이다 (f78 · D8)', () => {
  interface ChunkCase {
    readonly points: number;
    readonly chunkSizes: readonly number[];
  }
  for (const entry of vectors.chunking as readonly ChunkCase[]) {
    it(`${String(entry.points)}점 -> [${entry.chunkSizes.join(', ')}]`, () => {
      // 픽스처 자신이 일관적인지부터 본다 — 세 언어가 같은 수열을 만들어야 하므로.
      expect(entry.chunkSizes.reduce((sum, size) => sum + size, 0)).toBe(entry.points);
      for (const size of entry.chunkSizes.slice(0, -1)) expect(size).toBe(1000);
      const last = entry.chunkSizes[entry.chunkSizes.length - 1];
      if (last !== undefined) expect(last).toBeGreaterThan(0);
    });
  }
});
