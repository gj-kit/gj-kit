/**
 * ToggleGroup — immediate state selection that changes neither the screen nor a
 * tabpanel.
 *
 * Tabs owns the tablist/tabpanel relationship. ToggleGroup owns only an
 * independent set of toggle buttons — bold, alignment, filters — and separates
 * the single and multiple states by type.
 */
import { useRef, useState } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { Platform, Pressable, StyleSheet, Text as RNText, View } from 'react-native';
import type { StyleProp, TextStyle, ViewStyle } from 'react-native';
import type { Theme } from '../theme/tokens';
import { renderIconSlot } from './icons';
import type { RenderIcon } from './icons';
import { mergeClassNames, nativeWindProps, themedStyles } from './internal';
import type { CommonProps } from './internal';
import { PRESSABLE_FEEDBACK_CLASS } from './button';
import { useTheme } from './provider';

export type ToggleGroupSelectionMode = 'single' | 'multiple';
export type ToggleGroupOrientation = 'horizontal' | 'vertical';
export type ToggleGroupVariant = 'filled' | 'outlined';
export type ToggleGroupSize = 'sm' | 'md';

type ToggleGroupItemBase<T extends string> = {
  readonly value: T;
  readonly disabled?: boolean | undefined;
};

type LabeledToggleGroupItem = {
  readonly label: string;
  readonly accessibilityLabel?: string | undefined;
  readonly icon?: ReactNode | RenderIcon | undefined;
};

type IconOnlyToggleGroupItem = {
  readonly label?: never;
  readonly accessibilityLabel: string;
  readonly icon: NonNullable<ReactNode> | RenderIcon;
};

export type ToggleGroupItem<T extends string> = ToggleGroupItemBase<T> &
  (LabeledToggleGroupItem | IconOnlyToggleGroupItem);

type ToggleGroupBaseProps<T extends string> = Omit<CommonProps, 'unstyled'> & {
  readonly items: readonly ToggleGroupItem<T>[];
  /** A stable accessible name for the toolbar. */
  readonly accessibilityLabel: string;
  readonly orientation?: ToggleGroupOrientation | undefined;
  readonly variant?: ToggleGroupVariant | undefined;
  readonly size?: ToggleGroupSize | undefined;
  readonly disabled?: boolean | undefined;
  /** Whether the arrow keys wrap from one end to the other. Defaults to true. */
  readonly loop?: boolean | undefined;
  readonly itemStyle?: StyleProp<ViewStyle> | undefined;
  readonly itemClassName?: string | undefined;
  readonly labelStyle?: StyleProp<TextStyle> | undefined;
  readonly labelClassName?: string | undefined;
  readonly unstyled?: never;
};

type SingleToggleGroupProps<T extends string> = ToggleGroupBaseProps<T> & {
  readonly selectionMode: 'single';
  readonly value: NoInfer<T> | null;
  readonly onValueChange: (value: T | null) => void;
  /** Whether pressing the active item again can clear it to null. Defaults to true. */
  readonly allowEmpty?: boolean | undefined;
};

type MultipleToggleGroupProps<T extends string> = ToggleGroupBaseProps<T> & {
  readonly selectionMode: 'multiple';
  readonly value: readonly NoInfer<T>[];
  readonly onValueChange: (value: readonly T[]) => void;
  readonly allowEmpty?: never;
};

export type ToggleGroupProps<T extends string> =
  | SingleToggleGroupProps<T>
  | MultipleToggleGroupProps<T>;

type Focusable = { focus?: () => void };

type WebKeyboardEvent = {
  readonly key: string;
  preventDefault: () => void;
};

