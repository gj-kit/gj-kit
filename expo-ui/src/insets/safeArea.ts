/**
 * The pure bottom safe-area function — design doc §7. Name preserved from
 * memorylog2 (a sed-level port).
 *
 * A bottom-anchored surface follows one rule: design padding plus the real bottom
 * inset. Android reports an inset matching how far the window actually extends
 * (~24dp for gesture navigation, ~48dp for edge-to-edge three-button, 0 when the
 * window stops above the navigation bar) — no synthetic minimum is added. The old
 * 48dp fallback over-padded gesture devices and led to per-screen opt-outs that
 * dropped the inset entirely (a rule confirmed by measurement in memorylog2).
 */
import { Platform } from 'react-native';

export function nativeBottomInset(bottomInset: number, platformOS: string = Platform.OS): number {
  if (platformOS === 'web') return 0;
  return Math.max(0, bottomInset);
}

export function nativeBottomPadding(
  basePadding: number,
  bottomInset: number,
  platformOS: string = Platform.OS,
): number {
  return basePadding + nativeBottomInset(bottomInset, platformOS);
}
