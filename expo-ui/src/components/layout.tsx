/**
 * Surface / ContentFrame / Section / StickyActionBar — 설계 문서 §5.8.
 *
 * boolean 스위치(padded/elevated)를 토큰 키 prop으로 교체 — padding/elevation
 * 값이 실제로 토큰에서 온다는 것을 API가 증명한다.
 */
import type { ReactElement, ReactNode } from 'react';
import { Platform, Text as RNText, View } from 'react-native';
import type { ViewStyle } from 'react-native';
import type { ElevationKey, RadiusKey, SpacingKey, Theme } from '../theme/tokens';
import { elevationStyle, mergeClassNames, nativeWindProps, resolveSpacing, themedStyles } from './internal';
import type { CommonProps } from './internal';
import { useTheme } from './provider';
import { roleTextStyle } from './text';

export interface SurfaceProps extends Omit<CommonProps, 'unstyled'> {
  children?: ReactNode | undefined;
  /** 기본 'lg'. 숫자는 Figma 실측 탈출구. */
  padding?: SpacingKey | number | undefined;
  /** 기본 'sm'. */
  radius?: RadiusKey | undefined;
  /** 기본 'none'. */
  elevation?: ElevationKey | undefined;
  /** 기본 true. */
  bordered?: boolean | undefined;
  unstyled?: never;
}

export function Surface({
  children,
  padding = 'lg',
  radius = 'sm',
  elevation = 'none',
  bordered = true,
  style,
  className,
  testID,
}: SurfaceProps): ReactElement {
  const theme = useTheme();
  return (
    <View
      testID={testID}
      {...nativeWindProps(className)}
      style={[
        {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.line,
          borderWidth: bordered ? 1 : 0,
          borderRadius: theme.radius[radius],
          padding: resolveSpacing(theme, padding),
        },
        elevation !== 'none' ? elevationStyle(theme.elevation[elevation], theme.colors.shadow) : null,
        style,
      ]}
    >
      {children}
    </View>
  );
}

export interface ContentFrameProps extends Omit<CommonProps, 'unstyled'> {
  children?: ReactNode | undefined;
  /** 기본 1040 — 전신 계승. */
  maxWidth?: number | undefined;
  /** 기본 'xl'. */
  padding?: SpacingKey | number | undefined;
  topPadding?: SpacingKey | number | undefined;
  bottomPadding?: SpacingKey | number | undefined;
  center?: boolean | undefined;
  unstyled?: never;
}

const CONTENT_FRAME_DEFAULT_MAX_WIDTH = 1040;

const getFrameStyles = themedStyles((_theme: Theme) => ({
  frame: { alignSelf: 'stretch' as const, width: '100%' as const },
}));

/** 내비게이션 무관 콘텐츠 폭 제한 프레임 — 셸(ScreenShell 등)이 조합한다. */
export function ContentFrame({
  children,
  maxWidth = CONTENT_FRAME_DEFAULT_MAX_WIDTH,
  padding = 'xl',
  topPadding,
  bottomPadding,
  center = false,
  style,
  className,
  testID,
}: ContentFrameProps): ReactElement {
  const theme = useTheme();
  const styles = getFrameStyles(theme);
  const resolved = resolveSpacing(theme, padding);
  return (
    <View
      testID={testID}
      {...nativeWindProps(className)}
      style={[
        styles.frame,
        {
          maxWidth,
          paddingHorizontal: resolved,
          paddingTop: topPadding !== undefined ? resolveSpacing(theme, topPadding) : resolved,
          paddingBottom: bottomPadding !== undefined ? resolveSpacing(theme, bottomPadding) : resolved,
          ...(center ? { alignSelf: 'center' as const } : {}),
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export interface SectionProps extends Omit<CommonProps, 'unstyled'> {
  children?: ReactNode | undefined;
  /** typography.title. */
  title?: string | undefined;
  /** typography.caption + textMuted. */
  subtitle?: string | undefined;
  actions?: ReactNode | undefined;
  /** 기본 'md'. */
  gap?: SpacingKey | number | undefined;
  unstyled?: never;
}

const getSectionStyles = themedStyles((theme: Theme) => ({
  header: {
    alignItems: 'center' as const,
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: theme.spacing.md,
    justifyContent: 'space-between' as const,
  },
  copy: { flex: 1, minWidth: 0 },
  subtitle: { marginTop: theme.spacing.xs },
  actions: {
    alignItems: 'center' as const,
    flexDirection: 'row' as const,
    gap: theme.spacing.sm,
  },
}));

export function Section({
  children,
  title,
  subtitle,
  actions,
  gap = 'md',
  style,
  className,
  testID,
}: SectionProps): ReactElement {
  const theme = useTheme();
  const styles = getSectionStyles(theme);
  return (
    <View
      testID={testID}
      {...nativeWindProps(className)}
      style={[{ gap: resolveSpacing(theme, gap) }, style]}
    >
      {title || subtitle || actions ? (
        <View style={styles.header}>
          <View style={styles.copy}>
            {title ? (
              <RNText style={[roleTextStyle(theme, 'title'), { color: theme.colors.text }]}>
                {title}
              </RNText>
            ) : null}
            {subtitle ? (
              <RNText
                style={[
                  roleTextStyle(theme, 'caption'),
                  styles.subtitle,
                  { color: theme.colors.textMuted },
                ]}
              >
                {subtitle}
              </RNText>
            ) : null}
          </View>
          {actions ? <View style={styles.actions}>{actions}</View> : null}
        </View>
      ) : null}
      {children}
    </View>
  );
}

export interface StickyActionBarProps extends Omit<CommonProps, 'unstyled'> {
  children?: ReactNode | undefined;
  /**
   * './insets'의 useBottomInset() 반환값을 꽂는 자리. 라이브러리가 직접 재지
   * 않는 이유: safe-area peer를 "."에 끌어들이지 않기 위해(§7). 기본 0.
   */
  bottomInset?: number | undefined;
  unstyled?: never;
}

const getBarStyles = themedStyles((theme: Theme) => ({
  bar: {
    borderTopWidth: 1,
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.xl,
  },
}));

/** 키보드 회피는 호스트 소유 — 이 컴포넌트는 시각·웹 sticky·inset 패딩만 제공한다. */
export function StickyActionBar({
  children,
  bottomInset = 0,
  style,
  className,
  testID,
}: StickyActionBarProps): ReactElement {
  const theme = useTheme();
  const styles = getBarStyles(theme);
  // RNW 전용 값 — RN 타입에 없어 캐스팅으로 통과(설계 문서 §11: DOM lib 금지, 캐스팅 한정).
  const webPosition =
    Platform.OS === 'web'
      ? ({ position: 'sticky' as unknown as ViewStyle['position'], bottom: 0, zIndex: 10 } as ViewStyle)
      : null;
  return (
    <View
      testID={testID}
      {...nativeWindProps(mergeClassNames(Platform.OS === 'web' ? 'sticky bottom-0' : undefined, className))}
      style={[
        styles.bar,
        {
          borderTopColor: theme.colors.line,
          backgroundColor: theme.colors.surface,
          paddingTop: theme.spacing.md,
          paddingBottom: theme.spacing.md + bottomInset,
        },
        elevationStyle(theme.elevation.md, theme.colors.shadow),
        webPosition,
        style,
      ]}
    >
      {children}
    </View>
  );
}
