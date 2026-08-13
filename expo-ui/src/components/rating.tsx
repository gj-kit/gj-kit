/**
 * Rating — controlled dot rating input and read-only display.
 *
 * The same component serves compact record metadata and a touch-friendly editor.
 * It intentionally owns neither haptics nor an icon dependency: consumers can add
 * those concerns around `onChange` without making this primitive platform-specific.
 */
import type { ReactElement } from 'react';
import { Platform, Pressable, View } from 'react-native';
import type { AccessibilityActionEvent } from 'react-native';
import type { Theme } from '../theme/tokens';
import { nativeWindProps, themedStyles } from './internal';
import type { CommonProps } from './internal';
import { useStrings, useTheme } from './provider';

export type RatingSize = 'sm' | 'md' | 'lg';

type RatingBaseProps = Omit<CommonProps, 'unstyled'> & {
  /** Current rating. `undefined` is the only empty value. */
  value: number | undefined;
  /** The item being rated. A visible label can live outside the component. */
  accessibilityLabel: string;
  /** Number of dots. Must be a safe integer from 1 through 10. Default 5. */
  maxRating?: number | undefined;
  /** Visual dot size. Default 'md'. The interactive hit targets remain touch-friendly. */
  size?: RatingSize | undefined;
  /** Enables .5 values and splits every dot into left/right touch targets. */
  halfStep?: boolean | undefined;
  /** Optional localized value announcement. */
  valueText?: ((value: number | undefined, maxRating: number) => string) | undefined;
  unstyled?: never;
};

export interface InteractiveRatingProps extends RatingBaseProps {
  /** Calls with the next selected rating, or `undefined` when a selection is cleared. */
  onChange: (value: number | undefined) => void;
  /** A second activation of the selected dot clears it. Default false. */
  clearable?: boolean | undefined;
  /** Disables pointer, keyboard and native accessibility actions. */
  disabled?: boolean | undefined;
  /** Optional localized name for the screen-reader clear action. */
  clearAccessibilityLabel?: string | undefined;
  /** Interactive is the default branch. */
  readonly?: false | undefined;
}

export interface ReadonlyRatingProps extends RatingBaseProps {
  /** Renders a non-interactive image-like rating announcement. */
  readonly: true;
  onChange?: never;
  clearable?: never;
  disabled?: never;
  clearAccessibilityLabel?: never;
}

export type RatingProps = InteractiveRatingProps | ReadonlyRatingProps;

type WebKeyboardEvent = { readonly key: string; preventDefault: () => void };

const DEFAULT_MAX_RATING = 5;
// A Rating renders one visual item (or two hit targets) per point. Keep this
// primitive deliberately bounded; larger ordinal scales belong to Slider or a
// numeric field, not an unvirtualized row of controls.
const MAX_RATING = 10;

