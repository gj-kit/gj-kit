/**
 * MonthCalendar — a controlled, clock-free month grid.
 *
 * The application owns every piece of date state: the displayed month, the
 * selected day, and even "today" (an optional prop, because resolving the
 * current day requires a clock and a time zone — both application decisions).
 * The kit owns the grid semantics and the per-day cell button, so renderDay can
 * only customize a day's CONTENT — accessibility can never be dropped by a
 * consumer slot.
 *
 * Header copy (weekday labels, the month title) comes from the required
 * `labels` prop rather than UiStrings: weekday abbreviations and month titles
 * are locale- and calendar-formatting decisions that change with every
 * displayed month, which a static two-locale string bundle cannot own.
 */
import { useEffect, useRef, useState } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { Platform, Pressable, Text as RNText, View } from 'react-native';
import type { StyleProp, TextStyle, ViewStyle } from 'react-native';
import type { Theme } from '../theme/tokens';
import type {
  CalendarDate,
  CalendarMonth,
  CalendarWeekStart,
  MonthGrid,
} from '../dates/calendar';
import {
  addCalendarMonths,
  buildMonthGrid,
  compareCalendarDates,
  daysInCalendarMonth,
  isSameCalendarDate,
  isValidCalendarDate,
} from '../dates/calendar';
import { nativeWindProps, themedStyles } from './internal';
import { useTheme } from './provider';
import { roleTextStyle } from './text';

/** The state of one day cell, handed to renderDay/getDayAccessibilityLabel/dayStyle. */
export interface MonthCalendarDayContext {
  readonly date: CalendarDate;
  /** False for the adjacent-month padding cells of the first and last week. */
  readonly inMonth: boolean;
  /** True only when the app passed `today` and it names this day. */
  readonly today: boolean;
  readonly selected: boolean;
  /** True for adjacent-month padding cells and for days outside the minDate/maxDate range. */
  readonly disabled: boolean;
}

/**
 * Header copy. `weekdays` is ALWAYS Sunday-first (index 0 = Sunday through
 * index 6 = Saturday) regardless of weekStartsOn — the component reorders the
 * columns for display, so one array works for both week starts.
 */
export interface MonthCalendarLabels {
  readonly weekdays: readonly [string, string, string, string, string, string, string];
  /** The visible caption of the displayed month (e.g. "August 2026"). */
  readonly monthTitle: string;
}

export interface MonthCalendarProps {
  /** The displayed month. Controlled — the application owns this state. */
  readonly month: CalendarMonth;
  /**
   * Month-navigation requests raised by the calendar itself — on the web,
   * PageUp (previous month) and PageDown (next month) on a focused day cell.
   * The calendar renders no built-in previous/next buttons; the application
   * composes its own (a Toolbar of Buttons) and updates `month` from both.
   */
  readonly onMonthChange?: ((month: CalendarMonth) => void) | undefined;
  /** The selected day, or null for none. */
  readonly value?: CalendarDate | null | undefined;
  /**
   * Selection handler. When absent the grid is a static presentation: day
   * cells are not focusable, not pressable, and carry no keyboard behavior.
   */
  readonly onValueChange?: ((date: CalendarDate) => void) | undefined;
  /** The weekday the grid starts on: 0 = Sunday, 1 = Monday. Defaults to 1. */
  readonly weekStartsOn?: CalendarWeekStart | undefined;
  /** Days earlier than this are disabled (still focusable, activation is a no-op). */
  readonly minDate?: CalendarDate | undefined;
  /** Days later than this are disabled (still focusable, activation is a no-op). */
  readonly maxDate?: CalendarDate | undefined;
  /**
   * The application-resolved current day. The kit never reads the clock, so
   * omitting this simply renders no today ring and no `aria-current="date"`.
   */
  readonly today?: CalendarDate | undefined;
  readonly labels: MonthCalendarLabels;
  /** Names the grid for assistive technology (web `aria-label`). Required. */
  readonly accessibilityLabel: string;
  /**
   * Replaces a day cell's CONTENT. The cell itself — its gridcell/button
   * semantics, focus, and press handling — stays kit-owned.
   */
  readonly renderDay?: ((context: MonthCalendarDayContext) => ReactNode) | undefined;
  /**
   * The accessible name of a day cell. Defaults to the ISO key "YYYY-MM-DD" —
   * a locale-free data format; pass this for localized, state-rich names.
   */
  readonly getDayAccessibilityLabel?:
    | ((context: MonthCalendarDayContext) => string)
    | undefined;
  /** Per-day style hook layered after the built-in cell visuals. */
  readonly dayStyle?:
    | ((context: MonthCalendarDayContext) => StyleProp<ViewStyle> | undefined)
    | undefined;
  readonly titleStyle?: StyleProp<TextStyle> | undefined;
  readonly weekdayStyle?: StyleProp<TextStyle> | undefined;
  readonly style?: StyleProp<ViewStyle> | undefined;
  readonly className?: string | undefined;
  readonly testID?: string | undefined;
  readonly unstyled?: never;
}

