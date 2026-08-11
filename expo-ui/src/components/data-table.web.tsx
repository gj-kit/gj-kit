/**
 * Web DataTable.
 *
 * Table presentation emits real HTML table descendants. DataTable is not an
 * ARIA grid: it never captures arrow/Home/End keys, and interactive cell
 * descendants keep their ordinary document tab order.
 */
import { createElement, isValidElement, useId } from "react";
import type { ReactElement, ReactNode } from "react";
import { Pressable, StyleSheet, Text as RNText, View } from "react-native";
import type { ViewStyle } from "react-native";
import type { Theme } from "../theme/tokens";
import { PRESSABLE_FEEDBACK_CLASS } from "./button";
import { Checkbox } from "./controls";
import {
  assertDataTableProps,
  assertNonblankDataTableString,
  nextDataTableSort,
  toggleDataTablePageKeys,
  toggleDataTableRowKey,
} from "./data-table-validation";
import type { ValidatedDataTableRow } from "./data-table-validation";
import type {
  DataTableAlignment,
  DataTableColumn,
  DataTableComponentProps,
  DataTableListRowContext,
  DataTableProps,
  DataTableRowKey,
  DataTableSelectionRowContext,
} from "./data-table.types";
import { EmptyState, ErrorState } from "./feedback";
import { mergeClassNames, nativeWindProps, themedStyles } from "./internal";
import { useStrings, useTheme } from "./provider";
import { roleTextStyle } from "./text";

type RawStyle = Record<string, unknown>;
type RawProps = Record<string, unknown>;

/** src intentionally has no DOM type dependency. Keep raw-host access narrow. */
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

function sanitizeId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "");
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

/**
 * RN numbers are density-independent pixels. React DOM normally adds `px` to
 * numeric dimensions, but treats a few CSS properties (notably lineHeight) as
 * unitless. Serializing every RN length here keeps raw semantic hosts faithful
 * to the RN style contract and avoids a theme lineHeight of 24 becoming 24x.
 */
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
  "flexBasis",
  "fontSize",
  "gap",
  "height",
  "inset",
  "insetBlock",
  "insetBlockEnd",
  "insetBlockStart",
  "insetInline",
  "insetInlineEnd",
  "insetInlineStart",
  "left",
  "letterSpacing",
  "lineHeight",
  "margin",
  "marginBlock",
  "marginBlockEnd",
  "marginBlockStart",
  "marginBottom",
  "marginInline",
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
  "paddingBlock",
  "paddingBlockEnd",
  "paddingBlockStart",
  "paddingBottom",
  "paddingInline",
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

