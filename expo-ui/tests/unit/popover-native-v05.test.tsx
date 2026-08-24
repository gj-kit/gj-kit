import { useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AccessibilityInfo, Platform, Pressable, Text, View } from 'react-native';
import { OverlayProvider } from '../../src/components/overlay/provider';
import { Popover } from '../../src/components/popover.native';
import type { PopoverOpenChangeDetails } from '../../src/components/popover.types';
import { UiProvider } from '../../src/components/provider';
import { lightTheme } from '../../src/theme/createTheme';

function finishModalAnimationFrom(element: HTMLElement): void {
  let current: HTMLElement | null = element;
  while (current !== null && current !== document.body) {
    fireEvent.animationEnd(current);
    current = current.parentElement;
  }
}

async function showModal(): Promise<HTMLElement> {
  finishModalAnimationFrom(screen.getByTestId('native-popover-dialog'));
  return screen.findByRole('dialog');
}

interface HarnessProps {
  readonly initialOpen?: boolean;
  readonly dismissDisabled?: boolean;
  readonly presentation?: 'auto' | 'bottom' | 'center';
  readonly bottomInset?: number;
  readonly keyboardOverlap?: number;
  readonly onOpenChange?: (
    open: boolean,
    details: PopoverOpenChangeDetails,
  ) => void;
  readonly children?: NonNullable<ReactNode>;
}

