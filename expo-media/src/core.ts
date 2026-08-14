// ═══════════════════════════════════════════════════════════════════════════
// `"./core"` 엔트리 — 설계 문서 §2.2.
//
// 이 배럴의 규율은 표 한 줄로 요약된다: **peer 0, DOM 0.**
//   · `react`·`react-native`·`expo-*` import 0 — bare RN·웹 전용·Node 스크립트 소비자가
//     아무 peer도 설치하지 않고 이 엔트리만으로 전 정책을 쓸 수 있어야 한다.
//   · DOM lib 0 — `tsconfig.core.json`(소스 가드)과 `skipLibCheck:false` dist 가드가
//     이것을 정적으로 강제한다(§2.4). 여기서 DOM 타입이 새면 두 가드가 동시에 실패한다.
//
// ⚠ **`src/core/brand.ts`는 재export하지 않는다**(§5.3, G14). 브랜드는 위조 차단용
//   타입 각인이며, 배럴로 내보내는 순간 소비자가 `StagingCache`를 손으로 위조할 수 있다.
//   "재export 금지"는 배럴 기준이고, 패키지 내부 모듈(`staging.ts`)의 import는 정상이다.
//
// ⚠ `@internal` 표시된 업로드 헬퍼(`sizeBucket`·`posterFileName`·`assertUploadSize`·
//   `normalizeCollectionId`·`isSuccessStatus`·`DEFAULT_*`)와 해석 경로 내부
//   (`normalizeUploadUri`·`resolveDeviceAssetSource`·`getDeviceAssetInfoWithDeadline`)는
//   공개 표면이 아니다 — §5.3·§5.4가 나열한 심볼만 여기 있다. 내부 심볼을 한 번 공개하면
//   그때부터 그 시그니처가 영구 계약이 된다.
// ═══════════════════════════════════════════════════════════════════════════

// ─── §3.3 어댑터 계약 (전부 타입 — 런타임 심볼 0) ───────────────────────────
export type {
  MediaKind,
  MediaPlatform,
  BinarySource,
  NamedBinarySource,
  ChunkRange,
  MediaPermission,
  PlatformAdapter,
  FileStat,
  FileSystemAdapter,
  DurableFileStoreAdapter,
  FileDownloadAdapter,
  PutRequest,
  LocalFileTransport,
  BinaryTransport,
  HashAdapter,
  LocalPosterAdapter,
  BinaryPosterAdapter,
  BinarySourceLoader,
  PickedAsset,
  PickerAdapter,
  DeviceAssetRef,
  DeviceAsset,
  DeviceAssetPage,
  DeviceAlbum,
  DeviceAssetInfo,
  DeviceLibraryAdapter,
  ResolvedDeviceAsset,
  ResolvedPickedAsset,
  MediaLibrarySaveAdapter,
  BrowserSaveAdapter,
  SaveTarget,
} from './core/adapters';

// ─── §5.1 백엔드 계약 · 결과 타입 · 정책 값 ─────────────────────────────────
export type {
  GeoPoint,
  MediaMetadata,
  MediaUploadIntent,
  MediaUploadIntentRequest,
  MediaUploadObject,
  MediaOrphanedUpload,
  MediaUploadFailureStage,
  MediaUploadFailureInfo,
  UploadedPoster,
  MediaUploadCompletion,
  UploadResult,
  MediaUploadIntentApi,
  MediaUploadApi,
  MediaUploadLimit,
  MediaUploadLimits,
  MediaDebugOptions,
} from './core/types';

// ─── §5.2 에러 — 코드 16종 ──────────────────────────────────────────────────
// ⚠ `isMediaError`가 `instanceof`의 대체다. `splitting:false`(§2.4)로 엔트리마다 코어가
//   복제되므로 `instanceof`는 **반드시** 깨진다 — `"./device"`가 던진 에러를 `"."`이 검사하면
//   두 클래스 객체가 서로 다르다.
export type { MediaErrorCode } from './core/errors';
export {
  MEDIA_ERROR_CODES,
  MediaError,
  isMediaError,
  mediaErrorCode,
  mediaErrorUserMessage,
  mediaUploadFailureInfo,
  assertNeverMediaError,
} from './core/errors';

// ─── §5.1 텔레메트리 스팬 계약 · §7.2 안정적 operation 6종 ──────────────────
export type {
  MediaOperation,
  MediaActivity,
  MediaActivityFinish,
  MediaTelemetry,
} from './core/telemetry';
export { MEDIA_OPERATIONS, noopMediaTelemetry } from './core/telemetry';

// ─── §4 문구 주입 ───────────────────────────────────────────────────────────
export type { MediaStrings } from './core/strings';
export { enMediaStrings, koMediaStrings } from './core/strings';

