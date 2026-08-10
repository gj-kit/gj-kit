// ═══════════════════════════════════════════════════════════════════════════
// 타입 픽스처 — 기기 라이브러리. 설계 문서 §6.3 ①·⑥·⑮·⑯·⑰·⑲ + §10.2.
//
// 이 파일이 지키는 하드닝:
//   ① `staging` 필수 인자 → "카피는 하는데 지우는 사람이 없는" 조립을 봉쇄(§7 하드닝 7).
//   ⑥ `downloadFromNetwork` 필수 인자 → 기본값 결정권이 어댑터에 없다(§7 하드닝 6).
//   ⑰ raw `requestPermission`은 골든패스에 없다 → iOS UI 데드록 재발 방지(§5.4-④(c)).
// 셋 다 **타입이 유일한 방어선**이다 — 런타임 테스트로는 "만들 수 없다"를 증명할 수 없다.
// ═══════════════════════════════════════════════════════════════════════════

import { describe, expectTypeOf, it } from 'vitest';

import {
  createDeviceLibrary,
  createDeviceUploads,
  createStagingCache,
  deviceAssetCapturedAt,
  toPickedAsset,
} from '../../src/core';
import type {
  DeviceAlbum,
  DeviceAsset,
  DeviceAssetInfo,
  DeviceAssetPage,
  DeviceAssetRef,
  DeviceLibrary,
  DeviceLibraryAdapter,
  DeviceResolveOptions,
  DeviceUploads,
  FileSystemAdapter,
  LocalUploads,
  MediaPermission,
  MediaTelemetry,
  PickedAsset,
  PlatformAdapter,
  ResolvedDeviceAsset,
  ResolvedPickedAsset,
  StagingCache,
} from '../../src/core';

type StoredAsset = { readonly id: string };

const forge = <T>(): T => undefined as T;

declare const adapter: DeviceLibraryAdapter;
declare const files: FileSystemAdapter;
declare const platform: PlatformAdapter;
declare const staging: StagingCache;
declare const device: DeviceLibrary;
declare const picked: PickedAsset;

describe('§6.3-① 팩토리 필수 인자 — staging 누락은 컴파일 에러 (하드닝 7 봉쇄)', () => {
  it('`createDeviceLibrary`에서 staging을 빠뜨릴 수 없다', () => {
    // @ts-expect-error ① staging 누락 — 업로드한 모든 사진의 원본 사본이 영구 축적된다
    createDeviceLibrary({ adapter, files, platform });
  });

  it('adapter·files·platform도 각각 필수다', () => {
    // @ts-expect-error adapter 누락
    createDeviceLibrary({ files, platform, staging });
    // @ts-expect-error files 누락 — 캐시 실체화(하드닝 2)의 I/O가 사라진다
    createDeviceLibrary({ adapter, platform, staging });
    // @ts-expect-error platform 누락 — iOS 강제 카피 규칙의 판정 근거가 사라진다
    createDeviceLibrary({ adapter, files, staging });
  });

  it('네 인자를 전부 주면 `DeviceLibrary`가 나온다', () => {
    expectTypeOf(createDeviceLibrary({ adapter, files, platform, staging })).toEqualTypeOf<DeviceLibrary>();
    // EOP: 옵셔널 둘은 명시 undefined를 받는다.
    createDeviceLibrary({ adapter, files, platform, staging, strings: undefined, debug: undefined });
  });

  it('텔레메트리 슬롯은 존재하지 않는다 — 방출 지점 없는 슬롯은 죽은 인자다(§5.1)', () => {
    createDeviceLibrary({
      adapter,
      files,
      platform,
      staging,
      // @ts-expect-error 기기 라이브러리 경로는 텔레메트리를 방출하지 않는다
      telemetry: forge<MediaTelemetry>(),
    });
  });

  it('`createDeviceUploads`도 device·uploads·staging 3종을 전부 요구한다', () => {
    // @ts-expect-error staging 누락 — cleanup 주체 없는 업로드 루프
    createDeviceUploads({ device, uploads: forge<LocalUploads<StoredAsset>>() });
    expectTypeOf(
      createDeviceUploads({ device, uploads: forge<LocalUploads<StoredAsset>>(), staging }),
    ).toEqualTypeOf<DeviceUploads<StoredAsset, string>>();
  });

  it('`createStagingCache`는 namespace·files를 요구한다(문자열 규칙은 런타임 검증)', () => {
    // @ts-expect-error namespace 누락 — 프리픽스 없이 owns() 판정이 성립하지 않는다
    createStagingCache({ files });
    // @ts-expect-error files 누락 — 캐시 디렉토리 판정 주체가 없다
    createStagingCache({ namespace: 'gj-media' });
    expectTypeOf(createStagingCache({ namespace: 'gj-media', files })).toEqualTypeOf<StagingCache>();
  });

  it('`StagingCache`는 브랜드 각인이라 손으로 위조할 수 없다(§5.3 · G14)', () => {
    // @ts-expect-error 브랜드 phantom property가 없는 객체 리터럴은 StagingCache가 아니다
    const forged: StagingCache = {
      prefix: 'gj-media-upload-',
      owns: () => false,
      uriFor: () => null,
      cleanup: async () => {},
    };
    void forged;
  });
});

