/**
 * Dialog primitives.
 *
 * `Dialog` owns modal semantics and dismissal policy. `DialogPanel` owns the
 * visible surface and, while inside a Dialog, wires its title/description to
 * the React Native Web Modal and renders an explicit close action.
 */
import {
  createContext,
  isValidElement,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useSyncExternalStore,
} from 'react';
import type { ReactElement, ReactNode, RefObject } from 'react';
import {
  AccessibilityInfo,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text as RNText,
  View,
} from 'react-native';
import type { ModalProps, StyleProp, TextStyle, ViewStyle } from 'react-native';
import type { Theme } from '../theme/tokens';
import { nativeWindProps, themedStyles } from './internal';
import type { CommonProps } from './internal';
import { renderIconSlot } from './icons';
import type { IconRenderProps, RenderIcon } from './icons';
import { OverlayLayerBoundary, useOverlayParentId } from './overlay/layer';
import {
  isOverlayDismissEventHandled,
  markOverlayDismissEventHandled,
  overlayDismissOriginalEvent,
} from './overlay/dismiss-event';
import { useOptionalOverlayStack } from './overlay/provider';
import type { OverlayStackHandle } from './overlay/stack';
import type {
  OverlayDismissDetails,
  OverlayDismissReason,
  OverlayStackSnapshot,
} from './overlay/types';
import { useEscapeKey } from './overlay/use-escape-key';
import { useIcons, useStrings, useTheme } from './provider';
import { roleTextStyle } from './text';
import { Button, IconButton } from './button';
import type { ButtonVariant } from './button';

/** 기존 DialogPanel 시각 계약. ActionSheet도 모바일에서는 이 폭 안에서 100%를 쓴다. */
const DIALOG_MAX_WIDTH = 550;
const EMPTY_OVERLAY_STACK_SNAPSHOT: OverlayStackSnapshot = Object.freeze({
  entries: Object.freeze([]),
  topmost: null,
});
const subscribeToNoOverlayStack = (): (() => void) => () => undefined;
const readEmptyOverlayStack = (): OverlayStackSnapshot => EMPTY_OVERLAY_STACK_SNAPSHOT;

export type DialogDismissReason = Extract<
  OverlayDismissReason,
  | 'backdrop-press'
  | 'escape-key'
  | 'hardware-back'
  | 'accessibility-escape'
  | 'close-action'
>;

export interface DialogDismissDetails extends OverlayDismissDetails {
  readonly reason: DialogDismissReason;
}

/** React Native hosts and DOM nodes both expose this small imperative surface. */
export interface DialogFocusable {
  focus?: (() => void) | undefined;
}

export type DialogFocusRef = RefObject<DialogFocusable | null>;
export type DialogPresentation = 'modal' | 'inline';

interface DialogPanelContextValue {
  readonly titleId: string;
  readonly descriptionId: string | undefined;
  readonly nativeTitleAccessibilityLabel: string | undefined;
  readonly dismissDisabled: boolean;
  readonly requestDismiss: (reason: 'close-action') => void;
}

const DialogPanelContext = createContext<DialogPanelContextValue | null>(null);

export interface DialogPanelProps extends Omit<CommonProps, 'unstyled'> {
  children?: ReactNode | undefined;
  title: string;
  description?: string | undefined;
  leading?: ReactNode | undefined;
  footer?: ReactNode | undefined;
  titleStyle?: StyleProp<TextStyle> | undefined;
  /** Dialog 안에서는 기본 true. 독립 사용 시 닫기 동작이 없으므로 렌더하지 않는다. */
  showCloseButton?: boolean | undefined;
  /** 기본 strings.close. */
  closeAccessibilityLabel?: string | undefined;
  closeButtonTestID?: string | undefined;
  unstyled?: never;
}

