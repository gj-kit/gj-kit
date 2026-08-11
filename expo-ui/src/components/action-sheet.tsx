/**
 * ActionSheet — compact, controlled action choice built on Dialog semantics.
 *
 * This is intentionally not a drag/snap sheet or a menu. Every item is a
 * normal button and every close request is reported as a typed reason.
 */
import { forwardRef, useId, useRef } from 'react';
import type { ReactElement, Ref } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text as RNText,
  useWindowDimensions,
  View,
} from 'react-native';
import type { GestureResponderEvent } from 'react-native';
import type { ModalProps } from 'react-native';
import type { Theme } from '../theme/tokens';
import { Dialog, DialogPanel } from './dialog';
import type {
  DialogDismissDetails,
  DialogFocusable,
  DialogFocusRef,
} from './dialog';
import type { CommonProps } from './internal';
import { themedStyles } from './internal';
import type { OverlayDismissDetails } from './overlay/types';
import { useStrings, useTheme } from './provider';
import { roleTextStyle } from './text';

export type ActionSheetPresentation = 'auto' | 'bottom' | 'center';

export interface ActionSheetItem<T extends string> {
  readonly value: T;
  readonly label: string;
  readonly description?: string | undefined;
  readonly accessibilityLabel?: string | undefined;
  readonly destructive?: boolean | undefined;
  readonly disabled?: boolean | undefined;
  readonly testID?: string | undefined;
}

type ActionSheetDetailBase = Omit<OverlayDismissDetails, 'reason'>;

export type ActionSheetDismissDetails<T extends string> =
  | DialogDismissDetails
  | (ActionSheetDetailBase & { readonly reason: 'cancel-action' })
  | (ActionSheetDetailBase & {
      readonly reason: 'action-select';
      readonly value: T;
    });

export interface ActionSheetProps<T extends string> extends Omit<CommonProps, 'unstyled'> {
  visible: boolean;
  title: string;
  description?: string | undefined;
  /** Dynamic arrays may be empty; the safe cancel action still renders. */
  items: readonly ActionSheetItem<T>[];
  onDismiss: (details: ActionSheetDismissDetails<NoInfer<T>>) => void;
  /** 기본 strings.cancel. */
  cancelLabel?: string | undefined;
  presentation?: ActionSheetPresentation | undefined;
  animationType?: NonNullable<ModalProps['animationType']> | undefined;
  dismissOnBackdrop?: boolean | undefined;
  dismissDisabled?: boolean | undefined;
  /** Async transition 동안 모든 action과 dismissal을 막고 busy state를 노출한다. */
  busy?: boolean | undefined;
  bottomInset?: number | undefined;
  keyboardOverlap?: number | undefined;
  accessibilityLabel?: string | undefined;
  finalFocusRef?: DialogFocusRef | undefined;
  overlayId?: string | undefined;
  unstyled?: never;
}

type ActionButtonProps = {
  label: string;
  description?: string | undefined;
  descriptionId?: string | undefined;
  accessibilityLabel?: string | undefined;
  destructive?: boolean | undefined;
  cancel?: boolean | undefined;
  disabled: boolean;
  busy: boolean;
  onPress: (event: GestureResponderEvent) => void;
  testID?: string | undefined;
};