describe('§6.3-⑥ downloadFromNetwork 필수 인자 (하드닝 6)', () => {
  it('두 번째 인자를 생략할 수 없다 — 어댑터에 기본값 결정권이 없다', () => {
    // @ts-expect-error ⑥ 레거시 API 기본값 true가 무단 셀룰러 전송을 시작한 사고의 봉쇄
    void adapter.getAssetInfo('id');
  });

  it('명시하면 통과한다', () => {
    expectTypeOf(adapter.getAssetInfo('id', { downloadFromNetwork: false })).toEqualTypeOf<
      Promise<DeviceAssetInfo>
    >();
    void adapter.getAssetInfo('id', { downloadFromNetwork: true });
  });

  it('core 쪽 `DeviceLibrary.getAssetInfo`는 정책 옵션이 전부 옵셔널이다', () => {
    void device.getAssetInfo('id');
    void device.getAssetInfo('id', { downloadFromICloud: true });
    void device.getAssetInfo('id', {
      downloadFromICloud: undefined,
      infoTimeoutMs: undefined,
      downloadTimeoutMs: undefined,
    });
    // ⚠ core 옵션의 이름은 `downloadFromICloud`다 — 어댑터의 `downloadFromNetwork`와 다르다.
    //   두 이름이 다른 것이 "정책은 core, 위임은 어댑터"라는 경계의 표현이다(§5.4-④).
    // @ts-expect-error core 옵션에 어댑터 인자 이름을 쓸 수 없다
    void device.getAssetInfo('id', { downloadFromNetwork: true });
  });

  it('`DeviceResolveOptions`는 EOP 규약을 따른다', () => {
    const options: DeviceResolveOptions = {
      downloadFromICloud: undefined,
      onICloudDownload: undefined,
      extraCandidates: undefined,
      infoTimeoutMs: undefined,
      downloadTimeoutMs: undefined,
    };
    void device.resolveForUpload(forge<DeviceAssetRef>(), options);
    // 후보 목록은 null·undefined가 섞여 들어와도 된다(어댑터 응답을 그대로 흘린다).
    void device.resolveForUpload(forge<DeviceAssetRef>(), {
      extraCandidates: ['file:///a.jpg', null, undefined],
    });
    expectTypeOf<DeviceResolveOptions['onICloudDownload']>().toEqualTypeOf<
      ((downloading: boolean) => void) | undefined
    >();
  });
});

describe('§6.3-⑮ 피커 자산의 dedup 키가 컴파일된다 (§3.3-⑥ · G3)', () => {
  it('`asset:${assetId ?? uri}`가 문자열로 성립한다', () => {
    expectTypeOf(`asset:${picked.assetId ?? picked.uri}`).toBeString();
  });

  it('`assetId`가 옵셔널이라는 사실 자체가 폴백 규칙의 근거다', () => {
    expectTypeOf<PickedAsset['assetId']>().toEqualTypeOf<string | undefined>();
    expectTypeOf<PickedAsset['uri']>().toEqualTypeOf<string>();
    // 크기 필드는 신뢰도를 이름으로 표현한다(§7 하드닝 3) — 평평한 `sizeBytes`는 없다.
    expectTypeOf<PickedAsset['verifiedSizeBytes']>().toEqualTypeOf<number | undefined>();
    expectTypeOf<PickedAsset['reportedSizeBytes']>().toEqualTypeOf<number | undefined>();
    // @ts-expect-error 평평한 `sizeBytes`를 두면 하드닝 3의 서열이 다시 사라진다
    void picked.sizeBytes;
    // duration은 **원시값**이다 — 정규화는 core 한 곳에서만 한다(§7 하드닝 4).
    expectTypeOf<PickedAsset['durationRaw']>().toEqualTypeOf<number | undefined>();
    // @ts-expect-error 어댑터가 변환한 `durationMs`를 넘기는 문은 없다(이중 변환 차단)
    void picked.durationMs;
  });
});

