// 설계 문서 §5.4-① — 로컬 파일 업로드 팩토리(`createLocalUploads`).
//
// 전신 `packages/photo-kit/src/uploader.ts`의 파일 주석이 이 모듈의 존재 이유다:
//   "The upload core: presign -> PUT -> register, for every source a mobile app meets
//    (picker assets, camera captures, web File/Blob drops, raw local file URIs from a
//    sync engine, in-app device-library assets). Everything backend-specific arrives
//    through PhotoUploaderConfig.api; everything else here is the accumulated handling
//    for the hard parts — iOS PhotoKit hand-offs, re-encoded picker sizes, EXIF
//    extraction, content hashing for dedup, video posters, staging-copy cleanup."
//
// 새 설계에서 달라진 것은 **경계뿐**이다: 전송(`LocalFileTransport`)·파일 I/O(`FileSystemAdapter`)·
// 해시(`HashAdapter`)·포스터(`LocalPosterAdapter`)·플랫폼(`PlatformAdapter`)이 주입으로 빠지고
// 정책은 전부 여기 남는다. 그래서 이 파일은 `src/core/**` 순수 규율을 지킨다 —
// react-native·expo import 0, DOM 전역 0, 런타임 의존성 0(§1-1, §2.4).

import type {
  FileSystemAdapter,
  HashAdapter,
  LocalFileTransport,
  LocalPosterAdapter,
  MediaKind,
  PickedAsset,
  PlatformAdapter,
} from '../adapters';
import { createMediaDebugLogger, summarizeUri } from '../debug';
import { attachMediaUploadFailureInfo, MediaError, mediaErrorCode } from '../errors';
import { createFileHasher } from '../hashFile';
import type { MediaContentType } from '../mediaTypes';
import { inferMediaContentType, mediaFileName, mediaKindOf } from '../mediaTypes';
import { mediaMetadataFromExif } from '../metadata';
import type { StagingCache } from '../staging';
import type { MediaStrings } from '../strings';
import { enMediaStrings } from '../strings';
import type { MediaTelemetry } from '../telemetry';
import { beginMediaActivitySafely, noopMediaTelemetry, trackMediaSafely } from '../telemetry';
import type {
  MediaDebugOptions,
  MediaMetadata,
  MediaUploadCompletion,
  MediaUploadApi,
  MediaUploadFailureStage,
  MediaUploadIntentApi,
  MediaUploadIntent,
  MediaUploadLimits,
  MediaOrphanedUpload,
  UploadedPoster,
  UploadResult,
} from '../types';
import { normalizeDurationMs } from './duration';
import { parseMediaUploadIntent } from './intent';
import { resolveUploadSize } from './resolveSize';

// ── 공통 설정 (§5.4 공통 설정) ──────────────────────────────────────────────
/**
 * 업로드 팩토리 2종(`createLocalUploads`·`createBinaryUploads`)이 공유하는 설정.
 * 전신 `PhotoUploaderConfig`의 분해 결과다(§5.7.2-①).
 */
type MediaUploadBaseConfig<TCollectionId extends string = string> = {
  /**
   * ⚠ 생략 불가(§6.1-③). 무제한 업로드는 **명시된 결정**이어야 한다 —
   * 누락하면 2GB를 전부 PUT한 뒤 서버가 413을 준다(사용자 시간과 셀룰러 데이터를 통째로 버린다).
   * 서버만 검증하는 정책도 정당하므로 `'server-enforced'`로 그 결정을 표현한다
   * (`Number.POSITIVE_INFINITY`는 JSON 직렬화 불가라 기각 — §0.4 기각 8).
   */
  readonly limits: MediaUploadLimits | 'server-enforced';
  readonly platform: PlatformAdapter;
  readonly strings?: MediaStrings | undefined;
  readonly telemetry?: MediaTelemetry | undefined;
  readonly fileNamePrefix?: string | undefined;
  readonly debug?: MediaDebugOptions | undefined;
};

export type MediaUploadConfig<TAsset, TCollectionId extends string = string> =
  MediaUploadBaseConfig<TCollectionId> & {
    readonly api: MediaUploadApi<TAsset, TCollectionId>;
  };

// ── ① 로컬 파일 업로드 ──────────────────────────────────────────────────────
export type LocalUploadInput<TCollectionId extends string = string> = {
  readonly uri: string;
  readonly fileName?: string | undefined;
  readonly contentType?: MediaContentType | undefined;
  readonly sizeBytes?: number | undefined;
  /**
   * ⚠ **주어지면 hasher를 호출하지 않는다**(§7.1 신설 행). 전신 `uploadLocalUriToIntent`는 해시를
   * 계산하지 않고 호출자 값을 그대로 전달했다(uploader.ts:57-69의 필드 정의, 440의 전달).
   * 동기화 큐가 재시도 간 해시를 캐시하기 때문이다:
   *   `src/sync/uploadAsset.ts:45-46` — "Reuse the cached hash across retries; only compute
   *   on first attempt" / `item.contentHash ?? (await hash(source.uri))`.
   * 이 필드가 없으면 재시도마다 15MB 파일을 다시 해시한다(순수 TS SHA-256 위에서는 §12-3의
   * Hermes 성능 리스크와 곱해진다).
   *
   * ⚠ 바로 아래 `hashSafely`의 "해시 실패는 업로드를 막지 않는다"와 **나란히** 읽어야 한다 —
   *    한쪽만 보면 정반대 구현이 나온다(§7.1의 경고 그대로).
   */
  readonly contentHash?: string | undefined;
  readonly collectionId?: TCollectionId | null | undefined;
  readonly photo?: MediaMetadata | undefined;
  readonly durationMs?: number | undefined;
  readonly width?: number | undefined;
  readonly height?: number | undefined;
};

export interface LocalUploads<TAsset, TCollectionId extends string = string> {
  uploadLocalFile(input: LocalUploadInput<TCollectionId>): Promise<UploadResult<TAsset>>;
  /**
   * 피커 자산 1건 — `PickerFlows`·`DeviceUploads`가 위임한다.
   * ⚠ **네이티브 전용이다.** `platform.os === 'web'`이면 `MediaError('platform-unsupported')`
   * — 로컬 파일 스트리밍은 웹에 존재하지 않는다. 웹 피커 자산의 정본 경로는 §5.7.4다.
   */
  uploadPickedAsset(
    asset: PickedAsset,
    options?: { readonly collectionId?: TCollectionId | null | undefined } | undefined,
  ): Promise<UploadResult<TAsset>>;
}

