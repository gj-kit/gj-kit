/**
 * Badge / Alert — short status labels and inline feedback.
 *
 * Color resolves only from the per-status soft, strong, and on-color token pairs.
 * Alert is a static description by default, so it uses live="off"; specify polite
 * or assertive only when announcing an asynchronous update. A live region never
 * moves focus.
 */
import type { ReactElement, ReactNode } from 'react';
import { Platform, StyleSheet, Text as RNText, View } from 'react-native';
import type { StyleProp, TextStyle } from 'react-native';
import type { Theme } from '../theme/tokens';
import { Button, IconButton } from './button';
import { renderIconSlot } from './icons';
import type { IconRenderProps, RenderIcon } from './icons';
import { mergeClassNames, nativeWindProps, themedStyles } from './internal';
import type { CommonProps } from './internal';
import { useIcons, useStrings, useTheme } from './provider';
import { roleTextStyle } from './text';

export type StatusVariant = 'neutral' | 'info' | 'success' | 'warning' | 'error';
export type BadgeSize = 'sm' | 'md';
export type AlertLive = 'off' | 'polite' | 'assertive';

type StatusPalette = {
  soft: string;
  foreground: string;
};

/** Pins the mapping in one place so a status never borrows a color token that means something else. */
function statusPalette(variant: StatusVariant, theme: Theme): StatusPalette {
  switch (variant) {
    case 'info':
      return {
        soft: theme.colors.infoSoft,
        foreground: theme.colors.info,
      };
    case 'success':
      return {
        soft: theme.colors.successSoft,
        foreground: theme.colors.success,
      };
    case 'warning':
      return {
        soft: theme.colors.warningSoft,
        foreground: theme.colors.warning,
      };
    case 'error':
      return {
        soft: theme.colors.dangerSoft,
        foreground: theme.colors.danger,
      };
    default:
      return {
        soft: theme.colors.surfaceSubtle,
        foreground: theme.colors.text,
      };
  }
}

