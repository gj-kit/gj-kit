import { StrictMode } from 'react';
import type { ReactNode } from 'react';
import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppState, Text, View } from 'react-native';
import {
  ToastViewport,
  useToastQueue,
} from '../../src/components/toast-queue';
import type {
  ToastId,
  ToastRecord,
} from '../../src/components/toast-queue';
import { UiProvider } from '../../src/components/provider';
import { koStrings } from '../../src/strings/strings';
import { lightTheme } from '../../src/theme/createTheme';

afterEach(cleanup);

function toastRecord(id: string, overrides: Partial<ToastRecord> = {}): ToastRecord {
  return {
    id: id as ToastId,
    message: '저장했습니다',
    variant: 'success',
    durationMs: 5_000,
    announcement: 'polite',
    ...overrides,
  };
}

describe('useToastQueue — FIFO와 수명', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('입력을 완전히 정규화하고 첫 항목만 보이며 queuedCount를 계산한다', () => {
    const { result } = renderHook(() => useToastQueue({ defaultDurationMs: 1_000 }));
    let first: ToastId | undefined;
    act(() => {
      first = result.current.show({ message: '첫 알림' });
      result.current.show({ message: '둘째', variant: 'warning', durationMs: null });
    });

    expect(result.current.records).toEqual([
      {
        id: first,
        message: '첫 알림',
        variant: 'info',
        durationMs: 1_000,
        announcement: 'polite',
      },
      expect.objectContaining({
        message: '둘째',
        variant: 'warning',
        durationMs: null,
      }),
    ]);
    expect(result.current.visibleToasts.map((toast) => toast.message)).toEqual(['첫 알림']);
    expect(result.current.queuedCount).toBe(1);
    expect(Object.isFrozen(result.current.records[0])).toBe(true);
    expect(Object.isFrozen(result.current.records)).toBe(true);
    expect(Object.isFrozen(result.current.visibleToasts)).toBe(true);
  });

  it('queued 타이머는 승격 전에는 흐르지 않고 각 visible 항목이 온전한 수명을 받는다', () => {
    const onDismiss = vi.fn();
    const { result } = renderHook(() =>
      useToastQueue({ defaultDurationMs: 1_000, onDismiss }),
    );
    act(() => {
      result.current.show({ message: '첫째' });
      result.current.show({ message: '둘째' });
    });

    act(() => vi.advanceTimersByTime(999));
    expect(result.current.visibleToasts[0]?.message).toBe('첫째');
    act(() => vi.advanceTimersByTime(1));
    expect(result.current.visibleToasts[0]?.message).toBe('둘째');
    expect(onDismiss).toHaveBeenCalledWith(expect.objectContaining({ message: '첫째' }), 'timeout');

    act(() => vi.advanceTimersByTime(999));
    expect(result.current.records).toHaveLength(1);
    act(() => vi.advanceTimersByTime(1));
    expect(result.current.records).toHaveLength(0);
  });

  it('maxVisible의 각 항목은 독립 타이머를 가지며 queued FIFO를 보존한다', () => {
    const { result } = renderHook(() =>
      useToastQueue({ maxVisible: 2, maxQueued: 2, defaultDurationMs: 1_000 }),
    );
    act(() => {
      result.current.show({ message: 'A', durationMs: 500 });
      result.current.show({ message: 'B', durationMs: 1_000 });
      result.current.show({ message: 'C', durationMs: 2_000 });
    });
    expect(result.current.visibleToasts.map((toast) => toast.message)).toEqual(['A', 'B']);

    act(() => vi.advanceTimersByTime(500));
    expect(result.current.visibleToasts.map((toast) => toast.message)).toEqual(['B', 'C']);
    act(() => vi.advanceTimersByTime(500));
    expect(result.current.visibleToasts.map((toast) => toast.message)).toEqual(['C']);
    act(() => vi.advanceTimersByTime(1_499));
    expect(result.current.records[0]?.message).toBe('C');
    act(() => vi.advanceTimersByTime(1));
    expect(result.current.records).toHaveLength(0);
  });

  it('pause/resume는 경과 시간을 빼고 정확한 남은 시간부터 재개하며 idempotent하다', () => {
    const { result } = renderHook(() => useToastQueue());
    let id: ToastId | undefined;
    act(() => {
      id = result.current.show({ message: '읽는 중', durationMs: 1_000 });
    });
    act(() => vi.advanceTimersByTime(400));
    act(() => {
      expect(result.current.pause(id!)).toBe(true);
      expect(result.current.pause(id!)).toBe(true);
    });
    act(() => vi.advanceTimersByTime(10_000));
    expect(result.current.records).toHaveLength(1);
    act(() => expect(result.current.resume(id!)).toBe(true));
    act(() => vi.advanceTimersByTime(599));
    expect(result.current.records).toHaveLength(1);
    act(() => vi.advanceTimersByTime(1));
    expect(result.current.records).toHaveLength(0);
    expect(result.current.pause(id!)).toBe(false);
    expect(result.current.resume(id!)).toBe(false);
  });

  it('window blur 동안 visible 수명을 보존하고 queued 항목은 승격 후 전체 수명을 받는다', () => {
    const { result } = renderHook(() => useToastQueue({ defaultDurationMs: 1_000 }));
    act(() => {
      result.current.show({ message: '보이는 알림' });
      result.current.show({ message: '대기 알림' });
    });
    act(() => vi.advanceTimersByTime(400));
    act(() => window.dispatchEvent(new Event('blur')));
    act(() => vi.advanceTimersByTime(10_000));
    expect(result.current.records.map((toast) => toast.message)).toEqual([
      '보이는 알림',
      '대기 알림',
    ]);

    act(() => window.dispatchEvent(new Event('focus')));
    act(() => vi.advanceTimersByTime(599));
    expect(result.current.visibleToasts[0]?.message).toBe('보이는 알림');
    act(() => vi.advanceTimersByTime(1));
    expect(result.current.visibleToasts[0]?.message).toBe('대기 알림');
    act(() => vi.advanceTimersByTime(999));
    expect(result.current.records).toHaveLength(1);
    act(() => vi.advanceTimersByTime(1));
    expect(result.current.records).toHaveLength(0);
  });

  it('RNW AppState visibility background도 같은 lifecycle pause source로 합성한다', () => {
    const ownDescriptor = Object.getOwnPropertyDescriptor(document, 'visibilityState');
    let visibilityState: DocumentVisibilityState = 'visible';
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => visibilityState,
    });

    try {
      const { result, unmount } = renderHook(() => useToastQueue());
      act(() => result.current.show({ message: '문서 상태', durationMs: 1_000 }));
      act(() => vi.advanceTimersByTime(250));
      visibilityState = 'hidden';
      act(() => document.dispatchEvent(new Event('visibilitychange')));
      act(() => vi.advanceTimersByTime(10_000));
      expect(result.current.records).toHaveLength(1);

      visibilityState = 'visible';
      act(() => document.dispatchEvent(new Event('visibilitychange')));
      act(() => vi.advanceTimersByTime(749));
      expect(result.current.records).toHaveLength(1);
      act(() => vi.advanceTimersByTime(1));
      expect(result.current.records).toHaveLength(0);
      unmount();
    } finally {
      if (ownDescriptor === undefined) delete (document as { visibilityState?: string }).visibilityState;
      else Object.defineProperty(document, 'visibilityState', ownDescriptor);
    }
  });

  it('update는 현재 위치와 id를 보존하고 타이머를 전체 duration으로 리셋한다', () => {
    const { result } = renderHook(() => useToastQueue());
    let id: ToastId | undefined;
    act(() => {
      id = result.current.show({ title: '저장', message: '처리 중', durationMs: 1_000 });
    });
    act(() => vi.advanceTimersByTime(900));
    act(() => {
      expect(
        result.current.update(id!, {
          title: null,
          message: '완료',
          variant: 'success',
          announcement: 'assertive',
        }),
      ).toBe(true);
    });
    expect(result.current.records[0]).toEqual({
      id,
      message: '완료',
      variant: 'success',
      durationMs: 1_000,
      announcement: 'assertive',
    });
    act(() => vi.advanceTimersByTime(999));
    expect(result.current.records).toHaveLength(1);
    act(() => vi.advanceTimersByTime(1));
    expect(result.current.records).toHaveLength(0);
    expect(result.current.update(id!, { message: '없음' })).toBe(false);
  });

  it('update의 명시적 undefined는 기존 값을 보존하면서 타이머만 리셋한다', () => {
    const action = { label: '실행', onPress: vi.fn() };
    const { result } = renderHook(() => useToastQueue());
    let id: ToastId | undefined;
    act(() => {
      id = result.current.show({
        title: '제목',
        message: '본문',
        variant: 'warning',
        durationMs: 1_000,
        announcement: 'assertive',
        action,
        dedupeKey: 'keep',
      });
    });
    act(() => vi.advanceTimersByTime(900));
    act(() =>
      result.current.update(id!, {
        title: undefined,
        message: undefined,
        variant: undefined,
        durationMs: undefined,
        announcement: undefined,
        action: undefined,
        dedupeKey: undefined,
      }),
    );
    expect(result.current.records[0]).toMatchObject({
      title: '제목',
      message: '본문',
      variant: 'warning',
      durationMs: 1_000,
      announcement: 'assertive',
      dedupeKey: 'keep',
    });
    expect(result.current.records[0]?.action?.label).toBe('실행');
    act(() => vi.advanceTimersByTime(999));
    expect(result.current.records).toHaveLength(1);
    act(() => vi.advanceTimersByTime(1));
    expect(result.current.records).toHaveLength(0);
  });

  it('durationMs=null은 영속하고 숫자로 update하면 새 타이머가 시작된다', () => {
    const { result } = renderHook(() => useToastQueue());
    let id: ToastId | undefined;
    act(() => {
      id = result.current.show({ message: '연결 끊김', durationMs: null });
    });
    act(() => vi.advanceTimersByTime(60_000));
    expect(result.current.records).toHaveLength(1);
    act(() => result.current.update(id!, { durationMs: 250 }));
    act(() => vi.advanceTimersByTime(249));
    expect(result.current.records).toHaveLength(1);
    act(() => vi.advanceTimersByTime(1));
    expect(result.current.records).toHaveLength(0);
  });

  it('dedupeKey show는 같은 id/위치를 유지하며 내용을 교체하고 타이머도 리셋한다', () => {
    const { result } = renderHook(() => useToastQueue({ defaultDurationMs: 1_000 }));
    let first: ToastId | undefined;
    let duplicate: ToastId | undefined;
    act(() => {
      first = result.current.show({ message: '업로드 10%', dedupeKey: 'upload' });
      result.current.show({ message: '다른 알림', durationMs: null });
    });
    act(() => vi.advanceTimersByTime(900));
    act(() => {
      duplicate = result.current.show({
        message: '업로드 80%',
        variant: 'success',
        dedupeKey: 'upload',
      });
    });
    expect(duplicate).toBe(first);
    expect(result.current.records.map((toast) => toast.message)).toEqual([
      '업로드 80%',
      '다른 알림',
    ]);
    act(() => vi.advanceTimersByTime(999));
    expect(result.current.records[0]?.id).toBe(first);
    act(() => vi.advanceTimersByTime(1));
    expect(result.current.records[0]?.message).toBe('다른 알림');
  });

  it('queue overflow는 oldest queued를 결정적으로 제거하고 이유를 보고한다', () => {
    const onDismiss = vi.fn();
    const { result } = renderHook(() =>
      useToastQueue({ maxVisible: 1, maxQueued: 2, onDismiss }),
    );
    act(() => {
      result.current.show({ message: 'visible', durationMs: null });
      result.current.show({ message: 'queued-old', durationMs: null });
      result.current.show({ message: 'queued-new', durationMs: null });
      result.current.show({ message: 'incoming', durationMs: null });
    });

    expect(result.current.records.map((toast) => toast.message)).toEqual([
      'visible',
      'queued-new',
      'incoming',
    ]);
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onDismiss).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'queued-old' }),
      'queue-overflow',
    );
  });

  it('기본 총 상한은 10이고 11번째 show가 oldest queued를 제거한다', () => {
    const onDismiss = vi.fn();
    const { result } = renderHook(() => useToastQueue({ onDismiss }));
    act(() => {
      for (let index = 1; index <= 11; index += 1) {
        result.current.show({ message: String(index), durationMs: null });
      }
    });
    expect(result.current.records).toHaveLength(10);
    expect(result.current.records.map((toast) => toast.message)).toEqual([
      '1',
      '3',
      '4',
      '5',
      '6',
      '7',
      '8',
      '9',
      '10',
      '11',
    ]);
    expect(onDismiss).toHaveBeenCalledWith(
      expect.objectContaining({ message: '2' }),
      'queue-overflow',
    );
  });

  it('옵션 상한 감소도 oldest queued 정책을 적용한다', () => {
    const onDismiss = vi.fn();
    const { result, rerender } = renderHook(
      ({ maxQueued }) => useToastQueue({ maxVisible: 1, maxQueued, onDismiss }),
      { initialProps: { maxQueued: 3 } },
    );
    act(() => {
      for (const message of ['A', 'B', 'C', 'D']) {
        result.current.show({ message, durationMs: null });
      }
    });
    rerender({ maxQueued: 1 });
    expect(result.current.records.map((toast) => toast.message)).toEqual(['A', 'D']);
    expect(onDismiss.mock.calls.map(([toast, reason]) => [toast.message, reason])).toEqual([
      ['B', 'queue-overflow'],
      ['C', 'queue-overflow'],
    ]);
  });

  it('dismiss/dismissAll은 지정 이유를 FIFO로 보고하고 다음 항목을 승격한다', () => {
    const onDismiss = vi.fn();
    const { result } = renderHook(() => useToastQueue({ onDismiss }));
    let first: ToastId | undefined;
    act(() => {
      first = result.current.show({ message: 'A', durationMs: null });
      result.current.show({ message: 'B', durationMs: null });
      result.current.show({ message: 'C', durationMs: null });
    });
    act(() => expect(result.current.dismiss(first!, 'close-action')).toBe(true));
    expect(result.current.visibleToasts[0]?.message).toBe('B');
    act(() => result.current.dismissAll());
    expect(result.current.records).toEqual([]);
    expect(onDismiss.mock.calls.map(([toast, reason]) => [toast.message, reason])).toEqual([
      ['A', 'close-action'],
      ['B', 'programmatic'],
      ['C', 'programmatic'],
    ]);
    expect(result.current.dismiss(first!)).toBe(false);
  });

  it('unmount에서 모든 타이머를 정리해 뒤늦은 dismiss를 방지한다', () => {
    const onDismiss = vi.fn();
    const { result, unmount } = renderHook(() =>
      useToastQueue({ defaultDurationMs: 100, onDismiss }),
    );
    act(() => result.current.show({ message: '곧 사라짐' }));
    unmount();
    act(() => vi.advanceTimersByTime(10_000));
    expect(onDismiss).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('StrictMode 재설정과 unmount에서 AppState listener를 정리한다', () => {
    const remove = vi.fn();
    const listenerSpy = vi
      .spyOn(AppState, 'addEventListener')
      .mockReturnValue({ remove } as ReturnType<typeof AppState.addEventListener>);
    const wrapper = ({ children }: { children: ReactNode }) => (
      <StrictMode>{children}</StrictMode>
    );

    try {
      const { result, unmount } = renderHook(() => useToastQueue(), { wrapper });
      expect(listenerSpy).toHaveBeenCalledWith('change', expect.any(Function));
      act(() => result.current.show({ message: 'StrictMode timer', durationMs: 100 }));
      act(() => vi.advanceTimersByTime(100));
      expect(result.current.records).toHaveLength(0);
      unmount();
      expect(remove).toHaveBeenCalled();
    } finally {
      listenerSpy.mockRestore();
    }
  });
});

