import type { ReactNode } from 'react';
import type { StyleProp, TextStyle, ViewStyle } from 'react-native';
import type { RenderIcon } from './icons';
import type { CommonProps } from './internal';
import type { OverlayPlacement } from './overlay/types';

export type SelectPlacement = OverlayPlacement;
export type SelectPresentation = 'auto' | 'bottom' | 'center';
export type SelectDirection = 'ltr' | 'rtl';
export type SelectSize = 'sm' | 'md';

export interface SelectItem<T extends string> {
  readonly value: T;
  readonly label: string;
  readonly textValue?: string | undefined;
  readonly description?: string | undefined;
  readonly leading?: ReactNode | RenderIcon | undefined;
  readonly disabled?: boolean | undefined;
  readonly testID?: string | undefined;
}

export type SelectOpenChangeReason =
  | 'trigger-press'
  | 'trigger-key'
  | 'outside-press'
  | 'escape-key'
  | 'hardware-back'
  | 'accessibility-escape'
  | 'cancel-action'
  | 'tab-key'
  | 'focus-out'
  | 'anchor-detached'
  | 'option-select';

export interface SelectOpenChangeDetails<T extends string> {
  readonly reason: SelectOpenChangeReason;
  readonly value?: T | undefined;
  readonly originalEvent?: unknown;
}

type SelectLabelProps =
  | {
      readonly label: string;
      readonly accessibilityLabel?: string | undefined;
    }
  | {
      readonly label?: never;
      readonly accessibilityLabel: string;
    };

export type SelectProps<T extends string> = Omit<CommonProps, 'unstyled'> &
  SelectLabelProps & {
    readonly items: readonly SelectItem<T>[];
    readonly value: NoInfer<T> | null;
    readonly onValueChange: (value: NoInfer<T>) => void;
    readonly open: boolean;
    readonly onOpenChange: (
      open: boolean,
      details: SelectOpenChangeDetails<NoInfer<T>>,
    ) => void;
    /** Shown on the trigger when value is null. */
    readonly placeholder: string;
    readonly description?: string | undefined;
    readonly error?: string | undefined;
    readonly required?: boolean | undefined;
    readonly disabled?: boolean | undefined;
    readonly busy?: boolean | undefined;
    readonly dismissDisabled?: boolean | undefined;
    readonly placement?: SelectPlacement | undefined;
    readonly direction?: SelectDirection | undefined;
    readonly sideOffset?: number | undefined;
    readonly alignOffset?: number | undefined;
    readonly collisionPadding?: number | undefined;
    readonly presentation?: SelectPresentation | undefined;
    /** Safe-area inset composed by the caller for a native bottom presentation. */
    readonly bottomInset?: number | undefined;
    /** Keyboard occlusion height measured inside a native Modal. Takes precedence over bottomInset when greater than 0. */
    readonly keyboardOverlap?: number | undefined;
    readonly size?: SelectSize | undefined;
    readonly leading?: ReactNode | RenderIcon | undefined;
    /** testID on the trigger pressable itself (the actual press target). On the web it replaces the derived `${testID}-trigger`. */
    readonly triggerTestID?: string | undefined;
    /** Applied to the trigger while a pointer hovers it (web and pointer-equipped devices). Layered after triggerStyle. */
    readonly triggerHoverStyle?: StyleProp<ViewStyle> | undefined;
    /** Applied to an enabled option while a pointer hovers it. Layered after itemStyle. */
    readonly itemHoverStyle?: StyleProp<ViewStyle> | undefined;
    readonly labelStyle?: StyleProp<TextStyle> | undefined;
    readonly labelClassName?: string | undefined;
    readonly triggerStyle?: StyleProp<ViewStyle> | undefined;
    readonly triggerClassName?: string | undefined;
    readonly valueStyle?: StyleProp<TextStyle> | undefined;
    readonly valueClassName?: string | undefined;
    readonly helperStyle?: StyleProp<TextStyle> | undefined;
    readonly helperClassName?: string | undefined;
    readonly contentStyle?: StyleProp<ViewStyle> | undefined;
    readonly contentClassName?: string | undefined;
    readonly itemStyle?: StyleProp<ViewStyle> | undefined;
    readonly itemClassName?: string | undefined;
    readonly itemLabelStyle?: StyleProp<TextStyle> | undefined;
    readonly itemLabelClassName?: string | undefined;
    readonly unstyled?: never;
  };
