/**
 * DataTable public contracts.
 *
 * DataTable is a bounded, presentational data table rather than a spreadsheet
 * widget. The application owns ordering, filtering, pagination, and fetching;
 * this package owns semantics, responsive presentation, and controlled UI
 * notifications. A future DataGrid may add composite arrow-key navigation and
 * virtualization without changing this static-table contract.
 */
import type { ReactElement } from "react";
import type { StyleProp, TextStyle, ViewStyle } from "react-native";
import type { CommonProps } from "./internal";

export type DataTableRowKey = string | number;
export type DataTableAlignment = "start" | "center" | "end";
export type DataTableSize = "sm" | "md" | "lg";
export type DataTableVariant = "line" | "outline";
export type DataTablePresentation = "table" | "list" | "auto";
export type DataTableSortDirection = "ascending" | "descending";

export interface DataTableValueContext<
  Row,
  RowKey extends DataTableRowKey,
  ColumnId extends string
> {
  readonly row: Row;
  readonly rowKey: RowKey;
  readonly rowIndex: number;
  readonly columnId: ColumnId;
}

export interface DataTableCellContext<
  Row,
  RowKey extends DataTableRowKey,
  ColumnId extends string
> extends DataTableValueContext<Row, RowKey, ColumnId> {
  /** Nonblank scalar returned by getTextValue. */
  readonly textValue: string;
  readonly presentation: "table";
}

type DataTableColumnLayout =
  | {
      /** Fixed pixel width. */
      readonly width: number;
      readonly flex?: never;
    }
  | {
      readonly width?: never;
      /** Relative width among flexible columns. Defaults to 1. */
      readonly flex?: number;
    };

type DataTableSortableColumn =
  | {
      readonly sortable: true;
      readonly firstSortDirection?: DataTableSortDirection | undefined;
    }
  | {
      readonly sortable?: false | undefined;
      readonly firstSortDirection?: never;
    };

export type DataTableColumn<
  Row,
  ColumnId extends string,
  RowKey extends DataTableRowKey = DataTableRowKey
> = DataTableColumnLayout &
  DataTableSortableColumn & {
    readonly id: ColumnId;
    /** Visible, nonblank column title and the default control name. */
    readonly header: string;
    /**
     * Localized scalar used by native accessibility and compact renderers.
     * Rich visual cells can still be returned by renderCell.
     */
    readonly getTextValue: (
      context: DataTableValueContext<Row, RowKey, ColumnId>
    ) => string;
    readonly renderCell?: (
      context: DataTableCellContext<Row, RowKey, ColumnId>
    ) => ReactElement;
    readonly align?: DataTableAlignment | undefined;
    readonly minWidth?: number | undefined;
    readonly maxWidth?: number | undefined;
    readonly headerStyle?: StyleProp<ViewStyle> | undefined;
    readonly headerClassName?: string | undefined;
    readonly headerTextStyle?: StyleProp<TextStyle> | undefined;
    readonly headerTextClassName?: string | undefined;
    readonly cellStyle?: StyleProp<ViewStyle> | undefined;
    readonly cellClassName?: string | undefined;
    readonly cellTextStyle?: StyleProp<TextStyle> | undefined;
    readonly cellTextClassName?: string | undefined;
  };

export interface DataTableSort<ColumnId extends string> {
  readonly columnId: ColumnId;
  readonly direction: DataTableSortDirection;
}

export interface DataTableSortChangeDetails<ColumnId extends string> {
  readonly reason: "column-header-press";
  readonly columnId: ColumnId;
  readonly previous: DataTableSort<ColumnId> | null;
  readonly originalEvent?: unknown;
}

export interface DataTableSelectionRowContext<
  Row,
  RowKey extends DataTableRowKey
> {
  readonly row: Row;
  readonly rowKey: RowKey;
  readonly rowIndex: number;
}

