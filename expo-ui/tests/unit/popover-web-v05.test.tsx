import {
  act,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import type { ReactNode } from 'react';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Text } from 'react-native';
import { Dialog, DialogPanel } from '../../src/components/dialog';
import type { DialogFocusRef } from '../../src/components/dialog';
import { useOverlayParentId } from '../../src/components/overlay/layer';
import { OverlayProvider } from '../../src/components/overlay/provider';
import { Popover } from '../../src/components/popover.web';
import type {
  PopoverOpenChangeDetails,
  PopoverProps,
} from '../../src/components/popover.types';
import { UiProvider } from '../../src/components/provider';
import { enStrings } from '../../src/strings/strings';

let triggerDetached = false;

interface BooleanStore {
  readonly getSnapshot: () => boolean;
  readonly subscribe: (listener: () => void) => () => void;
  readonly set: (next: boolean) => void;
}

function createBooleanStore(initial: boolean): BooleanStore {
  let value = initial;
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => value,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    set: (next) => {
      if (next === value) return;
      value = next;
      for (const listener of listeners) listener();
    },
  };
}

function useBooleanStore(initial: boolean): readonly [boolean, (next: boolean) => void] {
  const storeRef = useRef<BooleanStore | null>(null);
  if (storeRef.current === null) storeRef.current = createBooleanStore(initial);
  const store = storeRef.current;
  const value = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getSnapshot,
  );
  return [value, store.set];
}

function installMeasuredLayout(): void {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
    function (this: HTMLElement) {
      if (this.hasAttribute('data-gj-web-popover')) {
        return { x: 0, y: 0, width: 320, height: 260 } as DOMRect;
      }
      if (this.getAttribute('aria-haspopup') === 'dialog') {
        return {
          x: triggerDetached ? 10000 : 24,
          y: 24,
          width: 132,
          height: 44,
        } as DOMRect;
      }
      return { x: 0, y: 0, width: 0, height: 0 } as DOMRect;
    },
  );
}

interface HarnessProps {
  readonly initialOpen?: boolean;
  readonly dismissDisabled?: boolean;
  readonly disabled?: boolean;
  readonly acceptRequests?: boolean;
  readonly overlayId?: string;
  readonly initialFocusRef?: DialogFocusRef;
  readonly onOpenChange?: (
    open: boolean,
    details: PopoverOpenChangeDetails,
  ) => void;
  readonly children?: NonNullable<ReactNode>;
  readonly includeBefore?: boolean;
  readonly includeAfter?: boolean;
}

function Harness({
  initialOpen = false,
  dismissDisabled = false,
  disabled = false,
  acceptRequests = true,
  overlayId,
  initialFocusRef,
  onOpenChange,
  children = <Text>Rich details</Text>,
  includeBefore = true,
  includeAfter = true,
}: HarnessProps) {
  const [open, setOpen] = useState(initialOpen);
  return (
    <UiProvider>
      <OverlayProvider>
        {includeBefore ? (
          <button type="button" data-testid="before-popover">
            Before popover
          </button>
        ) : null}
        <Popover
          triggerLabel="Account details"
          open={open}
          onOpenChange={(nextOpen, details) => {
            onOpenChange?.(nextOpen, details);
            if (acceptRequests) setOpen(nextOpen);
          }}
          title="Account summary"
          description="Review the active workspace."
          disabled={disabled}
          dismissDisabled={dismissDisabled}
          initialFocusRef={initialFocusRef}
          overlayId={overlayId}
          testID="web-popover"
        >
          {children}
        </Popover>
        {includeAfter ? (
          <button type="button" data-testid="after-popover">
            After popover
          </button>
        ) : null}
      </OverlayProvider>
    </UiProvider>
  );
}

function ParentProbe({
  capture,
}: {
  readonly capture: (parentId: string | undefined) => void;
}) {
  const parentId = useOverlayParentId();
  useLayoutEffect(() => {
    capture(parentId);
  }, [capture, parentId]);
  return <Text>Nested overlay content</Text>;
}

function trigger(): HTMLElement {
  return screen.getByRole('button', { name: 'Account details' });
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  triggerDetached = false;
});

beforeEach(() => {
  installMeasuredLayout();
});

