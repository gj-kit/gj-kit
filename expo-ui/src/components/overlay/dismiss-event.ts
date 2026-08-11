const handledDismissEvents = new WeakSet<object>();

/**
 * React Native Web wraps the browser event in a synthetic event. Overlay
 * products must key dismissal ownership by the shared native event so a
 * synchronous controlled close cannot expose and dismiss its parent during
 * the same interaction.
 */
export function overlayDismissOriginalEvent(event: unknown): unknown {
  if (typeof event === 'object' && event !== null && 'nativeEvent' in event) {
    return (event as { readonly nativeEvent?: unknown }).nativeEvent ?? event;
  }
  return event;
}

export function isOverlayDismissEventHandled(event: unknown): boolean {
  const originalEvent = overlayDismissOriginalEvent(event);
  return (
    (typeof originalEvent === 'object' && originalEvent !== null) ||
    typeof originalEvent === 'function'
  )
    ? handledDismissEvents.has(originalEvent as object)
    : false;
}

export function markOverlayDismissEventHandled(event: unknown): void {
  const originalEvent = overlayDismissOriginalEvent(event);
  if (
    (typeof originalEvent === 'object' && originalEvent !== null) ||
    typeof originalEvent === 'function'
  ) {
    handledDismissEvents.add(originalEvent as object);
  }
}
