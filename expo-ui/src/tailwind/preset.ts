/**
 * NativeWind/Tailwind preset — design doc §8.
 *
 * This folder imports only src/theme (enforced by entry-guard). tailwind.config is
 * evaluated by Node, so a stray react-native symbol makes loading itself fail.
 *
 * A branded Theme input is required (§0 C) — a preset cannot be built from
 * hand-assembled tokens. An app's custom theme (the result of createTheme) flows
 * straight into the utility classes, which removes the "two sources of truth"
 * problem of the predecessor's static tokens.json-derived preset.
 *
 * No dark preset is emitted — useTheme() is the source of truth for runtime scheme
 * switching, and dark on the className path belongs to NativeWind's `dark:` scheme
 * (§8, revisit in v2).
 */
import { lightTheme } from '../theme/createTheme';
import type { Theme } from '../theme/tokens';

export interface TailwindPresetOptions {
  /** The class prefix. Defaults to 'ui' → bg-ui-surface, p-ui-lg, rounded-ui-pill, text-ui-title … */
  readonly prefix?: string | undefined;
}

export interface TailwindPreset {
  theme: { extend: Record<string, unknown> };
}

export function createTailwindPreset(
  theme: Theme = lightTheme,
  options?: TailwindPresetOptions,
): TailwindPreset {
  const prefix = options?.prefix ?? 'ui';
  const key = (name: string) => `${prefix}-${name}`;

  const colors: Record<string, string> = {};
  for (const [name, value] of Object.entries(theme.colors)) {
    colors[name] = value;
  }

  const spacing: Record<string, string> = {};
  for (const [name, value] of Object.entries(theme.spacing)) {
    spacing[key(name)] = `${value}px`;
  }

  const borderRadius: Record<string, string> = {};
  for (const [name, value] of Object.entries(theme.radius)) {
    borderRadius[key(name)] = `${value}px`;
  }

  // fontSize는 [size, { lineHeight, fontWeight }] 튜플 방출 —
  // text-ui-title 하나가 서체 3속성을 다 나른다(§8).
  const fontSize: Record<string, [string, { lineHeight: string; fontWeight: string }]> = {};
  const roles = ['caption', 'label', 'button', 'body', 'title', 'heading'] as const;
  for (const role of roles) {
    const spec = theme.typography[role];
    fontSize[key(role)] = [
      `${spec.fontSize}px`,
      { lineHeight: `${spec.lineHeight}px`, fontWeight: spec.fontWeight },
    ];
  }

  // boxShadow는 elevation + colors.shadow에서 파생(§8).
  const boxShadow: Record<string, string> = {};
  for (const [name, level] of Object.entries(theme.elevation)) {
    boxShadow[key(name)] =
      level.shadowOpacity === 0
        ? 'none'
        : `0 ${level.shadowOffsetY}px ${level.shadowRadius}px ${hexOpacity(theme.colors.shadow, level.shadowOpacity)}`;
  }

  return {
    theme: {
      extend: {
        colors: { [prefix]: colors },
        spacing,
        borderRadius,
        fontSize,
        boxShadow,
        screens: {
          tablet: `${theme.breakpoints.tablet}px`,
          desktop: `${theme.breakpoints.desktop}px`,
        },
      },
    },
  };
}

/** zero-config: the built-in light theme preset. */
export const defaultTailwindPreset: TailwindPreset = createTailwindPreset();

/** (internal) An rgba string that layers opacity onto #RGB/#RRGGBB. Non-hex input is returned unchanged. */
function hexOpacity(color: string, opacity: number): string {
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
