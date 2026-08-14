/**
 * 필드 계층 unit 테스트 — 설계 문서 §5.4(TextField) / §5.5(SearchField).
 *
 * 렌더 파이프라인: vitest + jsdom + react-native → react-native-web alias(§9).
 * - RNW는 multiline TextInput을 <textarea>, 단일행을 <input>으로 렌더한다.
 * - placeholderTextColor는 인라인 CSS 변수 `--placeholderTextColor`로 노출된다.
 * - textAlignVertical은 CSS `vertical-align`으로 매핑된다.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { View } from 'react-native';
import {
  SearchField,
  TextField,
  UiProvider,
  enStrings,
  koStrings,
  lightTheme,
} from '../../src/index';
import type { IconRenderProps } from '../../src/index';

// vitest globals 미사용 환경 — RTL 자동 cleanup이 등록되지 않으므로 명시 등록.
afterEach(cleanup);

/** #RRGGBB → jsdom 인라인 스타일 정규화 형태(rgb(r, g, b)). */
function hexToRgb(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgb(${r}, ${g}, ${b})`;
}

// ─── §5.4 TextField ────────────────────────────────────────────────────────

describe('§5.4 TextField', () => {
  it('label·counter·helperText가 렌더된다', () => {
    render(
      <UiProvider>
        <TextField label="이름" counter="3/20" helperText="실명을 입력하세요" />
      </UiProvider>,
    );
    expect(screen.getByText('이름')).toBeTruthy();
    expect(screen.getByText('3/20')).toBeTruthy();
    expect(screen.getByText('실명을 입력하세요')).toBeTruthy();
  });

  it('error가 렌더되고 보더·헬퍼가 danger 계열로 바뀐다', () => {
    render(
      <UiProvider>
        <TextField placeholder="ph" error="필수 항목입니다" />
      </UiProvider>,
    );
    const helper = screen.getByText('필수 항목입니다') as HTMLElement;
    expect(helper.style.color).toBe(hexToRgb(lightTheme.colors.dangerStrong));
    const input = screen.getByPlaceholderText('ph') as HTMLElement;
    expect(input.style.borderTopColor).toBe(hexToRgb(lightTheme.colors.dangerStrong));
  });

  it('error가 없으면 보더는 colors.textSubtle, 헬퍼는 textMuted', () => {
    render(
      <UiProvider>
        <TextField placeholder="ph" helperText="도움말" />
      </UiProvider>,
    );
    const input = screen.getByPlaceholderText('ph') as HTMLElement;
    expect(input.style.borderTopColor).toBe(hexToRgb(lightTheme.colors.textSubtle));
    const helper = screen.getByText('도움말') as HTMLElement;
    expect(helper.style.color).toBe(hexToRgb(lightTheme.colors.textMuted));
  });

  it('error가 helperText보다 우선한다 — 둘 다 주면 error만 표시', () => {
    render(
      <UiProvider>
        <TextField error="너무 깁니다" helperText="최대 20자" />
      </UiProvider>,
    );
    expect(screen.getByText('너무 깁니다')).toBeTruthy();
    expect(screen.queryByText('최대 20자')).toBeNull();
  });

  it('placeholder 색 계약 — 기본 placeholderTextColor는 colors.textSubtle', () => {
    render(
      <UiProvider>
        <TextField placeholder="입력하세요" />
      </UiProvider>,
    );
    const input = screen.getByPlaceholderText('입력하세요') as HTMLElement;
    expect(input.style.getPropertyValue('--placeholderTextColor')).toBe(
      lightTheme.colors.textSubtle,
    );
  });

  it('placeholderTextColor prop이 기본값보다 우선한다', () => {
    render(
      <UiProvider>
        <TextField placeholder="입력하세요" placeholderTextColor="#123456" />
      </UiProvider>,
    );
    const input = screen.getByPlaceholderText('입력하세요') as HTMLElement;
    expect(input.style.getPropertyValue('--placeholderTextColor')).toBe('#123456');
  });

  it('multiline이면 textarea로 렌더되고 textAlignVertical top이 적용된다', () => {
    render(
      <UiProvider>
        <TextField placeholder="본문" multiline />
      </UiProvider>,
    );
    const input = screen.getByPlaceholderText('본문') as HTMLElement;
    expect(input.tagName).toBe('TEXTAREA');
    // RNW가 textAlignVertical: 'top'을 vertical-align: top으로 매핑한다.
    expect(input.style.verticalAlign).toBe('top');
    // 멀티라인 최소 높이 = metrics.input × 2 + spacing.lg (§5.4 구현 상수).
    expect(input.style.minHeight).toBe(
      `${lightTheme.metrics.input * 2 + lightTheme.spacing.lg}px`,
    );
  });

  it('단일행 입력은 input으로 렌더되고 textAlignVertical이 적용되지 않는다', () => {
    render(
      <UiProvider>
        <TextField placeholder="한 줄" />
      </UiProvider>,
    );
    const input = screen.getByPlaceholderText('한 줄') as HTMLElement;
    expect(input.tagName).toBe('INPUT');
    expect(input.style.verticalAlign).toBe('');
  });
});

// ─── §5.5 SearchField ──────────────────────────────────────────────────────

describe('§5.5 SearchField', () => {
  it('placeholder 기본은 strings.searchPlaceholder — 기본 Provider는 영어', () => {
    render(
      <UiProvider>
        <SearchField />
      </UiProvider>,
    );
    const input = screen.getByPlaceholderText(enStrings.searchPlaceholder) as HTMLElement;
    expect(input).toBeTruthy();
    expect(input.parentElement?.style.borderTopColor).toBe(
      hexToRgb(lightTheme.colors.textSubtle),
    );
  });

  it('koStrings 주입 시 기본 placeholder가 "검색"이다', () => {
    render(
      <UiProvider strings={koStrings}>
        <SearchField />
      </UiProvider>,
    );
    expect(screen.getByPlaceholderText('검색')).toBeTruthy();
  });

  it('placeholder prop이 Provider 문구보다 우선한다', () => {
    render(
      <UiProvider strings={koStrings}>
        <SearchField placeholder="앨범 검색" />
      </UiProvider>,
    );
    expect(screen.getByPlaceholderText('앨범 검색')).toBeTruthy();
    expect(screen.queryByPlaceholderText(koStrings.searchPlaceholder)).toBeNull();
  });

  it('onChangeText가 입력과 배선된다', () => {
    const onChangeText = vi.fn();
    render(
      <UiProvider>
        <SearchField onChangeText={onChangeText} testID="search" />
      </UiProvider>,
    );
    fireEvent.change(screen.getByTestId('search'), { target: { value: '바다' } });
    expect(onChangeText).toHaveBeenCalledWith('바다');
  });

  it('접근성 이름·힌트·관계와 nativeID를 입력 요소에 전달한다', () => {
    render(
      <UiProvider>
        <SearchField
          accessibilityHint="최근 활동만 검색합니다"
          accessibilityLabel="활동 검색"
          accessibilityLabelledBy="search-label"
          aria-describedby="search-help"
          nativeID="activity-search"
          testID="search"
        />
      </UiProvider>,
    );
    const input = screen.getByTestId('search') as HTMLElement;
    expect(input.id).toBe('activity-search');
    expect(input.getAttribute('aria-label')).toBe('활동 검색');
    expect(input.getAttribute('aria-labelledby')).toBe('search-label');
    expect(input.getAttribute('aria-describedby')).toBe('search-help');
  });

  it('placeholder를 기본 접근성 이름으로 쓰고 disabled 상태는 편집도 막는다', () => {
    render(
      <UiProvider>
        <SearchField
          accessibilityState={{ disabled: true }}
          placeholder="앨범 검색"
          testID="search"
        />
      </UiProvider>,
    );
    const input = screen.getByTestId('search') as HTMLElement;
    expect(input.getAttribute('aria-label')).toBe('앨범 검색');
    expect(input.getAttribute('aria-disabled')).toBe('true');
  });

  it('leading 기본 — Provider icons.search 주입 시 렌더되고 색·크기 계약을 받는다', () => {
    const renderIcon = vi.fn((_props: IconRenderProps) => <View testID="provider-search-icon" />);
    render(
      <UiProvider icons={{ search: renderIcon }}>
        <SearchField />
      </UiProvider>,
    );
    expect(screen.getByTestId('provider-search-icon')).toBeTruthy();
    expect(renderIcon).toHaveBeenCalledWith({
      color: lightTheme.colors.textSubtle,
      size: lightTheme.metrics.icon.md,
    });
  });

  it('leading 기본 — icons.search 미주입 시 미표시(컨테이너에 입력만 남는다)', () => {
    render(
      <UiProvider>
        <SearchField testID="search" />
      </UiProvider>,
    );
    const container = (screen.getByTestId('search') as HTMLElement).parentElement;
    expect(container?.childElementCount).toBe(1);
  });

  it('leading prop이 Provider 주입보다 우선한다', () => {
    const renderIcon = vi.fn((_props: IconRenderProps) => <View testID="provider-search-icon" />);
    render(
      <UiProvider icons={{ search: renderIcon }}>
        <SearchField leading={<View testID="custom-leading" />} />
      </UiProvider>,
    );
    expect(screen.getByTestId('custom-leading')).toBeTruthy();
    expect(screen.queryByTestId('provider-search-icon')).toBeNull();
    expect(renderIcon).not.toHaveBeenCalled();
  });
});
