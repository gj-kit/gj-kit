import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getRatingAccessibilityValue, Rating } from '../../src/components/rating';
import { UiProvider } from '../../src/components/provider';
import { createTheme } from '../../src/theme/createTheme';
import { koStrings } from '../../src/strings/strings';

afterEach(cleanup);

function nativeRatingProps(element: HTMLElement): {
  readonly onAccessibilityAction?: (event: { readonly nativeEvent: { readonly actionName: string } }) => void;
  readonly accessibilityActions?: readonly { readonly name: string; readonly label?: string | undefined }[] | undefined;
  readonly accessibilityValue?: {
    readonly min: number;
    readonly max: number;
    readonly now?: number | undefined;
    readonly text: string;
  } | undefined;
} {
  const fiberKey = Object.keys(element).find((candidate) => candidate.startsWith('__reactFiber$'));
  let fiber = fiberKey === undefined
    ? undefined
    : (element as unknown as Record<string, {
        readonly memoizedProps?: Record<string, unknown>;
        readonly return?: unknown;
      }>)[fiberKey];
  while (fiber !== undefined) {
    if (typeof fiber.memoizedProps?.onAccessibilityAction === 'function') {
      return fiber.memoizedProps as {
        readonly onAccessibilityAction?: (event: { readonly nativeEvent: { readonly actionName: string } }) => void;
        readonly accessibilityActions?: readonly { readonly name: string; readonly label?: string | undefined }[] | undefined;
        readonly accessibilityValue?: {
          readonly min: number;
          readonly max: number;
          readonly now?: number | undefined;
          readonly text: string;
        } | undefined;
      };
    }
    fiber = fiber.return as typeof fiber | undefined;
  }
  throw new Error('Rating native accessibility action is unavailable.');
}

describe('Rating native accessibility scale', () => {
  it('uses integer range values for native half-steps while preserving web decimals', () => {
    const nativeValue = getRatingAccessibilityValue({
      value: 2.5,
      maxRating: 5,
      halfStep: true,
      clearable: false,
      valueText: '2.5 out of 5',
      platformOS: 'android',
    });
    expect(nativeValue).toEqual({ min: 1, max: 10, now: 5, text: '2.5 out of 5' });

    const webValue = getRatingAccessibilityValue({
      value: 2.5,
      maxRating: 5,
      halfStep: true,
      clearable: false,
      valueText: '2.5 out of 5',
      platformOS: 'web',
    });
    expect(webValue).toEqual({ min: 0.5, max: 5, now: 2.5, text: '2.5 out of 5' });
  });
});

