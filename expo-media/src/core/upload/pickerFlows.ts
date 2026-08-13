// 설계 문서 §5.4-③ — 피커 플로우 팩토리(`createPickerFlows`).
//
// 전신 `pickAndUploadPhoto` / `pickPhotos` / `pickAndUploadPhotos` / `pickAndUploadMedia` /
// `captureAndUploadMedia`(uploader.ts:911-1012) 5종을 3종으로 통합한 것이다(§5.7.2-⑫).
// 통합의 근거: 다섯 함수의 차이는 `kinds`(이미지 전용 / 이미지+동영상)와 `max`뿐이었고,
// 둘 다 **옵션 값**이지 별도 진입점이 될 이유가 없었다.
//
// 이 팩토리가 소유하는 정책은 셋이다:
//   ① 권한을 먼저 확인하고, 거부면 `permission-denied`로 실패한다(전신은 bare Error였다 — §5.2).
//   ② 선택 결과를 `max`로 자른다(전신 `result.assets.slice(0, max)`).
//   ③ **플랫폼별 업로드 라우팅**(§5.7.4 · §8.5) — 네이티브는 로컬 URI 스트리밍,
//      웹은 `loader`로 바이너리를 만들어 `BinaryUploads`로 보낸다.

import type { BinarySourceLoader, MediaKind, PickedAsset, PickerAdapter, PlatformAdapter } from '../adapters';
import { MediaError } from '../errors';
import { inferMediaContentType, mediaFileName } from '../mediaTypes';
import { normalizeDurationMs } from './duration';
import type { MediaStrings } from '../strings';
import { enMediaStrings } from '../strings';
import type { UploadResult } from '../types';
import type { BinaryUploads } from './binary';
import type { LocalUploads } from './uploader';
import { DEFAULT_PICK_MAX } from './uploader';

/** 전신 3사이트가 모두 `mediaTypes: ["images"]`로 시작했다(uploader.ts:921,940). */
const DEFAULT_PICK_KINDS: readonly MediaKind[] = ['image'];

/**
 * Picker adapters are host code, so their runtime result is not trusted merely because the
 * TypeScript interface says `PickedAsset[]`. Copy exactly the fields this flow owns before an
 * asset crosses into upload code; a getter/Proxy cannot later replace a safe file name with a raw
 * URL-shaped value.
 */
function snapshotPickedAssets(value: unknown, max: number): readonly PickedAsset[] | null {
  if (!Array.isArray(value)) return null;
  const snapshots: PickedAsset[] = [];
  const count = Math.min(value.length, max);
  for (let index = 0; index < count; index += 1) {
    const source = value[index];
    if (typeof source !== 'object' || source === null || Array.isArray(source)) return null;
    const record = source as Record<string, unknown>;
    const uri = record['uri'];
    const assetId = record['assetId'];
    const fileName = record['fileName'];
    const mimeType = record['mimeType'];
    const width = record['width'];
    const height = record['height'];
    const durationRaw = record['durationRaw'];
    const exif = record['exif'];
    const verifiedSizeBytes = record['verifiedSizeBytes'];
    const reportedSizeBytes = record['reportedSizeBytes'];
    if (
      typeof uri !== 'string' ||
      uri.length === 0 ||
      (assetId !== undefined && typeof assetId !== 'string') ||
      (fileName !== undefined && typeof fileName !== 'string') ||
      (mimeType !== undefined && typeof mimeType !== 'string') ||
      (width !== undefined && (!Number.isFinite(width) || typeof width !== 'number')) ||
      (height !== undefined && (!Number.isFinite(height) || typeof height !== 'number')) ||
      (durationRaw !== undefined && (!Number.isFinite(durationRaw) || typeof durationRaw !== 'number')) ||
      (verifiedSizeBytes !== undefined &&
        (!Number.isFinite(verifiedSizeBytes) || typeof verifiedSizeBytes !== 'number')) ||
      (reportedSizeBytes !== undefined &&
        (!Number.isFinite(reportedSizeBytes) || typeof reportedSizeBytes !== 'number')) ||
      (exif !== undefined && (typeof exif !== 'object' || exif === null || Array.isArray(exif)))
    ) {
      return null;
    }
    snapshots.push({
      uri,
      ...(assetId !== undefined ? { assetId } : {}),
      ...(fileName !== undefined ? { fileName } : {}),
      ...(mimeType !== undefined ? { mimeType } : {}),
      ...(width !== undefined ? { width } : {}),
      ...(height !== undefined ? { height } : {}),
      ...(durationRaw !== undefined ? { durationRaw } : {}),
      ...(exif !== undefined ? { exif: exif as Readonly<Record<string, unknown>> } : {}),
      ...(verifiedSizeBytes !== undefined ? { verifiedSizeBytes } : {}),
      ...(reportedSizeBytes !== undefined ? { reportedSizeBytes } : {}),
    });
  }
  return snapshots;
}

