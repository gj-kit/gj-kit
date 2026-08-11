import { useState } from "react";
import type { ReactElement } from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Text, View } from "react-native";
import { DataTable as NativeDataTable } from "../../src/components/data-table.native";
import { DataTable } from "../../src/components/data-table.web";
import type {
  DataTableColumn,
  DataTableListRowContext,
  DataTableProps,
  DataTableSort,
} from "../../src/components/data-table.types";
import { UiProvider } from "../../src/components/provider";
import { koStrings } from "../../src/strings/strings";

type Payment = {
  readonly id: string;
  readonly member: string;
  readonly amount: number;
  readonly status: string;
  readonly locked: boolean;
};

type ColumnId = "member" | "amount" | "status";
type SortableColumnId = "member" | "amount";

const rows: readonly Payment[] = [
  {
    id: "payment-a",
    member: "Ada",
    amount: 12_000,
    status: "Paid",
    locked: false,
  },
  {
    id: "payment-b",
    member: "Grace",
    amount: 24_000,
    status: "Pending",
    locked: false,
  },
  {
    id: "payment-c",
    member: "Linus",
    amount: 36_000,
    status: "Failed",
    locked: true,
  },
];

const columns = [
  {
    id: "member",
    header: "Member",
    flex: 2,
    getTextValue: ({ row }) => row.member,
  },
  {
    id: "amount",
    header: "Amount",
    width: 120,
    align: "end",
    getTextValue: ({ row }) => String(row.amount),
    renderCell: ({ textValue }) => (
      <Text testID={`amount-${textValue}`}>₩{textValue}</Text>
    ),
  },
  {
    id: "status",
    header: "Status",
    flex: 1,
    getTextValue: ({ row }) => row.status,
  },
] as const satisfies readonly DataTableColumn<Payment, ColumnId, string>[];

const sortableColumns = [
  { ...columns[0], sortable: true as const },
  {
    ...columns[1],
    sortable: true as const,
    firstSortDirection: "descending" as const,
  },
  columns[2],
] as const satisfies readonly DataTableColumn<Payment, ColumnId, string>[];

type Props = DataTableProps<Payment, ColumnId, string>;

function Providers({ children }: { readonly children: ReactElement }) {
  return <UiProvider>{children}</UiProvider>;
}

function readyState(readyRows: readonly Payment[] = rows): Props["state"] {
  return { status: "ready", rows: readyRows };
}

function baseProps(): Props {
  return {
    caption: "Recent payments",
    description: "Most recent billing attempts.",
    state: readyState(),
    columns,
    getRowKey: (row) => row.id,
    rowHeaderColumnId: "member",
  };
}

function renderTable(overrides: Record<string, unknown> = {}) {
  const props = { ...baseProps(), ...overrides } as Props;
  return render(
    <Providers>
      <DataTable {...props} />
    </Providers>
  );
}

function renderNativeTable(overrides: Record<string, unknown> = {}) {
  const props = { ...baseProps(), testID: "orders", ...overrides } as Props;
  return render(
    <Providers>
      <NativeDataTable {...props} />
    </Providers>
  );
}

