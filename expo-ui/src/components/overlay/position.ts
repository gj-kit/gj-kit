import type {
  ComputeOverlayPositionOptions,
  OverlayAlign,
  OverlayCollisionInsets,
  OverlayOverflow,
  OverlayPlacement,
  OverlayPositionResult,
  OverlayRect,
  OverlaySide,
} from './types';

export const overlayPlacements = [
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
] as const satisfies readonly OverlayPlacement[];

interface Boundary {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
  readonly width: number;
  readonly height: number;
}

function finite(value: number, label: string): number {
  if (!Number.isFinite(value)) throw new RangeError(`${label} must be finite.`);
  return value;
}

function nonNegative(value: number, label: string): number {
  finite(value, label);
  if (value < 0) throw new RangeError(`${label} must be greater than or equal to 0.`);
  return value;
}

function normalizeInsets(
  insets: number | OverlayCollisionInsets | undefined,
): Required<OverlayCollisionInsets> {
  if (typeof insets === 'number') {
    const value = nonNegative(insets, 'collisionInsets');
    return { top: value, right: value, bottom: value, left: value };
  }

  return {
    top: nonNegative(insets?.top ?? 0, 'collisionInsets.top'),
    right: nonNegative(insets?.right ?? 0, 'collisionInsets.right'),
    bottom: nonNegative(insets?.bottom ?? 0, 'collisionInsets.bottom'),
    left: nonNegative(insets?.left ?? 0, 'collisionInsets.left'),
  };
}

function collisionBoundary(
  viewport: OverlayRect,
  insets: Required<OverlayCollisionInsets>,
): Boundary {
  finite(viewport.x, 'viewport.x');
  finite(viewport.y, 'viewport.y');
  const viewportWidth = nonNegative(viewport.width, 'viewport.width');
  const viewportHeight = nonNegative(viewport.height, 'viewport.height');
  const left = viewport.x + insets.left;
  const top = viewport.y + insets.top;
  const right = Math.max(left, viewport.x + viewportWidth - insets.right);
  const bottom = Math.max(top, viewport.y + viewportHeight - insets.bottom);

  return { top, right, bottom, left, width: right - left, height: bottom - top };
}

function oppositeSide(side: OverlaySide): OverlaySide {
  switch (side) {
    case 'top':
      return 'bottom';
    case 'right':
      return 'left';
    case 'bottom':
      return 'top';
    case 'left':
      return 'right';
  }
}

function splitPlacement(placement: OverlayPlacement): [OverlaySide, OverlayAlign] {
  const separator = placement.indexOf('-');
  return [
    placement.slice(0, separator) as OverlaySide,
    placement.slice(separator + 1) as OverlayAlign,
  ];
}

function coordinates(
  anchor: OverlayRect,
  floatingWidth: number,
  floatingHeight: number,
  side: OverlaySide,
  align: OverlayAlign,
  direction: 'ltr' | 'rtl',
  sideOffset: number,
  alignOffset: number,
): { x: number; y: number } {
  const anchorRight = anchor.x + anchor.width;
  const anchorBottom = anchor.y + anchor.height;
  const verticalSide = side === 'top' || side === 'bottom';

  let x: number;
  let y: number;

  if (verticalSide) {
    y = side === 'top' ? anchor.y - floatingHeight - sideOffset : anchorBottom + sideOffset;
    if (align === 'center') {
      x = anchor.x + (anchor.width - floatingWidth) / 2;
    } else {
      const start = direction === 'ltr' ? anchor.x : anchorRight - floatingWidth;
      const end = direction === 'ltr' ? anchorRight - floatingWidth : anchor.x;
      x = align === 'start' ? start : end;
    }
    x += direction === 'rtl' ? -alignOffset : alignOffset;
  } else {
    x = side === 'left' ? anchor.x - floatingWidth - sideOffset : anchorRight + sideOffset;
    if (align === 'center') {
      y = anchor.y + (anchor.height - floatingHeight) / 2;
    } else {
      y = align === 'start' ? anchor.y : anchorBottom - floatingHeight;
    }
    y += alignOffset;
  }

  return { x, y };
}

