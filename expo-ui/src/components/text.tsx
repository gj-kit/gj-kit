/**
 * Text — design doc §5.1 (new).
 *
 * The direct consumer of the typography tokens. The predecessor had no text
 * primitive, so the app duplicated things like `text-[13px] font-bold` in hundreds
 * of places. Shadowing RN's Text is industry practice (Paper, Tamagui) — reach for
 * `import { Text as RNText }` when you need the original.
 */
import type { ReactElement } from 'react';
import { Text as RNText } from 'react-native';
import type { StyleProp, TextProps as RNTextProps, TextStyle } from 'react-native';
import type { ColorKey, TextRole, Theme } from '../theme/tokens';
import { nativeWindProps } from './internal';
import { useTheme } from './provider';

// RN Text의 aria `role` prop을 가린다 — 접근성 롤은 accessibilityRole로 지정.
export interface TextProps extends Omit<RNTextProps, 'style' | 'role'> {
  /** Defaults to 'body' — fontSize, lineHeight, fontWeight, and fontFamily are all decided by tokens. */
  role?: TextRole | undefined;
  /** A closed union — typos are compile errors and raw colors go through the style escape hatch (§0). Defaults to 'text'. */
  color?: ColorKey | undefined;
  /**
   * Renders every digit at the same advance width so columns of figures line up.
   * Emits `fontVariant: ['tabular-nums']`, which React Native Web serializes as
   * the CSS `font-variant` shorthand carrying the tabular-figures feature.
   * Defaults to false.
   */
  tabularNums?: boolean | undefined;
  style?: StyleProp<TextStyle> | undefined;
  className?: string | undefined;
  unstyled?: never;
}

/** (internal) Role to token text style. Reused outside Text as well, e.g. for a Button label. */
export function roleTextStyle(theme: Theme, role: TextRole): TextStyle {
  const spec = theme.typography[role];
  return {
    fontSize: spec.fontSize,
    lineHeight: spec.lineHeight,
    fontWeight: spec.fontWeight,
    ...(theme.typography.fontFamily !== undefined
      ? { fontFamily: theme.typography.fontFamily }
      : {}),
  };
}

/** (internal) The tabular-numeral style shared by Text and the data components that align figures. */
export const TABULAR_NUMS_STYLE: TextStyle = { fontVariant: ['tabular-nums'] };

export function Text({
  role = 'body',
  color = 'text',
  tabularNums = false,
  style,
  className,
  children,
  ...rest
}: TextProps): ReactElement {
  const theme = useTheme();
  return (
    <RNText
      {...rest}
      {...nativeWindProps(className)}
      style={[
        roleTextStyle(theme, role),
        { color: theme.colors[color] },
        tabularNums ? TABULAR_NUMS_STYLE : null,
        style,
      ]}
    >
      {children}
    </RNText>
  );
}
