/**
 * Web Pagination.
 *
 * The web entry deliberately emits native HTML navigation controls. Pagination
 * is a controlled request surface: it never owns the current page, fetches
 * data, or changes cursor state by itself.
 */
import { createElement } from "react";
import type { ReactElement, ReactNode } from "react";
import { I18nManager, StyleSheet } from "react-native";
import type { Theme } from "../theme/tokens";
import { PRESSABLE_FEEDBACK_CLASS } from "./button";
import { mergeClassNames, themedStyles } from "./internal";
import {
  assertPaginationProps,
  getPaginationNavigateDetails,
  getPaginationPageAccessibilityLabel,
  getPaginationPageChangeDetails,
  getPaginationPageCount,
  getPaginationStatusLabel,
} from "./pagination-validation";
import { getPaginationRange } from "./pagination-range";
import type { PaginationRangeItem } from "./pagination-range";
import type {
  PaginationDirection,
  PaginationNumberedItemsProps,
  PaginationNumberedPagesProps,
  PaginationPageChangeReason,
  PaginationProps,
} from "./pagination.types";
import { useStrings, useTheme } from "./provider";
import { roleTextStyle } from "./text";

type RawProps = Record<string, unknown>;
type RawStyle = Record<string, unknown>;

/** src has no DOM lib. Keep the raw-host bridge private and deliberately narrow. */
function rawElement(
  tag: string,
  props: RawProps | null,
  ...children: ReactNode[]
): ReactElement {
  return createElement(
    tag as never,
    props as never,
    ...children
  ) as ReactElement;
}

const RAW_STYLE_ALIASES: Readonly<Record<string, string>> = {
  borderBottomEndRadius: "borderEndEndRadius",
  borderBottomStartRadius: "borderEndStartRadius",
  borderEndColor: "borderInlineEndColor",
  borderEndWidth: "borderInlineEndWidth",
  borderStartColor: "borderInlineStartColor",
  borderStartWidth: "borderInlineStartWidth",
  borderTopEndRadius: "borderStartEndRadius",
  borderTopStartRadius: "borderStartStartRadius",
  end: "insetInlineEnd",
  marginEnd: "marginInlineEnd",
  marginStart: "marginInlineStart",
  paddingEnd: "paddingInlineEnd",
  paddingStart: "paddingInlineStart",
  start: "insetInlineStart",
};

const RAW_AXIS_STYLE_EXPANSIONS: Readonly<Record<string, readonly string[]>> = {
  marginHorizontal: ["marginLeft", "marginRight"],
  marginVertical: ["marginTop", "marginBottom"],
  paddingHorizontal: ["paddingLeft", "paddingRight"],
  paddingVertical: ["paddingTop", "paddingBottom"],
};

const RAW_LENGTH_PROPERTIES = new Set([
  "borderBottomLeftRadius",
  "borderBottomRightRadius",
  "borderBottomWidth",
  "borderEndEndRadius",
  "borderEndStartRadius",
  "borderInlineEndWidth",
  "borderInlineStartWidth",
  "borderLeftWidth",
  "borderRadius",
  "borderRightWidth",
  "borderStartEndRadius",
  "borderStartStartRadius",
  "borderTopLeftRadius",
  "borderTopRightRadius",
  "borderTopWidth",
  "borderWidth",
  "bottom",
  "columnGap",
  "fontSize",
  "gap",
  "height",
  "insetInlineEnd",
  "insetInlineStart",
  "left",
  "letterSpacing",
  "lineHeight",
  "margin",
  "marginBottom",
  "marginInlineEnd",
  "marginInlineStart",
  "marginLeft",
  "marginRight",
  "marginTop",
  "maxHeight",
  "maxWidth",
  "minHeight",
  "minWidth",
  "outlineOffset",
  "outlineWidth",
  "padding",
  "paddingBottom",
  "paddingInlineEnd",
  "paddingInlineStart",
  "paddingLeft",
  "paddingRight",
  "paddingTop",
  "right",
  "rowGap",
  "top",
  "width",
]);

