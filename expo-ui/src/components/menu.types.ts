import type { ReactNode } from 'react';
import type { StyleProp, TextStyle, ViewStyle } from 'react-native';
import type { RenderIcon } from './icons';
import type { CommonProps } from './internal';
import type { OverlayPlacement } from './overlay/types';

export type MenuPlacement = OverlayPlacement;
export type MenuPresentation = 'auto' | 'bottom' | 'center';
export type MenuDirection = 'ltr' | 'rtl';
export type MenuTriggerSize = 'sm' | 'md';
export type MenuTriggerVariant = 'filled' | 'outlined' | 'ghost';

type MenuItemBase<T extends string> = {
  readonly value: T;
  readonly label: string;
  /** Specify this only when typeahead has to differ from the visible label. */
  readonly textValue?: string | undefined;
  readonly description?: string | undefined;
  readonly leading?: ReactNode | RenderIcon | undefined;
  readonly shortcut?: string | undefined;
  readonly disabled?: boolean | undefined;
  readonly testID?: string | undefined;
};

export type MenuActionItem<T extends string> = MenuItemBase<T> & {
  readonly kind: 'action';
  readonly destructive?: boolean | undefined;
  /** Defaults to true. */
  readonly closeOnSelect?: boolean | undefined;
};

export type MenuCheckboxItem<T extends string> = MenuItemBase<T> & {
  readonly kind: 'checkbox';
  readonly checked: boolean | 'mixed';
  /** Defaults to false, so several options can be changed in a row. */
  readonly closeOnSelect?: boolean | undefined;
  readonly destructive?: never;
};

export type MenuItem<T extends string> = MenuActionItem<T> | MenuCheckboxItem<T>;

export type MenuSelectDetails<T extends string> =
  | {
      readonly kind: 'action';
      readonly value: T;
      readonly originalEvent?: unknown;
    }
  | {
      readonly kind: 'checkbox';
      readonly value: T;
      readonly checked: boolean;
      readonly originalEvent?: unknown;
    };

export type MenuOpenChangeReason =
  | 'trigger-press'
  | 'outside-press'
  | 'escape-key'
  | 'hardware-back'
  | 'accessibility-escape'
  | 'cancel-action'
  | 'tab-key'
  | 'focus-out'
  | 'anchor-detached'
  | 'action-select';

export interface MenuOpenChangeDetails<T extends string> {
  readonly reason: MenuOpenChangeReason;
  readonly value?: T | undefined;
  readonly originalEvent?: unknown;
}

type MenuTriggerProps =
  | {
      /** Both the visible label and the default accessible name. */
      readonly triggerLabel: string;
      readonly iconOnly?: false | undefined;
      readonly triggerIcon?: ReactNode | RenderIcon | undefined;
    }
  | {
      /** The required accessible name of an icon-only trigger. */
      readonly triggerLabel: string;
      readonly iconOnly: true;
      readonly triggerIcon: NonNullable<ReactNode> | RenderIcon;
    };

export type MenuProps<T extends string> = Omit<CommonProps, 'unstyled'> &
  MenuTriggerProps & {
    readonly items: readonly MenuItem<T>[];
    readonly open: boolean;
    readonly onOpenChange: (
      open: boolean,
      details: MenuOpenChangeDetails<NoInfer<T>>,
    ) => void;
    readonly onSelect: (details: MenuSelectDetails<NoInfer<T>>) => void;
    /** The menu landmark name. Defaults to triggerLabel. */
    readonly accessibilityLabel?: string | undefined;
    readonly disabled?: boolean | undefined;
    /** Blocks selection while still allowing an already open menu to dismiss. */
    readonly busy?: boolean | undefined;
    /** Blocks outside presses, Escape, Back, and the accessibility escape. */
    readonly dismissDisabled?: boolean | undefined;
    readonly placement?: MenuPlacement | undefined;
    readonly direction?: MenuDirection | undefined;
    readonly sideOffset?: number | undefined;
    readonly alignOffset?: number | undefined;
    readonly collisionPadding?: number | undefined;
    readonly presentation?: MenuPresentation | undefined;
    /** Safe-area inset composed by the caller for a native bottom presentation. */
    readonly bottomInset?: number | undefined;
    /** Keyboard occlusion height measured inside a native Modal. Takes precedence over bottomInset when greater than 0. */
    readonly keyboardOverlap?: number | undefined;
    readonly size?: MenuTriggerSize | undefined;
    readonly variant?: MenuTriggerVariant | undefined;
    readonly triggerStyle?: StyleProp<ViewStyle> | undefined;
    readonly triggerClassName?: string | undefined;
    readonly triggerLabelStyle?: StyleProp<TextStyle> | undefined;
    readonly triggerLabelClassName?: string | undefined;
    readonly contentStyle?: StyleProp<ViewStyle> | undefined;
    readonly contentClassName?: string | undefined;
    readonly itemStyle?: StyleProp<ViewStyle> | undefined;
    readonly itemClassName?: string | undefined;
    readonly itemLabelStyle?: StyleProp<TextStyle> | undefined;
    readonly itemLabelClassName?: string | undefined;
    readonly unstyled?: never;
  };
