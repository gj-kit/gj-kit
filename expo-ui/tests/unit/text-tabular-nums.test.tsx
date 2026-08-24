import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StyleSheet } from 'react-native';
import { UiProvider } from '../../src/components/provider';
import { Text } from '../../src/components/text';

/**
 * jsdom's CSSStyleDeclaration does not implement `font-variant: tabular-nums`
 * and silently drops it, so the DOM cannot witness the declaration. The probe
 * below keeps the real react-native-web module and only replaces `Text` with a
 * host that serializes the flattened style it receives — that is the exact
 * value RNW turns into the `font-variant` CSS declaration in a browser.
 */
vi.mock('react-native', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-native')>();
  const ProbeText = ({
    style,
    testID,
    children,
  }: {
    style?: unknown;
    testID?: string;
    children?: unknown;
  }) => {
    const flat = (actual.StyleSheet.flatten(style as never) ?? {}) as Record<string, unknown>;
    return (
      <span
        data-testid={testID}
        data-font-variant={Array.isArray(flat.fontVariant) ? flat.fontVariant.join(' ') : ''}
        data-font-size={String(flat.fontSize ?? '')}
        data-color={String(flat.color ?? '')}
      >
        {children as never}
      </span>
    );
  };
  return { ...actual, Text: ProbeText };
});

afterEach(cleanup);

describe('Text tabularNums', () => {
  it('emits nothing numeric-specific by default so existing text is unchanged', () => {
    render(
      <UiProvider>
        <Text testID="plain">1,234</Text>
      </UiProvider>,
    );
    expect(screen.getByTestId('plain').getAttribute('data-font-variant')).toBe('');
  });

  it('adds the tabular-nums font variant on top of the role and color tokens', () => {
    render(
      <UiProvider>
        <Text testID="figures" role="caption" color="textMuted" tabularNums>
          1,234
        </Text>
      </UiProvider>,
    );
    const figures = screen.getByTestId('figures');
    expect(figures.getAttribute('data-font-variant')).toBe('tabular-nums');
    expect(figures.getAttribute('data-font-size')).toBe('12');
    expect(figures.getAttribute('data-color')).not.toBe('');
  });

  it('lets a style escape hatch extend but not lose the numeral setting', () => {
    render(
      <UiProvider>
        <Text testID="styled" tabularNums style={StyleSheet.create({ x: { letterSpacing: 1 } }).x}>
          42
        </Text>
      </UiProvider>,
    );
    expect(screen.getByTestId('styled').getAttribute('data-font-variant')).toBe('tabular-nums');
  });
});
