import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { View } from 'react-native';
import { ToggleGroup } from '../../src/components/toggle-group';
import { UiProvider } from '../../src/components/provider';
import { createTheme } from '../../src/theme/createTheme';

afterEach(cleanup);

const items = [
  { value: 'grid', label: '격자' },
  { value: 'list', label: '목록' },
  { value: 'compact', label: '압축', disabled: true },
] as const;

describe('ToggleGroup single', () => {
  it('exposes a named toolbar and controlled pressed state', () => {
    const onValueChange = vi.fn();
    render(
      <UiProvider>
        <ToggleGroup
          selectionMode="single"
          accessibilityLabel="보기 방식"
          items={items}
          value="grid"
          onValueChange={onValueChange}
        />
      </UiProvider>,
    );

    expect(screen.getByRole('toolbar', { name: '보기 방식' })).toBeTruthy();
    const grid = screen.getByRole('button', { name: '격자' });
    const list = screen.getByRole('button', { name: '목록' });
    expect(grid.tagName).toBe('BUTTON');
    expect(grid.getAttribute('aria-pressed')).toBe('true');
    expect(grid.getAttribute('aria-checked')).toBeNull();
    expect(list.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(list);
    expect(onValueChange).toHaveBeenCalledWith('list');
    fireEvent.click(grid);
    expect(onValueChange).toHaveBeenLastCalledWith(null);
  });

  it('can require one active item and blocks disabled controls', () => {
    const onValueChange = vi.fn();
    render(
      <UiProvider>
        <ToggleGroup
          selectionMode="single"
          accessibilityLabel="보기 방식"
          items={items}
          value="grid"
          allowEmpty={false}
          onValueChange={onValueChange}
        />
      </UiProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: '격자' }));
    fireEvent.click(screen.getByRole('button', { name: '압축' }));
    expect(onValueChange).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: '압축' }).getAttribute('aria-disabled')).toBe('true');
  });
});

describe('ToggleGroup multiple', () => {
  it('adds and removes values in item order without mutating controlled state', () => {
    const onValueChange = vi.fn();
    const value = ['list'] as const;
    render(
      <UiProvider>
        <ToggleGroup
          selectionMode="multiple"
          accessibilityLabel="표시 항목"
          items={items}
          value={value}
          onValueChange={onValueChange}
        />
      </UiProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: '격자' }));
    expect(onValueChange).toHaveBeenCalledWith(['grid', 'list']);
    fireEvent.click(screen.getByRole('button', { name: '목록' }));
    expect(onValueChange).toHaveBeenLastCalledWith([]);
    expect(value).toEqual(['list']);
  });
});

