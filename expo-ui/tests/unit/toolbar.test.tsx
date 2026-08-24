import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Button } from '../../src/components/button';
import { SearchField } from '../../src/components/fields';
import { UiProvider } from '../../src/components/provider';
import { Toolbar } from '../../src/components/toolbar';
import { createTheme } from '../../src/theme/createTheme';

afterEach(cleanup);

const theme = createTheme('light', {
  colors: { surface: '#FDFDFD', line: '#456789' },
  spacing: { xs: 3, sm: 9, md: 15, lg: 21 },
});

describe('Toolbar', () => {
  it('is a named toolbar landmark whose children keep their own focus and handlers', () => {
    const onPress = vi.fn();
    render(
      <UiProvider theme={theme}>
        <Toolbar accessibilityLabel="Member filters" testID="filters">
          <SearchField value="" onChangeText={() => {}} />
          <Button label="Export" onPress={onPress} />
        </Toolbar>
      </UiProvider>,
    );

    const toolbar = screen.getByRole('toolbar', { name: 'Member filters' });
    expect(toolbar).toBe(screen.getByTestId('filters'));
    expect(toolbar.getAttribute('aria-orientation')).toBe('horizontal');
    // 라이브러리는 roving tabindex를 더하지 않는다 — Tab 순서와 포커스는 자식이 소유한다.
    expect(toolbar.getAttribute('tabindex')).toBeNull();
    const button = within(toolbar).getByRole('button', { name: 'Export' });
    expect(button.getAttribute('tabindex')).not.toBe('-1');
    fireEvent.keyDown(toolbar, { key: 'ArrowRight' });
    expect(document.activeElement).not.toBe(button);
    fireEvent.click(button);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('wraps by default with the sm gap and start alignment, and honors gap, align, and wrap', () => {
    render(
      <UiProvider theme={theme}>
        <Toolbar accessibilityLabel="Defaults" testID="defaults">
          <Button label="A" onPress={() => {}} />
        </Toolbar>
        <Toolbar accessibilityLabel="Tuned" testID="tuned" gap="lg" align="space-between" wrap={false}>
          <Button label="B" onPress={() => {}} />
        </Toolbar>
        <Toolbar accessibilityLabel="End" testID="end" align="end">
          <Button label="C" onPress={() => {}} />
        </Toolbar>
      </UiProvider>,
    );

    const defaults = screen.getByTestId('defaults');
    expect(window.getComputedStyle(defaults).flexDirection).toBe('row');
    expect(window.getComputedStyle(defaults).alignItems).toBe('center');
    expect(defaults.style.flexWrap).toBe('wrap');
    expect(defaults.style.gap).toBe('9px');
    expect(defaults.style.justifyContent).toBe('flex-start');
    expect(defaults.style.borderTopWidth).toBe('');

    const tuned = screen.getByTestId('tuned');
    expect(tuned.style.flexWrap).toBe('nowrap');
    expect(tuned.style.gap).toBe('21px');
    expect(tuned.style.justifyContent).toBe('space-between');
    expect(screen.getByTestId('end').style.justifyContent).toBe('flex-end');
  });

  it('draws a bordered surface with padding only when asked and forwards the style tail', () => {
    render(
      <UiProvider theme={theme}>
        <Toolbar accessibilityLabel="Bordered" testID="bordered" bordered style={{ marginTop: 7 }}>
          <Button label="A" onPress={() => {}} />
        </Toolbar>
      </UiProvider>,
    );

    const bordered = screen.getByTestId('bordered');
    expect(bordered.style.backgroundColor).toBe('rgb(253, 253, 253)');
    expect(bordered.style.borderTopColor).toBe('rgb(69, 103, 137)');
    expect(window.getComputedStyle(bordered).borderTopWidth).not.toBe('0px');
    expect(window.getComputedStyle(bordered).paddingLeft).toBe('15px');
    expect(window.getComputedStyle(bordered).paddingTop).toBe('9px');
    expect(bordered.style.marginTop).toBe('7px');
  });

  it.each([
    { props: { accessibilityLabel: '  ' }, message: 'accessibilityLabel must be a non-empty string' },
    { props: { accessibilityLabel: 'X', align: 'stretch' as never }, message: 'align must be' },
    { props: { accessibilityLabel: 'X', gap: 'huge' as never }, message: 'not a spacing token' },
    { props: { accessibilityLabel: 'X', unstyled: true as never }, message: 'unstyled' },
  ])('fails fast for $message', ({ props, message }) => {
    expect(() =>
      render(
        <UiProvider theme={theme}>
          <Toolbar {...props}>
            <Button label="A" onPress={() => {}} />
          </Toolbar>
        </UiProvider>,
      ),
    ).toThrow(message);
  });
});
