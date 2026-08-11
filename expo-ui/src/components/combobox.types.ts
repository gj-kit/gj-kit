import type { ReactNode } from "react";
import type { StyleProp, TextStyle, ViewStyle } from "react-native";
import type { RenderIcon } from "./icons";
import type { CommonProps } from "./internal";
import type { OverlayPlacement } from "./overlay/types";

export type ComboboxSelectionMode = "single" | "multiple";
export type ComboboxPlacement = OverlayPlacement;
export type ComboboxDirection = "ltr" | "rtl";
export type ComboboxPresentation = "auto" | "bottom" | "center" | "inline";
export type ComboboxSize = "sm" | "md";

export interface ComboboxItem<T extends string> {
  readonly value: T;
  readonly label: string;
  readonly textValue?: string | undefined;
  readonly keywords?: readonly string[] | undefined;
  readonly description?: string | undefined;
  readonly leading?: ReactNode | RenderIcon | undefined;
  readonly trailing?: ReactNode | RenderIcon | undefined;
  readonly disabled?: boolean | undefined;
  readonly testID?: string | undefined;
}

export type ComboboxState<T extends string> =
  | {
      readonly status: "ready";
      readonly items: readonly ComboboxItem<T>[];
      readonly statusLabel?: string | undefined;
      readonly onRetry?: never;
    }
  | {
      readonly status: "loading";
      /** Retained results remain available while a newer query is loading. */
      readonly items: readonly ComboboxItem<T>[];
      readonly statusLabel?: string | undefined;
      readonly onRetry?: never;
    }
  | {
      readonly status: "error";
      /** Localized, visible error copy. */
      readonly statusLabel: string;
      readonly items: readonly ComboboxItem<T>[];
      readonly onRetry?: (() => void) | undefined;
    };

export interface ComboboxFilterDetails {
  readonly normalizedQuery: string;
  readonly tokens: readonly string[];
  readonly locale?: string | readonly string[] | undefined;
}

export type ComboboxFilter<T extends string> = (
  item: ComboboxItem<T>,
  query: string,
  details: ComboboxFilterDetails
) => boolean;

export type ComboboxValueChangeReason =
  | "option-select"
  | "option-remove"
  | "clear-action";

export type ComboboxInputValueChangeReason =
  | "input-change"
  | "option-select"
  | "clear-action"
  | "dismiss-restore";

export type ComboboxOpenChangeReason =
  | "input-focus"
  | "input-change"
  | "trigger-press"
  | "trigger-key"
  | "option-select"
  | "outside-press"
  | "escape-key"
  | "tab-key"
  | "focus-out"
  | "hardware-back"
  | "accessibility-escape"
  | "cancel-action"
  | "anchor-detached";

export type SingleComboboxValueChangeDetails<T extends string> =
  | {
      readonly selectionMode: "single";
      readonly reason: "option-select";
      readonly previousValue: T | null;
      readonly item: ComboboxItem<T>;
      readonly originalEvent?: unknown;
    }
  | {
      readonly selectionMode: "single";
      readonly reason: "clear-action";
      readonly previousValue: T | null;
      readonly item?: never;
      readonly originalEvent?: unknown;
    };

export type MultipleComboboxValueChangeDetails<T extends string> =
  | {
      readonly selectionMode: "multiple";
      readonly reason: "option-select" | "option-remove";
      readonly previousValue: readonly T[];
      readonly item: ComboboxItem<T>;
      readonly originalEvent?: unknown;
    }
  | {
      readonly selectionMode: "multiple";
      readonly reason: "clear-action";
      readonly previousValue: readonly T[];
      readonly item?: never;
      readonly originalEvent?: unknown;
    };

export type ComboboxValueChangeDetails<T extends string> =
  | SingleComboboxValueChangeDetails<T>
  | MultipleComboboxValueChangeDetails<T>;

export interface ComboboxInputValueChangeDetails<T extends string> {
  readonly reason: ComboboxInputValueChangeReason;
  readonly previousInputValue: string;
  readonly isComposing: boolean;
  readonly item?: ComboboxItem<T> | undefined;
  readonly originalEvent?: unknown;
}

export interface ComboboxOpenChangeDetails<T extends string> {
  readonly reason: ComboboxOpenChangeReason;
  readonly item?: ComboboxItem<T> | undefined;
  readonly originalEvent?: unknown;
}

type ComboboxAccessibleName =
  | {
      readonly label: string;
      readonly accessibilityLabel?: string | undefined;
    }
  | {
      readonly label?: never;
      readonly accessibilityLabel: string;
    };

