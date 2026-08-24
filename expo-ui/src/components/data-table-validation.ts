import type {
  DataTableColumn,
  DataTableProps,
  DataTableRowKey,
  DataTableSelectionRowContext,
  DataTableSort,
  DataTableSortDirection,
} from "./data-table.types";

export interface ValidatedDataTableCell<
  Row,
  ColumnId extends string,
  RowKey extends DataTableRowKey
> {
  readonly column: DataTableColumn<Row, ColumnId, RowKey>;
  readonly textValue: string;
}

export interface ValidatedDataTableRow<
  Row,
  ColumnId extends string,
  RowKey extends DataTableRowKey
> extends DataTableSelectionRowContext<Row, RowKey> {
  readonly cells: readonly ValidatedDataTableCell<Row, ColumnId, RowKey>[];
  readonly selectionDisabled: boolean;
  readonly selectionLabel: string | undefined;
  /** Accessible name of the activatable row; undefined without onRowPress. */
  readonly pressLabel: string | undefined;
}

export function assertNonblankDataTableString(
  value: unknown,
  name: string
): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`DataTable ${name} must be a nonblank string.`);
  }
}

function assertPositiveFinite(value: unknown, name: string): void {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new Error(
      `DataTable ${name} must be a finite number greater than 0.`
    );
  }
}

function assertRowKey(
  value: unknown,
  name: string
): asserts value is DataTableRowKey {
  if (typeof value === "string") {
    if (value.trim().length > 0) return;
  } else if (typeof value === "number" && Number.isFinite(value)) {
    return;
  }
  throw new Error(
    `DataTable ${name} must be a finite number or nonblank string.`
  );
}

function isSortDirection(value: unknown): value is DataTableSortDirection {
  return value === "ascending" || value === "descending";
}

export function assertDataTableProps<
  Row,
  ColumnId extends string,
  RowKey extends DataTableRowKey
