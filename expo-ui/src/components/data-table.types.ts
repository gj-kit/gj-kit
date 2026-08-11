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
  readonly unstyled?: never;
}

export type DataTableProps<
  Row,
  ColumnId extends string,
  RowKey extends DataTableRowKey
> = DataTableBaseProps<Row, ColumnId, RowKey> &
  DataTableAccessibleName &
  DataTableSorting<ColumnId> &
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
