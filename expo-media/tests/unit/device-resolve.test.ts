// 설계 문서 §7 하드닝 2(PhotoKit ph:// 핸드오프) · 하드닝 6(iCloud + 이중 타임아웃) ·
// §7.1(정보 조회 실패 2조건 · 자동 후보).
//
// ⚠ 전신에서는 이 정책들이 네이티브 모듈을 직접 import하는 함수 안에 있어 **앱 jest 경유
//   간접 검증뿐**이었다. I/O를 어댑터로 밀어내면서 여기 있는 것들이 처음으로 페이크 fs 위에서
//   직접 단언된다 — 특히 `files.copy` **호출 횟수**는 전신에서 관측 자체가 불가능했다.

import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  DeviceAsset,
  DeviceAssetInfo,
  DeviceLibraryAdapter,
  MediaPlatform,
} from '../../src/core/adapters';
import { MediaError, mediaErrorCode } from '../../src/core/errors';
import { createDeviceLibrary } from '../../src/core/device/deviceLibrary';
import { createStagingCache } from '../../src/core/staging';
import type { FakeDeviceLibraryOptions } from '../../src/testing';
import {
  createFakeDeviceLibrary,
  createMemoryFileSystem,
  fakeBytes,
  fakePlatform,
  signedUrlErrorMessage,
} from '../../src/testing';

const FILE_URI = 'file:///dcim/IMG_0001.jpg';
const PH_URI = 'ph://A1/L0/001';
const STAGED_URI = 'file:///cache/gj-media-upload-A1.jpg';

const ASSET: DeviceAsset = {
  id: 'A1',
  filename: 'IMG_0001.jpg',
  uri: PH_URI,
  width: 4032,
  height: 3024,
  mediaType: 'image',
};

