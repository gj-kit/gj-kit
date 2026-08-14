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

export type SegmentedControlSize = 'sm' | 'md';
export type SegmentedControlFit = 'equal' | 'content';

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
  equalRoot: { alignSelf: 'stretch' as const, width: '100%' as const },
  contentRoot: { alignSelf: 'flex-start' as const },
  item: {
    alignItems: 'center' as const,
    borderRadius: theme.radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center' as const,
    minWidth: theme.spacing.none,
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
  const dimensions =
    size === 'sm'
      ? {
          minHeight: theme.metrics.control.sm,
          paddingHorizontal: theme.spacing.sm,
          typography: theme.typography.label,
        }
      : {
          minHeight: theme.metrics.control.md,
          paddingHorizontal: theme.spacing.md,
          typography: theme.typography.button,
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
        { backgroundColor: theme.colors.surfaceSubtle, borderColor: theme.colors.line },
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
          itemStyle,
        ];
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
              { color: selected ? theme.colors.onPrimary : theme.colors.text },
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
