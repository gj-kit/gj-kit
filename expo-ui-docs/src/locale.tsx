import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { Platform } from 'react-native';

export type Locale = 'en' | 'ko';

const STORAGE_KEY = 'gj-kit-docs-locale';

/**
 * 정적 HTML은 영어로 프리렌더된다. npm에서 들어오는 유입이 영어권이고 검색
 * 색인도 영어 본문을 봐야 하므로 기본값은 en이다. 한국어는 토글로 전환한다.
 */
export const DEFAULT_LOCALE: Locale = 'en';

const LocaleContext = createContext<{
  readonly locale: Locale;
  readonly setLocale: (next: Locale) => void;
  readonly toggleLocale: () => void;
}>({
  locale: DEFAULT_LOCALE,
  setLocale: () => {},
  toggleLocale: () => {},
});

function readStoredLocale(): Locale | null {
  if (Platform.OS !== 'web') return null;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored === 'en' || stored === 'ko' ? stored : null;
  } catch {
    return null;
  }
}

function browserLocale(): Locale {
  if (Platform.OS !== 'web') return DEFAULT_LOCALE;
  return navigator.language?.toLowerCase().startsWith('ko') ? 'ko' : 'en';
}

export function LocaleProvider({ children }: { readonly children: ReactNode }): ReactElement {
  const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE);

  // 하이드레이션 전에 바꾸면 트리가 어긋나므로 첫 effect에서만 반영한다.
  useEffect(() => {
    setLocaleState(readStoredLocale() ?? browserLocale());
  }, []);

  // <html lang>이 실제 본문 언어와 맞아야 스크린리더 발음과 검색 색인이 맞는다.
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    document.documentElement.setAttribute('lang', locale);
  }, [locale]);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    if (Platform.OS !== 'web') return;
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // 저장이 막혀도 이번 세션 동안은 동작해야 한다.
    }
  }, []);

  const toggleLocale = useCallback(() => {
    setLocale(locale === 'en' ? 'ko' : 'en');
  }, [locale, setLocale]);

  return (
    <LocaleContext.Provider value={{ locale, setLocale, toggleLocale }}>
      {children}
    </LocaleContext.Provider>
  );
}

export function useLocale(): {
  readonly locale: Locale;
  readonly setLocale: (next: Locale) => void;
  readonly toggleLocale: () => void;
} {
  return useContext(LocaleContext);
}

/** `{ en, ko }` 쌍에서 현재 로케일 값을 고른다. */
export function useText<T>(pair: { readonly en: T; readonly ko: T }): T {
  const { locale } = useLocale();
  return pair[locale];
}
