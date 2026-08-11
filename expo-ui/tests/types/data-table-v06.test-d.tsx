import { describe, expectTypeOf, it } from "vitest";
import { Text, View } from "react-native";
import { DataTable as PublicDataTable } from "../../src";
import type {
  DataTableColumn as PublicDataTableColumn,
  DataTableColumnId as PublicDataTableColumnId,
  DataTableComponentProps as PublicDataTableComponentProps,
  DataTableProps as PublicDataTableProps,
  DataTableSortableColumnId as PublicDataTableSortableColumnId,
  DataTableState as PublicDataTableState,
} from "../../src";
import { DataTable as SourceDataTable } from "../../src/components/data-table";
import type {
  DataTableColumn,
  DataTableListRowContext,
  DataTableProps,
  DataTableSelectionChangeDetails,
  DataTableSort,
  DataTableSortChangeDetails,
} from "../../src/components/data-table.types";

type Payment = {
  readonly id: string;
  readonly member: string;
  readonly amount: number;
  readonly locked: boolean;
  readonly status: "paid" | "pending";
};

const payments = [
  {
    id: "payment-1",
    member: "Ada",
    amount: 12_000,
    locked: false,
    status: "paid",
  },
  {
    id: "payment-2",
    member: "Grace",
    amount: 24_000,
    locked: true,
    status: "pending",
  },
] as const satisfies readonly Payment[];

const columns = [
  {
    id: "member",
    header: "Member",
    flex: 2,
    sortable: true,
    getTextValue: ({ row }) => row.member,
    renderCell: ({ textValue }) => <Text>{textValue}</Text>,
  },
  {
    id: "amount",
    header: "Amount",
    width: 120,
    align: "end",
    sortable: true,
    firstSortDirection: "descending",
    getTextValue: ({ row }) => String(row.amount),
  },
] as const satisfies readonly DataTableColumn<
  Payment,
  "member" | "amount",
  string
>[];

const inferredColumns = [
  {
    id: "member",
    header: "Member",
    flex: 2,
    sortable: true,
    getTextValue: ({ row }) => row.member,
  },
  {
    id: "amount",
    header: "Amount",
    width: 120,
    sortable: true,
    getTextValue: ({ row }) => String(row.amount),
  },
  {
    id: "status",
    header: "Status",
    flex: 1,
    getTextValue: ({ row }) => row.status,
  },
] as const satisfies readonly DataTableColumn<
  Payment,
  "member" | "amount" | "status",
  string
>[];

type PaymentColumnId = (typeof columns)[number]["id"];
type PaymentTableProps = DataTableProps<Payment, PaymentColumnId, string>;

declare function acceptPaymentTable(props: PaymentTableProps): void;

const readyState = { status: "ready", rows: payments } as const;

describe("DataTable public root export and component inference", () => {
  it("exports the public contracts and preserves tuple-derived ids from the package root", () => {
    expectTypeOf<
      PublicDataTableProps<Payment, PaymentColumnId, string>
    >().toEqualTypeOf<PaymentTableProps>();
    expectTypeOf<
      PublicDataTableColumn<Payment, PaymentColumnId, string>
    >().toEqualTypeOf<DataTableColumn<Payment, PaymentColumnId, string>>();
    expectTypeOf<
      PublicDataTableColumnId<typeof inferredColumns>
    >().toEqualTypeOf<"member" | "amount" | "status">();
    expectTypeOf<
      PublicDataTableSortableColumnId<typeof inferredColumns>
    >().toEqualTypeOf<"member" | "amount">();
    expectTypeOf<PublicDataTableState<Payment>>().toEqualTypeOf<
      PaymentTableProps["state"]
    >();
    expectTypeOf<
      PublicDataTableComponentProps<Payment, string, typeof inferredColumns>
    >().toMatchTypeOf<Record<string, unknown>>();

    void (
      <PublicDataTable
        accessibilityLabel="Public inferred payments"
        state={readyState}
        columns={inferredColumns}
        getRowKey={(row) => row.id}
        rowHeaderColumnId="member"
        sort={{ columnId: "member", direction: "ascending" }}
        onSortChange={(sort, details) => {
          expectTypeOf(sort).toEqualTypeOf<DataTableSort<
            "member" | "amount"
          > | null>();
          expectTypeOf(details.columnId).toEqualTypeOf<"member" | "amount">();
        }}
      />
    );

    void (
      <PublicDataTable
        accessibilityLabel="Invalid public inferred sort"
        state={readyState}
        columns={inferredColumns}
        getRowKey={(row) => row.id}
        rowHeaderColumnId="member"
        // @ts-expect-error package-root inference excludes non-sortable status
        sort={{ columnId: "status", direction: "ascending" }}
        onSortChange={() => {}}
      />
    );
  });
});

