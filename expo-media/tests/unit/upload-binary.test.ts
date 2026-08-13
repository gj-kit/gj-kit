// 설계 문서 §5.4-② · §7 하드닝 10 · §7.1 — 바이너리(웹 Blob) 업로드와 웹 드롭 배치.
//
// ⚠ 이 파일이 지키는 것 중 가장 중요한 것: **혼합 드롭 부분 업로드 방지**(하드닝 10).
//   필터링은 조용히 깨지는 부류였다 — 사용자는 5장을 떨궜는데 3장만 올라간 것을 알 수 없고,
//   거절된 2장을 고칠 방법도 없었다. 그래서 "첫 presign **이전에** 배치 전체 검증"이 계약이고,
//   그 직접 증거는 `api.intents`가 **비어 있다**는 것이다(에러 코드만 봐서는 부분 업로드가
//   이미 일어난 뒤인지 알 수 없다).
//
// ⚠ DOM `Blob` 없이 전 경로를 돈다 — `BinarySource`가 구조 최소 타입인 설계 의도의 실증이다.

import { describe, expect, it } from 'vitest';
import type {
  BinaryPosterAdapter,
  BinarySource,
  HashAdapter,
  NamedBinarySource,
} from '../../src/core/adapters';
import { mediaErrorCode, mediaUploadFailureInfo } from '../../src/core/errors';
import { sha256Hex } from '../../src/core/sha256';
import { createBinaryUploads } from '../../src/core/upload/binary';
import {
  EXIF_GEO_POINT,
  createBinarySource,
  createFakeUploadApi,
  createRecordingTransport,
  exifCapturedAtIso,
  fakeBytes,
  fakePlatform,
  jpegWithExif,
} from '../../src/testing';

function setup(options?: {
  readonly failWithStatus?: number;
  readonly poster?: BinaryPosterAdapter;
  readonly hasher?: HashAdapter;
}) {
  const transport = createRecordingTransport(
    options?.failWithStatus === undefined ? undefined : { failWithStatus: options.failWithStatus },
  );
  const api = createFakeUploadApi<string>({ asset: (input) => input.objectName });
  const uploads = createBinaryUploads<string>({
    api,
    limits: 'server-enforced',
    platform: fakePlatform('web'),
    transport,
    ...(options?.poster ? { poster: options.poster } : {}),
    ...(options?.hasher ? { hasher: options.hasher } : {}),
  });
  return { transport, api, uploads };
}

const png = (name = 'a.png', size = 100): NamedBinarySource =>
  createBinarySource(fakeBytes(size), { name, type: 'image/png' });
const mp4 = (name = 'v.mp4', size = 200): NamedBinarySource =>
  createBinarySource(fakeBytes(size), { name, type: 'video/mp4' });
const jpeg = (name = 'p.jpg'): NamedBinarySource =>
  createBinarySource(jpegWithExif(), { name, type: 'image/jpeg' });

