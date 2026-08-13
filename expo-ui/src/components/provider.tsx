/**
 * UiProvider and the theme, strings, and icon context — design doc §3.4, §3.5.
 */
import { createContext, useContext, useLayoutEffect, useMemo } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import { lightTheme, resolveTheme } from '../theme/createTheme';
import type { ColorScheme, Theme, ThemePair } from '../theme/tokens';
import { enStrings } from '../strings/strings';
import type { UiStrings } from '../strings/strings';
import type { UiIcons } from './icons';
import { OverlayProvider, useOptionalOverlayStack } from './overlay/provider';

const ThemeContext = createContext<Theme>(lightTheme);
const StringsContext = createContext<UiStrings>(enStrings);
const IconsContext = createContext<UiIcons>({});
/** (internal) Detects a nested Provider — only the root writes the global snapshot (§3.5). */
const NestedContext = createContext<boolean>(false);

// ─── Deprecated client-only snapshot (§3.5) ────────────────────────────────
let activeTheme: Theme = lightTheme;
const themeListeners = new Set<(theme: Theme) => void>();

function publishActiveTheme(theme: Theme): void {
  if (theme === activeTheme) return;
  activeTheme = theme;
  for (const listener of themeListeners) listener(theme);
}

/**
 * A snapshot of the theme the root UiProvider is currently emitting; lightTheme
 * before or without a Provider. It triggers no re-render. Nested Providers do
 * not write the snapshot, so its definition stays unique in a native client app.
 *
 * @deprecated This is a client-only mutable module snapshot. It is neither
 * request-scoped nor updated during SSR rendering. For SSR or static
 * configuration, use `resolveTheme(theme, colorScheme)` with request-owned
 * inputs instead.
 */
export function getActiveTheme(): Theme {
  return activeTheme;
}

/**
 * Subscribes to root theme replacements. Returns an unsubscribe function.
 *
 * @deprecated This client-only subscription observes a module-global snapshot.
 * It must not be used for SSR. Use `resolveTheme(theme, colorScheme)` for
 * request-scoped or static configuration instead.
 */
export function subscribeActiveTheme(listener: (theme: Theme) => void): () => void {
  themeListeners.add(listener);
  return () => {
    themeListeners.delete(listener);
  };
}

// ─── Provider ──────────────────────────────────────────────────────────────

export interface UiProviderProps {
  /**
   * A single Theme means a fixed scheme with no switching — an explicit decision.
   * A ThemePair switches by the colorScheme rule. Hand-assembled token objects
   * carry no brand and fail to compile (§6 ①). When omitted, a nested Provider
   * inherits the parent's resolved Theme (only the resolved one, even if the
   * parent held a Pair — colorScheme cannot re-resolve it) and the root uses
   * lightTheme.
   */
  theme?: Theme | ThemePair | undefined;
  /**
   * Only meaningful when theme is a ThemePair. 'system' (default) follows RN
   * Appearance. 'light' and 'dark' are app-controlled, e.g. a settings toggle —
   * persistence stays with the app.
   */
  colorScheme?: ColorScheme | 'system' | undefined;
  /** A complete UiStrings only — §4.1. When omitted, a nested Provider inherits from its parent and the root uses enStrings. */
  strings?: UiStrings | undefined;
  /** The icon default layer — §4.2. When omitted, a nested Provider inherits from its parent and an unspecified slot uses the built-in fallback. */
  icons?: UiIcons | undefined;
  children?: ReactNode | undefined;
}

export function UiProvider({
  theme,
  colorScheme = 'system',
  strings,
  icons,
  children,
}: UiProviderProps): ReactElement {
  const nested = useContext(NestedContext);
  const inheritedOverlayStack = useOptionalOverlayStack();
  // 중첩 Provider는 미지정 prop을 부모 값으로 상속한다(적대적 리뷰 확정 발견 —
  // 리셋 시 서브트리의 문구·아이콘·브랜드 테마가 라이브러리 기본값으로 소실).
  // 컨텍스트 기본값이 곧 라이브러리 기본(lightTheme/enStrings/{})이므로
  // 루트(부모 부재) 동작은 동일하다.
  const parentTheme = useContext(ThemeContext);
  const parentStrings = useContext(StringsContext);
  const parentIcons = useContext(IconsContext);
  const systemScheme = useColorScheme();

  // 부모에서 상속되는 값은 이미 해석된 단일 Theme이다 — theme 미지정 + colorScheme만
  // 지정하는 중첩은 스킴을 바꾸지 못한다(Pair 원본은 상속되지 않음 — TSDoc 명시).
  const themeInput: Theme | ThemePair = theme ?? parentTheme;
  const resolvedColorScheme: ColorScheme =
    colorScheme === 'system' ? (systemScheme === 'dark' ? 'dark' : 'light') : colorScheme;
  const resolved = resolveTheme(themeInput, resolvedColorScheme);

  // 스냅샷 기록은 렌더가 아니라 이펙트에서(렌더 부수효과 금지) — 단 passive
  // effect는 자식→부모 순이라 자식 mount 이펙트가 stale을 읽는 창이 생기므로
  // layout effect로 발행한다: 페인트·모든 passive effect보다 먼저 flush되어
  // §3.5의 주 용도(마운트 이펙트의 내비게이션 테마 읽기)가 올바른 값을 본다.
  // 루트만 기록(§3.5).
  useLayoutEffect(() => {
    if (!nested) publishActiveTheme(resolved);
  }, [nested, resolved]);

  const iconsValue = useMemo(() => icons ?? parentIcons, [icons, parentIcons]);

  const content = (
    <NestedContext.Provider value={true}>
      <ThemeContext.Provider value={resolved}>
        <StringsContext.Provider value={strings ?? parentStrings}>
          <IconsContext.Provider value={iconsValue}>{children}</IconsContext.Provider>
        </StringsContext.Provider>
      </ThemeContext.Provider>
    </NestedContext.Provider>
  );

  // 루트 UiProvider는 product overlays가 공유할 dismiss/layer scope도 함께 제공한다.
  // 중첩 UiProvider는 테마만 바꾸며 바깥 overlay stack을 분리하지 않는다.
  return nested || inheritedOverlayStack !== null
    ? content
    : <OverlayProvider>{content}</OverlayProvider>;
}

/** The Theme resolved for the active scheme. lightTheme without a Provider (the Provider is optional — same as the predecessor). */
export function useTheme(): Theme {
  return useContext(ThemeContext);
}

export function useStrings(): UiStrings {
  return useContext(StringsContext);
}

/** (internal) Components only — not part of the public surface. */
export function useIcons(): UiIcons {
  return useContext(IconsContext);
}

/** The resolved current scheme — with 'system', the result of applying the OS value (§3.4). */
export function useResolvedColorScheme(): ColorScheme {
  return useTheme().scheme;
}

/** (internal) Tests only — resets the snapshot. Not part of the public surface. */
export function resetActiveThemeForTest(): void {
  activeTheme = lightTheme;
  themeListeners.clear();
}
