import { describe, expectTypeOf, it } from 'vitest';
import { ConfirmDialog, SegmentedControl } from '../../src/index';
import type {
  ConfirmDialogDismissDetails,
  SegmentedControlItem,
} from '../../src/index';

const noop = (): void => undefined;
const items = [
  { value: 'day', label: 'Day' },
  { value: 'week', label: 'Week' },
] as const satisfies readonly SegmentedControlItem<'day' | 'week'>[];

describe('ConfirmDialog controlled contracts', () => {
  it('requires caller-owned visibility and handlers while exposing typed dismissal details', () => {
    void (
      <ConfirmDialog
        visible
        title="Delete entry"
        description="This cannot be undone."
        confirmVariant="destructive"
        onConfirm={noop}
        onDismiss={(details) => {
          expectTypeOf(details).toEqualTypeOf<ConfirmDialogDismissDetails>();
          if (details.reason === 'cancel-action') {
            expectTypeOf(details.reason).toEqualTypeOf<'cancel-action'>();
          }
        }}
      />
    );
    void (
      <ConfirmDialog
        visible={false}
        title="Save changes"
        confirmDisabled
        loading={false}
        onConfirm={noop}
        onDismiss={noop}
      />
    );

    // @ts-expect-error visibility is always controlled
    void (<ConfirmDialog title="Delete entry" onConfirm={noop} onDismiss={noop} />);
    // @ts-expect-error confirmation work is required
    void (<ConfirmDialog visible title="Delete entry" onDismiss={noop} />);
    // @ts-expect-error every dismiss request must be surfaced to the caller
    void (<ConfirmDialog visible title="Delete entry" onConfirm={noop} />);
    // @ts-expect-error secondary is not an affirmative confirmation variant
    void (<ConfirmDialog visible title="Delete entry" confirmVariant="secondary" onConfirm={noop} onDismiss={noop} />);
    // @ts-expect-error a narrow confirmation surface does not accept arbitrary children
    void (<ConfirmDialog visible title="Delete entry" onConfirm={noop} onDismiss={noop}>Body</ConfirmDialog>);
    // @ts-expect-error legacy unstyled mode is intentionally unavailable
    void (<ConfirmDialog visible title="Delete entry" onConfirm={noop} onDismiss={noop} unstyled />);
  });
});

describe('SegmentedControl required-choice generic contracts', () => {
  it('derives its exact value union from items and only permits one selected value', () => {
    void (
      <SegmentedControl
        items={items}
        value="day"
        accessibilityLabel="Time range"
        onValueChange={(value) => {
          expectTypeOf(value).toEqualTypeOf<'day' | 'week'>();
        }}
      />
    );
    void (
      <SegmentedControl
        items={items}
        value="week"
        accessibilityLabel="Time range"
        fit="content"
        size="sm"
        onValueChange={noop}
      />
    );

    // @ts-expect-error values outside items cannot influence the generic through NoInfer
    void (<SegmentedControl items={items} value="month" accessibilityLabel="Time range" onValueChange={noop} />);
    // @ts-expect-error radio selection is required rather than nullable
    void (<SegmentedControl items={items} value={null} accessibilityLabel="Time range" onValueChange={noop} />);
    // @ts-expect-error the radio group itself needs a stable accessible name
    void (<SegmentedControl items={items} value="day" onValueChange={noop} />);
    // @ts-expect-error tabs own panels; a segmented radio group does not
    void (<SegmentedControl items={items} value="day" accessibilityLabel="Time range" panels={{ day: 'Day', week: 'Week' }} onValueChange={noop} />);
    // @ts-expect-error every item needs a visible, non-optional label in the public shape
    void (<SegmentedControl items={[{ value: 'day' }]} value="day" accessibilityLabel="Time range" onValueChange={noop} />);
    // @ts-expect-error legacy unstyled mode is intentionally unavailable
    void (<SegmentedControl items={items} value="day" accessibilityLabel="Time range" onValueChange={noop} unstyled />);
  });
});
