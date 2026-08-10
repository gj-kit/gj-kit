/**
 * createTheme/createThemes/내장 테마 — 설계 문서 §3.3, §3.6.
 *
 * "./theme" 배럴에서 import한다 — React 0 엔트리(§2)가 RN alias 없이도
 * 순수 로드됨을 겸사겸사 증명한다.
 */
import { describe, expect, it } from 'vitest';
import {
  createTheme,
  createThemes,
  darkTheme,
  defaultThemes,
  lightTheme,
} from '../../src/theme';
import type { ColorKey, ThemeColors, ThemeOverrides } from '../../src/theme';

function relativeLuminance(hex: string): number {
  const channels = [1, 3, 5].map((start) => Number.parseInt(hex.slice(start, start + 2), 16) / 255);
  const [red = 0, green = 0, blue = 0] = channels.map((channel) =>
    channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
  );
  return red * 0.2126 + green * 0.7152 + blue * 0.0722;
}

function contrastRatio(first: string, second: string): number {
  const lighter = Math.max(relativeLuminance(first), relativeLuminance(second));
  const darker = Math.min(relativeLuminance(first), relativeLuminance(second));
  return (lighter + 0.05) / (darker + 0.05);
}

function expectAccessibleStatusColors(colors: ThemeColors): void {
  const softPairs = [
    [colors.text, colors.surfaceSubtle],
    [colors.danger, colors.dangerSoft],
    [colors.warning, colors.warningSoft],
    [colors.success, colors.successSoft],
    [colors.info, colors.infoSoft],
  ] as const;
  const solidPairs = [
    [colors.onDanger, colors.dangerStrong],
    [colors.onWarning, colors.warningStrong],
    [colors.onSuccess, colors.successStrong],
    [colors.onInfo, colors.infoStrong],
  ] as const;

  for (const pair of [...softPairs, ...solidPairs]) {
    expect(contrastRatio(...pair)).toBeGreaterThanOrEqual(4.5);
  }

  const controlAndProgressPairs = [
    [colors.textSubtle, colors.surface],
    [colors.primary, colors.surface],
    [colors.primaryStrong, colors.primarySoft],
    [colors.danger, colors.dangerSoft],
    [colors.warning, colors.warningSoft],
    [colors.success, colors.successSoft],
    [colors.info, colors.infoSoft],
  ] as const;
  for (const pair of controlAndProgressPairs) {
    expect(contrastRatio(...pair)).toBeGreaterThanOrEqual(3);
  }
}

describe('§3.3 createTheme — 부분 오버라이드 2단 병합', () => {
  it('colors.primary만 바꿔도 나머지 30롤이 유지된다', () => {
    const theme = createTheme('light', { colors: { primary: '#123456' } });
    expect(theme.colors.primary).toBe('#123456');

    const rest = (Object.keys(lightTheme.colors) as readonly ColorKey[]).filter(
      (key) => key !== 'primary',
    );
    expect(rest).toHaveLength(30); // 31롤 - primary
    for (const key of rest) {
      expect(theme.colors[key]).toBe(lightTheme.colors[key]);
    }
  });

  it('spacing 오버라이드는 해당 키만 덮고 다른 그룹은 그대로다', () => {
    const theme = createTheme('light', { spacing: { md: 14 } });
    expect(theme.spacing.md).toBe(14);
    expect(theme.spacing.lg).toBe(lightTheme.spacing.lg);
    expect(theme.spacing.none).toBe(0);
    expect(theme.colors).toEqual(lightTheme.colors);
    expect(theme.radius).toEqual(lightTheme.radius);
    expect(theme.metrics).toEqual(lightTheme.metrics);
  });

  it('typography role은 TypeRole 통째 교체다 — 3단 병합 아님(§11)', () => {
    const title = { fontSize: 20, lineHeight: 26, fontWeight: '700' } as const;
    const theme = createTheme('light', { typography: { title } });
    expect(theme.typography.title).toEqual(title);
    // 다른 롤은 그대로
    expect(theme.typography.body).toEqual(lightTheme.typography.body);
    expect(theme.typography.button).toEqual(lightTheme.typography.button);
  });
});

