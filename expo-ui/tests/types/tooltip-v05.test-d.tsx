import { describe, it } from 'vitest';
import { View } from 'react-native';
import { Tooltip } from '../../src/index';
import type {
  TooltipDirection,
  TooltipPlacement,
  TooltipProps,
  TooltipTriggerSize,
} from '../../src/index';

const icon = <View />;

describe('Tooltip public type contract', () => {
  it('owns a named icon action and exposes bounded positioning/style hooks', () => {
    const placement: TooltipPlacement = 'top-center';
    const direction: TooltipDirection = 'rtl';
    const size: TooltipTriggerSize = 'md';
    const props: TooltipProps = {
      content: 'Explains this action',
      triggerLabel: 'Help',
      triggerIcon: icon,
      onPress: () => {},
      placement,
      direction,
      size,
      variant: 'ghost',
      delayMs: 500,
      closeDelayMs: 100,
      sideOffset: 8,
      collisionPadding: 12,
      style: { alignSelf: 'flex-start' },
      triggerStyle: { opacity: 1 },
      contentStyle: { maxWidth: 240 },
      className: 'tooltip-root',
      triggerClassName: 'tooltip-trigger',
      contentClassName: 'tooltip-content',
      testID: 'tooltip',
    };
    void (<Tooltip {...props} />);
    void (
      <Tooltip
        content="More actions"
        triggerLabel="More"
        triggerIcon={({ color, size: iconSize }) => <View style={{ backgroundColor: color, width: iconSize }} />}
        onPress={() => {}}
        tooltipDisabled
        size="sm"
      />
    );
  });

  it('rejects unnamed, non-action, interactive, disabled, and undersized escape hatches', () => {
    // @ts-expect-error content is required
    void (<Tooltip triggerLabel="Help" triggerIcon={icon} onPress={() => {}} />);
    // @ts-expect-error triggerLabel is required for the icon-only action
    void (<Tooltip content="Help" triggerIcon={icon} onPress={() => {}} />);
    // @ts-expect-error triggerIcon is required; arbitrary children are not composition
    void (<Tooltip content="Help" triggerLabel="Help" onPress={() => {}}><View /></Tooltip>);
    // @ts-expect-error onPress is required
    void (<Tooltip content="Help" triggerLabel="Help" triggerIcon={icon} />);
    // @ts-expect-error rich/interactive tooltip content is deliberately unsupported
    void (<Tooltip content={<View />} triggerLabel="Help" triggerIcon={icon} onPress={() => {}} />);
    // @ts-expect-error action trigger cannot be disabled; suppress only the tooltip
    void (<Tooltip content="Help" triggerLabel="Help" triggerIcon={icon} onPress={() => {}} disabled />);
    // @ts-expect-error arbitrary numeric targets could violate minimum touch size
    void (<Tooltip content="Help" triggerLabel="Help" triggerIcon={icon} onPress={() => {}} size={20} />);
    // @ts-expect-error placement is a bounded side-alignment union
    void (<Tooltip content="Help" triggerLabel="Help" triggerIcon={icon} onPress={() => {}} placement="center" />);
    // @ts-expect-error legacy unstyled escape hatch is forbidden
    void (<Tooltip content="Help" triggerLabel="Help" triggerIcon={icon} onPress={() => {}} unstyled />);
  });
});