const getStyles = themedStyles((theme: Theme) => ({
  badge: {
    alignItems: 'center' as const,
    alignSelf: 'flex-start' as const,
    borderRadius: theme.radius.pill,
    flexDirection: 'row' as const,
  },
  badgeSm: {
    gap: theme.spacing.xs,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
  },
  badgeMd: {
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  badgeLabel: { includeFontPadding: false },
  alert: {
    alignItems: 'flex-start' as const,
    borderRadius: theme.radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row' as const,
    gap: theme.spacing.md,
    padding: theme.spacing.lg,
  },
  alertCopy: {
    flex: 1,
    gap: theme.spacing.xs,
  },
  alertAction: {
    alignSelf: 'flex-start' as const,
    marginTop: theme.spacing.sm,
  },
  closeGlyph: {
    fontWeight: theme.typography.title.fontWeight,
    includeFontPadding: false,
    textAlign: 'center' as const,
  },
}));

export interface BadgeProps extends Omit<CommonProps, 'unstyled'> {
  label: string;
  /** Defaults to 'neutral'. */
  variant?: StatusVariant | undefined;
  /** Defaults to 'md'. */
  size?: BadgeSize | undefined;
  /** A static node, or an icon render function that receives color and size. */
  leading?: ReactNode | RenderIcon | undefined;
  labelStyle?: StyleProp<TextStyle> | undefined;
  labelClassName?: string | undefined;
  unstyled?: never;
}

export function Badge({
  label,
  variant = 'neutral',
  size = 'md',
  leading,
  labelStyle,
  labelClassName,
  style,
  className,
  testID,
}: BadgeProps): ReactElement {
  const theme = useTheme();
  const styles = getStyles(theme);
  const palette = statusPalette(variant, theme);
  const textRole = size === 'sm' ? 'caption' : 'label';
  const iconSize = size === 'sm' ? theme.metrics.icon.sm : theme.metrics.icon.md;

  return (
    <View
      testID={testID}
      {...nativeWindProps(className)}
      style={[
        styles.badge,
        size === 'sm' ? styles.badgeSm : styles.badgeMd,
        { backgroundColor: palette.soft },
        style,
      ]}
    >
      {renderIconSlot(leading, { color: palette.foreground, size: iconSize })}
      <RNText
        {...nativeWindProps(mergeClassNames(labelClassName))}
        style={[
          roleTextStyle(theme, textRole),
          styles.badgeLabel,
          { color: palette.foreground },
          labelStyle,
        ]}
      >
        {label}
      </RNText>
    </View>
  );
}

type AlertOwnProps = Omit<CommonProps, 'unstyled'> & {
  /** Defaults to 'info'. neutral is not allowed because it carries no notification intent. */
  variant?: Exclude<StatusVariant, 'neutral'> | undefined;
  /** Falls back to icons.toast[variant]. */
  leading?: ReactNode | RenderIcon | undefined;
  action?: { readonly label: string; readonly onPress: () => void } | undefined;
  /** Renders the close button only when present. */
  onDismiss?: (() => void) | undefined;
  /** Defaults to strings.close. */
  dismissAccessibilityLabel?: string | undefined;
  /** Defaults to 'off'. Opt in only for notices that are inserted or updated dynamically. */
  live?: AlertLive | undefined;
  unstyled?: never;
};

/** Either a title or non-empty children must be present. */
export type AlertProps = AlertOwnProps &
  (
    | { title: string; children?: ReactNode | undefined }
    | { title?: never; children: NonNullable<ReactNode> }
  );

/** The built-in text fallback that keeps the dismiss affordance from disappearing when icons.close is absent. */
function closeGlyph(
  iconProps: IconRenderProps,
  style: TextStyle,
): ReactElement {
  return (
    <RNText style={[style, { color: iconProps.color, fontSize: iconProps.size }]} aria-hidden>
      ×
    </RNText>
  );
}

export function Alert(props: AlertProps): ReactElement {
  const {
    title,
    children,
    variant = 'info',
    leading,
    action,
    onDismiss,
    dismissAccessibilityLabel,
    live = 'off',
    style,
    className,
    testID,
  } = props;
  const theme = useTheme();
  const strings = useStrings();
  const icons = useIcons();
  const styles = getStyles(theme);
  const palette = statusPalette(variant, theme);
  const resolvedLeading = renderIconSlot(leading ?? icons.toast?.[variant], {
    color: palette.foreground,
    size: theme.metrics.icon.md,
  });
  const dismissIcon: RenderIcon =
    icons.close ?? ((iconProps) => closeGlyph(iconProps, styles.closeGlyph));

  // ARIA status는 웹 역할이다. 네이티브에는 live-region만 전달하고 역할을 꾸며내지 않는다.
  const politeRoleBridge =
    Platform.OS === 'web' && live === 'polite' ? ({ role: 'status' } as const) : {};

  return (
    <View
      testID={testID}
      accessibilityRole={live === 'assertive' ? 'alert' : undefined}
      accessibilityLiveRegion={live === 'off' ? 'none' : live}
      aria-live={live}
      {...politeRoleBridge}
      {...nativeWindProps(className)}
      style={[
        styles.alert,
        { backgroundColor: palette.soft, borderColor: palette.foreground },
        style,
      ]}
    >
      {resolvedLeading}
      <View style={styles.alertCopy}>
        {title !== undefined ? (
          <RNText style={[roleTextStyle(theme, 'label'), { color: palette.foreground }]}>{title}</RNText>
        ) : null}
        {children !== undefined ? (
          typeof children === 'string' || typeof children === 'number' ? (
            <RNText
              style={[
                roleTextStyle(theme, title === undefined ? 'label' : 'caption'),
                { color: palette.foreground },
              ]}
            >
              {children}
            </RNText>
          ) : (
            children
          )
        ) : null}
        {action ? (
          <Button
            label={action.label}
            onPress={action.onPress}
            variant="secondary"
            size="sm"
            style={styles.alertAction}
          />
        ) : null}
      </View>
      {onDismiss ? (
        <IconButton
          accessibilityLabel={dismissAccessibilityLabel ?? strings.close}
          icon={dismissIcon}
          onPress={onDismiss}
          size={theme.metrics.control.sm}
        />
      ) : null}
    </View>
  );
}
