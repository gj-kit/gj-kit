/**
 * Web DataTable.
 *
 * Table presentation emits real HTML table descendants. DataTable is not an
 * ARIA grid: it never captures arrow/Home/End keys, and interactive cell
 * descendants keep their ordinary document tab order.
 */
import { isValidElement, useId } from "react";
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
import { rawDomStyle, rawElement } from "./raw-dom";
import type { RawStyle } from "./raw-dom";
import { roleTextStyle } from "./text";

function sanitizeId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "");
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

type RawDomEvent = {
  readonly key?: string;
  readonly target?: unknown;
  readonly currentTarget?: unknown;
  readonly nativeEvent?: unknown;
  readonly preventDefault?: () => void;
  readonly stopPropagation?: () => void;
};

/**
 * Activatable rows must not swallow their own interactive descendants: a click
 * that started on a link, a checkbox, or a button inside a cell belongs to that
 * control. The lookup uses the target's own `closest` so src stays free of DOM
 * types.
 */
const INTERACTIVE_DESCENDANT_SELECTOR = [
  "a[href]",
  "button",
  "input",
  "select",
  "textarea",
  "summary",
  '[contenteditable="true"]',
  '[role="button"]',
  '[role="checkbox"]',
  '[role="combobox"]',
  '[role="link"]',
  '[role="menuitem"]',
  '[role="radio"]',
  '[role="slider"]',
  '[role="switch"]',
  '[role="tab"]',
  '[role="textbox"]',
].join(",");

function startsInsideInteractiveDescendant(event: RawDomEvent): boolean {
  const target = event.target as
    | { readonly closest?: (selector: string) => unknown }
    | null
    | undefined;
  const hit = target?.closest?.(INTERACTIVE_DESCENDANT_SELECTOR);
  return hit !== null && hit !== undefined && hit !== event.currentTarget;
}

