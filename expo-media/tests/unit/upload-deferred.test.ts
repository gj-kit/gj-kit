// presign-only/deferred attachment — 스토리지 PUT 성공과 앱 도메인 등록을 섞지 않는 로컬 경로.
//
// 이 테스트의 핵심은 `MediaUploadIntentApi`가 `completeUpload`를 갖지 않는다는 점이다. 앱이
// 레코드 생성/수정 트랜잭션에서 objectName을 나중에 연결할 수 있어야 하며, 그때까지 라이브러리가
// 존재하지 않는 등록 API를 호출하거나 성공한 것처럼 꾸며서는 안 된다.

import { describe, expect, it } from 'vitest';
import type {
  HashAdapter,
  LocalFileTransport,
  MediaTelemetry,
  MediaUploadIntentApi,
  MediaUploadIntentRequest,
  MediaUploadLimits,
} from '../../src/core';
import { mediaErrorCode, mediaUploadFailureInfo } from '../../src/core';
import { createDeferredLocalUploads } from '../../src/core/upload/uploader';
import {
  createMemoryFileSystem,
  createRecordingTelemetry,
  createRecordingTransport,
  fakeBytes,
  fakePlatform,
} from '../../src/testing';

const IMAGE_URI = 'file:///dcim/deferred.jpg';
const VIDEO_URI = 'file:///dcim/deferred.mp4';
const POSTER_URI = 'file:///cache/deferred-poster.jpg';

function createPresignOnlyApi() {
  const intents: MediaUploadIntentRequest[] = [];
  const api: MediaUploadIntentApi = {
    createUploadIntent(input) {
      intents.push(input);
      return Promise.resolve({
        uploadUrl: `https://uploads.example.test/${input.fileName}`,
        method: 'PUT',
        headers: { 'content-type': input.contentType },
        objectName: `objects/${input.fileName}`,
      });
    },
  };
  return { api, intents };
}

function setup(options?: {
  readonly failWithStatus?: number;
  readonly limits?: MediaUploadLimits | 'server-enforced';
  readonly os?: 'ios' | 'android' | 'web';
  readonly hasher?: HashAdapter;
  readonly transport?: LocalFileTransport;
  readonly api?: MediaUploadIntentApi;
  readonly telemetry?: MediaTelemetry;
}) {
  const files = createMemoryFileSystem({ files: { [IMAGE_URI]: fakeBytes(1234) } });
  const recordingTransport = createRecordingTransport(
    options?.failWithStatus === undefined ? undefined : { failWithStatus: options.failWithStatus },
  );
  const generated = createPresignOnlyApi();
  const api = options?.api ?? generated.api;
  const intents = options?.api ? [] : generated.intents;
  const transport = options?.transport ?? recordingTransport;
  const uploads = createDeferredLocalUploads({
    api,
    limits: options?.limits ?? 'server-enforced',
    platform: fakePlatform(options?.os ?? 'ios'),
    files,
    transport,
    ...(options?.hasher ? { hasher: options.hasher } : {}),
    ...(options?.telemetry ? { telemetry: options.telemetry } : {}),
  });
  return { api, files, intents, transport, recordingTransport, uploads };
}

