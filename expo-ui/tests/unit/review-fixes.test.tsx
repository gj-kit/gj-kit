/**
 * 적대적 리뷰 확정 발견의 수정 회귀 고정 (2026-08-10).
 * 각 describe가 리뷰 발견 1건에 대응한다.
 */
import { render, screen } from '@testing-library/react';
import { useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  SearchField,
  Tabs,
  UiProvider,
  createTheme,
  createThemes,
  darkTheme,
  getActiveTheme,
  koStrings,
  lightTheme,
  useStrings,
  useTheme,
} from '../../src/index';
import { resetActiveThemeForTest, useIcons } from '../../src/components/provider';

beforeEach(() => resetActiveThemeForTest());
afterEach(() => resetActiveThemeForTest());

describe('리뷰 수정 1 — 중첩 UiProvider의 부모 값 상속', () => {
  it('theme만 지정한 중첩 Provider가 부모의 strings·icons를 상속한다', () => {
    const searchIcon = vi.fn(() => null);
    function Probe() {
      const strings = useStrings();
      const icons = useIcons();
      return (
        <>
          <SearchField value="" onChangeText={() => undefined} testID="nested-search" />
          {strings === koStrings && icons.search === searchIcon ? null : (
            <SearchField value="" onChangeText={() => undefined} testID="inheritance-broken" />
          )}
        </>
      );
    }
    render(
      <UiProvider strings={koStrings} icons={{ search: searchIcon }}>
        <UiProvider theme={darkTheme}>
          <Probe />
        </UiProvider>
      </UiProvider>,
    );
    // 부모 koStrings 상속 — placeholder가 '검색'(리셋됐다면 'Search')
    expect(screen.getByPlaceholderText('검색')).toBeTruthy();
    expect(screen.queryByTestId('inheritance-broken')).toBeNull();
    // 부모 icons.search 상속 — SearchField 기본 leading으로 호출됨
    expect(searchIcon).toHaveBeenCalled();
  });

  it('strings만 지정한 중첩 Provider가 부모의 테마를 상속한다', () => {
    let observedScheme = '';
    function Probe() {
      observedScheme = useTheme().scheme;
      return null;
    }
    render(
      <UiProvider theme={darkTheme}>
        <UiProvider strings={koStrings}>
          <Probe />
        </UiProvider>
      </UiProvider>,
    );
    expect(observedScheme).toBe('dark');
  });

  it('부모가 ThemePair여도 중첩은 해석된 단일 Theme을 상속한다', () => {
    let observed: unknown = null;
    function Probe() {
      observed = useTheme();
      return null;
    }
    const pair = createThemes({ shared: { colors: { primary: '#123456' } } });
    render(
      <UiProvider theme={pair} colorScheme="dark">
        <UiProvider strings={koStrings}>
          <Probe />
        </UiProvider>
      </UiProvider>,
    );
    expect((observed as { colors: { primary: string } }).colors.primary).toBe('#123456');
    expect((observed as { scheme: string }).scheme).toBe('dark');
  });
});

describe('리뷰 수정 2 — getActiveTheme 스냅샷이 자식 mount 이펙트에서 이미 올바름 (layout effect)', () => {
  it('자식의 mount useEffect가 루트 테마를 읽는다', () => {
    const dark = createTheme('dark');
    let observedInEffect: unknown = null;
    function Child() {
      useEffect(() => {
        observedInEffect = getActiveTheme();
      }, []);
      return null;
    }
    render(
      <UiProvider theme={dark}>
        <Child />
      </UiProvider>,
    );
    // 수정 전에는 passive effect 순서(자식→부모) 탓에 lightTheme이 읽혔다.
    expect(observedInEffect).toBe(dark);
    expect(observedInEffect).not.toBe(lightTheme);
  });
});

describe('리뷰 수정 3 — underline 탭 서체가 전신(16/600)을 typography.tab 롤로 보존', () => {
  it('underline 활성 탭 라벨이 tab 롤 fontSize·fontWeight로 렌더된다', () => {
    render(
      <UiProvider>
        <Tabs
          accessibilityLabel="콘텐츠"
          variant="underline"
          items={[
            { label: '전체', value: 'all' },
            { label: '사진', value: 'photo' },
          ]}
          value="all"
          onChange={() => undefined}
          panels={{ all: '전체 패널', photo: '사진 패널' }}
        />
      </UiProvider>,
    );
    const active = screen.getByText('전체');
    const inactive = screen.getByText('사진');
    expect(active.style.fontSize).toBe('16px');
    expect(active.style.fontWeight).toBe('600');
    expect(inactive.style.fontSize).toBe('16px');
    expect(inactive.style.fontWeight).toBe('400');
  });

  it('tab 롤은 테마 오버라이드로 독립 조정 가능하다 (body와 결합 없음)', () => {
    const theme = createTheme('light', {
      typography: { tab: { fontSize: 17, lineHeight: 24, fontWeight: '500' } },
    });
    render(
      <UiProvider theme={theme}>
        <Tabs
          accessibilityLabel="콘텐츠"
          variant="underline"
          items={[{ label: '전체', value: 'all' }]}
          value="all"
          onChange={() => undefined}
          panels={{ all: '전체 패널' }}
        />
      </UiProvider>,
    );
    expect(screen.getByText('전체').style.fontSize).toBe('17px');
  });
});
