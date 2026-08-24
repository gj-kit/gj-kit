/**
 * SegmentedControl — a compact, semantic radio group for one required choice.
 *
 * It intentionally does not own a tab panel (use Tabs) or a toggleable set of
 * independent values (use ToggleGroup).
 */
import { useRef } from 'react';
import type { ReactElement } from 'react';
import { Platform, Pressable, StyleSheet, Text as RNText, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import type { Theme } from '../theme/tokens';
import { mergeClassNames, nativeWindProps, themedStyles } from './internal';
import type { CommonProps } from './internal';
import { PRESSABLE_FEEDBACK_CLASS } from './button';
import { useTheme } from './provider';
import {
  UNDERLINE_INDICATOR_WIDTH,
  UNDERLINE_TAB_MIN_HEIGHT,
  UNDERLINE_TRACK_BORDER_WIDTH,
} from './tabs';

export type SegmentedControlSize = 'sm' | 'md';
export type SegmentedControlFit = 'equal' | 'content';
/**
 * `filled` is the bordered pill track; `underline` is a transparent track whose
 * selected segment carries a `tabActive` underline and label (`tabInactive` on
 * the rest) — the same token roles as an underline Tabs row, which it visually
 * matches for filter rows that change a list rather than swap panels.
 */
export type SegmentedControlVariant = 'filled' | 'underline';

export interface SegmentedControlItem<T extends string> {
  readonly label: string;
  readonly value: T;
  readonly accessibilityLabel?: string | undefined;
  readonly disabled?: boolean | undefined;
}

export interface SegmentedControlProps<T extends string>
  extends Omit<CommonProps, 'unstyled'> {
  /** The values are the source of truth for the literal value union. */
  items: readonly SegmentedControlItem<T>[];
  /** Exactly one item is selected; empty selection belongs to ToggleGroup. */
  value: NoInfer<T>;
  onValueChange: (value: T) => void;
  /** A stable accessible name for the radio group. */
  accessibilityLabel: string;
  /** Defaults to md. */
  size?: SegmentedControlSize | undefined;
  /** Equal segments fill their container; content segments retain their intrinsic width. Defaults to equal. */
  fit?: SegmentedControlFit | undefined;
  /** Visual treatment only; radio semantics and keyboard behavior are identical. Defaults to filled. */
  variant?: SegmentedControlVariant | undefined;
  /** Applies to every segment without changing its semantic state. */
  itemStyle?: StyleProp<ViewStyle> | undefined;
  itemClassName?: string | undefined;
  unstyled?: never;
}

type Focusable = { focus?: () => void };
type WebKeyboardEvent = { readonly key: string; preventDefault: () => void };

const getStyles = themedStyles((theme: Theme) => ({
  root: {
    borderRadius: theme.radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row' as const,
    gap: theme.spacing.xs,
    padding: theme.spacing.xs,
  },
  underlineRoot: {
    backgroundColor: 'transparent',
    borderBottomWidth: UNDERLINE_TRACK_BORDER_WIDTH,
    borderRadius: theme.radius.none,
    borderWidth: 0,
    flexDirection: 'row' as const,
    gap: theme.spacing.none,
    padding: theme.spacing.none,
  },
  equalRoot: { alignSelf: 'stretch' as const, width: '100%' as const },
  contentRoot: { alignSelf: 'flex-start' as const },
  item: {
    alignItems: 'center' as const,
    borderRadius: theme.radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center' as const,
    minWidth: theme.spacing.none,
  },
  underlineItem: {
    backgroundColor: 'transparent',
    borderBottomWidth: UNDERLINE_INDICATOR_WIDTH,
    borderRadius: theme.radius.none,
    borderWidth: 0,
  },
  equalItem: { flexBasis: theme.spacing.none, flexGrow: 1, minWidth: theme.spacing.none },
  label: { includeFontPadding: false, textAlign: 'center' as const },
}));

function assertNonBlankString(value: unknown, name: string): asserts value is string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${name} must be a non-empty string.`);
  }
}

function assertSegmentedControl<T extends string>(props: SegmentedControlProps<T>): void {
  assertNonBlankString(props.accessibilityLabel, 'SegmentedControl accessibilityLabel');
  if (props.items.length === 0) {
    throw new Error('SegmentedControl items must contain at least one item.');
  }
  if (props.size !== undefined && props.size !== 'sm' && props.size !== 'md') {
    throw new Error('SegmentedControl size must be "sm" or "md".');
  }
  if (props.fit !== undefined && props.fit !== 'equal' && props.fit !== 'content') {
    throw new Error('SegmentedControl fit must be "equal" or "content".');
  }
  if (
    props.variant !== undefined &&
    props.variant !== 'filled' &&
    props.variant !== 'underline'
  ) {
    throw new Error('SegmentedControl variant must be "filled" or "underline".');
  }

  const values = new Set<string>();
  for (const [index, item] of props.items.entries()) {
    assertNonBlankString(item.value, `SegmentedControl item at index ${index} value`);
    assertNonBlankString(item.label, `SegmentedControl item at index ${index} label`);
    if (item.accessibilityLabel !== undefined) {
      assertNonBlankString(
        item.accessibilityLabel,
        `SegmentedControl item at index ${index} accessibilityLabel`,
      );
    }
    if (values.has(item.value)) {
      throw new Error(`SegmentedControl item value "${item.value}" is duplicated.`);
    }
    values.add(item.value);
  }
  if (!values.has(props.value)) {
    throw new Error(`SegmentedControl value "${props.value}" does not exist in items.`);
  }
}

/** A compact required-choice radio group with native and web keyboard semantics. */
export function SegmentedControl<T extends string>({
  items,
  value,
  onValueChange,
  accessibilityLabel,
  size = 'md',
  fit = 'equal',
  variant = 'filled',
  itemStyle,
  itemClassName,
  style,
  className,
  testID,
}: SegmentedControlProps<T>): ReactElement {
  assertSegmentedControl({
    items,
    value,
    onValueChange,
    accessibilityLabel,
    size,
    fit,
    variant,
    itemStyle,
    itemClassName,
    style,
    className,
    testID,
  });
  const theme = useTheme();
  const styles = getStyles(theme);
  const refs = useRef<Array<Focusable | null>>([]);
  const enabledIndices = items.reduce<number[]>((indices, item, index) => {
    if (!item.disabled) indices.push(index);
    return indices;
  }, []);
  const selectedIndex = items.findIndex((item) => item.value === value && !item.disabled);
  const rovingIndex = selectedIndex >= 0 ? selectedIndex : (enabledIndices[0] ?? -1);
  const underline = variant === 'underline';
  // underline md는 Tabs underline과 같은 높이·서체(typography.tab)를 공유해 필터 행과
  // 탭 행의 baseline이 맞는다. sm은 compact control 높이를 유지한다.
  const dimensions =
    size === 'sm'
      ? {
          minHeight: theme.metrics.control.sm,
          paddingHorizontal: theme.spacing.sm,
          typography: theme.typography.label,
        }
      : {
          minHeight: underline ? UNDERLINE_TAB_MIN_HEIGHT : theme.metrics.control.md,
          paddingHorizontal: theme.spacing.md,
          typography: underline ? theme.typography.tab : theme.typography.button,
        };

  const activate = (item: SegmentedControlItem<T>): void => {
    if (item.disabled || item.value === value) return;
    onValueChange(item.value);
  };
  const moveFrom = (index: number, direction: 1 | -1): void => {
    if (enabledIndices.length === 0) return;
    const current = enabledIndices.indexOf(index);
    const currentPosition = current >= 0 ? current : 0;
    const nextPosition =
      (currentPosition + direction + enabledIndices.length) % enabledIndices.length;
    const nextIndex = enabledIndices[nextPosition];
    const next = nextIndex === undefined ? undefined : items[nextIndex];
    if (next === undefined || nextIndex === undefined) return;
    // Keyboard navigation selects the focused radio even when the caller has
    // not yet committed the previous controlled update.
    onValueChange(next.value);
    refs.current[nextIndex]?.focus?.();
  };
  const moveToBoundary = (position: 'first' | 'last'): void => {
    const nextIndex =
      position === 'first' ? enabledIndices[0] : enabledIndices[enabledIndices.length - 1];
    const next = nextIndex === undefined ? undefined : items[nextIndex];
    if (next === undefined || nextIndex === undefined) return;
    onValueChange(next.value);
    refs.current[nextIndex]?.focus?.();
  };

  return (
    <View
      accessibilityRole="radiogroup"
      role="radiogroup"
      accessibilityLabel={accessibilityLabel}
      aria-label={accessibilityLabel}
      testID={testID}
      {...nativeWindProps(className)}
      style={[
        styles.root,
        fit === 'equal' ? styles.equalRoot : styles.contentRoot,
        underline
          ? [styles.underlineRoot, { borderBottomColor: theme.colors.line }]
          : { backgroundColor: theme.colors.surfaceSubtle, borderColor: theme.colors.line },
        style,
      ]}
    >
      {items.map((item, index) => {
        const selected = item.value === value;
        const disabled = item.disabled === true;
        const name = item.accessibilityLabel ?? item.label;
        const sharedStyle = [
          styles.item,
          fit === 'equal' ? styles.equalItem : null,
          {
            minHeight: dimensions.minHeight,
            paddingHorizontal: dimensions.paddingHorizontal,
            backgroundColor: selected ? theme.colors.primaryStrong : theme.colors.surface,
            borderColor: selected ? theme.colors.primaryStrong : theme.colors.line,
            opacity: disabled ? 0.5 : 1,
          },
          underline
            ? [
                styles.underlineItem,
                { borderBottomColor: selected ? theme.colors.tabActive : 'transparent' },
              ]
            : null,
          itemStyle,
        ];
        const labelColor = underline
          ? selected
            ? theme.colors.tabActive
            : theme.colors.tabInactive
          : selected
            ? theme.colors.onPrimary
            : theme.colors.text;
        const accessibilityProps = {
          accessible: true,
          accessibilityRole: 'radio' as const,
          role: 'radio' as const,
          accessibilityLabel: name,
          'aria-label': name,
          accessibilityState: { checked: selected, disabled },
          'aria-checked': selected,
          'aria-disabled': disabled,
        };
        const label = (
          <RNText
            maxFontSizeMultiplier={theme.metrics.maxFontScale}
            style={[
              styles.label,
              dimensions.typography,
              theme.typography.fontFamily === undefined
                ? null
                : { fontFamily: theme.typography.fontFamily },
              // underline의 비선택 항목은 Tabs underline처럼 body 굵기로 내려 선택 항목과 대비한다.
              underline && !selected ? { fontWeight: theme.typography.body.fontWeight } : null,
              { color: labelColor },
            ]}
          >
            {item.label}
          </RNText>
        );

        if (Platform.OS === 'web') {
          const onKeyDown = (event: WebKeyboardEvent): void => {
            if (disabled) return;
            switch (event.key) {
              case ' ':
              case 'Space':
              case 'Spacebar':
                event.preventDefault();
                activate(item);
                break;
              case 'ArrowRight':
              case 'ArrowDown':
                event.preventDefault();
                moveFrom(index, 1);
                break;
              case 'ArrowLeft':
              case 'ArrowUp':
                event.preventDefault();
                moveFrom(index, -1);
                break;
              case 'Home':
                event.preventDefault();
                moveToBoundary('first');
                break;
              case 'End':
                event.preventDefault();
                moveToBoundary('last');
                break;
            }
          };
          return (
            <View
              key={item.value}
              {...accessibilityProps}
              ref={(node) => {
                refs.current[index] = node as unknown as Focusable | null;
              }}
              focusable={!disabled}
              tabIndex={disabled || index !== rovingIndex ? -1 : 0}
              {...({
                onClick: () => activate(item),
                onKeyDown,
              } as unknown as Record<string, unknown>)}
              testID={testID === undefined ? undefined : `${testID}-item-${index}`}
              {...nativeWindProps(mergeClassNames(PRESSABLE_FEEDBACK_CLASS, itemClassName))}
              style={sharedStyle}
            >
              {label}
            </View>
          );
        }

        return (
          <Pressable
            key={item.value}
            {...accessibilityProps}
            disabled={disabled}
            onPress={() => activate(item)}
            testID={testID === undefined ? undefined : `${testID}-item-${index}`}
            {...nativeWindProps(mergeClassNames(PRESSABLE_FEEDBACK_CLASS, itemClassName))}
            style={({ pressed }) => [
              sharedStyle,
              pressed && !disabled ? { opacity: 0.82 } : null,
            ]}
          >
            {label}
          </Pressable>
        );
      })}
    </View>
  );
}