function Harness({
  initialOpen = false,
  dismissDisabled = false,
  presentation,
  bottomInset,
  keyboardOverlap,
  onOpenChange,
  children = <Text>Native rich details</Text>,
}: HarnessProps) {
  const [open, setOpen] = useState(initialOpen);
  return (
    <UiProvider>
      <OverlayProvider>
        <Popover
          triggerLabel="Account details"
          open={open}
          onOpenChange={(nextOpen, details) => {
            onOpenChange?.(nextOpen, details);
            setOpen(nextOpen);
          }}
          title="Account summary"
          description="Review the active workspace."
          dismissDisabled={dismissDisabled}
          presentation={presentation}
          bottomInset={bottomInset}
          keyboardOverlap={keyboardOverlap}
          testID="native-popover"
        >
          {children}
        </Popover>
      </OverlayProvider>
    </UiProvider>
  );
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('Popover native/default — adaptive modal dialog', () => {
  it('owns the trigger and renders a named rich dialog with a fixed close header and scrolling body', async () => {
    render(
      <Harness initialOpen>
        <Text>Custom body content</Text>
      </Harness>,
    );
    const trigger = screen.getByRole('button', { name: 'Account details' });
    expect(trigger.style.minHeight).toBe(
      `${lightTheme.metrics.control.md}px`,
    );

    const dialog = await showModal();
    expect(within(dialog).getByText('Account summary')).toBeTruthy();
    expect(
      within(dialog).getByText('Review the active workspace.'),
    ).toBeTruthy();
    expect(within(dialog).getByText('Custom body content')).toBeTruthy();
    const close = within(dialog).getByRole('button', { name: 'Close' });
    const bodyScroll = screen.getByTestId('native-popover-body-scroll');
    expect(bodyScroll.contains(close)).toBe(false);
    expect(getComputedStyle(bodyScroll).overflowY).toBe('auto');
    await waitFor(() => expect(document.activeElement).toBe(close));
  });

  it('maps close and backdrop reasons and restores final focus to the trigger', async () => {
    // 이 테스트는 닫힘 애니메이션이 완료될 때까지 modal이 남아 있는 경로를 검증한다.
    // Dialog는 플랫폼이 모션 허용(false)을 확정한 뒤 닫힌 커밋에서만 애니메이션을
    // latch하므로, 선호도를 false로 고정하고 닫힌 상태에서 flush한 뒤 트리거로 연다.
    vi.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockReturnValue(
      Promise.resolve(false),
    );
    vi.spyOn(AccessibilityInfo, 'addEventListener').mockReturnValue({ remove: vi.fn() } as never);
    const onOpenChange = vi.fn();
    render(<Harness onOpenChange={onOpenChange} />);
    await act(async () => {
      await Promise.resolve();
    });
    fireEvent.click(screen.getByRole('button', { name: 'Account details' }));
    let dialog = await showModal();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
    expect(onOpenChange).toHaveBeenLastCalledWith(
      false,
      expect.objectContaining({ reason: 'close-action' }),
    );
    finishModalAnimationFrom(screen.getByTestId('native-popover-dialog'));
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole('button', { name: 'Account details' }),
      ),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Account details' }));
    dialog = await showModal();
    fireEvent.pointerDown(screen.getByTestId('native-popover-dialog-backdrop'));
    expect(onOpenChange).toHaveBeenLastCalledWith(
      false,
      expect.objectContaining({ reason: 'outside-press' }),
    );
    finishModalAnimationFrom(screen.getByTestId('native-popover-dialog'));
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole('button', { name: 'Account details' }),
      ),
    );

  });

  it('routes web Escape keydown through the shared overlay stack', async () => {
    const onOpenChange = vi.fn();
    render(<Harness initialOpen onOpenChange={onOpenChange} />);
    await showModal();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onOpenChange).toHaveBeenLastCalledWith(
      false,
      expect.objectContaining({ reason: 'escape-key' }),
    );
  });

  it('lets an explicit initial focus ref override the built-in close target', async () => {
    function ExplicitInitialFocusScene() {
      const targetRef = useRef<View | null>(null);
      return (
        <UiProvider>
          <OverlayProvider>
            <Popover
              triggerLabel="Account details"
              open
              onOpenChange={() => {}}
              title="Account summary"
              initialFocusRef={targetRef}
              testID="native-popover"
            >
              <Pressable
                ref={targetRef}
                accessibilityRole="button"
                accessibilityLabel="Body focus target"
              >
                <Text>Body focus target</Text>
              </Pressable>
            </Popover>
          </OverlayProvider>
        </UiProvider>
      );
    }

    render(<ExplicitInitialFocusScene />);
    await showModal();
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole('button', { name: 'Body focus target' }),
      ),
    );
  });

  it('keeps every modal dismissal route blocked when dismissDisabled is set', async () => {
    const onOpenChange = vi.fn();
    render(
      <Harness
        initialOpen
        dismissDisabled
        onOpenChange={onOpenChange}
      />,
    );
    const dialog = await showModal();
    const close = within(dialog).getByRole('button', { name: 'Close' });
    expect(close.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(close);
    fireEvent.pointerDown(screen.getByTestId('native-popover-dialog-backdrop'));
    fireEvent.keyDown(document, { key: 'Escape' });
    fireEvent.click(screen.getByRole('button', { name: 'Account details' }));
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('uses keyboard overlap ahead of bottom inset and preserves invariant viewport bounds', async () => {
    const clientHeight = Object.getOwnPropertyDescriptor(
      document.documentElement,
      'clientHeight',
    );
    const clientWidth = Object.getOwnPropertyDescriptor(
      document.documentElement,
      'clientWidth',
    );
    Object.defineProperty(document.documentElement, 'clientHeight', {
      configurable: true,
      value: 260,
    });
    Object.defineProperty(document.documentElement, 'clientWidth', {
      configurable: true,
      value: 390,
    });
    window.dispatchEvent(new Event('resize'));
    try {
      render(
        <Harness
          initialOpen
          presentation="bottom"
          bottomInset={7}
          keyboardOverlap={11}
        />,
      );
      await showModal();
      const panel = screen.getByTestId('native-popover-panel');
      expect(panel.style.paddingBottom).toBe(
        `${lightTheme.spacing.xxl + 11}px`,
      );
      expect(panel.style.maxHeight).toBe(
        `${260 - lightTheme.spacing.xl * 2}px`,
      );
    } finally {
      cleanup();
      if (clientHeight === undefined) {
        delete (
          document.documentElement as unknown as { clientHeight?: number }
        ).clientHeight;
      } else {
        Object.defineProperty(
          document.documentElement,
          'clientHeight',
          clientHeight,
        );
      }
      if (clientWidth === undefined) {
        delete (
          document.documentElement as unknown as { clientWidth?: number }
        ).clientWidth;
      } else {
        Object.defineProperty(
          document.documentElement,
          'clientWidth',
          clientWidth,
        );
      }
      window.dispatchEvent(new Event('resize'));
    }
  });

  it('maps Android request-close to hardware-back and validates the native boundary', async () => {
    const originalOS = Platform.OS;
    Platform.OS = 'android';
    const onOpenChange = vi.fn();
    try {
      render(<Harness initialOpen onOpenChange={onOpenChange} />);
      await showModal();
      fireEvent.keyUp(document, { key: 'Escape' });
      expect(onOpenChange).toHaveBeenLastCalledWith(
        false,
        expect.objectContaining({ reason: 'hardware-back' }),
      );
    } finally {
      cleanup();
      Platform.OS = originalOS;
    }

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

    expect(() =>
      render(
        <UiProvider>
          <OverlayProvider>
            <Popover
              triggerLabel="Details"
              open={false}
              onOpenChange={() => {}}
              title="Details"
              bottomInset={Number.NaN}
            >
              Body
            </Popover>
          </OverlayProvider>
        </UiProvider>,
      ),
    ).toThrow('Popover bottomInset must be a finite number.');
  });
});
