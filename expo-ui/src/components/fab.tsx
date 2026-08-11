/** FloatingActionButton — places a screen's primary action together with the edge insets. */
import type { ReactElement, ReactNode } from 'react';
import { ActivityIndicator, Pressable, Text as RNText, View } from 'react-native';
import type { StyleProp, TextStyle, ViewStyle } from 'react-native';
import type { SpacingKey, TextRole, Theme } from '../theme/tokens';
import { PRESSABLE_FEEDBACK_CLASS } from './button';
import { renderIconSlot } from './icons';
import type { RenderIcon } from './icons';
import {
  elevationStyle,
  mergeClassNames,
  nativeWindProps,
  resolveSpacing,
  themedStyles,
} from './internal';
import { useTheme } from './provider';
import { roleTextStyle } from './text';

export type FABSize = 'sm' | 'md' | 'lg';
export type FABVariant = 'primary' | 'secondary';
export type FABPlacement = 'bottom-start' | 'bottom-center' | 'bottom-end';

type FABBaseProps = {
  onPress: () => void;
  /** Defaults to 'md'. */
  size?: FABSize | undefined;
  /** Defaults to 'primary'. */
  variant?: FABVariant | undefined;
  /** Logical placement that follows RTL. Defaults to 'bottom-end'. */
  placement?: FABPlacement | undefined;
  /** The margin from the screen edge. Defaults to 'xl'. */
  offset?: SpacingKey | number | undefined;
  /** Pass the result of a safe-area hook. Defaults to 0. */
  bottomInset?: number | undefined;
  disabled?: boolean | undefined;
  loading?: boolean | undefined;
  style?: StyleProp<ViewStyle> | undefined;
  className?: string | undefined;
  testID?: string | undefined;
  unstyled?: never;
};

type IconOnlyFABProps = {
  icon: NonNullable<ReactNode> | RenderIcon;
  /** When only an icon is visible, the action name is required. */
  accessibilityLabel: string;
  label?: never;
  labelStyle?: never;
  labelClassName?: never;
};

type ExtendedFABProps = {
  label: string;
  icon?: NonNullable<ReactNode> | RenderIcon | undefined;
  accessibilityLabel?: string | undefined;
  labelStyle?: StyleProp<TextStyle> | undefined;
  labelClassName?: string | undefined;
};

export type FABProps = FABBaseProps & (IconOnlyFABProps | ExtendedFABProps);

type FABPalette = {
  backgroundColor: string;
  foregroundColor: string;
  borderColor: string;
  borderWidth: number;
};

function fabPalette(theme: Theme, variant: FABVariant, inert: boolean): FABPalette {
  if (inert) {
    return {
      backgroundColor: theme.colors.line,
      foregroundColor: theme.colors.textSubtle,
      borderColor: theme.colors.line,
      borderWidth: 0,
    };
  }
  return variant === 'secondary'
    ? {
        backgroundColor: theme.colors.surface,
        foregroundColor: theme.colors.text,
        borderColor: theme.colors.line,
        borderWidth: 1,
      }
    : {
        backgroundColor: theme.colors.primary,
        foregroundColor: theme.colors.onPrimary,
        borderColor: theme.colors.primary,
        borderWidth: 0,
      };
}

function fabTextRole(size: FABSize): TextRole {
  return size === 'sm' ? 'label' : size === 'lg' ? 'body' : 'button';
}

function fabHorizontalPadding(theme: Theme, size: FABSize): number {
  return size === 'sm'
    ? theme.spacing.md
    : size === 'lg'
      ? theme.spacing.xl
      : theme.spacing.lg;
}

const getStyles = themedStyles((theme: Theme) => ({
  button: {
    alignItems: 'center' as const,
    borderRadius: theme.radius.pill,
    flexDirection: 'row' as const,
    justifyContent: 'center' as const,
  },
  label: {
    includeFontPadding: false,
  },
}));

export function FloatingActionButton(props: FABProps): ReactElement {
  const {
    onPress,
    size = 'md',
    variant = 'primary',
    placement = 'bottom-end',
    offset = 'xl',
    bottomInset = 0,
    disabled = false,
    loading = false,
    style,
    className,
    testID,
  } = props;
  const theme = useTheme();
  const styles = getStyles(theme);
  const inert = disabled || loading;
  const palette = fabPalette(theme, variant, inert);
  const dimension = theme.metrics.control[size];
  const iconSize = theme.metrics.icon[size];
  const resolvedOffset = resolveSpacing(theme, offset);
  const hitSlop = Math.max(0, (theme.metrics.control.md - dimension) / 2);
  const hasLabel = 'label' in props && props.label !== undefined;
  const placementStyle: ViewStyle = {
    position: 'absolute',
    bottom: resolvedOffset + bottomInset,
    ...(placement === 'bottom-start'
      ? { start: resolvedOffset }
      : placement === 'bottom-end'
        ? { end: resolvedOffset }
        : { alignSelf: 'center' as const }),
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={props.accessibilityLabel ?? (hasLabel ? props.label : undefined)}
      accessibilityState={{ disabled: inert, busy: loading }}
      aria-busy={loading}
      aria-disabled={inert}
      disabled={inert}
      hitSlop={hitSlop}
      onPress={onPress}
      testID={testID}
      {...nativeWindProps(mergeClassNames(PRESSABLE_FEEDBACK_CLASS, className))}
      style={({ pressed }) => [
        styles.button,
        placementStyle,
        {
          minHeight: dimension,
          minWidth: dimension,
          gap: theme.spacing.sm,
          paddingHorizontal: hasLabel ? fabHorizontalPadding(theme, size) : 0,
          backgroundColor: palette.backgroundColor,
          borderColor: palette.borderColor,
          borderWidth: palette.borderWidth,
          opacity: pressed && !inert ? 0.9 : 1,
        },
        elevationStyle(theme.elevation.md, theme.colors.shadow),
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={palette.foregroundColor} />
      ) : (
        <>
          {props.icon !== undefined ? (
            <View
              aria-hidden
              accessible={false}
              importantForAccessibility="no-hide-descendants"
            >
              {renderIconSlot(props.icon, { color: palette.foregroundColor, size: iconSize })}
            </View>
          ) : null}
          {hasLabel ? (
            <RNText
              numberOfLines={1}
              maxFontSizeMultiplier={theme.metrics.maxFontScale}
              {...nativeWindProps(props.labelClassName)}
              style={[
                roleTextStyle(theme, fabTextRole(size)),
                styles.label,
                { color: palette.foregroundColor },
                props.labelStyle,
              ]}
            >
              {props.label}
            </RNText>
          ) : null}
        </>
      )}
    </Pressable>
  );
}
