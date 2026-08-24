/**
 * Round E2 — renderTrigger 주입 계약과 anchored 프레젠테이션의 타입 강제.
 *
 * 주입 props가 press를 전달하는 Pressable 호스트에 그대로 spread되는지,
 * renderTrigger와 owned 트리거 시각 prop의 조합이 컴파일에서 거부되는지
 * 고정한다.
 */
import { describe, expectTypeOf, it } from 'vitest';
import { Pressable, Text, View } from 'react-native';
import { Dialog, Menu, Select } from '../../src/index';
import type { MenuItem, SelectItem, TriggerRenderProps } from '../../src/index';

const menuItems = [
  { kind: 'action', value: 'edit', label: 'Edit' },
  { kind: 'checkbox', value: 'favorite', label: 'Favorite', checked: false },
] as const satisfies readonly MenuItem<'edit' | 'favorite'>[];

const selectItems = [
  { value: 'recent', label: 'Recent' },
  { value: 'oldest', label: 'Oldest' },
] as const satisfies readonly SelectItem<'recent' | 'oldest'>[];

describe('Menu renderTrigger injected-props contract', () => {
  it('injects a typed contract that spreads onto a pressable host', () => {
    void (
      <Menu
        triggerLabel="Actions"
        items={menuItems}
        open={false}
        onOpenChange={() => {}}
        onSelect={() => {}}
        renderTrigger={(trigger) => {
          expectTypeOf(trigger).toEqualTypeOf<TriggerRenderProps>();
          expectTypeOf(trigger.accessibilityState.expanded).toEqualTypeOf<boolean>();
          expectTypeOf(trigger['aria-expanded']).toEqualTypeOf<boolean>();
          expectTypeOf(trigger.disabled).toEqualTypeOf<boolean>();
          return (
            <Pressable {...trigger}>
              <Text>모두 보기</Text>
            </Pressable>
          );
        }}
      />
    );
    // 유효한 호스트는 press를 실제로 전달하는 Pressable(동급 pressability
    // 래퍼)뿐이다 — 일반 View는 주입 onPress를 조용히 버리므로 계약 밖이다.
    // JSX spread는 excess-property 검사를 받지 않아 타입만으로 View를 거부할
    // 수 없다: 그 구멍은 런타임 웹 배선 assert와 문서가 막는다.
    const spreadOntoPressable = (trigger: TriggerRenderProps) => (
      <Pressable {...trigger} />
    );
    void spreadOntoPressable;
  });

  it('rejects owned trigger visuals and malformed slots while renderTrigger is present', () => {
    // @ts-expect-error renderTrigger owns the visuals — variant is forbidden
    void (<Menu triggerLabel="Actions" items={menuItems} open={false} onOpenChange={() => {}} onSelect={() => {}} renderTrigger={() => <View />} variant="outlined" />);
    // @ts-expect-error renderTrigger owns the visuals — size is forbidden
    void (<Menu triggerLabel="Actions" items={menuItems} open={false} onOpenChange={() => {}} onSelect={() => {}} renderTrigger={() => <View />} size="sm" />);
    // @ts-expect-error renderTrigger owns the visuals — triggerStyle is forbidden
    void (<Menu triggerLabel="Actions" items={menuItems} open={false} onOpenChange={() => {}} onSelect={() => {}} renderTrigger={() => <View />} triggerStyle={{ opacity: 1 }} />);
    // @ts-expect-error renderTrigger owns the visuals — triggerHoverStyle is forbidden
    void (<Menu triggerLabel="Actions" items={menuItems} open={false} onOpenChange={() => {}} onSelect={() => {}} renderTrigger={() => <View />} triggerHoverStyle={{ opacity: 1 }} />);
    // @ts-expect-error renderTrigger owns the visuals — iconOnly/triggerIcon are forbidden
    void (<Menu triggerLabel="Actions" items={menuItems} open={false} onOpenChange={() => {}} onSelect={() => {}} renderTrigger={() => <View />} iconOnly triggerIcon={<View />} />);
    // @ts-expect-error triggerLabel remains the required accessible name with renderTrigger
    void (<Menu items={menuItems} open={false} onOpenChange={() => {}} onSelect={() => {}} renderTrigger={() => <View />} />);
    // @ts-expect-error renderTrigger must return a ReactElement
    void (<Menu triggerLabel="Actions" items={menuItems} open={false} onOpenChange={() => {}} onSelect={() => {}} renderTrigger={() => 'not-an-element'} />);
  });
});

describe('Select renderTrigger and anchored presentation vocabulary', () => {
  it('keeps the injected value text optional-typed and forbids owned visuals', () => {
    void (
      <Select
        label="Sort order"
        placeholder="Choose"
        items={selectItems}
        value={null}
        onValueChange={() => {}}
        open={false}
        onOpenChange={() => {}}
        renderTrigger={(trigger) => {
          expectTypeOf(trigger.accessibilityValue).toEqualTypeOf<
            { readonly text: string } | undefined
          >();
          return (
            <Pressable {...trigger}>
              <Text>{trigger.accessibilityValue?.text}</Text>
            </Pressable>
          );
        }}
      />
    );
    // @ts-expect-error renderTrigger owns the visuals — leading is forbidden
    void (<Select label="Sort" placeholder="Choose" items={selectItems} value={null} onValueChange={() => {}} open={false} onOpenChange={() => {}} renderTrigger={() => <View />} leading={<View />} />);
    // @ts-expect-error renderTrigger owns the visuals — valueStyle is forbidden
    void (<Select label="Sort" placeholder="Choose" items={selectItems} value={null} onValueChange={() => {}} open={false} onOpenChange={() => {}} renderTrigger={() => <View />} valueStyle={{ opacity: 1 }} />);
    // @ts-expect-error renderTrigger owns the visuals — size is forbidden
    void (<Select label="Sort" placeholder="Choose" items={selectItems} value={null} onValueChange={() => {}} open={false} onOpenChange={() => {}} renderTrigger={() => <View />} size="sm" />);
  });

  it('accepts the Android coordinate props of the anchored Dialog surface', () => {
    void (
      <Dialog
        visible
        onDismiss={() => {}}
        accessibilityLabel="Anchored panel"
        statusBarTranslucent
        navigationBarTranslucent
      >
        <View />
      </Dialog>
    );
    // @ts-expect-error statusBarTranslucent is a boolean flag
    void (<Dialog visible onDismiss={() => {}} accessibilityLabel="Anchored panel" statusBarTranslucent="yes"><View /></Dialog>);
    // @ts-expect-error navigationBarTranslucent is a boolean flag
    void (<Dialog visible onDismiss={() => {}} accessibilityLabel="Anchored panel" navigationBarTranslucent={1}><View /></Dialog>);
  });

  it('accepts the anchored native presentation and rejects unknown values', () => {
    void (<Menu triggerLabel="Actions" items={menuItems} open={false} onOpenChange={() => {}} onSelect={() => {}} presentation="anchored" />);
    void (<Select label="Sort" placeholder="Choose" items={selectItems} value={null} onValueChange={() => {}} open={false} onOpenChange={() => {}} presentation="anchored" />);
    // @ts-expect-error presentation vocabulary is closed
    void (<Menu triggerLabel="Actions" items={menuItems} open={false} onOpenChange={() => {}} onSelect={() => {}} presentation="popover" />);
    // @ts-expect-error presentation vocabulary is closed
    void (<Select label="Sort" placeholder="Choose" items={selectItems} value={null} onValueChange={() => {}} open={false} onOpenChange={() => {}} presentation="popover" />);
  });
});
