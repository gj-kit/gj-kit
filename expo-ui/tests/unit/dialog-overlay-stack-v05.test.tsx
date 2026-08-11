import { useLayoutEffect } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Text } from 'react-native';
import { Dialog, DialogPanel } from '../../src/components/dialog';
import { useOptionalOverlayStack } from '../../src/components/overlay/provider';
import type { OverlayStack } from '../../src/components/overlay/stack';
import { UiProvider } from '../../src/components/provider';

afterEach(cleanup);

interface NestedDialogSceneProps {
  readonly showParent?: boolean;
  readonly showChild?: boolean;
  readonly childDismissDisabled?: boolean;
  readonly onParentDismiss: ReturnType<typeof vi.fn>;
  readonly onChildDismiss: ReturnType<typeof vi.fn>;
  readonly captureStack: (stack: OverlayStack) => void;
}

interface StackCapture {
  current: OverlayStack | null;
}

function requireCapturedStack(capture: StackCapture): OverlayStack {
  if (capture.current === null) throw new Error('Expected OverlayStack to be captured.');
  return capture.current;
}

function CaptureStack({ capture }: { readonly capture: (stack: OverlayStack) => void }) {
  const stack = useOptionalOverlayStack();
  useLayoutEffect(() => {
    if (stack !== null) capture(stack);
  }, [capture, stack]);
  return null;
}

function NestedDialogScene({
  showParent = true,
  showChild = true,
  childDismissDisabled = false,
  onParentDismiss,
  onChildDismiss,
  captureStack,
}: NestedDialogSceneProps) {
  return (
    <UiProvider>
      <CaptureStack capture={captureStack} />
      {showParent ? (
        <Dialog
          visible
          animationType="none"
          overlayId="parent-dialog"
          onDismiss={onParentDismiss}
          testID="parent-dialog"
        >
          <DialogPanel title="Parent dialog">
            <Text>Parent body</Text>
            {showChild ? (
              <Dialog
                visible
                animationType="none"
                overlayId="child-dialog"
                dismissDisabled={childDismissDisabled}
                onDismiss={onChildDismiss}
                testID="child-dialog"
              >
                <DialogPanel title="Child dialog">
                  <Text>Child body</Text>
                </DialogPanel>
              </Dialog>
            ) : null}
          </DialogPanel>
        </Dialog>
      ) : null}
    </UiProvider>
  );
}

