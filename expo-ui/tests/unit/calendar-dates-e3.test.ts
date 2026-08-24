/**
 * 순수 달력 수학 — 라운드 E §E3.
 *
 * clock-free 계약: 이 모듈은 현재 시각을 읽지 않고 Date를 공개 API에 노출하지
 * 않는다. 테스트는 Date.UTC를 오라클로만 사용한다(1900년 이후 — Date.UTC의
 * 2자리 연도 매핑을 피한다).
 */
import { describe, expect, it } from 'vitest';
import {
  addCalendarDays,
  addCalendarMonths,
  buildMonthGrid,
  calendarDayOfWeek,
  clampCalendarDate,
  compareCalendarDates,
  daysInCalendarMonth,
  formatCalendarDateKey,
  isCalendarLeapYear,
  isSameCalendarDate,
  isSameCalendarMonth,
  isValidCalendarDate,
  parseCalendarDateKey,
} from '../../src/dates/calendar';
import type { CalendarDate } from '../../src/dates/calendar';

const d = (year: number, month: number, day: number): CalendarDate => ({ year, month, day });

describe('윤년·월 길이', () => {
  it('그레고리력 윤년 규칙(4·100·400)을 따른다', () => {
    expect(isCalendarLeapYear(2024)).toBe(true);
    expect(isCalendarLeapYear(2025)).toBe(false);
    expect(isCalendarLeapYear(1900)).toBe(false);
    expect(isCalendarLeapYear(2000)).toBe(true);
  });

  it('월 길이 — 2월은 윤년에만 29일', () => {
    expect(daysInCalendarMonth(2024, 2)).toBe(29);
    expect(daysInCalendarMonth(2025, 2)).toBe(28);
    expect(daysInCalendarMonth(2026, 4)).toBe(30);
    expect(daysInCalendarMonth(2026, 8)).toBe(31);
  });

  it('잘못된 월은 config 오류다', () => {
    expect(() => daysInCalendarMonth(2026, 0)).toThrow(/month/);
    expect(() => daysInCalendarMonth(2026, 13)).toThrow(/month/);
    expect(() => daysInCalendarMonth(2026.5, 3)).toThrow(/year/);
  });
});

describe('isValidCalendarDate — 실존하는 날만 통과', () => {
  it('실제 날짜를 승인한다', () => {
    expect(isValidCalendarDate(d(2024, 2, 29))).toBe(true);
    expect(isValidCalendarDate(d(1, 1, 1))).toBe(true);
    expect(isValidCalendarDate(d(9999, 12, 31))).toBe(true);
  });

  it('구조·범위·달력 위반을 거부한다', () => {
    expect(isValidCalendarDate(d(2025, 2, 29))).toBe(false); // 평년 2/29
    expect(isValidCalendarDate(d(2026, 2, 30))).toBe(false);
    expect(isValidCalendarDate(d(2026, 13, 1))).toBe(false);
    expect(isValidCalendarDate(d(2026, 0, 1))).toBe(false);
    expect(isValidCalendarDate(d(2026, 1, 0))).toBe(false);
    expect(isValidCalendarDate(d(0, 1, 1))).toBe(false); // 연도 하한 1
    expect(isValidCalendarDate(d(10000, 1, 1))).toBe(false); // 4자리 key 공간 밖
    expect(isValidCalendarDate(d(2026.5, 1, 1))).toBe(false);
    expect(isValidCalendarDate(null)).toBe(false);
    expect(isValidCalendarDate('2026-01-01')).toBe(false);
    expect(isValidCalendarDate(new Date())).toBe(false); // Date는 CalendarDate가 아니다
  });
});

