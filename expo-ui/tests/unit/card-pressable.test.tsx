/**
 * Card pressable/selectable — admin 백로그 #10.
 *
 * 정적 Card는 그대로 View, onPress가 있으면 명시적 이름의 정직한 버튼,
 * selected가 boolean이면 독립 토글(aria-pressed) + primary 토큰 선택 시각.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Text as RNText } from 'react-native';
import { Card } from '../../src/components/card';
import { UiProvider } from '../../src/components/provider';
import { lightTheme } from '../../src/theme/createTheme';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function hexToRgb(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgb(${r}, ${g}, ${b})`;
}

describe('Card static form', () => {
  it('stays a plain container with no widget role', () => {
    render(
      <UiProvider>
        <Card testID="card">
          <RNText>본문</RNText>
        </Card>
      </UiProvider>,
    );

    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByTestId('card')).toBeTruthy();
  });
});

describe('Card pressable form', () => {
  it('is a named button that activates onPress', () => {
    const onPress = vi.fn();
    render(
      <UiProvider>
        <Card onPress={onPress} accessibilityLabel="표준 시나리오 선택" testID="card">
          <RNText>표준 시나리오</RNText>
        </Card>
      </UiProvider>,
    );

    const card = screen.getByRole('button', { name: '표준 시나리오 선택' });
    expect(card.getAttribute('aria-pressed')).toBeNull();
    fireEvent.click(card);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('exposes selected as an independent toggle with token-driven selection visuals', () => {
    render(
      <UiProvider>
        <Card onPress={() => {}} selected accessibilityLabel="표준 시나리오" testID="card">
          <RNText>표준 시나리오</RNText>
        </Card>
      </UiProvider>,
    );

    const card = screen.getByRole('button', { name: '표준 시나리오' });
    expect(card.getAttribute('aria-pressed')).toBe('true');
    const content = card.firstElementChild as HTMLElement;
    expect(content.style.backgroundColor).toBe(hexToRgb(lightTheme.colors.primarySoft));
    expect(content.style.borderTopColor).toBe(hexToRgb(lightTheme.colors.primary));
  });

  it('keeps aria-pressed=false and the resting surface when not selected', () => {
    render(
      <UiProvider>
        <Card onPress={() => {}} selected={false} accessibilityLabel="표준 시나리오" testID="card">
          <RNText>표준 시나리오</RNText>
        </Card>
      </UiProvider>,
    );

    const card = screen.getByRole('button', { name: '표준 시나리오' });
    expect(card.getAttribute('aria-pressed')).toBe('false');
    const content = card.firstElementChild as HTMLElement;
    expect(content.style.backgroundColor).toBe(hexToRgb(lightTheme.colors.surface));
  });

  it('blocks activation and exposes the disabled state when disabled', () => {
    const onPress = vi.fn();
    render(
      <UiProvider>
        <Card onPress={onPress} disabled accessibilityLabel="표준 시나리오">
          <RNText>표준 시나리오</RNText>
        </Card>
      </UiProvider>,
    );

    const card = screen.getByRole('button', { name: '표준 시나리오' });
    expect(card.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(card);
    expect(onPress).not.toHaveBeenCalled();
  });

  it('rejects a pressable card without a real accessible name', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() =>
      render(
        <UiProvider>
          <Card onPress={() => {}} accessibilityLabel="  ">
            <RNText>본문</RNText>
          </Card>
        </UiProvider>,
      ),
    ).toThrow('Card accessibilityLabel must be a non-empty string when onPress is present.');
  });
});
