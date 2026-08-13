// 설계 문서 §5.4-① · §7 하드닝 1·3·7 · §7.1 — 로컬 파일 업로드(presign → PUT → complete).
//
// ⚠ 이 파일이 지키는 것 중 가장 미묘한 둘:
//   · **호출자 제공 contentHash 우선**(§7.1 신설) — 있으면 hasher를 **호출하지 않는다**.
//     동기화 큐가 재시도 간 해시를 캐시하는 경로이며, 없으면 재시도마다 15MB를 다시 해시한다.
//     바로 아래 "해시 실패는 업로드를 막지 않는다"와 **나란히** 읽어야 한다 — 한쪽만 보면
//     정반대 구현이 나온다.
//   · **전송이 파일 바이트를 JS 힙으로 읽지 않는다**(§7 하드닝 1). 페이크 fs의
//     `calls.readBase64`가 비어 있다는 것이 그 직접 증거다(전송 페이크는 파일을 들여다보지 않는다).

import { describe, expect, it } from 'vitest';
import type {
  FileSystemAdapter,
  HashAdapter,
  LocalPosterAdapter,
  MediaPlatform,
  PickedAsset,
} from '../../src/core/adapters';
import type { MediaUploadApi, MediaUploadCompletion, MediaUploadLimits } from '../../src/core/types';
import { mediaErrorCode, mediaUploadFailureInfo } from '../../src/core/errors';
import { createStagingCache } from '../../src/core/staging';
import type { StagingCache } from '../../src/core/staging';
import { createLocalUploads } from '../../src/core/upload/uploader';
import {
  EXIF_FIXTURE,
  EXIF_GEO_POINT,
  createFakeUploadApi,
  createMemoryFileSystem,
  createRecordingTelemetry,
  createRecordingTransport,
  exifCapturedAtIso,
  fakeBytes,
  fakePlatform,
} from '../../src/testing';

const IMAGE_URI = 'file:///dcim/a.jpg';
const VIDEO_URI = 'file:///dcim/v.mp4';
const POSTER_URI = 'file:///cache/poster.jpg';

/** 호출 횟수를 세는 해시 어댑터 — "hasher 0회"를 단언할 수 있게 하는 유일한 수단이다. */
function countingHasher(value = 'caller-independent-hash') {
  const calls = { local: [] as string[], binary: 0 };
  const hasher: HashAdapter = {
    hashLocalFile(uri) {
      calls.local.push(uri);
      return Promise.resolve(value);
    },
    hashBinary() {
      calls.binary += 1;
      return Promise.resolve(value);
    },
  };
  return { hasher, calls };
}

function fixedPoster(uri: string | null): LocalPosterAdapter & { readonly calls: number[] } {
  const calls: number[] = [];
  return {
    calls,
    posterFromLocalFile({ atMs }) {
      calls.push(atMs);
      return Promise.resolve(uri === null ? null : { uri });
    },
  };
}

function setup(
  options?: {
    readonly os?: MediaPlatform;
    readonly hasher?: HashAdapter;
    readonly poster?: LocalPosterAdapter;
    readonly failWithStatus?: number;
    readonly staged?: boolean;
    readonly staging?: StagingCache;
    readonly limits?: MediaUploadLimits | 'server-enforced';
    readonly extraFiles?: Readonly<Record<string, Uint8Array>>;
  },
) {
  const files = createMemoryFileSystem({
    files: {
      [IMAGE_URI]: fakeBytes(1234),
      [VIDEO_URI]: fakeBytes(4321),
      ...options?.extraFiles,
    },
  });
  const transport = createRecordingTransport(
    options?.failWithStatus === undefined ? undefined : { failWithStatus: options.failWithStatus },
  );
  const api = createFakeUploadApi<string>({ asset: (input) => input.objectName });
  const staging = createStagingCache({ namespace: 'gj-media', files });
  const uploads = createLocalUploads<string>({
    api,
    limits: options?.limits ?? 'server-enforced',
    platform: fakePlatform(options?.os ?? 'ios'),
    files,
    transport,
    ...(options?.hasher ? { hasher: options.hasher } : {}),
    ...(options?.poster ? { poster: options.poster } : {}),
    ...(options?.staging ? { staging: options.staging } : options?.staged ? { staging } : {}),
  });
  return { files, transport, api, staging, uploads };
}

