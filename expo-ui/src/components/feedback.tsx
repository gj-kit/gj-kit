/**
 * Skeleton / EmptyState / ErrorState / Toast / useToastController — design doc §5.9–§5.11.
 *
 * ThumbnailSkeleton is gone (the 3:4 ratio was a leftover from the memorylog photo
 * domain — §5.9). The TOAST_DURATION_MS and EMPTY_STATE_MAX_FONT_SIZE_MULTIPLIER
 * constants were absorbed into option defaults and the metrics.maxFontScale token
 * (§0 C).
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
import { useReducedMotion } from './use-reduced-motion';

// ─── Skeleton ──────────────────────────────────────────────────────────────

export interface SkeletonProps extends Omit<CommonProps, 'unstyled'> {
  /** Defaults to 'sm'. */
  radius?: RadiusKey | undefined;
  /** Defaults to strings.loading. */
  accessibilityLabel?: string | undefined;
  unstyled?: never;
}

/** The pulse timing — the predecessor's measured values, preserved (0.62↔1.0, 700ms). */
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
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (reduceMotion !== false) {
      opacity.stopAnimation();
      opacity.setValue(SKELETON_OPACITY_MIN);
      return;
    }
    // 웹의 RNW Animated에는 네이티브 드라이버가 없다 — true를 넘기면 인스턴스마다
    // console.warn이 찍히고 어차피 JS 드라이버로 폴백된다. 동작은 동일하다.
    const useNativeDriver = Platform.OS !== 'web';
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: SKELETON_PULSE_MS, useNativeDriver }),
        Animated.timing(opacity, {
          toValue: SKELETON_OPACITY_MIN,
          duration: SKELETON_PULSE_MS,
          useNativeDriver,
        }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [opacity, reduceMotion]);

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
  emptyCardCompact: {
    gap: theme.spacing.xs,
    padding: theme.spacing.lg,
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

export type EmptyStateVariant = 'default' | 'compact';

export interface EmptyStateProps extends Omit<CommonProps, 'unstyled'> {
  /**
   * Defaults to 'default' — the standing card, unchanged. 'compact' is a
   * one-line notice for table-internal or inline empty rows: label-role title,
   * tighter padding, and no built-in icon (`leading` renders bare and only
   * when explicitly provided).
   */
  variant?: EmptyStateVariant | undefined;
  /** Defaults to strings.emptyTitle. */
  title?: string | undefined;
  body?: string | undefined;
  /** Structurally blocks a dead button with no label and no onPress (§6 ⑨ — the action object from C). */
  action?: { readonly label: string; readonly onPress: () => void } | undefined;
  /** Defaults to icons.empty. */
  leading?: ReactNode | undefined;
  /** Defaults to metrics.maxFontScale. */
  maxFontSizeMultiplier?: number | undefined;
  unstyled?: never;
}

export function EmptyState({
  variant = 'default',
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
  const compact = variant === 'compact';
  const maxScale = maxFontSizeMultiplier ?? theme.metrics.maxFontScale;
  const resolvedLeading = compact
    ? leading
    : leading ??
      renderIconSlot(icons.empty, { color: theme.colors.textSubtle, size: theme.metrics.icon.lg });

  return (
    <View
      testID={testID}
      {...nativeWindProps(className)}
      style={[
        styles.emptyCard,
        compact ? styles.emptyCardCompact : null,
        { backgroundColor: theme.colors.surface, borderColor: theme.colors.line },
        style,
      ]}
    >
      {resolvedLeading ? (
        compact ? (
          resolvedLeading
        ) : (
          <View style={[styles.iconCircle, { backgroundColor: theme.colors.surfaceSubtle }]}>
            {resolvedLeading}
          </View>
        )
      ) : null}
      <RNText
        style={[
          roleTextStyle(theme, compact ? 'label' : 'title'),
          styles.centerText,
          { color: theme.colors.text },
        ]}
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
  /** Defaults to strings.errorTitle. */
  title?: string | undefined;
  /** Defaults to strings.errorBody. */
  message?: string | undefined;
  /** Renders the button only when present — no dead buttons (§5.10). */
  onRetry?: (() => void) | undefined;
  /** Defaults to strings.retry. */
  retryLabel?: string | undefined;
  /** Defaults to icons.error. */
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

/** The former TOAST_DURATION_MS(2800) constant, turned into an option (§5.11). */
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
  /** Defaults to 'error'. */
  variant?: ToastVariant | undefined;
  /** Defaults to icons.toast[variant]. */
  leading?: ReactNode | undefined;
  /**
   * Distance from the bottom as a plain number. Defaults to 96. Compose it with
   * useBottomInset() for safe-area handling (§7). The legacy bottomOffset!==96
   * style branch is gone — the value only affects position.
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
