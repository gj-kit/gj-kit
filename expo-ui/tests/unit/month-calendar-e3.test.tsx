/**
 * MonthCalendar — 라운드 E §E3.
 *
 * 웹: role=grid/row/columnheader/gridcell + roving 화살표 키보드 매트릭스.
 * 네이티브(Platform.OS mock): 날짜 레이블을 가진 접근 가능한 버튼 셀.
 * 셀 버튼·의미론은 키트 소유 — renderDay는 콘텐츠만 바꾼다는 계약을 함께 고정한다.
 */
import { useState } from 'react';
import type { ReactElement } from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Platform, Text as RNText } from 'react-native';
import { MonthCalendar } from '../../src/components/month-calendar';
import type {
  MonthCalendarDayContext,
  MonthCalendarProps,
} from '../../src/components/month-calendar';
import type { CalendarDate, CalendarMonth } from '../../src/dates/calendar';
import { UiProvider } from '../../src/components/provider';
import { koStrings } from '../../src/strings/strings';

const WEEKDAYS_KO = ['일', '월', '화', '수', '목', '금', '토'] as const;

function withPlatformOS<T>(os: 'ios' | 'web', run: () => T): T {
  const descriptor = Object.getOwnPropertyDescriptor(Platform, 'OS');
  Object.defineProperty(Platform, 'OS', { configurable: true, value: os });
  try {
    return run();
  } finally {
    if (descriptor === undefined) delete (Platform as { OS?: string }).OS;
    else Object.defineProperty(Platform, 'OS', descriptor);
  }
}

function baseProps(overrides: Partial<MonthCalendarProps> = {}): MonthCalendarProps {
  return {
    month: { year: 2026, month: 8 },
    labels: { weekdays: WEEKDAYS_KO, monthTitle: '2026년 8월' },
    accessibilityLabel: '결제 예정 캘린더',
    testID: 'cal',
    ...overrides,
  };
}

function renderCalendar(overrides: Partial<MonthCalendarProps> = {}) {
  return render(
    <UiProvider>
      <MonthCalendar {...baseProps(overrides)} />
    </UiProvider>,
  );
}

