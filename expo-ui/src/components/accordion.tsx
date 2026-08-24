/**
 * Accordion — a controlled disclosure whose single and multiple expansion states
 * are separated by type. Exposes the header/panel relationship and the expanded
 * state to both native accessibility and web ARIA.
 */
import { createElement, useId } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { Platform, Pressable, Text as RNText, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import type { Theme } from '../theme/tokens';
import { mergeClassNames, nativeWindProps, themedStyles } from './internal';
import type { IconRenderProps } from './icons';
import { renderIconSlot } from './icons';
import { PRESSABLE_FEEDBACK_CLASS } from './button';
import { useIcons, useTheme } from './provider';
import { roleTextStyle } from './text';

export interface AccordionItem<T extends string> {
  readonly value: T;
  readonly title: string;
  readonly description?: string | undefined;
  readonly content: NonNullable<ReactNode>;
  readonly leading?: ReactNode | undefined;
  /**
   * Presentation-only decoration at the end of the header row, before the
   * expansion indicator — a count badge, for example. It renders inside the
   * trigger but is hidden from accessibility, so the trigger's accessible name
   * stays the title. Interactive trailing content is unsupported; when the
   * information matters to assistive technology, repeat it in `description`.
   */
  readonly trailing?: ReactNode | undefined;
  readonly disabled?: boolean | undefined;
}

export type AccordionIndicatorRenderProps = IconRenderProps & { readonly expanded: boolean };

type AccordionBaseProps<T extends string> = {
  items: readonly AccordionItem<T>[];
  disabled?: boolean | undefined;
  renderIndicator?: ((props: AccordionIndicatorRenderProps) => ReactNode) | undefined;
  /** Web heading level. Defaults to 3. */
  headingLevel?: 1 | 2 | 3 | 4 | 5 | 6 | undefined;
  style?: StyleProp<ViewStyle> | undefined;
  itemStyle?: StyleProp<ViewStyle> | undefined;
  headerStyle?: StyleProp<ViewStyle> | undefined;
  contentStyle?: StyleProp<ViewStyle> | undefined;
  className?: string | undefined;
  testID?: string | undefined;
  unstyled?: never;
};

export type AccordionProps<T extends string> = AccordionBaseProps<T> &
  (
    | {
        type?: 'single' | undefined;
        value: NoInfer<T> | null;
        onValueChange: (value: T | null) => void;
        /** When false, the last open item cannot be closed. Defaults to true. */
        collapsible?: boolean | undefined;
      }
    | {
        type: 'multiple';
        value: ReadonlyArray<NoInfer<T>>;
        onValueChange: (value: readonly T[]) => void;
        collapsible?: never;
      }
  );

const getStyles = themedStyles((theme: Theme) => ({
  root: {
    borderColor: theme.colors.line,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    overflow: 'hidden' as const,
  },
  item: {
    backgroundColor: theme.colors.surface,
    borderBottomColor: theme.colors.line,
  },
  heading: {
    width: '100%' as const,
  },
  header: {
    alignItems: 'center' as const,
    flexDirection: 'row' as const,
    gap: theme.spacing.md,
    minHeight: theme.metrics.control.md,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    width: '100%' as const,
  },
  copy: {
    flex: 1,
    gap: theme.spacing.xs,
  },
  indicator: {
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    minHeight: theme.metrics.icon.md,
    minWidth: theme.metrics.icon.md,
  },
  trailingSlot: {
    alignItems: 'center' as const,
    flexDirection: 'row' as const,
  },
  content: {
    borderTopColor: theme.colors.line,
    borderTopWidth: 1,
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

export function Accordion<T extends string>(props: AccordionProps<T>): ReactElement {
  const {
    items,
    disabled = false,
    renderIndicator,
    headingLevel = 3,
    style,
    itemStyle,
    headerStyle,
    contentStyle,
    className,
    testID,
  } = props;
  const theme = useTheme();
  const icons = useIcons();
  const styles = getStyles(theme);
  const reactId = sanitizeId(useId());
  const multiple = props.type === 'multiple';

  const isExpanded = (itemValue: T): boolean =>
    multiple ? props.value.includes(itemValue) : props.value === itemValue;

  const toggle = (item: AccordionItem<T>): void => {
    const itemDisabled = disabled || Boolean(item.disabled);
    if (itemDisabled) return;
    const expanded = isExpanded(item.value);

    if (multiple) {
      const next = expanded
        ? props.value.filter((value) => value !== item.value)
        : [...props.value, item.value];
      props.onValueChange(next);
      return;
    }

    if (expanded) {
      if (props.collapsible === false) return;
      props.onValueChange(null);
      return;
    }
    props.onValueChange(item.value);
  };

  return (
    <View
      testID={testID}
      {...nativeWindProps(className)}
      style={[styles.root, style]}
    >
      {items.map((item, index) => {
        const expanded = isExpanded(item.value);
        const itemDisabled = disabled || Boolean(item.disabled);
        const lockedExpanded = !multiple && expanded && props.collapsible === false;
        const headerId = `gj-accordion-${reactId}-${index}-header`;
        const panelId = `gj-accordion-${reactId}-${index}-panel`;
        const descriptionId = item.description === undefined
          ? undefined
          : `gj-accordion-${reactId}-${index}-description`;
        const indicatorProps = {
          color: itemDisabled ? theme.colors.textSubtle : theme.colors.textMuted,
          size: theme.metrics.icon.md,
          expanded,
        };
        const hasCustomIndicator = renderIndicator !== undefined;
        const customIndicator = renderIndicator?.(indicatorProps);
        const providerIndicator = renderIconSlot(icons.chevronDown, indicatorProps);
        const headerContent = (
          <>
            {item.leading}
            <View style={styles.copy}>
              <RNText style={[roleTextStyle(theme, 'label'), { color: theme.colors.text }]}>
                {item.title}
              </RNText>
              {item.description ? (
                <RNText
                  nativeID={descriptionId}
                  style={[roleTextStyle(theme, 'caption'), { color: theme.colors.textMuted }]}
                >
                  {item.description}
                </RNText>
              ) : null}
            </View>
            {item.trailing !== undefined && item.trailing !== null ? (
              <View
                aria-hidden
                accessible={false}
                importantForAccessibility="no-hide-descendants"
                style={styles.trailingSlot}
              >
                {item.trailing}
              </View>
            ) : null}
            <View aria-hidden accessible={false} style={styles.indicator}>
              {hasCustomIndicator ? customIndicator : (
                <View style={{ transform: [{ rotate: expanded ? '180deg' : '0deg' }] }}>
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
              )}
            </View>
          </>
        );
        const headerBaseStyle = [
          styles.header,
          {
            backgroundColor: theme.colors.surface,
            opacity: itemDisabled ? 0.55 : 1,
          },
          headerStyle,
        ];

        return (
          <View
            key={item.value}
            style={[
              styles.item,
              { borderBottomWidth: index === items.length - 1 ? 0 : 1 },
              itemStyle,
            ]}
          >
            <View
              accessibilityRole="header"
              {...webProps({ role: 'heading', 'aria-level': headingLevel })}
              style={styles.heading}
            >
              {Platform.OS === 'web' ? (
                lockedExpanded ? (
                  createElement(
                    'div',
                    {
                      id: headerId,
                      role: 'button',
                      tabIndex: 0,
                      'aria-controls': panelId,
                      'aria-expanded': expanded,
                      'aria-disabled': true,
                      'aria-label': item.title,
                      ...(descriptionId !== undefined ? { 'aria-describedby': descriptionId } : {}),
                      style: { width: '100%' },
                    },
                    <View style={headerBaseStyle}>{headerContent}</View>,
                  )
                ) : (
                  <View
                    {...webProps({
                      id: headerId,
                      role: 'button',
                      tabIndex: itemDisabled ? -1 : 0,
                      'aria-controls': panelId,
                      'aria-expanded': expanded,
                      'aria-disabled': itemDisabled,
                      'aria-label': item.title,
                      ...(descriptionId !== undefined ? { 'aria-describedby': descriptionId } : {}),
                      onClick: () => toggle(item),
                    })}
                    {...nativeWindProps(PRESSABLE_FEEDBACK_CLASS)}
                    style={headerBaseStyle}
                  >
                    {headerContent}
                  </View>
                )
              ) : (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={item.title}
                  accessibilityHint={item.description}
                  accessibilityState={{
                    expanded,
                    disabled: itemDisabled || lockedExpanded,
                  }}
                  disabled={itemDisabled || lockedExpanded || undefined}
                  onPress={() => toggle(item)}
                  {...nativeWindProps(PRESSABLE_FEEDBACK_CLASS)}
                  style={({ pressed }) => [
                    ...headerBaseStyle,
                    {
                      backgroundColor: pressed && !itemDisabled && !lockedExpanded
                        ? theme.colors.surfaceSubtle
                        : theme.colors.surface,
                    },
                  ]}
                >
                  {headerContent}
                </Pressable>
              )}
            </View>
            <View
              aria-hidden={!expanded}
              accessibilityElementsHidden={!expanded}
              importantForAccessibility={expanded ? 'auto' : 'no-hide-descendants'}
              {...webProps({
                id: panelId,
                ...(items.length <= 6 ? { role: 'region', 'aria-labelledby': headerId } : {}),
              })}
              style={[styles.content, { display: expanded ? 'flex' : 'none' }, contentStyle]}
            >
              {item.content}
            </View>
          </View>
        );
      })}
    </View>
  );
}