const RAW_DIRECT_PROPERTIES = new Set([
  "alignContent",
  "alignItems",
  "alignSelf",
  "backgroundColor",
  "borderBottomColor",
  "borderColor",
  "borderInlineEndColor",
  "borderInlineStartColor",
  "borderLeftColor",
  "borderRightColor",
  "borderStyle",
  "borderTopColor",
  "boxSizing",
  "color",
  "cursor",
  "direction",
  "display",
  "flex",
  "flexDirection",
  "flexGrow",
  "flexShrink",
  "flexWrap",
  "fontFamily",
  "fontStyle",
  "justifyContent",
  "opacity",
  "overflow",
  "position",
  "textDecorationColor",
  "textDecorationLine",
  "textDecorationStyle",
  "textTransform",
  "userSelect",
  "zIndex",
]);

function rawPrimitive(value: unknown): string | number | undefined {
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return undefined;
}

function rawLength(value: unknown): string | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return `${value}px`;
  return typeof value === "string" ? value : undefined;
}

function rawFontWeight(value: unknown): string | number | undefined {
  const aliases: Readonly<Record<string, number>> = {
    black: 900,
    condensed: 400,
    condensedBold: 700,
    heavy: 800,
    light: 300,
    medium: 500,
    regular: 400,
    semibold: 600,
    thin: 100,
    ultralight: 100,
  };
  if (typeof value === "string" && value in aliases) return aliases[value];
  return rawPrimitive(value);
}

/**
 * Raw HTML descendants bypass RNW's style resolver. Translate the supported RN
 * hook surface instead of leaking RN-only shorthands or unitless lineHeight.
 */
function rawDomStyle(style: unknown): RawStyle | undefined {
  const flat = StyleSheet.flatten(style as never);
  if (flat === undefined || flat === null) return undefined;
  const source = flat as unknown as RawStyle;
  const result: RawStyle = {};

  for (const [nativeName, nativeValue] of Object.entries(source)) {
    const expandedNames = RAW_AXIS_STYLE_EXPANSIONS[nativeName];
    if (expandedNames !== undefined) {
      const value = rawLength(nativeValue);
      if (value !== undefined) {
        for (const name of expandedNames) result[name] = value;
      }
      continue;
    }
    const name = RAW_STYLE_ALIASES[nativeName] ?? nativeName;
    if (RAW_LENGTH_PROPERTIES.has(name)) {
      const value = rawLength(nativeValue);
      if (value !== undefined) result[name] = value;
    } else if (RAW_DIRECT_PROPERTIES.has(name)) {
      const value = rawPrimitive(nativeValue);
      if (value !== undefined) result[name] = value;
    } else if (name === "fontWeight") {
      const value = rawFontWeight(nativeValue);
      if (value !== undefined) result.fontWeight = value;
    } else if (name === "fontVariant" && Array.isArray(nativeValue)) {
      const values = nativeValue.filter(
        (value): value is string => typeof value === "string"
      );
      if (values.length === nativeValue.length) {
        result.fontVariant = values.join(" ");
      }
    } else if (name === "textAlign" && nativeValue !== "auto") {
      const value = rawPrimitive(nativeValue);
      if (value !== undefined) result.textAlign = value;
    } else if (
      name === "writingDirection" &&
      (nativeValue === "ltr" || nativeValue === "rtl")
    ) {
      result.direction = nativeValue;
    } else if (
      name === "pointerEvents" &&
      (nativeValue === "auto" || nativeValue === "none")
    ) {
      result.pointerEvents = nativeValue;
    }
  }

  return Object.keys(result).length === 0 ? undefined : result;
}

function originalEvent(event: unknown): unknown {
  if (typeof event === "object" && event !== null && "nativeEvent" in event) {
    return (event as { readonly nativeEvent?: unknown }).nativeEvent ?? event;
  }
  return event;
}

