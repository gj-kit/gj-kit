/**
 * DateField — segmented keyboard date input, CalendarDate only.
 *
 * The public API never carries a JavaScript Date: a Date is an instant whose
 * civil reading shifts with the runtime time zone, while this field edits a
 * plain civil day. The commit contract is deliberately narrow:
 *
 * - Typing keeps a LOCAL draft per segment. Nothing is committed until the
 *   three segments are complete (year 4 digits, month/day 2 digits).
 * - The moment the drafts become complete, the field commits: month is clamped
 *   to 1-12, day to the real length of that month (Feb 31 → Feb 28/29), and
 *   the result to minDate/maxDate. `onValueChange` fires only when the result
 *   differs from `value`.
 * - Emptying all three segments commits null (when the value was not already
 *   null). A partially empty draft commits nothing.
 * - Blurring a segment zero-pads a single-digit month/day ("8" → "08"); a
 *   short year is NEVER padded or century-guessed — it stays an uncommitted
 *   draft. Blurring with complete drafts drops them, so the display snaps back
 *   to the controlled `value` (identical after an accepted commit).
 * - Web ArrowUp/ArrowDown steps the focused segment within its own range;
 *   an empty segment does not respond (the kit is clock-free, so there is no
 *   "today" to seed from), and an incomplete year draft ("26") is left
 *   untouched — stepping never pads or century-guesses a short year.
 */
import { useId, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { Platform, Text as RNText, TextInput, View } from 'react-native';
import type { StyleProp, TextStyle, ViewStyle } from 'react-native';
import type { Theme } from '../theme/tokens';
import type { CalendarDate } from '../dates/calendar';
import {
  clampCalendarDate,
  compareCalendarDates,
  daysInCalendarMonth,
  isSameCalendarDate,
  isValidCalendarDate,
} from '../dates/calendar';
import { nativeWindProps, themedStyles } from './internal';
import { useStrings, useTheme } from './provider';
import { roleTextStyle } from './text';

/** One editable segment of the field. */
export type DateFieldSegment = 'year' | 'month' | 'day';

/** Per-segment text overrides (labels or placeholders). */
export interface DateFieldSegmentText {
  readonly year?: string | undefined;
  readonly month?: string | undefined;
  readonly day?: string | undefined;
}

export interface DateFieldProps {
  /** The committed date, or null for empty. Controlled. */
  readonly value: CalendarDate | null;
  /** Receives the next committed date, or null when the field is emptied. */
  readonly onValueChange: (value: CalendarDate | null) => void;
  /** Display order of the segments — a permutation of year/month/day. Defaults to year, month, day. */
  readonly segmentOrder?: readonly DateFieldSegment[] | undefined;
  /** Committed results are clamped to this inclusive lower bound. */
  readonly minDate?: CalendarDate | undefined;
  /** Committed results are clamped to this inclusive upper bound. */
  readonly maxDate?: CalendarDate | undefined;
  readonly label?: string | undefined;
  /** When set, the borders and helper turn danger-toned; takes precedence over helperText. */
  readonly error?: string | undefined;
  readonly helperText?: string | undefined;
  readonly disabled?: boolean | undefined;
  /** Per-segment accessible names. Fall back to UiStrings dateFieldYear/dateFieldMonth/dateFieldDay. */
  readonly segmentLabels?: DateFieldSegmentText | undefined;
  /** Per-segment placeholders. No default — placeholder copy stays with the application. */
  readonly segmentPlaceholders?: DateFieldSegmentText | undefined;
  /** FormField-compatible wiring — applied to the group container. */
  readonly nativeID?: string | undefined;
  readonly accessibilityLabel?: string | undefined;
  readonly accessibilityLabelledBy?: string | undefined;
  readonly accessibilityHint?: string | undefined;
  /** RN Web-only relationship overrides, same contract as TextField. */
  readonly 'aria-labelledby'?: string | undefined;
  readonly 'aria-describedby'?: string | undefined;
  readonly 'aria-errormessage'?: string | undefined;
  readonly 'aria-invalid'?: boolean | undefined;
  readonly 'aria-required'?: boolean | undefined;
  readonly style?: StyleProp<ViewStyle> | undefined;
  readonly className?: string | undefined;
  readonly labelStyle?: StyleProp<TextStyle> | undefined;
  readonly helperStyle?: StyleProp<TextStyle> | undefined;
  /** Applied to every segment input after the built-in box styles. */
  readonly segmentStyle?: StyleProp<TextStyle> | undefined;
  readonly testID?: string | undefined;
  readonly unstyled?: never;
}

type Drafts = { readonly year: string; readonly month: string; readonly day: string };

const SEGMENT_LENGTH: Record<DateFieldSegment, number> = { year: 4, month: 2, day: 2 };
/** A first digit above the threshold cannot start a longer valid value — it completes as 0X. */
const EARLY_COMPLETE_THRESHOLD: Record<'month' | 'day', number> = { month: 1, day: 3 };
const MIN_YEAR = 1;
const MAX_YEAR = 9999;
/** Day clamp used while the year/month segments are still unknown. */
const MAX_DAY_ANY_MONTH = 31;

const DEFAULT_SEGMENT_ORDER: readonly DateFieldSegment[] = ['year', 'month', 'day'];

/** RNW delivers the DOM keydown through onKeyPress; native puts the key on nativeEvent. */
type SegmentKeyEvent = {
  readonly key?: string | undefined;
  readonly nativeEvent?: unknown;
  preventDefault?: (() => void) | undefined;
};

function eventKey(event: SegmentKeyEvent): string | undefined {
  if (typeof event.key === 'string') return event.key;
  const nested = event.nativeEvent as { key?: unknown } | undefined;
  return typeof nested?.key === 'string' ? nested.key : undefined;
}

function webProps(values: Record<string, unknown>): Record<string, unknown> {
  return Platform.OS === 'web' ? values : {};
}

function sanitizeId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, '');
}

