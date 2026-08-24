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
  useState,
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
import { useReducedMotion } from './use-reduced-motion';
import { roleTextStyle } from './text';
import { Button, IconButton } from './button';
import type { ButtonVariant } from './button';

/** The existing DialogPanel visual contract. ActionSheet also uses 100% within this width on mobile. */
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
  /** Styles the header row wrapping leading, the title/description copy, and the close button. */
  headerStyle?: StyleProp<ViewStyle> | undefined;
  descriptionStyle?: StyleProp<TextStyle> | undefined;
  /**
   * Hides the header visually — the title/description block and the leading
   * node are both skipped; the close button keeps its own header row. A dialog
   * must still have an accessible name, so a modal Dialog whose direct panel
   * hides its header requires the Dialog accessibilityLabel (enforced at
   * render). On the web that label names the modal; on native the panel
   * content should carry its own context, exactly like the arbitrary-content
   * Dialog branch. When defined it must be an actual boolean (enforced at
   * render), so truthy non-booleans cannot bypass the naming rule.
   */
  hideHeader?: boolean | undefined;
  /** Defaults to true inside a Dialog. Standalone there is no dismiss behavior, so it is not rendered. */
  showCloseButton?: boolean | undefined;
  /** Defaults to strings.close. */
  closeAccessibilityLabel?: string | undefined;
  closeButtonTestID?: string | undefined;
  closeButtonStyle?: StyleProp<ViewStyle> | undefined;
  /**
   * Replaces the default close mark (icons.close or the × glyph). The button
   * keeps its accessible name. Like every icon slot, null — passed directly or
   * returned from the RenderIcon — falls back to the default mark; render an
   * empty fragment for a mark-less button.
   */
  closeIcon?: ReactNode | RenderIcon | undefined;
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
  panelHeaderEnd: {
    justifyContent: 'flex-end' as const,
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

/** The text fallback that keeps the dismiss affordance from disappearing when icons.close is absent. */
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

// hideHeader의 렌더 분기는 truthiness, 이름 규율 강제는 === true를 쓴다 — JS
// 소비자가 truthy 비-boolean으로 그 틈을 지나 이름 없는 다이얼로그를 만들 수
// 없도록, 정의된 값은 실제 boolean임을 렌더 전에 강제한다(§ 런타임 검증 규율).
function assertOptionalBoolean(value: boolean | undefined, label: string): void {
  if (value !== undefined && typeof value !== 'boolean') {
    throw new TypeError(`${label} must be a boolean.`);
  }
}

/** The visual panel inside a Modal. It only creates a close button when a Dialog context exists. */
export function DialogPanel({
  children,
  title,
  description,
  leading,
  footer,
  titleStyle,
  headerStyle,
  descriptionStyle,
  hideHeader = false,
  showCloseButton = true,
  closeAccessibilityLabel,
  closeButtonTestID,
  closeButtonStyle,
  closeIcon,
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
  assertOptionalBoolean(hideHeader, 'DialogPanel hideHeader');
  if (dialog !== null && showCloseButton) {
    assertNonEmptyString(
      closeAccessibilityLabel ?? strings.close,
      'DialogPanel closeAccessibilityLabel',
    );
  }
  const closeIconSlot: RenderIcon = (iconProps) => (
    <View
      accessible={false}
      aria-hidden
      importantForAccessibility="no-hide-descendants"
      style={styles.closeIcon}
    >
      {renderIconSlot(closeIcon, iconProps) ??
        renderIconSlot(icons.close, iconProps) ??
        closeGlyph(iconProps)}
    </View>
  );
  const closeButton =
    dialog !== null && showCloseButton ? (
      <IconButton
        accessibilityLabel={closeAccessibilityLabel ?? strings.close}
        icon={closeIconSlot}
        onPress={() => dialog.requestDismiss('close-action')}
        disabled={dialog.dismissDisabled}
        size={theme.metrics.control.md}
        style={closeButtonStyle}
        testID={closeButtonTestID}
      />
    ) : null;

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
      {hideHeader ? (
        // 헤더 생략 시에도 닫기 버튼은 자체 행으로 남는다 — dismiss affordance는
        // showCloseButton이 별도로 소유한다.
        closeButton === null ? null : (
          <View style={[styles.panelHeader, styles.panelHeaderEnd, headerStyle]}>
            {closeButton}
          </View>
        )
      ) : (
        <View style={[styles.panelHeader, headerStyle]}>
          {leading}
          <View style={styles.copy}>
            <RNText
              accessible
              nativeID={dialog?.titleId}
              accessibilityRole="header"
              // RNW는 aria-level 없는 header를 <h1>으로 내보낸다. 다이얼로그 제목은
              // 문서 제목이 아니라 페이지 안의 섹션 제목이므로 h2로 고정한다.
              {...(Platform.OS === 'web' ? { 'aria-level': 2 } : {})}
              accessibilityLabel={dialog?.nativeTitleAccessibilityLabel}
              style={[roleTextStyle(theme, 'title'), { color: theme.colors.text }, titleStyle]}
            >
              {title}
            </RNText>
            {description !== undefined ? (
              <RNText
                accessible
                nativeID={dialog?.descriptionId}
                style={[
                  roleTextStyle(theme, 'caption'),
                  { color: theme.colors.textMuted },
                  descriptionStyle,
                ]}
              >
                {description}
              </RNText>
            ) : null}
          </View>
          {closeButton}
        </View>
      )}
      {children}
      {footer}
    </View>
  );
}

interface DialogBaseProps {
  visible: boolean;
  /** A no-argument legacy handler remains assignable to this details callback. */
  onDismiss: (details: DialogDismissDetails) => void;
  /** Defaults to true. */
  dismissOnBackdrop?: boolean | undefined;
  /** Blocks the backdrop, Escape/Back, the accessibility escape, and the panel's close button alike. */
  dismissDisabled?: boolean | undefined;
  /**
   * Defaults to 'fade'. Motion is opt-in by platform consent — the same
   * conservative policy as Sheet: the modal animates only after the platform
   * has affirmatively reported that reduced motion is off, and presents with
   * 'none' both while the preference is still unresolved and whenever reduced
   * motion is on, regardless of this value. A preference learned while the
   * dialog is open never replays the entrance.
   */
  animationType?: NonNullable<ModalProps['animationType']> | undefined;
  /** Best-effort focus after onShow, only when specified. RNW's own focus trap is left alone. */
  initialFocusRef?: DialogFocusRef | undefined;
  /** Best-effort focus after the modal exit actually completes. It does not race RNW's own restoration. */
  finalFocusRef?: DialogFocusRef | undefined;
  overlayId?: string | undefined;
  overlayStyle?: StyleProp<ViewStyle> | undefined;
  /**
   * Style override layered onto the backdrop pressable after the theme's
   * overlay color (modal presentation only — inline renders no backdrop).
   * Overriding backgroundColor (for example with 'transparent' to build a
   * dim-less anchored overlay) removes the scrim the theme guarantees, so
   * contrast between the panel and the page behind it becomes the consumer's
   * responsibility.
   */
  backdropStyle?: StyleProp<ViewStyle> | undefined;
  contentStyle?: StyleProp<ViewStyle> | undefined;
  /** The outer layout of the inline presentation only. contentStyle is identical across both presentations. */
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
  /** Layout composition only. It carries no portal, backdrop, dialog role, trap, or Escape/Back semantics. */
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
  backdropStyle,
  contentStyle,
  inlineStyle,
  testID,
}: DialogProps): ReactElement | null {
  const theme = useTheme();
  const styles = getStyles(theme);
  const reactId = sanitizeId(useId());
  const overlayId = overlayIdProp ?? `gj-dialog-${reactId}`;
  const reduceMotion = useReducedMotion();
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
  // Motion is opt-in by platform consent, mirroring Sheet: animate only after
  // the platform has affirmatively reported that reduced motion is off. The
  // unresolved startup window presents with 'none' (isReduceMotionEnabled is
  // async, so a dialog mounted already-visible would otherwise replay its full
  // entrance for reduce-motion users). A preference learned while the dialog
  // is open must not replay the entrance either — RNW's Modal restarts its CSS
  // animation when animationType changes mid-presentation — so a new animation
  // only commits while a closed state is on screen. This state-based latch is
  // safe when a concurrent render is aborted because effects never commit.
  const preferredAnimation: NonNullable<ModalProps['animationType']> =
    reduceMotion === false ? animationType : 'none';
  const [cycleAnimation, setCycleAnimation] = useState<
    NonNullable<ModalProps['animationType']>
  >('none');
  useEffect(() => {
    if (reduceMotion === true) {
      // Reduce motion immediately, including while the dialog is visible.
      setCycleAnimation('none');
    } else if (!modalIsVisible) {
      setCycleAnimation(preferredAnimation);
    }
  }, [modalIsVisible, preferredAnimation, reduceMotion]);
  const domIdBase = sanitizeId(overlayId) || `gj-dialog-${reactId}`;
  const titleId = `${domIdBase}-title`;
  const directPanel = isDirectDialogPanel(children) ? children : null;
  // hideHeader는 description 노드를 렌더하지 않으므로 aria-describedby가 빈
  // 참조가 되지 않게 함께 끈다.
  const descriptionId =
    directPanel?.props.description !== undefined &&
    directPanel.props.hideHeader !== true
      ? `${domIdBase}-description`
      : undefined;
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
    assertOptionalBoolean(directPanel.props.hideHeader, 'DialogPanel hideHeader');
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
  if (
    presentation === 'modal' &&
    directPanel !== null &&
    directPanel.props.hideHeader === true &&
    accessibilityLabel === undefined
  ) {
    // hideHeader가 보이는 제목을 제거하면 파생 이름도 사라진다 — 이름 없는
    // 다이얼로그를 렌더 전에 막는다(임의 콘텐츠 분기와 같은 명명 규율).
    throw new Error(
      'Dialog requires accessibilityLabel when its DialogPanel sets hideHeader — hiding the header removes the visible title that would otherwise name the dialog.',
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
      animationType={reduceMotion === true ? 'none' : cycleAnimation}
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
            StyleSheet.absoluteFill,
            { backgroundColor: theme.colors.overlay },
            backdropStyle,
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
  /** Defaults to strings.cancel. */
  cancelLabel?: string | undefined;
  /** Defaults to strings.confirm. */
  confirmLabel?: string | undefined;
  /** Defaults to 'secondary'. */
  cancelVariant?: ButtonVariant | undefined;
  /** Defaults to 'primary', or to 'destructive' when destructive is true. */
  confirmVariant?: ButtonVariant | undefined;
  destructive?: boolean | undefined;
  /** Confirm is loading — cancel is disabled automatically. */
  loading?: boolean | undefined;
  cancelLoading?: boolean | undefined;
  cancelTestID?: string | undefined;
  confirmTestID?: string | undefined;
  /** Per-button container style, layered after the built-in flex sizing. */
  cancelStyle?: StyleProp<ViewStyle> | undefined;
  confirmStyle?: StyleProp<ViewStyle> | undefined;
  cancelLabelStyle?: StyleProp<TextStyle> | undefined;
  confirmLabelStyle?: StyleProp<TextStyle> | undefined;
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
  cancelTestID,
  confirmTestID,
  cancelStyle,
  confirmStyle,
  cancelLabelStyle,
  confirmLabelStyle,
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
        style={[styles.actionButton, cancelStyle]}
        labelStyle={cancelLabelStyle}
        testID={cancelTestID}
      />
      <Button
        label={confirmLabel ?? strings.confirm}
        variant={confirmVariant ?? (destructive ? 'destructive' : 'primary')}
        onPress={onConfirm}
        disabled={Boolean(cancelLoading)}
        loading={Boolean(loading)}
        style={[styles.actionButton, confirmStyle]}
        labelStyle={confirmLabelStyle}
        testID={confirmTestID}
      />
    </View>
  );
}
