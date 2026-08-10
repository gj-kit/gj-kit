/**
 * RadioGroup — generic controlled values with native and APG-compatible web input.
 * Web uses roving tabindex and arrow-key wrapping; disabled options are skipped.
 */
import { useId, useRef } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { Platform, Pressable, StyleSheet, Text as RNText, View } from 'react-native';
import type { Theme } from '../theme/tokens';
import { nativeWindProps, themedStyles } from './internal';
import type { CommonProps } from './internal';
import { useTheme } from './provider';

export interface RadioItem<T extends string> {
  readonly label: string;
  readonly value: T;
  readonly description?: string | undefined;
  readonly disabled?: boolean | undefined;
}

export interface RadioGroupProps<T extends string> extends CommonProps {
  items: readonly RadioItem<T>[];
  value: NoInfer<T> | null;
  onValueChange: (value: T) => void;
  accessibilityLabel: string;
  orientation?: 'vertical' | 'horizontal' | undefined;
}

type WebKeyboardEvent = {
  readonly key: string;
  preventDefault: () => void;
};

type Focusable = { focus?: () => void };

const getStyles = themedStyles((theme: Theme) => ({
  groupVertical: {
    gap: theme.spacing.sm,
  },
  groupHorizontal: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: theme.spacing.lg,
  },
  item: {
    alignItems: 'flex-start' as const,
    flexDirection: 'row' as const,
    gap: theme.spacing.sm,
    minHeight: theme.metrics.control.sm,
  },
  indicator: {
    alignItems: 'center' as const,
    borderRadius: theme.radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center' as const,
  },
  dot: {
    borderRadius: theme.radius.pill,
  },
  copy: {
    flexShrink: 1,
    gap: theme.spacing.xs,
    justifyContent: 'center' as const,
  },
  label: {
    fontSize: theme.typography.button.fontSize,
    fontWeight: theme.typography.button.fontWeight,
    lineHeight: theme.typography.button.lineHeight,
  },
  description: {
    fontSize: theme.typography.caption.fontSize,
    fontWeight: theme.typography.caption.fontWeight,
    lineHeight: theme.typography.caption.lineHeight,
  },
}));

function RadioCopy({
  label,
  description,
  descriptionId,
}: Pick<RadioItem<string>, 'label' | 'description'> & {
  descriptionId?: string | undefined;
}): ReactNode {
  const theme = useTheme();
  const styles = getStyles(theme);
  const fontFamily =
    theme.typography.fontFamily !== undefined
      ? { fontFamily: theme.typography.fontFamily }
      : null;

  return (
    <View style={styles.copy}>
      <RNText style={[styles.label, { color: theme.colors.text }, fontFamily]}>{label}</RNText>
      {description !== undefined ? (
        <RNText
          nativeID={descriptionId}
          style={[styles.description, { color: theme.colors.textMuted }, fontFamily]}
        >
          {description}
        </RNText>
      ) : null}
    </View>
  );
}

export function RadioGroup<T extends string>({
  items,
  value,
  onValueChange,
  accessibilityLabel,
  orientation = 'vertical',
  style,
  className,
  testID,
}: RadioGroupProps<T>): ReactElement {
  const theme = useTheme();
  const styles = getStyles(theme);
  const reactId = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const refs = useRef<Array<Focusable | null>>([]);
  const enabledIndices = items.reduce<number[]>((indices, item, index) => {
    if (!item.disabled) indices.push(index);
    return indices;
  }, []);
  const selectedIndex = items.findIndex((item) => item.value === value && !item.disabled);
  const rovingIndex = selectedIndex >= 0 ? selectedIndex : (enabledIndices[0] ?? -1);

  function moveFrom(index: number, direction: 1 | -1): void {
    if (enabledIndices.length === 0) return;
    const position = enabledIndices.indexOf(index);
    const currentPosition = position >= 0 ? position : 0;
    const nextPosition =
      (currentPosition + direction + enabledIndices.length) % enabledIndices.length;
    const nextIndex = enabledIndices[nextPosition];
    if (nextIndex === undefined) return;
    const next = items[nextIndex];
    if (next === undefined) return;
    onValueChange(next.value);
    refs.current[nextIndex]?.focus?.();
  }

  function moveToBoundary(position: 'first' | 'last'): void {
    const nextIndex =
      position === 'first' ? enabledIndices[0] : enabledIndices[enabledIndices.length - 1];
    if (nextIndex === undefined) return;
    const next = items[nextIndex];
    if (next === undefined) return;
    onValueChange(next.value);
    refs.current[nextIndex]?.focus?.();
  }

  return (
    <View
      accessibilityRole="radiogroup"
      role="radiogroup"
      accessibilityLabel={accessibilityLabel}
      aria-label={accessibilityLabel}
      {...(Platform.OS === 'web'
        ? ({ 'aria-orientation': orientation } as unknown as Record<string, unknown>)
        : {})}
      testID={testID}
      {...nativeWindProps(className)}
      style={[
        orientation === 'horizontal' ? styles.groupHorizontal : styles.groupVertical,
        style,
      ]}
    >
      {items.map((item, index) => {
        const checked = item.value === value;
        const disabled = item.disabled === true;
        const descriptionId = item.description === undefined
          ? undefined
          : `gj-radio-${reactId}-${index}-description`;
        const accessibilityProps = {
          accessible: true,
          accessibilityRole: 'radio' as const,
          role: 'radio' as const,
          accessibilityLabel: item.label,
          'aria-label': item.label,
          accessibilityHint: item.description,
          accessibilityState: { checked, disabled },
          'aria-checked': checked,
          'aria-disabled': disabled,
          ...(Platform.OS === 'web' && descriptionId !== undefined
            ? ({ 'aria-describedby': descriptionId } as Record<string, unknown>)
            : {}),
        };
        const itemStyle = [styles.item, { opacity: disabled ? 0.5 : 1 }];
        const content = (
          <>
            <View
              aria-hidden
              importantForAccessibility="no-hide-descendants"
              style={[
                styles.indicator,
                {
                  width: theme.metrics.icon.lg,
                  height: theme.metrics.icon.lg,
                  borderColor: checked ? theme.colors.primary : theme.colors.textSubtle,
                  backgroundColor: theme.colors.surface,
                },
              ]}
            >
              {checked ? (
                <View
                  style={[
                    styles.dot,
                    {
                      width: theme.spacing.sm,
                      height: theme.spacing.sm,
                      backgroundColor: theme.colors.primary,
                    },
                  ]}
                />
              ) : null}
            </View>
            <RadioCopy
              label={item.label}
              description={item.description}
              descriptionId={descriptionId}
            />
          </>
        );

        if (Platform.OS === 'web') {
          const onKeyDown = (event: WebKeyboardEvent) => {
            if (disabled) return;
            switch (event.key) {
              case ' ':
              case 'Space':
              case 'Spacebar':
                event.preventDefault();
                onValueChange(item.value);
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
                onClick: () => {
                  if (!disabled) onValueChange(item.value);
                },
                onKeyDown,
              } as unknown as Record<string, unknown>)}
              style={itemStyle}
            >
              {content}
            </View>
          );
        }

        return (
          <Pressable
            key={item.value}
            {...accessibilityProps}
            disabled={disabled}
            onPress={() => onValueChange(item.value)}
            hitSlop={theme.spacing.sm}
            style={({ pressed }) => [
              itemStyle,
              pressed && !disabled ? { opacity: 0.82 } : null,
            ]}
          >
            {content}
          </Pressable>
        );
      })}
    </View>
  );
}
