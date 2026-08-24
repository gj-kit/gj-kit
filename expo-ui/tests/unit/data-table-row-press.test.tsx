import type { ReactElement } from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Text, View } from "react-native";
import { DataTable as NativeDataTable } from "../../src/components/data-table.native";
import { DataTable } from "../../src/components/data-table.web";
import type {
  DataTableColumn,
  DataTableListRowContext,
  DataTableProps,
} from "../../src/components/data-table.types";
import { Link } from "../../src/components/link";
import { UiProvider } from "../../src/components/provider";

type Payment = {
  readonly id: string;
  readonly member: string;
  readonly amount: number;
};

type ColumnId = "member" | "amount";

const rows: readonly Payment[] = [
  { id: "payment-a", member: "Ada", amount: 12_000 },
  { id: "payment-b", member: "Grace", amount: 24_000 },
];

const columns = [
  {
    id: "member",
    header: "Member",
    flex: 2,
    getTextValue: ({ row }) => row.member,
    renderCell: ({ textValue }) => (
      <Link href={`/members/${textValue}`} testID={`member-link-${textValue}`}>
        {textValue}
      </Link>
    ),
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

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("DataTable web activatable rows", () => {
  it("keeps a real focusable <tr role=row> that activates on click, Enter, and Space", () => {
    const onRowPress = vi.fn();
    renderTable({
      onRowPress,
      getRowAccessibilityLabel: (row: Payment) => `Open payment for ${row.member}`,
    });

    const table = screen.getByRole("table", { name: "Recent payments" });
    const bodyRows = Array.from(table.querySelectorAll("tbody tr"));
    expect(bodyRows).toHaveLength(2);
    for (const row of bodyRows) {
      expect(row.tagName).toBe("TR");
      expect(row.getAttribute("role")).toBe("row");
      expect(row.getAttribute("tabindex")).toBe("0");
      expect(row.matches('button, [role="button"]')).toBe(false);
      expect((row as HTMLElement).style.cursor).toBe("pointer");
    }
    expect(bodyRows.map((row) => row.getAttribute("aria-label"))).toEqual([
      "Open payment for Ada",
      "Open payment for Grace",
    ]);
    // 포커스 가능한 행은 aria-describedby로 숨은 힌트를 가리켜 Enter/Space
    // 활성화를 보조기술에 알린다.
    const hintId = bodyRows[0]?.getAttribute("aria-describedby") as string;
    expect(hintId).toBeTruthy();
    expect(bodyRows[1]?.getAttribute("aria-describedby")).toBe(hintId);
    const hint = document.getElementById(hintId) as HTMLElement;
    expect(hint.textContent).toBe("Press Enter or Space to activate");
    expect(hint.style.position).toBe("absolute");
    expect(hint.style.overflow).toBe("hidden");
    expect(within(table).getAllByRole("rowheader")).toHaveLength(2);
    expect(within(table).getAllByRole("columnheader")).toHaveLength(2);

    const second = bodyRows[1] as HTMLElement;
    fireEvent.click(second);
    expect(onRowPress).toHaveBeenCalledTimes(1);
    expect(onRowPress).toHaveBeenLastCalledWith(
      rows[1],
      expect.objectContaining({
        rowKey: "payment-b",
        rowIndex: 1,
        presentation: "table",
      })
    );

    second.focus();
    const enter = fireEvent.keyDown(second, { key: "Enter" });
    expect(enter).toBe(false);
    fireEvent.keyDown(second, { key: " " });
    fireEvent.keyDown(second, { key: "ArrowDown" });
    expect(onRowPress).toHaveBeenCalledTimes(3);
  });

  it("names activatable rows from their cells when no label getter is supplied", () => {
    renderTable({ onRowPress: vi.fn() });
    const table = screen.getByRole("table");
    expect(
      Array.from(table.querySelectorAll("tbody tr"), (row) =>
        row.getAttribute("aria-label")
      )
    ).toEqual(["Member: Ada, Amount: 12000", "Member: Grace, Amount: 24000"]);
  });

  it("leaves static rows exactly as before when onRowPress is absent", () => {
    renderTable();
    const table = screen.getByRole("table");
    for (const row of Array.from(table.querySelectorAll("tbody tr"))) {
      expect(row.getAttribute("tabindex")).toBeNull();
      expect(row.getAttribute("aria-label")).toBeNull();
      expect(row.getAttribute("role")).toBeNull();
      expect((row as HTMLElement).style.cursor).toBe("");
    }
  });

  it("lets nested selection checkboxes and links keep working without activating the row", () => {
    const onRowPress = vi.fn();
    const onSelectionChange = vi.fn();
    renderTable({ onRowPress, selection: selectionProps(onSelectionChange) });

    const checkbox = screen.getByRole("checkbox", {
      name: "Select payment for Ada",
    });
    fireEvent.click(checkbox);
    expect(onSelectionChange).toHaveBeenCalledWith(
      ["payment-a"],
      expect.objectContaining({ reason: "row-toggle", rowKey: "payment-a" })
    );
    // Space on the focused checkbox bubbles to the row; the row ignores keys
    // that did not start on itself.
    checkbox.focus();
    fireEvent.keyDown(checkbox, { key: " " });
    fireEvent.keyDown(checkbox, { key: "Enter" });
    expect(onRowPress).not.toHaveBeenCalled();

    const link = screen.getByTestId("member-link-Ada");
    // jsdom은 실제 탐색을 구현하지 않으므로 기본 동작만 막는다. 행 핸들러는 그 전에 판단한다.
    link.addEventListener("click", (event) => event.preventDefault());
    fireEvent.click(link);
    expect(onRowPress).not.toHaveBeenCalled();

    // A click on plain cell content still activates the row.
    fireEvent.click(screen.getByText("12000"));
    expect(onRowPress).toHaveBeenCalledTimes(1);
    expect(onRowPress).toHaveBeenLastCalledWith(
      rows[0],
      expect.objectContaining({ rowKey: "payment-a", rowIndex: 0 })
    );
  });

  it("activates compact web list rows from the focusable listitem itself, never a nested button", () => {
    const onRowPress = vi.fn();
    const onSelectionChange = vi.fn();
    renderTable({
      presentation: "list",
      renderListRow,
      onRowPress,
      getRowAccessibilityLabel: (row: Payment) => `Open ${row.member}`,
      selection: selectionProps(onSelectionChange),
    });

    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(2);
    const first = items[0] as HTMLElement;
    // 표의 <tr role="row"> 패턴 그대로 — listitem 자체가 포커스 가능한 활성화
    // 컨테이너다. 소비자 콘텐츠가 button 안에 중첩되지 않는다.
    expect(first.getAttribute("tabindex")).toBe("0");
    expect(first.getAttribute("aria-label")).toBe("Open Ada");
    expect(first.style.cursor).toBe("pointer");
    expect(first.querySelector('button, [role="button"]')).toBeNull();
    const hintId = first.getAttribute("aria-describedby") as string;
    expect(document.getElementById(hintId)?.textContent).toBe(
      "Press Enter or Space to activate"
    );
    const checkbox = within(first).getByRole("checkbox", {
      name: "Select payment for Ada",
    });
    expect(within(first).getByTestId("list-row-payment-a")).toBeTruthy();

    // 체크박스에서 시작한 클릭·키 입력은 선택만 바꾸고 행을 활성화하지 않는다.
    fireEvent.click(checkbox);
    expect(onSelectionChange).toHaveBeenCalledTimes(1);
    checkbox.focus();
    fireEvent.keyDown(checkbox, { key: "Enter" });
    fireEvent.keyDown(checkbox, { key: " " });
    expect(onRowPress).not.toHaveBeenCalled();

    // 일반 콘텐츠 클릭과 listitem 자체의 Enter/Space는 행을 활성화한다.
    fireEvent.click(within(first).getByTestId("list-row-payment-a"));
    expect(onRowPress).toHaveBeenCalledTimes(1);
    expect(onRowPress).toHaveBeenLastCalledWith(
      rows[0],
      expect.objectContaining({ rowKey: "payment-a", presentation: "list" })
    );
    first.focus();
    fireEvent.keyDown(first, { key: "Enter" });
    fireEvent.keyDown(first, { key: " " });
    fireEvent.keyDown(first, { key: "ArrowDown" });
    expect(onRowPress).toHaveBeenCalledTimes(3);
  });

  it("rejects a label getter without onRowPress and blank row labels", () => {
    expect(() =>
      renderTable({ getRowAccessibilityLabel: () => "Open" })
    ).toThrow("requires onRowPress");
    expect(() =>
      renderTable({ onRowPress: vi.fn(), getRowAccessibilityLabel: () => "  " })
    ).toThrow("row accessibility label");
    expect(() => renderTable({ onRowPress: "open" })).toThrow(
      "onRowPress must be a function"
    );
  });

  it("sizes the semantic table to its scroll region instead of max-content", () => {
    // memorylog2의 수작업 표는 가로 ScrollView 안에서 max-content로 커지는 결함이 있었다.
    // 실제 <table>은 tableLayout fixed + width 100%로 컨테이너 폭을 따르고,
    // minTableWidth 아래에서만 region이 가로 스크롤한다. jsdom은 레이아웃을 계산하지
    // 않으므로 여기서는 그 계약(선언)을 고정한다.
    renderTable({ minTableWidth: 720, style: { width: 400 } });
    const table = screen.getByRole("table") as HTMLTableElement;
    expect(table.style.width).toBe("100%");
    expect(table.style.tableLayout).toBe("fixed");
    expect(table.style.minWidth).toBe("720px");
    const region = table.parentElement as HTMLElement;
    expect(region.getAttribute("role")).toBe("region");
    expect(region.style.overflowX).toBe("auto");
    expect(region.style.maxWidth).toBe("100%");
    const root = region.parentElement as HTMLElement;
    expect(root.style.width).toBe("400px");
    expect(window.getComputedStyle(root).minWidth).toBe("0px");
  });
});

describe("DataTable native activatable rows", () => {
  it("keeps visual-table row content out of any button and adds a sibling activation control", () => {
    const onRowPress = vi.fn();
    const onSelectionChange = vi.fn();
    renderNativeTable({
      onRowPress,
      getRowAccessibilityLabel: (row: Payment) => `Open ${row.member}`,
      selection: selectionProps(onSelectionChange),
    });

    const list = screen.getByRole("list", { name: "Recent payments" });
    const nativeRows = within(list).getAllByRole("listitem");
    expect(nativeRows).toHaveLength(2);
    const first = nativeRows[0] as HTMLElement;
    // 보조기술용 활성화 컨트롤은 셀·체크박스와 나란한 형제이며 아무것도 감싸지 않는다.
    const activation = within(first).getByRole("button", { name: "Open Ada" });
    expect(activation).toBe(screen.getByTestId("orders-row-payment-a-activate"));
    expect(activation.childElementCount).toBe(0);
    const checkbox = within(first).getByRole("checkbox", {
      name: "Select payment for Ada",
    });
    expect(activation.contains(checkbox)).toBe(false);
    const amountCell = screen.getByTestId("orders-cell-payment-a-amount");
    expect(activation.contains(amountCell)).toBe(false);
    // 터치 표면은 셀을 담지만 button 의미를 갖지 않는다 — 셀 콘텐츠는 어떤
    // button 안에도 중첩되지 않는다.
    const touch = screen.getByTestId("orders-row-payment-a-press");
    expect(touch.matches('button, [role="button"]')).toBe(false);
    expect(touch.contains(amountCell)).toBe(true);
    expect(amountCell.closest('button, [role="button"]')).toBeNull();

    fireEvent.click(checkbox);
    expect(onSelectionChange).toHaveBeenCalledTimes(1);
    expect(onRowPress).not.toHaveBeenCalled();

    fireEvent.click(touch);
    expect(onRowPress).toHaveBeenCalledTimes(1);
    expect(onRowPress).toHaveBeenLastCalledWith(
      rows[0],
      expect.objectContaining({
        rowKey: "payment-a",
        rowIndex: 0,
        presentation: "table",
      })
    );
    fireEvent.click(activation);
    expect(onRowPress).toHaveBeenCalledTimes(2);
    expect(onRowPress).toHaveBeenLastCalledWith(
      rows[0],
      expect.objectContaining({ rowKey: "payment-a", presentation: "table" })
    );
  });

  it("keeps static native rows free of buttons and compact pressable rows non-nesting", () => {
    renderNativeTable();
    for (const row of screen.getAllByRole("listitem")) {
      expect(within(row).queryByRole("button")).toBeNull();
    }
    cleanup();

    const onRowPress = vi.fn();
    renderNativeTable({
      caption: undefined,
      accessibilityLabel: "Compact payments",
      presentation: "list",
      renderListRow,
      onRowPress,
    });
    const activation = screen.getByRole("button", {
      name: "Member: Grace, Amount: 24000",
    });
    expect(activation.childElementCount).toBe(0);
    expect(activation.contains(screen.getByTestId("list-row-payment-b"))).toBe(
      false
    );
    const touch = screen.getByTestId("orders-row-payment-b-press");
    expect(touch.matches('button, [role="button"]')).toBe(false);
    expect(within(touch).getByTestId("list-row-payment-b")).toBeTruthy();
    fireEvent.click(touch);
    expect(onRowPress).toHaveBeenLastCalledWith(
      rows[1],
      expect.objectContaining({ rowKey: "payment-b", presentation: "list" })
    );
    fireEvent.click(activation);
    expect(onRowPress).toHaveBeenCalledTimes(2);
  });
});
