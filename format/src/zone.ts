/**
 * IANA wall-clock engine (internal except {@link canFormatTimeZone}).
 *
 * `'UTC'` and `'device'` never touch Intl — they use the plain `Date` getters,
 * exactly like the source apps did. Only a real IANA name reaches Intl, and
 * then through a deliberately tiny surface: five single-field
 * `Intl.DateTimeFormat` instances whose `format()` returns one number each.
 * Hermes does not implement `Intl.DateTimeFormat.prototype.formatToParts`, and
 * parsing a composed date string would make this package hostage to locale data
 * changes — five numeric fields are the only reading that is both available and
 * stable.
 */
import { CACHE_LIMIT, createBoundedCache } from './cache';
import { FormatError } from './errors';
import { instantFromEpochMs, utcEpochMs } from './parse';
import type { FormatTimeZone } from './types';

/** Wall-clock fields of one instant in one zone. */
export interface ZoneWallClock {
  readonly year: number;
  readonly month: number;
  readonly day: number;
  readonly hour: number;
  readonly minute: number;
}

interface FieldFormatters {
  readonly year: Intl.DateTimeFormat;
  readonly month: Intl.DateTimeFormat;
  readonly day: Intl.DateTimeFormat;
  readonly hour: Intl.DateTimeFormat;
  readonly minute: Intl.DateTimeFormat;
}

type ZoneEntry =
  | { readonly ok: true; readonly formatters: FieldFormatters }
  | { readonly ok: false; readonly code: FormatError['code']; readonly message: string };

/**
 * Formatter construction costs milliseconds; `format()` is cheap. A table with
 * hundreds of rows must pay the former once, not once per cell. The cap and its
 * LRU eviction live in {@link ./cache} — the same bound the locale/precision
 * table in {@link ./number} uses, because both are keyed on caller-supplied
 * strings and neither may grow forever on a server rendering arbitrary user
 * input.
 */
const zoneCache = createBoundedCache<ZoneEntry>(CACHE_LIMIT);

/** Probe instants for the runtime self-test. Both are far from any DST edge. */
const PROBE_MIDNIGHT_UTC = Date.UTC(2021, 0, 1, 0, 0, 0);
const PROBE_AFTERNOON_UTC = Date.UTC(2021, 0, 1, 13, 5, 0);

let selfTestFailure: string | null | undefined;

function buildFormatters(timeZone: string): FieldFormatters {
  // `'en-US'` is pinned: the fields requested here are numeric in every locale,
  // and pinning removes the device locale as a variable entirely.
  //
  // `hourCycle` and `hour12` are given together on purpose. `hour12` wins per
  // spec and both spell the same 0–23 clock, so an engine that understands only
  // one of them still produces the right answer. Hermes documents neither, which
  // is why the self-test below verifies the result by value.
  return {
    year: new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric' }),
    month: new Intl.DateTimeFormat('en-US', { timeZone, month: '2-digit' }),
    day: new Intl.DateTimeFormat('en-US', { timeZone, day: '2-digit' }),
    hour: new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour: '2-digit',
      hourCycle: 'h23',
      hour12: false,
    }),
    minute: new Intl.DateTimeFormat('en-US', { timeZone, minute: '2-digit' }),
  };
}

/** One numeric field, or null when the engine returned something non-numeric. */
function readField(formatter: Intl.DateTimeFormat, epochMs: number): number | null {
  const text = formatter.format(epochMs);
  if (!/^\d+$/.test(text)) return null;
  return Number(text);
}

function readWallClock(formatters: FieldFormatters, epochMs: number): ZoneWallClock | null {
  const year = readField(formatters.year, epochMs);
  const month = readField(formatters.month, epochMs);
  const day = readField(formatters.day, epochMs);
  const hour = readField(formatters.hour, epochMs);
  const minute = readField(formatters.minute, epochMs);
  if (year === null || month === null || day === null || hour === null || minute === null) {
    return null;
  }
  return { year, month, day, hour, minute };
}

function sameWallClock(actual: ZoneWallClock | null, expected: ZoneWallClock): boolean {
  return (
    actual !== null &&
    actual.year === expected.year &&
    actual.month === expected.month &&
    actual.day === expected.day &&
    actual.hour === expected.hour &&
    actual.minute === expected.minute
  );
}

/**
 * Runtime self-test — runs at most once per JS realm, caching success and
 * failure alike.
 *
 * It compares values, not shapes. A shape check (`/^\d+$/`) cannot see the
 * failure this package exists to prevent: an engine that silently ignores the
 * `timeZone` option still returns digits, so `{ timeZone: 'Asia/Seoul' }` would
 * quietly render device-local time while the call site reads as if it did not.
 *
 * Checks ① and ② cannot both pass on a runtime that ignores `timeZone`: ① fails
 * unless the device is at UTC+0, and ② fails when it is. ③ catches an engine
 * that ignores `hourCycle`/`hour12` and falls back to a 12-hour clock.
 */