/** CSS-compatible RN properties accepted by raw table descendants. */
const RAW_DIRECT_PROPERTIES = new Set([
  "alignContent",
  "alignItems",
  "alignSelf",
  "aspectRatio",
  "backfaceVisibility",
  "backgroundColor",
  "borderBlockColor",
  "borderBlockEndColor",
  "borderBlockStartColor",
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
  "isolation",
  "justifyContent",
  "mixBlendMode",
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

function rawTransform(style: RawStyle): string | undefined {
  if (typeof style.transform === "string") return style.transform;
  const parts: string[] = [];
  if (Array.isArray(style.transform)) {
    for (const operation of style.transform) {
      if (typeof operation !== "object" || operation === null) continue;
      const [name, value] = Object.entries(operation as RawStyle)[0] ?? [];
      if (name === undefined) continue;
      if (name === "matrix" && Array.isArray(value)) {
        const values = value.filter(
          (item): item is number =>
            typeof item === "number" && Number.isFinite(item)
        );
        if (
          values.length === value.length &&
          (values.length === 6 || values.length === 16)
        ) {
          parts.push(
            `${values.length === 16 ? "matrix3d" : "matrix"}(${values.join(
              ", "
            )})`
          );
        }
      } else if (
        name === "perspective" ||
        name === "translateX" ||
        name === "translateY"
      ) {
        const length = rawLength(value);
        if (length !== undefined) parts.push(`${name}(${length})`);
      } else if (
        name === "rotate" ||
        name === "rotateX" ||
        name === "rotateY" ||
        name === "rotateZ" ||
        name === "skewX" ||
        name === "skewY"
      ) {
        if (typeof value === "string") parts.push(`${name}(${value})`);
      } else if (name === "scale" || name === "scaleX" || name === "scaleY") {
        if (typeof value === "number" && Number.isFinite(value))
          parts.push(`${name}(${value})`);
      }
    }
  }
  if (parts.length === 0) {
    if (typeof style.rotation === "number" && Number.isFinite(style.rotation)) {
      parts.push(`rotate(${style.rotation}deg)`);
    }
    for (const name of ["scaleX", "scaleY"] as const) {
      const value = style[name];
      if (typeof value === "number" && Number.isFinite(value))
        parts.push(`${name}(${value})`);
    }
    for (const name of ["translateX", "translateY"] as const) {
      const value = rawLength(style[name]);
      if (value !== undefined) parts.push(`${name}(${value})`);
    }
    if (Array.isArray(style.transformMatrix)) {
      const values = style.transformMatrix.filter(
        (item): item is number =>
          typeof item === "number" && Number.isFinite(item)
      );
      if (
        values.length === style.transformMatrix.length &&
        (values.length === 6 || values.length === 16)
      ) {
        parts.push(
          `${values.length === 16 ? "matrix3d" : "matrix"}(${values.join(
            ", "
          )})`
        );
      }
    }
  }
  return parts.length === 0 ? undefined : parts.join(" ");
}

/**
 * Raw HTML descendants bypass React Native Web's style resolver. Translate the
 * RN style surface deliberately instead of leaking RN-only shorthands or value
 * shapes as invalid CSS declarations.
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
      if (values.length === nativeValue.length)
        result.fontVariant = values.join(" ");
    } else if (
      name === "pointerEvents" &&
      (nativeValue === "auto" || nativeValue === "none")
    ) {
      result.pointerEvents = nativeValue;
    } else if (name === "textAlign" && nativeValue !== "auto") {
      const value = rawPrimitive(nativeValue);
      if (value !== undefined) result.textAlign = value;
    } else if (name === "textAlignVertical" || name === "verticalAlign") {
      const value = nativeValue === "center" ? "middle" : nativeValue;
      if (value !== "auto" && typeof value === "string")
        result.verticalAlign = value;
    } else if (
      name === "writingDirection" &&
      (nativeValue === "ltr" || nativeValue === "rtl")
    ) {
      result.direction = nativeValue;
    } else if (
      (name === "boxShadow" ||
        name === "filter" ||
        name === "experimental_backgroundImage") &&
      typeof nativeValue === "string"
    ) {
      result[
        name === "experimental_backgroundImage" ? "backgroundImage" : name
      ] = nativeValue;
    } else if (name === "transformOrigin") {
      if (typeof nativeValue === "string") {
        result.transformOrigin = nativeValue;
      } else if (Array.isArray(nativeValue)) {
        const values = nativeValue.map((value) => rawLength(value));
        if (values.every((value): value is string => value !== undefined)) {
          result.transformOrigin = values.join(" ");
        }
      }
    }
  }
  const transform = rawTransform(source);
  if (transform !== undefined) result.transform = transform;
  return Object.keys(result).length === 0 ? undefined : result;
}

function alignmentStyle(align: DataTableAlignment | undefined): ViewStyle {
  return {
    justifyContent:
      align === "center"
        ? "center"
        : align === "end"
        ? "flex-end"
        : "flex-start",
  };
}

function rawTextAlignment(
  align: DataTableAlignment | undefined
): "start" | "center" | "end" {
  return align === "center" ? "center" : align === "end" ? "end" : "start";
}

function reactRowKey(rowKey: DataTableRowKey): string {
  return `data-row:${typeof rowKey}:${String(rowKey)}`;
}

function reactColumnKey(columnId: string): string {
  return `data-column:${columnId}`;
}

function originalEvent(event: unknown): unknown {
  if (typeof event === "object" && event !== null && "nativeEvent" in event) {
    return (event as { readonly nativeEvent?: unknown }).nativeEvent ?? event;
  }
  return event;
}

function changedPageKeys<RowKey extends DataTableRowKey>(
  selectedSet: ReadonlySet<RowKey>,
  enabledKeys: readonly RowKey[],
  selected: boolean
): readonly RowKey[] {
  return enabledKeys.filter((key) => selectedSet.has(key) !== selected);
}

const getStyles = themedStyles((theme: Theme) => ({
  root: {
    minWidth: 0,
    width: "100%" as const,
  },
  copy: {
    gap: theme.spacing.xs,
  },
  description: {
    ...roleTextStyle(theme, "caption"),
    color: theme.colors.textMuted,
  },
  refreshing: {
    alignItems: "center" as const,
    alignSelf: "flex-end" as const,
    flexDirection: "row" as const,
    gap: theme.spacing.sm,
    paddingBottom: theme.spacing.sm,
  },
  refreshingDot: {
    backgroundColor: theme.colors.primaryStrong,
    borderRadius: theme.radius.pill,
    height: theme.spacing.sm,
    width: theme.spacing.sm,
  },
  refreshingText: {
    ...roleTextStyle(theme, "caption"),
    color: theme.colors.textMuted,
  },
  headerInner: {
    alignItems: "center" as const,
    flexDirection: "row" as const,
    minWidth: 0,
  },
  headerText: {
    ...roleTextStyle(theme, "label"),
    color: theme.colors.text,
    flexShrink: 1,
  },
  sortButton: {
    alignItems: "center" as const,
    borderRadius: theme.radius.sm,
    flexDirection: "row" as const,
    gap: theme.spacing.xs,
    minHeight: theme.metrics.control.sm,
    minWidth: theme.metrics.control.sm,
  },
  sortIndicator: {
    ...roleTextStyle(theme, "caption"),
    color: theme.colors.textSubtle,
    flexShrink: 0,
  },
  cellInner: {
    alignItems: "center" as const,
    flexDirection: "row" as const,
    minWidth: 0,
  },
  cellText: {
    ...roleTextStyle(theme, "body"),
    color: theme.colors.text,
    flexShrink: 1,
  },
  selectionCell: {
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  stateCell: {
    padding: theme.spacing.lg,
  },
  loadingStatus: {
    gap: theme.spacing.sm,
    width: "100%" as const,
  },
  loadingLine: {
    backgroundColor: theme.colors.surfaceSubtle,
    borderRadius: theme.radius.sm,
    height: theme.metrics.control.sm,
    width: "100%" as const,
  },
  list: {
    gap: theme.spacing.sm,
  },
  listToolbar: {
    alignItems: "center" as const,
    flexDirection: "row" as const,
    flexWrap: "wrap" as const,
    gap: theme.spacing.sm,
  },
  listRow: {
    alignItems: "flex-start" as const,
    flexDirection: "row" as const,
    gap: theme.spacing.md,
    minWidth: 0,
  },
  listRowContent: {
    flex: 1,
    minWidth: 0,
  },
}));

function rowPadding(
  theme: Theme,
  size: NonNullable<DataTableProps<unknown, string, DataTableRowKey>["size"]>
) {
  return {
    sm: { horizontal: theme.spacing.sm, vertical: theme.spacing.xs },
    md: { horizontal: theme.spacing.md, vertical: theme.spacing.sm },
    lg: { horizontal: theme.spacing.lg, vertical: theme.spacing.md },
  }[size];
}

function columnRawStyle<
  Row,
  ColumnId extends string,
  RowKey extends DataTableRowKey
>(
  column: DataTableColumn<Row, ColumnId, RowKey>,
  flexibleTotal: number,
  reservedWidth: number
): RawStyle {
  const flexRatio = (column.flex ?? 1) / Math.max(1, flexibleTotal);
  const percent = Number((flexRatio * 100).toFixed(6));
  const reservedShare = Number((flexRatio * reservedWidth).toFixed(6));
  const width =
    column.width ??
    (reservedWidth === 0
      ? `${percent}%`
      : `calc(${percent}% - ${reservedShare}px)`);
  return {
    boxSizing: "border-box",
    width,
    minWidth: column.minWidth,
    maxWidth: column.maxWidth,
  };
}

/**
 * Chrome's fixed-table algorithm treats mixed `% - px` calc() values on
 * <col> as auto widths. Pure percentages on flexible <col>s, alongside pixel
 * widths on fixed <col>s, make the algorithm reserve the pixels first and
 * divide the remaining width by the declared percentage ratio.
 */
function columnDefinitionRawStyle<
  Row,
  ColumnId extends string,
  RowKey extends DataTableRowKey
>(
  column: DataTableColumn<Row, ColumnId, RowKey>,
  flexibleTotal: number
): RawStyle {
  const flexRatio = (column.flex ?? 1) / Math.max(1, flexibleTotal);
  const percent = Number((flexRatio * 100).toFixed(6));
  return { width: column.width ?? `${percent}%` };
}

function RefreshingStatus({ label }: { readonly label: string }): ReactElement {
  const theme = useTheme();
  const styles = getStyles(theme);
  return (
    <View
      role="status"
      aria-live="polite"
      accessibilityLabel={label}
      style={styles.refreshing}
    >
      <View
        aria-hidden
        importantForAccessibility="no-hide-descendants"
        style={styles.refreshingDot}
      />
      <RNText style={styles.refreshingText}>{label}</RNText>
    </View>
  );
}

function LoadingVisual({
  count,
  label,
}: {
  readonly count: number;
  readonly label: string;
}): ReactElement {
  const theme = useTheme();
  const styles = getStyles(theme);
  return (
    <View
      role="status"
      aria-live="polite"
      accessibilityLabel={label}
      accessibilityState={{ busy: true }}
      style={styles.loadingStatus}
    >
      {Array.from({ length: count }, (_, index) => (
        <View
          key={index}
          aria-hidden
          importantForAccessibility="no-hide-descendants"
          style={styles.loadingLine}
        />
      ))}
    </View>
  );
}

function TableStateContent<
  Row,
  ColumnId extends string,
  RowKey extends DataTableRowKey
>({
  props,
  colSpan,
}: {
  readonly props: DataTableProps<Row, ColumnId, RowKey>;
  readonly colSpan: number;
}): ReactElement | null {
  const theme = useTheme();
  const strings = useStrings();
  const styles = getStyles(theme);
  let content: ReactNode = null;
  if (props.state.status === "loading") {
    content = props.state.loadingState ?? (
      <LoadingVisual
        count={props.state.skeletonRowCount ?? 5}
        label={strings.loading}
      />
    );
  } else if (props.state.status === "error") {
    content = props.state.errorState ?? <ErrorState />;
  } else if (props.state.status === "ready" && props.state.rows.length === 0) {
    content = props.state.emptyState ?? <EmptyState />;
  }
  if (content === null) return null;
  return rawElement(
    "tr",
    null,
    rawElement("td", { colSpan, style: rawDomStyle(styles.stateCell) }, content)
  );
}

function sortIndicator(
  direction: "ascending" | "descending" | undefined
): string {
  return direction === "ascending"
    ? "↑"
    : direction === "descending"
    ? "↓"
    : "↕";
}

function DataTableList<
  Row,
  ColumnId extends string,
  RowKey extends DataTableRowKey
>({
  props,
  rowModels,
  descriptionId,
}: {
  readonly props: DataTableProps<Row, ColumnId, RowKey>;
  readonly rowModels: readonly ValidatedDataTableRow<Row, ColumnId, RowKey>[];
  readonly descriptionId: string | undefined;
}): ReactElement {
  const theme = useTheme();
  const strings = useStrings();
  const styles = getStyles(theme);
  const selection = props.selection;
  const selectedSet = new Set(selection?.selectedRowKeys ?? []);
  const enabledKeys = rowModels
    .filter((row) => !row.selectionDisabled)
    .map((row) => row.rowKey);
  const enabledSelectedCount = enabledKeys.filter((key) =>
    selectedSet.has(key)
  ).length;
  const selectAllChecked: boolean | "mixed" =
    enabledSelectedCount === 0
      ? false
      : enabledSelectedCount === enabledKeys.length
      ? true
      : "mixed";
  const unavailable =
    props.state.status === "loading" || props.state.status === "error";

  let stateContent: ReactNode = null;
  if (props.state.status === "loading") {
    stateContent = props.state.loadingState ?? (
      <LoadingVisual
        count={props.state.skeletonRowCount ?? 5}
        label={strings.loading}
      />
    );
  } else if (props.state.status === "error") {
    stateContent = props.state.errorState ?? <ErrorState />;
  } else if (props.state.status === "ready" && rowModels.length === 0) {
    stateContent = props.state.emptyState ?? <EmptyState />;
  }

  return (
    <View style={styles.list}>
      {props.columns.some((column) => column.sortable) ? (
        <View
          role="toolbar"
          accessibilityLabel={props.accessibilityLabel ?? props.caption}
          style={styles.listToolbar}
        >
          {props.columns.map((column) => {
            if (!column.sortable) return null;
            const direction =
              props.sort?.columnId === column.id
                ? props.sort.direction
                : undefined;
            return (
              <Pressable
                key={column.id}
                role="button"
                accessibilityLabel={`${column.header}, ${
                  direction === undefined
                    ? strings.sortUnsorted
                    : direction === "ascending"
                    ? strings.sortAscending
                    : strings.sortDescending
                }`}
                accessibilityState={{ selected: direction !== undefined }}
                disabled={unavailable}
                onPress={(event) => {
                  props.onSortChange?.(
                    nextDataTableSort(column, props.sort ?? null),
                    {
                      reason: "column-header-press",
                      columnId: column.id,
                      previous: props.sort ?? null,
                      originalEvent: originalEvent(event),
                    }
                  );
                }}
                {...nativeWindProps(PRESSABLE_FEEDBACK_CLASS)}
                style={({ pressed }) => [
                  styles.sortButton,
                  {
                    backgroundColor: pressed
                      ? theme.colors.surfaceSubtle
                      : theme.colors.surface,
                    borderColor: theme.colors.textSubtle,
                    borderWidth: StyleSheet.hairlineWidth,
                    opacity: unavailable ? 0.52 : 1,
                    paddingHorizontal: theme.spacing.md,
                  },
                ]}
              >
                <RNText style={styles.headerText}>{column.header}</RNText>
                <RNText aria-hidden style={styles.sortIndicator}>
                  {sortIndicator(direction)}
                </RNText>
              </Pressable>
            );
          })}
        </View>
      ) : null}
      {selection !== undefined &&
      selection.showSelectAll !== false &&
      rowModels.length > 0 ? (
        <Checkbox
          checked={selectAllChecked}
          disabled={unavailable || enabledKeys.length === 0}
          accessibilityLabel={
            selectAllChecked === true
              ? selection.clearSelectionAccessibilityLabel ??
                strings.deselectAll
              : selection.selectAllAccessibilityLabel ?? strings.selectAll
          }
          onCheckedChange={(selected) => {
            selection.onSelectionChange(
              toggleDataTablePageKeys(
                selection.selectedRowKeys,
                enabledKeys,
                selected
              ),
              {
                reason: "page-toggle",
                scope: "visible",
                affectedRowKeys: changedPageKeys(
                  selectedSet,
                  enabledKeys,
                  selected
                ),
                selected,
              }
            );
          }}
        />
      ) : null}
      {stateContent}
      <View
        role="list"
        aria-busy={
          props.state.status === "loading" ||
          props.state.status === "refreshing"
        }
        aria-describedby={descriptionId}
        accessibilityLabel={props.accessibilityLabel ?? props.caption}
        {...nativeWindProps(props.listClassName)}
        style={[styles.list, props.listStyle]}
      >
        {stateContent === null
          ? rowModels.map((rowModel) => {
              const {
                row,
                rowKey,
                rowIndex,
                selectionDisabled,
                selectionLabel,
              } = rowModel;
              const selected = selectedSet.has(rowKey);
              const cells = rowModel.cells.map(({ column, textValue }) => ({
                columnId: column.id,
                header: column.header,
                textValue,
                align: column.align ?? "start",
              }));
              const context: DataTableListRowContext<Row, RowKey, ColumnId> = {
                row,
                rowKey,
                rowIndex,
                cells,
                selected,
                selectionDisabled,
                presentation: "list",
              };
              const rendered = props.renderListRow?.(context);
              if (!isValidElement(rendered)) {
                throw new Error(
                  "DataTable renderListRow must return one valid React element."
                );
              }
              return (
                <View
                  key={reactRowKey(rowKey)}
                  role="listitem"
                  {...nativeWindProps(mergeClassNames(props.listRowClassName))}
                  style={[
                    styles.listRow,
                    {
                      backgroundColor:
                        props.striped && rowIndex % 2 === 1
                          ? theme.colors.surfaceSubtle
                          : theme.colors.surface,
                      borderColor: theme.colors.line,
                      borderRadius: theme.radius.sm,
                      borderWidth:
                        props.variant === "outline"
                          ? StyleSheet.hairlineWidth
                          : 0,
                      padding: theme.spacing.md,
                    },
                    props.listRowStyle,
                  ]}
                >
                  {selection === undefined ? null : (
                    <Checkbox
                      checked={selected}
                      disabled={selectionDisabled}
                      accessibilityLabel={selectionLabel as string}
                      onCheckedChange={(nextSelected) => {
                        selection.onSelectionChange(
                          toggleDataTableRowKey(
                            selection.selectedRowKeys,
                            rowKey,
                            nextSelected
                          ),
                          {
                            reason: "row-toggle",
                            scope: "visible",
                            rowKey,
                            selected: nextSelected,
                          }
                        );
                      }}
                    />
                  )}
                  <View style={styles.listRowContent}>{rendered}</View>
                </View>
              );
            })
          : null}
      </View>
    </View>
  );
}

export function DataTable<
  Row,
  RowKey extends DataTableRowKey,
  const Columns extends readonly { readonly id: string }[]
>(props: DataTableComponentProps<Row, RowKey, Columns>): ReactElement;
export function DataTable<
  Row,
  const ColumnId extends string,
  RowKey extends DataTableRowKey
>(props: DataTableProps<Row, ColumnId, RowKey>): ReactElement {
  const theme = useTheme();
  const strings = useStrings();
  const styles = getStyles(theme);
  const id = sanitizeId(useId());
  const rowModels = assertDataTableProps(props);
  if (
    props.presentation === "list" &&
    props.columns.some((column) => column.sortable)
  ) {
    assertNonblankDataTableString(
      strings.sortAscending,
      "strings.sortAscending"
    );
    assertNonblankDataTableString(
      strings.sortDescending,
      "strings.sortDescending"
    );
    assertNonblankDataTableString(strings.sortUnsorted, "strings.sortUnsorted");
  }
  const descriptionId =
    props.description === undefined
      ? undefined
      : `gj-data-table-${id}-description`;
  const selection = props.selection;
  const selectedSet = new Set(selection?.selectedRowKeys ?? []);
  const enabledKeys = rowModels
    .filter((row) => !row.selectionDisabled)
    .map((row) => row.rowKey);
  const selectedEnabledCount = enabledKeys.filter((key) =>
    selectedSet.has(key)
  ).length;
  const pageChecked: boolean | "mixed" =
    selectedEnabledCount === 0
      ? false
      : selectedEnabledCount === enabledKeys.length
      ? true
      : "mixed";
  const size = props.size ?? "md";
  const variant = props.variant ?? "line";
  const padding = rowPadding(theme, size);
  const flexibleTotal = props.columns.reduce(
    (sum, column) => sum + (column.width === undefined ? column.flex ?? 1 : 0),
    0
  );
  const reservedWidth = props.columns.reduce(
    (sum, column) => sum + (column.width ?? 0),
    selection === undefined ? 0 : theme.metrics.control.lg
  );
  const unavailable =
    props.state.status === "loading" || props.state.status === "error";
  const colSpan = props.columns.length + (selection === undefined ? 0 : 1);

  const captionAndDescription = (
    <View style={styles.copy}>
      {props.description === undefined ? null : (
        <RNText
          nativeID={descriptionId}
          {...nativeWindProps(props.descriptionClassName)}
          style={[styles.description, props.descriptionStyle]}
        >
          {props.description}
        </RNText>
      )}
      {props.state.status === "refreshing" ? (
        <RefreshingStatus
          label={props.state.refreshingAccessibilityLabel ?? strings.loading}
        />
      ) : null}
    </View>
  );

  if (props.presentation === "list") {
    return (
      <View
        testID={props.testID}
        {...nativeWindProps(props.className)}
        style={[styles.root, props.style]}
      >
        {props.caption === undefined ? null : (
          <RNText
            {...nativeWindProps(props.captionClassName)}
            style={[
              roleTextStyle(theme, "title"),
              { color: theme.colors.text },
              props.captionStyle,
            ]}
          >
            {props.caption}
          </RNText>
        )}
        {captionAndDescription}
        <DataTableList
          props={props}
          rowModels={rowModels}
          descriptionId={descriptionId}
        />
      </View>
    );
  }

  const headerCells: ReactNode[] = [];
  if (selection !== undefined) {
    headerCells.push(
      rawElement(
        "th",
        {
          key: "internal:selection",
          scope: "col",
          className: props.headerCellClassName,
          style: {
            padding: padding.vertical,
            borderBottom: `${StyleSheet.hairlineWidth}px solid ${theme.colors.line}`,
            backgroundColor: theme.colors.surfaceSubtle,
            ...rawDomStyle(props.headerCellStyle),
            boxSizing: "border-box",
            width: theme.metrics.control.lg,
          },
        },
        <View style={styles.selectionCell}>
          {selection.showSelectAll === false ? null : (
            <Checkbox
              checked={pageChecked}
              disabled={unavailable || enabledKeys.length === 0}
              accessibilityLabel={
                pageChecked === true
                  ? selection.clearSelectionAccessibilityLabel ??
                    strings.deselectAll
                  : selection.selectAllAccessibilityLabel ?? strings.selectAll
              }
              onCheckedChange={(selected) => {
                selection.onSelectionChange(
                  toggleDataTablePageKeys(
                    selection.selectedRowKeys,
                    enabledKeys,
                    selected
                  ),
                  {
                    reason: "page-toggle",
                    scope: "visible",
                    affectedRowKeys: changedPageKeys(
                      selectedSet,
                      enabledKeys,
                      selected
                    ),
                    selected,
                  }
                );
              }}
            />
          )}
        </View>
      )
    );
  }
  for (const column of props.columns) {
    const direction =
      props.sort?.columnId === column.id ? props.sort.direction : undefined;
    const inner = column.sortable ? (
      <Pressable
        role="button"
        disabled={unavailable}
        onPress={(event) => {
          props.onSortChange?.(nextDataTableSort(column, props.sort ?? null), {
            reason: "column-header-press",
            columnId: column.id,
            previous: props.sort ?? null,
            originalEvent: originalEvent(event),
          });
        }}
        {...nativeWindProps(PRESSABLE_FEEDBACK_CLASS)}
        style={({ pressed }) => [
          styles.sortButton,
          alignmentStyle(column.align),
          {
            backgroundColor: pressed ? theme.colors.primarySoft : "transparent",
            opacity: unavailable ? 0.52 : 1,
            paddingHorizontal: theme.spacing.xs,
          },
        ]}
      >
        <RNText
          {...nativeWindProps(column.headerTextClassName)}
          style={[styles.headerText, column.headerTextStyle]}
        >
          {column.header}
        </RNText>
        <RNText aria-hidden style={styles.sortIndicator}>
          {sortIndicator(direction)}
        </RNText>
      </Pressable>
    ) : (
      <View style={[styles.headerInner, alignmentStyle(column.align)]}>
        <RNText
          {...nativeWindProps(column.headerTextClassName)}
          style={[styles.headerText, column.headerTextStyle]}
        >
          {column.header}
        </RNText>
      </View>
    );
    headerCells.push(
      rawElement(
        "th",
        {
          key: reactColumnKey(column.id),
          scope: "col",
          className: mergeClassNames(
            props.headerCellClassName,
            column.headerClassName
          ),
          ...(direction === undefined ? {} : { "aria-sort": direction }),
          style: {
            backgroundColor: theme.colors.surfaceSubtle,
            borderBottom: `${StyleSheet.hairlineWidth}px solid ${theme.colors.line}`,
            borderInlineStart:
              props.showColumnBorders === true
                ? `${StyleSheet.hairlineWidth}px solid ${theme.colors.line}`
                : undefined,
            padding: `${padding.vertical}px ${padding.horizontal}px`,
            textAlign: rawTextAlignment(column.align),
            ...rawDomStyle(props.headerCellStyle),
            ...rawDomStyle(column.headerStyle),
            ...columnRawStyle(column, flexibleTotal, reservedWidth),
            verticalAlign: "middle",
          },
        },
        inner
      )
    );
  }

  const bodyRows: ReactNode[] = [];
  const hasStateRow =
    props.state.status === "loading" ||
    props.state.status === "error" ||
    (props.state.status === "ready" && props.state.rows.length === 0);
  if (hasStateRow) {
    bodyRows.push(
      <TableStateContent key="internal:state" props={props} colSpan={colSpan} />
    );
  }
  if (!hasStateRow) {
    rowModels.forEach((rowModel) => {
      const { row, rowKey, rowIndex, selectionDisabled, selectionLabel } =
        rowModel;
      const cells: ReactNode[] = [];
      if (selection !== undefined) {
        cells.push(
          rawElement(
            "td",
            {
              key: "internal:selection",
              className: props.cellClassName,
              style: {
                borderBottom: `${StyleSheet.hairlineWidth}px solid ${theme.colors.line}`,
                padding: padding.vertical,
                verticalAlign: "middle",
                ...rawDomStyle(props.cellStyle),
                boxSizing: "border-box",
                width: theme.metrics.control.lg,
              },
            },
            <View style={styles.selectionCell}>
              <Checkbox
                checked={selectedSet.has(rowKey)}
                disabled={selectionDisabled}
                accessibilityLabel={selectionLabel as string}
                onCheckedChange={(selected) => {
                  selection.onSelectionChange(
                    toggleDataTableRowKey(
                      selection.selectedRowKeys,
                      rowKey,
                      selected
                    ),
                    {
                      reason: "row-toggle",
                      scope: "visible",
                      rowKey,
                      selected,
                    }
                  );
                }}
              />
            </View>
          )
        );
      }
      rowModel.cells.forEach(({ column, textValue }) => {
        let content: ReactElement | undefined;
        if (column.renderCell !== undefined) {
          const rendered = column.renderCell({
            row,
            rowKey,
            rowIndex,
            columnId: column.id,
            textValue,
            presentation: "table",
          });
          if (!isValidElement(rendered)) {
            throw new Error(
              "DataTable renderCell must return one valid React element."
            );
          }
          content = rendered;
        }
        const cellInner = (
          <View style={[styles.cellInner, alignmentStyle(column.align)]}>
            {content ?? (
              <RNText
                {...nativeWindProps(column.cellTextClassName)}
                style={[styles.cellText, column.cellTextStyle]}
              >
                {textValue}
              </RNText>
            )}
          </View>
        );
        const tag = column.id === props.rowHeaderColumnId ? "th" : "td";
        cells.push(
          rawElement(
            tag,
            {
              key: reactColumnKey(column.id),
              className: mergeClassNames(
                props.cellClassName,
                column.cellClassName
              ),
              ...(tag === "th" ? { scope: "row" } : {}),
              ...(tag === "th" && content !== undefined
                ? { "aria-label": textValue }
                : {}),
              style: {
                backgroundColor:
                  props.striped === true && rowIndex % 2 === 1
                    ? theme.colors.surfaceSubtle
                    : theme.colors.surface,
                borderBottom: `${StyleSheet.hairlineWidth}px solid ${theme.colors.line}`,
                borderInlineStart:
                  props.showColumnBorders === true
                    ? `${StyleSheet.hairlineWidth}px solid ${theme.colors.line}`
                    : undefined,
                padding: `${padding.vertical}px ${padding.horizontal}px`,
                textAlign: rawTextAlignment(column.align),
                ...rawDomStyle(props.cellStyle),
                ...rawDomStyle(column.cellStyle),
                ...columnRawStyle(column, flexibleTotal, reservedWidth),
                verticalAlign: "middle",
              },
            },
            cellInner
          )
        );
      });
      bodyRows.push(rawElement("tr", { key: reactRowKey(rowKey) }, ...cells));
    });
  }

  const columnDefinitions: ReactNode[] = [];
  if (selection !== undefined) {
    columnDefinitions.push(
      rawElement("col", {
        key: "internal:selection",
        style: { width: theme.metrics.control.lg },
      })
    );
  }
  for (const column of props.columns) {
    columnDefinitions.push(
      rawElement("col", {
        key: reactColumnKey(column.id),
        style: columnDefinitionRawStyle(column, flexibleTotal),
      })
    );
  }

  const table = rawElement(
    "table",
    {
      ...(props.accessibilityLabel === undefined
        ? {}
        : { "aria-label": props.accessibilityLabel }),
      ...(descriptionId === undefined
        ? {}
        : { "aria-describedby": descriptionId }),
      "aria-busy":
        props.state.status === "loading" || props.state.status === "refreshing",
      style: {
        borderCollapse: "separate",
        borderSpacing: 0,
        minWidth: props.minTableWidth ?? 640,
        tableLayout: "fixed",
        width: "100%",
      },
    },
    ...(props.caption === undefined
      ? []
      : [
          rawElement(
            "caption",
            {
              className: props.captionClassName,
              style: {
                ...rawDomStyle(roleTextStyle(theme, "title")),
                color: theme.colors.text,
                ...rawDomStyle(props.captionStyle),
                captionSide: "top",
                paddingBottom: theme.spacing.md,
                textAlign: "start",
              },
            },
            props.caption
          ),
        ]),
    rawElement("colgroup", null, ...columnDefinitions),
    rawElement("thead", null, rawElement("tr", null, ...headerCells)),
    rawElement("tbody", null, ...bodyRows)
  );

  return (
    <View
      testID={props.testID}
      {...nativeWindProps(props.className)}
      style={[styles.root, props.style]}
    >
      {captionAndDescription}
      {rawElement(
        "div",
        {
          role: "region",
          "aria-label": props.accessibilityLabel ?? props.caption,
          tabIndex: 0,
          style: {
            border:
              variant === "outline"
                ? `${StyleSheet.hairlineWidth}px solid ${theme.colors.line}`
                : undefined,
            borderRadius: theme.radius.md,
            maxWidth: "100%",
            overflowX: "auto",
          },
        },
        table
      )}
    </View>
  );
}