describe('웹 grid 의미론', () => {
  it('grid 이름·columnheader 순서(월요일 시작 재배열)·행 구성', () => {
    renderCalendar({ value: { year: 2026, month: 8, day: 24 }, onValueChange: vi.fn() });
    screen.getByRole('grid', { name: '결제 예정 캘린더' });
    const headers = screen.getAllByRole('columnheader');
    expect(headers.map((header) => header.textContent)).toEqual([
      '월', '화', '수', '목', '금', '토', '일',
    ]);
    // 헤더 1행 + 2026년 8월 6주.
    expect(screen.getAllByRole('row')).toHaveLength(7);
    expect(screen.getByText('2026년 8월')).toBeTruthy();
  });

  it('weekStartsOn 0이면 일요일부터 — weekdays 배열은 그대로 둔 채 재배열만 된다', () => {
    renderCalendar({ weekStartsOn: 0 });
    const headers = screen.getAllByRole('columnheader');
    expect(headers.map((header) => header.textContent)).toEqual([
      '일', '월', '화', '수', '목', '금', '토',
    ]);
  });

  it('패딩 셀도 gridcell로 남아 열 정렬을 지키고 콘텐츠만 AT에서 숨긴다', () => {
    renderCalendar({
      onValueChange: vi.fn(),
      renderDay: ({ date }) => <RNText>{`D${date.day}`}</RNText>,
    });
    // 42칸 전부 노출 — 셀을 aria-hidden하면 SR이 "노출 셀 위치 = 열"로 계산해
    // 첫/마지막 주의 요일 헤더 매핑이 무너진다.
    expect(screen.getAllByRole('gridcell')).toHaveLength(42);
    const rows = screen.getAllByRole('row');
    for (const row of rows.slice(1)) {
      expect(within(row).getAllByRole('gridcell')).toHaveLength(7);
    }
    // 8월 그리드의 앞 패딩(7/27~7/31)은 이름 없는 비활성 표시 전용 칸.
    const padding = screen.getByTestId('cal-day-2026-07-27');
    expect(padding.getAttribute('aria-hidden')).toBeNull();
    expect(padding.getAttribute('aria-disabled')).toBe('true');
    expect(padding.getAttribute('tabindex')).toBeNull();
    // 콘텐츠는 aria-hidden — 패딩 셀은 접근 가능한 이름을 갖지 않는다.
    expect(screen.queryByRole('gridcell', { name: 'D27' })).toBeNull();
    expect(padding.textContent).toBe('D27');
  });

  it('기본 셀 이름은 ISO key이고 getDayAccessibilityLabel이 덮어쓴다', () => {
    renderCalendar({ onValueChange: vi.fn() });
    screen.getByRole('gridcell', { name: '2026-08-24' });
    renderCalendar({
      onValueChange: vi.fn(),
      getDayAccessibilityLabel: ({ date }) => `${date.month}월 ${date.day}일`,
    });
    screen.getByRole('gridcell', { name: '8월 24일' });
  });

  it('선택 상태는 aria-selected, 오늘은 aria-current="date"로 노출된다', () => {
    renderCalendar({
      value: { year: 2026, month: 8, day: 3 },
      onValueChange: vi.fn(),
      today: { year: 2026, month: 8, day: 24 },
    });
    expect(screen.getByTestId('cal-day-2026-08-03').getAttribute('aria-selected')).toBe('true');
    expect(screen.getByTestId('cal-day-2026-08-04').getAttribute('aria-selected')).toBe('false');
    expect(screen.getByTestId('cal-day-2026-08-24').getAttribute('aria-current')).toBe('date');
    expect(screen.getByTestId('cal-day-2026-08-03').getAttribute('aria-current')).toBeNull();
  });

  it('today prop이 없으면(clock-free) 어떤 셀에도 aria-current가 없다', () => {
    renderCalendar({ onValueChange: vi.fn() });
    const withCurrent = screen
      .getAllByRole('gridcell')
      .filter((cell) => cell.getAttribute('aria-current') !== null);
    expect(withCurrent).toEqual([]);
  });

  it('클릭이 CalendarDate로 선택을 요청하고 비활성 날은 무시된다', () => {
    const onValueChange = vi.fn();
    renderCalendar({
      onValueChange,
      minDate: { year: 2026, month: 8, day: 10 },
      maxDate: { year: 2026, month: 8, day: 20 },
    });
    fireEvent.click(screen.getByTestId('cal-day-2026-08-15'));
    expect(onValueChange).toHaveBeenCalledWith({ year: 2026, month: 8, day: 15 });
    const disabled = screen.getByTestId('cal-day-2026-08-05');
    expect(disabled.getAttribute('aria-disabled')).toBe('true');
    // 비활성 날도 (roving으로) 포커스 가능하지만 활성화는 무시된다.
    fireEvent.click(disabled);
    fireEvent.keyDown(disabled, { key: 'Enter' });
    expect(onValueChange).toHaveBeenCalledTimes(1);
  });

  it('onValueChange가 없으면 정적 표시다 — tabindex도 클릭 핸들러도 없다', () => {
    renderCalendar({ value: { year: 2026, month: 8, day: 3 } });
    const cell = screen.getByTestId('cal-day-2026-08-03');
    expect(cell.getAttribute('tabindex')).toBeNull();
    // value가 주어졌으므로 선택 상태 자체는 계속 노출된다.
    expect(cell.getAttribute('aria-selected')).toBe('true');
    fireEvent.click(cell); // no-op — 핸들러가 없다
  });

  it('renderDay는 콘텐츠 슬롯일 뿐 셀 의미론(gridcell·이름·선택 상태)은 키트가 유지한다', () => {
    const seen: MonthCalendarDayContext[] = [];
    renderCalendar({
      value: { year: 2026, month: 8, day: 24 },
      onValueChange: vi.fn(),
      today: { year: 2026, month: 8, day: 24 },
      renderDay: (context) => {
        seen.push(context);
        return <RNText>{`D${context.date.day}`}</RNText>;
      },
    });
    const cell = screen.getByRole('gridcell', { name: '2026-08-24' });
    expect(cell.getAttribute('aria-selected')).toBe('true');
    expect(cell.textContent).toBe('D24');
    const context = seen.find(
      (entry) => entry.date.day === 24 && entry.date.month === 8 && entry.inMonth,
    );
    expect(context).toEqual({
      date: { year: 2026, month: 8, day: 24 },
      inMonth: true,
      today: true,
      selected: true,
      disabled: false,
    });
    // 패딩 셀에도 inMonth: false로 호출된다.
    expect(seen.some((entry) => !entry.inMonth && entry.disabled)).toBe(true);
  });
});

