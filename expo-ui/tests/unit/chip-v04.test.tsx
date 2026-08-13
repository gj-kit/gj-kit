import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Text as RNText, View } from 'react-native';
import { Chip } from '../../src/components/chip';
import { UiProvider } from '../../src/components/provider';
import type { IconRenderProps } from '../../src/components/icons';
import { createTheme, lightTheme } from '../../src/theme/createTheme';

afterEach(cleanup);

describe('Chip action semantics', () => {
  it('is a focusable named button and activates through Pressable', () => {
    const onPress = vi.fn();
    render(
      <UiProvider>
        <Chip kind="action" label="새 필터" onPress={onPress} />
      </UiProvider>,
    );

    const chip = screen.getByRole('button', { name: '새 필터' });
    expect(chip.getAttribute('tabindex')).toBe('0');
    fireEvent.click(chip);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('treats leading content as decorative and passes the resolved token color and size', () => {
    const leading = vi.fn((_props: IconRenderProps) => <RNText>decorative</RNText>);
    render(
      <UiProvider>
        <Chip kind="action" label="결제" onPress={() => {}} leading={leading} />
      </UiProvider>,
    );

    expect(screen.getByRole('button', { name: '결제' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /decorative/ })).toBeNull();
    expect(leading).toHaveBeenCalledWith({
      color: lightTheme.colors.text,
      size: lightTheme.metrics.icon.md,
    });
  });

  it('forwards root and label styling escape hatches without weakening the semantic name', () => {
    render(
      <UiProvider>
        <Chip
          kind="action"
          label="설정"
          onPress={() => {}}
          className="chip-class"
          labelClassName="label-class"
          style={{ marginTop: 7 }}
          labelStyle={{ opacity: 0.73 }}
          testID="action-chip"
        />
      </UiProvider>,
    );

    const chip = screen.getByTestId('action-chip');
    expect(chip.style.marginTop).toBe('7px');
    const label = screen.getByText('설정');
    expect(label.style.opacity).toBe('0.73');
    expect(screen.getByRole('button', { name: '설정' })).toBe(chip);
  });
});

describe('Chip filter semantics', () => {
  it('uses a stable toggle-button name, aria-pressed state, and controlled inversion callback', () => {
    const onSelectedChange = vi.fn();
    const { rerender } = render(
      <UiProvider>
        <Chip
          kind="filter"
          label="읽지 않음"
          selected={false}
          onSelectedChange={onSelectedChange}
        />
      </UiProvider>,
    );

    const filter = screen.getByRole('button', { name: '읽지 않음' });
    expect(filter.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(filter);
    expect(onSelectedChange).toHaveBeenCalledWith(true);

    rerender(
      <UiProvider>
        <Chip
          kind="filter"
          label="읽지 않음"
          selected
          onSelectedChange={onSelectedChange}
        />
      </UiProvider>,
    );
    const selectedFilter = screen.getByRole('button', { name: '읽지 않음' });
    expect(selectedFilter.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(selectedFilter);
    expect(onSelectedChange).toHaveBeenLastCalledWith(false);
  });

  it('keeps the filter in the button keyboard model instead of checkbox semantics', () => {
    const onSelectedChange = vi.fn();
    render(
      <UiProvider>
        <Chip
          kind="filter"
          label="즐겨찾기"
          selected={false}
          onSelectedChange={onSelectedChange}
        />
      </UiProvider>,
    );

    const filter = screen.getByRole('button', { name: '즐겨찾기' });
    expect(filter.getAttribute('tabindex')).toBe('0');
    expect(filter.getAttribute('aria-pressed')).toBe('false');
    expect(filter.getAttribute('aria-checked')).toBeNull();
    fireEvent.click(filter);
    expect(onSelectedChange).toHaveBeenCalledWith(true);
  });

  it('uses the Provider check icon only for a selected filter without an explicit leading', () => {
    const check = vi.fn((_props: IconRenderProps) => <View testID="check-icon" />);
    const { rerender } = render(
      <UiProvider icons={{ check }}>
        <Chip kind="filter" label="활성" selected onSelectedChange={() => {}} />
      </UiProvider>,
    );

    expect(screen.getByTestId('check-icon')).toBeTruthy();
    expect(check).toHaveBeenCalledWith({
      color: lightTheme.colors.primaryStrong,
      size: lightTheme.metrics.icon.md,
    });

    const explicit = vi.fn((_props: IconRenderProps) => <View testID="explicit-icon" />);
    rerender(
      <UiProvider icons={{ check }}>
        <Chip
          kind="filter"
          label="활성"
          selected
          onSelectedChange={() => {}}
          leading={explicit}
        />
      </UiProvider>,
    );
    expect(screen.getByTestId('explicit-icon')).toBeTruthy();
    expect(check).toHaveBeenCalledTimes(1);
  });
});

describe('Chip static semantics', () => {
  it('renders a read-only selected tag as ordinary text rather than a disabled button or selection widget', () => {
    render(
      <UiProvider>
        <Chip kind="static" label="다크 초콜릿" selected testID="static-chip" />
      </UiProvider>,
    );

    const chip = screen.getByTestId('static-chip');
    expect(chip.matches('button, [role="button"]')).toBe(false);
    expect(chip.getAttribute('tabindex')).toBeNull();
    expect(chip.getAttribute('aria-pressed')).toBeNull();
    expect(chip.getAttribute('aria-selected')).toBeNull();
    expect(chip.getAttribute('aria-disabled')).toBeNull();
    expect(screen.queryByRole('button', { name: '다크 초콜릿' })).toBeNull();
    expect(screen.getByText('다크 초콜릿')).toBeTruthy();
  });

  it('uses the selected palette for a static selected tag without adding interaction', () => {
    const theme = createTheme('light', {
      colors: {
        primarySoft: '#123456',
        primaryStrong: '#345678',
      },
    });
    render(
      <UiProvider theme={theme}>
        <Chip kind="static" label="꽃향" selected testID="selected-static-chip" />
      </UiProvider>,
    );

    const chip = screen.getByTestId('selected-static-chip');
    expect(chip.style.backgroundColor).toBe('rgb(18, 52, 86)');
    expect(screen.getByText('꽃향').style.color).toBe('rgb(52, 86, 120)');
    expect(screen.queryByRole('button', { name: '꽃향' })).toBeNull();
  });
});

describe('Chip removable semantics', () => {
  it('keeps the root static and exposes exactly one separate, named remove button', () => {
    const onRemove = vi.fn();
    render(
      <UiProvider>
        <Chip
          kind="removable"
          label="React Native"
          onRemove={onRemove}
          removeAccessibilityLabel="React Native 제거"
          testID="removable-chip"
        />
      </UiProvider>,
    );

    const root = screen.getByTestId('removable-chip');
    const remove = screen.getByRole('button', { name: 'React Native 제거' });
    expect(root.matches('button, [role="button"]')).toBe(false);
    expect(root.querySelectorAll('button, [role="button"]')).toHaveLength(1);
    expect(root.querySelector('button button, [role="button"] [role="button"]')).toBeNull();
    fireEvent.click(remove);
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it('uses the Provider close icon with semantic color and size', () => {
    const close = vi.fn((_props: IconRenderProps) => <View testID="close-icon" />);
    render(
      <UiProvider icons={{ close }}>
        <Chip
          kind="removable"
          label="초안"
          onRemove={() => {}}
          removeAccessibilityLabel="초안 제거"
          size="sm"
        />
      </UiProvider>,
    );

    expect(screen.getByTestId('close-icon')).toBeTruthy();
    expect(close).toHaveBeenCalledWith({
      color: lightTheme.colors.text,
      size: lightTheme.metrics.icon.sm,
    });
  });
});

describe('Chip disabled and token contracts', () => {
  it('blocks every callback and exposes disabled state for all interactive controls', () => {
    const action = vi.fn();
    const filter = vi.fn();
    const remove = vi.fn();
    render(
      <UiProvider>
        <Chip kind="action" label="잠긴 액션" onPress={action} disabled />
        <Chip
          kind="filter"
          label="잠긴 필터"
          selected
          onSelectedChange={filter}
          disabled
        />
        <Chip
          kind="removable"
          label="잠긴 값"
          onRemove={remove}
          removeAccessibilityLabel="잠긴 값 제거"
          disabled
        />
      </UiProvider>,
    );

    const controls = [
      screen.getByRole('button', { name: '잠긴 액션' }),
      screen.getByRole('button', { name: '잠긴 필터' }),
      screen.getByRole('button', { name: '잠긴 값 제거' }),
    ];
    for (const control of controls) {
      expect(control.getAttribute('aria-disabled')).toBe('true');
      fireEvent.click(control);
      fireEvent.keyDown(control, { key: 'Enter' });
      fireEvent.keyDown(control, { key: ' ' });
    }
    expect(action).not.toHaveBeenCalled();
    expect(filter).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
  });

  it('derives filled, outlined, size, radius, typography, and disabled styles from tokens', () => {
    const theme = createTheme('light', {
      colors: {
        primarySoft: '#123456',
        primary: '#234567',
        primaryStrong: '#345678',
        surface: '#456789',
        line: '#56789A',
        textSubtle: '#6789AB',
      },
      spacing: { sm: 9, md: 13 },
      radius: { pill: 41 },
      typography: {
        caption: { fontSize: 11, lineHeight: 15, fontWeight: '500' },
      },
      metrics: {
        control: { sm: 35, md: 47, lg: 53 },
      },
    });
    render(
      <UiProvider theme={theme}>
        <Chip
          kind="filter"
          label="선택됨"
          selected
          onSelectedChange={() => {}}
          size="sm"
          testID="filled"
        />
        <Chip
          kind="filter"
          label="외곽선"
          selected
          onSelectedChange={() => {}}
          variant="outlined"
          testID="outlined"
        />
        <Chip kind="action" label="비활성" onPress={() => {}} disabled testID="disabled" />
      </UiProvider>,
    );

    const filled = screen.getByTestId('filled');
    expect(filled.style.backgroundColor).toBe('rgb(18, 52, 86)');
    expect(filled.style.minHeight).toBe('35px');
    expect(filled.style.paddingLeft).toBe('9px');
    expect(getComputedStyle(filled).borderTopLeftRadius).toBe('41px');
    const filledLabel = screen.getByText('선택됨');
    expect(filledLabel.style.color).toBe('rgb(52, 86, 120)');
    expect(filledLabel.style.fontSize).toBe('11px');
    expect(filledLabel.style.lineHeight).toBe('15px');
    expect(filledLabel.style.fontWeight).toBe('500');

    const outlined = screen.getByTestId('outlined');
    expect(outlined.style.backgroundColor).toBe('rgb(69, 103, 137)');
    expect(outlined.style.borderTopColor).toBe('rgb(35, 69, 103)');
    expect(outlined.style.minHeight).toBe('47px');
    expect(outlined.style.paddingLeft).toBe('13px');

    const disabled = screen.getByTestId('disabled');
    expect(disabled.style.borderTopColor).toBe('rgb(86, 120, 154)');
    expect(screen.getByText('비활성').style.color).toBe('rgb(103, 137, 171)');
  });
});