function isActivationKey(key: string | undefined): boolean {
  return key === "Enter" || key === " " || key === "Space" || key === "Spacebar";
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

// 활성 행 start-edge accent. 절대 위치라 콘텐츠를 밀지 않고 showColumnBorders의
// 셀 border와도 충돌하지 않는다. 등록된 StyleSheet가 아니라 inline이어야
// 소비자 테스트가 토큰 해석 결과를 DOM에서 그대로 단정할 수 있다.
function activeAccentStyle(theme: Theme): ViewStyle {
  return {
    backgroundColor: theme.colors.primary,
    bottom: 0,
    position: "absolute",
    start: 0,
    top: 0,
    width: theme.spacing.xs,
  };
}

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
  activationHintId,
}: {
  readonly props: DataTableProps<Row, ColumnId, RowKey>;
  readonly rowModels: readonly ValidatedDataTableRow<Row, ColumnId, RowKey>[];
  readonly descriptionId: string | undefined;
  readonly activationHintId: string | undefined;
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
              const active =
                props.activeRow !== undefined &&
                props.activeRow.key !== null &&
                props.activeRow.key === rowKey;
              const rowHookStyle = props.rowStyle?.(row, {
                rowKey,
                rowIndex,
                active,
                presentation: "list",
              });
              // activeRow.style은 기본 활성 시각(primarySoft wash + accent)을
              // 통째로 대체한다. aria-current는 어느 쪽이든 유지된다.
              const activeLayer = active
                ? props.activeRow?.style === undefined
                  ? { backgroundColor: theme.colors.primarySoft }
                  : props.activeRow.style
                : null;
              const showAccent = active && props.activeRow?.style === undefined;
              const currentProps: Record<string, unknown> = active
                ? { "aria-current": "true" }
                : {};
              const onRowPress = props.onRowPress;
              const activate = (event: RawDomEvent): void => {
                onRowPress?.(row, {
                  rowKey,
                  rowIndex,
                  presentation: "list",
                  originalEvent: originalEvent(event),
                });
              };
              // 표의 <tr role="row"> 패턴을 그대로 따른다 — listitem 자체가 포커스
              // 가능한 활성화 컨테이너가 되고, 소비자 콘텐츠·체크박스는 button 안에
              // 중첩되지 않는다. interactive 자손에서 시작한 이벤트는 그 컨트롤 몫이다.
              const activationProps: Record<string, unknown> =
                onRowPress === undefined
                  ? {}
                  : {
                      tabIndex: 0,
                      "aria-label": rowModel.pressLabel,
                      ...(activationHintId === undefined
                        ? {}
                        : { "aria-describedby": activationHintId }),
                      onClick: (event: RawDomEvent) => {
                        if (startsInsideInteractiveDescendant(event)) return;
                        activate(event);
                      },
                      onKeyDown: (event: RawDomEvent) => {
                        if (event.target !== event.currentTarget) return;
                        if (!isActivationKey(event.key)) return;
                        event.preventDefault?.();
                        activate(event);
                      },
                    };
              const body = <View style={styles.listRowContent}>{rendered}</View>;
              return (
                <View
                  key={reactRowKey(rowKey)}
                  role="listitem"
                  {...currentProps}
                  {...nativeWindProps(mergeClassNames(props.listRowClassName))}
                  {...activationProps}
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
                    onRowPress === undefined
                      ? null
                      : { cursor: "pointer" as const },
                    props.listRowStyle,
                    activeLayer,
                    // 기본 accent가 보일 때만 행의 rounded silhouette로 클립한다 —
                    // 사각 accent 바(spacing.xs)가 radius.sm 코너 곡선과 outline
                    // hairline 밖으로 칠해지지 않게. 조건부라 activeRow가 없거나
                    // activeRow.style로 대체된 렌더는 그대로다(additive 보장).
                    // overflow는 자손만 클립하므로 listitem 자신의 포커스 링(UA
                    // outline)은 영향받지 않는다.
                    showAccent ? { overflow: "hidden" as const } : null,
                    rowHookStyle,
                  ]}
                >
                  {showAccent ? (
                    <View
                      aria-hidden
                      importantForAccessibility="no-hide-descendants"
                      style={activeAccentStyle(theme)}
                    />
                  ) : null}
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
                  {body}
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
  if (props.onRowPress !== undefined) {
    assertNonblankDataTableString(
      strings.rowActivationHint,
      "strings.rowActivationHint"
    );
  }
  const rowActivationHintId =
    props.onRowPress === undefined
      ? undefined
      : `gj-data-table-${id}-row-activation`;
  // 포커스 가능한 행에는 눌러서 실행할 수 있다는 단서가 없다 — 시각적으로 숨긴
  // 힌트를 aria-describedby로 연결해 Enter/Space 활성화를 보조기술에 알린다.
  const rowActivationHint =
    rowActivationHintId === undefined
      ? null
      : rawElement(
          "span",
          {
            id: rowActivationHintId,
            style: {
              border: 0,
              clipPath: "inset(50%)",
              height: "1px",
              margin: "-1px",
              overflow: "hidden",
              padding: 0,
              position: "absolute",
              whiteSpace: "nowrap",
              width: "1px",
            },
          },
          strings.rowActivationHint
        );
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
        {rowActivationHint}
        <DataTableList
          props={props}
          rowModels={rowModels}
          descriptionId={descriptionId}
          activationHintId={rowActivationHintId}
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
      const active =
        props.activeRow !== undefined &&
        props.activeRow.key !== null &&
        props.activeRow.key === rowKey;
      const rowHookStyle = props.rowStyle?.(row, {
        rowKey,
        rowIndex,
        active,
        presentation: "table",
      });
      // activeRow.style은 기본 활성 시각(primarySoft wash + accent)을 통째로
      // 대체한다. 실제 <table>의 행 박스는 불투명한 셀 위에 칠할 수 없으므로
      // 행 레이어는 각 셀에 펼친다. 두 prop 모두 없으면 빈 객체 — DOM 불변.
      const rowLayer: RawStyle = {
        ...(active
          ? props.activeRow?.style === undefined
            ? { backgroundColor: theme.colors.primarySoft }
            : rawDomStyle(props.activeRow.style)
          : null),
        ...rawDomStyle(rowHookStyle),
      };
      const showAccent = active && props.activeRow?.style === undefined;
      const cells: ReactNode[] = [];
      if (selection !== undefined) {
        cells.push(
          rawElement(
            "td",
            {
              key: "internal:selection",
              className: props.cellClassName,
              // 선택 셀의 클릭·키 입력은 행 활성화로 번지지 않는다.
              ...(props.onRowPress === undefined
                ? {}
                : {
                    onClick: (event: RawDomEvent) => event.stopPropagation?.(),
                    onKeyDown: (event: RawDomEvent) => event.stopPropagation?.(),
                  }),
              style: {
                borderBottom: `${StyleSheet.hairlineWidth}px solid ${theme.colors.line}`,
                padding: padding.vertical,
                verticalAlign: "middle",
                ...rawDomStyle(props.cellStyle),
                boxSizing: "border-box",
                width: theme.metrics.control.lg,
                ...rowLayer,
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
        // 활성 행의 start-edge accent는 행 헤더 셀 안에 절대 위치로 그린다 —
        // border와 달리 콘텐츠를 밀지 않고 showColumnBorders와도 충돌하지 않는다.
        const withAccent = tag === "th" && showAccent;
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
                ...rowLayer,
                ...(withAccent ? { position: "relative" } : null),
              },
            },
            // 자식 구조를 두 슬롯으로 고정한다(accent 자리는 비활성일 때 null).
            // 가변 배열로 넘기면 withAccent 토글 때 cellInner의 암묵 key가
            // ".0"과 ".1" 사이를 오가며 remount되어, 행 헤더 셀 안의 소비자
            // 포커스·입력 상태가 날아간다. null 슬롯이면 cellInner는 항상 ".1"이다.
            withAccent ? (
              <View
                key="internal:active-accent"
                aria-hidden
                importantForAccessibility="no-hide-descendants"
                style={activeAccentStyle(theme)}
              />
            ) : null,
            cellInner
          )
        );
      });
      const onRowPress = props.onRowPress;
      const pressProps =
        onRowPress === undefined
          ? {}
          : {
              // 실제 <tr role="row">를 유지한 채 포커스 가능하게 만든다. 행을 button으로
              // 바꾸면 row/cell 관계가 깨지고 중첩된 체크박스·링크가 동작하지 않는다.
              role: "row",
              tabIndex: 0,
              "aria-label": rowModel.pressLabel,
              ...(rowActivationHintId === undefined
                ? {}
                : { "aria-describedby": rowActivationHintId }),
              // filter/transform 기반 피드백 클래스는 table-row 박스에서 브라우저마다
              // 다르게 그려지므로 행에는 붙이지 않는다. 포커스 링은 UA 기본값을 쓴다.
              style: { cursor: "pointer" },
              onClick: (event: RawDomEvent) => {
                if (startsInsideInteractiveDescendant(event)) return;
                onRowPress(row, {
                  rowKey,
                  rowIndex,
                  presentation: "table",
                  originalEvent: originalEvent(event),
                });
              },
              onKeyDown: (event: RawDomEvent) => {
                // 행 자체에 포커스가 있을 때만 활성화한다 — 셀 안의 컨트롤에서 올라온
                // Enter/Space는 그 컨트롤의 몫이다.
                if (event.target !== event.currentTarget) return;
                if (!isActivationKey(event.key)) return;
                event.preventDefault?.();
                onRowPress(row, {
                  rowKey,
                  rowIndex,
                  presentation: "table",
                  originalEvent: originalEvent(event),
                });
              },
            };
      bodyRows.push(
        rawElement(
          "tr",
          {
            key: reactRowKey(rowKey),
            // 활성 행은 aria-selected가 아니라 aria-current다 — 이 표는 grid
            // 의미론을 주장하지 않고, aria-current는 어떤 요소에서도 유효하다.
            ...(active ? { "aria-current": "true" } : {}),
            ...pressProps,
          },
          ...cells
        )
      );
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
      {rowActivationHint}
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