describe('uploadLocalFile — presign → PUT → complete', () => {
  it('발급받은 슬롯 그대로 PUT하고 등록 페이로드를 채운다', async () => {
    const { api, transport, uploads, files } = setup();

    const result = await uploads.uploadLocalFile({ uri: IMAGE_URI, fileName: 'a.jpg' });

    expect(api.intents).toEqual([
      { fileName: 'a.jpg', contentType: 'image/jpeg', sizeBytes: 1234 },
    ]);
    expect(transport.puts).toHaveLength(1);
    expect(transport.puts[0]).toMatchObject({
      url: api.issued[0]?.uploadUrl,
      method: 'PUT',
      headers: { 'content-type': 'image/jpeg' },
      uri: IMAGE_URI,
    });
    expect(api.completions[0]).toMatchObject({
      fileName: 'a.jpg',
      contentType: 'image/jpeg',
      sizeBytes: 1234,
      objectName: api.issued[0]?.objectName,
    });
    expect(result).toEqual({ asset: api.issued[0]?.objectName, duplicate: false });
    // presign에 적은 크기는 코어가 방금 stat한 값이다(§7 하드닝 3의 file-system 분기).
    // (기본 해시 어댑터도 자기 stat을 하므로 목록에는 두 번 나온다 — 첫 호출이 크기 결정이다.)
    expect(files.calls.stat[0]).toBe(IMAGE_URI);
  });

  it('fileName이 없으면 uri로 contentType을 추론하고 파일명을 짓는다', async () => {
    const { api, uploads } = setup();
    await uploads.uploadLocalFile({ uri: VIDEO_URI });
    expect(api.intents[0]?.contentType).toBe('video/mp4');
    expect(api.intents[0]?.fileName).toMatch(/^media-\d+\.mp4$/);
  });

  it('sizeBytes를 주면 stat을 건너뛴다 — verified 분기', async () => {
    const { api, uploads, files } = setup();
    await uploads.uploadLocalFile({
      uri: IMAGE_URI,
      fileName: 'a.jpg',
      sizeBytes: 99,
      contentHash: 'x',
    });
    expect(files.calls.stat).toEqual([]);
    expect(api.intents[0]?.sizeBytes).toBe(99);
  });

  it('크기를 어디서도 알 수 없으면 upload-failed — 바이트를 보내기 전에 멈춘다', async () => {
    const { api, transport, uploads } = setup();
    const error = await uploads
      .uploadLocalFile({ uri: 'file:///missing.jpg' })
      .catch((thrown: unknown) => thrown);
    expect(mediaErrorCode(error)).toBe('upload-failed');
    expect(api.intents).toEqual([]);
    expect(transport.puts).toEqual([]);
  });

  it('hostile stat result getter의 raw URL 오류도 안전한 upload-failed로 정규화한다', async () => {
    const rawUrl = 'https://files.example.test/secret?X-Amz-Signature=never-public';
    const backing = createMemoryFileSystem({ files: { [IMAGE_URI]: fakeBytes(1234) } });
    const files: FileSystemAdapter = {
      cacheDirectory: () => backing.cacheDirectory(),
      stat: async () =>
        ({
          get kind() {
            throw new Error(`stat failed for ${rawUrl}`);
          },
        }) as unknown as Awaited<ReturnType<FileSystemAdapter['stat']>>,
      copy: (input) => backing.copy(input),
      remove: (uri) => backing.remove(uri),
      readBase64: (uri, range) => backing.readBase64(uri, range),
    };
    const api = createFakeUploadApi<string>({ asset: (input) => input.objectName });
    const transport = createRecordingTransport();
    const uploads = createLocalUploads<string>({
      api,
      limits: 'server-enforced',
      platform: fakePlatform('ios'),
      files,
      transport,
    });

    const error = await uploads
      .uploadLocalFile({ uri: IMAGE_URI, fileName: 'a.jpg' })
      .catch((thrown: unknown) => thrown);

    expect(mediaErrorCode(error)).toBe('upload-failed');
    expect(String((error as Error).message)).not.toContain(rawUrl);
    expect(api.intents).toEqual([]);
    expect(transport.puts).toEqual([]);
  });

  it('2xx가 아니면 upload-failed이고 completeUpload를 부르지 않는다', async () => {
    const { api, uploads } = setup({ failWithStatus: 500 });
    const error = await uploads
      .uploadLocalFile({ uri: IMAGE_URI, fileName: 'a.jpg' })
      .catch((thrown: unknown) => thrown);
    expect(mediaErrorCode(error)).toBe('upload-failed');
    expect(api.completions).toEqual([]);
  });

  it('크기 캡을 넘으면 file-too-large — presign 0회', async () => {
    const { hasher, calls } = countingHasher();
    const { api, transport, uploads } = setup({
      limits: { image: { maxBytes: 1000 } },
      hasher,
    });
    const error = await uploads
      .uploadLocalFile({ uri: IMAGE_URI, fileName: 'a.jpg' })
      .catch((thrown: unknown) => thrown);
    expect(mediaErrorCode(error)).toBe('file-too-large');
    // cap은 stat 직후 적용된다. 이 단언이 없으면 대용량 거절 전에 전체 SHA-256을 읽어도
    // `presign 0회`만으로는 회귀를 발견하지 못한다.
    expect(calls.local).toEqual([]);
    expect(api.intents).toEqual([]);
    expect(transport.puts).toEqual([]);
  });

  it('web에서는 uploadLocalFile도 stat·presign·PUT 전에 막는다', async () => {
    const { api, files, transport, uploads } = setup({ os: 'web' });
    const error = await uploads
      .uploadLocalFile({ uri: IMAGE_URI, fileName: 'a.jpg' })
      .catch((thrown: unknown) => thrown);

    expect(mediaErrorCode(error)).toBe('platform-unsupported');
    expect(files.calls.stat).toEqual([]);
    expect(api.intents).toEqual([]);
    expect(transport.puts).toEqual([]);
  });

  it('collectionId 빈 문자열은 config-invalid — falsy 스프레드로 조용히 탈락하지 않는다', async () => {
    const { uploads } = setup();
    const error = await uploads
      .uploadLocalFile({ uri: IMAGE_URI, fileName: 'a.jpg', collectionId: '' })
      .catch((thrown: unknown) => thrown);
    expect(mediaErrorCode(error)).toBe('config-invalid');
  });

  it('collectionId가 null이면 완료 페이로드에 아예 없고, 값이면 그대로 전달된다', async () => {
    const withNull = setup();
    await withNull.uploads.uploadLocalFile({ uri: IMAGE_URI, fileName: 'a.jpg', collectionId: null });
    expect(withNull.api.completions[0]).not.toHaveProperty('collectionId');

    const withValue = setup();
    await withValue.uploads.uploadLocalFile({
      uri: IMAGE_URI,
      fileName: 'a.jpg',
      collectionId: 'album-1',
    });
    expect(withValue.api.completions[0]?.collectionId).toBe('album-1');
  });

  it('등록 API raw 실패는 URL 없이 complete-stage cleanup 후보로 바뀐다', async () => {
    const files = createMemoryFileSystem({
      files: {
        [VIDEO_URI]: fakeBytes(4321),
        [POSTER_URI]: fakeBytes(64),
      },
    });
    const telemetry = createRecordingTelemetry();
    const transport = createRecordingTransport();
    const completions: MediaUploadCompletion[] = [];
    const rawUrl = 'https://api.example.test/complete?X-Amz-Signature=never-public';
    const api: MediaUploadApi<string> = {
      createUploadIntent(input) {
        return Promise.resolve({
          uploadUrl: `https://uploads.example.test/${input.fileName}`,
          method: 'PUT',
          headers: { 'content-type': input.contentType },
          objectName: `objects/${input.fileName}`,
        });
      },
      completeUpload(input) {
        completions.push(input);
        return Promise.reject(new Error(`registration rejected at ${rawUrl}`));
      },
    };
    const uploads = createLocalUploads<string>({
      api,
      limits: 'server-enforced',
      platform: fakePlatform('ios'),
      files,
      transport,
      telemetry,
      poster: fixedPoster(POSTER_URI),
    });

    const error = await uploads
      .uploadLocalFile({ uri: VIDEO_URI, fileName: 'v.mp4', contentHash: 'cached' })
      .catch((thrown: unknown) => thrown);

    expect(completions).toHaveLength(1);
    expect(mediaErrorCode(error)).toBe('upload-failed');
    expect(String((error as Error).message)).not.toContain(rawUrl);
    expect(telemetry.spans.find((span) => span.operation === 'media.upload.native')?.error).toBe(error);
    expect(mediaUploadFailureInfo(error)).toEqual({
      stage: 'complete',
      orphanedObjects: [
        {
          objectName: 'objects/v-poster.jpg',
          contentType: 'image/jpeg',
          sizeBytes: 64,
          storageState: 'uploaded',
        },
        {
          objectName: 'objects/v.mp4',
          contentType: 'video/mp4',
          sizeBytes: 4321,
          storageState: 'uploaded',
        },
      ],
    });
    expect(JSON.stringify(mediaUploadFailureInfo(error))).not.toContain('X-Amz-Signature');
  });
});

