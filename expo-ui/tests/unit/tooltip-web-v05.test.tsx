import { useEffect, useLayoutEffect } from 'react';
import type { ReactNode } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Text } from 'react-native';
import { OverlayLayerBoundary } from '../../src/components/overlay/layer';
import { useOptionalOverlayStack } from '../../src/components/overlay/provider';
import type { OverlayStack } from '../../src/components/overlay/stack';
import { createTooltipCoordinator } from '../../src/components/overlay/tooltip-coordinator';
import { UiProvider } from '../../src/components/provider';
import { Tooltip } from '../../src/components/tooltip.web';

function installMeasuredLayout(): ReturnType<typeof vi.spyOn> {
  return vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement,
  ) {
    if (this.hasAttribute('data-gj-web-popover')) {
      return { x: 0, y: 0, width: 160, height: 32 } as DOMRect;
    }
    if (this.getAttribute('role') === 'button') {
      return { x: 80, y: 80, width: 44, height: 44 } as DOMRect;
    }
    return { x: 0, y: 0, width: 0, height: 0 } as DOMRect;
  });
}

function icon() {
  return <Text aria-hidden>?</Text>;
}

function Example({
  label = 'Help',
  content = 'Explains this action',
  delayMs = 200,
  closeDelayMs = 80,
  tooltipDisabled = false,
  onPress = () => {},
}: {
  readonly label?: string;
  readonly content?: string;
  readonly delayMs?: number;
  readonly closeDelayMs?: number;
  readonly tooltipDisabled?: boolean;
  readonly onPress?: () => void;
}) {
  return (
    <UiProvider>
      <Tooltip
        triggerLabel={label}
        triggerIcon={icon()}
        content={content}
        delayMs={delayMs}
        closeDelayMs={closeDelayMs}
        tooltipDisabled={tooltipDisabled}
        onPress={onPress}
      />
    </UiProvider>
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

beforeEach(() => {
  installMeasuredLayout();
});

describe('Tooltip web — owned accessible trigger and visual description', () => {
  it('opens immediately on focus with role=tooltip and an aria-describedby relationship', () => {
    render(<Example />);
    const trigger = screen.getByRole('button', { name: 'Help' });
    const describedBy = trigger.getAttribute('aria-describedby');
    expect(describedBy).toMatch(/^gj-tooltip-/);
    expect(document.getElementById(describedBy ?? '')?.textContent).toBe(
      'Explains this action',
    );
    expect(screen.queryByRole('tooltip')).toBeNull();
    expect(trigger.style.width).toBe('44px');
    expect(trigger.style.height).toBe('44px');

    act(() => trigger.focus());
    const tooltip = screen.getByRole('tooltip');
    expect(tooltip.id).not.toBe(describedBy);
    expect(tooltip.textContent).toContain('Explains this action');
    expect(document.activeElement).toBe(trigger);
  });

  it('delays pointer hover, bridges pointer travel, then closes after closeDelayMs', () => {
    vi.useFakeTimers();
    render(<Example />);
    const trigger = screen.getByRole('button', { name: 'Help' });

    fireEvent.mouseEnter(trigger);
    act(() => vi.advanceTimersByTime(199));
    expect(screen.queryByRole('tooltip')).toBeNull();
    act(() => vi.advanceTimersByTime(1));
    const tooltip = screen.getByRole('tooltip');

    fireEvent.mouseLeave(trigger);
    act(() => vi.advanceTimersByTime(40));
    fireEvent.pointerEnter(tooltip.firstElementChild ?? tooltip);
    act(() => vi.advanceTimersByTime(80));
    expect(screen.getByRole('tooltip')).toBeTruthy();

    fireEvent.pointerLeave(tooltip.firstElementChild ?? tooltip);
    act(() => vi.advanceTimersByTime(79));
    expect(screen.getByRole('tooltip')).toBeTruthy();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('closes on press, blur, Escape, and document scroll without stealing focus', () => {
    const onPress = vi.fn();
    render(<Example onPress={onPress} />);
    const trigger = screen.getByRole('button', { name: 'Help' });

    fireEvent.focus(trigger);
    expect(screen.getByRole('tooltip')).toBeTruthy();
    fireEvent.click(trigger);
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('tooltip')).toBeNull();

    fireEvent.blur(trigger);
    fireEvent.focus(trigger);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('tooltip')).toBeNull();

    fireEvent.blur(trigger);
    fireEvent.focus(trigger);
    fireEvent.scroll(document);
    expect(screen.queryByRole('tooltip')).toBeNull();

    fireEvent.blur(trigger);
    fireEvent.focus(trigger);
    fireEvent.blur(trigger);
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('keeps one tooltip active per Provider and opens the next one without a second cold delay', () => {
    vi.useFakeTimers();
    render(
      <UiProvider>
        <Tooltip triggerLabel="One" triggerIcon={icon()} content="First" onPress={() => {}} delayMs={200} />
        <Tooltip triggerLabel="Two" triggerIcon={icon()} content="Second" onPress={() => {}} delayMs={200} />
      </UiProvider>,
    );
    const one = screen.getByRole('button', { name: 'One' });
    const two = screen.getByRole('button', { name: 'Two' });

    fireEvent.mouseEnter(one);
    act(() => vi.advanceTimersByTime(200));
    expect(screen.getByRole('tooltip').textContent).toContain('First');
    fireEvent.mouseEnter(two);
    expect(screen.getByRole('tooltip').textContent).toContain('Second');
    expect(screen.queryAllByRole('tooltip')).toHaveLength(1);
  });

  it('suppresses only the description when tooltipDisabled and leaves the action enabled', () => {
    const onPress = vi.fn();
    render(<Example tooltipDisabled onPress={onPress} />);
    const trigger = screen.getByRole('button', { name: 'Help' });
    expect(trigger.getAttribute('aria-describedby')).toBeNull();
    fireEvent.focus(trigger);
    fireEvent.mouseEnter(trigger);
    expect(screen.queryByRole('tooltip')).toBeNull();
    fireEvent.click(trigger);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('registers the current overlay parent while open', () => {
    const stacks: OverlayStack[] = [];
    function CaptureStack() {
      const current = useOptionalOverlayStack();
      useEffect(() => {
        if (current !== null) stacks.push(current);
      }, [current]);
      return null;
    }
    function RegisteredParent({ children }: { readonly children: ReactNode }) {
      const stack = useOptionalOverlayStack();
      useLayoutEffect(() => {
        if (stack === null) return;
        const handle = stack.mount({
          id: 'dialog-parent',
          onDismiss: () => {},
        });
        return handle.unmount;
      }, [stack]);
      return (
        <OverlayLayerBoundary overlayId="dialog-parent">
          {children}
        </OverlayLayerBoundary>
      );
    }
    render(
      <UiProvider>
        <CaptureStack />
        <RegisteredParent>
          <Tooltip triggerLabel="Nested" triggerIcon={icon()} content="Nested help" onPress={() => {}} />
        </RegisteredParent>
      </UiProvider>,
    );
    fireEvent.focus(screen.getByRole('button', { name: 'Nested' }));
    expect(stacks).toHaveLength(1);
    expect(stacks[0]?.getSnapshot().topmost).toEqual(
      expect.objectContaining({ parentId: 'dialog-parent' }),
    );
  });

  it('rejects blank copy, invalid timing, and use outside an overlay scope', () => {
    expect(() => render(
      <UiProvider>
        <Tooltip triggerLabel="Help" triggerIcon={icon()} content=" " onPress={() => {}} />
      </UiProvider>,
    )).toThrow('Tooltip content must be a non-empty string.');
    expect(() => render(
      <UiProvider>
        <Tooltip triggerLabel="Help" triggerIcon={icon()} content="Help" onPress={() => {}} delayMs={-1} />
      </UiProvider>,
    )).toThrow('Tooltip delayMs must be a finite non-negative number.');
    expect(() => render(
      <Tooltip triggerLabel="Help" triggerIcon={icon()} content="Help" onPress={() => {}} />,
    )).toThrow('Tooltip must be rendered inside OverlayProvider.');
  });
});

describe('Tooltip coordinator — delay, singleton, warm-up, and stale timer safety', () => {
  it('cancels stale opens, supersedes the active participant, and honors cooldown', () => {
    vi.useFakeTimers();
    const coordinator = createTooltipCoordinator();
    const first = { id: 'first', onOpen: vi.fn(), onClose: vi.fn() };
    const second = { id: 'second', onOpen: vi.fn(), onClose: vi.fn() };
    const third = { id: 'third', onOpen: vi.fn(), onClose: vi.fn() };

    coordinator.requestOpen(first, 200);
    act(() => vi.advanceTimersByTime(100));
    coordinator.requestOpen(second, 200);
    act(() => vi.advanceTimersByTime(199));
    expect(first.onOpen).not.toHaveBeenCalled();
    expect(second.onOpen).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(second.onOpen).toHaveBeenCalledTimes(1);

    coordinator.openNow(first);
    expect(second.onClose).toHaveBeenCalledWith('superseded');
    expect(coordinator.getSnapshot().activeId).toBe('first');
    coordinator.notifyClosed('first', 100);
    coordinator.requestOpen(third, 500);
    expect(third.onOpen).toHaveBeenCalledTimes(1);

    coordinator.notifyClosed('third', 100);
    act(() => vi.advanceTimersByTime(100));
    coordinator.requestOpen(first, 50);
    expect(first.onOpen).toHaveBeenCalledTimes(1);
    act(() => vi.advanceTimersByTime(50));
    expect(first.onOpen).toHaveBeenCalledTimes(2);
  });
});
