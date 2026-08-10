// 설계 문서 §5.6 `"./device"` — `DeviceLibraryAdapter`의 expo 구현.
//
// 전신 `packages/photo-kit/src/devicePhotoLibrary.ts` + `mediaPermission.ts`에서 **네이티브 호출만**
// 남긴 것이다. 정책(권한 합성 규칙 · 15s/60s 데드라인 · iCloud 기본값 · 앨범 필터·정렬 · 스테이징
// 카피)은 전부 `src/core/device/**`로 올라갔다(§5.4-④(c)). 그렇게 한 이유는 하나다 —
// **정책이 어댑터에 있으면 3자 어댑터마다 규칙이 갈리고, 갈린 규칙은 타입도 가드도 잡지 못한다.**
// 여기 남는 것은 "네이티브 응답 → 계약 타입" 매핑뿐이다.
//
// ⚠ Expo SDK 56 함정: 레거시 API는 반드시 `expo-media-library/legacy`에서 와야 한다.
//   `56.0.5`가 패치 릴리스로 `legacy` 서브패스를 분리했다(그래서 peer 하한이 `>=56.0.5`다 — §2.3).

import * as MediaLibrary from 'expo-media-library/legacy';

import type {
  DeviceAlbum,
  DeviceAsset,
  DeviceAssetInfo,
  DeviceAssetPage,
  DeviceLibraryAdapter,
  MediaKind,
  MediaPermission,
} from '../core/adapters';

/**
 * §7 하드닝 5 — 전신 `mediaPermission.ts:6-14` 주석 전문 이전:
 *
 *   "기기 미디어 플로우는 시각 미디어만 필요하다. **Android 13+에서 이 목록을 생략하면**
 *    expo-media-library가 매니페스트에 선언된 **모든** 권한을 대상으로 삼는다. 특히 거부된
 *    READ_MEDIA_AUDIO 하나가 유효한 '사진 및 동영상' 허용을 거부처럼 보이게 만든다
 *    (Android의 '선택한 사진' 접근 모드 포함)."
 *
 * 즉 목록 누락은 **크래시가 아니라 오판정**으로 나타난다 — 그리드가 빈 채로 "권한 없음"을
 * 그리고, 사용자는 이미 허용해 둔 권한을 다시 허용할 방법이 없다.
 * `hardening-guard` ②가 `src/device/**`의 `get/requestPermissionsAsync(` 호출에 이 목록을 강제한다.
 */
const DEVICE_MEDIA_PERMISSIONS: MediaLibrary.GranularPermission[] = ['photo', 'video'];

/** 네이티브 권한 응답 → 계약 타입. `accessPrivileges === 'limited'`(iOS "선택된 사진") 매핑이 어댑터의 몫이다(§3.3). */
function toPermission(response: MediaLibrary.PermissionResponse): MediaPermission {
  return {
    granted: response.granted,
    canAskAgain: response.canAskAgain,
    limited: response.accessPrivileges === 'limited',
  };
}

function toMediaTypes(kinds: readonly MediaKind[]): MediaLibrary.MediaTypeValue[] {
  return kinds.map((kind) =>
    kind === 'video' ? MediaLibrary.MediaType.video : MediaLibrary.MediaType.photo,
  );
}

/**
 * 역매핑. `MediaKind`는 2종(image·video)뿐이므로 `'video'`만 명시하고 나머지는 image로 접는다 —
 * 우리가 `mediaType` 필터를 걸고 조회하므로 `audio`·`unknown`은 도달하지 않으며,
 * iOS의 `pairedVideo`(라이브 포토의 동영상 짝)는 사진으로 다루는 것이 맞다.
 */
function toMediaKind(mediaType: MediaLibrary.MediaTypeValue): MediaKind {
  return mediaType === MediaLibrary.MediaType.video ? 'video' : 'image';
}

function toDeviceAsset(asset: MediaLibrary.Asset): DeviceAsset {
  return {
    id: asset.id,
    filename: asset.filename,
    // ⚠ raw uri를 그대로 넘긴다(iOS는 `ph://`). 그리드는 이 값을 그대로 그린다 — 아래 참조.
    uri: asset.uri,
    width: asset.width,
    height: asset.height,
    mediaType: toMediaKind(asset.mediaType),
    creationTime: asset.creationTime,
  };
}

/**
 * expo 기기 라이브러리 어댑터(§5.6).
 *
 * peer: `expo-media-library`(`/legacy` 서브패스). `"."`·`"./core"`는 이 모듈을 **문자열로도**
 * 참조하지 않으므로, 소비자가 `"./device"`를 import하지 않으면 Metro는 이 peer의 해석을
 * 시도조차 하지 않는다(§3.2 — `dist-peer-graph` 가드가 CI에서 단언한다).
 */
