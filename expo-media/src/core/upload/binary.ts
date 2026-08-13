// 설계 문서 §5.4-② — 바이너리(웹 Blob) 업로드 팩토리(`createBinaryUploads`).
//
// 전신 `uploadImageBlob`(uploader.ts:472-531) + `uploadVideoBlob`(533-611) +
// `uploadWebMediaFiles`(613-672)를 하나의 팩토리로 통합한 것이다(§5.7.2-⑫).
// 통합의 근거: 세 함수가 하는 일은 "presign → PUT → complete"로 동일했고, 갈라지던 지점은
// **contentType의 kind** 하나뿐이었다. kind는 런타임에 알 수 있으므로 진입점을 나눌 이유가 없다.
//
// `Blob` 대신 `BinarySource`(§3.3)를 받는 것이 유일한 구조적 차이다 — 그 덕분에
// 이 파일이 `src/core/**`(DOM lib 0)에 살 수 있고, vitest가 plain object로 전 경로를 돈다(§10.1).

import type {
  BinaryPosterAdapter,
  BinarySource,
  BinaryTransport,
  HashAdapter,
  MediaKind,
  NamedBinarySource,
} from '../adapters';
import { createMediaDebugLogger } from '../debug';
import { MediaError, mediaErrorCode } from '../errors';
import { sha256Hex } from '../hashFile';
import type { MediaContentType } from '../mediaTypes';
import { inferMediaContentType, mediaFileName, mediaKindOf } from '../mediaTypes';
import { mediaMetadataFromJpeg } from '../metadata';
import { enMediaStrings } from '../strings';
import { beginMediaActivitySafely, noopMediaTelemetry, trackMediaSafely } from '../telemetry';
import type {
  MediaMetadata,
  MediaOrphanedUpload,
  MediaUploadIntent,
  UploadedPoster,
  UploadResult,
} from '../types';
import { uploadDroppedFiles } from './webBatch';
import type { MediaUploadConfig } from './uploader';
import {
  DEFAULT_FILE_NAME_PREFIX,
  DEFAULT_POSTER_AT_MS,
  POSTER_CONTENT_TYPE,
  assertUploadSize,
  isSuccessStatus,
  normalizeCollectionId,
  orphanedUpload,
  posterFileName,
  safeUploadFailure,
  sizeBucket,
} from './uploader';
import { parseMediaUploadIntent } from './intent';

/**
 * `BinarySource` objects often come from browser loaders and canvas/poster adapters. They are
 * runtime values, not trusted just because the public type says `Blob`-like: snapshot their
 * primitive header once and expose only a frozen forwarding reader to the rest of the pipeline.
 * This prevents a getter from returning a valid size/name during validation and throwing a raw
 * presigned URL on the next telemetry, hash, or PUT read.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  try {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  } catch {
    return false;
  }
}

function snapshotBinarySource(value: unknown): BinarySource | null {
  try {
    if (!isRecord(value)) return null;
    const source = value as Record<string, unknown>;
    const size = source['size'];
    const type = source['type'];
    const arrayBuffer = source['arrayBuffer'];
    if (
      typeof size !== 'number' ||
      !Number.isFinite(size) ||
      size < 0 ||
      (type !== undefined && typeof type !== 'string') ||
      typeof arrayBuffer !== 'function'
    ) {
      return null;
    }
    const readArrayBuffer = () =>
      (arrayBuffer as () => Promise<ArrayBuffer>).call(value);
    return Object.freeze({
      size,
      ...(type !== undefined ? { type } : {}),
      // Invocation failures remain inside the existing hash/metadata/transport guards. Binding
      // the method preserves native Blob's `this` while hiding every mutable header property.
      arrayBuffer: () => Promise.resolve().then(readArrayBuffer),
    });
  } catch {
    return null;
  }
}

function snapshotNamedBinarySource(value: unknown): NamedBinarySource | null {
  try {
    if (!isRecord(value)) return null;
    const source = value as Record<string, unknown>;
    const size = source['size'];
    const type = source['type'];
    const arrayBuffer = source['arrayBuffer'];
    const name = source['name'];
    if (
      typeof size !== 'number' ||
      !Number.isFinite(size) ||
      size < 0 ||
      (type !== undefined && typeof type !== 'string') ||
      typeof arrayBuffer !== 'function' ||
      typeof name !== 'string'
    ) {
      return null;
    }
    const readArrayBuffer = () =>
      (arrayBuffer as () => Promise<ArrayBuffer>).call(value);
    return Object.freeze({
      size,
      name,
      ...(type !== undefined ? { type } : {}),
      arrayBuffer: () => Promise.resolve().then(readArrayBuffer),
    });
  } catch {
    return null;
  }
}

type BinaryUploadInputSnapshot<TCollectionId extends string> = {
  readonly source: NamedBinarySource;
  readonly collectionId: TCollectionId | null | undefined;
  readonly fallbackExif: Readonly<Record<string, unknown>> | undefined;
  readonly poster: BinarySource | null | undefined;
  readonly durationMs: number | null | undefined;
  readonly dimensions:
    | { readonly width?: number | null | undefined; readonly height?: number | null | undefined }
    | undefined;
};

/**
 * Snapshot the public input before telemetry sees it. Loader-created values and direct JS callers
 * may use getters/Proxies; an invalid shape is handled by the caller as one safe upload failure.
 */
