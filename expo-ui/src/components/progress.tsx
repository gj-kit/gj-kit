/**
 * Spinner / ProgressBar — 로딩과 작업 진행률을 의미론까지 포함해 표현한다.
 * 값·색·치수는 닫힌 API와 테마 토큰에서만 해석한다.
 */
import { useEffect, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { AccessibilityInfo, ActivityIndicator, Animated, Easing, View } from 'react-native';
import type { LayoutChangeEvent, StyleProp, ViewStyle } from 'react-native';
import type { ColorKey, Theme } from '../theme/tokens';
import { nativeWindProps, themedStyles } from './internal';
import type { CommonProps } from './internal';
import { useStrings, useTheme } from './provider';

export type ProgressSize = 'sm' | 'md' | 'lg';

export interface SpinnerProps extends Omit<CommonProps, 'unstyled'> {
  /** 기본 'md'. */
  size?: ProgressSize | undefined;
  /** 기본 'primary'. */
  color?: ColorKey | undefined;
  /** 기본 strings.loading. */
  accessibilityLabel?: string | undefined;
  unstyled?: never;
}

const getSpinnerStyles = themedStyles((theme: Theme) => ({
  spinner: {
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    minHeight: theme.metrics.icon.md,
    minWidth: theme.metrics.icon.md,
  },
}));

export function Spinner({
  size = 'md',
  color = 'primary',
  accessibilityLabel,
  style,
  className,
  testID,
}: SpinnerProps): ReactElement {
  const theme = useTheme();
  const strings = useStrings();
  const styles = getSpinnerStyles(theme);

  return (
    <ActivityIndicator
      role="progressbar"
      aria-label={accessibilityLabel ?? strings.loading}
      aria-busy
      accessibilityLabel={accessibilityLabel ?? strings.loading}
      accessibilityState={{ busy: true }}
      color={theme.colors[color]}
      size={theme.metrics.icon[size]}
      testID={testID}
      {...nativeWindProps(className)}
      style={[styles.spinner, style]}
    />
  );
}

export type ProgressBarVariant = 'primary' | 'info' | 'success' | 'warning' | 'error';

type ProgressBarBaseProps = Omit<CommonProps, 'unstyled'> & {
  variant?: ProgressBarVariant | undefined;
  size?: ProgressSize | undefined;
  /** 스크린리더에 진행 대상이 무엇인지 전달한다. */
  accessibilityLabel: string;
  indicatorStyle?: StyleProp<ViewStyle> | undefined;
  indicatorClassName?: string | undefined;
  unstyled?: never;
};

/** `value={null}`은 현재 양을 알 수 없는 indeterminate 진행률이다. */
export type ProgressBarProps = ProgressBarBaseProps &
  (
    | {
        value: number;
        /** 유한한 양수만 사용하며, 그 외 값은 100으로 정규화한다. */
        max?: number | undefined;
        accessibilityValueText?: string | undefined;
      }
    | {
        value: null;
        max?: never;
        accessibilityValueText?: string | undefined;
      }
  );

const getProgressStyles = themedStyles((theme: Theme) => ({
  track: {
    borderRadius: theme.radius.pill,
    overflow: 'hidden' as const,
    width: '100%' as const,
  },
  indicator: {
    borderRadius: theme.radius.pill,
    height: '100%' as const,
  },
}));

function progressPalette(theme: Theme, variant: ProgressBarVariant) {
  return {
    primary: { indicator: theme.colors.primaryStrong, track: theme.colors.primarySoft },
    info: { indicator: theme.colors.info, track: theme.colors.infoSoft },
    success: { indicator: theme.colors.success, track: theme.colors.successSoft },
    warning: { indicator: theme.colors.warning, track: theme.colors.warningSoft },
    error: { indicator: theme.colors.danger, track: theme.colors.dangerSoft },
  }[variant];
}

function normalizeMax(max: number | undefined): number {
  return max !== undefined && Number.isFinite(max) && max > 0 ? max : 100;
}

function normalizeValue(value: number, max: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(max, Math.max(0, value));
}

export function ProgressBar(props: ProgressBarProps): ReactElement {
  const {
    value,
    variant = 'primary',
    size = 'md',
    accessibilityLabel,
    accessibilityValueText,
    indicatorStyle,
    indicatorClassName,
    style,
    className,
    testID,
  } = props;
  const theme = useTheme();
  const styles = getProgressStyles(theme);
  const palette = progressPalette(theme, variant);
  const indeterminate = value === null;
  const max = indeterminate ? undefined : normalizeMax(props.max);
  const now = value === null || max === undefined ? undefined : normalizeValue(value, max);
  const percent = now === undefined || max === undefined ? 0 : (now / max) * 100;
  const [trackWidth, setTrackWidth] = useState(0);
  const [reduceMotion, setReduceMotion] = useState<boolean | null>(null);
  const phase = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Determinate 상태로 나갈 때 캐시를 비워 다음 진입이 이전
    // 설정으로 잠깐 움직이지 않게 한다. null인 동안은 정적 세그먼트다.
    if (!indeterminate) {
      setReduceMotion(null);
      return;
    }
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (active) setReduceMotion(enabled);
      })
      .catch(() => {
        if (active) setReduceMotion(false);
      });
    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setReduceMotion,
    );
    return () => {
      active = false;
      subscription?.remove?.();
    };
  }, [indeterminate]);

  useEffect(() => {
    if (!indeterminate || reduceMotion !== false) {
      phase.stopAnimation();
      phase.setValue(0);
      return;
    }
    const animation = Animated.loop(
      Animated.timing(phase, {
        toValue: 1,
        duration: 1_200,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: true,
      }),
    );
    animation.start();
    return () => animation.stop();
  }, [indeterminate, phase, reduceMotion]);

  const height = {
    sm: theme.spacing.xs,
    md: theme.spacing.sm,
    lg: theme.spacing.md,
  }[size];
  const onLayout = (event: LayoutChangeEvent) => setTrackWidth(event.nativeEvent.layout.width);
  const accessibilityValue = indeterminate
    ? accessibilityValueText !== undefined
      ? { text: accessibilityValueText }
      : undefined
    : {
        min: 0,
        max,
        now,
        ...(accessibilityValueText !== undefined ? { text: accessibilityValueText } : {}),
      };

  return (
    <View
      role="progressbar"
      aria-label={accessibilityLabel}
      aria-busy={indeterminate}
      aria-valuemin={indeterminate ? undefined : 0}
      aria-valuemax={max}
      aria-valuenow={now}
      aria-valuetext={accessibilityValueText}
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ busy: indeterminate }}
      accessibilityValue={accessibilityValue}
      onLayout={onLayout}
      testID={testID}
      {...nativeWindProps(className)}
      style={[styles.track, { backgroundColor: palette.track, height }, style]}
    >
      {indeterminate ? (
        <Animated.View
          aria-hidden
          accessible={false}
          {...nativeWindProps(indicatorClassName)}
          style={[
            styles.indicator,
            {
              backgroundColor: palette.indicator,
              width: '35%',
              transform: [
                {
                  translateX: phase.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, trackWidth * 0.65],
                  }),
                },
              ],
            },
            indicatorStyle,
          ]}
        />
      ) : (
        <View
          aria-hidden
          accessible={false}
          {...nativeWindProps(indicatorClassName)}
          style={[
            styles.indicator,
            {
              backgroundColor: palette.indicator,
              width: `${percent}%`,
            },
            indicatorStyle,
          ]}
        />
      )}
    </View>
  );
}
