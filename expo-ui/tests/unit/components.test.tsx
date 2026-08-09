/**
 * 컴포넌트 토큰 관통 검증 — 설계 문서 §1 불변식 1(이 패키지의 존재 이유),
 * §5.2 Button / §5.3 IconButton / §5.6 Tabs / §5.7 Selection.
 *
 * 렌더는 react-native-web(jsdom): RNW는 동적 스타일을 DOM 인라인 스타일로
 * flatten하므로 element.style.*로 단언한다(색은 jsdom이 rgb로 정규화).
 *
 * RNW 0.21 실측 주의: RN의 `accessibilityState` 객체 prop은 DOM으로 전달되지
 * 않는다(플랫 aria-* prop만 매핑). 따라서 busy/selected는 aria 속성 대신
 * 관측 가능한 동작(스피너·눌림 차단·활성 스타일)으로 단언한다 — 네이티브
 * 계약 자체는 소비 앱의 jest-expo 스위트가 보완(§12 잔존 리스크 2).
 */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReactElement } from 'react';
import {
  Button,
  IconButton,
  SelectableRow,
  SelectionIndicator,
  Surface,
  Tabs,
  Text,
  UiProvider,
  createTheme,
  darkTheme,
} from '../../src/index';
import type { IconRenderProps, Theme } from '../../src/index';

// vitest globals가 꺼져 있으면 RTL auto-cleanup이 등록되지 않는다 — 명시 등록.
// (누락 시 이전 테스트의 렌더가 DOM에 남아 getAllByRole이 이전 요소를 집는다.)
afterEach(cleanup);

function renderWithTheme(ui: ReactElement, theme?: Theme) {
  return render(<UiProvider theme={theme}>{ui}</UiProvider>);
}

describe('§1 불변식 1 — 토큰이 스타일을 관통한다', () => {
  it('metrics.control 오버라이드가 Button minHeight를 바꾼다', () => {
    // 기본 테마: md 컨트롤 44.
    renderWithTheme(<Button label="기본" testID="btn-base" />);
    expect(screen.getByTestId('btn-base').style.minHeight).toBe('44px');

    // 오버라이드 테마: 같은 컴포넌트 코드가 다른 치수를 렌더해야 토큰 관통이다.
    const custom = createTheme('light', { metrics: { control: { sm: 30, md: 60, lg: 70 } } });
    renderWithTheme(
      <>
        <Button label="엠디" testID="btn-md" />
        <Button label="라지" size="lg" testID="btn-lg" />
      </>,
      custom,
    );
    expect(screen.getByTestId('btn-md').style.minHeight).toBe('60px');
    expect(screen.getByTestId('btn-lg').style.minHeight).toBe('70px');
  });

  it('radius 오버라이드가 Surface borderRadius에 반영된다', () => {
    // RNW는 borderRadius를 코너별 속성으로 flatten한다.
    renderWithTheme(
      <Surface testID="surf-base">
        <Text>내용</Text>
      </Surface>,
    );
    expect(screen.getByTestId('surf-base').style.borderTopLeftRadius).toBe('8px');

    const custom = createTheme('light', { radius: { sm: 99 } });
    renderWithTheme(
      <Surface testID="surf-custom">
        <Text>내용</Text>
      </Surface>,
      custom,
    );
    expect(screen.getByTestId('surf-custom').style.borderTopLeftRadius).toBe('99px');
  });

  it('typography 오버라이드가 Text role에 반영된다 (TypeRole 통째 교체 — §3.3)', () => {
    renderWithTheme(<Text role="title" testID="txt-base">제목</Text>);
    const base = screen.getByTestId('txt-base');
    expect(base.style.fontSize).toBe('18px');
    expect(base.style.lineHeight).toBe('24px');
    expect(base.style.fontWeight).toBe('800');

    const custom = createTheme('light', {
      typography: { title: { fontSize: 30, lineHeight: 36, fontWeight: '500' } },
    });
    renderWithTheme(<Text role="title" testID="txt-custom">제목</Text>, custom);
    const overridden = screen.getByTestId('txt-custom');
    expect(overridden.style.fontSize).toBe('30px');
    expect(overridden.style.lineHeight).toBe('36px');
    expect(overridden.style.fontWeight).toBe('500');
  });

  it('다크 테마 주입 시 Text 색이 다크 팔레트로 바뀐다', () => {
    renderWithTheme(<Text testID="txt-light">본문</Text>);
    // light colors.text #1D2733
    expect(screen.getByTestId('txt-light').style.color).toBe('rgb(29, 39, 51)');

    renderWithTheme(<Text testID="txt-dark">본문</Text>, darkTheme);
    // dark colors.text #E8ECF1
    expect(screen.getByTestId('txt-dark').style.color).toBe('rgb(232, 236, 241)');
  });
});

