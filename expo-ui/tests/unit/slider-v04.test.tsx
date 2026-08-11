import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

type PanResponderConfig = {
  readonly onPanResponderGrant?: (event: { readonly clientX?: number; readonly nativeEvent?: { readonly pageX?: number } }) => void;
  readonly onPanResponderMove?: (event: { readonly clientX?: number; readonly nativeEvent?: { readonly pageX?: number } }) => void;
  readonly onPanResponderRelease?: () => void;
};

const panResponderCapture = vi.hoisted(() => ({
  config: undefined as PanResponderConfig | undefined,
}));

vi.mock('react-native', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-native')>();
  return {
    ...actual,
    PanResponder: {
      create: (config: PanResponderConfig) => {
        panResponderCapture.config = config;
        return { panHandlers: {} };
      },
    },
  };
});

import { Platform } from 'react-native';
import { Slider } from '../../src/components/slider';

afterEach(() => {
  cleanup();
  panResponderCapture.config = undefined;
});

function setTrackWidth(element: HTMLElement, width = 100): void {
  Object.defineProperty(element, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({ left: 0, width }),
  });
}

function withPlatformOS<T>(os: 'ios' | 'web', run: () => T): T {
  const descriptor = Object.getOwnPropertyDescriptor(Platform, 'OS');
  Object.defineProperty(Platform, 'OS', { configurable: true, value: os });
  try {
    return run();
  } finally {
    if (descriptor === undefined) delete (Platform as { OS?: string }).OS;
    else Object.defineProperty(Platform, 'OS', descriptor);
  }
}

function reactProps(element: HTMLElement): Record<string, unknown> {
  const fiberKey = Object.keys(element).find((candidate) => candidate.startsWith('__reactFiber$'));
  let fiber = fiberKey === undefined
    ? undefined
    : (element as unknown as Record<string, { memoizedProps?: Record<string, unknown>; return?: unknown }>)[fiberKey];
  while (fiber !== undefined) {
    if (typeof fiber.memoizedProps?.onLayout === 'function') return fiber.memoizedProps;
    fiber = fiber.return as typeof fiber | undefined;
  }
  throw new Error('React native View props are unavailable for responder coverage.');
}