describe('비교·클램프', () => {
  it('compare는 연-월-일 사전식이다', () => {
    expect(compareCalendarDates(d(2026, 8, 24), d(2026, 8, 24))).toBe(0);
    expect(compareCalendarDates(d(2026, 8, 23), d(2026, 8, 24))).toBe(-1);
    expect(compareCalendarDates(d(2026, 9, 1), d(2026, 8, 31))).toBe(1);
    expect(compareCalendarDates(d(2027, 1, 1), d(2026, 12, 31))).toBe(1);
    expect(isSameCalendarDate(d(2026, 8, 24), d(2026, 8, 24))).toBe(true);
    expect(isSameCalendarMonth({ year: 2026, month: 8 }, { year: 2026, month: 8 })).toBe(true);
    expect(isSameCalendarMonth({ year: 2026, month: 8 }, { year: 2026, month: 9 })).toBe(false);
  });

  it('clamp는 범위 안 입력을 같은 객체로 돌려준다', () => {
    const date = d(2026, 8, 24);
    expect(clampCalendarDate(date, d(2026, 1, 1), d(2026, 12, 31))).toBe(date);
    expect(clampCalendarDate(date)).toBe(date);
    expect(clampCalendarDate(d(2025, 12, 31), d(2026, 1, 1), undefined)).toEqual(d(2026, 1, 1));
    expect(clampCalendarDate(d(2027, 1, 1), undefined, d(2026, 12, 31))).toEqual(d(2026, 12, 31));
    expect(() => clampCalendarDate(date, d(2026, 12, 31), d(2026, 1, 1))).toThrow(/min/);
  });
});

describe('일·월 산술', () => {
  it('월·연 경계를 정확히 넘는다', () => {
    expect(addCalendarDays(d(2026, 1, 1), -1)).toEqual(d(2025, 12, 31));
    expect(addCalendarDays(d(2026, 8, 24), 8)).toEqual(d(2026, 9, 1));
    expect(addCalendarDays(d(2024, 2, 28), 1)).toEqual(d(2024, 2, 29));
    expect(addCalendarDays(d(2025, 2, 28), 1)).toEqual(d(2025, 3, 1));
    expect(addCalendarDays(d(2026, 8, 24), 0)).toEqual(d(2026, 8, 24));
  });

  it('addCalendarMonths는 연도 경계를 넘고 범위를 지킨다', () => {
    expect(addCalendarMonths({ year: 2026, month: 12 }, 1)).toEqual({ year: 2027, month: 1 });
    expect(addCalendarMonths({ year: 2026, month: 1 }, -1)).toEqual({ year: 2025, month: 12 });
    expect(addCalendarMonths({ year: 2026, month: 8 }, -20)).toEqual({ year: 2024, month: 12 });
    expect(() => addCalendarMonths({ year: 9999, month: 12 }, 1)).toThrow(/range/);
  });

  it('요일은 1900년 이후 표본에서 Date.UTC 오라클과 일치한다', () => {
    const samples: ReadonlyArray<readonly [number, number, number]> = [
      [1970, 1, 1],
      [1900, 1, 1],
      [2000, 2, 29],
      [2015, 2, 1],
      [2026, 8, 24],
      [2026, 8, 1],
      [9999, 12, 31],
    ];
    for (const [year, month, day] of samples) {
      expect(calendarDayOfWeek(d(year, month, day))).toBe(
        new Date(Date.UTC(year, month - 1, day)).getUTCDay(),
      );
    }
  });
});

describe('ISO key 직렬화', () => {
  it('4-2-2 zero-pad로 포맷하고 왕복한다', () => {
    expect(formatCalendarDateKey(d(2026, 8, 3))).toBe('2026-08-03');
    expect(formatCalendarDateKey(d(26, 1, 5))).toBe('0026-01-05');
    expect(parseCalendarDateKey('2026-08-03')).toEqual(d(2026, 8, 3));
    expect(parseCalendarDateKey(formatCalendarDateKey(d(1, 1, 1)))).toEqual(d(1, 1, 1));
  });

  it('엄격 파싱 — pad 누락·비실존 날짜·잡음은 null', () => {
    expect(parseCalendarDateKey('2026-8-3')).toBeNull();
    expect(parseCalendarDateKey('2026-02-30')).toBeNull();
    expect(parseCalendarDateKey('2026-00-01')).toBeNull();
    expect(parseCalendarDateKey('0000-01-01')).toBeNull();
    expect(parseCalendarDateKey('2026-08-03T00:00')).toBeNull();
    expect(parseCalendarDateKey('not a date')).toBeNull();
  });
});