interface ComboboxCommonProps<T extends string>
  extends Omit<CommonProps, "unstyled"> {
  readonly state: ComboboxState<T>;
  readonly inputValue: string;
  readonly onInputValueChange: (
    inputValue: string,
    details: ComboboxInputValueChangeDetails<NoInfer<T>>
  ) => void;
  readonly open: boolean;
  readonly onOpenChange: (
    open: boolean,
    details: ComboboxOpenChangeDetails<NoInfer<T>>
  ) => void;
  /** undefined = built-in local filter, function = custom local filter, null = manual results. */
  readonly filter?: ComboboxFilter<T> | null | undefined;
  readonly filterLocale?: string | readonly string[] | undefined;
  readonly placeholder: string;
  readonly description?: string | undefined;
  readonly error?: string | undefined;
  readonly required?: boolean | undefined;
  readonly disabled?: boolean | undefined;
  readonly clearable?: boolean | undefined;
  readonly openOnFocus?: boolean | undefined;
  readonly emptyLabel?: string | undefined;
  readonly noResultsLabel?: string | undefined;
  readonly loadingLabel?: string | undefined;
  readonly clearLabel?: string | undefined;
  readonly retryLabel?: string | undefined;
  readonly placement?: ComboboxPlacement | undefined;
  readonly direction?: ComboboxDirection | undefined;
  readonly sideOffset?: number | undefined;
  readonly alignOffset?: number | undefined;
  readonly collisionPadding?: number | undefined;
  readonly presentation?: ComboboxPresentation | undefined;
  readonly bottomInset?: number | undefined;
  readonly keyboardOverlap?: number | undefined;
  readonly size?: ComboboxSize | undefined;
  readonly labelStyle?: StyleProp<TextStyle> | undefined;
  readonly labelClassName?: string | undefined;
  readonly controlStyle?: StyleProp<ViewStyle> | undefined;
  readonly controlClassName?: string | undefined;
  readonly inputStyle?: StyleProp<TextStyle> | undefined;
  readonly inputClassName?: string | undefined;
  readonly summaryStyle?: StyleProp<TextStyle> | undefined;
  readonly summaryClassName?: string | undefined;
  readonly helperStyle?: StyleProp<TextStyle> | undefined;
  readonly helperClassName?: string | undefined;
  readonly contentStyle?: StyleProp<ViewStyle> | undefined;
  readonly contentClassName?: string | undefined;
  readonly listStyle?: StyleProp<ViewStyle> | undefined;
  readonly listClassName?: string | undefined;
  readonly itemStyle?: StyleProp<ViewStyle> | undefined;
  readonly itemClassName?: string | undefined;
  readonly itemLabelStyle?: StyleProp<TextStyle> | undefined;
  readonly itemLabelClassName?: string | undefined;
  readonly statusStyle?: StyleProp<TextStyle> | undefined;
  readonly statusClassName?: string | undefined;
  readonly clearButtonStyle?: StyleProp<ViewStyle> | undefined;
  readonly clearButtonClassName?: string | undefined;
  readonly unstyled?: never;
}

type SingleComboboxSelection<T extends string> = {
  readonly selectionMode: "single";
  readonly value: NoInfer<T> | null;
  readonly selectedItem?: ComboboxItem<NoInfer<T>> | undefined;
  readonly onValueChange: (
    value: NoInfer<T> | null,
    details: SingleComboboxValueChangeDetails<NoInfer<T>>
  ) => void;
  readonly selectedItems?: never;
  readonly maxSelected?: never;
  readonly selectionLimitLabel?: never;
  readonly getSelectionSummary?: never;
};

type MultipleComboboxLimit =
  | {
      readonly maxSelected?: never;
      readonly selectionLimitLabel?: never;
    }
  | {
      /** Runtime validation requires a positive integer. */
      readonly maxSelected: number;
      readonly selectionLimitLabel: string;
    };

type MultipleComboboxSelection<T extends string> = MultipleComboboxLimit & {
  readonly selectionMode: "multiple";
  readonly value: readonly NoInfer<T>[];
  readonly selectedItems?: readonly ComboboxItem<NoInfer<T>>[] | undefined;
  readonly onValueChange: (
    value: readonly NoInfer<T>[],
    details: MultipleComboboxValueChangeDetails<NoInfer<T>>
  ) => void;
  readonly selectedItem?: never;
  readonly getSelectionSummary?:
    | ((items: readonly ComboboxItem<NoInfer<T>>[]) => string)
    | undefined;
};

export type ComboboxProps<T extends string> = ComboboxAccessibleName &
  ComboboxCommonProps<T> &
  (SingleComboboxSelection<T> | MultipleComboboxSelection<T>);
