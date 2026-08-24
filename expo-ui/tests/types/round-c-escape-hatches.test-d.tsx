import { describe, expectTypeOf, it } from 'vitest';
import { Text } from 'react-native';
import type { StyleProp, TextStyle, ViewStyle } from 'react-native';
import {
  ConfirmActionRow,
  ConfirmDialog,
  Dialog,
  DialogPanel,
  Menu,
  Select,
  Sheet,
} from '../../src/index';
import type {
  ConfirmActionRowProps,
  DialogPanelProps,
  MenuItem,
  MenuProps,
  SelectProps,
  SheetProps,
} from '../../src/index';

const noop = (): void => undefined;

const menuItems = [
  { kind: 'action', value: 'open', label: 'Open' },
  { kind: 'action', value: 'archive', label: 'Archive' },
] as const satisfies readonly MenuItem<'open' | 'archive'>[];

const selectItems = [
  { value: 'recent', label: 'Most recent' },
  { value: 'oldest', label: 'Oldest first' },
] as const;

describe('DialogPanel Round C escape hatches', () => {
  it('accepts header/description/close customization with the right style domains', () => {
    expectTypeOf<DialogPanelProps['headerStyle']>().toEqualTypeOf<
      StyleProp<ViewStyle> | undefined
    >();
    expectTypeOf<DialogPanelProps['descriptionStyle']>().toEqualTypeOf<
      StyleProp<TextStyle> | undefined
    >();
    expectTypeOf<DialogPanelProps['hideHeader']>().toEqualTypeOf<
      boolean | undefined
    >();
    expectTypeOf<DialogPanelProps['closeButtonStyle']>().toEqualTypeOf<
      StyleProp<ViewStyle> | undefined
    >();

    void (
      <Dialog visible onDismiss={noop} accessibilityLabel="Delete confirmation">
        <DialogPanel
          title="Hidden"
          hideHeader
          headerStyle={{ position: 'absolute' }}
          descriptionStyle={{ color: 'red' }}
          closeButtonStyle={{ right: 12, top: 12 }}
          closeIcon={<Text>x</Text>}
        />
      </Dialog>
    );
    // closeIcon also accepts the RenderIcon form every icon slot supports.
    void (
      <DialogPanel
        title="Named"
        closeIcon={({ color, size }) => <Text style={{ color, fontSize: size }}>x</Text>}
      />
    );

    // @ts-expect-error hideHeader is a boolean, not a string flag
    void (<DialogPanel title="Hidden" hideHeader="yes" />);
    // @ts-expect-error the header wrapper is a View — text-only style keys are rejected
    void (<DialogPanel title="T" headerStyle={{ fontWeight: '700' }} />);
  });

  it('Dialog accepts backdropStyle as a view style', () => {
    void (
      <Dialog
        visible
        onDismiss={noop}
        backdropStyle={{ backgroundColor: 'transparent' }}
      >
        <DialogPanel title="Anchored" />
      </Dialog>
    );
    // @ts-expect-error backdropStyle is a style object, not a color string
    void (<Dialog visible onDismiss={noop} backdropStyle="transparent"><DialogPanel title="T" /></Dialog>);
  });
});

describe('ConfirmActionRow per-button escape hatches', () => {
  it('exposes per-button testIDs and container/label styles', () => {
    expectTypeOf<ConfirmActionRowProps['cancelTestID']>().toEqualTypeOf<
      string | undefined
    >();
    expectTypeOf<ConfirmActionRowProps['confirmStyle']>().toEqualTypeOf<
      StyleProp<ViewStyle> | undefined
    >();
    expectTypeOf<ConfirmActionRowProps['cancelLabelStyle']>().toEqualTypeOf<
      StyleProp<TextStyle> | undefined
    >();

    void (
      <ConfirmActionRow
        onCancel={noop}
        onConfirm={noop}
        cancelTestID="dialog-cancel-button"
        confirmTestID="dialog-confirm-button"
        cancelStyle={{ backgroundColor: '#f1f3f5' }}
        confirmStyle={{ minHeight: 52 }}
        cancelLabelStyle={{ color: '#546e7a' }}
        confirmLabelStyle={{ fontWeight: '600' }}
      />
    );
    // @ts-expect-error label styles are style objects, not bare strings
    void (<ConfirmActionRow onCancel={noop} onConfirm={noop} cancelLabelStyle="bold" />);
    // @ts-expect-error testIDs are strings
    void (<ConfirmActionRow onCancel={noop} onConfirm={noop} confirmTestID={7} />);
  });

  it('ConfirmDialog passes the button testIDs through', () => {
    void (
      <ConfirmDialog
        visible
        title="Sign out?"
        onConfirm={noop}
        onDismiss={noop}
        testID="cd"
        cancelTestID="cd-cancel-button"
        confirmTestID="cd-confirm-button"
      />
    );
    // @ts-expect-error cancelTestID is a string
    void (<ConfirmDialog visible title="T" onConfirm={noop} onDismiss={noop} cancelTestID={1} />);
  });
});

describe('Sheet showCloseButton', () => {
  it('is an optional boolean', () => {
    expectTypeOf<SheetProps['showCloseButton']>().toEqualTypeOf<
      boolean | undefined
    >();
    void (
      <Sheet
        open
        onOpenChange={noop}
        title="Sign out?"
        showCloseButton={false}
        dismissDisabled
        footer={<Text>Actions</Text>}
      >
        <Text>Choose one</Text>
      </Sheet>
    );
    // @ts-expect-error showCloseButton is a boolean, not a string flag
    void (<Sheet open onOpenChange={noop} title="T" showCloseButton="false"><Text>B</Text></Sheet>);
  });
});

describe('Menu/Select trigger escape hatches', () => {
  it('accepts triggerTestID and hover style hooks', () => {
    expectTypeOf<MenuProps<'open'>['triggerTestID']>().toEqualTypeOf<
      string | undefined
    >();
    expectTypeOf<MenuProps<'open'>['triggerHoverStyle']>().toEqualTypeOf<
      StyleProp<ViewStyle> | undefined
    >();
    expectTypeOf<SelectProps<'recent'>['itemHoverStyle']>().toEqualTypeOf<
      StyleProp<ViewStyle> | undefined
    >();

    void (
      <Menu
        triggerLabel="Sort"
        items={menuItems}
        open={false}
        onOpenChange={noop}
        onSelect={noop}
        triggerTestID="album-sort-button"
        triggerHoverStyle={{ backgroundColor: '#F1F3F5' }}
        itemHoverStyle={{ backgroundColor: '#edeff0' }}
      />
    );
    void (
      <Select
        label="Sort order"
        placeholder="Choose"
        items={selectItems}
        value={null}
        onValueChange={noop}
        open={false}
        onOpenChange={noop}
        triggerTestID="sort-select-button"
        triggerHoverStyle={{ backgroundColor: '#F1F3F5' }}
        itemHoverStyle={{ backgroundColor: '#edeff0' }}
      />
    );

    // @ts-expect-error triggerTestID is a string
    void (<Menu triggerLabel="S" items={menuItems} open={false} onOpenChange={noop} onSelect={noop} triggerTestID={3} />);
    // @ts-expect-error hover hooks are view styles, not booleans
    void (<Select label="S" placeholder="C" items={selectItems} value={null} onValueChange={noop} open={false} onOpenChange={noop} triggerHoverStyle />);
  });
});
