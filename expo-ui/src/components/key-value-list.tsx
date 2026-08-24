/**
 * KeyValueList — a description list for detail panes.
 *
 * The web build emits a real `<dl>` with `<dt>`/`<dd>` pairs (each pair wrapped
 * in a `<div>`, which HTML permits inside `dl`) through the same narrow raw-host
 * boundary DataTable uses for `<table>`. Native has no description-list
 * semantics, so it uses the honest `list`/`listitem` roles and folds scalar
 * pairs into one "label: value" accessibility element.
 */
import type { ReactElement, ReactNode } from 'react';
import { Platform, StyleSheet, Text as RNText, View } from 'react-native';
import type { StyleProp, TextStyle, ViewStyle } from 'react-native';
import type { Theme } from '../theme/tokens';
import { nativeWindProps, themedStyles } from './internal';
import type { CommonProps } from './internal';
import { useTheme } from './provider';
import { rawDomStyle, rawElement } from './raw-dom';
import { roleTextStyle } from './text';

export type KeyValueListLayout = 'stacked' | 'inline';
export type KeyValueListSize = 'sm' | 'md';

export interface KeyValueItem {
  /** Stable identity for the row. Defaults to label, which must then be unique within the list. */
  readonly key?: string | undefined;
  /** Visible, nonblank term. */
  readonly label: string;
  /**
   * Strings and numbers render as themed text; any other node renders as
   * supplied. Booleans and nullish values render nothing and are rejected at
   * compile time and at runtime — omit the row instead.
   */
  readonly value: Exclude<NonNullable<ReactNode>, boolean>;
}

export interface KeyValueListProps extends Omit<CommonProps, 'unstyled'> {
  /** An empty list renders nothing at all — no empty container. */
  items: readonly KeyValueItem[];
  /** Names the list for assistive technology. Omit when a nearby heading already names the section. */
  accessibilityLabel?: string | undefined;
  /** inline places the label left of the value on one row; stacked places the label above. Defaults to inline. */
  layout?: KeyValueListLayout | undefined;
  /** Defaults to md. */
  size?: KeyValueListSize | undefined;
  /** Draws a hairline between rows. Defaults to false. */
  divider?: boolean | undefined;
  labelStyle?: StyleProp<TextStyle> | undefined;
  labelClassName?: string | undefined;
  /** Applies to the value text; for a custom node it applies to the node's wrapper instead. */
  valueStyle?: StyleProp<TextStyle> | undefined;
  valueClassName?: string | undefined;
  rowStyle?: StyleProp<ViewStyle> | undefined;
  rowClassName?: string | undefined;
  unstyled?: never;
}

const getStyles = themedStyles((theme: Theme) => ({
  root: {
    alignSelf: 'stretch' as const,
    flexDirection: 'column' as const,
  },
  inlineRow: {
    alignItems: 'flex-start' as const,
    flexDirection: 'row' as const,
    gap: theme.spacing.md,
  },
  stackedRow: {
    flexDirection: 'column' as const,
    gap: theme.spacing.xs,
  },
  inlineLabel: {
    flexShrink: 0,
    // DataTable의 기본 열 최소폭과 같은 값 — 라벨 열이 행마다 흔들리지 않게 고정한다.
    width: theme.metrics.control.lg * 2,
  },
  value: {
    flexGrow: 1,
    flexShrink: 1,
    minWidth: theme.spacing.none,
  },
  mdLabel: { ...roleTextStyle(theme, 'label') },
  smLabel: { ...roleTextStyle(theme, 'caption') },
  mdValue: { ...roleTextStyle(theme, 'body') },
  smValue: { ...roleTextStyle(theme, 'caption') },
}));

