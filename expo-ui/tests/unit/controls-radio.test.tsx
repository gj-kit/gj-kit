import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Checkbox, Switch } from '../../src/components/controls';
import { RadioGroup } from '../../src/components/radio';
import { UiProvider } from '../../src/components/provider';
import { lightTheme } from '../../src/theme/createTheme';
import type { IconRenderProps } from '../../src/components/icons';

afterEach(cleanup);

describe('Checkbox', () => {
  it('visible label, checked state, and description are exposed without a duplicate name', () => {
    render(
      <UiProvider>
        <Checkbox
          checked
          onCheckedChange={() => {}}
          label="이용 약관 동의"
          description="필수 항목"
        />
      </UiProvider>,
    );

    const checkbox = screen.getByRole('checkbox', { name: '이용 약관 동의' });
    expect(checkbox.getAttribute('aria-checked')).toBe('true');
    const description = screen.getByText('필수 항목');
    expect(checkbox.getAttribute('aria-describedby')).toBe(description.id);
  });

  it('mixed click becomes true and renders the injected mark with semantic color and size', () => {
    const onCheckedChange = vi.fn();
    const renderMark = vi.fn((_props: IconRenderProps) => null);
    render(
      <UiProvider>
        <Checkbox
          checked="mixed"
          onCheckedChange={onCheckedChange}
          accessibilityLabel="모두 선택"
          renderMark={renderMark}
        />
      </UiProvider>,
    );

    const checkbox = screen.getByRole('checkbox', { name: '모두 선택' });
    expect(checkbox.getAttribute('aria-checked')).toBe('mixed');
    expect(renderMark).toHaveBeenCalledWith({
      color: lightTheme.colors.onPrimary,
      size: lightTheme.typography.label.fontSize,
    });
    fireEvent.click(checkbox);
    expect(onCheckedChange).toHaveBeenCalledWith(true);
  });

  it('activates with Space but never Enter on web', () => {
    const onCheckedChange = vi.fn();
    render(
      <UiProvider>
        <Checkbox
          checked={false}
          onCheckedChange={onCheckedChange}
          accessibilityLabel="뉴스레터"
        />
      </UiProvider>,
    );
    const checkbox = screen.getByRole('checkbox', { name: '뉴스레터' });

    fireEvent.keyDown(checkbox, { key: 'Enter' });
    expect(onCheckedChange).not.toHaveBeenCalled();

    fireEvent.keyDown(checkbox, { key: ' ' });
    expect(onCheckedChange).toHaveBeenCalledTimes(1);
    expect(onCheckedChange).toHaveBeenCalledWith(true);
  });

  it('disabled is removed from tab order and ignores pointer and keyboard activation', () => {
    const onCheckedChange = vi.fn();
    render(
      <UiProvider>
        <Checkbox
          checked={false}
          onCheckedChange={onCheckedChange}
          accessibilityLabel="잠긴 옵션"
          disabled
        />
      </UiProvider>,
    );
    const checkbox = screen.getByRole('checkbox', { name: '잠긴 옵션' });
    expect(checkbox.getAttribute('aria-disabled')).toBe('true');
    expect(checkbox.getAttribute('tabindex')).toBe('-1');
    fireEvent.click(checkbox);
    fireEvent.keyDown(checkbox, { key: ' ' });
    expect(onCheckedChange).not.toHaveBeenCalled();
  });
});

describe('Switch', () => {
  it('uses the native switch with controlled value and an accessible visible label', () => {
    const onValueChange = vi.fn();
    render(
      <UiProvider>
        <Switch
          value
          onValueChange={onValueChange}
          label="알림 받기"
          description="새 활동을 알려드립니다"
          testID="switch-root"
        />
      </UiProvider>,
    );

    const control = screen.getByRole('switch', { name: '알림 받기' });
    const description = screen.getByText('새 활동을 알려드립니다');
    expect((control as HTMLInputElement).checked).toBe(true);
    expect(control.getAttribute('aria-describedby')).toBe(description.id);
    fireEvent.click(screen.getByText('알림 받기'));
    expect(onValueChange).toHaveBeenLastCalledWith(false);
    fireEvent.click(control);
    expect(onValueChange).toHaveBeenCalledTimes(2);
  });

  it('supports an icon-only layout via required accessibilityLabel and blocks disabled changes', () => {
    const onValueChange = vi.fn();
    render(
      <UiProvider>
        <Switch
          value={false}
          onValueChange={onValueChange}
          accessibilityLabel="다크 모드"
          disabled
          testID="disabled-switch-root"
        />
      </UiProvider>,
    );

    const control = screen.getByRole('switch', { name: '다크 모드' });
    expect((control as HTMLInputElement).disabled).toBe(true);
    fireEvent.click(control);
    expect(onValueChange).not.toHaveBeenCalled();
  });
});

