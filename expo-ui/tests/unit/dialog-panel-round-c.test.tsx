/**
 * Round C — DialogPanel 헤더/닫기 커스터마이즈와 Dialog backdropStyle.
 *
 * headerStyle/descriptionStyle/hideHeader/closeButtonStyle/closeIcon가 시안
 * 고정 확인창(LegacyConfirmPanel류)을 킷 패널로 흡수할 수 있는지, 그리고
 * hideHeader가 접근 가능한 이름 규율을 유지하는지 고정한다.
 */
import type { ReactElement } from 'react';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Text } from 'react-native';
import { Dialog, DialogPanel } from '../../src/components/dialog';
import type { DialogPanelProps } from '../../src/components/dialog';
import { UiProvider } from '../../src/components/provider';

function Providers({ children }: { readonly children: ReactElement }) {
  return <UiProvider>{children}</UiProvider>;
}

afterEach(cleanup);

describe('DialogPanel header and close customization', () => {
  it('applies headerStyle to the header row and descriptionStyle to the description', async () => {
    render(
      <Providers>
        <Dialog visible onDismiss={() => {}} testID="dlg">
          <DialogPanel
            title="Round C"
            description="Escape hatches"
            headerStyle={{ backgroundColor: 'rgb(1, 2, 3)' }}
            descriptionStyle={{ color: 'rgb(4, 5, 6)' }}
          />
        </Dialog>
      </Providers>,
    );
    await screen.findByRole('dialog');

    const heading = screen.getByRole('heading', { name: 'Round C' });
    const headerRow = heading.parentElement?.parentElement as HTMLElement;
    expect(getComputedStyle(headerRow).backgroundColor).toBe('rgb(1, 2, 3)');
    expect(getComputedStyle(screen.getByText('Escape hatches')).color).toBe(
      'rgb(4, 5, 6)',
    );
  });

  it('closeIcon replaces the default mark and closeButtonStyle styles the button while the accessible name stays', async () => {
    render(
      <Providers>
        <Dialog visible onDismiss={() => {}} testID="dlg">
          <DialogPanel
            title="Round C"
            closeButtonTestID="dlg-close"
            closeButtonStyle={{ backgroundColor: 'rgb(7, 8, 9)' }}
            closeIcon={<Text>custom-close-mark</Text>}
          />
        </Dialog>
      </Providers>,
    );
    await screen.findByRole('dialog');

    const close = screen.getByTestId('dlg-close');
    expect(getComputedStyle(close).backgroundColor).toBe('rgb(7, 8, 9)');
    expect(within(close).getByText('custom-close-mark')).toBeTruthy();
    expect(within(close).queryByText('×')).toBeNull();
    expect(screen.getByRole('button', { name: 'Close' })).toBe(close);
  });

  it('a null closeIcon falls back to the default mark (icon-slot convention)', async () => {
    render(
      <Providers>
        <Dialog visible onDismiss={() => {}} testID="dlg">
          <DialogPanel
            title="Round C"
            closeButtonTestID="dlg-close"
            closeIcon={null}
          />
        </Dialog>
      </Providers>,
    );
    await screen.findByRole('dialog');

    // null은 빈 마크가 아니라 기본 마크로 되돌아간다 — 마크 없는 버튼은 빈
    // 프래그먼트가 담당한다(문서화된 아이콘 슬롯 규약).
    expect(
      within(screen.getByTestId('dlg-close')).getByText('\u00d7'),
    ).toBeTruthy();
  });

  it('a RenderIcon closeIcon that returns null also falls back to the default mark', async () => {
    render(
      <Providers>
        <Dialog visible onDismiss={() => {}} testID="dlg">
          <DialogPanel
            title="Round C"
            closeButtonTestID="dlg-close"
            closeIcon={() => null}
          />
        </Dialog>
      </Providers>,
    );
    await screen.findByRole('dialog');

    expect(
      within(screen.getByTestId('dlg-close')).getByText('\u00d7'),
    ).toBeTruthy();
  });

  it('hideHeader removes the visible title/description but keeps the close button and the modal name', async () => {
    render(
      <Providers>
        <Dialog
          visible
          onDismiss={() => {}}
          accessibilityLabel="Delete confirmation"
          testID="named"
        >
          <DialogPanel
            title="Hidden title"
            description="Hidden description"
            hideHeader
            closeButtonTestID="named-close"
          >
            <Text>Caller-owned copy</Text>
          </DialogPanel>
        </Dialog>
      </Providers>,
    );
    const dialog = await screen.findByRole('dialog');

    expect(dialog.getAttribute('aria-label')).toBe('Delete confirmation');
    expect(dialog.getAttribute('aria-labelledby')).toBeNull();
    // description 노드가 렌더되지 않으므로 aria-describedby도 빈 참조를 남기지 않는다.
    expect(dialog.getAttribute('aria-describedby')).toBeNull();
    expect(screen.queryByText('Hidden title')).toBeNull();
    expect(screen.queryByText('Hidden description')).toBeNull();
    expect(screen.getByTestId('named-close')).toBeTruthy();
    expect(screen.getByText('Caller-owned copy')).toBeTruthy();
  });

  it('hideHeader also skips the leading node, as documented', async () => {
    render(
      <Providers>
        <Dialog
          visible
          onDismiss={() => {}}
          accessibilityLabel="Named"
          testID="lead"
        >
          <DialogPanel title="Hidden" hideHeader leading={<Text>status-icon</Text>}>
            <Text>Body</Text>
          </DialogPanel>
        </Dialog>
      </Providers>,
    );
    await screen.findByRole('dialog');

    expect(screen.queryByText('status-icon')).toBeNull();
    expect(screen.getByText('Body')).toBeTruthy();
  });

  it('hideHeader with showCloseButton={false} renders no header row at all', async () => {
    render(
      <Providers>
        <Dialog
          visible
          onDismiss={() => {}}
          accessibilityLabel="Forced choice"
          testID="forced"
        >
          <DialogPanel
            title="Hidden title"
            hideHeader
            showCloseButton={false}
            closeButtonTestID="forced-close"
          >
            <Text>Body</Text>
          </DialogPanel>
        </Dialog>
      </Providers>,
    );
    await screen.findByRole('dialog');

    expect(screen.queryByRole('heading')).toBeNull();
    expect(screen.queryByTestId('forced-close')).toBeNull();
    expect(screen.getByText('Body')).toBeTruthy();
  });

  it('a JS truthy non-boolean hideHeader is rejected at render instead of bypassing the naming rule', () => {
    // "false" 문자열은 truthy — 렌더 분기(truthiness)는 헤더를 숨기지만 이름
    // 강제(=== true)는 통과해 이름 없는 다이얼로그가 되는 상태. boolean 검증이
    // 그 상태를 렌더 전에 막는다(JS 소비자 프로브라 as unknown 캐스트).
    const stringProbe = {
      title: 'Hidden',
      hideHeader: 'false',
    } as unknown as DialogPanelProps;
    expect(() =>
      render(
        <Providers>
          <Dialog visible onDismiss={() => {}}>
            <DialogPanel {...stringProbe} />
          </Dialog>
        </Providers>,
      ),
    ).toThrow('DialogPanel hideHeader must be a boolean.');
  });

  it('a standalone DialogPanel also rejects a non-boolean hideHeader', () => {
    const numberProbe = {
      title: 'Hidden',
      hideHeader: 1,
    } as unknown as DialogPanelProps;
    expect(() =>
      render(
        <Providers>
          <DialogPanel {...numberProbe} />
        </Providers>,
      ),
    ).toThrow('DialogPanel hideHeader must be a boolean.');
  });

  it('a modal Dialog whose direct panel hides its header requires Dialog accessibilityLabel', () => {
    expect(() =>
      render(
        <Providers>
          <Dialog visible onDismiss={() => {}}>
            <DialogPanel title="Hidden" hideHeader />
          </Dialog>
        </Providers>,
      ),
    ).toThrow(
      'Dialog requires accessibilityLabel when its DialogPanel sets hideHeader',
    );
  });
});

describe('Dialog backdropStyle', () => {
  it('layers backdropStyle after the theme overlay color on the backdrop pressable', async () => {
    render(
      <Providers>
        <Dialog
          visible
          onDismiss={() => {}}
          testID="dim"
          backdropStyle={{ backgroundColor: 'rgb(9, 9, 9)' }}
        >
          <DialogPanel title="Backdrop override" />
        </Dialog>
      </Providers>,
    );
    await screen.findByRole('dialog');

    expect(
      getComputedStyle(screen.getByTestId('dim-backdrop')).backgroundColor,
    ).toBe('rgb(9, 9, 9)');
  });
});
