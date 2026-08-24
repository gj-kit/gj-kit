/**
 * Pure calendar-date math — the foundation of MonthCalendar and DateField.
 *
 * This module is deliberately clock-free and time-zone-free: nothing here reads
 * the current time, and the JavaScript Date object appears in no signature.
 * A CalendarDate is a plain civil date in the proleptic Gregorian calendar;
 * which instant it corresponds to (and in which time zone "today" falls) is the
 * application's decision. Like src/theme, this folder imports neither react nor
 * react-native, so Node scripts can load the math safely.
 */

/**
 * A plain civil calendar date. `month` is 1–12 and `day` is 1–31; `year` is a
 * four-digit-key year (1–9999). Deliberately not a Date: a CalendarDate names a
 * day, not an instant, so no time zone can silently shift it.
 */
export interface CalendarDate {
  readonly year: number;
  /** 1–12. */
  readonly month: number;
  /** 1–31, at most the length of the month. */
  readonly day: number;
}

/** A year–month pair naming one displayed calendar month. `month` is 1–12. */
export interface CalendarMonth {
  readonly year: number;
  /** 1–12. */
  readonly month: number;
}

/** Day of week as a number, 0 = Sunday through 6 = Saturday. */
export type CalendarWeekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/** The week column a month grid starts on: 0 = Sunday, 1 = Monday. */
export type CalendarWeekStart = 0 | 1;

/**
 * One cell of a month grid. Leading/trailing cells carry `inMonth: false`.
 *
 * Boundary caveat: at the two edge months of the year space (January 0001 and
 * December 9999) the padding days fall OUTSIDE the CalendarDate year range —
 * year 0 or 10000. Those `inMonth: false` cells fail `isValidCalendarDate`,
 * and asserting helpers such as `formatCalendarDateKey` reject them; treat a
 * padding cell's `date` as display data, not as a value to feed back into the
 * calendar API without checking `isValidCalendarDate` first.
 */
export interface MonthGridCell {
  readonly date: CalendarDate;
  /** False for the adjacent-month days that pad the first and last week. */
  readonly inMonth: boolean;
}

/** One grid row — always exactly seven cells. */
export type MonthGridWeek = readonly [
  MonthGridCell,
  MonthGridCell,
  MonthGridCell,
  MonthGridCell,
  MonthGridCell,
  MonthGridCell,
  MonthGridCell,
];

/**
 * A month laid out as weeks. The grid has as many weeks as the month actually
 * spans (4–6) — no phantom sixth week is padded on.
 */
export interface MonthGrid {
  readonly month: CalendarMonth;
  readonly weekStartsOn: CalendarWeekStart;
  readonly weeks: readonly MonthGridWeek[];
}

// 4자리 key 공간(0001–9999)이 유효 연도 범위다 — formatCalendarDateKey와 왕복 가능해야 한다.
const MIN_YEAR = 1;
const MAX_YEAR = 9999;

const DAYS_PER_MONTH: readonly number[] = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function isInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value);
}

