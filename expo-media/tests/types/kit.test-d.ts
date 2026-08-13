// ═══════════════════════════════════════════════════════════════════════════
// 타입 픽스처 — 골든패스 킷(`createMediaKit`) 소관. 설계 문서 §6.3 ②·③·④·⑩ + §10.2.
//
// 이 파일이 지키는 것은 하나다: **애노테이션이 능력을 죽이지 않는다.**
// V3가 실측한 붕괴는 "`const kit: MediaKit = ...` 한 줄에 전 기능이 사라지는" 사고 모드였고,
// 원인은 capability 교차 타입 + 조건부 타입이었다(§0.4 기각 1 · §6.2). 지금 설계는
// `with*`가 **자기 자신을 넓히지 않고 다른 구체 킷을 반환**하므로 조건부 타입이 0이다 —
// 그 사실을 타입 수준에서 못 박는 것이 ②의 역할이다.
//
// ⚠ `@ts-expect-error`는 **전부 실제로 발화해야 한다.** 미발화는 TS2578로 검출된다 —
//   즉 이 파일의 negative 픽스처가 조용히 무력화되는 경로가 없다.
// ═══════════════════════════════════════════════════════════════════════════

import { describe, expectTypeOf, it } from 'vitest';

import { createMediaKit } from '../../src/index';
import type { DeviceKit, MediaKit, MediaKitConfig } from '../../src/index';
import type {
  BinarySourceLoader,
  BinaryUploads,
  DeviceLibrary,
  DeviceLibraryAdapter,
  DeviceUploads,
  FileSystemAdapter,
  HashAdapter,
  LocalPosterAdapter,
  LocalUploads,
  MediaDebugOptions,
  MediaLibrarySaveAdapter,
  MediaSaver,
  MediaStrings,
  MediaTelemetry,
  MediaUploadApi,
  MediaUploadLimits,
  PickerAdapter,
  PickerFlows,
  PlatformAdapter,
  StagingCache,
} from '../../src/core';
import { expoDeviceLibrary } from '../../src/device';

/** 호스트 백엔드가 돌려주는 자산 — `TAsset`은 라이브러리가 해석하지 않는다(§5.1). */
type StoredAsset = { readonly id: string; readonly url: string };

/** 소비자가 자기 브랜드를 꽂는 옵트인 경로(§6.2 — `CollectionId` 브랜드 기각의 대체안). */
type AlbumId = string & { readonly __album: true };

/** 타입 테스트 전용 헬퍼(toss-payments `tests/types` 선례). */
const forge = <T>(): T => undefined as T;

declare const api: MediaUploadApi<StoredAsset>;
declare const limits: MediaUploadLimits;
declare const media: MediaKit<StoredAsset>;
declare const picker: PickerAdapter;
declare const loader: BinarySourceLoader;
declare const saveAdapter: MediaLibrarySaveAdapter;

