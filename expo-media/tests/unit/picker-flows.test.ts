// 설계 문서 §5.4-③ · §5.7.4 · §8.5 — 피커 플로우가 소유하는 정책 셋.
//
//   ① 권한 거부 → `permission-denied`(전신은 bare Error라 호스트가 "설정으로 이동"을 띄울
//      근거가 없었다). 문구는 요청한 kinds가 정한다.
//   ② 선택 결과를 `max`로 **코어가** 자른다 — 어댑터가 selectionLimit을 무시하는 플랫폼이 있다.
//   ③ 플랫폼별 업로드 라우팅. 웹에서 `loader` 없이 부르면 `platform-unsupported`이며,
//      **`LocalUploads`로 폴백하지 않는다** — 그 경로는 조용히 성공한 것처럼 보인다.

import { describe, expect, it } from 'vitest';
import type {
  BinarySourceLoader,
  MediaPlatform,
  NamedBinarySource,
  PickedAsset,
} from '../../src/core/adapters';
import { mediaErrorCode } from '../../src/core/errors';
import { createBinaryUploads } from '../../src/core/upload/binary';
import { createPickerFlows } from '../../src/core/upload/pickerFlows';
import { createLocalUploads } from '../../src/core/upload/uploader';
import {
  EXIF_FIXTURE,
  createBinarySource,
  createFakePicker,
  createFakeUploadApi,
  createMemoryFileSystem,
  createRecordingTransport,
  fakeBytes,
  fakePlatform,
} from '../../src/testing';

const DENIED = { granted: false, canAskAgain: true, limited: false } as const;

const asset = (index: number): PickedAsset => ({
  uri: `file:///dcim/a${index}.jpg`,
  assetId: `A${index}`,
  fileName: `a${index}.jpg`,
  exif: EXIF_FIXTURE,
});

function setup(options?: {
  readonly os?: MediaPlatform;
  readonly assets?: readonly PickedAsset[];
  readonly captureAssets?: readonly PickedAsset[];
  readonly libraryPermission?: { granted: boolean; canAskAgain: boolean; limited: boolean };
  readonly cameraPermission?: { granted: boolean; canAskAgain: boolean; limited: boolean };
  readonly withWebLoader?: boolean;
  /** 웹 로더가 만들어 낼 바이너리의 MIME. 동영상 경로를 태울 때 'video/mp4'로 준다. */
  readonly loaderType?: string;
}) {
  const assets = options?.assets ?? [asset(0), asset(1), asset(2)];
  const files = createMemoryFileSystem({
    files: Object.fromEntries(assets.map((item) => [item.uri, fakeBytes(64)])),
  });
  const transport = createRecordingTransport();
  const api = createFakeUploadApi<string>({ asset: (input) => input.objectName });
  const platform = fakePlatform(options?.os ?? 'ios');
  const picker = createFakePicker(assets, {
    ...(options?.libraryPermission ? { libraryPermission: options.libraryPermission } : {}),
    ...(options?.cameraPermission ? { cameraPermission: options.cameraPermission } : {}),
    ...(options?.captureAssets ? { captureAssets: options.captureAssets } : {}),
  });
  const uploads = createLocalUploads<string>({
    api,
    limits: 'server-enforced',
    platform,
    files,
    transport,
  });
  const binaryUploads = createBinaryUploads<string>({
    api,
    limits: 'server-enforced',
    platform,
    transport,
  });

  const loaded: { readonly uri: string; readonly fileName: string }[] = [];
  const loader: BinarySourceLoader = {
    fromUri({ uri, fileName }): Promise<NamedBinarySource> {
      loaded.push({ uri, fileName });
      return Promise.resolve(
        createBinarySource(fakeBytes(64), {
          name: fileName,
          type: options?.loaderType ?? 'image/jpeg',
        }),
      );
    },
  };

  const flows = createPickerFlows<string>({
    picker,
    uploads,
    platform,
    ...(options?.withWebLoader ? { web: { uploads: binaryUploads, loader } } : {}),
  });

  return { api, transport, picker, flows, loaded };
}

describe('pick — 권한 게이트와 max 자르기', () => {
  it('기본은 이미지 12장이고 요청 kinds가 그대로 어댑터에 간다', async () => {
    const { picker, flows } = setup();
    await flows.pick();
    expect(picker.calls.libraryPermission).toEqual([['image']]);
    expect(picker.calls.pick).toEqual([{ kinds: ['image'], max: 12 }]);
  });

  it('어댑터가 max를 무시해도 코어가 자른다', async () => {
    const { flows } = setup();
    const picked = await flows.pick({ max: 2 });
    expect(picked).toHaveLength(2);
    expect(picked.map((item) => item.assetId)).toEqual(['A0', 'A1']);
  });

  it('권한 거부 → permission-denied, 문구는 사진 전용', async () => {
    const { picker, flows } = setup({ libraryPermission: DENIED });
    const error = await flows.pick().catch((thrown: unknown) => thrown);
    expect(mediaErrorCode(error)).toBe('permission-denied');
    expect((error as Error).message).toBe('Photo access permission is required.');
    expect(picker.calls.pick).toEqual([]);
  });

  it('동영상을 함께 요청하면 문구가 사진 및 동영상으로 갈린다', async () => {
    const { flows } = setup({ libraryPermission: DENIED });
    const error = await flows
      .pick({ kinds: ['image', 'video'] })
      .catch((thrown: unknown) => thrown);
    expect((error as Error).message).toBe('Photo and video access permission is required.');
  });
});

