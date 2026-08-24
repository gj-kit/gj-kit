/**
 * ConfirmDialog — a deliberately narrow, controlled composition for a
 * cancel-or-confirm decision. It keeps the caller in charge of visibility and
 * async state while Dialog owns modal dismissal and focus behavior.
 */
import { useCallback, useId, useRef } from 'react';
import type { ComponentRef, ReactElement } from 'react';
import { Pressable, View } from 'react-native';
import type { ModalProps } from 'react-native';
import type { Theme } from '../theme/tokens';
import { themedStyles } from './internal';
import type { CommonProps } from './internal';
import { Button } from './button';
import type { ButtonVariant } from './button';
import { Dialog, DialogPanel } from './dialog';
import type {
  DialogDismissDetails,
  DialogFocusRef,
} from './dialog';
import { useStrings, useTheme } from './provider';

/** Dialog dismissal plus the explicit safe cancel action. */
export type ConfirmDialogDismissDetails =
  | DialogDismissDetails
  | (Omit<DialogDismissDetails, 'reason'> & {
      readonly reason: 'cancel-action';
    });

export interface ConfirmDialogProps extends Omit<CommonProps, 'unstyled'> {
  /** The caller owns visibility; this component only requests dismissal. */
  visible: boolean;
  /** The visible title also names the underlying modal. */
  title: string;
  description?: string | undefined;
  /** Runs the affirmative action. It never closes the dialog automatically. */
  onConfirm: () => void;
  /** Receives every user-initiated close request, including the cancel action. */
  onDismiss: (details: ConfirmDialogDismissDetails) => void;
  /** Defaults to strings.cancel. */
  cancelLabel?: string | undefined;
  /** Defaults to strings.confirm. */
  confirmLabel?: string | undefined;
  /** Defaults to primary. The narrow set keeps the affirmative action semantic. */
  confirmVariant?: Extract<ButtonVariant, 'primary' | 'destructive'> | undefined;
  /** Disables only the affirmative action; cancel and ordinary dismissal stay available. */
  confirmDisabled?: boolean | undefined;
  /** Blocks every action and dismissal while the caller's confirmation work is pending. */
  loading?: boolean | undefined;
  /** Defaults to true. It affects only backdrop presses, like Dialog. */
  dismissOnBackdrop?: boolean | undefined;
  /**
   * Passed through to Dialog. Defaults to Dialog's 'fade'; Dialog animates
   * only once the platform has affirmatively reported that reduced motion is
   * off, and presents with 'none' otherwise (unresolved or reduced).
   */
  animationType?: NonNullable<ModalProps['animationType']> | undefined;
  /** Best-effort focus restoration after the modal exits. */
  finalFocusRef?: DialogFocusRef | undefined;
  overlayId?: string | undefined;
  /** testID of the cancel button. Defaults to `${testID}-cancel`. */
  cancelTestID?: string | undefined;
  /** testID of the confirm button. Defaults to `${testID}-confirm`. */
  confirmTestID?: string | undefined;
  unstyled?: never;
}

const getStyles = themedStyles((theme: Theme) => ({
  actionRow: {
    flexDirection: 'row' as const,
    gap: theme.spacing.md,
  },
  action: { flex: 1 },
}));

function sanitizeId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, '');
}

/**
 * A controlled confirmation modal with one safe cancellation route and one
 * affirmative action. Use Dialog directly when the footer or modal body needs
 * richer composition.
 */
export function ConfirmDialog({
  visible,
  title,
  description,
  onConfirm,
  onDismiss,
  cancelLabel,
  confirmLabel,
  confirmVariant = 'primary',
  confirmDisabled = false,
  loading = false,
  dismissOnBackdrop = true,
  animationType,
  finalFocusRef,
  overlayId: overlayIdProp,
  cancelTestID,
  confirmTestID,
  style,
  className,
  testID,
}: ConfirmDialogProps): ReactElement {
  const strings = useStrings();
  const theme = useTheme();
  const styles = getStyles(theme);
  const reactId = sanitizeId(useId());
  const overlayId = overlayIdProp ?? `gj-confirm-dialog-${reactId}`;
  const cancelRef = useRef<ComponentRef<typeof Pressable>>(null);
  const interactionDisabled = loading;

  const handleDialogDismiss = useCallback(
    (details: DialogDismissDetails): void => {
      onDismiss(details);
    },
    [onDismiss],
  );
  const handleCancel = useCallback((): void => {
    if (interactionDisabled) return;
    onDismiss({ overlayId, reason: 'cancel-action' });
  }, [interactionDisabled, onDismiss, overlayId]);
  const handleConfirm = useCallback((): void => {
    if (interactionDisabled || confirmDisabled) return;
    onConfirm();
  }, [confirmDisabled, interactionDisabled, onConfirm]);

  return (
    <Dialog
      visible={visible}
      onDismiss={handleDialogDismiss}
      dismissOnBackdrop={dismissOnBackdrop}
      {...(animationType === undefined ? {} : { animationType })}
      dismissDisabled={interactionDisabled}
      initialFocusRef={
        interactionDisabled ? undefined : (cancelRef as unknown as DialogFocusRef)
      }
      finalFocusRef={finalFocusRef}
      overlayId={overlayId}
      testID={testID}
    >
      <DialogPanel
        title={title}
        description={description}
        showCloseButton={false}
        testID={testID === undefined ? undefined : `${testID}-panel`}
        className={className}
        style={style}
        footer={(
          <View
            testID={testID === undefined ? undefined : `${testID}-actions`}
            style={styles.actionRow}
          >
            <Button
              ref={cancelRef}
              label={cancelLabel ?? strings.cancel}
              variant="secondary"
              onPress={handleCancel}
              disabled={interactionDisabled}
              style={styles.action}
              testID={
                cancelTestID ??
                (testID === undefined ? undefined : `${testID}-cancel`)
              }
            />
            <Button
              label={confirmLabel ?? strings.confirm}
              variant={confirmVariant}
              onPress={handleConfirm}
              disabled={confirmDisabled}
              loading={loading}
              style={styles.action}
              testID={
                confirmTestID ??
                (testID === undefined ? undefined : `${testID}-confirm`)
              }
            />
          </View>
        )}
      />
    </Dialog>
  );
}