const getStyles = themedStyles((theme: Theme) => ({
  bottomOverlay: {
    alignItems: 'stretch' as const,
    justifyContent: 'flex-end' as const,
    paddingBottom: theme.spacing.none,
  },
  centerOverlay: {
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  panel: {
    gap: theme.spacing.lg,
  },
  bottomPanel: {
    alignSelf: 'center' as const,
  },
  centerPanel: {
    alignSelf: 'center' as const,
  },
  body: {
    flexShrink: 1,
    gap: theme.spacing.sm,
    minHeight: theme.spacing.none,
  },
  itemsScroll: {
    flexShrink: 1,
    minHeight: theme.spacing.none,
  },
  actions: {
    gap: theme.spacing.sm,
  },
  action: {
    alignItems: 'center' as const,
    borderRadius: theme.radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row' as const,
    gap: theme.spacing.md,
    minHeight: theme.metrics.control.lg,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    width: '100%' as const,
  },
  actionCopy: {
    flex: 1,
    gap: theme.spacing.xs,
  },
}));

const ActionButton = forwardRef<DialogFocusable, ActionButtonProps>(function ActionButton(
  {
    label,
    description,
    descriptionId,
    accessibilityLabel,
    destructive = false,
    cancel = false,
    disabled,
    busy,
    onPress,
    testID,
  },
  forwardedRef,
): ReactElement {
  const theme = useTheme();
  const styles = getStyles(theme);
  const foreground = disabled
    ? theme.colors.textSubtle
    : destructive
      ? theme.colors.danger
      : theme.colors.text;
  const background = disabled
    ? theme.colors.surfaceSubtle
    : destructive
      ? theme.colors.dangerSoft
      : cancel
        ? theme.colors.surfaceSubtle
        : theme.colors.surface;
  const border = disabled
    ? theme.colors.line
    : destructive
      ? theme.colors.danger
      : theme.colors.textSubtle;

  return (
    <Pressable
      ref={forwardedRef as Ref<View>}
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={Platform.OS === 'web' ? undefined : description}
      aria-describedby={Platform.OS === 'web' ? descriptionId : undefined}
      accessibilityState={{ disabled, busy }}
      aria-disabled={disabled}
      aria-busy={busy}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.action,
        {
          backgroundColor: pressed && !disabled ? theme.colors.surfaceSubtle : background,
          borderColor: border,
        },
      ]}
    >
      <View style={styles.actionCopy}>
        <RNText style={[roleTextStyle(theme, 'button'), { color: foreground }]}>{label}</RNText>
        {description !== undefined ? (
          <RNText
            nativeID={descriptionId}
            style={[roleTextStyle(theme, 'caption'), { color: theme.colors.textMuted }]}
          >
            {description}
          </RNText>
        ) : null}
      </View>
    </Pressable>
  );
});

function sanitizeId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, '');
}

function assertNonEmptyString(value: string, label: string): void {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string.`);
  }
}

function assertOptionalNonEmptyString(value: string | undefined, label: string): void {
  if (value !== undefined) assertNonEmptyString(value, label);
}

function assertFiniteNonNegative(value: number, label: string): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${label} must be finite and greater than or equal to 0.`);
  }
  return value;
}

function assertValidItems<T extends string>(items: readonly ActionSheetItem<T>[]): void {
  const seen = new Set<string>();
  for (const [index, item] of items.entries()) {
    const label = `ActionSheet item at index ${index}`;
    assertNonEmptyString(item.value, `${label} value`);
    assertNonEmptyString(item.label, `${label} label`);
    assertOptionalNonEmptyString(item.description, `${label} description`);
    assertOptionalNonEmptyString(item.accessibilityLabel, `${label} accessibilityLabel`);
    if (seen.has(item.value)) {
      throw new Error(`ActionSheet item values must be unique. Duplicate: "${item.value}".`);
    }
    seen.add(item.value);
  }
}

