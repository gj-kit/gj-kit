/**
 * Dialog·ConfirmDialog·ActionSheet 모션 감소 — admin 백로그 #6.
 *
 * 모션은 플랫폼 동의 후에만 켠다(Sheet와 같은 보수적 정책): 설정이 false로
 * 확정된 뒤에야 animationType을 쓰고, 미해결(null)·감소(true)에서는 'none'으로
 * 프레젠테이션한다. 열린 채로 설정이 확정되어도 entrance를 재생하지 않는다
 * (닫힌 커밋에서만 새 애니메이션을 latch). jsdom은 CSS 애니메이션을 돌리지
 * 않아 'none'이 아니면 RNW Modal이 영원히 active(role=dialog)가 되지 않는다 —
 * 그 사실 자체가 이 테스트의 판정 도구다.
 */
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AccessibilityInfo } from 'react-native';
import { ActionSheet } from '../../src/components/action-sheet';
import { ConfirmDialog } from '../../src/components/confirm-dialog';
import { Dialog, DialogPanel } from '../../src/components/dialog';
import { UiProvider } from '../../src/components/provider';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function mockReduceMotion(value: Promise<boolean>): void {
  vi.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockReturnValue(value);
  vi.spyOn(AccessibilityInfo, 'addEventListener').mockReturnValue({ remove: vi.fn() } as never);
}

async function flushPreference(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

const scene = (open: boolean, animationType?: 'none' | 'slide' | 'fade') => (
  <UiProvider>
    <Dialog
      visible={open}
      onDismiss={() => {}}
      {...(animationType === undefined ? {} : { animationType })}
      testID="rm-dialog"
    >
      <DialogPanel title="모션 감소" />
    </Dialog>
  </UiProvider>
);

describe('Dialog reduced motion', () => {

  it('presents with no animation when the platform reports reduced motion', async () => {
    mockReduceMotion(Promise.resolve(true));
    const rendered = render(scene(false));
    await flushPreference();

    rendered.rerender(scene(true));
    // animationend 없이 role=dialog가 나타난다 = animationType 'none'.
    const dialog = await screen.findByRole('dialog', { name: '모션 감소' });
    const animationHost = dialog.parentElement?.parentElement as HTMLElement;
    expect(getComputedStyle(animationHost).animationDuration).toBe('');
  });

  it('lets the preference win even over an explicit slide', async () => {
    mockReduceMotion(Promise.resolve(true));
    const rendered = render(scene(false, 'slide'));
    await flushPreference();

    rendered.rerender(scene(true, 'slide'));
    expect(await screen.findByRole('dialog', { name: '모션 감소' })).toBeTruthy();
  });

  it('keeps the animated default while the preference is not reduced', async () => {
    mockReduceMotion(Promise.resolve(false));
    const rendered = render(scene(false));
    await flushPreference();

    rendered.rerender(scene(true));
    await flushPreference();
    // 기본 'fade'는 jsdom에서 animationend가 오지 않으므로 active가 아니다.
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('Dialog unresolved preference window', () => {
  it('presents with no animation while the platform has not answered yet', async () => {
    // isReduceMotionEnabled는 비동기다. visible 상태로 마운트된 dialog가
    // 미해결 창에서 entrance를 재생하면 모션 감소 사용자가 매 프레젠테이션마다
    // 애니메이션을 보게 된다 — 보수적으로 'none'이어야 한다.
    mockReduceMotion(new Promise<boolean>(() => {}));
    render(scene(true));

    // animationend 없이 role=dialog가 나타난다 = animationType 'none'.
    const dialog = await screen.findByRole('dialog', { name: '모션 감소' });
    const animationHost = dialog.parentElement?.parentElement as HTMLElement;
    expect(getComputedStyle(animationHost).animationDuration).toBe('');
  });

  it('does not replay the entrance when the preference resolves to false while open', async () => {
    mockReduceMotion(Promise.resolve(false));
    render(scene(true));
    const dialog = await screen.findByRole('dialog', { name: '모션 감소' });

    await flushPreference();
    // Sheet와 같은 latch: 열린 채 확정된 설정은 닫힌 커밋 이후의 다음
    // entrance에만 적용된다. 진행 중인 프레젠테이션은 'none'을 유지한다.
    expect(screen.getByRole('dialog', { name: '모션 감소' })).toBeTruthy();
    const animationHost = dialog.parentElement?.parentElement as HTMLElement;
    expect(getComputedStyle(animationHost).animationDuration).toBe('');
  });
});

describe('ConfirmDialog animationType passthrough', () => {
  it('reaches the underlying modal — "none" activates without animation events', async () => {
    mockReduceMotion(new Promise<boolean>(() => {}));
    render(
      <UiProvider>
        <ConfirmDialog
          visible
          title="삭제할까요?"
          animationType="none"
          onConfirm={() => {}}
          onDismiss={() => {}}
        />
      </UiProvider>,
    );

    expect(await screen.findByRole('dialog', { name: '삭제할까요?' })).toBeTruthy();
  });

  it('still defaults to the animated fade once the platform confirms motion is allowed', async () => {
    mockReduceMotion(Promise.resolve(false));
    const confirmScene = (open: boolean) => (
      <UiProvider>
        <ConfirmDialog
          visible={open}
          title="삭제할까요?"
          onConfirm={() => {}}
          onDismiss={() => {}}
        />
      </UiProvider>
    );
    const rendered = render(confirmScene(false));
    await flushPreference();

    rendered.rerender(confirmScene(true));
    await flushPreference();
    // 기본 'fade'는 jsdom에서 animationend가 오지 않으므로 active가 아니다.
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('ActionSheet reduced motion', () => {
  it('inherits the "none" presentation through Dialog', async () => {
    mockReduceMotion(Promise.resolve(true));
    const scene = (open: boolean) => (
      <UiProvider>
        <ActionSheet
          visible={open}
          title="정렬"
          items={[{ value: 'latest', label: '최신순' }]}
          onDismiss={() => {}}
        />
      </UiProvider>
    );
    const rendered = render(scene(false));
    await flushPreference();

    rendered.rerender(scene(true));
    expect(await screen.findByRole('dialog', { name: '정렬' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '최신순' })).toBeTruthy();
  });
});