// ─── §5.3 mediaTypes — 확장자↔MIME 단일 테이블 ──────────────────────────────
export type { MediaContentType, ImageContentType, VideoContentType } from './core/mediaTypes';
export {
  MEDIA_FILE_EXTENSIONS,
  MEDIA_CONTENT_TYPES,
  mediaKindOf,
  extensionForContentType,
  detectMediaContentType,
  detectImageContentType,
  inferMediaContentType,
  inferImageContentType,
  isSupportedImageFile,
  isSupportedVideoFile,
  isSupportedMediaFile,
  mediaFileName,
} from './core/mediaTypes';

// ─── §5.3 metadata — EXIF dict + JPEG APP1 파서 ─────────────────────────────
export type { ExifCapturedAtOptions, ExifWallClock } from './core/metadata';
export {
  capturedAtFromExif,
  mediaMetadataFromExif,
  mediaMetadataFromJpeg,
  parseExifWallClock,
} from './core/metadata';

// ─── §5.3 · §9 해시 — 순수 TS 증분 SHA-256 (런타임 의존성 0) ────────────────
export type { Sha256Hasher } from './core/hashFile';
export {
  HASH_CHUNK_BYTES,
  computeChunkRanges,
  createSha256,
  sha256Hex,
  createFileHasher,
} from './core/hashFile';

// ─── §5.3 · §7 하드닝 7 스테이징 캐시 ───────────────────────────────────────
export type { StagingCache } from './core/staging';
export { createStagingCache } from './core/staging';

// ─── App-owned durable attachment storage ──────────────────────────────────
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
  createDurableFileStore,
  isDurableFileError,
} from './core/durableFileStore';

// ─── §5.3 · §7 하드닝 8 디버그 — 서명 URL 유출 차단 ─────────────────────────
export type { MediaDebugLogger } from './core/debug';
export { isPhotoKitUri, summarizeUri, sanitizeMediaErrorMessage, createMediaDebugLogger } from './core/debug';

// ─── §5.4-① 로컬 파일 업로드 ────────────────────────────────────────────────
// `POSTER_CONTENT_TYPE`은 공개다(§5.4.1-7) — presign 요청의 contentType과 서버 검증이
// 맞물리므로 소비자가 읽을 수 있어야 한다.
export type {
  MediaUploadConfig,
  LocalUploadInput,
  LocalUploads,
  DeferredLocalUpload,
  DeferredLocalUploadConfig,
  DeferredLocalUploads,
} from './core/upload/uploader';
export {
  POSTER_CONTENT_TYPE,
  createLocalUploads,
  createDeferredLocalUploads,
} from './core/upload/uploader';

// ─── §5.4-② 바이너리(웹 Blob) 업로드 ────────────────────────────────────────
export type { BinaryUploads } from './core/upload/binary';
export { createBinaryUploads } from './core/upload/binary';

// ─── §5.4-③ 피커 플로우 ─────────────────────────────────────────────────────
export type { MediaPickOptions, MediaPickerActions } from './core/pickerActions';
export { createMediaPickerActions } from './core/pickerActions';
export type { PickUploadOptions, PickerFlows } from './core/upload/pickerFlows';
export { createPickerFlows } from './core/upload/pickerFlows';

// ─── §5.4-④ 기기 라이브러리 ─────────────────────────────────────────────────
export type { DeviceLibrary, DeviceResolveOptions } from './core/device/deviceLibrary';
export { createDeviceLibrary } from './core/device/deviceLibrary';
export { toPickedAsset, deviceAssetCapturedAt } from './core/device/toPickedAsset';

// ─── §5.4-⑤ 기기 자산 업로드 ────────────────────────────────────────────────
export type { DeviceUploads } from './core/upload/deviceUploads';
export { createDeviceUploads } from './core/upload/deviceUploads';

// ─── §5.4-⑥ 기기 저장 ──────────────────────────────────────────────────────
export type { SaveableMedia, SaveResult, MediaSaver } from './core/save/saver';
export { createMediaSaver } from './core/save/saver';
export { mediaDownloadFileName } from './core/save/fileName';

// ─── §5.4-⑥-b app-owned local file → device library ───────────────────────
export type {
  LocalMediaSaveFailureCode,
  LocalMediaSaveFileAdapter,
  LocalMediaSaveItemResult,
  LocalMediaSaveResult,
  LocalMediaSaver,
  LocalSaveableMedia,
} from './core/save/localSaver';
export { createLocalMediaSaver } from './core/save/localSaver';

// ─── §5.3 · §7 하드닝 3·4 순수 정규화 ───────────────────────────────────────
export type { UploadSizeSource } from './core/upload/resolveSize';
export { resolveUploadSize } from './core/upload/resolveSize';
export { normalizeDurationMs } from './core/upload/duration';
