import { useState } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Menu } from '../../src/components/menu.web';
import type { MenuItem, MenuOpenChangeDetails, MenuSelectDetails } from '../../src/components/menu.types';
import { OverlayProvider } from '../../src/components/overlay/provider';
import { UiProvider } from '../../src/components/provider';

let triggerDetached = false;

function installMeasuredLayout(): ReturnType<typeof vi.spyOn> {
  return vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    if (this.hasAttribute('data-gj-web-popover')) {
      return { x: 0, y: 0, width: 160, height: 220 } as DOMRect;
    }
    if (this.getAttribute('role') === 'button') {
      return { x: triggerDetached ? 10000 : 24, y: 24, width: 100, height: 44 } as DOMRect;
    }
    return { x: 0, y: 0, width: 0, height: 0 } as DOMRect;
  });
}

const defaultItems = [
  { kind: 'action', value: 'open', label: 'Open' },
  { kind: 'action', value: 'archive', label: 'Archive' },
  { kind: 'checkbox', value: 'starred', label: 'Starred', checked: false },
  { kind: 'checkbox', value: 'mixed', label: 'Mixed', checked: 'mixed' },
  { kind: 'action', value: 'disabled', label: 'Disabled', disabled: true },
] as const satisfies readonly MenuItem<string>[];

interface HarnessProps {
  readonly initialOpen?: boolean;
  readonly items?: readonly MenuItem<string>[];
  readonly busy?: boolean;
  readonly disabled?: boolean;
  readonly dismissDisabled?: boolean;
  readonly onOpenChange?: (open: boolean, details: MenuOpenChangeDetails<string>) => void;
  readonly onSelect?: (details: MenuSelectDetails<string>) => void;
  readonly overlayId?: string;
}

function Harness({
  initialOpen = false,
  items = defaultItems,
  busy = false,
  disabled = false,
  dismissDisabled = false,
  onOpenChange,
  onSelect,
}: HarnessProps) {
  const [open, setOpen] = useState(initialOpen);
  return (
    <UiProvider>
      <OverlayProvider>
        <Menu
          triggerLabel="Actions"
          items={items}
          open={open}
          busy={busy}
          disabled={disabled}
          dismissDisabled={dismissDisabled}
          onOpenChange={(nextOpen, details) => {
            onOpenChange?.(nextOpen, details);
            setOpen(nextOpen);
          }}
          onSelect={(details) => onSelect?.(details)}
        />
      </OverlayProvider>
    </UiProvider>
  );
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  triggerDetached = false;
});

beforeEach(() => {
  installMeasuredLayout();
});

function trigger(): HTMLElement {
  return screen.getByRole('button', { name: 'Actions' });
}

