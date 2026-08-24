/**
 * Skeleton 웹 드라이버 — admin 백로그 #7.
 *
 * RNW에는 네이티브 애니메이션 모듈이 없어 useNativeDriver: true가 인스턴스마다
 * console.warn을 찍는다. 웹에서는 JS 드라이버를 명시해 경고 없이 같은 펄스를 돈다.
 */
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AccessibilityInfo, Animated } from 'react-native';
import { Skeleton } from '../../src/components/feedback';
import { UiProvider } from '../../src/components/provider';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('Skeleton web animation driver', () => {
  beforeEach(() => {
    vi.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
    vi.spyOn(AccessibilityInfo, 'addEventListener').mockReturnValue({ remove: vi.fn() } as never);
  });

  it('starts the pulse without any useNativeDriver warning on web', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const loop = vi.spyOn(Animated, 'loop');

    const rendered = render(
      <UiProvider>
        <Skeleton testID="sk" />
      </UiProvider>,
    );
    await act(async () => {
      await Promise.resolve();
    });

    expect(loop).toHaveBeenCalledTimes(1);
    const driverComplaints = warn.mock.calls.filter((call) =>
      call.some((argument) => String(argument).includes('useNativeDriver')),
    );
    expect(driverComplaints).toEqual([]);
    rendered.unmount();
  });
});
