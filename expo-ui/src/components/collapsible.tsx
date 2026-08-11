/**
 * Collapsible — a controlled disclosure joining one trigger to one content region.
 * Where Accordion manages list state, Collapsible owns a single independent region.
 */
import { useId } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { Platform, Pressable, Text as RNText, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import type { Theme } from '../theme/tokens';
import type { CommonProps } from './internal';
import { nativeWindProps, themedStyles } from './internal';
import { renderIconSlot } from './icons';
import { useIcons, useTheme } from './provider';
import { roleTextStyle } from './text';

export type CollapsibleVariant = 'plain' | 'outlined';

export type CollapsibleProps = CommonProps & {
  title: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: NonNullable<ReactNode>;
  disabled?: boolean | undefined;
  variant?: CollapsibleVariant | undefined;
  /** Web heading level. Defaults to 3. */
  headingLevel?: 1 | 2 | 3 | 4 | 5 | 6 | undefined;
  triggerStyle?: StyleProp<ViewStyle> | undefined;
  contentStyle?: StyleProp<ViewStyle> | undefined;
  accessibilityLabel?: string | undefined;
};

const getStyles = themedStyles((theme: Theme) => ({
  root: {
    overflow: 'hidden' as const,
  },
  outlined: {
    borderRadius: theme.radius.md,
    borderWidth: 1,
  },
  heading: {
    width: '100%' as const,
  },
  trigger: {
    alignItems: 'center' as const,
    flexDirection: 'row' as const,
    gap: theme.spacing.md,
    minHeight: theme.metrics.control.md,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    width: '100%' as const,
  },
  triggerCopy: {
    flex: 1,
    minWidth: 0,
  },
  indicator: {
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    minHeight: theme.metrics.icon.md,
    minWidth: theme.metrics.icon.md,
  },
  content: {
    paddingBottom: theme.spacing.lg,
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.md,
  },
}));

function webProps(values: Record<string, unknown>): Record<string, unknown> {
  return Platform.OS === 'web' ? values : {};
}

function sanitizeId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, '');
}

export function Collapsible({
  open,
  onOpenChange,
  children,
  disabled = false,
  variant = 'outlined',
  headingLevel = 3,
  title,
  accessibilityLabel,
  triggerStyle,
  contentStyle,
  style,
  className,
  testID,
}: CollapsibleProps): ReactElement {
  const theme = useTheme();
  const icons = useIcons();
  const styles = getStyles(theme);
  const reactId = sanitizeId(useId());
  const triggerId = `gj-collapsible-${reactId}-trigger`;
  const contentId = `gj-collapsible-${reactId}-content`;
  const resolvedLabel = accessibilityLabel ?? title;
  const indicatorProps = {
    color: disabled ? theme.colors.textSubtle : theme.colors.textMuted,
    size: theme.metrics.icon.md,
    expanded: open,
  };
  const providerIndicator = renderIconSlot(icons.chevronDown, indicatorProps);
  const triggerContent = (
    <>
      <View style={styles.triggerCopy}>
        <RNText style={[roleTextStyle(theme, 'label'), { color: theme.colors.text }]}>
          {title}
        </RNText>
      </View>
      <View
        aria-hidden
        accessible={false}
        importantForAccessibility="no-hide-descendants"
        style={[styles.indicator, { pointerEvents: 'none' }]}
      >
        <View style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }}>
          {providerIndicator ?? (
            <RNText
              style={[
                roleTextStyle(theme, 'label'),
                { color: indicatorProps.color },
              ]}
            >
              ⌄
            </RNText>
          )}
        </View>
      </View>
    </>
  );
  const triggerBaseStyle = [
    styles.trigger,
    {
      backgroundColor: theme.colors.surface,
      opacity: disabled ? 0.5 : 1,
    },
    triggerStyle,
  ];

  return (
    <View
      testID={testID}
      {...nativeWindProps(className)}
      style={[
        styles.root,
        variant === 'outlined'
          ? [styles.outlined, { borderColor: theme.colors.line }]
          : null,
        style,
      ]}
    >
      <View
        accessibilityRole="header"
        {...webProps({ role: 'heading', 'aria-level': headingLevel })}
        style={styles.heading}
      >
        {Platform.OS === 'web' ? (
          <View
            {...webProps({
              id: triggerId,
              role: 'button',
              tabIndex: disabled ? -1 : 0,
              'aria-controls': contentId,
              'aria-expanded': open,
              'aria-disabled': disabled,
              'aria-label': resolvedLabel,
              onClick: () => {
                if (!disabled) onOpenChange(!open);
              },
            })}
            style={triggerBaseStyle}
          >
            {triggerContent}
          </View>
        ) : (
          <Pressable
            nativeID={triggerId}
            accessibilityRole="button"
            accessibilityLabel={resolvedLabel}
            accessibilityState={{ expanded: open, disabled }}
            disabled={disabled}
            onPress={() => onOpenChange(!open)}
            style={({ pressed }) => [
              triggerBaseStyle,
              pressed && !disabled ? { backgroundColor: theme.colors.surfaceSubtle } : null,
            ]}
          >
            {triggerContent}
          </Pressable>
        )}
      </View>
      <View
        aria-hidden={!open}
        accessibilityElementsHidden={!open}
        importantForAccessibility={open ? 'auto' : 'no-hide-descendants'}
        {...webProps({ id: contentId, 'aria-labelledby': triggerId })}
        style={[
          styles.content,
          variant === 'outlined' ? { borderTopColor: theme.colors.line, borderTopWidth: 1 } : null,
          contentStyle,
          { display: open ? 'flex' : 'none' },
        ]}
      >
        {typeof children === 'string' || typeof children === 'number' ? (
          <RNText style={[roleTextStyle(theme, 'body'), { color: theme.colors.text }]}>
            {children}
          </RNText>
        ) : (
          children
        )}
      </View>
    </View>
  );
}
