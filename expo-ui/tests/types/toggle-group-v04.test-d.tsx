import { describe, expectTypeOf, it } from 'vitest';
import { View } from 'react-native';
import { ToggleGroup } from '../../src/index';

const items = [
  { value: 'grid', label: '격자' },
  { value: 'list', icon: <View />, accessibilityLabel: '목록' },
] as const;

describe('ToggleGroup literal and selection contracts', () => {
  it('keeps single values nullable and multiple values readonly arrays', () => {
    void (
      <ToggleGroup
        selectionMode="single"
        accessibilityLabel="보기"
        items={items}
        value="grid"
        onValueChange={(value) => expectTypeOf(value).toEqualTypeOf<'grid' | 'list' | null>()}
      />
    );
    void (
      <ToggleGroup
        selectionMode="multiple"
        accessibilityLabel="보기"
        items={items}
        value={['grid']}
        onValueChange={(value) => expectTypeOf(value).toEqualTypeOf<readonly ('grid' | 'list')[]>()}
      />
    );

    // @ts-expect-error item literal 밖의 single value는 거부한다
    void (<ToggleGroup selectionMode="single" accessibilityLabel="보기" items={items} value="table" onValueChange={() => {}} />);
    // @ts-expect-error multiple mode에는 배열 값이 필요하다
    void (<ToggleGroup selectionMode="multiple" accessibilityLabel="보기" items={items} value="grid" onValueChange={() => {}} />);
    // @ts-expect-error allowEmpty는 single mode 전용이다
    void (<ToggleGroup selectionMode="multiple" accessibilityLabel="보기" items={items} value={[]} allowEmpty onValueChange={() => {}} />);
  });

  it('requires a name for icon-only items and rejects legacy unstyled', () => {
    void (
      <ToggleGroup
        selectionMode="single"
        accessibilityLabel="정렬"
        items={[{ value: 'left', icon: <View />, accessibilityLabel: '왼쪽 정렬' }]}
        value="left"
        onValueChange={() => {}}
      />
    );
    // @ts-expect-error icon-only item은 접근성 이름이 필수다
    void (<ToggleGroup selectionMode="single" accessibilityLabel="정렬" items={[{ value: 'left', icon: <View /> }]} value="left" onValueChange={() => {}} />);
    // @ts-expect-error unstyled 이관 잔재는 허용하지 않는다
    void (<ToggleGroup selectionMode="single" accessibilityLabel="보기" items={items} value="grid" onValueChange={() => {}} unstyled />);
  });
});
