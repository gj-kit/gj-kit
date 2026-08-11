import { describe, expectTypeOf, it } from 'vitest';
import { View } from 'react-native';
import { Popover } from '../../src/index';
import type {
  PopoverOpenChangeDetails,
  PopoverOpenChangeReason,
  PopoverPlacement,
  PopoverPresentation,
  PopoverProps,
  PopoverTriggerSize,
  PopoverTriggerVariant,
} from '../../src/index';

describe('Popover controlled dialog and owned-trigger contracts', () => {
  it('exposes bounded cross-platform placement, presentation, and styling hooks', () => {
    void (
      <Popover
        triggerLabel="Account details"
        triggerIcon={<View />}
        open={false}
        onOpenChange={(_open, details) => {
          expectTypeOf(details).toEqualTypeOf<PopoverOpenChangeDetails>();
          expectTypeOf(details.reason).toEqualTypeOf<PopoverOpenChangeReason>();
        }}
        title="Account summary"
        description="Review this workspace"
        placement="top-end"
        direction="rtl"
        sideOffset={8}
        alignOffset={-4}
        collisionPadding={12}
        presentation="auto"
        bottomInset={16}
        keyboardOverlap={0}
        size="sm"
        variant="ghost"
        triggerStyle={{ minWidth: 44 }}
        triggerClassName="trigger"
        triggerLabelStyle={{ letterSpacing: 0.2 }}
        triggerLabelClassName="trigger-label"
        contentStyle={{ maxWidth: 420 }}
        contentClassName="content"
        bodyStyle={{ gap: 8 }}
        bodyClassName="body"
        titleStyle={{ fontWeight: '700' }}
      >
        <View />
      </Popover>
    );

    expectTypeOf<'bottom-start' | 'top-center'>().toMatchTypeOf<PopoverPlacement>();
    expectTypeOf<PopoverPresentation>().toEqualTypeOf<
      'auto' | 'bottom' | 'center'
    >();
    expectTypeOf<PopoverTriggerSize>().toEqualTypeOf<'sm' | 'md'>();
    expectTypeOf<PopoverTriggerVariant>().toEqualTypeOf<
      'filled' | 'outlined' | 'ghost'
    >();
    expectTypeOf<PopoverProps['children']>().not.toBeNullable();
  });

  it('requires controlled state, a dialog name, content, and safe icon-only presentation', () => {
    void (
      <Popover
        triggerLabel="More details"
        iconOnly
        triggerIcon={<View />}
        open={false}
        onOpenChange={() => {}}
        title="More details"
      >
        <View />
      </Popover>
    );

    // @ts-expect-error icon-only triggers require visual icon content
    void (<Popover triggerLabel="More details" iconOnly open={false} onOpenChange={() => {}} title="More details"><View /></Popover>);
    // @ts-expect-error open is controlled and required
    void (<Popover triggerLabel="Details" onOpenChange={() => {}} title="Details"><View /></Popover>);
    // @ts-expect-error onOpenChange is controlled and required
    void (<Popover triggerLabel="Details" open={false} title="Details"><View /></Popover>);
    // @ts-expect-error every dialog requires a stable accessible title
    void (<Popover triggerLabel="Details" open={false} onOpenChange={() => {}}><View /></Popover>);
    // @ts-expect-error rich dialog content is required
    void (<Popover triggerLabel="Details" open={false} onOpenChange={() => {}} title="Details" />);
    // @ts-expect-error null is not a valid content payload
    void (<Popover triggerLabel="Details" open={false} onOpenChange={() => {}} title="Details">{null}</Popover>);
  });

  it('keeps v1 free of modal, custom-anchor, panel-alias, and unstyled escape hatches', () => {
    // @ts-expect-error web Popover is intentionally non-modal and native owns adaptation
    void (<Popover triggerLabel="Details" open={false} onOpenChange={() => {}} title="Details" modal><View /></Popover>);
    // @ts-expect-error Popover owns its Pressable trigger in v1
    void (<Popover triggerLabel="Details" open={false} onOpenChange={() => {}} title="Details" asChild><View /></Popover>);
    // @ts-expect-error surface hook is consistently named contentStyle
    void (<Popover triggerLabel="Details" open={false} onOpenChange={() => {}} title="Details" panelStyle={{}}><View /></Popover>);
    // @ts-expect-error token styling cannot be removed
    void (<Popover triggerLabel="Details" open={false} onOpenChange={() => {}} title="Details" unstyled><View /></Popover>);
    // @ts-expect-error invalid placement is rejected
    void (<Popover triggerLabel="Details" open={false} onOpenChange={() => {}} title="Details" placement="middle"><View /></Popover>);
    // @ts-expect-error ambiguous panel-size alias is not part of the public API
    type LegacyPopoverSize = import('../../src/index').PopoverSize;
  });
});