function combineIdRefs(...values: Array<string | undefined>): string | undefined {
  const combined = values.filter((value): value is string => Boolean(value)).join(' ');
  return combined || undefined;
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function pad(value: number, length: number): string {
  return String(value).padStart(length, '0');
}

function draftsFromValue(value: CalendarDate | null): Drafts {
  if (value === null) return { year: '', month: '', day: '' };
  return { year: pad(value.year, 4), month: pad(value.month, 2), day: pad(value.day, 2) };
}

function sameValue(a: CalendarDate | null, b: CalendarDate | null): boolean {
  if (a === null || b === null) return a === b;
  return isSameCalendarDate(a, b);
}

function assertProps(props: DateFieldProps, order: readonly DateFieldSegment[]): void {
  if (props.value !== null && !isValidCalendarDate(props.value)) {
    throw new Error('DateField value must be null or a valid CalendarDate.');
  }
  const segments: readonly DateFieldSegment[] = ['year', 'month', 'day'];
  if (
    order.length !== 3 ||
    segments.some((segment) => order.filter((entry) => entry === segment).length !== 1)
  ) {
    throw new Error('DateField segmentOrder must contain year, month, and day exactly once.');
  }
  for (const [name, date] of [
    ['minDate', props.minDate],
    ['maxDate', props.maxDate],
  ] as const) {
    if (date !== undefined && !isValidCalendarDate(date)) {
      throw new Error(`DateField ${name} must be a valid CalendarDate.`);
    }
  }
  if (
    props.minDate !== undefined &&
    props.maxDate !== undefined &&
    compareCalendarDates(props.minDate, props.maxDate) === 1
  ) {
    throw new Error('DateField minDate must not be later than maxDate.');
  }
}

const getStyles = themedStyles((theme: Theme) => ({
  root: { gap: theme.spacing.sm },
  segmentRow: {
    alignItems: 'center' as const,
    flexDirection: 'row' as const,
    gap: theme.spacing.sm,
  },
  segment: {
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    minHeight: theme.metrics.input,
    paddingHorizontal: theme.spacing.sm,
    textAlign: 'center' as const,
  },
}));

type FocusableInput = { focus?: () => void };

export function DateField(props: DateFieldProps): ReactElement {
  const {
    value,
    onValueChange,
    segmentOrder = DEFAULT_SEGMENT_ORDER,
    minDate,
    maxDate,
    label,
    error,
    helperText,
    disabled = false,
    segmentLabels,
    segmentPlaceholders,
    nativeID,
    accessibilityLabel,
    accessibilityLabelledBy,
    accessibilityHint,
    'aria-labelledby': ariaLabelledBy,
    'aria-describedby': ariaDescribedBy,
    'aria-errormessage': ariaErrorMessage,
    'aria-invalid': ariaInvalid,
    'aria-required': ariaRequired,
    style,
    className,
    labelStyle,
    helperStyle,
    segmentStyle,
    testID,
  } = props;
  assertProps(props, segmentOrder);
  const theme = useTheme();
  const strings = useStrings();
  const styles = getStyles(theme);
  const reactId = sanitizeId(useId());
  const baseId = `gj-date-field-${reactId}`;
  const groupId = nativeID ?? `${baseId}-group`;
  const labelId = `${baseId}-label`;
  const helperId = `${baseId}-helper`;
  const errorId = `${baseId}-error`;

  const [drafts, setDraftsState] = useState<Drafts | null>(null);
  // 자동 전진이 일으키는 동기 blur가 stale closure를 보지 않도록 ref를 병행 유지한다
  // (focus 이동 → 이전 세그먼트 blur가 같은 이벤트 안에서 리렌더 전에 실행된다).
  const draftsRef = useRef<Drafts | null>(drafts);
  const setDrafts = (next: Drafts | null): void => {
    draftsRef.current = next;
    setDraftsState(next);
  };
  // 부모가 value를 바꾸면(커밋 반영 포함) 로컬 draft를 버린다 — 렌더 중 파생 상태 조정 패턴.
  const prevValueRef = useRef<CalendarDate | null>(value);
  if (!sameValue(prevValueRef.current, value)) {
    prevValueRef.current = value;
    if (drafts !== null) setDrafts(null);
  }
  const texts: Drafts = drafts ?? draftsFromValue(value);
  /** The segment texts as the event handlers must see them — ref first, then the controlled value. */
  const currentTexts = (): Drafts => draftsRef.current ?? draftsFromValue(value);
  const inputRefs = useRef<Record<DateFieldSegment, FocusableInput | null>>({
    year: null,
    month: null,
    day: null,
  });

  const hasError = error !== undefined;
  const supportText = error ?? helperText;
  const supportId = hasError ? errorId : helperText !== undefined ? helperId : undefined;
  const invalid = hasError || ariaInvalid === true;
  const describedBy = combineIdRefs(ariaDescribedBy, supportId);
  const resolvedAriaLabelledBy = ariaLabelledBy ?? (label !== undefined ? labelId : undefined);
  const resolvedAriaErrorMessage = ariaErrorMessage ?? (hasError ? errorId : undefined);

  const segmentName = (segment: DateFieldSegment): string => {
    const override = segmentLabels?.[segment];
    if (override !== undefined) return override;
    if (segment === 'year') return strings.dateFieldYear;
    if (segment === 'month') return strings.dateFieldMonth;
    return strings.dateFieldDay;
  };

  const commitIfComplete = (next: Drafts): void => {
    if (next.year === '' && next.month === '' && next.day === '') {
      if (value !== null) onValueChange(null);
      return;
    }
    if (next.year.length !== 4 || next.month.length !== 2 || next.day.length !== 2) return;
    const year = clampNumber(Number(next.year), MIN_YEAR, MAX_YEAR);
    const month = clampNumber(Number(next.month), 1, 12);
    const day = clampNumber(Number(next.day), 1, daysInCalendarMonth(year, month));
    const result = clampCalendarDate({ year, month, day }, minDate, maxDate);
    if (value === null || !isSameCalendarDate(value, result)) onValueChange(result);
  };

  const focusNeighbor = (segment: DateFieldSegment, direction: 1 | -1): void => {
    const position = segmentOrder.indexOf(segment);
    const neighbor = segmentOrder[position + direction];
    if (neighbor !== undefined) inputRefs.current[neighbor]?.focus?.();
  };

  const handleChangeText = (segment: DateFieldSegment, raw: string): void => {
    const digits = raw.replace(/\D/g, '').slice(0, SEGMENT_LENGTH[segment]);
    let nextText = digits;
    let advance = digits.length === SEGMENT_LENGTH[segment];
    if (segment !== 'year' && digits.length === 1) {
      // 더 긴 유효값으로 이어질 수 없는 첫 자리는 0을 붙여 즉시 완성한다(월 2-9, 일 4-9).
      if (Number(digits) > EARLY_COMPLETE_THRESHOLD[segment]) {
        nextText = `0${digits}`;
        advance = true;
      }
    }
    const next: Drafts = { ...currentTexts(), [segment]: nextText };
    setDrafts(next);
    commitIfComplete(next);
    if (advance) focusNeighbor(segment, 1);
  };

  const handleBlur = (segment: DateFieldSegment): void => {
    const current = draftsRef.current;
    if (current === null) return;
    let text = current[segment];
    // 한 자리 월·일은 의도가 명확하므로 0을 채운다. 연도는 세기 추측을 하지 않는다.
    if (segment !== 'year' && text.length === 1) text = `0${text}`;
    const next: Drafts = { ...current, [segment]: text };
    const complete = next.year.length === 4 && next.month.length === 2 && next.day.length === 2;
    commitIfComplete(next);
    // 완성된 draft는 버려서 표시를 controlled value로 되돌린다(수락됐다면 동일 표시).
    setDrafts(complete ? null : next);
  };

  /** The day segment's real ceiling: the month length when year+month drafts are known, 31 otherwise. */
  const dayCeiling = (current: Drafts): number => {
    const yearNumber = current.year.length === 4 ? Number(current.year) : undefined;
    const monthNumber =
      current.month.length > 0 ? clampNumber(Number(current.month), 1, 12) : undefined;
    return yearNumber !== undefined && monthNumber !== undefined
      ? daysInCalendarMonth(yearNumber, monthNumber)
      : MAX_DAY_ANY_MONTH;
  };

  const stepSegment = (segment: DateFieldSegment, direction: 1 | -1): void => {
    const texts = currentTexts();
    const current = texts[segment];
    // clock-free — 완전히 빈 세그먼트는 시드할 "오늘"이 없으므로 반응하지 않는다.
    if (current === '') return;
    // 짧은 연도 draft는 미커밋 상태를 유지해야 한다 — 4자리로 pad하면 "26"이
    // 0027로 완성·커밋되어 blur가 지키는 세기-추측-금지 계약을 화살표가 깬다.
    if (segment === 'year' && current.length < SEGMENT_LENGTH.year) return;
    const max = segment === 'year' ? MAX_YEAR : segment === 'month' ? 12 : dayCeiling(texts);
    const nextNumber = clampNumber(Number(current) + direction, 1, max);
    const next: Drafts = { ...texts, [segment]: pad(nextNumber, SEGMENT_LENGTH[segment]) };
    setDrafts(next);
    commitIfComplete(next);
  };

  // 웹 키다운(RNW onKeyPress)과 네이티브 onKeyPress를 하나의 핸들러로 받는다 —
  // 화살표는 키를 전달하는 플랫폼(웹·하드웨어 키보드)에서만 도착한다.
  const handleKeyPress = (segment: DateFieldSegment, event: SegmentKeyEvent): void => {
    if (disabled) return;
    switch (eventKey(event)) {
      case 'ArrowUp':
        event.preventDefault?.();
        stepSegment(segment, 1);
        break;
      case 'ArrowDown':
        event.preventDefault?.();
        stepSegment(segment, -1);
        break;
      case 'Backspace':
        if (currentTexts()[segment] === '') {
          event.preventDefault?.();
          focusNeighbor(segment, -1);
        }
        break;
    }
  };

  return (
    <View
      nativeID={groupId}
      testID={testID}
      {...nativeWindProps(className)}
      {...webProps({
        role: 'group',
        ...(resolvedAriaLabelledBy !== undefined
          ? { 'aria-labelledby': resolvedAriaLabelledBy }
          : accessibilityLabel !== undefined
            ? { 'aria-label': accessibilityLabel }
            : {}),
        ...(describedBy !== undefined ? { 'aria-describedby': describedBy } : {}),
        // aria-errormessage는 그룹에 싣지 않는다 — aria-invalid=true가 아닌
        // 요소의 errormessage는 UA가 무시해야 하고 role="group"은 aria-invalid를
        // 지원하지 않는다. 오류 연결은 각 세그먼트(spinbutton)가 나른다.
        ...(ariaRequired !== undefined ? { 'aria-required': ariaRequired } : {}),
      })}
      style={[styles.root, style]}
    >
      {label !== undefined ? (
        <RNText
          nativeID={labelId}
          style={[roleTextStyle(theme, 'label'), { color: theme.colors.text }, labelStyle]}
        >
          {label}
        </RNText>
      ) : null}
      <View style={styles.segmentRow}>
        {segmentOrder.map((segment) => {
          const text = texts[segment];
          const name = segmentName(segment);
          const numeric = text === '' ? undefined : Number(text);
          return (
            <TextInput
              key={segment}
              ref={(node) => {
                inputRefs.current[segment] = node as unknown as FocusableInput | null;
              }}
              value={text}
              onChangeText={(raw) => handleChangeText(segment, raw)}
              onBlur={() => handleBlur(segment)}
              onKeyPress={(event) =>
                handleKeyPress(segment, event as unknown as SegmentKeyEvent)
              }
              {...webProps({
                role: 'spinbutton',
                'aria-label': name,
                'aria-valuemin': segment === 'year' ? MIN_YEAR : 1,
                // 일 상한은 스텝 로직과 같은 규칙으로 계산한다 — 4월에 31을
                // 안내하면 SR 사용자에게 도달 불가능한 최대값을 말하는 셈이다.
                'aria-valuemax':
                  segment === 'year' ? MAX_YEAR : segment === 'month' ? 12 : dayCeiling(texts),
                ...(numeric !== undefined
                  ? { 'aria-valuenow': numeric, 'aria-valuetext': text }
                  : {}),
                // helper/error 연결은 TextField처럼 실제 포커스 대상(세그먼트)에 싣는다 —
                // aria-errormessage는 aria-invalid=true인 요소에서만 유효하다.
                ...(describedBy !== undefined ? { 'aria-describedby': describedBy } : {}),
                ...(resolvedAriaErrorMessage !== undefined
                  ? { 'aria-errormessage': resolvedAriaErrorMessage }
                  : {}),
                'aria-invalid': invalid,
                'aria-disabled': disabled,
              })}
              accessibilityLabel={
                accessibilityLabel !== undefined
                  ? `${accessibilityLabel}, ${name}`
                  : label !== undefined
                    ? `${label}, ${name}`
                    : name
              }
              accessibilityLabelledBy={accessibilityLabelledBy}
              accessibilityHint={accessibilityHint ?? supportText}
              accessibilityState={disabled ? { disabled: true } : undefined}
              editable={!disabled}
              keyboardType="number-pad"
              inputMode="numeric"
              maxLength={SEGMENT_LENGTH[segment]}
              selectTextOnFocus
              placeholder={segmentPlaceholders?.[segment]}
              placeholderTextColor={theme.colors.textSubtle}
              testID={testID !== undefined ? `${testID}-${segment}` : undefined}
              style={[
                styles.segment,
                roleTextStyle(theme, 'body'),
                {
                  backgroundColor: theme.colors.surface,
                  borderColor: hasError ? theme.colors.danger : theme.colors.textSubtle,
                  color: theme.colors.text,
                  minWidth:
                    segment === 'year' ? theme.metrics.control.lg : theme.metrics.control.md,
                  ...(disabled ? { opacity: 0.5 } : {}),
                },
                segmentStyle,
              ]}
            />
          );
        })}
      </View>
      {supportText !== undefined ? (
        <RNText
          nativeID={supportId}
          accessibilityLiveRegion={hasError ? 'polite' : undefined}
          style={[
            roleTextStyle(theme, 'caption'),
            { color: hasError ? theme.colors.danger : theme.colors.textMuted },
            helperStyle,
          ]}
        >
          {supportText}
        </RNText>
      ) : null}
    </View>
  );
}