function runSelfTest(): string | null {
  if (selfTestFailure !== undefined) return selfTestFailure;

  let failure: string | null = null;

  try {
    const utc = buildFormatters('UTC');

    // ① UTC must render the UTC wall clock, whatever the device zone is.
    if (
      !sameWallClock(readWallClock(utc, PROBE_MIDNIGHT_UTC), {
        year: 2021,
        month: 1,
        day: 1,
        hour: 0,
        minute: 0,
      })
    ) {
      failure = "Intl.DateTimeFormat ignored { timeZone: 'UTC' } for a known instant.";
    }

    // ③ 13:05 UTC must render hour 13, not 01.
    if (failure === null && readField(utc.hour, PROBE_AFTERNOON_UTC) !== 13) {
      failure = 'Intl.DateTimeFormat ignored hourCycle/hour12 and rendered a 12-hour clock.';
    }

    // ② A fixed +09:00 zone pins down the case a UTC+0 device would hide.
    // An engine that rejects the probe zone leaves this check inconclusive.
    if (failure === null) {
      let fixed: FieldFormatters | null = null;
      try {
        fixed = buildFormatters('Etc/GMT-9');
      } catch {
        fixed = null;
      }
      if (
        fixed !== null &&
        !sameWallClock(readWallClock(fixed, PROBE_MIDNIGHT_UTC), {
          year: 2021,
          month: 1,
          day: 1,
          hour: 9,
          minute: 0,
        })
      ) {
        failure = "Intl.DateTimeFormat ignored { timeZone: 'Etc/GMT-9' } for a known instant.";
      }
    }
  } catch (error) {
    failure = `Intl.DateTimeFormat is unusable: ${error instanceof Error ? error.message : String(error)}`;
  }

  selfTestFailure = failure;
  return failure;
}

/** Test seam: forget the cached self-test and per-zone results. */
export function resetZoneCachesForTests(): void {
  selfTestFailure = undefined;
  zoneCache.clear();
}

function evaluateZone(timeZone: string): ZoneEntry {
  const failure = runSelfTest();
  if (failure !== null) {
    return { ok: false, code: 'ERR_INTL_UNUSABLE', message: failure };
  }

  let formatters: FieldFormatters;
  try {
    formatters = buildFormatters(timeZone);
  } catch {
    return {
      ok: false,
      code: 'ERR_TIMEZONE_INVALID',
      message: `Unknown time zone: ${timeZone}. Use 'UTC', 'device', or an IANA name such as 'Asia/Seoul'.`,
    };
  }

  const wall = readWallClock(formatters, PROBE_MIDNIGHT_UTC);
  if (wall === null) {
    return {
      ok: false,
      code: 'ERR_INTL_FIELD_OUTPUT',
      message: `Intl returned a non-numeric field for time zone ${timeZone}.`,
    };
  }

  // Every IANA offset since 1970 is a whole number of minutes inside
  // -12:00…+14:00. Anything else means the fields do not describe this instant.
  const recomposed = utcEpochMs(wall.year, wall.month, wall.day, wall.hour, wall.minute, 0, 0);
  const offsetMinutes = (recomposed - PROBE_MIDNIGHT_UTC) / 60_000;
  if (!Number.isInteger(offsetMinutes) || offsetMinutes < -720 || offsetMinutes > 840) {
    return {
      ok: false,
      code: 'ERR_INTL_FIELD_OUTPUT',
      message: `Intl reported an implausible offset (${offsetMinutes} minutes) for time zone ${timeZone}.`,
    };
  }

  return { ok: true, formatters };
}

function zoneEntry(timeZone: string): ZoneEntry {
  // `get` refreshes recency, so the cap evicts the genuinely cold zone.
  const cached = zoneCache.get(timeZone);
  if (cached !== undefined) return cached;

  const entry = evaluateZone(timeZone);
  zoneCache.set(timeZone, entry);
  return entry;
}

function zoneFormatters(timeZone: string): FieldFormatters {
  const entry = zoneEntry(timeZone);
  if (!entry.ok) throw new FormatError(entry.code, entry.message);
  return entry.formatters;
}

/**
 * Non-throwing probe: can this runtime render the given zone?
 *
 * `'UTC'` and `'device'` are always true (no Intl involved). For an IANA name it
 * runs the same checks the formatters run and returns false instead of throwing,
 * so an app can decide its own policy once at boot — e.g.
 * `const zone = canFormatTimeZone('Asia/Seoul') ? 'Asia/Seoul' : 'UTC'`.
 *
 * Results are cached: the runtime-wide Intl self-test runs at most once, and each
 * zone is checked at most once. Repeated calls are a map lookup.
 */
export function canFormatTimeZone(timeZone: FormatTimeZone): boolean {
  if (timeZone === 'UTC' || timeZone === 'device') return true;
  return zoneEntry(timeZone).ok;
}

/**
 * Wall-clock fields of `epochMs` in `timeZone`.
 *
 * Throws `FormatError` for configuration and environment problems only; the
 * caller has already turned data problems into its own fallback.
 */
export function wallClockIn(epochMs: number, timeZone: FormatTimeZone): ZoneWallClock {
  if (timeZone === 'UTC') {
    const instant = instantFromEpochMs(epochMs);
    return {
      year: instant.getUTCFullYear(),
      month: instant.getUTCMonth() + 1,
      day: instant.getUTCDate(),
      hour: instant.getUTCHours(),
      minute: instant.getUTCMinutes(),
    };
  }

  if (timeZone === 'device') {
    const instant = instantFromEpochMs(epochMs);
    return {
      year: instant.getFullYear(),
      month: instant.getMonth() + 1,
      day: instant.getDate(),
      hour: instant.getHours(),
      minute: instant.getMinutes(),
    };
  }

  const formatters = zoneFormatters(timeZone);
  const wall = readWallClock(formatters, epochMs);
  if (wall === null) {
    throw new FormatError(
      'ERR_INTL_FIELD_OUTPUT',
      `Intl returned a non-numeric field for time zone ${timeZone}.`,
    );
  }
  return wall;
}
