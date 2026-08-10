/** Avatar / Divider / ListItem 회귀 테스트. */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StyleSheet, View } from 'react-native';
import {
  Avatar,
  Divider,
  ListItem,
  avatarInitials,
} from '../../src/components/display';
import { UiProvider } from '../../src/components/provider';
import { lightTheme } from '../../src/theme/createTheme';

function hexToRgb(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgb(${r}, ${g}, ${b})`;
}

type MockImageInstance = {
  onerror: (() => void) | null;
  onload: (() => void) | null;
  src: string;
};

const originalWindowImage = window.Image;
let imageInstances: MockImageInstance[] = [];

class MockWindowImage implements MockImageInstance {
  onerror: (() => void) | null = null;
  onload: (() => void) | null = null;
  src = '';

  constructor() {
    imageInstances.push(this);
  }
}

beforeEach(() => {
  imageInstances = [];
  window.Image = MockWindowImage as unknown as typeof window.Image;
});

afterEach(() => {
  cleanup();
  window.Image = originalWindowImage;
});

describe('Avatar', () => {
  it('영문·한글 이름에서 안정적인 초성을 만든다', () => {
    expect(avatarInitials('Ada Lovelace')).toBe('AL');
    expect(avatarInitials('grace')).toBe('GR');
    expect(avatarInitials('김고은')).toBe('김고');
    expect(avatarInitials('김 고은')).toBe('김고');
    expect(avatarInitials('   ')).toBe('?');
  });

  it('source가 없으면 초성을 보이고 informative 이미지 의미론을 발행한다', () => {
    render(
      <UiProvider>
        <Avatar name="Ada Lovelace" alt="Ada Lovelace profile" testID="avatar" />
      </UiProvider>,
    );

    const avatar = screen.getByRole('img', { name: 'Ada Lovelace profile' });
    expect(avatar).toBe(screen.getByTestId('avatar'));
    expect(screen.getByText('AL')).toBeTruthy();
    expect(avatar.style.width).toBe(`${lightTheme.metrics.control.md}px`);
    expect(avatar.style.height).toBe(`${lightTheme.metrics.control.md}px`);
  });

  it('decorative Avatar는 접근성 트리에서 숨겨진다', () => {
    render(
      <UiProvider>
        <Avatar name="Ada Lovelace" decorative testID="avatar" />
      </UiProvider>,
    );

    const avatar = screen.getByTestId('avatar');
    expect(avatar.getAttribute('aria-hidden')).toBe('true');
    expect(avatar.getAttribute('aria-label')).toBeNull();
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('커스텀 fallback을 렌더한다', () => {
    render(
      <UiProvider>
        <Avatar
          name="Ada Lovelace"
          alt="Ada profile"
          fallback={<View testID="custom-fallback" />}
        />
      </UiProvider>,
    );

    expect(screen.getByTestId('custom-fallback')).toBeTruthy();
    expect(screen.queryByText('AL')).toBeNull();
  });

  it('이미지 로드 실패 시 초성으로 전환하고 imageProps.onError도 호출한다', () => {
    const onError = vi.fn();
    render(
      <UiProvider>
        <Avatar
          name="Ada Lovelace"
          alt="Ada profile"
          source={{ uri: 'https://example.test/ada.png' }}
          imageProps={{ onError, testID: 'avatar-image' }}
        />
      </UiProvider>,
    );

    expect(screen.getByTestId('avatar-image')).toBeTruthy();
    expect(screen.queryByText('AL')).toBeNull();
    expect(imageInstances).toHaveLength(1);

    act(() => {
      imageInstances[0]?.onerror?.();
    });

    expect(onError).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('avatar-image')).toBeNull();
    expect(screen.getByText('AL')).toBeTruthy();
  });

  it('실패 후 source가 바뀌면 새 이미지를 재시도한다', () => {
    const { rerender } = render(
      <UiProvider>
        <Avatar
          name="Ada Lovelace"
          alt="Ada profile"
          source={{ uri: 'https://example.test/first.png' }}
          imageProps={{ testID: 'avatar-image' }}
        />
      </UiProvider>,
    );

    act(() => {
      imageInstances[0]?.onerror?.();
    });
    expect(screen.getByText('AL')).toBeTruthy();

    rerender(
      <UiProvider>
        <Avatar
          name="Ada Lovelace"
          alt="Ada profile"
          source={{ uri: 'https://example.test/second.png' }}
          imageProps={{ testID: 'avatar-image' }}
        />
      </UiProvider>,
    );

    expect(screen.getByTestId('avatar-image')).toBeTruthy();
    expect(screen.queryByText('AL')).toBeNull();
    expect(imageInstances).toHaveLength(2);
  });
});

describe('Divider', () => {
  it('기본 decorative horizontal 선은 접근성 트리에서 숨겨진다', () => {
    render(
      <UiProvider>
        <Divider testID="divider" />
      </UiProvider>,
    );

    const divider = screen.getByTestId('divider');
    expect(divider.getAttribute('aria-hidden')).toBe('true');
    expect(screen.queryByRole('separator')).toBeNull();
    expect(divider.style.backgroundColor).toBe(hexToRgb(lightTheme.colors.line));
    expect(divider.style.height).toBe(`${StyleSheet.hairlineWidth}px`);
  });

  it('의미 있는 horizontal 선에 방향·색 토큰·치수를 반영한다', () => {
    render(
      <UiProvider>
        <Divider
          decorative={false}
          color="danger"
          thickness={3}
          inset={8}
          spacing={5}
          testID="divider"
        />
      </UiProvider>,
    );

    const divider = screen.getByRole('separator');
    expect(divider).toBe(screen.getByTestId('divider'));
    expect(divider.getAttribute('aria-orientation')).toBe('horizontal');
    expect(divider.style.backgroundColor).toBe(hexToRgb(lightTheme.colors.danger));
    expect(divider.style.height).toBe('3px');
    expect(divider.style.marginLeft).toBe('8px');
    expect(divider.style.marginRight).toBe('8px');
    expect(divider.style.marginTop).toBe('5px');
    expect(divider.style.marginBottom).toBe('5px');
  });

  it('vertical 선은 두께·inset·spacing 축을 바꿔 적용한다', () => {
    render(
      <UiProvider>
        <Divider
          orientation="vertical"
          decorative={false}
          thickness={2}
          inset="lg"
          spacing="sm"
          testID="divider"
        />
      </UiProvider>,
    );

    const divider = screen.getByTestId('divider');
    expect(divider.getAttribute('aria-orientation')).toBe('vertical');
    expect(divider.style.width).toBe('2px');
    expect(divider.style.marginTop).toBe(`${lightTheme.spacing.lg}px`);
    expect(divider.style.marginBottom).toBe(`${lightTheme.spacing.lg}px`);
    expect(divider.style.marginLeft).toBe(`${lightTheme.spacing.sm}px`);
    expect(divider.style.marginRight).toBe(`${lightTheme.spacing.sm}px`);
  });
});

describe('ListItem', () => {
  it('정적 항목은 button이 아니며 본문·leading·trailing을 렌더한다', () => {
    render(
      <UiProvider>
        <ListItem
          title="Notifications"
          description="Choose how updates reach you"
          leading={<View testID="leading" />}
          trailing={<View testID="trailing" />}
          testID="item"
        />
      </UiProvider>,
    );

    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByText('Notifications')).toBeTruthy();
    expect(screen.getByText('Choose how updates reach you')).toBeTruthy();
    expect(screen.getByTestId('leading')).toBeTruthy();
    expect(screen.getByTestId('trailing')).toBeTruthy();
    expect(screen.getByTestId('item').getAttribute('aria-disabled')).toBeNull();
  });

  it('인터랙티브 항목은 button 의미론과 라벨을 제공하고 onPress를 호출한다', () => {
    const onPress = vi.fn();
    render(
      <UiProvider>
        <ListItem
          title="Account"
          description="Manage your profile"
          onPress={onPress}
          accessibilityLabel="Open account settings"
          accessibilityHint="Opens a new screen"
          testID="item"
        />
      </UiProvider>,
    );

    const item = screen.getByRole('button', { name: 'Open account settings' });
    expect(item).toBe(screen.getByTestId('item'));
    expect(item.getAttribute('aria-disabled')).toBeNull();
    expect(item.getAttribute('aria-describedby')).toBe(
      screen.getByText('Manage your profile').id,
    );
    fireEvent.click(item);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('disabled 항목은 상태를 발행하고 클릭을 차단한다', () => {
    const onPress = vi.fn();
    render(
      <UiProvider>
        <ListItem title="Unavailable" onPress={onPress} disabled testID="item" />
      </UiProvider>,
    );

    const item = screen.getByRole('button');
    expect(item.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(item);
    expect(onPress).not.toHaveBeenCalled();
  });

  it('size는 control 토큰과 타이포 롤을 같이 바꾸다', () => {
    render(
      <UiProvider>
        <ListItem title="Large item" size="lg" testID="item" />
      </UiProvider>,
    );

    expect(screen.getByTestId('item').style.minHeight).toBe(
      `${lightTheme.metrics.control.lg}px`,
    );
    expect(screen.getByText('Large item').style.fontSize).toBe(
      `${lightTheme.typography.title.fontSize}px`,
    );
  });
});
