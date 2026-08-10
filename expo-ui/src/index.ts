/**
 * "." 엔트리 — 설계 문서 §2. 앱 코드의 단일 import 지점.
 *
 * 공개 표면은 설계 문서 §3~§5의 시그니처가 전부다. brand.ts와 (내부) 헬퍼
 * (internal.ts, useIcons, roleTextStyle, buttonPalette, renderIconSlot,
 * resetActiveThemeForTest)는 재export하지 않는다.
 */

// ─── 테마 ("./theme" 전체 재export — 단, 앱 테마 모듈은 './theme' 직접 import 권장 §3.7) ───
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
export { createTheme, createThemes, lightTheme, darkTheme, defaultThemes } from './theme/createTheme';

// ─── Provider / 훅 ─────────────────────────────────────────────────────────
export {
  UiProvider,
  useTheme,
  useStrings,
  useResolvedColorScheme,
  getActiveTheme,
  subscribeActiveTheme,
} from './components/provider';
export type { UiProviderProps } from './components/provider';

// ─── strings / icons ───────────────────────────────────────────────────────
export { enStrings, koStrings } from './strings/strings';
export type { UiStrings } from './strings/strings';
export type { IconRenderProps, RenderIcon, UiIcons } from './components/icons';

// ─── 컴포넌트 ──────────────────────────────────────────────────────────────
export { Text } from './components/text';
export type { TextProps } from './components/text';

export { Button, IconButton, PRESSABLE_FEEDBACK_CLASS } from './components/button';
export type { ButtonProps, ButtonSize, ButtonVariant, IconButtonProps } from './components/button';

export { TextField, SearchField } from './components/fields';
export type { TextFieldProps, SearchFieldProps } from './components/fields';

export { Tabs } from './components/tabs';
export type { TabItem, TabsProps } from './components/tabs';

export { SelectionIndicator, SelectableRow, SelectAllRow } from './components/selection';
export type {
  SelectionIndicatorProps,
  SelectableRowProps,
  SelectAllRowProps,
  SelectionSize,
} from './components/selection';

export { Surface, ContentFrame, Section, StickyActionBar } from './components/layout';
export type {
  SurfaceProps,
  ContentFrameProps,
  SectionProps,
  StickyActionBarProps,
} from './components/layout';

export { Skeleton, EmptyState, ErrorState, Toast, useToastController } from './components/feedback';
export type {
  SkeletonProps,
  EmptyStateProps,
  ErrorStateProps,
  ToastProps,
  ToastPayload,
  ToastVariant,
} from './components/feedback';

export { DialogPanel, Dialog, ConfirmActionRow } from './components/dialog';
export type { DialogPanelProps, DialogProps, ConfirmActionRowProps } from './components/dialog';

export { Badge, Alert } from './components/status';
export type {
  BadgeProps,
  BadgeSize,
  AlertProps,
  AlertLive,
  StatusVariant,
} from './components/status';

export { Avatar, Divider, ListItem } from './components/display';
export type {
  AvatarProps,
  AvatarSize,
  AvatarImageProps,
  DividerProps,
  DividerOrientation,
  ListItemProps,
  ListItemSize,
} from './components/display';

export { Spinner, ProgressBar } from './components/progress';
export type {
  SpinnerProps,
  ProgressBarProps,
  ProgressBarVariant,
  ProgressSize,
} from './components/progress';

export { Checkbox, Switch } from './components/controls';
export type { CheckboxProps, SwitchProps, ControlSize } from './components/controls';

export { RadioGroup } from './components/radio';
export type { RadioGroupProps, RadioItem } from './components/radio';

export { Accordion } from './components/accordion';
export type {
  AccordionProps,
  AccordionItem,
  AccordionIndicatorRenderProps,
} from './components/accordion';
