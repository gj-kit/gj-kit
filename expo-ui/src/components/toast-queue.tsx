/**
 * The declarative Toast queue and viewport.
 *
 * The small compatibility API of the single Toast and useToastController stays in
 * feedback.tsx; this module explicitly owns the ordering, lifetime, and
 * interaction of several notifications.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { AppState, Platform, Text as RNText, View } from 'react-native';
import type { AppStateStatus, TextStyle, ViewStyle } from 'react-native';
import type { Theme } from '../theme/tokens';
import { Button, IconButton } from './button';
import type { ToastVariant } from './icons';
import { renderIconSlot } from './icons';
import type { CommonProps } from './internal';
import { elevationStyle, nativeWindProps, themedStyles } from './internal';
import { useIcons, useStrings, useTheme } from './provider';
import { roleTextStyle } from './text';

declare const toastIdBrand: unique symbol;

/** The nominal type that lets only queue-issued identifiers be handed back to the update and dismiss APIs. */
export type ToastId = string & { readonly [toastIdBrand]: 'ToastId' };

export type ToastAnnouncement = 'off' | 'polite' | 'assertive';

export type ToastDismissReason =
  | 'timeout'
  | 'close-action'
  | 'action'
  | 'programmatic'
  | 'queue-overflow';

export interface ToastAction {
  readonly label: string;
  readonly onPress: () => void;
  readonly accessibilityLabel?: string | undefined;
}

export interface ToastRequest {
  readonly title?: string | undefined;
  readonly message: string;
  /** Defaults to 'info'. */
  readonly variant?: ToastVariant | undefined;
  /** When null, it stays until the user dismisses it. */
  readonly durationMs?: number | null | undefined;
  /** Defaults to 'polite'. */
  readonly announcement?: ToastAnnouncement | undefined;
  readonly action?: ToastAction | undefined;
  /** Calling show again with the same key replaces the content while preserving the existing position and id. */
  readonly dedupeKey?: string | undefined;
}

/** In update, null explicitly removes an existing optional property. */
export interface ToastUpdate {
  readonly title?: string | null | undefined;
  readonly message?: string | undefined;
  readonly variant?: ToastVariant | undefined;
  readonly durationMs?: number | null | undefined;
  readonly announcement?: ToastAnnouncement | undefined;
  readonly action?: ToastAction | null | undefined;
  readonly dedupeKey?: string | null | undefined;
}

/** The public snapshot after show/update input is validated and defaults are resolved. */
export interface ToastRecord {
  readonly id: ToastId;
  readonly title?: string | undefined;
  readonly message: string;
  readonly variant: ToastVariant;
  readonly durationMs: number | null;
  readonly announcement: ToastAnnouncement;
  readonly action?: ToastAction | undefined;
  readonly dedupeKey?: string | undefined;
}

export interface UseToastQueueOptions {
  /** How many are visible at once. Defaults to 1. */
  readonly maxVisible?: number | undefined;
  /** How many can wait behind the visible ones. Defaults to 9, for a default cap of 10 in total. */
  readonly maxQueued?: number | undefined;
  /** The lifetime used when request.durationMs is omitted. Defaults to 5000ms. */
  readonly defaultDurationMs?: number | undefined;
  readonly onDismiss?:
    | ((toast: ToastRecord, reason: ToastDismissReason) => void)
    | undefined;
}

export interface ToastQueueController {
  /** The full FIFO snapshot of visible plus queued. */
  readonly records: readonly ToastRecord[];
  readonly visibleToasts: readonly ToastRecord[];
  readonly queuedCount: number;
  readonly show: (request: ToastRequest) => ToastId;
  readonly update: (id: ToastId, update: ToastUpdate) => boolean;
  readonly dismiss: (id: ToastId, reason?: ToastDismissReason | undefined) => boolean;
  readonly dismissAll: (reason?: ToastDismissReason | undefined) => void;
  readonly pause: (id: ToastId) => boolean;
  readonly resume: (id: ToastId) => boolean;
}

type TimerState = {
  durationMs: number | null;
  remainingMs: number | null;
  startedAt: number | null;
  handle: ReturnType<typeof setTimeout> | null;
};

type LifecyclePauseSource = 'app-state' | 'focus-loss';

type WebWindowBridge = {
  addEventListener: (type: 'blur' | 'focus', listener: () => void) => void;
  removeEventListener: (type: 'blur' | 'focus', listener: () => void) => void;
};

