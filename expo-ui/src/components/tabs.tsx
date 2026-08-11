/**
 * Tabs (formerly SegmentedTabs) — design doc §5.6.
 *
 * NoInfer<T> — a typo in value cannot pollute the inference of T from items (§6 ④).
 */
import { useId, useRef } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { Platform, Pressable, Text as RNText, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import type { Theme } from '../theme/tokens';
import { elevationStyle, nativeWindProps, themedStyles } from './internal';
import { useTheme } from './provider';

export interface TabItem<T extends string> {
  readonly label: string;
  readonly value: T;
  readonly disabled?: boolean | undefined;
}

type TabsBaseProps<T extends string> = {
  items: readonly TabItem<T>[];
  value: NoInfer<T>;
  onChange: (value: T) => void;
  /** The accessible name of the tablist. */
  accessibilityLabel: string;
  /** Defaults to 'segmented'. */
  variant?: 'segmented' | 'underline' | undefined;
  style?: StyleProp<ViewStyle> | undefined;
  className?: string | undefined;
  testID?: string | undefined;
  unstyled?: never;
};

type TabsPanelsProps<T extends string> = {
  /** The panel matching each value. A missing key or a typo is a type error. */
  panels: Readonly<Record<NoInfer<T>, NonNullable<ReactNode>>>;
  /** Defaults to keep-mounted. */
  panelMountStrategy?: 'keep-mounted' | 'active-only' | undefined;
  panelStyle?: StyleProp<ViewStyle> | undefined;
  panelClassName?: string | undefined;
};

export type TabsProps<T extends string> = TabsBaseProps<T> & TabsPanelsProps<T>;

/**
 * Tab row height — the predecessor's measured values preserved (segmented 40,
 * underline 48). No token concept corresponds to it, so it is named as a constant
 * (§3.8 exception — token-guard covers color and type literals).
 */
const SEGMENTED_TAB_MIN_HEIGHT = 40;
const UNDERLINE_TAB_MIN_HEIGHT = 48;

type Focusable = { focus?: () => void };

type WebKeyboardEvent = {
  readonly key: string;
  preventDefault: () => void;
};

function webProps(values: Record<string, unknown>): Record<string, unknown> {
  return Platform.OS === 'web' ? values : {};
}

function sanitizeId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, '');
}

const getStyles = themedStyles((theme: Theme) => ({
  segmentedTrack: {
    borderRadius: theme.radius.md,
    flexDirection: 'row' as const,
    gap: theme.spacing.xs,
    padding: theme.spacing.xs,
  },
  underlineTrack: { borderBottomWidth: 1, flexDirection: 'row' as const },
  tab: {
    alignItems: 'center' as const,
    flex: 1,
    justifyContent: 'center' as const,
    paddingHorizontal: theme.spacing.md,
  },
  segmentedTab: { borderRadius: theme.radius.sm, minHeight: SEGMENTED_TAB_MIN_HEIGHT },
  underlineTab: { minHeight: UNDERLINE_TAB_MIN_HEIGHT, borderBottomWidth: 2 },
  tabLabel: { textAlign: 'center' as const },
}));

