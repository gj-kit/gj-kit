/**
 * The icon injection system — design doc §4.2.
 *
 * The heart of having zero runtime dependencies: the host always supplies the icon
 * implementation and the library only computes color and size before handing it
 * over. Per-component renderMark and leading props are the individual override;
 * UiIcons is the default layer injected once at the Provider.
 */
import type { ReactNode } from 'react';

export type IconRenderProps = { readonly color: string; readonly size: number };
export type RenderIcon = (props: IconRenderProps) => ReactNode;

/** The Toast variants — name preserved across 88 call sites (§0 rejected: renaming to intent in C). */
export type ToastVariant = 'error' | 'success' | 'info' | 'warning';

export interface UiIcons {
  /** The SelectionIndicator and SelectAllRow mark. Falls back to a ✓ text glyph. */
  readonly check?: RenderIcon | undefined;
  /** The Checkbox mixed state. Falls back to a − text glyph. */
  readonly minus?: RenderIcon | undefined;
  /** The Accordion expansion affordance. Falls back to a text glyph. */
  readonly chevronDown?: RenderIcon | undefined;
  /** The SearchField leading slot. Falls back to rendering nothing. */
  readonly search?: RenderIcon | undefined;
  /** The EmptyState leading slot. Falls back to rendering nothing. */
  readonly empty?: RenderIcon | undefined;
  /** The ErrorState leading slot. Falls back to rendering nothing. */
  readonly error?: RenderIcon | undefined;
  /** The dismiss affordance for Alert and friends. */
  readonly close?: RenderIcon | undefined;
  /** The Toast leading slot, per variant. Falls back to rendering nothing. Key level is | undefined too, so an EOP consumer can assemble conditionally. */
  readonly toast?: { readonly [V in ToastVariant]?: RenderIcon | undefined } | undefined;
}

/** (internal) Resolves a slot that accepts either a static node or a render function. */
export function renderIconSlot(
  icon: ReactNode | RenderIcon | undefined,
  props: IconRenderProps,
): ReactNode {
  if (icon === undefined) return null;
  return typeof icon === 'function' ? (icon as RenderIcon)(props) : icon;
}
