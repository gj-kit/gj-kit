import { describe, expectTypeOf, it } from 'vitest';
import { View } from 'react-native';
import {
  Menu,
  OverlayProvider,
  Select,
} from '../../src/index';
import type {
  MenuItem,
  MenuOpenChangeDetails,
  MenuSelectDetails,
  SelectItem,
  SelectOpenChangeDetails,
} from '../../src/index';

const menuItems = [
  { kind: 'action', value: 'edit', label: 'Edit' },
  { kind: 'checkbox', value: 'favorite', label: 'Favorite', checked: 'mixed' },
] as const satisfies readonly MenuItem<'edit' | 'favorite'>[];

const selectItems = [
  { value: 'recent', label: 'Recent' },
  { value: 'oldest', label: 'Oldest', disabled: true },
] as const satisfies readonly SelectItem<'recent' | 'oldest'>[];

describe('Menu literal, controlled state, and item-kind contracts', () => {
  it('infers only item literals at selection and open-change boundaries', () => {
    void (
      <OverlayProvider>
        <Menu
          triggerLabel="Actions"
          items={menuItems}
          open={false}
          onOpenChange={(_open, details) => {
            expectTypeOf(details).toEqualTypeOf<
              MenuOpenChangeDetails<'edit' | 'favorite'>
            >();
          }}
          onSelect={(details) => {
            expectTypeOf(details).toEqualTypeOf<
              MenuSelectDetails<'edit' | 'favorite'>
            >();
            expectTypeOf(details.value).toEqualTypeOf<'edit' | 'favorite'>();
          }}
        />
      </OverlayProvider>
    );

    const wrong = (_details: MenuSelectDetails<'edit' | 'share'>): void => {};
    // @ts-expect-error callback cannot introduce a value absent from items
    void (<Menu triggerLabel="Actions" items={menuItems} open={false} onOpenChange={() => {}} onSelect={wrong} />);
  });

  it('requires controlled checkbox state and safe icon-only triggers', () => {
    void (<OverlayProvider><View /></OverlayProvider>);
    // @ts-expect-error internal registry host controls are not public API
    void (<OverlayProvider includeHost><View /></OverlayProvider>);
    // @ts-expect-error checkbox items require their controlled checked state
    void (<Menu triggerLabel="Actions" items={[{ kind: 'checkbox', value: 'pin', label: 'Pin' }]} open={false} onOpenChange={() => {}} onSelect={() => {}} />);
    // @ts-expect-error action items cannot pretend to expose checkbox state
    void (<Menu triggerLabel="Actions" items={[{ kind: 'action', value: 'pin', label: 'Pin', checked: true }]} open={false} onOpenChange={() => {}} onSelect={() => {}} />);
    // @ts-expect-error icon-only trigger must provide presentation content
    void (<Menu triggerLabel="More" iconOnly items={menuItems} open={false} onOpenChange={() => {}} onSelect={() => {}} />);
    void (<Menu triggerLabel="More" iconOnly triggerIcon={<View />} items={menuItems} open={false} onOpenChange={() => {}} onSelect={() => {}} />);
    // @ts-expect-error open is controlled and required
    void (<Menu triggerLabel="Actions" items={menuItems} onOpenChange={() => {}} onSelect={() => {}} />);
    // @ts-expect-error legacy unstyled escape hatch is forbidden
    void (<Menu triggerLabel="Actions" items={menuItems} open={false} onOpenChange={() => {}} onSelect={() => {}} unstyled />);
  });
});

describe('Select single-value and accessible-label contracts', () => {
  it('preserves the item literal union in value and callbacks', () => {
    void (
      <Select
        label="Sort order"
        placeholder="Choose"
        items={selectItems}
        value="recent"
        open={false}
        onValueChange={(value) => {
          expectTypeOf(value).toEqualTypeOf<'recent' | 'oldest'>();
        }}
        onOpenChange={(_open, details) => {
          expectTypeOf(details).toEqualTypeOf<
            SelectOpenChangeDetails<'recent' | 'oldest'>
          >();
        }}
      />
    );
    void (<Select accessibilityLabel="Sort order" placeholder="Choose" items={selectItems} value={null} open={false} onValueChange={() => {}} onOpenChange={() => {}} />);

    // @ts-expect-error value must come from the items literal union
    void (<Select label="Sort" placeholder="Choose" items={selectItems} value="popular" open={false} onValueChange={() => {}} onOpenChange={() => {}} />);
    const wrong = (_value: 'recent' | 'popular'): void => {};
    // @ts-expect-error callback cannot introduce a value absent from items
    void (<Select label="Sort" placeholder="Choose" items={selectItems} value="recent" open={false} onValueChange={wrong} onOpenChange={() => {}} />);
    // @ts-expect-error v1 is deliberately single-select
    void (<Select label="Sort" placeholder="Choose" items={selectItems} value={['recent']} open={false} onValueChange={() => {}} onOpenChange={() => {}} />);
  });

  it('requires a stable name, placeholder, and controlled open/value state', () => {
    // @ts-expect-error visible label or explicit accessibilityLabel is required
    void (<Select placeholder="Choose" items={selectItems} value={null} open={false} onValueChange={() => {}} onOpenChange={() => {}} />);
    // @ts-expect-error placeholder is required for the null state
    void (<Select label="Sort" items={selectItems} value={null} open={false} onValueChange={() => {}} onOpenChange={() => {}} />);
    // @ts-expect-error defaultValue is outside the controlled-only contract
    void (<Select label="Sort" placeholder="Choose" items={selectItems} value={null} defaultValue="recent" open={false} onValueChange={() => {}} onOpenChange={() => {}} />);
    // @ts-expect-error defaultOpen is outside the controlled-only contract
    void (<Select label="Sort" placeholder="Choose" items={selectItems} value={null} open={false} defaultOpen onValueChange={() => {}} onOpenChange={() => {}} />);
    // @ts-expect-error legacy unstyled escape hatch is forbidden
    void (<Select label="Sort" placeholder="Choose" items={selectItems} value={null} open={false} onValueChange={() => {}} onOpenChange={() => {}} unstyled />);
  });
});
