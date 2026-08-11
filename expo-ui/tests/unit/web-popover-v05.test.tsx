import { createContext, useContext, useRef } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createOverlayStack } from '../../src/components/overlay/stack';
import {
  WebPopover,
  type WebPopoverElement,
} from '../../src/components/overlay/web-popover.web';
import type { OverlayStack } from '../../src/components/overlay/stack';

type Rect = { x: number; y: number; width: number; height: number };

let anchorRect: Rect = { x: 100, y: 20, width: 40, height: 20 };
let floatingRect: Rect = { x: 0, y: 0, width: 80, height: 30 };
const originalShowPopover = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'showPopover');
const originalHidePopover = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'hidePopover');

function restorePopoverMethod(name: 'showPopover' | 'hidePopover', descriptor: PropertyDescriptor | undefined): void {
  if (descriptor === undefined) {
    delete (HTMLElement.prototype as unknown as Record<string, unknown>)[name];
  } else {
    Object.defineProperty(HTMLElement.prototype, name, descriptor);
  }
}

function installRects(): ReturnType<typeof vi.spyOn> {
  return vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    if (this.hasAttribute('data-anchor')) {
      return anchorRect as DOMRect;
    }
    if (this.hasAttribute('data-gj-web-popover')) {
      return floatingRect as DOMRect;
    }
    return { x: 0, y: 0, width: 0, height: 0 } as DOMRect;
  });
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  restorePopoverMethod('showPopover', originalShowPopover);
  restorePopoverMethod('hidePopover', originalHidePopover);
  anchorRect = { x: 100, y: 20, width: 40, height: 20 };
  floatingRect = { x: 0, y: 0, width: 80, height: 30 };
});

interface HarnessProps {
  readonly open?: boolean;
  readonly stack?: OverlayStack;
  readonly overlayId?: string;
  readonly parentId?: string;
  readonly onDismiss?: ReturnType<typeof vi.fn>;
  readonly onDetachedChange?: ReturnType<typeof vi.fn>;
  readonly dismissible?: boolean;
  readonly role?: 'dialog' | 'listbox' | 'menu' | 'tooltip';
  readonly domId?: string;
  readonly accessibilityLabelledBy?: string;
  readonly accessibilityDescribedBy?: string;
  readonly children?: React.ReactNode;
  readonly matchTriggerWidth?: boolean;
}

function Harness({
  open = true,
  stack = createOverlayStack(),
  overlayId = 'menu',
  parentId,
  onDismiss = vi.fn(),
  onDetachedChange,
  dismissible = true,
  role,
  domId,
  accessibilityLabelledBy,
  accessibilityDescribedBy,
  children = <span>Popover content</span>,
  matchTriggerWidth,
}: HarnessProps) {
  const triggerRef = useRef<WebPopoverElement | null>(null);
  const floatingRef = useRef<WebPopoverElement | null>(null);

  return (
    <>
      <button
        ref={(node) => {
          triggerRef.current = node as unknown as WebPopoverElement | null;
        }}
        data-anchor=""
      >
        Trigger
      </button>
      <WebPopover
        open={open}
        overlayId={overlayId}
        parentId={parentId}
        overlayStack={stack}
        onDismiss={onDismiss}
        triggerRef={triggerRef}
        floatingRef={floatingRef}
        sideOffset={4}
        dismissible={dismissible}
        role={role}
        domId={domId}
        accessibilityLabelledBy={accessibilityLabelledBy}
        accessibilityDescribedBy={accessibilityDescribedBy}
        onDetachedChange={onDetachedChange}
        matchTriggerWidth={matchTriggerWidth}
      >
        {children}
      </WebPopover>
    </>
  );
}

