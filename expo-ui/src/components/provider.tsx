/**
 * UiProvider / 테마·문구·아이콘 컨텍스트 — 설계 문서 §3.4, §3.5.
 */
import { createContext, useContext, useLayoutEffect, useMemo } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import { isThemePair, lightTheme } from '../theme/createTheme';
import type { ColorScheme, Theme, ThemePair } from '../theme/tokens';
import { enStrings } from '../strings/strings';
import type { UiStrings } from '../strings/strings';
import type { UiIcons } from './icons';
import { OverlayProvider, useOptionalOverlayStack } from './overlay/provider';

const ThemeContext = createContext<Theme>(lightTheme);
const StringsContext = createContext<UiStrings>(enStrings);
const IconsContext = createContext<UiIcons>({});
/** (내부) 중첩 Provider 판별 — 루트만 전역 스냅샷을 기록한다(§3.5). */
const NestedContext = createContext<boolean>(false);

// ─── 비-React 스냅샷 (§3.5) ────────────────────────────────────────────────
let activeTheme: Theme = lightTheme;
const themeListeners = new Set<(theme: Theme) => void>();

function publishActiveTheme(theme: Theme): void {
  if (theme === activeTheme) return;
  activeTheme = theme;
  for (const listener of themeListeners) listener(theme);
}

/**
 * 루트 UiProvider가 현재 흘리는 테마 스냅샷. Provider 이전/부재 시 lightTheme.
 * 리렌더 비유발 — expo-router 정적 옵션, 내비게이션 테마 등 비-React 경로 전용.
 * 중첩 Provider는 스냅샷을 쓰지 않으므로 다중 Provider 앱에서도 정의가 유일하다.
 */
export function getActiveTheme(): Theme {
  return activeTheme;
}

/** 루트 테마 교체 구독(내비게이션 테마 동기화 용). 반환값은 해제 함수. */
export function subscribeActiveTheme(listener: (theme: Theme) => void): () => void {
  themeListeners.add(listener);
  return () => {
    themeListeners.delete(listener);
  };
}

// ─── Provider ──────────────────────────────────────────────────────────────

export interface UiProviderProps {
  /**
   * Theme 하나 = 고정 스킴(전환 없음 — 명시적 결정). ThemePair = colorScheme
   * 규칙으로 전환. 손조립 토큰 객체는 브랜드 미보유로 컴파일 에러(§6 ①).
   * 미지정 시: 중첩 Provider는 부모의 해석된 Theme을 상속(부모가 Pair였어도
   * 해석 결과 하나만 — colorScheme으로 재해석 불가), 루트는 lightTheme.
   */
  theme?: Theme | ThemePair | undefined;
  /**
   * theme이 ThemePair일 때만 의미. 'system'(기본): RN Appearance 추종.
   * 'light'/'dark': 앱 제어(설정 토글 등 — 영속화는 앱 소유).
   */
  colorScheme?: ColorScheme | 'system' | undefined;
  /** 완전한 UiStrings만 — §4.1. 미지정 시 중첩은 부모 상속, 루트는 enStrings. */
  strings?: UiStrings | undefined;
  /** 아이콘 기본값 계층 — §4.2. 미지정 시 중첩은 부모 상속, 미지정 슬롯은 내장 폴백. */
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
  const resolved: Theme = isThemePair(themeInput)
    ? themeInput[
        colorScheme === 'system' ? (systemScheme === 'dark' ? 'dark' : 'light') : colorScheme
      ]
    : themeInput;

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

/** 활성 스킴으로 해석된 Theme. Provider 없으면 lightTheme (Provider는 선택 — 전신과 동일). */
export function useTheme(): Theme {
  return useContext(ThemeContext);
}

export function useStrings(): UiStrings {
  return useContext(StringsContext);
}

/** (내부) 컴포넌트 전용 — 공개 표면 아님. */
export function useIcons(): UiIcons {
  return useContext(IconsContext);
}

/** 해석된 현재 스킴 — 'system'이면 OS 값 반영 결과(§3.4). */
export function useResolvedColorScheme(): ColorScheme {
  return useTheme().scheme;
}

/** (내부) 테스트 전용 — 스냅샷 초기화. 공개 표면 아님. */
export function resetActiveThemeForTest(): void {
  activeTheme = lightTheme;
  themeListeners.clear();
}
