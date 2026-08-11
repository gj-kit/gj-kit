import { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';
import type { ColorScheme } from '@gj-kit/expo-ui';

const STORAGE_KEY = 'gj-kit-docs-color-scheme';

/**
 * 정적 HTML은 항상 light로 프리렌더된다. 하이드레이션 전에 상태를 바꾸면 트리가
 * 어긋나므로, 저장된 선택은 첫 effect에서만 반영한다.
 */
const STATIC_RENDER_SCHEME: ColorScheme = 'light';

function readStoredScheme(): ColorScheme | null {
  if (Platform.OS !== 'web') return null;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored === 'dark' || stored === 'light' ? stored : null;
  } catch {
    // Safari 프라이빗 모드 등 localStorage 접근이 막힌 환경.
    return null;
  }
}

function systemScheme(): ColorScheme {
  if (Platform.OS !== 'web' || typeof window.matchMedia !== 'function') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/**
 * 문서 사이트 전체가 공유하는 색상 스킴. 랜딩·문서 허브·컴포넌트 문서가 각각
 * 자기 상태를 들고 있으면 페이지를 옮길 때마다 테마가 라이트로 되돌아간다.
 *
 * 우선순위: 사용자가 명시적으로 고른 값 > OS 설정 > light.
 */
export function useSiteColorScheme(): {
  readonly colorScheme: ColorScheme;
  readonly setColorScheme: (next: ColorScheme) => void;
  readonly toggleColorScheme: () => void;
} {
  const [colorScheme, setSchemeState] = useState<ColorScheme>(STATIC_RENDER_SCHEME);

  useEffect(() => {
    setSchemeState(readStoredScheme() ?? systemScheme());
  }, []);

  // 명시적 선택이 없을 때만 OS 설정 변화를 따라간다.
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window.matchMedia !== 'function') return;
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (event: MediaQueryListEvent) => {
      if (readStoredScheme() !== null) return;
      setSchemeState(event.matches ? 'dark' : 'light');
    };
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  const setColorScheme = useCallback((next: ColorScheme) => {
    setSchemeState(next);
    if (Platform.OS !== 'web') return;
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // 저장이 막혀도 이번 세션 동안은 동작해야 한다.
    }
  }, []);

  const toggleColorScheme = useCallback(() => {
    setColorScheme(colorScheme === 'light' ? 'dark' : 'light');
  }, [colorScheme, setColorScheme]);

  return { colorScheme, setColorScheme, toggleColorScheme };
}

/**
 * react-native-web은 #root 안쪽만 칠한다. 문서가 짧아 뷰포트를 못 채우거나
 * 오버스크롤할 때 라이트 배경이 그대로 드러나므로 body와 theme-color도 맞춘다.
 */
export function useDocumentChrome(background: string): void {
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    document.body.style.backgroundColor = background;
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', background);
  }, [background]);
}
