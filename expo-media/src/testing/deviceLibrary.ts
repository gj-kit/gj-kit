// 설계 문서 §5.6 `"./testing"` — 기기 라이브러리 어댑터 페이크.
//
// 이 페이크는 §3.3이 어댑터에 요구한 **순수 위임**을 그대로 흉내 낸다. 정책을 하나도 갖지 않는
// 것이 핵심이다:
//   · 권한을 "언제 요청할지" 판단하지 않는다 → `ensurePermission`의 3단 규칙(§5.4-④(c))이
//     core에 있음을 유닛이 직접 증명한다(`calls.requestPermission` 횟수가 증거).
//   · `listAlbums`를 필터·정렬하지 않는다 → core가 `count > 0` 필터와 count 내림차순을
//     수행한다는 §5.4-④(d)가 검증 가능해진다. 페이크가 미리 정렬하면 그 단언이 무의미해진다.
//   · `listAssets`를 재정렬하지 않는다 → "core는 재정렬하지 않는다"의 직접 증거가 된다.
//   · 타임아웃을 걸지 않는다 → 15s/60s 데드라인이 core 소관임을 `hangInfo`로 증명한다.
//
// ⚠ peer 0 · DOM 0. 타이머도 쓰지 않는다 — 데드라인 검증은 **응답하지 않는 promise**(`hangInfo`)와
//   vitest 가짜 타이머의 조합으로 한다. 페이크가 자체 타이머를 갖는 순간 무엇을 재는지 흐려진다.

import type {
  DeviceAlbum,
  DeviceAsset,
  DeviceAssetInfo,
  DeviceAssetPage,
  DeviceLibraryAdapter,
  MediaKind,
  MediaPermission,
} from '../core/adapters';

const GRANTED: MediaPermission = { granted: true, canAskAgain: true, limited: false };

export type FakeDeviceLibraryOptions = {
  /** 열거 대상. ⚠ **주어진 순서를 그대로 유지한다** — 정렬 계약의 주인은 어댑터다(§3.3). */
  readonly assets?: readonly DeviceAsset[] | undefined;
  /** ⚠ `count: 0` 앨범과 뒤섞인 순서를 일부러 줄 수 있어야 한다(§7.1 unit 2케이스). */
  readonly albums?: readonly DeviceAlbum[] | undefined;
  /** albumId → 그 앨범에 속한 자산 id. 없으면 `albumId` 필터는 무시된다. */
  readonly albumAssets?: Readonly<Record<string, readonly string[]>> | undefined;
  /** `getPermission()` 결과. 기본 허용. */
  readonly permission?: MediaPermission | undefined;
  /** `requestPermission()` 결과. 기본은 `permission`과 동일. */
  readonly requestedPermission?: MediaPermission | undefined;
  /**
   * true면 원본이 iCloud에만 있다고 보고한다 — 단, `downloadFromNetwork: true`로 조회하면
   * 해소된다. 그래야 §7 하드닝 6의 "옵트인 → 60s 데드라인 → 재조회" 흐름이 실제로 돈다.
   */
  readonly networkOnly?: boolean | undefined;
  /** assetId별 EXIF. 기기 경로의 EXIF가 `PickedAsset.exif`까지 흐르는지 검증한다. */
  readonly assetExif?: Readonly<Record<string, Readonly<Record<string, unknown>>>> | undefined;
  /** assetId별 `DeviceAssetInfo` 전체 치환. 후보 순서(localUri → uri)를 직접 조작할 때 쓴다. */
  readonly assetInfo?: Readonly<Record<string, DeviceAssetInfo>> | undefined;
  /**
   * `getAssetInfo`가 **영영 응답하지 않는다**. §7 하드닝 6의 15s/60s 데드라인이 core에 있음을
   * 가짜 타이머로 검증하는 유일한 수단이다.
   */
  readonly hangInfo?: boolean | undefined;
  /**
   * `getAssetInfo`가 이 값을 throw한다.
   * ⚠ §7.1 「정보 조회 실패 2조건」의 ②(어댑터 raw 예외)를 만드는 주입구다. `MediaError`를 주면
   *   ①(후보 유무와 무관하게 항상 재throw)도 같은 손잡이로 검증된다.
   */
  readonly failInfoWith?: unknown;
};

