import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConfirmDialog } from '../../src/components/confirm-dialog';
import { UiProvider } from '../../src/components/provider';

afterEach(cleanup);

function finishOpeningAnimation(testID: string): void {
  const modalRoot = screen.getByTestId(testID);
  const animationRoot = modalRoot.parentElement?.parentElement;
  if (animationRoot === null || animationRoot === undefined) {
    throw new Error('Expected the React Native Web modal animation container.');
  }
  fireEvent.animationEnd(animationRoot);
}

describe('ConfirmDialog', () => {
  it('is a named controlled modal with exactly the safe cancel and affirmative actions', async () => {
    const onDismiss = vi.fn();
    const onConfirm = vi.fn();
    render(
      <UiProvider>
        <ConfirmDialog
          visible
          title="Delete entry"
          description="This cannot be undone."
          cancelLabel="Keep entry"
          confirmLabel="Delete entry"
          confirmVariant="destructive"
          overlayId="delete-entry"
          onDismiss={onDismiss}
          onConfirm={onConfirm}
          testID="confirm"
        />
      </UiProvider>,
    );

    finishOpeningAnimation('confirm');
    const dialog = await screen.findByRole('dialog', { name: 'Delete entry' });
    expect(dialog.getAttribute('aria-describedby')).toBe('delete-entry-description');
    expect(within(dialog).queryByRole('button', { name: 'Close' })).toBeNull();
    expect(within(dialog).getAllByRole('button')).toHaveLength(2);
    expect(within(dialog).getByRole('button', { name: 'Keep entry' })).toBeTruthy();
    const confirm = within(dialog).getByRole('button', { name: 'Delete entry' });
    expect(confirm.style.backgroundColor).toBe('rgb(180, 35, 44)');

    fireEvent.click(confirm);
    expect(onConfirm).toHaveBeenCalledOnce();
    expect(onDismiss).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: 'Delete entry' })).toBeTruthy();
  });

  it('reports the explicit cancel action and delegates ordinary Dialog dismiss reasons', async () => {
    const onDismiss = vi.fn();
    render(
      <UiProvider>
        <ConfirmDialog
          visible
          title="Discard draft"
          onConfirm={() => {}}
          onDismiss={onDismiss}
          overlayId="discard-draft"
          testID="discard"
        />
      </UiProvider>,
    );

    finishOpeningAnimation('discard');
    await screen.findByRole('dialog', { name: 'Discard draft' });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onDismiss).toHaveBeenLastCalledWith({
      overlayId: 'discard-draft',
      reason: 'cancel-action',
    });

    fireEvent.pointerDown(screen.getByTestId('discard-backdrop'));
    expect(onDismiss).toHaveBeenLastCalledWith(
      expect.objectContaining({
        overlayId: 'discard-draft',
        reason: 'backdrop-press',
      }),
    );

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onDismiss).toHaveBeenLastCalledWith(
      expect.objectContaining({
        overlayId: 'discard-draft',
        reason: 'escape-key',
      }),
    );
  });

  it('places initial focus on cancel after the modal focus trap initializes', async () => {
    render(
      <UiProvider>
        <ConfirmDialog
          visible
          title="Focus-safe confirmation"
          onConfirm={() => {}}
          onDismiss={() => {}}
          testID="focus-confirm"
        />
      </UiProvider>,
    );

    finishOpeningAnimation('focus-confirm');
    const cancel = await screen.findByRole('button', { name: 'Cancel' });
    await waitFor(() => expect(document.activeElement).toBe(cancel));
  });

  it('makes loading a full interaction lock while exposing disabled and busy state', async () => {
    const onDismiss = vi.fn();
    const onConfirm = vi.fn();
    render(
      <UiProvider>
        <ConfirmDialog
          visible
          title="Saving confirmation"
          loading
          onConfirm={onConfirm}
          onDismiss={onDismiss}
          testID="saving-confirm"
        />
      </UiProvider>,
    );

    finishOpeningAnimation('saving-confirm');
    const dialog = await screen.findByRole('dialog', { name: 'Saving confirmation' });
    for (const button of within(dialog).getAllByRole('button')) {
      expect(button.getAttribute('aria-disabled')).toBe('true');
      fireEvent.click(button);
    }
    expect(screen.getByRole('button', { name: 'Confirm' }).getAttribute('aria-busy')).toBe('true');
    fireEvent.pointerDown(screen.getByTestId('saving-confirm-backdrop'));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onConfirm).not.toHaveBeenCalled();
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('can disable only the affirmative action while retaining cancellation', async () => {
    const onDismiss = vi.fn();
    const onConfirm = vi.fn();
    render(
      <UiProvider>
        <ConfirmDialog
          visible
          title="Guarded confirmation"
          confirmDisabled
          onConfirm={onConfirm}
          onDismiss={onDismiss}
          overlayId="guarded-confirmation"
          testID="guarded-confirmation"
        />
      </UiProvider>,
    );

    finishOpeningAnimation('guarded-confirmation');
    await screen.findByRole('dialog', { name: 'Guarded confirmation' });
    const confirm = screen.getByRole('button', { name: 'Confirm' });
    expect(confirm.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(confirm);
    expect(onConfirm).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onDismiss).toHaveBeenCalledWith({
      overlayId: 'guarded-confirmation',
      reason: 'cancel-action',
    });
  });
});