function snapshotBinaryUploadInput<TCollectionId extends string>(
  value: unknown,
): BinaryUploadInputSnapshot<TCollectionId> | null {
  try {
    if (!isRecord(value)) return null;
    const input = value as Record<string, unknown>;
    const rawSource = input['source'];
    const collectionId = input['collectionId'];
    const fallbackExif = input['fallbackExif'];
    const rawPoster = input['poster'];
    const durationMs = input['durationMs'];
    const rawDimensions = input['dimensions'];
    const source = snapshotNamedBinarySource(rawSource);
    const poster =
      rawPoster === undefined || rawPoster === null ? rawPoster : snapshotBinarySource(rawPoster);
    if (
      !source ||
      (rawPoster !== undefined && rawPoster !== null && !poster) ||
      (collectionId !== undefined && collectionId !== null && typeof collectionId !== 'string') ||
      (fallbackExif !== undefined &&
        fallbackExif !== null &&
        (!isRecord(fallbackExif) || Array.isArray(fallbackExif))) ||
      (durationMs !== undefined &&
        durationMs !== null &&
        (typeof durationMs !== 'number' || !Number.isFinite(durationMs)))
    ) {
      return null;
    }

    let dimensions:
      | { readonly width?: number | null | undefined; readonly height?: number | null | undefined }
      | undefined;
    if (rawDimensions !== undefined && rawDimensions !== null) {
      if (!isRecord(rawDimensions)) return null;
      const dimensionsRecord = rawDimensions as Record<string, unknown>;
      const width = dimensionsRecord['width'];
      const height = dimensionsRecord['height'];
      if (
        (width !== undefined && width !== null &&
          (typeof width !== 'number' || !Number.isFinite(width))) ||
        (height !== undefined && height !== null &&
          (typeof height !== 'number' || !Number.isFinite(height)))
      ) {
        return null;
      }
      dimensions = Object.freeze({
        ...(width !== undefined ? { width } : {}),
        ...(height !== undefined ? { height } : {}),
      });
    }

    return Object.freeze({
      source,
      collectionId: collectionId as TCollectionId | null | undefined,
      ...(fallbackExif !== undefined && fallbackExif !== null
        ? { fallbackExif: fallbackExif as Readonly<Record<string, unknown>> }
        : { fallbackExif: undefined }),
      poster,
      durationMs: durationMs as number | null | undefined,
      dimensions,
    });
  } catch {
    return null;
  }
}

