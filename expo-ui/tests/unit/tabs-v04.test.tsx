import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Tabs } from '../../src/components/tabs';
import { UiProvider } from '../../src/components/provider';

afterEach(cleanup);

const ITEMS = [
  { label: '개요', value: 'overview' },
  { label: '설정', value: 'settings', disabled: true },
  { label: '기록', value: 'history' },
] as const;

const PANELS = {
  overview: '개요 패널',
  settings: '설정 패널',
  history: '기록 패널',
} as const;

describe('Tabs v0.4 accessibility contract', () => {
  it('exposes a named tablist, selected state, and panel relation', () => {
    render(
      <UiProvider>
        <Tabs
          items={ITEMS}
          value="overview"
          onChange={() => {}}
          accessibilityLabel="계정 화면"
          panels={PANELS}
        />
      </UiProvider>,
    );

    expect(screen.getByRole('tablist', { name: '계정 화면' })).toBeTruthy();
    const tabs = screen.getAllByRole('tab');
    expect(tabs).toHaveLength(3);
    expect(tabs[0]?.id).toMatch(/^gj-tabs-.*-0-tab$/);
    expect(tabs[0]?.getAttribute('aria-selected')).toBe('true');
    expect(tabs[0]?.getAttribute('aria-controls')).toMatch(/^gj-tabs-.*-0-panel$/);
    expect(tabs[0]?.getAttribute('tabindex')).toBe('0');
    expect(tabs[1]?.getAttribute('aria-disabled')).toBe('true');
    expect(tabs[1]?.getAttribute('tabindex')).toBe('-1');
    expect(tabs[2]?.getAttribute('tabindex')).toBe('-1');
  });

  it('wraps arrow focus, skips disabled tabs, and automatically selects', () => {
    const onChange = vi.fn();
    render(
      <UiProvider>
        <Tabs
          items={ITEMS}
          value="overview"
          onChange={onChange}
          accessibilityLabel="계정 화면"
          panels={PANELS}
        />
      </UiProvider>,
    );
    const overview = screen.getByRole('tab', { name: '개요' });
    const history = screen.getByRole('tab', { name: '기록' });

    overview.focus();
    fireEvent.keyDown(overview, { key: 'ArrowRight' });
    expect(onChange).toHaveBeenLastCalledWith('history');
    expect(document.activeElement).toBe(history);

    fireEvent.keyDown(history, { key: 'ArrowRight' });
    expect(onChange).toHaveBeenLastCalledWith('overview');
    expect(document.activeElement).toBe(overview);
  });

  it('supports Home, End, Enter, Space, and pointer activation', () => {
    const onChange = vi.fn();
    render(
      <UiProvider>
        <Tabs
          items={ITEMS}
          value="overview"
          onChange={onChange}
          accessibilityLabel="계정 화면"
          panels={PANELS}
        />
      </UiProvider>,
    );
    const overview = screen.getByRole('tab', { name: '개요' });
    const history = screen.getByRole('tab', { name: '기록' });
    const disabled = screen.getByRole('tab', { name: '설정' });

    fireEvent.keyDown(overview, { key: 'End' });
    expect(onChange).toHaveBeenLastCalledWith('history');
    expect(document.activeElement).toBe(history);
    fireEvent.keyDown(history, { key: 'Home' });
    expect(onChange).toHaveBeenLastCalledWith('overview');
    fireEvent.keyDown(history, { key: 'Enter' });
    fireEvent.keyDown(history, { key: ' ' });
    fireEvent.click(history);
    expect(onChange).toHaveBeenCalledWith('history');
    fireEvent.click(disabled);
    expect(onChange).not.toHaveBeenCalledWith('settings');
  });

  it('falls back to the first enabled tab for the only tab stop', () => {
    render(
      <UiProvider>
        <Tabs
          items={ITEMS}
          value="settings"
          onChange={() => {}}
          accessibilityLabel="계정 화면"
          panels={PANELS}
        />
      </UiProvider>,
    );
    const overview = screen.getByRole('tab', { name: '개요' });
    expect(overview.getAttribute('tabindex')).toBe('0');
    expect(overview.getAttribute('aria-selected')).toBe('false');
    expect(screen.getAllByRole('tabpanel', { hidden: true }).every(
      (panel) => panel.getAttribute('aria-hidden') === 'true',
    )).toBe(true);
    expect(screen.getByRole('tab', { name: '설정' }).getAttribute('tabindex')).toBe('-1');
  });

  it('can own complete tabpanel relations and hide inactive content', () => {
    render(
      <UiProvider>
        <Tabs
          accessibilityLabel="계정 화면"
          items={ITEMS}
          value="overview"
          onChange={() => {}}
          panels={PANELS}
          panelStyle={{ display: 'flex' }}
        />
      </UiProvider>,
    );

    const tabs = screen.getAllByRole('tab');
    const panels = screen.getAllByRole('tabpanel', { hidden: true });
    expect(panels).toHaveLength(3);
    expect(tabs[0]?.getAttribute('aria-controls')).toBe(panels[0]?.id);
    expect(panels[0]?.getAttribute('aria-labelledby')).toBe(tabs[0]?.id);
    expect(panels[0]?.getAttribute('aria-hidden')).toBeNull();
    expect(panels[1]?.getAttribute('aria-hidden')).toBe('true');
    expect(window.getComputedStyle(panels[1]!).display).toBe('none');
  });

  it('active-only도 모든 aria-controls 대상을 보존하고 inactive content만 unmount한다', () => {
    render(
      <UiProvider>
        <Tabs
          accessibilityLabel="계정 화면"
          items={ITEMS}
          value="overview"
          onChange={() => {}}
          panels={PANELS}
          panelMountStrategy="active-only"
        />
      </UiProvider>,
    );

    const tabs = screen.getAllByRole('tab');
    const panels = screen.getAllByRole('tabpanel', { hidden: true });
    expect(panels).toHaveLength(3);
    expect(tabs.every((tab) => document.getElementById(tab.getAttribute('aria-controls')!))).toBe(true);
    expect(screen.getByText('개요 패널')).toBeTruthy();
    expect(screen.queryByText('설정 패널')).toBeNull();
    expect(screen.queryByText('기록 패널')).toBeNull();
  });
});
