/**
 * (internal) Shared component helpers — no entry re-exports them.
 */
import { Platform, StyleSheet } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import type { SpacingKey, Theme, ElevationLevel } from '../theme/tokens';

/**
 * The tail shared by every component — design doc §5.
 * `unstyled?: never` blocks the predecessor's migration-leftover prop as a compile
 * error, whether specified directly or routed through a `{...props}` spread (§0 C,
 * adopted). The "absent prop" approach was measured letting the spread through.
 */
export type CommonProps = {
  style?: StyleProp<ViewStyle> | undefined;
  /** Passed to the native element without interpretation — NativeWind is a host concern (§5). */
  className?: string | undefined;
  testID?: string | undefined;
  unstyled?: never;
};

export function mergeClassNames(...values: Array<string | undefined>): string {
  return values.filter(Boolean).join(' ');
}

/**
 * The bridge that forwards className as an off-type prop. It only means anything
 * once a NativeWind host opts in — this unifies a helper the predecessor
 * triplicated in every file (§0).
 */
export function nativeWindProps(className?: string | undefined): Record<string, unknown> {
  return className ? ({ className } as unknown as Record<string, unknown>) : {};
}

/**
 * The theme-parameterized style factory — design doc §3.5.
 * A Theme is deeply frozen, so its identity is stable and a WeakMap cache works.
 * This achieves token flow-through without rebuilding style objects on every render.
 */
export function themedStyles<T extends StyleSheet.NamedStyles<T>>(
  factory: (theme: Theme) => T,
): (theme: Theme) => T {
  const cache = new WeakMap<Theme, T>();
  return (theme) => {
    const cached = cache.get(theme);
    if (cached) return cached;
    const created = StyleSheet.create(factory(theme));
    cache.set(theme, created);
    return created;
  };
}

/** Resolves a spacing prop — token keys are first class, numbers are the escape hatch for Figma measurements (§5.8). */
export function resolveSpacing(theme: Theme, value: SpacingKey | number): number {
  return typeof value === 'number' ? value : theme.spacing[value];
}

/** (internal) rgba with opacity layered onto #RGB/#RRGGBB. Non-hex input is returned unchanged. */
function rgbaFromHex(color: string, opacity: number): string {
  const match = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.exec(color);
  if (!match || match[1] === undefined) return color;
  const hex =
    match[1].length === 3
      ? match[1]
          .split('')
          .map((c) => c + c)
          .join('')
      : match[1];
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

/**
 * ElevationLevel to shadow style. Shadow color comes only from colors.shadow (§3.2).
 * The web emits boxShadow — RNW 0.21 deprecated the shadow* props (measured in tests).
 * boxShadow is absent from the RN types, so a cast gets it through (§11: no DOM lib,
 * casts only).
 */
export function elevationStyle(level: ElevationLevel, shadowColor: string): ViewStyle {
  if (Platform.OS === 'web') {
    return {
      boxShadow:
        level.shadowOpacity === 0
          ? 'none'
          : `0 ${level.shadowOffsetY}px ${level.shadowRadius}px ${rgbaFromHex(shadowColor, level.shadowOpacity)}`,
    } as unknown as ViewStyle;
  }
  return {
    shadowColor,
    shadowOpacity: level.shadowOpacity,
    shadowRadius: level.shadowRadius,
    shadowOffset: { width: 0, height: level.shadowOffsetY },
    elevation: level.elevation,
  };
}