function NestedHarness({
  stack,
  parentOpen = true,
}: {
  readonly stack: OverlayStack;
  readonly parentOpen?: boolean;
}) {
  const parentTriggerRef = useRef<WebPopoverElement | null>(null);
  return (
    <>
      <button
        ref={(node) => {
          parentTriggerRef.current =
            node as unknown as WebPopoverElement | null;
        }}
        data-anchor=""
      >
        Parent trigger
      </button>
      <WebPopover
        open={parentOpen}
        overlayId="parent"
        overlayStack={stack}
        onDismiss={() => {}}
        triggerRef={parentTriggerRef}
        domId="parent-surface"
      >
        <span>Parent content</span>
        <Harness
          stack={stack}
          overlayId="child"
          parentId="parent"
          domId="child-surface"
        >
          <span>Child content</span>
        </Harness>
        <div role="dialog" aria-label="Nested modal">
          Nested modal content
        </div>
      </WebPopover>
    </>
  );
}

function popoverElement(): HTMLElement {
  const content = screen.getByText('Popover content');
  const element = content.parentElement;
  if (element === null) throw new Error('Popover element is missing.');
  return element;
}

describe('WebPopover — HTML top layer adapter', () => {
  it('uses the native manual Popover API, computes fixed placement, and hides through controlled open', () => {
    const rectSpy = installRects();
    const showPopover = vi.fn();
    const hidePopover = vi.fn();
    Object.defineProperty(HTMLElement.prototype, 'showPopover', {
      configurable: true,
      value: showPopover,
    });
    Object.defineProperty(HTMLElement.prototype, 'hidePopover', {
      configurable: true,
      value: hidePopover,
    });

    const stack = createOverlayStack();
    const rendered = render(<Harness stack={stack} />);
    const popover = popoverElement();
    expect(popover.getAttribute('popover')).toBe('manual');
    expect(popover.style.position).toBe('fixed');
    expect(popover.style.left).toBe('100px');
    expect(popover.style.top).toBe('44px');
    expect(popover.style.border).toBe('0px');
    expect(popover.style.padding).toBe('0px');
    expect(popover.style.background).toBe('transparent');
    expect(popover.style.overflow).toBe('visible');
    expect(popover.style.maxWidth).toBe(`${window.innerWidth}px`);
    expect(popover.style.maxHeight).toBe(`${window.innerHeight - 44}px`);
    expect(popover.getAttribute('data-placement')).toBe('bottom-start');
    expect(showPopover).toHaveBeenCalledTimes(1);
    expect(rectSpy).toHaveBeenCalled();

    rendered.rerender(<Harness open={false} stack={stack} />);
    expect(hidePopover).toHaveBeenCalledTimes(1);
    expect(popover.style.display).toBe('none');
  });

  it('matches the anchor width without exceeding the resolved collision space', () => {
    installRects();
    anchorRect = { x: 100, y: 20, width: 140, height: 20 };
    render(<Harness matchTriggerWidth />);
    expect(popoverElement().style.width).toBe('140px');

    cleanup();
    const previousWidth = window.innerWidth;
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: 80,
    });
    anchorRect = { x: 0, y: 20, width: 140, height: 20 };
    render(<Harness matchTriggerWidth />);
    expect(popoverElement().style.width).toBe('80px');
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: previousWidth,
    });
  });

  it('waits for a declared parent registration before mounting, measuring, or showing a child', () => {
    installRects();
    const showPopover = vi.fn();
    Object.defineProperty(HTMLElement.prototype, 'showPopover', {
      configurable: true,
      value: showPopover,
    });
    const stack = createOverlayStack();
    render(
      <Harness
        stack={stack}
        overlayId="child"
        parentId="parent"
        domId="child-surface"
      >
        <span>Gated child content</span>
      </Harness>,
    );

    const childSurface = document.getElementById('child-surface');
    expect(childSurface?.style.display).toBe('none');
    expect(screen.queryByText('Gated child content')).toBeNull();
    expect(stack.getSnapshot().entries).toEqual([]);
    expect(showPopover).not.toHaveBeenCalled();

    act(() => {
      stack.mount({ id: 'parent', onDismiss: () => {} });
    });
    expect(screen.getByText('Gated child content')).toBeTruthy();
    expect(stack.getSnapshot().entries).toEqual([
      expect.objectContaining({ id: 'parent' }),
      expect.objectContaining({ id: 'child', parentId: 'parent' }),
    ]);
    expect(showPopover).toHaveBeenCalledTimes(1);

    act(() => stack.unmount('parent'));
    expect(screen.queryByText('Gated child content')).toBeNull();
    expect(childSurface?.style.display).toBe('none');
    expect(stack.getSnapshot().entries).toEqual([]);
  });

  it('shows initially-open nested HTML popovers parent-first and removes closed-parent descendants', () => {
    installRects();
    const showOrder: string[] = [];
    Object.defineProperty(HTMLElement.prototype, 'showPopover', {
      configurable: true,
      value: function (this: HTMLElement) {
        showOrder.push(this.id);
      },
    });
    const stack = createOverlayStack();
    const rendered = render(<NestedHarness stack={stack} />);

    expect(showOrder).toEqual(['parent-surface', 'child-surface']);
    expect(stack.getSnapshot().entries).toEqual([
      expect.objectContaining({ id: 'parent' }),
      expect.objectContaining({ id: 'child', parentId: 'parent' }),
    ]);
    expect(screen.getByRole('dialog', { name: 'Nested modal' })).toBeTruthy();

    rendered.rerender(<NestedHarness stack={stack} parentOpen={false} />);
    expect(screen.queryByText('Parent content')).toBeNull();
    expect(screen.queryByText('Child content')).toBeNull();
    expect(screen.queryByRole('dialog', { name: 'Nested modal' })).toBeNull();
    expect(document.getElementById('child-surface')).toBeNull();
    expect(document.getElementById('parent-surface')?.style.display).toBe(
      'none',
    );
    expect(stack.getSnapshot().entries).toEqual([]);
  });

  it('never mounts an initially-open descendant under an initially-closed parent', () => {
    installRects();
    const showPopover = vi.fn();
    Object.defineProperty(HTMLElement.prototype, 'showPopover', {
      configurable: true,
      value: showPopover,
    });
    const stack = createOverlayStack();
    render(<NestedHarness stack={stack} parentOpen={false} />);

    expect(document.getElementById('parent-surface')?.style.display).toBe(
      'none',
    );
    expect(document.getElementById('child-surface')).toBeNull();
    expect(screen.queryByText('Nested modal content')).toBeNull();
    expect(stack.getSnapshot().entries).toEqual([]);
    expect(showPopover).not.toHaveBeenCalled();
  });

  it('falls back to an in-tree fixed element and remeasures on capture scroll and resize', () => {
    installRects();
    const previousWidth = window.innerWidth;
    const previousHeight = window.innerHeight;
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 300 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 200 });

    render(<Harness />);
    const popover = popoverElement();
    expect(popover.style.display).toBe('block');
    expect(popover.style.left).toBe('100px');

    anchorRect = { x: 210, y: 130, width: 40, height: 20 };
    floatingRect = { x: 0, y: 0, width: 100, height: 50 };
    fireEvent.scroll(document);
    expect(popover.style.left).toBe('200px');
    // Bottom would overflow (154 + 50 > 200), so collision handling flips it.
    expect(popover.style.top).toBe('76px');
    expect(popover.getAttribute('data-placement')).toBe('top-start');

    anchorRect = { x: 20, y: 30, width: 40, height: 20 };
    fireEvent(window, new Event('resize'));
    expect(popover.style.left).toBe('20px');
    expect(popover.style.top).toBe('54px');
    expect(popover.style.maxHeight).toBe('146px');

    // A viewport-only change can leave x/y/placement untouched while reducing
    // the collision space inherited by Menu/Select content.
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 120 });
    fireEvent(window, new Event('resize'));
    expect(popover.style.left).toBe('20px');
    expect(popover.style.top).toBe('54px');
    expect(popover.style.maxHeight).toBe('66px');
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: previousWidth });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: previousHeight });
  });

  it('reports anchor detachment only when the collision-boundary state changes', () => {
    installRects();
    const onDetachedChange = vi.fn();
    render(<Harness onDetachedChange={onDetachedChange} />);
    expect(onDetachedChange).toHaveBeenCalledTimes(1);
    expect(onDetachedChange).toHaveBeenLastCalledWith(false);

    anchorRect = { x: 10000, y: 20, width: 40, height: 20 };
    fireEvent.scroll(document);
    expect(onDetachedChange).toHaveBeenCalledTimes(2);
    expect(onDetachedChange).toHaveBeenLastCalledWith(true);

    fireEvent.scroll(document);
    expect(onDetachedChange).toHaveBeenCalledTimes(2);
  });

  it('routes outside pointer and Escape through only the topmost stack entry', () => {
    installRects();
    const stack = createOverlayStack();
    const lowerDismiss = vi.fn();
    const upperDismiss = vi.fn();
    render(
      <>
        <Harness stack={stack} overlayId="lower" onDismiss={lowerDismiss}>Lower</Harness>
        <Harness stack={stack} overlayId="upper" onDismiss={upperDismiss}>Upper</Harness>
      </>,
    );

    fireEvent.pointerDown(document.body);
    expect(lowerDismiss).not.toHaveBeenCalled();
    expect(upperDismiss).toHaveBeenLastCalledWith(
      expect.objectContaining({ overlayId: 'upper', reason: 'outside-press' }),
    );

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(lowerDismiss).not.toHaveBeenCalled();
    expect(upperDismiss).toHaveBeenLastCalledWith(
      expect.objectContaining({ overlayId: 'upper', reason: 'escape-key' }),
    );
  });

  it('keeps mount order stable when a lower open overlay changes dismiss policy', () => {
    installRects();
    const stack = createOverlayStack();
    const lowerDismiss = vi.fn();
    const upperDismiss = vi.fn();
    const rendered = render(
      <>
        <Harness stack={stack} overlayId="lower" onDismiss={lowerDismiss}>Lower</Harness>
        <Harness stack={stack} overlayId="upper" onDismiss={upperDismiss}>Upper</Harness>
      </>,
    );

    rendered.rerender(
      <>
        <Harness
          stack={stack}
          overlayId="lower"
          onDismiss={lowerDismiss}
          dismissible={false}
        >
          Lower
        </Harness>
        <Harness stack={stack} overlayId="upper" onDismiss={upperDismiss}>Upper</Harness>
      </>,
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(lowerDismiss).not.toHaveBeenCalled();
    expect(upperDismiss).toHaveBeenLastCalledWith(
      expect.objectContaining({ overlayId: 'upper', reason: 'escape-key' }),
    );
  });

  it('preserves React context because top-layer rendering stays in the tree', () => {
    installRects();
    const ValueContext = createContext('missing');
    function Consumer() {
      return <span>{useContext(ValueContext)}</span>;
    }

    render(
      <ValueContext.Provider value="preserved">
        <Harness><Consumer /></Harness>
      </ValueContext.Provider>,
    );
    expect(screen.getByText('preserved')).toBeTruthy();
  });

  it('forwards product-owned ids and accessible relationships for dialog and tooltip products', () => {
    installRects();
    const rendered = render(
      <Harness
        role="dialog"
        domId="settings-popover"
        accessibilityLabelledBy="settings-title"
        accessibilityDescribedBy="settings-description"
      />,
    );
    let popover = popoverElement();
    expect(popover.getAttribute('id')).toBe('settings-popover');
    expect(popover.getAttribute('role')).toBe('dialog');
    expect(popover.getAttribute('aria-labelledby')).toBe('settings-title');
    expect(popover.getAttribute('aria-describedby')).toBe('settings-description');

    rendered.rerender(
      <Harness role="tooltip" domId="settings-tooltip" />,
    );
    popover = popoverElement();
    expect(popover.getAttribute('role')).toBe('tooltip');
    expect(popover.getAttribute('id')).toBe('settings-tooltip');
  });

});
