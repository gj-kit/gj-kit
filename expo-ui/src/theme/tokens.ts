/**
 * 토큰 타입 — 설계 문서 §3.2.
 *
 * 이 폴더(src/theme)는 react·react-native를 import하지 않는다(entry-guard 테스트가
 * 강제). tailwind.config(Node 평가)와 비-React 코드가 안전하게 로드하기 위함이다.
 */
import type { Brand } from './brand';

export type ColorScheme = 'light' | 'dark';

/**
 * 색상 롤 — 기본 표면/브랜드에 상태별 strong·soft·on-color 쌍을 더한 31롤.
 * 상태 컴포넌트가 raw 색이나 다른 의미의 토큰(onPrimary 등)을 빌리지 않게 한다.
 */
export interface ThemeColors {
  readonly background: string;
  readonly surface: string;
  readonly surfaceSubtle: string;
  readonly text: string;
  readonly textMuted: string;
  readonly textSubtle: string;
  /** 언더라인 탭의 활성 라벨·인디케이터 색. */
  readonly tabActive: string;
  /** 언더라인 탭의 비활성 라벨 색. */
  readonly tabInactive: string;
  readonly line: string;
  readonly primary: string;
  readonly primaryStrong: string;
  readonly primarySoft: string;
  readonly onPrimary: string;
  readonly danger: string;
  readonly dangerStrong: string;
  readonly dangerSoft: string;
  readonly onDanger: string;
  readonly warning: string;
  readonly warningStrong: string;
  readonly warningSoft: string;
  readonly onWarning: string;
  readonly success: string;
  readonly successStrong: string;
  readonly successSoft: string;
  readonly onSuccess: string;
  readonly info: string;
  readonly infoStrong: string;
  readonly infoSoft: string;
  readonly onInfo: string;
  readonly overlay: string;
  /**
   * 모든 그림자의 색 — §0 채택 맵. 전신은 그림자색을 colors.text로 유용해
   * 다크 테마에서 밝은 그림자가 지는 구조적 결함이 있었다.
   */
  readonly shadow: string;
}

export interface ThemeSpacing {
  readonly none: 0;
  readonly xs: number;
  readonly sm: number;
  readonly md: number;
  readonly lg: number;
  readonly xl: number;
  readonly xxl: number;
  readonly xxxl: number;
}

export interface ThemeRadius {
  readonly none: 0;
  readonly sm: number;
  readonly md: number;
  readonly lg: number;
  readonly pill: number;
}

/**
 * 전신 typography는 fontSize 숫자뿐이라 weight·lineHeight가 컴포넌트에
 * 하드코딩됐다 — 롤당 완전한 텍스트 스타일로 확장한다(§3.2).
 */
export type FontWeight = '400' | '500' | '600' | '700' | '800';

export interface TypeRole {
  readonly fontSize: number;
  readonly lineHeight: number;
  readonly fontWeight: FontWeight;
}

export interface ThemeTypography {
  readonly caption: TypeRole;
  readonly label: TypeRole;
  readonly button: TypeRole;
  readonly body: TypeRole;
  readonly title: TypeRole;
  readonly heading: TypeRole;
  /**
   * 내비게이션 탭 라벨(underline Tabs) 전용 롤 — 전신의 16px/'600'은 다른 어떤
   * 롤과도 일치하지 않아 롤로 승격했다(적대적 리뷰 확정 발견 반영). 탭 전용
   * 색 토큰(tabActive/tabInactive)을 유지한 §0 결정과 같은 원리.
   */
  readonly tab: TypeRole;
  /** 앱 커스텀 폰트 패밀리. 미지정 시 시스템 폰트. */
  readonly fontFamily?: string | undefined;
}

/**
 * 전신 elevation은 Android elevation 숫자뿐이라 iOS shadow 4속성이 컴포넌트에
 * 흩어져 있었다 — 플랫폼 완전한 그림자 스펙으로 확장한다(§3.2).
 */
export interface ElevationLevel {
  /** Android elevation. */
  readonly elevation: number;
  readonly shadowOpacity: number;
  readonly shadowRadius: number;
  /** shadowOffset.height — width는 0 고정. */
  readonly shadowOffsetY: number;
}

export interface ThemeElevation {
  readonly none: ElevationLevel;
  readonly sm: ElevationLevel;
  readonly md: ElevationLevel;
  readonly lg: ElevationLevel;
}

/**
 * 컴포넌트 치수 토큰 — §0 채택 맵(A). 전신의 buttonSizes(36/44/52), input
 * minHeight 48, 아이콘 크기, EMPTY_STATE_MAX_FONT_SIZE_MULTIPLIER 상수가
 * 모듈 리터럴로 흩어져 있던 것을 토큰으로 수렴한다.
 */
export interface ThemeMetrics {
  readonly control: { readonly sm: number; readonly md: number; readonly lg: number };
  readonly input: number;
  readonly icon: { readonly sm: number; readonly md: number; readonly lg: number };
  readonly maxFontScale: number;
}

export interface ThemeBreakpoints {
  readonly tablet: number;
  readonly desktop: number;
}

export interface ThemeTokens {
  readonly colors: ThemeColors;
  readonly spacing: ThemeSpacing;
  readonly radius: ThemeRadius;
  readonly typography: ThemeTypography;
  readonly elevation: ThemeElevation;
  readonly metrics: ThemeMetrics;
  readonly breakpoints: ThemeBreakpoints;
}

/** 해석 완료된 단일 스킴 테마. 브랜드 — createTheme 경유로만 존재(§3.3). 깊은 동결. */
export interface Theme extends ThemeTokens, Brand<'Theme'> {
  readonly scheme: ColorScheme;
}

/** 라이트/다크 쌍 — 양 스킴 완전성을 타입이 보장한다(§3.3). createThemes 경유로만 존재. */
export interface ThemePair extends Brand<'ThemePair'> {
  readonly light: Theme;
  readonly dark: Theme;
}

/**
 * 2단 부분 오버라이드(그룹→키). typography role은 TypeRole 통째 교체 —
 * 3단 DeepPartial은 병합 규칙 암기 비용이 이득을 넘어 기각됐다(§11).
 * 키 레벨도 `| undefined` — EOP 소비자가 조건부로 오버라이드를 조립할 수 있다
 * (undefined 값은 병합에서 스킵된다).
 */
export type ThemeOverrides = {
  readonly [G in keyof ThemeTokens]?:
    | { readonly [K in keyof ThemeTokens[G]]?: ThemeTokens[G][K] | undefined }
    | undefined;
};

// ─── 자동완성용 키 유니언 — 컴포넌트 props가 받는다 ─────────────────────────
export type ColorKey = keyof ThemeColors;
export type SpacingKey = keyof ThemeSpacing;
export type RadiusKey = keyof ThemeRadius;
export type ElevationKey = keyof ThemeElevation;
export type TextRole = Exclude<keyof ThemeTypography, 'fontFamily'>;