const getStyles = themedStyles((theme: Theme) => ({
  root: {
    alignItems: 'center' as const,
    flexDirection: 'row' as const,
    gap: theme.spacing.xs,
  },
  interactiveItem: {
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    minHeight: theme.metrics.control.sm,
    minWidth: theme.metrics.control.sm,
    position: 'relative' as const,
  },
  readOnlyItem: {
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  mark: {
    flexDirection: 'row' as const,
    overflow: 'hidden' as const,
  },
  markHalf: {
    flex: 1,
  },
  targets: {
    bottom: 0,
    flexDirection: 'row' as const,
    left: 0,
    position: 'absolute' as const,
    right: 0,
    top: 0,
  },
  target: {
    flex: 1,
  },
}));

function stepFor(halfStep: boolean): number {
  return halfStep ? 0.5 : 1;
}

function isAligned(value: number, step: number): boolean {
  const quotient = value / step;
  return Math.abs(quotient - Math.round(quotient)) <= Number.EPSILON * Math.max(1, Math.abs(quotient)) * 16;
}

function assertNonBlankString(value: unknown, name: string): asserts value is string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${name} must be a non-empty string.`);
  }
}

function assertConfiguration(
  value: number | undefined,
  maxRating: number,
  step: number,
  accessibilityLabel: string,
): void {
  if (!Number.isSafeInteger(maxRating) || maxRating < 1 || maxRating > MAX_RATING) {
    throw new Error(`Rating maxRating must be a safe integer from 1 to ${MAX_RATING}.`);
  }
  assertNonBlankString(accessibilityLabel, 'Rating accessibilityLabel');
  if (value === undefined) return;
  if (!Number.isFinite(value) || value < step || value > maxRating) {
    throw new Error('Rating value must be within the selectable rating range.');
  }
  if (!isAligned(value, step)) {
    throw new Error('Rating value must align to the configured step.');
  }
}

type RatingAccessibilityValue = {
  readonly min: number;
  readonly max: number;
  readonly now?: number | undefined;
  readonly text: string;
};

/**
 * (internal) Android exposes adjustable range values as integers. A half-step
 * Rating therefore reports an integer-scaled native range while keeping its
 * spoken text in the product's original scale. Web ARIA keeps the real value.
 */
export function getRatingAccessibilityValue({
  value,
  maxRating,
  halfStep,
  clearable,
  valueText,
  platformOS,
}: {
  readonly value: number | undefined;
  readonly maxRating: number;
  readonly halfStep: boolean;
  readonly clearable: boolean;
  readonly valueText: string;
  readonly platformOS: string;
}): RatingAccessibilityValue {
  const scale = platformOS !== 'web' && halfStep ? 2 : 1;
  const minimum = clearable ? 0 : stepFor(halfStep);
  return {
    min: minimum * scale,
    max: maxRating * scale,
    ...(value === undefined ? {} : { now: value * scale }),
    text: valueText,
  };
}

function markSize(theme: Theme, size: RatingSize): number {
  return {
    sm: theme.typography.caption.fontSize,
    md: theme.typography.button.fontSize,
    lg: theme.typography.title.fontSize,
  }[size];
}

/**
 * Controlled dot rating. Interactive mode requires `onChange`; `readonly` mode
 * has no controls and is announced as a single image. Values are 1..maxRating,
 * or .5 increments when `halfStep` is enabled; use `undefined` for no rating.
 * maxRating is bounded to 10 to keep the visual control and its hit targets safe.
 */
export function Rating(props: RatingProps): ReactElement {
  const theme = useTheme();
  const strings = useStrings();
  const styles = getStyles(theme);
  const maxRating = props.maxRating ?? DEFAULT_MAX_RATING;
  const halfStep = props.halfStep === true;
  const step = stepFor(halfStep);
  const size = props.size ?? 'md';
  const value = props.value;
  const dotSize = markSize(theme, size);
  assertConfiguration(value, maxRating, step, props.accessibilityLabel);
  const valueText = props.valueText?.(value, maxRating) ?? (
    value === undefined
      ? strings.ratingNoValue
      : strings.ratingValue(value, maxRating)
  );
  assertNonBlankString(valueText, 'Rating valueText');

  const marks = Array.from({ length: maxRating }, (_, index) => {
    const rating = index + 1;
    const full = value !== undefined && value >= rating;
    const half = halfStep && !full && value === rating - 0.5;
    return { rating, full, half };
  });

  if (props.readonly === true) {
    return (
      <View
        accessible
        accessibilityRole="image"
        role="img"
        accessibilityLabel={`${props.accessibilityLabel}: ${valueText}`}
        aria-label={`${props.accessibilityLabel}: ${valueText}`}
        testID={props.testID}
        {...nativeWindProps(props.className)}
        style={[styles.root, props.style]}
      >
        {marks.map(({ rating, full, half }) => (
          <View
            key={rating}
            accessible={false}
            aria-hidden
            importantForAccessibility="no-hide-descendants"
            style={styles.readOnlyItem}
          >
            <View
              accessible={false}
              aria-hidden
              testID={props.testID === undefined ? undefined : `${props.testID}-mark-${rating}`}
              style={[
                styles.mark,
                {
                  backgroundColor: theme.colors.line,
                  borderRadius: theme.radius.pill,
                  height: dotSize,
                  width: dotSize,
                },
              ]}
            >
              <View
                style={[styles.markHalf, { backgroundColor: full || half ? theme.colors.primary : theme.colors.line }]}
              />
              <View style={[styles.markHalf, { backgroundColor: full ? theme.colors.primary : theme.colors.line }]} />
            </View>
          </View>
        ))}
      </View>
    );
  }

  const disabled = props.disabled === true;
  const clearable = props.clearable === true;
  const onChange = props.onChange;
  const clearAccessibilityLabel = props.clearAccessibilityLabel ?? strings.clearRating;
  if (clearable) assertNonBlankString(clearAccessibilityLabel, 'Rating clearAccessibilityLabel');

  function emit(next: number | undefined): void {
    if (next === value) return;
    onChange(next);
  }

  function select(target: number): void {
    if (disabled) return;
    emit(clearable && value === target ? undefined : target);
  }

  function clear(): void {
    if (disabled || !clearable || value === undefined) return;
    emit(undefined);
  }

  function moveBy(delta: number): void {
    if (disabled) return;
    const current = value ?? 0;
    if (delta < 0 && current <= step) {
      clear();
      return;
    }
    const next = Math.min(maxRating, Math.max(step, current + delta));
    emit(next);
  }

  function moveToBoundary(boundary: 'min' | 'max'): void {
    if (disabled) return;
    if (boundary === 'min' && clearable) {
      clear();
      return;
    }
    emit(boundary === 'min' ? step : maxRating);
  }

  function onAccessibilityAction(event: AccessibilityActionEvent): void {
    const action = event.nativeEvent.actionName;
    if (action === 'increment') moveBy(step);
    if (action === 'decrement') moveBy(-step);
    if (action === 'clear') clear();
  }

  function onWebKeyDown(event: WebKeyboardEvent): void {
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowUp':
        event.preventDefault();
        moveBy(step);
        return;
      case 'ArrowLeft':
      case 'ArrowDown':
        event.preventDefault();
        moveBy(-step);
        return;
      case 'Home':
        event.preventDefault();
        moveToBoundary('min');
        return;
      case 'End':
        event.preventDefault();
        moveToBoundary('max');
        return;
      case 'Backspace':
      case 'Delete':
        if (clearable) {
          event.preventDefault();
          clear();
        }
        return;
      default:
        return;
    }
  }

  const accessibilityValue = getRatingAccessibilityValue({
    value,
    maxRating,
    halfStep,
    clearable,
    valueText,
    platformOS: Platform.OS,
  });
  const accessibilityActions = disabled
    ? []
    : [
        { name: 'increment' },
        { name: 'decrement' },
        ...(clearable && value !== undefined
          ? [{ name: 'clear', label: clearAccessibilityLabel }]
          : []),
      ];

  return (
    <View
      accessible
      accessibilityRole="adjustable"
      role="slider"
      accessibilityLabel={props.accessibilityLabel}
      aria-label={props.accessibilityLabel}
      accessibilityState={{ disabled }}
      accessibilityValue={accessibilityValue}
      accessibilityActions={accessibilityActions}
      onAccessibilityAction={onAccessibilityAction}
      focusable={!disabled}
      tabIndex={disabled ? -1 : 0}
      testID={props.testID}
      {...(Platform.OS === 'web'
        ? ({
            onKeyDown: onWebKeyDown,
            'aria-disabled': disabled,
            'aria-valuemin': accessibilityValue.min,
            'aria-valuemax': accessibilityValue.max,
            ...(accessibilityValue.now === undefined ? {} : { 'aria-valuenow': accessibilityValue.now }),
            'aria-valuetext': valueText,
          } as unknown as Record<string, unknown>)
        : {})}
      {...nativeWindProps(props.className)}
      style={[styles.root, { opacity: disabled ? 0.5 : 1 }, props.style]}
    >
      {marks.map(({ rating, full, half }) => (
        <View
          key={rating}
          accessible={false}
          aria-hidden
          importantForAccessibility="no-hide-descendants"
          style={styles.interactiveItem}
        >
          <View
            accessible={false}
            aria-hidden
            testID={props.testID === undefined ? undefined : `${props.testID}-mark-${rating}`}
            style={[
              styles.mark,
              {
                backgroundColor: theme.colors.line,
                borderRadius: theme.radius.pill,
                height: dotSize,
                width: dotSize,
              },
            ]}
          >
            <View
              style={[styles.markHalf, { backgroundColor: full || half ? theme.colors.primary : theme.colors.line }]}
            />
            <View style={[styles.markHalf, { backgroundColor: full ? theme.colors.primary : theme.colors.line }]} />
          </View>
          <View
            accessible={false}
            aria-hidden
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={styles.targets}
          >
            {halfStep ? (
              <>
                <Pressable
                  accessible={false}
                  aria-hidden
                  disabled={disabled}
                  hitSlop={theme.spacing.xs}
                  onPress={() => select(rating - 0.5)}
                  testID={props.testID === undefined ? undefined : `${props.testID}-item-${rating}-half`}
                  style={styles.target}
                />
                <Pressable
                  accessible={false}
                  aria-hidden
                  disabled={disabled}
                  hitSlop={theme.spacing.xs}
                  onPress={() => select(rating)}
                  testID={props.testID === undefined ? undefined : `${props.testID}-item-${rating}-full`}
                  style={styles.target}
                />
              </>
            ) : (
              <Pressable
                accessible={false}
                aria-hidden
                disabled={disabled}
                hitSlop={theme.spacing.xs}
                onPress={() => select(rating)}
                testID={props.testID === undefined ? undefined : `${props.testID}-item-${rating}`}
                style={styles.target}
              />
            )}
          </View>
        </View>
      ))}
    </View>
  );
}
