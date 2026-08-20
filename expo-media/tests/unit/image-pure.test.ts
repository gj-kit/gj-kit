import { describe, expect, it } from 'vitest';

import { shouldResizeToMaxWidth, toPixelCropRect } from '../../src/image/pure';

describe('image/pure', () => {
  it('only requests downscaling, never an upscale', () => {
    expect(shouldResizeToMaxWidth(600, 1500)).toBe(false);
    expect(shouldResizeToMaxWidth(1500, 1500)).toBe(false);
    expect(shouldResizeToMaxWidth(3000, 1500)).toBe(true);
  });

  it('converts a displayed crop rectangle into source-image pixels', () => {
    expect(
      toPixelCropRect({
        sourceSize: { width: 1125, height: 2000 },
        cropRect: { x: 61, y: 221, width: 219, height: 20 },
        renderedImageRect: { x: 61, y: 0, width: 261, height: 464 },
      }),
    ).toEqual({ originX: 0, originY: 953, width: 944, height: 86 });
  });

  it('rejects an empty crop instead of passing invalid geometry to the native adapter', () => {
    expect(() =>
      toPixelCropRect({
        sourceSize: { width: 100, height: 100 },
        cropRect: { x: 150, y: 0, width: 10, height: 10 },
        renderedImageRect: { x: 0, y: 0, width: 100, height: 100 },
      }),
    ).toThrow(RangeError);
  });
});
