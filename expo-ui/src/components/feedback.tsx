/**
 * Skeleton / EmptyState / ErrorState / Toast / useToastController — 설계 문서 §5.9~§5.11.
 *
 * ThumbnailSkeleton은 삭제됐다(3:4 비율은 memorylog 사진 도메인 잔재 — §5.9).
 * TOAST_DURATION_MS·EMPTY_STATE_MAX_FONT_SIZE_MULTIPLIER 상수는 옵션 기본값과
 * metrics.maxFontScale 토큰으로 흡수됐다(§0 C).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { Animated, Platform, Text as RNText, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import type { RadiusKey, Theme } from '../theme/tokens';
import { nativeWindProps, elevationStyle, themedStyles } from './internal';
import type { CommonProps } from './internal';
import { renderIconSlot } from './icons';
import type { ToastVariant } from './icons';
import { useIcons, useStrings, useTheme } from './provider';
import { roleTextStyle } from './text';
import { Button } from './button';

// ─── Skeleton ──────────────────────────────────────────────────────────────

export interface SkeletonProps extends Omit<CommonProps, 'unstyled'> {
  /** 기본 'sm'. */
  radius?: RadiusKey | undefined;
  /** 기본 strings.loading. */
  accessibilityLabel?: string | undefined;
  unstyled?: never;
}

/** 펄스 타이밍 — 전신 실측 보존(0.62↔1.0, 700ms). */
const SKELETON_OPACITY_MIN = 0.62;
const SKELETON_PULSE_MS = 700;

export function Skeleton({
  radius = 'sm',
  accessibilityLabel,
  style,
  className,
  testID,
}: SkeletonProps): ReactElement {
  const theme = useTheme();
  const strings = useStrings();
  const opacity = useRef(new Animated.Value(SKELETON_OPACITY_MIN)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: SKELETON_PULSE_MS, useNativeDriver: true }),
        Animated.timing(opacity, {
          toValue: SKELETON_OPACITY_MIN,
          duration: SKELETON_PULSE_MS,
          useNativeDriver: true,
        }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [opacity]);

  return (
    <Animated.View
      testID={testID}
      accessibilityLabel={accessibilityLabel ?? strings.loading}
      {...nativeWindProps(className)}
      style={[
        {
          backgroundColor: theme.colors.surfaceSubtle,
          borderRadius: theme.radius[radius],
          opacity,
        },
        style,
      ]}
    />
  );
}

// ─── EmptyState / ErrorState ───────────────────────────────────────────────

const getStateStyles = themedStyles((theme: Theme) => ({
  emptyCard: {
    alignItems: 'center' as const,
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    gap: theme.spacing.md,
    padding: theme.spacing.xxl,
  },
  iconCircle: {
    alignItems: 'center' as const,
    borderRadius: theme.radius.pill,
    height: theme.metrics.control.md,
    justifyContent: 'center' as const,
    width: theme.metrics.control.md,
  },
  centerText: { alignSelf: 'stretch' as const, textAlign: 'center' as const },
  emptyAction: { alignSelf: 'stretch' as const, marginTop: theme.spacing.xs },
  errorCard: {
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    gap: theme.spacing.md,
    padding: theme.spacing.xl,
  },
  errorHeading: {
    alignItems: 'center' as const,
    flexDirection: 'row' as const,
    gap: theme.spacing.sm,
  },
}));

export interface EmptyStateProps extends Omit<CommonProps, 'unstyled'> {
  /** 기본 strings.emptyTitle. */
  title?: string | undefined;
  body?: string | undefined;
  /** label 없이 onPress 없는 죽은 버튼을 구조로 차단(§6 ⑨ — C의 action 객체). */
  action?: { readonly label: string; readonly onPress: () => void } | undefined;
  /** 기본 icons.empty. */
  leading?: ReactNode | undefined;
  /** 기본 metrics.maxFontScale. */
  maxFontSizeMultiplier?: number | undefined;
  unstyled?: never;
}

export function EmptyState({
  title,
  body,
  action,
  leading,
  maxFontSizeMultiplier,
  style,
  className,
  testID,
}: EmptyStateProps): ReactElement {
  const theme = useTheme();
  const strings = useStrings();
  const icons = useIcons();
  const styles = getStateStyles(theme);
  const maxScale = maxFontSizeMultiplier ?? theme.metrics.maxFontScale;
  const resolvedLeading =
    leading ??
    renderIconSlot(icons.empty, { color: theme.colors.textSubtle, size: theme.metrics.icon.lg });

  return (
    <View
      testID={testID}
      {...nativeWindProps(className)}
      style={[
        styles.emptyCard,
        { backgroundColor: theme.colors.surface, borderColor: theme.colors.line },
        style,
      ]}
    >
      {resolvedLeading ? (
        <View style={[styles.iconCircle, { backgroundColor: theme.colors.surfaceSubtle }]}>
          {resolvedLeading}
        </View>
      ) : null}
      <RNText
        style={[roleTextStyle(theme, 'title'), styles.centerText, { color: theme.colors.text }]}
        maxFontSizeMultiplier={maxScale}
      >
        {title ?? strings.emptyTitle}
      </RNText>
      {body ? (
        <RNText
          style={[roleTextStyle(theme, 'caption'), styles.centerText, { color: theme.colors.textMuted }]}
          maxFontSizeMultiplier={maxScale}
        >
          {body}
        </RNText>
      ) : null}
      {action ? <Button label={action.label} onPress={action.onPress} style={styles.emptyAction} /> : null}
    </View>
  );
}

