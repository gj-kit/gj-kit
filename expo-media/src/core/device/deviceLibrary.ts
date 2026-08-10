// 설계 문서 §5.4-④ — 기기 라이브러리 팩토리.
//
// 전신 `packages/photo-kit/src/devicePhotoLibrary.ts` + `mediaPermission.ts`의 정책을 전부
// 이 팩토리로 옮긴 것이다. 옮긴 이유는 하나로 요약된다: **정책이 어댑터에 있으면 3자 어댑터마다
// 규칙이 갈리고, 갈린 규칙은 타입도 가드도 잡지 못한다**(§5.4-④(c)).
//   · 권한을 "언제 요청하는가" → 여기(`ensurePermission`)
//   · 자산정보 데드라인 15s/60s, iCloud 다운로드 기본값 → 여기(`resolveSource.ts` 경유)
//   · 앨범 `count > 0` 필터와 count 내림차순 → 여기(`fetchAlbums`)
// 어댑터에 남는 것은 네이티브 응답을 계약 타입으로 매핑하는 순수 위임뿐이다.

import type {
  DeviceAlbum,
  DeviceAsset,
  DeviceAssetInfo,
  DeviceAssetPage,
  DeviceAssetRef,
  DeviceLibraryAdapter,
  FileSystemAdapter,
  MediaKind,
  MediaPermission,
  PlatformAdapter,
  ResolvedDeviceAsset,
  ResolvedPickedAsset,
} from '../adapters';
import { createMediaDebugLogger, summarizeUri } from '../debug';
import type { StagingCache } from '../staging';
import type { MediaStrings } from '../strings';
import { enMediaStrings } from '../strings';
import type { MediaDebugOptions } from '../types';
import type { DeviceResolveDeps, DeviceResolveOptions } from './resolveSource';
import { getDeviceAssetInfoWithDeadline, resolveDeviceAssetSource } from './resolveSource';
import { toPickedAsset } from './toPickedAsset';

// `DeviceResolveOptions`의 선언 지점은 `resolveSource.ts` 하나다(해석 경로가 소유한다).
// 설계 문서가 이 타입을 §5.4-④에 함께 적어 두었으므로 팩토리 쪽에서도 집을 수 있게 재export한다.
export type { DeviceResolveOptions } from './resolveSource';

/** 전신 devicePhotoLibrary.ts:204 — 그리드 렌더 예산 값(§5.4.1-9). */
const DEVICE_PAGE_SIZE = 60;

/**
 * 전신 devicePhotoLibrary.ts:219 `mediaType: MediaLibrary.MediaType.photo`의 계승.
 * 기기 그리드의 기본은 사진이며, 동영상까지 열거하려면 호출자가 명시한다.
 */
const DEFAULT_DEVICE_KINDS: readonly MediaKind[] = ['image'];

export interface DeviceLibrary {
  /** 순수 조회. 요청하지 않는다. */
  getPermission(): Promise<MediaPermission>;
  /**
   * 권한 합성 규칙의 **유일한 거처**(§5.4-④(c), G17):
   * 조회 → `!granted && canAskAgain`일 때만 요청 → `accessPrivileges === 'limited'` 매핑
   * (마지막 매핑은 어댑터 몫 — §3.3).
   *
   * ⚠ raw `requestPermission()`은 **공개하지 않는다**. `canAskAgain`을 무시하는 재요청이
   * 정확히 iOS UI 데드록(재요청해도 아무 일도 일어나지 않아 화면이 영원히 기다린다)의 원인이며,
   * 골든패스에 그 문을 두면 반드시 누군가 그 문으로 들어간다. 필요한 소비자는
   * `DeviceLibraryAdapter.requestPermission()`을 직접 쓴다.
   */
  ensurePermission(): Promise<MediaPermission>;

  fetchPage(
    input?:
      | {
          readonly albumId?: string | null | undefined;
          readonly after?: string | undefined;
          readonly pageSize?: number | undefined; // 기본 60
          readonly kinds?: readonly MediaKind[] | undefined; // 기본 ['image']
        }
      | undefined,
  ): Promise<DeviceAssetPage>;

  /** ⚠ core가 `count > 0` 필터 + count 내림차순 정렬을 **수행한다**(§5.4-④(d)). */
  fetchAlbums(): Promise<readonly DeviceAlbum[]>;

