/**
 * Round C — Menu/Select triggerTestID·hover 스타일 훅.
 *
 * 소비 앱의 `fireEvent.press(getByTestId(...))` 트리거 계약과 시안 hover 색
 * (트리거/옵션)이 킷으로 이관 가능한지 고정한다. hover 스타일은 해당 prop이
 * 주어졌을 때만 추적하고, disabled 대상에는 적용하지 않는다.
 */
import { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StyleSheet, type PressableProps } from 'react-native';
import { Menu as NativeMenu } from '../../src/components/menu.native';
import { Menu as WebMenu } from '../../src/components/menu.web';
import { Select as NativeSelect } from '../../src/components/select.native';
import { Select as WebSelect } from '../../src/components/select.web';
import type { MenuItem } from '../../src/components/menu.types';
import { OverlayProvider } from '../../src/components/overlay/provider';
import { UiProvider } from '../../src/components/provider';

// Observe the props at the compiled native Pressable boundary. RNW drops the
// unknown className, so inspecting the DOM would falsely pass on the old code.
const nativePressableProps = vi.hoisted(() => new Map<string, PressableProps & { className?: string }>());
vi.mock('react-native', async () => {
  const actual = await vi.importActual<typeof import('react-native')>('react-native');
  const React = await import('react');
  return {
    ...actual,
    Pressable: React.forwardRef<React.ElementRef<typeof actual.Pressable>, React.ComponentProps<typeof actual.Pressable> & { className?: string }>((props, ref) => {
      if (props.testID) nativePressableProps.set(props.testID, props);
      return React.createElement(actual.Pressable, { ...props, ref });
    }),
  };
});

const menuItems = [
  { kind: 'action', value: 'open', label: 'Open' },
  { kind: 'action', value: 'archive', label: 'Archive' },
] as const satisfies readonly MenuItem<string>[];

const selectItems = [
  { value: 'recent', label: 'Most recent' },
  { value: 'oldest', label: 'Oldest first' },
] as const;

function installMeasuredLayout(): void {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
    function (this: HTMLElement) {
      if (this.hasAttribute('data-gj-web-popover')) {
        return { x: 0, y: 0, width: 160, height: 220 } as DOMRect;
      }
      return { x: 24, y: 24, width: 100, height: 44 } as DOMRect;
    },
  );
}

afterEach(() => {
  cleanup();
  nativePressableProps.clear();
  vi.restoreAllMocks();
});

beforeEach(installMeasuredLayout);

