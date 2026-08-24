import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { UiProvider } from '../../src/components/provider';
import { SegmentedControl } from '../../src/components/segmented-control';
import { createTheme } from '../../src/theme/createTheme';

afterEach(cleanup);

const ITEMS = [
  { value: 'mine', label: 'Mine' },
  { value: 'shared', label: 'Shared' },
  { value: 'archived', label: 'Archived', disabled: true },
] as const;

const theme = createTheme('light', {
  colors: {
    primary: '#102030',
    primaryStrong: '#F0F1F2',
    surface: '#010203',
    surfaceSubtle: '#345678',
    line: '#456789',
    onPrimary: '#56789A',
    text: '#0A0B0C',
    textMuted: '#6A6B6C',
  },
});

describe('SegmentedControl variant', () => {
  it('defaults to the filled look so existing call sites do not change', () => {
    render(
      <UiProvider theme={theme}>
        <SegmentedControl
          items={ITEMS}
          value="mine"
          onValueChange={() => {}}
          accessibilityLabel="Album filter"
          testID="filter"
        />
      </UiProvider>,
    );

    const root = screen.getByTestId('filter');
    const selected = screen.getByTestId('filter-item-0');
    expect(root.style.backgroundColor).toBe('rgb(52, 86, 120)');
    expect(selected.style.backgroundColor).toBe('rgb(240, 241, 242)');
    expect(screen.getByText('Mine').style.color).toBe('rgb(86, 120, 154)');
  });

  it('renders underline with the tabActive indicator and tabActive/tabInactive labels Tabs underline uses', () => {
    render(
      <UiProvider theme={theme}>
        <SegmentedControl
          items={ITEMS}
          value="mine"
          onValueChange={() => {}}
          accessibilityLabel="Album filter"
          variant="underline"
          testID="filter"
        />
      </UiProvider>,
    );

    // 정적 토큰 스타일은 RNW가 atomic class로 컴파일하므로 computed style로 읽는다.
    const root = window.getComputedStyle(screen.getByTestId('filter'));
    const selected = window.getComputedStyle(screen.getByTestId('filter-item-0'));
    const unselected = window.getComputedStyle(screen.getByTestId('filter-item-1'));

    expect(root.backgroundColor).toBe('rgba(0, 0, 0, 0)');
    expect(root.borderBottomWidth).toBe('1px');
    expect(root.borderBottomColor).toBe('rgb(69, 103, 137)');
    expect(root.borderTopWidth).toBe('0px');
    expect(root.padding).toBe('0px');

    // 이 테마는 tabActive/tabInactive를 override하지 않으므로 아래 값은 기본 light
    // 팔레트(#2C3E50/#667085)다. underline이 아직 primary(#102030)/textMuted(#6A6B6C)를
    // 쓴다면 여기서 실패한다 — Tabs underline과 같은 token role임을 고정하는 단언.
    expect(selected.backgroundColor).toBe('rgba(0, 0, 0, 0)');
    expect(selected.borderBottomWidth).toBe('2px');
    expect(selected.borderBottomColor).toBe('rgb(44, 62, 80)');
    expect(selected.borderTopWidth).toBe('0px');
    expect(selected.minHeight).toBe('48px');
    expect(screen.getByText('Mine').style.color).toBe('rgb(44, 62, 80)');

    expect(unselected.backgroundColor).toBe('rgba(0, 0, 0, 0)');
    expect(unselected.borderBottomWidth).toBe('2px');
    expect(unselected.borderBottomColor).toBe('rgba(0, 0, 0, 0)');
    expect(screen.getByText('Shared').style.color).toBe('rgb(102, 112, 133)');
  });

  it('keeps radio semantics, roving focus, and keyboard selection unchanged under the underline variant', () => {
    const onValueChange = vi.fn();
    render(
      <UiProvider theme={theme}>
        <SegmentedControl
          items={ITEMS}
          value="mine"
          onValueChange={onValueChange}
          accessibilityLabel="Album filter"
          variant="underline"
        />
      </UiProvider>,
    );

    expect(screen.getByRole('radiogroup', { name: 'Album filter' })).toBeTruthy();
    const radios = screen.getAllByRole('radio');
    expect(radios.map((radio) => radio.getAttribute('aria-checked'))).toEqual([
      'true',
      'false',
      'false',
    ]);
    expect(radios.map((radio) => radio.getAttribute('tabindex'))).toEqual(['0', '-1', '-1']);
    expect(radios[2]?.getAttribute('aria-disabled')).toBe('true');
    expect(screen.queryByRole('tab')).toBeNull();
    expect(screen.queryByRole('tablist')).toBeNull();

    const mine = screen.getByRole('radio', { name: 'Mine' });
    const shared = screen.getByRole('radio', { name: 'Shared' });
    mine.focus();
    fireEvent.keyDown(mine, { key: 'ArrowRight' });
    expect(onValueChange).toHaveBeenLastCalledWith('shared');
    expect(document.activeElement).toBe(shared);
    fireEvent.keyDown(shared, { key: 'ArrowRight' });
    expect(onValueChange).toHaveBeenLastCalledWith('mine');
    fireEvent.click(shared);
    expect(onValueChange).toHaveBeenLastCalledWith('shared');
  });

  it('rejects an unknown variant before rendering', () => {
    expect(() =>
      render(
        <UiProvider theme={theme}>
          <SegmentedControl
            items={ITEMS}
            value="mine"
            onValueChange={() => {}}
            accessibilityLabel="Album filter"
            variant={'outline' as never}
          />
        </UiProvider>,
      ),
    ).toThrow('variant must be "filled" or "underline"');
  });
});
