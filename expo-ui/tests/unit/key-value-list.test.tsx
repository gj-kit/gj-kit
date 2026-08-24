import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Platform, Text, View } from 'react-native';
import { KeyValueList } from '../../src/components/key-value-list';
import { UiProvider } from '../../src/components/provider';
import { createTheme } from '../../src/theme/createTheme';

afterEach(cleanup);

function withPlatformOS<T>(os: 'ios' | 'android' | 'web', run: () => T): T {
  const descriptor = Object.getOwnPropertyDescriptor(Platform, 'OS');
  Object.defineProperty(Platform, 'OS', { configurable: true, value: os });
  try {
    return run();
  } finally {
    if (descriptor === undefined) delete (Platform as { OS?: string }).OS;
    else Object.defineProperty(Platform, 'OS', descriptor);
  }
}

const theme = createTheme('light', {
  colors: { text: '#0A0B0C', textMuted: '#6A6B6C', line: '#456789' },
  spacing: { xs: 3, sm: 9, md: 15 },
  metrics: { control: { sm: 30, md: 40, lg: 50 } },
});

const items = [
  { label: 'Member', value: 'Ada Lovelace' },
  { label: 'Seats', value: 12 },
  {
    key: 'status',
    label: 'Status',
    value: (
      <View testID="status-node">
        <Text>Active</Text>
      </View>
    ),
  },
] as const;