export function expoDeviceLibrary(): DeviceLibraryAdapter {
  return {
    async requestPermission(): Promise<MediaPermission> {
      // ⚠ **순수 위임이다.** "언제 요청할 것인가"(조회 → `!granted && canAskAgain`일 때만 요청)는
      //   코어의 `DeviceLibrary.ensurePermission()`이 소유한다(§5.4-④(c), G17). 여기에 두면
      //   iOS에서 `canAskAgain=false`인데 재요청해 아무 일도 일어나지 않는 **UI 데드록**이 재발한다.
      // writeOnly=false + granular 목록 — 두 인자 모두 생략 금지(위 상수 주석).
      const response = await MediaLibrary.requestPermissionsAsync(false, DEVICE_MEDIA_PERMISSIONS);
      return toPermission(response);
    },

    async getPermission(): Promise<MediaPermission> {
      const response = await MediaLibrary.getPermissionsAsync(false, DEVICE_MEDIA_PERMISSIONS);
      return toPermission(response);
    },

    async listAssets(input): Promise<DeviceAssetPage> {
      const page = await MediaLibrary.getAssetsAsync({
        first: input.pageSize,
        // 값이 없을 때 키 자체를 넘기지 않는다 — 전신 `devicePhotoLibrary.ts:217-218`의 조건부
        // 스프레드 보존. `after: undefined`를 넘기면 SDK가 이를 "커서 있음"으로 오해할 여지가 있다.
        ...(input.after ? { after: input.after } : {}),
        ...(input.albumId ? { album: input.albumId } : {}),
        mediaType: toMediaTypes(input.kinds),
        // ⚠ **정렬 계약: creationTime 내림차순(최신 우선)** — 전신 `devicePhotoLibrary.ts:220`.
        //   코어는 재정렬하지 않는다. 페이지 단위 재정렬은 전역 순서를 보장하지 못하면서
        //   `endCursor`는 여전히 어댑터 순서를 따라가므로 **그리드 표시 순서와 무한스크롤 커서가
        //   함께 어긋난다**(§5.4-④(d)). 타입도 가드도 그 어긋남은 잡지 못하므로
        //   `hardening-guard` ⑦이 이 리터럴(`SortBy.creationTime` + `false`)의 존재를 정적으로 강제한다.
        sortBy: [[MediaLibrary.SortBy.creationTime, false]],
      });
      // ⚠ **자산별 원본 정보 조회를 여기서 하지 않는다**(§7.1 · hardening-guard ⑤).
      //   전신 주석: "60개 원본을 직렬 해석하면 페이지당 ~20초다. 그리드 썸네일은 raw asset.uri
      //   (iOS `ph://`)를 그대로 그려야 하며, 네이티브 이미지 로더가 PHImageManager에 뷰 크기
      //   썸네일을 요청한다 — 시스템 사진 그리드와 같은 방식이다. 원본 바이트는 업로드 시점의
      //   resolve에서만 해석한다."
      return {
        assets: page.assets.map(toDeviceAsset),
        endCursor: page.endCursor,
        hasNextPage: page.hasNextPage,
        totalCount: page.totalCount,
      };
    },

    async listAlbums(): Promise<readonly DeviceAlbum[]> {
      // ⚠ 원본 목록을 **그대로** 반환한다 — 필터·정렬 금지(§3.3).
      //   `count > 0` 필터와 count 내림차순은 코어의 `fetchAlbums`가 수행한다
      //   (전신 `devicePhotoLibrary.ts:243-250`의 정책을 코어로 승격). 여기서 한 번 더 하면
      //   3자 어댑터와 결과가 갈린다.
      const albums = await MediaLibrary.getAlbumsAsync();
      return albums.map((album) => ({
        id: album.id,
        title: album.title,
        count: album.assetCount,
      }));
    },

    async getAssetInfo(assetId, input): Promise<DeviceAssetInfo> {
      // ⚠ `downloadFromNetwork`는 **필수 인자**이며 여기서 기본값을 만들지 않는다(§6.1-④).
      //   레거시 API의 `shouldDownloadFromNetwork` 기본값은 `true`이고, 그 기본값이 실제로
      //   iCloud 원본의 무단 셀룰러 다운로드 사고를 냈다. 기본값 결정권은 코어에 있다(기본 false).
      //   타임아웃(15s/60s)도 코어가 건다 — 어댑터는 순수 위임이다(§7 하드닝 6).
      const info = await MediaLibrary.getAssetInfoAsync(assetId, {
        shouldDownloadFromNetwork: input.downloadFromNetwork,
      });
      return {
        localUri: info.localUri,
        uri: info.uri,
        exif: info.exif as Readonly<Record<string, unknown>> | undefined,
        // ⚠ `isNetworkAsset`은 iOS 전용이며 `shouldDownloadFromNetwork:false`일 때만 채워진다.
        //   부재를 `false`로 접는 것이 전신 동작이다(`devicePhotoLibrary.ts:279`).
        isNetworkAsset: info.isNetworkAsset ?? false,
      };
    },
  };
}
