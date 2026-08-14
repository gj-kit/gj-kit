/**
 * Dependency-free inset and keyboard arithmetic.
 *
 * This module deliberately imports neither React nor React Native, so it is safe
 * in shared browser, server, and build-tool code. Unlike the legacy `./insets`
 * entry, callers provide `platformOS` explicitly because this entry cannot read
 * `Platform.OS` for them.
 */

/**
 * Returns the real bottom safe-area inset for a platform.
 *
 * Bottom-anchored surfaces use the actual inset without a synthetic Android
 * minimum: gesture navigation, edge-to-edge three-button navigation, and windows
 * ending above the navigation bar all report different valid values.
 */
export function nativeBottomInset(bottomInset: number, platformOS: string): number {
  if (platformOS === 'web') return 0;
  return Math.max(0, bottomInset);
}

/** Adds design padding to the real bottom inset for a bottom-anchored surface. */
export function nativeBottomPadding(
  basePadding: number,
  bottomInset: number,
  platformOS: string,
): number {
  return basePadding + nativeBottomInset(bottomInset, platformOS);
}

/** The default gap between a focused input and the keyboard. */
const DEFAULT_REVEAL_MARGIN = 16;

/**
 * Calculates the forward-only scroll offset that keeps a focused input above a
 * keyboard and any fixed bottom bar. Returns null when no reveal is needed.
 */
export function computeKeyboardRevealOffset({
  currentOffset,
  inputHeight,
  inputTop,
  keyboardInset,
  reservedBottomHeight,
  viewportHeight,
  margin = DEFAULT_REVEAL_MARGIN,
}: {
  /** The current scroll offset (contentOffset.y). */
  currentOffset: number;
  /** The height of the focused input. */
  inputHeight: number;
  /** The top (y) of the focused input inside the scroll content. */
  inputTop: number;
  /** The keyboard overlap covering the bottom of the viewport. */
  keyboardInset: number;
  /** The measured height of a fixed bottom bar lifted above the keyboard, or 0 when there is none. */
  reservedBottomHeight: number;
  /** The scroll viewport height with no keyboard present. */
  viewportHeight: number;
  /** The gap between the input's bottom edge and the keyboard. Defaults to 16. */
  margin?: number | undefined;
}): number | null {
  if (keyboardInset <= 0) return null;
  const visibleViewportHeight = viewportHeight - keyboardInset - reservedBottomHeight;
  if (visibleViewportHeight <= 0) return null;
  const targetOffset = inputTop + inputHeight + margin - visibleViewportHeight;
  if (targetOffset <= currentOffset + 1) return null;
  return Math.max(0, targetOffset);
}
