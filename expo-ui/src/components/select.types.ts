import type { ReactElement, ReactNode } from 'react';
import type { StyleProp, TextStyle, ViewStyle } from 'react-native';
import type { RenderIcon } from './icons';
import type { CommonProps } from './internal';
import type { OverlayPlacement } from './overlay/types';
import type { TriggerRenderProps } from './trigger-render';

export type SelectPlacement = OverlayPlacement;
/**
 * Native surface form. 'auto' resolves to 'bottom' on compact widths and
 * 'center' on tablet widths, exactly as before. 'anchored' renders a dim-less
 * panel positioned by the measured trigger inside a transparent Modal; the
 * web popup is always anchored and ignores this prop.
 */
export type SelectPresentation = 'auto' | 'bottom' | 'center' | 'anchored';
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

type SelectOwnedTriggerProps = {
  readonly renderTrigger?: never;
  readonly size?: SelectSize | undefined;
  readonly leading?: ReactNode | RenderIcon | undefined;
  /** Applied to the trigger while a pointer hovers it (web and pointer-equipped devices). Layered after triggerStyle. */
  readonly triggerHoverStyle?: StyleProp<ViewStyle> | undefined;
  readonly triggerStyle?: StyleProp<ViewStyle> | undefined;
  readonly triggerClassName?: string | undefined;
  readonly valueStyle?: StyleProp<TextStyle> | undefined;
  readonly valueClassName?: string | undefined;
};

type SelectRenderTriggerProps = {
  /**
   * Replaces the owned trigger visuals with an app-owned element. The kit
   * injects everything behavior and accessibility own — ref, onPress,
   * disabled, combobox/button semantics, expanded/busy state, the displayed
   * value text, testID, web aria wiring, and the measurement hook anchoring
   * needs; spread every injected prop onto a single Pressable — or an
   * equivalent host that forwards RN press handling (a plain View drops the
   * injected onPress and renders an inoperable announced combobox) — and
   * style it freely. The injected ref must reach the returned host element:
   * the select throws when it opens without it, and on web it also throws
   * when the injected role/expanded/name wiring did not land on that node.
   * Owned trigger-visual props are rejected while this slot is present
   * (compile-time via this union, and again at render for JS callers). The
   * label row and helper/error text stay kit-rendered outside the trigger.
   */
  readonly renderTrigger: (trigger: TriggerRenderProps) => ReactElement;
  readonly size?: never;
  readonly leading?: never;
  readonly triggerHoverStyle?: never;
  readonly triggerStyle?: never;
  readonly triggerClassName?: never;
  readonly valueStyle?: never;
  readonly valueClassName?: never;
};

export type SelectProps<T extends string> = Omit<CommonProps, 'unstyled'> &
  SelectLabelProps &
  (SelectOwnedTriggerProps | SelectRenderTriggerProps) & {
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
    /** testID on the trigger pressable itself (the actual press target). On the web it replaces the derived `${testID}-trigger`. */
    readonly triggerTestID?: string | undefined;
    /** Applied to an enabled option while a pointer hovers it. Layered after itemStyle. */
    readonly itemHoverStyle?: StyleProp<ViewStyle> | undefined;
    readonly labelStyle?: StyleProp<TextStyle> | undefined;
    readonly labelClassName?: string | undefined;
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
