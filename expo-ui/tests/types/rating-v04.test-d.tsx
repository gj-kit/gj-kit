import { describe, it, expectTypeOf } from 'vitest';
import { View } from 'react-native';
import {
  Rating,
  type InteractiveRatingProps,
  type RatingProps,
  type ReadonlyRatingProps,
} from '../../src/index';

describe('Rating controlled contracts', () => {
  it('keeps interactive and readonly branches distinct', () => {
    const interactive: InteractiveRatingProps = {
      value: undefined,
      onChange: (value) => {
        expectTypeOf(value).toEqualTypeOf<number | undefined>();
      },
      halfStep: true,
      clearable: true,
      accessibilityLabel: '커피 평점',
      valueText: (value, maxRating) => value === undefined ? `없음 / ${maxRating}` : `${value}`,
    };
    const display: ReadonlyRatingProps = {
      value: 4.5,
      readonly: true,
      halfStep: true,
      accessibilityLabel: '기록 평점',
    };
    expectTypeOf(interactive).toMatchTypeOf<RatingProps>();
    expectTypeOf(display).toMatchTypeOf<RatingProps>();

    void <Rating {...interactive} />;
    void <Rating {...display} />;
    void <Rating value={3} onChange={() => {}} accessibilityLabel="정수 평점" size="sm" />;

    // @ts-expect-error interactive Rating requires the controlled callback
    void <Rating value={3} accessibilityLabel="평점" />;
    // @ts-expect-error readonly Rating must not have the interactive callback
    void <Rating value={3} readonly onChange={() => {}} accessibilityLabel="평점" />;
    // @ts-expect-error readonly Rating cannot have clear behavior
    void <Rating value={3} readonly clearable accessibilityLabel="평점" />;
    // @ts-expect-error only sm/md/lg are valid rating sizes
    void <Rating value={3} onChange={() => {}} accessibilityLabel="평점" size="xl" />;
    // @ts-expect-error the shared unstyled migration escape hatch is deliberately unavailable
    void <Rating value={3} onChange={() => {}} accessibilityLabel="평점" unstyled />;
    // @ts-expect-error Rating has no arbitrary child composition
    void <Rating value={3} onChange={() => {}} accessibilityLabel="평점"><View /></Rating>;
  });
});