export function Tabs<T extends string>({
  items,
  value,
  onChange,
  accessibilityLabel,
  variant = 'segmented',
  panels,
  panelMountStrategy = 'keep-mounted',
  panelStyle,
  panelClassName,
  style,
  className,
  testID,
}: TabsProps<T>): ReactElement {
  const theme = useTheme();
  const styles = getStyles(theme);
  const underline = variant === 'underline';
  const reactId = sanitizeId(useId());
  const refs = useRef<Array<Focusable | null>>([]);
  const enabledIndices = items.reduce<number[]>((indices, item, index) => {
    if (!item.disabled) indices.push(index);
    return indices;
  }, []);
  const selectedIndex = items.findIndex((item) => item.value === value && !item.disabled);
  const rovingIndex = selectedIndex >= 0 ? selectedIndex : (enabledIndices[0] ?? -1);

  function moveTo(index: number): void {
    const item = items[index];
    if (item === undefined || item.disabled) return;
    onChange(item.value);
    refs.current[index]?.focus?.();
  }

  function moveFrom(index: number, direction: 1 | -1): void {
    if (enabledIndices.length === 0) return;
    const position = enabledIndices.indexOf(index);
    const currentPosition = position >= 0 ? position : 0;
    const nextPosition =
      (currentPosition + direction + enabledIndices.length) % enabledIndices.length;
    const nextIndex = enabledIndices[nextPosition];
    if (nextIndex !== undefined) moveTo(nextIndex);
  }

  function moveToBoundary(position: 'first' | 'last'): void {
    const nextIndex =
      position === 'first' ? enabledIndices[0] : enabledIndices[enabledIndices.length - 1];
    if (nextIndex !== undefined) moveTo(nextIndex);
  }

  const track = (
    <View
      accessibilityRole="tablist"
      role="tablist"
      accessibilityLabel={accessibilityLabel}
      aria-label={accessibilityLabel}
      {...webProps({ 'aria-orientation': 'horizontal' })}
      testID={testID}
      {...nativeWindProps(className)}
      style={[
        underline
          ? [styles.underlineTrack, { borderBottomColor: theme.colors.line }]
          : [styles.segmentedTrack, { backgroundColor: theme.colors.surfaceSubtle }],
        style,
      ]}
    >
      {items.map((item, index) => {
        const disabled = item.disabled === true;
        const active = index === selectedIndex;
        const tabId = `gj-tabs-${reactId}-${index}-tab`;
        const panelId = `gj-tabs-${reactId}-${index}-panel`;
        const tabStyle = [
          styles.tab,
          underline
            ? [
                styles.underlineTab,
                { borderBottomColor: active ? theme.colors.tabActive : 'transparent' },
              ]
            : [
                styles.segmentedTab,
                { backgroundColor: active ? theme.colors.surface : 'transparent' },
                active ? elevationStyle(theme.elevation.sm, theme.colors.shadow) : null,
              ],
          { opacity: disabled ? 0.5 : 1 },
        ];
        const accessibilityProps = {
          accessible: true,
          accessibilityRole: 'tab' as const,
          role: 'tab' as const,
          accessibilityLabel: item.label,
          'aria-label': item.label,
          accessibilityState: { selected: active, disabled },
          'aria-selected': active,
          'aria-disabled': disabled,
          'aria-controls': panelId,
        };
        const label = (
            <RNText
              style={[
                styles.tabLabel,
                underline
                  ? {
                      // 전신 underline 탭 서체(16/'600') 보존 — typography.tab 롤(§3.2).
                      color: active ? theme.colors.tabActive : theme.colors.tabInactive,
                      fontSize: theme.typography.tab.fontSize,
                      fontWeight: active
                        ? theme.typography.tab.fontWeight
                        : theme.typography.body.fontWeight,
                    }
                  : {
                      color: active ? theme.colors.primary : theme.colors.textMuted,
                      fontSize: theme.typography.label.fontSize,
                      fontWeight: active
                        ? theme.typography.title.fontWeight
                        : theme.typography.body.fontWeight,
                    },
                theme.typography.fontFamily !== undefined
                  ? { fontFamily: theme.typography.fontFamily }
                  : null,
              ]}
            >
              {item.label}
            </RNText>
        );

        if (Platform.OS === 'web') {
          const onKeyDown = (event: WebKeyboardEvent): void => {
            if (disabled) return;
            switch (event.key) {
              case 'ArrowRight':
                event.preventDefault();
                moveFrom(index, 1);
                break;
              case 'ArrowLeft':
                event.preventDefault();
                moveFrom(index, -1);
                break;
              case 'Home':
                event.preventDefault();
                moveToBoundary('first');
                break;
              case 'End':
                event.preventDefault();
                moveToBoundary('last');
                break;
              case ' ':
              case 'Space':
              case 'Spacebar':
              case 'Enter':
                event.preventDefault();
                onChange(item.value);
                break;
            }
          };

          return (
            <View
              key={item.value}
              {...accessibilityProps}
              {...webProps({
                id: tabId,
                onClick: () => {
                  if (!disabled) onChange(item.value);
                },
                onKeyDown,
              })}
              ref={(node) => {
                refs.current[index] = node as unknown as Focusable | null;
              }}
              focusable={!disabled}
              tabIndex={disabled || index !== rovingIndex ? -1 : 0}
              style={tabStyle}
            >
              {label}
            </View>
          );
        }

        return (
          <Pressable
            key={item.value}
            {...accessibilityProps}
            nativeID={tabId}
            disabled={disabled}
            onPress={() => onChange(item.value)}
            style={({ pressed }) => [
              tabStyle,
              pressed && !disabled ? { opacity: 0.82 } : null,
            ]}
          >
            {label}
          </Pressable>
        );
      })}
    </View>
  );

  return (
    <>
      {track}
      {items.map((item, index) => {
        const active = index === selectedIndex;
        const mountContent = panelMountStrategy !== 'active-only' || active;
        const tabId = `gj-tabs-${reactId}-${index}-tab`;
        const panelId = `gj-tabs-${reactId}-${index}-panel`;
        const panelContent = panels[item.value];
        return (
          <View
            key={item.value}
            accessibilityRole="none"
            aria-hidden={!active}
            accessibilityElementsHidden={!active}
            importantForAccessibility={active ? 'auto' : 'no-hide-descendants'}
            {...webProps({ id: panelId, role: 'tabpanel', 'aria-labelledby': tabId })}
            {...nativeWindProps(panelClassName)}
            tabIndex={active ? 0 : -1}
            style={[panelStyle, { display: active ? 'flex' : 'none' }]}
          >
            {!mountContent ? null : typeof panelContent === 'string' || typeof panelContent === 'number' ? (
              <RNText
                style={{
                  color: theme.colors.text,
                  fontSize: theme.typography.body.fontSize,
                  fontWeight: theme.typography.body.fontWeight,
                  lineHeight: theme.typography.body.lineHeight,
                  ...(theme.typography.fontFamily !== undefined
                    ? { fontFamily: theme.typography.fontFamily }
                    : {}),
                }}
              >
                {panelContent}
              </RNText>
            ) : (
              panelContent
            )}
          </View>
        );
      })}
    </>
  );
}
