/**
 * DataTable 활성 행 하이라이트(activeRow) + 행 단위 style hook(rowStyle) — 라운드 E §1.
 *
 * admin 콘솔은 행을 눌러 상세 Sheet를 열고 "지금 열려 있는 행"을 행 전체 wash +
 * 행 헤더 accent로 표시해야 했다(memorylog2 data-selected bleed 우회의 킷 이관).
 * 활성 행은 선택이 아니다 — 웹 <tr>/listitem은 aria-selected가 아니라
 * aria-current="true"를 받고, 네이티브는 시각 표현만 갖는다(어떤 레코드가
 * 열렸는지는 상세 표면이 보조기술에 전달한다).
 */
import type { ReactElement } from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Text, TextInput, View } from "react-native";
import { DataTable as NativeDataTable } from "../../src/components/data-table.native";
import { DataTable } from "../../src/components/data-table.web";
import type {
  DataTableColumn,
  DataTableListRowContext,
  DataTableProps,
  DataTableRowStyleContext,
} from "../../src/components/data-table.types";
import { UiProvider } from "../../src/components/provider";
import { lightTheme } from "../../src/theme/createTheme";

type Payment = {
  readonly id: string;
  readonly member: string;
  readonly amount: number;
};

type ColumnId = "member" | "amount";

const rows: readonly Payment[] = [
  { id: "payment-a", member: "Ada", amount: 12_000 },
  { id: "payment-b", member: "Grace", amount: 24_000 },
  { id: "payment-c", member: "Linus", amount: 36_000 },
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
  },
] as const satisfies readonly DataTableColumn<Payment, ColumnId, string>[];

type Props = DataTableProps<Payment, ColumnId, string>;