describe('§6.3-② capability 붕괴 회귀 — 애노테이션해도 능력이 사라지지 않는다', () => {
  it('`DeviceLibraryAdapter`로 애노테이션한 어댑터가 기기 업로드 능력을 그대로 준다', () => {
    // ⚠ 이 한 줄이 V3의 사고 모드다 — 구체 반환 타입을 넓은 계약 타입으로 애노테이션한다.
    //   조건부 타입이 있었다면 여기서 `uploadDeviceAssets`가 소멸했다.
    const adapter: DeviceLibraryAdapter = expoDeviceLibrary();
    expectTypeOf(media.withDeviceLibrary(adapter).uploadDeviceAssets).toBeFunction();
  });

  it('`DeviceKit`으로 애노테이션해도 `DeviceLibrary` + `DeviceUploads` 양쪽이 살아 있다', () => {
    const adapter: DeviceLibraryAdapter = expoDeviceLibrary();
    // 결과를 다시 넓은 타입으로 애노테이션 — 두 번째 붕괴 기회를 준다.
    const device: DeviceKit<StoredAsset> = media.withDeviceLibrary(adapter);
    expectTypeOf(device.getPermission).toBeFunction();
    expectTypeOf(device.ensurePermission).toBeFunction();
    expectTypeOf(device.fetchPage).toBeFunction();
    expectTypeOf(device.fetchAlbums).toBeFunction();
    expectTypeOf(device.getAssetInfo).toBeFunction();
    expectTypeOf(device.resolveForUpload).toBeFunction();
    expectTypeOf(device.resolvePickedAsset).toBeFunction();
    expectTypeOf(device.uploadDeviceAssets).toBeFunction();

    // 구조적으로도 두 계약을 동시에 만족한다(교차 타입이 아니라 인터페이스 확장이다).
    expectTypeOf<DeviceKit<StoredAsset>>().toExtend<DeviceLibrary>();
    expectTypeOf<DeviceKit<StoredAsset>>().toExtend<DeviceUploads<StoredAsset>>();
  });

  it('`MediaKit` 애노테이션이 업로드 4종과 `with*` 3종을 전부 보존한다', () => {
    const kit: MediaKit<StoredAsset> = createMediaKit<StoredAsset>({ api, limits });
    expectTypeOf(kit.uploadLocalFile).toBeFunction();
    expectTypeOf(kit.uploadPickedAsset).toBeFunction();
    expectTypeOf(kit.uploadBinary).toBeFunction();
    expectTypeOf(kit.uploadDropped).toBeFunction();
    expectTypeOf(kit.withPicker).toBeFunction();
    expectTypeOf(kit.withDeviceLibrary).toBeFunction();
    expectTypeOf(kit.withDeviceSave).toBeFunction();
    // 공개 필드 4종(§5.5) — `hasher`는 V9 요구로 공개다.
    expectTypeOf(kit.platform).toEqualTypeOf<PlatformAdapter>();
    expectTypeOf(kit.files).toEqualTypeOf<FileSystemAdapter>();
    expectTypeOf(kit.staging).toEqualTypeOf<StagingCache>();
    expectTypeOf(kit.hasher).toEqualTypeOf<HashAdapter>();

    expectTypeOf<MediaKit<StoredAsset>>().toExtend<LocalUploads<StoredAsset>>();
    expectTypeOf<MediaKit<StoredAsset>>().toExtend<BinaryUploads<StoredAsset>>();
  });

  it('`with*`는 자기 자신을 넓히지 않고 다른 구체 킷을 반환한다(빌더가 아니다 — §6.2)', () => {
    expectTypeOf(media.withPicker).returns.toEqualTypeOf<PickerFlows<StoredAsset, string>>();
    expectTypeOf(media.withDeviceSave).returns.toEqualTypeOf<MediaSaver>();
    expectTypeOf(media.withDeviceLibrary).returns.toEqualTypeOf<DeviceKit<StoredAsset, string>>();
    // `withPicker`의 웹 조립은 `loader`만 받는다 — `uploads`는 킷 자신이 채운다(§5.5).
    expectTypeOf(media.withPicker(picker, { web: { loader } })).toEqualTypeOf<
      PickerFlows<StoredAsset, string>
    >();
    expectTypeOf(media.withDeviceSave(saveAdapter)).toEqualTypeOf<MediaSaver>();
  });

  it('`TCollectionId`에 자기 브랜드 타입을 꽂아도 능력이 그대로다(옵트인 — §6.2)', () => {
    const kit: MediaKit<StoredAsset, AlbumId> = createMediaKit<StoredAsset, AlbumId>({
      api: forge<MediaUploadApi<StoredAsset, AlbumId>>(),
      limits,
    });
    expectTypeOf(kit.uploadDropped).toBeFunction();
    expectTypeOf(kit.withDeviceLibrary(forge<DeviceLibraryAdapter>()).uploadDeviceAssets).toBeFunction();
  });
});