describe('useToastQueue — 런타임 계약', () => {
  it('잘못된 옵션을 즉시 거부한다', () => {
    expect(() => renderHook(() => useToastQueue({ maxVisible: 0 }))).toThrow(RangeError);
    expect(() => renderHook(() => useToastQueue({ maxQueued: -1 }))).toThrow(RangeError);
    expect(() => renderHook(() => useToastQueue({ defaultDurationMs: Number.NaN }))).toThrow(
      RangeError,
    );
  });

  it('공백 message, 잘못된 duration/announcement/action/dedupeKey를 거부한다', () => {
    const { result } = renderHook(() => useToastQueue());
    expect(() => result.current.show({ message: '   ' })).toThrow(TypeError);
    expect(() =>
      result.current.show({ message: 'x', durationMs: -1 }),
    ).toThrow(RangeError);
    expect(() =>
      result.current.show({ message: 'x', announcement: 'loud' as 'polite' }),
    ).toThrow(TypeError);
    expect(() =>
      result.current.show({
        message: 'x',
        action: { label: '', onPress: () => undefined },
      }),
    ).toThrow(TypeError);
    expect(() => result.current.show({ message: 'x', dedupeKey: '' })).toThrow(TypeError);
  });

  it('update로 다른 record의 dedupeKey를 탈취할 수 없다', () => {
    const { result } = renderHook(() => useToastQueue());
    let second: ToastId | undefined;
    act(() => {
      result.current.show({ message: 'A', dedupeKey: 'a', durationMs: null });
      second = result.current.show({ message: 'B', dedupeKey: 'b', durationMs: null });
    });
    expect(() => result.current.update(second!, { dedupeKey: 'a' })).toThrow(
      'already in use',
    );
  });
});