describe('§5.6 Tabs', () => {
  const items = [
    { label: '전체', value: 'all' },
    { label: '사진', value: 'photo' },
    { label: '비활성', value: 'off', disabled: true },
  ] as const;

  it('활성 탭만 활성 스타일(primary 라벨·굵은 서체)로 렌더된다', () => {
    renderWithTheme(<Tabs items={items} value="all" onChange={() => {}} />);
    const active = screen.getByText('전체');
    const inactive = screen.getByText('사진');
    // segmented 활성 라벨: colors.primary(#4A90E2) + typography.title.fontWeight(800)
    expect(active.style.color).toBe('rgb(74, 144, 226)');
    expect(active.style.fontWeight).toBe('800');
    // 비활성 라벨: colors.textMuted(#777777) + typography.body.fontWeight(400)
    expect(inactive.style.color).toBe('rgb(119, 119, 119)');
    expect(inactive.style.fontWeight).toBe('400');
  });

  it('탭을 누르면 onChange가 그 탭의 value로 호출된다', () => {
    const onChange = vi.fn();
    renderWithTheme(<Tabs items={items} value="all" onChange={onChange} />);
    fireEvent.click(screen.getAllByRole('tab')[1]!);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('photo');
  });

  it('disabled 탭은 aria-disabled로 노출되고 눌러도 onChange가 호출되지 않는다', () => {
    const onChange = vi.fn();
    renderWithTheme(<Tabs items={items} value="all" onChange={onChange} />);
    const disabledTab = screen.getAllByRole('tab')[2]!;
    expect(disabledTab.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(disabledTab);
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('§5.7 SelectionIndicator / SelectableRow', () => {
  it('renderMark 슬롯에 color/size가 전달된다 (선택 시 onPrimary, 마크 크기 = size×0.58)', () => {
    const renderMark = vi.fn((_props: IconRenderProps) => null);
    renderWithTheme(<SelectionIndicator selected renderMark={renderMark} />);
    // 기본 size 24 → round(24 × 0.58) = 14, 선택 마크 색은 colors.onPrimary.
    expect(renderMark).toHaveBeenCalledWith({ color: '#FFFFFF', size: 14 });
  });

  it('renderMark 마크 크기는 최소 10을 보장하고, 미선택 마크는 textSubtle 색이다', () => {
    const renderMark = vi.fn((_props: IconRenderProps) => null);
    renderWithTheme(
      <SelectionIndicator selected={false} showUncheckedMark size={16} renderMark={renderMark} />,
    );
    // round(16 × 0.58) = 9 → 최소값 10으로 승격. 미선택 색은 colors.textSubtle.
    expect(renderMark).toHaveBeenCalledWith({ color: '#728094', size: 10 });
  });

  it('SelectableRow는 children을 렌더하고 누르면 onPress가 호출된다', () => {
    const onPress = vi.fn();
    renderWithTheme(
      <SelectableRow selected={false} onPress={onPress} testID="row">
        <Text>행 내용</Text>
      </SelectableRow>,
    );
    expect(screen.getByText('행 내용')).toBeTruthy();
    fireEvent.click(screen.getByTestId('row'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});

describe('§5.2 Button', () => {
  it('loading 시 비활성(disabled) 계약 — 스피너 렌더·라벨 숨김·눌림 차단', () => {
    const onPress = vi.fn();
    renderWithTheme(<Button label="저장" loading onPress={onPress} testID="btn-loading" />);
    const btn = screen.getByTestId('btn-loading');
    // busy+disabled 계약 중 DOM에서 관측 가능한 부분: RNW는 accessibilityState를
    // 매핑하지 않으므로 aria-busy 대신 disabled 속성·스피너·눌림 차단으로 단언한다.
    expect(btn.getAttribute('aria-disabled')).toBe('true');
    expect(btn.hasAttribute('disabled')).toBe(true);
    expect(within(btn).getByRole('progressbar')).toBeTruthy();
    expect(screen.queryByText('저장')).toBeNull();
    fireEvent.click(btn);
    expect(onPress).not.toHaveBeenCalled();
  });

  it('icon 렌더 슬롯에 팔레트 색과 iconSize(기본 metrics.icon.md)가 전달된다', () => {
    const icon = vi.fn((_props: IconRenderProps) => null);
    renderWithTheme(<Button label="추가" icon={icon} />);
    // primary variant 텍스트색 = colors.onPrimary, 기본 크기 = metrics.icon.md(18).
    expect(icon).toHaveBeenCalledWith({ color: '#FFFFFF', size: 18 });

    const sizedIcon = vi.fn((_props: IconRenderProps) => null);
    renderWithTheme(<Button label="추가" icon={sizedIcon} iconSize={30} />);
    expect(sizedIcon).toHaveBeenCalledWith({ color: '#FFFFFF', size: 30 });
  });

  it('label과 children 겸용 — 각각 단독 렌더 가능, 둘 다 주면 label이 이긴다', () => {
    const onPress = vi.fn();
    renderWithTheme(<Button label="라벨 버튼" onPress={onPress} testID="btn-label" />);
    expect(screen.getByText('라벨 버튼')).toBeTruthy();
    fireEvent.click(screen.getByTestId('btn-label'));
    expect(onPress).toHaveBeenCalledTimes(1);

    renderWithTheme(<Button>칠드런 버튼</Button>);
    expect(screen.getByText('칠드런 버튼')).toBeTruthy();

    renderWithTheme(<Button label="라벨 우선">뒤로 밀리는 칠드런</Button>);
    expect(screen.getByText('라벨 우선')).toBeTruthy();
    expect(screen.queryByText('뒤로 밀리는 칠드런')).toBeNull();
  });
});

describe('§5.3 IconButton', () => {
  it('필수 accessibilityLabel이 접근 가능한 이름으로 렌더된다', () => {
    const onPress = vi.fn();
    renderWithTheme(
      <IconButton accessibilityLabel="설정 열기" icon={<Text>i</Text>} onPress={onPress} />,
    );
    const btn = screen.getByRole('button', { name: '설정 열기' });
    expect(btn.getAttribute('aria-label')).toBe('설정 열기');
    fireEvent.click(btn);
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
