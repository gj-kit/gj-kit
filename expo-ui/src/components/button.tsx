/**
 * Button / IconButton — design doc §5.2, §5.3.
 *
 * Dimensions come from metrics.control, type from typography, color from colors,
 * and corners from radius — no design literal in the stylesheet (enforced by
 * token-guard, §1 invariant 1).
 */
import type { ReactElement, ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text as RNText } from 'react-native';
import type { StyleProp, TextStyle, ViewStyle } from 'react-native';
import type { Theme } from '../theme/tokens';
import { mergeClassNames, nativeWindProps, themedStyles } from './internal';
import type { CommonProps } from './internal';
import { renderIconSlot } from './icons';
import type { RenderIcon } from './icons';
import { useTheme } from './provider';

/** Renamed from 'dark' to 'inverse' — resolves the inverted meaning of a "dark" variant getting lighter in the dark theme (§5.2). */
export type ButtonVariant =
  | 'primary'
  | 'primary-outline'
  | 'secondary'
  /** A transparent action that uses the ordinary text color. */
  | 'ghost'
  | 'destructive'
  | 'destructive-outline'
  | 'inverse';

export type ButtonSize = 'sm' | 'md' | 'lg';

type ButtonPalette = {
  backgroundColor: string;
  borderColor?: string | undefined;
  textColor: string;
};

/** (internal) variant × disabled to resolved colors. Inherited from the predecessor's buttonPalette — all token-derived. */
export function buttonPalette(variant: ButtonVariant, disabled: boolean, theme: Theme): ButtonPalette {
  if (disabled) {
    if (variant === 'ghost') {
      return {
        // Transparency is structural rather than a design color; the disabled label still comes from a theme token.
        backgroundColor: 'transparent',
        textColor: theme.colors.textSubtle,
      };
    }
    return {
      backgroundColor:
        variant === 'primary' || variant === 'destructive' || variant === 'inverse'
          ? theme.colors.line
          : theme.colors.surfaceSubtle,
      borderColor: theme.colors.line,
      textColor: theme.colors.textSubtle,
    };
  }
  switch (variant) {
    case 'primary-outline':
      return {
        backgroundColor: theme.colors.surface,
        borderColor: theme.colors.primary,
        textColor: theme.colors.primary,
      };
    case 'secondary':
      return {
        backgroundColor: theme.colors.surface,
        borderColor: theme.colors.line,
        textColor: theme.colors.text,
      };
    case 'ghost':
      // Transparency is structural rather than a design color; the label and icon stay token-derived.
      return { backgroundColor: 'transparent', textColor: theme.colors.text };
    case 'destructive':
      return { backgroundColor: theme.colors.dangerStrong, textColor: theme.colors.onDanger };
    case 'destructive-outline':
      return {
        backgroundColor: theme.colors.surface,
        borderColor: theme.colors.danger,
        textColor: theme.colors.danger,
      };
    case 'inverse':
      // 진짜 역상 — 라이트에선 진한 배경/밝은 라벨, 다크에선 그 반대(구 'dark'의 의미 교정).
      return { backgroundColor: theme.colors.text, textColor: theme.colors.background };
    default:
      return { backgroundColor: theme.colors.primary, textColor: theme.colors.onPrimary };
  }
}

/**
 * (internal) Per-size dimensions — the tokenized form of the predecessor's
 * buttonSizes (36/44/52, fontSize 13/14/15). fontSize comes from the
 * label(13)/button(14)/body(15) roles and the weight from the button role.
 */
function buttonDimensions(theme: Theme, size: ButtonSize) {
  const fontSize = {
    sm: theme.typography.label.fontSize,
    md: theme.typography.button.fontSize,
    lg: theme.typography.body.fontSize,
  }[size];
  const padding = {
    sm: { paddingHorizontal: theme.spacing.md, paddingVertical: theme.spacing.sm },
    md: { paddingHorizontal: theme.spacing.lg, paddingVertical: theme.spacing.md },
    lg: { paddingHorizontal: theme.spacing.xl, paddingVertical: theme.spacing.md },
  }[size];
  return { minHeight: theme.metrics.control[size], fontSize, ...padding };
}

export const PRESSABLE_FEEDBACK_CLASS = 'hover:brightness-90 active:scale-[0.98]';

type ButtonAction = () => void;

/**
 * An enabled control must have work to do. The inert branches intentionally
 * allow an omitted callback so loading placeholders and disabled permissions do
 * not need meaningless no-op handlers.
 */
