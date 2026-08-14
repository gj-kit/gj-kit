/**
 * Reads the platform motion preference once and keeps it in sync with later changes.
 *
 * `null` means the platform has not answered yet (or cannot answer). Consumers must
 * treat that state conservatively and avoid starting non-essential motion.
 * This stays internal so every public component can keep its own visual contract.
 */
import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

export function useReducedMotion(): boolean | null {
  const [reduceMotion, setReduceMotion] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (active) setReduceMotion(enabled);
      })
      .catch(() => {
        // Keep the conservative `null` state when a platform cannot report a
        // trustworthy preference.
      });
    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setReduceMotion,
    );
    return () => {
      active = false;
      subscription?.remove?.();
    };
  }, []);

  return reduceMotion;
}