function webWindowBridge(): WebWindowBridge | null {
  if (Platform.OS !== 'web') return null;
  // Keep the shared web artifact importable in DOM-free Node without emitting
  // an eager browser-global identifier into the module graph.
  const browserGlobalKey = String.fromCharCode(119, 105, 110, 100, 111, 119);
  const candidate = (
    globalThis as unknown as Record<string, Partial<WebWindowBridge> | undefined>
  )[browserGlobalKey];
  return typeof candidate?.addEventListener === 'function' &&
    typeof candidate.removeEventListener === 'function'
    ? (candidate as WebWindowBridge)
    : null;
}

function appStatePausesTimers(state: AppStateStatus | null): boolean {
  // RN may briefly report null while the native bridge initializes. Pausing on
  // null could strand timers forever if no change event follows.
  return state === 'background' || state === 'inactive' || state === 'extension';
}

const DEFAULT_MAX_VISIBLE = 1;
const DEFAULT_MAX_QUEUED = 9;
const DEFAULT_DURATION_MS = 5_000;
const EMPTY_RECORDS: readonly ToastRecord[] = Object.freeze([]);
let nextToastId = 0;

const variants = new Set<ToastVariant>(['error', 'success', 'info', 'warning']);
const announcements = new Set<ToastAnnouncement>(['off', 'polite', 'assertive']);
const dismissReasons = new Set<ToastDismissReason>([
  'timeout',
  'close-action',
  'action',
  'programmatic',
  'queue-overflow',
]);