function setViewportWidth(width: number): () => void {
  const descriptor = Object.getOwnPropertyDescriptor(
    document.documentElement,
    "clientWidth"
  );
  Object.defineProperty(document.documentElement, "clientWidth", {
    configurable: true,
    value: width,
  });
  window.dispatchEvent(new Event("resize"));
  return () => {
    if (descriptor === undefined) {
      delete (document.documentElement as unknown as { clientWidth?: number })
        .clientWidth;
    } else {
      Object.defineProperty(
        document.documentElement,
        "clientWidth",
        descriptor
      );
    }
    window.dispatchEvent(new Event("resize"));
  };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("DataTable web semantic table", () => {
  it("emits one exact table/caption/thead/tbody tree with column and row headers", () => {
    renderTable();

    const table = screen.getByRole("table", { name: "Recent payments" });
    const scrollRegion = table.parentElement;
    expect(scrollRegion?.getAttribute("role")).toBe("region");
    expect(scrollRegion?.getAttribute("aria-label")).toBe("Recent payments");
    expect(scrollRegion?.getAttribute("tabindex")).toBe("0");
    expect(table.tagName).toBe("TABLE");
    expect(table.children).toHaveLength(4);
    expect(Array.from(table.children, (child) => child.tagName)).toEqual([
      "CAPTION",
      "COLGROUP",
      "THEAD",
      "TBODY",
    ]);
    expect(table.querySelector(":scope > caption")?.textContent).toBe(
      "Recent payments"
    );
    expect(table.querySelectorAll(":scope > colgroup > col")).toHaveLength(
      columns.length
    );
    expect(table.querySelectorAll(":scope > thead > tr")).toHaveLength(1);
    expect(table.querySelectorAll(":scope > tbody > tr")).toHaveLength(3);

    const columnHeaders = within(table).getAllByRole("columnheader");
    expect(columnHeaders.map((header) => header.textContent)).toEqual([
      "Member",
      "Amount",
      "Status",
    ]);
    expect(columnHeaders.every((header) => header.tagName === "TH")).toBe(true);
    expect(
      columnHeaders.every((header) => header.getAttribute("scope") === "col")
    ).toBe(true);

    const rowHeaders = within(table).getAllByRole("rowheader");
    expect(rowHeaders.map((header) => header.textContent)).toEqual([
      "Ada",
      "Grace",
      "Linus",
    ]);
    expect(rowHeaders.every((header) => header.tagName === "TH")).toBe(true);
    expect(
      rowHeaders.every((header) => header.getAttribute("scope") === "row")
    ).toBe(true);
    expect(table.querySelectorAll("tbody td")).toHaveLength(6);
    expect(screen.getByTestId("amount-12000").textContent).toBe("₩12000");
    expect(table.getAttribute("aria-describedby")).toBeTruthy();
    expect(screen.getByText("Most recent billing attempts.").id).toBe(
      table.getAttribute("aria-describedby")
    );
  });

  it("uses accessibilityLabel instead of creating a hidden or duplicate caption", () => {
    renderTable({ caption: undefined, accessibilityLabel: "Payment results" });
    const table = screen.getByRole("table", { name: "Payment results" });
    expect(table.getAttribute("aria-label")).toBe("Payment results");
    expect(table.querySelector("caption")).toBeNull();
  });

  it("never turns a body row into a row-wide button", () => {
    renderTable();
    const table = screen.getByRole("table");
    const bodyRows = Array.from(table.querySelectorAll("tbody tr"));
    expect(bodyRows).toHaveLength(rows.length);
    for (const row of bodyRows) {
      expect(row.matches('button, [role="button"]')).toBe(false);
      expect(row.getAttribute("tabindex")).toBeNull();
      expect(row.querySelector('button, [role="button"]')).toBeNull();
    }
  });
});

function SortHarness({
  onSortChange,
}: {
  readonly onSortChange: (
    sort: DataTableSort<SortableColumnId> | null,
    previous: DataTableSort<SortableColumnId> | null
  ) => void;
}) {
  const [sort, setSort] = useState<DataTableSort<SortableColumnId> | null>(
    null
  );
  return (
    <Providers>
      <DataTable
        accessibilityLabel="Sortable payments"
        state={readyState()}
        columns={sortableColumns}
        getRowKey={(row) => row.id}
        rowHeaderColumnId="member"
        sort={sort}
        onSortChange={(next, details) => {
          onSortChange(next, details.previous);
          setSort(next);
        }}
      />
    </Providers>
  );
}

describe("DataTable controlled sorting", () => {
  it("cycles ascending → descending → null on the th and never reorders supplied rows", () => {
    const onSortChange = vi.fn();
    render(<SortHarness onSortChange={onSortChange} />);

    const memberSort = screen.getByRole("button", { name: "Member" });
    const memberHeader = memberSort.closest("th");
    expect(memberHeader?.getAttribute("aria-sort")).toBeNull();

    fireEvent.click(memberSort);
    expect(memberHeader?.getAttribute("aria-sort")).toBe("ascending");
    expect(onSortChange).toHaveBeenNthCalledWith(
      1,
      { columnId: "member", direction: "ascending" },
      null
    );

    fireEvent.click(memberSort);
    expect(memberHeader?.getAttribute("aria-sort")).toBe("descending");
    expect(onSortChange).toHaveBeenNthCalledWith(
      2,
      { columnId: "member", direction: "descending" },
      { columnId: "member", direction: "ascending" }
    );

    fireEvent.click(memberSort);
    expect(memberHeader?.getAttribute("aria-sort")).toBeNull();
    expect(onSortChange).toHaveBeenNthCalledWith(3, null, {
      columnId: "member",
      direction: "descending",
    });
    expect(
      screen.getAllByRole("rowheader").map((header) => header.textContent)
    ).toEqual(["Ada", "Grace", "Linus"]);
  });

  it("honors a descending-first column without placing aria-sort on the nested button", () => {
    const onSortChange = vi.fn();
    render(<SortHarness onSortChange={onSortChange} />);
    const amountSort = screen.getByRole("button", { name: "Amount" });
    fireEvent.click(amountSort);
    expect(amountSort.getAttribute("aria-sort")).toBeNull();
    expect(amountSort.closest("th")?.getAttribute("aria-sort")).toBe(
      "descending"
    );
    expect(onSortChange).toHaveBeenCalledWith(
      { columnId: "amount", direction: "descending" },
      null
    );
  });
});

function selectionProps(
  selectedRowKeys: readonly string[],
  onSelectionChange: ReturnType<typeof vi.fn>
): NonNullable<Props["selection"]> {
  return {
    selectedRowKeys,
    onSelectionChange,
    getRowSelectionAccessibilityLabel: ({ row }) =>
      `Select payment for ${row.member}`,
    isRowSelectionDisabled: ({ row }) => row.locked,
    selectAllAccessibilityLabel: "Select visible payments",
    clearSelectionAccessibilityLabel: "Clear visible payments",
  };
}

describe("DataTable visible-page multiple selection", () => {
  it("exposes mixed select-all, row labels, and preserves off-page and disabled keys", () => {
    const onSelectionChange = vi.fn();
    const selected = ["off-page-payment", "payment-a", "payment-c"] as const;
    const { rerender } = render(
      <Providers>
        <DataTable
          {...baseProps()}
          selection={selectionProps(selected, onSelectionChange)}
        />
      </Providers>
    );

    const mixed = screen.getByRole("checkbox", {
      name: "Select visible payments",
    });
    expect(mixed.getAttribute("aria-checked")).toBe("mixed");
    expect(
      screen
        .getByRole("checkbox", { name: "Select payment for Ada" })
        .getAttribute("aria-checked")
    ).toBe("true");
    expect(
      screen
        .getByRole("checkbox", { name: "Select payment for Grace" })
        .getAttribute("aria-checked")
    ).toBe("false");
    expect(
      screen
        .getByRole("checkbox", { name: "Select payment for Linus" })
        .getAttribute("aria-disabled")
    ).toBe("true");

    fireEvent.click(mixed);
    expect(onSelectionChange).toHaveBeenLastCalledWith(
      ["off-page-payment", "payment-a", "payment-c", "payment-b"],
      expect.objectContaining({
        reason: "page-toggle",
        scope: "visible",
        affectedRowKeys: ["payment-b"],
        selected: true,
      })
    );

    rerender(
      <Providers>
        <DataTable
          {...baseProps()}
          selection={selectionProps(
            ["off-page-payment", "payment-a", "payment-b", "payment-c"],
            onSelectionChange
          )}
        />
      </Providers>
    );
    const all = screen.getByRole("checkbox", {
      name: "Clear visible payments",
    });
    expect(all.getAttribute("aria-checked")).toBe("true");
    fireEvent.click(all);
    expect(onSelectionChange).toHaveBeenLastCalledWith(
      ["off-page-payment", "payment-c"],
      expect.objectContaining({
        reason: "page-toggle",
        affectedRowKeys: ["payment-a", "payment-b"],
        selected: false,
      })
    );
  });

  it("toggles an enabled row without affecting any other selected key", () => {
    const onSelectionChange = vi.fn();
    renderTable({
      selection: selectionProps(
        ["off-page-payment", "payment-a"],
        onSelectionChange
      ),
    });
    fireEvent.click(
      screen.getByRole("checkbox", { name: "Select payment for Grace" })
    );
    expect(onSelectionChange).toHaveBeenCalledWith(
      ["off-page-payment", "payment-a", "payment-b"],
      expect.objectContaining({
        reason: "row-toggle",
        rowKey: "payment-b",
        selected: true,
      })
    );
  });
});

describe("DataTable loading/error/ready/refreshing state rendering", () => {
  it("keeps loading and error inside a spanning tbody row without leaking data rows", () => {
    const { rerender } = render(
      <Providers>
        <DataTable
          {...baseProps()}
          state={{ status: "loading", skeletonRowCount: 3 }}
        />
      </Providers>
    );
    let table = screen.getByRole("table");
    expect(table.getAttribute("aria-busy")).toBe("true");
    expect(within(table).getByRole("status", { name: "Loading" })).toBeTruthy();
    expect(table.querySelectorAll("tbody tr")).toHaveLength(1);
    expect(table.querySelector("tbody td")?.getAttribute("colspan")).toBe("3");
    expect(within(table).queryAllByRole("rowheader")).toHaveLength(0);

    rerender(
      <Providers>
        <DataTable
          {...baseProps()}
          state={{
            status: "error",
            errorState: (
              <View testID="custom-error">
                <Text>Offline</Text>
              </View>
            ),
          }}
        />
      </Providers>
    );
    table = screen.getByRole("table");
    expect(table.getAttribute("aria-busy")).toBe("false");
    expect(screen.getByTestId("custom-error").textContent).toBe("Offline");
    expect(table.querySelectorAll("tbody tr")).toHaveLength(1);
    expect(within(table).queryAllByRole("rowheader")).toHaveLength(0);
  });

  it("renders ready-empty alone and retains stale rows with a polite refreshing status", () => {
    const { rerender } = render(
      <Providers>
        <DataTable
          {...baseProps()}
          state={{
            status: "ready",
            rows: [],
            emptyState: (
              <View testID="custom-empty">
                <Text>No payments</Text>
              </View>
            ),
          }}
        />
      </Providers>
    );
    expect(screen.getByTestId("custom-empty").textContent).toBe("No payments");
    expect(screen.queryByTestId("custom-error")).toBeNull();

    rerender(
      <Providers>
        <DataTable
          {...baseProps()}
          state={{
            status: "refreshing",
            rows,
            refreshingAccessibilityLabel: "Refreshing payments",
          }}
        />
      </Providers>
    );
    const table = screen.getByRole("table");
    expect(table.getAttribute("aria-busy")).toBe("true");
    expect(
      screen.getByRole("status", { name: "Refreshing payments" })
    ).toBeTruthy();
    expect(
      within(table)
        .getAllByRole("rowheader")
        .map((header) => header.textContent)
    ).toEqual(["Ada", "Grace", "Linus"]);
    expect(screen.queryByTestId("custom-empty")).toBeNull();
  });
});

describe("DataTable explicit list and adaptive web presentation", () => {
  it("renders a real list/listitem tree and passes complete, selected row contexts", () => {
    const contexts: DataTableListRowContext<Payment, string, ColumnId>[] = [];
    renderTable({
      caption: undefined,
      accessibilityLabel: "Compact payments",
      presentation: "list",
      selection: selectionProps(["payment-a"], vi.fn()),
      renderListRow: (
        context: DataTableListRowContext<Payment, string, ColumnId>
      ) => {
        contexts.push(context);
        return (
          <View testID={`compact-${context.rowKey}`}>
            <Text>
              {context.cells
                .map((cell) => `${cell.header}: ${cell.textValue}`)
                .join(" · ")}
            </Text>
          </View>
        );
      },
    });

    const list = screen.getByRole("list", { name: "Compact payments" });
    expect(list.tagName).not.toBe("TABLE");
    expect(within(list).getAllByRole("listitem")).toHaveLength(3);
    expect(screen.queryByRole("table")).toBeNull();
    expect(contexts).toHaveLength(3);
    expect(contexts[0]).toMatchObject({
      rowKey: "payment-a",
      rowIndex: 0,
      selected: true,
      selectionDisabled: false,
      presentation: "list",
    });
    expect(contexts[2]).toMatchObject({
      rowKey: "payment-c",
      selected: false,
      selectionDisabled: true,
    });
    expect(contexts[0]?.cells).toEqual([
      {
        columnId: "member",
        header: "Member",
        textValue: "Ada",
        align: "start",
      },
      {
        columnId: "amount",
        header: "Amount",
        textValue: "12000",
        align: "end",
      },
      {
        columnId: "status",
        header: "Status",
        textValue: "Paid",
        align: "start",
      },
    ]);
  });

  it("keeps auto as a semantic web table and never calls its compact renderer", () => {
    const renderListRow = vi.fn(() => <View />);
    renderTable({ presentation: "auto", renderListRow });
    expect(screen.getByRole("table", { name: "Recent payments" })).toBeTruthy();
    expect(screen.queryByRole("list")).toBeNull();
    expect(renderListRow).not.toHaveBeenCalled();
  });

  it("rejects a list renderer that fails to return one valid React element", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() =>
      renderTable({
        presentation: "list",
        renderListRow: () => null,
      })
    ).toThrow("DataTable renderListRow must return one valid React element.");
    error.mockRestore();
  });
});

