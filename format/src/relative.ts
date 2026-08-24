/**
 * Relative time against an explicit clock.
 *
 * Both source apps hand-wrote Korean copy because Hermes ships no
 * `Intl` relative-time formatter, and their copy differed in five visible ways
 * (space before `전`, just-now wording, a `어제` special case, a seven-day
 * cutoff, and what a future timestamp renders). Every one of those is an option
 * here, and none of them is a default.
 */
import { instantFromEpochMs } from './parse';
import type { FormatDateInput } from './types';

const SECOND_MS = 1000;
const MINUTE_MS = 60 * SECOND_MS;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/** Structured relative-time classification; render copy yourself or via formatRelativeKo. */
export type FormatRelativeBucket =
  /** `ms` counts milliseconds *until* the value, always positive. */
  | { readonly kind: 'future'; readonly ms: number }
  | { readonly kind: 'just-now'; readonly seconds: number }
  | { readonly kind: 'minutes'; readonly count: number }
  | { readonly kind: 'hours'; readonly count: number }
  | { readonly kind: 'days'; readonly count: number }
  | { readonly kind: 'months'; readonly count: number }
  | { readonly kind: 'years'; readonly count: number };

function epochMsOf(value: FormatDateInput | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const epochMs = typeof value === 'number' ? value : value.getTime();
  return Number.isFinite(epochMs) ? epochMs : null;
}

/**
 * Pure bucket selection against an explicit clock. Returns null for
 * null/undefined/invalid input. Thresholds: <60s just-now, <60m minutes,
 * <24h hours, <30d days, <12mo months, then years.
 *
 * Calendar-unaware by construction: a month is exactly 30 days and a year is
 * exactly 12 such months — 360 days, not 365. This reproduces both source apps
 * bit for bit; the drift is a systematic early promotion of about five days per
 * year, so `days = 360` already renders as one year.
 */
export function relativeBucket(
  value: FormatDateInput | null | undefined,
  now: Date,
): FormatRelativeBucket | null {
  const epochMs = epochMsOf(value);
  const nowMs = now.getTime();
  if (epochMs === null || !Number.isFinite(nowMs)) return null;

  const elapsedMs = nowMs - epochMs;
  if (elapsedMs < 0) return { kind: 'future', ms: -elapsedMs };

  const seconds = Math.floor(elapsedMs / SECOND_MS);
  if (seconds < 60) return { kind: 'just-now', seconds };
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return { kind: 'minutes', count: minutes };
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return { kind: 'hours', count: hours };
  const days = Math.floor(hours / 24);
  if (days < 30) return { kind: 'days', count: days };
  const months = Math.floor(days / 30);
  if (months < 12) return { kind: 'months', count: months };
  return { kind: 'years', count: Math.floor(months / 12) };
}

export type FormatRelativeKoOptions = {
  /** Required explicit clock — this family never reads the system clock itself. */
  readonly now: Date;
  /** Required: `true` → `'3분 전'`, `false` → `'3분전'`. The apps disagreed. */
  readonly suffixSpace: boolean;
  /** Required: rendered for null/invalid input. The apps disagreed (`''` vs `'-'`). */
  readonly fallback: string;
  /**
   * Required policy for timestamps after `now`:
   * `'empty'` returns `''`; a function renders an absolute form instead.
   */
  readonly onFuture: 'empty' | ((date: Date) => string);
  /** Label for the <60s bucket. Default `'방금'`. */
  readonly justNowLabel?: string | undefined;
  /** When set, the 1-day bucket renders this literal (e.g. `'어제'`) instead of `'1일 전'`. */
  readonly yesterdayLabel?: string | undefined;
} & (
  | { readonly maxDays?: undefined; readonly onOverflow?: undefined }
  | {
      /** Elapsed days >= maxDays switch to onOverflow (e.g. 7 → absolute date). */
      readonly maxDays: number;
      /** Required together with maxDays — there is no built-in absolute rendering. */
      readonly onOverflow: (date: Date) => string;
    }
);

/** Korean relative time. Both app renderings are expressible; neither is a default. */
export function formatRelativeKo(
  value: FormatDateInput | null | undefined,
  options: FormatRelativeKoOptions,
): string {
  const epochMs = epochMsOf(value);
  const bucket = relativeBucket(value, options.now);
  if (epochMs === null || bucket === null) return options.fallback;

  if (bucket.kind === 'future') {
    const onFuture = options.onFuture;
    return onFuture === 'empty' ? '' : onFuture(instantFromEpochMs(epochMs));
  }

  // Destructured because the paired `maxDays`/`onOverflow` union does not narrow
  // through a property access on the intersection type.
  const { maxDays, onOverflow } = options;
  const elapsedDays = Math.floor((options.now.getTime() - epochMs) / DAY_MS);
  if (maxDays !== undefined && onOverflow !== undefined && elapsedDays >= maxDays) {
    return onOverflow(instantFromEpochMs(epochMs));
  }

  const space = options.suffixSpace ? ' ' : '';
  switch (bucket.kind) {
    case 'just-now':
      return options.justNowLabel ?? '방금';
    case 'minutes':
      return `${bucket.count}분${space}전`;
    case 'hours':
      return `${bucket.count}시간${space}전`;
    case 'days':
      if (bucket.count === 1 && options.yesterdayLabel !== undefined) return options.yesterdayLabel;
      return `${bucket.count}일${space}전`;
    case 'months':
      return `${bucket.count}개월${space}전`;
    case 'years':
      return `${bucket.count}년${space}전`;
  }
}