describe('uploadBinary — 이미지', () => {
  it('presign 크기 · PUT 본문 크기 · 등록 크기가 모두 같다', async () => {
    const { api, transport, uploads } = setup();
    const source = png('a.png', 512);

    await uploads.uploadBinary({ source });

    expect(api.intents).toEqual([
      { fileName: 'a.png', contentType: 'image/png', sizeBytes: 512 },
    ]);
    expect(transport.puts[0]?.sizeBytes).toBe(512);
    expect(transport.puts[0]?.url).toBe(api.issued[0]?.uploadUrl);
    expect(api.completions[0]?.sizeBytes).toBe(512);
  });

  it('loader BinarySource header는 한 번 snapshot하고 이후 getter URL 오류를 노출하지 않는다', async () => {
    const rawUrl = 'https://loader.example.test/secret?X-Amz-Signature=must-not-leak';
    const base = png('safe.png', 32);
    let sizeReads = 0;
    const source = {
      get size() {
        sizeReads += 1;
        if (sizeReads === 1) return 32;
        throw new Error(`second size read exposed ${rawUrl}`);
      },
      get type() {
        return 'image/png';
      },
      get name() {
        return 'safe.png';
      },
      arrayBuffer: () => base.arrayBuffer(),
    } as unknown as NamedBinarySource;
    const { api, uploads } = setup();

    const result = await uploads.uploadBinary({ source });

    expect(result.duplicate).toBe(false);
    expect(sizeReads).toBe(1);
    expect(api.intents).toEqual([{ fileName: 'safe.png', contentType: 'image/png', sizeBytes: 32 }]);
  });

  it('hostile BinarySource getter raw URL 오류는 telemetry 전에 safe upload-failed로 바뀐다', async () => {
    const rawUrl = 'https://loader.example.test/secret?X-Amz-Signature=must-not-leak';
    const { api, transport, uploads } = setup();
    const source = {
      get size() {
        throw new Error(`loader failed for ${rawUrl}`);
      },
      name: 'hostile.png',
      type: 'image/png',
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
    } as unknown as NamedBinarySource;

    const error = await uploads.uploadBinary({ source }).catch((thrown: unknown) => thrown);

    expect(mediaErrorCode(error)).toBe('upload-failed');
    expect(String((error as Error).message)).not.toContain(rawUrl);
    expect(api.intents).toEqual([]);
    expect(transport.puts).toEqual([]);
  });

  it('contentHash는 바이트의 SHA-256이다', async () => {
    const { api, uploads } = setup();
    const bytes = fakeBytes(300);
    await uploads.uploadBinary({ source: createBinarySource(bytes, { name: 'a.png', type: 'image/png' }) });
    expect(api.completions[0]?.contentHash).toBe(sha256Hex(bytes));
  });

  it('JPEG는 바이트에서 EXIF를 뽑아 photo로 등록한다', async () => {
    const { api, uploads } = setup();
    await uploads.uploadBinary({ source: jpeg() });
    expect(api.completions[0]?.photo).toEqual({
      capturedAt: exifCapturedAtIso(),
      geoPoint: EXIF_GEO_POINT,
    });
  });

  it('비-JPEG는 fallbackExif가 photo가 된다 — 넘기지 않으면 조용히 유실되는 값이다', async () => {
    const { api, uploads } = setup();
    await uploads.uploadBinary({
      source: png(),
      fallbackExif: { GPSLatitude: 10, GPSLatitudeRef: 'N', GPSLongitude: 20, GPSLongitudeRef: 'E' },
    });
    expect(api.completions[0]?.photo).toEqual({ geoPoint: { latitude: 10, longitude: 20 } });
  });

  it('크기 0이면 upload-failed — presign조차 하지 않는다', async () => {
    const { api, uploads } = setup();
    const error = await uploads
      .uploadBinary({ source: createBinarySource(new Uint8Array(0), { name: 'a.png', type: 'image/png' }) })
      .catch((thrown: unknown) => thrown);
    expect(mediaErrorCode(error)).toBe('upload-failed');
    expect(api.intents).toEqual([]);
  });

  it('2xx가 아니면 upload-failed', async () => {
    const { api, uploads } = setup({ failWithStatus: 403 });
    const error = await uploads.uploadBinary({ source: png() }).catch((thrown: unknown) => thrown);
    expect(mediaErrorCode(error)).toBe('upload-failed');
    expect(api.completions).toEqual([]);
  });

  it('해시 실패는 업로드를 막지 않는다 — 전신 웹 경로에는 없던 보호다', async () => {
    const exploding: HashAdapter = {
      hashLocalFile: () => Promise.reject(new Error('nope')),
      hashBinary: () => Promise.reject(new Error('nope')),
    };
    const { api, uploads } = setup({ hasher: exploding });
    await uploads.uploadBinary({ source: png() });
    expect(api.completions[0]).not.toHaveProperty('contentHash');
  });
});

// 전신 `uploadVideoBlobInternal`(uploader.ts:593-609)이 완료 페이로드로 보내던 3값이다.
// `BinarySource`만으로는 DOM 없이 복원할 수 없어 **호출자가 주지 않으면 영구 유실**이라,
// 한 번 빠뜨리면 서버에 웹 동영상의 치수·재생시간이 영영 안 남는다(조용히 깨지는 부류).
describe('uploadBinary — 동영상 치수·재생시간 전달', () => {
  it('durationMs·dimensions가 완료 페이로드로 간다', async () => {
    const { api, uploads } = setup();

    await uploads.uploadBinary({
      source: mp4(),
      durationMs: 1_200_000,
      dimensions: { width: 1920, height: 1080 },
    });

    expect(api.completions[0]).toMatchObject({
      durationMs: 1_200_000,
      width: 1920,
      height: 1080,
    });
  });

  it('주지 않으면 필드 자체가 없다 — 전신의 truthy 스프레드 보존', async () => {
    const { api, uploads } = setup();

    await uploads.uploadBinary({ source: mp4() });

    expect(api.completions[0]).not.toHaveProperty('durationMs');
    expect(api.completions[0]).not.toHaveProperty('width');
    expect(api.completions[0]).not.toHaveProperty('height');
  });

  it('0·null은 탈락한다 — 전신 uploader.ts:600-602의 truthy 게이트', async () => {
    const { api, uploads } = setup();

    await uploads.uploadBinary({
      source: mp4(),
      durationMs: 0,
      dimensions: { width: null, height: 0 },
    });

    expect(api.completions[0]).not.toHaveProperty('durationMs');
    expect(api.completions[0]).not.toHaveProperty('width');
    expect(api.completions[0]).not.toHaveProperty('height');
  });

  it('이미지는 3값을 받아도 보내지 않는다', async () => {
    const { api, uploads } = setup();

    await uploads.uploadBinary({
      source: png(),
      durationMs: 5000,
      dimensions: { width: 800, height: 600 },
    });

    expect(api.completions[0]).not.toHaveProperty('durationMs');
    expect(api.completions[0]).not.toHaveProperty('width');
  });
});

