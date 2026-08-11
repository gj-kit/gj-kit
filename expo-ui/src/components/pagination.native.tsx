import type { ReactElement } from "react";
import {
  I18nManager,
  Pressable,
  StyleSheet,
  Text as RNText,
  useWindowDimensions,
  View,
} from "react-native";
import type { GestureResponderEvent } from "react-native";
import type { Theme } from "../theme/tokens";
import { PRESSABLE_FEEDBACK_CLASS } from "./button";
import { mergeClassNames, nativeWindProps, themedStyles } from "./internal";
import { getPaginationRange } from "./pagination-range";
import {
  assertPaginationProps,
  getPaginationNavigateDetails,
  getPaginationPageAccessibilityLabel,
  getPaginationPageChangeDetails,
  getPaginationPageCount,
  getPaginationStatusLabel,
} from "./pagination-validation";
import type { PaginationProps } from "./pagination.types";
import { useStrings, useTheme } from "./provider";
import { roleTextStyle } from "./text";

type PaginationControlProps = {
  readonly accessibilityLabel: string;
  readonly visibleLabel: string;
  readonly selected?: boolean | undefined;
  readonly disabled: boolean;
  readonly busy: boolean;
  readonly size: "sm" | "md";
  readonly onPress: (event: GestureResponderEvent) => void;
  readonly testID?: string | undefined;
  readonly controlStyle: PaginationProps["controlStyle"];
  readonly controlClassName: PaginationProps["controlClassName"];
  readonly controlLabelStyle: PaginationProps["controlLabelStyle"];
  readonly controlLabelClassName: PaginationProps["controlLabelClassName"];
};

const getStyles = themedStyles((theme: Theme) => ({
  root: {
    alignItems: "center" as const,
    alignSelf: "flex-start" as const,
  },
  controls: {
    alignItems: "center" as const,
    flexDirection: "row" as const,
    flexWrap: "wrap" as const,
    justifyContent: "center" as const,
  },
  control: {
    alignItems: "center" as const,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: "center" as const,
  },
  controlLabel: {
    includeFontPadding: false,
    textAlign: "center" as const,
  },
  status: {
    includeFontPadding: false,
    textAlign: "center" as const,
  },
  ellipsis: {
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  ellipsisLabel: {
    includeFontPadding: false,
    textAlign: "center" as const,
  },
}));

function originalEvent(event: GestureResponderEvent): unknown {
  return event.nativeEvent;
}

function safeControlStyle(
  style: PaginationProps["controlStyle"],
  minimumDimension: number
): PaginationProps["controlStyle"] {
  const flattened = StyleSheet.flatten(style);
  if (flattened === undefined) return undefined;
  const { maxHeight, maxWidth, ...rest } = flattened;
  return {
    ...rest,
    ...(typeof maxHeight === "number"
      ? { maxHeight: Math.max(maxHeight, minimumDimension) }
      : null),
    ...(typeof maxWidth === "number"
      ? { maxWidth: Math.max(maxWidth, minimumDimension) }
      : null),
  };
}

function PaginationControl({
  accessibilityLabel,
  visibleLabel,
  selected,
  disabled,
  busy,
  size,
  onPress,
  testID,
  controlStyle,
  controlClassName,
  controlLabelStyle,
  controlLabelClassName,
}: PaginationControlProps): ReactElement {
  const theme = useTheme();
  const styles = getStyles(theme);
  const dimension = theme.metrics.control[size];
  const hitSlop = Math.max(
    theme.spacing.none,
    (theme.metrics.control.md - dimension) / 2
  );
  const inert = disabled || busy;
  const isSelected = selected === true;
  const foreground = inert
    ? theme.colors.textSubtle
    : isSelected
    ? theme.colors.primaryStrong
    : theme.colors.text;
  const background = isSelected
    ? theme.colors.primarySoft
    : inert
    ? theme.colors.surfaceSubtle
    : theme.colors.surface;
  const border = isSelected ? theme.colors.primary : theme.colors.line;
  const typography =
    size === "sm" ? theme.typography.caption : theme.typography.label;

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={{
        busy,
        disabled: inert,
        ...(selected === undefined ? null : { selected }),
      }}
      aria-busy={busy}
      aria-disabled={inert}
      aria-selected={selected}
      disabled={inert}
      hitSlop={hitSlop}
      onPress={onPress}
      role="button"
      testID={testID}
      {...nativeWindProps(
        mergeClassNames(PRESSABLE_FEEDBACK_CLASS, controlClassName)
      )}
      style={({ pressed }) => [
        styles.control,
        {
          backgroundColor:
            pressed && !inert && !isSelected
              ? theme.colors.primarySoft
              : background,
          borderColor: border,
          borderRadius: theme.radius.sm,
          minHeight: dimension,
          minWidth: dimension,
          paddingHorizontal:
            size === "sm" ? theme.spacing.sm : theme.spacing.md,
        },
        controlStyle,
        { minHeight: dimension, minWidth: dimension },
      ]}
    >
      <RNText
        {...nativeWindProps(controlLabelClassName)}
        maxFontSizeMultiplier={theme.metrics.maxFontScale}
        style={[
          styles.controlLabel,
          typography,
          theme.typography.fontFamily === undefined
            ? null
            : { fontFamily: theme.typography.fontFamily },
          { color: foreground },
          controlLabelStyle,
        ]}
      >
        {visibleLabel}
      </RNText>
    </Pressable>
  );
}