describe('pickAndUpload — 네이티브 라우팅', () => {
  it('자산을 순차로 로컬 업로드한다', async () => {
    const { api, transport, flows } = setup({ assets: [asset(0), asset(1)] });

    const results = await flows.pickAndUpload({ collectionId: 'album-1' });

    expect(results).toHaveLength(2);
    expect(api.intents.map((intent) => intent.fileName)).toEqual(['a0.jpg', 'a1.jpg']);
    expect(api.completions.every((completion) => completion.collectionId === 'album-1')).toBe(true);
    expect(transport.puts.map((put) => put.uri)).toEqual([
      'file:///dcim/a0.jpg',
      'file:///dcim/a1.jpg',
    ]);
  });
});

describe('pickAndUpload — 웹 라우팅(§5.7.4 · §8.5)', () => {
  it('loader가 없으면 platform-unsupported — LocalUploads로 폴백하지 않는다', async () => {
    const { api, transport, flows } = setup({ os: 'web', assets: [asset(0)] });
    const error = await flows.pickAndUpload().catch((thrown: unknown) => thrown);
    expect(mediaErrorCode(error)).toBe('platform-unsupported');
    expect(api.intents).toEqual([]);
    expect(transport.puts).toEqual([]);
  });

  it('loader가 있으면 바이너리 업로드로 라우팅되고 fallbackExif가 함께 넘어간다', async () => {
    const { api, transport, flows, loaded } = setup({
      os: 'web',
      assets: [asset(0)],
      withWebLoader: true,
    });

    await flows.pickAndUpload();

    // 파일명은 코어가 정규화한 값이 loader로 내려간다 — 정규화 지점이 둘이 되지 않게.
    expect(loaded).toEqual([{ uri: 'file:///dcim/a0.jpg', fileName: 'a0.jpg' }]);
    // 로컬 파일 스트리밍이 아니라 바이너리 PUT이다(`body`가 실린다).
    expect(transport.puts[0]?.uri).toBeUndefined();
    expect(transport.puts[0]?.sizeBytes).toBe(64);
    // fallbackExif(asset.exif)가 살아 있으면 촬영시각·위치가 등록된다.
    expect(api.completions[0]?.photo).toMatchObject({ geoPoint: { latitude: 37.5665 } });
  });
});

// 전신 웹 동영상 경로(uploader.ts:741-756 · 804-815)가 하던 두 가지다:
//   ① duration 초→ms 정규화 ② width/height 전달.
// 둘 중 하나라도 빠지면 서버 기록이 조용히 틀어진다 — 특히 ①은 20분 영상이 1200ms로
// 저장돼 **어떤 길이 상한도 통과**한다(§7 하드닝 4).
describe('pickAndUpload — 웹 동영상 치수·재생시간(하드닝 4)', () => {
  const video = (): PickedAsset => ({
    uri: 'file:///dcim/v0.mp4',
    assetId: 'V0',
    fileName: 'v0.mp4',
    mimeType: 'video/mp4',
    width: 1920,
    height: 1080,
    // 웹 피커는 HTMLVideoElement.duration = **초**를 준다. 20분.
    durationRaw: 1200,
  });

  it('웹에서는 초를 밀리초로 정규화해 보낸다', async () => {
    const { api, flows } = setup({
      os: 'web',
      assets: [video()],
      withWebLoader: true,
      loaderType: 'video/mp4',
    });

    await flows.pickAndUpload({ kinds: ['image', 'video'] });

    // 1200초 → 1_200_000ms. 1200이 그대로 갔다면 정규화가 빠진 것이다.
    expect(api.completions[0]?.durationMs).toBe(1_200_000);
    expect(api.completions[0]).toMatchObject({ width: 1920, height: 1080 });
  });
});

describe('captureAndUpload', () => {
  it('카메라가 여러 장을 줘도 항상 1건이다', async () => {
    const { api, flows, picker } = setup({
      captureAssets: [asset(0), asset(1), asset(2)],
    });

    const results = await flows.captureAndUpload();

    expect(picker.calls.capture).toEqual([{ kind: 'image' }]);
    expect(results).toHaveLength(1);
    expect(api.intents.map((intent) => intent.fileName)).toEqual(['a0.jpg']);
  });

  it('kind를 넘기면 어댑터에 그대로 전달된다', async () => {
    const { flows, picker } = setup({ captureAssets: [asset(0)] });
    await flows.captureAndUpload({ kind: 'video' });
    expect(picker.calls.capture).toEqual([{ kind: 'video' }]);
  });

  it('카메라 권한 거부 → permission-denied, capture 호출 0회', async () => {
    const { flows, picker } = setup({ cameraPermission: DENIED });
    const error = await flows.captureAndUpload().catch((thrown: unknown) => thrown);
    expect(mediaErrorCode(error)).toBe('permission-denied');
    expect((error as Error).message).toBe('Camera access permission is required.');
    expect(picker.calls.capture).toEqual([]);
  });
});
