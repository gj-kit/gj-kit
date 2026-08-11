/**
 * SelectionIndicator / SelectableRow / SelectAllRow — design doc §5.7.
 *
 * The SelectionSize literal union stays — the type guarantees a host's
 * size-to-class map is exhaustive (§0 rejected: dropping the union in C).
 */
import type { ReactElement, ReactNode } from 'react';
import { Pressable, Text as RNText, View } from 'react-native';
import type { StyleProp, TextStyle } from 'react-native';
import type { Theme } from '../theme/tokens';
import { nativeWindProps, themedStyles } from './internal';
import type { CommonProps } from './internal';
import { renderIconSlot } from './icons';
import type { RenderIcon } from './icons';
import { useIcons, useStrings, useTheme } from './provider';

export type SelectionSize = 16 | 18 | 20 | 24;

const SELECTION_DEFAULT_SIZE: SelectionSize = 24;
/** The mark size ratio and minimum — the predecessor's measured values, preserved. */
const SELECTION_MARK_RATIO = 0.58;
const SELECTION_MARK_MIN = 10;

export interface SelectionIndicatorProps extends Omit<CommonProps, 'unstyled'> {
  selected: boolean;
  showUncheckedMark?: boolean | undefined;
  size?: SelectionSize | undefined;
  /** Defaults to icons.check, falling back to a ✓ text glyph (§4.2). */
  renderMark?: RenderIcon | undefined;
  unstyled?: never;
}

const getStyles = themedStyles((theme: Theme) => ({
  circle: {
    alignItems: 'center' as const,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    justifyContent: 'center' as const,
  },
  glyph: {
    fontWeight: theme.typography.title.fontWeight,
    includeFontPadding: false,
    lineHeight: theme.typography.caption.lineHeight,
  },
  row: {
    alignItems: 'center' as const,
    flexDirection: 'row' as const,
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
  },
  selectAllLabel: {
    fontSize: theme.typography.button.fontSize,
    fontWeight: theme.typography.button.fontWeight,
  },
}));

export function SelectionIndicator({
  selected,
  showUncheckedMark = false,
  size = SELECTION_DEFAULT_SIZE,
  renderMark,
  style,
  className,
  testID,
}: SelectionIndicatorProps): ReactElement {
  const theme = useTheme();
  const icons = useIcons();
  const styles = getStyles(theme);
  const color = selected ? theme.colors.onPrimary : theme.colors.textSubtle;
  const markSize = Math.max(SELECTION_MARK_MIN, Math.round(size * SELECTION_MARK_RATIO));
  const showMark = selected || showUncheckedMark;
  const mark = renderMark ?? icons.check;

  return (
    <View
      testID={testID}
      {...nativeWindProps(className)}
      style={[
        styles.circle,
        {
          width: size,
          height: size,
          borderColor: selected ? theme.colors.primary : theme.colors.line,
          backgroundColor: selected ? theme.colors.primary : theme.colors.surface,
        },
        style,
      ]}
    >
      {showMark ? (
        mark ? (
          renderIconSlot(mark, { color, size: markSize })
        ) : (
          <RNText style={[styles.glyph, { color, fontSize: markSize }]}>✓</RNText>
        )
      ) : null}
    </View>
  );
}

export interface SelectableRowProps extends Omit<CommonProps, 'unstyled'> {
  children?: ReactNode | undefined;
  selected: boolean;
  onPress: () => void;
  disabled?: boolean | undefined;
  accessibilityLabel?: string | undefined;
  indicatorSize?: SelectionSize | undefined;
  renderMark?: RenderIcon | undefined;
  unstyled?: never;
}

export function SelectableRow({
  children,
  selected,
  onPress,
  disabled,
  accessibilityLabel,
  indicatorSize,
  renderMark,
  style,
  className,
  testID,
}: SelectableRowProps): ReactElement {
  const theme = useTheme();
  const styles = getStyles(theme);
  return (
    <Pressable
      accessibilityRole="button"
      {...(accessibilityLabel !== undefined ? { accessibilityLabel } : {})}
      accessibilityState={{ selected, ...(disabled !== undefined ? { disabled } : {}) }}
      aria-selected={selected}
      onPress={onPress}
      disabled={disabled}
      testID={testID}
      {...nativeWindProps(className)}
      style={({ pressed }) => [styles.row, pressed && !disabled ? { opacity: 0.82 } : null, style]}
    >
      <SelectionIndicator
        selected={selected}
        {...(indicatorSize !== undefined ? { size: indicatorSize } : {})}
        {...(renderMark !== undefined ? { renderMark } : {})}
      />
      {children}
    </Pressable>
  );
}

export interface SelectAllRowProps extends Omit<CommonProps, 'unstyled'> {
  selected: boolean;
  onPress: () => void;
  disabled?: boolean | undefined;
  /** Cleans up the former showUncheckedCheck (§5.7). */
  showUncheckedMark?: boolean | undefined;
  checkSize?: SelectionSize | undefined;
  /** Defaults to strings.selectAll (§4.1). */
  selectLabel?: string | undefined;
  /** Defaults to strings.deselectAll. */
  deselectLabel?: string | undefined;
  renderMark?: RenderIcon | undefined;
  labelStyle?: StyleProp<TextStyle> | undefined;
  labelClassName?: string | undefined;
  unstyled?: never;
}

export function SelectAllRow({
  selected,
  onPress,
  disabled,
  showUncheckedMark,
  checkSize = SELECTION_DEFAULT_SIZE,
  selectLabel,
  deselectLabel,
  renderMark,
  labelStyle,
  labelClassName,
  style,
  className,
  testID,
}: SelectAllRowProps): ReactElement {
  const theme = useTheme();
  const strings = useStrings();
  const styles = getStyles(theme);
  const label = selected ? (deselectLabel ?? strings.deselectAll) : (selectLabel ?? strings.selectAll);

  // SelectableRow를 경유하지 않고 직접 렌더 — 전신은 showUncheckedCheck를 받아놓고
  // SelectableRow 경유에서 조용히 유실했다(잠재 버그). 여기서는 prop이 실제 동작한다.
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected, ...(disabled !== undefined ? { disabled } : {}) }}
      aria-selected={selected}
      onPress={onPress}
      disabled={disabled}
      testID={testID}
      {...nativeWindProps(className)}
      style={({ pressed }) => [styles.row, pressed && !disabled ? { opacity: 0.82 } : null, style]}
    >
      <SelectionIndicator
        selected={selected}
        {...(showUncheckedMark !== undefined ? { showUncheckedMark } : {})}
        size={checkSize}
        {...(renderMark !== undefined ? { renderMark } : {})}
      />
      <RNText
        {...nativeWindProps(labelClassName)}
        style={[
          styles.selectAllLabel,
          { color: theme.colors.text },
          theme.typography.fontFamily !== undefined
            ? { fontFamily: theme.typography.fontFamily }
            : null,
          labelStyle,
        ]}
      >
        {label}
      </RNText>
    </Pressable>
  );
}