describe('createDeferredLocalUploads — presign → native PUT → domain attachment', () => {
  it('completeUpload 없는 API로 스트리밍 PUT 후 연결 가능한 completion을 반환한다', async () => {
    const { api, files, intents, recordingTransport, uploads } = setup();

    const attachment = await uploads.uploadLocalFile({
      uri: IMAGE_URI,
      fileName: 'deferred.jpg',
      contentHash: 'cached-hash',
      collectionId: 'draft-42',
      width: 1200,
      height: 800,
    });

    expect('completeUpload' in api).toBe(false);
    expect(intents).toEqual([
      { fileName: 'deferred.jpg', contentType: 'image/jpeg', sizeBytes: 1234 },
    ]);
    expect(recordingTransport.puts).toEqual([
      expect.objectContaining({
        url: 'https://uploads.example.test/deferred.jpg',
        method: 'PUT',
        headers: { 'content-type': 'image/jpeg' },
        uri: IMAGE_URI,
      }),
    ]);
    expect(attachment).toEqual({
      fileName: 'deferred.jpg',
      contentType: 'image/jpeg',
      sizeBytes: 1234,
      objectName: 'objects/deferred.jpg',
      contentHash: 'cached-hash',
      collectionId: 'draft-42',
      width: 1200,
      height: 800,
    });
    // transport는 URI를 네이티브로 넘길 뿐 바이트를 JS 힙에 올리지 않는다.
    expect(files.calls.readBase64).toEqual([]);
  });

  it('크기 제한은 presign과 PUT 전에 동일하게 적용한다', async () => {
    const calls: string[] = [];
    const hasher: HashAdapter = {
      hashLocalFile(uri) {
        calls.push(uri);
        return Promise.resolve('should-not-run');
      },
      hashBinary: () => Promise.resolve('unused'),
    };
    const { intents, recordingTransport, uploads } = setup({
      limits: { image: { maxBytes: 1000 } },
      hasher,
    });

    const error = await uploads
      .uploadLocalFile({ uri: IMAGE_URI, fileName: 'deferred.jpg', contentHash: 'cached-hash' })
      .catch((thrown: unknown) => thrown);

    expect(mediaErrorCode(error)).toBe('file-too-large');
    // cap은 해시와 동영상 poster 생성보다 먼저다. 아니면 거절될 대용량 파일을 먼저 읽는다.
    expect(calls).toEqual([]);
    expect(intents).toEqual([]);
    expect(recordingTransport.puts).toEqual([]);
  });

  it('동영상 포스터의 objectName·sizeBytes 쌍도 attachment에 보존한다', async () => {
    const files = createMemoryFileSystem({
      files: {
        [VIDEO_URI]: fakeBytes(4321),
        [POSTER_URI]: fakeBytes(64),
      },
    });
    const transport = createRecordingTransport();
    const { api, intents } = createPresignOnlyApi();
    const uploads = createDeferredLocalUploads({
      api,
      limits: 'server-enforced',
      platform: fakePlatform('ios'),
      files,
      transport,
      poster: { posterFromLocalFile: () => Promise.resolve({ uri: POSTER_URI }) },
    });

    const attachment = await uploads.uploadLocalFile({
      uri: VIDEO_URI,
      fileName: 'deferred.mp4',
      contentHash: 'video-hash',
    });

    expect(intents.map((intent) => intent.fileName)).toEqual([
      'deferred-poster.jpg',
      'deferred.mp4',
    ]);
    expect(transport.puts).toHaveLength(2);
    expect(attachment).toMatchObject({
      contentType: 'video/mp4',
      objectName: 'objects/deferred.mp4',
      poster: { objectName: 'objects/deferred-poster.jpg', sizeBytes: 64 },
    });
  });

  it('PUT이 2xx가 아니면 attachment를 반환하지 않고 upload-failed를 던진다', async () => {
    const { intents, recordingTransport, uploads } = setup({ failWithStatus: 500 });

    const error = await uploads
      .uploadLocalFile({ uri: IMAGE_URI, fileName: 'deferred.jpg', contentHash: 'cached-hash' })
      .catch((thrown: unknown) => thrown);

    expect(mediaErrorCode(error)).toBe('upload-failed');
    expect(intents).toHaveLength(1);
    expect(recordingTransport.puts).toHaveLength(1);
  });

  it('web에서는 stat·presign·PUT 전에 platform-unsupported로 막는다', async () => {
    const { files, intents, recordingTransport, uploads } = setup({ os: 'web' });

    const error = await uploads
      .uploadLocalFile({ uri: IMAGE_URI, fileName: 'deferred.jpg' })
      .catch((thrown: unknown) => thrown);

    expect(mediaErrorCode(error)).toBe('platform-unsupported');
    expect(files.calls.stat).toEqual([]);
    expect(intents).toEqual([]);
    expect(recordingTransport.puts).toEqual([]);
  });

  it('잘못된 backend intent는 URL을 transport로 넘기지 않고 안전한 intent 실패로 바꾼다', async () => {
    let transportCalls = 0;
    const api: MediaUploadIntentApi = {
      // 실제 JSON seam을 흉내 낸다. 타입 선언이 맞아도 서버 응답은 신뢰 경계다.
      createUploadIntent: () =>
        Promise.resolve({
          uploadUrl: 'https://uploads.example.test/secret?X-Amz-Signature=never-forward',
          method: 'POST',
          headers: { 'content-type': 'image/jpeg' },
          objectName: 'objects/deferred.jpg',
        } as unknown as Awaited<ReturnType<MediaUploadIntentApi['createUploadIntent']>>),
    };
    const transport: LocalFileTransport = {
      putLocalFile: () => {
        transportCalls += 1;
        return Promise.resolve({ status: 200 });
      },
    };
    const { uploads } = setup({ api, transport });

    const error = await uploads
      .uploadLocalFile({ uri: IMAGE_URI, fileName: 'deferred.jpg', contentHash: 'cached' })
      .catch((thrown: unknown) => thrown);

    expect(mediaErrorCode(error)).toBe('upload-failed');
    expect(mediaUploadFailureInfo(error)).toEqual({ stage: 'intent', orphanedObjects: [] });
    expect(String((error as Error).message)).not.toContain('X-Amz-Signature');
    expect(transportCalls).toBe(0);
  });

  it.each([
    'objects/photo.jpg?X-Amz-Signature=never-forward',
    'objects/https%3A%2F%2Fsecret',
    'objects/https%253A%252F%252Fsecret',
    ' objects/deferred.jpg',
    'objects//deferred.jpg',
    'objects/../deferred.jpg',
    '/objects/deferred.jpg',
    'objects/deferred.jpg/',
    'a'.repeat(1025),
  ])('unsafe objectName %j is rejected before transport', async (objectName) => {
    let transportCalls = 0;
    const api: MediaUploadIntentApi = {
      createUploadIntent: () =>
        Promise.resolve({
          uploadUrl: 'https://uploads.example.test/secret?X-Amz-Signature=never-forward',
          method: 'PUT',
          headers: { 'content-type': 'image/jpeg' },
          objectName,
        } as unknown as Awaited<ReturnType<MediaUploadIntentApi['createUploadIntent']>>),
    };
    const transport: LocalFileTransport = {
      putLocalFile: () => {
        transportCalls += 1;
        return Promise.resolve({ status: 200 });
      },
    };
    const { uploads } = setup({ api, transport });

    const error = await uploads
      .uploadLocalFile({ uri: IMAGE_URI, fileName: 'deferred.jpg', contentHash: 'cached' })
      .catch((thrown: unknown) => thrown);

    expect(mediaErrorCode(error)).toBe('upload-failed');
    expect(mediaUploadFailureInfo(error)).toEqual({ stage: 'intent', orphanedObjects: [] });
    expect(transportCalls).toBe(0);
  });

  it('hostile intent getters are snapshotted once and frozen before transport', async () => {
    let uploadUrlReads = 0;
    let objectNameReads = 0;
    const rawUrl = 'https://uploads.example.test/secret?X-Amz-Signature=never-forward';
    const mutableHeaders = { 'content-type': 'image/jpeg' };
    let observed: { readonly url: string; readonly headers: Readonly<Record<string, string>> } | null = null;
    const api: MediaUploadIntentApi = {
      createUploadIntent: () =>
        Promise.resolve({
          get uploadUrl() {
            uploadUrlReads += 1;
            return uploadUrlReads === 1
              ? 'https://uploads.example.test/safe-slot'
              : rawUrl;
          },
          method: 'PUT',
          headers: mutableHeaders,
          get objectName() {
            objectNameReads += 1;
            return objectNameReads === 1 ? 'objects/deferred.jpg' : rawUrl;
          },
        } as unknown as Awaited<ReturnType<MediaUploadIntentApi['createUploadIntent']>>),
    };
    const transport: LocalFileTransport = {
      putLocalFile(input) {
        observed = { url: input.url, headers: input.headers };
        return Promise.resolve({ status: 200 });
      },
    };
    const { uploads } = setup({ api, transport });

    const attachment = await uploads.uploadLocalFile({
      uri: IMAGE_URI,
      fileName: 'deferred.jpg',
      contentHash: 'cached',
    });
    mutableHeaders['content-type'] = 'text/plain';

    expect(uploadUrlReads).toBe(1);
    expect(objectNameReads).toBe(1);
    expect(observed).toEqual({
      url: 'https://uploads.example.test/safe-slot',
      headers: { 'content-type': 'image/jpeg' },
    });
    // TypeScript does not infer assignment through the transport callback, though the preceding
    // structural assertion proves it ran. Keep the runtime immutability assertion explicit.
    const observedRequest = observed as {
      readonly url: string;
      readonly headers: Readonly<Record<string, string>>;
    } | null;
    expect(Object.isFrozen(observedRequest?.headers)).toBe(true);
    expect(attachment.objectName).toBe('objects/deferred.jpg');
  });

  it('raw transport URL 에러는 telemetry와 public error에 새지 않고 cleanup 후보만 남긴다', async () => {
    const rawUrl = 'https://uploads.example.test/secret?X-Amz-Signature=must-not-leak';
    const transport: LocalFileTransport = {
      putLocalFile: () => Promise.reject(new Error(`PUT failed for ${rawUrl}`)),
    };
    const telemetry = createRecordingTelemetry();
    const { uploads } = setup({ transport, telemetry });

    const error = await uploads
      .uploadLocalFile({ uri: IMAGE_URI, fileName: 'deferred.jpg', contentHash: 'cached' })
      .catch((thrown: unknown) => thrown);

    expect(mediaErrorCode(error)).toBe('upload-failed');
    expect(String((error as Error).message)).not.toContain(rawUrl);
    expect(telemetry.spans.find((span) => span.operation === 'media.upload.native')?.error).toBe(error);
    expect(String(telemetry.spans.find((span) => span.operation === 'media.upload.native')?.error)).not.toContain(
      rawUrl,
    );
    expect(mediaUploadFailureInfo(error)).toEqual({
      stage: 'put',
      orphanedObjects: [
        {
          objectName: 'objects/deferred.jpg',
          contentType: 'image/jpeg',
          sizeBytes: 1234,
          storageState: 'possibly-uploaded',
        },
      ],
    });
    expect(JSON.stringify(mediaUploadFailureInfo(error))).not.toContain('X-Amz-Signature');
  });

  it('poster telemetry fail이 raw 에러를 던져도 safe upload failure를 덮어쓰지 못한다', async () => {
    const rawUrl = 'https://telemetry.example.test/secret?X-Amz-Signature=never-public';
    const files = createMemoryFileSystem({
      files: { [VIDEO_URI]: fakeBytes(4321), [POSTER_URI]: fakeBytes(64) },
    });
    const { api } = createPresignOnlyApi();
    const transport: LocalFileTransport = { putLocalFile: () => Promise.reject(new Error('PUT failed')) };
    const telemetry: MediaTelemetry = {
      track: async (_operation, _extra, run) => run(),
      begin: () => ({
        succeed() {},
        cancel() {},
        fail() {
          throw new Error(`telemetry sink failed for ${rawUrl}`);
        },
      }),
    };
    const uploads = createDeferredLocalUploads({
      api,
      limits: 'server-enforced',
      platform: fakePlatform('ios'),
      files,
      transport,
      telemetry,
      poster: { posterFromLocalFile: () => Promise.resolve({ uri: POSTER_URI }) },
    });

    const error = await uploads
      .uploadLocalFile({ uri: VIDEO_URI, fileName: 'deferred.mp4', contentHash: 'cached' })
      .catch((thrown: unknown) => thrown);

    expect(mediaErrorCode(error)).toBe('upload-failed');
    expect(String((error as Error).message)).not.toContain(rawUrl);
    expect(mediaUploadFailureInfo(error)?.stage).toBe('put');
  });

  it('track이 run을 호출하지 않거나 성공 뒤 raw로 reject해도 실제 upload는 한 번만 완료한다', async () => {
    const rawUrl = 'https://telemetry.example.test/secret?X-Amz-Signature=never-public';
    const noRunTelemetry: MediaTelemetry = {
      // A buggy observer that resolves without invoking `run` must not skip the upload.
      track: async () => undefined as never,
      begin: () => ({ succeed() {}, fail() {}, cancel() {} }),
    };
    const noRun = setup({ telemetry: noRunTelemetry });
    const attachment = await noRun.uploads.uploadLocalFile({
      uri: IMAGE_URI,
      fileName: 'deferred.jpg',
      contentHash: 'cached',
    });
    expect(attachment.objectName).toBe('objects/deferred.jpg');
    expect(noRun.recordingTransport.puts).toHaveLength(1);

    const afterRunTelemetry: MediaTelemetry = {
      track: async (_operation, _extra, run) => {
        await run();
        throw new Error(`late telemetry failure ${rawUrl}`);
      },
      begin: () => ({ succeed() {}, fail() {}, cancel() {} }),
    };
    const afterRun = setup({ telemetry: afterRunTelemetry });
    await expect(
      afterRun.uploads.uploadLocalFile({
        uri: IMAGE_URI,
        fileName: 'deferred.jpg',
        contentHash: 'cached',
      }),
    ).resolves.toMatchObject({ objectName: 'objects/deferred.jpg' });
    await Promise.resolve(); // let the observer's rejected promise reach its swallowed catch.
    expect(afterRun.recordingTransport.puts).toHaveLength(1);
  });

  it('poster telemetry begin이 raw로 throw해도 poster와 main upload를 계속한다', async () => {
    const rawUrl = 'https://telemetry.example.test/secret?X-Amz-Signature=never-public';
    const files = createMemoryFileSystem({
      files: { [VIDEO_URI]: fakeBytes(4321), [POSTER_URI]: fakeBytes(64) },
    });
    const { api } = createPresignOnlyApi();
    const uploads = createDeferredLocalUploads({
      api,
      limits: 'server-enforced',
      platform: fakePlatform('ios'),
      files,
      transport: createRecordingTransport(),
      telemetry: {
        track: async (_operation, _extra, run) => run(),
        begin: () => {
          throw new Error(`begin failed ${rawUrl}`);
        },
      },
      poster: { posterFromLocalFile: () => Promise.resolve({ uri: POSTER_URI }) },
    });

    const attachment = await uploads.uploadLocalFile({
      uri: VIDEO_URI,
      fileName: 'deferred.mp4',
      contentHash: 'cached',
    });
    expect(attachment.poster).toEqual({ objectName: 'objects/deferred-poster.jpg', sizeBytes: 64 });
  });

  it('poster 성공 후 main PUT 실패에는 둘 다 안전한 cleanup 후보로 남는다', async () => {
    const files = createMemoryFileSystem({
      files: {
        [VIDEO_URI]: fakeBytes(4321),
        [POSTER_URI]: fakeBytes(64),
      },
    });
    const { api } = createPresignOnlyApi();
    const rawUrl = 'https://telemetry.example.test/secret?X-Amz-Signature=never-public';
    const transport = createRecordingTransport({
      onPut: (_put, index) => {
        if (index === 1) return Promise.reject(new Error('main PUT failed'));
      },
    });
    const uploads = createDeferredLocalUploads({
      api,
      limits: 'server-enforced',
      platform: fakePlatform('ios'),
      files,
      transport,
      telemetry: {
        track: async (_operation, _extra, run) => run(),
        begin: () => ({
          // The poster itself succeeds before the main failure; this used to be an unguarded raw
          // exception path that could hide both cleanup candidates.
          succeed() {
            throw new Error(`succeed failed ${rawUrl}`);
          },
          fail() {},
          cancel() {},
        }),
      },
      poster: { posterFromLocalFile: () => Promise.resolve({ uri: POSTER_URI }) },
    });

    const error = await uploads
      .uploadLocalFile({ uri: VIDEO_URI, fileName: 'deferred.mp4', contentHash: 'cached' })
      .catch((thrown: unknown) => thrown);

    expect(String((error as Error).message)).not.toContain(rawUrl);
    expect(mediaUploadFailureInfo(error)).toEqual({
      stage: 'put',
      orphanedObjects: [
        {
          objectName: 'objects/deferred-poster.jpg',
          contentType: 'image/jpeg',
          sizeBytes: 64,
          storageState: 'uploaded',
        },
        {
          objectName: 'objects/deferred.mp4',
          contentType: 'video/mp4',
          sizeBytes: 4321,
          storageState: 'possibly-uploaded',
        },
      ],
    });
  });

  it('poster PUT이 모호하게 실패하면 본체를 계속 올리지 않고 poster cleanup 후보를 공개한다', async () => {
    const files = createMemoryFileSystem({
      files: {
        [VIDEO_URI]: fakeBytes(4321),
        [POSTER_URI]: fakeBytes(64),
      },
    });
    const { api, intents } = createPresignOnlyApi();
    const rawUrl = 'https://uploads.example.test/poster?X-Amz-Signature=never-public';
    const telemetry = createRecordingTelemetry();
    const transport: LocalFileTransport = {
      putLocalFile: () => Promise.reject(new Error(`poster PUT failed: ${rawUrl}`)),
    };
    const uploads = createDeferredLocalUploads({
      api,
      limits: 'server-enforced',
      platform: fakePlatform('ios'),
      files,
      transport,
      telemetry,
      poster: { posterFromLocalFile: () => Promise.resolve({ uri: POSTER_URI }) },
    });

    const error = await uploads
      .uploadLocalFile({ uri: VIDEO_URI, fileName: 'deferred.mp4', contentHash: 'cached' })
      .catch((thrown: unknown) => thrown);

    expect(mediaErrorCode(error)).toBe('upload-failed');
    expect(String((error as Error).message)).not.toContain(rawUrl);
    expect(telemetry.spans.find((span) => span.operation === 'media.upload.poster.native')?.error).toBe(
      error,
    );
    expect(
      String(telemetry.spans.find((span) => span.operation === 'media.upload.poster.native')?.error),
    ).not.toContain(rawUrl);
    expect(intents).toEqual([
      { fileName: 'deferred-poster.jpg', contentType: 'image/jpeg', sizeBytes: 64 },
    ]);
    expect(mediaUploadFailureInfo(error)).toEqual({
      stage: 'put',
      orphanedObjects: [
        {
          objectName: 'objects/deferred-poster.jpg',
          contentType: 'image/jpeg',
          sizeBytes: 64,
          storageState: 'possibly-uploaded',
        },
      ],
    });
  });

  it('poster cap은 poster presign·PUT 전에 안전하게 건너뛰고 본체 업로드는 계속한다', async () => {
    const files = createMemoryFileSystem({
      files: {
        [VIDEO_URI]: fakeBytes(4321),
        [POSTER_URI]: fakeBytes(64),
      },
    });
    const { api, intents } = createPresignOnlyApi();
    const transport = createRecordingTransport();
    const rawUrl = 'https://telemetry.example.test/secret?X-Amz-Signature=never-public';
    const uploads = createDeferredLocalUploads({
      api,
      limits: { image: { maxBytes: 32 }, video: { maxBytes: 5000 } },
      platform: fakePlatform('ios'),
      files,
      transport,
      telemetry: {
        track: async (_operation, _extra, run) => run(),
        begin: () => ({
          succeed() {},
          fail() {},
          cancel() {
            throw new Error(`cancel failed ${rawUrl}`);
          },
        }),
      },
      poster: { posterFromLocalFile: () => Promise.resolve({ uri: POSTER_URI }) },
    });

    const attachment = await uploads.uploadLocalFile({
      uri: VIDEO_URI,
      fileName: 'deferred.mp4',
      contentHash: 'cached',
    });

    expect(intents).toEqual([
      { fileName: 'deferred.mp4', contentType: 'video/mp4', sizeBytes: 4321 },
    ]);
    expect(transport.puts).toHaveLength(1);
    expect(attachment).not.toHaveProperty('poster');
  });
});
