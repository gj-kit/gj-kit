/** Native Tooltip: platform accessibility hint, with no floating layer or timer. */
import type { ReactElement } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import type { Theme } from '../theme/tokens';
import { buttonPalette, PRESSABLE_FEEDBACK_CLASS } from './button';
import { renderIconSlot } from './icons';
import {
  mergeClassNames,
  nativeWindProps,
  themedStyles,
} from './internal';
import { useTheme } from './provider';
import { assertTooltipProps } from './tooltip.types';
import type { TooltipProps } from './tooltip.types';

const getStyles = themedStyles((theme: Theme) => ({
  root: {
    alignSelf: 'flex-start' as const,
  },
  trigger: {
    alignItems: 'center' as const,
    borderRadius: theme.radius.pill,
    justifyContent: 'center' as const,
  },
  triggerIcon: {
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
}));

export function Tooltip(props: TooltipProps): ReactElement {
  assertTooltipProps(props);
  const {
    content,
    triggerLabel,
    triggerIcon,
    onPress,
    tooltipDisabled = false,
    size = 'sm',
    variant = 'secondary',
    style,
    className,
    triggerStyle,
    triggerClassName,
    testID,
  } = props;
  const theme = useTheme();
  const styles = getStyles(theme);
  const diameter = size === 'sm' ? theme.metrics.control.md : theme.metrics.control.lg;
  const palette = buttonPalette(variant, false, theme);

  return (
    <View
      testID={testID}
      {...nativeWindProps(className)}
      style={[styles.root, style]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={triggerLabel}
        accessibilityHint={tooltipDisabled ? undefined : content}
        onPress={onPress}
        {...nativeWindProps(mergeClassNames(PRESSABLE_FEEDBACK_CLASS, triggerClassName))}
        style={({ pressed }) => [
          styles.trigger,
          {
            width: diameter,
            height: diameter,
            backgroundColor: palette.backgroundColor,
            borderColor: palette.borderColor ?? palette.backgroundColor,
            borderWidth: palette.borderColor ? StyleSheet.hairlineWidth : 0,
            opacity: pressed ? 0.9 : 1,
          },
          triggerStyle,
        ]}
      >
        <View
          aria-hidden
          importantForAccessibility="no-hide-descendants"
          style={styles.triggerIcon}
        >
          {renderIconSlot(triggerIcon, {
            color: palette.textColor,
            size: theme.metrics.icon.md,
          })}
        </View>
      </Pressable>
    </View>
  );
}