describe('Menu web — controlled anchored menu semantics', () => {
  it('owns a Pressable trigger with menu ARIA and focuses the first enabled item when opened', () => {
    render(<Harness />);
    expect(trigger().getAttribute('aria-haspopup')).toBe('menu');
    expect(trigger().getAttribute('aria-expanded')).toBe('false');
    expect(trigger().style.minHeight).toBe('44px');

    fireEvent.click(trigger());
    const menu = screen.getByRole('menu', { name: 'Actions' });
    const first = screen.getByRole('menuitem', { name: 'Open' });
    expect(trigger().getAttribute('aria-expanded')).toBe('true');
    expect(trigger().getAttribute('aria-controls')).toBe(menu.id);
    expect(first.getAttribute('tabindex')).toBe('0');
    expect(document.activeElement).toBe(first);
  });

  it('reasserts initial focus after a browser click sequence refocuses the trigger', () => {
    vi.useFakeTimers();
    try {
      render(<Harness />);
      fireEvent.click(trigger());
      const first = screen.getByRole('menuitem', { name: 'Open' });

      // Chrome may finish the button click's focus behavior after layout effects.
      act(() => trigger().focus());
      expect(document.activeElement).toBe(trigger());
      act(() => vi.runOnlyPendingTimers());
      expect(document.activeElement).toBe(first);
    } finally {
      cleanup();
      vi.clearAllTimers();
      vi.useRealTimers();
    }
  });

  it('uses roving focus with Arrow/Home/End, skips disabled items, and supports Unicode typeahead', () => {
    const items = [
      { kind: 'action', value: 'alpha', label: 'Alpha' },
      { kind: 'action', value: 'hangul', label: '한글 문서' },
      { kind: 'action', value: 'hidden', label: '한글 비활성', disabled: true },
      { kind: 'action', value: 'omega', label: 'Omega' },
    ] as const satisfies readonly MenuItem<string>[];
    render(<Harness initialOpen items={items} />);
    const alpha = screen.getByRole('menuitem', { name: 'Alpha' });
    const hangul = screen.getByRole('menuitem', { name: '한글 문서' });
    const omega = screen.getByRole('menuitem', { name: 'Omega' });

    expect(document.activeElement).toBe(alpha);
    fireEvent.keyDown(alpha, { key: 'End' });
    expect(document.activeElement).toBe(omega);
    fireEvent.keyDown(omega, { key: 'Home' });
    expect(document.activeElement).toBe(alpha);
    fireEvent.keyDown(alpha, { key: 'ArrowUp' });
    expect(document.activeElement).toBe(omega);
    fireEvent.keyDown(omega, { key: '한' });
    expect(document.activeElement).toBe(hangul);
    fireEvent.keyDown(hangul, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(omega);
  });

  it('uses menuitem and menuitemcheckbox roles; actions close by default and checkbox items stay open', () => {
    const onSelect = vi.fn();
    const onOpenChange = vi.fn();
    render(<Harness initialOpen onSelect={onSelect} onOpenChange={onOpenChange} />);
    const checkbox = screen.getByRole('menuitemcheckbox', { name: 'Starred' });
    expect(checkbox.getAttribute('aria-checked')).toBe('false');
    const mixed = screen.getByRole('menuitemcheckbox', { name: 'Mixed' });
    expect(mixed.getAttribute('aria-checked')).toBe('mixed');
    expect(mixed.textContent).toContain('−');
    fireEvent.click(checkbox);
    expect(onSelect).toHaveBeenLastCalledWith(expect.objectContaining({
      kind: 'checkbox',
      value: 'starred',
      checked: true,
    }));
    expect(screen.getByRole('menu')).toBeTruthy();

    fireEvent.click(screen.getByRole('menuitem', { name: 'Open' }));
    expect(onSelect).toHaveBeenLastCalledWith(expect.objectContaining({
      kind: 'action',
      value: 'open',
    }));
    expect(onOpenChange).toHaveBeenLastCalledWith(false, expect.objectContaining({
      reason: 'action-select',
      value: 'open',
    }));
    expect(trigger().getAttribute('aria-expanded')).toBe('false');
  });

  it('activates menu items once through Pressable keyboard semantics and ignores disabled items', () => {
    const onSelect = vi.fn();
    render(<Harness initialOpen onSelect={onSelect} />);
    const open = screen.getByRole('menuitem', { name: 'Open' });
    fireEvent.keyDown(open, { key: 'Enter' });
    fireEvent.keyUp(open, { key: 'Enter' });
    expect(onSelect).toHaveBeenCalledTimes(1);

    cleanup();
    render(<Harness initialOpen onSelect={onSelect} />);
    const checkbox = screen.getByRole('menuitemcheckbox', { name: 'Starred' });
    fireEvent.keyDown(checkbox, { key: ' ' });
    fireEvent.keyUp(checkbox, { key: ' ' });
    expect(onSelect).toHaveBeenCalledTimes(2);
    expect(onSelect).toHaveBeenLastCalledWith(expect.objectContaining({
      kind: 'checkbox',
      value: 'starred',
      checked: true,
    }));
    expect(screen.getByRole('menu')).toBeTruthy();

    cleanup();
    render(<Harness initialOpen onSelect={onSelect} />);
    const disabled = screen.getAllByRole('menuitem', { name: 'Disabled' }).at(-1);
    if (disabled === undefined) throw new Error('Disabled item is missing.');
    fireEvent.keyDown(disabled, { key: ' ' });
    fireEvent.keyUp(disabled, { key: ' ' });
    expect(onSelect).toHaveBeenCalledTimes(2);
  });

  it('restores focus after item selection, bounds long content, and reports Tab without stealing focus', () => {
    const onOpenChange = vi.fn();
    const items = Array.from({ length: 30 }, (_, index) => ({
      kind: 'action' as const,
      value: `item-${index}`,
      label: `Item ${index}`,
    }));
    render(<Harness initialOpen items={items} onOpenChange={onOpenChange} />);
    const menu = screen.getByRole('menu');
    expect(getComputedStyle(menu).overflowY).toBe('auto');
    expect(menu.style.maxHeight).toBe('inherit');
    expect(menu.parentElement?.style.maxHeight).not.toBe('none');
    fireEvent.click(screen.getByRole('menuitem', { name: 'Item 0' }));
    expect(document.activeElement).toBe(trigger());

    fireEvent.click(trigger());
    const first = screen.getByRole('menuitem', { name: 'Item 0' });
    fireEvent.keyDown(first, { key: 'Tab' });
    expect(onOpenChange).toHaveBeenLastCalledWith(
      false,
      expect.objectContaining({ reason: 'tab-key' }),
    );
    expect(document.activeElement).not.toBe(trigger());
  });

  it('routes Escape and outside dismissal through the topmost Menu and restores trigger focus', () => {
    const lower = vi.fn();
    const upper = vi.fn();
    function TwoMenus() {
      const [lowerOpen, setLowerOpen] = useState(true);
      const [upperOpen, setUpperOpen] = useState(true);
      return (
        <UiProvider>
          <OverlayProvider>
            <Menu
              triggerLabel="Lower"
              items={defaultItems}
              open={lowerOpen}
              onOpenChange={(next, details) => { lower(next, details); setLowerOpen(next); }}
              onSelect={() => {}}
            />
            <Menu
              triggerLabel="Upper"
              items={defaultItems}
              open={upperOpen}
              onOpenChange={(next, details) => { upper(next, details); setUpperOpen(next); }}
              onSelect={() => {}}
            />
          </OverlayProvider>
        </UiProvider>
      );
    }
    render(<TwoMenus />);
    fireEvent.pointerDown(document.body);
    expect(lower).not.toHaveBeenCalled();
    expect(upper).toHaveBeenLastCalledWith(false, expect.objectContaining({ reason: 'outside-press' }));

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(lower).toHaveBeenLastCalledWith(false, expect.objectContaining({ reason: 'escape-key' }));
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Lower' }));
  });

  it('busy blocks selection while dismiss remains available, and dismissDisabled blocks all dismiss routes', () => {
    const busySelect = vi.fn();
    render(<Harness initialOpen busy onSelect={busySelect} />);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Open' }));
    expect(busySelect).not.toHaveBeenCalled();
    fireEvent.pointerDown(document.body);
    expect(trigger().getAttribute('aria-expanded')).toBe('false');

    const guarded = vi.fn();
    cleanup();
    render(<Harness initialOpen dismissDisabled onOpenChange={guarded} />);
    fireEvent.pointerDown(document.body);
    fireEvent.keyDown(document, { key: 'Escape' });
    fireEvent.click(screen.getAllByRole('button', { name: 'Actions' }).at(-1) as HTMLElement);
    expect(guarded).not.toHaveBeenCalled();
    expect(screen.getAllByRole('menu', { hidden: true })).toHaveLength(1);
  });

  it('requests a close when scrolling detaches the anchor', () => {
    const onOpenChange = vi.fn();
    render(<Harness initialOpen onOpenChange={onOpenChange} />);
    triggerDetached = true;
    fireEvent.scroll(document);
    expect(onOpenChange).toHaveBeenLastCalledWith(false, expect.objectContaining({
      reason: 'anchor-detached',
    }));
    expect(trigger().getAttribute('aria-expanded')).toBe('false');
  });

  it('fails clearly without OverlayProvider and validates impossible runtime input', () => {
    expect(() =>
      render(
        <Menu
          triggerLabel="Actions"
          items={defaultItems}
          open={false}
          onOpenChange={() => {}}
          onSelect={() => {}}
        />,
      ),
    ).toThrow('Menu requires the overlay dismissal stack');

    expect(() =>
      render(
        <UiProvider>
          <OverlayProvider>
            <Menu
              triggerLabel="Actions"
              items={[
                { kind: 'action', value: 'same', label: 'One' },
                { kind: 'action', value: 'same', label: 'Two' },
              ] as unknown as readonly MenuItem<string>[]}
              open={false}
              onOpenChange={() => {}}
              onSelect={() => {}}
            />
          </OverlayProvider>
        </UiProvider>,
      ),
    ).toThrow('Menu item value "same" is duplicated.');

    expect(() =>
      render(
        <UiProvider>
          <OverlayProvider>
            <Menu
              triggerLabel="Actions"
              items={[
                { kind: 'unexpected', value: 'wrong', label: 'Wrong' },
              ] as unknown as readonly MenuItem<string>[]}
              open={false}
              onOpenChange={() => {}}
              onSelect={() => {}}
            />
          </OverlayProvider>
        </UiProvider>,
      ),
    ).toThrow('Menu item "wrong" kind must be "action" or "checkbox".');

    expect(() =>
      render(
        <UiProvider>
          <OverlayProvider>
            <Menu
              triggerLabel="Actions"
              items={defaultItems}
              direction={'sideways' as 'ltr'}
              open={false}
              onOpenChange={() => {}}
              onSelect={() => {}}
            />
          </OverlayProvider>
        </UiProvider>,
      ),
    ).toThrow('Menu direction "sideways" is not supported.');
  });
});