function overflowAt(
  point: { readonly x: number; readonly y: number },
  width: number,
  height: number,
  boundary: Boundary,
): OverlayOverflow {
  return {
    top: Math.max(0, boundary.top - point.y),
    right: Math.max(0, point.x + width - boundary.right),
    bottom: Math.max(0, point.y + height - boundary.bottom),
    left: Math.max(0, boundary.left - point.x),
  };
}

function mainOverflow(side: OverlaySide, overflow: OverlayOverflow): number {
  return overflow[side];
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), Math.max(minimum, maximum));
}

function availableSize(
  side: OverlaySide,
  anchor: OverlayRect,
  boundary: Boundary,
  sideOffset: number,
): { availableWidth: number; availableHeight: number } {
  const anchorRight = anchor.x + anchor.width;
  const anchorBottom = anchor.y + anchor.height;

  switch (side) {
    case 'top':
      return {
        availableWidth: boundary.width,
        availableHeight: Math.max(0, anchor.y - sideOffset - boundary.top),
      };
    case 'right':
      return {
        availableWidth: Math.max(0, boundary.right - anchorRight - sideOffset),
        availableHeight: boundary.height,
      };
    case 'bottom':
      return {
        availableWidth: boundary.width,
        availableHeight: Math.max(0, boundary.bottom - anchorBottom - sideOffset),
      };
    case 'left':
      return {
        availableWidth: Math.max(0, anchor.x - sideOffset - boundary.left),
        availableHeight: boundary.height,
      };
  }
}

/** Pure anchor geometry for web and native measurement adapters. */
export function computeOverlayPosition(
  options: ComputeOverlayPositionOptions,
): OverlayPositionResult {
  const anchor = options.anchor;
  finite(anchor.x, 'anchor.x');
  finite(anchor.y, 'anchor.y');
  nonNegative(anchor.width, 'anchor.width');
  nonNegative(anchor.height, 'anchor.height');
  const floatingWidth = nonNegative(options.floating.width, 'floating.width');
  const floatingHeight = nonNegative(options.floating.height, 'floating.height');
  const sideOffset = finite(options.sideOffset ?? 0, 'sideOffset');
  const alignOffset = finite(options.alignOffset ?? 0, 'alignOffset');
  const direction = options.direction ?? 'ltr';
  const insets = normalizeInsets(options.collisionInsets);
  const boundary = collisionBoundary(options.viewport, insets);
  const [preferredSide, align] = splitPlacement(options.placement);

  let side = preferredSide;
  let point = coordinates(
    anchor,
    floatingWidth,
    floatingHeight,
    side,
    align,
    direction,
    sideOffset,
    alignOffset,
  );

  if (options.flip ?? true) {
    const preferredOverflow = overflowAt(
      point,
      floatingWidth,
      floatingHeight,
      boundary,
    );
    const alternateSide = oppositeSide(side);
    const alternatePoint = coordinates(
      anchor,
      floatingWidth,
      floatingHeight,
      alternateSide,
      align,
      direction,
      sideOffset,
      alignOffset,
    );
    const alternateOverflow = overflowAt(
      alternatePoint,
      floatingWidth,
      floatingHeight,
      boundary,
    );

    if (
      mainOverflow(side, preferredOverflow) > 0 &&
      mainOverflow(alternateSide, alternateOverflow) < mainOverflow(side, preferredOverflow)
    ) {
      side = alternateSide;
      point = alternatePoint;
    }
  }

  const unshifted = point;
  if (options.shift ?? true) {
    point = {
      x: clamp(point.x, boundary.left, boundary.right - floatingWidth),
      y: clamp(point.y, boundary.top, boundary.bottom - floatingHeight),
    };
  }

  const placement = `${side}-${align}` as OverlayPlacement;
  const anchorRight = anchor.x + anchor.width;
  const anchorBottom = anchor.y + anchor.height;
  const detached =
    anchorRight <= boundary.left ||
    anchor.x >= boundary.right ||
    anchorBottom <= boundary.top ||
    anchor.y >= boundary.bottom;
  const available = availableSize(side, anchor, boundary, sideOffset);

  return {
    x: point.x,
    y: point.y,
    placement,
    side,
    align,
    flipped: side !== preferredSide,
    shifted: point.x !== unshifted.x || point.y !== unshifted.y,
    detached,
    ...available,
    overflow: overflowAt(point, floatingWidth, floatingHeight, boundary),
  };
}