describe('Slider controlled value and pointer contracts', () => {
  it('track press moves the closest single thumb and commits exactly once', () => {
    const onValueChange = vi.fn();
    const onValueCommit = vi.fn();
    render(
      <Slider
        value={20}
        onValueChange={onValueChange}
        onValueCommit={onValueCommit}
        accessibilityLabel="볼륨"
        testID="volume"
      />,
    );

    const root = screen.getByTestId('volume');
    setTrackWidth(root);
    fireEvent.click(root, { clientX: 76 });

    expect(onValueChange).toHaveBeenCalledTimes(1);
    expect(onValueChange).toHaveBeenLastCalledWith(76);
    expect(onValueCommit).toHaveBeenCalledTimes(1);
    expect(onValueCommit).toHaveBeenLastCalledWith(76);
  });

  it('range track press selects the nearest thumb and keeps minDistance', () => {
    const onValueChange = vi.fn();
    const onValueCommit = vi.fn();
    render(
      <Slider
        mode="range"
        value={[20, 80]}
        onValueChange={onValueChange}
        onValueCommit={onValueCommit}
        accessibilityLabels={["최저 가격", "최고 가격"]}
        minDistance={10}
        testID="price"
      />,
    );
    const root = screen.getByTestId('price');
    setTrackWidth(root);

    fireEvent.click(root, { clientX: 74 });
    expect(onValueChange).toHaveBeenLastCalledWith([20, 74]);
    expect(onValueCommit).toHaveBeenLastCalledWith([20, 74]);

    // A second press keeps the same upper-thumb intent from the local interaction snapshot.
    fireEvent.click(root, { clientX: 75 });
    expect(onValueChange).toHaveBeenLastCalledWith([20, 75]);
    expect(onValueCommit).toHaveBeenLastCalledWith([20, 75]);
  });

  it('expands collapsed ranges toward the target instead of locking the lower thumb', () => {
    const minChange = vi.fn();
    const middleChange = vi.fn();
    const maxChange = vi.fn();
    const cases = [
      { id: 'collapsed-min', value: [0, 0] as const, clientX: 60, change: minChange, expected: [0, 60] },
      { id: 'collapsed-middle', value: [50, 50] as const, clientX: 20, change: middleChange, expected: [20, 50] },
      { id: 'collapsed-max', value: [100, 100] as const, clientX: 40, change: maxChange, expected: [40, 100] },
    ] as const;

    for (const testCase of cases) {
      render(
        <Slider
          mode="range"
          value={testCase.value}
          onValueChange={testCase.change}
          accessibilityLabels={["낮은 값", "높은 값"]}
          testID={testCase.id}
        />,
      );
      const root = screen.getByTestId(testCase.id);
      setTrackWidth(root);
      fireEvent.click(root, { clientX: testCase.clientX });
      expect(testCase.change).toHaveBeenLastCalledWith(testCase.expected);
    }
  });

  it('maps native responder pageX through the measured root, not a child locationX', () => {
    withPlatformOS('ios', () => {
      const onValueChange = vi.fn();
      const onValueCommit = vi.fn();
      render(
        <Slider
          mode="range"
          value={[20, 20]}
          onValueChange={onValueChange}
          onValueCommit={onValueCommit}
          accessibilityLabels={["시작", "끝"]}
          testID="native-range"
        />,
      );
      const root = screen.getByTestId('native-range');
      let measureCount = 0;
      Object.defineProperty(root, 'measure', {
        configurable: true,
        value: (callback: (x: number, y: number, width: number, height: number, pageX: number, pageY: number) => void) =>
          callback(0, 0, 100, 44, measureCount++ === 0 ? 100 : 120, 0),
      });
      const props = reactProps(root) as {
        onLayout?: (event: { nativeEvent: { layout: { width: number } } }) => void;
      };
      expect(Platform.OS).toBe('ios');
      expect(props.onLayout).toBeTypeOf('function');
      props.onLayout?.({ nativeEvent: { layout: { width: 100 } } });
      panResponderCapture.config?.onPanResponderGrant?.({
        nativeEvent: { pageX: 190, locationX: 12 } as unknown as { readonly pageX?: number },
      });
      panResponderCapture.config?.onPanResponderRelease?.();

      expect(onValueChange).toHaveBeenLastCalledWith([20, 70]);
      expect(onValueCommit).toHaveBeenLastCalledWith([20, 70]);
    });
  });

  it('retargets an exact-overlap drag toward its first divergent web move', () => {
    const onValueChange = vi.fn();
    const onValueCommit = vi.fn();
    render(
      <Slider
        mode="range"
        value={[50, 50]}
        onValueChange={onValueChange}
        onValueCommit={onValueCommit}
        accessibilityLabels={["시작", "끝"]}
        testID="overlap-drag"
      />,
    );
    const root = screen.getByTestId('overlap-drag');
    setTrackWidth(root);
    const props = reactProps(root) as {
      onLayout?: (event: { nativeEvent: { layout: { width: number } } }) => void;
    };
    props.onLayout?.({ nativeEvent: { layout: { width: 100 } } });

    panResponderCapture.config?.onPanResponderGrant?.({ clientX: 50 });
    panResponderCapture.config?.onPanResponderMove?.({ clientX: 80 });
    panResponderCapture.config?.onPanResponderRelease?.();

    expect(onValueChange).toHaveBeenLastCalledWith([50, 80]);
    expect(onValueCommit).toHaveBeenLastCalledWith([50, 80]);
  });

  it('does not emit a duplicate value change but still has one commit per keyboard interaction', () => {
    const onValueChange = vi.fn();
    const onValueCommit = vi.fn();
    render(
      <Slider
        value={100}
        onValueChange={onValueChange}
        onValueCommit={onValueCommit}
        accessibilityLabel="완료"
      />,
    );
    fireEvent.keyDown(screen.getByRole('slider', { name: '완료' }), { key: 'End' });

    expect(onValueChange).not.toHaveBeenCalled();
    expect(onValueCommit).toHaveBeenCalledTimes(1);
    expect(onValueCommit).toHaveBeenCalledWith(100);
  });
});

