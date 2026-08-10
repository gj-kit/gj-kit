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
import { MediaError } from '../errors';
import { sha256Hex } from '../hashFile';
import type { MediaContentType } from '../mediaTypes';
import { inferMediaContentType, mediaFileName, mediaKindOf } from '../mediaTypes';
import { mediaMetadataFromJpeg } from '../metadata';
import { enMediaStrings } from '../strings';
import { noopMediaTelemetry } from '../telemetry';
import type { MediaMetadata, UploadedPoster, UploadResult } from '../types';
import { uploadDroppedFiles } from './webBatch';
import type { MediaUploadConfig } from './uploader';
import {
  DEFAULT_FILE_NAME_PREFIX,
  DEFAULT_POSTER_AT_MS,
  POSTER_CONTENT_TYPE,
  assertUploadSize,
  isSuccessStatus,
  normalizeCollectionId,
  posterFileName,
  sizeBucket,
} from './uploader';

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
    const activity = telemetry.begin('media.upload.poster.web', {
      sizeBucket: sizeBucket(sizeBytes),
    });
    try {
      const intent = await api.createUploadIntent({
        fileName: posterFileName(input.fileName),
        contentType: POSTER_CONTENT_TYPE,
        sizeBytes,
      });
      const result = await transport.putBinary({
        url: intent.uploadUrl,
        method: intent.method,
        headers: intent.headers,
        body: input.source,
      });
      if (!isSuccessStatus(result.status)) {
        throw new MediaError('poster-upload-failed', strings.posterUploadFailed);
      }
      activity.succeed();
      return { objectName: intent.objectName, sizeBytes };
    } catch (error) {
      activity.fail(error);
      throw error;
    }
  }

  /**
   * 3상태 해석 + 실패 삼킴. **포스터 실패가 동영상 업로드를 막지 않는다**(§7.1) —
   * 전신 uploader.ts:565-575의 `try { … } catch { poster = null }` 그대로다.
   */
  async function resolvePoster(input: {
    readonly source: BinarySource;
    readonly fileName: string;
    readonly requested: BinarySource | null | undefined;
  }): Promise<UploadedPoster | null> {
    try {
      const adapter = config.poster;
      const frame =
        input.requested === undefined
          ? adapter
            ? await adapter.posterFromBinary({ source: input.source, atMs: posterAtMs })
            : null
          : input.requested;
      return frame ? await uploadPosterBinary({ source: frame, fileName: input.fileName }) : null;
    } catch (error) {
      debug.error('binary.poster.failed', error, { fileName: input.fileName });
      return null;
    }
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
    const intent = await api.createUploadIntent({
      fileName: input.fileName,
      contentType: input.contentType,
      sizeBytes: input.sizeBytes,
    });
    const result = await transport.putBinary({
      url: intent.uploadUrl,
      method: intent.method,
      headers: intent.headers,
      body: input.source,
    });
    if (!isSuccessStatus(result.status)) {
      // 전신은 웹 경로에서만 종류별 문구를 갈랐다(uploader.ts:518 사진 / 590 동영상).
      throw new MediaError(
        'upload-failed',
        input.kind === 'video' ? strings.videoUploadFailed : strings.imageUploadFailed,
      );
    }
    return api.completeUpload({
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
    });
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
    const photo = await mediaMetadataFromJpeg(input.source, {
      fallbackExif: input.fallbackExif,
      contentType: input.contentType,
    });
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
      // 전신은 이미지 경로가 `inferContentType`(이미지 전용), 동영상 경로가 `inferMediaContentType`
      // 이었다. 후자는 미디어를 못 찾으면 전자로 폴백하므로(mediaTypes.ts:120-123) 한 번의 호출이
      // 두 경로를 모두 재현한다.
      const contentType = inferMediaContentType(input.source.type, input.source.name);
      const kind = mediaKindOf(contentType);
      const fileName = mediaFileName({
        fileName: input.source.name,
        contentType,
        prefix: fileNamePrefix,
      });
      const collectionId = normalizeCollectionId({
        collectionId: input.collectionId,
        kind,
        strings,
      });
      return telemetry.track(
        kind === 'video' ? 'media.upload.web-video' : 'media.upload.web-image',
        { contentType, sizeBucket: sizeBucket(input.source.size) },
        () =>
          kind === 'video'
            ? uploadVideo({
                source: input.source,
                fileName,
                contentType,
                collectionId,
                requestedPoster: input.poster,
                durationMs: input.durationMs,
                width: input.dimensions?.width,
                height: input.dimensions?.height,
              })
            : uploadImage({
                source: input.source,
                fileName,
                contentType,
                collectionId,
                fallbackExif: input.fallbackExif,
              }),
      );
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
