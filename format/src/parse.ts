/**
 * ISO 8601 parsing and the package's only `Date` construction site.
 *
 * Two rules live here and nowhere else:
 *
 * 1. The engine's own string parser is never used. `Date.parse` and
 *    `new Date(<string>)` disagree between V8, JavaScriptCore and Hermes for
 *    anything outside the ISO subset, and they resolve offset-less strings
 *    against the device zone. This module parses with a regular expression and
 *    `Date.UTC` arithmetic instead, so the result is identical on every engine.
 * 2. Every `Date` object this package hands out is built here from a number.
 *    Concentrating construction in one module is what lets the source guard
 *    (tests/unit/guards/source-guard) ban `new Date(` everywhere else.
 */

/** Years below this are remapped onto 1900–1999 by `Date.UTC` and by the
 *  multi-argument constructor, so they need an explicit repair. */
const YEAR_100 = 100;

/**
 * `YYYY-MM-DD` optionally followed by `T`/space, `HH:mm`, optional `:ss`,
 * optional fractional seconds, and an optional `Z` / `±HH:MM` / `±HHMM` offset.
 */
const ISO_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?(Z|z|[+-]\d{2}:?\d{2})?)?$/;

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const;

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return DAYS_IN_MONTH[month - 1] ?? 0;
}

/**
 * The only place a `Date` is created from epoch milliseconds.
 *
 * `Date.UTC` and the multi-argument constructor both map years 0–99 onto
 * 1900–1999, so a year below 100 is repaired with an explicit setter.
 */
export function instantFromEpochMs(epochMs: number): Date {
  return new Date(epochMs);
}

/** UTC epoch milliseconds for a civil date-time, correct for years 1–99 too. */
export function utcEpochMs(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  millisecond: number,
): number {
  const naive = Date.UTC(year, month - 1, day, hour, minute, second, millisecond);
  if (year >= YEAR_100) return naive;
  const repaired = new Date(naive);
  repaired.setUTCFullYear(year);
  return repaired.getTime();
}

/** Device-local epoch milliseconds for a civil date-time, correct for years 1–99. */
function deviceEpochMs(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  millisecond: number,
): number {
  const local = new Date(year, month - 1, day, hour, minute, second, millisecond);
  if (year < YEAR_100) local.setFullYear(year);
  return local.getTime();
}

export interface IsoParseOptions {
  /**
   * Required policy for ISO strings that carry no UTC offset, e.g.
   * `'2026-06-08T09:05:00'`. There is no safe default: the `Date` constructor
   * resolves these against the device zone, so the same string is a different
   * instant on a Seoul phone (`00:05Z`) and a New York phone (`13:05Z`).
   * - `'utc'`    — read the wall clock as UTC.
   * - `'device'` — read it as device-local time. Same behaviour the source apps
   *                had, now spelled out at the call site.
   * - `'reject'` — return null; the caller renders its fallback.
   *
   * Date-only strings (`'2026-06-08'`) are always UTC midnight — that reading is
   * unambiguous per ECMA-262 and this option does not affect them.
   */
  readonly assumeNoOffset: 'utc' | 'device' | 'reject';
}

/**
 * Strict ISO 8601 → instant. Returns null for null/undefined/empty input and
 * for anything outside the accepted grammar — parsing failure is a data error,
 * never a throw.
 *
 * Accepted: `YYYY-MM-DD` | `YYYY-MM-DD(T| )HH:mm[:ss[.fff]][Z|±HH:MM|±HHMM]`,
 * year 1–9999, calendar-valid components (no rollover: `'2026-02-30'` is null).
 *
 * Implemented with a regular expression and `Date.UTC` arithmetic — the engine's
 * own string parser is never used, so the result does not vary between V8,
 * JavaScriptCore and Hermes the way parsing a string with `Date` does.
 */
export function parseIsoInstant(
  value: string | null | undefined,
  options: IsoParseOptions,
): Date | null {
  if (value === null || value === undefined || value === '') return null;

  const match = ISO_PATTERN.exec(value);
  if (match === null) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1 || year > 9999) return null;
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > daysInMonth(year, month)) return null;

  const hourText = match[4];
  if (hourText === undefined) {
    // Date-only is UTC midnight regardless of `assumeNoOffset` (ECMA-262).
    return instantFromEpochMs(utcEpochMs(year, month, day, 0, 0, 0, 0));
  }

  const hour = Number(hourText);
  const minute = Number(match[5]);
  const secondText = match[6];
  const second = secondText === undefined ? 0 : Number(secondText);
  const fraction = match[7];
  const millisecond = fraction === undefined ? 0 : Number(fraction.padEnd(3, '0').slice(0, 3));
  if (hour > 23 || minute > 59 || second > 59) return null;

  const offsetText = match[8];
  if (offsetText === undefined) {
    if (options.assumeNoOffset === 'reject') return null;
    if (options.assumeNoOffset === 'device') {
      return instantFromEpochMs(deviceEpochMs(year, month, day, hour, minute, second, millisecond));
    }
    return instantFromEpochMs(utcEpochMs(year, month, day, hour, minute, second, millisecond));
  }

  if (offsetText === 'Z' || offsetText === 'z') {
    return instantFromEpochMs(utcEpochMs(year, month, day, hour, minute, second, millisecond));
  }

  const sign = offsetText.startsWith('-') ? -1 : 1;
  const digits = offsetText.slice(1).replace(':', '');
  const offsetHours = Number(digits.slice(0, 2));
  const offsetMinutes = Number(digits.slice(2, 4));
  if (offsetHours > 23 || offsetMinutes > 59) return null;

  const utcMs = utcEpochMs(year, month, day, hour, minute, second, millisecond);
  return instantFromEpochMs(utcMs - sign * (offsetHours * 60 + offsetMinutes) * 60_000);
}