describe('§6.3-③ limits 필수 — 무제한 업로드는 명시된 결정이어야 한다', () => {
  it('limits 누락은 컴파일 에러', () => {
    // @ts-expect-error ③ limits 누락 — 2GB를 전부 PUT한 뒤 413을 받는 경로를 타입이 막는다
    createMediaKit({ api });
  });

  it("`'server-enforced'` 리터럴을 수용한다(§0.4 기각 8 — Infinity 대체)", () => {
    expectTypeOf(createMediaKit({ api, limits: 'server-enforced' })).toEqualTypeOf<
      MediaKit<StoredAsset, string>
    >();
    const policy: MediaUploadLimits | 'server-enforced' = 'server-enforced';
    expectTypeOf(createMediaKit({ api, limits: policy })).toEqualTypeOf<MediaKit<StoredAsset, string>>();
    // 부분 limits(이미지만)도 정상 — 두 종류 모두 옵셔널이다.
    createMediaKit({ api, limits: { image: { maxBytes: 10_000_000 } } });
  });

  it('임의의 문자열은 limits가 아니다', () => {
    // @ts-expect-error 'unlimited'는 `MediaUploadLimits | 'server-enforced'`가 아니다
    createMediaKit({ api, limits: 'unlimited' });
  });

  it('`Number.POSITIVE_INFINITY` 탈출구는 존재하지 않는다(§0.4 기각 8)', () => {
    // @ts-expect-error limits는 숫자가 아니다 — JSON 직렬화 불가 값으로 무제한을 표현할 수 없다
    createMediaKit({ api, limits: Number.POSITIVE_INFINITY });
  });
});

describe('§6.3-④ strings 부분 객체 불가 — 새 키가 조용히 영어로 노출되지 않게', () => {
  it('22키 중 일부만 준 객체는 컴파일 에러', () => {
    createMediaKit({
      api,
      limits,
      // @ts-expect-error ④ `Partial<MediaStrings>`를 받지 않는다(§6.1-⑧)
      strings: { fileNotFound: '없음' },
    });
  });

  it('스프레드 커스텀은 정상 경로다', () => {
    const strings: MediaStrings = { ...forge<MediaStrings>(), fileNotFound: '없음' };
    createMediaKit({ api, limits, strings });
  });
});

describe('§6.3-⑩ EOP 소비자 보호 — undefined를 흘려도 에러가 나지 않는다', () => {
  it('`?: T | undefined` 규약 덕에 옵셔널 전 필드가 명시 undefined를 받는다', () => {
    const maybe: string | undefined = undefined;
    // 이 한 줄이 규약의 존재 이유다 — `?: T`였다면 EOP 하에서 TS2375로 거절된다.
    expectTypeOf(createMediaKit({ api, limits, fileNamePrefix: maybe })).toEqualTypeOf<
      MediaKit<StoredAsset, string>
    >();

    createMediaKit({
      api,
      limits,
      platform: forge<PlatformAdapter | undefined>(),
      files: forge<FileSystemAdapter | undefined>(),
      localTransport: undefined,
      binaryTransport: undefined,
      hasher: forge<HashAdapter | undefined>(),
      poster: forge<LocalPosterAdapter | undefined>(),
      posterAtMs: forge<number | undefined>(),
      namespace: maybe,
      strings: forge<MediaStrings | undefined>(),
      telemetry: forge<MediaTelemetry | undefined>(),
      debug: forge<MediaDebugOptions | undefined>(),
    });
  });

  it('`withPicker`의 옵션 슬롯도 undefined를 흘릴 수 있다', () => {
    media.withPicker(picker, undefined);
    media.withPicker(picker, { web: undefined });
    media.withPicker(picker, { web: forge<{ readonly loader: BinarySourceLoader } | undefined>() });
  });

  it('`MediaKitConfig`의 오버라이드 필드는 전부 개별 교체다(부분 객체가 아니다)', () => {
    // `platform`만 갈아끼우고 나머지는 기본값을 그대로 쓰는 조합이 정상이다(§5.5).
    expectTypeOf<MediaKitConfig<StoredAsset>['platform']>().toEqualTypeOf<PlatformAdapter | undefined>();
    expectTypeOf<MediaKitConfig<StoredAsset>['namespace']>().toEqualTypeOf<string | undefined>();
    // `limits`는 오버라이드가 아니라 필수 결정이다.
    expectTypeOf<MediaKitConfig<StoredAsset>['limits']>().toEqualTypeOf<
      MediaUploadLimits | 'server-enforced'
    >();
  });
});