>(
  props: DataTableProps<Row, ColumnId, RowKey>
): readonly ValidatedDataTableRow<Row, ColumnId, RowKey>[] {
  const hasCaption = props.caption !== undefined;
  const hasAccessibilityLabel = props.accessibilityLabel !== undefined;
  if (hasCaption === hasAccessibilityLabel) {
    throw new Error(
      "DataTable requires exactly one of caption or accessibilityLabel."
    );
  }
  if (hasCaption) {
    assertNonblankDataTableString(props.caption, "caption");
  } else {
    assertNonblankDataTableString(
      props.accessibilityLabel,
      "accessibilityLabel"
    );
  }
  if (props.description !== undefined) {
    assertNonblankDataTableString(props.description, "description");
  }
  if (!Array.isArray(props.columns) || props.columns.length === 0) {
    throw new Error("DataTable columns must contain at least one column.");
  }
  if (typeof props.getRowKey !== "function") {
    throw new Error("DataTable getRowKey must be a function.");
  }
  if ((props as { readonly unstyled?: unknown }).unstyled !== undefined) {
    throw new Error("DataTable does not support unstyled.");
  }
  if (
    props.size !== undefined &&
    props.size !== "sm" &&
    props.size !== "md" &&
    props.size !== "lg"
  ) {
    throw new Error('DataTable size must be "sm", "md", or "lg".');
  }
  if (
    props.variant !== undefined &&
    props.variant !== "line" &&
    props.variant !== "outline"
  ) {
    throw new Error('DataTable variant must be "line" or "outline".');
  }
  if (
    props.presentation !== undefined &&
    props.presentation !== "table" &&
    props.presentation !== "list" &&
    props.presentation !== "auto"
  ) {
    throw new Error(
      'DataTable presentation must be "table", "list", or "auto".'
    );
  }
  const adaptive =
    props.presentation === "list" || props.presentation === "auto";
  if (adaptive && typeof props.renderListRow !== "function") {
    throw new Error(
      "DataTable list and auto presentations require renderListRow."
    );
  }
  if (!adaptive && props.renderListRow !== undefined) {
    throw new Error(
      "DataTable table presentation does not accept renderListRow."
    );
  }
  const columnIds = new Set<string>();
  for (const column of props.columns) {
    assertNonblankDataTableString(column.id, "column id");
    assertNonblankDataTableString(
      column.header,
      `column "${column.id}" header`
    );
    if (columnIds.has(column.id)) {
      throw new Error(
        `DataTable column ids must be unique; received "${column.id}" more than once.`
      );
    }
    columnIds.add(column.id);
    if (typeof column.getTextValue !== "function") {
      throw new Error(
        `DataTable column "${column.id}" getTextValue must be a function.`
      );
    }
    if (
      column.renderCell !== undefined &&
      typeof column.renderCell !== "function"
    ) {
      throw new Error(
        `DataTable column "${column.id}" renderCell must be a function.`
      );
    }
    if (column.width !== undefined && column.flex !== undefined) {
      throw new Error(
        `DataTable column "${column.id}" cannot define both width and flex.`
      );
    }
    if (column.width !== undefined)
      assertPositiveFinite(column.width, `column "${column.id}" width`);
    if (column.flex !== undefined)
      assertPositiveFinite(column.flex, `column "${column.id}" flex`);
    if (column.minWidth !== undefined)
      assertPositiveFinite(column.minWidth, `column "${column.id}" minWidth`);
    if (column.maxWidth !== undefined)
      assertPositiveFinite(column.maxWidth, `column "${column.id}" maxWidth`);
    if (
      column.minWidth !== undefined &&
      column.maxWidth !== undefined &&
      column.minWidth > column.maxWidth
    ) {
      throw new Error(
        `DataTable column "${column.id}" minWidth cannot exceed maxWidth.`
      );
    }
    if (
      column.align !== undefined &&
      column.align !== "start" &&
      column.align !== "center" &&
      column.align !== "end"
    ) {
      throw new Error(
        `DataTable column "${column.id}" align must be "start", "center", or "end".`
      );
    }
    if (
      column.sortable !== undefined &&
      column.sortable !== true &&
      column.sortable !== false
    ) {
      throw new Error(
        `DataTable column "${column.id}" sortable must be a boolean.`
      );
    }
    if (
      column.firstSortDirection !== undefined &&
      !isSortDirection(column.firstSortDirection)
    ) {
      throw new Error(
        `DataTable column "${column.id}" firstSortDirection must be "ascending" or "descending".`
      );
    }
    if (column.sortable !== true && column.firstSortDirection !== undefined) {
      throw new Error(
        `DataTable column "${column.id}" firstSortDirection requires sortable: true.`
      );
    }
  }
  if (!columnIds.has(props.rowHeaderColumnId)) {
    throw new Error(
      "DataTable rowHeaderColumnId must reference an existing column."
    );
  }
  if (props.minTableWidth !== undefined)
    assertPositiveFinite(props.minTableWidth, "minTableWidth");

  const sortableColumns = props.columns.filter(
    (column) => column.sortable === true
  );
  const hasSortValue = props.sort !== undefined;
  const hasSortHandler = props.onSortChange !== undefined;
  if (hasSortHandler && typeof props.onSortChange !== "function") {
    throw new Error("DataTable onSortChange must be a function.");
  }
  if (sortableColumns.length > 0 && (!hasSortValue || !hasSortHandler)) {
    throw new Error(
      "DataTable sortable columns require controlled sort and onSortChange props."
    );
  }
  if (sortableColumns.length === 0 && (hasSortValue || hasSortHandler)) {
    throw new Error(
      "DataTable sort props require at least one sortable column."
    );
  }
  if (hasSortValue !== hasSortHandler) {
    throw new Error(
      "DataTable sort and onSortChange must be provided together."
    );
  }
  if (props.sort !== undefined && props.sort !== null) {
    if (
      typeof props.sort !== "object" ||
      props.sort === null ||
      !isSortDirection(
        (props.sort as { readonly direction?: unknown }).direction
      )
    ) {
      throw new Error(
        'DataTable sort.direction must be "ascending" or "descending".'
      );
    }
    const active = props.columns.find(
      (column) => column.id === props.sort?.columnId
    );
    if (active?.sortable !== true) {
      throw new Error(
        "DataTable sort.columnId must reference a sortable column."
      );
    }
  }

  if (typeof props.state !== "object" || props.state === null) {
    throw new Error("DataTable state must be an object.");
  }
  if (
    props.state.status !== "loading" &&
    props.state.status !== "error" &&
    props.state.status !== "ready" &&
    props.state.status !== "refreshing"
  ) {
    throw new Error(
      'DataTable state.status must be "loading", "error", "ready", or "refreshing".'
    );
  }
  if (props.state.status === "loading") {
    const count = props.state.skeletonRowCount ?? 5;
    if (!Number.isInteger(count) || count < 1 || count > 20) {
      throw new Error(
        "DataTable skeletonRowCount must be an integer from 1 to 20."
      );
    }
  }
  if (
    props.state.status === "refreshing" &&
    props.state.refreshingAccessibilityLabel !== undefined
  ) {
    assertNonblankDataTableString(
      props.state.refreshingAccessibilityLabel,
      "refreshingAccessibilityLabel"
    );
  }

  const rows =
    props.state.status === "ready" || props.state.status === "refreshing"
      ? props.state.rows
      : [];
  if (!Array.isArray(rows)) {
    throw new Error("DataTable state.rows must be an array.");
  }
  if (props.state.status === "refreshing" && rows.length === 0) {
    throw new Error(
      "DataTable refreshing state requires at least one retained row; use loading instead."
    );
  }
  if (props.onRowPress !== undefined && typeof props.onRowPress !== "function") {
    throw new Error("DataTable onRowPress must be a function.");
  }
  if (props.getRowAccessibilityLabel !== undefined) {
    if (typeof props.getRowAccessibilityLabel !== "function") {
      throw new Error("DataTable getRowAccessibilityLabel must be a function.");
    }
    if (props.onRowPress === undefined) {
      throw new Error(
        "DataTable getRowAccessibilityLabel requires onRowPress; static rows have no accessible name."
      );
    }
  }
  if (props.activeRow !== undefined) {
    if (typeof props.activeRow !== "object" || props.activeRow === null) {
      throw new Error(
        "DataTable activeRow must be an object with a key (null for none)."
      );
    }
    if (props.activeRow.key !== null) {
      assertRowKey(props.activeRow.key, "activeRow.key");
    }
  }
  if (props.rowStyle !== undefined && typeof props.rowStyle !== "function") {
    throw new Error("DataTable rowStyle must be a function.");
  }
  if (props.selection !== undefined) {
    if (typeof props.selection.onSelectionChange !== "function") {
      throw new Error(
        "DataTable selection.onSelectionChange must be a function."
      );
    }
    if (
      typeof props.selection.getRowSelectionAccessibilityLabel !== "function"
    ) {
      throw new Error(
        "DataTable selection.getRowSelectionAccessibilityLabel must be a function."
      );
    }
    if (
      props.selection.isRowSelectionDisabled !== undefined &&
      typeof props.selection.isRowSelectionDisabled !== "function"
    ) {
      throw new Error(
        "DataTable selection.isRowSelectionDisabled must be a function."
      );
    }
  }
  const rowKeys = new Set<DataTableRowKey>();
  const validatedRows = rows.map<ValidatedDataTableRow<Row, ColumnId, RowKey>>(
    (row, rowIndex) => {
      const rowKey = props.getRowKey(row, rowIndex);
      assertRowKey(rowKey, `row key at index ${rowIndex}`);
      if (rowKeys.has(rowKey)) {
        throw new Error(
          `DataTable row keys must be unique; received "${String(
            rowKey
          )}" more than once.`
        );
      }
      rowKeys.add(rowKey);
      const cells = props.columns.map((column) => {
        const textValue = column.getTextValue({
          row,
          rowKey: rowKey as RowKey,
          rowIndex,
          columnId: column.id,
        });
        assertNonblankDataTableString(
          textValue,
          `text value for row "${String(rowKey)}" and column "${column.id}"`
        );
        return { column, textValue };
      });
      let selectionDisabled = false;
      let selectionLabel: string | undefined;
      if (props.selection !== undefined) {
        const context: DataTableSelectionRowContext<Row, RowKey> = {
          row,
          rowKey: rowKey as RowKey,
          rowIndex,
        };
        selectionLabel =
          props.selection.getRowSelectionAccessibilityLabel(context);
        assertNonblankDataTableString(
          selectionLabel,
          `selection label for row "${String(rowKey)}"`
        );
        selectionDisabled =
          props.selection.isRowSelectionDisabled?.(context) === true;
      }
      let pressLabel: string | undefined;
      if (props.onRowPress !== undefined) {
        pressLabel =
          props.getRowAccessibilityLabel === undefined
            ? cells
                .map(({ column, textValue }) => `${column.header}: ${textValue}`)
                .join(", ")
            : props.getRowAccessibilityLabel(row);
        assertNonblankDataTableString(
          pressLabel,
          `row accessibility label for row "${String(rowKey)}"`
        );
      }
      return {
        row,
        rowKey: rowKey as RowKey,
        rowIndex,
        cells,
        selectionDisabled,
        selectionLabel,
        pressLabel,
      };
    }
  );

  if (props.selection !== undefined) {
    if (!Array.isArray(props.selection.selectedRowKeys)) {
      throw new Error("DataTable selection.selectedRowKeys must be an array.");
    }
    const selected = new Set<DataTableRowKey>();
    for (const rowKey of props.selection.selectedRowKeys) {
      assertRowKey(rowKey, "selected row key");
      if (selected.has(rowKey)) {
        throw new Error(
          `DataTable selectedRowKeys must be unique; received "${String(
            rowKey
          )}" more than once.`
        );
      }
      selected.add(rowKey);
    }
    if (props.selection.selectAllAccessibilityLabel !== undefined) {
      assertNonblankDataTableString(
        props.selection.selectAllAccessibilityLabel,
        "selection.selectAllAccessibilityLabel"
      );
    }
    if (props.selection.clearSelectionAccessibilityLabel !== undefined) {
      assertNonblankDataTableString(
        props.selection.clearSelectionAccessibilityLabel,
        "selection.clearSelectionAccessibilityLabel"
      );
    }
  }
  return validatedRows;
}