const getStyles = themedStyles((theme: Theme) => ({
  root: {
    alignItems: "center" as const,
    display: "flex" as const,
    flexDirection: "column" as const,
    gap: theme.spacing.sm,
    minWidth: 0,
  },
  controls: {
    alignItems: "center" as const,
    display: "flex" as const,
    flexDirection: "row" as const,
    flexWrap: "wrap" as const,
    gap: theme.spacing.xs,
    justifyContent: "center" as const,
  },
  control: {
    alignItems: "center" as const,
    borderRadius: theme.radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    display: "flex" as const,
    justifyContent: "center" as const,
    paddingHorizontal: theme.spacing.md,
  },
  controlLabel: {
    ...roleTextStyle(theme, "button"),
  },
  status: {
    ...roleTextStyle(theme, "caption"),
  },
  ellipsis: {
    alignItems: "center" as const,
    display: "flex" as const,
    justifyContent: "center" as const,
    minWidth: theme.metrics.control.sm,
  },
}));

function reactRangeKey(item: PaginationRangeItem): string {
  return item.type === "page" ? `page:${item.page}` : item.type;
}

function requestNumberedPage(
  props: PaginationNumberedItemsProps | PaginationNumberedPagesProps,
  page: number,
  reason: PaginationPageChangeReason,
  event: unknown
): void {
  const eventValue = originalEvent(event);
  if (props.countMode === "items") {
    props.onPageChange(
      page,
      getPaginationPageChangeDetails(props, page, reason, eventValue)
    );
  } else {
    props.onPageChange(
      page,
      getPaginationPageChangeDetails(props, page, reason, eventValue)
    );
  }
}