type ButtonInteractionProps =
  | {
      onPress: ButtonAction;
      disabled?: boolean | undefined;
      loading?: boolean | undefined;
    }
  | {
      onPress?: ButtonAction | undefined;
      disabled: true;
      loading?: boolean | undefined;
    }
  | {
      onPress?: ButtonAction | undefined;
      disabled?: boolean | undefined;
      loading: true;
    };

type ButtonOwnProps = {
  variant?: ButtonVariant | undefined;
  size?: ButtonSize | undefined;
  /** A static node or a render function — unifies the predecessor's icon, renderIcon, and iconColor trio (§5.2). */
  icon?: ReactNode | RenderIcon | undefined;
  /** Defaults to metrics.icon.md. */
  iconSize?: number | undefined;
  /** Prevents label clipping in a fixed-height button. Defaults to metrics.maxFontScale. */
  maxFontSizeMultiplier?: number | undefined;
  labelStyle?: StyleProp<TextStyle> | undefined;
  labelClassName?: string | undefined;
} & CommonProps;

type ButtonTextChildren = string | number;
type ButtonCustomChildren = Exclude<ReactNode, ButtonTextChildren | boolean | null | undefined>;

type ButtonContentProps =
  | {
      /** Visible text and the default accessible name. */
      label: string;
      children?: ReactNode | undefined;
      accessibilityLabel?: string | undefined;
    }
  | {
      label?: never;
      /** Text children supply the default accessible name. */
      children: ButtonTextChildren;
      accessibilityLabel?: string | undefined;
    }
  | {
      label?: never;
      /** Rich children require an explicit name on the owning button. */
      children: ButtonCustomChildren;
      accessibilityLabel: string;
    };

/**
 * A Button always has both visible content and a non-empty accessible name. Text
 * labels and text children name themselves; arbitrary rich children require an
 * explicit accessibilityLabel. Enabled controls also require onPress. For an
 * icon-only action, use IconButton.
 */
export type ButtonProps = ButtonOwnProps & ButtonContentProps & ButtonInteractionProps;

