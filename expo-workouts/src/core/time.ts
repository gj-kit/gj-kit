// 시간·창 검증 (설계 §5.2 상수 · §6.1-⑧ · §0.3 V9).

import { WorkoutsError } from './errors';
import type { Interval, Pause, TimeWindow } from './types';

/**
 * Every epoch-millisecond input in this library is validated against this floor.
 * `1e11` ms is 1973-03-03. A "now" expressed in SECONDS is ~1.79e9, which is far below it, while no
 * real workout predates 1973 — so `0 < value < EPOCH_MS_FLOOR` is exactly the seconds-in-a-
 * milliseconds-field mistake and nothing else. It is rejected with `invalidArgument`.
 * This is the one unit accident types cannot catch and the library therefore catches at runtime.
 */
export const EPOCH_MS_FLOOR = 100_000_000_000;

/** 24 h. `readHeartRate` refuses wider windows so one call cannot return an unbounded array.
 *  ⚠ This bounds the WINDOW, not the density: a 1 Hz watch still returns ~86 400 samples. */
export const MAX_HEART_RATE_WINDOW_MS = 86_400_000;

/** 30 days in ms — Health Connect's history wall without READ_HEALTH_DATA_HISTORY (D10). */
export const ANDROID_HISTORY_WINDOW_MS = 2_592_000_000;

/**
 * Reject a value that is not a usable epoch-millisecond integer.
 *
 * `0` is ALLOWED (it is the epoch itself and a legitimate sentinel in tests); `(0, 1e11)` is not —
 * that range is only reachable by putting a seconds timestamp in a milliseconds field.
 */
export function assertEpochMs(value: number, field: string): void {
  if (!Number.isFinite(value) || !Number.isInteger(value)) {
    throw new WorkoutsError('invalidArgument', `${field} must be an integer number of epoch milliseconds.`);
  }
  if (value > 0 && value < EPOCH_MS_FLOOR) {
    throw new WorkoutsError(
      'invalidArgument',
      `${field} looks like a SECONDS timestamp in a milliseconds field. Multiply it by 1000.`,
    );
  }
  if (value < 0) {
    throw new WorkoutsError('invalidArgument', `${field} must not be negative.`);
  }
}

/**
 * Validate a half-open `[fromMs, toMs)` window. `maxSpanMs` bounds the width when the caller has a
 * ceiling (`readHeartRate`'s 24 h).
 */
export function assertTimeWindow(window: TimeWindow, options?: { readonly maxSpanMs?: number | undefined }): void {
  assertEpochMs(window.fromMs, 'fromMs');
  assertEpochMs(window.toMs, 'toMs');
  if (window.toMs <= window.fromMs) {
    throw new WorkoutsError('invalidArgument', 'toMs must be greater than fromMs (the window is half-open).');
  }
  const maxSpanMs = options?.maxSpanMs;
  if (maxSpanMs !== undefined && window.toMs - window.fromMs > maxSpanMs) {
    throw new WorkoutsError(
      'invalidArgument',
      `The window may not be wider than ${String(maxSpanMs)} ms. Page wider ranges yourself.`,
    );
  }
}

/** `[a, b)` 구간들을 `[from, to)`로 잘라 겹침 없이 병합한 총 길이(ms). */
function coveredMs(intervals: readonly Interval[], fromMs: number, toMs: number): number {
  const clipped = intervals
    .map((i) => ({ startMs: Math.max(i.startMs, fromMs), endMs: Math.min(i.endMs, toMs) }))
    .filter((i) => i.endMs > i.startMs)
    .sort((a, b) => a.startMs - b.startMs);
  let total = 0;
  let cursor = Number.NEGATIVE_INFINITY;
  for (const interval of clipped) {
    const start = Math.max(interval.startMs, cursor);
    if (interval.endMs > start) {
      total += interval.endMs - start;
      cursor = interval.endMs;
    }
  }
  return total;
}

/**
 * `(endMs - startMs - Σ pause overlap) / 1000`, clamped at 0. Overlapping pauses are merged, so
 * double-counting is not expressible.
 *
 * ⚠ This is how ANDROID derives it. iOS reports the store's own `duration`, which honours the
 *   writer's explicit argument and can differ; `Workout.activeDurationS` carries whichever the
 *   platform gave.
 */
export function activeDurationS(startMs: number, endMs: number, pauses: readonly Pause[]): number {
  const span = endMs - startMs;
  if (!Number.isFinite(span) || span <= 0) return 0;
  return Math.max(0, (span - coveredMs(pauses, startMs, endMs)) / 1000);
}

/** 유효한 UTC 오프셋(분)만 통과시킨다. `-1080..1080` 밖은 "모름"으로 접는다. */
export function normalizeUtcOffsetMin(value: number | null | undefined): number | undefined {
  if (value === null || value === undefined) return undefined;
  if (!Number.isFinite(value) || !Number.isInteger(value)) return undefined;
  if (value < -1080 || value > 1080) return undefined;
  return value;
}
