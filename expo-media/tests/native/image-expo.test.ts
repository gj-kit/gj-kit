import { describe, expect, it, vi } from 'vitest';

const runtime = vi.hoisted(() => ({
  platform: { OS: 'ios' },
  getSize: vi.fn(),
  manipulate: vi.fn(),
}));

vi.mock('react-native', () => ({
  Image: { getSize: runtime.getSize },
  Platform: runtime.platform,
}));

vi.mock('expo-image-manipulator', () => ({
  manipulateAsync: runtime.manipulate,
  SaveFormat: { JPEG: 'jpeg' },
}));

import { createExpoImageProcessor } from '../../src/image';
import { mediaErrorCode } from '../../src/core/errors';

const IMAGE_URI = 'file:///private/secret-source.jpg';

function imageSize(width: number, height: number): void {
  runtime.getSize.mockImplementationOnce((_uri: string, success: (width: number, height: number) => void) => {
    success(width, height);
  });
}

describe('createExpoImageProcessor', () => {
  it('normalizes orientation with a no-action JPEG re-encode', async () => {
    runtime.manipulate.mockResolvedValueOnce({ uri: 'file:///tmp/normalized.jpg' });

    await expect(createExpoImageProcessor().normalizeOrientation(IMAGE_URI)).resolves.toEqual({
      uri: 'file:///tmp/normalized.jpg',
    });
    expect(runtime.manipulate).toHaveBeenCalledWith(IMAGE_URI, [], { compress: 1, format: 'jpeg' });
  });

  it('preserves small images and only reduces images exceeding the requested width', async () => {
    const processor = createExpoImageProcessor();
    imageSize(600, 800);
    runtime.manipulate.mockResolvedValueOnce({ uri: 'file:///tmp/small.jpg' });
    await processor.resizeToMaxWidth({ uri: IMAGE_URI, maxWidth: 1500, compress: 0.7 });
    expect(runtime.manipulate).toHaveBeenLastCalledWith(IMAGE_URI, [], { compress: 0.7, format: 'jpeg' });

    imageSize(3000, 2000);
    runtime.manipulate.mockResolvedValueOnce({ uri: 'file:///tmp/large.jpg' });
    await processor.resizeToMaxWidth({ uri: IMAGE_URI, maxWidth: 1500, compress: 0.7 });
    expect(runtime.manipulate).toHaveBeenLastCalledWith(
      IMAGE_URI,
      [{ resize: { width: 1500 } }],
      { compress: 0.7, format: 'jpeg' },
    );
  });

  it('adds Android raster normalization before applying a display-coordinate crop', async () => {
    runtime.platform.OS = 'android';
    runtime.manipulate.mockResolvedValueOnce({ uri: 'file:///tmp/crop.jpg' });

    await createExpoImageProcessor().cropDisplayed({
      uri: IMAGE_URI,
      sourceSize: { width: 1125, height: 2000 },
      cropRect: { x: 61, y: 221, width: 219, height: 20 },
      renderedImageRect: { x: 61, y: 0, width: 261, height: 464 },
    });

    expect(runtime.manipulate).toHaveBeenLastCalledWith(
      IMAGE_URI,
      [
        { resize: { width: 1125, height: 2000 } },
        { crop: { originX: 0, originY: 953, width: 944, height: 86 } },
      ],
      { compress: 0.9, format: 'jpeg' },
    );
    runtime.platform.OS = 'ios';
  });

  it('turns native failures into a URI-free typed error', async () => {
    runtime.manipulate.mockRejectedValueOnce(new Error(IMAGE_URI));
    const error = await createExpoImageProcessor().normalizeOrientation(IMAGE_URI).catch((value: unknown) => value);

    expect(mediaErrorCode(error)).toBe('image-processing-failed');
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).not.toContain(IMAGE_URI);
  });
});
