/**
 * EmptyState compact variant — admin 백로그 #8.
 *
 * 표 내부/인라인 빈 행용 한 줄 안내. label 크기 제목, lg 패딩, 내장 아이콘
 * 없음. variant 없으면 기존 카드와 동일.
 */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Text as RNText } from 'react-native';
import { EmptyState } from '../../src/components/feedback';
import { UiProvider } from '../../src/components/provider';
import { lightTheme } from '../../src/theme/createTheme';

afterEach(cleanup);

const providerIcons = {
  empty: () => <RNText testID="empty-icon">☁</RNText>,
};

describe('EmptyState variant', () => {
  it('keeps the default card unchanged — title role, xxl padding, provider icon in a circle', () => {
    render(
      <UiProvider icons={providerIcons}>
        <EmptyState title="결제 내역 없음" testID="empty" />
      </UiProvider>,
    );

    const card = screen.getByTestId('empty');
    expect(getComputedStyle(card).paddingTop).toBe(`${lightTheme.spacing.xxl}px`);
    expect(screen.getByText('결제 내역 없음').style.fontSize).toBe(
      `${lightTheme.typography.title.fontSize}px`,
    );
    const icon = screen.getByTestId('empty-icon');
    expect((icon.parentElement as HTMLElement).style.backgroundColor).not.toBe('');
  });

  it('compact renders a one-line notice — label role title, lg padding, no built-in icon', () => {
    render(
      <UiProvider icons={providerIcons}>
        <EmptyState variant="compact" title="결제 내역 없음" testID="empty" />
      </UiProvider>,
    );

    const card = screen.getByTestId('empty');
    expect(getComputedStyle(card).paddingTop).toBe(`${lightTheme.spacing.lg}px`);
    expect(screen.getByText('결제 내역 없음').style.fontSize).toBe(
      `${lightTheme.typography.label.fontSize}px`,
    );
    expect(screen.queryByTestId('empty-icon')).toBeNull();
  });

  it('compact still renders an explicit leading node, bare and without the icon circle', () => {
    render(
      <UiProvider icons={providerIcons}>
        <EmptyState
          variant="compact"
          title="결제 내역 없음"
          leading={<RNText testID="custom-icon">!</RNText>}
          testID="empty"
        />
      </UiProvider>,
    );

    const icon = screen.getByTestId('custom-icon');
    // 원형 배경 래퍼 없이 카드 바로 아래에 렌더된다.
    expect(icon.parentElement).toBe(screen.getByTestId('empty'));
  });

  it('compact keeps body and action available', () => {
    render(
      <UiProvider>
        <EmptyState
          variant="compact"
          title="결제 내역 없음"
          body="조건을 바꿔 다시 검색해 보세요"
          action={{ label: '필터 초기화', onPress: () => {} }}
        />
      </UiProvider>,
    );

    expect(screen.getByText('조건을 바꿔 다시 검색해 보세요')).toBeTruthy();
    expect(screen.getByRole('button', { name: '필터 초기화' })).toBeTruthy();
  });
});
