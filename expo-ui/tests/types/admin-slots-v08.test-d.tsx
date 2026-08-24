/**
 * Round B admin-lane contracts — Badge accessibilityLabel, Section heading /
 * count slot, Accordion & Chip trailing, ConfirmDialog animationType,
 * EmptyState compact, pressable Card.
 */
import { describe, expectTypeOf, it } from 'vitest';
import { Text as RNText } from 'react-native';
import {
  Accordion,
  Badge,
  Card,
  Chip,
  ConfirmDialog,
  EmptyState,
  Section,
} from '../../src/index';
import type {
  AccordionItem,
  BadgeProps,
  CardProps,
  ConfirmDialogProps,
  EmptyStateProps,
  EmptyStateVariant,
  PressableCardProps,
  SectionProps,
  StaticCardProps,
} from '../../src/index';

const noop = (): void => undefined;

describe('Badge accessibilityLabel', () => {
  it('is an optional string that never replaces the required visible label', () => {
    expectTypeOf<BadgeProps['accessibilityLabel']>().toEqualTypeOf<string | undefined>();
    void (<Badge label="결제 완료" accessibilityLabel="결제 완료 (PAID)" />);
    void (<Badge label="결제 완료" />);
    // @ts-expect-error the accessible name override is a string, not a node
    void (<Badge label="결제 완료" accessibilityLabel={<RNText>PAID</RNText>} />);
    // @ts-expect-error the override cannot stand in for the visible label
    void (<Badge accessibilityLabel="결제 완료 (PAID)" />);
  });
});

describe('Section heading and count slot', () => {
  it('accepts only real HTML heading levels and a numeric count', () => {
    expectTypeOf<SectionProps['headingLevel']>().toEqualTypeOf<
      1 | 2 | 3 | 4 | 5 | 6 | undefined
    >();
    expectTypeOf<SectionProps['count']>().toEqualTypeOf<number | undefined>();
    void (
      <Section
        title="결제"
        headingLevel={2}
        titleStyle={{ letterSpacing: 1 }}
        titleClassName="tracking-tight"
        count={40}
        countAccessibilityLabel="812건 중 40건"
        accessory={<RNText>보조</RNText>}
      />
    );
    void (<Section title="결제" />);
    // @ts-expect-error 0 is not an HTML heading level
    void (<Section title="결제" headingLevel={0} />);
    // @ts-expect-error 7 is not an HTML heading level
    void (<Section title="결제" headingLevel={7} />);
    // @ts-expect-error formatting stays with the caller — count is a number
    void (<Section title="결제" count="40 / 812" />);
    // @ts-expect-error the pill name is a string
    void (<Section title="결제" count={40} countAccessibilityLabel={40} />);
  });
});

describe('AccordionItem trailing', () => {
  it('is a presentation-only node slot', () => {
    expectTypeOf<AccordionItem<'a'>['trailing']>().toEqualTypeOf<
      React.ReactNode | undefined
    >();
    const items = [
      {
        value: 'payments',
        title: '최근 결제',
        trailing: <RNText>12</RNText>,
        content: <RNText>내역</RNText>,
      },
    ] as const;
    void (<Accordion items={items} value={null} onValueChange={noop} />);
    void (
      <Accordion
        // @ts-expect-error a render callback is not a node — pass the element itself
        items={[{ value: 'a', title: '제목', trailing: () => null, content: <RNText>x</RNText> }] as const}
        value={null}
        onValueChange={noop}
      />
    );
  });
});

describe('Chip count and trailing', () => {
  it('exist on every kind, with count as a number', () => {
    void (<Chip kind="filter" label="완료" count={700} selected onSelectedChange={noop} />);
    void (<Chip kind="action" label="필터" count={3} trailing={<RNText>●</RNText>} onPress={noop} />);
    void (<Chip kind="static" label="완료" count={700} />);
    void (
      <Chip
        kind="removable"
        label="태그"
        count={2}
        onRemove={noop}
        removeAccessibilityLabel="태그 제거"
      />
    );
    // @ts-expect-error the count is numeric — pre-formatted strings belong in the label
    void (<Chip kind="static" label="완료" count="700" />);
    // @ts-expect-error a render callback is not a node
    void (<Chip kind="static" label="완료" trailing={() => null} />);
  });
});

describe('ConfirmDialog animationType', () => {
  it('is the closed Modal union passed through to Dialog', () => {
    expectTypeOf<ConfirmDialogProps['animationType']>().toEqualTypeOf<
      'none' | 'slide' | 'fade' | undefined
    >();
    void (
      <ConfirmDialog visible title="삭제" animationType="none" onConfirm={noop} onDismiss={noop} />
    );
    void (
      // @ts-expect-error only the three Modal animation types exist
      <ConfirmDialog visible title="삭제" animationType="pop" onConfirm={noop} onDismiss={noop} />
    );
  });
});

describe('EmptyState variant', () => {
  it('is a closed default/compact union', () => {
    expectTypeOf<EmptyStateVariant>().toEqualTypeOf<'default' | 'compact'>();
    expectTypeOf<EmptyStateProps['variant']>().toEqualTypeOf<EmptyStateVariant | undefined>();
    void (<EmptyState variant="compact" title="결제 내역 없음" />);
    // @ts-expect-error only default and compact exist
    void (<EmptyState variant="inline" />);
  });
});

describe('Card pressable and selectable form', () => {
  it('requires an explicit accessible name whenever the card is pressable', () => {
    expectTypeOf<CardProps>().toEqualTypeOf<StaticCardProps | PressableCardProps>();
    expectTypeOf<PressableCardProps['selected']>().toEqualTypeOf<boolean | undefined>();
    void (
      <Card onPress={noop} accessibilityLabel="표준 시나리오 선택">
        <RNText>표준 시나리오</RNText>
      </Card>
    );
    void (
      <Card onPress={noop} selected accessibilityLabel="표준 시나리오" accessibilityHint="시나리오를 전환합니다" disabled={false}>
        <RNText>표준 시나리오</RNText>
      </Card>
    );
    void (
      <Card>
        <RNText>정적 카드</RNText>
      </Card>
    );
    void (
      // @ts-expect-error rich children never name a pressable card implicitly
      <Card onPress={noop}>
        <RNText>이름 없는 카드</RNText>
      </Card>
    );
    void (
      // @ts-expect-error selection is a pressable-card state — a static card has no widget state
      <Card selected>
        <RNText>정적 카드</RNText>
      </Card>
    );
    void (
      // @ts-expect-error disabled implies an interactive card
      <Card disabled>
        <RNText>정적 카드</RNText>
      </Card>
    );
    void (
      // @ts-expect-error a hint without a control has no meaning
      <Card accessibilityHint="설명">
        <RNText>정적 카드</RNText>
      </Card>
    );
  });
});
