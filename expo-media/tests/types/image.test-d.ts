import { describe, expectTypeOf, it } from 'vitest';

import { createExpoImageProcessor } from '../../src/image';
import { shouldResizeToMaxWidth, toPixelCropRect } from '../../src/image/pure';
import type { ExpoImageProcessor, ImageRect, ImageSize, PixelCropRect } from '../../src/image';

describe('image public subpaths', () => {
  it('keeps Expo processing behind the explicit image entry and exposes pure geometry separately', () => {
    const processor = createExpoImageProcessor();
    const size: ImageSize = { width: 100, height: 200 };
    const rect: ImageRect = { x: 0, y: 0, width: 100, height: 200 };

    expectTypeOf(processor).toEqualTypeOf<ExpoImageProcessor>();
    expectTypeOf(processor.getImageSize('file:///photo.jpg')).toEqualTypeOf<Promise<ImageSize>>();
    expectTypeOf(processor.normalizeOrientation('file:///photo.jpg')).toEqualTypeOf<Promise<{ readonly uri: string }>>();
    expectTypeOf(
      processor.cropDisplayed({
        uri: 'file:///photo.jpg',
        sourceSize: size,
        cropRect: rect,
        renderedImageRect: rect,
      }),
    ).toEqualTypeOf<Promise<{ readonly uri: string }>>();
    expectTypeOf(shouldResizeToMaxWidth(3000, 1500)).toEqualTypeOf<boolean>();
    expectTypeOf(toPixelCropRect({ sourceSize: size, cropRect: rect, renderedImageRect: rect })).toEqualTypeOf<PixelCropRect>();
  });
});
