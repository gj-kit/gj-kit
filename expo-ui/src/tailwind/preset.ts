/**
 * NativeWind/Tailwind preset — 설계 문서 §8.
 *
 * 이 폴더는 src/theme만 import한다(entry-guard 강제) — tailwind.config는 Node에서
 * 평가되므로 react-native 심볼이 섞이면 로드 자체가 실패한다.
 *
 * 브랜드 Theme 입력 강제(§0 C) — 손조립 토큰으로 preset을 만들 수 없다.
 * 앱 커스텀 테마(createTheme 결과)가 그대로 유틸리티 클래스에 반영되므로
 * 전신의 정적 tokens.json 파생 preset이 가진 "이중 진실" 문제가 사라진다.
 *
 * 다크 preset은 방출하지 않는다 — 런타임 테마 전환은 useTheme()이 정본이고,
 * className 경로의 다크는 NativeWind `dark:` 스킴 소관(§8, v2 검토 과제).
 */
import { lightTheme } from '../theme/createTheme';
import type { Theme } from '../theme/tokens';

export interface TailwindPresetOptions {
  /** 클래스 접두사. 기본 'ui' → bg-ui-surface, p-ui-lg, rounded-ui-pill, text-ui-title … */
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

/** zero-config: 내장 라이트 테마 preset. */
export const defaultTailwindPreset: TailwindPreset = createTailwindPreset();

/** (내부) #RGB/#RRGGBB에 불투명도를 얹은 rgba 문자열. 비-hex 입력은 그대로 반환. */
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
