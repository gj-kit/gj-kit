/**
 * Tabs (구 SegmentedTabs) — 설계 문서 §5.6.
 *
 * NoInfer<T> — value 오타가 items의 T 추론을 오염시키지 못한다(§6 ④).
 */
import type { ReactElement } from 'react';
import { Pressable, Text as RNText, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import type { Theme } from '../theme/tokens';
import { elevationStyle, nativeWindProps, themedStyles } from './internal';
import { useTheme } from './provider';

export interface TabItem<T extends string> {
  readonly label: string;
  readonly value: T;
  readonly disabled?: boolean | undefined;
}

export interface TabsProps<T extends string> {
  items: readonly TabItem<T>[];
  value: NoInfer<T>;
  onChange: (value: T) => void;
  /** 기본 'segmented'. */
  variant?: 'segmented' | 'underline' | undefined;
  style?: StyleProp<ViewStyle> | undefined;
  className?: string | undefined;
  testID?: string | undefined;
  unstyled?: never;
}

/**
 * 탭 행 높이 — 전신 실측 보존(segmented 40 / underline 48). 토큰에 대응 개념이
 * 없어 상수로 명명(§3.8 예외 — token-guard 범위는 색·서체 리터럴).
 */
const SEGMENTED_TAB_MIN_HEIGHT = 40;
const UNDERLINE_TAB_MIN_HEIGHT = 48;

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
  variant = 'segmented',
  style,
  className,
  testID,
}: TabsProps<T>): ReactElement {
  const theme = useTheme();
  const styles = getStyles(theme);
  const underline = variant === 'underline';

  return (
    <View
      testID={testID}
      {...nativeWindProps(className)}
      style={[
        underline
          ? [styles.underlineTrack, { borderBottomColor: theme.colors.line }]
          : [styles.segmentedTrack, { backgroundColor: theme.colors.surfaceSubtle }],
        style,
      ]}
    >
      {items.map((item) => {
        const active = item.value === value;
        return (
          <Pressable
            key={item.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: active, ...(item.disabled !== undefined ? { disabled: item.disabled } : {}) }}
            aria-selected={active}
            disabled={item.disabled}
            onPress={() => onChange(item.value)}
            style={({ pressed }) => [
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
              pressed && !item.disabled ? { opacity: 0.82 } : null,
            ]}
          >
            <RNText
              style={[
                styles.tabLabel,
                underline
                  ? {
                      color: active ? theme.colors.tabActive : theme.colors.tabInactive,
                      fontSize: theme.typography.body.fontSize,
                      fontWeight: active
                        ? theme.typography.label.fontWeight
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
          </Pressable>
        );
      })}
    </View>
  );
}