/** True when the year is a Gregorian leap year. */
export function isCalendarLeapYear(year: number): boolean {
  if (!isInteger(year)) throw new Error('Calendar year must be an integer.');
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/** The number of days in the given month (28–31). */
export function daysInCalendarMonth(year: number, month: number): number {
  if (!isInteger(year)) throw new Error('Calendar year must be an integer.');
  if (!isInteger(month) || month < 1 || month > 12) {
    throw new Error('Calendar month must be an integer from 1 to 12.');
  }
  if (month === 2 && isCalendarLeapYear(year)) return 29;
  const days = DAYS_PER_MONTH[month - 1];
  // month 검증을 통과했으므로 도달 불가 — noUncheckedIndexedAccess 대응.
  if (days === undefined) throw new Error('Calendar month must be an integer from 1 to 12.');
  return days;
}

/**
 * True when the value is a structurally complete CalendarDate naming a real
 * day: integer fields, year 1–9999, month 1–12, and a day that exists in that
 * month (February 30th is rejected).
 */
export function isValidCalendarDate(value: unknown): value is CalendarDate {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as { year?: unknown; month?: unknown; day?: unknown };
  if (!isInteger(candidate.year) || candidate.year < MIN_YEAR || candidate.year > MAX_YEAR) {
    return false;
  }
  if (!isInteger(candidate.month) || candidate.month < 1 || candidate.month > 12) return false;
  if (!isInteger(candidate.day) || candidate.day < 1) return false;
  return candidate.day <= daysInCalendarMonth(candidate.year, candidate.month);
}

function assertValidDate(value: CalendarDate, name: string): void {
  if (!isValidCalendarDate(value)) {
    throw new Error(
      `${name} must be a valid CalendarDate (integer year 1-9999, month 1-12, day within the month).`,
    );
  }
}

function assertValidMonth(year: number, month: number, name: string): void {
  if (!isInteger(year) || year < MIN_YEAR || year > MAX_YEAR) {
    throw new Error(`${name} year must be an integer from 1 to 9999.`);
  }
  if (!isInteger(month) || month < 1 || month > 12) {
    throw new Error(`${name} month must be an integer from 1 to 12.`);
  }
}

/** Chronological comparison: -1 when a is earlier, 0 when equal, 1 when later. */
export function compareCalendarDates(a: CalendarDate, b: CalendarDate): -1 | 0 | 1 {
  assertValidDate(a, 'compareCalendarDates a');
  assertValidDate(b, 'compareCalendarDates b');
  if (a.year !== b.year) return a.year < b.year ? -1 : 1;
  if (a.month !== b.month) return a.month < b.month ? -1 : 1;
  if (a.day !== b.day) return a.day < b.day ? -1 : 1;
  return 0;
}

/** True when both name the same civil day. */
export function isSameCalendarDate(a: CalendarDate, b: CalendarDate): boolean {
  return compareCalendarDates(a, b) === 0;
}

/** True when both name the same year–month. */
export function isSameCalendarMonth(a: CalendarMonth, b: CalendarMonth): boolean {
  assertValidMonth(a.year, a.month, 'isSameCalendarMonth a');
  assertValidMonth(b.year, b.month, 'isSameCalendarMonth b');
  return a.year === b.year && a.month === b.month;
}

/**
 * Clamps a date into the inclusive [min, max] range. Either bound may be
 * omitted. Returns the input object itself when it is already in range.
 */
export function clampCalendarDate(
  date: CalendarDate,
  min?: CalendarDate,
  max?: CalendarDate,
): CalendarDate {
  assertValidDate(date, 'clampCalendarDate date');
  if (min !== undefined) assertValidDate(min, 'clampCalendarDate min');
  if (max !== undefined) assertValidDate(max, 'clampCalendarDate max');
  if (min !== undefined && max !== undefined && compareCalendarDates(min, max) === 1) {
    throw new Error('clampCalendarDate min must not be later than max.');
  }
  if (min !== undefined && compareCalendarDates(date, min) === -1) return min;
  if (max !== undefined && compareCalendarDates(date, max) === 1) return max;
  return date;
}

// ─── (내부) 직렬 일수 변환 — Howard Hinnant civil-from-days 알고리즘 ─────────
// 1970-01-01을 0으로 하는 연속 일련번호. Date 없이 정수 연산만 사용한다.

function toDayNumber(date: CalendarDate): number {
  const y = date.month <= 2 ? date.year - 1 : date.year;
  const era = Math.floor(y / 400);
  const yoe = y - era * 400;
  const mp = date.month + (date.month > 2 ? -3 : 9);
  const doy = Math.floor((153 * mp + 2) / 5) + date.day - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

function fromDayNumber(dayNumber: number): CalendarDate {
  const z = dayNumber + 719468;
  const era = Math.floor(z / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor(
    (doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365,
  );
  const y = yoe + era * 400;
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const day = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const month = mp < 10 ? mp + 3 : mp - 9;
  return { year: month <= 2 ? y + 1 : y, month, day };
}

/**
 * Adds whole days (negative to subtract), crossing month and year boundaries
 * exactly. The result must stay inside the year range 1–9999.
 */
export function addCalendarDays(date: CalendarDate, amount: number): CalendarDate {
  assertValidDate(date, 'addCalendarDays date');
  if (!isInteger(amount)) throw new Error('addCalendarDays amount must be an integer.');
  const result = fromDayNumber(toDayNumber(date) + amount);
  if (result.year < MIN_YEAR || result.year > MAX_YEAR) {
    throw new Error('addCalendarDays result leaves the supported year range 1-9999.');
  }
  return result;
}

/** Adds whole months (negative to subtract) to a year–month pair. */
export function addCalendarMonths(month: CalendarMonth, amount: number): CalendarMonth {
  assertValidMonth(month.year, month.month, 'addCalendarMonths month');
  if (!isInteger(amount)) throw new Error('addCalendarMonths amount must be an integer.');
  const zeroBased = month.year * 12 + (month.month - 1) + amount;
  const year = Math.floor(zeroBased / 12);
  if (year < MIN_YEAR || year > MAX_YEAR) {
    throw new Error('addCalendarMonths result leaves the supported year range 1-9999.');
  }
  return { year, month: (zeroBased % 12 + 12) % 12 + 1 };
}

/** Day of week of a date, 0 = Sunday through 6 = Saturday. */
export function calendarDayOfWeek(date: CalendarDate): CalendarWeekday {
  assertValidDate(date, 'calendarDayOfWeek date');
  // 1970-01-01은 목요일(4)이다.
  return ((((toDayNumber(date) + 4) % 7) + 7) % 7) as CalendarWeekday;
}

/**
 * Formats a date as the ISO-8601 key "YYYY-MM-DD" (zero-padded). This is a
 * data format, not display copy — visible labels stay with the application.
 */
export function formatCalendarDateKey(date: CalendarDate): string {
  assertValidDate(date, 'formatCalendarDateKey date');
  const year = String(date.year).padStart(4, '0');
  const month = String(date.month).padStart(2, '0');
  const day = String(date.day).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Parses a strict "YYYY-MM-DD" key back into a CalendarDate. Returns null for
 * anything that is not a zero-padded key naming a real day.
 */
export function parseCalendarDateKey(value: string): CalendarDate | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (match === null) return null;
  const candidate = {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
  return isValidCalendarDate(candidate) ? candidate : null;
}

/**
 * Lays a month out as weeks of seven cells. The first and last weeks are
 * completed with real adjacent-month dates flagged `inMonth: false`, and the
 * grid spans exactly as many weeks as the month needs (4–6) — a month that
 * fills whole weeks exactly gets no padding cells at all.
 *
 * Every month of the supported year space (1–9999) lays out without throwing.
 * At the two edge months (January 0001, December 9999) the padding cells name
 * days outside that space (year 0 / 10000) — see the MonthGridCell caveat;
 * such cells are not valid CalendarDates.
 */
export function buildMonthGrid(
  year: number,
  month: number,
  weekStartsOn: CalendarWeekStart = 1,
): MonthGrid {
  assertValidMonth(year, month, 'buildMonthGrid');
  if (weekStartsOn !== 0 && weekStartsOn !== 1) {
    throw new Error('buildMonthGrid weekStartsOn must be 0 (Sunday) or 1 (Monday).');
  }
  const first: CalendarDate = { year, month, day: 1 };
  const leading = (calendarDayOfWeek(first) - weekStartsOn + 7) % 7;
  const monthLength = daysInCalendarMonth(year, month);
  const weekCount = Math.ceil((leading + monthLength) / 7);
  const firstCellNumber = toDayNumber(first) - leading;
  const weeks: MonthGridWeek[] = [];
  for (let week = 0; week < weekCount; week++) {
    const cells: MonthGridCell[] = [];
    for (let column = 0; column < 7; column++) {
      const date = fromDayNumber(firstCellNumber + week * 7 + column);
      cells.push({ date, inMonth: date.year === year && date.month === month });
    }
    weeks.push(cells as unknown as MonthGridWeek);
  }
  return { month: { year, month }, weekStartsOn, weeks };
}