const getStyles = themedStyles((theme: Theme) => ({
  panel: {
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    gap: theme.spacing.lg,
    maxWidth: DIALOG_MAX_WIDTH,
    padding: theme.spacing.xxl,
    width: '100%' as const,
  },
  panelHeader: {
    alignItems: 'flex-start' as const,
    flexDirection: 'row' as const,
    gap: theme.spacing.md,
  },
  copy: {
    flex: 1,
    gap: theme.spacing.sm,
    minWidth: 0,
  },
  closeIcon: {
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    pointerEvents: 'none' as const,
  },
  overlay: {
    alignItems: 'center' as const,
    flex: 1,
    justifyContent: 'center' as const,
    padding: theme.spacing.xl,
    position: 'relative' as const,
  },
  content: {
    alignSelf: 'center' as const,
    maxWidth: DIALOG_MAX_WIDTH,
    width: '100%' as const,
  },
  inline: {
    width: '100%' as const,
  },
  actionRow: { flexDirection: 'row' as const, gap: theme.spacing.md },
  actionButton: { flex: 1 },
}));

/** icons.close가 없어도 닫기 어포던스가 사라지지 않는 텍스트 폴백. */
function closeGlyph(iconProps: IconRenderProps): ReactElement {
  return (
    <RNText
      aria-hidden
      style={{ color: iconProps.color, fontSize: iconProps.size }}
    >
      ×
    </RNText>
  );
}

