// 설계 문서 §8.5 — `"./device"`의 **비네이티브 포크**(exports의 `browser` + `node` 조건).
//
// ⚠ **이 파일의 존재 이유는 단 하나: `expo-media-library` import 0.**
//   Metro·webpack·vite는 도달 가능한 그래프만 번들하므로, `"./device"`가 이 파일로 라우팅되는
//   순간 웹·SSR 번들에서 `expo-media-library` 문자열이 사라진다. README의 "웹 번들에
//   expo-media-library가 포함되지 않습니다"를 문서 주장이 아니라 산출물 사실로 만드는 지점이며,
//   `dist-peer-graph`(조건 3세트 × 모듈 2형식)와 `web-export-guard`가 CI에서 단언한다(§10.3).
//
// ⚠ `.web.`은 "브라우저 전용"이 아니라 **"비네이티브"**를 뜻한다(§8.4-7). 같은 산출물이
//   `browser`(클라이언트 번들)와 `node`(SSR·RSC·Node 스크립트) 양쪽에 매핑된다. `node` 브랜치가
//   없으면 `web.output:"static"|"server"` 소비자의 SSR 번들이 네이티브 포크를 끌어와
//   빌드 실패 또는 하이드레이션 불일치가 된다(§8.2 케이스 H 실측).
//
// 이 파일은 `tsconfig.core.json`의 무DOM 소스 가드 **대상**이다(제외 목록에 없다) —
// 열거 결과가 상수뿐이므로 DOM이 필요할 이유가 없고, SSR에서 `document`를 만지면 즉사한다.

import type {
  DeviceAlbum,
  DeviceAssetInfo,
  DeviceAssetPage,
  DeviceLibraryAdapter,
  MediaPermission,
} from '../core/adapters';
import { MediaError } from '../core/errors';
import { enMediaStrings } from '../core/strings';

/** 문구 주입구가 없는 어댑터다(§5.6 시그니처 — 네이티브 포크와 동일해야 한다). 기본 문구를 쓴다. */
const strings = enMediaStrings;

/** 열거 경로의 고정 응답 — 권한이 없다는 사실을 UI가 그릴 수 있어야 하므로 throw하지 않는다(§8.5). */
const DENIED: MediaPermission = { granted: false, canAskAgain: false, limited: false };

/**
 * 빈 페이지. `endCursor` 키를 **넣지 않는다** — `?: string | undefined` 규약(§3.3, G20-14)이라
 * 마지막 페이지에서 키를 명시할 의무가 없고, SSR과 클라이언트가 같은 객체를 만들어야
 * 하이드레이션이 일치한다(§8.5 케이스 H 해소의 부수 효과).
 */
const EMPTY_PAGE: DeviceAssetPage = { assets: [], hasNextPage: false, totalCount: 0 };

/**
 * 비네이티브 기기 라이브러리 어댑터(§8.5).
 *
 * 동작 규약은 두 갈래다:
 *  · **열거·권한 조회** → 빈 결과 / 거부. UI가 "이 플랫폼에선 사용 불가"를 그려야 하므로
 *    throw는 과잉이다.
 *  · **자산 해석(`getAssetInfo`)** → `MediaError('platform-unsupported')`.
 *    전신은 plain `Error("Device photo library is not available on web.")`라 **code로 분기할 수
 *    없었다**(devicePhotoLibrary.web.ts:29). 개선점이다.
 *
 * ⚠ 코어의 `resolveForUpload`/`resolvePickedAsset`도 이 메서드를 거치므로 자동으로
 *   `platform-unsupported`가 된다 — 비네이티브 어댑터의 실패는 core가 이 안정된 공개 코드로
 *   재구성하기 때문이다(§7.1 [개정] 정보 조회 실패 2조건 · resolveSource.ts).
 */
export function expoDeviceLibrary(): DeviceLibraryAdapter {
  return {
    async requestPermission(): Promise<MediaPermission> {
      return DENIED;
    },

    async getPermission(): Promise<MediaPermission> {
      return DENIED;
    },

    async listAssets(): Promise<DeviceAssetPage> {
      return EMPTY_PAGE;
    },

    async listAlbums(): Promise<readonly DeviceAlbum[]> {
      return [];
    },

    async getAssetInfo(): Promise<DeviceAssetInfo> {
      // `platformUnsupported`는 비네이티브 포크의 전용 문구다. 이 어댑터에는 문구 주입구가
      // 없으므로 기본 번들을 사용하고, core는 외부 어댑터의 message를 신뢰하지 않는다.
      throw new MediaError('platform-unsupported', strings.platformUnsupported);
    },
  };
}