/**
 * PUT에 성공한 뒤, 나중의 앱 트랜잭션에 연결할 수 있도록 돌려주는 오브젝트 메타데이터.
 * `MediaUploadCompletion`과 같은 형태를 써서 앱이 별도 변환 없이 자기 API에 전달할 수 있다.
 */
export type DeferredLocalUpload<TCollectionId extends string = string> =
  MediaUploadCompletion<TCollectionId>;

/** `createDeferredLocalUploads`의 최소 능력. 피커 흐름이나 앱 자산 등록은 의도적으로 포함하지 않는다. */
export interface DeferredLocalUploads<TCollectionId extends string = string> {
  uploadLocalFile(input: LocalUploadInput<TCollectionId>): Promise<DeferredLocalUpload<TCollectionId>>;
}

// ── 업로드 팩토리 공용 상수·헬퍼 ────────────────────────────────────────────
// 이 블록은 `binary.ts`·`webBatch.ts`와 공유한다. 공개 표면은 `POSTER_CONTENT_TYPE` 하나뿐이며
// 나머지는 `@internal`이다(배럴이 재export하지 않는다).

/**
 * 포스터 contentType. 전신 `videoPoster.ts:4` `VIDEO_POSTER_CONTENT_TYPE`의 공개 계승(§5.4.1-7).
 * presign 요청의 contentType과 서버 검증이 맞물리므로 **소비자가 읽을 수 있어야 한다**.
 */
export const POSTER_CONTENT_TYPE: 'image/jpeg' = 'image/jpeg';

/** @internal 전신 `fileNamePrefix ?? "photo"`에서 변경 — 라이브러리명과의 일관성(§5.4.1-13). */
export const DEFAULT_FILE_NAME_PREFIX = 'media';

/** @internal 전신 `videoPoster.ts:5` `VIDEO_POSTER_TIME_MS`(§5.4.1-4). */
export const DEFAULT_POSTER_AT_MS = 1000;

/** @internal 웹 드롭 상한. 전신 `uploader.ts:617`(§5.4.1-2). */
export const DEFAULT_MAX_DROPPED_FILES = 12;

/** @internal 피커 선택 상한. 전신 `uploader.ts:931,951,966` 3사이트(§5.4.1-1). */
export const DEFAULT_PICK_MAX = 12;

/**
 * @internal
 * ⚠ **버킷 경계도 계약이다**(§7.2). 바꾸면 과거 로그와 비교가 불가능해진다.
 * 전신 `uploader.ts:127-132` 그대로.
 */
export function sizeBucket(sizeBytes: number): string {
  if (sizeBytes < 1_000_000) return 'under-1mb';
  if (sizeBytes < 10_000_000) return '1-10mb';
  if (sizeBytes < 100_000_000) return '10-100mb';
  return 'over-100mb';
}

/**
 * @internal 전신 `videoPoster.ts:29-32` `posterFileName` 규칙 그대로(§5.4.1-8 — 공개 표면에서 내렸다).
 * 확장자를 떼고 `-poster.jpg`를 붙인다. 확장자만 있는 이름이면 `video`로 폴백한다.
 */
export function posterFileName(fileName: string): string {
  const base = fileName.replace(/\.[^.]+$/, '') || 'video';
  return `${base}-poster.jpg`;
}

/** @internal 전신 `result.status < 200 || result.status >= 300`(uploader.ts:294,422)의 양성 표현. */
export function isSuccessStatus(status: number): boolean {
  return status >= 200 && status < 300;
}

/**
 * @internal 백엔드 크기 정책의 클라이언트 미러. 전신 `assertUploadSize`(uploader.ts:199-212).
 * 바이트를 **하나도 보내기 전에** 같은 문구로 실패시켜, 사용자가 전체 PUT을 마친 뒤 413을 받는 일을 없앤다.
 */
export function assertUploadSize(input: {
  readonly limits: MediaUploadLimits | 'server-enforced';
  readonly strings: MediaStrings;
  readonly contentType: MediaContentType;
  readonly sizeBytes: number;
}): void {
  if (input.limits === 'server-enforced') return;
  const kind = mediaKindOf(input.contentType);
  const limit = kind === 'video' ? input.limits.video : input.limits.image;
  if (limit && input.sizeBytes > limit.maxBytes) {
    throw new MediaError(
      'file-too-large',
      limit.message ?? input.strings.fileTooLarge({ maxBytes: limit.maxBytes, kind }),
    );
  }
}

/**
 * @internal §6.1-⑪ — `collectionId`가 빈 문자열이면 런타임 차단한다.
 *
 * 전신은 `...(collectionId ? { collectionId } : {})`(uploader.ts:441)라 빈 문자열이 **falsy 스프레드로
 * 조용히 탈락**했고, 사용자는 앨범을 골랐는데 앨범 없이 저장되는 결과만 봤다. 값 자체는
 * 킷이 해석하지 않는 불투명 id이므로(§6.2 `CollectionId` 브랜드 기각) 검증은 이 한 가지뿐이다.
 *
 * ⚠ 이 에러 문구는 설계 문서의 `MediaStrings` 22키에 대응 키가 없어 업로드 실패 문구를 재사용한다
 *    (결과 보고의 deviations 참조 — `configInvalid` 키 신설이 필요하다).
 */
export function normalizeCollectionId<TCollectionId extends string>(input: {
  readonly collectionId: TCollectionId | null | undefined;
  readonly kind: MediaKind;
  readonly strings: MediaStrings;
}): TCollectionId | undefined {
  const { collectionId } = input;
  if (collectionId === null || collectionId === undefined) return undefined;
  if (collectionId === '') {
    throw new MediaError(
      'config-invalid',
      input.kind === 'video' ? input.strings.videoUploadFailed : input.strings.imageUploadFailed,
    );
  }
  return collectionId;
}