describe('ToastViewport — 접근성과 상호작용', () => {
  it('polite/status, assertive/alert, off 의미를 copy에만 부여한다', () => {
    render(
      <UiProvider>
        <ToastViewport
          toasts={[
            toastRecord('polite'),
            toastRecord('assertive', { message: '실패', announcement: 'assertive' }),
            toastRecord('off', { message: '정적', announcement: 'off' }),
          ]}
          onDismiss={() => undefined}
          onPause={() => undefined}
          onResume={() => undefined}
          testID="viewport"
        />
      </UiProvider>,
    );
    expect(screen.getByRole('status').getAttribute('aria-live')).toBe('polite');
    expect(screen.getByRole('alert').getAttribute('aria-live')).toBe('assertive');
    expect(screen.getByTestId('viewport-toast-2-copy').getAttribute('aria-live')).toBe('off');
    expect(screen.getByTestId('viewport').getAttribute('aria-live')).toBeNull();
  });

  it('action과 close는 같은 부모의 sibling button이며 wrapper는 pressable이 아니다', () => {
    const action = vi.fn();
    const onDismiss = vi.fn();
    const toast = toastRecord('action', {
      title: '초대 취소됨',
      action: { label: '되돌리기', accessibilityLabel: '초대 취소 되돌리기', onPress: action },
    });
    render(
      <UiProvider strings={koStrings}>
        <ToastViewport
          toasts={[toast]}
          onDismiss={onDismiss}
          onPause={() => undefined}
          onResume={() => undefined}
          testID="viewport"
        />
      </UiProvider>,
    );

    const actionButton = screen.getByRole('button', { name: '초대 취소 되돌리기' });
    const closeButton = screen.getByRole('button', { name: '닫기' });
    expect(actionButton.parentElement).toBe(closeButton.parentElement);
    expect(screen.getByTestId('viewport-toast-0').matches('button')).toBe(false);
    expect(screen.getByTestId('viewport-toast-0').querySelectorAll('button')).toHaveLength(2);

    fireEvent.click(actionButton);
    fireEvent.click(closeButton);
    expect(action).toHaveBeenCalledTimes(1);
    expect(onDismiss).toHaveBeenNthCalledWith(1, toast.id, 'action');
    expect(onDismiss).toHaveBeenNthCalledWith(2, toast.id, 'close-action');
  });

  it('Provider leading icon을 장식으로 숨기면서 variant 대비색과 토큰 크기를 전달한다', () => {
    const leading = vi.fn(() => (
      <View
        testID="leading"
        accessibilityRole="image"
        accessibilityLabel="경고 상태 아이콘"
      />
    ));
    const close = vi.fn(() => <View testID="close" />);
    render(
      <UiProvider icons={{ toast: { warning: leading }, close }}>
        <ToastViewport
          toasts={[toastRecord('icons', { variant: 'warning' })]}
          onDismiss={() => undefined}
          onPause={() => undefined}
          onResume={() => undefined}
        />
      </UiProvider>,
    );
    const leadingElement = screen.getByTestId('leading');
    expect(leadingElement.parentElement?.getAttribute('aria-hidden')).toBe('true');
    expect(screen.queryByRole('img', { name: '경고 상태 아이콘' })).toBeNull();
    expect(screen.getByTestId('close')).toBeTruthy();
    expect(leading).toHaveBeenCalledWith({
      color: lightTheme.colors.onWarning,
      size: lightTheme.metrics.icon.md,
    });
    expect(close).toHaveBeenCalledWith({
      color: lightTheme.colors.text,
      size: Math.round(lightTheme.metrics.control.md * 0.48),
    });
  });

  it('Provider strings.close가 공백이면 close IconButton 렌더 전에 거부한다', () => {
    const close = vi.fn(() => <View testID="invalid-close" />);
    expect(() =>
      render(
        <UiProvider strings={{ ...koStrings, close: '  \n ' }} icons={{ close }}>
          <ToastViewport
            toasts={[toastRecord('blank-close')]}
            onDismiss={() => undefined}
            onPause={() => undefined}
            onResume={() => undefined}
          />
        </UiProvider>,
      ),
    ).toThrow('ToastViewport strings.close must be a non-empty string.');
    expect(close).not.toHaveBeenCalled();
  });

  it('hover/focus/touch의 겹침을 합쳐 최초 pause와 최종 resume만 보낸다', () => {
    const onPause = vi.fn();
    const onResume = vi.fn();
    const toast = toastRecord('interactions', {
      action: { label: 'Undo', onPress: () => undefined },
    });
    render(
      <UiProvider>
        <ToastViewport
          toasts={[toast]}
          onDismiss={() => undefined}
          onPause={onPause}
          onResume={onResume}
          testID="viewport"
        />
      </UiProvider>,
    );
    const item = screen.getByTestId('viewport-toast-0');
    const action = screen.getByRole('button', { name: 'Undo' });

    fireEvent.pointerEnter(item, { pointerType: 'mouse' });
    fireEvent.focus(action);
    fireEvent.touchStart(item, {
      changedTouches: [{ force: 0, identifier: 1, clientX: 0, clientY: 0, pageX: 0, pageY: 0 }],
      touches: [{ force: 0, identifier: 1, clientX: 0, clientY: 0, pageX: 0, pageY: 0 }],
    });
    expect(onPause).toHaveBeenCalledTimes(1);
    expect(onPause).toHaveBeenCalledWith(toast.id);

    fireEvent.pointerLeave(item, { pointerType: 'mouse' });
    fireEvent.blur(action);
    expect(onResume).not.toHaveBeenCalled();
    fireEvent.touchEnd(item, {
      changedTouches: [{ force: 0, identifier: 1, clientX: 0, clientY: 0, pageX: 0, pageY: 0 }],
      touches: [],
    });
    expect(onResume).toHaveBeenCalledTimes(1);
    expect(onResume).toHaveBeenCalledWith(toast.id);
  });

  it('action에서 close로 이동하는 내부 focus 전환은 타이머를 재개하지 않는다', () => {
    const onPause = vi.fn();
    const onResume = vi.fn();
    const toast = toastRecord('focus-within', {
      action: { label: 'Undo', onPress: () => undefined },
    });
    render(
      <UiProvider>
        <ToastViewport
          toasts={[toast]}
          onDismiss={() => undefined}
          onPause={onPause}
          onResume={onResume}
          testID="viewport"
        />
      </UiProvider>,
    );
    const action = screen.getByRole('button', { name: 'Undo' });
    const close = screen.getByRole('button', { name: 'Close' });

    fireEvent.focus(action, { relatedTarget: document.body });
    expect(onPause).toHaveBeenCalledTimes(1);
    fireEvent.blur(action, { relatedTarget: close });
    fireEvent.focus(close, { relatedTarget: action });
    expect(onPause).toHaveBeenCalledTimes(1);
    expect(onResume).not.toHaveBeenCalled();

    fireEvent.blur(close, { relatedTarget: document.body });
    expect(onResume).toHaveBeenCalledTimes(1);
    expect(onResume).toHaveBeenCalledWith(toast.id);
  });

  it('touch pointer enter는 hover로 중복 집계하지 않는다', () => {
    const onPause = vi.fn();
    const onResume = vi.fn();
    render(
      <UiProvider>
        <ToastViewport
          toasts={[toastRecord('touch')]}
          onDismiss={() => undefined}
          onPause={onPause}
          onResume={onResume}
          testID="viewport"
        />
      </UiProvider>,
    );
    const item = screen.getByTestId('viewport-toast-0');
    fireEvent.pointerEnter(item, { pointerType: 'touch' });
    fireEvent.touchStart(item, {
      changedTouches: [{ force: 0, identifier: 1, clientX: 0, clientY: 0, pageX: 0, pageY: 0 }],
      touches: [{ force: 0, identifier: 1, clientX: 0, clientY: 0, pageX: 0, pageY: 0 }],
    });
    fireEvent.pointerLeave(item, { pointerType: 'touch' });
    fireEvent.touchEnd(item, {
      changedTouches: [{ force: 0, identifier: 1, clientX: 0, clientY: 0, pageX: 0, pageY: 0 }],
      touches: [],
    });
    expect(onPause).toHaveBeenCalledTimes(1);
    expect(onResume).toHaveBeenCalledTimes(1);
  });

  it('상호작용 중 viewport에서 제거되면 resume을 보내 paused 상태를 남기지 않는다', () => {
    const onResume = vi.fn();
    const toast = toastRecord('cleanup');
    const { rerender } = render(
      <UiProvider>
        <ToastViewport
          toasts={[toast]}
          onDismiss={() => undefined}
          onPause={() => undefined}
          onResume={onResume}
          testID="viewport"
        />
      </UiProvider>,
    );
    fireEvent.pointerEnter(screen.getByTestId('viewport-toast-0'), { pointerType: 'mouse' });
    rerender(
      <UiProvider>
        <ToastViewport
          toasts={[]}
          onDismiss={() => undefined}
          onPause={() => undefined}
          onResume={onResume}
          testID="viewport"
        />
      </UiProvider>,
    );
    expect(onResume).toHaveBeenCalledWith(toast.id);
  });

  it('queue controller를 직접 연결하면 viewport hover가 타이머를 멈추고 close가 이유를 전달한다', () => {
    vi.useFakeTimers();
    const onDismiss = vi.fn();
    const { result } = renderHook(() => useToastQueue({ onDismiss }));
    act(() => result.current.show({ message: '통합', durationMs: 500 }));
    render(
      <UiProvider>
        <ToastViewport
          toasts={result.current.visibleToasts}
          onDismiss={result.current.dismiss}
          onPause={result.current.pause}
          onResume={result.current.resume}
          testID="viewport"
        />
      </UiProvider>,
    );
    const item = screen.getByTestId('viewport-toast-0');
    fireEvent.pointerEnter(item, { pointerType: 'mouse' });
    act(() => vi.advanceTimersByTime(5_000));
    expect(result.current.records).toHaveLength(1);
    fireEvent.pointerLeave(item, { pointerType: 'mouse' });
    act(() => vi.advanceTimersByTime(499));
    expect(result.current.records).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(result.current.records).toHaveLength(0);
    expect(onDismiss).toHaveBeenCalledWith(
      expect.objectContaining({ message: '통합' }),
      'close-action',
    );
    vi.useRealTimers();
  });

  it('top/bottom 위치·offset·공통 className/style/testID 꼬리를 전달한다', () => {
    const { rerender } = render(
      <UiProvider>
        <ToastViewport
          toasts={[toastRecord('position')]}
          onDismiss={() => undefined}
          onPause={() => undefined}
          onResume={() => undefined}
          placement="top"
          offset={24}
          className="host-viewport"
          style={{ opacity: 0.8 }}
          testID="viewport"
        />
      </UiProvider>,
    );
    const viewport = screen.getByTestId('viewport');
    expect(viewport.style.top).toBe('24px');
    expect(viewport.style.bottom).toBe('');
    expect(viewport.style.flexDirection).toBe('column');
    expect(viewport.style.opacity).toBe('0.8');
    expect(screen.getByTestId('viewport-toast-0-close')).toBeTruthy();

    rerender(
      <UiProvider>
        <ToastViewport
          toasts={[toastRecord('position')]}
          onDismiss={() => undefined}
          onPause={() => undefined}
          onResume={() => undefined}
          placement="bottom"
          testID="viewport"
        />
      </UiProvider>,
    );
    expect(screen.getByTestId('viewport').style.bottom).toBe(`${lightTheme.spacing.xl}px`);
    expect(screen.getByTestId('viewport').style.flexDirection).toBe('column-reverse');
  });

  it('렌더만으로 기존 포커스를 훔치지 않는다', () => {
    render(
      <>
        <button type="button">기존 포커스</button>
        <UiProvider>
          <ToastViewport
            toasts={[toastRecord('focus')]}
            onDismiss={() => undefined}
            onPause={() => undefined}
            onResume={() => undefined}
          />
        </UiProvider>
      </>,
    );
    const existing = screen.getByRole('button', { name: '기존 포커스' });
    existing.focus();
    expect(document.activeElement).toBe(existing);
  });

  it('중복 id와 잘못된 offset을 거부한다', () => {
    const duplicate = toastRecord('same');
    expect(() =>
      render(
        <ToastViewport
          toasts={[duplicate, duplicate]}
          onDismiss={() => undefined}
          onPause={() => undefined}
          onResume={() => undefined}
        />,
      ),
    ).toThrow('ids must be unique');
    expect(() =>
      render(
        <ToastViewport
          toasts={[]}
          onDismiss={() => undefined}
          onPause={() => undefined}
          onResume={() => undefined}
          offset={-1}
        />,
      ),
    ).toThrow(RangeError);
    expect(() =>
      render(
        <ToastViewport
          toasts={[{ ...toastRecord('bad'), variant: 'neutral' as 'info' }]}
          onDismiss={() => undefined}
          onPause={() => undefined}
          onResume={() => undefined}
        />,
      ),
    ).toThrow('variant is invalid');
  });
});