  /**
   * 하드닝된 자산정보 조회 — 그리드/스캐너/업로드가 공유하는 단일 관문(§5.7.5, G9 승격).
   * 기본값은 iCloud 다운로드 없음 + 15s 데드라인, 옵트인 시 60s(§7 하드닝 6).
   * 데드라인 초과는 `MediaError('device-timeout')`이며 어댑터 실패는 그대로 전파된다.
   *
   * ⚠ 이 메서드를 공개하지 않으면 동기화 스캐너가 자체 조회를 짜게 되고, 그 순간 15초 데드라인과
   * `downloadFromNetwork: false` 기본값이 **스캔 경로에서만** 사라진다 — 하드닝 6의 조용한 절반 소멸.
   */
  getAssetInfo(
    assetId: string,
    options?:
      | {
          readonly downloadFromICloud?: boolean | undefined; // 기본 false
          readonly infoTimeoutMs?: number | undefined; // 기본 15_000
          readonly downloadTimeoutMs?: number | undefined; // 기본 60_000
        }
      | undefined,
  ): Promise<DeviceAssetInfo>;

  /**
   * 원본 바이트 위치만 필요한 경로(동기화 엔진)용. 전신 `resolveDeviceAssetSourceForUpload`.
   * iCloud 가드 · 이중 타임아웃 · iOS 캐시 실체화(§7 하드닝 2·6).
   */
  resolveForUpload(
    asset: DeviceAssetRef,
    options?: DeviceResolveOptions | undefined,
  ): Promise<ResolvedDeviceAsset>;

  /**
   * 화면 경로용. 전신 `resolveDeviceAssetForUpload`(G4).
   *
   * ⚠ 후보 목록에 `asset.uri`를 **자동으로 덧붙인다**(전신 devicePhotoLibrary.ts:355-359).
   *   최종 순서: `[info.localUri, info.uri, asset.uri, ...options.extraCandidates]`
   *   이 자동 후보가 §7.1 「정보 조회 실패 시 폴백 후보 생존」 규칙을 실제로 발화시키는 값이다 —
   *   전신 주석 "the picker keeps the original asset.uri"(286-288)가 가리키는 정확한 경로다.
   *   저장된 `asset.uri`는 업로드 파이프라인이 읽을 수 없는 `ph://` 참조일 수 있으므로 원본
   *   바이트와 EXIF를 다시 해석한 뒤 피커 형태로 넘긴다(전신 341-343 주석).
   */
  resolvePickedAsset(
    asset: DeviceAsset,
    options?: DeviceResolveOptions | undefined,
  ): Promise<ResolvedPickedAsset>;
}