/** Controlled semantic pagination for React Native Web and browser SSR. */
export function Pagination(props: PaginationProps): ReactElement {
  const theme = useTheme();
  const strings = useStrings();
  const styles = getStyles(theme);
  const previousLabel = props.previousLabel ?? strings.previousPage;
  const nextLabel = props.nextLabel ?? strings.nextPage;
  assertPaginationProps(props, { previousLabel, nextLabel });
  const direction: PaginationDirection =
    props.direction ?? (I18nManager.isRTL ? "rtl" : "ltr");
  const size = props.size ?? "md";
  const controlSize = theme.metrics.control[size];
  const unavailable = props.disabled === true || props.busy === true;
  const testIdProps =
    props.testID === undefined ? {} : { "data-testid": props.testID };

  const baseControlStyle = (
    selected: boolean,
    disabled: boolean
  ): RawStyle => ({
    appearance: "none",
    backgroundColor: selected ? theme.colors.primarySoft : theme.colors.surface,
    borderColor: selected ? theme.colors.primary : theme.colors.line,
    borderStyle: "solid",
    boxSizing: "border-box",
    color: selected ? theme.colors.primaryStrong : theme.colors.text,
    cursor: disabled ? "default" : "pointer",
    fontFamily: theme.typography.fontFamily ?? "inherit",
    opacity: disabled ? 0.52 : 1,
    ...rawDomStyle(styles.control),
    ...rawDomStyle(props.controlStyle),
    minHeight: `${controlSize}px`,
    minWidth: `${controlSize}px`,
  });
  const controlLabelStyle: RawStyle = {
    color: "inherit",
    ...rawDomStyle(styles.controlLabel),
    ...rawDomStyle(props.controlLabelStyle),
  };

  const control = ({
    key,
    label,
    visibleLabel,
    disabled,
    selected = false,
    testID,
    onPress,
  }: {
    readonly key: string;
    readonly label: string;
    readonly visibleLabel: string;
    readonly disabled: boolean;
    readonly selected?: boolean | undefined;
    readonly testID?: string | undefined;
    readonly onPress: (event: unknown) => void;
  }): ReactElement =>
    rawElement(
      "li",
      { key },
      rawElement(
        "button",
        {
          type: "button",
          "aria-label": label,
          ...(selected ? { "aria-current": "page" } : {}),
          disabled,
          className: mergeClassNames(
            PRESSABLE_FEEDBACK_CLASS,
            props.controlClassName
          ),
          ...(testID === undefined ? {} : { "data-testid": testID }),
          style: baseControlStyle(selected, disabled),
          onClick: onPress,
        },
        rawElement(
          "span",
          {
            className: props.controlLabelClassName,
            style: controlLabelStyle,
          },
          visibleLabel
        )
      )
    );

  const controls: ReactNode[] = [];

  if (props.mode === "cursor") {
    const previousDisabled = unavailable || !props.hasPreviousPage;
    const nextDisabled = unavailable || !props.hasNextPage;
    controls.push(
      control({
        key: "previous",
        label: previousLabel,
        visibleLabel: previousLabel,
        disabled: previousDisabled,
        testID:
          props.testID === undefined ? undefined : `${props.testID}-previous`,
        onPress: (event) => {
          if (previousDisabled) return;
          props.onNavigate(
            "previous",
            getPaginationNavigateDetails(
              props,
              "previous",
              originalEvent(event)
            )
          );
        },
      }),
      control({
        key: "next",
        label: nextLabel,
        visibleLabel: nextLabel,
        disabled: nextDisabled,
        testID: props.testID === undefined ? undefined : `${props.testID}-next`,
        onPress: (event) => {
          if (nextDisabled) return;
          props.onNavigate(
            "next",
            getPaginationNavigateDetails(props, "next", originalEvent(event))
          );
        },
      })
    );
  } else {
    const pageCount = getPaginationPageCount(props);
    const previousDisabled = unavailable || pageCount === 0 || props.page <= 1;
    const nextDisabled =
      unavailable || pageCount === 0 || props.page >= pageCount;

    controls.push(
      control({
        key: "previous",
        label: previousLabel,
        visibleLabel: previousLabel,
        disabled: previousDisabled,
        testID:
          props.testID === undefined ? undefined : `${props.testID}-previous`,
        onPress: (event) => {
          if (previousDisabled) return;
          const nextPage = props.page - 1;
          requestNumberedPage(props, nextPage, "previous-press", event);
        },
      })
    );

    if (props.presentation !== "compact") {
      const range = getPaginationRange({
        page: props.page,
        pageCount,
        boundaryCount: props.boundaryCount,
        siblingCount: props.siblingCount,
      });
      for (const item of range) {
        if (item.type !== "page") {
          controls.push(
            rawElement(
              "li",
              {
                key: reactRangeKey(item),
                "aria-hidden": true,
                role: "presentation",
              },
              rawElement(
                "span",
                {
                  "aria-hidden": true,
                  style: rawDomStyle(styles.ellipsis),
                },
                "\u2026"
              )
            )
          );
          continue;
        }
        const label =
          getPaginationPageAccessibilityLabel(props, item.page, pageCount) ??
          String(item.page);
        controls.push(
          control({
            key: reactRangeKey(item),
            label,
            visibleLabel: String(item.page),
            selected: item.current,
            disabled: unavailable,
            testID:
              props.testID === undefined
                ? undefined
                : `${props.testID}-page-${item.page}`,
            onPress: (event) => {
              if (unavailable || item.current) return;
              requestNumberedPage(props, item.page, "page-press", event);
            },
          })
        );
      }
    }

    controls.push(
      control({
        key: "next",
        label: nextLabel,
        visibleLabel: nextLabel,
        disabled: nextDisabled,
        testID: props.testID === undefined ? undefined : `${props.testID}-next`,
        onPress: (event) => {
          if (nextDisabled) return;
          const nextPage = props.page + 1;
          requestNumberedPage(props, nextPage, "next-press", event);
        },
      })
    );
  }

  const status = getPaginationStatusLabel(props);

  return rawElement(
    "nav",
    {
      "aria-label": props.accessibilityLabel,
      "aria-busy": props.busy === true,
      dir: direction,
      className: props.className,
      ...testIdProps,
      style: rawDomStyle([styles.root, props.style, { direction }]),
    },
    rawElement(
      "span",
      {
        className: props.statusClassName,
        ...(props.testID === undefined
          ? {}
          : { "data-testid": `${props.testID}-status` }),
        style: rawDomStyle([
          styles.status,
          { color: theme.colors.textMuted },
          props.statusStyle,
        ]),
      },
      status
    ),
    rawElement(
      "ol",
      {
        style: {
          ...rawDomStyle(styles.controls),
          listStyle: "none",
          margin: 0,
          padding: 0,
        },
      },
      ...controls
    )
  );
}
