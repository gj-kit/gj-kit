import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AccessibilityInfo, Animated } from 'react-native';
import { Text } from '../../src/components/text';
import { UiProvider } from '../../src/components/provider';
import { Accordion } from '../../src/components/accordion';
import { ProgressBar, Spinner } from '../../src/components/progress';
import { createTheme } from '../../src/theme/createTheme';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('Spinner / ProgressBar', () => {
  it('Spinner는 현지화된 기본 이름과 busy progressbar 의미를 갖는다', () => {
    render(
      <UiProvider strings={{
        loading: '불러오는 중',
        emptyTitle: '비어 있음',
        errorTitle: '오류',
        errorBody: '다시 시도',
        retry: '재시도',
        selectAll: '전체 선택',
        deselectAll: '전체 해제',
        cancel: '취소',
        confirm: '확인',
        close: '닫기',
        searchPlaceholder: '검색',
        noResults: '검색 결과 없음',
        sortAscending: '오름차순 정렬됨',
        sortDescending: '내림차순 정렬됨',
        sortUnsorted: '정렬되지 않음',
        rowActivationHint: 'Enter 또는 Space 키로 활성화',
        previousPage: '이전 페이지',
        nextPage: '다음 페이지',
        ratingNoValue: '평점 없음',
        ratingValue: (value, maxRating) => `${value}점 / ${maxRating}점`,
        clearRating: '평점 지우기',
        // v0.9 진화 경로 — 손으로 조립한 번들은 새 키를 함께 추가해야 한다.
        dateFieldYear: '년',
        dateFieldMonth: '월',
        dateFieldDay: '일',
      }}>
        <Spinner />
      </UiProvider>,
    );

    const spinner = screen.getByRole('progressbar', { name: '불러오는 중' });
    expect(spinner.getAttribute('aria-busy')).toBe('true');
  });

  it('determinate 값은 범위와 시각 비율을 clamp한다', () => {
    const { rerender } = render(<ProgressBar value={75} max={200} accessibilityLabel="업로드" />);
    let progress = screen.getByRole('progressbar', { name: '업로드' });
    expect(progress.getAttribute('aria-valuemin')).toBe('0');
    expect(progress.getAttribute('aria-valuemax')).toBe('200');
    expect(progress.getAttribute('aria-valuenow')).toBe('75');
    expect((progress.firstElementChild as HTMLElement).style.width).toBe('37.5%');

    rerender(<ProgressBar value={999} max={200} accessibilityLabel="업로드" />);
    progress = screen.getByRole('progressbar', { name: '업로드' });
    expect(progress.getAttribute('aria-valuenow')).toBe('200');
    expect((progress.firstElementChild as HTMLElement).style.width).toBe('100%');

    rerender(<ProgressBar value={-20} max={0} accessibilityLabel="업로드" />);
    progress = screen.getByRole('progressbar', { name: '업로드' });
    expect(progress.getAttribute('aria-valuemax')).toBe('100');
    expect(progress.getAttribute('aria-valuenow')).toBe('0');
  });

  it('indeterminate는 현재 값을 거짓으로 발표하지 않는다', async () => {
    render(
      <ProgressBar
        value={null}
        accessibilityLabel="동기화"
        accessibilityValueText="진행 중"
      />,
    );
    const progress = screen.getByRole('progressbar', { name: '동기화' });
    expect(progress.getAttribute('aria-busy')).toBe('true');
    expect(progress.hasAttribute('aria-valuenow')).toBe(false);
    expect(progress.hasAttribute('aria-valuemin')).toBe(false);
    expect(progress.hasAttribute('aria-valuemax')).toBe(false);
    expect(progress.getAttribute('aria-valuetext')).toBe('진행 중');
    await act(async () => {
      await Promise.resolve();
    });
  });

  it('모션 감소 설정에서는 indeterminate 이동 애니메이션을 시작하지 않는다', async () => {
    vi.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
    const loop = vi.spyOn(Animated, 'loop');

    render(<ProgressBar value={null} accessibilityLabel="동기화" />);

    await act(async () => {
      await Promise.resolve();
    });
    expect(AccessibilityInfo.isReduceMotionEnabled).toHaveBeenCalledTimes(1);
    expect(loop).not.toHaveBeenCalled();
  });

  it('variant의 soft/semantic 토큰 오버라이드가 track과 indicator에 관통한다', () => {
    const theme = createTheme('light', {
      colors: { success: '#123456', successSoft: '#ABCDEF' },
    });
    render(
      <UiProvider theme={theme}>
        <ProgressBar value={50} variant="success" accessibilityLabel="완료율" />
      </UiProvider>,
    );
    const progress = screen.getByRole('progressbar');
    expect(progress.style.backgroundColor).toBe('rgb(171, 205, 239)');
    expect((progress.firstElementChild as HTMLElement).style.backgroundColor).toBe(
      'rgb(18, 52, 86)',
    );
  });
});

