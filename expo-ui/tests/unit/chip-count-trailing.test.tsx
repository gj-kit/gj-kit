/**
 * Chip count·trailing — admin 백로그 #5.
 *
 * "완료 700" 같은 라벨+건수 2슬롯. 건수는 muted 토큰 색으로 그려지고
 * 인터랙티브 kind의 접근성 이름에 "완료, 700"으로 합쳐진다.
 */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Text as RNText } from 'react-native';
import { Chip } from '../../src/components/chip';
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

describe('Chip count', () => {
  it('joins the count into a filter chip accessible name and renders it muted', () => {
    render(
      <UiProvider>
        <Chip kind="filter" label="완료" count={700} selected={false} onSelectedChange={() => {}} />
      </UiProvider>,
    );

    expect(screen.getByRole('button', { name: '완료, 700' })).toBeTruthy();
    expect(screen.getByText('700').style.color).toBe(hexToRgb(lightTheme.colors.textMuted));
  });

  it('joins the count into an action chip accessible name', () => {
    render(
      <UiProvider>
        <Chip kind="action" label="필터 추가" count={3} onPress={() => {}} />
      </UiProvider>,
    );

    expect(screen.getByRole('button', { name: '필터 추가, 3' })).toBeTruthy();
  });

  it('keeps a static chip ordinary text — the count is readable, no widget name appears', () => {
    render(
      <UiProvider>
        <Chip kind="static" label="완료" count={700} testID="chip" />
      </UiProvider>,
    );

    expect(screen.getByTestId('chip').getAttribute('aria-label')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByText('완료')).toBeTruthy();
    expect(screen.getByText('700')).toBeTruthy();
  });

  it('mutes the count further when the chip is disabled', () => {
    render(
      <UiProvider>
        <Chip kind="filter" label="완료" count={700} selected={false} disabled onSelectedChange={() => {}} />
      </UiProvider>,
    );

    expect(screen.getByText('700').style.color).toBe(hexToRgb(lightTheme.colors.textSubtle));
  });

  it('rejects a non-finite count as a configuration error', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() =>
      render(
        <UiProvider>
          <Chip kind="static" label="완료" count={Number.POSITIVE_INFINITY} />
        </UiProvider>,
      ),
    ).toThrow('Chip count must be a finite number.');
  });
});

describe('Chip trailing', () => {
  it('renders trailing hidden from accessibility and outside the accessible name', () => {
    render(
      <UiProvider>
        <Chip
          kind="filter"
          label="완료"
          trailing={<RNText testID="dot">●</RNText>}
          selected={false}
          onSelectedChange={() => {}}
        />
      </UiProvider>,
    );

    const dot = screen.getByTestId('dot');
    expect((dot.parentElement as HTMLElement).getAttribute('aria-hidden')).toBe('true');
    expect(screen.getByRole('button', { name: '완료' })).toBeTruthy();
  });

  it('renders count then trailing on a removable chip while the remove button keeps its own name', () => {
    render(
      <UiProvider>
        <Chip
          kind="removable"
          label="React Native"
          count={2}
          onRemove={() => {}}
          removeAccessibilityLabel="React Native 제거"
        />
      </UiProvider>,
    );

    expect(screen.getByText('2')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'React Native 제거' })).toBeTruthy();
  });
});
