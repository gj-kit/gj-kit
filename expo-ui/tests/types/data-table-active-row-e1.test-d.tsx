/**
 * DataTable activeRow + rowStyle 타입 계약 — 라운드 E §1.
 *
 * activeRow는 key와 style을 한 객체로 묶는다: style만 있고 key가 없는 조합은
 * 구조적으로 불가능하다(selection prop과 같은 그룹 규율). 평면 activeRowKey/
 * activeRowStyle 쌍은 새 top-level union 항이 필요해 기존 24개 조합 union의
 * TS 정규화 한도를 넘겨 DataTableProps 스프레드 소스 호환성을 깨므로 기각했다.
 */
import { describe, expectTypeOf, it } from "vitest";
import type { StyleProp, ViewStyle } from "react-native";
import { DataTable } from "../../src";
import type {
  DataTableActiveRow,
  DataTableProps,
  DataTableRowStyleContext,
} from "../../src";
import type { DataTableColumn } from "../../src/components/data-table.types";

type Payment = {
  readonly id: string;
  readonly member: string;
  readonly amount: number;
};

const payments: readonly Payment[] = [
  { id: "payment-1", member: "Ada", amount: 12_000 },
  { id: "payment-2", member: "Grace", amount: 24_000 },
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
    getTextValue: ({ row }) => String(row.amount),
  },
] as const satisfies readonly DataTableColumn<
  Payment,
  "member" | "amount",
  string
>[];

const readyState = { status: "ready", rows: payments } as const;

declare function acceptPaymentTable(
  props: DataTableProps<Payment, "member" | "amount", string>
): void;

describe("DataTable activeRow contract", () => {
  it("accepts a key with an optional replacing style, and null for none", () => {
    void (
      <DataTable
        caption="Payments"
        state={readyState}
        columns={columns}
        getRowKey={(row) => row.id}
        rowHeaderColumnId="member"
        activeRow={{ key: "payment-1" }}
      />
    );

    void (
      <DataTable
        caption="Payments"
        state={readyState}
        columns={columns}
        getRowKey={(row) => row.id}
        rowHeaderColumnId="member"
        activeRow={{ key: null, style: { backgroundColor: "transparent" } }}
      />
    );

    // 조건부 연결은 undefined가 아니라 null 또는 객체 전체로 표현한다.
    const openId = null as string | null;
    acceptPaymentTable({
      caption: "Payments",
      state: readyState,
      columns,
      getRowKey: (row) => row.id,
      rowHeaderColumnId: "member",
      activeRow: { key: openId },
    });

    expectTypeOf<DataTableActiveRow<string>["key"]>().toEqualTypeOf<
      string | null
    >();
    expectTypeOf<DataTableActiveRow<string>["style"]>().toEqualTypeOf<
      StyleProp<ViewStyle> | undefined
    >();
  });

  it("rejects a style without a key and keys of the wrong row-key type", () => {
    void (
      <DataTable
        caption="Payments"
        state={readyState}
        columns={columns}
        getRowKey={(row) => row.id}
        rowHeaderColumnId="member"
        // @ts-expect-error activeRow.style requires the key member — a style
        // with no key can never apply to any row.
        activeRow={{ style: { backgroundColor: "transparent" } }}
      />
    );

    void (
      <DataTable
        caption="Payments"
        state={readyState}
        columns={columns}
        getRowKey={(row) => row.id}
        rowHeaderColumnId="member"
        // @ts-expect-error the row key type is string here, not number
        activeRow={{ key: 7 }}
      />
    );

    acceptPaymentTable({
      caption: "Payments",
      state: readyState,
      columns,
      getRowKey: (row) => row.id,
      rowHeaderColumnId: "member",
      // @ts-expect-error activeRow groups key and style — a bare key is not
      // the prop shape.
      activeRow: "payment-1",
    });
  });
});

describe("DataTable rowStyle contract", () => {
  it("types the row and the full style context", () => {
    void (
      <DataTable
        caption="Payments"
        state={readyState}
        columns={columns}
        getRowKey={(row) => row.id}
        rowHeaderColumnId="member"
        activeRow={{ key: "payment-2" }}
        rowStyle={(row, context) => {
          expectTypeOf(row).toEqualTypeOf<Payment>();
          expectTypeOf(context).toEqualTypeOf<
            DataTableRowStyleContext<string>
          >();
          expectTypeOf(context.rowKey).toEqualTypeOf<string>();
          expectTypeOf(context.rowIndex).toEqualTypeOf<number>();
          expectTypeOf(context.active).toEqualTypeOf<boolean>();
          expectTypeOf(context.presentation).toEqualTypeOf<"table" | "list">();
          return context.active ? undefined : { opacity: 0.9 };
        }}
      />
    );
  });

  it("rejects wrong return types and contexts the hook never receives", () => {
    void (
      <DataTable
        caption="Payments"
        state={readyState}
        columns={columns}
        getRowKey={(row) => row.id}
        rowHeaderColumnId="member"
        // @ts-expect-error rowStyle must return a ViewStyle (or undefined),
        // not a class-name string.
        rowStyle={() => "row-highlight"}
      />
    );

    void (
      <DataTable
        caption="Payments"
        state={readyState}
        columns={columns}
        getRowKey={(row) => row.id}
        rowHeaderColumnId="member"
        rowStyle={(_row, context) => {
          // @ts-expect-error the style context carries no press event
          void context.originalEvent;
          return undefined;
        }}
      />
    );

    // @ts-expect-error the style context is not assignable from the press
    // context — active and presentation are its complete surface.
    const badContext: DataTableRowStyleContext<string> = {
      rowKey: "payment-1",
      rowIndex: 0,
      active: true,
    };
    void badContext;
  });
});
