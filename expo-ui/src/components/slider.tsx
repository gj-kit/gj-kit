/**
 * Slider — controlled single/range numeric input for Expo, React Native and web.
 *
 * The public API intentionally starts with a horizontal, fully-controlled contract.
 * It avoids depending on a native slider, gesture library, or DOM-only positioning
 * engine while still exposing the platform accessibility model (`adjustable` /
 * `slider`) and a 44px thumb target.
 */
import { useRef } from 'react';
import type { ReactElement } from 'react';
import { PanResponder, Platform, StyleSheet, View } from 'react-native';
import type {
  AccessibilityActionEvent,
  LayoutChangeEvent,
  StyleProp,
  ViewStyle,
} from 'react-native';
import type { Theme } from '../theme/tokens';
import { nativeWindProps, themedStyles } from './internal';
import type { CommonProps } from './internal';
import { useTheme } from './provider';

export type SliderDirection = 'ltr' | 'rtl';

export interface SliderSharedProps extends CommonProps {
  /** Inclusive lower bound. Default 0. */
  min?: number | undefined;
  /** Inclusive upper bound. Default 100. */
  max?: number | undefined;
  /** Smallest interactive increment. Default 1. */
  step?: number | undefined;
  /** Disables pointer, keyboard and native accessibility actions. */
  disabled?: boolean | undefined;
  /** Horizontal coordinate and left/right arrow meaning. Default ltr. */
  direction?: SliderDirection | undefined;
  /** Optional localized text for each thumb's accessibility value. */
  valueText?: ((value: number) => string) | undefined;
  /** Root style escape hatch. */
  style?: StyleProp<ViewStyle> | undefined;
  /** Track-only style escape hatch. */
  trackStyle?: StyleProp<ViewStyle> | undefined;
  trackClassName?: string | undefined;
  /** Active range-only style escape hatch. */
  rangeStyle?: StyleProp<ViewStyle> | undefined;
  rangeClassName?: string | undefined;
  /** Applied to every thumb hit target. */
  thumbStyle?: StyleProp<ViewStyle> | undefined;
  thumbClassName?: string | undefined;
}

export interface SingleSliderProps extends SliderSharedProps {
  mode?: 'single' | undefined;
  value: number;
  onValueChange: (value: number) => void;
  /** Fires exactly once at the end of a committed pointer or keyboard interaction. */
  onValueCommit?: ((value: number) => void) | undefined;
  /** A visible label is not owned by Slider, so the thumb always needs a name. */
  accessibilityLabel: string;
  accessibilityLabels?: never;
  minDistance?: never;
}

export interface RangeSliderProps extends SliderSharedProps {
  mode: 'range';
  value: readonly [number, number];
  onValueChange: (value: readonly [number, number]) => void;
  onValueCommit?: ((value: readonly [number, number]) => void) | undefined;
  /** Lower and upper thumb names are deliberately separate for screen readers. */
  accessibilityLabels: readonly [string, string];
  accessibilityLabel?: never;
  /** Minimum numeric distance between lower and upper values. Default 0. */
  minDistance?: number | undefined;
}

export type SliderProps = SingleSliderProps | RangeSliderProps;

type SliderValues = readonly [number] | readonly [number, number];
type WebKeyboardEvent = { readonly key: string; preventDefault: () => void };
type NativePointerEvent = {
  readonly clientX?: number;
  readonly nativeEvent?: { readonly clientX?: number; readonly pageX?: number };
};
type RootMeasureRef = {
  measure?: (
    callback: (
      x: number,
      y: number,
      width: number,
      height: number,
      pageX: number,
      pageY: number,
    ) => void,
  ) => void;
};
type NativeInteraction = {
  readonly generation: number;
  readonly startPageX: number;
  latestPageX: number;
  started: boolean;
  released: boolean;
};

const DEFAULT_MIN = 0;
const DEFAULT_MAX = 100;
const DEFAULT_STEP = 1;

const getStyles = themedStyles((theme: Theme) => ({
  root: {
    justifyContent: 'center' as const,
    minHeight: theme.metrics.control.md,
    position: 'relative' as const,
    width: '100%' as const,
  },
  track: {
    borderRadius: theme.radius.pill,
    height: theme.spacing.xs,
    overflow: 'hidden' as const,
    position: 'relative' as const,
    width: '100%' as const,
  },
  range: {
    bottom: 0,
    position: 'absolute' as const,
    top: 0,
  },
  thumb: {
    alignItems: 'center' as const,
    borderRadius: theme.radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center' as const,
    position: 'absolute' as const,
    top: 0,
  },
  thumbVisual: {
    borderRadius: theme.radius.pill,
  },
}));