export function nextDataTableSort<
  Row,
  ColumnId extends string,
  RowKey extends DataTableRowKey
>(
  column: DataTableColumn<Row, ColumnId, RowKey>,
  current: DataTableSort<ColumnId> | null
): DataTableSort<ColumnId> | null {
  const first: DataTableSortDirection =
    column.firstSortDirection ?? "ascending";
  if (current?.columnId !== column.id)
    return { columnId: column.id, direction: first };
  if (current.direction === first) {
    return {
      columnId: column.id,
      direction: first === "ascending" ? "descending" : "ascending",
    };
  }
  return null;
}

export function toggleDataTableRowKey<RowKey extends DataTableRowKey>(
  selectedRowKeys: readonly RowKey[],
  rowKey: RowKey,
  selected: boolean
): readonly RowKey[] {
  if (selected) {
    return selectedRowKeys.includes(rowKey)
      ? [...selectedRowKeys]
      : [...selectedRowKeys, rowKey];
  }
  return selectedRowKeys.filter((key) => key !== rowKey);
}

export function toggleDataTablePageKeys<RowKey extends DataTableRowKey>(
  selectedRowKeys: readonly RowKey[],
  visibleEnabledRowKeys: readonly RowKey[],
  selected: boolean
): readonly RowKey[] {
  const visible = new Set(visibleEnabledRowKeys);
  if (!selected) return selectedRowKeys.filter((key) => !visible.has(key));
  const next = [...selectedRowKeys];
  const included = new Set(selectedRowKeys);
  for (const key of visibleEnabledRowKeys) {
    if (!included.has(key)) {
      included.add(key);
      next.push(key);
    }
  }
  return next;
}