/** Today ring thickness. Every cell carries the border (transparent when not today) so the ring never shifts layout. */
const DAY_CELL_BORDER_WIDTH = 1;

type Focusable = { focus?: () => void };

type WebKeyboardEvent = {
  readonly key: string;
  preventDefault: () => void;
};

function webProps(values: Record<string, unknown>): Record<string, unknown> {
  return Platform.OS === 'web' ? values : {};
}

/**
 * Non-asserting "YYYY-MM-DD" key for React keys and testIDs. The padding cells
 * of the two boundary months (January 0001, December 9999) carry dates outside
 * the CalendarDate year space (year 0 / 10000), which the asserting
 * formatCalendarDateKey rejects — cell keys are identifiers, never dates handed
 * back to the application, so they format leniently.
 */
function formatCellKey(date: CalendarDate): string {
  const year = String(date.year).padStart(4, '0');
  const month = String(date.month).padStart(2, '0');
  const day = String(date.day).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function assertNonblank(value: string, name: string): void {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`MonthCalendar ${name} must be a nonblank string.`);
  }
}

function assertProps(props: MonthCalendarProps): void {
  assertNonblank(props.accessibilityLabel, 'accessibilityLabel');
  assertNonblank(props.labels.monthTitle, 'labels.monthTitle');
  if (props.labels.weekdays.length !== 7) {
    throw new Error('MonthCalendar labels.weekdays must contain exactly 7 labels.');
  }
  props.labels.weekdays.forEach((label, index) => {
    assertNonblank(label, `labels.weekdays[${index}]`);
  });
  for (const [name, date] of [
    ['value', props.value],
    ['today', props.today],
    ['minDate', props.minDate],
    ['maxDate', props.maxDate],
  ] as const) {
    if (date !== undefined && date !== null && !isValidCalendarDate(date)) {
      throw new Error(`MonthCalendar ${name} must be a valid CalendarDate.`);
    }
  }
  if (
    props.minDate !== undefined &&
    props.maxDate !== undefined &&
    compareCalendarDates(props.minDate, props.maxDate) === 1
  ) {
    throw new Error('MonthCalendar minDate must not be later than maxDate.');
  }
}

const getStyles = themedStyles((theme: Theme) => ({
  root: { gap: theme.spacing.sm },
  title: { color: theme.colors.text },
  headerRow: { flexDirection: 'row' as const },
  weekRow: { flexDirection: 'row' as const },
  weekdayCell: {
    alignItems: 'center' as const,
    flex: 1,
    paddingVertical: theme.spacing.xs,
  },
  weekday: { color: theme.colors.textMuted, textAlign: 'center' as const },
  // 웹 패딩 셀의 aria-hidden 콘텐츠 래퍼 — dayCell의 레이아웃 속성을 그대로 이어받는다.
  paddingCellContent: {
    alignItems: 'center' as const,
    alignSelf: 'stretch' as const,
    gap: theme.spacing.xs,
  },
  dayCell: {
    alignItems: 'center' as const,
    borderColor: 'transparent',
    borderRadius: theme.radius.sm,
    borderWidth: DAY_CELL_BORDER_WIDTH,
    flex: 1,
    gap: theme.spacing.xs,
    minHeight: theme.metrics.control.md,
    padding: theme.spacing.xs,
  },
  dayNumber: { textAlign: 'center' as const },
}));