function assertFinite(value: number, name: string): void {
  if (!Number.isFinite(value)) throw new Error(`Slider ${name} must be a finite number.`);
}

function isNearlyInteger(value: number): boolean {
  return Math.abs(value - Math.round(value)) <= Number.EPSILON * Math.max(1, Math.abs(value)) * 16;
}

function assertConfiguration(
  props: SliderProps,
  min: number,
  max: number,
  step: number,
): void {
  assertFinite(min, 'min');
  assertFinite(max, 'max');
  assertFinite(step, 'step');
  if (!(min < max)) throw new Error('Slider min must be less than max.');
  if (!(step > 0)) throw new Error('Slider step must be greater than 0.');
  if (!isNearlyInteger((max - min) / step)) {
    throw new Error('Slider max must align to the step grid from min.');
  }

  const assertStepValue = (value: number, name: string): void => {
    if (Math.abs(snap(value, min, max, step) - value) > Number.EPSILON * Math.max(1, Math.abs(value)) * 16) {
      throw new Error(`Slider ${name} must align to the step grid.`);
    }
  };

  if (props.mode === 'range') {
    const [lower, upper] = props.value as readonly number[];
    assertFinite(lower ?? Number.NaN, 'range lower value');
    assertFinite(upper ?? Number.NaN, 'range upper value');
    if (props.value.length !== 2) throw new Error('Slider range value must contain exactly two values.');
    if (lower! < min || lower! > max || upper! < min || upper! > max) {
      throw new Error('Slider range values must be within min and max.');
    }
    if (lower! > upper!) throw new Error('Slider range lower value must not exceed upper value.');
    assertStepValue(lower!, 'range lower value');
    assertStepValue(upper!, 'range upper value');
    const distance = props.minDistance ?? 0;
    assertFinite(distance, 'minDistance');
    if (distance < 0 || distance > max - min) {
      throw new Error('Slider minDistance must be between 0 and max - min.');
    }
    if (!isNearlyInteger(distance / step)) {
      throw new Error('Slider minDistance must align to the step grid.');
    }
    if (upper! - lower! < distance) {
      throw new Error('Slider range values must satisfy minDistance.');
    }
    if (!Array.isArray(props.accessibilityLabels) || props.accessibilityLabels.length !== 2) {
      throw new Error('Slider accessibilityLabels must contain exactly two strings.');
    }
    if (props.accessibilityLabels.some((label) => typeof label !== 'string' || label.trim().length === 0)) {
      throw new Error('Slider accessibilityLabels must contain non-empty strings.');
    }
    return;
  }

  assertFinite(props.value, 'value');
  if (props.value < min || props.value > max) {
    throw new Error('Slider value must be within min and max.');
  }
  assertStepValue(props.value, 'value');
  if (props.accessibilityLabel.trim().length === 0) {
    throw new Error('Slider accessibilityLabel must be a non-empty string.');
  }
}

function precisionFor(step: number): number {
  const exponent = /e-(\d+)$/i.exec(String(step));
  if (exponent?.[1] !== undefined) return Number(exponent[1]);
  const fraction = String(step).split('.')[1];
  return fraction?.length ?? 0;
}

function snap(value: number, min: number, max: number, step: number): number {
  const rounded = min + Math.round((value - min) / step) * step;
  const clamped = Math.min(max, Math.max(min, rounded));
  return Number(clamped.toFixed(Math.min(12, precisionFor(step) + 2)));
}

function positionFor(value: number, min: number, max: number, direction: SliderDirection): number {
  const fraction = (value - min) / (max - min);
  return (direction === 'rtl' ? 1 - fraction : fraction) * 100;
}

function valueForPosition(
  locationX: number,
  width: number,
  min: number,
  max: number,
  step: number,
  direction: SliderDirection,
): number {
  if (!(width > 0)) return min;
  const fraction = Math.min(1, Math.max(0, locationX / width));
  const logicalFraction = direction === 'rtl' ? 1 - fraction : fraction;
  return snap(min + logicalFraction * (max - min), min, max, step);
}

function sameValues(left: SliderValues, right: SliderValues): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function nearestThumb(values: SliderValues, next: number): number {
  if (values.length === 1) return 0;
  if (values[0] === values[1]) {
    // A collapsed range needs a directional choice so either side can expand.
    if (next > values[0]) return 1;
    if (next < values[0]) return 0;
  }
  const lowerDistance = Math.abs(values[0]! - next);
  const upperDistance = Math.abs(values[1]! - next);
  // Deterministically prefer the lower thumb at the midpoint.
  return lowerDistance <= upperDistance ? 0 : 1;
}

