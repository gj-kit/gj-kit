/**
 * Section headingLevel·titleStyle·count·accessory — admin 백로그 #3.
 *
 * 페이지/패널 헤더가 앱 로컬 Panel·SubHeading 없이 heading 의미론과
 * count pill을 얻는다. prop이 없으면 기존 렌더와 동일해야 한다.
 */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Text as RNText } from 'react-native';
import { Section } from '../../src/components/layout';
import { UiProvider } from '../../src/components/provider';
import { lightTheme } from '../../src/theme/createTheme';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

/** #RRGGBB → jsdom 인라인 스타일 정규화 형태(rgb(r, g, b)). */
function hexToRgb(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgb(${r}, ${g}, ${b})`;
}

describe('Section headingLevel', () => {
  it('keeps the title a plain text node when headingLevel is absent', () => {
    render(
      <UiProvider>
        <Section title="사용자" />
      </UiProvider>,
    );

    expect(screen.getByText('사용자')).toBeTruthy();
    expect(screen.queryByRole('heading')).toBeNull();
  });

  it('exposes the title as a heading with the given aria-level', () => {
    render(
      <UiProvider>
        <Section title="사용자" headingLevel={2} />
      </UiProvider>,
    );

    expect(screen.getByRole('heading', { level: 2, name: '사용자' })).toBeTruthy();
  });

  it('applies titleStyle on top of the title role tokens', () => {
    render(
      <UiProvider>
        <Section title="사용자" titleStyle={{ color: '#123456' }} />
      </UiProvider>,
    );

    expect(screen.getByText('사용자').style.color).toBe(hexToRgb('#123456'));
  });
});

describe('Section count pill and accessory', () => {
  it('renders a token-styled count next to the title', () => {
    render(
      <UiProvider>
        <Section title="결제" count={40} testID="section" />
      </UiProvider>,
    );

    const count = screen.getByText('40');
    expect(count.style.color).toBe(hexToRgb(lightTheme.colors.textMuted));
    const pill = count.parentElement as HTMLElement;
    expect(pill.style.backgroundColor).toBe(hexToRgb(lightTheme.colors.surfaceSubtle));
    expect(screen.getByText('결제')).toBeTruthy();
  });

  it('lets countAccessibilityLabel name the pill for assistive technology', () => {
    render(
      <UiProvider>
        <Section title="결제" count={40} countAccessibilityLabel="812건 중 40건 표시" />
      </UiProvider>,
    );

    // 웹에서 role 없는 generic div의 aria-label은 ARIA가 금지한 네이밍이라
    // 무시된다. 서술형 이름은 pill의 role="img"에 실리고 숫자는 숨겨져야
    // AT가 "40" 대신 서술형 문구를 읽는다(readonly Rating 패턴).
    const pill = screen.getByRole('img', { name: '812건 중 40건 표시' });
    expect(pill.getAttribute('aria-label')).toBe('812건 중 40건 표시');
    const numeral = screen.getByText('40');
    expect(pill.contains(numeral)).toBe(true);
    expect(numeral.getAttribute('aria-hidden')).toBe('true');
    expect(numeral.getAttribute('aria-label')).toBeNull();
  });

  it('keeps the numeral exposed when no descriptive label is given', () => {
    render(
      <UiProvider>
        <Section title="결제" count={40} />
      </UiProvider>,
    );

    const numeral = screen.getByText('40');
    expect(numeral.getAttribute('aria-hidden')).toBeNull();
    expect((numeral.parentElement as HTMLElement).getAttribute('role')).toBeNull();
  });

  it('renders the accessory after the count inside the title row', () => {
    render(
      <UiProvider>
        <Section
          title="결제"
          count={40}
          accessory={<RNText testID="accessory">보조</RNText>}
        />
      </UiProvider>,
    );

    const accessory = screen.getByTestId('accessory');
    const title = screen.getByText('결제');
    expect(accessory.parentElement).toBe(
      title.parentElement,
    );
  });

  it('rejects a non-finite count as a configuration error', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() =>
      render(
        <UiProvider>
          <Section title="결제" count={Number.NaN} />
        </UiProvider>,
      ),
    ).toThrow('Section count must be a finite number.');
  });

  it('rejects a blank countAccessibilityLabel', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() =>
      render(
        <UiProvider>
          <Section title="결제" count={1} countAccessibilityLabel="  " />
        </UiProvider>,
      ),
    ).toThrow('Section countAccessibilityLabel must be a non-empty string.');
  });
});