export type PickUploadOptions<TCollectionId extends string = string> = {
  readonly collectionId?: TCollectionId | null | undefined;
  readonly max?: number | undefined;
  readonly kinds?: readonly MediaKind[] | undefined;
};

export interface PickerFlows<TAsset, TCollectionId extends string = string> {
  pick(
    options?:
      | { readonly max?: number | undefined; readonly kinds?: readonly MediaKind[] | undefined }
      | undefined,
  ): Promise<readonly PickedAsset[]>;
  pickAndUpload(
    options?: PickUploadOptions<TCollectionId> | undefined,
  ): Promise<readonly UploadResult<TAsset>[]>;
  /**
   * ⚠ 항상 **최대 1건**이다(전신 uploader.ts:1008 `result.assets.slice(0, 1)`).
   * 무시되는 옵션은 그 자체로 함정이므로 옵션 타입에서 `max`를 Omit한다(§5.4.1-12).
   */
  captureAndUpload(
    options?:
      | (Omit<PickUploadOptions<TCollectionId>, 'max'> & { readonly kind?: MediaKind | undefined })
      | undefined,
  ): Promise<readonly UploadResult<TAsset>[]>;
}

export function createPickerFlows<TAsset, TCollectionId extends string = string>(input: {
  readonly picker: PickerAdapter;
  readonly uploads: LocalUploads<TAsset, TCollectionId>;
  readonly platform: PlatformAdapter;
  readonly strings?: MediaStrings | undefined;
  /**
   * 웹 경로에서 `asset.fileName`이 없을 때 생성되는 폴백 파일명의 접두사.
   * 전신은 uploader의 `fileNamePrefix`를 썼다(uploader.ts:701) — 생략하면 `mediaFileName`
   * 기본값(`'media'`)이 되어 호스트 접두사가 웹 경로에서만 달라진다.
   * 네이티브 경로는 `uploads`가 이미 자기 접두사를 갖고 있으므로 영향받지 않는다.
   */
  readonly fileNamePrefix?: string | undefined;
  /**
   * ⚠ `platform.os === 'web'`에서 피커 자산을 업로드하려면 **필수**. 없으면
   * `MediaError('platform-unsupported')`. 조건부 타입 0 — 런타임 분기다(§3.1).
   *
   * 실측 근거(§5.7.4/V9-d): memorylog2 `app/profile-edit.tsx:137`의 `pickAndUploadPhoto()`에는
   * **플랫폼 게이트가 없다**. 웹에서 그 호출은 전신 uploader.ts:692-710으로 들어가
   * `fetch(asset.uri)` → Blob → `uploadImageBlob({ fallbackExif: asset.exif })`를 탔다.
   * 그 경로를 잃지 않으려면 변환 담당자(`loader`)와 업로더(`uploads`)가 여기 주입돼야 한다.
   */
  readonly web?:
    | {
        readonly uploads: BinaryUploads<TAsset, TCollectionId>;
        readonly loader: BinarySourceLoader;
      }
    | undefined;
}): PickerFlows<TAsset, TCollectionId> {
  const { picker, uploads, platform } = input;
  const strings = input.strings ?? enMediaStrings;
  const fileNamePrefix = input.fileNamePrefix;

  /**
   * 자산 1건 업로드 — 플랫폼 라우팅의 유일한 지점(§8.5 표의 마지막 행).
   *
   * 웹 경로가 `fallbackExif: asset.exif`를 반드시 넘긴다는 점이 계약이다(전신 uploader.ts:709).
   * 넘기지 않으면 JPEG APP1 파싱이 실패했을 때 피커가 이미 준 EXIF가 버려져
   * **촬영 시각과 위치가 조용히 유실**된다(§5.7.4 전제 조건 2).
   */
  async function uploadOne(
    asset: PickedAsset,
    collectionId: TCollectionId | null | undefined,
  ): Promise<UploadResult<TAsset>> {
    if (platform.os !== 'web') {
      return uploads.uploadPickedAsset(asset, { collectionId });
    }
    const web = input.web;
    if (!web) {
      // ⚠ `LocalUploads.uploadPickedAsset`으로 폴백하면 안 된다 — 웹에서는 로컬 파일 전송 자체가
      //   없고, `expo-file-system` web 셰이프는 조용히 성공한 것처럼 보이는 no-op다(§7.1 마지막 행).
      throw new MediaError('platform-unsupported', strings.platformUnsupported);
    }
    const contentType = inferMediaContentType(asset.mimeType, asset.fileName ?? asset.uri);
    const fileName = mediaFileName({ fileName: asset.fileName, contentType, prefix: fileNamePrefix });
    let source;
    try {
      source = await web.loader.fromUri({ uri: asset.uri, fileName });
    } catch {
      // The loader is a host adapter; never let an echoed fetch/blob URL cross the public picker
      // flow just because the failure happened before BinaryUploads began.
      throw new MediaError('picker-failed', strings.pickerFailed);
    }
    return web.uploads.uploadBinary({
      source,
      collectionId,
      fallbackExif: asset.exif,
      // ⚠ 전신 웹 동영상 경로(uploader.ts:804-815)가 이 3값을 완료 페이로드로 보냈다.
      //   `BinarySource`만으로는 DOM 없이 복원할 수 없으므로 **여기서 넘기지 않으면 영구 유실**이다.
      //   duration은 반드시 정규화를 거친다 — 웹 피커는 초를 준다(§7 하드닝 4).
      durationMs: normalizeDurationMs(asset.durationRaw, platform.os),
      dimensions: { width: asset.width, height: asset.height },
    });
  }

  /** 여러 건을 **순차** 업로드한다. 전신도 `for ... await` 루프였다(uploader.ts:958,983,1008). */
  async function uploadAll(
    assets: readonly PickedAsset[],
    collectionId: TCollectionId | null | undefined,
  ): Promise<readonly UploadResult<TAsset>[]> {
    const uploaded: UploadResult<TAsset>[] = [];
    for (const asset of assets) {
      uploaded.push(await uploadOne(asset, collectionId));
    }
    return uploaded;
  }

  const flows: PickerFlows<TAsset, TCollectionId> = {
    async pick(options) {
      const kinds = options?.kinds ?? DEFAULT_PICK_KINDS;
      const max = options?.max ?? DEFAULT_PICK_MAX;
      let granted: boolean;
      try {
        const permission = await picker.requestLibraryPermission(kinds);
        if (typeof permission?.granted !== 'boolean') throw new TypeError('Invalid picker permission');
        granted = permission.granted;
      } catch {
        throw new MediaError('picker-failed', strings.pickerFailed);
      }
      if (!granted) {
        // 전신은 bare Error였고(uploader.ts:918/937/973), 호스트가 "설정으로 이동" UI를 띄울
        // 근거로 삼을 code가 없었다(§5.2의 typed-error 계약).
        // 문구는 요청한 종류에 따라 갈린다 — 전신 uploader.ts:937(사진) vs 973(사진 및 동영상).
        throw new MediaError(
          'permission-denied',
          kinds.includes('video') ? strings.mediaPermissionRequired : strings.photoPermissionRequired,
        );
      }
      try {
        const assets = await picker.pickFromLibrary({ kinds, max });
        // 어댑터가 selectionLimit을 무시하는 플랫폼이 있어 코어에서 한 번 더 자른다(전신 946,983).
        const snapshots = snapshotPickedAssets(assets, max);
        if (!snapshots) throw new TypeError('Invalid picker asset result');
        return snapshots;
      } catch {
        throw new MediaError('picker-failed', strings.pickerFailed);
      }
    },

    async pickAndUpload(options) {
      const assets = await flows.pick({
        max: options?.max,
        kinds: options?.kinds,
      });
      return uploadAll(assets, options?.collectionId);
    },

    async captureAndUpload(options) {
      let granted: boolean;
      try {
        const permission = await picker.requestCameraPermission();
        if (typeof permission?.granted !== 'boolean') throw new TypeError('Invalid camera permission');
        granted = permission.granted;
      } catch {
        throw new MediaError('picker-failed', strings.pickerFailed);
      }
      if (!granted) {
        throw new MediaError('permission-denied', strings.cameraPermissionRequired);
      }
      let snapshots: readonly PickedAsset[];
      try {
        const assets = await picker.capture({ kind: options?.kind ?? 'image' });
        // ⚠ 1건 고정. 카메라가 여러 장을 돌려주는 플랫폼이 생겨도 상위 계약은 변하지 않는다.
        const captured = snapshotPickedAssets(assets, 1);
        if (!captured) throw new TypeError('Invalid camera asset result');
        snapshots = captured;
      } catch {
        // Keep this boundary to the host picker only. `uploadAll` may reject with a safe
        // MediaError from another entry-point copy, which must retain its code and recovery info.
        throw new MediaError('picker-failed', strings.pickerFailed);
      }
      return uploadAll(snapshots, options?.collectionId);
    },
  };

  return flows;
}