describe("DataTable validation and styling hooks", () => {
  it("fails duplicate/invalid row identities before emitting misleading table content", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() =>
      renderTable({
        getRowKey: () => "duplicate",
      })
    ).toThrow("DataTable row keys must be unique");
    expect(() =>
      renderTable({
        getRowKey: () => "   ",
      })
    ).toThrow(
      "DataTable row key at index 0 must be a finite number or nonblank string"
    );
    error.mockRestore();
  });

  it("validates names, column ids/headers/text, row-header references, and dimensions", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => renderTable({ caption: "  " })).toThrow(
      "DataTable caption must be a nonblank string"
    );
    expect(() => renderTable({ rowHeaderColumnId: "missing" })).toThrow(
      "DataTable rowHeaderColumnId must reference an existing column"
    );
    expect(() => renderTable({ columns: [columns[0], columns[0]] })).toThrow(
      "DataTable column ids must be unique"
    );
    expect(() =>
      renderTable({
        columns: [{ ...columns[0], header: "" }],
      })
    ).toThrow("header must be a nonblank string");
    expect(() =>
      renderTable({
        columns: [{ ...columns[0], getTextValue: () => "" }],
      })
    ).toThrow(
      'text value for row "payment-a" and column "member" must be a nonblank string'
    );
    expect(() =>
      renderTable({ minTableWidth: Number.POSITIVE_INFINITY })
    ).toThrow("DataTable minTableWidth must be a finite number greater than 0");
    error.mockRestore();
  });

  it.each([
    [
      "caption/accessibilityLabel XOR",
      { accessibilityLabel: "Overriding name" },
      "DataTable requires exactly one of caption or accessibilityLabel.",
    ],
    [
      "width/flex XOR",
      {
        columns: [
          { ...columns[0], width: 140, flex: 2 },
          columns[1],
          columns[2],
        ],
      },
      'DataTable column "member" cannot define both width and flex.',
    ],
    [
      "unstyled escape hatch",
      { unstyled: true },
      "DataTable does not support unstyled.",
    ],
    [
      "sort without onSortChange",
      { columns: sortableColumns, sort: null },
      "DataTable sortable columns require controlled sort and onSortChange props.",
    ],
    [
      "onSortChange without sort",
      { columns: sortableColumns, onSortChange: vi.fn() },
      "DataTable sortable columns require controlled sort and onSortChange props.",
    ],
    [
      "invalid sort direction",
      {
        columns: sortableColumns,
        sort: { columnId: "member", direction: "up" },
        onSortChange: vi.fn(),
      },
      'DataTable sort.direction must be "ascending" or "descending".',
    ],
    [
      "blank refreshing label",
      {
        state: {
          status: "refreshing",
          rows,
          refreshingAccessibilityLabel: "   ",
        },
      },
      "DataTable refreshingAccessibilityLabel must be a nonblank string.",
    ],
    [
      "empty list without renderer",
      { presentation: "list", state: { status: "ready", rows: [] } },
      "DataTable list and auto presentations require renderListRow.",
    ],
    [
      "auto without renderer",
      { presentation: "auto" },
      "DataTable list and auto presentations require renderListRow.",
    ],
  ] satisfies readonly (readonly [string, Record<string, unknown>, string])[])(
    "rejects invalid JS-boundary contracts: %s",
    (_label, overrides, message) => {
      const error = vi.spyOn(console, "error").mockImplementation(() => {});
      expect(() => renderTable(overrides)).toThrow(message);
      error.mockRestore();
    }
  );

  it.each([
    ["size", { size: "xl" }, 'DataTable size must be "sm", "md", or "lg".'],
    [
      "variant",
      { variant: "ghost" },
      'DataTable variant must be "line" or "outline".',
    ],
    [
      "presentation",
      { presentation: "cards" },
      'DataTable presentation must be "table", "list", or "auto".',
    ],
    [
      "column alignment",
      {
        columns: [{ ...columns[0], align: "justify" }, columns[1], columns[2]],
      },
      'DataTable column "member" align must be "start", "center", or "end".',
    ],
    [
      "first sort direction",
      {
        columns: [
          {
            ...columns[0],
            sortable: true,
            firstSortDirection: "up",
          },
          columns[1],
          columns[2],
        ],
        sort: null,
        onSortChange: vi.fn(),
      },
      'DataTable column "member" firstSortDirection must be "ascending" or "descending".',
    ],
  ] satisfies readonly (readonly [string, Record<string, unknown>, string])[])(
    "rejects invalid runtime enum values: %s",
    (_label, overrides, message) => {
      const error = vi.spyOn(console, "error").mockImplementation(() => {});
      expect(() => renderTable(overrides)).toThrow(message);
      error.mockRestore();
    }
  );

  it.each([
    ["web", renderTable],
    ["native", renderNativeTable],
  ] satisfies readonly (readonly [string, (overrides: Record<string, unknown>) => ReturnType<typeof render>])[])(
    "%s evaluates each consumer identity, value, and selection callback exactly once",
    (_platform, renderProbe) => {
      const getRowKey = vi.fn((row: Payment) => row.id);
      const memberValue = vi.fn(
        ({ row }: { readonly row: Payment }) => row.member
      );
      const amountValue = vi.fn(({ row }: { readonly row: Payment }) =>
        String(row.amount)
      );
      const statusValue = vi.fn(
        ({ row }: { readonly row: Payment }) => row.status
      );
      const getSelectionLabel = vi.fn(
        ({ row }: { readonly row: Payment }) => `Select ${row.member}`
      );
      const isSelectionDisabled = vi.fn(
        ({ row }: { readonly row: Payment }) => row.locked
      );
      const probedColumns = [
        { ...columns[0], getTextValue: memberValue },
        { ...columns[1], getTextValue: amountValue },
        { ...columns[2], getTextValue: statusValue },
      ] as const satisfies readonly DataTableColumn<
        Payment,
        ColumnId,
        string
      >[];

      renderProbe({
        columns: probedColumns,
        getRowKey,
        selection: {
          selectedRowKeys: [],
          onSelectionChange: vi.fn(),
          getRowSelectionAccessibilityLabel: getSelectionLabel,
          isRowSelectionDisabled: isSelectionDisabled,
        },
      });

      expect(getRowKey).toHaveBeenCalledTimes(rows.length);
      expect(memberValue).toHaveBeenCalledTimes(rows.length);
      expect(amountValue).toHaveBeenCalledTimes(rows.length);
      expect(statusValue).toHaveBeenCalledTimes(rows.length);
      expect(getSelectionLabel).toHaveBeenCalledTimes(rows.length);
      expect(isSelectionDisabled).toHaveBeenCalledTimes(rows.length);
    }
  );

  it.each([
    ["web", renderTable],
    ["native", renderNativeTable],
  ] satisfies readonly (readonly [string, (overrides: Record<string, unknown>) => ReturnType<typeof render>])[])(
    "%s rejects a primitive rich-cell result at the JS boundary",
    (_platform, renderProbe) => {
      const error = vi.spyOn(console, "error").mockImplementation(() => {});
      expect(() =>
        renderProbe({
          columns: [
            {
              ...columns[0],
              renderCell: () => "Ada",
            },
          ],
          rowHeaderColumnId: "member",
        })
      ).toThrow("DataTable renderCell must return one valid React element.");
      error.mockRestore();
    }
  );

  it.each([
    ["web", renderTable],
    ["native", renderNativeTable],
  ] satisfies readonly (readonly [string, (overrides: Record<string, unknown>) => ReturnType<typeof render>])[])(
    "%s namespaces mixed row identities and internal selection keys for React",
    (_platform, renderProbe) => {
      const error = vi.spyOn(console, "error").mockImplementation(() => {});
      const mixedIdentityRows = [
        { ...rows[0]!, id: 1 as unknown as string },
        { ...rows[1]!, id: "1" },
      ] as const;
      const internalNameColumn = [
        {
          id: "__selection",
          header: "Identity",
          flex: 1,
          getTextValue: ({ row }: { readonly row: Payment }) => row.member,
        },
      ] as const;

      renderProbe({
        state: readyState(mixedIdentityRows),
        columns: internalNameColumn,
        rowHeaderColumnId: "__selection",
        selection: selectionProps([], vi.fn()),
      });

      expect(error.mock.calls.flat().join(" ")).not.toMatch(
        /same key|duplicate key/i
      );
      error.mockRestore();
    }
  );

  it("forwards global and per-column style/class hooks without removing semantics", () => {
    const styledColumns = [
      {
        ...columns[0],
        headerClassName: "member-header",
        headerStyle: { opacity: 0.71, paddingVertical: 8 },
        headerTextClassName: "member-header-text",
        headerTextStyle: { fontSize: 17 },
        cellClassName: "member-cell",
        cellStyle: { opacity: 0.72, paddingHorizontal: 10 },
        cellTextClassName: "member-cell-text",
        cellTextStyle: { fontSize: 16 },
      },
      columns[1],
      columns[2],
    ] as const satisfies readonly DataTableColumn<Payment, ColumnId, string>[];
    renderTable({
      columns: styledColumns,
      testID: "styled-table",
      className: "table-root",
      style: { marginTop: 7 },
      captionClassName: "table-caption",
      captionStyle: { opacity: 0.73, lineHeight: 24 },
      descriptionClassName: "table-description",
      descriptionStyle: { opacity: 0.74 },
      headerCellClassName: "all-headers",
      headerCellStyle: { minHeight: 41, paddingHorizontal: 9 },
      cellClassName: "all-cells",
      cellStyle: { minHeight: 42, paddingVertical: 7 },
    });

    const root = screen.getByTestId("styled-table");
    expect(root.style.marginTop).toBe("7px");
    const caption = screen.getByText("Recent payments");
    expect(caption.tagName).toBe("CAPTION");
    expect(caption.classList.contains("table-caption")).toBe(true);
    expect(caption.style.opacity).toBe("0.73");
    expect(caption.style.lineHeight).toBe("24px");
    const description = screen.getByText("Most recent billing attempts.");
    expect(description.style.opacity).toBe("0.74");

    const memberHeader = screen.getByRole("columnheader", { name: "Member" });
    expect(memberHeader.classList.contains("all-headers")).toBe(true);
    expect(memberHeader.classList.contains("member-header")).toBe(true);
    expect(memberHeader.style.opacity).toBe("0.71");
    expect(memberHeader.style.minHeight).toBe("41px");
    expect(memberHeader.style.paddingLeft).toBe("9px");
    expect(memberHeader.style.paddingRight).toBe("9px");
    expect(memberHeader.style.paddingTop).toBe("8px");
    expect(memberHeader.style.paddingBottom).toBe("8px");
    const memberHeaderText = within(memberHeader).getByText("Member");
    expect(memberHeaderText.style.fontSize).toBe("17px");

    const memberCell = screen.getAllByRole("rowheader")[0] as HTMLElement;
    expect(memberCell.classList.contains("all-cells")).toBe(true);
    expect(memberCell.classList.contains("member-cell")).toBe(true);
    expect(memberCell.style.opacity).toBe("0.72");
    expect(memberCell.style.minHeight).toBe("42px");
    expect(memberCell.style.paddingLeft).toBe("10px");
    expect(memberCell.style.paddingRight).toBe("10px");
    expect(memberCell.style.paddingTop).toBe("7px");
    expect(memberCell.style.paddingBottom).toBe("7px");
    const memberCellText = within(memberCell).getByText("Ada");
    expect(memberCellText.style.fontSize).toBe("16px");
  });

  it("keeps start and end alignment logical inside an RTL ancestor", () => {
    render(
      <div dir="rtl">
        <Providers>
          <DataTable {...baseProps()} />
        </Providers>
      </div>
    );

    const memberHeader = screen.getByRole("columnheader", { name: "Member" });
    const amountHeader = screen.getByRole("columnheader", { name: "Amount" });
    expect(memberHeader.style.textAlign).toBe("start");
    expect(amountHeader.style.textAlign).toBe("end");
    expect(within(memberHeader).getByText("Member").style.textAlign).not.toBe(
      "left"
    );
    expect(within(amountHeader).getByText("Amount").style.textAlign).not.toBe(
      "right"
    );

    const memberCell = screen.getAllByRole("rowheader")[0] as HTMLElement;
    const amountCell = screen.getAllByTestId("amount-12000")[0]?.closest("td");
    expect(memberCell.style.textAlign).toBe("start");
    expect(amountCell?.style.textAlign).toBe("end");
  });

  it("allocates flex columns from the width remaining after fixed and selection columns", () => {
    renderTable({ selection: selectionProps([], vi.fn()) });

    const table = screen.getByRole("table", { name: "Recent payments" });
    const columnDefinitions = Array.from(
      table.querySelectorAll<HTMLTableColElement>(":scope > colgroup > col")
    );
    const memberHeader = screen.getByRole("columnheader", { name: "Member" });
    const amountHeader = screen.getByRole("columnheader", { name: "Amount" });
    const statusHeader = screen.getByRole("columnheader", { name: "Status" });
    expect(columnDefinitions).toHaveLength(4);
    expect(columnDefinitions[0]?.style.width).toBe("52px");
    expect(columnDefinitions[2]?.style.width).toBe("120px");
    expect(columnDefinitions[1]?.style.width).toMatch(/%$/);
    expect(columnDefinitions[3]?.style.width).toMatch(/%$/);
    expect(
      Number.parseFloat(columnDefinitions[1]?.style.width ?? "0") /
        Number.parseFloat(columnDefinitions[3]?.style.width ?? "1")
    ).toBeCloseTo(2, 5);
    expect(amountHeader.style.width).toBe("120px");
    expect(memberHeader.style.width).toMatch(/^calc\(/);
    expect(statusHeader.style.width).toMatch(/^calc\(/);
    expect(memberHeader.style.width).not.toBe("66.66666666666666%");
    expect(statusHeader.style.width).not.toBe("33.33333333333333%");
  });
});

