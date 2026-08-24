/**
 * IANA 벽시계 산술 — 내부 모듈이다(공개 표면 아님, 설계 §3.2.3).
 *
 * 소스는 고정 offset을 더한 뒤 UTC 시각을 읽는 방식이었다. 그것이 성립하는 조건은
 * (a) 그 지역에 DST가 없고 (b) offset이 창 길이의 배수일 때뿐이다. 소스의 지역은 둘 다
 * 만족하지만 라이브러리는 그것을 전제할 수 없다 — `America/New_York`에서 1시간 틀리고
 * `Asia/Kathmandu`(+05:45)에서 10분 격자가 벽시계와 어긋난다.
 *
 * 형제 `format/src/zone.ts`의 검증 기법(자기 시험 + offset 타당성 범위 + zone별 bounded
 * cache)을 **재구현**한다. 재사용하지 않는 이유는 설계 §0.4-⑤ — 그 패키지가 벽시계 함수를
 * export하지 않으므로 peer를 걸어도 필요한 것을 얻지 못한다.
 *
 * 이 파일은 `Date` 객체를 만들지 않는다. 입출력이 전부 epoch 밀리초이고, `Date`로의 변환은
 * `runtime.ts`가 소유한다(가드가 그 규율을 강제한다).
 */
import { NotificationsError } from './errors';

/** Wall-clock fields of one instant in one zone. */
export interface ZoneWallClock {
  readonly year: number;
  readonly month: number;
  readonly day: number;
  readonly hour: number;
  readonly minute: number;
  readonly second: number;
}

/**
 * How a wall-clock reading maps back onto the timeline.
 *
 * - `exact` — exactly one instant.
 * - `gap` — none (spring-forward): the returned instant is the first one that
 *   exists after the gap.
 * - `ambiguous` — two (autumn fall-back): the returned instant is the earlier.
 */
export type ZoneResolutionKind = 'exact' | 'gap' | 'ambiguous';

export interface ZoneResolution {
  readonly epochMs: number;
  readonly kind: ZoneResolutionKind;
}

const DAY_MS = 86_400_000;
const MINUTE_MS = 60_000;

/** Widest real UTC offset range: -12:00 (Etc/GMT+12) to +14:00 (Pacific/Kiritimati). */
const MIN_OFFSET_MINUTES = -720;
const MAX_OFFSET_MINUTES = 840;

/** Probe instants for the runtime self-test. Both are far from any DST edge. */
const PROBE_JANUARY = Date.UTC(2021, 0, 15, 12, 0, 0);
const PROBE_JULY = Date.UTC(2021, 6, 15, 12, 0, 0);

/**
 * Formatter construction costs milliseconds; `formatToParts` is cheap. The cache
 * is bounded because the key is a caller-supplied string and a policy per
 * recipient zone must not grow it forever.
 */
const CACHE_LIMIT = 64;
const formatterCache = new Map<string, Intl.DateTimeFormat>();

function buildFormatter(timeZone: string): Intl.DateTimeFormat {
  // `'en-US'`를 고정한다 — 아래 필드는 어느 로케일에서도 숫자이고, 고정하면 기기 로케일이
  // 변수에서 사라진다. `hourCycle`과 `hour12`를 함께 주는 것도 같은 이유다(둘 중 하나만
  // 이해하는 엔진에서도 0–23 시계가 나온다).
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
    hour12: false,
    era: 'short',
  });
}

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  const cached = formatterCache.get(timeZone);
  if (cached !== undefined) return cached;
  let formatter: Intl.DateTimeFormat;
  try {
    formatter = buildFormatter(timeZone);
  } catch (cause) {
    throw new NotificationsError(
      'ERR_NOTIFICATION_TIMEZONE_INVALID',
      `Unknown IANA time zone: ${timeZone}`,
      { cause },
    );
  }
  if (formatterCache.size >= CACHE_LIMIT) {
    const oldest = formatterCache.keys().next();
    if (oldest.done !== true) formatterCache.delete(oldest.value);
  }
  formatterCache.set(timeZone, formatter);
  return formatter;
}