describe('Dialog overlay stack integration', () => {
  it('orders initially-open nested dialogs by ancestry and Escape dismisses only the child', async () => {
    const onParentDismiss = vi.fn();
    const onChildDismiss = vi.fn();
    const stack: StackCapture = { current: null };
    const captureStack = (value: OverlayStack) => {
      stack.current = value;
    };
    const rendered = render(
      <NestedDialogScene
        onParentDismiss={onParentDismiss}
        onChildDismiss={onChildDismiss}
        captureStack={captureStack}
      />,
    );

    await screen.findByTestId('child-dialog');
    await waitFor(() => {
      expect(requireCapturedStack(stack).getSnapshot().entries).toEqual([
        expect.objectContaining({ id: 'parent-dialog' }),
        expect.objectContaining({ id: 'child-dialog', parentId: 'parent-dialog' }),
      ]);
      expect(requireCapturedStack(stack).getSnapshot().topmost?.id).toBe('child-dialog');
    });

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onChildDismiss).toHaveBeenCalledTimes(1);
    expect(onChildDismiss).toHaveBeenLastCalledWith(
      expect.objectContaining({
        overlayId: 'child-dialog',
        reason: 'escape-key',
      }),
    );
    expect(onParentDismiss).not.toHaveBeenCalled();

    rendered.rerender(
      <NestedDialogScene
        showChild={false}
        onParentDismiss={onParentDismiss}
        onChildDismiss={onChildDismiss}
        captureStack={captureStack}
      />,
    );
    await waitFor(() =>
      expect(requireCapturedStack(stack).getSnapshot().entries).toHaveLength(1),
    );
    // RNW used to emit a later keyup through Modal.onRequestClose and close
    // the newly exposed parent. Web Dialog now owns only the shared keydown.
    fireEvent.keyUp(document, { key: 'Escape' });
    expect(onParentDismiss).not.toHaveBeenCalled();
  });

  it('removes child registrations with the parent and restores their parentId on remount', async () => {
    const onParentDismiss = vi.fn();
    const onChildDismiss = vi.fn();
    const stack: StackCapture = { current: null };
    const captureStack = (value: OverlayStack) => {
      stack.current = value;
    };
    const rendered = render(
      <NestedDialogScene
        onParentDismiss={onParentDismiss}
        onChildDismiss={onChildDismiss}
        captureStack={captureStack}
      />,
    );

    await waitFor(() =>
      expect(requireCapturedStack(stack).getSnapshot().entries).toHaveLength(2),
    );
    rendered.rerender(
      <NestedDialogScene
        showParent={false}
        onParentDismiss={onParentDismiss}
        onChildDismiss={onChildDismiss}
        captureStack={captureStack}
      />,
    );
    expect(requireCapturedStack(stack).getSnapshot().entries).toEqual([]);

    rendered.rerender(
      <NestedDialogScene
        onParentDismiss={onParentDismiss}
        onChildDismiss={onChildDismiss}
        captureStack={captureStack}
      />,
    );
    await waitFor(() => {
      expect(requireCapturedStack(stack).getSnapshot().entries).toEqual([
        expect.objectContaining({ id: 'parent-dialog' }),
        expect.objectContaining({ id: 'child-dialog', parentId: 'parent-dialog' }),
      ]);
    });
  });

  it('keeps a nondismissible child as the blocker and updates policy without remounting', async () => {
    const onParentDismiss = vi.fn();
    const onChildDismiss = vi.fn();
    const stack: StackCapture = { current: null };
    const captureStack = (value: OverlayStack) => {
      stack.current = value;
    };
    const rendered = render(
      <NestedDialogScene
        childDismissDisabled
        onParentDismiss={onParentDismiss}
        onChildDismiss={onChildDismiss}
        captureStack={captureStack}
      />,
    );

    await waitFor(() =>
      expect(requireCapturedStack(stack).getSnapshot().entries).toHaveLength(2),
    );
    const initialChild = requireCapturedStack(stack).getSnapshot().entries.at(-1);
    expect(initialChild).toEqual(
      expect.objectContaining({ id: 'child-dialog', dismissible: false }),
    );

    fireEvent.pointerDown(screen.getByTestId('parent-dialog-backdrop'));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onParentDismiss).not.toHaveBeenCalled();
    expect(onChildDismiss).not.toHaveBeenCalled();

    rendered.rerender(
      <NestedDialogScene
        onParentDismiss={onParentDismiss}
        onChildDismiss={onChildDismiss}
        captureStack={captureStack}
      />,
    );
    const updatedChild = requireCapturedStack(stack).getSnapshot().entries.at(-1);
    expect(updatedChild).toEqual(
      expect.objectContaining({
        id: 'child-dialog',
        dismissible: true,
        mountOrder: initialChild?.mountOrder,
      }),
    );

    fireEvent.pointerDown(screen.getByTestId('child-dialog-backdrop'));
    expect(onChildDismiss).toHaveBeenCalledTimes(1);
    expect(onParentDismiss).not.toHaveBeenCalled();
  });

  it('keeps inline Dialog outside the stack', () => {
    const stack: StackCapture = { current: null };
    render(
      <UiProvider>
        <CaptureStack
          capture={(value) => {
            stack.current = value;
          }}
        />
        <Dialog
          visible
          presentation="inline"
          overlayId="inline-dialog"
          onDismiss={() => {}}
        >
          <DialogPanel title="Inline dialog" />
        </Dialog>
      </UiProvider>,
    );

    expect(requireCapturedStack(stack).getSnapshot().entries).toEqual([]);
  });
});
