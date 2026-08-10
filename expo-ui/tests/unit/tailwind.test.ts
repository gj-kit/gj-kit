/**
 * "./tailwind" unit 테스트 — 설계 문서 §8.
 *
 * Node 안전성 계약: 이 파일은 React-무관 엔트리('../../src/tailwind',
 * '../../src/theme')만 import한다 — 컴포넌트(react/react-native) 미로드.
 * tailwind.config가 Node에서 require하는 경로와 동일한 모듈 그래프다.
 * (createTheme은 "./tailwind"가 아니라 "./theme" 엔트리 소속 — §2 exports 맵.)
 */
import { describe, expect, it } from 'vitest';
import { createTailwindPreset, defaultTailwindPreset } from '../../src/tailwind';
import type { TailwindPreset } from '../../src/tailwind';
import { createTheme, lightTheme } from '../../src/theme';

/** extend는 Record<string, unknown>로 방출된다 — 검증용 구조 캐스팅. */
type PresetExtend = {
  colors: Record<string, Record<string, string>>;
  spacing: Record<string, string>;
  borderRadius: Record<string, string>;
  fontSize: Record<string, [string, { lineHeight: string; fontWeight: string }]>;
  boxShadow: Record<string, string>;
  screens: Record<string, string>;
};

function extendOf(preset: TailwindPreset): PresetExtend {
  return preset.theme.extend as unknown as PresetExtend;
}

// ─── §8 기본 preset ────────────────────────────────────────────────────────

describe('§8 createTailwindPreset — 기본 preset', () => {
  const extend = extendOf(createTailwindPreset());

  it('colors는 prefix 아래 중첩되고 테마 31롤이 전부 방출된다 (bg-ui-primary …)', () => {
    const ui = extend.colors['ui'];
    expect(ui).toBeDefined();
    expect(Object.keys(ui ?? {})).toHaveLength(31);
    expect(Object.keys(ui ?? {}).sort()).toEqual(Object.keys(lightTheme.colors).sort());
    expect(ui?.['primary']).toBe(lightTheme.colors.primary);
    expect(ui?.['surface']).toBe('#FFFFFF');
    expect(ui?.['shadow']).toBe('#0F172A');
    expect(ui?.['successStrong']).toBe(lightTheme.colors.successStrong);
    expect(ui?.['successSoft']).toBe(lightTheme.colors.successSoft);
    expect(ui?.['onSuccess']).toBe(lightTheme.colors.onSuccess);
    expect(ui?.['infoStrong']).toBe(lightTheme.colors.infoStrong);
    expect(ui?.['infoSoft']).toBe(lightTheme.colors.infoSoft);
    expect(ui?.['onInfo']).toBe(lightTheme.colors.onInfo);
    expect(ui?.['warningSoft']).toBe(lightTheme.colors.warningSoft);
  });

  it("spacing['ui-lg']는 '16px' — px 단위 문자열 방출", () => {
    expect(extend.spacing['ui-lg']).toBe('16px');
    expect(extend.spacing['ui-none']).toBe('0px');
    expect(extend.spacing['ui-xxxl']).toBe(`${lightTheme.spacing.xxxl}px`);
  });

  it("borderRadius['ui-pill']는 '9999px'", () => {
    expect(extend.borderRadius['ui-pill']).toBe('9999px');
    expect(extend.borderRadius['ui-sm']).toBe(`${lightTheme.radius.sm}px`);
  });

  it("fontSize['ui-title']는 [size, {lineHeight, fontWeight}] 튜플 — 클래스 하나가 서체 3속성을 나른다", () => {
    expect(extend.fontSize['ui-title']).toEqual(['18px', { lineHeight: '24px', fontWeight: '800' }]);
    // 6개 롤 전부 방출된다.
    expect(Object.keys(extend.fontSize).sort()).toEqual(
      ['ui-body', 'ui-button', 'ui-caption', 'ui-heading', 'ui-label', 'ui-title'].sort(),
    );
  });

  it("boxShadow — 'ui-none'은 'none', 'ui-sm'은 elevation+colors.shadow에서 파생된 rgba", () => {
    expect(extend.boxShadow['ui-none']).toBe('none');
    // sm: offsetY 1 / radius 4 / opacity 0.07, shadow #0F172A → rgb(15, 23, 42)
    expect(extend.boxShadow['ui-sm']).toBe('0 1px 4px rgba(15, 23, 42, 0.07)');
    expect(extend.boxShadow['ui-md']).toBe('0 4px 16px rgba(15, 23, 42, 0.12)');
  });

  it('screens는 breakpoints에서 tablet/desktop을 방출한다', () => {
    expect(extend.screens).toEqual({ tablet: '768px', desktop: '900px' });
  });

  it('defaultTailwindPreset은 createTailwindPreset() 무인자 결과와 동일하다', () => {
    expect(defaultTailwindPreset).toEqual(createTailwindPreset());
  });
});

// ─── §8 커스텀 테마 반영 ───────────────────────────────────────────────────

describe('§8 createTailwindPreset — 커스텀 테마 반영', () => {
  it("createTheme('light', {colors:{primary}}) 오버라이드가 preset colors.ui.primary에 반영된다", () => {
    const custom = createTheme('light', { colors: { primary: '#123456' } });
    const extend = extendOf(createTailwindPreset(custom));
    expect(extend.colors['ui']?.['primary']).toBe('#123456');
    // 오버라이드하지 않은 롤은 내장 라이트 값을 유지한다 — 이중 진실 없음(§8).
    expect(extend.colors['ui']?.['danger']).toBe(lightTheme.colors.danger);
  });

  it('색 이외 토큰 오버라이드도 관통한다 — spacing.lg 교체 시 ui-lg 갱신', () => {
    const custom = createTheme('light', { spacing: { lg: 20 } });
    const extend = extendOf(createTailwindPreset(custom));
    expect(extend.spacing['ui-lg']).toBe('20px');
  });
});

// ─── §8 prefix 옵션 ────────────────────────────────────────────────────────

describe('§8 createTailwindPreset — prefix 옵션', () => {
  const extend = extendOf(createTailwindPreset(lightTheme, { prefix: 'app' }));

  it("prefix 'app' → 'app-lg' 키로 방출되고 'ui-' 키는 없다", () => {
    expect(extend.spacing['app-lg']).toBe('16px');
    expect(extend.spacing['ui-lg']).toBeUndefined();
    expect(Object.keys(extend.spacing).every((key) => key.startsWith('app-'))).toBe(true);
  });

  it('colors 중첩·fontSize·boxShadow·borderRadius에도 prefix가 관통한다', () => {
    expect(extend.colors['app']?.['primary']).toBe(lightTheme.colors.primary);
    expect(extend.colors['ui']).toBeUndefined();
    expect(extend.fontSize['app-title']).toEqual(['18px', { lineHeight: '24px', fontWeight: '800' }]);
    expect(extend.boxShadow['app-none']).toBe('none');
    expect(extend.borderRadius['app-pill']).toBe('9999px');
  });
});