describe('Slider web keyboard and accessibility contracts', () => {
  it('supports Arrow, Page, Home and End while preserving controlled callback shape', () => {
    const onValueChange = vi.fn();
    const onValueCommit = vi.fn();
    const { rerender } = render(
      <Slider
        value={40}
        step={5}
        onValueChange={onValueChange}
        onValueCommit={onValueCommit}
        accessibilityLabel="밝기"
        valueText={(value) => `${value}%`}
      />,
    );
    let thumb = screen.getByRole('slider', { name: '밝기' });
    expect(thumb.getAttribute('aria-valuemin')).toBe('0');
    expect(thumb.getAttribute('aria-valuemax')).toBe('100');
    expect(thumb.getAttribute('aria-valuenow')).toBe('40');
    expect(thumb.getAttribute('aria-valuetext')).toBe('40%');

    fireEvent.keyDown(thumb, { key: 'ArrowRight' });
    expect(onValueChange).toHaveBeenLastCalledWith(45);
    expect(onValueCommit).toHaveBeenLastCalledWith(45);

    rerender(
      <Slider value={45} step={5} onValueChange={onValueChange} onValueCommit={onValueCommit} accessibilityLabel="밝기" />,
    );
    thumb = screen.getByRole('slider', { name: '밝기' });
    fireEvent.keyDown(thumb, { key: 'PageDown' });
    expect(onValueChange).toHaveBeenLastCalledWith(35);
    fireEvent.keyDown(thumb, { key: 'Home' });
    expect(onValueChange).toHaveBeenLastCalledWith(0);
    fireEvent.keyDown(thumb, { key: 'End' });
    expect(onValueChange).toHaveBeenLastCalledWith(100);
    expect(onValueCommit).toHaveBeenCalledTimes(4);
  });

  it('reverses left/right arrows and visual coordinates in RTL while keeping up/down logical', () => {
    const onValueChange = vi.fn();
    render(
      <Slider
        value={25}
        step={5}
        direction="rtl"
        onValueChange={onValueChange}
        accessibilityLabel="오른쪽에서 시작"
        testID="rtl"
      />,
    );
    const thumb = screen.getByRole('slider', { name: '오른쪽에서 시작' });
    expect(thumb.style.left).toBe('75%');
    fireEvent.keyDown(thumb, { key: 'ArrowRight' });
    expect(onValueChange).toHaveBeenLastCalledWith(20);
    fireEvent.keyDown(thumb, { key: 'ArrowUp' });
    expect(onValueChange).toHaveBeenLastCalledWith(25);

    const root = screen.getByTestId('rtl');
    setTrackWidth(root);
    fireEvent.click(root, { clientX: 10 });
    expect(onValueChange).toHaveBeenLastCalledWith(90);
  });

  it('exposes two separately named 44px adjustable targets and has no nested button', () => {
    render(
      <Slider
        mode="range"
        value={[15, 85]}
        onValueChange={() => {}}
        accessibilityLabels={["낮은 값", "높은 값"]}
        testID="range"
      />,
    );
    const root = screen.getByTestId('range');
    const thumbs = screen.getAllByRole('slider');
    expect(thumbs.map((thumb) => thumb.getAttribute('aria-label'))).toEqual(['낮은 값', '높은 값']);
    expect(thumbs[0]?.getAttribute('aria-valuemin')).toBe('0');
    expect(thumbs[0]?.getAttribute('aria-valuemax')).toBe('85');
    expect(thumbs[1]?.getAttribute('aria-valuemin')).toBe('15');
    expect(thumbs[1]?.getAttribute('aria-valuemax')).toBe('100');
    expect(thumbs[0]?.style.width).toBe('44px');
    expect(thumbs[0]?.style.height).toBe('44px');
    expect(root.querySelectorAll('button, [role="button"]')).toHaveLength(0);
  });

  it('forwards root, track, range and thumb escape hatches without changing semantics', () => {
    render(
      <Slider
        value={50}
        onValueChange={() => {}}
        accessibilityLabel="스타일"
        className="slider-root"
        trackClassName="slider-track"
        rangeClassName="slider-range"
        thumbClassName="slider-thumb"
        style={{ marginTop: 7 }}
        trackStyle={{ opacity: 0.8 }}
        rangeStyle={{ opacity: 0.7 }}
        thumbStyle={{ opacity: 0.6 }}
        testID="styled"
      />,
    );
    expect(screen.getByTestId('styled').style.marginTop).toBe('7px');
    expect(screen.getByTestId('styled-track').style.opacity).toBe('0.8');
    expect(screen.getByTestId('styled-range').style.opacity).toBe('0.7');
    expect(screen.getByTestId('styled-thumb-0').style.opacity).toBe('0.6');
    expect(screen.getByTestId('styled-thumb-0').style.width).toBe('44px');
    expect(screen.getByRole('slider', { name: '스타일' })).toBeTruthy();
  });
});

