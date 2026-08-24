/**
 * AccordionItem trailing — admin 백로그 #4.
 *
 * 헤더 행의 제목 옆 count pill 등은 presentation-only다. 트리거의 접근성
 * 이름은 title 그대로여야 하고 trailing은 접근성 트리에서 숨긴다.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Text as RNText } from 'react-native';
import { Accordion } from '../../src/components/accordion';
import { UiProvider } from '../../src/components/provider';

afterEach(cleanup);

describe('AccordionItem trailing', () => {
  const items = [
    {
      value: 'payments',
      title: '최근 결제',
      trailing: <RNText testID="count-pill">12</RNText>,
      content: <RNText>내역</RNText>,
    },
  ] as const;

  it('renders trailing in the header row while keeping the trigger name the title', () => {
    render(
      <UiProvider>
        <Accordion items={items} value={null} onValueChange={() => {}} />
      </UiProvider>,
    );

    const trigger = screen.getByRole('button', { name: '최근 결제' });
    const pill = screen.getByTestId('count-pill');
    expect(trigger.contains(pill)).toBe(true);
    const slot = pill.parentElement as HTMLElement;
    expect(slot.getAttribute('aria-hidden')).toBe('true');
    // 이름에 12가 섞인 트리거는 존재하지 않는다.
    expect(screen.queryByRole('button', { name: /12/ })).toBeNull();
  });

  it('does not interfere with expansion', () => {
    const onValueChange = vi.fn();
    render(
      <UiProvider>
        <Accordion items={items} value={null} onValueChange={onValueChange} />
      </UiProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: '최근 결제' }));
    expect(onValueChange).toHaveBeenCalledWith('payments');
  });
});
