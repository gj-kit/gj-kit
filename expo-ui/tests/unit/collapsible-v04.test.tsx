import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Collapsible } from '../../src/components/collapsible';
import { UiProvider } from '../../src/components/provider';

afterEach(cleanup);

describe('Collapsible', () => {
  it('connects one disclosure trigger to a hidden panel', () => {
    const onOpenChange = vi.fn();
    render(
      <UiProvider>
        <Collapsible
          open={false}
          onOpenChange={onOpenChange}
          title="배송 정보"
          contentStyle={{ display: 'flex' }}
        >
          배송은 이틀 걸립니다.
        </Collapsible>
      </UiProvider>,
    );

    const trigger = screen.getByRole('button', { name: '배송 정보' });
    const panel = screen.getByText('배송은 이틀 걸립니다.').parentElement;
    expect(trigger.tagName).toBe('BUTTON');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(trigger.getAttribute('aria-controls')).toBe(panel?.id);
    expect(panel?.getAttribute('aria-hidden')).toBe('true');
    expect(panel?.getAttribute('aria-labelledby')).toBe(trigger.id);
    expect(panel === null ? undefined : window.getComputedStyle(panel).display).toBe('none');

    fireEvent.click(trigger);
    expect(onOpenChange).toHaveBeenCalledOnce();
    expect(onOpenChange).toHaveBeenCalledWith(true);
  });

  it('keeps controlled open content exposed and toggles toward false', () => {
    const onOpenChange = vi.fn();
    render(
      <UiProvider>
        <Collapsible open onOpenChange={onOpenChange} title="세부 정보">
          열린 내용
        </Collapsible>
      </UiProvider>,
    );

    const trigger = screen.getByRole('button', { name: '세부 정보' });
    const panel = screen.getByText('열린 내용').parentElement;
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(panel?.getAttribute('aria-hidden')).toBeNull();
    fireEvent.click(trigger);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('keeps a disabled titled trigger inert', () => {
    const onOpenChange = vi.fn();
    render(
      <UiProvider>
        <Collapsible
          open={false}
          onOpenChange={onOpenChange}
          title="고급 설정"
          disabled
        >
          고급 내용
        </Collapsible>
      </UiProvider>,
    );

    const trigger = screen.getByRole('button', { name: '고급 설정' });
    expect(trigger.getAttribute('aria-disabled')).toBe('true');
    expect(trigger.getAttribute('tabindex')).toBe('-1');
    fireEvent.click(trigger);
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('Provider indicator를 장식 전용으로 숨기고 확장 상태에 맞춰 회전한다', () => {
    const chevronDown = vi.fn(() => <span data-testid="chevron">⌄</span>);
    render(
      <UiProvider icons={{ chevronDown }}>
        <Collapsible open onOpenChange={() => {}} title="세부 정보">
          내용
        </Collapsible>
      </UiProvider>,
    );

    expect(chevronDown).toHaveBeenCalledWith(expect.objectContaining({ expanded: true }));
    const chevron = screen.getByTestId('chevron');
    expect(chevron.closest('[aria-hidden="true"]')).toBeTruthy();
    expect(chevron.parentElement?.style.transform).toContain('180deg');
  });
});
