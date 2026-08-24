/**
 * Card — a container that groups related content onto one surface.
 *
 * The static form stays a plain View. The pressable form is an honest control:
 * a plain button when `selected` is absent, and an independent toggle button
 * (aria-pressed) when `selected` is a boolean. Because Card alone cannot own
 * group semantics or roving focus, it never fakes radio; a single-select card
 * group either uses RadioGroup or accepts independent-toggle semantics.
 */
import type { ReactElement, ReactNode } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import type { RadiusKey, SpacingKey, Theme } from '../theme/tokens';
import {
  elevationStyle,
  mergeClassNames,
  nativeWindProps,
  resolveSpacing,
  themedStyles,
} from './internal';
import type { CommonProps } from './internal';
import { PRESSABLE_FEEDBACK_CLASS } from './button';
import { useTheme } from './provider';

export type CardVariant = 'outlined' | 'elevated' | 'filled';

type CardBaseProps = Omit<CommonProps, 'unstyled'> & {
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

/** The static container. It carries no press props, so a plain surface never gains widget semantics. */
export type StaticCardProps = CardBaseProps & {
  onPress?: never;
  accessibilityLabel?: never;
  accessibilityHint?: never;
  selected?: never;
  disabled?: never;
};

/**
 * The pressable form. Card children are arbitrary rich content, so the
 * accessible name is always explicit — the same rule as Button with rich
 * children.
 */
export type PressableCardProps = CardBaseProps & {
  onPress: () => void;
  accessibilityLabel: string;
  accessibilityHint?: string | undefined;
  /**
   * A boolean makes the card an independent toggle button — aria-pressed on
   * web, togglebutton with a checked state natively — plus a primary token
   * border and primarySoft background while selected. Leave it undefined for a
   * plain button. For an exactly-one-of-N group, RadioGroup is the honest
   * widget; a selectable Card group reads as independent toggles.
   */
  selected?: boolean | undefined;
  disabled?: boolean | undefined;
};

export type CardProps = StaticCardProps | PressableCardProps;

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

function assertPressableCardContract(props: CardProps): void {
  if (props.onPress === undefined) return;
  const label: unknown = props.accessibilityLabel;
  if (typeof label !== 'string' || label.trim().length === 0) {
    throw new Error(
      'Card accessibilityLabel must be a non-empty string when onPress is present.',
    );
  }
}

export function Card(props: CardProps): ReactElement {
  const {
    children,
    variant = 'outlined',
    padding = 'lg',
    radius = 'md',
    style,
    contentStyle,
    className,
    testID,
  } = props;
  const theme = useTheme();
  const styles = getStyles(theme);
  assertPressableCardContract(props);
  const visualStyle = cardVisualStyle(theme, variant);
  const resolvedPadding = resolveSpacing(theme, padding);
  const resolvedRadius = theme.radius[radius];
  const selected = typeof props.selected === 'boolean' ? props.selected : undefined;
  const outerStyle = [
    style,
    variant === 'elevated'
      ? elevationStyle(theme.elevation.md, theme.colors.shadow)
      : undefined,
    variant === 'elevated'
      ? { borderRadius: resolvedRadius, overflow: 'visible' as const }
      : undefined,
  ];
  const content = (
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
        selected === true
          ? {
              backgroundColor: theme.colors.primarySoft,
              borderColor: theme.colors.primary,
              borderWidth: StyleSheet.hairlineWidth,
            }
          : null,
      ]}
    >
      {children}
    </View>
  );

  if (props.onPress === undefined) {
    return (
      <View testID={testID} {...nativeWindProps(className)} style={outerStyle}>
        {content}
      </View>
    );
  }

  const disabled = Boolean(props.disabled);
  return (
    <Pressable
      accessible
      accessibilityRole={
        selected === undefined || Platform.OS === 'web' ? 'button' : 'togglebutton'
      }
      accessibilityLabel={props.accessibilityLabel}
      accessibilityHint={props.accessibilityHint}
      accessibilityState={
        selected === undefined ? { disabled } : { checked: selected, disabled }
      }
      {...(selected === undefined ? {} : { 'aria-pressed': selected })}
      aria-disabled={disabled}
      disabled={disabled}
      onPress={props.onPress}
      testID={testID}
      {...nativeWindProps(mergeClassNames(PRESSABLE_FEEDBACK_CLASS, className))}
      style={outerStyle}
    >
      {content}
    </Pressable>
  );
}