describe('Slider defensive contracts', () => {
  it('fails fast for invalid controlled configuration and blocks every disabled route', () => {
    expect(() =>
      render(<Slider value={4} min={5} max={5} onValueChange={() => {}} accessibilityLabel="오류" />),
    ).toThrow('Slider min must be less than max.');
    expect(() =>
      render(<Slider value={4} step={0} onValueChange={() => {}} accessibilityLabel="오류" />),
    ).toThrow('Slider step must be greater than 0.');
    expect(() =>
      render(<Slider value={4} min={0} max={10} step={3} onValueChange={() => {}} accessibilityLabel="오류" />),
    ).toThrow('max must align');
    expect(() =>
      render(<Slider value={8} min={0} max={12} step={3} onValueChange={() => {}} accessibilityLabel="오류" />),
    ).toThrow('value must align');
    expect(() =>
      render(<Slider value={4} onValueChange={() => {}} accessibilityLabel="" />),
    ).toThrow('non-empty');
    expect(() =>
      render(
        <Slider
          mode="range"
          value={[70, 40]}
          onValueChange={() => {}}
          accessibilityLabels={["낮음", "높음"]}
        />,
      ),
    ).toThrow('Slider range lower value must not exceed upper value.');
    expect(() =>
      render(
        <Slider
          mode="range"
          value={[20, 80]}
          step={10}
          minDistance={15}
          onValueChange={() => {}}
          accessibilityLabels={["낮음", "높음"]}
        />,
      ),
    ).toThrow('minDistance must align');
    expect(() =>
      render(
        <Slider
          mode="range"
          value={[20, 80]}
          onValueChange={() => {}}
          accessibilityLabels={["하나"] as unknown as readonly [string, string]}
        />,
      ),
    ).toThrow('exactly two strings');
    expect(() =>
      render(
        <Slider
          mode="range"
          value={[20, 80]}
          onValueChange={() => {}}
          accessibilityLabels={["낮음", 1] as unknown as readonly [string, string]}
        />,
      ),
    ).toThrow('non-empty strings');

    const onValueChange = vi.fn();
    render(<Slider value={50} disabled onValueChange={onValueChange} accessibilityLabel="잠김" />);
    const thumb = screen.getByRole('slider', { name: '잠김' });
    fireEvent.keyDown(thumb, { key: 'ArrowRight' });
    expect(onValueChange).not.toHaveBeenCalled();
    expect(thumb.getAttribute('aria-disabled')).toBe('true');
  });
});