function assertNonBlankString(value: unknown, name: string): asserts value is string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${name} must be a non-empty string.`);
  }
}

export function assertKeyValueListProps(props: KeyValueListProps): void {
  if (!Array.isArray(props.items)) {
    throw new Error('KeyValueList items must be an array.');
  }
  if (props.accessibilityLabel !== undefined) {
    assertNonBlankString(props.accessibilityLabel, 'KeyValueList accessibilityLabel');
  }
  if (props.layout !== undefined && props.layout !== 'stacked' && props.layout !== 'inline') {
    throw new Error('KeyValueList layout must be "stacked" or "inline".');
  }
  if (props.size !== undefined && props.size !== 'sm' && props.size !== 'md') {
    throw new Error('KeyValueList size must be "sm" or "md".');
  }
  if ((props as { readonly unstyled?: unknown }).unstyled !== undefined) {
    throw new Error('KeyValueList does not support unstyled.');
  }
  const keys = new Set<string>();
  props.items.forEach((item, index) => {
    assertNonBlankString(item.label, `KeyValueList item at index ${index} label`);
    if (item.key !== undefined) {
      assertNonBlankString(item.key, `KeyValueList item at index ${index} key`);
    }
    if (item.value === null || item.value === undefined || typeof item.value === 'boolean') {
      throw new Error(`KeyValueList item at index ${index} value must be a renderable node.`);
    }
    const key = item.key ?? item.label;
    if (keys.has(key)) {
      throw new Error(`KeyValueList item key "${key}" is duplicated; give each row a unique key.`);
    }
    keys.add(key);
  });
}

function isScalar(value: ReactNode): value is string | number {
  return typeof value === 'string' || typeof value === 'number';
}

/** A themed description list. Renders nothing when items is empty. */
export function KeyValueList(props: KeyValueListProps): ReactElement | null {
  assertKeyValueListProps(props);
  const {
    items,
    accessibilityLabel,
    layout = 'inline',
    size = 'md',
    divider = false,
    labelStyle,
    labelClassName,
    valueStyle,
    valueClassName,
    rowStyle,
    rowClassName,
    style,
    className,
    testID,
  } = props;
  const theme = useTheme();
  const styles = getStyles(theme);
  if (items.length === 0) return null;

  const inline = layout === 'inline';
  const rowGap = size === 'sm' ? theme.spacing.xs : theme.spacing.sm;
  const rootLayoutStyle: ViewStyle = { gap: divider ? theme.spacing.none : rowGap };
  const rowLayoutStyle = (index: number): ViewStyle =>
    divider
      ? {
          borderBottomColor: theme.colors.line,
          borderBottomWidth: index === items.length - 1 ? 0 : StyleSheet.hairlineWidth,
          paddingVertical: rowGap,
        }
      : {};
  const labelTextStyle = [
    size === 'sm' ? styles.smLabel : styles.mdLabel,
    theme.typography.fontFamily === undefined ? null : { fontFamily: theme.typography.fontFamily },
    { color: theme.colors.textMuted },
    inline ? styles.inlineLabel : null,
    labelStyle,
  ];
  const valueTextStyle = [
    size === 'sm' ? styles.smValue : styles.mdValue,
    theme.typography.fontFamily === undefined ? null : { fontFamily: theme.typography.fontFamily },
    { color: theme.colors.text },
  ];

  const renderLabel = (item: KeyValueItem): ReactElement => (
    <RNText
      maxFontSizeMultiplier={theme.metrics.maxFontScale}
      {...nativeWindProps(labelClassName)}
      style={labelTextStyle}
    >
      {item.label}
    </RNText>
  );
  const renderValue = (item: KeyValueItem): ReactElement =>
    isScalar(item.value) ? (
      <RNText
        maxFontSizeMultiplier={theme.metrics.maxFontScale}
        {...nativeWindProps(valueClassName)}
        style={[valueTextStyle, valueStyle]}
      >
        {item.value}
      </RNText>
    ) : (
      <View {...nativeWindProps(valueClassName)} style={[styles.value, valueStyle]}>
        {item.value}
      </View>
    );

  if (Platform.OS === 'web') {
    // dl/dd의 UA 기본 margin을 지우고, RN 레이아웃 스타일을 raw CSS로 번역해 붙인다.
    // 라벨 열 폭은 반드시 블록 레벨 flex item인 <dt>가 가져야 한다 — RNW Text는
    // display:inline이라 안쪽 Text에 준 width는 무시되고 값 열이 정렬되지 않는다.
    // inlineLabel의 기본 폭과 소비자 labelStyle의 크기 속성을 dt로 끌어올린다.
    const labelSizingKeys = [
      'flex',
      'flexBasis',
      'flexGrow',
      'flexShrink',
      'maxWidth',
      'minWidth',
      'width',
    ] as const;
    const flatLabelStyle = StyleSheet.flatten([
      inline ? styles.inlineLabel : null,
      labelStyle,
    ]) as Record<string, unknown> | null | undefined;
    const labelSizing: Record<string, unknown> = {};
    if (flatLabelStyle !== null && flatLabelStyle !== undefined) {
      for (const key of labelSizingKeys) {
        if (flatLabelStyle[key] !== undefined) labelSizing[key] = flatLabelStyle[key];
      }
    }
    const labelColumnStyle = rawDomStyle(labelSizing);
    const rows = items.map((item, index) => {
      const key = item.key ?? item.label;
      return rawElement(
        'div',
        {
          key,
          className: rowClassName,
          style: {
            display: 'flex',
            ...rawDomStyle([
              inline ? styles.inlineRow : styles.stackedRow,
              rowLayoutStyle(index),
              rowStyle,
            ]),
          },
        },
        // 소비자가 labelStyle로 라벨 열 폭을 바꾸면 dt가 함께 늘어난다 — 크기
        // 속성은 위에서 dt로 끌어올렸고, 글자 스타일은 안쪽 Text에 남는다.
        rawElement(
          'dt',
          { style: { flexShrink: 0, margin: 0, ...labelColumnStyle } },
          renderLabel(item),
        ),
        rawElement(
          'dd',
          { style: { margin: 0, ...rawDomStyle(styles.value) } },
          renderValue(item),
        ),
      );
    });
    return rawElement(
      'dl',
      {
        ...(accessibilityLabel === undefined ? {} : { 'aria-label': accessibilityLabel }),
        ...(testID === undefined ? {} : { 'data-testid': testID }),
        className,
        style: {
          display: 'flex',
          margin: 0,
          ...rawDomStyle([styles.root, rootLayoutStyle, style]),
        },
      },
      ...rows,
    );
  }

  return (
    <View
      accessibilityRole="list"
      role="list"
      accessibilityLabel={accessibilityLabel}
      testID={testID}
      {...nativeWindProps(className)}
      style={[styles.root, rootLayoutStyle, style]}
    >
      {items.map((item, index) => {
        const scalar = isScalar(item.value);
        return (
          <View
            key={item.key ?? item.label}
            role="listitem"
            // 스칼라 값은 "라벨: 값" 하나로 읽히고, 커스텀 노드는 내부 요소가 각각 닿을 수 있게 남긴다.
            accessible={scalar}
            accessibilityLabel={scalar ? `${item.label}: ${String(item.value)}` : undefined}
            {...nativeWindProps(rowClassName)}
            style={[
              inline ? styles.inlineRow : styles.stackedRow,
              rowLayoutStyle(index),
              rowStyle,
            ]}
          >
            {renderLabel(item)}
            {renderValue(item)}
          </View>
        );
      })}
    </View>
  );
}
