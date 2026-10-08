import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Platform, StyleSheet, Text, type PressableProps } from 'react-native';
import { Button, IconButton, EmptyState, ErrorState, UiProvider } from '../../src/index';

const inputs = vi.hoisted(() => [] as (PressableProps & { className?: string })[]);
vi.mock('react-native', async () => {
  const actual = await vi.importActual<typeof import('react-native')>('react-native');
  const React = await import('react');
  return { ...actual, Pressable: React.forwardRef<React.ElementRef<typeof actual.Pressable>, React.ComponentProps<typeof actual.Pressable> & { className?: string }>((props, ref) => {
    inputs.push(props);
    return React.createElement(actual.Pressable, { ...props, ref });
  }) };
});
afterEach(() => { cleanup(); inputs.length = 0; });
function onPlatform(os: 'ios' | 'android' | 'web', run: () => void) {
  const descriptor = Object.getOwnPropertyDescriptor(Platform, 'OS');
  Object.defineProperty(Platform, 'OS', { configurable: true, value: os });
  try { run(); } finally {
    if (descriptor) Object.defineProperty(Platform, 'OS', descriptor);
    else delete (Platform as { OS?: string }).OS;
  }
}

// Packed JSX bypasses the host NativeWind transform. Pseudo-classes forwarded
// to RN Pressable's inner View create another responder with no action callback.
// Observe inputs before RNW drops className; physical native taps are verified separately.
describe('compiled Button native responder boundary', () => {
  it.each(['ios', 'android'] as const)('%s: default actions do not inject an inner responder', os => onPlatform(os, () => {
    const action = vi.fn();
    render(<UiProvider><Button label="Create" onPress={action}/><IconButton accessibilityLabel="Add" icon={<Text>+</Text>} onPress={action}/><EmptyState title="Empty" action={{ label: 'Empty action', onPress: action }}/><ErrorState onRetry={action}/></UiProvider>);
    expect(inputs.length).toBe(4);
    for (const props of inputs) {
      expect(props.className ?? '').not.toMatch(/(?:hover|active):/);
      expect(typeof props.style).toBe('function');
      if (typeof props.style !== 'function') throw new Error('Missing native press feedback');
      expect(StyleSheet.flatten(props.style({ pressed: true })).opacity).toBe(0.9);
      expect(StyleSheet.flatten(props.style({ pressed: false })).opacity).toBe(1);
    }
    for (const label of ['Create', 'Add', 'Empty action', 'Retry']) fireEvent.click(screen.getByRole('button', { name: label }));
    expect(action).toHaveBeenCalledTimes(4);
  }));
  it('native preserves explicit consumer className', () => onPlatform('ios', () => {
    render(<UiProvider><Button label="Create" className="custom-layout" onPress={() => {}}/></UiProvider>);
    expect(inputs[0]?.className).toBe('custom-layout');
  }));
  it('web retains default hover and active classes', () => onPlatform('web', () => {
    render(<UiProvider><Button label="Create" onPress={() => {}}/><IconButton accessibilityLabel="Add" icon={<Text>+</Text>} onPress={() => {}}/></UiProvider>);
    for (const props of inputs) expect(props.className).toBe('hover:brightness-90 active:scale-[0.98]');
  }));
  it.each(['ios', 'android'] as const)('%s: disabled and loading actions remain inert', os => onPlatform(os, () => {
    const action = vi.fn();
    render(<UiProvider><Button label="Disabled" disabled onPress={action}/><Button label="Loading" loading onPress={action}/><IconButton accessibilityLabel="Disabled icon" icon={<Text>+</Text>} disabled onPress={action}/></UiProvider>);
    for (const props of inputs) {
      expect(props.disabled).toBe(true);
      if (typeof props.style !== 'function') throw new Error('Missing feedback');
      expect(StyleSheet.flatten(props.style({ pressed: true })).opacity).toBe(1);
    }
    for (const label of ['Disabled', 'Loading', 'Disabled icon']) fireEvent.click(screen.getByRole('button', { name: label }));
    expect(action).not.toHaveBeenCalled();
  }));
});
