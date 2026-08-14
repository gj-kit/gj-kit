/**
 * React Native adapter for bottom safe-area arithmetic — design doc §7.
 *
 * A bottom-anchored surface follows one rule: design padding plus the real bottom
 * inset. Android reports an inset matching how far the window actually extends
 * (~24dp for gesture navigation, ~48dp for edge-to-edge three-button, 0 when the
 * window stops above the navigation bar) — no synthetic minimum is added. The old
 * 48dp fallback over-padded gesture devices and led to per-screen opt-outs that
 * dropped the inset entirely (a rule confirmed by measurement in memorylog2).
 */
import { Platform } from 'react-native';
import {
  nativeBottomInset as computeNativeBottomInset,
  nativeBottomPadding as computeNativeBottomPadding,
} from './pure';

/**
 * Resolves the real bottom inset using the current React Native platform.
 * Import `./insets/pure` when no React Native dependency is acceptable.
 */
export function nativeBottomInset(bottomInset: number, platformOS: string = Platform.OS): number {
  return computeNativeBottomInset(bottomInset, platformOS);
}

/** Adds design padding to the real bottom inset using the current platform by default. */
export function nativeBottomPadding(
  basePadding: number,
  bottomInset: number,
  platformOS: string = Platform.OS,
): number {
  return computeNativeBottomPadding(basePadding, bottomInset, platformOS);
}
