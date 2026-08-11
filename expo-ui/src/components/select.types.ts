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
    /** value가 null일 때 trigger에 표시한다. */
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
    /** native bottom presentation에서 호출자가 합성한 safe-area inset. */
    readonly bottomInset?: number | undefined;
    /** native Modal 안에서 계산한 키보드 가림 높이. 0보다 크면 bottomInset보다 우선한다. */
    readonly keyboardOverlap?: number | undefined;
    readonly size?: SelectSize | undefined;
    readonly leading?: ReactNode | RenderIcon | undefined;
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
