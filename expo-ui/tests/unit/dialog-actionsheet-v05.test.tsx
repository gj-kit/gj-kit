import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Platform, Text, View } from 'react-native';
import { ActionSheet } from '../../src/components/action-sheet';
import { Dialog, DialogPanel } from '../../src/components/dialog';
import { UiProvider } from '../../src/components/provider';
import { lightTheme } from '../../src/theme/createTheme';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('Dialog v2 semantics and dismissal policy', () => {
  it('Modal alone owns dialog role/name while panel IDs and one close button are connected', async () => {
    const onDismiss = vi.fn();
    render(
      <UiProvider>
        <Dialog
          visible
          animationType="none"
          overlayId="preferences"
          onDismiss={onDismiss}
          testID="dialog"
        >
          <DialogPanel title="Preferences" description="Choose how the app behaves">
            <Text>Dialog body</Text>
          </DialogPanel>
        </Dialog>
      </UiProvider>,
    );

    const dialog = await screen.findByRole('dialog', { name: 'Preferences' });
    expect(dialog.getAttribute('tabindex')).toBe('-1');
    expect(dialog.getAttribute('aria-labelledby')).toBe('preferences-title');
    expect(dialog.getAttribute('aria-describedby')).toBe('preferences-description');
    expect(document.getElementById('preferences-title')?.textContent).toBe('Preferences');
    expect(screen.getByRole('heading', { name: 'Preferences' })).toBeTruthy();
    expect(document.getElementById('preferences-description')?.textContent).toBe(
      'Choose how the app behaves',
    );
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(screen.getAllByRole('button')).toHaveLength(1);

    const backdrop = screen.getByTestId('dialog-backdrop');
    expect(backdrop.getAttribute('aria-hidden')).toBe('true');
    expect(backdrop.getAttribute('tabindex')).toBe('-1');
    expect(backdrop.getAttribute('role')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onDismiss).toHaveBeenLastCalledWith({
      overlayId: 'preferences',
      reason: 'close-action',
    });

    fireEvent.pointerDown(backdrop);
    expect(onDismiss).toHaveBeenLastCalledWith(
      expect.objectContaining({
        overlayId: 'preferences',
        reason: 'backdrop-press',
      }),
    );

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onDismiss).toHaveBeenLastCalledWith(
      expect.objectContaining({
        overlayId: 'preferences',
        reason: 'escape-key',
      }),
    );
  });

  it('an explicit label overrides panel naming and labels arbitrary content', async () => {
    const { rerender } = render(
      <UiProvider>
        <Dialog
          visible
          animationType="none"
          accessibilityLabel="Delete account confirmation"
          onDismiss={() => {}}
        >
          <DialogPanel title="Delete account"><Text>Body</Text></DialogPanel>
        </Dialog>
      </UiProvider>,
    );

    const named = await screen.findByRole('dialog', { name: 'Delete account confirmation' });
    expect(named.getAttribute('aria-labelledby')).toBeNull();

    rerender(
      <UiProvider>
        <Dialog
          visible
          animationType="none"
          accessibilityLabel="Custom editor"
          onDismiss={() => {}}
        >
          <View><Text>Arbitrary content</Text></View>
        </Dialog>
      </UiProvider>,
    );

    expect(await screen.findByRole('dialog', { name: 'Custom editor' })).toBeTruthy();
  });

  it('rejects a React-element content tree that bypasses JSX component identity without a name', () => {
    expect(() =>
      render(
        <UiProvider>
          <Dialog visible animationType="none" onDismiss={() => {}}>
            <View />
          </Dialog>
        </UiProvider>,
      ),
    ).toThrow('Dialog requires accessibilityLabel');
  });

  it.each([
    {
      contract: 'direct panel title',
      renderInvalid: () => (
        <Dialog visible animationType="none" onDismiss={() => {}}>
          <DialogPanel title={'  \n '} />
        </Dialog>
      ),
      message: 'DialogPanel title must be a non-empty string.',
    },
    {
      contract: 'direct panel description',
      renderInvalid: () => (
        <Dialog visible animationType="none" onDismiss={() => {}}>
          <DialogPanel title="Named" description={'\t '} />
        </Dialog>
      ),
      message: 'DialogPanel description must be a non-empty string.',
    },
    {
      contract: 'direct panel close label',
      renderInvalid: () => (
        <Dialog visible animationType="none" onDismiss={() => {}}>
          <DialogPanel title="Named" closeAccessibilityLabel="  " />
        </Dialog>
      ),
      message: 'DialogPanel closeAccessibilityLabel must be a non-empty string.',
    },
    {
      contract: 'optional direct-panel accessibility label',
      renderInvalid: () => (
        <Dialog
          visible
          animationType="none"
          accessibilityLabel="  "
          onDismiss={() => {}}
        >
          <DialogPanel title="Named" />
        </Dialog>
      ),
      message: 'Dialog accessibilityLabel must be a non-empty string.',
    },
    {
      contract: 'required arbitrary-content accessibility label',
      renderInvalid: () => (
        <Dialog
          visible
          animationType="none"
          accessibilityLabel={' \t '}
          onDismiss={() => {}}
        >
          <View />
        </Dialog>
      ),
      message: 'Dialog accessibilityLabel must be a non-empty string.',
    },
    {
      contract: 'overlay id',
      renderInvalid: () => (
        <Dialog visible animationType="none" overlayId="  " onDismiss={() => {}}>
          <DialogPanel title="Named" />
        </Dialog>
      ),
      message: 'Dialog overlayId must be a non-empty string.',
    },
  ])('rejects a whitespace-only $contract', ({ renderInvalid, message }) => {
    expect(() => render(<UiProvider>{renderInvalid()}</UiProvider>)).toThrow(message);
  });

  it('inline arbitrary content stays non-modal and does not require or pretend a dialog name', () => {
    render(
      <UiProvider>
        <Dialog visible presentation="inline" onDismiss={() => {}} testID="inline-arbitrary">
          <View testID="inline-body"><Text>Inline body</Text></View>
        </Dialog>
      </UiProvider>,
    );

    expect(screen.getByTestId('inline-body')).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByTestId('inline-arbitrary').getAttribute('aria-label')).toBeNull();
  });

  it('only a direct DialogPanel receives IDs and the default close action', async () => {
    render(
      <UiProvider>
        <Dialog
          visible
          animationType="none"
          accessibilityLabel="Composed content"
          onDismiss={() => {}}
        >
          <View>
            <DialogPanel title="First nested panel" />
            <DialogPanel title="Second nested panel" />
          </View>
        </Dialog>
      </UiProvider>,
    );

    await screen.findByRole('dialog', { name: 'Composed content' });
    expect(screen.queryByRole('button', { name: 'Close' })).toBeNull();
    expect(screen.getByText('First nested panel').getAttribute('id')).toBeNull();
    expect(screen.getByText('Second nested panel').getAttribute('id')).toBeNull();
  });

  it('wires the native-only descendant branch and names its header without grouping', async () => {
    const originalOS = Platform.OS;
    Platform.OS = 'ios';
    try {
      render(
        <UiProvider>
          <Dialog
            visible
            animationType="none"
            accessibilityLabel="Native override"
            onDismiss={() => {}}
            testID="native-dialog"
          >
            <DialogPanel title="Visible native title" />
          </Dialog>
        </UiProvider>,
      );

      const modalRoot = screen.getByTestId('native-dialog');
      const content = screen.getByTestId('native-dialog-content');
      const title = await screen.findByRole('heading', { name: 'Native override' });
      expect(modalRoot.getAttribute('aria-labelledby')).toBeNull();
      expect(modalRoot.getAttribute('aria-describedby')).toBeNull();
      // RNW intentionally ignores the native-only container prop. The actual
      // descendant stays ungrouped while its header carries the native name.
      expect(content.getAttribute('aria-label')).toBeNull();
      expect(content.getAttribute('role')).toBeNull();
      expect(title.textContent).toBe('Visible native title');
    } finally {
      cleanup();
      Platform.OS = originalOS;
    }
  });

  it('dismissDisabled keeps close visible but blocks close, backdrop and Escape', async () => {
    const onDismiss = vi.fn();
    render(
      <UiProvider>
        <Dialog
          visible
          animationType="none"
          dismissDisabled
          onDismiss={onDismiss}
          testID="locked"
        >
          <DialogPanel title="Saving"><Text>Please wait</Text></DialogPanel>
        </Dialog>
      </UiProvider>,
    );

    await screen.findByRole('dialog', { name: 'Saving' });
    const close = screen.getByRole('button', { name: 'Close' });
    expect(close.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(close);
    fireEvent.pointerDown(screen.getByTestId('locked-backdrop'));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('Provider close icon is used and remains hidden from the accessibility tree', async () => {
    const closeIcon = vi.fn(() => <View testID="provider-close" />);
    render(
      <UiProvider icons={{ close: closeIcon }}>
        <Dialog visible animationType="none" onDismiss={() => {}}>
          <DialogPanel title="Named panel" />
        </Dialog>
      </UiProvider>,
    );

    await screen.findByRole('dialog', { name: 'Named panel' });
    expect(closeIcon).toHaveBeenCalledWith({
      color: lightTheme.colors.text,
      size: Math.round(lightTheme.metrics.control.md * 0.48),
    });
    const close = screen.getByRole('button', { name: 'Close' });
    expect(close.style.width).toBe(`${lightTheme.metrics.control.md}px`);
    expect(close.style.height).toBe(`${lightTheme.metrics.control.md}px`);
    expect(screen.getByTestId('provider-close').parentElement?.getAttribute('aria-hidden')).toBe(
      'true',
    );
  });

  it('inline presentation is truthful: no portal dialog role or backdrop, but panel close works', () => {
    const onDismiss = vi.fn();
    render(
      <UiProvider>
        <Dialog
          visible
          presentation="inline"
          overlayId="inline-help"
          onDismiss={onDismiss}
          testID="inline"
        >
          <DialogPanel title="Inline help" />
        </Dialog>
      </UiProvider>,
    );

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByTestId('inline-backdrop')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onDismiss).toHaveBeenCalledWith({
      overlayId: 'inline-help',
      reason: 'close-action',
    });
  });

  it('only explicit focus refs override RNW defaults and final focus runs after exit', async () => {
    vi.useFakeTimers();
    const initialFocus = vi.fn();
    const finalFocus = vi.fn();
    const initialFocusRef = { current: { focus: initialFocus } };
    const finalFocusRef = { current: { focus: finalFocus } };
    const { rerender } = render(
      <UiProvider>
        <Dialog
          visible
          animationType="none"
          initialFocusRef={initialFocusRef}
          finalFocusRef={finalFocusRef}
          onDismiss={() => {}}
        >
          <DialogPanel title="Focus test" />
        </Dialog>
      </UiProvider>,
    );

    await vi.runAllTimersAsync();
    expect(initialFocus).toHaveBeenCalledTimes(1);
    expect(finalFocus).not.toHaveBeenCalled();

    rerender(
      <UiProvider>
        <Dialog
          visible={false}
          animationType="none"
          initialFocusRef={initialFocusRef}
          finalFocusRef={finalFocusRef}
          onDismiss={() => {}}
        >
          <DialogPanel title="Focus test" />
        </Dialog>
      </UiProvider>,
    );
    await vi.runAllTimersAsync();
    expect(finalFocus).toHaveBeenCalledTimes(1);
  });

  it('does not restore stale final focus when a fading dialog rapidly reopens', async () => {
    vi.useFakeTimers();
    const finalFocus = vi.fn();
    const finalFocusRef = { current: { focus: finalFocus } };
    const dialog = (visible: boolean) => (
      <UiProvider>
        <Dialog
          visible={visible}
          animationType="fade"
          finalFocusRef={finalFocusRef}
          onDismiss={() => {}}
          testID="reopen-dialog"
        >
          <DialogPanel title="Rapid reopen" />
        </Dialog>
      </UiProvider>
    );
    const { rerender } = render(dialog(true));
    const modalRoot = screen.getByTestId('reopen-dialog');
    const animationRoot = modalRoot.parentElement?.parentElement ?? null;
    expect(animationRoot).not.toBeNull();
    if (animationRoot !== null) fireEvent.animationEnd(animationRoot);

    rerender(dialog(false));
    rerender(dialog(true));
    if (animationRoot !== null) fireEvent.animationEnd(animationRoot);
    await vi.runAllTimersAsync();
    expect(finalFocus).not.toHaveBeenCalled();
  });
});

