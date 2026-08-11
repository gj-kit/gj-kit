import { act, useRef, useState } from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OverlayProvider } from '../../src/components/overlay/provider';
import { I18nManager } from 'react-native';
import { Dialog, DialogPanel } from '../../src/components/dialog';
import { UiProvider } from '../../src/components/provider';
import { Popover } from '../../src/components/popover.web';
import { Select } from '../../src/components/select.web';
import type {
  SelectItem,
  SelectOpenChangeDetails,
} from '../../src/components/select.types';

let triggerDetached = false;
const originalScrollIntoView = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  'scrollIntoView',
);
let scrollIntoView = vi.fn();

function restoreScrollIntoView(): void {
  if (originalScrollIntoView === undefined) {
    delete (HTMLElement.prototype as unknown as Record<string, unknown>).scrollIntoView;
  } else {
    Object.defineProperty(
      HTMLElement.prototype,
      'scrollIntoView',
      originalScrollIntoView,
    );
  }
}

function installWebLayout(): void {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
    function (this: HTMLElement) {
      if (this.hasAttribute('data-gj-web-popover')) {
        return { x: 0, y: 0, width: 240, height: 260 } as DOMRect;
      }
      if (this.getAttribute('role') === 'combobox') {
        return {
          x: triggerDetached ? 10000 : 24,
          y: 24,
          width: 220,
          height: 44,
        } as DOMRect;
      }
      return { x: 0, y: 0, width: 0, height: 44 } as DOMRect;
    },
  );
  scrollIntoView = vi.fn();
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    configurable: true,
    value: scrollIntoView,
  });
}

const defaultItems = [
  {
    value: 'kr',
    label: 'South Korea',
    textValue: 'Korea',
    leading: <span data-testid="kr-leading">KR</span>,
  },
  { value: 'us', label: 'United States', disabled: true },
  { value: 'jp', label: 'Japan', description: 'Asia Pacific' },
  { value: 'de', label: 'Germany' },
] as const satisfies readonly SelectItem<string>[];

interface HarnessProps {
  readonly initialOpen?: boolean;
  readonly initialValue?: string | null;
  readonly items?: readonly SelectItem<string>[];
  readonly label?: string;
  readonly accessibilityLabel?: string;
  readonly description?: string;
  readonly error?: string;
  readonly required?: boolean;
  readonly disabled?: boolean;
  readonly busy?: boolean;
  readonly dismissDisabled?: boolean;
  readonly onOpenChange?: (
    open: boolean,
    details: SelectOpenChangeDetails<string>,
  ) => void;
  readonly onValueChange?: (value: string) => void;
  readonly eventOrder?: string[];
  readonly testID?: string;
}

function Harness({
  initialOpen = false,
  initialValue = 'kr',
  items = defaultItems,
  label = 'Shipping country',
  accessibilityLabel,
  description,
  error,
  required = false,
  disabled = false,
  busy = false,
  dismissDisabled = false,
  onOpenChange,
  onValueChange,
  eventOrder,
  testID,
}: HarnessProps) {
  const [open, setOpen] = useState(initialOpen);
  const [value, setValue] = useState<string | null>(initialValue);
  return (
    <UiProvider>
      <OverlayProvider>
        <Select
          label={label}
          accessibilityLabel={accessibilityLabel}
          placeholder="Choose a country"
          description={description}
          error={error}
          required={required}
          items={items}
          value={value}
          open={open}
          disabled={disabled}
          busy={busy}
          dismissDisabled={dismissDisabled}
          onValueChange={(nextValue) => {
            eventOrder?.push(`value:${nextValue}`);
            onValueChange?.(nextValue);
            setValue(nextValue);
          }}
          onOpenChange={(nextOpen, details) => {
            eventOrder?.push(`open:${details.reason}`);
            onOpenChange?.(nextOpen, details);
            setOpen(nextOpen);
          }}
          testID={testID}
        />
        <button type="button" data-testid="after-select">After select</button>
      </OverlayProvider>
    </UiProvider>
  );
}

