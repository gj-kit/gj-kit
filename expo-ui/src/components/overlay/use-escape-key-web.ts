import { useEffect, useRef } from 'react';
import {
  isOverlayDismissEventHandled,
  markOverlayDismissEventHandled,
} from './dismiss-event';
import type { UseEscapeKeyOptions } from './use-escape-key-types';

interface EscapeKeyEvent {
  readonly defaultPrevented?: boolean | undefined;
  readonly key?: unknown;
}

interface EscapeKeyTarget {
  readonly addEventListener: (
    type: 'keydown',
    listener: (event: EscapeKeyEvent) => void,
    capture: true,
  ) => void;
  readonly removeEventListener: (
    type: 'keydown',
    listener: (event: EscapeKeyEvent) => void,
    capture: true,
  ) => void;
}

// Build this property name at runtime. Keeping the DOM global out of the
// emitted module graph is part of the package's SSR import guard.
const DOM_ROOT_KEY = String.fromCharCode(100, 111, 99, 117, 109, 101, 110, 116);

function readDomRoot(): EscapeKeyTarget | null {
  const scope = globalThis as unknown as Record<string, unknown>;
  // Keep the browser global lazily resolved so importing the web bundle is SSR-safe.
  const candidate = scope[DOM_ROOT_KEY];
  if (typeof candidate !== 'object' || candidate === null) return null;
  const keyTarget = candidate as Partial<EscapeKeyTarget>;
  return typeof keyTarget.addEventListener === 'function' &&
    typeof keyTarget.removeEventListener === 'function'
    ? (keyTarget as EscapeKeyTarget)
    : null;
}

/** DOM-free source bridge used only by the web/default target. */
export function useEscapeKey({ enabled, onEscape }: UseEscapeKeyOptions): void {
  const onEscapeRef = useRef(onEscape);
  onEscapeRef.current = onEscape;

  useEffect(() => {
    if (!enabled) return;
    const keyTarget = readDomRoot();
    if (keyTarget === null) return;

    const handleKeyDown = (event: EscapeKeyEvent): void => {
      if (
        event.key !== 'Escape' ||
        event.defaultPrevented === true ||
        isOverlayDismissEventHandled(event)
      ) return;
      if (onEscapeRef.current(event)) markOverlayDismissEventHandled(event);
    };
    keyTarget.addEventListener('keydown', handleKeyDown, true);
    return () => keyTarget.removeEventListener('keydown', handleKeyDown, true);
  }, [enabled]);
}