export interface BinaryUploads<TAsset, TCollectionId extends string = string> {
  uploadBinary(input: {
    readonly source: NamedBinarySource;
    readonly collectionId?: TCollectionId | null | undefined;
    /**
     * JPEG APP1 파싱이 실패했을 때 **필드 단위로** 병합될 EXIF(§5.3 `mediaMetadataFromJpeg` 규칙 ②).
     * 웹 피커 경로가 `asset.exif`를 여기로 넘긴다(전신 uploader.ts:709 · §5.7.4).
     * 없으면 촬영 시각과 위치가 조용히 유실된다 — 이 인자가 복원된 이유다(G6).
     */
    readonly fallbackExif?: Readonly<Record<string, unknown>> | undefined;
    /**
     * 동영상 포스터. **3상태를 보존한다**(전신 `BlobVideoUploadInput.posterBlob`, uploader.ts:566-569):
     *   `undefined` = 어댑터로 자동 추출 / `null` = 포스터 없음(추출 시도 금지) / 값 = 주어진 포스터.
     * 이 3상태를 2상태로 접으면 "포스터를 일부러 안 만든다"를 표현할 방법이 사라진다.
     */
    readonly poster?: BinarySource | null | undefined;
    /**
     * 동영상 재생시간(**밀리초**). 이미지에는 무시된다.
     * ⚠ 초 단위를 넣지 마라 — 웹의 `HTMLVideoElement.duration`은 **초**다. 호출자가
     *   `normalizeDurationMs`(§7 하드닝 4)를 거쳐 넘겨야 한다. 20분 동영상이 1200ms로
     *   저장되면 어떤 duration 상한도 통과한다. `createPickerFlows`의 웹 경로는 이미 거친다.
     */
    readonly durationMs?: number | null | undefined;
    /**
     * 동영상 픽셀 치수. 이미지에는 무시된다(이미지 치수는 서버가 바이트에서 읽는다).
     * ⚠ `BinarySource`만으로는 DOM 없이 복원할 수 없으므로 **호출자가 주지 않으면 영구 유실**이다 —
     *   전신 `BlobVideoUploadInput.width/height`(uploader.ts:86-87)가 완료 페이로드로 가던 값이다.
     */
    readonly dimensions?:
      | { readonly width?: number | null | undefined; readonly height?: number | null | undefined }
      | undefined;
  }): Promise<UploadResult<TAsset>>;
  /**
   * 웹 드롭 다건.
   * ⚠ 첫 presign **이전에** 배치 전체를 검증한다 — 혼합 드롭 부분 업로드 방지(§7 하드닝 10).
   * ⚠ 검증은 `maxFiles` slice **이후**에 수행한다(전신 uploader.ts:623→630 순서 보존).
   * 규칙의 거처는 `webBatch.ts`다.
   */
  uploadDropped(
    files: readonly NamedBinarySource[],
    options?:
      | {
          readonly collectionId?: TCollectionId | null | undefined;
          readonly maxFiles?: number | undefined;
        }
      | undefined,
  ): Promise<readonly UploadResult<TAsset>[]>;
}