function WebMenuHarness({
  onOpen,
}: {
  readonly onOpen?: (open: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <UiProvider>
      <OverlayProvider>
        <WebMenu
          triggerLabel="Sort"
          items={menuItems}
          open={open}
          onOpenChange={(next) => {
            onOpen?.(next);
            setOpen(next);
          }}
          onSelect={() => {}}
          testID="album-sort"
          triggerTestID="album-sort-button"
          triggerHoverStyle={{ backgroundColor: 'rgb(241, 243, 245)' }}
          itemHoverStyle={{ backgroundColor: 'rgb(237, 239, 240)' }}
        />
      </OverlayProvider>
    </UiProvider>
  );
}

describe('Menu triggerTestID and hover styles', () => {
  it('web: triggerTestID lands on the trigger pressable and pressing it opens the menu', () => {
    const onOpen = vi.fn();
    render(<WebMenuHarness onOpen={onOpen} />);

    const trigger = screen.getByTestId('album-sort-button');
    expect(trigger).toBe(screen.getByRole('button', { name: 'Sort' }));
    fireEvent.click(trigger);
    expect(onOpen).toHaveBeenCalledWith(true);
  });

  it('web: triggerHoverStyle applies while hovered and clears on hover out', () => {
    render(<WebMenuHarness />);

    const trigger = screen.getByTestId('album-sort-button');
    fireEvent.mouseEnter(trigger);
    fireEvent.pointerEnter(trigger);
    expect(getComputedStyle(trigger).backgroundColor).toBe('rgb(241, 243, 245)');
    fireEvent.mouseLeave(trigger);
    fireEvent.pointerLeave(trigger);
    expect(getComputedStyle(trigger).backgroundColor).not.toBe(
      'rgb(241, 243, 245)',
    );
  });

  it('web: itemHoverStyle applies to the hovered item only', () => {
    render(<WebMenuHarness />);
    fireEvent.click(screen.getByTestId('album-sort-button'));

    const second = screen.getByTestId('album-sort-item-1');
    fireEvent.mouseEnter(second);
    fireEvent.pointerEnter(second);
    expect(getComputedStyle(second).backgroundColor).toBe('rgb(237, 239, 240)');
    expect(
      getComputedStyle(screen.getByTestId('album-sort-item-0')).backgroundColor,
    ).not.toBe('rgb(237, 239, 240)');
    fireEvent.mouseLeave(second);
    fireEvent.pointerLeave(second);
    expect(getComputedStyle(second).backgroundColor).not.toBe(
      'rgb(237, 239, 240)',
    );
  });

  it('native fork: triggerTestID lands on the trigger pressable and press opens', () => {
    const onOpenChange = vi.fn();
    render(
      <UiProvider>
        <OverlayProvider>
          <NativeMenu
            triggerLabel="More"
            items={menuItems}
            open={false}
            onOpenChange={onOpenChange}
            onSelect={() => {}}
            testID="row-more"
            triggerTestID="row-more-button"
          />
        </OverlayProvider>
      </UiProvider>,
    );

    fireEvent.click(screen.getByTestId('row-more-button'));
    expect(onOpenChange).toHaveBeenCalledWith(
      true,
      expect.objectContaining({ reason: 'trigger-press' }),
    );
  });
});

describe('Select triggerTestID and hover styles', () => {
  it('web: triggerTestID replaces the derived `${testID}-trigger` on the combobox trigger', () => {
    render(
      <UiProvider>
        <OverlayProvider>
          <WebSelect
            label="Sort order"
            placeholder="Choose"
            items={selectItems}
            value="recent"
            open={false}
            onValueChange={() => {}}
            onOpenChange={() => {}}
            testID="sort-select"
            triggerTestID="sort-select-button"
            triggerHoverStyle={{ backgroundColor: 'rgb(241, 243, 245)' }}
          />
        </OverlayProvider>
      </UiProvider>,
    );

    expect(screen.queryByTestId('sort-select-trigger')).toBeNull();
    const trigger = screen.getByTestId('sort-select-button');
    expect(trigger.getAttribute('role')).toBe('combobox');
    fireEvent.mouseEnter(trigger);
    fireEvent.pointerEnter(trigger);
    expect(getComputedStyle(trigger).backgroundColor).toBe('rgb(241, 243, 245)');
  });

  it('web: without triggerTestID the derived `${testID}-trigger` remains', () => {
    render(
      <UiProvider>
        <OverlayProvider>
          <WebSelect
            label="Sort order"
            placeholder="Choose"
            items={selectItems}
            value={null}
            open={false}
            onValueChange={() => {}}
            onOpenChange={() => {}}
            testID="plain-select"
          />
        </OverlayProvider>
      </UiProvider>,
    );

    expect(screen.getByTestId('plain-select-trigger')).toBeTruthy();
  });

  it('native fork: triggerTestID lands on the trigger pressable', () => {
    const onOpenChange = vi.fn();
    render(
      <UiProvider>
        <OverlayProvider>
          <NativeSelect
            label="Sort order"
            placeholder="Choose"
            items={selectItems}
            value={null}
            open={false}
            onValueChange={() => {}}
            onOpenChange={onOpenChange}
            testID="native-select"
            triggerTestID="native-select-button"
          />
        </OverlayProvider>
      </UiProvider>,
    );

    fireEvent.click(screen.getByTestId('native-select-button'));
    expect(onOpenChange).toHaveBeenCalledWith(
      true,
      expect.objectContaining({ reason: 'trigger-press' }),
    );
  });
});

describe('OverlayProvider absence keeps the throw with an actionable message', () => {
  it('names the stacking guarantee and the exact fix', () => {
    expect(() =>
      render(
        <WebMenu
          triggerLabel="Sort"
          items={menuItems}
          open={false}
          onOpenChange={() => {}}
          onSelect={() => {}}
        />,
      ),
    ).toThrow(/topmost-first Escape\/outside-press ownership.*<UiProvider>/);
  });
});

describe('native Menu/Select compiled NativeWind consumer boundary', () => {
  // Compiled package JSX bypasses the consumer's NativeWind transform. Automatic
  // pseudo-classes then reach RN Pressable's inner View, which NativeWind upgrades
  // into another Pressable. That inner responder steals taps in the native Modal.
  // RNW cannot reproduce the native responder tree, so guard its input here and
  // exercise the actual native fork callbacks; device QA covers touch dispatch.
  function expectNoImplicitInteractionClasses(element: HTMLElement) {
    const testID = element.getAttribute('data-testid')!;
    expect(nativePressableProps.has(testID)).toBe(true);
    expect(nativePressableProps.get(testID)?.className ?? '').not.toMatch(/(?:hover|active):/);
    const style = nativePressableProps.get(testID)?.style;
    expect(typeof style).toBe('function');
    if (typeof style !== 'function') throw new Error('Native press feedback is missing');
    // Fabric must receive an identity transform on release. Removing the array
    // can pass null into processTransform during a same-tap Modal transition.
    expect(StyleSheet.flatten(style({ pressed: true })).transform).toEqual([{ scale: 0.98 }]);
    expect(StyleSheet.flatten(style({ pressed: false })).transform).toEqual([{ scale: 1 }]);
  }

  it.each([true, false])('Menu action keeps closeOnSelect=%s without injecting a second responder', (closeOnSelect) => {
    const onSelect = vi.fn();
    const onOpenChange = vi.fn();
    render(
      <UiProvider>
        <NativeMenu
          triggerLabel="More"
          triggerTestID="native-feedback-trigger"
          testID="native-feedback"
          items={[{ kind: 'action', value: 'cancel', label: 'Cancel plan', closeOnSelect }]}
          open
          onSelect={onSelect}
          onOpenChange={onOpenChange}
        />
      </UiProvider>,
    );
    const trigger = screen.getByTestId('native-feedback-trigger');
    const action = screen.getByTestId('native-feedback-item-0');
    expectNoImplicitInteractionClasses(trigger);
    expectNoImplicitInteractionClasses(action);
    fireEvent.click(action);
    expect(onSelect).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ value: 'cancel' }));
    if (closeOnSelect) {
      expect(onOpenChange).toHaveBeenCalledExactlyOnceWith(false, expect.objectContaining({ reason: 'action-select' }));
    } else {
      expect(onOpenChange).not.toHaveBeenCalled();
    }
  });

  it('Select option commits once without injecting a second responder', () => {
    const onValueChange = vi.fn();
    const onOpenChange = vi.fn();
    render(
      <UiProvider>
        <NativeSelect
          label="Sort order"
          placeholder="Choose"
          triggerTestID="native-feedback-trigger"
          testID="native-feedback"
          items={selectItems}
          value="recent"
          open
          onValueChange={onValueChange}
          onOpenChange={onOpenChange}
        />
      </UiProvider>,
    );
    const option = screen.getByTestId('native-feedback-item-1');
    expectNoImplicitInteractionClasses(screen.getByTestId('native-feedback-trigger'));
    expectNoImplicitInteractionClasses(option);
    fireEvent.click(option);
    expect(onValueChange).toHaveBeenCalledExactlyOnceWith('oldest');
    expect(onOpenChange).toHaveBeenCalledExactlyOnceWith(false, expect.objectContaining({ reason: 'option-select' }));
  });
});
