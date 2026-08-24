/**
 * StatGrid — one bordered grid of reference metrics.
 *
 * A row of separate cards reads as N equally urgent things; one quiet grid reads
 * as reference data, which is what these numbers usually are. Every item is an
 * accessible group named "label, value[, hint]". A ratio renders a thin bar whose
 * value is exposed through the progressbar contract; the library never decides
 * thresholds — the caller passes the tone it has already judged.
 */
import type { ReactElement } from 'react';
import { StyleSheet, Text as RNText, View } from 'react-native';
import type { StyleProp, TextStyle, ViewStyle } from 'react-native';
import type { Theme } from '../theme/tokens';
import { nativeWindProps, themedStyles } from './internal';
import type { CommonProps } from './internal';
import { ProgressBar } from './progress';
import type { ProgressBarVariant } from './progress';
import { useTheme } from './provider';
import { roleTextStyle, TABULAR_NUMS_STYLE } from './text';

export type StatGridSize = 'sm' | 'md';
/** Color intent of a value and its bar. neutral uses the text color; the rest use the matching status role. */
export type StatTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

export interface StatItem {
  /** Stable identity for the cell. Defaults to label, which must then be unique within the grid. */
  readonly key?: string | undefined;
  /** Visible, nonblank metric name. */
  readonly label: string;
  /** Already-formatted figure; the library never formats numbers. */
  readonly value: string;
  /** Short secondary line under the value, such as a denominator or a time window. */
  readonly hint?: string | undefined;
  /**
   * Fraction from 0 to 1 that renders a thin bar under the value. Out-of-range
   * and non-finite input is clamped, and the clamped value is exposed to
   * assistive technology as a percentage.
   */
  readonly ratio?: number | undefined;
  /** Defaults to neutral. Thresholds belong to the caller. */
  readonly tone?: StatTone | undefined;
}

export interface StatGridProps extends Omit<CommonProps, 'unstyled'> {
  /** An empty array renders nothing at all — no empty frame. */
  items: readonly StatItem[];
  /** Integer number of cells per row. Defaults to 2. */
  columns?: number | undefined;
  /** Names the whole grid for assistive technology. */
  accessibilityLabel?: string | undefined;
  /** Defaults to md. */
  size?: StatGridSize | undefined;
  itemStyle?: StyleProp<ViewStyle> | undefined;
  itemClassName?: string | undefined;
  labelStyle?: StyleProp<TextStyle> | undefined;
  labelClassName?: string | undefined;
  valueStyle?: StyleProp<TextStyle> | undefined;
  valueClassName?: string | undefined;
  hintStyle?: StyleProp<TextStyle> | undefined;
  hintClassName?: string | undefined;
  unstyled?: never;
}

