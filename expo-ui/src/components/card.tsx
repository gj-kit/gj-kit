/** Card — a static container that groups related content onto one surface. */
import type { ReactElement, ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import type { RadiusKey, SpacingKey, Theme } from '../theme/tokens';
import {
  elevationStyle,
  nativeWindProps,
  resolveSpacing,
  themedStyles,
} from './internal';
import type { CommonProps } from './internal';
import { useTheme } from './provider';

export type CardVariant = 'outlined' | 'elevated' | 'filled';

export type CardProps = Omit<CommonProps, 'unstyled'> & {
  children: NonNullable<ReactNode>;
  /** Defaults to 'outlined'. */
  variant?: CardVariant | undefined;
  /** Defaults to 'lg'. Numbers are the escape hatch for measured values. */
  padding?: SpacingKey | number | undefined;
  /** Defaults to 'md'. */
  radius?: RadiusKey | undefined;
  /** Applies to the inner content layout, such as child alignment and spacing. */
  contentStyle?: StyleProp<ViewStyle> | undefined;
  unstyled?: never;
};

const getStyles = themedStyles((theme: Theme) => ({
  content: {
    borderColor: theme.colors.line,
  },
}));

function cardVisualStyle(theme: Theme, variant: CardVariant) {
  switch (variant) {
    case 'elevated':
      return [{ backgroundColor: theme.colors.surface, borderWidth: 0 }];
    case 'filled':
      return [{ backgroundColor: theme.colors.surfaceSubtle, borderWidth: 0 }];
    default:
      return [
        {
          backgroundColor: theme.colors.surface,
          borderWidth: StyleSheet.hairlineWidth,
        },
      ];
  }
}

export function Card({
  children,
  variant = 'outlined',
  padding = 'lg',
  radius = 'md',
  style,
  contentStyle,
  className,
  testID,
}: CardProps): ReactElement {
  const theme = useTheme();
  const styles = getStyles(theme);
  const visualStyle = cardVisualStyle(theme, variant);
  const resolvedPadding = resolveSpacing(theme, padding);
  const resolvedRadius = theme.radius[radius];

  return (
    <View
      testID={testID}
      {...nativeWindProps(className)}
      style={[
        style,
        variant === 'elevated'
          ? elevationStyle(theme.elevation.md, theme.colors.shadow)
          : undefined,
        variant === 'elevated'
          ? { borderRadius: resolvedRadius, overflow: 'visible' as const }
          : undefined,
      ]}
    >
      <View
        style={[
          contentStyle,
          styles.content,
          visualStyle,
          {
            alignSelf: 'stretch',
            borderRadius: resolvedRadius,
            flexGrow: 1,
            flexShrink: 1,
            overflow: 'hidden',
            padding: resolvedPadding,
          },
        ]}
      >
        {children}
      </View>
    </View>
  );
}
