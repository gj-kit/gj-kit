/**
 * UiProvider / 테마·문구·아이콘 컨텍스트 — 설계 문서 §3.4, §3.5.
 */
import { createContext, useContext, useEffect, useMemo } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import { isThemePair, lightTheme } from '../theme/createTheme';
import type { ColorScheme, Theme, ThemePair } from '../theme/tokens';
import { enStrings } from '../strings/strings';
import type { UiStrings } from '../strings/strings';
import type { UiIcons } from './icons';

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
   * 규칙으로 전환. 기본 lightTheme. 손조립 토큰 객체는 브랜드 미보유로
   * 컴파일 에러(§6 ①).
   */
  theme?: Theme | ThemePair | undefined;
  /**
   * ThemePair일 때만 의미. 'system'(기본): RN Appearance 추종.
   * 'light'/'dark': 앱 제어(설정 토글 등 — 영속화는 앱 소유).
   */
  colorScheme?: ColorScheme | 'system' | undefined;
  /** 기본 enStrings. 완전한 UiStrings만 — §4.1. */
  strings?: UiStrings | undefined;
  /** 아이콘 기본값 계층 — §4.2. 미지정 슬롯은 내장 폴백. */
  icons?: UiIcons | undefined;
  children?: ReactNode | undefined;
}

export function UiProvider({
  theme = lightTheme,
  colorScheme = 'system',
  strings = enStrings,
  icons,
  children,
}: UiProviderProps): ReactElement {
  const nested = useContext(NestedContext);
  const systemScheme = useColorScheme();

  const resolved: Theme = isThemePair(theme)
    ? theme[
        colorScheme === 'system' ? (systemScheme === 'dark' ? 'dark' : 'light') : colorScheme
      ]
    : theme;

  // 스냅샷 기록은 렌더가 아니라 effect에서 — 렌더 부수효과 금지. 루트만 기록(§3.5).
  useEffect(() => {
    if (!nested) publishActiveTheme(resolved);
  }, [nested, resolved]);

  const iconsValue = useMemo(() => icons ?? {}, [icons]);

  return (
    <NestedContext.Provider value={true}>
      <ThemeContext.Provider value={resolved}>
        <StringsContext.Provider value={strings}>
          <IconsContext.Provider value={iconsValue}>{children}</IconsContext.Provider>
        </StringsContext.Provider>
      </ThemeContext.Provider>
    </NestedContext.Provider>
  );
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
