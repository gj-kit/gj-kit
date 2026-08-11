/**
 * Browser-only anchored overlay adapter.
 *
 * This deliberately renders a native HTML `popover="manual"` in the existing
 * React tree rather than using react-dom portals. The browser top layer escapes
 * clipping while React context stays intact, and the same element falls back to
 * fixed positioning in engines without the Popover API.
 *
 * It is an internal primitive: product components own roles, labels, visual
 * styling, and their typed selection contracts.
 */
import {
  createElement,
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import type { ReactElement, ReactNode, Ref, RefObject } from 'react';
import { computeOverlayPosition } from './position';
import type {
  OverlayCollisionInsets,
  OverlayDirection,
  OverlayDismissDetails,
  OverlayPlacement,
  OverlayRect,
} from './types';
import type { OverlayStack, OverlayStackHandle } from './stack';
import { OverlayLayerBoundary } from './layer';
import {
  isOverlayDismissEventHandled,
  markOverlayDismissEventHandled,
} from './dismiss-event';

/** Narrow DOM bridge: the source tsconfig intentionally does not include lib.dom. */
export interface WebPopoverRect {
  readonly x?: number;
  readonly y?: number;
  readonly left?: number;
  readonly top?: number;
  readonly width: number;
  readonly height: number;
}

export interface WebPopoverWindow {
  readonly innerWidth: number;
  readonly innerHeight: number;
  readonly ResizeObserver?: new (callback: () => void) => WebPopoverResizeObserver;
  addEventListener: (type: string, listener: (event: unknown) => void) => void;
  removeEventListener: (type: string, listener: (event: unknown) => void) => void;
}

export interface WebPopoverResizeObserver {
  observe: (target: unknown) => void;
  disconnect: () => void;
}

export interface WebPopoverDocument {
  readonly defaultView: WebPopoverWindow | null;
  readonly activeElement?: unknown;
  querySelectorAll?: (selectors: string) => ArrayLike<WebPopoverElement>;
  addEventListener: (
    type: string,
    listener: (event: unknown) => void,
    capture?: boolean,
  ) => void;
  removeEventListener: (
    type: string,
    listener: (event: unknown) => void,
    capture?: boolean,
  ) => void;
}

export interface WebPopoverElement {
  readonly ownerDocument: WebPopoverDocument | null;
  readonly isConnected?: boolean;
  getBoundingClientRect: () => WebPopoverRect;
  contains: (node: unknown) => boolean;
  readonly disabled?: boolean;
  readonly tabIndex?: number;
  focus?: () => void;
  getAttribute?: (name: string) => string | null;
  setAttribute?: (name: string, value: string) => void;
  removeAttribute?: (name: string) => void;
  showPopover?: () => void;
  hidePopover?: () => void;
}

type FixedStyle = Readonly<{
  position: 'fixed';
  left: number;
  top: number;
  width: number | 'auto';
  display: 'none' | 'block';
  visibility: 'hidden' | 'visible';
  margin: number;
  inset: 'auto';
  border: number;
  padding: number;
  background: 'transparent';
  overflow: 'visible';
  maxWidth: number | 'none';
  maxHeight: number | 'none';
}>;

/**
 * No styling escape hatches are intentional. A Menu/Select/Popover product
 * owns its slots and visual contract; this adapter only owns top-layer layout.
 */
export interface WebPopoverProps {
  readonly open: boolean;
  readonly overlayId: string;
  readonly overlayStack: OverlayStack;
  readonly onDismiss: (details: OverlayDismissDetails) => void;
  readonly triggerRef: RefObject<WebPopoverElement | null>;
  readonly floatingRef?: Ref<WebPopoverElement> | undefined;
  readonly children: ReactNode;
  readonly parentId?: string | undefined;
  readonly dismissible?: boolean | undefined;
  readonly placement?: OverlayPlacement | undefined;
  readonly direction?: OverlayDirection | undefined;
  readonly sideOffset?: number | undefined;
  readonly alignOffset?: number | undefined;
  readonly collisionInsets?: number | OverlayCollisionInsets | undefined;
  readonly flip?: boolean | undefined;
  readonly shift?: boolean | undefined;
  readonly role?: 'dialog' | 'listbox' | 'menu' | 'tooltip' | undefined;
  /** Product-owned DOM id used by trigger controls and labelled relationships. */
  readonly domId?: string | undefined;
  readonly accessibilityLabel?: string | undefined;
  readonly accessibilityLabelledBy?: string | undefined;
  readonly accessibilityDescribedBy?: string | undefined;
  /**
   * Connects an owned trigger to the shown popover's sequential-focus scope.
   * Product components opt in only when their popup owns tabbable dialog UI.
   */
  readonly connectTriggerFocusNavigation?: boolean | undefined;
  /** Product hook that owns the exact typed reason and cancels pending Tab work. */
  readonly onFocusGuardExit?: ((event: unknown) => void) | undefined;
  /** Runs after the effective layer is registered and shown (or fixed-fallback ready). */
  readonly onLayerReady?: (() => void) | undefined;
  /** Called only when the anchor's collision-boundary visibility changes. */
  readonly onDetachedChange?: ((detached: boolean) => void) | undefined;
  /** Match the measured anchor width without exceeding collision space. */
  readonly matchTriggerWidth?: boolean | undefined;
}

interface RawPopoverProps {
  readonly ref: (node: unknown) => void;
  readonly popover: 'manual';
  readonly role?: 'dialog' | 'listbox' | 'menu' | 'tooltip' | undefined;
  readonly id?: string | undefined;
  readonly 'aria-label'?: string | undefined;
  readonly 'aria-labelledby'?: string | undefined;
  readonly 'aria-describedby'?: string | undefined;
  readonly 'data-gj-web-popover': '';
  readonly 'data-placement'?: OverlayPlacement | undefined;
  readonly 'data-detached'?: '' | undefined;
  readonly onToggle: (event: unknown) => void;
  readonly style: FixedStyle;
}

interface RawFocusGuardProps {
  readonly tabIndex: 0;
  readonly 'data-gj-focus-guard': 'start' | 'end';
  readonly onFocus: (event: unknown) => void;
  readonly style: Readonly<{
    position: 'fixed';
    width: number;
    height: number;
    opacity: number;
    pointerEvents: 'none';
    outline: 'none';
  }>;
}

const FOCUSABLE_SELECTOR = [
  'a[href]:not([tabindex="-1"])',
  'button:not([disabled]):not([tabindex="-1"])',
  'input:not([disabled]):not([tabindex="-1"])',
  'select:not([disabled]):not([tabindex="-1"])',
  'textarea:not([disabled]):not([tabindex="-1"])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

const focusGuardStyle: RawFocusGuardProps['style'] = {
  position: 'fixed',
  width: 1,
  height: 1,
  opacity: 0,
  pointerEvents: 'none',
  outline: 'none',
};

function assertNonEmptyString(value: string, label: string): void {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string.`);
  }
}

function finiteNonNegative(value: number | undefined, label: string): void {
  if (value !== undefined && (!Number.isFinite(value) || value < 0)) {
    throw new RangeError(`${label} must be a finite non-negative number.`);
  }
}

function toRect(rect: WebPopoverRect): OverlayRect {
  const x = rect.x ?? rect.left;
  const y = rect.y ?? rect.top;
  if (x === undefined || y === undefined) {
    throw new Error('WebPopover measurement requires DOMRect x/y or left/top coordinates.');
  }
  return { x, y, width: rect.width, height: rect.height };
}

function assignRef<T>(ref: Ref<T> | undefined, value: T | null): void {
  if (typeof ref === 'function') {
    ref(value);
  } else if (ref !== null && ref !== undefined) {
    // React's public RefObject is readonly to consumers; React itself assigns it.
    (ref as { current: T | null }).current = value;
  }
}

function eventTarget(event: unknown): unknown {
  if (typeof event !== 'object' || event === null || !('target' in event)) return null;
  return (event as { readonly target?: unknown }).target ?? null;
}

function eventRelatedTarget(event: unknown): unknown {
  if (typeof event !== 'object' || event === null || !('relatedTarget' in event)) {
    return null;
  }
  return (event as { readonly relatedTarget?: unknown }).relatedTarget ?? null;
}

function isEscapeEvent(event: unknown): boolean {
  return (
    typeof event === 'object' &&
    event !== null &&
    'key' in event &&
    (event as { readonly key?: unknown }).key === 'Escape'
  );
}

function isClosedToggle(event: unknown): boolean {
  return (
    typeof event === 'object' &&
    event !== null &&
    'newState' in event &&
    (event as { readonly newState?: unknown }).newState === 'closed'
  );
}

function sameBoolean(previous: boolean | null, next: boolean): boolean {
  return previous !== null && previous === next;
}

/**
 * Uses the HTML Popover API when present and a positioned in-tree element when
 * absent. The caller owns `open`; every dismiss event is merely a request.
 */
export function WebPopover({
  open,
  overlayId,
  overlayStack,
  onDismiss,
  triggerRef,
  floatingRef,
  children,
  parentId,
  dismissible = true,
  placement = 'bottom-start',
  direction = 'ltr',
  sideOffset = 0,
  alignOffset = 0,
  collisionInsets,
  flip = true,
  shift = true,
  role,
  domId,
  accessibilityLabel,
  accessibilityLabelledBy,
  accessibilityDescribedBy,
  connectTriggerFocusNavigation = false,
  onFocusGuardExit,
  onLayerReady,
  onDetachedChange,
  matchTriggerWidth = false,
}: WebPopoverProps): ReactElement {
  assertNonEmptyString(overlayId, 'WebPopover overlayId');
  if (domId !== undefined) assertNonEmptyString(domId, 'WebPopover domId');
  if (accessibilityLabel !== undefined) {
    assertNonEmptyString(accessibilityLabel, 'WebPopover accessibilityLabel');
  }
  if (accessibilityLabelledBy !== undefined) {
    assertNonEmptyString(
      accessibilityLabelledBy,
      'WebPopover accessibilityLabelledBy',
    );
  }
  if (accessibilityDescribedBy !== undefined) {
    assertNonEmptyString(
      accessibilityDescribedBy,
      'WebPopover accessibilityDescribedBy',
    );
  }
  finiteNonNegative(sideOffset, 'WebPopover sideOffset');
  if (!Number.isFinite(alignOffset)) {
    throw new RangeError('WebPopover alignOffset must be finite.');
  }

  const nodeRef = useRef<WebPopoverElement | null>(null);
  const onDismissRef = useRef(onDismiss);
  const onLayerReadyRef = useRef(onLayerReady);
  const detachedRef = useRef<boolean | null>(null);
  const stackHandleRef = useRef<OverlayStackHandle | null>(null);
  const toggleListenerRef = useRef<((event: unknown) => void) | null>(null);
  const [position, setPosition] = useState<ReturnType<typeof computeOverlayPosition> | null>(null);
  const [matchedWidth, setMatchedWidth] = useState<number | null>(null);
  const overlaySnapshot = useSyncExternalStore(
    overlayStack.subscribe,
    overlayStack.getSnapshot,
    overlayStack.getSnapshot,
  );
  const parentIsRegistered =
    parentId === undefined ||
    overlaySnapshot.entries.some((entry) => entry.id === parentId);
  const effectiveOpen = open && parentIsRegistered;
  const effectivePosition = effectiveOpen ? position : null;
  onDismissRef.current = onDismiss;
  onLayerReadyRef.current = onLayerReady;

  const requestDismiss = useCallback(
    (reason: 'outside-press' | 'escape-key', originalEvent?: unknown): void => {
      if (isOverlayDismissEventHandled(originalEvent)) return;
      const result = overlayStack.requestDismiss(overlayId, reason, originalEvent);
      // Consume only when this layer actually owned the interaction. A lower
      // listener that is blocked by a different topmost overlay must leave the
      // event available to that real owner.
      if (
        result.status === 'dismissed' ||
        (result.status === 'blocked' &&
          result.blockReason === 'not-dismissible')
      ) {
        markOverlayDismissEventHandled(originalEvent);
      }
    },
    [overlayId, overlayStack],
  );

  const handleFocusGuard = useCallback(
    (direction: 'start' | 'end', event: unknown): void => {
      if (!effectiveOpen) return;
      const trigger = triggerRef.current;
      const floating = nodeRef.current;
      const ownerDocument = floating?.ownerDocument ?? trigger?.ownerDocument;
      const relatedTarget = eventRelatedTarget(event);
      const cameFromInside =
        relatedTarget !== null && floating?.contains(relatedTarget) === true;
      const candidates = ownerDocument?.querySelectorAll?.(FOCUSABLE_SELECTOR);
      const ordered = candidates === undefined ? [] : Array.from(candidates);
      const inside = ordered.filter(
        (candidate) =>
          floating?.contains(candidate) === true &&
          candidate.getAttribute?.('data-gj-focus-guard') === null &&
          candidate.disabled !== true &&
          (candidate.tabIndex ?? 0) >= 0 &&
          candidate.getAttribute?.('aria-hidden') !== 'true',
      );

      // A guard can also be entered from outside an already-open non-modal
      // popup. In that case it is an entry boundary, not a dismissal boundary.
      if (relatedTarget !== null && !cameFromInside) {
        const entry = direction === 'start' ? inside[0] : inside[inside.length - 1];
        entry?.focus?.();
        return;
      }

      const isOutsideCandidate = (candidate: WebPopoverElement | undefined): candidate is WebPopoverElement =>
        candidate !== undefined &&
        candidate !== null &&
        floating?.contains(candidate) !== true &&
        candidate.disabled !== true &&
        (candidate.tabIndex ?? 0) >= 0 &&
        candidate.getAttribute?.('aria-hidden') !== 'true';
      const tryFocus = (candidate: WebPopoverElement | undefined): boolean => {
        if (!isOutsideCandidate(candidate)) return false;
        candidate.focus?.();
        return ownerDocument?.activeElement === candidate;
      };
      const triggerIndex = trigger === null ? -1 : ordered.indexOf(trigger);
      const firstFloatingIndex = ordered.findIndex(
        (candidate) => floating?.contains(candidate) === true,
      );
      let lastFloatingIndex = -1;
      for (let index = ordered.length - 1; index >= 0; index -= 1) {
        if (floating?.contains(ordered[index]) === true) {
          lastFloatingIndex = index;
          break;
        }
      }

      if (direction === 'start') {
        let movedFocus = tryFocus(trigger ?? undefined);
        const previousIndex =
          triggerIndex >= 0 ? triggerIndex - 1 : firstFloatingIndex - 1;
        for (let index = previousIndex; !movedFocus && index >= 0; index -= 1) {
          movedFocus = tryFocus(ordered[index]);
        }
        // A detached/non-focusable trigger still needs a valid wrap target.
        for (let index = ordered.length - 1; !movedFocus && index >= 0; index -= 1) {
          movedFocus = tryFocus(ordered[index]);
        }
      } else if (trigger !== null && trigger !== undefined && floating !== null) {
        let movedFocus = false;
        const followingIndex =
          triggerIndex >= 0 ? triggerIndex + 1 : lastFloatingIndex + 1;
        for (let index = followingIndex; index >= 0 && index < ordered.length; index += 1) {
          const candidate = ordered[index];
          if (candidate === trigger) continue;
          movedFocus = tryFocus(candidate);
          if (movedFocus) break;
        }
        // Native Tab order wraps at the document boundary. Mirror that when a
        // controlled parent refuses the close so focus never remains on guard.
        const wrapEndIndex =
          triggerIndex >= 0 ? triggerIndex : firstFloatingIndex - 1;
        for (let index = 0; !movedFocus && index <= wrapEndIndex; index += 1) {
          movedFocus = tryFocus(ordered[index]);
        }
      }

      if (onFocusGuardExit === undefined) {
        overlayStack.requestDismiss(overlayId, 'tab-key', event);
      } else {
        onFocusGuardExit(event);
      }
    },
    [effectiveOpen, onFocusGuardExit, overlayId, overlayStack, triggerRef],
  );

  const setNode = useCallback(
    (node: unknown): void => {
      const nextNode = node === null ? null : (node as WebPopoverElement);
      nodeRef.current = nextNode;
      assignRef(floatingRef, nextNode);
    },
    [floatingRef],
  );

  const measure = useCallback((): void => {
    const anchor = triggerRef.current;
    const floating = nodeRef.current;
    const ownerDocument = floating?.ownerDocument ?? anchor?.ownerDocument;
    const view = ownerDocument?.defaultView;
    if (
      !effectiveOpen ||
      anchor === null ||
      floating === null ||
      ownerDocument === null ||
      ownerDocument === undefined ||
      view === null ||
      view === undefined
    ) {
      return;
    }

    const anchorRect = toRect(anchor.getBoundingClientRect());
    const result = computeOverlayPosition({
      anchor: anchorRect,
      floating: toRect(floating.getBoundingClientRect()),
      viewport: { x: 0, y: 0, width: view.innerWidth, height: view.innerHeight },
      placement,
      direction,
      sideOffset,
      alignOffset,
      ...(collisionInsets === undefined ? {} : { collisionInsets }),
      flip,
      shift,
    });
    setPosition((previous) =>
      previous !== null &&
      previous.x === result.x &&
      previous.y === result.y &&
      previous.placement === result.placement &&
      previous.detached === result.detached &&
      previous.availableWidth === result.availableWidth &&
      previous.availableHeight === result.availableHeight
        ? previous
        : result,
    );
    const nextMatchedWidth = matchTriggerWidth
      ? Math.min(anchorRect.width, result.availableWidth)
      : null;
    setMatchedWidth((previous) =>
      previous === nextMatchedWidth ? previous : nextMatchedWidth,
    );
    if (!sameBoolean(detachedRef.current, result.detached)) {
      detachedRef.current = result.detached;
      onDetachedChange?.(result.detached);
    }
  }, [
    alignOffset,
    collisionInsets,
    direction,
    flip,
    matchTriggerWidth,
    onDetachedChange,
    effectiveOpen,
    placement,
    shift,
    sideOffset,
    triggerRef,
  ]);

  useLayoutEffect(() => {
    if (!effectiveOpen) {
      stackHandleRef.current?.unmount();
      stackHandleRef.current = null;
      detachedRef.current = null;
      setPosition(null);
      setMatchedWidth(null);
      return;
    }

    const handle = overlayStack.mount({
      id: overlayId,
      ...(parentId === undefined ? {} : { parentId }),
      dismissible,
      onDismiss: (details) => onDismissRef.current(details),
    });
    stackHandleRef.current = handle;
    return () => {
      handle.unmount();
      if (stackHandleRef.current === handle) stackHandleRef.current = null;
    };
  // Registration identity and mount order belong to the open lifetime. Mutable
  // policy is updated below so changing dismissibility/parentage cannot move an
  // already-open lower overlay above a later sibling.
  }, [effectiveOpen, overlayId, overlayStack]);

  useLayoutEffect(() => {
    const handle = stackHandleRef.current;
    if (handle === null) return;
    handle.update({ parentId: parentId ?? null, dismissible });
  }, [dismissible, parentId]);

  // showPopover must run before measurement because a closed manual popover is display:none.
  useLayoutEffect(() => {
    const node = nodeRef.current;
    if (node === null) return;
    if (!effectiveOpen) {
      try {
        node.hidePopover?.();
      } catch {
        // A disconnected node can reject hidePopover during controlled teardown.
      }
      return;
    }
    if (node.isConnected === false) return;
    // The relationship must exist before showPopover() so the browser includes
    // this popup in the invoker's sequential-focus scope from the first frame.
    if (connectTriggerFocusNavigation && domId !== undefined) {
      const trigger = triggerRef.current;
      trigger?.setAttribute?.('popovertarget', domId);
      trigger?.setAttribute?.('popovertargetaction', 'show');
    }
    try {
      node.showPopover?.();
    } catch {
      // Unsupported or already-open implementations use the fixed fallback below.
    }
    onLayerReadyRef.current?.();
  }, [connectTriggerFocusNavigation, domId, effectiveOpen, triggerRef]);

  useLayoutEffect(() => {
    const trigger = triggerRef.current;
    if (
      trigger === null ||
      !connectTriggerFocusNavigation ||
      domId === undefined ||
      !effectiveOpen
    ) {
      trigger?.removeAttribute?.('popovertarget');
      trigger?.removeAttribute?.('popovertargetaction');
      return;
    }

    // The native relationship inserts the shown popover into the invoker's
    // sequential focus scope. `show` avoids a second browser-owned toggle;
    // controlled state remains the sole visibility source of truth.
    trigger.setAttribute?.('popovertarget', domId);
    trigger.setAttribute?.('popovertargetaction', 'show');
    return () => {
      trigger.removeAttribute?.('popovertarget');
      trigger.removeAttribute?.('popovertargetaction');
    };
  });

  useLayoutEffect(() => {
    if (!effectiveOpen) return;
    const anchor = triggerRef.current;
    const floating = nodeRef.current;
    const ownerDocument = floating?.ownerDocument ?? anchor?.ownerDocument;
    const view = ownerDocument?.defaultView;
    if (
      anchor === null ||
      floating === null ||
      ownerDocument === null ||
      ownerDocument === undefined ||
      view === null ||
      view === undefined
    ) {
      return;
    }

    measure();
    const onResize = (): void => measure();
    const onScroll = (): void => measure();
    const onPointerDown = (event: unknown): void => {
      const target = eventTarget(event);
      if (target !== null && (floating.contains(target) || anchor.contains(target))) return;
      requestDismiss('outside-press', event);
    };
    const onKeyDown = (event: unknown): void => {
      if (isEscapeEvent(event)) requestDismiss('escape-key', event);
    };
    const onToggle = (event: unknown): void => {
      // A browser may close a native popover through its own light-dismiss UI.
      // Our explicit pointer/Escape listeners normally handle this first.
      if (isClosedToggle(event)) requestDismiss('outside-press', event);
    };

    view.addEventListener('resize', onResize);
    ownerDocument.addEventListener('scroll', onScroll, true);
    ownerDocument.addEventListener('pointerdown', onPointerDown, true);
    ownerDocument.addEventListener('keydown', onKeyDown, true);
    const ResizeObserver = view.ResizeObserver;
    const observer = ResizeObserver === undefined ? null : new ResizeObserver(onResize);
    observer?.observe(anchor);
    observer?.observe(floating);
    // React's onToggle remains stable and forwards to this ref-backed handler.
    toggleListenerRef.current = onToggle;

    return () => {
      toggleListenerRef.current = null;
      observer?.disconnect();
      view.removeEventListener('resize', onResize);
      ownerDocument.removeEventListener('scroll', onScroll, true);
      ownerDocument.removeEventListener('pointerdown', onPointerDown, true);
      ownerDocument.removeEventListener('keydown', onKeyDown, true);
    };
  }, [effectiveOpen, measure, requestDismiss, triggerRef]);

  const onToggle = useCallback((event: unknown): void => {
    toggleListenerRef.current?.(event);
  }, []);

  const style: FixedStyle = {
    position: 'fixed',
    left: effectivePosition?.x ?? 0,
    top: effectivePosition?.y ?? 0,
    width: matchedWidth ?? 'auto',
    display: effectiveOpen ? 'block' : 'none',
    visibility:
      effectiveOpen && effectivePosition !== null ? 'visible' : 'hidden',
    margin: 0,
    inset: 'auto',
    // Reset the user-agent popover panel so the product component owns every
    // visible surface token, boundary, and clipping decision.
    border: 0,
    padding: 0,
    background: 'transparent',
    overflow: 'visible',
    // The first unconstrained measurement chooses a side; the resolved
    // collision space then constrains product content through inherited max
    // sizes. ResizeObserver performs the final position pass after it shrinks.
    maxWidth: effectivePosition?.availableWidth ?? 'none',
    maxHeight: effectivePosition?.availableHeight ?? 'none',
  };
  const props: RawPopoverProps = {
    ref: setNode,
    popover: 'manual',
    ...(role === undefined ? {} : { role }),
    ...(domId === undefined ? {} : { id: domId }),
    ...(accessibilityLabel === undefined ? {} : { 'aria-label': accessibilityLabel }),
    ...(accessibilityLabelledBy === undefined
      ? {}
      : { 'aria-labelledby': accessibilityLabelledBy }),
    ...(accessibilityDescribedBy === undefined
      ? {}
      : { 'aria-describedby': accessibilityDescribedBy }),
    'data-gj-web-popover': '',
    ...(effectivePosition === null
      ? {}
      : { 'data-placement': effectivePosition.placement }),
    ...(effectivePosition?.detached ? { 'data-detached': '' } : {}),
    onToggle,
    style,
  };

  // `div` is intentionally created without DOM-lib types; this module is only
  // selected by a web product implementation, never the native entrypoint.
  return createElement(
    'div' as never,
    props as never,
    effectiveOpen && connectTriggerFocusNavigation
      ? createElement(
          'span' as never,
          {
            tabIndex: 0,
            'data-gj-focus-guard': 'start',
            onFocus: (event: unknown) => handleFocusGuard('start', event),
            style: focusGuardStyle,
          } as RawFocusGuardProps as never,
        )
      : null,
    effectiveOpen ? (
      <OverlayLayerBoundary overlayId={overlayId}>{children}</OverlayLayerBoundary>
    ) : null,
    effectiveOpen && connectTriggerFocusNavigation
      ? createElement(
          'span' as never,
          {
            tabIndex: 0,
            'data-gj-focus-guard': 'end',
            onFocus: (event: unknown) => handleFocusGuard('end', event),
            style: focusGuardStyle,
          } as RawFocusGuardProps as never,
        )
      : null,
  ) as ReactElement;
}