function setup(options?: {
  readonly os?: MediaPlatform;
  readonly info?: DeviceAssetInfo;
  readonly library?: FakeDeviceLibraryOptions;
  readonly cacheDirectory?: string | null;
  readonly adapter?: (fake: DeviceLibraryAdapter) => DeviceLibraryAdapter;
}) {
  const files = createMemoryFileSystem({
    files: { [FILE_URI]: fakeBytes(1234) },
    ...(options?.cacheDirectory === undefined ? {} : { cacheDirectory: options.cacheDirectory }),
  });
  const fake = createFakeDeviceLibrary({
    assets: [ASSET],
    ...(options?.info ? { assetInfo: { A1: options.info } } : {}),
    ...options?.library,
  });
  const adapter = options?.adapter ? options.adapter(fake) : fake;
  const staging = createStagingCache({ namespace: 'gj-media', files });
  const device = createDeviceLibrary({
    adapter,
    files,
    staging,
    platform: fakePlatform(options?.os ?? 'ios'),
  });
  return { files, fake, device, staging };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('normalizeUploadUri — ph:// 핸드오프(§7 하드닝 2)', () => {
  it('① ios + ph:// (그 외 후보 있음) → ph는 건너뛰고 file 후보를 캐시로 카피한다', async () => {
    const { files, device } = setup({
      os: 'ios',
      info: { localUri: PH_URI, uri: PH_URI, isNetworkAsset: false },
    });

    const resolved = await device.resolveForUpload(ASSET, { extraCandidates: [FILE_URI] });

    // ⚠ `ph://` 후보에는 copy를 **시도조차** 하지 않는다 — from이 그 증거다.
    expect(files.calls.copy).toEqual([{ from: FILE_URI, to: STAGED_URI }]);
    expect(resolved).toEqual({
      uri: STAGED_URI,
      verifiedSizeBytes: 1234,
      exif: null,
      staged: true,
    });
  });

  it('② android + file:// → 카피 없이 직행한다', async () => {
    const { files, device } = setup({
      os: 'android',
      info: { localUri: FILE_URI, isNetworkAsset: false },
    });

    const resolved = await device.resolveForUpload(ASSET);

    expect(files.calls.copy).toEqual([]);
    expect(resolved).toMatchObject({ uri: FILE_URI, staged: false });
    expect(resolved.verifiedSizeBytes).toBeUndefined();
  });

  it('③ ios + file:// → 그래도 반드시 카피한다 (전신 규칙)', async () => {
    const { files, device } = setup({
      os: 'ios',
      info: { localUri: FILE_URI, isNetworkAsset: false },
    });

    const resolved = await device.resolveForUpload(ASSET);

    // MediaLibrary의 iOS localUri는 사진 라이브러리 안을 가리켜 stat은 되지만 URLSession을 죽인다.
    expect(files.calls.copy).toEqual([{ from: FILE_URI, to: STAGED_URI }]);
    expect(resolved.staged).toBe(true);
    expect(files.read(STAGED_URI)).not.toBeNull();
  });

  it('④ 첫 후보 카피 실패 → 다음 후보를 시도한다', async () => {
    const { files, device } = setup({
      os: 'ios',
      info: { localUri: 'file:///missing.jpg', uri: FILE_URI, isNetworkAsset: false },
    });

    const resolved = await device.resolveForUpload(ASSET);

    expect(files.calls.copy.map((call) => call.from)).toEqual(['file:///missing.jpg', FILE_URI]);
    expect(resolved.uri).toBe(STAGED_URI);
  });

  it('⑤ ph:// 단독 후보 → files.copy 0회 + device-not-found', async () => {
    const { files, device } = setup({
      os: 'ios',
      info: { localUri: PH_URI, uri: PH_URI, isNetworkAsset: false },
    });

    const error = await device.resolveForUpload(ASSET).catch((thrown: unknown) => thrown);

    // ⚠ 스킵 규칙의 유일한 직접 증거. 스킵이 없으면 copy가 불리고 **실패 종류가 달라진다**.
    expect(files.calls.copy).toEqual([]);
    expect(mediaErrorCode(error)).toBe('device-not-found');
  });

  it('쓸 수 있는 캐시 디렉토리가 없으면 카피할 자리가 없어 device-not-found', async () => {
    const { files, device } = setup({
      os: 'ios',
      cacheDirectory: null,
      info: { localUri: FILE_URI, isNetworkAsset: false },
    });

    const error = await device.resolveForUpload(ASSET).catch((thrown: unknown) => thrown);

    expect(files.calls.copy).toEqual([]);
    expect(mediaErrorCode(error)).toBe('device-not-found');
  });

  it('카피 결과가 0바이트면 verifiedSizeBytes를 채우지 않는다 — 다음 순위로 내려가게', async () => {
    const files = createMemoryFileSystem({ files: { 'file:///dcim/empty.jpg': new Uint8Array(0) } });
    const staging = createStagingCache({ namespace: 'gj-media', files });
    const device = createDeviceLibrary({
      adapter: createFakeDeviceLibrary({
        assets: [ASSET],
        assetInfo: { A1: { localUri: 'file:///dcim/empty.jpg', isNetworkAsset: false } },
      }),
      files,
      staging,
      platform: fakePlatform('ios'),
    });

    const resolved = await device.resolveForUpload(ASSET);

    expect(resolved.staged).toBe(true);
    expect(resolved.verifiedSizeBytes).toBeUndefined();
  });
});

describe('iCloud 원본(§7 하드닝 6)', () => {
  it('기본 조회는 downloadFromNetwork:false로 나간다 — 무단 셀룰러 전송 차단', async () => {
    const { fake, device } = setup({
      os: 'android',
      info: { localUri: FILE_URI, isNetworkAsset: false },
    });

    await device.resolveForUpload(ASSET);

    expect(fake.calls.getAssetInfo).toEqual([{ assetId: 'A1', downloadFromNetwork: false }]);
  });

  it('iCloud 전용 + 옵트인 없음 → device-icloud-only (다운로드를 시작하지 않는다)', async () => {
    const { fake, device } = setup({ os: 'android', library: { networkOnly: true } });

    const error = await device.resolveForUpload(ASSET).catch((thrown: unknown) => thrown);

    expect(mediaErrorCode(error)).toBe('device-icloud-only');
    expect(fake.calls.getAssetInfo).toHaveLength(1);
  });

  it('옵트인하면 재조회하고 onICloudDownload가 true·false 쌍으로 호출된다', async () => {
    // 다운로드가 끝난 뒤의 재조회에서 로컬 원본이 보이는 상황을 만든다.
    const { fake, device } = setup({
      os: 'android',
      library: { assets: [{ ...ASSET, uri: FILE_URI }], networkOnly: true },
    });
    const events: boolean[] = [];

    const resolved = await device.resolveForUpload(ASSET, {
      downloadFromICloud: true,
      onICloudDownload: (downloading) => events.push(downloading),
    });

    expect(fake.calls.getAssetInfo).toEqual([
      { assetId: 'A1', downloadFromNetwork: false },
      { assetId: 'A1', downloadFromNetwork: true },
    ]);
    expect(events).toEqual([true, false]);
    expect(resolved.uri).toBe(FILE_URI);
  });

  it('정보 조회 15s 데드라인 → device-timeout', async () => {
    vi.useFakeTimers();
    const { device } = setup({ os: 'ios', library: { hangInfo: true } });

    const pending = device.resolveForUpload(ASSET);
    const assertion = expect(pending).rejects.toMatchObject({
      code: 'device-timeout',
      message: 'Reading the original photo information is taking too long.',
    });
    await vi.advanceTimersByTimeAsync(15_000);
    await assertion;
  });

  it('데드라인 직전에 응답하면 성공한다 (타이머가 정리된다)', async () => {
    vi.useFakeTimers();
    const { device } = setup({
      os: 'android',
      info: { localUri: FILE_URI, isNetworkAsset: false },
    });

    const pending = device.resolveForUpload(ASSET);
    await vi.advanceTimersByTimeAsync(14_999);
    await expect(pending).resolves.toMatchObject({ uri: FILE_URI });
  });

  it('iCloud 다운로드는 60s 데드라인이며 onICloudDownload(false)가 finally로 보장된다', async () => {
    vi.useFakeTimers();
    const events: boolean[] = [];
    const { device } = setup({
      os: 'android',
      library: { networkOnly: true },
      // 첫 조회는 응답하고, 다운로드 조회만 영영 매달린다.
      adapter: (fake) => ({
        ...fake,
        getAssetInfo: (assetId, input) =>
          input.downloadFromNetwork
            ? new Promise<DeviceAssetInfo>(() => {})
            : fake.getAssetInfo(assetId, input),
      }),
    });

    const pending = device.resolveForUpload(ASSET, {
      downloadFromICloud: true,
      onICloudDownload: (downloading) => events.push(downloading),
    });
    const assertion = expect(pending).rejects.toMatchObject({
      code: 'device-timeout',
      message:
        'Fetching the original from iCloud is taking too long. Check your network and try again.',
    });
    await vi.advanceTimersByTimeAsync(60_000);
    await assertion;
    // ⚠ 꺼지지 않으면 화면이 영구히 스피너를 문다.
    expect(events).toEqual([true, false]);
  });

  it('getAssetInfo() 단독 진입점도 같은 기본값과 데드라인을 쓴다(§5.7.5)', async () => {
    const { fake, device } = setup({ os: 'ios', info: { localUri: FILE_URI, isNetworkAsset: false } });
    await device.getAssetInfo('A1');
    expect(fake.calls.getAssetInfo).toEqual([{ assetId: 'A1', downloadFromNetwork: false }]);

    vi.useFakeTimers();
    const hanging = setup({ os: 'ios', library: { hangInfo: true } });
    const pending = hanging.device.getAssetInfo('A1', { downloadFromICloud: true });
    const assertion = expect(pending).rejects.toMatchObject({ code: 'device-timeout' });
    // 옵트인 조회는 60s다 — 15s에는 아직 살아 있다.
    await vi.advanceTimersByTimeAsync(15_000);
    await vi.advanceTimersByTimeAsync(45_000);
    await assertion;
  });
});

describe('정보 조회 실패 2조건(§7.1 [개정])', () => {
  it('① core가 만든 deadline은 후보가 있어도 항상 재throw된다 — 하드닝 6이 삼켜지지 않게', async () => {
    vi.useFakeTimers();
    const { files, device } = setup({
      os: 'android',
      library: { hangInfo: true },
    });

    const pending = device.resolveForUpload(ASSET, { extraCandidates: [FILE_URI] });
    const assertion = expect(pending).rejects.toMatchObject({ code: 'device-timeout' });
    await vi.advanceTimersByTimeAsync(15_000);
    await assertion;

    // 후보를 시도조차 하지 않는다 — "재시도하면 되는 실패"를 사용자에게 알려야 하기 때문이다.
    expect(files.calls.copy).toEqual([]);
  });

  it('② 어댑터가 던진 branded 오류도 후보가 있으면 생존해 해석에 성공한다', async () => {
    const { device } = setup({
      os: 'android',
      library: { failInfoWith: new MediaError('device-timeout', signedUrlErrorMessage()) },
    });

    const resolved = await device.resolveForUpload(ASSET, { extraCandidates: [FILE_URI] });

    expect(resolved).toMatchObject({ uri: FILE_URI, staged: false, exif: null });
  });

  it('② 어댑터 raw 예외 + 후보 없음 → URL 없는 device-library-failed로 정규화한다', async () => {
    const raw = new Error(signedUrlErrorMessage());
    const { device } = setup({ os: 'android', library: { failInfoWith: raw } });

    const error = await device.resolveForUpload(ASSET).catch((thrown: unknown) => thrown);

    // ⚠ `device-not-found`로 바꾸면 재시도 가능한 라이브러리 실패가 "파일 없음"으로 오독된다.
    expect(mediaErrorCode(error)).toBe('device-library-failed');
    expect((error as Error).message).not.toContain('https://');
    expect((error as Error).message).not.toContain('X-Amz-Signature');
  });

  it('성공 응답의 hostile getter도 어댑터 경계 안에서 정규화한다', async () => {
    const raw = signedUrlErrorMessage();
    const { device } = setup({
      os: 'android',
      adapter: (fake) => ({
        ...fake,
        getAssetInfo: async () =>
          ({
            get localUri() {
              throw new Error(raw);
            },
            uri: FILE_URI,
            isNetworkAsset: false,
          }) as DeviceAssetInfo,
      }),
    });

    const error = await device.getAssetInfo('A1').catch((thrown: unknown) => thrown);

    expect(mediaErrorCode(error)).toBe('device-library-failed');
    expect((error as Error).message).not.toContain('https://');
    expect((error as Error).message).not.toContain('X-Amz-Signature');
  });

  it('선택 EXIF의 hostile/rich 값은 버리되 업로드 가능한 URI는 계속 해석한다', async () => {
    const raw = signedUrlErrorMessage();
    const { device } = setup({
      os: 'android',
      adapter: (fake) => ({
        ...fake,
        getAssetInfo: async () =>
          ({
            localUri: FILE_URI,
            isNetworkAsset: false,
            get exif() {
              throw new Error(raw);
            },
          }) as DeviceAssetInfo,
      }),
    });

    await expect(device.getAssetInfo('A1')).resolves.toEqual({
      localUri: FILE_URI,
      isNetworkAsset: false,
    });
    await expect(device.resolveForUpload(ASSET)).resolves.toMatchObject({
      uri: FILE_URI,
      exif: null,
      staged: false,
    });
  });
});

describe('resolvePickedAsset — asset.uri 자동 후보(§7.1 [신설])', () => {
  it('정보 조회가 실패해도 자동 후보만으로 업로드 형태를 만들어 낸다', async () => {
    const { device } = setup({
      os: 'android',
      library: { failInfoWith: new Error('native bridge exploded') },
    });

    // 저장된 asset.uri가 읽을 수 있는 파일인 경우 — "the picker keeps the original asset.uri".
    const picked = await device.resolvePickedAsset({ ...ASSET, uri: FILE_URI });

    expect(picked).toEqual({
      uri: FILE_URI,
      assetId: 'A1',
      fileName: 'IMG_0001.jpg',
      width: 4032,
      height: 3024,
      verifiedSizeBytes: undefined,
      exif: undefined,
      staged: false,
    });
  });

  it('exif는 null → undefined로 정규화된다 (EOP 하에서 그대로 넣으면 TS2322)', async () => {
    const { device } = setup({
      os: 'android',
      info: { localUri: FILE_URI, isNetworkAsset: false, exif: { Make: 'Apple' } },
    });

    const picked = await device.resolvePickedAsset(ASSET);

    expect(picked.exif).toEqual({ Make: 'Apple' });
  });

  it('reportedSizeBytes는 채우지 않는다 — 기기 경로의 크기 진실은 verified뿐이다', async () => {
    const { device } = setup({ os: 'ios', info: { localUri: FILE_URI, isNetworkAsset: false } });
    const picked = await device.resolvePickedAsset(ASSET);
    expect(picked.verifiedSizeBytes).toBe(1234);
    expect(picked).not.toHaveProperty('reportedSizeBytes');
  });
});

// ── 전신 앱 테스트 이식(설계 §11.4-A) ────────────────────────────────────────
//
// memorylog2 `src/photos/devicePhotoLibrary.test.ts`의 12케이스 중 10건은 위 describe들이
// 이미 덮고 있었지만, **Android `content://` 후보**와 **카피 후 stat 실패**만은 여기 대응이
// 없었다. 앱에서 그 파일을 지우기 전에 대체 커버리지를 먼저 세운다(대체 커버리지 선행 원칙).
describe('content:// 후보(전신 devicePhotoLibrary.test.ts 이식)', () => {
  const CONTENT_URI = 'content://media/external/images/media/1';

  it('android + content:// → file 스킴이 아니므로 직행하지 않고 캐시로 카피한다', async () => {
    // ⚠ `② android + file:// → 카피 없이 직행`과 짝을 이루는 케이스다. 직행 조건이
    //   "android"가 아니라 "android **이면서** file://"임을 이 한 건만이 구분한다.
    //   조건을 os만으로 축약하면 SAF 핸들이 그대로 업로더에 흘러들어 간다.
    const files = createMemoryFileSystem({ files: { [CONTENT_URI]: fakeBytes(2048) } });
    const staging = createStagingCache({ namespace: 'gj-media', files });
    const device = createDeviceLibrary({
      adapter: createFakeDeviceLibrary({
        assets: [ASSET],
        assetInfo: { A1: { localUri: CONTENT_URI, isNetworkAsset: false } },
      }),
      files,
      staging,
      platform: fakePlatform('android'),
    });

    const resolved = await device.resolveForUpload(ASSET);

    expect(files.calls.copy).toEqual([{ from: CONTENT_URI, to: STAGED_URI }]);
    expect(resolved).toMatchObject({ uri: STAGED_URI, verifiedSizeBytes: 2048, staged: true });
  });

  it('카피는 성공했는데 목적지가 파일이 아니면 후보를 소진하고 device-not-found', async () => {
    // 실기기 재현: 만료된 SAF 핸들에 대해 `copyAsync`는 resolve하지만 결과 파일이 생기지 않는다.
    // 이 판정이 없으면 존재하지 않는 스테이징 uri가 업로더에 넘어가 0바이트 PUT이 된다.
    const base = createMemoryFileSystem({ files: { [CONTENT_URI]: fakeBytes(2048) } });
    const files = {
      ...base,
      stat: (uri: string) =>
        uri === STAGED_URI ? Promise.resolve({ kind: 'missing' as const }) : base.stat(uri),
    };
    const staging = createStagingCache({ namespace: 'gj-media', files });
    const device = createDeviceLibrary({
      adapter: createFakeDeviceLibrary({
        assets: [ASSET],
        assetInfo: { A1: { localUri: CONTENT_URI, uri: PH_URI, isNetworkAsset: false } },
      }),
      files,
      staging,
      platform: fakePlatform('android'),
    });

    const error = await device.resolveForUpload(ASSET).catch((thrown: unknown) => thrown);

    expect(base.calls.copy).toEqual([{ from: CONTENT_URI, to: STAGED_URI }]);
    expect(mediaErrorCode(error)).toBe('device-not-found');
    expect(error).toBeInstanceOf(MediaError);
  });
});