export function createDeviceLibrary(input: {
  readonly adapter: DeviceLibraryAdapter;
  readonly files: FileSystemAdapter;
  /**
   * ⚠ **필수 인자다**(§3.1 · §7 하드닝 7). 스테이징 사본을 만드는 주체가 지우는 주체를 반드시
   * 갖게 하려는 것이다. 옵셔널로 두면 "카피는 하는데 지우는 사람이 없는" 조립이 컴파일을 통과하고,
   * 업로드한 모든 사진의 원본 사본이 앱 컨테이너에 영구 축적된다 — 타입도 테스트도 못 잡는다.
   */
  readonly staging: StagingCache;
  readonly platform: PlatformAdapter;
  readonly strings?: MediaStrings | undefined;
  readonly debug?: MediaDebugOptions | undefined;
  // ⚠ telemetry 인자는 **없다**. 전신은 기기 라이브러리 경로에서 의도적으로 방출하지 않으며
  //   (devicePhotoLibraryTelemetry.ts:38-40 주석), 방출 지점 없는 슬롯은 죽은 인자다(§5.1).
}): DeviceLibrary {
  const { adapter, files, staging, platform } = input;
  const strings = input.strings ?? enMediaStrings;
  const debug = createMediaDebugLogger({ platform, options: input.debug });

  const deps: DeviceResolveDeps = { adapter, files, staging, platform, strings, debug };

  return {
    async getPermission(): Promise<MediaPermission> {
      return adapter.getPermission();
    },

    async ensurePermission(): Promise<MediaPermission> {
      // 전신 `ensureMediaPermission`(mediaPermission.ts:22-38)의 3단 규칙 그대로다.
      const current = await adapter.getPermission();
      // ⚠ `canAskAgain === false`면 **요청하지 않는다.** iOS에서 이 상태의 재요청은 아무 일도
      //   일어나지 않는 no-op이고, 호출자는 응답을 기다리며 멈춘다(UI 데드록).
      const permission =
        !current.granted && current.canAskAgain ? await adapter.requestPermission() : current;
      debug.log('permission.checked', {
        granted: permission.granted,
        canAskAgain: permission.canAskAgain,
        limited: permission.limited,
        requested: permission !== current,
      });
      return permission;
    },

    async fetchPage(pageInput): Promise<DeviceAssetPage> {
      const pageSize = pageInput?.pageSize ?? DEVICE_PAGE_SIZE;
      const kinds = pageInput?.kinds ?? DEFAULT_DEVICE_KINDS;
      debug.log('page.fetch.start', {
        albumId: Boolean(pageInput?.albumId),
        after: Boolean(pageInput?.after),
        pageSize,
        kinds,
      });
      // ⚠ 여기서 자산별 `getAssetInfo`를 부르지 않는다(§7.1). 60개 원본을 직렬 해석하면
      //   페이지당 ~20초다. 그리드는 raw uri(iOS `ph://`)를 그대로 그리고, 네이티브 이미지
      //   로더가 PHImageManager에 뷰 크기 썸네일을 요청한다 — 시스템 사진 그리드와 같은 방식이다.
      //   원본 바이트는 업로드 시점의 resolve에서만 해석한다.
      // ⚠ **core는 재정렬하지 않는다**(§5.4-④(d)). 페이지 단위 재정렬은 전역 순서를 보장하지
      //   못하면서 `endCursor`는 여전히 어댑터 순서를 따라가므로, 커서와 표시 순서가 어긋난다 —
      //   원 결함보다 나쁘다. 내림차순은 어댑터의 계약이다(§3.3).
      const page = await adapter.listAssets({
        albumId: pageInput?.albumId,
        after: pageInput?.after,
        pageSize,
        kinds,
      });
      debug.log('page.fetch.done', {
        fetched: page.assets.length,
        hasNextPage: page.hasNextPage,
        totalCount: page.totalCount,
      });
      return page;
    },

    async fetchAlbums(): Promise<readonly DeviceAlbum[]> {
      // 전신 `fetchDeviceAlbumOptions`(devicePhotoLibrary.ts:243-250)의 정책을 core로 승격했다.
      // `listAssets`와 달리 여기서는 core가 강제한다 — 전량을 한 번에 받는 in-memory 목록이라
      // 전역 순서를 보장할 수 있고 비용도 O(n log n)뿐이다. 3자 어댑터가 무엇을 주든 결과가 같아진다.
      const albums = await adapter.listAlbums();
      return [...albums].filter((album) => album.count > 0).sort((a, b) => b.count - a.count);
    },

    async getAssetInfo(assetId, options): Promise<DeviceAssetInfo> {
      return getDeviceAssetInfoWithDeadline({
        adapter,
        strings,
        assetId,
        // ⚠ 기본값 false — 백그라운드 동기화가 예기치 않은 셀룰러 전송을 시작하지 않게(§7 하드닝 6).
        //   레거시 네이티브 API의 기본값은 true였고, 그 기본값이 실제 사고를 냈다.
        downloadFromNetwork: options?.downloadFromICloud ?? false,
        infoTimeoutMs: options?.infoTimeoutMs,
        downloadTimeoutMs: options?.downloadTimeoutMs,
      });
    },

    async resolveForUpload(asset, options): Promise<ResolvedDeviceAsset> {
      return resolveDeviceAssetSource(deps, asset, options?.extraCandidates ?? [], options ?? {});
    },

    async resolvePickedAsset(asset, options): Promise<ResolvedPickedAsset> {
      debug.log('upload-asset.resolve.start', {
        assetId: asset.id,
        fileName: asset.filename,
        width: asset.width,
        height: asset.height,
        // ⚠ 원문 uri를 그대로 로그에 넘기지 않는다 — 반드시 `summarizeUri` 경유다(§7 하드닝 8).
        uri: summarizeUri(asset.uri),
      });
      const resolved = await resolveDeviceAssetSource(
        deps,
        asset,
        // 자동 후보 `asset.uri`가 맨 앞에 온다 — §7.1 [신설] 참조.
        [asset.uri, ...(options?.extraCandidates ?? [])],
        options ?? {},
      );
      return toPickedAsset(asset, resolved);
    },
  };
}