describe('Rating controlled interaction and accessibility', () => {
  it('exposes one adjustable rating with its localized value and keyboard controls', () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <Rating
        value={2.5}
        onChange={onChange}
        halfStep
        clearable
        accessibilityLabel="커피 평점"
        clearAccessibilityLabel="평점 지우기"
        valueText={(value, maxRating) => value === undefined ? '평점 없음' : `${value}점 / ${maxRating}점`}
      />,
    );

    const rating = screen.getByRole('slider', { name: '커피 평점' });
    expect(rating.getAttribute('aria-valuemin')).toBe('0');
    expect(rating.getAttribute('aria-valuemax')).toBe('5');
    expect(rating.getAttribute('aria-valuenow')).toBe('2.5');
    expect(rating.getAttribute('aria-valuetext')).toBe('2.5점 / 5점');
    expect(rating.getAttribute('tabindex')).toBe('0');

    fireEvent.keyDown(rating, { key: 'ArrowRight' });
    expect(onChange).toHaveBeenLastCalledWith(3);

    rerender(
      <Rating
        value={3}
        onChange={onChange}
        halfStep
        clearable
        accessibilityLabel="커피 평점"
        clearAccessibilityLabel="평점 지우기"
        valueText={(value, maxRating) => value === undefined ? '평점 없음' : `${value}점 / ${maxRating}점`}
      />,
    );
    fireEvent.keyDown(screen.getByRole('slider', { name: '커피 평점' }), { key: 'Delete' });
    expect(onChange).toHaveBeenLastCalledWith(undefined);
  });

  it('handles native adjustable increment and custom clear actions', () => {
    const onChange = vi.fn();
    render(
      <Rating
        value={2.5}
        onChange={onChange}
        halfStep
        clearable
        accessibilityLabel="네이티브 평점"
        clearAccessibilityLabel="평점 지우기"
      />,
    );

    const actions = nativeRatingProps(screen.getByRole('slider', { name: '네이티브 평점' }));
    actions.onAccessibilityAction?.({ nativeEvent: { actionName: 'increment' } });
    expect(onChange).toHaveBeenLastCalledWith(3);
    actions.onAccessibilityAction?.({ nativeEvent: { actionName: 'clear' } });
    expect(onChange).toHaveBeenLastCalledWith(undefined);
  });

  it('uses half targets and clears a same selected value only when clearable', () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <Rating
        value={2.5}
        onChange={onChange}
        halfStep
        clearable
        accessibilityLabel="테스트 평점"
        testID="rating"
      />,
    );

    fireEvent.click(screen.getByTestId('rating-item-3-half'));
    expect(onChange).toHaveBeenLastCalledWith(undefined);

    rerender(
      <Rating
        value={undefined}
        onChange={onChange}
        halfStep
        clearable
        accessibilityLabel="테스트 평점"
        testID="rating"
      />,
    );
    fireEvent.click(screen.getByTestId('rating-item-3-half'));
    expect(onChange).toHaveBeenLastCalledWith(2.5);

    fireEvent.click(screen.getByTestId('rating-item-4-full'));
    expect(onChange).toHaveBeenLastCalledWith(4);
  });

  it('takes default Rating announcements and the clear action label from UiProvider strings', () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <UiProvider strings={koStrings}>
        <Rating
          value={2.5}
          onChange={onChange}
          halfStep
          clearable
          accessibilityLabel="커피 평점"
        />
      </UiProvider>,
    );

    const selected = screen.getByRole('slider', { name: '커피 평점' });
    expect(selected.getAttribute('aria-valuetext')).toBe('2.5점 / 5점');
    expect(nativeRatingProps(selected).accessibilityActions).toContainEqual({
      name: 'clear',
      label: '평점 지우기',
    });

    rerender(
      <UiProvider strings={koStrings}>
        <Rating
          value={undefined}
          onChange={onChange}
          halfStep
          clearable
          accessibilityLabel="커피 평점"
        />
      </UiProvider>,
    );
    expect(screen.getByRole('slider', { name: '커피 평점' }).getAttribute('aria-valuetext')).toBe('평점 없음');
  });

  it('keeps the visual dots decorative and reports read-only output as one image', () => {
    const theme = createTheme('light', {
      colors: { primary: '#123456', line: '#ABCDEF' },
    });
    render(
      <UiProvider theme={theme}>
        <Rating
          value={3.5}
          readonly
          halfStep
          size="lg"
          accessibilityLabel="기록 평점"
          valueText={(value, maxRating) => `${value}점 / ${maxRating}점`}
          testID="display-rating"
        />
      </UiProvider>,
    );

    const rating = screen.getByRole('img', { name: '기록 평점: 3.5점 / 5점' });
    expect(rating).toBe(screen.getByTestId('display-rating'));
    expect(screen.queryByRole('slider')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();

    const halfMark = screen.getByTestId('display-rating-mark-4');
    expect(halfMark.style.width).toBe('18px');
    expect((halfMark.firstElementChild as HTMLElement).style.backgroundColor).toBe('rgb(18, 52, 86)');
    expect((halfMark.lastElementChild as HTMLElement).style.backgroundColor).toBe('rgb(171, 205, 239)');
  });

  it('disables all keyboard and pointer value changes', () => {
    const onChange = vi.fn();
    render(
      <Rating
        value={2}
        onChange={onChange}
        disabled
        accessibilityLabel="잠긴 평점"
        testID="disabled-rating"
      />,
    );

    const rating = screen.getByRole('slider', { name: '잠긴 평점' });
    expect(rating.getAttribute('aria-disabled')).toBe('true');
    expect(rating.getAttribute('tabindex')).toBe('-1');
    fireEvent.keyDown(rating, { key: 'ArrowRight' });
    fireEvent.click(screen.getByTestId('disabled-rating-item-3'));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('rejects invalid limits and off-grid controlled values at render time', () => {
    expect(() => render(
      <Rating value={1} onChange={() => {}} maxRating={0} accessibilityLabel="평점" />,
    )).toThrow('maxRating');
    expect(() => render(
      <Rating value={1} onChange={() => {}} maxRating={11} accessibilityLabel="평점" />,
    )).toThrow('maxRating');
    expect(() => render(
      <Rating value={2.5} onChange={() => {}} accessibilityLabel="평점" />,
    )).toThrow('step');
    expect(() => render(
      <Rating value={0} onChange={() => {}} accessibilityLabel="평점" />,
    )).toThrow('selectable rating range');
  });
});
