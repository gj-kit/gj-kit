/**
 * Round C — Sheet showCloseButton.
 *
 * 닫기 X는 편의 장치일 뿐 유일한 출구가 아니다: X를 꺼도 backdrop/Escape/Back은
 * 그대로 dismiss한다. dismissDisabled와 함께 끄면 내장 출구가 전부 사라지고
 * 출구 제공 책임이 호출부(footer)로 넘어간다 — 강제 선택 시트 패턴.
 */
import type { ReactElement } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Text } from 'react-native';
import { Sheet } from '../../src/components/sheet';
import { UiProvider } from '../../src/components/provider';

function Providers({ children }: { readonly children: ReactElement }) {
  return <UiProvider>{children}</UiProvider>;
}

afterEach(cleanup);

describe('Sheet showCloseButton', () => {
  it('renders the close button by default', async () => {
    render(
      <Providers>
        <Sheet
          open
          onOpenChange={() => {}}
          title="Filters"
          testID="sheet"
        >
          <Text>Body</Text>
        </Sheet>
      </Providers>,
    );
    await screen.findByRole('dialog');

    expect(screen.getByTestId('sheet-close')).toBeTruthy();
  });

  it('showCloseButton={false} removes the X while the backdrop still dismisses', async () => {
    const onOpenChange = vi.fn();
    render(
      <Providers>
        <Sheet
          open
          onOpenChange={onOpenChange}
          title="Sign out?"
          showCloseButton={false}
          testID="confirm-sheet"
        >
          <Text>Choose one</Text>
        </Sheet>
      </Providers>,
    );
    await screen.findByRole('dialog');

    expect(screen.queryByTestId('confirm-sheet-close')).toBeNull();
    fireEvent.pointerDown(screen.getByTestId('confirm-sheet-backdrop'));
    expect(onOpenChange).toHaveBeenCalledWith(
      false,
      expect.objectContaining({ reason: 'backdrop-press' }),
    );
  });

  it('showCloseButton={false} + dismissDisabled leaves no built-in exit — the footer is the exit', async () => {
    const onOpenChange = vi.fn();
    render(
      <Providers>
        <Sheet
          open
          onOpenChange={onOpenChange}
          title="Sign out?"
          showCloseButton={false}
          dismissDisabled
          footer={<Text>Caller-owned actions</Text>}
          testID="forced-sheet"
        >
          <Text>Choose one</Text>
        </Sheet>
      </Providers>,
    );
    await screen.findByRole('dialog');

    expect(screen.queryByTestId('forced-sheet-close')).toBeNull();
    fireEvent.pointerDown(screen.getByTestId('forced-sheet-backdrop'));
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(screen.getByText('Caller-owned actions')).toBeTruthy();
  });
});