export interface ErrorStateProps extends Omit<CommonProps, 'unstyled'> {
  /** 기본 strings.errorTitle. */
  title?: string | undefined;
  /** 기본 strings.errorBody. */
  message?: string | undefined;
  /** 있을 때만 버튼 렌더 — 죽은 버튼 불가(§5.10). */
  onRetry?: (() => void) | undefined;
  /** 기본 strings.retry. */
  retryLabel?: string | undefined;
  /** 기본 icons.error. */
  leading?: ReactNode | undefined;
  maxFontSizeMultiplier?: number | undefined;
  unstyled?: never;
}

export function ErrorState({
  title,
  message,
  onRetry,
  retryLabel,
  leading,
  maxFontSizeMultiplier,
  style,
  className,
  testID,
}: ErrorStateProps): ReactElement {
  const theme = useTheme();
  const strings = useStrings();
  const icons = useIcons();
  const styles = getStateStyles(theme);
  const maxScale = maxFontSizeMultiplier ?? theme.metrics.maxFontScale;
  const resolvedLeading =
    leading ??
    renderIconSlot(icons.error, { color: theme.colors.danger, size: theme.metrics.icon.lg });

  return (
    <View
      testID={testID}
      {...nativeWindProps(className)}
      style={[
        styles.errorCard,
        { backgroundColor: theme.colors.surface, borderColor: theme.colors.line },
        style,
      ]}
    >
      <View style={styles.errorHeading}>
        {resolvedLeading}
        <RNText
          style={[roleTextStyle(theme, 'label'), { color: theme.colors.text }]}
          maxFontSizeMultiplier={maxScale}
        >
          {title ?? strings.errorTitle}
        </RNText>
      </View>
      <RNText
        style={[roleTextStyle(theme, 'caption'), { color: theme.colors.textMuted }]}
        maxFontSizeMultiplier={maxScale}
      >
        {message ?? strings.errorBody}
      </RNText>
      {onRetry ? (
        <Button variant="secondary" label={retryLabel ?? strings.retry} onPress={onRetry} />
      ) : null}
    </View>
  );
}

// ─── Toast ─────────────────────────────────────────────────────────────────

export type ToastPayload = { message: string; variant: ToastVariant };

/** 구 TOAST_DURATION_MS(2800) 상수의 옵션화(§5.11). */
const TOAST_DEFAULT_DURATION_MS = 2_800;

export function useToastController<T extends ToastPayload = ToastPayload>(options?: {
  durationMs?: number | undefined;
}): { toast: T | null; showToast: (toast: T) => void; clearToast: () => void } {
  const durationMs = options?.durationMs ?? TOAST_DEFAULT_DURATION_MS;
  const [toast, setToast] = useState<T | null>(null);
  const showToast = useCallback((next: T) => setToast(next), []);
  const clearToast = useCallback(() => setToast(null), []);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(clearToast, durationMs);
    return () => clearTimeout(timer);
  }, [clearToast, durationMs, toast]);
  return { toast, showToast, clearToast };
}

export interface ToastProps {
  message: string;
  /** 기본 'error'. */
  variant?: ToastVariant | undefined;
  /** 기본 icons.toast[variant]. */
  leading?: ReactNode | undefined;
  /**
   * 하단 거리(순수 수치). 기본 96. safe-area 합성은 useBottomInset()과 조합(§7).
   * 구 bottomOffset!==96 레거시 스타일 분기는 삭제됐다 — 값은 위치에만 쓰인다.
   */
  bottomOffset?: number | undefined;
  containerStyle?: StyleProp<ViewStyle> | undefined;
  className?: string | undefined;
  testID?: string | undefined;
  unstyled?: never;
}

const TOAST_DEFAULT_BOTTOM_OFFSET = 96;

const getToastStyles = themedStyles((theme: Theme) => ({
  toast: {
    alignItems: 'center' as const,
    borderRadius: theme.radius.sm,
    flexDirection: 'row' as const,
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
  },
  message: { flex: 1 },
}));

export function Toast({
  message,
  variant = 'error',
  leading,
  bottomOffset = TOAST_DEFAULT_BOTTOM_OFFSET,
  containerStyle,
  className,
  testID,
}: ToastProps): ReactElement {
  const theme = useTheme();
  const icons = useIcons();
  const styles = getToastStyles(theme);
  const palette = {
    error: { background: theme.colors.dangerStrong, text: theme.colors.onDanger },
    success: { background: theme.colors.successStrong, text: theme.colors.onSuccess },
    info: { background: theme.colors.infoStrong, text: theme.colors.onInfo },
    warning: { background: theme.colors.warningStrong, text: theme.colors.onWarning },
  }[variant];
  const resolvedLeading =
    leading ??
    renderIconSlot(icons.toast?.[variant], { color: palette.text, size: theme.metrics.icon.md });
  // RNW 전용 'fixed' — RN 타입에 없어 캐스팅으로 통과(§11).
  const position: ViewStyle = {
    position: (Platform.OS === 'web' ? 'fixed' : 'absolute') as ViewStyle['position'],
    bottom: bottomOffset,
    left: theme.spacing.xl,
    right: theme.spacing.xl,
    zIndex: 20,
    pointerEvents: 'none',
  };

  return (
    <View
      testID={testID}
      accessibilityLiveRegion="polite"
      {...nativeWindProps(className)}
      style={[
        styles.toast,
        { backgroundColor: palette.background },
        elevationStyle(theme.elevation.md, theme.colors.shadow),
        position,
        containerStyle,
      ]}
    >
      {resolvedLeading}
      <RNText style={[roleTextStyle(theme, 'label'), styles.message, { color: palette.text }]}>
        {message}
      </RNText>
    </View>
  );
}

export type { ToastVariant };
