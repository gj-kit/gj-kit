import type { ReactElement, ReactNode } from 'react';
import type { StyleProp, TextStyle, ViewStyle } from 'react-native';
import type { RenderIcon } from './icons';
import type { CommonProps } from './internal';
import type { OverlayPlacement } from './overlay/types';
import type { TriggerRenderProps } from './trigger-render';

export type MenuPlacement = OverlayPlacement;
/**
 * Native surface form. 'auto' resolves to 'bottom' on compact widths and
 * 'center' on tablet widths, exactly as before. 'anchored' renders a dim-less
 * panel positioned by the measured trigger inside a transparent Modal; the
 * web popup is always anchored and ignores this prop.
 */
export type MenuPresentation = 'auto' | 'bottom' | 'center' | 'anchored';
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

type MenuOwnedTriggerProps = MenuTriggerProps & {
  readonly renderTrigger?: never;
  readonly size?: MenuTriggerSize | undefined;
  readonly variant?: MenuTriggerVariant | undefined;
  /** Applied to the trigger while a pointer hovers it (web and pointer-equipped devices). Layered after triggerStyle. */
  readonly triggerHoverStyle?: StyleProp<ViewStyle> | undefined;
  readonly triggerStyle?: StyleProp<ViewStyle> | undefined;
  readonly triggerClassName?: string | undefined;
  readonly triggerLabelStyle?: StyleProp<TextStyle> | undefined;
  readonly triggerLabelClassName?: string | undefined;
};

type MenuRenderTriggerProps = {
  /**
   * Replaces the owned trigger visuals with an app-owned element. The kit
   * injects everything behavior and accessibility own — ref, onPress,
   * disabled, role, expanded/busy state, testID, web aria wiring, and the
   * measurement hook anchoring needs; spread every injected prop onto a
   * single Pressable — or an equivalent host that forwards RN press handling
   * (a plain View drops the injected onPress and renders an inoperable
   * announced button) — and style it freely. The injected ref must reach the
   * returned host element: the menu throws when it opens without it, and on
   * web it also throws when the injected role/expanded/name wiring did not
   * land on that node. Owned trigger-visual props are rejected while this
   * slot is present (compile-time via this union, and again at render for JS
   * callers).
   */
  readonly renderTrigger: (trigger: TriggerRenderProps) => ReactElement;
  /** The injected accessible trigger name and the native sheet title. */
  readonly triggerLabel: string;
  readonly iconOnly?: never;
  readonly triggerIcon?: never;
  readonly size?: never;
  readonly variant?: never;
  readonly triggerHoverStyle?: never;
  readonly triggerStyle?: never;
  readonly triggerClassName?: never;
  readonly triggerLabelStyle?: never;
  readonly triggerLabelClassName?: never;
};

export type MenuProps<T extends string> = Omit<CommonProps, 'unstyled'> &
  (MenuOwnedTriggerProps | MenuRenderTriggerProps) & {
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
    /** testID on the trigger pressable itself (the actual press target), distinct from the root container testID. */
    readonly triggerTestID?: string | undefined;
    /** Applied to an enabled item while a pointer hovers it. Layered after itemStyle. */
    readonly itemHoverStyle?: StyleProp<ViewStyle> | undefined;
    readonly contentStyle?: StyleProp<ViewStyle> | undefined;
    readonly contentClassName?: string | undefined;
    readonly itemStyle?: StyleProp<ViewStyle> | undefined;
    readonly itemClassName?: string | undefined;
    readonly itemLabelStyle?: StyleProp<TextStyle> | undefined;
    readonly itemLabelClassName?: string | undefined;
    readonly unstyled?: never;
  };