describe('ActionSheet typed button semantics', () => {
  it('renders item buttons plus an always-visible cancel button without a hidden close action', async () => {
    const onDismiss = vi.fn();
    render(
      <UiProvider>
        <ActionSheet
          visible
          animationType="none"
          title="Document actions"
          description="Choose one action"
          items={[
            {
              value: 'duplicate',
              label: 'Duplicate',
              description: 'Create a copy',
              disabled: true,
            },
            { value: 'delete', label: 'Delete', destructive: true },
          ] as const}
          onDismiss={onDismiss}
          overlayId="document-actions"
          testID="sheet"
        />
      </UiProvider>,
    );

    const dialog = await screen.findByRole('dialog', { name: 'Document actions' });
    expect(dialog.getAttribute('aria-describedby')).toBe('document-actions-description');
    expect(within(dialog).getAllByRole('button')).toHaveLength(3);
    expect(within(dialog).queryByRole('button', { name: 'Close' })).toBeNull();
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeTruthy();
    const duplicate = within(dialog).getByRole('button', { name: 'Duplicate' });
    expect(duplicate.getAttribute('aria-describedby')).toBe(
      'document-actions-action-0-description',
    );
    expect(
      document.getElementById(duplicate.getAttribute('aria-describedby') ?? '')?.textContent,
    ).toBe('Create a copy');
    expect(duplicate.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(duplicate);
    expect(onDismiss).not.toHaveBeenCalled();

    expect(screen.getByText('Delete').style.color).toBe('rgb(180, 35, 44)');

    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));
    expect(onDismiss).toHaveBeenLastCalledWith(
      expect.objectContaining({
        overlayId: 'document-actions',
        reason: 'action-select',
        value: 'delete',
      }),
    );

    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(onDismiss).toHaveBeenLastCalledWith(
      expect.objectContaining({
        overlayId: 'document-actions',
        reason: 'cancel-action',
      }),
    );
  });

  it('allows dynamic empty items while preserving the safe cancel action', async () => {
    render(
      <UiProvider>
        <ActionSheet
          visible
          animationType="none"
          title="No available actions"
          items={[]}
          onDismiss={() => {}}
        />
      </UiProvider>,
    );

    const dialog = await screen.findByRole('dialog', { name: 'No available actions' });
    expect(within(dialog).getAllByRole('button')).toHaveLength(1);
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeTruthy();
  });

  it('disabled items and busy sheets expose state and block every callback', async () => {
    const onDismiss = vi.fn();
    render(
      <UiProvider>
        <ActionSheet
          visible
          animationType="none"
          title="Busy actions"
          items={[
            { value: 'disabled', label: 'Unavailable', disabled: true },
            { value: 'ready', label: 'Available' },
          ] as const}
          busy
          onDismiss={onDismiss}
          testID="busy-sheet"
        />
      </UiProvider>,
    );

    const dialog = await screen.findByRole('dialog', { name: 'Busy actions' });
    expect(dialog.getAttribute('tabindex')).toBe('-1');
    await waitFor(() => expect(document.activeElement).toBe(dialog));
    for (const button of within(dialog).getAllByRole('button')) {
      expect(button.getAttribute('aria-disabled')).toBe('true');
      expect(button.getAttribute('aria-busy')).toBe('true');
      fireEvent.click(button);
    }
    fireEvent.pointerDown(screen.getByTestId('busy-sheet-backdrop'));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('keyboardOverlap replaces bottomInset and consumer styles cannot override padding', async () => {
    render(
      <UiProvider>
        <ActionSheet
          visible
          animationType="none"
          presentation="bottom"
          title="Insets"
          items={[]}
          bottomInset={7}
          keyboardOverlap={11}
          style={{ paddingBottom: 1 }}
          onDismiss={() => {}}
          testID="inset-sheet"
        />
      </UiProvider>,
    );

    await screen.findByRole('dialog', { name: 'Insets' });
    expect(screen.getByTestId('inset-sheet-panel').style.paddingBottom).toBe(
      `${lightTheme.spacing.xxl + 11}px`,
    );
  });

  it('center presentation keeps base padding instead of adding mobile insets', async () => {
    render(
      <UiProvider>
        <ActionSheet
          visible
          animationType="none"
          presentation="center"
          title="Centered"
          items={[]}
          bottomInset={17}
          keyboardOverlap={23}
          onDismiss={() => {}}
          testID="center-sheet"
        />
      </UiProvider>,
    );

    await screen.findByRole('dialog', { name: 'Centered' });
    expect(screen.getByTestId('center-sheet-panel').style.paddingBottom).toBe(
      `${lightTheme.spacing.xxl}px`,
    );
  });

  it('scrolls long item lists inside a constrained panel while cancel stays pinned', async () => {
    const clientHeight = Object.getOwnPropertyDescriptor(
      document.documentElement,
      'clientHeight',
    );
    const clientWidth = Object.getOwnPropertyDescriptor(document.documentElement, 'clientWidth');
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
      const items = Array.from({ length: 20 }, (_, index) => ({
        value: `action-${index}`,
        label: `Action ${index}`,
      }));
      render(
        <UiProvider>
          <ActionSheet
            visible
            animationType="none"
            presentation="bottom"
            title="Long actions"
            items={items}
            onDismiss={() => {}}
            testID="long-sheet"
          />
        </UiProvider>,
      );

      await screen.findByRole('dialog', { name: 'Long actions' });
      const panel = screen.getByTestId('long-sheet-panel');
      const itemsScroll = screen.getByTestId('long-sheet-items');
      const cancel = screen.getByRole('button', { name: 'Cancel' });
      expect(panel.style.maxHeight).toBe(`${260 - lightTheme.spacing.xl * 2}px`);
      expect(window.getComputedStyle(itemsScroll).overflowY).toBe('auto');
      expect(itemsScroll.contains(cancel)).toBe(false);
      expect(cancel.parentElement).toBe(itemsScroll.parentElement);
    } finally {
      cleanup();
      if (clientHeight === undefined) {
        delete (document.documentElement as unknown as { clientHeight?: number }).clientHeight;
      } else {
        Object.defineProperty(document.documentElement, 'clientHeight', clientHeight);
      }
      if (clientWidth === undefined) {
        delete (document.documentElement as unknown as { clientWidth?: number }).clientWidth;
      } else {
        Object.defineProperty(document.documentElement, 'clientWidth', clientWidth);
      }
      window.dispatchEvent(new Event('resize'));
    }
  });

  it('rejects duplicate item values before rendering ambiguous actions', () => {
    expect(() =>
      render(
        <UiProvider>
          <ActionSheet
            visible
            animationType="none"
            title="Duplicate actions"
            items={[
              { value: 'same', label: 'First' },
              { value: 'same', label: 'Second' },
            ]}
            onDismiss={() => {}}
          />
        </UiProvider>,
      ),
    ).toThrow('ActionSheet item values must be unique');
  });

  it.each([
    {
      contract: 'title',
      renderInvalid: () => (
        <ActionSheet visible title="  " items={[]} onDismiss={() => {}} />
      ),
      message: 'ActionSheet title must be a non-empty string.',
    },
    {
      contract: 'description',
      renderInvalid: () => (
        <ActionSheet
          visible
          title="Named"
          description={' \n '}
          items={[]}
          onDismiss={() => {}}
        />
      ),
      message: 'ActionSheet description must be a non-empty string.',
    },
    {
      contract: 'accessibility label',
      renderInvalid: () => (
        <ActionSheet
          visible
          title="Named"
          accessibilityLabel={'\t'}
          items={[]}
          onDismiss={() => {}}
        />
      ),
      message: 'ActionSheet accessibilityLabel must be a non-empty string.',
    },
    {
      contract: 'overlay id',
      renderInvalid: () => (
        <ActionSheet
          visible
          title="Named"
          overlayId="  "
          items={[]}
          onDismiss={() => {}}
        />
      ),
      message: 'ActionSheet overlayId must be a non-empty string.',
    },
    {
      contract: 'cancel label',
      renderInvalid: () => (
        <ActionSheet
          visible
          title="Named"
          cancelLabel={' \t'}
          items={[]}
          onDismiss={() => {}}
        />
      ),
      message: 'ActionSheet cancelLabel must be a non-empty string.',
    },
    {
      contract: 'item value',
      renderInvalid: () => (
        <ActionSheet
          visible
          title="Named"
          items={[{ value: '  ', label: 'Action' }]}
          onDismiss={() => {}}
        />
      ),
      message: 'ActionSheet item at index 0 value must be a non-empty string.',
    },
    {
      contract: 'item label',
      renderInvalid: () => (
        <ActionSheet
          visible
          title="Named"
          items={[{ value: 'action', label: '  ' }]}
          onDismiss={() => {}}
        />
      ),
      message: 'ActionSheet item at index 0 label must be a non-empty string.',
    },
    {
      contract: 'item description',
      renderInvalid: () => (
        <ActionSheet
          visible
          title="Named"
          items={[{ value: 'action', label: 'Action', description: '\n ' }]}
          onDismiss={() => {}}
        />
      ),
      message: 'ActionSheet item at index 0 description must be a non-empty string.',
    },
    {
      contract: 'item accessibility label',
      renderInvalid: () => (
        <ActionSheet
          visible
          title="Named"
          items={[{ value: 'action', label: 'Action', accessibilityLabel: '\t ' }]}
          onDismiss={() => {}}
        />
      ),
      message:
        'ActionSheet item at index 0 accessibilityLabel must be a non-empty string.',
    },
  ])('rejects a whitespace-only $contract', ({ renderInvalid, message }) => {
    expect(() => render(<UiProvider>{renderInvalid()}</UiProvider>)).toThrow(message);
  });

  it.each([
    {
      contract: 'bottomInset NaN',
      bottomInset: Number.NaN,
      keyboardOverlap: 0,
      message: 'ActionSheet bottomInset must be finite and greater than or equal to 0.',
    },
    {
      contract: 'bottomInset Infinity',
      bottomInset: Number.POSITIVE_INFINITY,
      keyboardOverlap: 0,
      message: 'ActionSheet bottomInset must be finite and greater than or equal to 0.',
    },
    {
      contract: 'negative bottomInset',
      bottomInset: -1,
      keyboardOverlap: 0,
      message: 'ActionSheet bottomInset must be finite and greater than or equal to 0.',
    },
    {
      contract: 'keyboardOverlap NaN',
      bottomInset: 0,
      keyboardOverlap: Number.NaN,
      message: 'ActionSheet keyboardOverlap must be finite and greater than or equal to 0.',
    },
    {
      contract: 'keyboardOverlap Infinity',
      bottomInset: 0,
      keyboardOverlap: Number.POSITIVE_INFINITY,
      message: 'ActionSheet keyboardOverlap must be finite and greater than or equal to 0.',
    },
    {
      contract: 'negative keyboardOverlap',
      bottomInset: 0,
      keyboardOverlap: -1,
      message: 'ActionSheet keyboardOverlap must be finite and greater than or equal to 0.',
    },
  ])('rejects $contract', ({ bottomInset, keyboardOverlap, message }) => {
    expect(() =>
      render(
        <UiProvider>
          <ActionSheet
            visible
            title="Named"
            items={[]}
            bottomInset={bottomInset}
            keyboardOverlap={keyboardOverlap}
            onDismiss={() => {}}
          />
        </UiProvider>,
      ),
    ).toThrow(message);
  });

  it('cancel receives explicit initial focus after RNW initializes its own focus trap', async () => {
    render(
      <UiProvider>
        <ActionSheet
          visible
          animationType="none"
          title="Focus-safe actions"
          items={[{ value: 'delete', label: 'Delete', destructive: true }] as const}
          onDismiss={() => {}}
        />
      </UiProvider>,
    );

    const cancel = await screen.findByRole('button', { name: 'Cancel' });
    await waitFor(() => expect(document.activeElement).toBe(cancel));
  });
});
