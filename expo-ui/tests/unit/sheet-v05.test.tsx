import type { ReactElement } from 'react';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AccessibilityInfo,
  I18nManager,
  ScrollView,
  Text,
} from 'react-native';
import type { SheetProps } from '../../src/components/sheet';
import { Sheet } from '../../src/components/sheet';
import { OverlayProvider } from '../../src/components/overlay/provider';
import { UiProvider } from '../../src/components/provider';
import { lightTheme } from '../../src/theme/createTheme';

function Providers({ children }: { readonly children: ReactElement }) {
  return (
    <UiProvider>
      <OverlayProvider>{children}</OverlayProvider>
    </UiProvider>
  );
}

function renderSheet(props: Partial<SheetProps> = {}) {
  const baseProps = {
    open: true,
    onOpenChange: () => {},
    title: 'Edit profile',
    testID: 'sheet',
    children: <Text>Rich sheet content</Text>,
  } satisfies SheetProps;
  return render(
    <Providers>
      <Sheet {...baseProps} {...props} />
    </Providers>,
  );
}

function setViewport(width: number, height: number): () => void {
  const widthDescriptor = Object.getOwnPropertyDescriptor(
    document.documentElement,
    'clientWidth',
  );
  const heightDescriptor = Object.getOwnPropertyDescriptor(
    document.documentElement,
    'clientHeight',
  );
  Object.defineProperty(document.documentElement, 'clientWidth', {
    configurable: true,
    value: width,
  });
  Object.defineProperty(document.documentElement, 'clientHeight', {
    configurable: true,
    value: height,
  });
  window.dispatchEvent(new Event('resize'));
  return () => {
    if (widthDescriptor === undefined) {
      delete (
        document.documentElement as unknown as { clientWidth?: number }
      ).clientWidth;
    } else {
      Object.defineProperty(
        document.documentElement,
        'clientWidth',
        widthDescriptor,
      );
    }
    if (heightDescriptor === undefined) {
      delete (
        document.documentElement as unknown as { clientHeight?: number }
      ).clientHeight;
    } else {
      Object.defineProperty(
        document.documentElement,
        'clientHeight',
        heightDescriptor,
      );
    }
    window.dispatchEvent(new Event('resize'));
  };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

beforeEach(() => {
  // Keep unrelated layout and dismissal tests deterministic and free from an
  // asynchronous preference update. The motion test supplies a controlled promise.
  vi.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockReturnValue(
    new Promise<boolean>(() => {}),
  );
});

describe('Sheet — adaptive rich modal surface', () => {
  it('renders a named direct DialogPanel with fixed header/footer and one internal scroller', async () => {
    renderSheet({
      description: 'Update the public account details.',
      leading: <Text>Avatar</Text>,
      footer: <Text>Save controls</Text>,
      contentContainerStyle: { paddingTop: 3 },
    });

    const dialog = await screen.findByRole('dialog', { name: 'Edit profile' });
    expect(within(dialog).getByRole('heading', { name: 'Edit profile' })).toBeTruthy();
    expect(within(dialog).getByText('Update the public account details.')).toBeTruthy();
    expect(within(dialog).getByText('Avatar')).toBeTruthy();
    const scroll = screen.getByTestId('sheet-body-scroll');
    expect(getComputedStyle(scroll).overflowY).toBe('auto');
    expect(scroll.textContent).toContain('Rich sheet content');
    expect(scroll.textContent).not.toContain('Save controls');
    expect(screen.getByTestId('sheet-footer').textContent).toContain('Save controls');
    expect(scroll.contains(within(dialog).getByRole('button', { name: 'Close' }))).toBe(false);
  });

  it('leaves virtualized scrolling to a single provided child without nesting a ScrollView', async () => {
    renderSheet({
      scrollMode: 'provided',
      children: (
        <ScrollView testID="consumer-scroll">
          <Text>Consumer-owned list</Text>
        </ScrollView>
      ),
    });

    await screen.findByRole('dialog');
    expect(screen.getByTestId('consumer-scroll')).toBeTruthy();
    expect(screen.queryByTestId('sheet-body-scroll')).toBeNull();
    expect(screen.getByTestId('sheet-body').contains(screen.getByTestId('consumer-scroll'))).toBe(
      true,
    );
  });

  it('resolves auto to bottom below tablet and applies safe-area/keyboard invariants last', async () => {
    const restoreViewport = setViewport(390, 300);
    try {
      renderSheet({
        presentation: 'auto',
        safeAreaInsets: { top: 40, right: 7, bottom: 13, left: 5 },
        keyboardOverlap: 21,
        style: {
          borderBottomLeftRadius: 999,
          borderBottomRightRadius: 999,
          maxHeight: 1,
          overflow: 'visible',
          padding: 999,
        },
        bodyStyle: { flexShrink: 0, minHeight: 999 },
        footer: <Text>Footer</Text>,
        footerStyle: { flexShrink: 1 },
      });
      await screen.findByRole('dialog');
      const panel = screen.getByTestId('sheet-panel');
      const content = screen.getByTestId('sheet-content');
      const body = screen.getByTestId('sheet-body');
      const footer = screen.getByTestId('sheet-footer');
      expect(panel.style.borderBottomLeftRadius).toBe('0px');
      expect(panel.style.borderBottomRightRadius).toBe('0px');
      expect(panel.style.paddingTop).toBe(`${lightTheme.spacing.xxl}px`);
      expect(panel.style.paddingRight).toBe(`${lightTheme.spacing.xxl + 7}px`);
      expect(panel.style.paddingBottom).toBe(`${lightTheme.spacing.xxl + 21}px`);
      expect(panel.style.paddingLeft).toBe(`${lightTheme.spacing.xxl + 5}px`);
      expect(panel.style.maxHeight).toBe(`${300 - 40}px`);
      expect(panel.style.overflowX).toBe('hidden');
      expect(panel.style.overflowY).toBe('hidden');
      expect(content.parentElement?.style.paddingTop).toBe('40px');
      expect(body.style.flexShrink).toBe('1');
      expect(body.style.minHeight).toBe('0px');
      expect(footer.style.flexShrink).toBe('0');
    } finally {
      cleanup();
      restoreViewport();
    }
  });

  it('uses bottom inset when the keyboard is absent and the themed top gap when it exceeds safe top', async () => {
    const restoreViewport = setViewport(390, 260);
    try {
      renderSheet({
        presentation: 'bottom',
        safeAreaInsets: { top: 2, bottom: 17 },
      });
      await screen.findByRole('dialog');
      expect(screen.getByTestId('sheet-panel').style.paddingBottom).toBe(
        `${lightTheme.spacing.xxl + 17}px`,
      );
      expect(screen.getByTestId('sheet-panel').style.maxHeight).toBe(
        `${260 - lightTheme.spacing.xl}px`,
      );
      expect(screen.getByTestId('sheet-content').parentElement?.style.paddingTop).toBe(
        `${lightTheme.spacing.xl}px`,
      );
    } finally {
      cleanup();
      restoreViewport();
    }
  });

  it('resolves logical start/end against RTL and keeps side safe-area padding inside full height', async () => {
    const restoreViewport = setViewport(1_000, 620);
    const originalRTL = I18nManager.isRTL;
    try {
      (I18nManager as unknown as { isRTL: boolean }).isRTL = true;
      renderSheet({
        presentation: 'start',
        safeAreaInsets: { top: 11, right: 3, bottom: 5, left: 7 },
      });
      await screen.findByRole('dialog');
      const content = screen.getByTestId('sheet-content');
      const panel = screen.getByTestId('sheet-panel');
      expect(content.style.alignSelf).toBe('flex-end');
      expect(content.style.height).toBe('100%');
      expect(panel.style.height).toBe('100%');
      expect(panel.style.maxHeight).toBe('620px');
      expect(panel.style.borderTopRightRadius).toBe('0px');
      expect(panel.style.borderBottomRightRadius).toBe('0px');
      expect(panel.style.borderTopLeftRadius).toBe(`${lightTheme.radius.lg}px`);
      expect(panel.style.paddingTop).toBe(`${lightTheme.spacing.xxl + 11}px`);
      expect(panel.style.paddingBottom).toBe(`${lightTheme.spacing.xxl + 5}px`);
    } finally {
      cleanup();
      (I18nManager as unknown as { isRTL: boolean }).isRTL = originalRTL;
      restoreViewport();
    }
  });

  it('reports close, backdrop, and Escape requests with the stable overlay id', async () => {
    const onOpenChange = vi.fn();
    renderSheet({ onOpenChange, overlayId: 'profile-sheet' });
    const dialog = await screen.findByRole('dialog');

    fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
    expect(onOpenChange).toHaveBeenLastCalledWith(false, {
      overlayId: 'profile-sheet',
      reason: 'close-action',
    });

    fireEvent.pointerDown(screen.getByTestId('sheet-backdrop'));
    expect(onOpenChange).toHaveBeenLastCalledWith(
      false,
      expect.objectContaining({
        overlayId: 'profile-sheet',
        reason: 'backdrop-press',
      }),
    );

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onOpenChange).toHaveBeenLastCalledWith(
      false,
      expect.objectContaining({
        overlayId: 'profile-sheet',
        reason: 'escape-key',
      }),
    );
  });

  it('blocks every dismissal route consistently when dismissal is disabled', async () => {
    const onOpenChange = vi.fn();
    renderSheet({ onOpenChange, dismissDisabled: true });
    const dialog = await screen.findByRole('dialog');
    const close = within(dialog).getByRole('button', { name: 'Close' });
    expect(close.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(close);
    fireEvent.pointerDown(screen.getByTestId('sheet-backdrop'));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('keeps nested Escape dismissal on the topmost sheet', async () => {
    const outerDismiss = vi.fn();
    const sheetChange = vi.fn();
    render(
      <UiProvider>
        <OverlayProvider>
          <Sheet
            open
            onOpenChange={outerDismiss}
            title="Outer sheet"
            overlayId="outer-sheet"
            testID="outer"
          >
            <Sheet
              open
              onOpenChange={sheetChange}
              title="Inner sheet"
              overlayId="inner-sheet"
              testID="inner"
            >
              <Text>Nested body</Text>
            </Sheet>
          </Sheet>
        </OverlayProvider>
      </UiProvider>,
    );
    await screen.findByRole('dialog', { name: 'Inner sheet' });
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(sheetChange).toHaveBeenCalledWith(
      false,
      expect.objectContaining({ reason: 'escape-key', overlayId: 'inner-sheet' }),
    );
    expect(outerDismiss).not.toHaveBeenCalled();
  });

  it('latches motion per open cycle, observes the preference, and cleans up its listener', async () => {
    let resolvePreference: ((value: boolean) => void) | undefined;
    const preference = new Promise<boolean>((resolve) => {
      resolvePreference = resolve;
    });
    const remove = vi.fn();
    vi.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockReturnValue(preference);
    vi.spyOn(AccessibilityInfo, 'addEventListener').mockReturnValue(
      { remove } as never,
    );
    const scene = (open: boolean) => (
      <Providers>
        <Sheet
          open={open}
          onOpenChange={() => {}}
          title="Motion sheet"
          presentation="bottom"
          testID="sheet"
        >
          <Text>Motion body</Text>
        </Sheet>
      </Providers>
    );
    const rendered = render(scene(true));
    const dialog = await screen.findByRole('dialog');
    const animationHost = dialog.parentElement?.parentElement;
    expect(getComputedStyle(animationHost as Element).animationDuration).toBe('');
    await act(async () => {
      resolvePreference?.(false);
      await preference;
    });
    expect(getComputedStyle(animationHost as Element).animationDuration).toBe('');

    // A close/open pair that never commits a closed frame remains the same
    // visible cycle and must not consume the prepared next entrance.
    act(() => {
      rendered.rerender(scene(false));
      rendered.rerender(scene(true));
    });
    const rapidContent = screen.getByTestId('sheet');
    const rapidAnimationHost = rapidContent.parentElement?.parentElement;
    expect(getComputedStyle(rapidAnimationHost as Element).animationDuration).toBe('');

    rendered.rerender(scene(false));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    rendered.rerender(scene(true));
    const reopenedContent = await screen.findByTestId('sheet');
    const reopenedAnimationHost = reopenedContent.parentElement?.parentElement;
    expect(getComputedStyle(reopenedAnimationHost as Element).animationDuration).toBe('250ms');
    expect(getComputedStyle(reopenedAnimationHost as Element).transform).toBe('translateY(0%)');
    fireEvent.animationEnd(reopenedAnimationHost as Element);
    expect(await screen.findByRole('dialog')).toBeTruthy();
    rendered.unmount();
    expect(remove).toHaveBeenCalledTimes(1);
  });

  it.each([
    {
      label: 'title',
      props: { title: '  ' },
      message: 'Sheet title must be a non-empty string.',
    },
    {
      label: 'presentation',
      props: { presentation: 'center' as SheetProps['presentation'] },
      message: 'Sheet presentation must be "auto", "bottom", "start", or "end".',
    },
    {
      label: 'scroll mode',
      props: { scrollMode: 'nested' as SheetProps['scrollMode'] },
      message: 'Sheet scrollMode must be "internal" or "provided".',
    },
    {
      label: 'safe top',
      props: { safeAreaInsets: { top: Number.NaN } },
      message: 'Sheet safeAreaInsets.top must be finite and greater than or equal to 0.',
    },
    {
      label: 'safe right',
      props: { safeAreaInsets: { right: -1 } },
      message: 'Sheet safeAreaInsets.right must be finite and greater than or equal to 0.',
    },
    {
      label: 'safe bottom',
      props: { safeAreaInsets: { bottom: Number.POSITIVE_INFINITY } },
      message: 'Sheet safeAreaInsets.bottom must be finite and greater than or equal to 0.',
    },
    {
      label: 'safe left',
      props: { safeAreaInsets: { left: -1 } },
      message: 'Sheet safeAreaInsets.left must be finite and greater than or equal to 0.',
    },
    {
      label: 'keyboard overlap',
      props: { keyboardOverlap: Number.NaN },
      message: 'Sheet keyboardOverlap must be finite and greater than or equal to 0.',
    },
    {
      label: 'provided child',
      props: {
        scrollMode: 'provided' as const,
        children: 'not-an-element' as unknown as ReactElement,
      },
      message:
        'Sheet children must be a single React element when scrollMode is "provided".',
    },
  ])('fails fast for an invalid $label contract', ({ props, message }) => {
    expect(() => renderSheet(props as Partial<SheetProps>)).toThrow(message);
  });
});
