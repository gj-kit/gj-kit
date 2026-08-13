/**
 * Theme creation — design doc §3.3.
 *
 * The only path that imprints the Theme/ThemePair brand. Two-level partial
 * overrides, then a deep merge, then a deep freeze, then the brand imprint.
 * Freezing keeps identity stable, which is what makes the components' WeakMap
 * style cache (§3.5) work.
 */
import { stamp } from './brand';
import {
  baseBreakpoints,
  baseElevation,
  baseMetrics,
  baseRadius,
  baseSpacing,
  baseTypography,
  darkColors,
  lightColors,
} from './palettes';
import type { ColorScheme, Theme, ThemeOverrides, ThemePair, ThemeTokens } from './tokens';

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    for (const key of Object.keys(value as Record<string, unknown>)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
    Object.freeze(value);
  }
  return value;
}

function baseTokens(scheme: ColorScheme): ThemeTokens {
  return {
    colors: scheme === 'dark' ? darkColors : lightColors,
    spacing: baseSpacing,
    radius: baseRadius,
    typography: baseTypography,
    elevation: baseElevation,
    metrics: baseMetrics,
    breakpoints: baseBreakpoints,
  };
}

/** (internal) The two-level merge — overwrites keys within a group and skips undefined values (for EOP). */
function mergeTokens(base: ThemeTokens, overrides?: ThemeOverrides): ThemeTokens {
  if (!overrides) return base;
  const next: Record<string, unknown> = { ...base };
  for (const [group, patch] of Object.entries(overrides)) {
    if (patch === undefined) continue;
    const merged: Record<string, unknown> = {
      ...(base as unknown as Record<string, Record<string, unknown>>)[group],
    };
    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined) continue;
      merged[key] = value;
    }
    next[group] = merged;
  }
  return next as unknown as ThemeTokens;
}

/**
 * Creates a new Theme from partial overrides. Every key of base is guaranteed to
 * be filled, so the result is a complete theme.
 *
 * Passing a single Theme as base layers the overrides on top of that theme,
 * producing a derived theme.
 */
export function createTheme(base: ColorScheme | Theme, overrides?: ThemeOverrides): Theme {
  const scheme = typeof base === 'string' ? base : base.scheme;
  const tokens = typeof base === 'string' ? baseTokens(base) : base;
  // 브랜드 각인 — 병합·동결을 마친 값이 Theme이 되는 유일한 경로.
  return stamp<Theme>(deepFreeze({ ...mergeTokens(tokens, overrides), scheme }));
}

/**
 * "Brand colors for both schemes at once" — builds a pair by merging shared
 * overrides first, then per-scheme ones. Overriding only light leaves dark on the
 * default dark palette; nothing is derived automatically, by explicit principle.
 */
export function createThemes(input?: {
  readonly shared?: ThemeOverrides | undefined;
  readonly light?: ThemeOverrides | undefined;
  readonly dark?: ThemeOverrides | undefined;
}): ThemePair {
  const light = createTheme(createTheme('light', input?.shared), input?.light);
  const dark = createTheme(createTheme('dark', input?.shared), input?.dark);
  return stamp<ThemePair>(deepFreeze({ light, dark }));
}

/** The built-in light theme — values inherited from the predecessor's tokens.json (§3.6). */
export const lightTheme: Theme = createTheme('light');

/** The built-in dark theme — the palette proposed in §3.6. */
export const darkTheme: Theme = createTheme('dark');

/** The result of calling createThemes() with no arguments — the built-in pair. */
export const defaultThemes: ThemePair = createThemes();

/** (internal) Discriminates Theme from ThemePair — used by the Provider. */
export function isThemePair(value: Theme | ThemePair): value is ThemePair {
  return 'light' in value && 'dark' in value;
}

/**
 * Resolves a ThemePair to a concrete Theme without reading React, platform, or
 * module-global state. Use this in SSR and static configuration paths, where a
 * request-owned `colorScheme` is already known. A single Theme is returned
 * unchanged regardless of the requested scheme.
 */
export function resolveTheme(theme: Theme | ThemePair, colorScheme: ColorScheme): Theme {
  return isThemePair(theme) ? theme[colorScheme] : theme;
}
