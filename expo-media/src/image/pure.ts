/** Dependency-free geometry and resize decisions for `@gj-kit/expo-media/image`. */

export interface ImageSize {
  readonly width: number;
  readonly height: number;
}

/** A rectangle in the rendered image coordinate space. */
export interface ImageRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** A crop rectangle in source-image pixels for expo-image-manipulator. */
export interface PixelCropRect {
  readonly originX: number;
  readonly originY: number;
  readonly width: number;
  readonly height: number;
}

export interface PixelCropInput {
  readonly sourceSize: ImageSize;
  readonly cropRect: ImageRect;
  readonly renderedImageRect: ImageRect;
}

function requirePositiveFinite(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${label} must be a positive finite number.`);
  }
}

/** Returns true only when reducing the source width; it never requests an upscale. */
export function shouldResizeToMaxWidth(sourceWidth: number, maxWidth: number): boolean {
  requirePositiveFinite(sourceWidth, 'sourceWidth');
  requirePositiveFinite(maxWidth, 'maxWidth');
  return sourceWidth > maxWidth;
}

/**
 * Converts a crop drawn over a scaled or zoomed image into source-image pixels.
 *
 * The caller owns gesture constraints; this function preserves the existing
 * display-to-source mapping and clamps the ending edge to source bounds.
 */
export function toPixelCropRect({
  sourceSize,
  cropRect,
  renderedImageRect,
}: PixelCropInput): PixelCropRect {
  requirePositiveFinite(sourceSize.width, 'sourceSize.width');
  requirePositiveFinite(sourceSize.height, 'sourceSize.height');
  requirePositiveFinite(cropRect.width, 'cropRect.width');
  requirePositiveFinite(cropRect.height, 'cropRect.height');
  requirePositiveFinite(renderedImageRect.width, 'renderedImageRect.width');
  requirePositiveFinite(renderedImageRect.height, 'renderedImageRect.height');

  const scaleX = sourceSize.width / renderedImageRect.width;
  const scaleY = sourceSize.height / renderedImageRect.height;
  const originX = Math.max(0, Math.round((cropRect.x - renderedImageRect.x) * scaleX));
  const originY = Math.max(0, Math.round((cropRect.y - renderedImageRect.y) * scaleY));
  const width = Math.min(Math.round(cropRect.width * scaleX), sourceSize.width - originX);
  const height = Math.min(Math.round(cropRect.height * scaleY), sourceSize.height - originY);

  if (width <= 0 || height <= 0) {
    throw new RangeError('cropRect must intersect renderedImageRect.');
  }

  return { originX, originY, width, height };
}