describe('§6.3-⑯ 기기 자산 → 피커 자산 재조립이 공개 경로로 가능하다 (§5.4-④ · G4)', () => {
  it('`toPickedAsset` 반환은 `PickedAsset & { staged: boolean }`이다', () => {
    expectTypeOf(toPickedAsset).returns.toExtend<PickedAsset & { staged: boolean }>();
    expectTypeOf(toPickedAsset).returns.toEqualTypeOf<ResolvedPickedAsset>();
    expectTypeOf<ResolvedPickedAsset>().toExtend<PickedAsset>();
    expectTypeOf<ResolvedPickedAsset['staged']>().toEqualTypeOf<boolean>();
  });

  it('입력은 `DeviceAsset` + `ResolvedDeviceAsset` 쌍이다 — 캐스트도 뒷문도 필요 없다', () => {
    expectTypeOf(toPickedAsset).parameters.toEqualTypeOf<[DeviceAsset, ResolvedDeviceAsset]>();
    expectTypeOf(device.resolvePickedAsset).returns.toEqualTypeOf<Promise<ResolvedPickedAsset>>();
    expectTypeOf(device.resolveForUpload).returns.toEqualTypeOf<Promise<ResolvedDeviceAsset>>();
    // `ResolvedDeviceAsset.exif`는 **null 가능**이고 `PickedAsset.exif`는 undefined다 —
    // 그 정규화가 `toPickedAsset`의 존재 이유 중 하나다(EOP 하에서 null 대입은 TS2322).
    expectTypeOf<ResolvedDeviceAsset['exif']>().toEqualTypeOf<Readonly<
      Record<string, unknown>
    > | null>();
    expectTypeOf<PickedAsset['exif']>().toEqualTypeOf<Readonly<Record<string, unknown>> | undefined>();
  });

  it('`deviceAssetCapturedAt`은 ISO 또는 null이다(에폭 0은 촬영 시각이 아니다)', () => {
    expectTypeOf(deviceAssetCapturedAt).returns.toEqualTypeOf<string | null>();
    void deviceAssetCapturedAt({ creationTime: undefined });
    void deviceAssetCapturedAt(forge<DeviceAsset>());
  });
});

describe('§6.3-⑰ raw requestPermission은 DeviceLibrary 공개 표면에 없다 (§5.4-④(c) · G17)', () => {
  it('합성 규칙을 우회하는 raw 요청은 골든패스에 없다', () => {
    // @ts-expect-error ⑰ `canAskAgain`을 무시하는 재요청이 iOS UI 데드록의 원인이다
    void device.requestPermission();
  });

  it('공개된 것은 조회(`getPermission`)와 합성(`ensurePermission`) 둘뿐이다', () => {
    expectTypeOf(device.getPermission).returns.toEqualTypeOf<Promise<MediaPermission>>();
    expectTypeOf(device.ensurePermission).returns.toEqualTypeOf<Promise<MediaPermission>>();
    // 필요한 소비자는 어댑터를 직접 쓴다 — 문은 있되 골든패스가 아니다.
    expectTypeOf(adapter.requestPermission).returns.toEqualTypeOf<Promise<MediaPermission>>();
  });
});

describe('§6.3-⑲ endCursor는 EOP 규약을 따른다 (§3.3 · G20-14)', () => {
  it('값 없는 마지막 페이지에서 키를 명시하지 않아도 된다', () => {
    const page: DeviceAssetPage = { assets: [], hasNextPage: false, totalCount: 0 };
    void page;
  });

  it('명시 undefined도 통과한다 — 3자 어댑터 구현자 보호', () => {
    const page: DeviceAssetPage = {
      assets: [],
      endCursor: undefined,
      hasNextPage: false,
      totalCount: 0,
    };
    void page;
    expectTypeOf<DeviceAssetPage['endCursor']>().toEqualTypeOf<string | undefined>();
  });

  it('hasNextPage·totalCount는 필수다 — 무한스크롤의 종료 조건이기 때문이다', () => {
    // @ts-expect-error hasNextPage 누락
    const page: DeviceAssetPage = { assets: [], totalCount: 0 };
    void page;
  });

  it('`DeviceAssetRef`는 id + filename 두 필드뿐이다(동기화 큐가 저장해 두고 넘긴다)', () => {
    expectTypeOf<DeviceAssetRef>().toEqualTypeOf<{
      readonly id: string;
      readonly filename: string;
    }>();
    // `DeviceAsset`은 그것을 구조적으로 만족한다.
    expectTypeOf<DeviceAsset>().toExtend<DeviceAssetRef>();
    expectTypeOf<DeviceAlbum>().toEqualTypeOf<{
      readonly id: string;
      readonly title: string;
      readonly count: number;
    }>();
  });
});