describe("DataTable literal ids, names, and column contracts", () => {
  it("preserves column-id literals and strongly types every callback context", () => {
    expectTypeOf<PaymentColumnId>().toEqualTypeOf<"member" | "amount">();

    acceptPaymentTable({
      caption: "Recent payments",
      state: readyState,
      columns,
      getRowKey: (row) => row.id,
      rowHeaderColumnId: "member",
      sort: { columnId: "amount", direction: "descending" },
      onSortChange: (sort, details) => {
        expectTypeOf(sort).toEqualTypeOf<{
          readonly columnId: PaymentColumnId;
          readonly direction: "ascending" | "descending";
        } | null>();
        expectTypeOf(details).toEqualTypeOf<
          DataTableSortChangeDetails<PaymentColumnId>
        >();
      },
      selection: {
        selectedRowKeys: ["off-page-payment"],
        onSelectionChange: (keys, details) => {
          expectTypeOf(keys).toEqualTypeOf<readonly string[]>();
          expectTypeOf(details).toEqualTypeOf<
            DataTableSelectionChangeDetails<string>
          >();
        },
        getRowSelectionAccessibilityLabel: ({ row }) => `Select ${row.member}`,
        isRowSelectionDisabled: ({ row }) => row.locked,
      },
      size: "sm",
      variant: "outline",
      striped: true,
      showColumnBorders: true,
      minTableWidth: 720,
      captionStyle: { opacity: 0.8 },
      captionClassName: "caption",
      descriptionStyle: { opacity: 0.7 },
      descriptionClassName: "description",
      headerCellStyle: { minHeight: 40 },
      headerCellClassName: "header-cell",
      cellStyle: { minHeight: 44 },
      cellClassName: "cell",
      listStyle: { gap: 8 },
      listClassName: "list",
      listRowStyle: { minHeight: 44 },
      listRowClassName: "list-row",
      style: { marginTop: 8 },
      className: "table-root",
      testID: "payments",
    });

    acceptPaymentTable({
      accessibilityLabel: "Payments",
      state: readyState,
      columns,
      getRowKey: (row) => row.id,
      rowHeaderColumnId: "member",
      sort: null,
      onSortChange: () => {},
    });
  });

  it("requires exactly one stable name and one existing row-header id", () => {
    // @ts-expect-error a visible caption and aria-label cannot override one another
    acceptPaymentTable({
      caption: "Payments",
      accessibilityLabel: "Payment table",
      state: readyState,
      columns,
      getRowKey: (row) => row.id,
      rowHeaderColumnId: "member",
      sort: null,
      onSortChange: () => {},
    });
    // @ts-expect-error every table needs either caption or accessibilityLabel
    acceptPaymentTable({
      state: readyState,
      columns,
      getRowKey: (row) => row.id,
      rowHeaderColumnId: "member",
      sort: null,
      onSortChange: () => {},
    });
    acceptPaymentTable({
      caption: "Payments",
      state: readyState,
      columns,
      getRowKey: (row) => row.id,
      // @ts-expect-error NoInfer keeps a typo from widening the inferred column-id union
      rowHeaderColumnId: "status",
      sort: null,
      onSortChange: () => {},
    });
  });

  it("keeps headers visible strings and requires text extraction for every column", () => {
    void ({
      id: "member",
      // @ts-expect-error header is a required visible string, never a custom node
      header: <View />,
      getTextValue: ({ row }: { row: Payment }) => row.member,
    } satisfies DataTableColumn<Payment, "member", string>);
    void ({
      id: "member",
      header: "Member",
      // @ts-expect-error a renderHeader escape hatch is intentionally absent in v1
      renderHeader: () => <Text>Member</Text>,
      getTextValue: ({ row }: { row: Payment }) => row.member,
    } satisfies DataTableColumn<Payment, "member", string>);
    // @ts-expect-error native/list accessibility requires a scalar getTextValue
    void ({ id: "member", header: "Member" } satisfies DataTableColumn<
      Payment,
      "member",
      string
    >);
    void ({
      id: "member",
      header: "Member",
      getTextValue: ({ row }: { row: Payment }) => row.member,
      // @ts-expect-error rich cells must return one cross-platform React element
      renderCell: () => null,
    } satisfies DataTableColumn<Payment, "member", string>);
    void ({
      id: "member",
      header: "Member",
      getTextValue: ({ row }: { row: Payment }) => row.member,
      // @ts-expect-error raw text must use getTextValue/default rendering, not renderCell
      renderCell: () => "Ada",
    } satisfies DataTableColumn<Payment, "member", string>);
  });

  it("makes fixed width and relative flex mutually exclusive", () => {
    void ({
      id: "member",
      header: "Member",
      width: 140,
      getTextValue: ({ row }: { row: Payment }) => row.member,
    } satisfies DataTableColumn<Payment, "member", string>);
    void ({
      id: "member",
      header: "Member",
      flex: 2,
      getTextValue: ({ row }: { row: Payment }) => row.member,
    } satisfies DataTableColumn<Payment, "member", string>);
    void ({
      id: "member",
      header: "Member",
      width: 140,
      flex: 2,
      getTextValue: ({ row }: { row: Payment }) => row.member,
      // @ts-expect-error a column cannot be both fixed-width and flexible
    } satisfies DataTableColumn<Payment, "member", string>);
    void ({
      id: "member",
      header: "Member",
      firstSortDirection: "ascending",
      getTextValue: ({ row }: { row: Payment }) => row.member,
      // @ts-expect-error firstSortDirection only exists on an explicitly sortable column
    } satisfies DataTableColumn<Payment, "member", string>);
  });
});