describe('KeyValueList web description list', () => {
  it('emits a real dl with one dt/dd pair per item, in order, inside permitted div groups', () => {
    render(
      <UiProvider theme={theme}>
        <KeyValueList items={items} accessibilityLabel="Account" testID="account" />
      </UiProvider>,
    );

    const list = screen.getByTestId('account');
    expect(list.tagName).toBe('DL');
    expect(list.getAttribute('aria-label')).toBe('Account');
    const groups = Array.from(list.children);
    expect(groups.map((group) => group.tagName)).toEqual(['DIV', 'DIV', 'DIV']);
    for (const group of groups) {
      expect(Array.from(group.children, (child) => child.tagName)).toEqual(['DT', 'DD']);
    }
    expect(Array.from(list.querySelectorAll(':scope > div > dt'), (dt) => dt.textContent)).toEqual([
      'Member',
      'Seats',
      'Status',
    ]);
    expect(Array.from(list.querySelectorAll(':scope > div > dd'), (dd) => dd.textContent)).toEqual([
      'Ada Lovelace',
      '12',
      'Active',
    ]);
    expect(within(groups[2] as HTMLElement).getByTestId('status-node')).toBeTruthy();
    expect(list.querySelector('[role]')).toBeNull();
    expect(screen.getAllByRole('definition')).toHaveLength(3);
    expect(screen.getAllByRole('term')).toHaveLength(3);
  });

  it('renders nothing at all for an empty list', () => {
    const { container } = render(
      <UiProvider theme={theme}>
        <KeyValueList items={[]} testID="empty" />
      </UiProvider>,
    );
    expect(container.innerHTML).toBe('');
    expect(screen.queryByTestId('empty')).toBeNull();
  });

  it('lays out inline rows side by side and stacked rows in a column, with dividers between rows only', () => {
    render(
      <UiProvider theme={theme}>
        <KeyValueList items={items} layout="inline" divider testID="inline" />
        <KeyValueList items={items} layout="stacked" size="sm" testID="stacked" />
      </UiProvider>,
    );

    const inlineRows = Array.from(screen.getByTestId('inline').children) as HTMLElement[];
    expect(inlineRows[0]?.style.display).toBe('flex');
    expect(inlineRows[0]?.style.flexDirection).toBe('row');
    expect(inlineRows[0]?.style.gap).toBe('15px');
    expect(inlineRows[0]?.style.borderBottomWidth).not.toBe('0px');
    expect(inlineRows[0]?.style.borderBottomColor).toBe('rgb(69, 103, 137)');
    expect(inlineRows[0]?.style.paddingTop).toBe('9px');
    expect(inlineRows[2]?.style.borderBottomWidth).toBe('0px');
    // 라벨 열 폭은 display:inline인 RNW Text가 아니라 블록 레벨 flex item인
    // <dt>가 가져야 실제 브라우저에서 값이 정렬된다 — dt의 inline style로 고정한다.
    const inlineDt = inlineRows[0]?.querySelector('dt') as HTMLElement;
    expect(inlineDt.style.width).toBe('100px');
    expect(inlineDt.style.flexShrink).toBe('0');
    const secondDt = inlineRows[1]?.querySelector('dt') as HTMLElement;
    expect(secondDt.style.width).toBe('100px');
    const dd = inlineRows[0]?.querySelector('dd') as HTMLElement;
    expect(dd.style.margin).toBe('0px');
    expect(dd.style.flexGrow).toBe('1');

    const stacked = screen.getByTestId('stacked');
    expect(stacked.style.gap).toBe('3px');
    const stackedRows = Array.from(stacked.children) as HTMLElement[];
    expect(stackedRows[0]?.style.flexDirection).toBe('column');
    expect(stackedRows[0]?.style.borderBottomWidth).toBe('');
    const stackedDt = stackedRows[0]?.querySelector('dt') as HTMLElement;
    expect(stackedDt.style.width).toBe('');
    const stackedLabel = stackedRows[0]?.querySelector('dt > *') as HTMLElement;
    expect(window.getComputedStyle(stackedLabel).width).toBe('');
  });

  it('colors labels muted and values with the text token and forwards style hooks', () => {
    render(
      <UiProvider theme={theme}>
        <KeyValueList
          items={items}
          testID="styled"
          className="kv"
          style={{ marginTop: 7 }}
          rowStyle={{ marginBottom: 2 }}
          rowClassName="kv-row"
          labelStyle={{ width: 140 }}
          valueStyle={{ letterSpacing: 1 }}
        />
      </UiProvider>,
    );

    // raw host(dl·div)는 className을 DOM에 그대로 싣는다. RN Text/View의 className은
    // NativeWind 호스트 관심사라 RNW는 버린다 — 다른 컴포넌트와 같은 규칙.
    const list = screen.getByTestId('styled');
    expect(list.className).toBe('kv');
    expect(list.style.marginTop).toBe('7px');
    expect(list.style.margin).toBe('7px 0px 0px');
    const row = list.children[0] as HTMLElement;
    expect(row.className).toBe('kv-row');
    expect(row.style.marginBottom).toBe('2px');
    const label = screen.getByText('Member');
    expect(label.style.color).toBe('rgb(106, 107, 108)');
    // 소비자 labelStyle의 width는 라벨 열, 즉 dt로 끌어올려져 실제로 정렬을 바꾼다.
    const styledDt = label.closest('dt') as HTMLElement;
    expect(styledDt.style.width).toBe('140px');
    const value = screen.getByText('Ada Lovelace');
    expect(value.style.color).toBe('rgb(10, 11, 12)');
    expect(value.style.letterSpacing).toBe('1px');
    const wrapper = screen.getByTestId('status-node').parentElement as HTMLElement;
    expect(wrapper.parentElement?.tagName).toBe('DD');
    expect(wrapper.style.letterSpacing).toBe('1px');
  });

  it.each([
    { props: { items: [{ label: ' ', value: 'x' }] }, message: 'label must be a non-empty string' },
    {
      props: { items: [{ label: 'A', value: 'x' }, { label: 'A', value: 'y' }] },
      message: 'duplicated',
    },
    { props: { items: [{ label: 'A', value: null as never }] }, message: 'renderable node' },
    { props: { items: [{ label: 'A', value: true as never }] }, message: 'renderable node' },
    { props: { items: [{ label: 'A', value: 'x' }], layout: 'grid' as never }, message: 'layout must be' },
    { props: { items: [{ label: 'A', value: 'x' }], size: 'lg' as never }, message: 'size must be' },
    { props: { items: [{ label: 'A', value: 'x' }], accessibilityLabel: '' }, message: 'accessibilityLabel' },
    { props: { items: [{ label: 'A', value: 'x' }], unstyled: true as never }, message: 'unstyled' },
  ])('fails fast for $message', ({ props, message }) => {
    expect(() =>
      render(
        <UiProvider theme={theme}>
          <KeyValueList {...props} />
        </UiProvider>,
      ),
    ).toThrow(message);
  });
});

describe('KeyValueList native list semantics', () => {
  it('uses list/listitem roles and folds scalar pairs into one accessibility element', () => {
    withPlatformOS('ios', () => {
      render(
        <UiProvider theme={theme}>
          <KeyValueList items={items} accessibilityLabel="Account" testID="native" />
        </UiProvider>,
      );
    });

    const list = screen.getByTestId('native');
    expect(list.tagName).not.toBe('DL');
    expect(screen.getByRole('list', { name: 'Account' })).toBe(list);
    const rows = within(list).getAllByRole('listitem');
    expect(rows).toHaveLength(3);
    expect(rows[0]?.getAttribute('aria-label')).toBe('Member: Ada Lovelace');
    expect(rows[1]?.getAttribute('aria-label')).toBe('Seats: 12');
    // 커스텀 노드는 접히지 않아 내부 요소가 개별적으로 닿을 수 있다.
    expect(rows[2]?.getAttribute('aria-label')).toBeNull();
    expect(within(rows[2] as HTMLElement).getByTestId('status-node')).toBeTruthy();
    expect(within(rows[2] as HTMLElement).getByText('Status')).toBeTruthy();
  });
});