describe('§3.3 createThemes — shared → 스킴별 순 병합', () => {
  it('shared 오버라이드가 light/dark 양 스킴에 적용된다', () => {
    const pair = createThemes({ shared: { colors: { primary: '#ABCDEF' } } });
    expect(pair.light.colors.primary).toBe('#ABCDEF');
    expect(pair.dark.colors.primary).toBe('#ABCDEF');
    // shared가 덮지 않은 롤은 스킴별 기본 팔레트 유지
    expect(pair.light.colors.surface).toBe(lightTheme.colors.surface);
    expect(pair.dark.colors.surface).toBe(darkTheme.colors.surface);
  });

  it('스킴별 오버라이드가 shared를 덮는다', () => {
    const pair = createThemes({
      shared: { colors: { primary: '#111111', danger: '#222222' } },
      dark: { colors: { primary: '#333333' } },
    });
    expect(pair.dark.colors.primary).toBe('#333333'); // dark가 shared를 덮음
    expect(pair.light.colors.primary).toBe('#111111'); // light는 shared 유지
    expect(pair.dark.colors.danger).toBe('#222222'); // dark가 덮지 않은 키는 shared 유지
    expect(pair.light.colors.danger).toBe('#222222');
  });

  it('light만 오버라이드해도 dark는 기본 다크 팔레트를 유지한다 — 자동 유도 없음', () => {
    const pair = createThemes({ light: { colors: { primary: '#0000FF' } } });
    expect(pair.light.colors.primary).toBe('#0000FF');
    expect(pair.dark.colors).toEqual(darkTheme.colors);
  });

  it('무인자 createThemes()와 defaultThemes는 내장 테마 쌍과 값이 같다', () => {
    const pair = createThemes();
    expect(pair.light).toEqual(lightTheme);
    expect(pair.dark).toEqual(darkTheme);
    expect(defaultThemes.light).toEqual(lightTheme);
    expect(defaultThemes.dark).toEqual(darkTheme);
  });
});

describe('§3.3 깊은 동결과 scheme 필드', () => {
  it('생성 테마는 중첩 그룹까지 깊은 동결이다', () => {
    const theme = createTheme('light', { colors: { primary: '#123456' } });
    expect(Object.isFrozen(theme)).toBe(true);
    expect(Object.isFrozen(theme.colors)).toBe(true);
    expect(Object.isFrozen(theme.typography)).toBe(true);
    expect(Object.isFrozen(theme.typography.body)).toBe(true);
    expect(Object.isFrozen(theme.elevation.md)).toBe(true);
    expect(Object.isFrozen(theme.metrics.control)).toBe(true);
  });

  it('내장 테마·ThemePair도 깊은 동결이다', () => {
    expect(Object.isFrozen(lightTheme)).toBe(true);
    expect(Object.isFrozen(darkTheme.colors)).toBe(true);
    expect(Object.isFrozen(defaultThemes)).toBe(true);
    expect(Object.isFrozen(defaultThemes.dark.metrics.icon)).toBe(true);
  });

  it('동결 토큰에 대입하면 strict mode에서 TypeError가 난다', () => {
    expect(() => {
      (lightTheme.colors as { primary: string }).primary = '#000000';
    }).toThrow(TypeError);
  });

  it('scheme 필드 — 문자열 base·내장 테마 모두 올바르다', () => {
    expect(lightTheme.scheme).toBe('light');
    expect(darkTheme.scheme).toBe('dark');
    expect(createTheme('dark', { colors: { primary: '#123456' } }).scheme).toBe('dark');
    expect(defaultThemes.light.scheme).toBe('light');
  });
});

describe('§3.3 Theme을 base로 한 파생 테마', () => {
  it('Theme base 위에 오버라이드를 얹는다 — 기존 오버라이드는 보존', () => {
    const brandTheme = createTheme('light', { colors: { primary: '#123456' } });
    const derived = createTheme(brandTheme, { colors: { danger: '#654321' } });
    expect(derived.colors.primary).toBe('#123456'); // base의 오버라이드 유지
    expect(derived.colors.danger).toBe('#654321');
    expect(derived.scheme).toBe('light'); // base의 scheme 계승
    // 원본은 불변 — 새 객체가 반환된다
    expect(derived).not.toBe(brandTheme);
    expect(brandTheme.colors.danger).toBe(lightTheme.colors.danger);
  });

  it('오버라이드 없는 파생도 완전한 새 Theme이다', () => {
    const derived = createTheme(darkTheme);
    expect(derived).toEqual(darkTheme);
    expect(derived).not.toBe(darkTheme);
    expect(derived.scheme).toBe('dark');
    expect(Object.isFrozen(derived)).toBe(true);
  });
});