describe('uploadBinary — 동영상 포스터 3상태', () => {
  const posterSource = (): BinarySource =>
    createBinarySource(fakeBytes(24), { name: 'poster.jpg', type: 'image/jpeg' });

  function countingPoster(result: BinarySource | null) {
    const calls: number[] = [];
    const adapter: BinaryPosterAdapter = {
      posterFromBinary({ atMs }) {
        calls.push(atMs);
        return Promise.resolve(result);
      },
    };
    return { adapter, calls };
  }

  it('undefined = 어댑터로 자동 추출', async () => {
    const { adapter, calls } = countingPoster(posterSource());
    const { api, uploads } = setup({ poster: adapter });

    await uploads.uploadBinary({ source: mp4() });

    expect(calls).toEqual([1000]);
    // 포스터는 본 업로드보다 먼저 presign된다.
    expect(api.intents.map((intent) => intent.fileName)).toEqual(['v-poster.jpg', 'v.mp4']);
    expect(api.completions[0]?.poster).toEqual({
      objectName: api.issued[0]?.objectName,
      sizeBytes: 24,
    });
  });

  it('null = 포스터 없음 — 추출을 **시도조차** 하지 않는다', async () => {
    const { adapter, calls } = countingPoster(posterSource());
    const { api, uploads } = setup({ poster: adapter });

    await uploads.uploadBinary({ source: mp4(), poster: null });

    expect(calls).toEqual([]);
    expect(api.intents).toHaveLength(1);
    expect(api.completions[0]).not.toHaveProperty('poster');
  });

  it('값 = 주어진 포스터를 그대로 쓴다', async () => {
    const { adapter, calls } = countingPoster(null);
    const { api, uploads } = setup({ poster: adapter });

    await uploads.uploadBinary({ source: mp4(), poster: posterSource() });

    expect(calls).toEqual([]);
    expect(api.completions[0]?.poster?.sizeBytes).toBe(24);
  });

  it('어댑터가 없으면 포스터 없이 완료된다', async () => {
    const { api, uploads } = setup();
    await uploads.uploadBinary({ source: mp4() });
    expect(api.completions[0]).not.toHaveProperty('poster');
  });

  it('포스터 추출이 throw해도 동영상 업로드는 완료된다', async () => {
    const exploding: BinaryPosterAdapter = {
      posterFromBinary: () => Promise.reject(new Error('canvas exploded')),
    };
    const { api, uploads } = setup({ poster: exploding });
    const result = await uploads.uploadBinary({ source: mp4() });
    expect(result.duplicate).toBe(false);
    expect(api.completions[0]).not.toHaveProperty('poster');
  });

  it('hostile poster adapter result getter의 raw URL 오류도 optional extraction 실패로만 처리한다', async () => {
    const rawUrl = 'https://poster.example.test/secret?X-Amz-Signature=must-not-leak';
    const hostile: BinaryPosterAdapter = {
      posterFromBinary: () =>
        Promise.resolve({
          get size() {
            throw new Error(`poster source failed for ${rawUrl}`);
          },
          type: 'image/jpeg',
          arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
        } as unknown as BinarySource),
    };
    const { api, uploads } = setup({ poster: hostile });

    const result = await uploads.uploadBinary({ source: mp4() });

    expect(result.duplicate).toBe(false);
    expect(api.intents.map((intent) => intent.fileName)).toEqual(['v.mp4']);
    expect(api.completions[0]).not.toHaveProperty('poster');
  });

  it('빈 포스터(0바이트)는 presign하지 않는다', async () => {
    const { adapter } = countingPoster(
      createBinarySource(new Uint8Array(0), { name: 'p.jpg', type: 'image/jpeg' }),
    );
    const { api, uploads } = setup({ poster: adapter });
    await uploads.uploadBinary({ source: mp4() });
    expect(api.intents).toHaveLength(1);
    expect(api.completions[0]).not.toHaveProperty('poster');
  });

  it('poster PUT의 모호한 실패는 본체를 계속 올리지 않고 cleanup 후보를 남긴다', async () => {
    const rawUrl = 'https://uploads.example.test/poster?X-Amz-Signature=never-public';
    const transport = createRecordingTransport({
      onPut: () => Promise.reject(new Error(`poster PUT failed: ${rawUrl}`)),
    });
    const api = createFakeUploadApi<string>({ asset: (input) => input.objectName });
    const uploads = createBinaryUploads<string>({
      api,
      limits: 'server-enforced',
      platform: fakePlatform('web'),
      transport,
    });

    const error = await uploads
      .uploadBinary({ source: mp4(), poster: posterSource() })
      .catch((thrown: unknown) => thrown);

    expect(mediaErrorCode(error)).toBe('upload-failed');
    expect(String((error as Error).message)).not.toContain(rawUrl);
    expect(api.intents).toEqual([
      { fileName: 'v-poster.jpg', contentType: 'image/jpeg', sizeBytes: 24 },
    ]);
    expect(mediaUploadFailureInfo(error)).toEqual({
      stage: 'put',
      orphanedObjects: [
        {
          objectName: 'objects/0-v-poster.jpg',
          contentType: 'image/jpeg',
          sizeBytes: 24,
          storageState: 'possibly-uploaded',
        },
      ],
    });
  });
});

