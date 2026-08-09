/**
 * Button / IconButton — 설계 문서 §5.2, §5.3.
 *
 * 치수는 metrics.control, 서체는 typography, 색은 colors, 라운드는 radius —
 * 스타일 시트에 디자인 리터럴 없음(token-guard 강제, §1 불변식 1).
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

/** 'dark' → 'inverse' 개명 — 다크 테마에서 "dark" 변형이 밝아지는 의미 역전 해소(§5.2). */
export type ButtonVariant =
  | 'primary'
  | 'primary-outline'
  | 'secondary'
  | 'destructive'
  | 'destructive-outline'
  | 'inverse';

export type ButtonSize = 'sm' | 'md' | 'lg';

type ButtonPalette = {
  backgroundColor: string;
  borderColor?: string | undefined;
  textColor: string;
};

/** (내부) variant×disabled → 색 해석. 전신 buttonPalette 계승 — 전부 토큰 유래. */
export function buttonPalette(variant: ButtonVariant, disabled: boolean, theme: Theme): ButtonPalette {
  if (disabled) {
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
 * (내부) 사이즈별 치수 — 전신 buttonSizes(36/44/52, fontSize 13/14/15)의 토큰화.
 * fontSize는 label(13)/button(14)/body(15) 롤에서, 굵기는 button 롤에서 온다.
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

type ButtonOwnProps = {
  onPress?: (() => void) | undefined;
  variant?: ButtonVariant | undefined;
  size?: ButtonSize | undefined;
  disabled?: boolean | undefined;
  loading?: boolean | undefined;
  /** 정적 노드 또는 렌더 함수 — 전신 icon/renderIcon/iconColor 3종 통합(§5.2). */
  icon?: ReactNode | RenderIcon | undefined;
  /** 기본 metrics.icon.md. */
  iconSize?: number | undefined;
  /** 고정 높이 버튼의 라벨 클리핑 방지. 기본 metrics.maxFontScale. */
  maxFontSizeMultiplier?: number | undefined;
  accessibilityLabel?: string | undefined;
  labelStyle?: StyleProp<TextStyle> | undefined;
  labelClassName?: string | undefined;
} & CommonProps;

/** label 또는 children 중 하나는 필수 — 내용 없는 버튼은 컴파일 에러(§6 ③). 아이콘 단독은 IconButton. */
export type ButtonProps = ButtonOwnProps &
  (
    | { label: string; children?: ReactNode | undefined }
    | { label?: never; children: ReactNode }
  );

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

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
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

export interface IconButtonProps {
  /** 필수 — 아이콘 단독 버튼의 스크린리더 공백 방지(§6 ②). */
  accessibilityLabel: string;
  icon: ReactNode | RenderIcon;
  onPress?: (() => void) | undefined;
  variant?: ButtonVariant | undefined;
  /** 지름. 기본 40 — 마크 크기는 자동 산출(size × 0.48). */
  size?: number | undefined;
  disabled?: boolean | undefined;
  loading?: boolean | undefined;
  style?: StyleProp<ViewStyle> | undefined;
  className?: string | undefined;
  testID?: string | undefined;
  unstyled?: never;
}

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
