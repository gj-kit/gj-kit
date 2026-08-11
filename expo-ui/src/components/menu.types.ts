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
  /** typeahead가 시각 라벨과 달라야 할 때만 지정한다. */
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
  /** 기본 true. */
  readonly closeOnSelect?: boolean | undefined;
};

export type MenuCheckboxItem<T extends string> = MenuItemBase<T> & {
  readonly kind: 'checkbox';
  readonly checked: boolean | 'mixed';
  /** 기본 false — 여러 옵션을 연속으로 바꿀 수 있다. */
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
      /** 시각 라벨이자 기본 접근성 이름. */
      readonly triggerLabel: string;
      readonly iconOnly?: false | undefined;
      readonly triggerIcon?: ReactNode | RenderIcon | undefined;
    }
  | {
      /** icon-only trigger의 필수 접근성 이름. */
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
    /** menu landmark 이름. 기본 triggerLabel. */
    readonly accessibilityLabel?: string | undefined;
    readonly disabled?: boolean | undefined;
    /** 선택은 막되 이미 열린 메뉴의 dismiss는 허용한다. */
    readonly busy?: boolean | undefined;
    /** outside/Escape/Back/접근성 escape를 막는다. */
    readonly dismissDisabled?: boolean | undefined;
    readonly placement?: MenuPlacement | undefined;
    readonly direction?: MenuDirection | undefined;
    readonly sideOffset?: number | undefined;
    readonly alignOffset?: number | undefined;
    readonly collisionPadding?: number | undefined;
    readonly presentation?: MenuPresentation | undefined;
    /** native bottom presentation에서 호출자가 합성한 safe-area inset. */
    readonly bottomInset?: number | undefined;
    /** native Modal 안에서 계산한 키보드 가림 높이. 0보다 크면 bottomInset보다 우선한다. */
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
