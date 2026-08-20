/**
 * Expo image processing adapter.
 *
 * This explicit subpath owns the expo-image-manipulator peer. Apps that only
 * upload media can keep importing the package root without installing it.
 */
export { createExpoImageProcessor } from './image/expo';
export type {
  CreateExpoImageProcessorOptions,
  CropDisplayedImageInput,
  ExpoImageProcessor,
  ImageProcessingOptions,
  ProcessedImage,
  ResizeImageToMaxWidthInput,
  RotateImageInput,
} from './image/expo';
export type {
  ImageRect,
  ImageSize,
  PixelCropInput,
  PixelCropRect,
} from './image/pure';
