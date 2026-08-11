/**
 * The built-in palette data — design doc §3.6.
 *
 * Light inherits the predecessor's tokens.json values, extended with the status
 * palettes and shadow. Dark uses the values proposed in the design doc. Non-color
 * tokens (spacing/radius/typography/elevation/metrics/breakpoints) are shared
 * across schemes by default — the same model as the predecessor.
 */
import type {
  ThemeColors,
  ThemeSpacing,
  ThemeRadius,
  ThemeTypography,
  ThemeElevation,
  ThemeMetrics,
  ThemeBreakpoints,
} from './tokens';

export const lightColors: ThemeColors = {
  background: '#FFFFFF',
  surface: '#FFFFFF',
  surfaceSubtle: '#F1F5F9',
  text: '#1D2733',
  textMuted: '#5D6675',
  textSubtle: '#667085',
  tabActive: '#2C3E50',
  tabInactive: '#667085',
  line: '#E7E7E7',
  primary: '#1769C2',
  primaryStrong: '#0E5CAD',
  primarySoft: '#EAF4FF',
  onPrimary: '#FFFFFF',
  danger: '#B4232C',
  dangerStrong: '#B4232C',
  dangerSoft: '#FFF0F3',
  onDanger: '#FFFFFF',
  warning: '#92400E',
  warningStrong: '#92400E',
  warningSoft: '#FFF8D6',
  onWarning: '#FFFFFF',
  success: '#0E765D',
  successStrong: '#0E765D',
  successSoft: '#E8F7F2',
  onSuccess: '#FFFFFF',
  info: '#1E63B0',
  infoStrong: '#1E63B0',
  infoSoft: '#EAF4FF',
  onInfo: '#FFFFFF',
  overlay: 'rgba(15, 23, 42, 0.40)',
  shadow: '#0F172A',
};

export const darkColors: ThemeColors = {
  background: '#111418',
  surface: '#1A1F26',
  surfaceSubtle: '#232A33',
  text: '#E8ECF1',
  textMuted: '#9AA4B0',
  textSubtle: '#8893A0',
  tabActive: '#E8ECF1',
  tabInactive: '#9AA4B0',
  line: '#2A323C',
  primary: '#5C9EEA',
  primaryStrong: '#6BAAF0',
  primarySoft: '#16283D',
  onPrimary: '#111418',
  danger: '#FF8FAF',
  dangerStrong: '#B4232C',
  dangerSoft: '#3A1E27',
  onDanger: '#FFFFFF',
  warning: '#F6C453',
  warningStrong: '#92400E',
  warningSoft: '#3B331B',
  onWarning: '#FFFFFF',
  success: '#54C7A3',
  successStrong: '#0E765D',
  successSoft: '#15382F',
  onSuccess: '#FFFFFF',
  info: '#72A8E7',
  infoStrong: '#1E63B0',
  infoSoft: '#172B43',
  onInfo: '#FFFFFF',
  overlay: 'rgba(0, 0, 0, 0.55)',
  shadow: '#000000',
};

/** A 4px grid — inherited from the predecessor. */
export const baseSpacing: ThemeSpacing = {
  none: 0,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
};

export const baseRadius: ThemeRadius = {
  none: 0,
  sm: 8,
  md: 10,
  lg: 16,
  pill: 9999,
};

/**
 * The six fontSize values (caption through heading) are inherited from the
 * predecessor's tokens.json; tab promotes the measured underline-tab pair
 * (16/'600') into a role. lineHeight and weight normalize the hardcoded values
 * measured at representative call sites into roles — call sites that did not map
 * exactly onto a role (the EmptyState title at 16/22, for instance) were absorbed
 * into the nearest one, and design doc §10.3 records the resulting visual deltas.
 */
export const baseTypography: ThemeTypography = {
  caption: { fontSize: 12, lineHeight: 16, fontWeight: '400' },
  label: { fontSize: 13, lineHeight: 18, fontWeight: '700' },
  button: { fontSize: 14, lineHeight: 20, fontWeight: '700' },
  body: { fontSize: 15, lineHeight: 22, fontWeight: '400' },
  title: { fontSize: 18, lineHeight: 24, fontWeight: '800' },
  heading: { fontSize: 22, lineHeight: 30, fontWeight: '800' },
  tab: { fontSize: 16, lineHeight: 22, fontWeight: '600' },
};

/**
 * Android elevation is inherited from the predecessor's tokens.json. The three
 * iOS shadow properties promote the hardcoded values measured in the predecessor
 * components (Surface 0.07/8/2, StickyActionBar and Toast 0.12/16/4) into levels.
 */
export const baseElevation: ThemeElevation = {
  none: { elevation: 0, shadowOpacity: 0, shadowRadius: 0, shadowOffsetY: 0 },
  sm: { elevation: 1, shadowOpacity: 0.07, shadowRadius: 4, shadowOffsetY: 1 },
  md: { elevation: 3, shadowOpacity: 0.12, shadowRadius: 16, shadowOffsetY: 4 },
  lg: { elevation: 8, shadowOpacity: 0.16, shadowRadius: 24, shadowOffsetY: 8 },
};

/** Promotes the predecessor's buttonSizes minHeight (36/44/52), input 48, iconSize 18, and the 1.25 font cap. */
export const baseMetrics: ThemeMetrics = {
  control: { sm: 36, md: 44, lg: 52 },
  input: 48,
  icon: { sm: 16, md: 18, lg: 20 },
  maxFontScale: 1.25,
};

export const baseBreakpoints: ThemeBreakpoints = {
  tablet: 768,
  desktop: 900,
};
