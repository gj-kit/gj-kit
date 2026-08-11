import { describe, expectTypeOf, it } from 'vitest';
import { Text, View } from 'react-native';
import { ActionSheet } from '../../src/components/action-sheet';
import type {
  ActionSheetDismissDetails,
  ActionSheetItem,
} from '../../src/components/action-sheet';
import { Dialog, DialogPanel } from '../../src/components/dialog';
import type {
  DialogDismissDetails,
  DialogDismissReason,
  DialogPresentation,
} from '../../src/components/dialog';

const noop = (): void => undefined;

describe('Dialog v2 type contracts', () => {
  it('keeps legacy handlers assignable while exposing exact reason details', () => {
    void (
      <Dialog visible onDismiss={noop} dismissOnBackdrop>
        <DialogPanel title="Legacy-compatible" />
      </Dialog>
    );
    void (
      <Dialog
        visible
        onDismiss={(details) => {
          expectTypeOf(details).toEqualTypeOf<DialogDismissDetails>();
          expectTypeOf(details.reason).toEqualTypeOf<DialogDismissReason>();
        }}
      >
        <DialogPanel title="Typed details" />
      </Dialog>
    );

    // @ts-expect-error Dialog content is non-null and required
    void (<Dialog visible onDismiss={noop} />);
    // @ts-expect-error undefined content cannot silently produce an unnamed empty modal
    void (<Dialog visible onDismiss={noop}>{undefined}</Dialog>);
  });

  it('derives a direct DialogPanel name and requires a name for arbitrary content', () => {
    void (
      <Dialog visible onDismiss={noop}>
        <DialogPanel title="Automatic name" description="Automatic description" />
      </Dialog>
    );
    void (
      <Dialog visible onDismiss={noop} accessibilityLabel="Custom editor">
        <View><Text>Arbitrary tree</Text></View>
      </Dialog>
    );
    // React's JSX.Element erases component identity to ReactElement<any, any>, so the
    // runtime guard closes the React-element loophole. Non-element arbitrary content
    // is still rejected statically by the discriminated public contract.
    // @ts-expect-error arbitrary text content must opt into an explicit accessible name
    void (<Dialog visible onDismiss={noop}>Unnamed text</Dialog>);

    void (
      <Dialog visible presentation="inline" onDismiss={noop}>
        <View><Text>Inline arbitrary content</Text></View>
      </Dialog>
    );
    const responsivePresentation: DialogPresentation =
      Math.random() > 0.5 ? 'modal' : 'inline';
    void (
      <Dialog visible presentation={responsivePresentation} onDismiss={noop}>
        <DialogPanel title="Responsive direct panel" />
      </Dialog>
    );
    // @ts-expect-error inline is deliberately non-modal and cannot pretend to have a dialog name
    void (<Dialog visible presentation="inline" accessibilityLabel="Not a dialog" onDismiss={noop}>Inline text</Dialog>);
  });

  it('only accepts the shared Dialog reason subset', () => {
    const accepted: DialogDismissReason = 'close-action';
    expectTypeOf(accepted).toMatchTypeOf<DialogDismissReason>();
    // @ts-expect-error outside-press belongs to anchored overlays, not Dialog
    const rejected: DialogDismissReason = 'outside-press';
    void rejected;
  });
});

describe('ActionSheet generic value and dismissal contracts', () => {
  const items = [
    { value: 'archive', label: 'Archive' },
    { value: 'delete', label: 'Delete', destructive: true },
  ] as const satisfies readonly ActionSheetItem<'archive' | 'delete'>[];

  it('infers the item value union and uses NoInfer at the callback boundary', () => {
    void (
      <ActionSheet
        visible
        title="Actions"
        items={items}
        onDismiss={(details) => {
          expectTypeOf(details).toEqualTypeOf<
            ActionSheetDismissDetails<'archive' | 'delete'>
          >();
          if (details.reason === 'action-select') {
            expectTypeOf(details.value).toEqualTypeOf<'archive' | 'delete'>();
          }
        }}
      />
    );

    const wrongHandler = (_details: ActionSheetDismissDetails<'archive' | 'share'>): void => {};
    // @ts-expect-error callback annotation cannot add a value absent from items
    void (<ActionSheet visible title="Actions" items={items} onDismiss={wrongHandler} />);
  });

  it('allows dynamic empty arrays and rejects nullable or non-string values', () => {
    const dynamic: readonly ActionSheetItem<string>[] = [];
    void (
      <ActionSheet visible title="No actions" items={dynamic} onDismiss={noop} />
    );
    void (<ActionSheet visible title="No actions" items={[]} onDismiss={noop} />);

    // @ts-expect-error action values follow the string-literal convention used by Tabs/Radio
    void (<ActionSheet visible title="Invalid" items={[{ value: 1, label: 'One' }]} onDismiss={noop} />);
    // @ts-expect-error nullable item entries are not valid action descriptions
    void (<ActionSheet visible title="Invalid" items={[null]} onDismiss={noop} />);
  });

  it('requires controlled visibility, a title, items, and the dismissal callback', () => {
    // @ts-expect-error visible is controlled and required
    void (<ActionSheet title="Actions" items={items} onDismiss={noop} />);
    // @ts-expect-error title provides the accessible name and is required
    void (<ActionSheet visible items={items} onDismiss={noop} />);
    // @ts-expect-error items are required even though an empty array is allowed
    void (<ActionSheet visible title="Actions" onDismiss={noop} />);
    // @ts-expect-error dismissal details are the only output and the callback is required
    void (<ActionSheet visible title="Actions" items={items} />);
  });
});