const items = [
  { value: 'account', title: '계정', description: '프로필 설정', content: <Text>계정 내용</Text> },
  { value: 'billing', title: '결제', content: <Text>결제 내용</Text> },
  { value: 'locked', title: '잠김', content: <Text>잠긴 내용</Text>, disabled: true },
] as const;

describe('Accordion', () => {
  it('헤더와 패널을 안정적인 ARIA 관계로 연결한다', () => {
    render(<Accordion items={items} value="account" onValueChange={() => {}} />);
    const account = screen.getByRole('button', { name: /계정/ });
    const billing = screen.getByRole('button', { name: '결제' });

    expect(account.getAttribute('aria-expanded')).toBe('true');
    expect(billing.getAttribute('aria-expanded')).toBe('false');
    expect(account.getAttribute('aria-describedby')).toBe(
      screen.getByText('프로필 설정').id,
    );
    expect(getComputedStyle(account).paddingLeft).toBe('16px');
    expect(getComputedStyle(account).paddingTop).toBe('12px');
    expect(
      (account.lastElementChild?.firstElementChild as HTMLElement | null)?.style.transform,
    ).toBe('rotate(180deg)');
    const panelId = account.getAttribute('aria-controls');
    expect(panelId).toBeTruthy();
    const panel = document.getElementById(panelId!);
    expect(panel?.getAttribute('aria-labelledby')).toBe(account.id);
    expect(panel?.style.display).toBe('flex');
    expect(screen.getAllByRole('heading')).toHaveLength(3);
  });

  it('single은 열기/닫기를 요청하고 non-collapsible 열린 헤더는 포커스를 유지한다', () => {
    const onValueChange = vi.fn();
    const { rerender } = render(
      <Accordion items={items} value="account" onValueChange={onValueChange} />,
    );
    fireEvent.click(screen.getByRole('button', { name: '결제' }));
    expect(onValueChange).toHaveBeenLastCalledWith('billing');
    fireEvent.click(screen.getByRole('button', { name: /계정/ }));
    expect(onValueChange).toHaveBeenLastCalledWith(null);

    onValueChange.mockClear();
    rerender(
      <Accordion
        items={items}
        value="account"
        onValueChange={onValueChange}
        collapsible={false}
      />,
    );
    const locked = screen.getByRole('button', { name: /계정/ });
    expect(locked.getAttribute('aria-disabled')).toBe('true');
    expect(locked.hasAttribute('disabled')).toBe(false);
    expect(getComputedStyle(locked.firstElementChild as HTMLElement).paddingLeft).toBe('16px');
    locked.focus();
    expect(document.activeElement).toBe(locked);
    fireEvent.click(locked);
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it('웹 버튼의 Enter·Space 기본 동작은 상태 변경을 한 번만 요청한다', () => {
    const onValueChange = vi.fn();
    render(<Accordion items={items} value="account" onValueChange={onValueChange} />);
    const billing = screen.getByRole('button', { name: '결제' });

    fireEvent.keyDown(billing, { key: 'Enter' });
    fireEvent.keyUp(billing, { key: 'Enter' });
    fireEvent.click(billing);
    expect(onValueChange).toHaveBeenCalledTimes(1);

    onValueChange.mockClear();
    fireEvent.keyDown(billing, { key: ' ' });
    fireEvent.keyUp(billing, { key: ' ' });
    fireEvent.click(billing);
    expect(onValueChange).toHaveBeenCalledTimes(1);
  });

  it('multiple은 독립적으로 값을 추가·제거하고 disabled 항목은 차단한다', () => {
    const onValueChange = vi.fn();
    render(
      <Accordion
        type="multiple"
        items={items}
        value={['account']}
        onValueChange={onValueChange}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: '결제' }));
    expect(onValueChange).toHaveBeenLastCalledWith(['account', 'billing']);
    fireEvent.click(screen.getByRole('button', { name: /계정/ }));
    expect(onValueChange).toHaveBeenLastCalledWith([]);

    const locked = screen.getByRole('button', { name: '잠김' });
    expect(locked.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(locked);
    expect(onValueChange).toHaveBeenCalledTimes(2);
  });
});