describe("DataTable controlled sorting and selection contracts", () => {
  it("infers only columns explicitly marked sortable at the component call", () => {
    void (
      <SourceDataTable
        accessibilityLabel="Inferred payments"
        state={readyState}
        columns={inferredColumns}
        getRowKey={(row) => row.id}
        rowHeaderColumnId="member"
        sort={{ columnId: "amount", direction: "descending" }}
        onSortChange={(sort, details) => {
          expectTypeOf(sort).toEqualTypeOf<DataTableSort<
            "member" | "amount"
          > | null>();
          expectTypeOf(details).toEqualTypeOf<
            DataTableSortChangeDetails<"member" | "amount">
          >();
        }}
      />
    );

    void (
      <SourceDataTable
        accessibilityLabel="Invalid inferred sort"
        state={readyState}
        columns={inferredColumns}
        getRowKey={(row) => row.id}
        rowHeaderColumnId="member"
        // @ts-expect-error status exists, but is intentionally not sortable
        sort={{ columnId: "status", direction: "ascending" }}
        onSortChange={() => {}}
      />
    );
  });

  it("requires the controlled sort pair and refuses non-column ids", () => {
    // @ts-expect-error sort and onSortChange are a controlled pair
    acceptPaymentTable({
      caption: "Payments",
      state: readyState,
      columns,
      getRowKey: (row) => row.id,
      rowHeaderColumnId: "member",
      sort: null,
    });
    // @ts-expect-error onSortChange cannot exist without a controlled sort value
    acceptPaymentTable({
      caption: "Payments",
      state: readyState,
      columns,
      getRowKey: (row) => row.id,
      rowHeaderColumnId: "member",
      onSortChange: () => {},
    });
    acceptPaymentTable({
      caption: "Payments",
      state: readyState,
      columns,
      getRowKey: (row) => row.id,
      rowHeaderColumnId: "member",
      // @ts-expect-error NoInfer rejects a sort id that is absent from columns
      sort: { columnId: "status", direction: "ascending" },
      onSortChange: () => {},
    });
    acceptPaymentTable({
      caption: "Payments",
      state: readyState,
      columns,
      getRowKey: (row) => row.id,
      rowHeaderColumnId: "member",
      // @ts-expect-error directions intentionally use ARIA-aligned names
      sort: { columnId: "member", direction: "asc" },
      onSortChange: () => {},
    });
  });

  it("keeps row keys stable and selection keys in the declared key domain", () => {
    acceptPaymentTable({
      accessibilityLabel: "Payments",
      state: readyState,
      columns,
      // @ts-expect-error getRowKey must return the declared stable row-key type
      getRowKey: (_row, index) => index,
      rowHeaderColumnId: "member",
      sort: null,
      onSortChange: () => {},
    });
    acceptPaymentTable({
      accessibilityLabel: "Payments",
      state: readyState,
      columns,
      getRowKey: (row) => row.id,
      rowHeaderColumnId: "member",
      sort: null,
      onSortChange: () => {},
      selection: {
        // @ts-expect-error selectedRowKeys cannot widen the declared string row-key domain
        selectedRowKeys: [1],
        onSelectionChange: () => {},
        getRowSelectionAccessibilityLabel: ({ row }) => `Select ${row.member}`,
      },
    });
  });
});

