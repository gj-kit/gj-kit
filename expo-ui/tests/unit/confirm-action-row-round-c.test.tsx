/**
 * Round C — ConfirmActionRow 버튼별 탈출구와 ConfirmDialog testID 패스스루.
 *
 * 소비 앱의 `-cancel-button`/`-confirm-button` testID 규약과 버튼별
 * container/label 스타일이 킷 행으로 이관 가능한지 고정한다.
 */
import type { ReactElement } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConfirmActionRow } from '../../src/components/dialog';
import { ConfirmDialog } from '../../src/components/confirm-dialog';
import { UiProvider } from '../../src/components/provider';

function Providers({ children }: { readonly children: ReactElement }) {
  return <UiProvider>{children}</UiProvider>;
}

afterEach(cleanup);

describe('ConfirmActionRow per-button escape hatches', () => {
  it('forwards cancelTestID/confirmTestID to the actual buttons and keeps them pressable', () => {
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    render(
      <Providers>
        <ConfirmActionRow
          onCancel={onCancel}
          onConfirm={onConfirm}
          cancelTestID="logout-cancel-button"
          confirmTestID="logout-confirm-button"
        />
      </Providers>,
    );

    fireEvent.click(screen.getByTestId('logout-cancel-button'));
    fireEvent.click(screen.getByTestId('logout-confirm-button'));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('applies per-button container and label styles after the built-in ones', () => {
    render(
      <Providers>
        <ConfirmActionRow
          onCancel={() => {}}
          onConfirm={() => {}}
          cancelLabel="Keep"
          confirmLabel="Sign out"
          cancelTestID="row-cancel"
          confirmTestID="row-confirm"
          cancelStyle={{ backgroundColor: 'rgb(241, 243, 245)' }}
          confirmStyle={{ backgroundColor: 'rgb(10, 20, 30)' }}
          cancelLabelStyle={{ color: 'rgb(84, 110, 122)' }}
          confirmLabelStyle={{ color: 'rgb(200, 210, 220)' }}
        />
      </Providers>,
    );

    expect(
      getComputedStyle(screen.getByTestId('row-cancel')).backgroundColor,
    ).toBe('rgb(241, 243, 245)');
    expect(
      getComputedStyle(screen.getByTestId('row-confirm')).backgroundColor,
    ).toBe('rgb(10, 20, 30)');
    expect(getComputedStyle(screen.getByText('Keep')).color).toBe(
      'rgb(84, 110, 122)',
    );
    expect(getComputedStyle(screen.getByText('Sign out')).color).toBe(
      'rgb(200, 210, 220)',
    );
    // 행 flex 사이징은 유지된다 — 탈출구는 덮어쓰기지 대체가 아니다.
    expect(getComputedStyle(screen.getByTestId('row-cancel')).flexGrow).toBe('1');
  });
});

describe('ConfirmDialog testID passthrough', () => {
  it('keeps the derived -cancel/-confirm defaults', async () => {
    render(
      <Providers>
        <ConfirmDialog
          visible
          title="Sign out?"
          onConfirm={() => {}}
          onDismiss={() => {}}
          testID="cd"
        />
      </Providers>,
    );
    await screen.findByRole('dialog');

    expect(screen.getByTestId('cd-cancel')).toBeTruthy();
    expect(screen.getByTestId('cd-confirm')).toBeTruthy();
  });

  it('cancelTestID/confirmTestID override the derived defaults', async () => {
    const onConfirm = vi.fn();
    render(
      <Providers>
        <ConfirmDialog
          visible
          title="Sign out?"
          onConfirm={onConfirm}
          onDismiss={() => {}}
          testID="cd"
          cancelTestID="cd-cancel-button"
          confirmTestID="cd-confirm-button"
        />
      </Providers>,
    );
    await screen.findByRole('dialog');

    expect(screen.queryByTestId('cd-cancel')).toBeNull();
    expect(screen.queryByTestId('cd-confirm')).toBeNull();
    fireEvent.click(screen.getByTestId('cd-confirm-button'));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('cd-cancel-button')).toBeTruthy();
  });
});
