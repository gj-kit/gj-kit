import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import type { ButtonVariant } from './button';
import type { RenderIcon } from './icons';
import type { CommonProps } from './internal';
import type { OverlayDirection, OverlayPlacement } from './overlay/types';

export type TooltipPlacement = OverlayPlacement;
export type TooltipDirection = OverlayDirection;
export type TooltipTriggerSize = 'sm' | 'md';

/**
 * Deliberately narrow tooltip contract: Tooltip owns an icon action trigger so
 * its accessible name, hover/focus behavior, and touch target cannot diverge.
 */
type TooltipOwnProps = {
  /** Plain, non-blank description. Interactive tooltip content is unsupported. */
  readonly content: string;
  /** Required accessible name for the icon-only trigger. */
  readonly triggerLabel: string;
  readonly triggerIcon: NonNullable<ReactNode> | RenderIcon;
  readonly onPress: () => void;
  /** Keeps the action enabled while suppressing only its tooltip description. */
  readonly tooltipDisabled?: boolean | undefined;
  /** First pointer-hover delay. Keyboard focus always opens immediately. */
  readonly delayMs?: number | undefined;
  /** Pointer bridge delay between the trigger and floating tooltip. */
  readonly closeDelayMs?: number | undefined;
  readonly placement?: TooltipPlacement | undefined;
  readonly direction?: TooltipDirection | undefined;
  readonly sideOffset?: number | undefined;
  readonly collisionPadding?: number | undefined;
  /** Both choices preserve a minimum 44px accessible target. */
  readonly size?: TooltipTriggerSize | undefined;
  readonly variant?: ButtonVariant | undefined;
  readonly triggerStyle?: StyleProp<ViewStyle> | undefined;
  readonly triggerClassName?: string | undefined;
  readonly contentStyle?: StyleProp<ViewStyle> | undefined;
  readonly contentClassName?: string | undefined;
  readonly unstyled?: never;
};

export type TooltipProps = Omit<CommonProps, 'unstyled'> & TooltipOwnProps;

const PLACEMENTS: readonly TooltipPlacement[] = [
  'top-start',
  'top-center',
  'top-end',
  'right-start',
  'right-center',
  'right-end',
  'bottom-start',
  'bottom-center',
  'bottom-end',
  'left-start',
  'left-center',
  'left-end',
];

const VARIANTS: readonly ButtonVariant[] = [
  'primary',
  'primary-outline',
  'secondary',
  'ghost',
  'destructive',
  'destructive-outline',
  'inverse',
];

function assertNonBlank(value: string, label: string): void {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Tooltip ${label} must be a non-empty string.`);
  }
}

function assertFiniteNonNegative(value: number | undefined, label: string): void {
  if (value !== undefined && (!Number.isFinite(value) || value < 0)) {
    throw new RangeError(`Tooltip ${label} must be a finite non-negative number.`);
  }
}

/** Internal runtime guard shared by the web and native platform modules. */
export function assertTooltipProps(props: TooltipProps): void {
  assertNonBlank(props.content, 'content');
  assertNonBlank(props.triggerLabel, 'triggerLabel');
  if (props.triggerIcon === null || props.triggerIcon === undefined) {
    throw new Error('Tooltip triggerIcon is required.');
  }
  if (typeof props.onPress !== 'function') {
    throw new TypeError('Tooltip onPress must be a function.');
  }
  assertFiniteNonNegative(props.delayMs, 'delayMs');
  assertFiniteNonNegative(props.closeDelayMs, 'closeDelayMs');
  assertFiniteNonNegative(props.sideOffset, 'sideOffset');
  assertFiniteNonNegative(props.collisionPadding, 'collisionPadding');
  if (props.size !== undefined && props.size !== 'sm' && props.size !== 'md') {
    throw new Error('Tooltip size must be "sm" or "md".');
  }
  if (props.placement !== undefined && !PLACEMENTS.includes(props.placement)) {
    throw new Error('Tooltip placement is invalid.');
  }
  if (
    props.direction !== undefined &&
    props.direction !== 'ltr' &&
    props.direction !== 'rtl'
  ) {
    throw new Error('Tooltip direction must be "ltr" or "rtl".');
  }
  if (props.variant !== undefined && !VARIANTS.includes(props.variant)) {
    throw new Error('Tooltip variant is invalid.');
  }
  if ('unstyled' in props && props.unstyled !== undefined) {
    throw new Error('Tooltip does not support unstyled.');
  }
}