/** 치수는 양의 정수만 의미가 있다. 전신 `uploader.ts:749-756` 규칙 보존. */
function normalizeDimension(value: number | undefined): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.round(value)
    : undefined;
}

/**
 * URL·header·원본 네트워크 에러를 경계 밖으로 내보내지 않는 업로드 실패 생성기.
 *
 * `MediaError`의 message는 화면·텔레메트리에 갈 수 있으므로, backend/transport/finalizer가
 * 던진 원문을 cause나 detail에 보관하지 않는다. 원문은 호출 직전 `debug.error()`만 받아
 * `sanitizeMediaErrorMessage()`를 거친다. orphan 정보는 이미 검증된 `objectName`과 알려진
 * contentType/size만 보존하므로 cleanup에는 충분하지만 presigned credential을 재노출하지 않는다.
 */
/** @internal shared with binary.ts — public barrel은 이 helper를 내보내지 않는다. */
export function safeUploadFailure(input: {
  readonly message: string;
  readonly stage: MediaUploadFailureStage;
  readonly orphanedObjects: readonly MediaOrphanedUpload[];
}): MediaError {
  return attachMediaUploadFailureInfo(
    new MediaError('upload-failed', input.message),
    { stage: input.stage, orphanedObjects: input.orphanedObjects },
  );
}

/** @internal shared with binary.ts — URL 없는 cleanup 후보만 만든다. */
export function orphanedUpload(input: {
  readonly intent: MediaUploadIntent;
  readonly contentType: MediaContentType;
  readonly sizeBytes: number;
  readonly storageState: MediaOrphanedUpload['storageState'];
}): MediaOrphanedUpload {
  return {
    objectName: input.intent.objectName,
    contentType: input.contentType,
    sizeBytes: input.sizeBytes,
    storageState: input.storageState,
  };
}

// ── 팩토리 ──────────────────────────────────────────────────────────────────
type LocalStreamingUploadAdapters = {
  readonly files: FileSystemAdapter;
  readonly transport: LocalFileTransport;
  /** 생략 = core 내장 순수 TS 증분 SHA-256(§9). 네이티브 가속이 필요한 호스트만 교체한다. */
  readonly hasher?: HashAdapter | undefined;
  /** 생략 = 동영상 포스터 없음. 포스터 부재가 업로드를 막지 않는다(§6.2 마지막 행). */
  readonly poster?: LocalPosterAdapter | undefined;
  readonly posterAtMs?: number | undefined;
};

type LocalUploadAdapters = LocalStreamingUploadAdapters & {
  /** `DeviceUploads`/`MediaKit`이 공급한다. 있으면 업로드 후 스테이징 사본을 지운다(§7 하드닝 7). */
  readonly staging?: StagingCache | undefined;
};

/**
 * `completeUpload` 없이 presign → 네이티브 PUT까지만 수행하는 설정.
 *
 * 반환된 `DeferredLocalUpload`은 서버 등록 요청처럼 보이게 만든 가짜 값이 아니다. 호출자가
 * 자기 도메인 트랜잭션에서 `objectName`과 메타데이터를 연결할 수 있는 완료 페이로드다.
 */
export type DeferredLocalUploadConfig<TCollectionId extends string = string> = MediaUploadBaseConfig<TCollectionId> &
  LocalStreamingUploadAdapters & {
    readonly api: MediaUploadIntentApi<TCollectionId>;
  };

type LocalUploadRuntimeConfig<TCollectionId extends string = string> = MediaUploadBaseConfig<TCollectionId> &
  LocalUploadAdapters & {
    readonly api: MediaUploadIntentApi<TCollectionId>;
  };

type LocalUploadFinalizer<TOutput, TCollectionId extends string> = {
  /** PUT 뒤에만 실행된다. 일반 흐름은 서버 등록, 지연 흐름은 attachment 반환이다. */
  readonly finish: (input: MediaUploadCompletion<TCollectionId>) => Promise<TOutput>;
  readonly successDebugEvent: string;
  readonly failureDebugEvent: string;
  readonly successDetails?: (output: TOutput) => Readonly<Record<string, unknown>>;
};

interface LocalUploadPipeline<TOutput, TCollectionId extends string> {
  uploadLocalFile(input: LocalUploadInput<TCollectionId>): Promise<TOutput>;
  uploadPickedAsset(
    asset: PickedAsset,
    options?: { readonly collectionId?: TCollectionId | null | undefined } | undefined,
  ): Promise<TOutput>;
}

/**
 * A picker adapter is an untrusted runtime boundary even though its TypeScript result is
 * `PickedAsset`. Copy every field this pipeline reads exactly once before doing policy work.
 * Otherwise a getter can expose a safe value during content-type inference and throw a signed URL
 * on a later read during debug/size/EXIF handling.
 */
type PickedAssetSnapshot = {
  readonly uri: string;
  readonly fileName?: string | undefined;
  readonly mimeType?: string | undefined;
  readonly width?: number | undefined;
  readonly height?: number | undefined;
  readonly durationRaw?: number | undefined;
  readonly exif?: Readonly<Record<string, unknown>> | undefined;
  readonly verifiedSizeBytes?: number | undefined;
  readonly reportedSizeBytes?: number | undefined;
};

