/**
 * Badge / Alert — 짧은 상태 라벨과 인라인 피드백.
 *
 * 색은 상태별 soft·strong·on-color 토큰 쌍에서만 해석한다. Alert는 기본적으로
 * 정적인 설명이므로 live="off"이며, 비동기 갱신을 알릴 때만 polite/assertive를
 * 명시한다. 라이브 영역은 포커스를 이동하지 않는다.
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

/** 상태가 다른 의미의 색 토큰을 빌리지 않도록 매핑을 한곳에 고정한다. */
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
  /** 기본 'neutral'. */
  variant?: StatusVariant | undefined;
  /** 기본 'md'. */
  size?: BadgeSize | undefined;
  /** 정적 노드 또는 색·크기를 받는 아이콘 렌더 함수. */
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
  /** 기본 'info'. neutral은 알림 의도가 아니므로 허용하지 않는다. */
  variant?: Exclude<StatusVariant, 'neutral'> | undefined;
  /** 미지정 시 icons.toast[variant]. */
  leading?: ReactNode | RenderIcon | undefined;
  action?: { readonly label: string; readonly onPress: () => void } | undefined;
  /** 있을 때만 닫기 버튼을 렌더한다. */
  onDismiss?: (() => void) | undefined;
  /** 기본 strings.close. */
  dismissAccessibilityLabel?: string | undefined;
  /** 기본 'off'. 동적으로 삽입·갱신되는 알림에만 opt-in한다. */
  live?: AlertLive | undefined;
  unstyled?: never;
};

/** 제목 또는 비어 있지 않은 children 중 하나는 반드시 있어야 한다. */
export type AlertProps = AlertOwnProps &
  (
    | { title: string; children?: ReactNode | undefined }
    | { title?: never; children: NonNullable<ReactNode> }
  );

/** icons.close가 없을 때도 닫기 어포던스가 사라지지 않는 내장 텍스트 폴백. */
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
