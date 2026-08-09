/**
 * 테마 생성 — 설계 문서 §3.3.
 *
 * Theme/ThemePair 브랜드 부여의 유일한 경로. 부분 오버라이드(2단) → 깊은 병합 →
 * 깊은 동결 → 브랜드 각인. 동결로 정체성이 안정되므로 컴포넌트의
 * WeakMap 스타일 캐시(§3.5)가 성립한다.
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

/** (내부) 2단 병합 — 그룹 내 키만 덮고, undefined 값은 건너뛴다(EOP 대응). */
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
 * 부분 오버라이드로 새 Theme 생성. base의 모든 키가 채워진 완전한 테마가 보장된다.
 *
 * Theme 하나를 base로 주면 그 테마 위에 오버라이드를 얹는다(파생 테마).
 */
export function createTheme(base: ColorScheme | Theme, overrides?: ThemeOverrides): Theme {
  const scheme = typeof base === 'string' ? base : base.scheme;
  const tokens = typeof base === 'string' ? baseTokens(base) : base;
  // 브랜드 각인 — 병합·동결을 마친 값이 Theme이 되는 유일한 경로.
  return stamp<Theme>(deepFreeze({ ...mergeTokens(tokens, overrides), scheme }));
}

/**
 * "브랜드 컬러를 양 모드에 한 번에" — shared → 스킴별 순으로 병합한 쌍 생성.
 * 라이트만 오버라이드해도 다크는 기본 다크 팔레트를 유지한다(자동 유도하지 않는다 — 명시적 원칙).
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

/** 내장 라이트 테마 — 값은 전신 tokens.json 계승(§3.6). */
export const lightTheme: Theme = createTheme('light');

/** 내장 다크 테마 — §3.6 제안 팔레트. */
export const darkTheme: Theme = createTheme('dark');

/** createThemes() 무인자 결과 — 내장 쌍. */
export const defaultThemes: ThemePair = createThemes();

/** (내부) Theme/ThemePair 판별 — Provider가 사용. */
export function isThemePair(value: Theme | ThemePair): value is ThemePair {
  return 'light' in value && 'dark' in value;
}
