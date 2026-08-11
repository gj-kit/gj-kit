import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Text } from 'react-native';
import { UiProvider } from '../../src/components/provider';
import { Tooltip } from '../../src/components/tooltip.native';
import { lightTheme } from '../../src/theme/createTheme';

const nativeCapture = vi.hoisted(() => ({
  pressableProps: null as Record<string, unknown> | null,
}));

vi.mock('react-native', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-native')>();
  const React = await import('react');
  return {
    ...actual,
    Pressable: (props: Record<string, unknown>) => {
      nativeCapture.pressableProps = props;
      return React.createElement(actual.Pressable, props);
    },
  };
});

afterEach(() => {
  cleanup();
  nativeCapture.pressableProps = null;
  vi.restoreAllMocks();
});

describe('Tooltip native — accessibilityHint-only policy', () => {
  it('renders one owned action with a hint and no visual tooltip layer', () => {
    const onPress = vi.fn();
    const renderIcon = vi.fn(() => <Text aria-hidden>?</Text>);
    render(
      <UiProvider>
        <Tooltip
          triggerLabel="Help"
          triggerIcon={renderIcon}
          content="Explains this action"
          onPress={onPress}
          testID="native-tooltip"
        />
      </UiProvider>,
    );

    const trigger = screen.getByRole('button', { name: 'Help' });
    expect(nativeCapture.pressableProps?.accessibilityHint).toBe('Explains this action');
    expect(screen.queryByRole('tooltip')).toBeNull();
    expect(document.body.textContent).not.toContain('Explains this action');
    expect(trigger.style.width).toBe(`${lightTheme.metrics.control.md}px`);
    expect(renderIcon).toHaveBeenCalledWith({
      color: lightTheme.colors.text,
      size: lightTheme.metrics.icon.md,
    });
    fireEvent.click(trigger);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('tooltipDisabled removes only the hint and md maps to a >=44px action target', () => {
    const onPress = vi.fn();
    render(
      <UiProvider>
        <Tooltip
          triggerLabel="More"
          triggerIcon={<Text aria-hidden>?</Text>}
          content="More actions"
          tooltipDisabled
          size="md"
          onPress={onPress}
        />
      </UiProvider>,
    );
    const trigger = screen.getByRole('button', { name: 'More' });
    expect(nativeCapture.pressableProps?.accessibilityHint).toBeUndefined();
    expect(trigger.style.width).toBe(`${lightTheme.metrics.control.lg}px`);
    fireEvent.click(trigger);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('validates description and placement without installing tooltip timers', () => {
    expect(() => render(
      <Tooltip triggerLabel="Help" triggerIcon={<Text />} content="" onPress={() => {}} />,
    )).toThrow('Tooltip content must be a non-empty string.');
    expect(() => render(
      <Tooltip
        triggerLabel="Help"
        triggerIcon={<Text />}
        content="Help"
        onPress={() => {}}
        placement={'middle' as never}
      />,
    )).toThrow('Tooltip placement is invalid.');
  });
});