function assertNonBlankString(value: unknown, name: string): asserts value is string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${name} must be a non-empty string.`);
  }
}

function assertActionContract({
  componentName,
  disabled,
  loading,
  onPress,
}: {
  readonly componentName: string;
  readonly disabled: boolean;
  readonly loading: boolean;
  readonly onPress: unknown;
}): void {
  if (!disabled && !loading && typeof onPress !== 'function') {
    throw new Error(`${componentName} requires onPress unless disabled or loading.`);
  }
}

function resolveButtonAccessibilityLabel({
  label,
  children,
  accessibilityLabel,
}: {
  readonly label: string | undefined;
  readonly children: ReactNode | undefined;
  readonly accessibilityLabel: string | undefined;
}): string {
  const inferred =
    label ??
    (typeof children === 'string' || typeof children === 'number' ? String(children) : undefined);
  // An explicit accessible name must not turn an empty visible text branch into
  // an invisible button. Rich children are separately allowed because their
  // visible content is owned by the child; text branches must contain text.
  if (inferred !== undefined) {
    assertNonBlankString(inferred, 'Button label or text children');
  }
  const resolved = accessibilityLabel ?? inferred;
  assertNonBlankString(resolved, 'Button accessibilityLabel');
  return resolved;
}

const getStyles = themedStyles((theme: Theme) => ({
  button: {
    alignItems: 'center' as const,
    borderRadius: theme.radius.sm,
    flexDirection: 'row' as const,
    gap: theme.spacing.sm,
    justifyContent: 'center' as const,
  },
  label: {
    fontWeight: theme.typography.button.fontWeight,
    includeFontPadding: false,
  },
}));

export function Button(props: ButtonProps): ReactElement {
  const {
    label,
    children,
    onPress,
    variant = 'primary',
    size = 'md',
    disabled = false,
    loading = false,
    icon,
    iconSize,
    maxFontSizeMultiplier,
    accessibilityLabel,
    labelStyle,
    labelClassName,
    style,
    className,
    testID,
  } = props;
  const theme = useTheme();
  const styles = getStyles(theme);
  const inert = disabled && !loading;
  const palette = buttonPalette(variant, inert, theme);
  const dimensions = buttonDimensions(theme, size);
  const content = label ?? children;
  const resolvedAccessibilityLabel = resolveButtonAccessibilityLabel({
    label,
    children,
    accessibilityLabel,
  });
  assertActionContract({
    componentName: 'Button',
    disabled,
    loading,
    onPress,
  });

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={resolvedAccessibilityLabel}
      // 전신의 unstyled 분기별 busy 비일관 제거 — 단일 계약(§5.2).
      // aria-* 병기 — RNW는 accessibilityState 객체를 DOM aria로 매핑하지 않는다(테스트 실측).
      accessibilityState={{ disabled: Boolean(disabled || loading), busy: loading }}
      aria-busy={loading}
      aria-disabled={Boolean(disabled || loading)}
      testID={testID}
      disabled={disabled || loading}
      onPress={onPress}
      {...nativeWindProps(mergeClassNames(PRESSABLE_FEEDBACK_CLASS, className))}
      style={({ pressed }) => [
        styles.button,
        {
          minHeight: dimensions.minHeight,
          paddingHorizontal: dimensions.paddingHorizontal,
          paddingVertical: dimensions.paddingVertical,
          backgroundColor: palette.backgroundColor,
          borderColor: palette.borderColor ?? palette.backgroundColor,
          borderWidth: palette.borderColor ? StyleSheet.hairlineWidth : 0,
          opacity: pressed && !disabled && !loading ? 0.9 : 1,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={palette.textColor} />
      ) : (
        <>
          {renderIconSlot(icon, {
            color: palette.textColor,
            size: iconSize ?? theme.metrics.icon.md,
          })}
          {typeof content === 'string' || typeof content === 'number' ? (
            <RNText
              {...nativeWindProps(labelClassName)}
              numberOfLines={1}
              maxFontSizeMultiplier={maxFontSizeMultiplier ?? theme.metrics.maxFontScale}
              style={[
                styles.label,
                {
                  color: palette.textColor,
                  fontSize: dimensions.fontSize,
                  ...(theme.typography.fontFamily !== undefined
                    ? { fontFamily: theme.typography.fontFamily }
                    : {}),
                },
                labelStyle,
              ]}
            >
              {content}
            </RNText>
          ) : (
            content
          )}
        </>
      )}
    </Pressable>
  );
}

type IconButtonBaseProps = {
  /** Required — prevents a screen reader blank on an icon-only button (§6 ②). */
  accessibilityLabel: string;
  icon: ReactNode | RenderIcon;
  variant?: ButtonVariant | undefined;
  /** The diameter. Defaults to 40 — the mark size is derived automatically (size × 0.48). */
  size?: number | undefined;
  style?: StyleProp<ViewStyle> | undefined;
  className?: string | undefined;
  testID?: string | undefined;
  unstyled?: never;
};

/** An icon action needs a non-empty name and onPress unless it is inert. */
export type IconButtonProps = IconButtonBaseProps & ButtonInteractionProps;

const getIconButtonStyles = themedStyles((theme: Theme) => ({
  circle: {
    alignItems: 'center' as const,
    borderRadius: theme.radius.pill,
    justifyContent: 'center' as const,
  },
}));

const ICON_BUTTON_DEFAULT_SIZE = 40;
const ICON_BUTTON_MARK_RATIO = 0.48;

export function IconButton({
  accessibilityLabel,
  icon,
  onPress,
  variant = 'secondary',
  size = ICON_BUTTON_DEFAULT_SIZE,
  disabled = false,
  loading = false,
  style,
  className,
  testID,
}: IconButtonProps): ReactElement {
  assertNonBlankString(accessibilityLabel, 'IconButton accessibilityLabel');
  assertActionContract({
    componentName: 'IconButton',
    disabled,
    loading,
    onPress,
  });
  const theme = useTheme();
  const styles = getIconButtonStyles(theme);
  const palette = buttonPalette(variant, disabled && !loading, theme);
  const content = renderIconSlot(icon, {
    color: palette.textColor,
    size: Math.round(size * ICON_BUTTON_MARK_RATIO),
  });

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      aria-busy={loading}
      aria-disabled={disabled || loading}
      disabled={disabled || loading}
      onPress={onPress}
      testID={testID}
      {...nativeWindProps(mergeClassNames(PRESSABLE_FEEDBACK_CLASS, className))}
      style={({ pressed }) => [
        styles.circle,
        {
          width: size,
          height: size,
          backgroundColor: palette.backgroundColor,
          borderColor: palette.borderColor ?? palette.backgroundColor,
          borderWidth: palette.borderColor ? StyleSheet.hairlineWidth : 0,
          opacity: pressed && !disabled && !loading ? 0.9 : 1,
        },
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={palette.textColor} /> : content}
    </Pressable>
  );
}