function snapshotPickedAsset(value: unknown): PickedAssetSnapshot | null {
  try {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
    const asset = value as Record<string, unknown>;
    const uri = asset['uri'];
    const fileName = asset['fileName'];
    const mimeType = asset['mimeType'];
    const width = asset['width'];
    const height = asset['height'];
    const durationRaw = asset['durationRaw'];
    const exif = asset['exif'];
    const verifiedSizeBytes = asset['verifiedSizeBytes'];
    const reportedSizeBytes = asset['reportedSizeBytes'];
    if (
      typeof uri !== 'string' ||
      (fileName !== undefined && typeof fileName !== 'string') ||
      (mimeType !== undefined && typeof mimeType !== 'string') ||
      (width !== undefined && (typeof width !== 'number' || !Number.isFinite(width))) ||
      (height !== undefined && (typeof height !== 'number' || !Number.isFinite(height))) ||
      (durationRaw !== undefined &&
        (typeof durationRaw !== 'number' || !Number.isFinite(durationRaw))) ||
      (verifiedSizeBytes !== undefined &&
        (typeof verifiedSizeBytes !== 'number' || !Number.isFinite(verifiedSizeBytes))) ||
      (reportedSizeBytes !== undefined &&
        (typeof reportedSizeBytes !== 'number' || !Number.isFinite(reportedSizeBytes))) ||
      (exif !== undefined &&
        (typeof exif !== 'object' || exif === null || Array.isArray(exif)))
    ) {
      return null;
    }
    return Object.freeze({
      uri,
      ...(fileName !== undefined ? { fileName } : {}),
      ...(mimeType !== undefined ? { mimeType } : {}),
      ...(width !== undefined ? { width } : {}),
      ...(height !== undefined ? { height } : {}),
      ...(durationRaw !== undefined ? { durationRaw } : {}),
      ...(exif !== undefined ? { exif: exif as Readonly<Record<string, unknown>> } : {}),
      ...(verifiedSizeBytes !== undefined ? { verifiedSizeBytes } : {}),
      ...(reportedSizeBytes !== undefined ? { reportedSizeBytes } : {}),
    });
  } catch {
    // Revoked Proxies and hostile getters are invalid picker output, never public raw errors.
    return null;
  }
}

/** 보통의 presign → PUT → 서버 등록 흐름. */
export function createLocalUploads<TAsset, TCollectionId extends string = string>(
  config: MediaUploadConfig<TAsset, TCollectionId> & LocalUploadAdapters,
): LocalUploads<TAsset, TCollectionId> {
  return createLocalUploadPipeline<UploadResult<TAsset>, TCollectionId>(config, {
    finish: (input) => config.api.completeUpload(input),
    successDebugEvent: 'local.complete.done',
    failureDebugEvent: 'local.complete.failed',
    successDetails: (completed) => ({ duplicate: completed.duplicate }),
  });
}

/**
 * Presign → 네이티브 스트리밍 PUT까지만 수행하고, 나중의 도메인 트랜잭션에 연결할 attachment를 반환한다.
 *
 * `api`에는 `createUploadIntent`만 있으면 된다. 이 함수는 `completeUpload`를 흉내 내거나 호출하지 않는다.
 */
export function createDeferredLocalUploads<TCollectionId extends string = string>(
  config: DeferredLocalUploadConfig<TCollectionId>,
): DeferredLocalUploads<TCollectionId> {
  const uploads = createLocalUploadPipeline<DeferredLocalUpload<TCollectionId>, TCollectionId>(
    config,
    {
      finish: async (attachment) => attachment,
      successDebugEvent: 'local.deferred.ready',
      failureDebugEvent: 'local.deferred.failed',
    },
  );
  return { uploadLocalFile: uploads.uploadLocalFile };
}

/**
 * 로컬 URI의 공통 presign → PUT 파이프라인.
 *
 * completion API가 있는 앱과 attachment를 자기 트랜잭션에서 연결하는 앱은 네이티브 전송·크기
 * 검증·해시·포스터 정책이 완전히 같다. 마지막 단계만 `finalizer`로 갈라 가짜 complete API를 만들지 않는다.
 */