describe("DataTable state and adaptive-presentation unions", () => {
  it("separates loading, error, ready, and stale-data refreshing states", () => {
    const states: PaymentTableProps["state"][] = [
      { status: "loading", skeletonRowCount: 5 },
      { status: "loading", loadingState: <View /> },
      { status: "error", errorState: <View /> },
      { status: "ready", rows: payments, emptyState: <View /> },
      {
        status: "refreshing",
        rows: payments,
        refreshingAccessibilityLabel: "Refreshing payments",
      },
    ];
    expectTypeOf(states).toEqualTypeOf<PaymentTableProps["state"][]>();

    void ({
      status: "loading",
      rows: payments,
      // @ts-expect-error loading cannot simultaneously claim ready rows
    } satisfies PaymentTableProps["state"]);
    void ({
      status: "error",
      errorState: <View />,
      emptyState: <View />,
      // @ts-expect-error error and empty are mutually exclusive
    } satisfies PaymentTableProps["state"]);
    void ({
      status: "ready",
      rows: payments,
      errorState: <View />,
      // @ts-expect-error ready rows cannot also render an error state
    } satisfies PaymentTableProps["state"]);
    void ({
      status: "refreshing",
      rows: payments,
      emptyState: <View />,
      // @ts-expect-error refreshing preserves rows and never replaces them with empty state
    } satisfies PaymentTableProps["state"]);
  });

  it("requires an explicit renderer for list and auto while table forbids one", () => {
    acceptPaymentTable({
      accessibilityLabel: "Payment list",
      state: readyState,
      columns,
      getRowKey: (row) => row.id,
      rowHeaderColumnId: "member",
      presentation: "list",
      renderListRow: (context) => {
        expectTypeOf(context).toEqualTypeOf<
          DataTableListRowContext<Payment, string, PaymentColumnId>
        >();
        return <View />;
      },
      sort: null,
      onSortChange: () => {},
    });
    acceptPaymentTable({
      accessibilityLabel: "Adaptive payments",
      state: readyState,
      columns,
      getRowKey: (row) => row.id,
      rowHeaderColumnId: "member",
      presentation: "auto",
      renderListRow: () => <View />,
      sort: null,
      onSortChange: () => {},
    });

    // @ts-expect-error list presentation cannot silently invent a compact row
    acceptPaymentTable({
      accessibilityLabel: "Payment list",
      state: readyState,
      columns,
      getRowKey: (row) => row.id,
      rowHeaderColumnId: "member",
      presentation: "list",
      sort: null,
      onSortChange: () => {},
    });
    // @ts-expect-error auto presentation also requires the application-owned compact row
    acceptPaymentTable({
      accessibilityLabel: "Adaptive payments",
      state: readyState,
      columns,
      getRowKey: (row) => row.id,
      rowHeaderColumnId: "member",
      presentation: "auto",
      sort: null,
      onSortChange: () => {},
    });
    // @ts-expect-error semantic table mode never accepts a list renderer
    acceptPaymentTable({
      accessibilityLabel: "Payments",
      state: readyState,
      columns,
      getRowKey: (row) => row.id,
      rowHeaderColumnId: "member",
      presentation: "table",
      renderListRow: () => <View />,
      sort: null,
      onSortChange: () => {},
    });
  });

  it("rejects styling and data-engine escape hatches outside the contract", () => {
    acceptPaymentTable({
      accessibilityLabel: "Payments",
      state: readyState,
      columns,
      getRowKey: (row) => row.id,
      rowHeaderColumnId: "member",
      sort: null,
      onSortChange: () => {},
      // @ts-expect-error token styling cannot be removed
      unstyled: true,
    });
    acceptPaymentTable({
      accessibilityLabel: "Payments",
      state: readyState,
      columns,
      getRowKey: (row) => row.id,
      rowHeaderColumnId: "member",
      sort: null,
      onSortChange: () => {},
      // @ts-expect-error pagination remains an application boundary
      pageSize: 50,
    });
    acceptPaymentTable({
      accessibilityLabel: "Payments",
      state: readyState,
      columns,
      getRowKey: (row) => row.id,
      rowHeaderColumnId: "member",
      sort: null,
      onSortChange: () => {},
      // @ts-expect-error virtualization remains a future DataGrid/adapter concern
      virtualized: true,
    });
  });
});