export type DataTableSelectionChangeDetails<RowKey extends DataTableRowKey> =
  | {
      readonly reason: "row-toggle";
      readonly scope: "visible";
      readonly rowKey: RowKey;
      readonly selected: boolean;
      readonly originalEvent?: unknown;
    }
  | {
      readonly reason: "page-toggle";
      readonly scope: "visible";
      /** Visible, enabled keys whose selected boolean actually changed. */
      readonly affectedRowKeys: readonly RowKey[];
      readonly selected: boolean;
      readonly originalEvent?: unknown;
    };

export interface DataTableRowPressContext<RowKey extends DataTableRowKey> {
  readonly rowKey: RowKey;
  readonly rowIndex: number;
  /** "table" for the semantic web table and the native visual table; "list" for compact presentations. */
  readonly presentation: "table" | "list";
  readonly originalEvent?: unknown;
}

export interface DataTableRowStyleContext<RowKey extends DataTableRowKey> {
  readonly rowKey: RowKey;
  readonly rowIndex: number;
  /** True when this row's key equals activeRow.key. */
  readonly active: boolean;
  /** "table" for the semantic web table and the native visual table; "list" for compact presentations. */
  readonly presentation: "table" | "list";
}

/**
 * App-driven "current row" highlight for consoles where activating a row opens
 * a detail surface (Sheet, side panel) that stays in sync with the table. This
 * is deliberately not selection: the row is not aria-selected, because that
 * would claim grid/listbox semantics this static table does not have. On the
 * web the active body row — the `<tr>` in the table presentation and the
 * listitem in the list presentation — carries `aria-current="true"` instead,
 * which is valid on any element. Native presentations expose no extra
 * accessibility state for the active row, so the detail surface itself must
 * also convey which record is open. Grouping key and style in one object makes
 * a style without a key impossible by construction, the same shape discipline
 * as the selection prop.
 */
export interface DataTableActiveRow<RowKey extends DataTableRowKey> {
  /** Key of the row currently open in a detail surface; null means none. */
  readonly key: RowKey | null;
  /**
   * Replaces the default active visual (primarySoft full-row wash + primary
   * start-edge accent on the row-header cell or list row container). Layered
   * onto the active row after built-in row styles; the web table presentation
   * applies it to each of the row's cells, because a real <table> row box
   * cannot paint above its opaque cells. `aria-current` stays either way.
   */
  readonly style?: StyleProp<ViewStyle> | undefined;
}

/**
 * Row activation is optional and additive, and consumer row content is never
 * nested inside a button. On the web the table body row stays a real focusable
 * `<tr role="row">` and the compact list row a focusable listitem; both
 * activate on click, Enter, and Space, ignore events that start on interactive
 * descendants (selection checkboxes, links), and reference a visually hidden
 * `strings.rowActivationHint` through `aria-describedby`. Native presentations
 * split the two concerns: a non-accessible pressable surface handles touch
 * (nested touchables inside cells still win their own touches) while a sibling
 * one-point button element carries the accessible row name and activation for
 * assistive technology. The selection checkbox always stays outside both.
 */
type DataTableRowPress<Row, RowKey extends DataTableRowKey> =
  | {
      /**
       * Called when a body row is activated by pointer or keyboard. Never
       * fires from the selection checkbox or from interactive cell content.
       */
      readonly onRowPress: (
        row: Row,
        context: DataTableRowPressContext<RowKey>
      ) => void;
      /**
       * Accessible name of an activatable row. Defaults to the row's cells
       * joined as "header: value". Must return a nonblank string.
       */
      readonly getRowAccessibilityLabel?: ((row: Row) => string) | undefined;
    }
  | {
      readonly onRowPress?: never;
      /**
       * Only meaningful for activatable rows; requires a definitely present
       * onRowPress.
       */
      readonly getRowAccessibilityLabel?: never;
    }
  | {
      /**
       * Conditional wiring like `onRowPress={canOpen ? open : undefined}`
       * stays idiomatic; getRowAccessibilityLabel still requires a definitely
       * present handler.
       */
      readonly onRowPress:
        | ((row: Row, context: DataTableRowPressContext<RowKey>) => void)
        | undefined;
      readonly getRowAccessibilityLabel?: never;
    };