export function createBinaryUploads<TAsset, TCollectionId extends string = string>(
  config: MediaUploadConfig<TAsset, TCollectionId> & {
    readonly transport: BinaryTransport;
    /** 생략 = core 내장 순수 TS SHA-256(§9). `FileSystemAdapter`가 없으므로 바이너리 경로만 쓴다. */
    readonly hasher?: HashAdapter | undefined;
    /** 생략 = 자동 포스터 추출 없음. 호출자가 `poster` 값을 직접 줄 수는 있다. */
    readonly poster?: BinaryPosterAdapter | undefined;
    readonly posterAtMs?: number | undefined;
  },
): BinaryUploads<TAsset, TCollectionId> {
  const { api, transport, platform } = config;
  const strings = config.strings ?? enMediaStrings;
  const telemetry = config.telemetry ?? noopMediaTelemetry;
  const fileNamePrefix = config.fileNamePrefix ?? DEFAULT_FILE_NAME_PREFIX;
  const posterAtMs = config.posterAtMs ?? DEFAULT_POSTER_AT_MS;
  const debug = createMediaDebugLogger({ platform, options: config.debug });

  /**
   * 기본 해시 — 전신 `hashBlob`(uploader.ts:158-161)과 같은 형태이며 `js-sha256` 대신
   * core 내장 순수 TS SHA-256을 쓴다(§9, 런타임 의존성 0).
   * ⚠ 여기서는 파일 스트리밍이 아니라 통째로 읽는다. 웹 Blob은 이미 메모리에 있기 때문이다.
   */
  async function defaultHashBinary(source: BinarySource): Promise<string> {
    return sha256Hex(new Uint8Array(await source.arrayBuffer()));
  }

  /**
   * dedup은 최적화일 뿐이므로 해시 실패가 업로드를 막지 않는다(§7.1).
   * ⚠ 전신 웹 경로(uploader.ts:504, 563)는 이 보호가 **없어** `hashBlob`의 예외가 곧 업로드 실패였다.
   *    네이티브 경로에만 있던 `hashLocalFileSafely`의 정책을 양쪽에 통일한다.
   */
  async function hashSafely(source: BinarySource, fileName: string): Promise<string | null> {
    try {
      const hasher = config.hasher;
      return hasher ? await hasher.hashBinary(source) : await defaultHashBinary(source);
    } catch (error) {
      debug.error('binary.hash.failed', error, { fileName });
      return null;
    }
  }

  /** 전신 `uploadPosterBlob`(uploader.ts:214-245). 빈 포스터는 스팬을 열기 전에 조용히 `null`이다. */
  async function uploadPosterBinary(input: {
    readonly source: BinarySource;
    readonly fileName: string;
  }): Promise<UploadedPoster | null> {
    const sizeBytes = input.source.size;
    if (!sizeBytes) return null;
    const activity = beginMediaActivitySafely({
      telemetry,
      operation: 'media.upload.poster.web',
      extra: { sizeBucket: sizeBucket(sizeBytes) },
      onTelemetryFailure: (error) =>
        debug.error('binary.poster.telemetry.failed', error, { fileName: input.fileName }),
    });

    try {
      // 동영상 본체가 cap 안이어도 canvas/외부 adapter가 만든 poster는 별도의 큰 바이너리일 수
      // 있다. 이 cap을 건너뛰면 poster가 이미지 정책의 우회 통로가 된다.
      assertUploadSize({
        limits: config.limits,
        strings,
        contentType: POSTER_CONTENT_TYPE,
        sizeBytes,
      });
    } catch (error) {
      // Cap rejection happens before presign, so no object can exist. Poster remains optional here.
      if (mediaErrorCode(error) === 'file-too-large') {
        activity.cancel({ extra: { reason: 'poster-too-large' } });
        return null;
      }
      debug.error('binary.poster.validation.failed', error, { fileName: input.fileName });
      activity.fail(new MediaError('poster-upload-failed', strings.posterUploadFailed));
      return null;
    }

    const failRequiredPosterUpload = (failure: {
      readonly stage: 'intent' | 'put';
      readonly error?: unknown;
      readonly orphanedObjects: readonly MediaOrphanedUpload[];
    }): never => {
      // Continuing after presign/PUT can silently lose a possibly-stored poster. Surface only the
      // URL-free cleanup candidate; raw backend/transport errors remain debug-only and sanitized.
      if (failure.error !== undefined) {
        debug.error('binary.poster.upload.failed', failure.error, { fileName: input.fileName });
      }
      const safe = safeUploadFailure({
        message: strings.posterUploadFailed,
        stage: failure.stage,
        orphanedObjects: failure.orphanedObjects,
      });
      activity.fail(safe);
      throw safe;
    };

    let response: unknown;
    try {
      response = await api.createUploadIntent({
        fileName: posterFileName(input.fileName),
        contentType: POSTER_CONTENT_TYPE,
        sizeBytes,
      });
    } catch (error) {
      return failRequiredPosterUpload({ stage: 'intent', error, orphanedObjects: [] });
    }
    let intent: MediaUploadIntent | null;
    try {
      intent = parseMediaUploadIntent(response);
    } catch (error) {
      return failRequiredPosterUpload({ stage: 'intent', error, orphanedObjects: [] });
    }
    if (!intent) return failRequiredPosterUpload({ stage: 'intent', orphanedObjects: [] });

    const possiblyUploaded = orphanedUpload({
      intent,
      contentType: POSTER_CONTENT_TYPE,
      sizeBytes,
      storageState: 'possibly-uploaded',
    });
    let status: unknown;
    try {
      const result = await transport.putBinary({
        url: intent.uploadUrl,
        method: intent.method,
        headers: intent.headers,
        body: input.source,
      });
      status = (result as { readonly status?: unknown } | null)?.status;
    } catch (error) {
      return failRequiredPosterUpload({
        stage: 'put',
        error,
        orphanedObjects: [possiblyUploaded],
      });
    }
    if (typeof status !== 'number' || !isSuccessStatus(status)) {
      return failRequiredPosterUpload({ stage: 'put', orphanedObjects: [possiblyUploaded] });
    }
    activity.succeed();
    return { objectName: intent.objectName, sizeBytes };
  }

  /**
   * 3상태 해석. 추출 실패·빈 프레임·local cap은 optional로 삼키되, poster presign/PUT은
   * possibly-uploaded object를 남길 수 있으므로 safe failureInfo와 함께 호출자에게 전파한다.
   */
  async function resolvePoster(input: {
    readonly source: BinarySource;
    readonly fileName: string;
    readonly requested: BinarySource | null | undefined;
  }): Promise<UploadedPoster | null> {
    if (input.requested !== undefined) {
      return input.requested
        ? uploadPosterBinary({ source: input.requested, fileName: input.fileName })
        : null;
    }
    const adapter = config.poster;
    if (!adapter) return null;
    let frame: BinarySource | null;
    try {
      const adapterFrame = await adapter.posterFromBinary({ source: input.source, atMs: posterAtMs });
      if (!adapterFrame) return null;
      // A poster adapter result can be a Proxy too. Snapshot its header while the extraction seam
      // is guarded so `uploadPosterBinary` never reads a hostile `size` getter after this catch.
      frame = snapshotBinarySource(adapterFrame);
      if (!frame) return null;
    } catch (error) {
      // Extraction itself has no storage side effect, so the video can proceed without a poster.
      debug.error('binary.poster.failed', error, { fileName: input.fileName });
      return null;
    }
    return uploadPosterBinary({ source: frame, fileName: input.fileName });
  }

  async function putAndComplete(input: {
    readonly source: BinarySource;
    readonly fileName: string;
    readonly contentType: MediaContentType;
    readonly sizeBytes: number;
    readonly contentHash: string | null;
    readonly collectionId: TCollectionId | undefined;
    readonly photo: MediaMetadata | undefined;
    readonly poster: UploadedPoster | null;
    readonly kind: MediaKind;
    /** 동영상 전용. 전신 uploader.ts:600-602의 truthy 스프레드를 그대로 재현한다. */
    readonly durationMs: number | null | undefined;
    readonly width: number | null | undefined;
    readonly height: number | null | undefined;
  }): Promise<UploadResult<TAsset>> {
    const message = input.kind === 'video' ? strings.videoUploadFailed : strings.imageUploadFailed;
    // `resolvePoster`가 본체보다 먼저 성공한 경우, 이후 API/PUT/등록 실패는 poster를
    // attachment로 돌려주지 못한다. 실패 검사 API가 이 URL 없는 후보를 앱 cleanup에 준다.
    const orphanedObjects: MediaOrphanedUpload[] = input.poster
      ? [
          {
            objectName: input.poster.objectName,
            contentType: POSTER_CONTENT_TYPE,
            sizeBytes: input.poster.sizeBytes,
            storageState: 'uploaded',
          },
        ]
      : [];

    let response: unknown;
    try {
      response = await api.createUploadIntent({
        fileName: input.fileName,
        contentType: input.contentType,
        sizeBytes: input.sizeBytes,
      });
    } catch (error) {
      debug.error('binary.intent.failed', error, {
        fileName: input.fileName,
        contentType: input.contentType,
        sizeBytes: input.sizeBytes,
      });
      throw safeUploadFailure({ message, stage: 'intent', orphanedObjects });
    }
    let intent: MediaUploadIntent | null;
    try {
      intent = parseMediaUploadIntent(response);
    } catch (error) {
      debug.error('binary.intent.failed', error, {
        fileName: input.fileName,
        contentType: input.contentType,
        sizeBytes: input.sizeBytes,
      });
      throw safeUploadFailure({ message, stage: 'intent', orphanedObjects });
    }
    if (!intent) {
      // Malformed response may itself contain a signed URL; do not log or echo it.
      throw safeUploadFailure({ message, stage: 'intent', orphanedObjects });
    }

    const possiblyUploaded = orphanedUpload({
      intent,
      contentType: input.contentType,
      sizeBytes: input.sizeBytes,
      storageState: 'possibly-uploaded',
    });
    let status: unknown;
    try {
      const result = await transport.putBinary({
        url: intent.uploadUrl,
        method: intent.method,
        headers: intent.headers,
        body: input.source,
      });
      status = (result as { readonly status?: unknown } | null)?.status;
    } catch (error) {
      debug.error('binary.put.failed', error, {
        fileName: input.fileName,
        contentType: input.contentType,
        sizeBytes: input.sizeBytes,
      });
      throw safeUploadFailure({
        message,
        stage: 'put',
        orphanedObjects: [...orphanedObjects, possiblyUploaded],
      });
    }
    if (typeof status !== 'number' || !isSuccessStatus(status)) {
      // HTTP 실패도 object 저장 여부를 절대라고 가정하지 않는다. cleanup API가 idempotent하게
      // `possibly-uploaded` 후보를 처리해야 응답 유실/프록시 실패에도 orphan이 남지 않는다.
      throw safeUploadFailure({
        message,
        stage: 'put',
        orphanedObjects: [...orphanedObjects, possiblyUploaded],
      });
    }
    orphanedObjects.push({ ...possiblyUploaded, storageState: 'uploaded' });

    const completion = {
      fileName: input.fileName,
      contentType: input.contentType,
      sizeBytes: input.sizeBytes,
      objectName: intent.objectName,
      ...(input.contentHash ? { contentHash: input.contentHash } : {}),
      ...(input.collectionId ? { collectionId: input.collectionId } : {}),
      ...(input.photo ? { photo: input.photo } : {}),
      // 전신 uploader.ts:600-602와 동일한 truthy 스프레드 — 0/null/undefined는 전부 탈락한다.
      ...(input.durationMs ? { durationMs: input.durationMs } : {}),
      ...(input.width ? { width: input.width } : {}),
      ...(input.height ? { height: input.height } : {}),
      ...(input.poster ? { poster: input.poster } : {}),
    };
    try {
      return await api.completeUpload(completion);
    } catch (error) {
      debug.error('binary.complete.failed', error, {
        fileName: input.fileName,
        contentType: input.contentType,
        sizeBytes: input.sizeBytes,
      });
      throw safeUploadFailure({ message, stage: 'complete', orphanedObjects });
    }
  }

  async function uploadImage(input: {
    readonly source: NamedBinarySource;
    readonly fileName: string;
    readonly contentType: MediaContentType;
    readonly collectionId: TCollectionId | undefined;
    readonly fallbackExif: Readonly<Record<string, unknown>> | undefined;
  }): Promise<UploadResult<TAsset>> {
    const sizeBytes = input.source.size;
    if (!sizeBytes) throw new MediaError('upload-failed', strings.imageSizeUnknown);
    assertUploadSize({
      limits: config.limits,
      strings,
      contentType: input.contentType,
      sizeBytes,
    });
    // ⚠ 인자 2개(`fallbackExif`·`contentType`)가 계약이다(§5.3 4규칙) —
    //   비-JPEG는 파싱하지 않고 fallback을 그대로 쓰고, 병합은 **필드 단위**다.
    let photo: MediaMetadata | undefined;
    try {
      photo = await mediaMetadataFromJpeg(input.source, {
        fallbackExif: input.fallbackExif,
        contentType: input.contentType,
      });
    } catch (error) {
      // BinarySource 구현이 URI/서명 URL을 포함한 예외를 던질 수 있어, telemetry.track 밖으로
      // raw error를 내보내지 않는다. 해시와 달리 메타 파서는 조용히 생략하면 EXIF 유실을 숨긴다.
      debug.error('binary.metadata.failed', error, { fileName: input.fileName });
      throw new MediaError('upload-failed', strings.imageUploadFailed);
    }
    const contentHash = await hashSafely(input.source, input.fileName);
    return putAndComplete({
      source: input.source,
      fileName: input.fileName,
      contentType: input.contentType,
      sizeBytes,
      contentHash,
      collectionId: input.collectionId,
      photo,
      poster: null,
      kind: 'image',
      // 전신 `uploadImageBlobInternal`(uploader.ts:521-529)도 이 3값을 보내지 않았다 —
      // 이미지 치수는 서버가 바이트에서 읽는다.
      durationMs: undefined,
      width: undefined,
      height: undefined,
    });
  }

  async function uploadVideo(input: {
    readonly source: NamedBinarySource;
    readonly fileName: string;
    readonly contentType: MediaContentType;
    readonly collectionId: TCollectionId | undefined;
    readonly requestedPoster: BinarySource | null | undefined;
    readonly durationMs: number | null | undefined;
    readonly width: number | null | undefined;
    readonly height: number | null | undefined;
  }): Promise<UploadResult<TAsset>> {
    const sizeBytes = input.source.size;
    if (!sizeBytes) throw new MediaError('upload-failed', strings.videoSizeUnknown);
    assertUploadSize({
      limits: config.limits,
      strings,
      contentType: input.contentType,
      sizeBytes,
    });
    const contentHash = await hashSafely(input.source, input.fileName);
    const poster = await resolvePoster({
      source: input.source,
      fileName: input.fileName,
      requested: input.requestedPoster,
    });
    return putAndComplete({
      source: input.source,
      fileName: input.fileName,
      contentType: input.contentType,
      sizeBytes,
      contentHash,
      collectionId: input.collectionId,
      photo: undefined,
      poster,
      kind: 'video',
      durationMs: input.durationMs,
      width: input.width,
      height: input.height,
    });
  }

  const uploads: BinaryUploads<TAsset, TCollectionId> = {
    async uploadBinary(input) {
      const snapshot = snapshotBinaryUploadInput<TCollectionId>(input);
      if (!snapshot) {
        // A source/header getter may have thrown an adapter-provided URL. Do not hand it to
        // telemetry or the caller; this is the same retryable safe failure as malformed upload
        // input from a host integration.
        throw new MediaError('upload-failed', strings.imageUploadFailed);
      }
      const { source, collectionId: rawCollectionId, fallbackExif, poster, durationMs, dimensions } = snapshot;
      // 전신은 이미지 경로가 `inferContentType`(이미지 전용), 동영상 경로가 `inferMediaContentType`
      // 이었다. 후자는 미디어를 못 찾으면 전자로 폴백하므로(mediaTypes.ts:120-123) 한 번의 호출이
      // 두 경로를 모두 재현한다.
      const contentType = inferMediaContentType(source.type, source.name);
      const kind = mediaKindOf(contentType);
      const fileName = mediaFileName({
        fileName: source.name,
        contentType,
        prefix: fileNamePrefix,
      });
      const collectionId = normalizeCollectionId({
        collectionId: rawCollectionId,
        kind,
        strings,
      });
      return trackMediaSafely({
        telemetry,
        operation: kind === 'video' ? 'media.upload.web-video' : 'media.upload.web-image',
        extra: { contentType, sizeBucket: sizeBucket(source.size) },
        onTelemetryFailure: (error) =>
          debug.error('binary.telemetry.track.failed', error, {
            fileName,
            contentType,
            sizeBytes: source.size,
          }),
        run: () =>
          kind === 'video'
            ? uploadVideo({
                source,
                fileName,
                contentType,
                collectionId,
                requestedPoster: poster,
                durationMs,
                width: dimensions?.width,
                height: dimensions?.height,
              })
            : uploadImage({
                source,
                fileName,
                contentType,
                collectionId,
                fallbackExif,
              }),
      });
    },

    uploadDropped(files, options) {
      return uploadDroppedFiles<TAsset, TCollectionId>({
        files,
        options,
        strings,
        uploadBinary: (item) => uploads.uploadBinary(item),
      });
    },
  };

  return uploads;
}