function hexToRgb(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgb(${r}, ${g}, ${b})`;
}

const primarySoft = hexToRgb(lightTheme.colors.primarySoft);
const primary = hexToRgb(lightTheme.colors.primary);
const surface = hexToRgb(lightTheme.colors.surface);
const surfaceSubtle = hexToRgb(lightTheme.colors.surfaceSubtle);

function Providers({ children }: { readonly children: ReactElement }) {
  return <UiProvider>{children}</UiProvider>;
}

function baseProps(): Props {
  return {
    caption: "Recent payments",
    state: { status: "ready", rows },
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

function selectionProps(onSelectionChange = vi.fn()) {
  return {
    selectedRowKeys: [] as readonly string[],
    onSelectionChange,
    getRowSelectionAccessibilityLabel: ({ row }: { row: Payment }) =>
      `Select payment for ${row.member}`,
  };
}

function renderListRow(
  context: DataTableListRowContext<Payment, string, ColumnId>
): ReactElement {
  return (
    <View testID={`list-row-${context.rowKey}`}>
      <Text>{context.row.member}</Text>
    </View>
  );
}

function bodyRowsOf(table: HTMLElement): readonly HTMLElement[] {
  return Array.from(table.querySelectorAll("tbody tr")) as HTMLElement[];
}

function cellsOf(row: HTMLElement): readonly HTMLElement[] {
  return Array.from(row.querySelectorAll("th, td")) as HTMLElement[];
}

function accentOf(cell: HTMLElement): HTMLElement | null {
  const first = cell.firstElementChild as HTMLElement | null;
  return first !== null && first.style.position === "absolute" ? first : null;
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("DataTable web active row", () => {
  it("marks the active <tr> with aria-current and washes every cell from tokens", () => {
    const onRowPress = vi.fn();
    const onSelectionChange = vi.fn();
    renderTable({
      activeRow: { key: "payment-c" },
      striped: true,
      showColumnBorders: true,
      onRowPress,
      selection: selectionProps(onSelectionChange),
    });

    const table = screen.getByRole("table", { name: "Recent payments" });
    const bodyRows = bodyRowsOf(table);
    expect(bodyRows).toHaveLength(3);
    // 활성 행만 aria-current — 이 표는 grid가 아니므로 aria-selected를 쓰지 않는다.
    expect(
      bodyRows.map((row) => row.getAttribute("aria-current"))
    ).toEqual([null, null, "true"]);
    expect(
      bodyRows.map((row) => row.getAttribute("aria-selected"))
    ).toEqual([null, null, null]);

    // 활성 행은 선택 셀을 포함한 모든 셀이 primarySoft wash — striped보다 우선.
    const activeCells = cellsOf(bodyRows[2] as HTMLElement);
    expect(activeCells.length).toBe(3);
    for (const cell of activeCells) {
      expect(cell.style.backgroundColor).toBe(primarySoft);
    }
    // 비활성 행은 기존 striped 규칙 그대로다.
    expect(
      cellsOf(bodyRows[0] as HTMLElement)
        .slice(1)
        .map((cell) => cell.style.backgroundColor)
    ).toEqual([surface, surface]);
    expect(
      cellsOf(bodyRows[1] as HTMLElement)
        .slice(1)
        .map((cell) => cell.style.backgroundColor)
    ).toEqual([surfaceSubtle, surfaceSubtle]);

    // 행 헤더 셀만 primary start-edge accent를 갖는다 — 절대 위치라 콘텐츠를
    // 밀지 않고 showColumnBorders의 셀 border와도 충돌하지 않는다.
    const activeRowHeader = within(bodyRows[2] as HTMLElement).getByRole(
      "rowheader"
    ) as HTMLElement;
    const accent = accentOf(activeRowHeader);
    expect(accent).not.toBeNull();
    expect(accent?.style.backgroundColor).toBe(primary);
    expect(accent?.style.width).toBe(`${lightTheme.spacing.xs}px`);
    expect(activeRowHeader.style.position).toBe("relative");
    expect(accent?.getAttribute("aria-hidden")).toBe("true");
    for (const row of bodyRows.slice(0, 2)) {
      const header = within(row).getByRole("rowheader") as HTMLElement;
      expect(accentOf(header)).toBeNull();
    }

    // 활성 행에서도 onRowPress·선택 체크박스 합성이 그대로 동작한다.
    fireEvent.click(within(bodyRows[2] as HTMLElement).getByText("36000"));
    expect(onRowPress).toHaveBeenCalledTimes(1);
    expect(onRowPress).toHaveBeenLastCalledWith(
      rows[2],
      expect.objectContaining({ rowKey: "payment-c", presentation: "table" })
    );
    fireEvent.click(
      screen.getByRole("checkbox", { name: "Select payment for Linus" })
    );
    expect(onSelectionChange).toHaveBeenCalledWith(
      ["payment-c"],
      expect.objectContaining({ reason: "row-toggle", rowKey: "payment-c" })
    );
    expect(onRowPress).toHaveBeenCalledTimes(1);
  });

  it("replaces the default wash and accent with activeRow.style but keeps aria-current", () => {
    renderTable({
      activeRow: { key: "payment-a", style: { backgroundColor: "#123456" } },
    });

    const table = screen.getByRole("table");
    const bodyRows = bodyRowsOf(table);
    expect(bodyRows[0]?.getAttribute("aria-current")).toBe("true");
    for (const cell of cellsOf(bodyRows[0] as HTMLElement)) {
      expect(cell.style.backgroundColor).toBe(hexToRgb("#123456"));
    }
    const header = within(bodyRows[0] as HTMLElement).getByRole(
      "rowheader"
    ) as HTMLElement;
    expect(accentOf(header)).toBeNull();
    expect(header.style.position).not.toBe("relative");
  });

  it("calls rowStyle with the full context and layers its result after the wash", () => {
    const rowStyle = vi.fn(
      (_row: Payment, context: { readonly active: boolean }) =>
        context.active ? { backgroundColor: "#123456" } : undefined
    );
    renderTable({ activeRow: { key: "payment-b" }, rowStyle });

    expect(rowStyle.mock.calls.map(([row, context]) => [row, context])).toEqual(
      [
        [
          rows[0],
          {
            rowKey: "payment-a",
            rowIndex: 0,
            active: false,
            presentation: "table",
          },
        ],
        [
          rows[1],
          {
            rowKey: "payment-b",
            rowIndex: 1,
            active: true,
            presentation: "table",
          },
        ],
        [
          rows[2],
          {
            rowKey: "payment-c",
            rowIndex: 2,
            active: false,
            presentation: "table",
          },
        ],
      ]
    );

    const bodyRows = bodyRowsOf(screen.getByRole("table"));
    // rowStyle은 기본 wash 뒤에 겹친다 — 활성 행에서 rowStyle 결과가 이긴다.
    for (const cell of cellsOf(bodyRows[1] as HTMLElement)) {
      expect(cell.style.backgroundColor).toBe(hexToRgb("#123456"));
    }
    for (const cell of cellsOf(bodyRows[0] as HTMLElement)) {
      expect(cell.style.backgroundColor).toBe(surface);
    }
  });

  it("changes nothing when activeRow and rowStyle are absent", () => {
    renderTable();
    const bodyRows = bodyRowsOf(screen.getByRole("table"));
    for (const row of bodyRows) {
      expect(row.getAttribute("aria-current")).toBeNull();
      const header = within(row).getByRole("rowheader") as HTMLElement;
      expect(header.childElementCount).toBe(1);
      expect(accentOf(header)).toBeNull();
      for (const cell of cellsOf(row)) {
        expect(cell.style.backgroundColor).toBe(surface);
      }
    }
  });

  it("keeps row-header cell content mounted, focused, and stateful across activeRow toggles", () => {
    // 회귀 방지: th 자식을 가변 배열로 넘기면 accent 토글 때 cellInner의 암묵
    // key가 밀려 remount된다 — 상세 Sheet를 여닫는 바로 그 흐름에서 행 헤더
    // 셀 안의 소비자 포커스·입력 상태가 날아간다.
    const editableColumns = [
      {
        ...columns[0],
        renderCell: ({ row }: { readonly row: Payment }) => (
          <TextInput accessibilityLabel={`Note for ${row.member}`} />
        ),
      },
      columns[1],
    ] as unknown as Props["columns"];
    const props = { ...baseProps(), columns: editableColumns } as Props;
    const view = render(
      <Providers>
        <DataTable {...props} />
      </Providers>
    );
    const input = screen.getByLabelText("Note for Ada") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "draft note" } });
    input.focus();
    expect(document.activeElement).toBe(input);

    // 활성화: 같은 DOM 노드가 유지되고 값·포커스가 살아남아야 한다.
    view.rerender(
      <Providers>
        <DataTable {...props} activeRow={{ key: "payment-a" }} />
      </Providers>
    );
    const afterActivate = screen.getByLabelText("Note for Ada");
    expect(afterActivate).toBe(input);
    expect(input.value).toBe("draft note");
    expect(document.activeElement).toBe(input);
    // accent는 같은 행 헤더 셀 안에 함께 그려진다.
    const header = input.closest("th") as HTMLElement;
    expect(accentOf(header)).not.toBeNull();

    // 비활성화: 반대 방향 토글에서도 remount되지 않는다.
    view.rerender(
      <Providers>
        <DataTable {...props} activeRow={{ key: null }} />
      </Providers>
    );
    expect(screen.getByLabelText("Note for Ada")).toBe(input);
    expect(input.value).toBe("draft note");
    expect(document.activeElement).toBe(input);
    expect(accentOf(input.closest("th") as HTMLElement)).toBeNull();
  });

  it("clips the default accent to the outline list row's rounded corners only while active", () => {
    const listProps = (overrides: Record<string, unknown>): Props =>
      ({
        ...baseProps(),
        presentation: "list",
        renderListRow,
        variant: "outline",
        ...overrides,
      } as Props);
    const view = render(
      <Providers>
        <DataTable {...listProps({ activeRow: { key: "payment-a" } })} />
      </Providers>
    );

    const items = screen.getAllByRole("listitem") as HTMLElement[];
    // 활성 행만 클립한다 — 사각 accent 바가 radius.sm 코너·outline hairline
    // 밖으로 칠해지지 않게. 비활성 행은 기존 렌더 그대로다.
    // RNW는 overflow를 overflow-x/y longhand로 방출한다(jsdom은 shorthand를
    // 재구성하지 않는다).
    expect(items[0]?.style.overflowX).toBe("hidden");
    expect(items[0]?.style.overflowY).toBe("hidden");
    expect((items[0]?.firstElementChild as HTMLElement).style.position).toBe(
      "absolute"
    );
    expect(items[1]?.style.overflowX).not.toBe("hidden");
    expect(items[2]?.style.overflowX).not.toBe("hidden");

    // activeRow.style이 기본 시각을 대체하면 accent가 없으므로 클립도 없다.
    view.rerender(
      <Providers>
        <DataTable
          {...listProps({
            activeRow: {
              key: "payment-a",
              style: { backgroundColor: "#123456" },
            },
          })}
        />
      </Providers>
    );
    const replaced = screen.getAllByRole("listitem") as HTMLElement[];
    expect(replaced[0]?.style.overflowX).not.toBe("hidden");

    // activeRow가 없으면 어떤 행도 클립되지 않는다(additive 보장).
    view.rerender(
      <Providers>
        <DataTable {...listProps({})} />
      </Providers>
    );
    for (const item of screen.getAllByRole("listitem") as HTMLElement[]) {
      expect(item.style.overflowX).not.toBe("hidden");
    }
  });

  it("marks the active compact list row with aria-current, the wash, and the accent", () => {
    const rowStyle = vi.fn(
      (_row: Payment, _context: DataTableRowStyleContext<string>) => undefined
    );
    renderTable({
      presentation: "list",
      renderListRow,
      activeRow: { key: "payment-a" },
      rowStyle,
    });

    const items = screen.getAllByRole("listitem") as HTMLElement[];
    expect(items.map((item) => item.getAttribute("aria-current"))).toEqual([
      "true",
      null,
      null,
    ]);
    expect(items[0]?.style.backgroundColor).toBe(primarySoft);
    expect(items[1]?.style.backgroundColor).toBe(surface);
    const accent = items[0]?.firstElementChild as HTMLElement;
    expect(accent.style.position).toBe("absolute");
    expect(accent.style.backgroundColor).toBe(primary);
    expect(rowStyle.mock.calls.map((call) => call[1])).toEqual([
      { rowKey: "payment-a", rowIndex: 0, active: true, presentation: "list" },
      { rowKey: "payment-b", rowIndex: 1, active: false, presentation: "list" },
      { rowKey: "payment-c", rowIndex: 2, active: false, presentation: "list" },
    ]);
  });

  it("rejects malformed activeRow and rowStyle configuration", () => {
    expect(() => renderTable({ activeRow: { key: "  " } })).toThrow(
      "activeRow.key"
    );
    expect(() => renderTable({ activeRow: "payment-a" })).toThrow(
      "activeRow must be an object"
    );
    expect(() => renderTable({ rowStyle: "wash" })).toThrow(
      "rowStyle must be a function"
    );
  });
});

describe("DataTable native active row", () => {
  it("washes the active visual-table row and accents its row-header cell only", () => {
    renderNativeTable({ activeRow: { key: "payment-a" }, striped: true });

    const activeRow = screen.getByTestId("orders-row-payment-a");
    expect(activeRow.style.backgroundColor).toBe(primarySoft);
    const accent = screen.getByTestId("orders-row-payment-a-active-accent");
    expect(accent.style.backgroundColor).toBe(primary);
    expect(accent.style.position).toBe("absolute");
    expect(accent.style.width).toBe(`${lightTheme.spacing.xs}px`);
    // accent는 행 헤더 셀(member) 안에 그려진다.
    expect(
      screen.getByTestId("orders-cell-payment-a-member").contains(accent)
    ).toBe(true);
    // 활성 행에는 selected 같은 접근성 상태를 가장하지 않는다 — 시각 전용이며
    // 어떤 레코드가 열렸는지는 상세 표면이 전달한다.
    expect(activeRow.getAttribute("aria-selected")).toBeNull();
    expect(activeRow.getAttribute("aria-current")).toBeNull();
    // 비활성 행은 accent가 없고 striped 규칙 그대로다.
    expect(
      screen.queryByTestId("orders-row-payment-b-active-accent")
    ).toBeNull();
    expect(
      screen.getByTestId("orders-row-payment-b").style.backgroundColor
    ).toBe(surfaceSubtle);
  });

  it("lets activeRow.style replace the native wash and accent", () => {
    renderNativeTable({
      activeRow: { key: "payment-a", style: { backgroundColor: "#123456" } },
    });
    expect(
      screen.getByTestId("orders-row-payment-a").style.backgroundColor
    ).toBe(hexToRgb("#123456"));
    expect(
      screen.queryByTestId("orders-row-payment-a-active-accent")
    ).toBeNull();
  });

  it("applies rowStyle to native table rows with the table context", () => {
    const rowStyle = vi.fn(
      (_row: Payment, context: { readonly active: boolean }) =>
        context.active ? undefined : { backgroundColor: "#123456" }
    );
    renderNativeTable({ activeRow: { key: "payment-b" }, rowStyle });

    expect(rowStyle.mock.calls.map((call) => call[1])).toEqual([
      { rowKey: "payment-a", rowIndex: 0, active: false, presentation: "table" },
      { rowKey: "payment-b", rowIndex: 1, active: true, presentation: "table" },
      { rowKey: "payment-c", rowIndex: 2, active: false, presentation: "table" },
    ]);
    expect(
      screen.getByTestId("orders-row-payment-a").style.backgroundColor
    ).toBe(hexToRgb("#123456"));
    expect(
      screen.getByTestId("orders-row-payment-b").style.backgroundColor
    ).toBe(primarySoft);
  });

  it("washes, accents, and row-styles the native compact list row", () => {
    const rowStyle = vi.fn(
      (_row: Payment, _context: DataTableRowStyleContext<string>) => undefined
    );
    renderNativeTable({
      presentation: "list",
      renderListRow,
      activeRow: { key: "payment-b" },
      rowStyle,
    });

    const activeRow = screen.getByTestId("orders-row-payment-b");
    expect(activeRow.style.backgroundColor).toBe(primarySoft);
    const accent = screen.getByTestId("orders-row-payment-b-active-accent");
    expect(activeRow.contains(accent)).toBe(true);
    expect(
      screen.queryByTestId("orders-row-payment-a-active-accent")
    ).toBeNull();
    expect(rowStyle.mock.calls.map((call) => call[1])).toEqual([
      { rowKey: "payment-a", rowIndex: 0, active: false, presentation: "list" },
      { rowKey: "payment-b", rowIndex: 1, active: true, presentation: "list" },
      { rowKey: "payment-c", rowIndex: 2, active: false, presentation: "list" },
    ]);
  });

  it("keeps native rows untouched when the props are absent", () => {
    renderNativeTable();
    expect(
      screen.getByTestId("orders-row-payment-a").style.backgroundColor
    ).toBe(surface);
    expect(screen.queryByTestId(/active-accent/)).toBeNull();
  });
});
