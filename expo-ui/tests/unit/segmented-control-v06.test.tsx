import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { UiProvider } from '../../src/components/provider';
import { SegmentedControl } from '../../src/components/segmented-control';
import { createTheme } from '../../src/theme/createTheme';

afterEach(cleanup);

const ITEMS = [
  { value: 'day', label: 'Day' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month', disabled: true },
] as const;

describe('SegmentedControl', () => {
  it('exposes a required named radio group with one selected roving tab stop', () => {
    render(
      <UiProvider>
        <SegmentedControl
          items={ITEMS}
          value="day"
          onValueChange={() => {}}
          accessibilityLabel="Time range"
        />
      </UiProvider>,
    );

    expect(screen.getByRole('radiogroup', { name: 'Time range' })).toBeTruthy();
    const radios = screen.getAllByRole('radio');
    expect(radios).toHaveLength(3);
    expect(radios[0]?.getAttribute('aria-checked')).toBe('true');
    expect(radios[0]?.getAttribute('tabindex')).toBe('0');
    expect(radios[1]?.getAttribute('aria-checked')).toBe('false');
    expect(radios[1]?.getAttribute('tabindex')).toBe('-1');
    expect(radios[2]?.getAttribute('aria-disabled')).toBe('true');
    expect(radios[2]?.getAttribute('tabindex')).toBe('-1');
  });

  it('selects a different item by click or Space but not Enter or a selected item', () => {
    const onValueChange = vi.fn();
    render(
      <UiProvider>
        <SegmentedControl
          items={ITEMS}
          value="day"
          onValueChange={onValueChange}
          accessibilityLabel="Time range"
        />
      </UiProvider>,
    );

    const day = screen.getByRole('radio', { name: 'Day' });
    const week = screen.getByRole('radio', { name: 'Week' });
    fireEvent.keyDown(week, { key: 'Enter' });
    fireEvent.click(day);
    expect(onValueChange).not.toHaveBeenCalled();

    fireEvent.keyDown(week, { key: ' ' });
    fireEvent.click(week);
    expect(onValueChange).toHaveBeenNthCalledWith(1, 'week');
    expect(onValueChange).toHaveBeenNthCalledWith(2, 'week');
  });

  it('arrow keys and Home/End wrap, skip disabled choices, select, and move DOM focus', () => {
    const onValueChange = vi.fn();
    render(
      <UiProvider>
        <SegmentedControl
          items={ITEMS}
          value="day"
          onValueChange={onValueChange}
          accessibilityLabel="Time range"
        />
      </UiProvider>,
    );

    const day = screen.getByRole('radio', { name: 'Day' });
    const week = screen.getByRole('radio', { name: 'Week' });
    day.focus();
    fireEvent.keyDown(day, { key: 'ArrowRight' });
    expect(onValueChange).toHaveBeenLastCalledWith('week');
    expect(document.activeElement).toBe(week);

    fireEvent.keyDown(week, { key: 'ArrowDown' });
    expect(onValueChange).toHaveBeenLastCalledWith('day');
    expect(document.activeElement).toBe(day);

    fireEvent.keyDown(day, { key: 'End' });
    expect(onValueChange).toHaveBeenLastCalledWith('week');
    expect(document.activeElement).toBe(week);

    fireEvent.keyDown(week, { key: 'Home' });
    expect(onValueChange).toHaveBeenLastCalledWith('day');
    expect(document.activeElement).toBe(day);
  });

  it('keeps disabled choices inert and moves the tab stop to an enabled choice when value is disabled', () => {
    const onValueChange = vi.fn();
    render(
      <UiProvider>
        <SegmentedControl
          items={ITEMS}
          value="month"
          onValueChange={onValueChange}
          accessibilityLabel="Time range"
        />
      </UiProvider>,
    );

    const day = screen.getByRole('radio', { name: 'Day' });
    const month = screen.getByRole('radio', { name: 'Month' });
    expect(day.getAttribute('tabindex')).toBe('0');
    expect(month.getAttribute('aria-checked')).toBe('true');
    expect(month.getAttribute('tabindex')).toBe('-1');
    fireEvent.click(month);
    fireEvent.keyDown(month, { key: ' ' });
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it('uses theme tokens and forwards root and segment style tails', () => {
    const theme = createTheme('light', {
      colors: {
        primaryStrong: '#F0F1F2',
        surface: '#010203',
        surfaceSubtle: '#345678',
        line: '#456789',
        onPrimary: '#56789A',
      },
      spacing: { xs: 3, sm: 9, md: 15 },
      radius: { md: 17, sm: 11 },
      metrics: { control: { sm: 38, md: 46, lg: 54 } },
    });
    render(
      <UiProvider theme={theme}>
        <SegmentedControl
          items={ITEMS}
          value="day"
          onValueChange={() => {}}
          accessibilityLabel="Time range"
          size="sm"
          fit="content"
          style={{ marginTop: 7 }}
          itemStyle={{ marginLeft: 5 }}
          testID="segments"
        />
      </UiProvider>,
    );

    const root = screen.getByTestId('segments');
    const day = screen.getByTestId('segments-item-0');
    expect(root.style.marginTop).toBe('7px');
    expect(root.style.backgroundColor).toBe('rgb(52, 86, 120)');
    expect(root.style.width).toBe('');
    expect(day.style.minHeight).toBe('38px');
    expect(day.style.marginLeft).toBe('5px');
    expect(day.style.backgroundColor).toBe('rgb(240, 241, 242)');
    expect(screen.getByText('Day').style.color).toBe('rgb(86, 120, 154)');
  });

  it.each([
    {
      props: {
        items: [],
        value: 'day',
        accessibilityLabel: 'Time range',
      },
      message: 'at least one',
    },
    {
      props: {
        items: [
          { value: 'day', label: 'Day' },
          { value: 'day', label: 'Duplicate' },
        ],
        value: 'day',
        accessibilityLabel: 'Time range',
      },
      message: 'duplicated',
    },
    {
      props: {
        items: [{ value: 'day', label: 'Day' }],
        value: 'week',
        accessibilityLabel: 'Time range',
      },
      message: 'does not exist',
    },
    {
      props: {
        items: [{ value: 'day', label: 'Day' }],
        value: 'day',
        accessibilityLabel: '  ',
      },
      message: 'non-empty',
    },
  ])('fails fast for $message input', ({ props, message }) => {
    expect(() => render(
      <UiProvider>
        <SegmentedControl
          {...(props as {
            items: readonly { value: string; label: string }[];
            value: string;
            accessibilityLabel: string;
          })}
          onValueChange={() => {}}
        />
      </UiProvider>,
    )).toThrow(message);
  });
});
