import { Image, Platform } from 'react-native';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';

import { isMediaError, MediaError } from '../core/errors';
import { enMediaStrings, type MediaStrings } from '../core/strings';
import {
  shouldResizeToMaxWidth,
  toPixelCropRect,
  type ImageRect,
  type ImageSize,
} from './pure';

export interface ImageProcessingOptions {
  /** JPEG compression in Expo's 0..1 range. */
  readonly compress?: number | undefined;
}

export interface ResizeImageToMaxWidthInput extends ImageProcessingOptions {
  readonly uri: string;
  readonly maxWidth: number;
}

export interface RotateImageInput extends ImageProcessingOptions {
  readonly uri: string;
  readonly degrees: number;
}

export interface CropDisplayedImageInput extends ImageProcessingOptions {
  readonly uri: string;
  /** Dimensions React Native used to render the source image. */
  readonly sourceSize: ImageSize;
  readonly cropRect: ImageRect;
  readonly renderedImageRect: ImageRect;
}

export interface ProcessedImage {
  readonly uri: string;
}

export interface ExpoImageProcessor {
  getImageSize(uri: string): Promise<ImageSize>;
  /** Re-encodes once so the platform decoder applies EXIF orientation; never rotate from EXIF manually. */
  normalizeOrientation(uri: string): Promise<ProcessedImage>;
  /** Re-encodes to JPEG and reduces only when the source exceeds `maxWidth`. */
  resizeToMaxWidth(input: ResizeImageToMaxWidthInput): Promise<ProcessedImage>;
  rotate(input: RotateImageInput): Promise<ProcessedImage>;
  /** Crops display coordinates; Android first normalizes the raster to the displayed source dimensions. */
  cropDisplayed(input: CropDisplayedImageInput): Promise<ProcessedImage>;
}

export interface CreateExpoImageProcessorOptions {
  readonly strings?: MediaStrings | undefined;
}

function imageProcessingError(strings: MediaStrings): MediaError {
  return new MediaError('image-processing-failed', strings.imageProcessingFailed);
}

function compressOrDefault(value: number | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new RangeError('compress must be a finite number from 0 through 1.');
  }
  return value;
}

async function manipulate(
  uri: string,
  actions: Parameters<typeof manipulateAsync>[1],
  compress: number,
  strings: MediaStrings,
): Promise<ProcessedImage> {
  try {
    const result = await manipulateAsync(uri, actions, { compress, format: SaveFormat.JPEG });
    return { uri: result.uri };
  } catch {
    throw imageProcessingError(strings);
  }
}

function imageSize(uri: string, strings: MediaStrings): Promise<ImageSize> {
  return new Promise((resolve, reject) => {
    try {
      Image.getSize(
        uri,
        (width, height) => resolve({ width, height }),
        () => reject(imageProcessingError(strings)),
      );
    } catch {
      reject(imageProcessingError(strings));
    }
  });
}

/** Creates the Expo-native image processor. Import only from `@gj-kit/expo-media/image`. */
export function createExpoImageProcessor(
  options: CreateExpoImageProcessorOptions = {},
): ExpoImageProcessor {
  const strings = options.strings ?? enMediaStrings;

  return {
    getImageSize(uri) {
      return imageSize(uri, strings);
    },

    normalizeOrientation(uri) {
      // expo-image-manipulator's decoders bake EXIF orientation when they load
      // an image. A no-action JPEG re-encode is therefore intentionally the
      // whole operation; inspecting and applying EXIF rotations double-rotates
      // PHPicker/compatible assets on iOS.
      return manipulate(uri, [], 1, strings);
    },

    async resizeToMaxWidth({ uri, maxWidth, compress }) {
      try {
        const size = await imageSize(uri, strings);
        const actions = shouldResizeToMaxWidth(size.width, maxWidth)
          ? [{ resize: { width: maxWidth } }]
          : [];
        return await manipulate(uri, actions, compressOrDefault(compress, 1), strings);
      } catch (error) {
        if (isMediaError(error)) throw error;
        throw imageProcessingError(strings);
      }
    },

    rotate({ uri, degrees, compress }) {
      try {
        if (!Number.isFinite(degrees)) throw new RangeError('degrees must be finite.');
        return manipulate(uri, [{ rotate: degrees }], compressOrDefault(compress, 0.9), strings);
      } catch (error) {
        if (isMediaError(error)) throw error;
        throw imageProcessingError(strings);
      }
    },

    cropDisplayed({ uri, sourceSize, cropRect, renderedImageRect, compress }) {
      try {
        const pixelCrop = toPixelCropRect({ sourceSize, cropRect, renderedImageRect });
        const actions = Platform.OS === 'android'
          ? [
              { resize: { width: sourceSize.width, height: sourceSize.height } },
              { crop: pixelCrop },
            ]
          : [{ crop: pixelCrop }];
        return manipulate(uri, actions, compressOrDefault(compress, 0.9), strings);
      } catch (error) {
        if (isMediaError(error)) throw error;
        throw imageProcessingError(strings);
      }
    },
  };
}