describe('연도 공간 가장자리 달(1년 1월·9999년 12월)', () => {
  it('9999년 12월이 렌더된다 — 10000년 패딩은 이름 없는 비활성 gridcell', () => {
    renderCalendar({
      month: { year: 9999, month: 12 },
      labels: { weekdays: WEEKDAYS_KO, monthTitle: '9999년 12월' },
      value: { year: 9999, month: 12, day: 31 },
      today: { year: 9999, month: 12, day: 1 },
      onValueChange: vi.fn(),
    });
    expect(screen.getByTestId('cal-day-9999-12-31').getAttribute('aria-selected')).toBe('true');
    expect(screen.getByTestId('cal-day-9999-12-01').getAttribute('aria-current')).toBe('date');
    // 뒤 패딩(10000년 1월)은 CalendarDate 공간 밖 — 표시 전용 칸으로만 남는다.
    const padding = screen.getByTestId('cal-day-10000-01-01');
    expect(padding.getAttribute('aria-disabled')).toBe('true');
    expect(padding.getAttribute('aria-selected')).toBeNull();
  });

  it('1년 1월(일요일 시작)이 렌더된다 — 0년 패딩 포함', () => {
    renderCalendar({
      month: { year: 1, month: 1 },
      weekStartsOn: 0,
      labels: { weekdays: WEEKDAYS_KO, monthTitle: '1년 1월' },
      onValueChange: vi.fn(),
    });
    expect(screen.getByTestId('cal-day-0001-01-01').getAttribute('aria-label')).toBe(
      '0001-01-01',
    );
    expect(screen.getByTestId('cal-day-0000-12-31').getAttribute('aria-disabled')).toBe('true');
  });

  it('가장자리 달의 PageUp/PageDown은 throw 없이 무시된다', () => {
    const onMonthChange = vi.fn();
    renderCalendar({
      month: { year: 9999, month: 12 },
      labels: { weekdays: WEEKDAYS_KO, monthTitle: '9999년 12월' },
      onValueChange: vi.fn(),
      onMonthChange,
    });
    fireEvent.keyDown(screen.getByTestId('cal-day-9999-12-01'), { key: 'PageDown' });
    expect(onMonthChange).not.toHaveBeenCalled();
    // 이전 달 이동은 여전히 동작한다.
    fireEvent.keyDown(screen.getByTestId('cal-day-9999-12-01'), { key: 'PageUp' });
    expect(onMonthChange).toHaveBeenCalledWith({ year: 9999, month: 11 });
  });

  it('1년 1월의 PageUp도 무시된다', () => {
    const onMonthChange = vi.fn();
    renderCalendar({
      month: { year: 1, month: 1 },
      weekStartsOn: 0,
      labels: { weekdays: WEEKDAYS_KO, monthTitle: '1년 1월' },
      onValueChange: vi.fn(),
      onMonthChange,
    });
    fireEvent.keyDown(screen.getByTestId('cal-day-0001-01-01'), { key: 'PageUp' });
    expect(onMonthChange).not.toHaveBeenCalled();
  });
});

