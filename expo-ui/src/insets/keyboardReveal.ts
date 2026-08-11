/**
 * The pure keyboard-reveal offset function — design doc §7. Name preserved from
 * memorylog2.
 *
 * It measures against the input's bottom edge, so a multiline input that grows
 * keeps its last line above the keyboard (and above a fixed bar lifted over it).
 * Returns null when the input is already sufficiently visible — it never pulls the
 * view back up, since scrolling should only ever reveal.
 */

/** The former KEYBOARD_REVEAL_MARGIN(16) constant, turned into an option (§7). */
const DEFAULT_REVEAL_MARGIN = 16;

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