function assertNonEmptyString(value: string, label: string): void {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string.`);
  }
}

function assertOptionalNonEmptyString(value: string | undefined, label: string): void {
  if (value !== undefined) assertNonEmptyString(value, label);
}

/** Modal 내부의 시각적 패널. Dialog context가 있을 때만 닫기 버튼을 만든다. */
export function DialogPanel({
  children,
  title,
  description,
  leading,
  footer,
  titleStyle,
  showCloseButton = true,
  closeAccessibilityLabel,
  closeButtonTestID,
  style,
  className,
  testID,
}: DialogPanelProps): ReactElement {
  const theme = useTheme();
  const strings = useStrings();
  const icons = useIcons();
  const dialog = useContext(DialogPanelContext);
  const styles = getStyles(theme);
  assertNonEmptyString(title, 'DialogPanel title');
  assertOptionalNonEmptyString(description, 'DialogPanel description');
  assertOptionalNonEmptyString(
    closeAccessibilityLabel,
    'DialogPanel closeAccessibilityLabel',
  );
  if (dialog !== null && showCloseButton) {
    assertNonEmptyString(
      closeAccessibilityLabel ?? strings.close,
      'DialogPanel closeAccessibilityLabel',
    );
  }
  const closeIcon: RenderIcon = (iconProps) => (
    <View
      accessible={false}
      aria-hidden
      importantForAccessibility="no-hide-descendants"
      style={styles.closeIcon}
    >
      {renderIconSlot(icons.close, iconProps) ?? closeGlyph(iconProps)}
    </View>
  );

  return (
    <View
      testID={testID}
      {...nativeWindProps(className)}
      style={[
        styles.panel,
        { backgroundColor: theme.colors.surface, borderColor: theme.colors.line },
        style,
      ]}
    >
      <View style={styles.panelHeader}>
        {leading}
        <View style={styles.copy}>
          <RNText
            accessible
            nativeID={dialog?.titleId}
            accessibilityRole="header"
            accessibilityLabel={dialog?.nativeTitleAccessibilityLabel}
            style={[roleTextStyle(theme, 'title'), { color: theme.colors.text }, titleStyle]}
          >
            {title}
          </RNText>
          {description !== undefined ? (
            <RNText
              accessible
              nativeID={dialog?.descriptionId}
              style={[roleTextStyle(theme, 'caption'), { color: theme.colors.textMuted }]}
            >
              {description}
            </RNText>
          ) : null}
        </View>
        {dialog !== null && showCloseButton ? (
          <IconButton
            accessibilityLabel={closeAccessibilityLabel ?? strings.close}
            icon={closeIcon}
            onPress={() => dialog.requestDismiss('close-action')}
            disabled={dialog.dismissDisabled}
            size={theme.metrics.control.md}
            testID={closeButtonTestID}
          />
        ) : null}
      </View>
      {children}
      {footer}
    </View>
  );
}

interface DialogBaseProps {
  visible: boolean;
  /** A no-argument legacy handler remains assignable to this details callback. */
  onDismiss: (details: DialogDismissDetails) => void;
  /** 기본 true. */
  dismissOnBackdrop?: boolean | undefined;
  /** 백드롭, Escape/Back, 접근성 escape, 패널 닫기 버튼을 모두 차단한다. */
  dismissDisabled?: boolean | undefined;
  /** 기존 기본값 'fade'. */
  animationType?: NonNullable<ModalProps['animationType']> | undefined;
  /** 지정했을 때만 onShow 후 best-effort focus. RNW의 기본 focus trap은 그대로 둔다. */
  initialFocusRef?: DialogFocusRef | undefined;
  /** 실제 modal exit 완료 후 best-effort focus. RNW의 기본 복원과 경쟁하지 않는다. */
  finalFocusRef?: DialogFocusRef | undefined;
  overlayId?: string | undefined;
  overlayStyle?: StyleProp<ViewStyle> | undefined;
  contentStyle?: StyleProp<ViewStyle> | undefined;
  /** inline presentation의 외곽 레이아웃 전용. contentStyle은 두 presentation에서 동일하다. */
  inlineStyle?: StyleProp<ViewStyle> | undefined;
  testID?: string | undefined;
  unstyled?: never;
}

export type DialogPanelElement = ReactElement<DialogPanelProps, typeof DialogPanel>;

/**
 * Direct DialogPanel children derive their name from the title. Every other
 * content shape must provide an explicit accessible name.
 */
type DirectPanelDialogProps = {
  children: DialogPanelElement;
  presentation?: DialogPresentation | undefined;
  /** modal name override. inline presentation does not expose modal naming semantics. */
  accessibilityLabel?: string | undefined;
};

type ArbitraryModalDialogProps = {
  /** native Modal/RNW portal+focus trap. Nested overlays inherit this Dialog's stack layer. */
  presentation?: 'modal' | undefined;
  children: Exclude<NonNullable<ReactNode>, DialogPanelElement>;
  /** RNW modal name. Native arbitrary content must expose its own heading semantics. */
  accessibilityLabel: string;
};

type ArbitraryInlineDialogProps = {
  /** 레이아웃 합성 전용. portal, backdrop, dialog role, trap, Escape/Back 의미가 없다. */
  presentation: 'inline';
  children: NonNullable<ReactNode>;
  accessibilityLabel?: never;
};

export type DialogProps = DialogBaseProps &
  (DirectPanelDialogProps | ArbitraryModalDialogProps | ArbitraryInlineDialogProps);

function sanitizeId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, '');
}

function focusBestEffort(ref: DialogFocusRef | undefined): void {
  try {
    const target = ref?.current;
    target?.focus?.();
    if (Platform.OS !== 'web' && target !== null && target !== undefined) {
      // RN 0.81 renderer-safe host event. VoiceOver/TalkBack real-device QA remains
      // a release gate because jsdom cannot model native accessibility focus.
      AccessibilityInfo.sendAccessibilityEvent(target as never, 'focus');
    }
  } catch {
    // A stale native host ref may throw while a screen is being removed.
  }
}

function isDirectDialogPanel(
  children: NonNullable<ReactNode>,
): children is ReactElement<DialogPanelProps> {
  return isValidElement(children) && children.type === DialogPanel;
}

function isDialogDismissReason(reason: OverlayDismissReason): reason is DialogDismissReason {
  return (
    reason === 'backdrop-press' ||
    reason === 'escape-key' ||
    reason === 'hardware-back' ||
    reason === 'accessibility-escape' ||
    reason === 'close-action'
  );
}

/** Controlled dialog. Calling onDismiss requests a state change; it never hides itself. */
export function Dialog({
  children,
  visible,
  onDismiss,
  dismissOnBackdrop = true,
  dismissDisabled = false,
  presentation = 'modal',
  animationType = 'fade',
  accessibilityLabel,
  initialFocusRef,
  finalFocusRef,
  overlayId: overlayIdProp,
  overlayStyle,
  contentStyle,
  inlineStyle,
  testID,
}: DialogProps): ReactElement | null {
  const theme = useTheme();
  const styles = getStyles(theme);
  const reactId = sanitizeId(useId());
  const overlayId = overlayIdProp ?? `gj-dialog-${reactId}`;
  const overlayStack = useOptionalOverlayStack();
  const parentOverlayId = useOverlayParentId();
  const overlaySnapshot = useSyncExternalStore(
    overlayStack?.subscribe ?? subscribeToNoOverlayStack,
    overlayStack?.getSnapshot ?? readEmptyOverlayStack,
    overlayStack?.getSnapshot ?? readEmptyOverlayStack,
  );
  const parentIsRegistered =
    parentOverlayId === undefined ||
    overlaySnapshot.entries.some((entry) => entry.id === parentOverlayId);
  const dialogIsRegistered =
    overlayStack === null ||
    overlaySnapshot.entries.some((entry) => entry.id === overlayId);
  const modalIsVisible =
    visible && (overlayStack === null || parentIsRegistered);
  const domIdBase = sanitizeId(overlayId) || `gj-dialog-${reactId}`;
  const titleId = `${domIdBase}-title`;
  const directPanel = isDirectDialogPanel(children) ? children : null;
  const descriptionId =
    directPanel?.props.description !== undefined ? `${domIdBase}-description` : undefined;
  const restoredRef = useRef(false);
  const wasVisibleRef = useRef(false);
  const visibleRef = useRef(visible);
  visibleRef.current = visible;
  const initialFocusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stackHandleRef = useRef<OverlayStackHandle | null>(null);
  const onDismissRef = useRef(onDismiss);
  const dismissDisabledRef = useRef(dismissDisabled);
  const parentOverlayIdRef = useRef(parentOverlayId);
  onDismissRef.current = onDismiss;
  dismissDisabledRef.current = dismissDisabled;
  parentOverlayIdRef.current = parentOverlayId;

  useLayoutEffect(() => {
    if (
      !visible ||
      presentation === 'inline' ||
      overlayStack === null ||
      !parentIsRegistered
    ) return;

    const handle = overlayStack.mount({
      id: overlayId,
      ...(parentOverlayIdRef.current === undefined
        ? {}
        : { parentId: parentOverlayIdRef.current }),
      dismissible: !dismissDisabledRef.current,
      onDismiss: (details) => {
        if (!isDialogDismissReason(details.reason)) return;
        onDismissRef.current(details as DialogDismissDetails);
      },
    });
    stackHandleRef.current = handle;

    return () => {
      handle.unmount();
      if (stackHandleRef.current === handle) stackHandleRef.current = null;
    };
  }, [overlayId, overlayStack, parentIsRegistered, presentation, visible]);

  useLayoutEffect(() => {
    stackHandleRef.current?.update({
      parentId: parentOverlayId ?? null,
      dismissible: !dismissDisabled,
    });
  }, [dismissDisabled, parentOverlayId]);

  const requestDismiss = useCallback(
    (reason: DialogDismissReason, originalEvent?: unknown): void => {
      const dismissalEvent = overlayDismissOriginalEvent(originalEvent);
      if (
        Platform.OS === 'web' &&
        isOverlayDismissEventHandled(dismissalEvent)
      ) return;

      if (presentation === 'modal' && overlayStack !== null) {
        const result = overlayStack.requestDismiss(overlayId, reason, dismissalEvent);
        if (result.status !== 'not-found') {
          if (
            Platform.OS === 'web' &&
            (result.status === 'dismissed' ||
              (result.status === 'blocked' &&
                result.blockReason === 'not-dismissible'))
          ) {
            markOverlayDismissEventHandled(dismissalEvent);
          }
          return;
        }
      }
      if (dismissDisabled) {
        if (Platform.OS === 'web') {
          markOverlayDismissEventHandled(dismissalEvent);
        }
        return;
      }
      onDismissRef.current({
        overlayId,
        reason,
        ...(dismissalEvent !== undefined
          ? { originalEvent: dismissalEvent }
          : {}),
      });
      if (Platform.OS === 'web') {
        markOverlayDismissEventHandled(dismissalEvent);
      }
    },
    [dismissDisabled, overlayId, overlayStack, presentation],
  );

  useEscapeKey({
    enabled: modalIsVisible && presentation === 'modal' && dialogIsRegistered,
    onEscape: (event) => {
      if (overlayStack === null || overlayStack.isTopmost(overlayId)) {
        requestDismiss('escape-key', event);
        return true;
      }
      return false;
    },
  });

  const focusInitial = useCallback((): void => {
    if (initialFocusRef === undefined) return;
    // Modal's own focus trap initializes first. Only an explicit ref overrides its result.
    if (initialFocusTimerRef.current !== null) clearTimeout(initialFocusTimerRef.current);
    initialFocusTimerRef.current = setTimeout(() => {
      initialFocusTimerRef.current = null;
      if (!visibleRef.current) return;
      if (
        presentation === 'modal' &&
        overlayStack !== null &&
        !overlayStack.isTopmost(overlayId)
      ) {
        return;
      }
      focusBestEffort(initialFocusRef);
    }, 0);
  }, [initialFocusRef, overlayId, overlayStack, presentation]);

  const focusFinal = useCallback((): void => {
    // A close animation from cycle A can finish after controlled state reopened cycle B.
    if (visibleRef.current || restoredRef.current) return;
    restoredRef.current = true;
    focusBestEffort(finalFocusRef);
  }, [finalFocusRef]);

  useEffect(() => {
    const wasVisible = wasVisibleRef.current;
    if (visible) restoredRef.current = false;
    if (!visible && initialFocusTimerRef.current !== null) {
      clearTimeout(initialFocusTimerRef.current);
      initialFocusTimerRef.current = null;
    }
    if (presentation === 'inline') {
      if (visible && !wasVisible) focusInitial();
      if (!visible && wasVisible) focusFinal();
    } else if (Platform.OS === 'android' && !visible && wasVisible) {
      // Modal.onDismiss is iOS-only. Android has already committed visible=false
      // when this effect runs, so restoring here cannot compete with RNW's trap.
      focusFinal();
    }
    wasVisibleRef.current = visible;
  }, [focusFinal, focusInitial, presentation, visible]);

  useEffect(
    () => () => {
      if (initialFocusTimerRef.current !== null) {
        clearTimeout(initialFocusTimerRef.current);
      }
    },
    [],
  );

  const handleAccessibilityEscape = useCallback((): void => {
    requestDismiss('accessibility-escape');
  }, [requestDismiss]);

  assertOptionalNonEmptyString(overlayIdProp, 'Dialog overlayId');
  assertOptionalNonEmptyString(accessibilityLabel, 'Dialog accessibilityLabel');
  if (directPanel !== null) {
    assertNonEmptyString(directPanel.props.title, 'DialogPanel title');
    assertOptionalNonEmptyString(directPanel.props.description, 'DialogPanel description');
    assertOptionalNonEmptyString(
      directPanel.props.closeAccessibilityLabel,
      'DialogPanel closeAccessibilityLabel',
    );
  }

  const contextValue: DialogPanelContextValue = {
    titleId,
    descriptionId,
    nativeTitleAccessibilityLabel:
      Platform.OS !== 'web' && presentation === 'modal'
        ? accessibilityLabel ?? directPanel?.props.title
        : undefined,
    dismissDisabled,
    requestDismiss,
  };

  if (
    presentation === 'modal' &&
    directPanel === null &&
    accessibilityLabel === undefined
  ) {
    throw new Error(
      'Dialog requires accessibilityLabel when children is not a direct DialogPanel.',
    );
  }

  const directPanelContent = directPanel === null ? children : (
    <DialogPanelContext.Provider value={contextValue}>{children}</DialogPanelContext.Provider>
  );
  const content = (
    <View
      testID={testID === undefined ? undefined : `${testID}-content`}
      {...(Platform.OS !== 'web' && presentation === 'modal'
        ? {
            accessibilityViewIsModal: true,
            onAccessibilityEscape: handleAccessibilityEscape,
          }
        : {})}
      style={[styles.content, contentStyle]}
    >
      {directPanelContent}
    </View>
  );
  const layeredContent =
    presentation === 'modal' ? (
      <OverlayLayerBoundary overlayId={overlayId}>{content}</OverlayLayerBoundary>
    ) : (
      content
    );

  if (presentation === 'inline') {
    if (!visible) return null;
    return (
      <View testID={testID} style={[styles.inline, inlineStyle]}>
        {layeredContent}
      </View>
    );
  }

  const labelledBy = accessibilityLabel === undefined && directPanel !== null ? titleId : undefined;
  const describedBy = descriptionId;
  const webAccessibilityProps =
    Platform.OS === 'web'
      ? {
          accessibilityLabel,
          'aria-labelledby': labelledBy,
          'aria-describedby': describedBy,
          tabIndex: -1 as const,
        }
      : {};
  const webBackdropProps =
    Platform.OS === 'web' && dismissOnBackdrop
      ? {
          onPointerDown: (event: unknown) =>
            requestDismiss('backdrop-press', event),
        }
      : {};

  return (
    <Modal
      visible={modalIsVisible}
      transparent
      animationType={animationType}
      testID={testID}
      {...webAccessibilityProps}
      onShow={focusInitial}
      onDismiss={focusFinal}
      {...(Platform.OS === 'web'
        ? {}
        : {
            onRequestClose: (event: unknown) =>
              requestDismiss('hardware-back', event),
          })}
    >
      <View style={[styles.overlay, overlayStyle]}>
        <Pressable
          testID={testID === undefined ? undefined : `${testID}-backdrop`}
          accessible={false}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          aria-hidden
          focusable={false}
          tabIndex={-1}
          disabled={!dismissOnBackdrop || dismissDisabled}
          {...(webBackdropProps as unknown as Record<string, unknown>)}
          onPress={
            Platform.OS !== 'web' && dismissOnBackdrop
              ? (event) => requestDismiss('backdrop-press', event)
              : undefined
          }
          style={[
            StyleSheet.absoluteFillObject,
            { backgroundColor: theme.colors.overlay },
          ]}
        />
        {layeredContent}
      </View>
    </Modal>
  );
}

export interface ConfirmActionRowProps extends Omit<CommonProps, 'unstyled'> {
  onCancel: () => void;
  onConfirm: () => void;
  /** 기본 strings.cancel. */
  cancelLabel?: string | undefined;
  /** 기본 strings.confirm. */
  confirmLabel?: string | undefined;
  /** 기본 'secondary'. */
  cancelVariant?: ButtonVariant | undefined;
  /** 기본 'primary'. destructive가 true면 'destructive'. */
  confirmVariant?: ButtonVariant | undefined;
  destructive?: boolean | undefined;
  /** confirm 로딩 — cancel 자동 disabled. */
  loading?: boolean | undefined;
  cancelLoading?: boolean | undefined;
  unstyled?: never;
}

export function ConfirmActionRow({
  onCancel,
  onConfirm,
  cancelLabel,
  confirmLabel,
  cancelVariant = 'secondary',
  confirmVariant,
  destructive = false,
  loading,
  cancelLoading,
  style,
  className,
  testID,
}: ConfirmActionRowProps): ReactElement {
  const theme = useTheme();
  const strings = useStrings();
  const styles = getStyles(theme);
  return (
    <View testID={testID} {...nativeWindProps(className)} style={[styles.actionRow, style]}>
      <Button
        label={cancelLabel ?? strings.cancel}
        variant={cancelVariant}
        onPress={onCancel}
        disabled={Boolean(loading)}
        loading={Boolean(cancelLoading)}
        style={styles.actionButton}
      />
      <Button
        label={confirmLabel ?? strings.confirm}
        variant={confirmVariant ?? (destructive ? 'destructive' : 'primary')}
        onPress={onConfirm}
        disabled={Boolean(cancelLoading)}
        loading={Boolean(loading)}
        style={styles.actionButton}
      />
    </View>
  );
}
