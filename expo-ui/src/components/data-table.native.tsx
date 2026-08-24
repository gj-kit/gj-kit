import { isValidElement } from "react";
import type { ReactElement } from "react";
import {
  I18nManager,
  Pressable,
  ScrollView,
  StyleSheet,
  Text as RNText,
  useWindowDimensions,
  View,
} from "react-native";
import type { GestureResponderEvent, TextStyle, ViewStyle } from "react-native";
import type { Theme } from "../theme/tokens";
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
  DataTableListCell,
  DataTableProps,
  DataTableRowKey,
  DataTableSize,
} from "./data-table.types";
import { EmptyState, ErrorState } from "./feedback";
import { mergeClassNames, nativeWindProps, themedStyles } from "./internal";
import { Spinner } from "./progress";
import { useStrings, useTheme } from "./provider";
import { roleTextStyle } from "./text";

type ResolvedPresentation = "table" | "list";

const getStyles = themedStyles((theme: Theme) => ({
  root: {
    gap: theme.spacing.md,
  },
  caption: {
    ...roleTextStyle(theme, "title"),
  },
  description: {
    ...roleTextStyle(theme, "caption"),
  },
  frame: {
    backgroundColor: theme.colors.surface,
    overflow: "hidden" as const,
  },
  table: {
    alignSelf: "stretch" as const,
  },
  headerRow: {
    alignItems: "stretch" as const,
    backgroundColor: theme.colors.surfaceSubtle,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row" as const,
  },
  headerCell: {
    justifyContent: "center" as const,
  },
  headerControl: {
    alignItems: "center" as const,
    alignSelf: "stretch" as const,
    flexDirection: "row" as const,
  },
  headerText: {
    ...roleTextStyle(theme, "label"),
    flexShrink: 1,
  },
  sortIndicator: {
    ...roleTextStyle(theme, "caption"),
  },
  row: {
    alignItems: "stretch" as const,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row" as const,
  },
  rowCells: {
    alignItems: "stretch" as const,
    flexDirection: "row" as const,
    flexGrow: 1,
    flexShrink: 0,
  },
  cell: {
    justifyContent: "center" as const,
  },
  cellText: {
    ...roleTextStyle(theme, "body"),
  },
  cellAccessibilityContext: {
    height: 1,
    overflow: "hidden" as const,
    pointerEvents: "none" as const,
    position: "absolute" as const,
    width: 1,
  },
  rowHeaderText: {
    ...roleTextStyle(theme, "label"),
  },
  // cellAccessibilityContext처럼 1pt로 숨기되, 보조기술 활성화가 터치 시스템을
  // 우회하지 못하는 플랫폼을 위해 pointerEvents는 막지 않는다.
  rowActivationControl: {
    height: 1,
    overflow: "hidden" as const,
    position: "absolute" as const,
    width: 1,
  },
  selectionCell: {
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  list: {
    alignSelf: "stretch" as const,
  },
  listControls: {
    alignItems: "center" as const,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row" as const,
    flexWrap: "wrap" as const,
  },
  listSortControl: {
    alignItems: "center" as const,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: "row" as const,
    justifyContent: "center" as const,
  },
  listSortText: {
    ...roleTextStyle(theme, "label"),
  },
  listRow: {
    alignItems: "center" as const,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row" as const,
  },
  listRowBody: {
    flex: 1,
    minWidth: theme.spacing.none,
  },
  state: {
    alignItems: "stretch" as const,
    gap: theme.spacing.md,
    justifyContent: "center" as const,
  },
  loading: {
    alignItems: "center" as const,
    gap: theme.spacing.md,
  },
  skeletonRows: {
    alignSelf: "stretch" as const,
  },
  skeletonRow: {
    alignItems: "center" as const,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row" as const,
  },
  skeletonCell: {
    backgroundColor: theme.colors.surfaceSubtle,
  },
  refreshing: {
    alignItems: "center" as const,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row" as const,
    gap: theme.spacing.sm,
    justifyContent: "center" as const,
  },
}));

function resolvePresentation(
  presentation: DataTableProps<
    unknown,
    string,
    DataTableRowKey
  >["presentation"],
  width: number,
  tabletBreakpoint: number
): ResolvedPresentation {
  const requested = presentation ?? "table";
  if (requested === "auto") return width < tabletBreakpoint ? "list" : "table";
  if (requested === "list" || requested === "table") return requested;
  throw new Error('DataTable presentation must be "table", "list", or "auto".');
}

function rowMetrics(
  theme: Theme,
  size: DataTableSize
): {
  readonly minHeight: number;
  readonly paddingHorizontal: number;
  readonly paddingVertical: number;
} {
  if (size === "sm") {
    return {
      minHeight: theme.metrics.control.sm,
      paddingHorizontal: theme.spacing.sm,
      paddingVertical: theme.spacing.xs,
    };
  }
  if (size === "lg") {
    return {
      minHeight: theme.metrics.control.lg,
      paddingHorizontal: theme.spacing.lg,
      paddingVertical: theme.spacing.md,
    };
  }
  return {
    minHeight: theme.metrics.control.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  };
}

function logicalTextAlign(
  alignment: DataTableAlignment
): TextStyle["textAlign"] {
  if (alignment === "center") return "center";
  if (alignment === "start") return I18nManager.isRTL ? "right" : "left";
  return I18nManager.isRTL ? "left" : "right";
}

function logicalItemsAlign(
  alignment: DataTableAlignment
): ViewStyle["alignItems"] {
  if (alignment === "center") return "center";
  if (alignment === "start")
    return I18nManager.isRTL ? "flex-end" : "flex-start";
  return I18nManager.isRTL ? "flex-start" : "flex-end";
}

function columnInvariantStyle<
  Row,
  ColumnId extends string,
  RowKey extends DataTableRowKey
>(
  column: DataTableColumn<Row, ColumnId, RowKey>,
  defaultMinWidth: number
): ViewStyle {
  return {
    ...(column.width === undefined
      ? { flex: column.flex ?? 1 }
      : { flexGrow: 0, flexShrink: 0, width: column.width }),
    ...(column.minWidth !== undefined
      ? { minWidth: column.minWidth }
      : column.width === undefined && column.maxWidth === undefined
      ? { minWidth: defaultMinWidth }
      : null),
    ...(column.maxWidth === undefined ? null : { maxWidth: column.maxWidth }),
  };
}

function originalEvent(event: GestureResponderEvent): unknown {
  return event.nativeEvent;
}

function reactRowKey(rowKey: DataTableRowKey): string {
  return `${typeof rowKey}:${String(rowKey)}`;
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
  const { width } = useWindowDimensions();
  const styles = getStyles(theme);

  const validatedRows = assertDataTableProps(props);

  const {
    state,
    columns,
    rowHeaderColumnId,
    selection,
    caption,
    accessibilityLabel,
    description,
    size = "md",
    variant = "line",
    striped = false,
    showColumnBorders = false,
    minTableWidth,
    captionStyle,
    captionClassName,
    descriptionStyle,
    descriptionClassName,
    headerCellStyle,
    headerCellClassName,
    cellStyle,
    cellClassName,
    listStyle,
    listClassName,
    listRowStyle,
    listRowClassName,
    style,
    className,
    testID,
  } = props;

  if (size !== "sm" && size !== "md" && size !== "lg") {
    throw new Error('DataTable size must be "sm", "md", or "lg".');
  }
  if (variant !== "line" && variant !== "outline") {
    throw new Error('DataTable variant must be "line" or "outline".');
  }

  const presentation = resolvePresentation(
    props.presentation,
    width,
    theme.breakpoints.tablet
  );
  if (columns.some((column) => column.sortable)) {
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
  if (
    (props.presentation === "list" || props.presentation === "auto") &&
    typeof props.renderListRow !== "function"
  ) {
    throw new Error(
      "DataTable list and auto presentations require renderListRow."
    );
  }

  const metrics = rowMetrics(theme, size);
  const accessibleName = accessibilityLabel ?? caption;
  const selectedKeys = new Set<RowKey>(selection?.selectedRowKeys ?? []);

  const visibleEnabledRowKeys = validatedRows
    .filter((row) => !row.selectionDisabled)
    .map((row) => row.rowKey);
  const allVisibleSelected =
    visibleEnabledRowKeys.length > 0 &&
    visibleEnabledRowKeys.every((rowKey) => selectedKeys.has(rowKey));
  const someVisibleSelected = visibleEnabledRowKeys.some((rowKey) =>
    selectedKeys.has(rowKey)
  );
  const selectAllChecked: boolean | "mixed" = allVisibleSelected
    ? true
    : someVisibleSelected
    ? "mixed"
    : false;
  const selectionColumnWidth = theme.metrics.control.lg + theme.spacing.md;
  const defaultColumnMinWidth = theme.metrics.control.lg * 2;
  const busy = state.status === "loading" || state.status === "refreshing";
  const unavailable = state.status === "loading" || state.status === "error";
  const selectAllLabel =
    selection === undefined
      ? undefined
      : allVisibleSelected
      ? selection.clearSelectionAccessibilityLabel ?? strings.deselectAll
      : selection.selectAllAccessibilityLabel ?? strings.selectAll;

  const frameInvariant: ViewStyle =
    variant === "outline"
      ? {
          borderColor: theme.colors.line,
          borderRadius: theme.radius.md,
          borderWidth: StyleSheet.hairlineWidth,
        }
      : {
          borderBottomColor: theme.colors.line,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderTopColor: theme.colors.line,
          borderTopWidth: StyleSheet.hairlineWidth,
          borderRadius: theme.radius.none,
        };

  const rowBackground = (
    row: ValidatedDataTableRow<Row, ColumnId, RowKey>
  ): string => {
    if (selectedKeys.has(row.rowKey)) return theme.colors.primarySoft;
    if (striped && row.rowIndex % 2 === 1) return theme.colors.surfaceSubtle;
    return theme.colors.surface;
  };

  const renderSelectionControl = (
    row: ValidatedDataTableRow<Row, ColumnId, RowKey>
  ): ReactElement | null => {
    if (selection === undefined || row.selectionLabel === undefined)
      return null;
    return (
      <Checkbox
        accessibilityLabel={row.selectionLabel}
        checked={selectedKeys.has(row.rowKey)}
        disabled={row.selectionDisabled}
        onCheckedChange={(selected) => {
          selection.onSelectionChange(
            toggleDataTableRowKey(
              selection.selectedRowKeys,
              row.rowKey,
              selected
            ),
            {
              reason: "row-toggle",
              scope: "visible",
              rowKey: row.rowKey,
              selected,
            }
          );
        }}
        size={size === "sm" ? "sm" : "md"}
        testID={
          testID === undefined
            ? undefined
            : `${testID}-select-${String(row.rowKey)}`
        }
      />
    );
  };

  const updateVisibleSelection = (selected: boolean): void => {
    if (selection === undefined) return;
    const affectedRowKeys = visibleEnabledRowKeys.filter((rowKey) =>
      selected ? !selectedKeys.has(rowKey) : selectedKeys.has(rowKey)
    );
    selection.onSelectionChange(
      toggleDataTablePageKeys(
        selection.selectedRowKeys,
        visibleEnabledRowKeys,
        selected
      ),
      {
        reason: "page-toggle",
        scope: "visible",
        affectedRowKeys,
        selected,
      }
    );
  };

  const updateSort = (
    column: DataTableColumn<Row, ColumnId, RowKey>,
    event: GestureResponderEvent
  ): void => {
    if (!column.sortable || props.onSortChange === undefined) return;
    const previous = props.sort ?? null;
    const next = nextDataTableSort(column, previous);
    props.onSortChange(next, {
      reason: "column-header-press",
      columnId: column.id,
      previous,
      originalEvent: originalEvent(event),
    });
  };

  const selectAllControl =
    selection !== undefined && (selection.showSelectAll ?? true) ? (
      <Checkbox
        accessibilityLabel={selectAllLabel as string}
        checked={selectAllChecked}
        disabled={visibleEnabledRowKeys.length === 0}
        onCheckedChange={updateVisibleSelection}
        size={size === "sm" ? "sm" : "md"}
        testID={testID === undefined ? undefined : `${testID}-select-all`}
      />
    ) : null;

  const renderLoadingState = (): ReactElement => {
    if (state.status === "loading" && state.loadingState !== undefined) {
      return (
        <View
          role="listitem"
          style={[
            styles.state,
            { minHeight: theme.metrics.control.lg, padding: theme.spacing.lg },
          ]}
          testID={testID === undefined ? undefined : `${testID}-loading`}
        >
          {state.loadingState}
        </View>
      );
    }
    const count = state.status === "loading" ? state.skeletonRowCount ?? 5 : 5;
    return (
      <View
        accessibilityLiveRegion="polite"
        role="listitem"
        style={[
          styles.state,
          styles.loading,
          { paddingVertical: theme.spacing.lg },
        ]}
        testID={testID === undefined ? undefined : `${testID}-loading`}
      >
        <Spinner accessibilityLabel={strings.loading} size={size} />
        <View
          accessibilityElementsHidden
          aria-hidden
          importantForAccessibility="no-hide-descendants"
          style={styles.skeletonRows}
        >
          {Array.from({ length: count }, (_, rowIndex) => (
            <View
              key={rowIndex}
              style={[
                styles.skeletonRow,
                {
                  borderBottomColor: theme.colors.line,
                  gap: theme.spacing.md,
                  minHeight: metrics.minHeight,
                  paddingHorizontal: metrics.paddingHorizontal,
                  paddingVertical: metrics.paddingVertical,
                },
              ]}
            >
              <View
                style={[
                  styles.skeletonCell,
                  {
                    borderRadius: theme.radius.sm,
                    height: theme.metrics.icon.sm,
                    width: theme.metrics.control.lg * 2,
                  },
                ]}
              />
              <View
                style={[
                  styles.skeletonCell,
                  {
                    borderRadius: theme.radius.sm,
                    flex: 1,
                    height: theme.metrics.icon.sm,
                  },
                ]}
              />
            </View>
          ))}
        </View>
      </View>
    );
  };

  const renderTerminalState = (): ReactElement | null => {
    if (state.status === "loading") return renderLoadingState();
    if (state.status === "error") {
      return (
        <View
          accessibilityLiveRegion="assertive"
          role="listitem"
          style={[
            styles.state,
            { minHeight: theme.metrics.control.lg, padding: theme.spacing.lg },
          ]}
          testID={testID === undefined ? undefined : `${testID}-error`}
        >
          {state.errorState ?? <ErrorState />}
        </View>
      );
    }
    if (state.status === "ready" && validatedRows.length === 0) {
      return (
        <View
          role="listitem"
          style={[
            styles.state,
            { minHeight: theme.metrics.control.lg, padding: theme.spacing.lg },
          ]}
          testID={testID === undefined ? undefined : `${testID}-empty`}
        >
          {state.emptyState ?? <EmptyState />}
        </View>
      );
    }
    return null;
  };

  const refreshingState =
    state.status === "refreshing" ? (
      <View
        accessibilityLiveRegion="polite"
        role="listitem"
        style={[
          styles.refreshing,
          {
            borderBottomColor: theme.colors.line,
            minHeight: theme.metrics.control.sm,
            paddingHorizontal: theme.spacing.md,
            paddingVertical: theme.spacing.xs,
          },
        ]}
        testID={testID === undefined ? undefined : `${testID}-refreshing`}
      >
        <Spinner
          accessibilityLabel={
            state.refreshingAccessibilityLabel ?? strings.loading
          }
          size="sm"
        />
      </View>
    ) : null;

  const renderTableHeader = (): ReactElement => (
    <View
      style={[
        styles.headerRow,
        {
          borderBottomColor: theme.colors.line,
          minHeight: metrics.minHeight,
        },
      ]}
      testID={testID === undefined ? undefined : `${testID}-header`}
    >
      {selection !== undefined ? (
        <View
          style={[
            styles.selectionCell,
            headerCellStyle,
            {
              borderEndColor: theme.colors.line,
              borderEndWidth: showColumnBorders ? StyleSheet.hairlineWidth : 0,
              flexGrow: 0,
              flexShrink: 0,
              minHeight: metrics.minHeight,
              width: selectionColumnWidth,
            },
          ]}
        >
          {selectAllControl}
        </View>
      ) : null}
      {columns.map((column) => {
        const alignment = column.align ?? "start";
        const activeSort =
          props.sort?.columnId === column.id ? props.sort : null;
        const sortAccessibilityText =
          activeSort === null
            ? strings.sortUnsorted
            : activeSort.direction === "ascending"
            ? strings.sortAscending
            : strings.sortDescending;
        const invariant = columnInvariantStyle(column, defaultColumnMinWidth);
        const content = (
          <>
            <RNText
              {...nativeWindProps(column.headerTextClassName)}
              maxFontSizeMultiplier={theme.metrics.maxFontScale}
              style={[
                styles.headerText,
                {
                  color: theme.colors.text,
                  textAlign: logicalTextAlign(alignment),
                },
                column.headerTextStyle,
              ]}
            >
              {column.header}
            </RNText>
            {column.sortable ? (
              <RNText
                accessibilityElementsHidden
                aria-hidden
                importantForAccessibility="no-hide-descendants"
                style={[
                  styles.sortIndicator,
                  {
                    color:
                      activeSort === null
                        ? theme.colors.textSubtle
                        : theme.colors.primaryStrong,
                  },
                ]}
              >
                {activeSort?.direction === "ascending"
                  ? "↑"
                  : activeSort?.direction === "descending"
                  ? "↓"
                  : "↕"}
              </RNText>
            ) : null}
          </>
        );
        return (
          <View
            key={column.id}
            {...nativeWindProps(
              mergeClassNames(headerCellClassName, column.headerClassName)
            )}
            style={[
              styles.headerCell,
              {
                borderStartColor: theme.colors.line,
                borderStartWidth: showColumnBorders
                  ? StyleSheet.hairlineWidth
                  : 0,
              },
              headerCellStyle,
              column.headerStyle,
              {
                alignItems: logicalItemsAlign(alignment),
                minHeight: metrics.minHeight,
                paddingHorizontal: metrics.paddingHorizontal,
                paddingVertical: metrics.paddingVertical,
                ...invariant,
              },
            ]}
            testID={
              testID === undefined ? undefined : `${testID}-header-${column.id}`
            }
          >
            {column.sortable ? (
              <Pressable
                accessibilityLabel={`${column.header}, ${sortAccessibilityText}`}
                accessibilityRole="button"
                accessibilityState={{ selected: activeSort !== null }}
                accessibilityValue={{ text: sortAccessibilityText }}
                disabled={unavailable}
                onPress={(event) => updateSort(column, event)}
                role="button"
                style={({ pressed }) => [
                  styles.headerControl,
                  {
                    gap: theme.spacing.xs,
                    opacity: unavailable ? 0.52 : pressed ? 0.72 : 1,
                  },
                ]}
              >
                {content}
              </Pressable>
            ) : (
              content
            )}
          </View>
        );
      })}
    </View>
  );

  // onRowPress가 있어도 소비자 콘텐츠를 button 안에 중첩하지 않는다(웹 <tr role="row">
  // 패턴의 네이티브 대응). 터치는 접근성 트리에 잡히지 않는 Pressable 표면이 받고 —
  // 셀 안의 링크·버튼은 중첩 터처블 규칙대로 자기 터치를 그대로 가져간다 — 행 이름과
  // 활성화는 셀·체크박스와 나란한 1pt 형제 button이 보조기술에 제공한다. iOS
  // VoiceOver가 행 전체를 하나로 접어 자손 컨트롤을 가리는 일이 없다.
  const wrapRowCells = (
    row: ValidatedDataTableRow<Row, ColumnId, RowKey>,
    rowPresentation: "table" | "list",
    content: ReactElement | readonly ReactElement[]
  ): ReactElement => {
    const onRowPress = props.onRowPress;
    if (onRowPress === undefined) {
      // 정적 행은 기존 트리를 그대로 유지한다 — 표 셀은 행의 직접 자식이다.
      return rowPresentation === "table" ? (
        <>{content}</>
      ) : (
        <View style={styles.listRowBody}>{content}</View>
      );
    }
    const activate = (event: GestureResponderEvent): void => {
      onRowPress(row.row, {
        rowKey: row.rowKey,
        rowIndex: row.rowIndex,
        presentation: rowPresentation,
        originalEvent: originalEvent(event),
      });
    };
    return (
      <>
        <Pressable
          accessibilityLabel={row.pressLabel}
          accessibilityRole="button"
          role="button"
          onPress={activate}
          style={styles.rowActivationControl}
          testID={
            testID === undefined
              ? undefined
              : `${testID}-row-${String(row.rowKey)}-activate`
          }
        />
        <Pressable
          accessible={false}
          focusable={false}
          importantForAccessibility="no"
          onPress={activate}
          style={({ pressed }) => [
            rowPresentation === "table" ? styles.rowCells : styles.listRowBody,
            pressed ? { opacity: 0.72 } : null,
          ]}
          testID={
            testID === undefined
              ? undefined
              : `${testID}-row-${String(row.rowKey)}-press`
          }
        >
          {content}
        </Pressable>
      </>
    );
  };

  const renderTableRow = (
    row: ValidatedDataTableRow<Row, ColumnId, RowKey>
  ): ReactElement => (
    <View
      key={reactRowKey(row.rowKey)}
      role="listitem"
      style={[
        styles.row,
        {
          backgroundColor: rowBackground(row),
          borderBottomColor: theme.colors.line,
          minHeight: metrics.minHeight,
        },
      ]}
      testID={
        testID === undefined ? undefined : `${testID}-row-${String(row.rowKey)}`
      }
    >
      {selection !== undefined ? (
        <View
          style={[
            styles.selectionCell,
            cellStyle,
            {
              borderEndColor: theme.colors.line,
              borderEndWidth: showColumnBorders ? StyleSheet.hairlineWidth : 0,
              flexGrow: 0,
              flexShrink: 0,
              minHeight: metrics.minHeight,
              width: selectionColumnWidth,
            },
          ]}
        >
          {renderSelectionControl(row)}
        </View>
      ) : null}
      {wrapRowCells(row, "table", row.cells.map(({ column, textValue }) => {
        const alignment = column.align ?? "start";
        const invariant = columnInvariantStyle(column, defaultColumnMinWidth);
        const renderedCell = column.renderCell?.({
          row: row.row,
          rowKey: row.rowKey,
          rowIndex: row.rowIndex,
          columnId: column.id,
          textValue,
          presentation: "table",
        });
        if (column.renderCell !== undefined && !isValidElement(renderedCell)) {
          throw new Error(
            "DataTable renderCell must return one valid React element."
          );
        }
        return (
          <View
            key={column.id}
            accessible={column.renderCell === undefined ? undefined : false}
            {...nativeWindProps(
              mergeClassNames(cellClassName, column.cellClassName)
            )}
            style={[
              styles.cell,
              {
                borderStartColor: theme.colors.line,
                borderStartWidth: showColumnBorders
                  ? StyleSheet.hairlineWidth
                  : 0,
              },
              cellStyle,
              column.cellStyle,
              {
                alignItems: logicalItemsAlign(alignment),
                minHeight: metrics.minHeight,
                paddingHorizontal: metrics.paddingHorizontal,
                paddingVertical: metrics.paddingVertical,
                ...invariant,
              },
            ]}
            testID={
              testID === undefined
                ? undefined
                : `${testID}-cell-${String(row.rowKey)}-${column.id}`
            }
          >
            {column.renderCell !== undefined ? (
              <>
                <RNText
                  accessibilityLabel={`${column.header}: ${textValue}`}
                  accessibilityRole="text"
                  accessible
                  importantForAccessibility="yes"
                  style={styles.cellAccessibilityContext}
                />
                {renderedCell}
              </>
            ) : (
              <RNText
                accessibilityLabel={`${column.header}: ${textValue}`}
                {...nativeWindProps(column.cellTextClassName)}
                maxFontSizeMultiplier={theme.metrics.maxFontScale}
                style={[
                  column.id === rowHeaderColumnId
                    ? styles.rowHeaderText
                    : styles.cellText,
                  {
                    color: theme.colors.text,
                    textAlign: logicalTextAlign(alignment),
                  },
                  column.cellTextStyle,
                ]}
              >
                {textValue}
              </RNText>
            )}
          </View>
        );
      }))}
    </View>
  );

  const terminalState = renderTerminalState();

  const table = (
    <ScrollView
      horizontal
      accessibilityHint={description}
      accessibilityLabel={accessibleName}
      accessibilityRole="list"
      accessibilityState={{ busy }}
      aria-busy={busy}
      aria-label={accessibleName}
      role="list"
      showsHorizontalScrollIndicator
      style={[styles.frame, frameInvariant]}
      testID={testID === undefined ? undefined : `${testID}-scroll`}
    >
      <View
        style={[
          styles.table,
          {
            minWidth: minTableWidth ?? theme.breakpoints.tablet,
            width: "100%",
          },
        ]}
      >
        {renderTableHeader()}
        {refreshingState}
        {terminalState ?? validatedRows.map(renderTableRow)}
      </View>
    </ScrollView>
  );

  const listCellsFor = (
    row: ValidatedDataTableRow<Row, ColumnId, RowKey>
  ): readonly DataTableListCell<ColumnId>[] =>
    row.cells.map(({ column, textValue }) => ({
      columnId: column.id,
      header: column.header,
      textValue,
      align: column.align ?? "start",
    }));

  const sortableColumns = columns.filter((column) => column.sortable);
  const listControls =
    (selection !== undefined &&
      (selection.showSelectAll ?? true) &&
      validatedRows.length > 0) ||
    sortableColumns.length > 0 ? (
      <View
        accessibilityLabel={accessibleName}
        accessibilityRole="toolbar"
        role="toolbar"
        style={[
          styles.listControls,
          {
            borderBottomColor: theme.colors.line,
            gap: theme.spacing.sm,
            minHeight: metrics.minHeight,
            paddingHorizontal: metrics.paddingHorizontal,
            paddingVertical: metrics.paddingVertical,
          },
        ]}
        testID={testID === undefined ? undefined : `${testID}-list-controls`}
      >
        {selection !== undefined &&
        (selection.showSelectAll ?? true) &&
        validatedRows.length > 0 ? (
          <Checkbox
            label={selectAllLabel as string}
            checked={selectAllChecked}
            disabled={visibleEnabledRowKeys.length === 0}
            onCheckedChange={updateVisibleSelection}
            size={size === "sm" ? "sm" : "md"}
            testID={testID === undefined ? undefined : `${testID}-select-all`}
          />
        ) : null}
        {sortableColumns.map((column) => {
          const activeSort =
            props.sort?.columnId === column.id ? props.sort : null;
          const sortAccessibilityText =
            activeSort === null
              ? strings.sortUnsorted
              : activeSort.direction === "ascending"
              ? strings.sortAscending
              : strings.sortDescending;
          return (
            <Pressable
              key={column.id}
              accessibilityLabel={`${column.header}, ${sortAccessibilityText}`}
              accessibilityRole="button"
              accessibilityState={{ selected: activeSort !== null }}
              accessibilityValue={{ text: sortAccessibilityText }}
              disabled={unavailable}
              onPress={(event) => updateSort(column, event)}
              role="button"
              style={({ pressed }) => [
                styles.listSortControl,
                {
                  backgroundColor:
                    activeSort === null
                      ? theme.colors.surface
                      : theme.colors.primarySoft,
                  borderColor:
                    activeSort === null
                      ? theme.colors.line
                      : theme.colors.primary,
                  borderRadius: theme.radius.pill,
                  gap: theme.spacing.xs,
                  minHeight: theme.metrics.control.sm,
                  opacity: unavailable ? 0.52 : pressed ? 0.72 : 1,
                  paddingHorizontal: theme.spacing.md,
                },
              ]}
              testID={
                testID === undefined
                  ? undefined
                  : `${testID}-list-sort-${column.id}`
              }
            >
              <RNText
                maxFontSizeMultiplier={theme.metrics.maxFontScale}
                style={[
                  styles.listSortText,
                  {
                    color:
                      activeSort === null
                        ? theme.colors.text
                        : theme.colors.primaryStrong,
                  },
                ]}
              >
                {column.header}
              </RNText>
              <RNText
                accessibilityElementsHidden
                aria-hidden
                importantForAccessibility="no-hide-descendants"
                style={[
                  styles.sortIndicator,
                  {
                    color:
                      activeSort === null
                        ? theme.colors.textSubtle
                        : theme.colors.primaryStrong,
                  },
                ]}
              >
                {activeSort?.direction === "ascending"
                  ? "↑"
                  : activeSort?.direction === "descending"
                  ? "↓"
                  : "↕"}
              </RNText>
            </Pressable>
          );
        })}
      </View>
    ) : null;

  const renderCompactListRow = (
    row: ValidatedDataTableRow<Row, ColumnId, RowKey>
  ): ReactElement => {
    const rendered = props.renderListRow?.({
      row: row.row,
      rowKey: row.rowKey,
      rowIndex: row.rowIndex,
      cells: listCellsFor(row),
      selected: selectedKeys.has(row.rowKey),
      selectionDisabled: row.selectionDisabled,
      presentation: "list",
    });
    if (!isValidElement(rendered)) {
      throw new Error(
        "DataTable renderListRow must return one valid React element."
      );
    }
    return (
      <View
        key={reactRowKey(row.rowKey)}
        role="listitem"
        {...nativeWindProps(listRowClassName)}
        style={[
          styles.listRow,
          {
            backgroundColor: rowBackground(row),
            borderBottomColor: theme.colors.line,
          },
          listRowStyle,
          {
            gap: theme.spacing.md,
            minHeight: metrics.minHeight,
            paddingHorizontal: metrics.paddingHorizontal,
            paddingVertical: metrics.paddingVertical,
          },
        ]}
        testID={
          testID === undefined
            ? undefined
            : `${testID}-row-${String(row.rowKey)}`
        }
      >
        {renderSelectionControl(row)}
        {wrapRowCells(row, "list", rendered)}
      </View>
    );
  };

  const listBody =
    presentation === "list" ? (
      <View
        accessibilityHint={description}
        accessibilityLabel={accessibleName}
        accessibilityRole="list"
        accessibilityState={{ busy }}
        aria-busy={busy}
        aria-label={accessibleName}
        {...nativeWindProps(listClassName)}
        role="list"
        style={[listStyle, styles.list]}
        testID={testID === undefined ? undefined : `${testID}-scroll`}
      >
        {refreshingState}
        {terminalState ?? validatedRows.map(renderCompactListRow)}
      </View>
    ) : null;

  const list =
    presentation === "list" ? (
      <View style={[styles.frame, frameInvariant]}>
        {listControls}
        {listBody}
      </View>
    ) : null;

  return (
    <View
      {...nativeWindProps(className)}
      style={[styles.root, style, { alignSelf: "stretch", width: "100%" }]}
      testID={testID}
    >
      {caption !== undefined ? (
        <RNText
          {...nativeWindProps(captionClassName)}
          maxFontSizeMultiplier={theme.metrics.maxFontScale}
          style={[styles.caption, { color: theme.colors.text }, captionStyle]}
        >
          {caption}
        </RNText>
      ) : null}
      {description !== undefined ? (
        <RNText
          {...nativeWindProps(descriptionClassName)}
          maxFontSizeMultiplier={theme.metrics.maxFontScale}
          style={[
            styles.description,
            { color: theme.colors.textMuted },
            descriptionStyle,
          ]}
        >
          {description}
        </RNText>
      ) : null}
      {presentation === "table" ? table : list}
    </View>
  );
}
