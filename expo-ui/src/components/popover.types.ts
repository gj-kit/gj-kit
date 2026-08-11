import type { ReactNode } from 'react';
import type { StyleProp, TextStyle, ViewStyle } from 'react-native';
import type { DialogFocusRef } from './dialog';
import type { RenderIcon } from './icons';
import type { CommonProps } from './internal';
import { overlayPlacements } from './overlay/position';
import type { OverlayPlacement } from './overlay/types';

export type PopoverPlacement = OverlayPlacement;
export type PopoverDirection = 'ltr' | 'rtl';
export type PopoverPresentation = 'auto' | 'bottom' | 'center';
export type PopoverTriggerSize = 'sm' | 'md';
export type PopoverTriggerVariant = 'filled' | 'outlined' | 'ghost';

export type PopoverOpenChangeReason =
  | 'trigger-press'
  | 'outside-press'
  | 'escape-key'
  | 'hardware-back'
  | 'accessibility-escape'
  | 'close-action'
  | 'tab-key'
  | 'focus-out'
  | 'anchor-detached';

export interface PopoverOpenChangeDetails {
  readonly reason: PopoverOpenChangeReason;
  readonly originalEvent?: unknown;
}

type PopoverTriggerProps =
  | {
      /** Visible label and the trigger's default accessible name. */
      readonly triggerLabel: string;
      readonly iconOnly?: false | undefined;
      readonly triggerIcon?: ReactNode | RenderIcon | undefined;
    }
  | {
      /** Required accessible name for an icon-only trigger. */
      readonly triggerLabel: string;
      readonly iconOnly: true;
      readonly triggerIcon: NonNullable<ReactNode> | RenderIcon;
    };

export type PopoverProps = Omit<CommonProps, 'unstyled'> &
  PopoverTriggerProps & {
    /** The caller owns visibility; every interaction only requests a change. */
    readonly open: boolean;
    readonly onOpenChange: (
      open: boolean,
      details: PopoverOpenChangeDetails,
    ) => void;
    /** Required dialog name on every platform. */
    readonly title: string;
    readonly description?: string | undefined;
    readonly children: NonNullable<ReactNode>;
    readonly closeAccessibilityLabel?: string | undefined;
    readonly initialFocusRef?: DialogFocusRef | undefined;
    readonly disabled?: boolean | undefined;
    /** Blocks pointer, Escape, Back, accessibility escape, and explicit close. */
    readonly dismissDisabled?: boolean | undefined;
    readonly overlayId?: string | undefined;
    readonly placement?: PopoverPlacement | undefined;
    readonly direction?: PopoverDirection | undefined;
    readonly sideOffset?: number | undefined;
    readonly alignOffset?: number | undefined;
    readonly collisionPadding?: number | undefined;
    readonly presentation?: PopoverPresentation | undefined;
    /** Native bottom presentation safe-area inset supplied by the app. */
    readonly bottomInset?: number | undefined;
    /** Native keyboard overlap. A positive value takes precedence over bottomInset. */
    readonly keyboardOverlap?: number | undefined;
    readonly size?: PopoverTriggerSize | undefined;
    readonly variant?: PopoverTriggerVariant | undefined;
    readonly triggerStyle?: StyleProp<ViewStyle> | undefined;
    readonly triggerClassName?: string | undefined;
    readonly triggerLabelStyle?: StyleProp<TextStyle> | undefined;
    readonly triggerLabelClassName?: string | undefined;
    /** Visible popover surface. Named content for consistency with Menu and Select. */
    readonly contentStyle?: StyleProp<ViewStyle> | undefined;
    readonly contentClassName?: string | undefined;
    /** Scrollable body content, excluding the fixed title/close header. */
    readonly bodyStyle?: StyleProp<ViewStyle> | undefined;
    readonly bodyClassName?: string | undefined;
    readonly titleStyle?: StyleProp<TextStyle> | undefined;
    readonly unstyled?: never;
  };

function assertNonEmptyString(value: unknown, name: string): asserts value is string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(`${name} must be a non-empty string.`);
  }
}

function assertOptionalNonEmptyString(value: unknown, name: string): void {
  if (value !== undefined) assertNonEmptyString(value, name);
}

/** Internal provider-boundary validation for the always-visible close action. */
export function assertPopoverCloseLabel(value: unknown, name: string): void {
  assertNonEmptyString(value, name);
}

function assertFiniteNumber(value: unknown, name: string, minimum?: number): void {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError(`${name} must be a finite number.`);
  }
  if (minimum !== undefined && value < minimum) {
    throw new RangeError(`${name} must be greater than or equal to ${minimum}.`);
  }
}

function assertEnum(
  value: unknown,
  values: readonly string[],
  name: string,
): void {
  if (value !== undefined && !values.includes(value as string)) {
    throw new RangeError(`${name} "${String(value)}" is not supported.`);
  }
}

/** Shared JavaScript boundary validation for the web and native products. */
export function assertPopoverProps(props: PopoverProps): void {
  assertNonEmptyString(props.triggerLabel, 'Popover triggerLabel');
  assertNonEmptyString(props.title, 'Popover title');
  assertOptionalNonEmptyString(props.description, 'Popover description');
  assertOptionalNonEmptyString(
    props.closeAccessibilityLabel,
    'Popover closeAccessibilityLabel',
  );
  assertOptionalNonEmptyString(props.overlayId, 'Popover overlayId');
  if (props.children === null || props.children === undefined) {
    throw new TypeError('Popover children must be non-null.');
  }
  if (props.iconOnly === true && props.triggerIcon === undefined) {
    throw new TypeError('Popover iconOnly trigger requires triggerIcon.');
  }

  assertEnum(props.placement, overlayPlacements, 'Popover placement');
  assertEnum(props.direction, ['ltr', 'rtl'], 'Popover direction');
  assertEnum(
    props.presentation,
    ['auto', 'bottom', 'center'],
    'Popover presentation',
  );
  assertEnum(props.size, ['sm', 'md'], 'Popover size');
  assertEnum(props.variant, ['filled', 'outlined', 'ghost'], 'Popover variant');

  if (props.sideOffset !== undefined) {
    assertFiniteNumber(props.sideOffset, 'Popover sideOffset', 0);
  }
  if (props.alignOffset !== undefined) {
    assertFiniteNumber(props.alignOffset, 'Popover alignOffset');
  }
  if (props.collisionPadding !== undefined) {
    assertFiniteNumber(props.collisionPadding, 'Popover collisionPadding', 0);
  }
  if (props.bottomInset !== undefined) {
    assertFiniteNumber(props.bottomInset, 'Popover bottomInset', 0);
  }
  if (props.keyboardOverlap !== undefined) {
    assertFiniteNumber(props.keyboardOverlap, 'Popover keyboardOverlap', 0);
  }
}
