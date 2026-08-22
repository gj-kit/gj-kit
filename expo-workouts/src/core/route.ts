// 루트 위생 · 파생 유틸 (설계 §5.2 · §8.2). 양 플랫폼에서 **같은 입력이 같은 결과**를 내야 하므로
// 위생은 전적으로 여기(순수 TS)에 있다 — f81·f85가 증명한 대로 HealthKit은 아무것도 거르지 않고
// Health Connect는 같은 입력에 throw한다.

import { WorkoutsError } from './errors';
import type { HeartRateSample, Interval, Pause, RoutePoint } from './types';

/**
 * 한 청크의 포인트 수 (f78 · D8).
 * ⚠ **export하지 않는다.** 공개하면 1000 → 2000 조정이 breaking change가 된다 —
 *   `chunk-constant-guard`가 이 값의 존재와 비공개성을 함께 단언한다.
 */
const ROUTE_CHUNK_POINTS = 1000;

/** 내부 소비자(`api.ts`·`testing.ts`)만 읽는다. 배럴(`core.ts`)은 이 심볼을 재export하지 않는다. */
export const routeChunkPoints = (): number => ROUTE_CHUNK_POINTS;

/** Apple의 문서화된 위생 상한 — 수평 정확도가 이 값을 넘는 점은 버린다. */
const MAX_HORIZONTAL_ACCURACY_M = 50;

const EARTH_RADIUS_M = 6_371_008.8;

/**
 * Concatenate a `getRoute()` stream into one array. Convenience only: a 36 000-point route costs
 * ~15 MB of JS heap, which is why the stream is the default and this is the opt-in.
 */
export async function collectRoute(
  chunks: AsyncIterable<readonly RoutePoint[]>,
): Promise<RoutePoint[]> {
  const out: RoutePoint[] = [];
  for await (const chunk of chunks) out.push(...chunk);
  return out;
}

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/** Great-circle length of a route, metres. Ignores altitude. */
export function routeDistanceM(points: readonly RoutePoint[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1];
    const b = points[i];
    if (a === undefined || b === undefined) continue;
    const phi1 = toRadians(a.lat);
    const phi2 = toRadians(b.lat);
    const dPhi = phi2 - phi1;
    const dLambda = toRadians(b.lon - a.lon);
    const h =
      Math.sin(dPhi / 2) ** 2 + Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLambda / 2) ** 2;
    total += 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
  }
  return total;
}

/**
 * Cumulative ascent, metres, with hysteresis: only rises of at least `minRiseM` count.
 * Required on purpose — "what counts as a climb" differs between hiking and cycling apps and there
 * is no defensible default.
 *
 * Points without `altM` are skipped; they neither break nor extend a rise.
 */
export function routeElevationGainM(points: readonly RoutePoint[], minRiseM: number): number {
  if (!Number.isFinite(minRiseM) || minRiseM < 0) {
    throw new WorkoutsError('invalidArgument', 'minRiseM must be a finite, non-negative number of metres.');
  }
  let gain = 0;
  let reference: number | undefined;
  for (const point of points) {
    const alt = point.altM;
    if (alt === undefined || !Number.isFinite(alt)) continue;
    if (reference === undefined) {
      reference = alt;
      continue;
    }
    if (alt < reference) {
      reference = alt;
      continue;
    }
    if (alt - reference >= minRiseM) {
      gain += alt - reference;
      reference = alt;
    }
  }
  return gain;
}

/**
 * Gaps of at least `minGapMs` between consecutive points, as pauses. `minGapMs` is required — the
 * threshold that separates "a GPS fix was late" from "the user stopped" is the caller's domain.
 *
 * `auto` is left `undefined`: these are DERIVED by you, not reported by the platform.
 */
export function derivePauses(points: readonly RoutePoint[], minGapMs: number): Pause[] {
  if (!Number.isFinite(minGapMs) || minGapMs <= 0) {
    throw new WorkoutsError('invalidArgument', 'minGapMs must be a finite, positive number of milliseconds.');
  }
  const out: Pause[] = [];
  for (let i = 1; i < points.length; i += 1) {
    const previous = points[i - 1];
    const current = points[i];
    if (previous === undefined || current === undefined) continue;
    if (current.t - previous.t >= minGapMs) {
      out.push({ startMs: previous.t, endMs: current.t });
    }
  }
  return out;
}

/**
 * Apply the write-side hygiene the library performs, so you can see what will happen before you call
 * `saveWorkout`. Throws `invalidArgument` for out-of-range coordinates. The rules and their order
 * are §8.2's and are pinned by `tests/fixtures/route-vectors.json`, which also drives the Swift and
 * Kotlin tests.
 *
 * Order (do not reorder — the platforms disagree and this order is what makes them agree):
 *  1. an EMPTY array is `invalidArgument` — say `route: 'none'` instead;
 *  2. non-finite `t`/`lat`/`lon`, or `lat` outside ±90 / `lon` outside ±180, is `invalidArgument`
 *     (rejected, NOT dropped — silently discarding hides a data-corruption signal);
 *  3. points with `hAccM < 0` or `hAccM > 50` are DROPPED (`hAccM === undefined` is kept);
 *  4. points outside `[window.startMs, window.endMs)` are DROPPED — deliberately not clamped:
 *     clamping piles every out-of-window point onto one boundary instant and rule 5 then collapses
 *     them into a single point, i.e. it fabricates timestamps AND destroys more data;
 *  5. sorted ascending by `t`, and for equal `t` the LAST point in input order wins — matching what
 *     HealthKit silently does, so that both platforms agree instead of one throwing.
 *
 * Zero survivors is not an error here: `saveWorkout` reports it as `route: 'dropped'`.
 */