/** Controlled action sheet; callers hide it after receiving a dismissal detail. */
export function ActionSheet<const T extends string>({
  visible,
  title,
  description,
  items,
  onDismiss,
  cancelLabel,
  presentation = 'auto',
  animationType,
  dismissOnBackdrop = true,
  dismissDisabled = false,
  busy = false,
  bottomInset = 0,
  keyboardOverlap = 0,
  accessibilityLabel,
  finalFocusRef,
  overlayId: overlayIdProp,
  style,
  className,
  testID,
}: ActionSheetProps<T>): ReactElement {
  const theme = useTheme();
  const strings = useStrings();
  const styles = getStyles(theme);
  const { height, width } = useWindowDimensions();
  const reactId = sanitizeId(useId());
  const cancelRef = useRef<View | null>(null);
  assertNonEmptyString(title, 'ActionSheet title');
  assertOptionalNonEmptyString(description, 'ActionSheet description');
  assertOptionalNonEmptyString(accessibilityLabel, 'ActionSheet accessibilityLabel');
  assertOptionalNonEmptyString(overlayIdProp, 'ActionSheet overlayId');
  assertOptionalNonEmptyString(cancelLabel, 'ActionSheet cancelLabel');
  assertNonEmptyString(cancelLabel ?? strings.cancel, 'ActionSheet cancelLabel');
  assertValidItems(items);
  const safeBottomInset = assertFiniteNonNegative(bottomInset, 'ActionSheet bottomInset');
  const safeKeyboardOverlap = assertFiniteNonNegative(
    keyboardOverlap,
    'ActionSheet keyboardOverlap',
  );
  const overlayId = overlayIdProp ?? `gj-action-sheet-${reactId}`;
  const domIdBase = sanitizeId(overlayId) || `gj-action-sheet-${reactId}`;
  const resolvedPresentation =
    presentation === 'auto'
      ? width < theme.breakpoints.tablet
        ? 'bottom'
        : 'center'
      : presentation;
  const interactionDisabled = dismissDisabled || busy;
  const bottomAvoidance = safeKeyboardOverlap > theme.spacing.none
    ? safeKeyboardOverlap
    : safeBottomInset;
  const invariantPaddingBottom =
    theme.spacing.xxl + (resolvedPresentation === 'bottom' ? bottomAvoidance : theme.spacing.none);
  const viewportHeight = height > theme.spacing.none ? height : theme.breakpoints.tablet;
  const invariantMaxHeight = Math.max(
    theme.metrics.control.lg,
    viewportHeight - theme.spacing.xl - theme.spacing.xl,
  );

  const emit = (
    details:
      | { readonly reason: 'cancel-action'; readonly originalEvent?: unknown }
      | {
          readonly reason: 'action-select';
          readonly value: NoInfer<T>;
          readonly originalEvent?: unknown;
        },
  ): void => {
    if (interactionDisabled) return;
    onDismiss({ overlayId, ...details } as ActionSheetDismissDetails<NoInfer<T>>);
  };

  const handleDialogDismiss = (details: DialogDismissDetails): void => {
    onDismiss(details);
  };

  return (
    <Dialog
      visible={visible}
      onDismiss={handleDialogDismiss}
      dismissOnBackdrop={dismissOnBackdrop}
      dismissDisabled={interactionDisabled}
      accessibilityLabel={accessibilityLabel}
      initialFocusRef={interactionDisabled ? undefined : cancelRef}
      finalFocusRef={finalFocusRef}
      overlayId={overlayId}
      overlayStyle={
        resolvedPresentation === 'bottom' ? styles.bottomOverlay : styles.centerOverlay
      }
      contentStyle={
        resolvedPresentation === 'bottom' ? styles.bottomPanel : styles.centerPanel
      }
      animationType={animationType ?? (resolvedPresentation === 'bottom' ? 'slide' : 'fade')}
      testID={testID}
    >
      <DialogPanel
        title={title}
        description={description}
        showCloseButton={false}
        testID={testID === undefined ? undefined : `${testID}-panel`}
        className={className}
        style={[
          styles.panel,
          style,
          {
            maxHeight: invariantMaxHeight,
            overflow: 'hidden',
            paddingBottom: invariantPaddingBottom,
          },
        ]}
      >
        <View style={styles.body}>
          <ScrollView
            testID={testID === undefined ? undefined : `${testID}-items`}
            accessibilityState={{ busy }}
            aria-busy={busy}
            keyboardShouldPersistTaps="handled"
            style={styles.itemsScroll}
            contentContainerStyle={styles.actions}
          >
            {items.map((item, index) => {
              const descriptionId = item.description === undefined
                ? undefined
                : `${domIdBase}-action-${index}-description`;
              return (
                <ActionButton
                  key={`${item.value}-${index}`}
                  label={item.label}
                  description={item.description}
                  descriptionId={descriptionId}
                  accessibilityLabel={item.accessibilityLabel}
                  destructive={item.destructive}
                  disabled={interactionDisabled || Boolean(item.disabled)}
                  busy={busy}
                  testID={item.testID}
                  onPress={(event) =>
                    emit({ reason: 'action-select', value: item.value, originalEvent: event })
                  }
                />
              );
            })}
          </ScrollView>
          <ActionButton
            ref={cancelRef}
            label={cancelLabel ?? strings.cancel}
            cancel
            disabled={interactionDisabled}
            busy={busy}
            testID={testID === undefined ? undefined : `${testID}-cancel`}
            onPress={(event) => emit({ reason: 'cancel-action', originalEvent: event })}
          />
        </View>
      </DialogPanel>
    </Dialog>
  );
}