const RADIO_ITEMS = [
  { label: '이메일', value: 'email', description: '이메일로 받기' },
  { label: '문자', value: 'sms', disabled: true },
  { label: '푸시', value: 'push', description: '앱 알림으로 받기' },
] as const;

describe('RadioGroup', () => {
  it('exposes group and item semantics with exactly one roving tab stop', () => {
    render(
      <UiProvider>
        <RadioGroup
          items={RADIO_ITEMS}
          value="email"
          onValueChange={() => {}}
          accessibilityLabel="알림 채널"
        />
      </UiProvider>,
    );

    expect(screen.getByRole('radiogroup', { name: '알림 채널' })).toBeTruthy();
    const radios = screen.getAllByRole('radio');
    expect(radios).toHaveLength(3);
    expect(radios[0]?.getAttribute('aria-checked')).toBe('true');
    expect(radios[0]?.getAttribute('tabindex')).toBe('0');
    expect(radios[0]?.getAttribute('aria-describedby')).toBe(
      screen.getByText('이메일로 받기').id,
    );
    expect(radios[1]?.getAttribute('aria-disabled')).toBe('true');
    expect(radios[1]?.getAttribute('tabindex')).toBe('-1');
    expect(radios[2]?.getAttribute('aria-checked')).toBe('false');
    expect(radios[2]?.getAttribute('tabindex')).toBe('-1');
  });

  it('click and Space select a radio while Enter does not', () => {
    const onValueChange = vi.fn();
    render(
      <UiProvider>
        <RadioGroup
          items={RADIO_ITEMS}
          value="email"
          onValueChange={onValueChange}
          accessibilityLabel="알림 채널"
        />
      </UiProvider>,
    );
    const push = screen.getByRole('radio', { name: '푸시' });

    fireEvent.keyDown(push, { key: 'Enter' });
    expect(onValueChange).not.toHaveBeenCalled();
    fireEvent.keyDown(push, { key: ' ' });
    expect(onValueChange).toHaveBeenLastCalledWith('push');
    fireEvent.click(push);
    expect(onValueChange).toHaveBeenLastCalledWith('push');
    expect(onValueChange).toHaveBeenCalledTimes(2);
  });

  it('arrow keys wrap, skip disabled items, select, and move DOM focus', () => {
    const onValueChange = vi.fn();
    render(
      <UiProvider>
        <RadioGroup
          items={RADIO_ITEMS}
          value="email"
          onValueChange={onValueChange}
          accessibilityLabel="알림 채널"
        />
      </UiProvider>,
    );
    const email = screen.getByRole('radio', { name: '이메일' });
    const push = screen.getByRole('radio', { name: '푸시' });

    email.focus();
    fireEvent.keyDown(email, { key: 'ArrowDown' });
    expect(onValueChange).toHaveBeenLastCalledWith('push');
    expect(document.activeElement).toBe(push);

    fireEvent.keyDown(push, { key: 'ArrowRight' });
    expect(onValueChange).toHaveBeenLastCalledWith('email');
    expect(document.activeElement).toBe(email);
  });

  it('a null value gives the first enabled item the tab stop and disabled items stay inert', () => {
    const onValueChange = vi.fn();
    render(
      <UiProvider>
        <RadioGroup
          items={RADIO_ITEMS}
          value={null}
          onValueChange={onValueChange}
          accessibilityLabel="알림 채널"
        />
      </UiProvider>,
    );
    const email = screen.getByRole('radio', { name: '이메일' });
    const sms = screen.getByRole('radio', { name: '문자' });
    expect(email.getAttribute('tabindex')).toBe('0');
    expect(sms.getAttribute('tabindex')).toBe('-1');
    fireEvent.click(sms);
    fireEvent.keyDown(sms, { key: ' ' });
    expect(onValueChange).not.toHaveBeenCalled();
  });
});