describe('해시 정책', () => {
  it('호출자 contentHash가 있으면 hasher를 호출하지 않고 그 값이 그대로 등록된다', async () => {
    const { hasher, calls } = countingHasher();
    const { api, uploads, files } = setup({ hasher });

    await uploads.uploadLocalFile({
      uri: IMAGE_URI,
      fileName: 'a.jpg',
      contentHash: 'cached-from-previous-attempt',
    });

    expect(calls.local).toEqual([]);
    expect(api.completions[0]?.contentHash).toBe('cached-from-previous-attempt');
    // ⚠ §7 하드닝 1의 직접 증거: 해시도 전송도 파일 바이트를 JS 힙으로 읽지 않았다.
    expect(files.calls.readBase64).toEqual([]);
  });

  it('없으면 hasher를 정확히 1회 호출한다', async () => {
    const { hasher, calls } = countingHasher('computed-hash');
    const { api, uploads } = setup({ hasher });

    await uploads.uploadLocalFile({ uri: IMAGE_URI, fileName: 'a.jpg' });

    expect(calls.local).toEqual([IMAGE_URI]);
    expect(api.completions[0]?.contentHash).toBe('computed-hash');
  });

  it('해시 실패는 업로드를 막지 않는다 — dedup은 최적화일 뿐이다', async () => {
    const exploding: HashAdapter = {
      hashLocalFile: () => Promise.reject(new Error('hash exploded')),
      hashBinary: () => Promise.reject(new Error('hash exploded')),
    };
    const { api, uploads } = setup({ hasher: exploding });

    const result = await uploads.uploadLocalFile({ uri: IMAGE_URI, fileName: 'a.jpg' });

    expect(result.duplicate).toBe(false);
    expect(api.completions[0]).not.toHaveProperty('contentHash');
  });

  it('기본 해시 어댑터를 쓰면 파일 바이트를 창으로 읽는다 (해시 경로가 실제로 돈다)', async () => {
    const { uploads, api, files } = setup();
    await uploads.uploadLocalFile({ uri: IMAGE_URI, fileName: 'a.jpg' });
    expect(files.calls.readBase64).toHaveLength(1);
    expect(api.completions[0]?.contentHash).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('uploadPickedAsset', () => {
  const picked: PickedAsset = {
    uri: IMAGE_URI,
    assetId: 'A1',
    fileName: 'IMG_0001.jpg',
    width: 400.4,
    height: 300,
    exif: EXIF_FIXTURE,
    durationRaw: 0,
  };

  it('EXIF를 이미지에서만 뽑아 photo로 전달하고 치수를 정규화한다', async () => {
    const { api, uploads } = setup();
    await uploads.uploadPickedAsset(picked);
    expect(api.completions[0]?.photo).toEqual({
      capturedAt: exifCapturedAtIso(),
      geoPoint: EXIF_GEO_POINT,
    });
    expect(api.completions[0]?.width).toBe(400);
    expect(api.completions[0]?.height).toBe(300);
  });

  it('verifiedSizeBytes가 있으면 stat을 건너뛴다', async () => {
    // 해시 어댑터를 주입해 해시 경로의 stat을 분리한다 — 크기 결정이 stat을 부르지 않았다는
    // 사실만 남긴다.
    const { hasher } = countingHasher();
    const { api, uploads, files } = setup({ hasher });
    await uploads.uploadPickedAsset({ ...picked, verifiedSizeBytes: 77 });
    expect(files.calls.stat).toEqual([]);
    expect(api.intents[0]?.sizeBytes).toBe(77);
  });

  it('파일이 없으면 피커 자칭 크기(reported)로 내려간다 — 최후 폴백', async () => {
    const { api, uploads } = setup();
    await uploads.uploadPickedAsset({
      ...picked,
      uri: 'file:///missing.jpg',
      reportedSizeBytes: 42,
    });
    expect(api.intents[0]?.sizeBytes).toBe(42);
  });

  it('verified가 reported를 이긴다 — Android 재인코딩 자산의 사고 지점', async () => {
    const { api, uploads } = setup();
    await uploads.uploadPickedAsset({
      ...picked,
      verifiedSizeBytes: 500,
      reportedSizeBytes: 9_999_999,
    });
    expect(api.intents[0]?.sizeBytes).toBe(500);
  });

  it('durationRaw는 플랫폼에 따라 정규화된다 (네이티브는 ms 그대로)', async () => {
    const { api, uploads } = setup({ os: 'android' });
    await uploads.uploadPickedAsset({ uri: VIDEO_URI, fileName: 'v.mp4', durationRaw: 20_000 });
    expect(api.completions[0]?.durationMs).toBe(20_000);
  });

  it('동영상은 해시하지 않는다 — 수백 MB의 비용이 그대로 사용자 대기가 된다', async () => {
    const { hasher, calls } = countingHasher();
    const { api, uploads } = setup({ hasher });
    await uploads.uploadPickedAsset({ uri: VIDEO_URI, fileName: 'v.mp4' });
    expect(calls.local).toEqual([]);
    expect(api.completions[0]).not.toHaveProperty('contentHash');
    expect(api.completions[0]).not.toHaveProperty('photo');
  });

  it('uri가 없으면 picked-asset-invalid — 문구가 종류에 따라 갈린다', async () => {
    const { uploads } = setup();
    const image = await uploads
      .uploadPickedAsset({ uri: '', fileName: 'a.jpg' })
      .catch((thrown: unknown) => thrown);
    expect(mediaErrorCode(image)).toBe('picked-asset-invalid');
    expect(String((image as Error).message)).toContain('photo');

    const video = await uploads
      .uploadPickedAsset({ uri: '', fileName: 'v.mp4' })
      .catch((thrown: unknown) => thrown);
    expect(mediaErrorCode(video)).toBe('picked-asset-invalid');
    expect(String((video as Error).message)).toContain('media');
  });

  it('hostile EXIF getter의 raw 오류는 picker-invalid MediaError로 정규화한다', async () => {
    const rawUrl = 'https://uploads.example.test/secret?X-Amz-Signature=must-not-leak';
    const { api, uploads } = setup();
    const hostile = {
      uri: IMAGE_URI,
      fileName: 'hostile.jpg',
      get exif() {
        throw new Error(`EXIF failed for ${rawUrl}`);
      },
    } as unknown as PickedAsset;

    const error = await uploads.uploadPickedAsset(hostile).catch((thrown: unknown) => thrown);

    expect(mediaErrorCode(error)).toBe('picked-asset-invalid');
    expect(String((error as Error).message)).not.toContain(rawUrl);
    expect(api.intents).toEqual([]);
  });

  it('hostile picker asset getter의 raw URL 오류도 picker-invalid로 정규화한다', async () => {
    const rawUrl = 'https://picker.example.test/secret?X-Amz-Signature=must-not-leak';
    const { api, uploads } = setup();
    const hostile = {
      get uri() {
        throw new Error(`asset failed for ${rawUrl}`);
      },
    } as unknown as PickedAsset;

    const error = await uploads.uploadPickedAsset(hostile).catch((thrown: unknown) => thrown);

    expect(mediaErrorCode(error)).toBe('picked-asset-invalid');
    expect(String((error as Error).message)).not.toContain(rawUrl);
    expect(api.intents).toEqual([]);
  });

  it('web에서는 platform-unsupported — 로컬 파일 스트리밍이 웹에 존재하지 않는다', async () => {
    const { api, transport, uploads } = setup({ os: 'web' });
    const error = await uploads.uploadPickedAsset(picked).catch((thrown: unknown) => thrown);
    // ⚠ 조용히 no-op으로 "성공"하는 것을 막는 지점이다(§7.1 마지막 행).
    expect(mediaErrorCode(error)).toBe('platform-unsupported');
    expect(api.intents).toEqual([]);
    expect(transport.puts).toEqual([]);
  });
});

describe('스테이징 정리 (§7 하드닝 7)', () => {
  const stagedUri = 'file:///cache/gj-media-upload-A1.jpg';

  it('업로드 성공 후 스테이징 사본이 지워진다', async () => {
    const { files, uploads } = setup({
      staged: true,
      extraFiles: { [stagedUri]: fakeBytes(10) },
    });

    await uploads.uploadPickedAsset({ uri: stagedUri, assetId: 'A1', fileName: 'IMG_0001.jpg' });

    expect(files.calls.remove).toEqual([stagedUri]);
    expect(files.list()).not.toContain(stagedUri);
  });

  it('cleanup adapter가 raw URI 에러를 던져도 이미 성공한 등록 결과를 뒤집지 않는다', async () => {
    const rawUri = 'file:///cache/gj-media-upload-secret.jpg';
    const explodingStaging = {
      prefix: 'gj-media-upload-',
      owns: () => true,
      uriFor: () => null,
      cleanup: () => Promise.reject(new Error(`cannot clean ${rawUri}`)),
    } as unknown as StagingCache;
    const { api, uploads } = setup({ staging: explodingStaging });

    const result = await uploads.uploadPickedAsset({
      uri: IMAGE_URI,
      assetId: 'A1',
      fileName: 'a.jpg',
    });

    expect(result.duplicate).toBe(false);
    expect(api.completions).toHaveLength(1);
  });

  it('업로드 실패에도 지워진다 — finally 보장', async () => {
    const { files, uploads } = setup({
      staged: true,
      failWithStatus: 500,
      extraFiles: { [stagedUri]: fakeBytes(10) },
    });

    await expect(
      uploads.uploadPickedAsset({ uri: stagedUri, assetId: 'A1', fileName: 'IMG_0001.jpg' }),
    ).rejects.toThrow();

    expect(files.calls.remove).toEqual([stagedUri]);
    expect(files.list()).not.toContain(stagedUri);
  });

  it('스테이징 사본이 아닌 uri는 no-op — 남의 파일을 지우지 않는다', async () => {
    const { files, uploads } = setup({ staged: true });
    await uploads.uploadPickedAsset({ uri: IMAGE_URI, assetId: 'A1', fileName: 'a.jpg' });
    expect(files.calls.remove).toEqual([]);
    expect(files.list()).toContain(IMAGE_URI);
  });
});

describe('동영상 포스터 (§7.1 — 포스터 실패가 업로드를 막지 않는다)', () => {
  it('포스터를 만들어 먼저 presign·PUT하고 쌍 객체로 등록한다', async () => {
    const poster = fixedPoster(POSTER_URI);
    const { api, transport, uploads } = setup({
      poster,
      extraFiles: { [POSTER_URI]: fakeBytes(16) },
    });

    await uploads.uploadLocalFile({ uri: VIDEO_URI, fileName: 'v.mp4' });

    // 포스터 유무가 `media.upload.native` 시작 payload에 들어가므로 본 업로드보다 먼저 확정된다.
    expect(api.intents.map((intent) => intent.fileName)).toEqual(['v-poster.jpg', 'v.mp4']);
    expect(api.intents[0]?.contentType).toBe('image/jpeg');
    expect(poster.calls).toEqual([1000]);
    expect(transport.puts).toHaveLength(2);
    expect(api.completions[0]?.poster).toEqual({
      objectName: api.issued[0]?.objectName,
      sizeBytes: 16,
    });
  });

  it('포스터 어댑터가 null이면 poster 필드가 없다', async () => {
    const { api, uploads } = setup({ poster: fixedPoster(null) });
    await uploads.uploadLocalFile({ uri: VIDEO_URI, fileName: 'v.mp4' });
    expect(api.completions[0]).not.toHaveProperty('poster');
    expect(api.intents).toHaveLength(1);
  });

  it('포스터 어댑터가 throw해도 동영상 업로드는 완료된다', async () => {
    const exploding: LocalPosterAdapter = {
      posterFromLocalFile: () => Promise.reject(new Error('thumbnail exploded')),
    };
    const { api, uploads } = setup({ poster: exploding });
    const result = await uploads.uploadLocalFile({ uri: VIDEO_URI, fileName: 'v.mp4' });
    expect(result.duplicate).toBe(false);
    expect(api.completions[0]).not.toHaveProperty('poster');
  });

  it('hostile poster frame getter의 raw URL 오류도 optional extraction 실패로만 처리한다', async () => {
    const rawUrl = 'https://poster.example.test/secret?X-Amz-Signature=must-not-leak';
    const hostile: LocalPosterAdapter = {
      posterFromLocalFile: () =>
        Promise.resolve({
          get uri() {
            throw new Error(`poster frame failed for ${rawUrl}`);
          },
        } as unknown as { readonly uri: string }),
    };
    const { api, uploads } = setup({ poster: hostile });

    const result = await uploads.uploadLocalFile({ uri: VIDEO_URI, fileName: 'v.mp4' });

    expect(result.duplicate).toBe(false);
    expect(api.intents.map((intent) => intent.fileName)).toEqual(['v.mp4']);
    expect(api.completions[0]).not.toHaveProperty('poster');
  });

  it('빈 포스터(0바이트)는 presign조차 하지 않고 조용히 넘어간다', async () => {
    const { api, uploads } = setup({
      poster: fixedPoster(POSTER_URI),
      extraFiles: { [POSTER_URI]: new Uint8Array(0) },
    });
    await uploads.uploadLocalFile({ uri: VIDEO_URI, fileName: 'v.mp4' });
    expect(api.intents.map((intent) => intent.fileName)).toEqual(['v.mp4']);
    expect(api.completions[0]).not.toHaveProperty('poster');
  });

  it('이미지에는 포스터 어댑터를 부르지 않는다', async () => {
    const poster = fixedPoster(POSTER_URI);
    const { uploads } = setup({ poster, extraFiles: { [POSTER_URI]: fakeBytes(16) } });
    await uploads.uploadLocalFile({ uri: IMAGE_URI, fileName: 'a.jpg' });
    expect(poster.calls).toEqual([]);
  });
});