describe('§3.3 EOP 대응 — undefined 값 스킵', () => {
  it('그룹 값 undefined({ colors: undefined })는 무해하다', () => {
    const theme = createTheme('light', { colors: undefined, spacing: { md: 14 } });
    expect(theme.colors).toEqual(lightTheme.colors);
    expect(theme.spacing.md).toBe(14);
  });

  it('키 값 undefined는 건너뛴다 — undefined가 기본값을 지우지 않는다', () => {
    // EOP 타입은 키 값 undefined를 거부하지만(2단 규약), 런타임 견고성은 별도로 보장한다.
    const overrides = { colors: { primary: undefined } } as unknown as ThemeOverrides;
    const theme = createTheme('light', overrides);
    expect(theme.colors.primary).toBe(lightTheme.colors.primary);
  });

  it('createThemes에도 undefined 입력이 무해하다', () => {
    const pair = createThemes({ shared: undefined, light: undefined, dark: undefined });
    expect(pair.light).toEqual(lightTheme);
    expect(pair.dark).toEqual(darkTheme);
    expect(createThemes().light).toEqual(lightTheme); // 무인자와 동일
  });
});

describe('§3.6 내장 팔레트 스팟체크', () => {
  it('lightTheme — 전신 tokens.json 계승 + shadow 신설', () => {
    expect(lightTheme.colors.primary).toBe('#4A90E2');
    expect(lightTheme.colors.shadow).toBe('#0F172A');
    expect(lightTheme.colors.background).toBe('#FFFFFF');
    expect(lightTheme.colors.text).toBe('#1D2733');
    expect(lightTheme.colors.danger).toBe('#B4232C');
    expect(lightTheme.colors.warning).toBe('#92400E');
    expect(lightTheme.colors.onWarning).toBe('#FFFFFF');
    expect(lightTheme.colors.warningSoft).toBe('#FFF8D6');
    expect(lightTheme.colors.successStrong).toBe('#0E765D');
    expect(lightTheme.colors.successSoft).toBe('#E8F7F2');
    expect(lightTheme.colors.onSuccess).toBe('#FFFFFF');
    expect(lightTheme.colors.infoStrong).toBe('#1E63B0');
    expect(lightTheme.colors.infoSoft).toBe('#EAF4FF');
    expect(lightTheme.colors.onInfo).toBe('#FFFFFF');
    expect(lightTheme.colors.overlay).toBe('rgba(15, 23, 42, 0.40)');
  });

  it('darkTheme — §3.6 다크 팔레트', () => {
    expect(darkTheme.colors.background).toBe('#111418');
    expect(darkTheme.colors.surface).toBe('#1A1F26');
    expect(darkTheme.colors.primary).toBe('#5C9EEA');
    expect(darkTheme.colors.shadow).toBe('#000000');
    expect(darkTheme.colors.danger).toBe('#FF8FAF');
    expect(darkTheme.colors.warning).toBe('#F6C453');
    expect(darkTheme.colors.onWarning).toBe('#FFFFFF');
    expect(darkTheme.colors.warningSoft).toBe('#3B331B');
    expect(darkTheme.colors.successStrong).toBe('#0E765D');
    expect(darkTheme.colors.successSoft).toBe('#15382F');
    expect(darkTheme.colors.onSuccess).toBe('#FFFFFF');
    expect(darkTheme.colors.infoStrong).toBe('#1E63B0');
    expect(darkTheme.colors.infoSoft).toBe('#172B43');
    expect(darkTheme.colors.onInfo).toBe('#FFFFFF');
    expect(darkTheme.colors.overlay).toBe('rgba(0, 0, 0, 0.55)');
  });

  it('색상 롤은 31개이고 양 스킴의 키 집합이 같다', () => {
    const lightKeys = Object.keys(lightTheme.colors);
    expect(lightKeys).toHaveLength(31);
    expect(Object.keys(darkTheme.colors).sort()).toEqual([...lightKeys].sort());
    expectAccessibleStatusColors(lightTheme.colors);
    expectAccessibleStatusColors(darkTheme.colors);
  });

  it('색 이외 토큰은 스킴 공유 — spacing/radius/typography/metrics/breakpoints', () => {
    expect(lightTheme.spacing).toEqual(darkTheme.spacing);
    expect(lightTheme.spacing.lg).toBe(16);
    expect(lightTheme.radius.pill).toBe(9999);
    expect(lightTheme.typography.button).toEqual({
      fontSize: 14,
      lineHeight: 20,
      fontWeight: '700',
    });
    expect(lightTheme.elevation.md).toEqual({
      elevation: 3,
      shadowOpacity: 0.12,
      shadowRadius: 16,
      shadowOffsetY: 4,
    });
    expect(lightTheme.metrics.control).toEqual({ sm: 36, md: 44, lg: 52 });
    expect(lightTheme.metrics.input).toBe(48);
    expect(lightTheme.metrics.maxFontScale).toBe(1.25);
    expect(lightTheme.breakpoints).toEqual({ tablet: 768, desktop: 900 });
  });
});
