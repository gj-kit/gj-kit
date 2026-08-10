/** Badge / Alert 상태 프리미티브 — 팔레트 관통, 내용 계약, 액션, live semantics. */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { View } from 'react-native';
import { Alert, Badge } from '../../src/components/status';
import { UiProvider } from '../../src/components/provider';
import { createTheme, lightTheme } from '../../src/theme/createTheme';
import { koStrings } from '../../src/strings/strings';

afterEach(cleanup);

function hexToRgb(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgb(${r}, ${g}, ${b})`;
}

describe('Badge', () => {
  it('기본값은 neutral + md이며 label class/style을 전달한다', () => {
    render(
      <UiProvider>
        <Badge
          label="Beta"
          labelClassName="badge-copy"
          labelStyle={{ opacity: 0.7 }}
          testID="badge"
        />
      </UiProvider>,
    );

    const badge = screen.getByTestId('badge');
    const label = screen.getByText('Beta');
    expect(badge.style.backgroundColor).toBe(hexToRgb(lightTheme.colors.surfaceSubtle));
    expect(getComputedStyle(badge).paddingLeft).toBe(`${lightTheme.spacing.md}px`);
    expect(screen.getByText('Beta')).toBeTruthy();
    expect(label.style.color).toBe(hexToRgb(lightTheme.colors.text));
    expect(label.style.fontSize).toBe(`${lightTheme.typography.label.fontSize}px`);
    expect(label.style.opacity).toBe('0.7');
  });

  it('다섯 variant가 각 상태의 soft 배경과 대비 보장 foreground를 사용한다', () => {
    const cases = [
      ['neutral', lightTheme.colors.surfaceSubtle, lightTheme.colors.text],
      ['info', lightTheme.colors.infoSoft, lightTheme.colors.info],
      ['success', lightTheme.colors.successSoft, lightTheme.colors.success],
      ['warning', lightTheme.colors.warningSoft, lightTheme.colors.warning],
      ['error', lightTheme.colors.dangerSoft, lightTheme.colors.danger],
    ] as const;

    for (const [variant, background, foreground] of cases) {
      const { unmount } = render(
        <UiProvider>
          <Badge label={variant} variant={variant} testID={`badge-${variant}`} />
        </UiProvider>,
      );
      expect(screen.getByTestId(`badge-${variant}`).style.backgroundColor).toBe(
        hexToRgb(background),
      );
      expect(screen.getByText(variant).style.color).toBe(hexToRgb(foreground));
      unmount();
    }
  });

  it('sm은 caption/작은 아이콘 토큰을 쓰고 leading 렌더 함수에 상태색을 전달한다', () => {
    const leading = vi.fn(() => <View testID="badge-icon" />);
    render(
      <UiProvider>
        <Badge label="Saved" variant="success" size="sm" leading={leading} testID="badge" />
      </UiProvider>,
    );

    expect(getComputedStyle(screen.getByTestId('badge')).paddingLeft).toBe(
      `${lightTheme.spacing.sm}px`,
    );
    expect(screen.getByText('Saved').style.fontSize).toBe(
      `${lightTheme.typography.caption.fontSize}px`,
    );
    expect(screen.getByTestId('badge-icon')).toBeTruthy();
    expect(leading).toHaveBeenCalledWith({
      color: lightTheme.colors.success,
      size: lightTheme.metrics.icon.sm,
    });
  });

  it('createTheme 상태 토큰 오버라이드가 컴포넌트까지 관통한다', () => {
    const branded = createTheme('light', {
      colors: { successSoft: '#123456', success: '#654321' },
    });
    render(
      <UiProvider theme={branded}>
        <Badge label="Custom" variant="success" testID="badge" />
      </UiProvider>,
    );

    expect(screen.getByTestId('badge').style.backgroundColor).toBe('rgb(18, 52, 86)');
    expect(screen.getByText('Custom').style.color).toBe('rgb(101, 67, 33)');
  });
});

describe('Alert content and actions', () => {
  it('기본 variant는 info이고 title 단독으로 렌더할 수 있다', () => {
    render(
      <UiProvider>
        <Alert title="Heads up" testID="alert" />
      </UiProvider>,
    );

    const alert = screen.getByTestId('alert');
    expect(screen.getByText('Heads up')).toBeTruthy();
    expect(alert.style.backgroundColor).toBe(hexToRgb(lightTheme.colors.infoSoft));
    expect(alert.style.borderTopColor).toBe(hexToRgb(lightTheme.colors.info));
  });

  it('title 없이 non-null children을 내용으로 렌더한다', () => {
    render(
      <UiProvider>
        <Alert>
          <View testID="composed-content" />
        </Alert>
      </UiProvider>,
    );
    expect(screen.getByTestId('composed-content')).toBeTruthy();
  });

  it('title과 문자열 children을 함께 주면 제목과 설명을 모두 보존한다', () => {
    render(
      <UiProvider>
        <Alert title="Payment failed">Try another card.</Alert>
      </UiProvider>,
    );
    expect(screen.getByText('Payment failed')).toBeTruthy();
    expect(screen.getByText('Try another card.')).toBeTruthy();
  });

  it('네 상태 variant가 각 soft/foreground 토큰으로 배경과 테두리를 해석한다', () => {
    const cases = [
      ['info', lightTheme.colors.infoSoft, lightTheme.colors.info],
      ['success', lightTheme.colors.successSoft, lightTheme.colors.success],
      ['warning', lightTheme.colors.warningSoft, lightTheme.colors.warning],
      ['error', lightTheme.colors.dangerSoft, lightTheme.colors.danger],
    ] as const;

    for (const [variant, soft, strong] of cases) {
      const { unmount } = render(
        <UiProvider>
          <Alert title={variant} variant={variant} testID={`alert-${variant}`} />
        </UiProvider>,
      );
      const alert = screen.getByTestId(`alert-${variant}`);
      expect(alert.style.backgroundColor).toBe(hexToRgb(soft));
      expect(alert.style.borderTopColor).toBe(hexToRgb(strong));
      expect(screen.getByText(variant).style.color).toBe(hexToRgb(strong));
      unmount();
    }
  });

  it('action과 dismiss는 죽은 UI 없이 각각 콜백과 함께 렌더된다', () => {
    const onAction = vi.fn();
    const onDismiss = vi.fn();
    render(
      <UiProvider>
        <Alert
          title="Connection lost"
          action={{ label: 'Retry', onPress: onAction }}
          onDismiss={onDismiss}
          testID="alert"
        />
      </UiProvider>,
    );

    const action = screen.getByRole('button', { name: 'Retry' });
    const dismiss = screen.getByRole('button', { name: 'Close' });
    fireEvent.click(action);
    fireEvent.click(dismiss);
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('alert').matches('button')).toBe(false);
  });

  it('dismiss 접근성 이름은 strings.close를 따르고 개별 prop이 우선한다', () => {
    const { rerender } = render(
      <UiProvider strings={koStrings}>
        <Alert title="알림" onDismiss={() => {}} />
      </UiProvider>,
    );
    expect(screen.getByRole('button', { name: '닫기' })).toBeTruthy();

    rerender(
      <UiProvider strings={koStrings}>
        <Alert
          title="알림"
          onDismiss={() => {}}
          dismissAccessibilityLabel="배너 닫기"
        />
      </UiProvider>,
    );
    expect(screen.getByRole('button', { name: '배너 닫기' })).toBeTruthy();
  });

  it('Provider status/close 아이콘을 사용하고 렌더 함수에 해석된 토큰을 준다', () => {
    const leading = vi.fn(() => <View testID="leading" />);
    const close = vi.fn(() => <View testID="close-icon" />);
    render(
      <UiProvider icons={{ toast: { warning: leading }, close }}>
        <Alert title="Caution" variant="warning" onDismiss={() => {}} />
      </UiProvider>,
    );

    expect(screen.getByTestId('leading')).toBeTruthy();
    expect(screen.getByTestId('close-icon')).toBeTruthy();
    expect(leading).toHaveBeenCalledWith({
      color: lightTheme.colors.warning,
      size: lightTheme.metrics.icon.md,
    });
    expect(close).toHaveBeenCalledTimes(1);
  });
});

describe('Alert live semantics', () => {
  it('기본 off는 정적 문서를 live region이나 alert/status 역할로 만들지 않는다', () => {
    render(
      <UiProvider>
        <Alert title="Static guidance" testID="alert" />
      </UiProvider>,
    );
    const alert = screen.getByTestId('alert');
    expect(alert.getAttribute('aria-live')).toBe('off');
    expect(alert.getAttribute('role')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('polite는 웹에서 status 역할과 aria-live=polite를 함께 노출한다', () => {
    render(
      <UiProvider>
        <Alert title="Saved" live="polite" testID="alert" />
      </UiProvider>,
    );
    const alert = screen.getByRole('status');
    expect(alert).toBe(screen.getByTestId('alert'));
    expect(alert.getAttribute('aria-live')).toBe('polite');
  });

  it('assertive는 alert 역할과 aria-live=assertive를 함께 노출한다', () => {
    render(
      <UiProvider>
        <Alert title="Session expired" live="assertive" testID="alert" />
      </UiProvider>,
    );
    const alert = screen.getByRole('alert');
    expect(alert).toBe(screen.getByTestId('alert'));
    expect(alert.getAttribute('aria-live')).toBe('assertive');
  });

  it('live severity가 바뀌어도 기존 포커스를 이동시키지 않는다', () => {
    const { rerender } = render(
      <>
        <button type="button">Keep focus</button>
        <UiProvider>
          <Alert title="Waiting" live="off" />
        </UiProvider>
      </>,
    );
    const focused = screen.getByRole('button', { name: 'Keep focus' });
    focused.focus();

    rerender(
      <>
        <button type="button">Keep focus</button>
        <UiProvider>
          <Alert title="Failed" live="assertive" />
        </UiProvider>
      </>,
    );
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Keep focus' }));
  });
});