export interface FakeDeviceLibrary extends DeviceLibraryAdapter {
  readonly calls: {
    readonly getPermission: number;
    /** ⚠ iOS UI 데드록 차단(`canAskAgain:false` → 요청 0회)의 직접 증거다(§7.1). */
    readonly requestPermission: number;
    readonly listAssets: readonly {
      readonly albumId?: string | null | undefined;
      readonly after?: string | undefined;
      readonly pageSize: number;
      readonly kinds: readonly MediaKind[];
    }[];
    readonly listAlbums: number;
    readonly getAssetInfo: readonly {
      readonly assetId: string;
      readonly downloadFromNetwork: boolean;
    }[];
  };
}

type MutableCalls = {
  getPermission: number;
  requestPermission: number;
  listAssets: {
    readonly albumId?: string | null | undefined;
    readonly after?: string | undefined;
    readonly pageSize: number;
    readonly kinds: readonly MediaKind[];
  }[];
  listAlbums: number;
  getAssetInfo: { readonly assetId: string; readonly downloadFromNetwork: boolean }[];
};

export function createFakeDeviceLibrary(
  options?: FakeDeviceLibraryOptions | undefined,
): FakeDeviceLibrary {
  const assets = options?.assets ?? [];
  const albums = options?.albums ?? [];
  const permission = options?.permission ?? GRANTED;
  const requestedPermission = options?.requestedPermission ?? permission;
  const byId = new Map(assets.map((asset) => [asset.id, asset] as const));

  const calls: MutableCalls = {
    getPermission: 0,
    requestPermission: 0,
    listAssets: [],
    listAlbums: 0,
    getAssetInfo: [],
  };

  return {
    calls,

    getPermission() {
      calls.getPermission += 1;
      return Promise.resolve(permission);
    },

    requestPermission() {
      calls.requestPermission += 1;
      return Promise.resolve(requestedPermission);
    },

    listAssets(input): Promise<DeviceAssetPage> {
      calls.listAssets.push(input);
      const kinds = new Set(input.kinds);
      const albumIds = input.albumId ? options?.albumAssets?.[input.albumId] : undefined;
      const matching = assets.filter(
        (asset) => kinds.has(asset.mediaType) && (!albumIds || albumIds.includes(asset.id)),
      );
      // 커서는 "다음 페이지의 시작 인덱스"를 문자열로 담는다 — 실제 MediaLibrary의 불투명
      // 커서와 같은 계약(코어는 값을 해석하지 않고 그대로 되돌려준다)이다.
      const parsed = input.after === undefined ? 0 : Number(input.after);
      const start = Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
      const page = matching.slice(start, start + input.pageSize);
      const next = start + page.length;
      const hasNextPage = next < matching.length;
      return Promise.resolve({
        // ⚠ 재정렬하지 않는다 — 위 머리말 참조.
        assets: page,
        ...(hasNextPage ? { endCursor: String(next) } : {}),
        hasNextPage,
        totalCount: matching.length,
      });
    },

    listAlbums() {
      calls.listAlbums += 1;
      // ⚠ 필터·정렬 금지(§3.3). 준 그대로 돌려준다.
      return Promise.resolve(albums);
    },

    getAssetInfo(assetId, input): Promise<DeviceAssetInfo> {
      calls.getAssetInfo.push({ assetId, downloadFromNetwork: input.downloadFromNetwork });
      // ⚠ 영영 settle하지 않는 promise — core의 데드라인만이 이것을 끝낼 수 있다.
      if (options?.hangInfo) return new Promise<DeviceAssetInfo>(() => {});
      if (options?.failInfoWith !== undefined) return Promise.reject(options.failInfoWith);

      const override = options?.assetInfo?.[assetId];
      if (override) return Promise.resolve(override);

      const asset = byId.get(assetId);
      return Promise.resolve({
        localUri: asset?.uri,
        uri: asset?.uri,
        exif: options?.assetExif?.[assetId],
        // 옵트인 조회에서는 해소된다 — 그래야 "다운로드 후 재조회" 흐름이 성립한다.
        isNetworkAsset: Boolean(options?.networkOnly) && !input.downloadFromNetwork,
      });
    },
  };
}