describe('Popover web — non-modal rich dialog', () => {
  it('owns its trigger, names and describes the dialog, and focuses the built-in close action', async () => {
    render(
      <Harness initialOpen>
        <button type="button">Body action</button>
      </Harness>,
    );

    const control = trigger();
    const dialog = screen.getByRole('dialog', { name: 'Account summary' });
    const title = screen.getByText('Account summary');
    const description = screen.getByText('Review the active workspace.');
    const close = screen.getByRole('button', { name: 'Close' });

    expect(control.getAttribute('aria-haspopup')).toBe('dialog');
    expect(control.getAttribute('aria-expanded')).toBe('true');
    expect(control.getAttribute('aria-controls')).toBe(dialog.id);
    expect(control.getAttribute('popovertarget')).toBe(dialog.id);
    expect(control.getAttribute('popovertargetaction')).toBe('show');
    expect(dialog.getAttribute('aria-labelledby')).toBe(title.id);
    expect(dialog.getAttribute('aria-describedby')).toBe(description.id);
    expect(screen.getByRole('button', { name: 'Body action' })).toBeTruthy();
    expect(
      getComputedStyle(screen.getByTestId('web-popover-body-scroll')).overflowY,
    ).toBe('auto');
    await waitFor(() => expect(document.activeElement).toBe(close));
  });

  it('restores the trigger for close and Escape, while an outside press keeps outside focus', async () => {
    const onOpenChange = vi.fn();
    render(<Harness initialOpen onOpenChange={onOpenChange} />);
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole('button', { name: 'Close' }),
      ),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onOpenChange).toHaveBeenLastCalledWith(
      false,
      expect.objectContaining({ reason: 'close-action' }),
    );
    expect(document.activeElement).toBe(trigger());
    expect(trigger().getAttribute('popovertarget')).toBeNull();

    fireEvent.click(trigger());
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onOpenChange).toHaveBeenLastCalledWith(
      false,
      expect.objectContaining({ reason: 'escape-key' }),
    );
    expect(document.activeElement).toBe(trigger());

    fireEvent.click(trigger());
    const after = screen.getByTestId('after-popover');
    fireEvent.pointerDown(after);
    act(() => after.focus());
    expect(onOpenChange).toHaveBeenLastCalledWith(
      false,
      expect.objectContaining({ reason: 'outside-press' }),
    );
    expect(document.activeElement).toBe(after);
  });

  it('lets its owned trigger close an open Popover without a blur-driven reopen', async () => {
    const onOpenChange = vi.fn();
    render(<Harness initialOpen onOpenChange={onOpenChange} />);
    const control = trigger();
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole('button', { name: 'Close' }),
      ),
    );

    fireEvent.pointerDown(control);
    act(() => control.focus());
    fireEvent.pointerUp(control);
    fireEvent.click(control);
    expect(onOpenChange).toHaveBeenLastCalledWith(
      false,
      expect.objectContaining({ reason: 'trigger-press' }),
    );
    expect(control.getAttribute('aria-expanded')).toBe('false');
  });

  it('lets Tab and focus-out close even when other dismissal is disabled, without trapping focus', async () => {
    const onOpenChange = vi.fn();
    render(
      <Harness
        initialOpen
        dismissDisabled
        onOpenChange={onOpenChange}
      />,
    );
    const close = screen.getByRole('button', { name: 'Close' });
    expect(close.getAttribute('aria-disabled')).toBe('true');
    await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
    fireEvent.pointerDown(document.body);
    fireEvent.keyDown(document, { key: 'Escape' });
    fireEvent.click(close);
    expect(onOpenChange).not.toHaveBeenCalled();

    const tab = new KeyboardEvent('keydown', {
      key: 'Tab',
      bubbles: true,
      cancelable: true,
    });
    act(() => close.dispatchEvent(tab));
    expect(tab.defaultPrevented).toBe(false);
    const after = screen.getByTestId('after-popover');
    const endGuard = document.querySelector<HTMLElement>(
      '[data-gj-focus-guard="end"]',
    );
    expect(endGuard).not.toBeNull();
    act(() => endGuard?.focus());
    await waitFor(() =>
      expect(onOpenChange).toHaveBeenLastCalledWith(
        false,
        expect.objectContaining({ reason: 'tab-key' }),
      ),
    );
    expect(onOpenChange).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(after);

    cleanup();
    const focusOut = vi.fn();
    render(
      <Harness
        initialOpen
        dismissDisabled
        onOpenChange={focusOut}
      />,
    );
    const panel = screen.getByTestId('web-popover-panel');
    const next = screen.getByTestId('after-popover');
    fireEvent.blur(panel, { relatedTarget: next });
    expect(focusOut).toHaveBeenLastCalledWith(
      false,
      expect.objectContaining({ reason: 'focus-out' }),
    );
  });

  it('keeps the Popover open when Tab moves to another control inside its body', async () => {
    const onOpenChange = vi.fn();
    render(
      <Harness
        initialOpen
        onOpenChange={onOpenChange}
      >
        <button type="button">Body action</button>
      </Harness>,
    );
    const close = screen.getByRole('button', { name: 'Close' });
    const bodyAction = screen.getByRole('button', { name: 'Body action' });
    await waitFor(() => expect(document.activeElement).toBe(close));

    const tab = new KeyboardEvent('keydown', {
      key: 'Tab',
      bubbles: true,
      cancelable: true,
    });
    act(() => {
      close.dispatchEvent(tab);
      bodyAction.focus();
    });
    await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));

    expect(tab.defaultPrevented).toBe(false);
    expect(document.activeElement).toBe(bodyAction);
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: 'Account summary' })).toBeTruthy();
  });

  it('distinguishes focus-guard entry from exit and lets a controlled parent retry Tab close once', async () => {
    const onOpenChange = vi.fn();
    render(
      <Harness
        initialOpen
        acceptRequests={false}
        onOpenChange={onOpenChange}
      />,
    );
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole('button', { name: 'Close' }),
      ),
    );

    const endGuard = document.querySelector<HTMLElement>(
      '[data-gj-focus-guard="end"]',
    );
    expect(endGuard).not.toBeNull();
    act(() => endGuard?.focus());
    expect(document.activeElement).toBe(screen.getByTestId('after-popover'));
    expect(onOpenChange).toHaveBeenLastCalledWith(
      false,
      expect.objectContaining({ reason: 'tab-key' }),
    );
    expect(onOpenChange).toHaveBeenCalledTimes(1);

    act(() => endGuard?.focus());
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'Close' }),
    );
    expect(onOpenChange).toHaveBeenCalledTimes(1);

    await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
    const startGuard = document.querySelector<HTMLElement>(
      '[data-gj-focus-guard="start"]',
    );
    expect(startGuard).not.toBeNull();
    act(() => startGuard?.focus());
    expect(document.activeElement).toBe(trigger());
    expect(onOpenChange).toHaveBeenCalledTimes(2);
    expect(onOpenChange).toHaveBeenLastCalledWith(
      false,
      expect.objectContaining({ reason: 'tab-key' }),
    );

    act(() => startGuard?.focus());
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'Close' }),
    );
    expect(onOpenChange).toHaveBeenCalledTimes(2);
  });

  it('wraps to a valid external control when forward Tab has no following target and close is rejected', async () => {
    const onOpenChange = vi.fn();
    render(
      <Harness
        initialOpen
        acceptRequests={false}
        includeBefore={false}
        includeAfter={false}
        onOpenChange={onOpenChange}
      />,
    );
    const close = screen.getByRole('button', { name: 'Close' });
    await waitFor(() => expect(document.activeElement).toBe(close));

    const tab = new KeyboardEvent('keydown', {
      key: 'Tab',
      bubbles: true,
      cancelable: true,
    });
    act(() => close.dispatchEvent(tab));
    const endGuard = document.querySelector<HTMLElement>(
      '[data-gj-focus-guard="end"]',
    );
    act(() => endGuard?.focus());

    expect(document.activeElement).toBe(trigger());
    expect(document.activeElement).not.toBe(endGuard);
    expect(onOpenChange).toHaveBeenCalledTimes(1);
    expect(onOpenChange).toHaveBeenLastCalledWith(
      false,
      expect.objectContaining({ reason: 'tab-key' }),
    );
  });

  it('uses the popup DOM boundary when an open disabled trigger is absent from Tab order', async () => {
    const onOpenChange = vi.fn();
    render(
      <Harness
        initialOpen
        acceptRequests={false}
        disabled
        onOpenChange={onOpenChange}
      />,
    );
    const close = screen.getByRole('button', { name: 'Close' });
    await waitFor(() => expect(document.activeElement).toBe(close));
    const endGuard = document.querySelector<HTMLElement>(
      '[data-gj-focus-guard="end"]',
    );
    act(() => endGuard?.focus());

    expect(document.activeElement).toBe(screen.getByTestId('after-popover'));
    expect(document.activeElement).not.toBe(endGuard);
    expect(onOpenChange).toHaveBeenCalledTimes(1);
    expect(onOpenChange).toHaveBeenLastCalledWith(
      false,
      expect.objectContaining({ reason: 'tab-key' }),
    );
  });

  it('honors an explicit initial focus ref and allows rejected closes to be requested again', async () => {
    function ExplicitFocusScene() {
      const inputRef = useRef<HTMLInputElement | null>(null);
      return (
        <Harness
          initialOpen
          initialFocusRef={inputRef}
          acceptRequests={false}
        >
          <input ref={inputRef} aria-label="Workspace name" />
        </Harness>
      );
    }

    render(<ExplicitFocusScene />);
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole('textbox', { name: 'Workspace name' }),
      ),
    );

    cleanup();
    const onOpenChange = vi.fn();
    render(
      <Harness
        initialOpen
        acceptRequests={false}
        onOpenChange={onOpenChange}
      />,
    );
    const close = screen.getByRole('button', { name: 'Close' });
    fireEvent.click(close);
    await act(async () => Promise.resolve());
    fireEvent.click(close);
    expect(onOpenChange).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('dialog', { name: 'Account summary' })).toBeTruthy();
  });

  it('routes anchor detachment through the stack even when pointer dismissal is disabled', () => {
    const onOpenChange = vi.fn();
    render(
      <Harness
        initialOpen
        dismissDisabled
        onOpenChange={onOpenChange}
      />,
    );
    triggerDetached = true;
    fireEvent(window, new Event('resize'));
    expect(onOpenChange).toHaveBeenLastCalledWith(
      false,
      expect.objectContaining({ reason: 'anchor-detached' }),
    );
  });

  it('marks descendant overlays with the Popover as their stack parent', () => {
    const capture = vi.fn();
    render(
      <Harness initialOpen overlayId="account-popover">
        <ParentProbe capture={capture} />
      </Harness>,
    );
    expect(capture).toHaveBeenLastCalledWith('account-popover');
  });

  it('dismisses only the focused nested Popover for one Escape event inside a Dialog', async () => {
    const onParentDismiss = vi.fn();
    const onPopoverChange = vi.fn();

    function NestedScene() {
      const [parentOpen, setParentOpen] = useState(true);
      const [popoverOpen, setPopoverOpen] = useBooleanStore(true);
      return (
        <UiProvider>
          <OverlayProvider>
            <Dialog
              visible={parentOpen}
              animationType="none"
              overlayId="parent-dialog"
              onDismiss={(details) => {
                onParentDismiss(details);
                setParentOpen(false);
              }}
            >
              <DialogPanel title="Parent dialog">
                <Popover
                  triggerLabel="Nested details"
                  open={popoverOpen}
                  onOpenChange={(nextOpen, details) => {
                    onPopoverChange(nextOpen, details);
                    setPopoverOpen(nextOpen);
                  }}
                  title="Nested summary"
                  overlayId="nested-popover"
                >
                  <Text>Nested body</Text>
                </Popover>
              </DialogPanel>
            </Dialog>
          </OverlayProvider>
        </UiProvider>
      );
    }

    render(<NestedScene />);
    const nestedDialog = screen.getByRole('dialog', { name: 'Nested summary' });
    await waitFor(() =>
      expect(document.activeElement).toBe(
        within(nestedDialog).getByRole('button', { name: 'Close' }),
      ),
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    fireEvent.keyUp(document, { key: 'Escape' });
    expect(onPopoverChange).toHaveBeenLastCalledWith(
      false,
      expect.objectContaining({ reason: 'escape-key' }),
    );
    expect(onParentDismiss).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: 'Parent dialog' })).toBeTruthy();
  });

  it('consumes a parent Dialog backdrop pointer at the nested Popover only', () => {
    const onParentDismiss = vi.fn();
    const onPopoverChange = vi.fn();

    function NestedScene() {
      const [open, setOpen] = useState(true);
      return (
        <UiProvider>
          <OverlayProvider>
            <Dialog
              visible
              animationType="none"
              overlayId="pointer-parent-dialog"
              onDismiss={onParentDismiss}
              testID="pointer-parent-dialog"
            >
              <DialogPanel title="Pointer parent dialog">
                <Popover
                  triggerLabel="Nested details"
                  open={open}
                  onOpenChange={(nextOpen, details) => {
                    onPopoverChange(nextOpen, details);
                    setOpen(nextOpen);
                  }}
                  title="Nested pointer summary"
                  overlayId="pointer-child-popover"
                >
                  <Text>Nested body</Text>
                </Popover>
              </DialogPanel>
            </Dialog>
          </OverlayProvider>
        </UiProvider>
      );
    }

    render(<NestedScene />);
    expect(screen.getByRole('dialog', { name: 'Nested pointer summary' })).toBeTruthy();
    fireEvent.pointerDown(screen.getByTestId('pointer-parent-dialog-backdrop'));
    expect(onPopoverChange).toHaveBeenLastCalledWith(
      false,
      expect.objectContaining({ reason: 'outside-press' }),
    );
    expect(onParentDismiss).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: 'Pointer parent dialog' })).toBeTruthy();
  });

  it('consumes one outside pointer event at only the deepest nested Popover', () => {
    const onParentChange = vi.fn();
    const onChildChange = vi.fn();

    function NestedPopovers() {
      const [parentOpen, setParentOpen] = useBooleanStore(true);
      const [childOpen, setChildOpen] = useBooleanStore(true);
      return (
        <UiProvider>
          <OverlayProvider>
            <Popover
              triggerLabel="Parent details"
              open={parentOpen}
              onOpenChange={(nextOpen, details) => {
                onParentChange(nextOpen, details);
                setParentOpen(nextOpen);
              }}
              title="Parent summary"
              overlayId="parent-popover"
            >
              <Popover
                triggerLabel="Child details"
                open={childOpen}
                onOpenChange={(nextOpen, details) => {
                  onChildChange(nextOpen, details);
                  setChildOpen(nextOpen);
                }}
                title="Child summary"
                overlayId="child-popover"
              >
                <Text>Child body</Text>
              </Popover>
            </Popover>
          </OverlayProvider>
        </UiProvider>
      );
    }

    render(<NestedPopovers />);
    fireEvent.pointerDown(document.body);
    expect(onChildChange).toHaveBeenLastCalledWith(
      false,
      expect.objectContaining({ reason: 'outside-press' }),
    );
    expect(onParentChange).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: 'Parent summary' })).toBeTruthy();
  });

  it('does not leave a visible nested Dialog mounted beneath a closed Popover', () => {
    function PopoverWithDialog({ open }: { readonly open: boolean }) {
      return (
        <UiProvider>
          <OverlayProvider>
            <Popover
              triggerLabel="Parent details"
              open={open}
              onOpenChange={() => {}}
              title="Parent summary"
              overlayId="parent-popover"
            >
              <Dialog
                visible
                animationType="none"
                overlayId="nested-dialog"
                onDismiss={() => {}}
              >
                <DialogPanel title="Nested child dialog">
                  <Text>Nested child body</Text>
                </DialogPanel>
              </Dialog>
            </Popover>
          </OverlayProvider>
        </UiProvider>
      );
    }

    const rendered = render(<PopoverWithDialog open={false} />);
    expect(
      screen.queryByRole('dialog', { name: 'Nested child dialog' }),
    ).toBeNull();
    expect(screen.queryByText('Nested child body')).toBeNull();

    rendered.rerender(<PopoverWithDialog open />);
    expect(
      screen.getByRole('dialog', { name: 'Nested child dialog' }),
    ).toBeTruthy();

    rendered.rerender(<PopoverWithDialog open={false} />);
    expect(
      screen.queryByRole('dialog', { name: 'Nested child dialog' }),
    ).toBeNull();
    expect(screen.queryByText('Nested child body')).toBeNull();
  });

  it('requires the overlay scope and validates runtime-only invalid input', () => {
    expect(() =>
      render(
        <Popover
          triggerLabel="Details"
          open={false}
          onOpenChange={() => {}}
          title="Details"
        >
          Body
        </Popover>,
      ),
    ).toThrow('Popover must be rendered inside OverlayProvider.');

    const renderInvalid = (props: Partial<PopoverProps>) => {
      const invalidProps = {
        triggerLabel: 'Details',
        open: false,
        onOpenChange: () => {},
        title: 'Details',
        children: 'Body',
        ...props,
      } as PopoverProps;
      return render(
        <UiProvider>
          <OverlayProvider>
            <Popover {...invalidProps} />
          </OverlayProvider>
        </UiProvider>,
      );
    };

    expect(() => renderInvalid({ title: '   ' })).toThrow(
      'Popover title must be a non-empty string.',
    );
    expect(() => renderInvalid({ sideOffset: Number.POSITIVE_INFINITY })).toThrow(
      'Popover sideOffset must be a finite number.',
    );
    expect(() =>
      renderInvalid({ iconOnly: true, triggerIcon: undefined } as never),
    ).toThrow('Popover iconOnly trigger requires triggerIcon.');
  });

  it('rejects a blank Provider fallback before rendering its owned close action', () => {
    expect(() =>
      render(
        <UiProvider strings={{ ...enStrings, close: '  \n ' }}>
          <Popover
            triggerLabel="Details"
            open
            onOpenChange={() => {}}
            title="Details"
          >
            Body
          </Popover>
        </UiProvider>,
      ),
    ).toThrow('Popover strings.close must be a non-empty string.');
  });
});
