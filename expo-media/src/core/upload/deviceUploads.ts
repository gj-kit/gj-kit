// 설계 문서 §5.4-⑤ — 기기 자산 업로드 팩토리(`createDeviceUploads`).
//
// 전신 `uploadDeviceLibraryAssets`(uploader.ts:1014-1028)의 주석이 이 모듈의 규율이다:
//
//   "Shared 'resolve then upload each device-library asset' loop. Sequential on purpose:
//    each resolve may materialize a PhotoKit original into the app cache, and parallel
//    uploads would multiply that disk/network pressure."
//
// ⚠ **순차 실행은 취향이 아니라 하드닝이다**(§7.1). iOS에서 각 resolve는 PhotoKit 원본을
//    앱 캐시로 실체화한다(§7 하드닝 2) — 병렬화하면 동시에 존재하는 사본 수만큼 디스크와
//    네트워크 압력이 곱해지고, 대용량 동영상이 섞이면 저장공간 부족으로 실패한다.
//
// ⚠ 이 팩토리는 텔레메트리 인자를 받지 않는다 — `createDeviceLibrary`와 같은 근거로,
//    기기 라이브러리 경로는 전신에서 의도적으로 방출하지 않았고 방출 지점 없는 슬롯은 죽은 인자다(§5.1).

import type { DeviceAssetRef, PickedAsset } from '../adapters';
import type { DeviceLibrary, DeviceResolveOptions } from '../device/deviceLibrary';
import type { StagingCache } from '../staging';
import type { UploadResult } from '../types';
import type { LocalUploads } from './uploader';

export interface DeviceUploads<TAsset, TCollectionId extends string = string> {
  /**
   * ⚠ 순차 실행 고정(위 참조). 업로드 성공·실패와 무관하게 finally에서 `staging.cleanup`을 호출한다 —
   * 누락하면 업로드한 **모든** 사진의 원본 사본이 앱 컨테이너에 영구 축적된다(§7 하드닝 7).
   */
  uploadDeviceAssets(
    assets: readonly DeviceAssetRef[],
    options?:
      | (DeviceResolveOptions & {
          readonly collectionId?: TCollectionId | null | undefined;
          readonly max?: number | undefined;
        })
      | undefined,
  ): Promise<readonly UploadResult<TAsset>[]>;
}

export function createDeviceUploads<TAsset, TCollectionId extends string = string>(input: {
  readonly device: DeviceLibrary;
  readonly uploads: LocalUploads<TAsset, TCollectionId>;
  readonly staging: StagingCache;
}): DeviceUploads<TAsset, TCollectionId> {
  const { device, uploads, staging } = input;

  return {
    async uploadDeviceAssets(assets, options) {
      const max = options?.max;
      const targets = max === undefined ? assets : assets.slice(0, max);
      const uploaded: UploadResult<TAsset>[] = [];

      for (const ref of targets) {
        // 바이트 위치만 필요한 진입점이다(`resolveForUpload`) — 화면 경로용
        // `resolvePickedAsset`은 `DeviceAsset` 전체(치수·mediaType)를 요구하는데
        // 여기 입력은 `DeviceAssetRef`(id + filename)뿐이기 때문이다(§5.4-④(a)).
        const resolved = await device.resolveForUpload(ref, options);
        // 전신 `resolveDeviceAssetForUpload`(devicePhotoLibrary.ts:360-369)가 만들던 조합과 동일하되
        // 치수는 없다. ⚠ `exif`는 `null → undefined` 정규화가 필수다 — EOP 하에서
        //   `ResolvedDeviceAsset.exif`(…|null)를 `PickedAsset.exif`(?: …|undefined)에 그대로 넣으면 TS2322다.
        // ⚠ `reportedSizeBytes`는 채우지 않는다 — 기기 경로의 크기 진실은 verified뿐이다(§7 하드닝 3).
        const picked: PickedAsset = {
          uri: resolved.uri,
          assetId: ref.id,
          fileName: ref.filename,
          verifiedSizeBytes: resolved.verifiedSizeBytes,
          exif: resolved.exif ?? undefined,
        };
        try {
          uploaded.push(await uploads.uploadPickedAsset(picked, { collectionId: options?.collectionId }));
        } finally {
          // 만든 주체가 지운다. `owns()`가 false면 no-op이고 실패는 삼킨다 —
          // 스테이징 누수는 디스크 비용일 뿐이므로 정리 실패가 업로드 결과를 뒤집지 않는다(§5.3).
          await staging.cleanup(resolved.uri);
        }
      }

      return uploaded;
    },
  };
}
