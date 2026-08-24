/**
 * The three fixed-width date renderings both source apps hand-rolled, with the
 * two axes they silently disagreed on — time zone and separator — promoted to
 * required options.
 */
import { utcEpochMs } from './parse';
import type { FormatDateInput, FormatTimeZone } from './types';
import { wallClockIn } from './zone';

/**
 * Supported instant range: every zone this package accepts (-12:00…+14:00)
 * renders a year between 1 and 9999 inside it.
 *
 * The range is closed rather than clamped so that the IANA path and the
 * `'UTC'`/`'device'` paths agree byte for byte. It also keeps Intl away from
 * years where `year: 'numeric'` starts appending an era (`'1 BC'`), which would
 * turn a data problem into an environment error.
 */
const SUPPORTED_MIN_MS = utcEpochMs(1, 1, 1, 14, 0, 0, 0);
const SUPPORTED_MAX_MS = utcEpochMs(9999, 12, 31, 9, 59, 59, 999);

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

/** Epoch milliseconds, or null when the value is not a usable instant. */
function epochMsOf(value: FormatDateInput | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const epochMs = typeof value === 'number' ? value : value.getTime();
  if (!Number.isFinite(epochMs)) return null;
  if (epochMs < SUPPORTED_MIN_MS || epochMs > SUPPORTED_MAX_MS) return null;
  return epochMs;
}

export interface FormatDateOptions<TFallback = string> {
  /** Required. See {@link FormatTimeZone} — omission is a compile error. */
  readonly timeZone: FormatTimeZone;
  /**
   * Required separator between year/month/day segments.
   * The source apps disagreed (`2026-06-08` vs `2026.06.08`), so neither
   * spelling is a silent default.
   */
  readonly separator: '-' | '.';
  /**
   * Rendered for null/undefined/invalid input and for instants outside the
   * supported window `0001-01-01T14:00:00Z … 9999-12-31T09:59:59.999Z`.
   *
   * That window — not "years 1–9999" — is the actual guard: it is the set of
   * instants every zone this package accepts (-12:00…+14:00) renders as a year
   * between 1 and 9999, so the IANA path and the `'UTC'`/`'device'` paths agree
   * byte for byte on where the range ends. `2026-06-08` in any zone is far
   * inside it; only the two end years are narrowed by a day.
   *
   * Default `'-'`.
   */
  readonly fallback?: TFallback | undefined;
}

type DateShape = 'date-time' | 'date' | 'month-day-time';

function render<TFallback>(
  value: FormatDateInput | null | undefined,
  options: FormatDateOptions<TFallback>,
  shape: DateShape,
): string | TFallback {
  // `?? '-'`가 아니라 `=== undefined`다: `fallback: null`은 정당한 폴백 값이고,
  // mobile `formatBytes`/`formatUtcDate`의 null 패스스루가 정확히 그 계약이다.
  const fallback: string | TFallback = options.fallback === undefined ? '-' : options.fallback;
  const epochMs = epochMsOf(value);
  if (epochMs === null) return fallback;

  const wall = wallClockIn(epochMs, options.timeZone);
  const sep = options.separator;
  const day = `${pad2(wall.month)}${sep}${pad2(wall.day)}`;
  const time = `${pad2(wall.hour)}:${pad2(wall.minute)}`;

  if (shape === 'month-day-time') return `${day} ${time}`;
  // The year is rendered unpadded on purpose — see the function docs.
  if (shape === 'date') return `${wall.year}${sep}${day}`;
  return `${wall.year}${sep}${day} ${time}`;
}

/**
 * `YYYY-MM-DD HH:mm` (or `YYYY.MM.DD HH:mm`) in the given zone. 24-hour clock,
 * no seconds. Month, day, hour and minute are always two digits; the year is
 * rendered unpadded (`999-06-08`), matching the source apps and keeping the
 * IANA path byte-identical to the `'UTC'`/`'device'` paths. Column width is
 * therefore fixed for years 1000–9999, which is the range real data occupies.
 *
 * Instants outside `0001-01-01T14:00:00Z … 9999-12-31T09:59:59.999Z` render
 * `fallback` — see {@link FormatDateOptions.fallback} for why the window is
 * stated as instants rather than as years.
 */
export function formatDateTime<TFallback = string>(
  value: FormatDateInput | null | undefined,
  options: FormatDateOptions<TFallback>,
): string | TFallback {
  return render(value, options, 'date-time');
}

/** `YYYY-MM-DD` (or `YYYY.MM.DD`) — date without the time-of-day. */
export function formatDateOnly<TFallback = string>(
  value: FormatDateInput | null | undefined,
  options: FormatDateOptions<TFallback>,
): string | TFallback {
  return render(value, options, 'date');
}

/** `MM-DD HH:mm` (or `MM.DD HH:mm`) — dense tables covering a short span. */
export function formatMonthDayTime<TFallback = string>(
  value: FormatDateInput | null | undefined,
  options: FormatDateOptions<TFallback>,
): string | TFallback {
  return render(value, options, 'month-day-time');
}
