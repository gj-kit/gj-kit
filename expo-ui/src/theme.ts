/**
 * "./theme" 엔트리 — react·react-native import 0 (설계 문서 §2).
 *
 * 앱 테마 모듈은 반드시 여기서 import한다 — tailwind.config(Node 평가)가 앱 테마
 * 모듈을 require할 때 "." 경유면 react-native import로 로드가 실패한다.
 */
export type {
  ColorScheme,
  ThemeColors,
  ThemeSpacing,
  ThemeRadius,
  FontWeight,
  TypeRole,
  ThemeTypography,
  ElevationLevel,
  ThemeElevation,
  ThemeMetrics,
  ThemeBreakpoints,
  ThemeTokens,
  Theme,
  ThemePair,
  ThemeOverrides,
  ColorKey,
  SpacingKey,
  RadiusKey,
  ElevationKey,
  TextRole,
} from './theme/tokens';
export {
  createTheme,
  createThemes,
  lightTheme,
  darkTheme,
  defaultThemes,
} from './theme/createTheme';
