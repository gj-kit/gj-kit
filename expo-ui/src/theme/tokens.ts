/**
 * The token types — design doc §3.2.
 *
 * This folder (src/theme) imports neither react nor react-native (an entry-guard
 * test enforces it), so that tailwind.config (evaluated by Node) and other
 * non-React code can load it safely.
 */
import type { Brand } from './brand';

export type ColorScheme = 'light' | 'dark';

/**
 * The color roles — 31 of them: the base surface and brand roles plus a strong,
 * soft, and on-color trio per status. They keep status components from borrowing a
 * raw color or a token that means something else (onPrimary and friends).
 */
export interface ThemeColors {
  readonly background: string;
  readonly surface: string;
  readonly surfaceSubtle: string;
  readonly text: string;
  readonly textMuted: string;
  readonly textSubtle: string;
  /** The active label and indicator color of an underline tab. */
  readonly tabActive: string;
  /** The inactive label color of an underline tab. */
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
   * The color of every shadow — the map adopted in §0. The predecessor borrowed
   * colors.text for shadows, a structural defect that produced light shadows in
   * the dark theme.
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
 * The predecessor's typography was only a fontSize number, so weight and
 * lineHeight were hardcoded in components — this expands it into a complete text
 * style per role (§3.2).
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
   * The role reserved for navigation tab labels in underline Tabs. The 16px/'600'
   * pair inherited from the predecessor matches no other role, so it was promoted
   * to a role of its own (an adversarial-review finding). Same principle as the
   * §0 decision to keep tab-only color tokens (tabActive/tabInactive).
   */
  readonly tab: TypeRole;
  /** The app's custom font family. Falls back to the system font when omitted. */
  readonly fontFamily?: string | undefined;
}

/**
 * The predecessor's elevation was only an Android elevation number, so the four
 * iOS shadow properties were scattered across components — this expands it into a
 * platform-complete shadow spec (§3.2).
 */
export interface ElevationLevel {
  /** Android elevation. */
  readonly elevation: number;
  readonly shadowOpacity: number;
  readonly shadowRadius: number;
  /** shadowOffset.height — width is fixed at 0. */
  readonly shadowOffsetY: number;
}

export interface ThemeElevation {
  readonly none: ElevationLevel;
  readonly sm: ElevationLevel;
  readonly md: ElevationLevel;
  readonly lg: ElevationLevel;
}

/**
 * Component dimension tokens — the map adopted in §0 (A). It converges what used to
 * be scattered module literals: the predecessor's buttonSizes (36/44/52), the input
 * minHeight of 48, the icon sizes, and the
 * EMPTY_STATE_MAX_FONT_SIZE_MULTIPLIER constant.
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

/** A resolved single-scheme theme. Branded — it exists only through createTheme (§3.3). Deeply frozen. */
export interface Theme extends ThemeTokens, Brand<'Theme'> {
  readonly scheme: ColorScheme;
}

/** A light/dark pair — the type guarantees both schemes are complete (§3.3). It exists only through createThemes. */
export interface ThemePair extends Brand<'ThemePair'> {
  readonly light: Theme;
  readonly dark: Theme;
}

/**
 * Two-level partial overrides (group then key). A typography role is replaced
 * whole as a TypeRole — three-level DeepPartial was rejected because the cost of
 * memorizing the merge rules outweighed the benefit (§11).
 * Key level is `| undefined` as well, so an EOP consumer can assemble overrides
 * conditionally (undefined values are skipped during the merge).
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