describe('웹 roving 키보드 매트릭스', () => {
  function Controlled({
    initialMonth,
    onMonthChangeSpy,
    onValueChangeSpy,
  }: {
    readonly initialMonth: CalendarMonth;
    readonly onMonthChangeSpy?: ((month: CalendarMonth) => void) | undefined;
    readonly onValueChangeSpy?: ((date: CalendarDate) => void) | undefined;
  }): ReactElement {
    const [month, setMonth] = useState<CalendarMonth>(initialMonth);
    const [value, setValue] = useState<CalendarDate | null>({ year: 2026, month: 8, day: 24 });
    return (
      <UiProvider>
        <MonthCalendar
          {...baseProps()}
          month={month}
          value={value}
          onMonthChange={(next) => {
            onMonthChangeSpy?.(next);
            setMonth(next);
          }}
          onValueChange={(next) => {
            onValueChangeSpy?.(next);
            setValue(next);
          }}
        />
      </UiProvider>
    );
  }

  it('선택된 날만 tabIndex 0이고 화살표가 roving 포커스를 옮긴다', () => {
    render(<Controlled initialMonth={{ year: 2026, month: 8 }} />);
    const selected = screen.getByTestId('cal-day-2026-08-24');
    expect(selected.getAttribute('tabindex')).toBe('0');
    expect(screen.getByTestId('cal-day-2026-08-23').getAttribute('tabindex')).toBe('-1');

    fireEvent.keyDown(selected, { key: 'ArrowRight' });
    const next = screen.getByTestId('cal-day-2026-08-25');
    expect(next.getAttribute('tabindex')).toBe('0');
    expect(document.activeElement).toBe(next);

    fireEvent.keyDown(next, { key: 'ArrowDown' });
    // 25+7=32는 표시 달 밖 — 이동이 무시되고 roving은 8/25에 남는다.
    expect(next.getAttribute('tabindex')).toBe('0');
    expect(document.activeElement).toBe(next);
  });

  it('세로 이동은 달 안에서만 — 범위를 벗어나는 이동은 무시된다', () => {
    render(<Controlled initialMonth={{ year: 2026, month: 8 }} />);
    const start = screen.getByTestId('cal-day-2026-08-24');
    fireEvent.keyDown(start, { key: 'ArrowDown' });
    const moved = screen.getByTestId('cal-day-2026-08-31');
    expect(moved.getAttribute('tabindex')).toBe('0');
    fireEvent.keyDown(moved, { key: 'ArrowDown' });
    expect(moved.getAttribute('tabindex')).toBe('0'); // 무시됨
    fireEvent.keyDown(moved, { key: 'ArrowRight' });
    expect(moved.getAttribute('tabindex')).toBe('0'); // 8/31이 마지막 날 — 무시됨
  });

  it('Home/End는 포커스된 주의 달 안 첫/마지막 날로 간다', () => {
    render(<Controlled initialMonth={{ year: 2026, month: 8 }} />);
    // 8/24은 월요일(주 시작) — End는 같은 주 일요일 8/30.
    const start = screen.getByTestId('cal-day-2026-08-24');
    fireEvent.keyDown(start, { key: 'End' });
    expect(document.activeElement).toBe(screen.getByTestId('cal-day-2026-08-30'));
    fireEvent.keyDown(screen.getByTestId('cal-day-2026-08-30'), { key: 'Home' });
    expect(document.activeElement).toBe(screen.getByTestId('cal-day-2026-08-24'));
    // 첫 주는 패딩(7/27~7/31) 뒤 8/1~8/2뿐 — Home/End가 달 안 날짜로 클램프된다.
    fireEvent.keyDown(screen.getByTestId('cal-day-2026-08-24'), { key: 'ArrowUp' });
    fireEvent.keyDown(screen.getByTestId('cal-day-2026-08-17'), { key: 'ArrowUp' });
    fireEvent.keyDown(screen.getByTestId('cal-day-2026-08-10'), { key: 'ArrowUp' });
    fireEvent.keyDown(screen.getByTestId('cal-day-2026-08-03'), { key: 'ArrowLeft' });
    fireEvent.keyDown(screen.getByTestId('cal-day-2026-08-02'), { key: 'ArrowLeft' });
    fireEvent.keyDown(screen.getByTestId('cal-day-2026-08-01'), { key: 'End' });
    expect(document.activeElement).toBe(screen.getByTestId('cal-day-2026-08-02'));
    fireEvent.keyDown(screen.getByTestId('cal-day-2026-08-02'), { key: 'Home' });
    expect(document.activeElement).toBe(screen.getByTestId('cal-day-2026-08-01'));
  });

  it('PageUp/PageDown이 onMonthChange를 요청하고 같은 일자로 포커스를 복원한다', () => {
    const onMonthChange = vi.fn();
    render(
      <Controlled initialMonth={{ year: 2026, month: 8 }} onMonthChangeSpy={onMonthChange} />,
    );
    fireEvent.keyDown(screen.getByTestId('cal-day-2026-08-24'), { key: 'PageDown' });
    expect(onMonthChange).toHaveBeenCalledWith({ year: 2026, month: 9 });
    expect(document.activeElement).toBe(screen.getByTestId('cal-day-2026-09-24'));
    fireEvent.keyDown(screen.getByTestId('cal-day-2026-09-24'), { key: 'PageUp' });
    expect(onMonthChange).toHaveBeenCalledWith({ year: 2026, month: 8 });
    expect(document.activeElement).toBe(screen.getByTestId('cal-day-2026-08-24'));
  });

  it('PageDown 후 roving 일자는 짧은 달 길이로 클램프된다', () => {
    render(<Controlled initialMonth={{ year: 2026, month: 8 }} />);
    // 8/31로 이동한 뒤 9월(30일)로 넘어가면 roving은 9/30.
    fireEvent.keyDown(screen.getByTestId('cal-day-2026-08-24'), { key: 'ArrowDown' });
    fireEvent.keyDown(screen.getByTestId('cal-day-2026-08-31'), { key: 'PageDown' });
    expect(document.activeElement).toBe(screen.getByTestId('cal-day-2026-09-30'));
  });

  it('Enter/Space가 포커스된 날을 선택한다', () => {
    const onValueChange = vi.fn();
    render(
      <Controlled initialMonth={{ year: 2026, month: 8 }} onValueChangeSpy={onValueChange} />,
    );
    const start = screen.getByTestId('cal-day-2026-08-24');
    fireEvent.keyDown(start, { key: 'ArrowLeft' });
    fireEvent.keyDown(screen.getByTestId('cal-day-2026-08-23'), { key: 'Enter' });
    expect(onValueChange).toHaveBeenCalledWith({ year: 2026, month: 8, day: 23 });
    fireEvent.keyDown(screen.getByTestId('cal-day-2026-08-23'), { key: 'ArrowLeft' });
    fireEvent.keyDown(screen.getByTestId('cal-day-2026-08-22'), { key: ' ' });
    expect(onValueChange).toHaveBeenCalledWith({ year: 2026, month: 8, day: 22 });
  });

  it('선택도 오늘도 없는 달의 초기 roving은 첫 활성 날이다', () => {
    renderCalendar({
      onValueChange: vi.fn(),
      minDate: { year: 2026, month: 8, day: 10 },
    });
    expect(screen.getByTestId('cal-day-2026-08-10').getAttribute('tabindex')).toBe('0');
    expect(screen.getByTestId('cal-day-2026-08-01').getAttribute('tabindex')).toBe('-1');
  });
});

