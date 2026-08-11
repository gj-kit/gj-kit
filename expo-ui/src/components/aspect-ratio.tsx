/** AspectRatio — pins the ratio of a media slot through a platform-shared View style. */
import type { ReactElement, ReactNode } from 'react';
import { View } from 'react-native';
import { nativeWindProps } from './internal';
import type { CommonProps } from './internal';

export interface AspectRatioProps extends Omit<CommonProps, 'unstyled'> {
  /** width / height. Only finite numbers greater than 0 are allowed. */
  ratio: number;
  /** It can be omitted, but if you pass it, it has to be a node — not null or undefined. */
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