function webPointerLocation(event: unknown, root: unknown): number | null {
  const clientX =
    (event as { readonly clientX?: unknown }).clientX ??
    (event as { readonly nativeEvent?: { readonly clientX?: unknown } }).nativeEvent?.clientX;
  const node = root as { getBoundingClientRect?: () => { left: number; width: number } } | null;
  if (typeof clientX !== 'number' || node?.getBoundingClientRect === undefined) return null;
  const rect = node.getBoundingClientRect();
  return rect.width > 0 ? clientX - rect.left : null;
}

/**
 * Controlled horizontal numeric input. `mode="range"` preserves its tuple in
 * both callbacks; a single slider can never accidentally emit an array.
 */
export function Slider(props: SliderProps): ReactElement {
  const theme = useTheme();
  const styles = getStyles(theme);
  const min = props.min ?? DEFAULT_MIN;
  const max = props.max ?? DEFAULT_MAX;
  const step = props.step ?? DEFAULT_STEP;
  const direction = props.direction ?? 'ltr';
  const disabled = props.disabled === true;
  assertConfiguration(props, min, max, step);

  const values: SliderValues =
    props.mode === 'range' ? [props.value[0], props.value[1]] : [props.value];
  const rootRef = useRef<RootMeasureRef | null>(null);
  const layoutWidthRef = useRef(0);
  const rootPageXRef = useRef<number | null>(null);
  const activeThumbRef = useRef<number | null>(null);
  const interactionValuesRef = useRef<SliderValues>(values);
  const suppressWebClickUntilRef = useRef(0);
  const nativeInteractionRef = useRef<NativeInteraction | null>(null);
  const nativeInteractionGenerationRef = useRef(0);
  interactionValuesRef.current = values;

  const minDistance = props.mode === 'range' ? props.minDistance ?? 0 : 0;
  const targetSize = theme.metrics.control.md;
  const visualSize = theme.metrics.icon.lg;

  function resolveNext(index: number, candidate: number): SliderValues {
    const current = interactionValuesRef.current;
    const next = snap(candidate, min, max, step);
    if (current.length === 1) return [next];

    const lower = current[0]!;
    const upper = current[1]!;
    if (index === 0) return [Math.min(next, upper - minDistance), upper];
    return [lower, Math.max(next, lower + minDistance)];
  }

  function emit(next: SliderValues, commit: boolean): void {
    if (!sameValues(next, interactionValuesRef.current)) {
      interactionValuesRef.current = next;
      if (props.mode === 'range') props.onValueChange(next as readonly [number, number]);
      else props.onValueChange(next[0]!);
    }
    if (commit) {
      if (props.mode === 'range') props.onValueCommit?.(next as readonly [number, number]);
      else props.onValueCommit?.(next[0]!);
    }
  }

  function updateThumb(index: number, candidate: number, commit: boolean): void {
    if (disabled) return;
    emit(resolveNext(index, candidate), commit);
  }

  function startAt(locationX: number): void {
    if (disabled || layoutWidthRef.current <= 0) return;
    const next = valueForPosition(locationX, layoutWidthRef.current, min, max, step, direction);
    const index = nearestThumb(interactionValuesRef.current, next);
    activeThumbRef.current = index;
    updateThumb(index, next, false);
  }

  function moveAt(locationX: number): void {
    let index = activeThumbRef.current;
    if (disabled || index === null || layoutWidthRef.current <= 0) return;
    const current = interactionValuesRef.current;
    const next = valueForPosition(locationX, layoutWidthRef.current, min, max, step, direction);
    if (current.length === 2 && current[0] === current[1] && next !== current[0]) {
      // A drag can begin exactly on overlapping thumbs. Select the side that
      // the first divergent move targets instead of retaining the lower tie.
      index = next > current[0]! ? 1 : 0;
      activeThumbRef.current = index;
    }
    updateThumb(
      index,
      next,
      false,
    );
  }

  function commitActive(suppressWebClick = false): void {
    const index = activeThumbRef.current;
    if (disabled || index === null) return;
    const current = interactionValuesRef.current;
    emit(current, true);
    activeThumbRef.current = null;
    if (Platform.OS === 'web' && suppressWebClick) {
      suppressWebClickUntilRef.current = Date.now() + 100;
    }
  }

  function pointerLocationX(event: NativePointerEvent): number | null {
    if (Platform.OS === 'web') return webPointerLocation(event, rootRef.current);
    const pageX = event.nativeEvent?.pageX;
    const rootPageX = rootPageXRef.current;
    // locationX follows the responder's child target on native and is therefore
    // not a stable coordinate for a root-level track interaction.
    return typeof pageX === 'number' && rootPageX !== null ? pageX - rootPageX : null;
  }

  function measureNativeInteraction(interaction: NativeInteraction): void {
    rootRef.current?.measure?.((_x, _y, width, _height, pageX) => {
      if (
        nativeInteractionRef.current !== interaction ||
        nativeInteractionGenerationRef.current !== interaction.generation ||
        disabled ||
        !Number.isFinite(pageX)
      ) {
        return;
      }
      if (width > 0) layoutWidthRef.current = width;
      rootPageXRef.current = pageX;
      const startLocationX = interaction.startPageX - pageX;
      if (!interaction.started) {
        startAt(startLocationX);
        interaction.started = true;
      }
      if (interaction.latestPageX !== interaction.startPageX) {
        moveAt(interaction.latestPageX - pageX);
      }
      if (interaction.released) {
        commitActive();
        nativeInteractionRef.current = null;
      }
    });
  }

  function startNativeInteraction(event: NativePointerEvent): void {
    const pageX = event.nativeEvent?.pageX;
    if (typeof pageX !== 'number') return;
    const interaction: NativeInteraction = {
      generation: nativeInteractionGenerationRef.current + 1,
      startPageX: pageX,
      latestPageX: pageX,
      started: false,
      released: false,
    };
    nativeInteractionGenerationRef.current = interaction.generation;
    nativeInteractionRef.current = interaction;
    // pageX is stable across child targets; refresh the root page coordinate at
    // grant so a ScrollView/window movement cannot reuse a stale layout origin.
    measureNativeInteraction(interaction);
  }

  function moveNativeInteraction(event: NativePointerEvent): void {
    const interaction = nativeInteractionRef.current;
    const pageX = event.nativeEvent?.pageX;
    if (interaction === null || typeof pageX !== 'number') return;
    interaction.latestPageX = pageX;
    const rootPageX = rootPageXRef.current;
    if (interaction.started && rootPageX !== null) moveAt(pageX - rootPageX);
  }

  function finishNativeInteraction(): void {
    const interaction = nativeInteractionRef.current;
    if (interaction === null) return;
    interaction.released = true;
    if (!interaction.started) return;
    commitActive();
    nativeInteractionRef.current = null;
  }

  const panResponder = PanResponder.create({
    onStartShouldSetPanResponder: () => !disabled,
    onMoveShouldSetPanResponder: () => !disabled,
    onPanResponderGrant: (event: NativePointerEvent) => {
      if (Platform.OS !== 'web') {
        startNativeInteraction(event);
        return;
      }
      const locationX = pointerLocationX(event);
      if (locationX !== null) startAt(locationX);
    },
    onPanResponderMove: (event: NativePointerEvent) => {
      if (Platform.OS !== 'web') {
        moveNativeInteraction(event);
        return;
      }
      const locationX = pointerLocationX(event);
      if (locationX !== null) moveAt(locationX);
    },
    onPanResponderRelease: () => {
      if (Platform.OS !== 'web') finishNativeInteraction();
      else commitActive(true);
    },
    onPanResponderTerminate: () => {
      if (Platform.OS !== 'web') finishNativeInteraction();
      else commitActive(true);
    },
  });

  function onLayout(event: LayoutChangeEvent): void {
    layoutWidthRef.current = event.nativeEvent.layout.width;
    rootRef.current?.measure?.((_x, _y, width, _height, pageX) => {
      if (width > 0) layoutWidthRef.current = width;
      if (Number.isFinite(pageX)) rootPageXRef.current = pageX;
    });
  }

  function onWebTrackClick(event: unknown): void {
    if (Platform.OS !== 'web' || disabled) return;
    if (Date.now() <= suppressWebClickUntilRef.current) return;
    const root = rootRef.current as { getBoundingClientRect?: () => { width: number } } | null;
    const measuredWidth = root?.getBoundingClientRect?.().width;
    if (typeof measuredWidth === 'number' && measuredWidth > 0) {
      layoutWidthRef.current = measuredWidth;
    }
    const locationX = webPointerLocation(event, rootRef.current);
    if (locationX === null) return;
    startAt(locationX);
    commitActive();
  }

  function keyboardDelta(key: string): number | 'home' | 'end' | null {
    const largeStep = Math.max(step, (max - min) / 10);
    switch (key) {
      case 'ArrowRight':
        return direction === 'rtl' ? -step : step;
      case 'ArrowLeft':
        return direction === 'rtl' ? step : -step;
      case 'ArrowUp':
        return step;
      case 'ArrowDown':
        return -step;
      case 'PageUp':
        return largeStep;
      case 'PageDown':
        return -largeStep;
      case 'Home':
        return 'home';
      case 'End':
        return 'end';
      default:
        return null;
    }
  }

  function onWebKeyDown(index: number, event: WebKeyboardEvent): void {
    if (disabled) return;
    const delta = keyboardDelta(event.key);
    if (delta === null) return;
    event.preventDefault();
    const current = interactionValuesRef.current[index]!;
    updateThumb(index, delta === 'home' ? min : delta === 'end' ? max : current + delta, true);
  }

  function onAccessibilityAction(index: number, event: AccessibilityActionEvent): void {
    if (disabled) return;
    const action = event.nativeEvent.actionName;
    const current = interactionValuesRef.current[index]!;
    if (action === 'increment') updateThumb(index, current + step, true);
    if (action === 'decrement') updateThumb(index, current - step, true);
  }

  const rangeValues = values.length === 1 ? [min, values[0]!] : [values[0]!, values[1]!];
  const firstPosition = positionFor(rangeValues[0]!, min, max, direction);
  const secondPosition = positionFor(rangeValues[1]!, min, max, direction);
  const rangeStart = Math.min(firstPosition, secondPosition);
  const rangeWidth = Math.abs(secondPosition - firstPosition);

  return (
    <View
      ref={rootRef as never}
      accessible={false}
      onLayout={onLayout}
      testID={props.testID}
      {...panResponder.panHandlers}
      {...(Platform.OS === 'web'
        ? ({ onClick: onWebTrackClick } as unknown as Record<string, unknown>)
        : {})}
      {...nativeWindProps(props.className)}
      style={[styles.root, { opacity: disabled ? 0.5 : 1 }, props.style]}
    >
      <View
        accessible={false}
        testID={props.testID === undefined ? undefined : `${props.testID}-track`}
        {...nativeWindProps(props.trackClassName)}
        style={[styles.track, { backgroundColor: theme.colors.surfaceSubtle }, props.trackStyle]}
      >
        <View
          accessible={false}
          testID={props.testID === undefined ? undefined : `${props.testID}-range`}
          {...nativeWindProps(props.rangeClassName)}
          style={[
            styles.range,
            props.rangeStyle,
            {
              backgroundColor: theme.colors.primary,
              left: `${rangeStart}%`,
              width: `${rangeWidth}%`,
            },
          ]}
        />
      </View>
      {values.map((value, index) => {
        const position = positionFor(value, min, max, direction);
        const label =
          props.mode === 'range' ? props.accessibilityLabels[index]! : props.accessibilityLabel;
        const valueText = props.valueText?.(value);
        const accessibleMin = values.length === 2 && index === 1
          ? values[0]! + minDistance
          : min;
        const accessibleMax = values.length === 2 && index === 0
          ? values[1]! - minDistance
          : max;
        return (
          <View
            key={index}
            accessible
            accessibilityRole="adjustable"
            role="slider"
            accessibilityLabel={label}
            aria-label={label}
            accessibilityState={{ disabled }}
            accessibilityValue={{ min: accessibleMin, max: accessibleMax, now: value, text: valueText }}
            accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
            onAccessibilityAction={(event) => onAccessibilityAction(index, event)}
            focusable={!disabled}
            tabIndex={disabled ? -1 : 0}
            testID={props.testID === undefined ? undefined : `${props.testID}-thumb-${index}`}
            {...(Platform.OS === 'web'
              ? ({
                  onKeyDown: (event: WebKeyboardEvent) => onWebKeyDown(index, event),
                  'aria-valuemin': accessibleMin,
                  'aria-valuemax': accessibleMax,
                  'aria-valuenow': value,
                  'aria-disabled': disabled,
                  ...(valueText === undefined ? {} : { 'aria-valuetext': valueText }),
                } as unknown as Record<string, unknown>)
              : {})}
            {...nativeWindProps(props.thumbClassName)}
            style={[
              styles.thumb,
              props.thumbStyle,
              {
                backgroundColor: theme.colors.surface,
                borderColor: theme.colors.primary,
                height: targetSize,
                left: `${position}%`,
                marginLeft: -targetSize / 2,
                width: targetSize,
              },
            ]}
          >
            <View
              accessible={false}
              style={[
                styles.thumbVisual,
                { backgroundColor: theme.colors.primary, height: visualSize, width: visualSize },
              ]}
            />
          </View>
        );
      })}
    </View>
  );
}