const getStyles = themedStyles((theme: Theme) => ({
  root: {
    alignSelf: 'stretch' as const,
    borderRadius: theme.radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    overflow: 'hidden' as const,
  },
  item: {
    flexGrow: 0,
    flexShrink: 0,
    minWidth: theme.spacing.none,
  },
  mdItem: {
    gap: theme.spacing.xs,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
  },
  smItem: {
    gap: theme.spacing.xs,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  mdLabel: { ...roleTextStyle(theme, 'label') },
  smLabel: { ...roleTextStyle(theme, 'caption') },
  mdValue: { ...roleTextStyle(theme, 'heading') },
  smValue: { ...roleTextStyle(theme, 'title') },
  hint: { ...roleTextStyle(theme, 'caption') },
  bar: { marginTop: theme.spacing.xs },
}));

function assertNonBlankString(value: unknown, name: string): asserts value is string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${name} must be a non-empty string.`);
  }
}

const TONES: readonly StatTone[] = ['neutral', 'info', 'success', 'warning', 'danger'];

export function assertStatGridProps(props: StatGridProps): void {
  if (!Array.isArray(props.items)) {
    throw new Error('StatGrid items must be an array.');
  }
  if (
    props.columns !== undefined &&
    (!Number.isInteger(props.columns) || props.columns < 1)
  ) {
    throw new Error('StatGrid columns must be an integer greater than or equal to 1.');
  }
  if (props.accessibilityLabel !== undefined) {
    assertNonBlankString(props.accessibilityLabel, 'StatGrid accessibilityLabel');
  }
  if (props.size !== undefined && props.size !== 'sm' && props.size !== 'md') {
    throw new Error('StatGrid size must be "sm" or "md".');
  }
  if ((props as { readonly unstyled?: unknown }).unstyled !== undefined) {
    throw new Error('StatGrid does not support unstyled.');
  }
  const keys = new Set<string>();
  props.items.forEach((item, index) => {
    assertNonBlankString(item.label, `StatGrid item at index ${index} label`);
    assertNonBlankString(item.value, `StatGrid item at index ${index} value`);
    if (item.key !== undefined) {
      assertNonBlankString(item.key, `StatGrid item at index ${index} key`);
    }
    if (item.hint !== undefined) {
      assertNonBlankString(item.hint, `StatGrid item at index ${index} hint`);
    }
    if (item.ratio !== undefined && typeof item.ratio !== 'number') {
      throw new Error(`StatGrid item at index ${index} ratio must be a number.`);
    }
    if (item.tone !== undefined && !TONES.includes(item.tone)) {
      throw new Error(
        `StatGrid item at index ${index} tone must be "neutral", "info", "success", "warning", or "danger".`,
      );
    }
    const key = item.key ?? item.label;
    if (keys.has(key)) {
      throw new Error(`StatGrid item key "${key}" is duplicated; give each cell a unique key.`);
    }
    keys.add(key);
  });
}

/** Clamps a ratio into [0, 1]; non-finite input becomes 0. */
export function clampStatRatio(ratio: number): number {
  if (!Number.isFinite(ratio)) return 0;
  return Math.min(1, Math.max(0, ratio));
}

function toneColor(theme: Theme, tone: StatTone): string {
  switch (tone) {
    case 'info':
      return theme.colors.info;
    case 'success':
      return theme.colors.success;
    case 'warning':
      return theme.colors.warning;
    case 'danger':
      return theme.colors.danger;
    default:
      return theme.colors.text;
  }
}

function toneBarVariant(tone: StatTone): ProgressBarVariant {
  switch (tone) {
    case 'info':
      return 'info';
    case 'success':
      return 'success';
    case 'warning':
      return 'warning';
    case 'danger':
      return 'error';
    default:
      return 'primary';
  }
}

/** A bordered N-column metric grid. Renders nothing when items is empty. */
export function StatGrid(props: StatGridProps): ReactElement | null {
  assertStatGridProps(props);
  const {
    items,
    columns = 2,
    accessibilityLabel,
    size = 'md',
    itemStyle,
    itemClassName,
    labelStyle,
    labelClassName,
    valueStyle,
    valueClassName,
    hintStyle,
    hintClassName,
    style,
    className,
    testID,
  } = props;
  const theme = useTheme();
  const styles = getStyles(theme);
  if (items.length === 0) return null;

  const fontFamily =
    theme.typography.fontFamily === undefined ? null : { fontFamily: theme.typography.fontFamily };
  const widthPercent = `${100 / columns}%` as const;

  return (
    <View
      {...(accessibilityLabel === undefined
        ? {}
        : { role: 'group' as const, accessibilityLabel, 'aria-label': accessibilityLabel })}
      testID={testID}
      {...nativeWindProps(className)}
      style={[
        styles.root,
        { backgroundColor: theme.colors.surface, borderColor: theme.colors.line },
        style,
      ]}
    >
      {items.map((item, index) => {
        const tone = item.tone ?? 'neutral';
        const ratio = item.ratio === undefined ? undefined : clampStatRatio(item.ratio);
        // 행 끝 셀만 오른쪽 선을 지운다. 마지막 행이 덜 찼어도 빈 영역과의 경계는 남는다.
        const lastInRow = (index + 1) % columns === 0;
        const firstRow = index < columns;
        const percent = ratio === undefined ? undefined : Math.round(ratio * 100);
        const name = [item.label, item.value, item.hint].filter(Boolean).join(', ');
        return (
          <View
            key={item.key ?? item.label}
            // 네이티브: 한 셀이 하나의 접근성 요소("라벨, 값, 힌트" + 비율 값)가 된다.
            // 웹: RNW는 accessible·accessibilityValue를 무시하므로 role=group 이름과
            // 자식 progressbar가 각각 노출된다 — 두 플랫폼 모두 비율을 잃지 않는다.
            accessible
            role="group"
            accessibilityLabel={name}
            aria-label={name}
            accessibilityValue={percent === undefined ? undefined : { min: 0, max: 100, now: percent }}
            testID={testID === undefined ? undefined : `${testID}-item-${index}`}
            {...nativeWindProps(itemClassName)}
            style={[
              styles.item,
              size === 'sm' ? styles.smItem : styles.mdItem,
              {
                borderColor: theme.colors.line,
                borderEndWidth: lastInRow ? 0 : StyleSheet.hairlineWidth,
                borderTopWidth: firstRow ? 0 : StyleSheet.hairlineWidth,
                width: widthPercent,
              },
              itemStyle,
            ]}
          >
            <RNText
              maxFontSizeMultiplier={theme.metrics.maxFontScale}
              {...nativeWindProps(labelClassName)}
              style={[
                size === 'sm' ? styles.smLabel : styles.mdLabel,
                fontFamily,
                { color: theme.colors.textMuted },
                labelStyle,
              ]}
            >
              {item.label}
            </RNText>
            <RNText
              maxFontSizeMultiplier={theme.metrics.maxFontScale}
              {...nativeWindProps(valueClassName)}
              style={[
                size === 'sm' ? styles.smValue : styles.mdValue,
                fontFamily,
                TABULAR_NUMS_STYLE,
                { color: toneColor(theme, tone) },
                valueStyle,
              ]}
            >
              {item.value}
            </RNText>
            {item.hint === undefined ? null : (
              <RNText
                maxFontSizeMultiplier={theme.metrics.maxFontScale}
                {...nativeWindProps(hintClassName)}
                style={[styles.hint, fontFamily, { color: theme.colors.textSubtle }, hintStyle]}
              >
                {item.hint}
              </RNText>
            )}
            {ratio === undefined ? null : (
              <ProgressBar
                accessibilityLabel={item.label}
                value={percent as number}
                max={100}
                size="sm"
                variant={toneBarVariant(tone)}
                style={styles.bar}
                testID={testID === undefined ? undefined : `${testID}-bar-${index}`}
              />
            )}
          </View>
        );
      })}
    </View>
  );
}