function assertObject(value: unknown, label: string): asserts value is Record<PropertyKey, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object.`);
  }
}

function assertNonEmptyString(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(`${label} must be a non-empty string.`);
  }
}

function assertDuration(value: unknown, label: string): asserts value is number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new RangeError(`${label} must be a finite number greater than or equal to 0.`);
  }
}

function assertCount(value: unknown, label: string, minimum: number): asserts value is number {
  if (!Number.isInteger(value) || typeof value !== 'number' || value < minimum) {
    throw new RangeError(`${label} must be an integer greater than or equal to ${minimum}.`);
  }
}

function assertToastId(value: unknown): asserts value is ToastId {
  assertNonEmptyString(value, 'Toast id');
}

function assertDismissReason(value: unknown): asserts value is ToastDismissReason {
  if (typeof value !== 'string' || !dismissReasons.has(value as ToastDismissReason)) {
    throw new TypeError('Toast dismiss reason is invalid.');
  }
}

function normalizeAction(value: unknown): ToastAction {
  assertObject(value, 'Toast action');
  assertNonEmptyString(value.label, 'Toast action label');
  if (typeof value.onPress !== 'function') {
    throw new TypeError('Toast action onPress must be a function.');
  }
  if (value.accessibilityLabel !== undefined) {
    assertNonEmptyString(value.accessibilityLabel, 'Toast action accessibilityLabel');
  }
  return Object.freeze({
    label: value.label,
    onPress: value.onPress as () => void,
    ...(value.accessibilityLabel === undefined
      ? {}
      : { accessibilityLabel: value.accessibilityLabel }),
  });
}

function normalizeRequest(
  value: unknown,
  id: ToastId,
  defaultDurationMs: number,
): ToastRecord {
  assertObject(value, 'Toast request');
  assertNonEmptyString(value.message, 'Toast message');
  if (value.title !== undefined) assertNonEmptyString(value.title, 'Toast title');

  const variant = value.variant === undefined ? 'info' : value.variant;
  if (typeof variant !== 'string' || !variants.has(variant as ToastVariant)) {
    throw new TypeError('Toast variant is invalid.');
  }

  const durationMs = value.durationMs === undefined ? defaultDurationMs : value.durationMs;
  if (durationMs !== null) assertDuration(durationMs, 'Toast durationMs');

  const announcement = value.announcement === undefined ? 'polite' : value.announcement;
  if (
    typeof announcement !== 'string' ||
    !announcements.has(announcement as ToastAnnouncement)
  ) {
    throw new TypeError('Toast announcement is invalid.');
  }

  if (value.dedupeKey !== undefined) {
    assertNonEmptyString(value.dedupeKey, 'Toast dedupeKey');
  }
  const action = value.action === undefined ? undefined : normalizeAction(value.action);

  return Object.freeze({
    id,
    ...(value.title === undefined ? {} : { title: value.title }),
    message: value.message,
    variant: variant as ToastVariant,
    durationMs,
    announcement: announcement as ToastAnnouncement,
    ...(action === undefined ? {} : { action }),
    ...(value.dedupeKey === undefined ? {} : { dedupeKey: value.dedupeKey }),
  });
}

function mergeUpdate(current: ToastRecord, update: unknown): ToastRequest {
  assertObject(update, 'Toast update');

  // 공개 타입이 `prop?: T | undefined`를 허용하므로 명시적 undefined도 생략과 같다.
  // 선택 값을 지우는 동작은 null만 담당한다.
  const title = update.title === undefined ? current.title : update.title;
  if (title !== undefined && title !== null) assertNonEmptyString(title, 'Toast title');

  const message = update.message === undefined ? current.message : update.message;
  assertNonEmptyString(message, 'Toast message');

  const action = update.action === undefined ? current.action : update.action;
  if (action !== undefined && action !== null) normalizeAction(action);

  const dedupeKey = update.dedupeKey === undefined ? current.dedupeKey : update.dedupeKey;
  if (dedupeKey !== undefined && dedupeKey !== null) {
    assertNonEmptyString(dedupeKey, 'Toast dedupeKey');
  }

  return {
    ...(title === undefined || title === null ? {} : { title }),
    message,
    variant: update.variant === undefined ? current.variant : (update.variant as ToastVariant),
    durationMs:
      update.durationMs === undefined ? current.durationMs : (update.durationMs as number | null),
    announcement:
      update.announcement === undefined
        ? current.announcement
        : (update.announcement as ToastAnnouncement),
    ...(action === undefined || action === null ? {} : { action: action as ToastAction }),
    ...(dedupeKey === undefined || dedupeKey === null ? {} : { dedupeKey }),
  };
}

function assertToastRecord(value: unknown): asserts value is ToastRecord {
  assertObject(value, 'ToastViewport toast');
  assertToastId(value.id);
  assertNonEmptyString(value.message, 'Toast message');
  if (value.title !== undefined) assertNonEmptyString(value.title, 'Toast title');
  if (typeof value.variant !== 'string' || !variants.has(value.variant as ToastVariant)) {
    throw new TypeError('Toast variant is invalid.');
  }
  if (value.durationMs !== null) assertDuration(value.durationMs, 'Toast durationMs');
  if (
    typeof value.announcement !== 'string' ||
    !announcements.has(value.announcement as ToastAnnouncement)
  ) {
    throw new TypeError('Toast announcement is invalid.');
  }
  if (value.action !== undefined) normalizeAction(value.action);
  if (value.dedupeKey !== undefined) {
    assertNonEmptyString(value.dedupeKey, 'Toast dedupeKey');
  }
}

function issueToastId(): ToastId {
  nextToastId += 1;
  return `gj-toast-${nextToastId}` as ToastId;
}

function createTimerState(durationMs: number | null): TimerState {
  return { durationMs, remainingMs: durationMs, startedAt: null, handle: null };
}

function applyQueueBound(
  records: readonly ToastRecord[],
  maxVisible: number,
  maxQueued: number,
): { next: readonly ToastRecord[]; evicted: readonly ToastRecord[] } {
  const visibleBoundary = Math.min(maxVisible, records.length);
  const queued = records.slice(visibleBoundary);
  const overflow = Math.max(0, queued.length - maxQueued);
  if (overflow === 0) return { next: records, evicted: [] };
  return {
    next: [...records.slice(0, visibleBoundary), ...queued.slice(overflow)],
    evicted: queued.slice(0, overflow),
  };
}

/**
 * A FIFO queue. Timing state lives in a ref so pause and resume preserve the
 * remaining time without waiting on a render, and the public records expose only
 * the normalized data a render needs.
 */
export function useToastQueue(options: UseToastQueueOptions = {}): ToastQueueController {
  assertObject(options, 'Toast queue options');
  const maxVisible = options.maxVisible ?? DEFAULT_MAX_VISIBLE;
  const maxQueued = options.maxQueued ?? DEFAULT_MAX_QUEUED;
  const defaultDurationMs = options.defaultDurationMs ?? DEFAULT_DURATION_MS;
  assertCount(maxVisible, 'Toast maxVisible', 1);
  assertCount(maxQueued, 'Toast maxQueued', 0);
  assertDuration(defaultDurationMs, 'Toast defaultDurationMs');
  if (options.onDismiss !== undefined && typeof options.onDismiss !== 'function') {
    throw new TypeError('Toast onDismiss must be a function.');
  }

  const [records, setRecords] = useState<readonly ToastRecord[]>(EMPTY_RECORDS);
  const recordsRef = useRef<readonly ToastRecord[]>(EMPTY_RECORDS);
  const timersRef = useRef(new Map<ToastId, TimerState>());
  const pausedRef = useRef(new Set<ToastId>());
  const lifecyclePauseSourcesRef = useRef(new Set<LifecyclePauseSource>());
  const mountedRef = useRef(true);
  const optionsRef = useRef({ maxVisible, maxQueued, defaultDurationMs });
  const onDismissRef = useRef(options.onDismiss);
  optionsRef.current = { maxVisible, maxQueued, defaultDurationMs };
  onDismissRef.current = options.onDismiss;

  // 이 lifecycle effect를 timer/listener effect보다 먼저 등록해야 React
  // StrictMode의 setup→cleanup→setup 재실행에서도 후속 effect가 mounted=true를
  // 관찰한다.
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      for (const timer of timersRef.current.values()) {
        if (timer.handle !== null) clearTimeout(timer.handle);
      }
      timersRef.current.clear();
      pausedRef.current.clear();
      lifecyclePauseSourcesRef.current.clear();
    };
  }, []);

  const commit = useCallback((next: readonly ToastRecord[]): void => {
    const snapshot = Object.isFrozen(next) ? next : Object.freeze([...next]);
    recordsRef.current = snapshot;
    if (mountedRef.current) setRecords(snapshot);
  }, []);

  const stopTimer = useCallback((id: ToastId, preserveRemaining: boolean): void => {
    const timer = timersRef.current.get(id);
    if (!timer) return;
    if (timer.handle !== null) clearTimeout(timer.handle);
    if (preserveRemaining && timer.remainingMs !== null && timer.startedAt !== null) {
      timer.remainingMs = Math.max(0, timer.remainingMs - (Date.now() - timer.startedAt));
    }
    timer.handle = null;
    timer.startedAt = null;
    if (!preserveRemaining) timersRef.current.delete(id);
  }, []);

  const remove = useCallback(
    (id: ToastId, reason: ToastDismissReason): boolean => {
      const current = recordsRef.current;
      const index = current.findIndex((toast) => toast.id === id);
      if (index < 0) return false;
      const toast = current[index];
      if (toast === undefined) return false;
      stopTimer(id, false);
      pausedRef.current.delete(id);
      commit([...current.slice(0, index), ...current.slice(index + 1)]);
      onDismissRef.current?.(toast, reason);
      return true;
    },
    [commit, stopTimer],
  );
  const removeRef = useRef(remove);
  removeRef.current = remove;

  const startTimer = useCallback((id: ToastId): void => {
    if (
      !mountedRef.current ||
      pausedRef.current.has(id) ||
      lifecyclePauseSourcesRef.current.size > 0
    ) return;
    const index = recordsRef.current.findIndex((toast) => toast.id === id);
    if (index < 0 || index >= optionsRef.current.maxVisible) return;
    const timer = timersRef.current.get(id);
    if (!timer || timer.durationMs === null || timer.remainingMs === null || timer.handle !== null) {
      return;
    }
    timer.startedAt = Date.now();
    timer.handle = setTimeout(() => {
      timer.handle = null;
      timer.startedAt = null;
      timer.remainingMs = 0;
      removeRef.current(id, 'timeout');
    }, timer.remainingMs);
  }, []);

  const resetTimer = useCallback(
    (toast: ToastRecord): void => {
      stopTimer(toast.id, false);
      timersRef.current.set(toast.id, createTimerState(toast.durationMs));
    },
    [stopTimer],
  );

  const reportEvictions = useCallback(
    (evicted: readonly ToastRecord[]): void => {
      for (const toast of evicted) {
        stopTimer(toast.id, false);
        pausedRef.current.delete(toast.id);
      }
      for (const toast of evicted) onDismissRef.current?.(toast, 'queue-overflow');
    },
    [stopTimer],
  );

  const show = useCallback(
    (request: ToastRequest): ToastId => {
      const config = optionsRef.current;
      const probeId = issueToastId();
      const normalized = normalizeRequest(request, probeId, config.defaultDurationMs);
      const current = recordsRef.current;
      const duplicateIndex =
        normalized.dedupeKey === undefined
          ? -1
          : current.findIndex((toast) => toast.dedupeKey === normalized.dedupeKey);

      if (duplicateIndex >= 0) {
        const duplicate = current[duplicateIndex];
        if (duplicate === undefined) return probeId;
        const replacement = Object.freeze({ ...normalized, id: duplicate.id });
        resetTimer(replacement);
        commit([
          ...current.slice(0, duplicateIndex),
          replacement,
          ...current.slice(duplicateIndex + 1),
        ]);
        return duplicate.id;
      }

      resetTimer(normalized);
      const bounded = applyQueueBound(
        [...current, normalized],
        config.maxVisible,
        config.maxQueued,
      );
      commit(bounded.next);
      reportEvictions(bounded.evicted);
      return normalized.id;
    },
    [commit, reportEvictions, resetTimer],
  );

  const update = useCallback(
    (id: ToastId, patch: ToastUpdate): boolean => {
      assertToastId(id);
      const current = recordsRef.current;
      const index = current.findIndex((toast) => toast.id === id);
      if (index < 0) return false;
      const previous = current[index];
      if (previous === undefined) return false;
      const merged = mergeUpdate(previous, patch);
      const replacement = normalizeRequest(merged, id, optionsRef.current.defaultDurationMs);
      if (
        replacement.dedupeKey !== undefined &&
        current.some(
          (toast) => toast.id !== id && toast.dedupeKey === replacement.dedupeKey,
        )
      ) {
        throw new Error(`Toast dedupeKey is already in use: "${replacement.dedupeKey}".`);
      }
      resetTimer(replacement);
      commit([...current.slice(0, index), replacement, ...current.slice(index + 1)]);
      return true;
    },
    [commit, resetTimer],
  );

  const dismiss = useCallback(
    (id: ToastId, reason: ToastDismissReason = 'programmatic'): boolean => {
      assertToastId(id);
      assertDismissReason(reason);
      return remove(id, reason);
    },
    [remove],
  );

  const dismissAll = useCallback(
    (reason: ToastDismissReason = 'programmatic'): void => {
      assertDismissReason(reason);
      const current = recordsRef.current;
      if (current.length === 0) return;
      for (const toast of current) {
        stopTimer(toast.id, false);
        pausedRef.current.delete(toast.id);
      }
      commit([]);
      for (const toast of current) onDismissRef.current?.(toast, reason);
    },
    [commit, stopTimer],
  );

  const pause = useCallback(
    (id: ToastId): boolean => {
      assertToastId(id);
      if (!recordsRef.current.some((toast) => toast.id === id)) return false;
      if (!pausedRef.current.has(id)) {
        pausedRef.current.add(id);
        stopTimer(id, true);
      }
      return true;
    },
    [stopTimer],
  );

  const resume = useCallback(
    (id: ToastId): boolean => {
      assertToastId(id);
      if (!recordsRef.current.some((toast) => toast.id === id)) return false;
      if (pausedRef.current.delete(id)) startTimer(id);
      return true;
    },
    [startTimer],
  );

  const setLifecyclePaused = useCallback(
    (source: LifecyclePauseSource, paused: boolean): void => {
      const sources = lifecyclePauseSourcesRef.current;
      const wasPaused = sources.size > 0;
      if (paused) sources.add(source);
      else sources.delete(source);
      const isPaused = sources.size > 0;
      if (wasPaused === isPaused) return;

      const visible = recordsRef.current.slice(0, optionsRef.current.maxVisible);
      if (isPaused) {
        for (const toast of visible) stopTimer(toast.id, true);
      } else {
        for (const toast of visible) startTimer(toast.id);
      }
    },
    [startTimer, stopTimer],
  );

  // 옵션 상한이 런타임에 줄어드는 경우도 show와 같은 oldest-queued 정책을 쓴다.
  useEffect(() => {
    const bounded = applyQueueBound(recordsRef.current, maxVisible, maxQueued);
    if (bounded.next !== recordsRef.current) {
      commit(bounded.next);
      reportEvictions(bounded.evicted);
    }
  }, [commit, maxQueued, maxVisible, reportEvictions]);

  // 보이는 항목만 타이머를 가진다. maxVisible 감소로 다시 queued가 되면 남은 시간을 보존한다.
  useEffect(() => {
    const activeIds = new Set(recordsRef.current.map((toast) => toast.id));
    for (const id of timersRef.current.keys()) {
      if (!activeIds.has(id)) stopTimer(id, false);
    }
    recordsRef.current.forEach((toast, index) => {
      if (!timersRef.current.has(toast.id)) resetTimer(toast);
      if (index < maxVisible) startTimer(toast.id);
      else stopTimer(toast.id, true);
    });
  }, [maxVisible, records, resetTimer, startTimer, stopTimer]);

  // 사용자가 알림을 볼 수 없는 동안에는 수명을 소비하지 않는다. AppState
  // change는 native background/inactive와 RNW page visibility를, native
  // blur/focus와 web window blur/focus는 visible-but-unfocused 상태를 담당한다.
  // 두 source는 합성되어 하나가 남아 있는 동안 timer를 재시작하지 않는다.
  useEffect(() => {
    const handleAppState = (state: AppStateStatus): void => {
      setLifecyclePaused('app-state', appStatePausesTimers(state));
    };
    handleAppState(AppState.currentState);
    const subscription = AppState.addEventListener('change', handleAppState);
    const nativeBlurSubscription = Platform.OS === 'web'
      ? undefined
      : AppState.addEventListener('blur', () => setLifecyclePaused('focus-loss', true));
    const nativeFocusSubscription = Platform.OS === 'web'
      ? undefined
      : AppState.addEventListener('focus', () => setLifecyclePaused('focus-loss', false));

    const browserWindow = webWindowBridge();
    const handleWindowBlur = (): void => setLifecyclePaused('focus-loss', true);
    const handleWindowFocus = (): void => setLifecyclePaused('focus-loss', false);
    browserWindow?.addEventListener('blur', handleWindowBlur);
    browserWindow?.addEventListener('focus', handleWindowFocus);

    return () => {
      subscription?.remove();
      nativeBlurSubscription?.remove();
      nativeFocusSubscription?.remove();
      browserWindow?.removeEventListener('blur', handleWindowBlur);
      browserWindow?.removeEventListener('focus', handleWindowFocus);
      lifecyclePauseSourcesRef.current.clear();
    };
  }, [setLifecyclePaused]);

  const visibleToasts = Object.freeze(records.slice(0, maxVisible));
  return {
    records,
    visibleToasts,
    queuedCount: Math.max(0, records.length - visibleToasts.length),
    show,
    update,
    dismiss,
    dismissAll,
    pause,
    resume,
  };
}

export type ToastViewportPlacement = 'top' | 'bottom';
export type ToastViewportDismissReason = Extract<
  ToastDismissReason,
  'close-action' | 'action'
>;

export interface ToastViewportProps extends Omit<CommonProps, 'unstyled'> {
  readonly toasts: readonly ToastRecord[];
  readonly onDismiss: (id: ToastId, reason: ToastViewportDismissReason) => void;
  readonly onPause: (id: ToastId) => void;
  readonly onResume: (id: ToastId) => void;
  /** Defaults to 'bottom'. */
  readonly placement?: ToastViewportPlacement | undefined;
  /** The distance from the screen edge. Defaults to spacing.xl. */
  readonly offset?: number | undefined;
  unstyled?: never;
}

type ToastPalette = { readonly background: string; readonly foreground: string };

function toastPalette(variant: ToastVariant, theme: Theme): ToastPalette {
  return {
    error: { background: theme.colors.dangerStrong, foreground: theme.colors.onDanger },
    success: { background: theme.colors.successStrong, foreground: theme.colors.onSuccess },
    info: { background: theme.colors.infoStrong, foreground: theme.colors.onInfo },
    warning: { background: theme.colors.warningStrong, foreground: theme.colors.onWarning },
  }[variant];
}

const getViewportStyles = themedStyles((theme: Theme) => ({
  viewport: {
    gap: theme.spacing.sm,
    left: theme.spacing.xl,
    right: theme.spacing.xl,
  },
  toast: {
    alignItems: 'center' as const,
    alignSelf: 'center' as const,
    borderRadius: theme.radius.sm,
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: theme.spacing.sm,
    maxWidth: theme.breakpoints.tablet,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    width: '100%' as const,
  },
  copy: {
    flex: 1,
    gap: theme.spacing.xs,
    minWidth: theme.spacing.none,
  },
  controls: {
    alignItems: 'center' as const,
    flexDirection: 'row' as const,
    gap: theme.spacing.sm,
  },
  closeGlyph: {
    includeFontPadding: false,
    lineHeight: theme.typography.title.lineHeight,
    textAlign: 'center' as const,
  },
}));

function closeGlyph(iconProps: { readonly color: string; readonly size: number }, style: TextStyle) {
  return (
    <RNText
      aria-hidden
      style={[style, { color: iconProps.color, fontSize: iconProps.size }]}
    >
      ×
    </RNText>
  );
}

type InteractionSource = 'hover' | 'focus' | 'touch';

type FocusTransitionBridge = {
  readonly currentTarget?: { contains?: (target: unknown) => boolean } | undefined;
  readonly relatedTarget?: unknown;
  readonly nativeEvent?: { readonly relatedTarget?: unknown } | undefined;
};

function focusStaysInside(event: unknown): boolean {
  const bridge = event as FocusTransitionBridge;
  const relatedTarget = bridge.relatedTarget ?? bridge.nativeEvent?.relatedTarget;
  return relatedTarget !== null &&
    relatedTarget !== undefined &&
    bridge.currentTarget?.contains?.(relatedTarget) === true;
}

function ToastViewportItem({
  toast,
  index,
  onDismiss,
  onPause,
  onResume,
  testID,
}: {
  readonly toast: ToastRecord;
  readonly index: number;
  readonly onDismiss: ToastViewportProps['onDismiss'];
  readonly onPause: ToastViewportProps['onPause'];
  readonly onResume: ToastViewportProps['onResume'];
  readonly testID?: string | undefined;
}): ReactElement {
  const theme = useTheme();
  const strings = useStrings();
  const icons = useIcons();
  const closeAccessibilityLabel = strings.close;
  assertNonEmptyString(closeAccessibilityLabel, 'ToastViewport strings.close');
  const styles = getViewportStyles(theme);
  const palette = toastPalette(toast.variant, theme);
  const interactions = useRef(new Set<InteractionSource>());
  const deferredFocusEndRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onResumeRef = useRef(onResume);
  onResumeRef.current = onResume;
  const itemTestID = testID === undefined ? undefined : `${testID}-toast-${index}`;
  const resolvedLeading = renderIconSlot(icons.toast?.[toast.variant], {
    color: palette.foreground,
    size: theme.metrics.icon.md,
  });
  const dismissIcon =
    icons.close ?? ((iconProps: { readonly color: string; readonly size: number }) =>
      closeGlyph(iconProps, styles.closeGlyph));

  const beginInteraction = (source: InteractionSource): void => {
    if (interactions.current.has(source)) return;
    const wasIdle = interactions.current.size === 0;
    interactions.current.add(source);
    if (wasIdle) onPause(toast.id);
  };
  const endInteraction = (source: InteractionSource): void => {
    if (!interactions.current.delete(source)) return;
    if (interactions.current.size === 0) onResume(toast.id);
  };
  const handleFocus = (event: unknown): void => {
    if (focusStaysInside(event)) return;
    if (deferredFocusEndRef.current !== null) {
      clearTimeout(deferredFocusEndRef.current);
      deferredFocusEndRef.current = null;
    }
    beginInteraction('focus');
  };
  const handleBlur = (event: unknown): void => {
    if (focusStaysInside(event)) return;
    if (Platform.OS === 'web') {
      endInteraction('focus');
      return;
    }
    if (deferredFocusEndRef.current !== null) clearTimeout(deferredFocusEndRef.current);
    // Native focus events do not reliably expose relatedTarget. Coalesce a
    // descendant blur followed by another descendant focus in the same turn.
    deferredFocusEndRef.current = setTimeout(() => {
      deferredFocusEndRef.current = null;
      endInteraction('focus');
    }, 0);
  };

  const politeRoleBridge =
    Platform.OS === 'web' && toast.announcement === 'polite'
      ? ({ role: 'status' } as const)
      : {};

  // viewport가 상호작용 중 제거되어도 큐에 paused id가 남지 않는다.
  useEffect(
    () => () => {
      if (deferredFocusEndRef.current !== null) {
        clearTimeout(deferredFocusEndRef.current);
        deferredFocusEndRef.current = null;
      }
      if (interactions.current.size > 0) onResumeRef.current(toast.id);
    },
    [toast.id],
  );

  return (
    <View
      testID={itemTestID}
      onPointerEnter={(event) => {
        if (event.nativeEvent.pointerType !== 'touch') beginInteraction('hover');
      }}
      onPointerLeave={(event) => {
        if (event.nativeEvent.pointerType !== 'touch') endInteraction('hover');
      }}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onTouchStart={() => beginInteraction('touch')}
      onTouchEnd={() => endInteraction('touch')}
      onTouchCancel={() => endInteraction('touch')}
      style={[
        styles.toast,
        { backgroundColor: palette.background, pointerEvents: 'auto' },
        elevationStyle(theme.elevation.md, theme.colors.shadow),
      ]}
    >
      {resolvedLeading === null || resolvedLeading === undefined ? null : (
        <View
          accessible={false}
          aria-hidden
          importantForAccessibility="no-hide-descendants"
        >
          {resolvedLeading}
        </View>
      )}
      <View
        testID={itemTestID === undefined ? undefined : `${itemTestID}-copy`}
        accessibilityRole={toast.announcement === 'assertive' ? 'alert' : undefined}
        accessibilityLiveRegion={toast.announcement === 'off' ? 'none' : toast.announcement}
        aria-live={toast.announcement}
        {...politeRoleBridge}
        style={styles.copy}
      >
        {toast.title === undefined ? null : (
          <RNText style={[roleTextStyle(theme, 'label'), { color: palette.foreground }]}>
            {toast.title}
          </RNText>
        )}
        <RNText
          style={[
            roleTextStyle(theme, toast.title === undefined ? 'label' : 'caption'),
            { color: palette.foreground },
          ]}
        >
          {toast.message}
        </RNText>
      </View>
      <View style={styles.controls}>
        {toast.action === undefined ? null : (
          <Button
            label={toast.action.label}
            accessibilityLabel={toast.action.accessibilityLabel}
            variant="secondary"
            size="md"
            testID={itemTestID === undefined ? undefined : `${itemTestID}-action`}
            onPress={() => {
              try {
                toast.action?.onPress();
              } finally {
                onDismiss(toast.id, 'action');
              }
            }}
          />
        )}
        <IconButton
          accessibilityLabel={closeAccessibilityLabel}
          icon={dismissIcon}
          variant="secondary"
          size={theme.metrics.control.md}
          testID={itemTestID === undefined ? undefined : `${itemTestID}-close`}
          onPress={() => onDismiss(toast.id, 'close-action')}
        />
      </View>
    </View>
  );
}

/** The fixed-position renderer. It owns layout only and hands queue state back through callbacks. */
export function ToastViewport({
  toasts,
  onDismiss,
  onPause,
  onResume,
  placement = 'bottom',
  offset,
  style,
  className,
  testID,
}: ToastViewportProps): ReactElement {
  if (!Array.isArray(toasts)) throw new TypeError('ToastViewport toasts must be an array.');
  if (typeof onDismiss !== 'function') throw new TypeError('ToastViewport onDismiss is required.');
  if (typeof onPause !== 'function') throw new TypeError('ToastViewport onPause is required.');
  if (typeof onResume !== 'function') throw new TypeError('ToastViewport onResume is required.');
  if (placement !== 'top' && placement !== 'bottom') {
    throw new TypeError('ToastViewport placement must be "top" or "bottom".');
  }
  if (offset !== undefined) assertDuration(offset, 'ToastViewport offset');
  const ids = new Set<string>();
  for (const toast of toasts) {
    assertToastRecord(toast);
    if (ids.has(toast.id)) throw new Error(`ToastViewport ids must be unique: "${toast.id}".`);
    ids.add(toast.id);
  }

  const theme = useTheme();
  const styles = getViewportStyles(theme);
  const edgeOffset = offset ?? theme.spacing.xl;
  const position: ViewStyle = {
    position: (Platform.OS === 'web' ? 'fixed' : 'absolute') as ViewStyle['position'],
    ...(placement === 'top' ? { top: edgeOffset } : { bottom: edgeOffset }),
    flexDirection: placement === 'top' ? 'column' : 'column-reverse',
  };

  return (
    <View
      testID={testID}
      {...nativeWindProps(className)}
      style={[styles.viewport, position, { pointerEvents: 'box-none' }, style]}
    >
      {toasts.map((toast, index) => (
        <ToastViewportItem
          key={toast.id}
          toast={toast}
          index={index}
          onDismiss={onDismiss}
          onPause={onPause}
          onResume={onResume}
          testID={testID}
        />
      ))}
    </View>
  );
}
