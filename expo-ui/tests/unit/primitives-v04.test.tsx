/** Link / Card / FloatingActionButton / AspectRatio v0.4 회귀 테스트. */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { View } from 'react-native';
import { AspectRatio } from '../../src/components/aspect-ratio';
import { Card } from '../../src/components/card';
import { FloatingActionButton } from '../../src/components/fab';
import { Link } from '../../src/components/link';
import { UiProvider } from '../../src/components/provider';
import { lightTheme } from '../../src/theme/createTheme';

afterEach(cleanup);

function hexToRgb(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgb(${r}, ${g}, ${b})`;
}

describe('Link', () => {
  it('href 분기는 실제 anchor와 목적지 속성을 렌더한다', () => {
    render(
      <UiProvider>
        <Link href="https://example.test/docs" target="_self">
          Read docs
        </Link>
      </UiProvider>,
    );

    const link = screen.getByRole('link', { name: 'Read docs' });
    expect(link.matches('a')).toBe(true);
    expect(link.getAttribute('href')).toBe('https://example.test/docs');
    expect(link.getAttribute('target')).toBe('_self');
  });

  it('_blank에 noopener와 noreferrer를 자동 추가하고 기존 rel을 보존한다', () => {
    render(
      <UiProvider>
        <Link href="https://example.test" target="_blank" rel="nofollow noopener">
          External
        </Link>
      </UiProvider>,
    );

    const link = screen.getByRole('link', { name: 'External' });
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')?.split(/\s+/u).sort()).toEqual([
      'nofollow',
      'noopener',
      'noreferrer',
    ]);
  });

  it('onPress 분기는 클릭과 Enter만 활성화하고 Space는 무시한다', () => {
    const onPress = vi.fn();
    render(
      <UiProvider>
        <Link onPress={onPress}>Open profile</Link>
      </UiProvider>,
    );

    const link = screen.getByRole('link', { name: 'Open profile' });
    expect(link.matches('a')).toBe(false);
    expect(link.getAttribute('tabindex')).toBe('0');

    fireEvent.click(link);
    fireEvent.keyDown(link, { key: ' ' });
    expect(onPress).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(link, { key: 'Enter' });
    expect(onPress).toHaveBeenCalledTimes(2);
  });

  it('variant와 underline을 테마 토큰으로 스타일링한다', () => {
    render(
      <UiProvider>
        <Link href="/danger" variant="danger" underline={false} testID="danger-link">
          Delete guide
        </Link>
      </UiProvider>,
    );

    const link = screen.getByTestId('danger-link');
    expect(link.style.color).toBe(hexToRgb(lightTheme.colors.danger));
    expect(link.style.textDecoration).toBe('none');
  });
});

describe('Card', () => {
  it('정적 카드는 button이 아니며 토큰 padding/radius를 쓴다', () => {
    render(
      <UiProvider>
        <Card
          padding="xl"
          radius="lg"
          style={{ height: 240 }}
          contentStyle={{ flexDirection: 'row' }}
          testID="card"
        >
          <View testID="content" />
        </Card>
      </UiProvider>,
    );

    const card = screen.getByTestId('card');
    const contentWrapper = screen.getByTestId('content').parentElement;
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByTestId('content')).toBeTruthy();
    expect(card.style.height).toBe('240px');
    expect(contentWrapper?.parentElement).toBe(card);
    expect(contentWrapper?.style.padding).toBe(`${lightTheme.spacing.xl}px`);
    expect(contentWrapper?.style.borderTopLeftRadius).toBe(`${lightTheme.radius.lg}px`);
    expect(contentWrapper?.style.backgroundColor).toBe(hexToRgb(lightTheme.colors.surface));
    expect(contentWrapper?.style.flexDirection).toBe('row');
    expect(contentWrapper?.style.flexGrow).toBe('1');
    expect(contentWrapper?.style.flexShrink).toBe('1');
    expect(contentWrapper?.style.alignSelf).toBe('stretch');
  });

  it('전체 카드를 button으로 만들지 않고 내부의 명시적 Link만 활성화한다', () => {
    const onPress = vi.fn();
    render(
      <UiProvider>
        <Card variant="filled" testID="action-card">
          <Link onPress={onPress}>Open analytics</Link>
        </Card>
      </UiProvider>,
    );

    const card = screen.getByTestId('action-card');
    const contentWrapper = screen.getByRole('link', { name: 'Open analytics' }).parentElement;
    expect(contentWrapper?.parentElement).toBe(card);
    expect(contentWrapper?.style.backgroundColor).toBe(
      hexToRgb(lightTheme.colors.surfaceSubtle),
    );
    expect(screen.queryByRole('button')).toBeNull();
    fireEvent.click(screen.getByRole('link', { name: 'Open analytics' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('Card 자체는 접근성 역할을 만들지 않아 자식 의미를 보존한다', () => {
    render(
      <UiProvider>
        <Card>
          <Link href="/report">Open report</Link>
        </Card>
      </UiProvider>,
    );

    expect(screen.getByRole('link', { name: 'Open report' })).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('elevated 카드는 consumer overflow 요청보다 shadow 가시성을 우선한다', () => {
    render(
      <UiProvider>
        <Card
          variant="elevated"
          padding="none"
          style={{ height: 240, overflow: 'hidden' }}
          contentStyle={{ justifyContent: 'center' }}
          testID="elevated"
        >
          <View testID="edge-media" />
        </Card>
      </UiProvider>,
    );
    const card = screen.getByTestId('elevated');
    const contentWrapper = screen.getByTestId('edge-media').parentElement;
    expect(window.getComputedStyle(card).overflow).not.toBe('hidden');
    expect(contentWrapper?.parentElement).toBe(card);
    expect(contentWrapper?.style.backgroundColor).toBe(hexToRgb(lightTheme.colors.surface));
    expect(contentWrapper?.style.borderTopLeftRadius).toBe(`${lightTheme.radius.md}px`);
    expect(contentWrapper?.style.flexGrow).toBe('1');
    expect(contentWrapper?.style.justifyContent).toBe('center');
  });
});

describe('FloatingActionButton', () => {
  it('아이콘 전용 FAB는 필수 이름과 토큰 크기·위치·inset을 적용한다', () => {
    const onPress = vi.fn();
    const icon = vi.fn(() => <View testID="fab-icon" />);
    render(
      <UiProvider>
        <FloatingActionButton
          icon={icon}
          accessibilityLabel="Create item"
          onPress={onPress}
          size="sm"
          placement="bottom-start"
          offset="sm"
          bottomInset={7}
          testID="fab"
        />
      </UiProvider>,
    );

    const fab = screen.getByRole('button', { name: 'Create item' });
    expect(fab).toBe(screen.getByTestId('fab'));
    expect(fab.style.position).toBe('absolute');
    expect(fab.style.left).toBe(`${lightTheme.spacing.sm}px`);
    expect(fab.style.bottom).toBe(`${lightTheme.spacing.sm + 7}px`);
    expect(fab.style.minHeight).toBe(`${lightTheme.metrics.control.sm}px`);
    expect(icon).toHaveBeenCalledWith({
      color: lightTheme.colors.onPrimary,
      size: lightTheme.metrics.icon.sm,
    });
    expect(screen.getByTestId('fab-icon').parentElement?.getAttribute('aria-hidden')).toBe('true');
    fireEvent.click(fab);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('확장 FAB는 보이는 label을 접근성 이름으로 쓰고 중앙 배치한다', () => {
    render(
      <UiProvider>
        <FloatingActionButton
          label="Compose"
          onPress={() => {}}
          variant="secondary"
          placement="bottom-center"
          testID="fab"
        />
      </UiProvider>,
    );

    const fab = screen.getByRole('button', { name: 'Compose' });
    expect(fab.style.alignSelf).toBe('center');
    expect(fab.style.backgroundColor).toBe(hexToRgb(lightTheme.colors.surface));
    expect(screen.getByText('Compose')).toBeTruthy();
  });

  it('loading FAB는 busy+disabled이고 스피너를 보이며 콜백을 차단한다', () => {
    const onPress = vi.fn();
    render(
      <UiProvider>
        <FloatingActionButton
          label="Publish"
          onPress={onPress}
          loading
          testID="fab"
        />
      </UiProvider>,
    );

    const fab = screen.getByTestId('fab');
    expect(fab.getAttribute('aria-busy')).toBe('true');
    expect(fab.getAttribute('aria-disabled')).toBe('true');
    expect(fab.hasAttribute('disabled')).toBe(true);
    expect(within(fab).getByRole('progressbar')).toBeTruthy();
    expect(screen.queryByText('Publish')).toBeNull();
    fireEvent.click(fab);
    expect(onPress).not.toHaveBeenCalled();
  });
});

describe('AspectRatio', () => {
  it('비율과 child를 순수 View 레이아웃으로 렌더한다', () => {
    render(
      <AspectRatio
        ratio={16 / 9}
        style={{ aspectRatio: 1, width: '50%' }}
        testID="ratio"
      >
        <View testID="media" />
      </AspectRatio>,
    );

    const ratio = screen.getByTestId('ratio');
    expect(Number(ratio.style.aspectRatio)).toBeCloseTo(16 / 9);
    expect(ratio.style.width).toBe('100%');
    expect(screen.getByTestId('media')).toBeTruthy();
  });

  it.each([0, -1, Number.POSITIVE_INFINITY, Number.NaN])(
    '유효하지 않은 ratio %s를 거부한다',
    (ratio) => {
      expect(() => AspectRatio({ ratio })).toThrow(RangeError);
    },
  );
});