describe('uploadDropped — 혼합 드롭 부분 업로드 방지(§7 하드닝 10)', () => {
  it('3개 중 1개가 미지원이면 unsupported-file-type + presign 0회 + PUT 0회', async () => {
    const { api, transport, uploads } = setup();
    const files = [
      png('a.png'),
      createBinarySource(fakeBytes(10), { name: 'notes.txt', type: 'text/plain' }),
      mp4('v.mp4'),
    ];

    const error = await uploads.uploadDropped(files).catch((thrown: unknown) => thrown);

    expect(mediaErrorCode(error)).toBe('unsupported-file-type');
    // ⚠ 부분 업로드가 없었다는 직접 증거. 코드만 봐서는 "3개 중 2개는 이미 올라간 뒤"를 구분 못 한다.
    expect(api.intents).toEqual([]);
    expect(transport.puts).toEqual([]);
  });

  it('전부 지원 형식이면 순차로 올라가고 순서가 보존된다', async () => {
    const { api, transport, uploads } = setup();

    const results = await uploads.uploadDropped([png('a.png'), mp4('v.mp4'), jpeg('p.jpg')]);

    expect(results).toHaveLength(3);
    expect(api.intents.map((intent) => intent.fileName)).toEqual(['a.png', 'v.mp4', 'p.jpg']);
    expect(transport.timeline).toEqual([
      'start:0',
      'end:0',
      'start:1',
      'end:1',
      'start:2',
      'end:2',
    ]);
  });

  it('검증은 maxFiles slice **이후**다 — 상한 밖의 미지원 파일이 유효한 배치를 죽이지 않는다', async () => {
    const { api, uploads } = setup();
    const files = [
      png('a.png'),
      png('b.png'),
      createBinarySource(fakeBytes(10), { name: 'notes.txt', type: 'text/plain' }),
    ];

    const results = await uploads.uploadDropped(files, { maxFiles: 2 });

    expect(results).toHaveLength(2);
    expect(api.intents.map((intent) => intent.fileName)).toEqual(['a.png', 'b.png']);
  });

  it('기본 상한은 12장이다', async () => {
    const { api, uploads } = setup();
    const files = Array.from({ length: 15 }, (_unused, index) => png(`a${index}.png`));
    await uploads.uploadDropped(files);
    expect(api.intents).toHaveLength(12);
  });

  it('빈 배치는 no-media-selected', async () => {
    const { uploads } = setup();
    const error = await uploads.uploadDropped([]).catch((thrown: unknown) => thrown);
    expect(mediaErrorCode(error)).toBe('no-media-selected');
  });

  it('collectionId가 배치 전체에 전달된다', async () => {
    const { api, uploads } = setup();
    await uploads.uploadDropped([png('a.png'), png('b.png')], { collectionId: 'album-1' });
    expect(api.completions.map((completion) => completion.collectionId)).toEqual([
      'album-1',
      'album-1',
    ]);
  });
});