export function normalizeRouteForWrite(
  points: readonly RoutePoint[],
  window: Interval,
): readonly RoutePoint[] {
  if (points.length === 0) {
    throw new WorkoutsError(
      'invalidArgument',
      'route must not be an empty array. Pass `route: "none"` to say there is no route.',
    );
  }
  const kept: RoutePoint[] = [];
  for (const point of points) {
    if (!Number.isFinite(point.t) || !Number.isFinite(point.lat) || !Number.isFinite(point.lon)) {
      throw new WorkoutsError('invalidArgument', 'route points must carry finite t, lat and lon.');
    }
    if (point.lat < -90 || point.lat > 90) {
      throw new WorkoutsError('invalidArgument', 'route point lat must be within -90..90 degrees.');
    }
    if (point.lon < -180 || point.lon > 180) {
      throw new WorkoutsError('invalidArgument', 'route point lon must be within -180..180 degrees.');
    }
    const hAccM = point.hAccM;
    if (hAccM !== undefined && (hAccM < 0 || hAccM > MAX_HORIZONTAL_ACCURACY_M)) continue;
    if (point.t < window.startMs || point.t >= window.endMs) continue;
    kept.push(point);
  }
  // `Array.prototype.sort`는 안정 정렬이므로 같은 `t`의 입력 순서가 보존된다 →
  // 뒤에서부터 처음 만난 것이 "마지막 것"이다.
  const sorted = [...kept].sort((a, b) => a.t - b.t);
  const out: RoutePoint[] = [];
  for (let i = 0; i < sorted.length; i += 1) {
    const current = sorted[i];
    const next = sorted[i + 1];
    if (current === undefined) continue;
    if (next !== undefined && next.t === current.t) continue;
    out.push(current);
  }
  return out;
}

/**
 * 읽기 방향 sentinel 정리 (f83). `-1`은 CoreLocation의 "모름"이고 **명시적 `0`은 실제 값**이다.
 * `altM`은 그대로 통과시킨다 — 음수 고도는 실재하는 값(사해)이고 유효성 플래그는 `vAccM`이다.
 *
 * 내부 정규화 경로 전용. 배럴이 재export하지 않는다.
 */
export function sanitizeRoutePointFromNative(point: {
  readonly t: number;
  readonly lat: number;
  readonly lon: number;
  readonly altM?: number | null | undefined;
  readonly hAccM?: number | null | undefined;
  readonly vAccM?: number | null | undefined;
  readonly speedMps?: number | null | undefined;
  readonly courseDeg?: number | null | undefined;
}): RoutePoint {
  const sentinel = (value: number | null | undefined): number | undefined =>
    value === null || value === undefined || !Number.isFinite(value) || value < 0 ? undefined : value;
  const passthrough = (value: number | null | undefined): number | undefined =>
    value === null || value === undefined || !Number.isFinite(value) ? undefined : value;
  return {
    t: point.t,
    lat: point.lat,
    lon: point.lon,
    altM: passthrough(point.altM),
    hAccM: sentinel(point.hAccM),
    vAccM: sentinel(point.vAccM),
    speedMps: sentinel(point.speedMps),
    courseDeg: sentinel(point.courseDeg),
  };
}

/**
 * 심박 위생 (설계 §8.2 마지막 문단): 창 밖 샘플과 1..300 bpm 밖 샘플을 드롭하고, `t` 오름차순으로
 * 정렬한 뒤 동일한 `(t, bpm)` 쌍을 접는다.
 */
export function normalizeHeartRateSamples(
  samples: readonly HeartRateSample[],
  window?: Interval | undefined,
): readonly HeartRateSample[] {
  const kept = samples.filter((sample) => {
    if (!Number.isFinite(sample.t) || !Number.isFinite(sample.bpm)) return false;
    if (!Number.isInteger(sample.bpm) || sample.bpm < 1 || sample.bpm > 300) return false;
    if (window !== undefined && (sample.t < window.startMs || sample.t >= window.endMs)) return false;
    return true;
  });
  const sorted = [...kept].sort((a, b) => a.t - b.t || a.bpm - b.bpm);
  const out: HeartRateSample[] = [];
  for (const sample of sorted) {
    const previous = out[out.length - 1];
    if (previous !== undefined && previous.t === sample.t && previous.bpm === sample.bpm) continue;
    out.push(sample);
  }
  return out;
}