export function Pagination(props: PaginationProps): ReactElement {
  const theme = useTheme();
  const strings = useStrings();
  const { width } = useWindowDimensions();
  const styles = getStyles(theme);
  const {
    accessibilityLabel,
    size = "md",
    disabled = false,
    busy = false,
    previousLabel = strings.previousPage,
    nextLabel = strings.nextPage,
    controlStyle,
    controlClassName,
    controlLabelStyle,
    controlLabelClassName,
    statusStyle,
    statusClassName,
    style,
    className,
    testID,
  } = props;
  assertPaginationProps(props, { previousLabel, nextLabel });
  const direction = props.direction ?? (I18nManager.isRTL ? "rtl" : "ltr");
  const numbered = props.mode === "numbered";
  const pageCount = numbered ? getPaginationPageCount(props) : 0;
  const presentation =
    !numbered || props.presentation === "compact"
      ? "compact"
      : props.presentation === "full"
      ? "full"
      : width < theme.breakpoints.tablet
      ? "compact"
      : "full";
  const dimension = theme.metrics.control[size];
  const typography =
    size === "sm" ? theme.typography.caption : theme.typography.label;

  const sharedControlProps = {
    busy,
    size,
    controlStyle: safeControlStyle(controlStyle, dimension),
    controlClassName,
    controlLabelStyle,
    controlLabelClassName,
  } as const;

  const previousDisabled = numbered
    ? disabled || props.page <= 1 || pageCount === 0
    : disabled || !props.hasPreviousPage;
  const nextDisabled = numbered
    ? disabled || props.page >= pageCount || pageCount === 0
    : disabled || !props.hasNextPage;

  const previousControl = (
    <PaginationControl
      {...sharedControlProps}
      accessibilityLabel={previousLabel}
      visibleLabel={previousLabel}
      disabled={previousDisabled}
      onPress={(event) => {
        if (busy || previousDisabled) return;
        if (props.mode === "cursor") {
          props.onNavigate(
            "previous",
            getPaginationNavigateDetails(
              props,
              "previous",
              originalEvent(event)
            )
          );
          return;
        }
        const nextPage = props.page - 1;
        if (props.countMode === "items") {
          props.onPageChange(
            nextPage,
            getPaginationPageChangeDetails(
              props,
              nextPage,
              "previous-press",
              originalEvent(event)
            )
          );
        } else {
          props.onPageChange(
            nextPage,
            getPaginationPageChangeDetails(
              props,
              nextPage,
              "previous-press",
              originalEvent(event)
            )
          );
        }
      }}
      testID={testID === undefined ? undefined : `${testID}-previous`}
    />
  );

  const nextControl = (
    <PaginationControl
      {...sharedControlProps}
      accessibilityLabel={nextLabel}
      visibleLabel={nextLabel}
      disabled={nextDisabled}
      onPress={(event) => {
        if (busy || nextDisabled) return;
        if (props.mode === "cursor") {
          props.onNavigate(
            "next",
            getPaginationNavigateDetails(props, "next", originalEvent(event))
          );
          return;
        }
        const nextPage = props.page + 1;
        if (props.countMode === "items") {
          props.onPageChange(
            nextPage,
            getPaginationPageChangeDetails(
              props,
              nextPage,
              "next-press",
              originalEvent(event)
            )
          );
        } else {
          props.onPageChange(
            nextPage,
            getPaginationPageChangeDetails(
              props,
              nextPage,
              "next-press",
              originalEvent(event)
            )
          );
        }
      }}
      testID={testID === undefined ? undefined : `${testID}-next`}
    />
  );

  const statusLabel = getPaginationStatusLabel(props);
  const status = (
    <RNText
      accessibilityRole="text"
      {...nativeWindProps(statusClassName)}
      maxFontSizeMultiplier={theme.metrics.maxFontScale}
      style={[
        styles.status,
        typography,
        theme.typography.fontFamily === undefined
          ? null
          : { fontFamily: theme.typography.fontFamily },
        {
          color: theme.colors.textMuted,
          minHeight: dimension,
          minWidth: theme.metrics.control.lg,
          paddingHorizontal: theme.spacing.md,
          textAlignVertical: "center",
        },
        statusStyle,
      ]}
      testID={testID === undefined ? undefined : `${testID}-status`}
    >
      {statusLabel}
    </RNText>
  );

  const fullRange =
    numbered && presentation === "full"
      ? getPaginationRange({
          page: props.page,
          pageCount,
          boundaryCount: props.boundaryCount,
          siblingCount: props.siblingCount,
        }).map((item) => {
          if (item.type !== "page") {
            return (
              <View
                key={item.type}
                accessibilityElementsHidden
                accessible={false}
                aria-hidden
                importantForAccessibility="no-hide-descendants"
                style={[
                  styles.ellipsis,
                  { minHeight: dimension, minWidth: dimension },
                ]}
                testID={
                  testID === undefined ? undefined : `${testID}-${item.type}`
                }
              >
                <RNText
                  maxFontSizeMultiplier={theme.metrics.maxFontScale}
                  style={[
                    styles.ellipsisLabel,
                    roleTextStyle(theme, size === "sm" ? "caption" : "label"),
                    { color: theme.colors.textSubtle },
                  ]}
                >
                  …
                </RNText>
              </View>
            );
          }

          const pageAccessibilityLabel =
            getPaginationPageAccessibilityLabel(props, item.page, pageCount) ??
            String(item.page);
          return (
            <PaginationControl
              key={item.page}
              {...sharedControlProps}
              accessibilityLabel={pageAccessibilityLabel}
              visibleLabel={String(item.page)}
              selected={item.current}
              disabled={disabled}
              onPress={(event) => {
                if (
                  busy ||
                  disabled ||
                  item.current ||
                  props.mode !== "numbered"
                )
                  return;
                if (props.countMode === "items") {
                  props.onPageChange(
                    item.page,
                    getPaginationPageChangeDetails(
                      props,
                      item.page,
                      "page-press",
                      originalEvent(event)
                    )
                  );
                } else {
                  props.onPageChange(
                    item.page,
                    getPaginationPageChangeDetails(
                      props,
                      item.page,
                      "page-press",
                      originalEvent(event)
                    )
                  );
                }
              }}
              testID={
                testID === undefined ? undefined : `${testID}-page-${item.page}`
              }
            />
          );
        })
      : null;

  return (
    <View
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="toolbar"
      accessibilityState={{ busy, disabled }}
      aria-busy={busy}
      aria-disabled={disabled}
      aria-label={accessibilityLabel}
      role="toolbar"
      testID={testID}
      {...nativeWindProps(className)}
      style={[styles.root, { gap: theme.spacing.xs }, style, { direction }]}
    >
      {status}
      <View
        accessible={false}
        style={[styles.controls, { direction, gap: theme.spacing.xs }]}
        testID={testID === undefined ? undefined : `${testID}-controls`}
      >
        {previousControl}
        {presentation === "full" ? fullRange : null}
        {nextControl}
      </View>
    </View>
  );
}