function trigger(): HTMLElement {
  return screen.getByRole('combobox', { name: 'Shipping country' });
}

function activeOption(): HTMLElement | null {
  const id = trigger().getAttribute('aria-activedescendant');
  return id === null ? null : document.getElementById(id);
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  restoreScrollIntoView();
  triggerDetached = false;
});

beforeEach(() => {
  installWebLayout();
});

describe('Select web — controlled select-only combobox', () => {
  it('wires visible label, helper/error state, value, listbox relation, hooks, and 44px controls', () => {
    const rendered = render(
      <Harness
        initialValue={null}
        description="Used for delivery estimates"
        required
        testID="country"
      />,
    );
    const control = trigger();
    const label = screen.getByText('Shipping country');
    const helper = screen.getByText('Used for delivery estimates');
    const listboxId = control.getAttribute('aria-controls');

    expect(control.textContent).toContain('Choose a country');
    expect(control.getAttribute('aria-expanded')).toBe('false');
    expect(control.getAttribute('aria-haspopup')).toBe('listbox');
    expect(listboxId).toMatch(/^gj-select-.+-listbox$/);
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(control.getAttribute('aria-labelledby')).toBe(label.id);
    expect(control.getAttribute('aria-describedby')).toBe(helper.id);
    expect(control.getAttribute('aria-required')).toBe('true');
    expect(control.getAttribute('aria-invalid')).toBe('false');
    expect(control.style.minHeight).toBe('44px');
    expect(screen.getByText('*').getAttribute('aria-hidden')).toBe('true');
    expect(screen.getByTestId('country')).toBeTruthy();
    expect(screen.getByTestId('country-trigger')).toBe(control);

    fireEvent.click(control);
    expect(screen.getByRole('listbox').id).toBe(listboxId);

    rendered.rerender(
      <Harness
        initialValue={null}
        description="This is replaced"
        error="Choose a supported country"
        required
        testID="country"
      />,
    );
    const error = screen.getByText('Choose a supported country');
    expect(control.getAttribute('aria-invalid')).toBe('true');
    expect(control.getAttribute('aria-errormessage')).toBe(error.id);
    expect(control.getAttribute('aria-describedby')).toBe(error.id);
    expect(screen.queryByText('This is replaced')).toBeNull();
  });

  it('opens exactly once for a real Enter key sequence and an open Enter commit stays closed', async () => {
    const onOpenChange = vi.fn();
    const onValueChange = vi.fn();
    render(
      <Harness
        onOpenChange={onOpenChange}
        onValueChange={onValueChange}
      />,
    );
    const control = trigger();
    act(() => control.focus());

    await act(async () => {
      fireEvent.keyDown(control, { key: 'Enter' });
      fireEvent.keyUp(control, { key: 'Enter' });
      await Promise.resolve();
    });
    expect(onOpenChange).toHaveBeenCalledTimes(1);
    expect(onOpenChange).toHaveBeenLastCalledWith(
      true,
      expect.objectContaining({ reason: 'trigger-key' }),
    );
    expect(control.getAttribute('aria-expanded')).toBe('true');
    expect(activeOption()?.textContent).toContain('South Korea');
    expect(document.activeElement).toBe(control);

    await act(async () => {
      fireEvent.keyDown(control, { key: 'Enter' });
      fireEvent.keyUp(control, { key: 'Enter' });
      await Promise.resolve();
    });
    expect(onValueChange).not.toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledTimes(2);
    expect(onOpenChange).toHaveBeenLastCalledWith(
      false,
      expect.objectContaining({ reason: 'option-select', value: 'kr' }),
    );
    expect(control.getAttribute('aria-expanded')).toBe('false');
  });

  it('clears an interrupted keyboard guard on blur so the next pointer press is not lost', () => {
    const onOpenChange = vi.fn();
    render(<Harness onOpenChange={onOpenChange} />);
    const control = trigger();
    fireEvent.keyDown(control, { key: 'Enter' });
    expect(control.getAttribute('aria-expanded')).toBe('true');
    fireEvent.blur(control);
    expect(onOpenChange).toHaveBeenLastCalledWith(
      false,
      expect.objectContaining({ reason: 'focus-out' }),
    );
    fireEvent.click(control);
    expect(onOpenChange).toHaveBeenCalledTimes(3);
    expect(control.getAttribute('aria-expanded')).toBe('true');
  });

  it('mirrors the selected item leading visual into the owned trigger', () => {
    render(<Harness />);
    expect(within(trigger()).getByTestId('kr-leading')).toBeTruthy();
    expect(screen.getAllByTestId('kr-leading')).toHaveLength(1);
    fireEvent.click(trigger());
    expect(screen.getAllByTestId('kr-leading')).toHaveLength(2);
  });

  it('keeps focus on the trigger while Arrow/Home/End/typeahead move only the active option', () => {
    const onValueChange = vi.fn();
    render(<Harness initialOpen onValueChange={onValueChange} />);
    const control = trigger();
    const selected = screen.getByRole('option', { name: 'South Korea' });
    expect(document.activeElement).toBe(control);
    expect(activeOption()).toBe(selected);
    expect(selected.getAttribute('aria-selected')).toBe('true');

    fireEvent.keyDown(control, { key: 'ArrowDown' });
    expect(activeOption()?.textContent).toContain('Japan');
    expect(document.activeElement).toBe(control);
    expect(selected.getAttribute('aria-selected')).toBe('true');
    expect(onValueChange).not.toHaveBeenCalled();
    expect(scrollIntoView).toHaveBeenLastCalledWith({ block: 'nearest' });

    fireEvent.keyDown(control, { key: 'End' });
    expect(activeOption()?.textContent).toContain('Germany');
    fireEvent.keyDown(control, { key: 'Home' });
    expect(activeOption()?.textContent).toContain('South Korea');
    fireEvent.keyDown(control, { key: 'j' });
    expect(activeOption()?.textContent).toContain('Japan');
    expect(screen.getByRole('option', { name: 'United States' }).getAttribute('aria-disabled')).toBe('true');
  });

  it('claims focus only after an initially-open parent Popover makes its layer ready', async () => {
    function NestedSelect() {
      const [value, setValue] = useState<
        (typeof defaultItems)[number]['value'] | null
      >('kr');
      return (
        <UiProvider>
          <OverlayProvider>
            <Popover
              triggerLabel="Parent details"
              open
              onOpenChange={() => {}}
              title="Parent details"
              overlayId="select-parent-popover"
            >
              <Select
                label="Nested country"
                placeholder="Choose a nested country"
                items={defaultItems}
                value={value}
                open
                onValueChange={setValue}
                onOpenChange={() => {}}
              />
            </Popover>
          </OverlayProvider>
        </UiProvider>
      );
    }

    render(<NestedSelect />);
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole('combobox', { name: 'Nested country' }),
      ),
    );
  });

  it('keeps an initially-open nested Select above a parent Dialog initial focus target', async () => {
    function NestedSelectInDialog() {
      const parentInitialRef = useRef<HTMLButtonElement | null>(null);
      const [value, setValue] = useState<
        (typeof defaultItems)[number]['value'] | null
      >('kr');
      return (
        <UiProvider>
          <OverlayProvider>
            <Dialog
              visible
              animationType="none"
              overlayId="select-parent-dialog"
              initialFocusRef={parentInitialRef}
              onDismiss={() => {}}
            >
              <DialogPanel title="Select parent dialog">
                <button ref={parentInitialRef} type="button">
                  Parent initial target
                </button>
                <Select
                  label="Dialog country"
                  placeholder="Choose a dialog country"
                  items={defaultItems}
                  value={value}
                  open
                  onValueChange={setValue}
                  onOpenChange={() => {}}
                />
              </DialogPanel>
            </Dialog>
          </OverlayProvider>
        </UiProvider>
      );
    }

    render(<NestedSelectInDialog />);
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole('combobox', { name: 'Dialog country' }),
      ),
    );
  });

  it('commits a changed value before closing and closes a same-value selection without a duplicate callback', async () => {
    const order: string[] = [];
    const onValueChange = vi.fn();
    render(
      <Harness
        initialOpen
        eventOrder={order}
        onValueChange={onValueChange}
      />,
    );
    const control = trigger();
    fireEvent.keyDown(control, { key: 'ArrowDown' });
    fireEvent.keyDown(control, { key: 'Enter' });
    fireEvent.keyUp(control, { key: 'Enter' });
    await Promise.resolve();

    expect(order.slice(0, 2)).toEqual(['value:jp', 'open:option-select']);
    expect(control.getAttribute('aria-expanded')).toBe('false');
    expect(control.textContent).toContain('Japan');
    expect(document.activeElement).toBe(control);

    fireEvent.click(control);
    expect(control.getAttribute('aria-expanded')).toBe('true');
    fireEvent.keyDown(control, { key: ' ' });
    fireEvent.keyUp(control, { key: ' ' });
    await Promise.resolve();
    expect(onValueChange).toHaveBeenCalledTimes(1);
    expect(control.getAttribute('aria-expanded')).toBe('false');
  });

  it('commits the active option on Tab without preventing or restoring browser focus', () => {
    const onOpenChange = vi.fn();
    const onValueChange = vi.fn();
    render(
      <Harness
        initialOpen
        onOpenChange={onOpenChange}
        onValueChange={onValueChange}
      />,
    );
    const control = trigger();
    fireEvent.keyDown(control, { key: 'ArrowDown' });
    const tab = new KeyboardEvent('keydown', {
      key: 'Tab',
      bubbles: true,
      cancelable: true,
    });
    act(() => {
      control.dispatchEvent(tab);
    });
    expect(tab.defaultPrevented).toBe(false);
    expect(onValueChange).toHaveBeenLastCalledWith('jp');
    expect(onOpenChange).toHaveBeenLastCalledWith(
      false,
      expect.objectContaining({ reason: 'tab-key', value: 'jp' }),
    );

    const after = screen.getByTestId('after-select');
    act(() => after.focus());
    expect(document.activeElement).toBe(after);
    expect(control.getAttribute('aria-expanded')).toBe('false');
  });

  it('closes on focus-out, never steals outside pointer focus, and restores for Escape', () => {
    const onOpenChange = vi.fn();
    render(<Harness initialOpen onOpenChange={onOpenChange} />);
    const control = trigger();
    const after = screen.getByTestId('after-select');

    act(() => after.focus());
    expect(onOpenChange).toHaveBeenLastCalledWith(
      false,
      expect.objectContaining({ reason: 'focus-out' }),
    );
    expect(document.activeElement).toBe(after);

    fireEvent.click(control);
    expect(control.getAttribute('aria-expanded')).toBe('true');
    fireEvent.pointerDown(after);
    act(() => after.focus());
    expect(onOpenChange).toHaveBeenLastCalledWith(
      false,
      expect.objectContaining({ reason: 'outside-press' }),
    );
    expect(document.activeElement).toBe(after);

    fireEvent.click(control);
    expect(control.getAttribute('aria-expanded')).toBe('true');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onOpenChange).toHaveBeenLastCalledWith(
      false,
      expect.objectContaining({ reason: 'escape-key' }),
    );
    expect(document.activeElement).toBe(control);
  });

  it('does not reuse rejected Escape focus restoration for a later programmatic close', async () => {
    const onOpenChange = vi.fn();
    function RefusingHarness() {
      const [open, setOpen] = useState(true);
      return (
        <UiProvider>
          <Select
            label="Refusing country"
            placeholder="Choose"
            items={defaultItems}
            value="kr"
            open={open}
            onValueChange={() => {}}
            onOpenChange={(_next, details) => onOpenChange(details)}
          />
          <button type="button" onClick={() => setOpen(false)}>Programmatic close</button>
        </UiProvider>
      );
    }
    render(<RefusingHarness />);
    const control = screen.getByRole('combobox', { name: 'Refusing country' });
    const close = screen.getByRole('button', { name: 'Programmatic close' });
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onOpenChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ reason: 'escape-key' }),
    );
    await act(async () => Promise.resolve());
    act(() => close.focus());
    fireEvent.click(close);
    expect(control.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(close);
  });

  it('restores Escape focus even when a controlled parent closes asynchronously', async () => {
    function DelayedHarness() {
      const [open, setOpen] = useState(true);
      return (
        <UiProvider>
          <Select
            label="Delayed country"
            placeholder="Choose"
            items={defaultItems}
            value="kr"
            open={open}
            onValueChange={() => {}}
            onOpenChange={(nextOpen, details) => {
              if (!nextOpen && details.reason === 'escape-key') {
                setTimeout(() => setOpen(false), 0);
              }
            }}
          />
          <button type="button">Outside target</button>
        </UiProvider>
      );
    }

    render(<DelayedHarness />);
    const control = screen.getByRole('combobox', { name: 'Delayed country' });
    const outside = screen.getByRole('button', { name: 'Outside target' });
    act(() => outside.focus());
    await act(async () => Promise.resolve());

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(document.activeElement).toBe(control);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(control.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(control);
  });

  it('lets busy content dismiss but blocks activation, while dismissDisabled blocks every dismiss route', () => {
    const busyOpen = vi.fn();
    const busyValue = vi.fn();
    render(
      <Harness
        initialOpen
        busy
        onOpenChange={busyOpen}
        onValueChange={busyValue}
      />,
    );
    const control = trigger();
    expect(control.getAttribute('aria-busy')).toBe('true');
    expect(control.getAttribute('aria-activedescendant')).toBeNull();
    expect(screen.getByRole('option', { name: 'South Korea' }).getAttribute('aria-disabled')).toBe('true');
    fireEvent.keyDown(control, { key: 'ArrowDown' });
    fireEvent.keyDown(control, { key: 'Enter' });
    expect(busyValue).not.toHaveBeenCalled();
    expect(control.getAttribute('aria-expanded')).toBe('true');
    fireEvent.pointerDown(document.body);
    expect(busyOpen).toHaveBeenLastCalledWith(
      false,
      expect.objectContaining({ reason: 'outside-press' }),
    );

    cleanup();
    const guardedOpen = vi.fn();
    render(
      <Harness
        initialOpen
        dismissDisabled
        onOpenChange={guardedOpen}
      />,
    );
    const guarded = trigger();
    fireEvent.pointerDown(document.body);
    fireEvent.keyDown(document, { key: 'Escape' });
    fireEvent.click(guarded);
    expect(guardedOpen).not.toHaveBeenCalled();
    expect(guarded.getAttribute('aria-expanded')).toBe('true');
    const tab = new KeyboardEvent('keydown', {
      key: 'Tab',
      bubbles: true,
      cancelable: true,
    });
    act(() => {
      guarded.dispatchEvent(tab);
    });
    expect(tab.defaultPrevented).toBe(false);
    expect(guardedOpen).toHaveBeenLastCalledWith(
      false,
      expect.objectContaining({ reason: 'tab-key' }),
    );
    expect(guarded.getAttribute('aria-expanded')).toBe('false');
  });

  it('preserves an active value through reorder and reconciles removal/value changes', () => {
    const rendered = render(<Harness initialOpen />);
    const control = trigger();
    fireEvent.keyDown(control, { key: 'ArrowDown' });
    expect(activeOption()?.textContent).toContain('Japan');

    const reordered = [defaultItems[2], defaultItems[0], defaultItems[1], defaultItems[3]];
    rendered.rerender(<Harness initialOpen items={reordered} />);
    expect(activeOption()?.textContent).toContain('Japan');

    const withoutActive = [defaultItems[0], defaultItems[1], defaultItems[3]];
    rendered.rerender(<Harness initialOpen items={withoutActive} />);
    expect(activeOption()?.textContent).toContain('South Korea');

    function Direct({ selected }: { readonly selected: 'kr' | 'de' }) {
      return (
        <UiProvider>
          <OverlayProvider>
            <Select
              label="Direct country"
              placeholder="Choose"
              items={defaultItems}
              value={selected}
              open
              onValueChange={() => {}}
              onOpenChange={() => {}}
            />
          </OverlayProvider>
        </UiProvider>
      );
    }
    cleanup();
    const direct = render(<Direct selected="kr" />);
    const directTrigger = screen.getByRole('combobox', { name: 'Direct country' });
    direct.rerender(<Direct selected="de" />);
    const activeId = directTrigger.getAttribute('aria-activedescendant');
    expect(activeId).not.toBeNull();
    expect(document.getElementById(activeId as string)?.textContent).toContain('Germany');
  });

  it('uses a viewport-bounded scrolling list and reports anchor detachment without focus theft', () => {
    const onOpenChange = vi.fn();
    render(<Harness initialOpen onOpenChange={onOpenChange} testID="bounded" />);
    const listbox = screen.getByRole('listbox');
    const popover = listbox.parentElement;
    if (popover === null) throw new Error('Select popover wrapper is missing.');
    expect(listbox.style.maxHeight).toBe('inherit');
    expect(listbox.style.maxWidth).toBe('inherit');
    expect(listbox.style.overflowY).toBe('auto');
    expect(popover.style.maxHeight).toBe(`${window.innerHeight - 68}px`);
    expect(popover.style.maxWidth).toBe(`${window.innerWidth}px`);

    triggerDetached = true;
    fireEvent.scroll(document);
    expect(onOpenChange).toHaveBeenLastCalledWith(
      false,
      expect.objectContaining({ reason: 'anchor-detached' }),
    );
    const after = screen.getByTestId('after-select');
    act(() => after.focus());
    expect(document.activeElement).toBe(after);
  });

  it('inherits the app RTL direction for logical start placement by default', () => {
    const originalRTL = I18nManager.isRTL;
    I18nManager.isRTL = true;
    try {
      render(<Harness initialOpen />);
      const popover = screen.getByRole('listbox').parentElement;
      if (popover === null) throw new Error('Select popover wrapper is missing.');
      expect(popover.getAttribute('data-placement')).toBe('bottom-start');
      // anchor right (244) - floating width (240) = logical RTL start (4)
      expect(popover.style.left).toBe('4px');
    } finally {
      I18nManager.isRTL = originalRTL;
    }
  });

  it('disables unavailable options and a disabled trigger without inventing selection', () => {
    const onOpenChange = vi.fn();
    const onValueChange = vi.fn();
    render(
      <Harness
        disabled
        onOpenChange={onOpenChange}
        onValueChange={onValueChange}
      />,
    );
    const control = trigger();
    expect(control.getAttribute('aria-disabled')).toBe('true');
    expect(control.getAttribute('tabindex')).toBe('-1');
    fireEvent.click(control);
    fireEvent.keyDown(control, { key: 'ArrowDown' });
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it('fails clearly without OverlayProvider and rejects duplicate or unknown runtime values', () => {
    expect(() =>
      render(
        <Select
          label="Country"
          placeholder="Choose"
          items={defaultItems}
          value="kr"
          open={false}
          onValueChange={() => {}}
          onOpenChange={() => {}}
        />,
      ),
    ).toThrow('Select must be rendered inside OverlayProvider.');

    expect(() =>
      render(
        <UiProvider>
          <OverlayProvider>
            <Select
              label="Country"
              placeholder="Choose"
              items={[
                { value: 'same', label: 'One' },
                { value: 'same', label: 'Two' },
              ] as unknown as readonly SelectItem<string>[]}
              value="same"
              open={false}
              onValueChange={() => {}}
              onOpenChange={() => {}}
            />
          </OverlayProvider>
        </UiProvider>,
      ),
    ).toThrow('Select item value "same" is duplicated.');

    expect(() =>
      render(
        <UiProvider>
          <OverlayProvider>
            <Select
              label="Country"
              placeholder="Choose"
              items={defaultItems}
              value={'missing' as 'kr'}
              open={false}
              onValueChange={() => {}}
              onOpenChange={() => {}}
            />
          </OverlayProvider>
        </UiProvider>,
      ),
    ).toThrow('Select value "missing" does not exist in items.');
  });
});
