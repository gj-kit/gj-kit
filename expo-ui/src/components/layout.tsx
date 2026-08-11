/**
 * Surface / ContentFrame / Section / StickyActionBar — design doc §5.8.
 *
 * Boolean switches (padded/elevated) were replaced by token-key props, so the API
 * itself proves the padding and elevation values really come from tokens.
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
  /** Defaults to 'lg'. Numbers are the escape hatch for Figma measurements. */
  padding?: SpacingKey | number | undefined;
  /** Defaults to 'sm'. */
  radius?: RadiusKey | undefined;
  /** Defaults to 'none'. */
  elevation?: ElevationKey | undefined;
  /** Defaults to true. */
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
  /** Defaults to 1040 — inherited from the predecessor. */
  maxWidth?: number | undefined;
  /** Defaults to 'xl'. */
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

/** A navigation-agnostic content width frame — a shell such as ScreenShell composes it. */
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
  /** Defaults to 'md'. */
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
   * Where the return value of useBottomInset() from './insets' goes. The library
   * does not measure it directly so the safe-area peer is never pulled into "."
   * (§7). Defaults to 0.
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

/** Keyboard avoidance belongs to the host — this component only provides the visuals, web sticky behavior, and inset padding. */
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