function partsToWallClock(parts: readonly Intl.DateTimeFormatPart[]): ZoneWallClock | null {
  let year: number | null = null;
  let month: number | null = null;
  let day: number | null = null;
  let hour: number | null = null;
  let minute: number | null = null;
  let second: number | null = null;
  let bc = false;
  for (const part of parts) {
    if (part.type === 'era') {
      bc = part.value.toLowerCase().startsWith('b');
      continue;
    }
    if (!/^\d+$/u.test(part.value)) continue;
    const value = Number(part.value);
    if (part.type === 'year') year = value;
    else if (part.type === 'month') month = value;
    else if (part.type === 'day') day = value;
    else if (part.type === 'hour') hour = value === 24 ? 0 : value;
    else if (part.type === 'minute') minute = value;
    else if (part.type === 'second') second = value;
  }
  if (year === null || month === null || day === null) return null;
  if (hour === null || minute === null || second === null) return null;
  return { year: bc ? 1 - year : year, month, day, hour, minute, second };
}

/** Wall-clock reading of `epochMs` in `timeZone`. Throws for an unusable zone. */
export function wallClockIn(epochMs: number, timeZone: string): ZoneWallClock {
  const fields = partsToWallClock(formatterFor(timeZone).formatToParts(epochMs));
  if (fields === null) {
    throw new NotificationsError(
      'ERR_NOTIFICATION_TIMEZONE_INVALID',
      `Time zone ${timeZone} produced a non-numeric wall clock reading.`,
    );
  }
  return fields;
}

// `Date.UTC`는 0–99년을 1900년대로 접지만, 이 패키지가 다루는 시각은 전부 현대이고
// `assertUsableTimeZone`의 프로브도 그렇다. 접힘 범위를 만들 경로가 없으므로 보정하지 않는다.
function asUtcEpoch(fields: ZoneWallClock): number {
  return Date.UTC(
    fields.year,
    fields.month - 1,
    fields.day,
    fields.hour,
    fields.minute,
    fields.second,
  );
}

/**
 * 로컬 날짜에 `days`를 더한 달력 날짜. `Date` 객체를 만들지 않고 UTC 벽시계 판독으로
 * 정규화한다 — `Date` 생성은 `runtime.ts`만 한다(가드).
 */
function shiftCalendarDay(
  fields: ZoneWallClock,
  days: number,
): { readonly year: number; readonly month: number; readonly day: number } {
  const shifted = wallClockIn(Date.UTC(fields.year, fields.month - 1, fields.day + days), 'UTC');
  return { year: shifted.year, month: shifted.month, day: shifted.day };
}

/** UTC offset in minutes at `epochMs`, as this zone observed it. */
export function offsetMinutesAt(epochMs: number, timeZone: string): number {
  const fields = wallClockIn(epochMs, timeZone);
  const flooredToSecond = Math.floor(epochMs / 1000) * 1000;
  return Math.round((asUtcEpoch(fields) - flooredToSecond) / MINUTE_MS);
}

function sameWallClock(a: ZoneWallClock, b: ZoneWallClock): boolean {
  return (
    a.year === b.year &&
    a.month === b.month &&
    a.day === b.day &&
    a.hour === b.hour &&
    a.minute === b.minute &&
    a.second === b.second
  );
}

/**
 * The instant a wall-clock reading names, plus how the zone maps it.
 *
 * Candidate offsets are sampled a day either side of the target, which covers
 * every transition that can affect it. A reading with two valid instants
 * resolves to the earlier one; a reading with none resolves to the first instant
 * that exists after the gap (design 3.2.3).
 */