const getStyles = themedStyles((theme: Theme) => ({
  root: {
    alignSelf: 'flex-start' as const,
    borderRadius: theme.radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    gap: theme.spacing.xs,
    padding: theme.spacing.xs,
  },
  horizontal: {
    flexDirection: 'row' as const,
  },
  vertical: {
    alignItems: 'stretch' as const,
  },
  item: {
    alignItems: 'center' as const,
    borderRadius: theme.radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row' as const,
    justifyContent: 'center' as const,
  },
  verticalItem: {
    alignSelf: 'stretch' as const,
  },
  icon: {
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  label: {
    includeFontPadding: false,
    textAlign: 'center' as const,
  },
}));

function assertToggleGroup<T extends string>(props: ToggleGroupProps<T>): void {
  if (props.accessibilityLabel.trim().length === 0) {
    throw new Error('ToggleGroup accessibilityLabel must be a non-empty string.');
  }
  if (props.items.length === 0) {
    throw new Error('ToggleGroup items must contain at least one item.');
  }

  const values = new Set<string>();
  for (const item of props.items) {
    if (item.value.trim().length === 0) {
      throw new Error('ToggleGroup item values must be non-empty strings.');
    }
    if (values.has(item.value)) {
      throw new Error(`ToggleGroup item value "${item.value}" is duplicated.`);
    }
    values.add(item.value);
    const name = item.accessibilityLabel ?? item.label;
    if (name === undefined || name.trim().length === 0) {
      throw new Error(`ToggleGroup item "${item.value}" must have an accessible name.`);
    }
  }

  if (props.selectionMode === 'single') {
    if (props.value !== null && !values.has(props.value)) {
      throw new Error(`ToggleGroup value "${props.value}" does not exist in items.`);
    }
    return;
  }

  const selected = new Set<string>();
  for (const value of props.value) {
    if (!values.has(value)) {
      throw new Error(`ToggleGroup value "${value}" does not exist in items.`);
    }
    if (selected.has(value)) {
      throw new Error(`ToggleGroup value "${value}" is selected more than once.`);
    }
    selected.add(value);
  }
}

function webProps(values: Record<string, unknown>): Record<string, unknown> {
  return Platform.OS === 'web' ? values : {};
}

export function ToggleGroup<T extends string>(props: ToggleGroupProps<T>): ReactElement {
  assertToggleGroup(props);
  const {
    items,
    accessibilityLabel,
    orientation = 'horizontal',
    variant = 'filled',
    size = 'md',
    disabled = false,
    loop = true,
    itemStyle,
    itemClassName,
    labelStyle,
    labelClassName,
    style,
    className,
    testID,
  } = props;
  const theme = useTheme();
  const styles = getStyles(theme);
  const refs = useRef<Array<Focusable | null>>([]);
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const selectedValues = new Set<string>(
    props.selectionMode === 'single'
      ? props.value === null
        ? []
        : [props.value]
      : props.value,
  );
  const enabledIndices = items.reduce<number[]>((indices, item, index) => {
    if (!disabled && !item.disabled) indices.push(index);
    return indices;
  }, []);
  const selectedEnabledIndex = items.findIndex(
    (item, index) => enabledIndices.includes(index) && selectedValues.has(item.value),
  );
  const fallbackRovingIndex = selectedEnabledIndex >= 0 ? selectedEnabledIndex : (enabledIndices[0] ?? -1);
  const rovingIndex =
    focusedIndex !== null && enabledIndices.includes(focusedIndex)
      ? focusedIndex
      : fallbackRovingIndex;

  function focusAt(index: number): void {
    setFocusedIndex(index);
    refs.current[index]?.focus?.();
  }

  function moveFocus(index: number, direction: 1 | -1): void {
    if (enabledIndices.length === 0) return;
    const currentPosition = enabledIndices.indexOf(index);
    const fallbackPosition = direction === 1 ? -1 : enabledIndices.length;
    const candidatePosition = (currentPosition >= 0 ? currentPosition : fallbackPosition) + direction;
    const nextPosition = loop
      ? (candidatePosition + enabledIndices.length) % enabledIndices.length
      : Math.min(Math.max(candidatePosition, 0), enabledIndices.length - 1);
    const nextIndex = enabledIndices[nextPosition];
    if (nextIndex !== undefined) focusAt(nextIndex);
  }

  function moveToBoundary(position: 'first' | 'last'): void {
    const index = position === 'first' ? enabledIndices[0] : enabledIndices.at(-1);
    if (index !== undefined) focusAt(index);
  }

  function activate(item: ToggleGroupItem<T>): void {
    if (disabled || item.disabled) return;
    const selected = selectedValues.has(item.value);
    if (props.selectionMode === 'single') {
      if (selected) {
        if (props.allowEmpty ?? true) props.onValueChange(null);
        return;
      }
      props.onValueChange(item.value);
      return;
    }

    const next = new Set(props.value);
    if (selected) next.delete(item.value);
    else next.add(item.value);
    props.onValueChange(items.filter((candidate) => next.has(candidate.value)).map((candidate) => candidate.value));
  }

  const dimensions =
    size === 'sm'
      ? {
          minHeight: theme.metrics.control.sm,
          minWidth: theme.metrics.control.sm,
          paddingHorizontal: theme.spacing.sm,
          gap: theme.spacing.xs,
          iconSize: theme.metrics.icon.sm,
          typography: theme.typography.caption,
        }
      : {
          minHeight: theme.metrics.control.md,
          minWidth: theme.metrics.control.md,
          paddingHorizontal: theme.spacing.md,
          gap: theme.spacing.sm,
          iconSize: theme.metrics.icon.md,
          typography: theme.typography.label,
        };

  return (
    <View
      accessibilityRole="toolbar"
      role="toolbar"
      accessibilityLabel={accessibilityLabel}
      aria-label={accessibilityLabel}
      {...webProps({ 'aria-orientation': orientation })}
      testID={testID}
      {...nativeWindProps(className)}
      style={[
        styles.root,
        orientation === 'horizontal' ? styles.horizontal : styles.vertical,
        {
          backgroundColor: variant === 'filled' ? theme.colors.surfaceSubtle : theme.colors.surface,
          borderColor: variant === 'filled' ? theme.colors.surfaceSubtle : theme.colors.line,
          opacity: disabled ? 0.58 : 1,
        },
        style,
      ]}
    >
      {items.map((item, index) => {
        const selected = selectedValues.has(item.value);
        const itemDisabled = disabled || item.disabled === true;
        const name = item.accessibilityLabel ?? item.label;
        const foreground = selected ? theme.colors.primaryStrong : theme.colors.text;
        const background = selected
          ? theme.colors.primarySoft
          : variant === 'filled'
            ? 'transparent'
            : theme.colors.surface;
        const border = selected
          ? theme.colors.primary
          : variant === 'filled'
            ? 'transparent'
            : theme.colors.line;
        const sharedStyle = [
          styles.item,
          orientation === 'vertical' ? styles.verticalItem : null,
          {
            minHeight: dimensions.minHeight,
            minWidth: dimensions.minWidth,
            paddingHorizontal: dimensions.paddingHorizontal,
            gap: dimensions.gap,
            backgroundColor: background,
            borderColor: border,
            opacity: itemDisabled && !disabled ? 0.5 : 1,
          },
          itemStyle,
        ];
        const content = (
          <>
            {item.icon !== undefined ? (
              <View
                aria-hidden
                importantForAccessibility="no-hide-descendants"
                style={styles.icon}
              >
                {renderIconSlot(item.icon, { color: foreground, size: dimensions.iconSize })}
              </View>
            ) : null}
            {item.label !== undefined ? (
              <RNText
                {...nativeWindProps(labelClassName)}
                maxFontSizeMultiplier={theme.metrics.maxFontScale}
                style={[
                  styles.label,
                  dimensions.typography,
                  theme.typography.fontFamily === undefined
                    ? null
                    : { fontFamily: theme.typography.fontFamily },
                  { color: foreground },
                  labelStyle,
                ]}
              >
                {item.label}
              </RNText>
            ) : null}
          </>
        );
        const accessibilityProps = {
          accessible: true,
          accessibilityLabel: name,
          accessibilityState:
            Platform.OS === 'web'
              ? { disabled: itemDisabled }
              : { checked: selected, disabled: itemDisabled },
          'aria-label': name,
          'aria-pressed': selected,
          'aria-disabled': itemDisabled,
        };

        if (Platform.OS === 'web') {
          const onKeyDown = (event: WebKeyboardEvent): void => {
            if (itemDisabled) return;
            const forwardKey = orientation === 'horizontal' ? 'ArrowRight' : 'ArrowDown';
            const backwardKey = orientation === 'horizontal' ? 'ArrowLeft' : 'ArrowUp';
            if (event.key === forwardKey) {
              event.preventDefault();
              moveFocus(index, 1);
            } else if (event.key === backwardKey) {
              event.preventDefault();
              moveFocus(index, -1);
            } else if (event.key === 'Home') {
              event.preventDefault();
              moveToBoundary('first');
            } else if (event.key === 'End') {
              event.preventDefault();
              moveToBoundary('last');
            }
          };

          return (
            <View
              key={item.value}
              {...accessibilityProps}
              role="button"
              ref={(node) => {
                refs.current[index] = node as unknown as Focusable | null;
              }}
              focusable={!itemDisabled}
              tabIndex={itemDisabled || index !== rovingIndex ? -1 : 0}
              {...webProps({
                onClick: () => activate(item),
                onFocus: () => setFocusedIndex(index),
                onKeyDown,
              })}
              testID={testID === undefined ? undefined : `${testID}-item-${index}`}
              {...nativeWindProps(mergeClassNames(PRESSABLE_FEEDBACK_CLASS, itemClassName))}
              style={sharedStyle}
            >
              {content}
            </View>
          );
        }

        return (
          <Pressable
            key={item.value}
            {...accessibilityProps}
            accessibilityRole="togglebutton"
            disabled={itemDisabled}
            onPress={() => activate(item)}
            testID={testID === undefined ? undefined : `${testID}-item-${index}`}
            {...nativeWindProps(mergeClassNames(PRESSABLE_FEEDBACK_CLASS, itemClassName))}
            style={({ pressed }) => [
              sharedStyle,
              pressed && !itemDisabled ? { opacity: 0.82 } : null,
            ]}
          >
            {content}
          </Pressable>
        );
      })}
    </View>
  );
}