export function MonthCalendar(props: MonthCalendarProps): ReactElement {
  const {
    month,
    onMonthChange,
    value,
    onValueChange,
    weekStartsOn = 1,
    minDate,
    maxDate,
    today,
    labels,
    accessibilityLabel,
    renderDay,
    getDayAccessibilityLabel,
    dayStyle,
    titleStyle,
    weekdayStyle,
    style,
    className,
    testID,
  } = props;
  const theme = useTheme();
  const styles = getStyles(theme);
  // buildMonthGrid이 month·weekStartsOn 유효성도 함께 단언한다.
  const grid: MonthGrid = buildMonthGrid(month.year, month.month, weekStartsOn);
  assertProps(props);

  const monthLength = daysInCalendarMonth(month.year, month.month);
  const selectable = onValueChange !== undefined;
  const selectionExposed = selectable || value !== undefined;

  const isDisabled = (date: CalendarDate): boolean =>
    (minDate !== undefined && compareCalendarDates(date, minDate) === -1) ||
    (maxDate !== undefined && compareCalendarDates(date, maxDate) === 1);

  // ─── roving focus (web·selectable 전용) ─────────────────────────────────
  const [storedRovingDay, setStoredRovingDay] = useState<number | null>(null);
  const dayRefs = useRef<Array<Focusable | null>>([]);
  const pendingFocusRef = useRef(false);

  const fallbackRovingDay = (): number => {
    if (value != null && value.year === month.year && value.month === month.month) {
      return value.day;
    }
    if (today !== undefined && today.year === month.year && today.month === month.month) {
      return today.day;
    }
    for (let day = 1; day <= monthLength; day++) {
      if (!isDisabled({ year: month.year, month: month.month, day })) return day;
    }
    return 1;
  };
  const rovingDay =
    storedRovingDay === null ? fallbackRovingDay() : Math.min(storedRovingDay, monthLength);

  // PageUp/Down으로 달이 바뀌면 이전 셀이 unmount되며 포커스가 body로 떨어진다 —
  // 핸들러가 세운 플래그를 보고 같은 roving 일자 셀로 포커스를 복원한다.
  useEffect(() => {
    if (!pendingFocusRef.current) return;
    pendingFocusRef.current = false;
    dayRefs.current[rovingDay]?.focus?.();
  });

  const moveTo = (day: number): void => {
    setStoredRovingDay(day);
    dayRefs.current[day]?.focus?.();
  };

  const requestMonth = (amount: -1 | 1): void => {
    if (onMonthChange === undefined) return;
    // 연도 공간(1-9999)의 가장자리 달에선 무시한다 — addCalendarMonths가
    // throw하는 대신 PageUp/PageDown이 조용한 no-op이 된다.
    if (
      (amount === -1 && month.year === 1 && month.month === 1) ||
      (amount === 1 && month.year === 9999 && month.month === 12)
    ) {
      return;
    }
    // 현재 roving 일자를 고정해 새 달에서도 같은 일자(짧은 달은 클램프)로 복원한다.
    setStoredRovingDay(rovingDay);
    pendingFocusRef.current = true;
    onMonthChange(addCalendarMonths(month, amount));
  };

  const handleDayKeyDown = (day: number, event: WebKeyboardEvent): void => {
    const step = (amount: number): void => {
      const target = day + amount;
      // 표시된 달을 벗어나는 이동은 무시한다 — 달 이동은 PageUp/PageDown 몫.
      if (target >= 1 && target <= monthLength) moveTo(target);
    };
    switch (event.key) {
      case 'ArrowRight':
        event.preventDefault();
        step(1);
        break;
      case 'ArrowLeft':
        event.preventDefault();
        step(-1);
        break;
      case 'ArrowDown':
        event.preventDefault();
        step(7);
        break;
      case 'ArrowUp':
        event.preventDefault();
        step(-7);
        break;
      case 'Home':
      case 'End': {
        event.preventDefault();
        const week = grid.weeks.find((cells) =>
          cells.some((cell) => cell.inMonth && cell.date.day === day),
        );
        if (week === undefined) break;
        const inMonthDays = week.filter((cell) => cell.inMonth).map((cell) => cell.date.day);
        const target = event.key === 'Home' ? inMonthDays[0] : inMonthDays[inMonthDays.length - 1];
        if (target !== undefined) moveTo(target);
        break;
      }
      case 'PageUp':
        event.preventDefault();
        requestMonth(-1);
        break;
      case 'PageDown':
        event.preventDefault();
        requestMonth(1);
        break;
      case ' ':
      case 'Space':
      case 'Spacebar':
      case 'Enter': {
        event.preventDefault();
        const date = { year: month.year, month: month.month, day };
        if (!isDisabled(date)) onValueChange?.(date);
        break;
      }
    }
  };

  // ─── 셀 렌더 ────────────────────────────────────────────────────────────
  const renderCell = (cellDate: CalendarDate, inMonth: boolean): ReactElement => {
    const key = formatCellKey(cellDate);
    // 가장자리 달(1년 1월·9999년 12월)의 패딩 셀은 연도 공간 밖 날짜라 단언하는
    // 비교 함수에 넣을 수 없다 — in-month 셀은 항상 유효하다.
    const representable = inMonth || isValidCalendarDate(cellDate);
    const context: MonthCalendarDayContext = {
      date: cellDate,
      inMonth,
      today: representable && today !== undefined && isSameCalendarDate(cellDate, today),
      selected: representable && value != null && isSameCalendarDate(cellDate, value),
      disabled: !inMonth || isDisabled(cellDate),
    };
    const cellTestID = testID !== undefined ? `${testID}-day-${key}` : undefined;
    const content =
      renderDay !== undefined ? (
        renderDay(context)
      ) : inMonth ? (
        <RNText
          style={[
            roleTextStyle(theme, 'body'),
            styles.dayNumber,
            {
              color: context.selected
                ? theme.colors.primary
                : context.disabled
                  ? theme.colors.textSubtle
                  : theme.colors.text,
            },
          ]}
        >
          {String(cellDate.day)}
        </RNText>
      ) : null;
    const visualStyle = [
      styles.dayCell,
      context.selected ? { backgroundColor: theme.colors.primarySoft } : null,
      context.today ? { borderColor: theme.colors.primary } : null,
      context.disabled && inMonth ? { opacity: 0.5 } : null,
      dayStyle?.(context),
    ];

    if (!inMonth) {
      if (Platform.OS === 'web') {
        // 웹 패딩 셀은 gridcell로 트리에 남는다 — 셀 자체를 aria-hidden하면 SR
        // 테이블 탐색이 "노출된 셀 위치 = 열"로 계산해 첫/마지막 주의 요일 헤더
        // 매핑이 무너진다(APG date-picker·react-aria와 같은 선택). 대신 콘텐츠만
        // 숨겨 이름 없는 비활성 셀이 된다. 포커스·클릭·키보드는 없다.
        return (
          <View
            key={key}
            {...webProps({ role: 'gridcell', 'aria-disabled': true })}
            testID={cellTestID}
            style={visualStyle}
          >
            {content === null ? null : (
              <View aria-hidden style={styles.paddingCellContent}>
                {content}
              </View>
            )}
          </View>
        );
      }
      // 네이티브 패딩 셀 — 각 날짜가 독립 버튼이라 열 산술이 없고, 흐린 인접 달
      // 날짜는 소음이므로 접근성 트리에서 통째로 숨긴다.
      return (
        <View
          key={key}
          aria-hidden
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          testID={cellTestID}
          style={visualStyle}
        >
          {content}
        </View>
      );
    }

    const dayAccessibilityLabel = getDayAccessibilityLabel?.(context) ?? key;

    if (Platform.OS === 'web') {
      return (
        <View
          key={key}
          {...webProps({
            role: 'gridcell',
            'aria-label': dayAccessibilityLabel,
            ...(selectionExposed ? { 'aria-selected': context.selected } : {}),
            ...(context.disabled ? { 'aria-disabled': true } : {}),
            ...(context.today ? { 'aria-current': 'date' } : {}),
            ...(selectable
              ? {
                  onClick: () => {
                    if (!context.disabled) {
                      setStoredRovingDay(cellDate.day);
                      onValueChange?.(cellDate);
                    }
                  },
                  onKeyDown: (event: WebKeyboardEvent) =>
                    handleDayKeyDown(cellDate.day, event),
                }
              : {}),
          })}
          ref={(node) => {
            dayRefs.current[cellDate.day] = node as unknown as Focusable | null;
          }}
          {...(selectable
            ? { focusable: true, tabIndex: (cellDate.day === rovingDay ? 0 : -1) as 0 | -1 }
            : {})}
          testID={cellTestID}
          style={visualStyle}
        >
          {content}
        </View>
      );
    }

    if (!selectable) {
      // aria-*는 RN 코어가 네이티브 상태로도 매핑하는 이중 표기 관례(탭과 동일).
      return (
        <View
          key={key}
          accessible
          accessibilityLabel={dayAccessibilityLabel}
          aria-label={dayAccessibilityLabel}
          {...(selectionExposed ? { 'aria-selected': context.selected } : {})}
          {...(context.disabled ? { 'aria-disabled': true } : {})}
          {...(selectionExposed || context.disabled
            ? {
                accessibilityState: {
                  ...(selectionExposed ? { selected: context.selected } : {}),
                  ...(context.disabled ? { disabled: true } : {}),
                },
              }
            : {})}
          testID={cellTestID}
          style={visualStyle}
        >
          {content}
        </View>
      );
    }

    return (
      <Pressable
        key={key}
        accessibilityRole="button"
        accessibilityLabel={dayAccessibilityLabel}
        aria-label={dayAccessibilityLabel}
        accessibilityState={{ selected: context.selected, disabled: context.disabled }}
        aria-selected={context.selected}
        aria-disabled={context.disabled}
        disabled={context.disabled}
        onPress={() => onValueChange?.(cellDate)}
        testID={cellTestID}
        style={({ pressed }) => [
          ...visualStyle,
          pressed && !context.disabled ? { opacity: 0.82 } : null,
        ]}
      >
        {content}
      </Pressable>
    );
  };

  // weekdays는 항상 일요일 기준(0=일) — 표시 순서만 weekStartsOn에 맞춰 재배열한다.
  const orderedWeekdays = Array.from(
    { length: 7 },
    (_, column) => labels.weekdays[(column + weekStartsOn) % 7],
  );

  return (
    <View testID={testID} {...nativeWindProps(className)} style={[styles.root, style]}>
      <RNText style={[roleTextStyle(theme, 'title'), styles.title, titleStyle]}>
        {labels.monthTitle}
      </RNText>
      <View
        role="grid"
        accessibilityLabel={accessibilityLabel}
        {...webProps({ 'aria-label': accessibilityLabel })}
        style={{ gap: theme.spacing.xs }}
      >
        <View
          role="row"
          style={styles.headerRow}
          // 네이티브에선 각 날짜 버튼이 완전한 날짜 레이블을 갖고 있어 요일 헤더는
          // 소음이다 — 접근성 트리에서 숨긴다(웹 columnheader는 유지).
          {...(Platform.OS !== 'web'
            ? {
                'aria-hidden': true,
                accessibilityElementsHidden: true,
                importantForAccessibility: 'no-hide-descendants' as const,
              }
            : {})}
        >
          {orderedWeekdays.map((weekday, column) => (
            <View key={`weekday-${column}`} role="columnheader" style={styles.weekdayCell}>
              <RNText style={[roleTextStyle(theme, 'caption'), styles.weekday, weekdayStyle]}>
                {weekday}
              </RNText>
            </View>
          ))}
        </View>
        {grid.weeks.map((cells, weekIndex) => (
          <View key={`week-${weekIndex}`} role="row" style={styles.weekRow}>
            {cells.map((cell) => renderCell(cell.date, cell.inMonth))}
          </View>
        ))}
      </View>
    </View>
  );
}