describe('네이티브 의미론', () => {
  it('달 안 셀은 날짜 레이블·selected/disabled 상태를 가진 버튼이다', () => {
    withPlatformOS('ios', () => {
      const onValueChange = vi.fn();
      renderCalendar({
        value: { year: 2026, month: 8, day: 3 },
        onValueChange,
        maxDate: { year: 2026, month: 8, day: 25 },
      });
      const day = screen.getByTestId('cal-day-2026-08-24');
      expect(day.getAttribute('role')).toBe('button');
      expect(day.getAttribute('aria-label')).toBe('2026-08-24');
      fireEvent.click(day);
      expect(onValueChange).toHaveBeenCalledWith({ year: 2026, month: 8, day: 24 });

      const selected = screen.getByTestId('cal-day-2026-08-03');
      expect(selected.getAttribute('aria-selected')).toBe('true');
      const disabled = screen.getByTestId('cal-day-2026-08-28');
      expect(disabled.getAttribute('aria-disabled')).toBe('true');
      fireEvent.click(disabled);
      expect(onValueChange).toHaveBeenCalledTimes(1);
    });
  });

  it('요일 헤더는 네이티브 접근성 트리에서 숨겨지고 패딩 셀도 숨겨진다', () => {
    withPlatformOS('ios', () => {
      renderCalendar({ onValueChange: vi.fn() });
      const weekday = screen.getByText('월');
      expect(weekday.closest('[aria-hidden="true"]')).not.toBeNull();
      expect(
        screen.getByTestId('cal-day-2026-07-27').getAttribute('aria-hidden'),
      ).toBe('true');
    });
  });

  it('onValueChange가 없으면 셀은 버튼이 아니라 레이블을 가진 정적 요소다', () => {
    withPlatformOS('ios', () => {
      renderCalendar({ value: { year: 2026, month: 8, day: 3 } });
      const cell = screen.getByTestId('cal-day-2026-08-03');
      expect(cell.getAttribute('role')).not.toBe('button');
      expect(cell.getAttribute('aria-label')).toBe('2026-08-03');
    });
  });

  it('ko 문자열 Provider 아래에서도 셀 레이블은 앱 소유 — 키트 기본은 ISO key다', () => {
    withPlatformOS('ios', () => {
      render(
        <UiProvider strings={koStrings}>
          <MonthCalendar {...baseProps({ onValueChange: vi.fn() })} />
        </UiProvider>,
      );
      expect(screen.getByTestId('cal-day-2026-08-24').getAttribute('aria-label')).toBe(
        '2026-08-24',
      );
    });
  });
});

describe('구성 검증', () => {
  it('공백 accessibilityLabel·잘못된 범위·잘못된 날짜는 config 오류다', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      expect(() => renderCalendar({ accessibilityLabel: '  ' })).toThrow(/accessibilityLabel/);
      expect(() =>
        renderCalendar({
          minDate: { year: 2026, month: 9, day: 1 },
          maxDate: { year: 2026, month: 8, day: 1 },
        }),
      ).toThrow(/minDate/);
      expect(() =>
        renderCalendar({ value: { year: 2026, month: 2, day: 30 } }),
      ).toThrow(/value/);
      expect(() =>
        renderCalendar({
          labels: { weekdays: ['일', '월'] as never, monthTitle: '2026년 8월' },
        }),
      ).toThrow(/weekdays/);
      expect(() =>
        renderCalendar({ month: { year: 2026, month: 13 } }),
      ).toThrow(/month/);
    } finally {
      spy.mockRestore();
    }
  });
});