export interface DataTableSelection<Row, RowKey extends DataTableRowKey> {
  /** Include-only controlled model. Off-page keys are preserved by page toggles. */
  readonly selectedRowKeys: readonly NoInfer<RowKey>[];
  readonly onSelectionChange: (
    selectedRowKeys: readonly RowKey[],
    details: DataTableSelectionChangeDetails<RowKey>
  ) => void;
  readonly getRowSelectionAccessibilityLabel: (
    context: DataTableSelectionRowContext<Row, RowKey>
  ) => string;
  readonly isRowSelectionDisabled?: (
    context: DataTableSelectionRowContext<Row, RowKey>
  ) => boolean;
  /** Defaults to true. It always means the currently supplied visible rows. */
  readonly showSelectAll?: boolean | undefined;
  readonly selectAllAccessibilityLabel?: string | undefined;
  readonly clearSelectionAccessibilityLabel?: string | undefined;
}

export interface DataTableListCell<ColumnId extends string> {
  readonly columnId: ColumnId;
  readonly header: string;
  readonly textValue: string;
  readonly align: DataTableAlignment;
}

export interface DataTableListRowContext<
  Row,
  RowKey extends DataTableRowKey,
  ColumnId extends string
> {
  readonly row: Row;
  readonly rowKey: RowKey;
  readonly rowIndex: number;
  readonly cells: readonly DataTableListCell<ColumnId>[];
  readonly selected: boolean;
  readonly selectionDisabled: boolean;
  readonly presentation: "list";
}

export type DataTableState<Row> =
  | {
      readonly status: "loading";
      readonly skeletonRowCount?: number | undefined;
      readonly loadingState?: ReactElement | undefined;
      readonly rows?: never;
      readonly errorState?: never;
      readonly emptyState?: never;
      readonly refreshingAccessibilityLabel?: never;
    }
  | {
      readonly status: "error";
      readonly errorState?: ReactElement | undefined;
      readonly rows?: never;
      readonly skeletonRowCount?: never;
      readonly loadingState?: never;
      readonly emptyState?: never;
      readonly refreshingAccessibilityLabel?: never;
    }
  | {
      readonly status: "ready";
      readonly rows: readonly Row[];
      readonly emptyState?: ReactElement | undefined;
      readonly skeletonRowCount?: never;
      readonly loadingState?: never;
      readonly errorState?: never;
      readonly refreshingAccessibilityLabel?: never;
    }
  | {
      readonly status: "refreshing";
      readonly rows: readonly Row[];
      readonly refreshingAccessibilityLabel?: string | undefined;
      readonly skeletonRowCount?: never;
      readonly loadingState?: never;
      readonly errorState?: never;
      readonly emptyState?: never;
    };

type DataTableAccessibleName =
  | {
      /** Visible caption. A second aria-label is forbidden to avoid overriding it. */
      readonly caption: string;
      readonly accessibilityLabel?: never;
    }
  | {
      readonly caption?: never;
      readonly accessibilityLabel: string;
    };

type DataTableSorting<ColumnId extends string> =
  | {
      readonly sort: DataTableSort<NoInfer<ColumnId>> | null;
      readonly onSortChange: (
        sort: DataTableSort<ColumnId> | null,
        details: DataTableSortChangeDetails<ColumnId>
      ) => void;
    }
  | {
      readonly sort?: never;
      readonly onSortChange?: never;
    };

export type DataTableColumnId<
  Columns extends readonly { readonly id: string }[]
> = Extract<Columns[number]["id"], string>;

export type DataTableSortableColumnId<
  Columns extends readonly { readonly id: string }[]
> = Extract<
  Extract<Columns[number], { readonly sortable: true }>["id"],
  string
>;

type DataTableTablePresentation = {
  readonly presentation?: "table" | undefined;
  readonly renderListRow?: never;
};

type DataTableAdaptivePresentation<
  Row,
  RowKey extends DataTableRowKey,
  ColumnId extends string
> = {
  readonly presentation: "list" | "auto";
  readonly renderListRow: (
    context: DataTableListRowContext<Row, RowKey, ColumnId>
  ) => ReactElement;
};

interface DataTableBaseProps<
  Row,
  ColumnId extends string,
  RowKey extends DataTableRowKey
