/** AspectRatio — 미디어 슬롯의 비율을 플랫폼 공통 View 스타일로 고정한다. */
import type { ReactElement, ReactNode } from 'react';
import { View } from 'react-native';
import { nativeWindProps } from './internal';
import type { CommonProps } from './internal';

export interface AspectRatioProps extends Omit<CommonProps, 'unstyled'> {
  /** width / height. 0보다 큰 유한수만 허용한다. */
  ratio: number;
  /** 생략할 수 있지만 전달한다면 null/undefined가 아닌 노드여야 한다. */
  children?: NonNullable<ReactNode>;
  unstyled?: never;
}

export function AspectRatio({
  ratio,
  children,
  style,
  className,
  testID,
}: AspectRatioProps): ReactElement {
  if (!Number.isFinite(ratio) || ratio <= 0) {
    throw new RangeError('AspectRatio ratio must be a finite number greater than 0.');
  }

  return (
    <View
      testID={testID}
      {...nativeWindProps(className)}
      style={[style, { aspectRatio: ratio, width: '100%' }]}
    >
      {children}
    </View>
  );
}