export function instantOfWallClock(fields: ZoneWallClock, timeZone: string): ZoneResolution {
  const target = asUtcEpoch(fields);
  const offsets = new Set<number>([
    offsetMinutesAt(target - DAY_MS, timeZone),
    offsetMinutesAt(target, timeZone),
    offsetMinutesAt(target + DAY_MS, timeZone),
  ]);

  const candidates: number[] = [];
  for (const offset of offsets) candidates.push(target - offset * MINUTE_MS);

  const valid = candidates
    .filter((candidate) => sameWallClock(wallClockIn(candidate, timeZone), fields))
    .sort((a, b) => a - b);

  const first = valid[0];
  if (first === undefined) {
    // 갭: 두 후보가 전환 시각을 사이에 두므로 늦은 쪽이 "갭 직후 첫 존재하는 순간"이다.
    return { epochMs: Math.max(...candidates), kind: 'gap' };
  }
  return { epochMs: first, kind: valid.length > 1 ? 'ambiguous' : 'exact' };
}

/** First instant of the local calendar day containing `epochMs`. */
export function startOfLocalDay(epochMs: number, timeZone: string): number {
  const fields = wallClockIn(epochMs, timeZone);
  return instantOfWallClock(
    { year: fields.year, month: fields.month, day: fields.day, hour: 0, minute: 0, second: 0 },
    timeZone,
  ).epochMs;
}

/** First instant of the local calendar day after the one containing `epochMs`. */
export function startOfNextLocalDay(epochMs: number, timeZone: string): number {
  const next = shiftCalendarDay(wallClockIn(epochMs, timeZone), 1);
  return instantOfWallClock(
    { year: next.year, month: next.month, day: next.day, hour: 0, minute: 0, second: 0 },
    timeZone,
  ).epochMs;
}

/** Same local date as `epochMs`, advanced by `days`, at `hour:00:00`. */
export function localDateAt(
  epochMs: number,
  timeZone: string,
  days: number,
  hour: number,
): ZoneResolution {
  const shifted = shiftCalendarDay(wallClockIn(epochMs, timeZone), days);
  return instantOfWallClock(
    { year: shifted.year, month: shifted.month, day: shifted.day, hour, minute: 0, second: 0 },
    timeZone,
  );
}

/**
 * Boot-time self test.
 *
 * Rejects three things, and only these three: a name this runtime does not know
 * (V8 throws `RangeError` when the formatter is built), an implausible UTC
 * offset, and a wall-clock round trip that does not return the instant it started
 * from. Any of them fails assembly with `ERR_NOTIFICATION_TIMEZONE_INVALID`
 * rather than mis-delivering quietly (design 7-4).
 *
 * **What it cannot detect: a runtime that silently substitutes UTC for a valid
 * zone name.** Every probe then reads as UTC, so the offset is 0 (plausible) and
 * the round trip is exact - both gates pass by construction, and the policy
 * proceeds to answer every quiet-hours question in the wrong zone. There is no
 * signal inside `Intl` that distinguishes "this zone really is UTC" from "this
 * build threw your zone away". A full-icu runtime is therefore a deployment
 * precondition, not something this function verifies; it verifies that the name
 * resolves at all and that the arithmetic on it is self-consistent.
 */
export function assertUsableTimeZone(timeZone: string): void {
  if (typeof timeZone !== 'string' || timeZone.trim().length === 0) {
    throw new NotificationsError(
      'ERR_NOTIFICATION_TIMEZONE_INVALID',
      'timeZone must be a non-empty IANA time zone name.',
    );
  }
  for (const probe of [PROBE_JANUARY, PROBE_JULY]) {
    const offset = offsetMinutesAt(probe, timeZone);
    if (
      !Number.isInteger(offset) ||
      offset < MIN_OFFSET_MINUTES ||
      offset > MAX_OFFSET_MINUTES
    ) {
      throw new NotificationsError(
        'ERR_NOTIFICATION_TIMEZONE_INVALID',
        `Time zone ${timeZone} reported an implausible UTC offset of ${offset} minutes.`,
      );
    }
    const resolved = instantOfWallClock(wallClockIn(probe, timeZone), timeZone);
    if (resolved.kind !== 'exact' || resolved.epochMs !== probe) {
      throw new NotificationsError(
        'ERR_NOTIFICATION_TIMEZONE_INVALID',
        `Time zone ${timeZone} failed the wall-clock round trip self test.`,
      );
    }
  }
}
