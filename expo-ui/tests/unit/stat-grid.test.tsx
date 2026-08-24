import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { UiProvider } from '../../src/components/provider';
import { clampStatRatio, StatGrid } from '../../src/components/stat-grid';
import { createTheme } from '../../src/theme/createTheme';

afterEach(cleanup);

const theme = createTheme('light', {
  colors: {
    text: '#0A0B0C',
    textMuted: '#6A6B6C',
    textSubtle: '#8A8B8C',
    line: '#456789',
    surface: '#FDFDFD',
    info: '#112233',
    success: '#223344',
    warning: '#334455',
    danger: '#445566',
    primaryStrong: '#556677',
  },
  spacing: { xs: 3, sm: 9, md: 15, lg: 21 },
});

const items = [
  { label: 'Members', value: '1,204' },
  { label: 'Storage', value: '72%', hint: '7.2 GB of 10 GB', ratio: 0.72, tone: 'warning' },
  { label: 'Failed payments', value: '3', tone: 'danger', ratio: 1.7 },
  { label: 'Uptime', value: '99.9%', tone: 'success', ratio: -0.2 },
  { label: 'Queue', value: '12', tone: 'info', ratio: Number.NaN },
] as const;

describe('StatGrid', () => {
  it('names every cell as a group with label, value, and hint and renders nothing when empty', () => {
    const { container } = render(
      <UiProvider theme={theme}>
        <StatGrid items={[]} testID="empty" />
      </UiProvider>,
    );
    expect(container.innerHTML).toBe('');

    cleanup();
    render(
      <UiProvider theme={theme}>
        <StatGrid items={items} accessibilityLabel="Workspace overview" testID="stats" />
      </UiProvider>,
    );

    expect(screen.getByRole('group', { name: 'Workspace overview' })).toBe(
      screen.getByTestId('stats'),
    );
    const groups = within(screen.getByTestId('stats')).getAllByRole('group');
    expect(groups.map((group) => group.getAttribute('aria-label'))).toEqual([
      'Members, 1,204',
      'Storage, 72%, 7.2 GB of 10 GB',
      'Failed payments, 3',
      'Uptime, 99.9%',
      'Queue, 12',
    ]);
    expect(screen.getByText('7.2 GB of 10 GB')).toBeTruthy();
  });

  it('clamps ratio into [0, 1] and exposes it as a progressbar percentage under the value', () => {
    render(
      <UiProvider theme={theme}>
        <StatGrid items={items} testID="stats" />
      </UiProvider>,
    );

    expect(within(screen.getByTestId('stats-item-0')).queryByRole('progressbar')).toBeNull();
    const storage = screen.getByTestId('stats-bar-1');
    expect(storage.getAttribute('role')).toBe('progressbar');
    expect(storage.getAttribute('aria-label')).toBe('Storage');
    expect(storage.getAttribute('aria-valuemin')).toBe('0');
    expect(storage.getAttribute('aria-valuemax')).toBe('100');
    expect(storage.getAttribute('aria-valuenow')).toBe('72');
    expect(screen.getByTestId('stats-bar-2').getAttribute('aria-valuenow')).toBe('100');
    expect(screen.getByTestId('stats-bar-3').getAttribute('aria-valuenow')).toBe('0');
    expect(screen.getByTestId('stats-bar-4').getAttribute('aria-valuenow')).toBe('0');
    expect(clampStatRatio(Number.POSITIVE_INFINITY)).toBe(0);
    expect(clampStatRatio(0.25)).toBe(0.25);
  });

  it('tints the value and bar by the caller-supplied tone without inferring thresholds', () => {
    render(
      <UiProvider theme={theme}>
        <StatGrid items={items} testID="stats" />
      </UiProvider>,
    );

    expect(screen.getByText('1,204').style.color).toBe('rgb(10, 11, 12)');
    expect(screen.getByText('72%').style.color).toBe('rgb(51, 68, 85)');
    expect(screen.getByText('3').style.color).toBe('rgb(68, 85, 102)');
    expect(screen.getByText('99.9%').style.color).toBe('rgb(34, 51, 68)');
    expect(screen.getByText('12').style.color).toBe('rgb(17, 34, 51)');
    // ratio 1.0 with a danger tone: the bar follows the tone, not a built-in threshold.
    const indicator = screen.getByTestId('stats-bar-2').firstElementChild as HTMLElement;
    expect(indicator.style.backgroundColor).toBe('rgb(68, 85, 102)');
    expect(indicator.style.width).toBe('100%');
    // ratio 0 with a success tone keeps the success color even though the bar is empty.
    const uptimeIndicator = screen.getByTestId('stats-bar-3').firstElementChild as HTMLElement;
    expect(uptimeIndicator.style.backgroundColor).toBe('rgb(34, 51, 68)');
  });

  it('lays cells out in the requested column count with borders only between cells', () => {
    render(
      <UiProvider theme={theme}>
        <StatGrid items={items} columns={3} testID="stats" />
      </UiProvider>,
    );

    const cell = (index: number) => screen.getByTestId(`stats-item-${index}`);
    for (let index = 0; index < items.length; index += 1) {
      expect(cell(index).style.width).toBe(`${100 / 3}%`);
    }
    expect(cell(0).style.borderTopWidth).toBe('0px');
    expect(cell(2).style.borderTopWidth).toBe('0px');
    expect(cell(3).style.borderTopWidth).not.toBe('0px');
    expect(cell(0).style.borderRightWidth).not.toBe('0px');
    expect(cell(2).style.borderRightWidth).toBe('0px');
    expect(cell(4).style.borderRightWidth).not.toBe('0px');
    const root = window.getComputedStyle(screen.getByTestId('stats'));
    expect(root.flexWrap).toBe('wrap');
    expect(root.flexDirection).toBe('row');
    expect(screen.getByTestId('stats').style.borderTopColor).toBe('rgb(69, 103, 137)');
  });

  it('forwards size and style hooks', () => {
    render(
      <UiProvider theme={theme}>
        <StatGrid
          items={items}
          size="sm"
          style={{ marginTop: 7 }}
          itemStyle={{ paddingBottom: 1 }}
          labelStyle={{ letterSpacing: 2 }}
          valueStyle={{ letterSpacing: 3 }}
          hintStyle={{ letterSpacing: 4 }}
          testID="stats"
        />
      </UiProvider>,
    );

    expect(screen.getByTestId('stats').style.marginTop).toBe('7px');
    const cell = screen.getByTestId('stats-item-1');
    expect(cell.style.paddingBottom).toBe('1px');
    expect(window.getComputedStyle(cell).paddingLeft).toBe('15px');
    expect(screen.getByText('Storage').style.letterSpacing).toBe('2px');
    expect(screen.getByText('72%').style.letterSpacing).toBe('3px');
    expect(screen.getByText('7.2 GB of 10 GB').style.letterSpacing).toBe('4px');
  });

  it.each([
    { props: { items, columns: 0 }, message: 'columns must be an integer' },
    { props: { items, columns: 1.5 }, message: 'columns must be an integer' },
    { props: { items: [{ label: 'A', value: '' }] }, message: 'value must be a non-empty string' },
    { props: { items: [{ label: 'A', value: '1' }, { label: 'A', value: '2' }] }, message: 'duplicated' },
    { props: { items: [{ label: 'A', value: '1', tone: 'error' as never }] }, message: 'tone must be' },
    { props: { items: [{ label: 'A', value: '1', ratio: '0.5' as never }] }, message: 'ratio must be a number' },
    { props: { items, size: 'lg' as never }, message: 'size must be' },
    { props: { items, unstyled: true as never }, message: 'unstyled' },
  ])('fails fast for $message', ({ props, message }) => {
    expect(() =>
      render(
        <UiProvider theme={theme}>
          <StatGrid {...props} />
        </UiProvider>,
      ),
    ).toThrow(message);
  });
});