describe("DataTable native presentation contracts", () => {
  it("uses a coherent native list structure for the wide visual table without fake cell roles", () => {
    renderNativeTable();

    const tableLikeList = screen.getByRole("list", { name: "Recent payments" });
    expect(tableLikeList).toBe(screen.getByTestId("orders-scroll"));
    expect(screen.getByTestId("orders-header")).toBeTruthy();
    expect(screen.getByTestId("orders-header-member").textContent).toContain(
      "Member"
    );
    expect(screen.getByTestId("orders-header-amount").textContent).toContain(
      "Amount"
    );
    expect(screen.getByTestId("orders-header-status").textContent).toContain(
      "Status"
    );

    const nativeRows = within(tableLikeList).getAllByRole("listitem");
    expect(nativeRows).toHaveLength(3);
    expect(nativeRows).toEqual([
      screen.getByTestId("orders-row-payment-a"),
      screen.getByTestId("orders-row-payment-b"),
      screen.getByTestId("orders-row-payment-c"),
    ]);
    expect(screen.getByTestId("orders-cell-payment-a-member").textContent).toBe(
      "Ada"
    );
    expect(screen.getByTestId("orders-cell-payment-a-amount").textContent).toBe(
      "₩12000"
    );
    expect(screen.getByTestId("orders-cell-payment-a-status").textContent).toBe(
      "Paid"
    );
    expect(
      within(screen.getByTestId("orders-cell-payment-a-amount")).getByLabelText(
        "Amount: 12000"
      )
    ).toBeTruthy();

    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.queryByRole("grid")).toBeNull();
    expect(screen.queryByRole("row")).toBeNull();
    expect(screen.queryByRole("cell")).toBeNull();
    expect(screen.queryByRole("gridcell")).toBeNull();
    expect(screen.queryByRole("rowheader")).toBeNull();
    expect(screen.queryByRole("columnheader")).toBeNull();
    for (const row of nativeRows) {
      expect(within(row).queryByRole("button")).toBeNull();
    }
  });

  it("uses a real compact list/listitem tree and supplies native list-row contexts", () => {
    const contexts: DataTableListRowContext<Payment, string, ColumnId>[] = [];
    renderNativeTable({
      caption: undefined,
      accessibilityLabel: "Compact native payments",
      presentation: "list",
      renderListRow: (
        context: DataTableListRowContext<Payment, string, ColumnId>
      ) => {
        contexts.push(context);
        return (
          <View testID={`native-compact-${context.rowKey}`}>
            <Text>
              {context.cells.map((cell) => cell.textValue).join(" · ")}
            </Text>
          </View>
        );
      },
    });

    const list = screen.getByRole("list", { name: "Compact native payments" });
    expect(list).toBe(screen.getByTestId("orders-scroll"));
    expect(within(list).getAllByRole("listitem")).toHaveLength(3);
    expect(screen.queryByTestId("orders-header")).toBeNull();
    expect(screen.getByTestId("native-compact-payment-a").textContent).toBe(
      "Ada · 12000 · Paid"
    );
    expect(contexts).toHaveLength(3);
    expect(contexts[0]).toMatchObject({
      rowKey: "payment-a",
      rowIndex: 0,
      selected: false,
      selectionDisabled: false,
      presentation: "list",
    });
    expect(contexts[0]?.cells).toEqual([
      {
        columnId: "member",
        header: "Member",
        textValue: "Ada",
        align: "start",
      },
      {
        columnId: "amount",
        header: "Amount",
        textValue: "12000",
        align: "end",
      },
      {
        columnId: "status",
        header: "Status",
        textValue: "Paid",
        align: "start",
      },
    ]);
    expect(screen.queryByRole("row")).toBeNull();
    expect(screen.queryByRole("cell")).toBeNull();
  });

  it("resolves auto to compact below tablet and the wide structure at tablet width", async () => {
    const restoreViewport = setViewportWidth(390);
    try {
      renderNativeTable({
        presentation: "auto",
        renderListRow: (
          context: DataTableListRowContext<Payment, string, ColumnId>
        ) => (
          <View testID={`native-auto-${context.rowKey}`}>
            <Text>{context.row.member}</Text>
          </View>
        ),
      });

      expect(screen.getByTestId("native-auto-payment-a")).toBeTruthy();
      expect(screen.queryByTestId("orders-header")).toBeNull();

      act(() => {
        Object.defineProperty(document.documentElement, "clientWidth", {
          configurable: true,
          value: 1_000,
        });
        window.dispatchEvent(new Event("resize"));
      });

      await waitFor(() =>
        expect(screen.getByTestId("orders-header")).toBeTruthy()
      );
      expect(screen.queryByTestId("native-auto-payment-a")).toBeNull();
      expect(screen.getByTestId("orders-row-payment-a")).toBeTruthy();
    } finally {
      cleanup();
      restoreViewport();
    }
  });

  it("keeps list sorting controlled and page selection changed-only with off-page keys preserved", () => {
    const onSortChange = vi.fn();
    const onSelectionChange = vi.fn();
    renderNativeTable({
      caption: undefined,
      accessibilityLabel: "Native selectable payments",
      columns: sortableColumns,
      presentation: "list",
      renderListRow: (
        context: DataTableListRowContext<Payment, string, ColumnId>
      ) => (
        <View testID={`native-selectable-${context.rowKey}`}>
          <Text>{context.row.member}</Text>
        </View>
      ),
      sort: null,
      onSortChange,
      selection: selectionProps(
        ["off-page-payment", "payment-a", "payment-c"],
        onSelectionChange
      ),
    });

    fireEvent.click(screen.getByRole("button", { name: "Member, not sorted" }));
    expect(onSortChange).toHaveBeenCalledWith(
      { columnId: "member", direction: "ascending" },
      expect.objectContaining({
        reason: "column-header-press",
        columnId: "member",
        previous: null,
      })
    );
    expect([
      screen.getByTestId("native-selectable-payment-a").textContent,
      screen.getByTestId("native-selectable-payment-b").textContent,
      screen.getByTestId("native-selectable-payment-c").textContent,
    ]).toEqual(["Ada", "Grace", "Linus"]);

    const mixed = screen.getByRole("checkbox", {
      name: "Select visible payments",
    });
    expect(mixed.getAttribute("aria-checked")).toBe("mixed");
    fireEvent.click(mixed);
    expect(onSelectionChange).toHaveBeenCalledWith(
      ["off-page-payment", "payment-a", "payment-c", "payment-b"],
      expect.objectContaining({
        reason: "page-toggle",
        scope: "visible",
        affectedRowKeys: ["payment-b"],
        selected: true,
      })
    );
  });

  it("localizes sortable table header names and values for inactive and active states", () => {
    const onSortChange = vi.fn();
    const props = {
      ...baseProps(),
      columns: sortableColumns,
      sort: null,
      onSortChange,
      testID: "localized-orders",
    } as DataTableProps<Payment, ColumnId, string>;
    const result = render(
      <UiProvider strings={koStrings}>
        <NativeDataTable {...props} />
      </UiProvider>
    );

    expect(
      screen.getByRole("button", { name: "Member, 정렬되지 않음" })
    ).toBeTruthy();

    result.rerender(
      <UiProvider strings={koStrings}>
        <NativeDataTable
          {...props}
          sort={{ columnId: "member", direction: "ascending" } as const}
        />
      </UiProvider>
    );
    expect(
      screen.getByRole("button", { name: "Member, 오름차순 정렬됨" })
    ).toBeTruthy();
  });

  it("rejects an invalid compact renderer before exposing a malformed native list row", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() =>
      renderNativeTable({
        presentation: "list",
        renderListRow: () => null,
      })
    ).toThrow("DataTable renderListRow must return one valid React element.");
    error.mockRestore();
  });
});
