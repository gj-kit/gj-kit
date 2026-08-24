import { describe, expectTypeOf, it } from 'vitest';
import { Text as RNText, View } from 'react-native';
import {
  DataTable,
  KeyValueList,
  SegmentedControl,
  StatGrid,
  Text,
  Toolbar,
} from '../../src/index';
import type {
  DataTableColumn,
  DataTableRowPressContext,
  KeyValueItem,
  KeyValueListLayout,
  KeyValueListProps,
  SegmentedControlProps,
  SegmentedControlVariant,
  StatGridProps,
  StatItem,
  StatTone,
  TextProps,
  ToolbarAlign,
  ToolbarProps,
} from '../../src/index';

const noop = (): void => undefined;

describe('SegmentedControl variant', () => {
  const items = [
    { value: 'mine', label: 'Mine' },
    { value: 'shared', label: 'Shared' },
  ] as const;

  it('is an optional closed union that never touches the radio contract', () => {
    expectTypeOf<SegmentedControlVariant>().toEqualTypeOf<'filled' | 'underline'>();
    expectTypeOf<SegmentedControlProps<'mine'>['variant']>().toEqualTypeOf<
      SegmentedControlVariant | undefined
    >();
    void (
      <SegmentedControl
        items={items}
        value="mine"
        accessibilityLabel="Album filter"
        variant="underline"
        onValueChange={(value) => {
          expectTypeOf(value).toEqualTypeOf<'mine' | 'shared'>();
        }}
      />
    );
    void (<SegmentedControl items={items} value="mine" accessibilityLabel="Album filter" variant="filled" onValueChange={noop} />);
    // @ts-expect-error only the two documented looks exist
    void (<SegmentedControl items={items} value="mine" accessibilityLabel="Album filter" variant="outline" onValueChange={noop} />);
    // @ts-expect-error an underline look does not turn the radio group into tabs
    void (<SegmentedControl items={items} value="mine" accessibilityLabel="Album filter" variant="underline" panels={{ mine: 'a', shared: 'b' }} onValueChange={noop} />);
  });
});

describe('Text tabularNums', () => {
  it('is a plain optional boolean', () => {
    expectTypeOf<TextProps['tabularNums']>().toEqualTypeOf<boolean | undefined>();
    void (<Text tabularNums>1,204</Text>);
    void (<Text role="caption" color="textMuted" tabularNums={false}>1,204</Text>);
    // @ts-expect-error the numeral setting is boolean, not a font-variant string
    void (<Text tabularNums="tabular-nums">1,204</Text>);
  });
});

describe('KeyValueList', () => {
  it('requires a visible label and a renderable value per row and keeps unstyled out', () => {
    expectTypeOf<KeyValueListLayout>().toEqualTypeOf<'stacked' | 'inline'>();
    expectTypeOf<KeyValueItem['value']>().toEqualTypeOf<
      Exclude<NonNullable<React.ReactNode>, boolean>
    >();
    expectTypeOf<KeyValueListProps['items']>().toEqualTypeOf<readonly KeyValueItem[]>();
    expectTypeOf<KeyValueListProps['accessibilityLabel']>().toEqualTypeOf<string | undefined>();

    const items = [
      { label: 'Member', value: 'Ada' },
      { label: 'Seats', value: 12 },
      { key: 'status', label: 'Status', value: <RNText>Active</RNText> },
    ] as const satisfies readonly KeyValueItem[];
    void (<KeyValueList items={items} layout="stacked" size="sm" divider accessibilityLabel="Account" />);
    void (<KeyValueList items={items} labelStyle={{ width: 140 }} valueStyle={{ letterSpacing: 1 }} rowStyle={{ marginBottom: 2 }} />);

    // @ts-expect-error a row needs a label
    void (<KeyValueList items={[{ value: 'Ada' }]} />);
    // @ts-expect-error null is not a renderable value; omit the row instead
    void (<KeyValueList items={[{ label: 'Member', value: null }]} />);
    // @ts-expect-error undefined is not a renderable value
    void (<KeyValueList items={[{ label: 'Member', value: undefined }]} />);
    // @ts-expect-error booleans render an empty row; omit the row instead
    void (<KeyValueList items={[{ label: 'Active', value: true }]} />);
    // @ts-expect-error booleans render an empty row; omit the row instead
    void (<KeyValueList items={[{ label: 'Active', value: false }]} />);
    // @ts-expect-error layout is a closed union
    void (<KeyValueList items={items} layout="grid" />);
    // @ts-expect-error legacy unstyled mode is intentionally unavailable
    void (<KeyValueList items={items} unstyled />);
  });
});

describe('StatGrid', () => {
  it('types items with caller-owned tone and a numeric ratio and keeps unstyled out', () => {
    expectTypeOf<StatTone>().toEqualTypeOf<'neutral' | 'info' | 'success' | 'warning' | 'danger'>();
    expectTypeOf<StatItem['ratio']>().toEqualTypeOf<number | undefined>();
    expectTypeOf<StatItem['value']>().toEqualTypeOf<string>();
    expectTypeOf<StatGridProps['columns']>().toEqualTypeOf<number | undefined>();

    const items = [
      { label: 'Members', value: '1,204' },
      { label: 'Storage', value: '72%', hint: '7.2 GB of 10 GB', ratio: 0.72, tone: 'warning' },
    ] as const satisfies readonly StatItem[];
    void (<StatGrid items={items} columns={3} size="sm" accessibilityLabel="Overview" />);

    // @ts-expect-error value is an already-formatted string, never a number
    void (<StatGrid items={[{ label: 'Members', value: 1204 }]} />);
    // @ts-expect-error ratio is numeric
    void (<StatGrid items={[{ label: 'Storage', value: '72%', ratio: '0.72' }]} />);
    // @ts-expect-error danger, not error, is the StatGrid tone name
    void (<StatGrid items={[{ label: 'Failed', value: '3', tone: 'error' }]} />);
    // @ts-expect-error columns is a number
    void (<StatGrid items={items} columns="3" />);
    // @ts-expect-error legacy unstyled mode is intentionally unavailable
    void (<StatGrid items={items} unstyled />);
  });
});

