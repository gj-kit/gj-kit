/**
 * UiProvider / 훅 / 비-React 스냅샷 — 설계 문서 §3.4, §3.5.
 *
 * 렌더는 react-native-web(jsdom). 테마·문구 해석은 플랫폼 무관 로직이므로
 * 여기서 확정한다. resetActiveThemeForTest는 내부 export(테스트 전용) —
 * 파일 간 전역 스냅샷 오염을 차단한다.
 */
import { cleanup, render, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import {
  UiProvider,
  createTheme,
  darkTheme,
  defaultThemes,
  enStrings,
  getActiveTheme,
  koStrings,
  lightTheme,
  subscribeActiveTheme,
  useResolvedColorScheme,
  useStrings,
  useTheme,
} from '../../src/index';
import type { Theme } from '../../src/index';
import { resetActiveThemeForTest } from '../../src/components/provider';

beforeEach(() => {
  resetActiveThemeForTest();
});

// vitest globals가 꺼져 있으면 RTL auto-cleanup이 등록되지 않는다 — 명시 등록.
afterEach(cleanup);

/** 훅 3종을 한 번에 캡처 — 테마·스킴 일관성을 같은 렌더에서 단언한다. */
function useProbe() {
  return {
    theme: useTheme(),
    strings: useStrings(),
    scheme: useResolvedColorScheme(),
  };
}

describe('§3.4 UiProvider와 훅', () => {
  it('Provider 없이 useTheme()는 lightTheme을 반환한다 (Provider는 선택)', () => {
    const { result } = renderHook(() => useProbe());
    expect(result.current.theme).toBe(lightTheme);
    expect(result.current.strings).toBe(enStrings);
    expect(result.current.scheme).toBe('light');
  });

  it('Theme 단일 주입은 고정 스킴 — colorScheme prop을 무시한다', () => {
    const { result } = renderHook(() => useProbe(), {
      wrapper: ({ children }: { children?: ReactNode | undefined }) => (
        // 다크 Theme 하나 + colorScheme='light' — Pair가 아니므로 전환 규칙 자체가 없다.
        <UiProvider theme={darkTheme} colorScheme="light">
          {children}
        </UiProvider>
      ),
    });
    expect(result.current.theme).toBe(darkTheme);
    expect(result.current.scheme).toBe('dark');
  });

  it("ThemePair + colorScheme='dark'는 다크 테마로 해석된다", () => {
    const { result } = renderHook(() => useProbe(), {
      wrapper: ({ children }: { children?: ReactNode | undefined }) => (
        <UiProvider theme={defaultThemes} colorScheme="dark">
          {children}
        </UiProvider>
      ),
    });
    expect(result.current.theme).toBe(defaultThemes.dark);
    expect(result.current.scheme).toBe('dark');
  });

  it("ThemePair + colorScheme='light'는 라이트 테마로 해석된다", () => {
    const { result } = renderHook(() => useProbe(), {
      wrapper: ({ children }: { children?: ReactNode | undefined }) => (
        <UiProvider theme={defaultThemes} colorScheme="light">
          {children}
        </UiProvider>
      ),
    });
    expect(result.current.theme).toBe(defaultThemes.light);
    expect(result.current.scheme).toBe('light');
  });

  it('strings 주입 시 useStrings가 그 번들을 그대로 반환한다', () => {
    const { result } = renderHook(() => useStrings(), {
      wrapper: ({ children }: { children?: ReactNode | undefined }) => (
        <UiProvider strings={koStrings}>{children}</UiProvider>
      ),
    });
    expect(result.current).toBe(koStrings);
  });

  it('strings 미주입 시 enStrings가 기본이다', () => {
    const { result } = renderHook(() => useStrings(), {
      wrapper: ({ children }: { children?: ReactNode | undefined }) => (
        <UiProvider>{children}</UiProvider>
      ),
    });
    expect(result.current).toBe(enStrings);
  });
});

describe('§3.5 비-React 스냅샷 — getActiveTheme / subscribeActiveTheme', () => {
  it('Provider 마운트 전에는 lightTheme을 반환한다', () => {
    expect(getActiveTheme()).toBe(lightTheme);
  });

  it('루트 Provider 마운트 후 스냅샷이 주입 테마로 갱신된다', () => {
    render(<UiProvider theme={darkTheme} />);
    // 스냅샷 기록은 effect에서 — testing-library render는 act로 감싸므로 즉시 관측 가능.
    expect(getActiveTheme()).toBe(darkTheme);
  });

  it('중첩 Provider는 스냅샷을 덮지 않는다 — 루트만 기록', () => {
    const rootTheme = createTheme('light', { colors: { primary: '#123456' } });
    let innerTheme: Theme | undefined;
    function CaptureInner(): null {
      innerTheme = useTheme();
      return null;
    }
    render(
      <UiProvider theme={rootTheme}>
        <UiProvider theme={darkTheme}>
          <CaptureInner />
        </UiProvider>
      </UiProvider>,
    );
    // React 컨텍스트는 중첩 값이 이기지만(스코프 오버라이드),
    expect(innerTheme).toBe(darkTheme);
    // 전역 스냅샷의 정의는 루트로 유일하다.
    expect(getActiveTheme()).toBe(rootTheme);
  });

  it('테마 교체 시 구독 리스너가 새 테마와 함께 호출된다', () => {
    const listener = vi.fn();
    subscribeActiveTheme(listener);

    const { rerender } = render(<UiProvider theme={darkTheme} />);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenLastCalledWith(darkTheme);

    rerender(<UiProvider theme={lightTheme} />);
    expect(listener).toHaveBeenCalledTimes(2);
    expect(listener).toHaveBeenLastCalledWith(lightTheme);
  });

  it('같은 테마 재렌더는 리스너를 다시 호출하지 않는다', () => {
    const listener = vi.fn();
    subscribeActiveTheme(listener);

    const { rerender } = render(<UiProvider theme={darkTheme} />);
    rerender(<UiProvider theme={darkTheme} />);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('해제 함수 호출 후에는 리스너가 호출되지 않는다', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeActiveTheme(listener);

    const { rerender } = render(<UiProvider theme={darkTheme} />);
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    rerender(<UiProvider theme={lightTheme} />);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
