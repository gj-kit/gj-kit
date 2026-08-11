import { describe, expectTypeOf, it } from 'vitest';
import { ScrollView, Text, View } from 'react-native';
import { Sheet } from '../../src/components/sheet';
import type {
  SheetOpenChangeDetails,
  SheetPresentation,
  SheetProps,
  SheetSafeAreaInsets,
} from '../../src/components/sheet';

describe('Sheet controlled adaptive surface contracts', () => {
  it('exposes bounded presentation, dismissal details, and style hooks', () => {
    void (
      <Sheet
        open={false}
        onOpenChange={(open, details) => {
          expectTypeOf(open).toEqualTypeOf<boolean>();
          expectTypeOf(details).toEqualTypeOf<SheetOpenChangeDetails>();
        }}
        title="Edit profile"
        description="Update the public account details."
        leading={<View />}
        footer={<View />}
        presentation="start"
        accessibilityLabel="Profile editor"
        closeAccessibilityLabel="Close profile editor"
        dismissOnBackdrop
        dismissDisabled={false}
        safeAreaInsets={{ top: 12, right: 8, bottom: 24, left: 8 }}
        keyboardOverlap={0}
        style={{ maxWidth: 480 }}
        className="surface"
        titleStyle={{ fontWeight: '700' }}
        bodyStyle={{ minHeight: 0 }}
        bodyClassName="body"
        footerStyle={{ paddingTop: 8 }}
        footerClassName="footer"
        contentContainerStyle={{ gap: 8 }}
        contentContainerClassName="content"
        testID="profile-sheet"
      >
        <Text>Form</Text>
        <Text>Help</Text>
      </Sheet>
    );

    expectTypeOf<SheetPresentation>().toEqualTypeOf<
      'auto' | 'bottom' | 'start' | 'end'
    >();
    expectTypeOf<SheetOpenChangeDetails['reason']>().toEqualTypeOf<
      | 'backdrop-press'
      | 'escape-key'
      | 'hardware-back'
      | 'accessibility-escape'
      | 'close-action'
    >();
    expectTypeOf<SheetSafeAreaInsets>().toEqualTypeOf<{
      readonly top?: number | undefined;
      readonly right?: number | undefined;
      readonly bottom?: number | undefined;
      readonly left?: number | undefined;
    }>();
    expectTypeOf<SheetProps['children']>().not.toBeNullable();
  });

  it('lets a consumer provide exactly one scroll owner', () => {
    void (
      <Sheet
        open
        onOpenChange={() => {}}
        title="Results"
        scrollMode="provided"
      >
        <ScrollView><Text>Rows</Text></ScrollView>
      </Sheet>
    );

    // @ts-expect-error provided mode requires one React element, not text
    void (<Sheet open onOpenChange={() => {}} title="Results" scrollMode="provided">Rows</Sheet>);
    // @ts-expect-error provided mode rejects multiple sibling elements
    void (<Sheet open onOpenChange={() => {}} title="Results" scrollMode="provided"><View /><View /></Sheet>);
    // @ts-expect-error provided scroll owners control their own content-container style
    void (<Sheet open onOpenChange={() => {}} title="Results" scrollMode="provided" contentContainerStyle={{ gap: 8 }}><ScrollView /></Sheet>);
    // @ts-expect-error provided scroll owners control their own NativeWind content class
    void (<Sheet open onOpenChange={() => {}} title="Results" scrollMode="provided" contentContainerClassName="rows"><ScrollView /></Sheet>);
  });

  it('requires controlled state, a non-null body contract, and a stable title', () => {
    // @ts-expect-error open is controlled and required
    void (<Sheet onOpenChange={() => {}} title="Profile"><View /></Sheet>);
    // @ts-expect-error onOpenChange is required
    void (<Sheet open title="Profile"><View /></Sheet>);
    // @ts-expect-error title provides the dialog name and is required
    void (<Sheet open onOpenChange={() => {}}><View /></Sheet>);
    // @ts-expect-error rich body content is required
    void (<Sheet open onOpenChange={() => {}} title="Profile" />);
    // @ts-expect-error null cannot silently create an empty modal body
    void (<Sheet open onOpenChange={() => {}} title="Profile">{null}</Sheet>);
    // @ts-expect-error undefined cannot silently create an empty modal body
    void (<Sheet open onOpenChange={() => {}} title="Profile">{undefined}</Sheet>);
  });

  it('keeps v1 free of drag, snap, imperative, and modal-policy escape hatches', () => {
    // @ts-expect-error presentation is intentionally bounded to adaptive bottom/logical sides
    void (<Sheet open onOpenChange={() => {}} title="Profile" presentation="center"><View /></Sheet>);
    // @ts-expect-error Sheet is always controlled
    void (<Sheet open onOpenChange={() => {}} title="Profile" defaultOpen><View /></Sheet>);
    // @ts-expect-error Sheet is always a modal surface
    void (<Sheet open onOpenChange={() => {}} title="Profile" modal={false}><View /></Sheet>);
    // @ts-expect-error drag gestures are deliberately outside the first contract
    void (<Sheet open onOpenChange={() => {}} title="Profile" draggable><View /></Sheet>);
    // @ts-expect-error snap points are deliberately outside the first contract
    void (<Sheet open onOpenChange={() => {}} title="Profile" snapPoints={[0.5, 1]}><View /></Sheet>);
    // @ts-expect-error no imperative open/close handle is exposed
    void (<Sheet open onOpenChange={() => {}} title="Profile" sheetRef={{ current: null }}><View /></Sheet>);
    // @ts-expect-error token styling cannot be removed
    void (<Sheet open onOpenChange={() => {}} title="Profile" unstyled><View /></Sheet>);
    // @ts-expect-error internal is the default; nested is not a scroll policy
    void (<Sheet open onOpenChange={() => {}} title="Profile" scrollMode="nested"><View /></Sheet>);
  });
});
