/**
 * The platform-shared public surface of the root entry — the single import point
 * for app code.
 *
 * The public surface is exactly the signatures in design doc §3–§5. brand.ts and
 * the (internal) helpers (internal.ts, useIcons, roleTextStyle, buttonPalette,
 * renderIconSlot, resetActiveThemeForTest) are not re-exported.
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
} from "./theme/tokens";
export {
  createTheme,
  createThemes,
  lightTheme,
  darkTheme,
  defaultThemes,
  resolveTheme,
} from "./theme/createTheme";

// ─── Provider / 훅 ─────────────────────────────────────────────────────────
export {
  UiProvider,
  useTheme,
  useStrings,
  useResolvedColorScheme,
  getActiveTheme,
  subscribeActiveTheme,
} from "./components/provider";
export type { UiProviderProps } from "./components/provider";

export { OverlayProvider } from "./components/overlay/provider";
export type { OverlayProviderProps } from "./components/overlay/provider";

// ─── 순수 달력 날짜 수학 (clock-free·time-zone-free) ───────────────────────
export {
  isCalendarLeapYear,
  daysInCalendarMonth,
  isValidCalendarDate,
  compareCalendarDates,
  isSameCalendarDate,
  isSameCalendarMonth,
  clampCalendarDate,
  addCalendarDays,
  addCalendarMonths,
  calendarDayOfWeek,
  formatCalendarDateKey,
  parseCalendarDateKey,
  buildMonthGrid,
} from "./dates/calendar";
export type {
  CalendarDate,
  CalendarMonth,
  CalendarWeekday,
  CalendarWeekStart,
  MonthGrid,
  MonthGridCell,
  MonthGridWeek,
} from "./dates/calendar";

// ─── strings / icons ───────────────────────────────────────────────────────
export { enStrings, koStrings } from "./strings/strings";
export type { UiStrings } from "./strings/strings";
export type { IconRenderProps, RenderIcon, UiIcons } from "./components/icons";

// ─── 컴포넌트 ──────────────────────────────────────────────────────────────
export { Text } from "./components/text";
export type { TextProps } from "./components/text";

export {
  Button,
  IconButton,
  PRESSABLE_FEEDBACK_CLASS,
} from "./components/button";
export type {
  ButtonProps,
  ButtonSize,
  ButtonVariant,
  IconButtonProps,
} from "./components/button";

export { TextField, SearchField } from "./components/fields";
export type { TextFieldProps, SearchFieldProps } from "./components/fields";

export { FormField } from "./components/form-field";
export type {
  FormFieldProps,
  FormFieldControlProps,
} from "./components/form-field";

export { Tabs } from "./components/tabs";
export type { TabItem, TabsProps } from "./components/tabs";

export {
  SelectionIndicator,
  SelectableRow,
  SelectAllRow,
} from "./components/selection";
export type {
  SelectionIndicatorProps,
  SelectableRowProps,
  SelectAllRowProps,
  SelectionSize,
} from "./components/selection";

export {
  Surface,
  ContentFrame,
  Section,
  StickyActionBar,
} from "./components/layout";
export type {
  SurfaceProps,
  ContentFrameProps,
  SectionProps,
  StickyActionBarProps,
} from "./components/layout";

export {
  Skeleton,
  EmptyState,
  ErrorState,
  Toast,
  useToastController,
} from "./components/feedback";
export type {
  SkeletonProps,
  EmptyStateProps,
  EmptyStateVariant,
  ErrorStateProps,
  ToastProps,
  ToastPayload,
  ToastVariant,
} from "./components/feedback";

export { ToastViewport, useToastQueue } from "./components/toast-queue";
export type {
  ToastId,
  ToastAnnouncement,
  ToastDismissReason,
  ToastAction,
  ToastRequest,
  ToastUpdate,
  ToastRecord,
  UseToastQueueOptions,
  ToastQueueController,
  ToastViewportPlacement,
  ToastViewportDismissReason,
  ToastViewportProps,
} from "./components/toast-queue";

export { DialogPanel, Dialog, ConfirmActionRow } from "./components/dialog";
export type {
  DialogPanelProps,
  DialogProps,
  ConfirmActionRowProps,
  DialogDismissReason,
  DialogDismissDetails,
  DialogFocusable,
  DialogFocusRef,
  DialogPresentation,
  DialogPanelElement,
} from "./components/dialog";

export { ConfirmDialog } from "./components/confirm-dialog";
export type {
  ConfirmDialogProps,
  ConfirmDialogDismissDetails,
} from "./components/confirm-dialog";

export { ActionSheet } from "./components/action-sheet";
export type {
  ActionSheetProps,
  ActionSheetItem,
  ActionSheetDismissDetails,
  ActionSheetPresentation,
} from "./components/action-sheet";

export { Sheet } from "./components/sheet";
export type {
  SheetProps,
  SheetPresentation,
  SheetOpenChangeDetails,
  SheetSafeAreaInsets,
} from "./components/sheet";

export { DataTable } from "./components/data-table";
export type {
  DataTableProps,
  DataTableComponentProps,
  DataTableColumn,
  DataTableColumnId,
  DataTableSortableColumnId,
  DataTableRowKey,
  DataTableAlignment,
  DataTableSize,
  DataTableVariant,
  DataTablePresentation,
  DataTableSortDirection,
  DataTableValueContext,
  DataTableCellContext,
  DataTableSort,
  DataTableSortChangeDetails,
  DataTableSelectionRowContext,
  DataTableSelectionChangeDetails,
  DataTableSelection,
  DataTableListCell,
  DataTableListRowContext,
  DataTableRowPressContext,
  DataTableActiveRow,
  DataTableRowStyleContext,
  DataTableState,
} from "./components/data-table.types";

export { Pagination } from "./components/pagination";
export type {
  PaginationProps,
  PaginationBaseProps,
  PaginationNumberedItemsProps,
  PaginationNumberedPagesProps,
  PaginationCursorProps,
  PaginationMode,
  PaginationDirection,
  PaginationSize,
  PaginationPresentation,
  PaginationCountMode,
  PaginationBoundaryCount,
  PaginationSiblingCount,
  PaginationNavigateDirection,
  PaginationPageChangeReason,
  PaginationPageLabelDetails,
  PaginationItemsPageChangeDetails,
  PaginationPagesPageChangeDetails,
  PaginationNavigateDetails,
} from "./components/pagination.types";
export { getPaginationRange } from "./components/pagination-range";
export type {
  PaginationRangeOptions,
  PaginationRangeItem,
} from "./components/pagination-range";

export { Popover } from "./components/popover";
export type {
  PopoverProps,
  PopoverPlacement,
  PopoverDirection,
  PopoverPresentation,
  PopoverTriggerSize,
  PopoverTriggerVariant,
  PopoverOpenChangeReason,
  PopoverOpenChangeDetails,
} from "./components/popover.types";

export { Tooltip } from "./components/tooltip";
export type {
  TooltipProps,
  TooltipPlacement,
  TooltipDirection,
  TooltipTriggerSize,
} from "./components/tooltip.types";

export { Badge, Alert } from "./components/status";
export type {
  BadgeProps,
  BadgeSize,
  AlertProps,
  AlertLive,
  StatusVariant,
} from "./components/status";

export { Avatar, Divider, ListItem } from "./components/display";
export type {
  AvatarProps,
  AvatarSize,
  AvatarImageProps,
  DividerProps,
  DividerOrientation,
  ListItemProps,
  ListItemSize,
} from "./components/display";

export { Spinner, ProgressBar } from "./components/progress";
export type {
  SpinnerProps,
  ProgressBarProps,
  ProgressBarVariant,
  ProgressSize,
} from "./components/progress";

export { Slider } from "./components/slider";
export type {
  SliderSharedProps,
  SingleSliderProps,
  RangeSliderProps,
  SliderProps,
  SliderDirection,
} from "./components/slider";

export { Rating } from "./components/rating";
export type {
  RatingSize,
  InteractiveRatingProps,
  ReadonlyRatingProps,
  RatingProps,
} from "./components/rating";

export { Checkbox, Switch } from "./components/controls";
export type {
  CheckboxProps,
  SwitchProps,
  ControlSize,
} from "./components/controls";

export { RadioGroup } from "./components/radio";
export type { RadioGroupProps, RadioItem } from "./components/radio";

export { SegmentedControl } from "./components/segmented-control";
export type {
  SegmentedControlProps,
  SegmentedControlItem,
  SegmentedControlSize,
  SegmentedControlFit,
  SegmentedControlVariant,
} from "./components/segmented-control";

export { Accordion } from "./components/accordion";
export type {
  AccordionProps,
  AccordionItem,
  AccordionIndicatorRenderProps,
} from "./components/accordion";

export { ToggleGroup } from "./components/toggle-group";
export type {
  ToggleGroupProps,
  ToggleGroupItem,
  ToggleGroupSelectionMode,
  ToggleGroupOrientation,
  ToggleGroupVariant,
  ToggleGroupSize,
} from "./components/toggle-group";

export type { TriggerRenderProps } from "./components/trigger-render";

export { Menu } from "./components/menu";
export type {
  MenuProps,
  MenuItem,
  MenuActionItem,
  MenuCheckboxItem,
  MenuSelectDetails,
  MenuOpenChangeDetails,
  MenuOpenChangeReason,
  MenuPlacement,
  MenuPresentation,
  MenuDirection,
  MenuTriggerSize,
  MenuTriggerVariant,
} from "./components/menu.types";

export { Select } from "./components/select";
export type {
  SelectProps,
  SelectItem,
  SelectOpenChangeDetails,
  SelectOpenChangeReason,
  SelectPlacement,
  SelectPresentation,
  SelectDirection,
  SelectSize,
} from "./components/select.types";

export { Combobox } from "./components/combobox";
export { filterComboboxItems, normalizeComboboxText } from "./components/combobox-filter";
export type {
  ComboboxProps,
  ComboboxItem,
  ComboboxState,
  ComboboxFilter,
  ComboboxFilterDetails,
  ComboboxSelectionMode,
  ComboboxPlacement,
  ComboboxDirection,
  ComboboxPresentation,
  ComboboxSize,
  ComboboxValueChangeReason,
  ComboboxInputValueChangeReason,
  ComboboxOpenChangeReason,
  SingleComboboxValueChangeDetails,
  MultipleComboboxValueChangeDetails,
  ComboboxValueChangeDetails,
  ComboboxInputValueChangeDetails,
  ComboboxOpenChangeDetails,
} from "./components/combobox.types";

export { Chip } from "./components/chip";
export type {
  ChipProps,
  ActionChipProps,
  FilterChipProps,
  StaticChipProps,
  RemovableChipProps,
  ChipKind,
  ChipVariant,
  ChipSize,
} from "./components/chip";

export { Card } from "./components/card";
export type {
  CardProps,
  CardVariant,
  StaticCardProps,
  PressableCardProps,
} from "./components/card";

export { Link } from "./components/link";
export type {
  LinkProps,
  DestinationLinkProps,
  ActionLinkProps,
  LinkVariant,
  LinkTarget,
} from "./components/link";

export { Collapsible } from "./components/collapsible";
export type {
  CollapsibleProps,
  CollapsibleVariant,
} from "./components/collapsible";

export { FloatingActionButton } from "./components/fab";
export type {
  FABProps,
  FABSize,
  FABVariant,
  FABPlacement,
} from "./components/fab";

export { AspectRatio } from "./components/aspect-ratio";
export type { AspectRatioProps } from "./components/aspect-ratio";

export { KeyValueList } from "./components/key-value-list";
export type {
  KeyValueListProps,
  KeyValueItem,
  KeyValueListLayout,
  KeyValueListSize,
} from "./components/key-value-list";

export { StatGrid } from "./components/stat-grid";
export type {
  StatGridProps,
  StatItem,
  StatTone,
  StatGridSize,
} from "./components/stat-grid";

export { Toolbar } from "./components/toolbar";
export type { ToolbarProps, ToolbarAlign } from "./components/toolbar";

export { MonthCalendar } from "./components/month-calendar";
export type {
  MonthCalendarProps,
  MonthCalendarDayContext,
  MonthCalendarLabels,
} from "./components/month-calendar";

export { DateField } from "./components/date-field";
export type {
  DateFieldProps,
  DateFieldSegment,
  DateFieldSegmentText,
} from "./components/date-field";