function createLocalUploadPipeline<TOutput, TCollectionId extends string = string>(
  config: LocalUploadRuntimeConfig<TCollectionId>,
  finalizer: LocalUploadFinalizer<TOutput, TCollectionId>,
): LocalUploadPipeline<TOutput, TCollectionId> {
  const { api, files, transport, platform } = config;
  const strings = config.strings ?? enMediaStrings;
  const telemetry = config.telemetry ?? noopMediaTelemetry;
  const fileNamePrefix = config.fileNamePrefix ?? DEFAULT_FILE_NAME_PREFIX;
  const posterAtMs = config.posterAtMs ?? DEFAULT_POSTER_AT_MS;
  // 해시 어댑터를 주지 않은 소비자도 dedup을 얻는다 — 기본값이 이미 동작하는 것이 골든패스다(§9).
  const hasher = config.hasher ?? createFileHasher({ files });
  const debug = createMediaDebugLogger({ platform, options: config.debug });

  /**
   * dedup은 **최적화일 뿐**이므로 해시 실패가 업로드를 막아서는 안 된다
   * (전신 `hashLocalFileSafely` — uploader.ts:898-909 주석 원문:
   *  "Dedup is an optimization — a hashing failure must never block the upload.").
   */
  async function hashSafely(uri: string, fileName: string): Promise<string | null> {
    try {
      return await hasher.hashLocalFile(uri);
    } catch (error) {
      debug.error('local.hash.failed', error, { fileName });
      return null;
    }
  }

  /**
   * 포스터 프레임을 presign → PUT → 등록 대상 쌍(`UploadedPoster`)으로 만든다.
   * 전신 `uploadPosterLocalUri`(uploader.ts:247-303) 계승.
   *
   * ⚠ 빈 포스터는 **실패가 아니라 취소**다(`activity.cancel`) — 사용자에게 오류로 보고하면 안 되지만
   *    성공률 지표에 성공으로 섞여서도 안 되는 3번째 종료 상태다(§5.1 텔레메트리 계약).
   */
  async function uploadPosterLocalFile(input: {
    readonly uri: string;
    readonly fileName: string;
    readonly collectionId: TCollectionId | undefined;
    /** 본체가 이후 실패하면 호출자가 cleanup할 수 있게, 성공한 poster를 여기에 기록한다. */
    readonly orphanedObjects: MediaOrphanedUpload[];
  }): Promise<UploadedPoster | null> {
    const activity = beginMediaActivitySafely({
      telemetry,
      operation: 'media.upload.poster.native',
      onTelemetryFailure: (error) =>
        debug.error('poster.local.telemetry.failed', error, { fileName: input.fileName }),
    });
    const failRequiredPosterUpload = (failure: {
      readonly stage: MediaUploadFailureStage;
      readonly error?: unknown;
      readonly orphanedObjects: readonly MediaOrphanedUpload[];
    }): never => {
      // The main video cannot safely continue once a presign/PUT may have written a poster:
      // doing so would hide an object that the caller can no longer discover for cleanup.
      if (failure.error !== undefined) {
        debug.error('poster.local.upload.failed', failure.error, { fileName: input.fileName });
      }
      const safe = safeUploadFailure({
        message: strings.posterUploadFailed,
        stage: failure.stage,
        orphanedObjects: failure.orphanedObjects,
      });
      activity.fail(safe);
      throw safe;
    };

    let sizeBytes: number;
    try {
      debug.log('poster.local.stat.start', {
        fileName: input.fileName,
        uri: summarizeUri(input.uri),
      });
      const stat = await files.stat(input.uri);
      sizeBytes = stat.kind === 'file' ? stat.sizeBytes : 0;
      debug.log('poster.local.stat.done', {
        fileName: input.fileName,
        statKind: stat.kind,
        sizeBytes,
      });
      if (!sizeBytes) {
        activity.cancel({ extra: { reason: 'empty-poster' } });
        return null;
      }
    } catch (error) {
      // A generated frame can disappear from a transient cache. No storage object exists yet, so
      // this remains an optional-poster failure; it is still reported with a safe error only.
      debug.error('poster.local.stat.failed', error, { fileName: input.fileName });
      activity.fail(new MediaError('poster-upload-failed', strings.posterUploadFailed));
      return null;
    }

    try {
      // poster도 스토리지 비용·셀룰러 비용을 갖는 이미지다. 본체와 다른 우회 경로로 cap을
      // 건너뛰면 `limits.image`가 허울이 되므로, presign 이전에 같은 정책을 적용한다.
      assertUploadSize({
        limits: config.limits,
        strings,
        contentType: POSTER_CONTENT_TYPE,
        sizeBytes,
      });
    } catch (error) {
      // Poster is optional. A local policy rejection happens before presign, so it cannot create
      // an orphan and must not turn an otherwise valid video upload into a failure.
      if (mediaErrorCode(error) === 'file-too-large') {
        activity.cancel({ extra: { reason: 'poster-too-large' } });
        return null;
      }
      debug.error('poster.local.validation.failed', error, { fileName: input.fileName });
      activity.fail(new MediaError('poster-upload-failed', strings.posterUploadFailed));
      return null;
    }

    let response: unknown;
    try {
      response = await api.createUploadIntent({
        fileName: posterFileName(input.fileName),
        contentType: POSTER_CONTENT_TYPE,
        sizeBytes,
        ...(input.collectionId ? { collectionId: input.collectionId } : {}),
      });
    } catch (error) {
      return failRequiredPosterUpload({
        stage: 'intent',
        error,
        orphanedObjects: input.orphanedObjects,
      });
    }
    let intent: MediaUploadIntent | null;
    try {
      intent = parseMediaUploadIntent(response);
    } catch (error) {
      return failRequiredPosterUpload({
        stage: 'intent',
        error,
        orphanedObjects: input.orphanedObjects,
      });
    }
    if (!intent) {
      // response를 로그에 넣지 않는다 — malformed object 안에도 서명 URL이 있을 수 있다.
      return failRequiredPosterUpload({ stage: 'intent', orphanedObjects: input.orphanedObjects });
    }

    const possiblyUploaded = orphanedUpload({
      intent,
      contentType: POSTER_CONTENT_TYPE,
      sizeBytes,
      storageState: 'possibly-uploaded',
    });
    let status: unknown;
    try {
      const result = await transport.putLocalFile({
        url: intent.uploadUrl,
        method: intent.method,
        headers: intent.headers,
        uri: input.uri,
      });
      status = (result as { readonly status?: unknown } | null)?.status;
    } catch (error) {
      return failRequiredPosterUpload({
        stage: 'put',
        error,
        orphanedObjects: [...input.orphanedObjects, possiblyUploaded],
      });
    }
    debug.log('poster.local.put.done', {
      fileName: input.fileName,
      status,
      sizeBytes,
    });
    if (typeof status !== 'number' || !isSuccessStatus(status)) {
      return failRequiredPosterUpload({
        stage: 'put',
        orphanedObjects: [...input.orphanedObjects, possiblyUploaded],
      });
    }
    input.orphanedObjects.push(
      orphanedUpload({
        intent,
        contentType: POSTER_CONTENT_TYPE,
        sizeBytes,
        storageState: 'uploaded',
      }),
    );
    activity.succeed({ extra: { sizeBucket: sizeBucket(sizeBytes) } });
    return { objectName: intent.objectName, sizeBytes };
  }

  /**
   * 전신 `createNativeVideoPoster`(uploader.ts:305-335).
   * ⚠ 추출 실패·빈 프레임·로컬 cap 거절만 동영상 업로드를 막지 않는다. presign/PUT이 실패하면
   *    서버에 poster가 생겼을 수 있으므로 안전한 failureInfo와 함께 전체 흐름을 멈춘다.
   *
   * 전신은 `LocalUploadInput.poster`로 완성된 포스터를 받았지만 새 입력 타입에는 그 필드가 없다
   * (§5.4-①). 따라서 포스터 생성은 이 팩토리 안쪽으로 내려왔고, 그 결과 `uploadLocalFile`로 올린
   * 동영상도 썸네일을 얻는다 — 반쪽 메타로 등록돼 썸네일이 영구 누락되는 부류(§6.1-②)를 만들지 않기 위해서다.
   */
  async function createPoster(input: {
    readonly uri: string;
    readonly fileName: string;
    readonly kind: MediaKind;
    readonly collectionId: TCollectionId | undefined;
    readonly orphanedObjects: MediaOrphanedUpload[];
  }): Promise<UploadedPoster | null> {
    const adapter = config.poster;
    if (input.kind !== 'video' || !adapter) return null;
    let posterUri: string;
    try {
      debug.log('video.poster.create.start', {
        fileName: input.fileName,
        uri: summarizeUri(input.uri),
      });
      const frame = await adapter.posterFromLocalFile({ uri: input.uri, atMs: posterAtMs });
      if (!frame) return null;
      // Read the adapter-owned frame exactly once while this boundary is still guarded. A Proxy
      // that throws or swaps in a presigned URL must be handled as an optional extraction failure,
      // not escape after the adapter promise has resolved.
      const uri = frame.uri;
      if (typeof uri !== 'string' || uri.length === 0) return null;
      posterUri = uri;
    } catch (error) {
      // Extraction/no-frame has no storage side effect and stays optional by design.
      debug.error('video.poster.create.failed', error, { fileName: input.fileName });
      return null;
    }
    // Do not catch `uploadPosterLocalFile`: its presign/PUT failures carry possibly-uploaded
    // cleanup metadata and must reach the caller rather than allowing a silent orphan.
    const poster = await uploadPosterLocalFile({
      uri: posterUri,
      fileName: input.fileName,
      collectionId: input.collectionId,
      orphanedObjects: input.orphanedObjects,
    });
    debug.log('video.poster.create.done', {
      fileName: input.fileName,
      hasPoster: Boolean(poster),
      sizeBytes: poster?.sizeBytes,
    });
    return poster;
  }

  type LocalUploadPlan = {
    readonly uri: string;
    readonly fileName: string;
    readonly contentType: MediaContentType;
    readonly sizeBytes: number;
    readonly contentHash?: string | undefined;
    readonly collectionId?: TCollectionId | undefined;
    readonly photo?: MediaMetadata | undefined;
    readonly durationMs?: number | undefined;
    readonly width?: number | undefined;
    readonly height?: number | undefined;
  };

  /** presign → PUT → 마지막 처리. 전신 `uploadLocalUriToIntentInternal`(uploader.ts:363-470). */
  async function runLocalUpload(
    plan: LocalUploadPlan,
    poster: UploadedPoster | null,
    orphanedObjects: MediaOrphanedUpload[],
  ): Promise<TOutput> {
    assertUploadSize({
      limits: config.limits,
      strings,
      contentType: plan.contentType,
      sizeBytes: plan.sizeBytes,
    });
    debug.log('local.intent.start', {
      fileName: plan.fileName,
      contentType: plan.contentType,
      sizeBytes: plan.sizeBytes,
      hasContentHash: Boolean(plan.contentHash),
      hasCollectionId: Boolean(plan.collectionId),
      hasPhoto: Boolean(plan.photo),
      hasPoster: Boolean(poster),
      durationMs: plan.durationMs,
      width: plan.width,
      height: plan.height,
      uri: summarizeUri(plan.uri),
    });
    let response: unknown;
    try {
      response = await api.createUploadIntent({
        fileName: plan.fileName,
        contentType: plan.contentType,
        sizeBytes: plan.sizeBytes,
        ...(plan.collectionId ? { collectionId: plan.collectionId } : {}),
      });
    } catch (error) {
      // API가 네트워크/HTTP 에러에 signed URL을 에코해도 debug만 sanitize해서 본다. public
      // error와 `telemetry.track`에는 새로 만든 안전한 MediaError만 나간다.
      debug.error('local.intent.failed', error, {
        fileName: plan.fileName,
        contentType: plan.contentType,
        sizeBytes: plan.sizeBytes,
      });
      throw safeUploadFailure({
        message: strings.imageUploadFailed,
        stage: 'intent',
        orphanedObjects,
      });
    }
    let intent: MediaUploadIntent | null;
    try {
      intent = parseMediaUploadIntent(response);
    } catch (error) {
      debug.error('local.intent.failed', error, {
        fileName: plan.fileName,
        contentType: plan.contentType,
        sizeBytes: plan.sizeBytes,
      });
      throw safeUploadFailure({
        message: strings.imageUploadFailed,
        stage: 'intent',
        orphanedObjects,
      });
    }
    if (!intent) {
      // malformed response에는 URL·headers가 들어 있을 수 있으므로 원문 자체를 기록하지 않는다.
      throw safeUploadFailure({
        message: strings.imageUploadFailed,
        stage: 'intent',
        orphanedObjects,
      });
    }
    debug.log('local.put.start', {
      fileName: plan.fileName,
      contentType: plan.contentType,
      sizeBytes: plan.sizeBytes,
      method: intent.method,
      uri: summarizeUri(plan.uri),
    });
    const possiblyUploaded = orphanedUpload({
      intent,
      contentType: plan.contentType,
      sizeBytes: plan.sizeBytes,
      storageState: 'possibly-uploaded',
    });
    let status: unknown;
    try {
      const result = await transport.putLocalFile({
        url: intent.uploadUrl,
        method: intent.method,
        headers: intent.headers,
        uri: plan.uri,
      });
      status = (result as { readonly status?: unknown } | null)?.status;
    } catch (error) {
      debug.error('local.put.failed', error, {
        fileName: plan.fileName,
        contentType: plan.contentType,
        sizeBytes: plan.sizeBytes,
      });
      throw safeUploadFailure({
        message: strings.imageUploadFailed,
        stage: 'put',
        orphanedObjects: [...orphanedObjects, possiblyUploaded],
      });
    }
    debug.log('local.put.done', {
      fileName: plan.fileName,
      contentType: plan.contentType,
      sizeBytes: plan.sizeBytes,
      status,
    });
    if (typeof status !== 'number' || !isSuccessStatus(status)) {
      // ⚠ 동영상이어도 `imageUploadFailed`다 — 전신(uploader.ts:423-426)이 로컬 코어에서 동영상·사진
      //   구분 없이 이 문구를 썼고, `videoUploadFailed`는 웹 동영상 경로 전용이었다(uploader.ts:590).
      //   memorylog2 이관 시 UI 회귀 0을 위해 문구 배치를 그대로 둔다(§11).
      throw safeUploadFailure({
        message: strings.imageUploadFailed,
        stage: 'put',
        orphanedObjects: [...orphanedObjects, possiblyUploaded],
      });
    }
    orphanedObjects.push({ ...possiblyUploaded, storageState: 'uploaded' });
    try {
      const attachment: MediaUploadCompletion<TCollectionId> = {
        fileName: plan.fileName,
        contentType: plan.contentType,
        sizeBytes: plan.sizeBytes,
        objectName: intent.objectName,
        ...(plan.contentHash ? { contentHash: plan.contentHash } : {}),
        ...(plan.collectionId ? { collectionId: plan.collectionId } : {}),
        ...(plan.photo ? { photo: plan.photo } : {}),
        ...(plan.durationMs ? { durationMs: plan.durationMs } : {}),
        ...(plan.width ? { width: plan.width } : {}),
        ...(plan.height ? { height: plan.height } : {}),
        // poster는 objectName·sizeBytes 쌍 객체다 — 한쪽만 보내 서버가 반쪽 메타로 등록하는
        // 경로를 타입 수준에서 없앤 결과다(§6.1-②).
        ...(poster ? { poster } : {}),
      };
      const output = await finalizer.finish(attachment);
      debug.log(finalizer.successDebugEvent, {
        fileName: plan.fileName,
        contentType: plan.contentType,
        sizeBytes: plan.sizeBytes,
        ...(finalizer.successDetails?.(output) ?? {}),
      });
      return output;
    } catch (error) {
      debug.error(finalizer.failureDebugEvent, error, {
        fileName: plan.fileName,
        contentType: plan.contentType,
        sizeBytes: plan.sizeBytes,
      });
      throw safeUploadFailure({
        message: strings.imageUploadFailed,
        stage: 'complete',
        orphanedObjects,
      });
    }
  }

  /**
   * 포스터 생성 → 텔레메트리 스팬 → 업로드.
   *
   * ⚠ 포스터를 스팬 **밖에서** 만드는 이유: `media.upload.native`의 시작 payload에 `hasPoster`가
   *   들어가므로(§7.2 계약) 스팬을 열기 전에 포스터 유무가 확정돼야 한다. 전신도 같은 순서였다
   *   (uploader.ts:785-796 — `createNativeVideoPoster` 후 `uploadLocalUriToIntent`).
   */
  async function uploadPlan(plan: LocalUploadPlan): Promise<TOutput> {
    // poster가 먼저 성공한 뒤 본체 intent/PUT/등록이 실패하면, 이 배열이 에러 검사 API로
    // 돌아간다. URL은 전혀 넣지 않는다 — 앱 cleanup endpoint에는 objectName만 필요하다.
    const orphanedObjects: MediaOrphanedUpload[] = [];
    const poster = await createPoster({
      uri: plan.uri,
      fileName: plan.fileName,
      kind: mediaKindOf(plan.contentType),
      collectionId: plan.collectionId,
      orphanedObjects,
    });
    return trackMediaSafely({
      telemetry,
      operation: 'media.upload.native',
      extra: {
        contentType: plan.contentType,
        sizeBucket: sizeBucket(plan.sizeBytes),
        hasPoster: Boolean(poster),
      },
      onTelemetryFailure: (error) =>
        debug.error('local.telemetry.track.failed', error, {
          fileName: plan.fileName,
          contentType: plan.contentType,
          sizeBytes: plan.sizeBytes,
        }),
      run: async () => {
        try {
          return await runLocalUpload(plan, poster, orphanedObjects);
        } catch (error) {
          debug.error('local.upload.failed', error, {
            fileName: plan.fileName,
            contentType: plan.contentType,
            sizeBytes: plan.sizeBytes,
            uri: summarizeUri(plan.uri),
          });
          throw error;
        }
      },
    });
  }

  /** 크기 결정 — verified가 있으면 file-system stat 자체를 건너뛴다(전신 `skipFileSystemStat`). */
  async function resolveSizeBytes(input: {
    readonly uri: string;
    readonly verifiedSizeBytes?: number | undefined;
    readonly reportedSizeBytes?: number | undefined;
    readonly kind: MediaKind;
    readonly fileName: string;
  }): Promise<number> {
    let statKind: 'file' | 'directory' | 'missing' | undefined;
    let statSizeBytes: number | undefined;
    try {
      if (!(input.verifiedSizeBytes && input.verifiedSizeBytes > 0)) {
        const stat = await files.stat(input.uri);
        // `FileSystemAdapter` is host code. Snapshot all fields that leave its result while the
        // adapter boundary is guarded; reading `stat.kind` later would let a hostile getter leak
        // a raw URI/URL error outside this safe MediaError path.
        const kind = stat.kind;
        if (kind === 'file') {
          statKind = kind;
          statSizeBytes = stat.sizeBytes;
        } else if (kind === 'directory' || kind === 'missing') {
          statKind = kind;
        }
      }
    } catch (error) {
      // custom file adapter가 URI/URL을 포함한 Error를 던져도 public 경계에는 안전한 문구만
      // 남긴다. debug logger는 이 원문을 sanitize해서 개발 환경에서만 관찰한다.
      debug.error('local.stat.failed', error, {
        fileName: input.fileName,
        uri: summarizeUri(input.uri),
      });
      throw new MediaError(
        'upload-failed',
        input.kind === 'video' ? strings.videoSizeUnknown : strings.imageSizeUnknown,
      );
    }
    const resolved = resolveUploadSize({
      verifiedSizeBytes: input.verifiedSizeBytes,
      statSizeBytes,
      reportedSizeBytes: input.reportedSizeBytes,
    });
    debug.log('local.stat.done', {
      fileName: input.fileName,
      statKind,
      sizeBytes: resolved?.sizeBytes,
      sizeSource: resolved?.source,
      uri: summarizeUri(input.uri),
    });
    if (!resolved) {
      throw new MediaError(
        'upload-failed',
        input.kind === 'video' ? strings.videoSizeUnknown : strings.imageSizeUnknown,
      );
    }
    return resolved.sizeBytes;
  }

  return {
    async uploadLocalFile(input) {
      if (platform.os === 'web') {
        // `createDeferredLocalUploads`는 이 메서드만 노출한다. 여기서 막아야 web/SSR이
        // 파일 stat·presign·PUT을 하나도 시작하지 않고 BinaryUploads 정본 경로로 갈 수 있다.
        throw new MediaError('platform-unsupported', strings.platformUnsupported);
      }
      const contentType =
        input.contentType ?? inferMediaContentType(null, input.fileName ?? input.uri);
      const kind = mediaKindOf(contentType);
      const fileName = mediaFileName({
        fileName: input.fileName,
        contentType,
        prefix: fileNamePrefix,
      });
      const sizeBytes = await resolveSizeBytes({
        uri: input.uri,
        verifiedSizeBytes: input.sizeBytes,
        kind,
        fileName,
      });
      // 크기를 알았으면 해시·EXIF·포스터 생성 전에 즉시 거절한다. 그렇지 않으면 2GB 파일을
      // 전부 SHA-256으로 읽고 난 뒤에야 `file-too-large`가 되어 cap의 사용자 보호 의미가 없다.
      assertUploadSize({ limits: config.limits, strings, contentType, sizeBytes });
      // 호출자 해시가 최우선 — 있으면 hasher를 **호출하지 않는다**(§7.1 신설 행).
      // 동기화 큐가 재시도 간 해시를 캐시하는 경로가 이것이다.
      const contentHash = input.contentHash ?? (await hashSafely(input.uri, fileName)) ?? undefined;
      return uploadPlan({
        uri: input.uri,
        fileName,
        contentType,
        sizeBytes,
        ...(contentHash ? { contentHash } : {}),
        ...(input.photo ? { photo: input.photo } : {}),
        ...(input.durationMs ? { durationMs: input.durationMs } : {}),
        ...(input.width ? { width: input.width } : {}),
        ...(input.height ? { height: input.height } : {}),
        collectionId: normalizeCollectionId({ collectionId: input.collectionId, kind, strings }),
      });
    },

    async uploadPickedAsset(asset, options) {
      const picked = snapshotPickedAsset(asset);
      if (!picked) {
        // We cannot safely infer a media kind when a picker getter itself failed. Use the image
        // fallback copy rather than exposing the adapter exception (which may contain a URI).
        throw new MediaError('picked-asset-invalid', strings.pickedPhotoInvalid);
      }
      // uri가 없으면 종류별 문구가 달라야 하므로 contentType을 먼저 추론한다.
      // 전신은 진입점이 둘(`uploadPickerAsset`/`uploadPickerMediaAsset`)이라 각자 자기 문구를 썼다
      // (uploader.ts:678 사진 / 717 미디어). 통합되면서 kind가 그 선택을 대신한다.
      const contentType = inferMediaContentType(picked.mimeType, picked.fileName ?? picked.uri);
      const kind = mediaKindOf(contentType);
      if (!picked.uri) {
        throw new MediaError(
          'picked-asset-invalid',
          kind === 'video' ? strings.pickedMediaInvalid : strings.pickedPhotoInvalid,
        );
      }
      if (platform.os === 'web') {
        // 로컬 파일 스트리밍은 웹에 존재하지 않는다. 웹 피커 자산의 정본 경로는
        // `createPickerFlows({ web })` → `BinaryUploads.uploadBinary`다(§5.7.4 · §8.5).
        // ⚠ `expo-file-system`의 web 셰이프는 `FileSystemUploadTask.start()`가
        //   `{body:'',status:0,headers:{}}`인 **no-op**이라, 막지 않으면 "조용히 성공"한다(§7.1 마지막 행).
        throw new MediaError('platform-unsupported', strings.platformUnsupported);
      }

      const uri = picked.uri;
      const fileName = mediaFileName({
        fileName: picked.fileName,
        contentType,
        prefix: fileNamePrefix,
      });
      debug.log('picker.route', {
        fileName,
        contentType,
        mimeType: picked.mimeType,
        reportedSizeBytes: picked.reportedSizeBytes,
        verifiedSizeBytes: picked.verifiedSizeBytes,
        width: picked.width,
        height: picked.height,
        hasCollectionId: Boolean(options?.collectionId),
        uri: summarizeUri(uri),
      });

      const sizeBytes = await resolveSizeBytes({
        uri,
        verifiedSizeBytes: picked.verifiedSizeBytes,
        reportedSizeBytes: picked.reportedSizeBytes,
        kind,
        fileName,
      });
      // picker 자산도 파일 크기가 확정된 순간에 cap을 적용한다. video poster·이미지 해시보다
      // 앞이어야 대용량 거절이 CPU·배터리·임시 파일을 소모하지 않는다.
      assertUploadSize({ limits: config.limits, strings, contentType, sizeBytes });

      // ⚠ EXIF 메타데이터는 이미지에서만 뽑는다 — 전신 동작 그대로다
      //   (`uploadPickerAssetNative`만 `extractPhotoMetadata`를 호출했고 동영상 경로는 호출하지 않았다).
      let photo: MediaMetadata | undefined;
      if (kind === 'image') {
        try {
          // `asset` is picker/host-provided runtime data. Reading EXIF fields can invoke getters
          // all the way down, so do not let a hostile EXIF proxy escape with a URI or raw error.
          photo = mediaMetadataFromExif(picked.exif);
        } catch (error) {
          debug.error('picker.metadata.failed', error, { fileName, contentType });
          throw new MediaError('picked-asset-invalid', strings.pickedPhotoInvalid);
        }
      }

      // ⚠ 해시도 이미지에서만 계산한다 — 전신 동작 그대로다(uploader.ts:880 이미지 / 784-796 동영상 미해시).
      //   동영상은 수백 MB가 흔하고 순수 TS SHA-256 위에서는 그 비용이 그대로 사용자 대기가 된다(§9·§12-3).
      //   동기화 엔진처럼 동영상 해시가 필요한 경로는 `uploadLocalFile({ contentHash })`로 직접 넘긴다.
      const contentHash = kind === 'image' ? await hashSafely(uri, fileName) : null;

      try {
        return await uploadPlan({
          uri,
          fileName,
          contentType,
          sizeBytes,
          ...(contentHash ? { contentHash } : {}),
          ...(photo ? { photo } : {}),
          collectionId: normalizeCollectionId({
            collectionId: options?.collectionId,
            kind,
            strings,
          }),
          durationMs: normalizeDurationMs(picked.durationRaw, platform.os),
          width: normalizeDimension(picked.width),
          height: normalizeDimension(picked.height),
        });
      } finally {
        // 전신 주석 그대로: "No-op unless the uri is a staging copy made by
        // resolveDeviceAssetForUpload; a failed attempt re-resolves anyway."
        // 누락하면 업로드한 **모든** 사진의 원본 사본이 앱 컨테이너에 영구 축적된다(§7 하드닝 7).
        try {
          await config.staging?.cleanup(uri);
        } catch (error) {
          // cleanup은 최선 노력이다. 여기의 raw filesystem error가 이미 안전하게 만든 업로드
          // 결과를 덮거나 telemetry/화면으로 새면 안 된다.
          debug.error('local.staging.cleanup.failed', error, {
            fileName,
            uri: summarizeUri(uri),
          });
        }
      }
    },
  };
}
