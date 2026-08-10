/**
 * feedback 계층 unit 테스트 — 설계 문서 §5.9(Skeleton) / §5.10(EmptyState·ErrorState) /
 * §5.11(Toast·useToastController).
 *
 * 렌더 파이프라인: vitest + jsdom + react-native → react-native-web alias(§9).
 * 색 검증은 jsdom이 인라인 스타일을 `rgb(r, g, b)`로 정규화한 값과 대조한다.
 */
import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { View } from 'react-native';
import {
  EmptyState,
  ErrorState,
  Skeleton,
  Toast,
  UiProvider,
  enStrings,
  koStrings,
  lightTheme,
  useToastController,
} from '../../src/index';
import type { IconRenderProps } from '../../src/index';

// vitest globals 미사용 환경 — RTL 자동 cleanup이 등록되지 않으므로 명시 등록.
afterEach(cleanup);

/** #RRGGBB → jsdom 인라인 스타일 정규화 형태(rgb(r, g, b)). */
function hexToRgb(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgb(${r}, ${g}, ${b})`;
}

// ─── §5.9 Skeleton ─────────────────────────────────────────────────────────

describe('§5.9 Skeleton', () => {
  it('accessibilityLabel 기본은 strings.loading — 기본 Provider는 영어', () => {
    render(
      <UiProvider>
        <Skeleton testID="sk" />
      </UiProvider>,
    );
    expect(screen.getByTestId('sk').getAttribute('aria-label')).toBe(enStrings.loading);
  });

  it('koStrings 주입 시 로딩 라벨이 한국어다', () => {
    render(
      <UiProvider strings={koStrings}>
        <Skeleton testID="sk" />
      </UiProvider>,
    );
    expect(screen.getByTestId('sk').getAttribute('aria-label')).toBe('로딩 중');
  });

  it('accessibilityLabel prop이 Provider 문구보다 우선한다', () => {
    render(
      <UiProvider strings={koStrings}>
        <Skeleton testID="sk" accessibilityLabel="사진 로딩" />
      </UiProvider>,
    );
    expect(screen.getByTestId('sk').getAttribute('aria-label')).toBe('사진 로딩');
  });
});

// ─── §5.10 EmptyState ──────────────────────────────────────────────────────

describe('§5.10 EmptyState', () => {
  it('기본 title은 strings.emptyTitle — 기본 Provider는 영어', () => {
    render(
      <UiProvider>
        <EmptyState />
      </UiProvider>,
    );
    expect(screen.getByText(enStrings.emptyTitle)).toBeTruthy();
  });

  it('koStrings 주입 시 기본 title이 한국어다', () => {
    render(
      <UiProvider strings={koStrings}>
        <EmptyState />
      </UiProvider>,
    );
    expect(screen.getByText('아직 항목이 없습니다')).toBeTruthy();
  });

  it('title prop이 Provider 문구보다 우선한다', () => {
    render(
      <UiProvider strings={koStrings}>
        <EmptyState title="앨범이 비어 있어요" />
      </UiProvider>,
    );
    expect(screen.getByText('앨범이 비어 있어요')).toBeTruthy();
    expect(screen.queryByText(koStrings.emptyTitle)).toBeNull();
  });

  it('action 객체가 Button으로 렌더되고 onPress가 배선된다', () => {
    const onPress = vi.fn();
    render(
      <UiProvider>
        <EmptyState action={{ label: '추가', onPress }} />
      </UiProvider>,
    );
    const button = screen.getByRole('button');
    expect(screen.getByText('추가')).toBeTruthy();
    fireEvent.click(button);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('action이 없으면 버튼이 렌더되지 않는다', () => {
    render(
      <UiProvider>
        <EmptyState />
      </UiProvider>,
    );
    expect(screen.queryByRole('button')).toBeNull();
  });
});

// ─── §5.10 ErrorState ──────────────────────────────────────────────────────

describe('§5.10 ErrorState', () => {
  it('onRetry가 없으면 재시도 버튼이 없다 — 기본 title/message는 strings에서', () => {
    render(
      <UiProvider>
        <ErrorState />
      </UiProvider>,
    );
    expect(screen.getByText(enStrings.errorTitle)).toBeTruthy();
    expect(screen.getByText(enStrings.errorBody)).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('onRetry가 있을 때만 재시도 버튼이 렌더되고 클릭이 배선된다', () => {
    const onRetry = vi.fn();
    render(
      <UiProvider>
        <ErrorState onRetry={onRetry} />
      </UiProvider>,
    );
    const button = screen.getByRole('button');
    expect(screen.getByText(enStrings.retry)).toBeTruthy();
    fireEvent.click(button);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('retryLabel 기본은 strings.retry — koStrings 주입 시 한국어', () => {
    render(
      <UiProvider strings={koStrings}>
        <ErrorState onRetry={() => {}} />
      </UiProvider>,
    );
    expect(screen.getByText('재시도')).toBeTruthy();
  });

  it('retryLabel prop이 Provider 문구보다 우선한다', () => {
    render(
      <UiProvider strings={koStrings}>
        <ErrorState onRetry={() => {}} retryLabel="다시 시도" />
      </UiProvider>,
    );
    expect(screen.getByText('다시 시도')).toBeTruthy();
    expect(screen.queryByText(koStrings.retry)).toBeNull();
  });
});

// ─── §5.11 useToastController ──────────────────────────────────────────────

describe('§5.11 useToastController', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('showToast로 toast가 노출된다', () => {
    const { result } = renderHook(() => useToastController());
    expect(result.current.toast).toBeNull();
    act(() => {
      result.current.showToast({ message: '저장했습니다', variant: 'success' });
    });
    expect(result.current.toast).toEqual({ message: '저장했습니다', variant: 'success' });
  });

  it('기본 durationMs(2800) 경과 후 자동 clear — 직전(2799ms)까지는 유지', () => {
    const { result } = renderHook(() => useToastController());
    act(() => {
      result.current.showToast({ message: '알림', variant: 'info' });
    });
    act(() => {
      vi.advanceTimersByTime(2_799);
    });
    expect(result.current.toast).not.toBeNull();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current.toast).toBeNull();
  });

  it('clearToast는 타이머를 기다리지 않고 즉시 지운다', () => {
    const { result } = renderHook(() => useToastController());
    act(() => {
      result.current.showToast({ message: '에러', variant: 'error' });
    });
    act(() => {
      result.current.clearToast();
    });
    expect(result.current.toast).toBeNull();
    // 해제된 타이머가 뒤늦게 발화해도 부작용이 없어야 한다.
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(result.current.toast).toBeNull();
  });

  it('durationMs 옵션이 자동 clear 시점에 반영된다', () => {
    const { result } = renderHook(() => useToastController({ durationMs: 500 }));
    act(() => {
      result.current.showToast({ message: '짧은 알림', variant: 'warning' });
    });
    act(() => {
      vi.advanceTimersByTime(499);
    });
    expect(result.current.toast).not.toBeNull();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current.toast).toBeNull();
  });
});

// ─── §5.11 Toast ───────────────────────────────────────────────────────────

describe('§5.11 Toast', () => {
  it('variant별 배경 팔레트 — 모든 상태가 전용 strong surface를 사용한다', () => {
    const cases = [
      ['error', lightTheme.colors.dangerStrong],
      ['success', lightTheme.colors.successStrong],
      ['info', lightTheme.colors.infoStrong],
      ['warning', lightTheme.colors.warningStrong],
    ] as const;
    for (const [variant, expected] of cases) {
      const { unmount } = render(
        <UiProvider>
          <Toast message="알림" variant={variant} testID={`toast-${variant}`} />
        </UiProvider>,
      );
      expect(screen.getByTestId(`toast-${variant}`).style.backgroundColor).toBe(hexToRgb(expected));
      unmount();
    }
  });

  it('variant 기본값은 error — dangerStrong 배경', () => {
    render(
      <UiProvider>
        <Toast message="알림" testID="toast" />
      </UiProvider>,
    );
    expect(screen.getByTestId('toast').style.backgroundColor).toBe(
      hexToRgb(lightTheme.colors.dangerStrong),
    );
  });

  it('accessibilityLiveRegion polite가 aria-live로 노출된다', () => {
    render(
      <UiProvider>
        <Toast message="알림" testID="toast" />
      </UiProvider>,
    );
    expect(screen.getByTestId('toast').getAttribute('aria-live')).toBe('polite');
  });

  it('bottomOffset이 위치 스타일에 반영된다 — 기본 96', () => {
    const { unmount } = render(
      <UiProvider>
        <Toast message="알림" testID="toast" />
      </UiProvider>,
    );
    expect(screen.getByTestId('toast').style.bottom).toBe('96px');
    unmount();

    render(
      <UiProvider>
        <Toast message="알림" bottomOffset={24} testID="toast-custom" />
      </UiProvider>,
    );
    expect(screen.getByTestId('toast-custom').style.bottom).toBe('24px');
  });

  it('leading 폴백 — Provider icons.toast[variant] 주입 시 렌더되고 색·크기 계약을 받는다', () => {
    const renderIcon = vi.fn((_props: IconRenderProps) => <View testID="provider-toast-icon" />);
    render(
      <UiProvider icons={{ toast: { success: renderIcon } }}>
        <Toast message="완료" variant="success" testID="toast" />
      </UiProvider>,
    );
    expect(screen.getByTestId('provider-toast-icon')).toBeTruthy();
    // success 팔레트의 전용 텍스트 색(onSuccess)과 metrics.icon.md가 전달된다.
    expect(renderIcon).toHaveBeenCalledWith({
      color: lightTheme.colors.onSuccess,
      size: lightTheme.metrics.icon.md,
    });
  });

  it('info leading 아이콘은 전용 onInfo 텍스트 색을 받는다', () => {
    const renderIcon = vi.fn((_props: IconRenderProps) => <View testID="provider-toast-icon" />);
    render(
      <UiProvider icons={{ toast: { info: renderIcon } }}>
        <Toast message="안내" variant="info" testID="toast" />
      </UiProvider>,
    );
    expect(renderIcon).toHaveBeenCalledWith({
      color: lightTheme.colors.onInfo,
      size: lightTheme.metrics.icon.md,
    });
  });

  it('leading 폴백 — icons 미주입 시 아이콘 미표시(메시지 노드만 남는다)', () => {
    render(
      <UiProvider>
        <Toast message="알림" testID="toast" />
      </UiProvider>,
    );
    expect(screen.getByTestId('toast').childElementCount).toBe(1);
  });

  it('leading 폴백 — icons.toast에 해당 variant 슬롯이 없으면 미표시', () => {
    const renderIcon = vi.fn((_props: IconRenderProps) => <View testID="provider-toast-icon" />);
    render(
      <UiProvider icons={{ toast: { success: renderIcon } }}>
        <Toast message="에러" variant="error" testID="toast" />
      </UiProvider>,
    );
    expect(screen.queryByTestId('provider-toast-icon')).toBeNull();
    expect(renderIcon).not.toHaveBeenCalled();
    expect(screen.getByTestId('toast').childElementCount).toBe(1);
  });

  it('leading prop이 Provider 주입보다 우선한다', () => {
    const renderIcon = vi.fn((_props: IconRenderProps) => <View testID="provider-toast-icon" />);
    render(
      <UiProvider icons={{ toast: { error: renderIcon } }}>
        <Toast message="에러" variant="error" leading={<View testID="custom-leading" />} testID="toast" />
      </UiProvider>,
    );
    expect(screen.getByTestId('custom-leading')).toBeTruthy();
    expect(screen.queryByTestId('provider-toast-icon')).toBeNull();
    expect(renderIcon).not.toHaveBeenCalled();
  });
});