describe('ToggleGroup keyboard and focus', () => {
  it('uses roving focus, skips disabled items, wraps and leaves activation to the native button click', () => {
    const onValueChange = vi.fn();
    render(
      <UiProvider>
        <ToggleGroup
          selectionMode="single"
          accessibilityLabel="보기 방식"
          items={items}
          value="grid"
          onValueChange={onValueChange}
        />
      </UiProvider>,
    );

    const grid = screen.getByRole('button', { name: '격자' });
    const list = screen.getByRole('button', { name: '목록' });
    const compact = screen.getByRole('button', { name: '압축' });
    expect(grid.getAttribute('tabindex')).toBe('0');
    expect(list.getAttribute('tabindex')).toBe('-1');
    expect(compact.getAttribute('tabindex')).toBe('-1');

    act(() => grid.focus());
    fireEvent.keyDown(grid, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(list);
    expect(grid.getAttribute('tabindex')).toBe('-1');
    expect(list.getAttribute('tabindex')).toBe('0');
    expect(onValueChange).not.toHaveBeenCalled();
    fireEvent.keyDown(list, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(grid);
    fireEvent.keyDown(grid, { key: 'End' });
    expect(document.activeElement).toBe(list);
    fireEvent.keyDown(list, { key: 'Enter' });
    fireEvent.keyDown(list, { key: ' ' });
    expect(onValueChange).not.toHaveBeenCalled();
    fireEvent.click(list);
    expect(onValueChange).toHaveBeenCalledOnce();
    expect(onValueChange).toHaveBeenCalledWith('list');
  });

  it('uses vertical arrow keys and can stop at boundaries', () => {
    render(
      <UiProvider>
        <ToggleGroup
          selectionMode="multiple"
          accessibilityLabel="서식"
          orientation="vertical"
          loop={false}
          items={items}
          value={[]}
          onValueChange={() => {}}
        />
      </UiProvider>,
    );
    const grid = screen.getByRole('button', { name: '격자' });
    const list = screen.getByRole('button', { name: '목록' });
    act(() => grid.focus());
    fireEvent.keyDown(grid, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(list);
    fireEvent.keyDown(list, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(list);
    fireEvent.keyDown(list, { key: 'ArrowUp' });
    expect(document.activeElement).toBe(grid);
  });
});

describe('ToggleGroup names, tokens and validation', () => {
  it('requires icon-only names and keeps icons decorative', () => {
    render(
      <UiProvider>
        <ToggleGroup
          selectionMode="single"
          accessibilityLabel="정렬"
          items={[{ value: 'left', icon: <View testID="left-icon" />, accessibilityLabel: '왼쪽 정렬' }]}
          value="left"
          onValueChange={() => {}}
        />
      </UiProvider>,
    );
    expect(screen.getByRole('button', { name: '왼쪽 정렬' })).toBeTruthy();
    expect(screen.getByTestId('left-icon')).toBeTruthy();
  });

  it('derives layout and state colors from the supplied theme and forwards style tails', () => {
    const theme = createTheme('light', {
      colors: {
        primary: '#123456',
        primarySoft: '#234567',
        primaryStrong: '#F0F1F2',
        surfaceSubtle: '#345678',
      },
      spacing: { xs: 3, sm: 9, md: 15 },
      radius: { md: 17, sm: 11 },
      metrics: { control: { sm: 38, md: 46, lg: 54 } },
    });
    render(
      <UiProvider theme={theme}>
        <ToggleGroup
          selectionMode="single"
          accessibilityLabel="보기"
          items={[{ value: 'grid', label: '격자' }]}
          value="grid"
          onValueChange={() => {}}
          size="sm"
          style={{ marginTop: 7 }}
          itemStyle={{ marginLeft: 5 }}
          labelStyle={{ opacity: 0.71 }}
          testID="group"
        />
      </UiProvider>,
    );
    const root = screen.getByTestId('group');
    const item = screen.getByTestId('group-item-0');
    expect(root.style.marginTop).toBe('7px');
    expect(root.style.backgroundColor).toBe('rgb(52, 86, 120)');
    expect(item.style.minHeight).toBe('38px');
    expect(item.style.marginLeft).toBe('5px');
    expect(item.style.backgroundColor).toBe('rgb(35, 69, 103)');
    expect(screen.getByText('격자').style.opacity).toBe('0.71');
  });

  it('fails fast for empty, duplicate, unknown and duplicate selected values', () => {
    expect(() => render(
      <UiProvider>
        <ToggleGroup selectionMode="multiple" accessibilityLabel="빈 그룹" items={[]} value={[]} onValueChange={() => {}} />
      </UiProvider>,
    )).toThrow('at least one');
    expect(() => render(
      <UiProvider>
        <ToggleGroup
          selectionMode="multiple"
          accessibilityLabel="중복"
          items={[{ value: 'a', label: 'A' }, { value: 'a', label: 'A2' }]}
          value={[]}
          onValueChange={() => {}}
        />
      </UiProvider>,
    )).toThrow('duplicated');
    expect(() => render(
      <UiProvider>
        <ToggleGroup
          selectionMode="single"
          accessibilityLabel="알 수 없음"
          items={[{ value: 'a', label: 'A' }]}
          value={'b' as 'a'}
          onValueChange={() => {}}
        />
      </UiProvider>,
    )).toThrow('does not exist');
    expect(() => render(
      <UiProvider>
        <ToggleGroup
          selectionMode="multiple"
          accessibilityLabel="선택 중복"
          items={[{ value: 'a', label: 'A' }]}
          value={['a', 'a']}
          onValueChange={() => {}}
        />
      </UiProvider>,
    )).toThrow('selected more than once');
  });
});