describe('Toolbar', () => {
  it('requires a name, takes spacing tokens for gap, and keeps unstyled out', () => {
    expectTypeOf<ToolbarAlign>().toEqualTypeOf<'start' | 'center' | 'end' | 'space-between'>();
    expectTypeOf<ToolbarProps['accessibilityLabel']>().toEqualTypeOf<string>();
    void (
      <Toolbar accessibilityLabel="Filters" gap="md" align="space-between" wrap={false} bordered>
        <View />
      </Toolbar>
    );

    // @ts-expect-error a toolbar landmark must be named
    void (<Toolbar><View /></Toolbar>);
    // @ts-expect-error gap is a spacing token key, not a pixel value
    void (<Toolbar accessibilityLabel="Filters" gap={12}><View /></Toolbar>);
    // @ts-expect-error align is a closed union
    void (<Toolbar accessibilityLabel="Filters" align="stretch"><View /></Toolbar>);
    // @ts-expect-error legacy unstyled mode is intentionally unavailable
    void (<Toolbar accessibilityLabel="Filters" unstyled><View /></Toolbar>);
  });
});

describe('DataTable activatable rows', () => {
  type Payment = { readonly id: string; readonly member: string; readonly amount: number };
  const payments: readonly Payment[] = [{ id: 'payment-1', member: 'Ada', amount: 12_000 }];
  const columns = [
    { id: 'member', header: 'Member', flex: 2, getTextValue: ({ row }) => row.member },
    { id: 'amount', header: 'Amount', width: 120, getTextValue: ({ row }) => String(row.amount) },
  ] as const satisfies readonly DataTableColumn<Payment, 'member' | 'amount', string>[];

  it('types onRowPress with the row and a keyed context and ties the label getter to it', () => {
    expectTypeOf<DataTableRowPressContext<string>['rowKey']>().toEqualTypeOf<string>();
    expectTypeOf<DataTableRowPressContext<number>['rowKey']>().toEqualTypeOf<number>();
    expectTypeOf<DataTableRowPressContext<string>['presentation']>().toEqualTypeOf<'table' | 'list'>();

    void (
      <DataTable
        accessibilityLabel="Payments"
        state={{ status: 'ready', rows: payments }}
        columns={columns}
        getRowKey={(row) => row.id}
        rowHeaderColumnId="member"
        onRowPress={(row, context) => {
          expectTypeOf(row).toEqualTypeOf<Payment>();
          expectTypeOf(context).toEqualTypeOf<DataTableRowPressContext<string>>();
          expectTypeOf(context.rowIndex).toEqualTypeOf<number>();
        }}
        getRowAccessibilityLabel={(row) => {
          expectTypeOf(row).toEqualTypeOf<Payment>();
          return `Open ${row.member}`;
        }}
      />
    );
    void (
      <DataTable
        accessibilityLabel="Payments"
        state={{ status: 'ready', rows: payments }}
        columns={columns}
        getRowKey={(row) => row.id}
        rowHeaderColumnId="member"
        onRowPress={noop}
      />
    );

    // Idiomatic conditional wiring stays legal: the absent branch accepts
    // an explicit undefined.
    const openPayment = (row: Payment, context: DataTableRowPressContext<string>): void => {
      void row;
      void context;
    };
    const conditionalOpen = payments.length > 1 ? openPayment : undefined;
    void (
      <DataTable
        accessibilityLabel="Payments"
        state={{ status: 'ready', rows: payments }}
        columns={columns}
        getRowKey={(row) => row.id}
        rowHeaderColumnId="member"
        onRowPress={conditionalOpen}
      />
    );
    void (
      // @ts-expect-error the label getter needs a definitely present onRowPress
      <DataTable
        accessibilityLabel="Payments"
        state={{ status: 'ready', rows: payments }}
        columns={columns}
        getRowKey={(row) => row.id}
        rowHeaderColumnId="member"
        onRowPress={conditionalOpen}
        getRowAccessibilityLabel={(row: Payment) => row.member}
      />
    );

    void (
      // @ts-expect-error a row label without row activation has nothing to name
      <DataTable
        accessibilityLabel="Payments"
        state={{ status: 'ready', rows: payments }}
        columns={columns}
        getRowKey={(row) => row.id}
        rowHeaderColumnId="member"
        getRowAccessibilityLabel={(row: Payment) => row.member}
      />
    );
    void (
      <DataTable
        accessibilityLabel="Payments"
        state={{ status: 'ready', rows: payments }}
        columns={columns}
        getRowKey={(row) => row.id}
        rowHeaderColumnId="member"
        // @ts-expect-error the label getter must return a string
        getRowAccessibilityLabel={(row: Payment) => row.amount}
        onRowPress={noop}
      />
    );
  });
});
