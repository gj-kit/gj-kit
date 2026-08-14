// Persistent app attachment storage — isolated from the upload-oriented root
// entry so consumers that only need durable local copies do not load the legacy
// upload file-system adapter.

// The native binding lives here; the contract remains core-only so callers can
// classify durable failures without importing Expo filesystem code.
export type {
  DurableFile,
  DurableFileErrorCode,
  DurableFileStore,
  DurableFileStoreCopyInput,
  DurablePickedAssetCopyInput,
  DurablePickedAssetFile,
} from './core/durableFileStore';
export {
  DURABLE_FILE_ERROR_CODES,
  DurableFileError,
  isDurableFileError,
} from './core/durableFileStore';
export { createExpoDocumentFileStore } from './expo/durableFileStore';