> extends Omit<CommonProps, "unstyled"> {
  readonly state: DataTableState<Row>;
  readonly columns: readonly DataTableColumn<Row, ColumnId, RowKey>[];
  readonly getRowKey: (row: Row, rowIndex: number) => RowKey;
  /** Exactly one existing column becomes a web <th scope="row">. */
  readonly rowHeaderColumnId: NoInfer<ColumnId>;
  readonly description?: string | undefined;
  readonly selection?: DataTableSelection<Row, RowKey> | undefined;
  readonly size?: DataTableSize | undefined;
  readonly variant?: DataTableVariant | undefined;
  readonly striped?: boolean | undefined;
  readonly showColumnBorders?: boolean | undefined;
  readonly minTableWidth?: number | undefined;
  readonly captionStyle?: StyleProp<TextStyle> | undefined;
  readonly captionClassName?: string | undefined;
  readonly descriptionStyle?: StyleProp<TextStyle> | undefined;
  readonly descriptionClassName?: string | undefined;
  readonly headerCellStyle?: StyleProp<ViewStyle> | undefined;
  readonly headerCellClassName?: string | undefined;
  readonly cellStyle?: StyleProp<ViewStyle> | undefined;
  readonly cellClassName?: string | undefined;
  readonly listStyle?: StyleProp<ViewStyle> | undefined;
  readonly listClassName?: string | undefined;
  readonly listRowStyle?: StyleProp<ViewStyle> | undefined;
  readonly listRowClassName?: string | undefined;
  readonly activeRow?: DataTableActiveRow<NoInfer<RowKey>> | undefined;
  /**
   * Per-row style hook, layered after every built-in row visual (stripes, the
   * active wash, activeRow.style). Applied to table rows and list rows on
   * both platforms; the web table presentation applies the result to each of
   * the row's cells, because a real <table> row box cannot paint above its
   * opaque cells. Return undefined to leave a row unchanged.
   */
  readonly rowStyle?:
    | ((
        row: Row,
        context: DataTableRowStyleContext<RowKey>
      ) => StyleProp<ViewStyle> | undefined)
    | undefined;
  readonly unstyled?: never;
}

export type DataTableProps<
  Row,
  ColumnId extends string,
  RowKey extends DataTableRowKey
> = DataTableBaseProps<Row, ColumnId, RowKey> &
  DataTableAccessibleName &
  DataTableSorting<ColumnId> &
  DataTableRowPress<Row, RowKey> &
  (
    | DataTableTablePresentation
    | DataTableAdaptivePresentation<Row, RowKey, ColumnId>
  );

type DistributiveDataTableOmit<T, Keys extends PropertyKey> = T extends unknown
  ? Omit<T, Extract<keyof T, Keys>>
  : never;

type InferredDataTableSorting<
  Columns extends readonly { readonly id: string }[]
> = number extends Columns["length"]
  ? DataTableSorting<DataTableColumnId<Columns>>
  : [DataTableSortableColumnId<Columns>] extends [never]
  ? { readonly sort?: never; readonly onSortChange?: never }
  : {
      readonly sort: DataTableSort<
        NoInfer<DataTableSortableColumnId<Columns>>
      > | null;
      readonly onSortChange: (
        sort: DataTableSort<DataTableSortableColumnId<Columns>> | null,
        details: DataTableSortChangeDetails<DataTableSortableColumnId<Columns>>
      ) => void;
    };

/**
 * JSX call contract. Literal column tuples narrow sort.columnId to only columns
 * marked `sortable: true`; widened column arrays retain the explicit
 * DataTableProps controlled-pair union.
 */
export type DataTableComponentProps<
  Row,
  RowKey extends DataTableRowKey,
  Columns extends readonly { readonly id: string }[]
> = DistributiveDataTableOmit<
  DataTableProps<Row, DataTableColumnId<Columns>, RowKey>,
  "columns" | "sort" | "onSortChange"
> & {
  readonly columns: Columns &
    readonly DataTableColumn<Row, DataTableColumnId<Columns>, RowKey>[];
} & InferredDataTableSorting<Columns>;