describe('buildMonthGrid — 가변 주 수와 인접 달 패딩', () => {
  it('2026년 8월(토요일 시작, 31일)·월요일 주 시작 — 6주, 7/27~9/6', () => {
    const grid = buildMonthGrid(2026, 8, 1);
    expect(grid.month).toEqual({ year: 2026, month: 8 });
    expect(grid.weekStartsOn).toBe(1);
    expect(grid.weeks).toHaveLength(6);
    for (const week of grid.weeks) expect(week).toHaveLength(7);
    expect(grid.weeks[0]?.[0]).toEqual({ date: d(2026, 7, 27), inMonth: false });
    expect(grid.weeks[0]?.[5]).toEqual({ date: d(2026, 8, 1), inMonth: true });
    expect(grid.weeks[5]?.[6]).toEqual({ date: d(2026, 9, 6), inMonth: false });
    const inMonthCount = grid.weeks.flat().filter((cell) => cell.inMonth).length;
    expect(inMonthCount).toBe(31);
  });

  it('같은 달·일요일 주 시작 — 앞 패딩 6칸, 마지막 칸 9/5', () => {
    const grid = buildMonthGrid(2026, 8, 0);
    expect(grid.weeks).toHaveLength(6);
    expect(grid.weeks[0]?.[0]?.date).toEqual(d(2026, 7, 26));
    expect(grid.weeks[0]?.[6]).toEqual({ date: d(2026, 8, 1), inMonth: true });
    expect(grid.weeks[5]?.[6]?.date).toEqual(d(2026, 9, 5));
  });

  it('2026년 2월(일요일 시작, 28일)·일요일 주 시작 — 패딩 0칸의 정확한 4주', () => {
    const grid = buildMonthGrid(2026, 2, 0);
    expect(grid.weeks).toHaveLength(4);
    expect(grid.weeks.flat().every((cell) => cell.inMonth)).toBe(true);
    expect(grid.weeks[0]?.[0]?.date).toEqual(d(2026, 2, 1));
    expect(grid.weeks[3]?.[6]?.date).toEqual(d(2026, 2, 28));
  });

  it('같은 2월·월요일 주 시작 — 5주로 늘어난다', () => {
    const grid = buildMonthGrid(2026, 2, 1);
    expect(grid.weeks).toHaveLength(5);
    expect(grid.weeks[0]?.[0]).toEqual({ date: d(2026, 1, 26), inMonth: false });
  });

  it('weekStartsOn 기본값은 1(월요일)이다', () => {
    expect(buildMonthGrid(2026, 8).weeks[0]?.[0]?.date).toEqual(d(2026, 7, 27));
  });

  it('잘못된 인자는 config 오류다', () => {
    expect(() => buildMonthGrid(2026, 13)).toThrow(/month/);
    expect(() => buildMonthGrid(0, 1)).toThrow(/year/);
    expect(() => buildMonthGrid(2026, 8, 2 as never)).toThrow(/weekStartsOn/);
  });

  it('연초 1월 그리드의 앞 패딩은 전년 12월 날짜다', () => {
    const grid = buildMonthGrid(2026, 1, 1);
    // 2026-01-01은 목요일 — 월요일 시작이면 12/29~12/31이 앞에 온다.
    expect(grid.weeks[0]?.[0]).toEqual({ date: d(2025, 12, 29), inMonth: false });
  });

  it('연도 공간 가장자리 달도 throw 없이 레이아웃된다 — 패딩은 공간 밖(문서화된 캐비앳)', () => {
    // 9999년 12월: 뒤 패딩이 10000년 1월로 넘어간다(두 주 시작 모두).
    for (const weekStartsOn of [0, 1] as const) {
      const grid = buildMonthGrid(9999, 12, weekStartsOn);
      const cells = grid.weeks.flat();
      expect(cells.filter((cell) => cell.inMonth)).toHaveLength(31);
      const trailing = cells.filter((cell) => !cell.inMonth && cell.date.year === 10000);
      expect(trailing.length).toBeGreaterThan(0);
      // 공간 밖 패딩 날짜는 유효한 CalendarDate가 아니다 — MonthGridCell 캐비앗.
      expect(trailing.every((cell) => !isValidCalendarDate(cell.date))).toBe(true);
    }
    // 1년 1월(일요일 시작): 앞 패딩이 0년 12월 31일이다.
    const first = buildMonthGrid(1, 1, 0);
    expect(first.weeks[0]?.[0]).toEqual({ date: d(0, 12, 31), inMonth: false });
    expect(isValidCalendarDate(first.weeks[0]?.[0]?.date)).toBe(false);
    // 1년 1월 1일은 월요일 — 월요일 시작이면 앞 패딩이 아예 없다.
    expect(buildMonthGrid(1, 1, 1).weeks[0]?.[0]).toEqual({ date: d(1, 1, 1), inMonth: true });
  });
});
