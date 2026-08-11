/**
 * The "./theme" entry — zero react and react-native imports (design doc §2).
 *
 * App theme modules must import from here. When tailwind.config (evaluated by
 * Node) requires an app theme module that went through ".", the react-native
 * import makes loading fail.
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
