// 설계 문서 §5.1(스팬 계약) · §7.2(안정적 operation 6종).
//
// ⚠ operation 이름과 payload 키는 **소비자 대시보드·알림 규칙의 입력**이다 — rename = 파괴적
//   변경이므로 하드닝과 동급으로 보존한다. 그래서:
//   1. `MEDIA_OPERATIONS`를 **인라인 리터럴 배열**로 단언한다(스냅샷은 `-u`로 조용히 갱신된다).
//   2. 전 파이프라인을 페이크 텔레메트리로 돌려 **수집된 집합이 정확히 일치**함을 본다 —
//      이름 오타와 호출 누락을 동시에 잡는 유일한 방법이다.
//   3. 빈 포스터는 `cancel`이다 — 실패도 성공도 아닌 3번째 종료 상태이며, 이 구분이 사라지면
//      빈 포스터가 성공률 지표에 섞여 든다.

import { describe, expect, it } from 'vitest';
import type { BinaryPosterAdapter, BinarySource, LocalPosterAdapter } from '../../src/core/adapters';
import { MEDIA_OPERATIONS } from '../../src/core/telemetry';
import { createMediaSaver } from '../../src/core/save/saver';
import { createBinaryUploads } from '../../src/core/upload/binary';
import { createLocalUploads } from '../../src/core/upload/uploader';
import {
  createBinarySource,
  createFakeUploadApi,
  createMemoryFileSystem,
  createRecordingTelemetry,
  createRecordingTransport,
  fakeBytes,
  fakePlatform,
} from '../../src/testing';

const IMAGE_URI = 'file:///dcim/a.jpg';
const VIDEO_URI = 'file:///dcim/v.mp4';
const POSTER_URI = 'file:///cache/poster.jpg';

describe('MEDIA_OPERATIONS', () => {
  it('6종 — 이름 자체가 계약이다', () => {
    expect(MEDIA_OPERATIONS).toEqual([
      'media.upload.native',
      'media.upload.web-image',
      'media.upload.web-video',
      'media.upload.poster.native',
      'media.upload.poster.web',
      'media.save-to-device',
    ]);
  });
});

describe('전 파이프라인 수집 집합', () => {
  it('로컬·웹이미지·웹비디오·포스터×2·저장을 돌리면 정확히 6종이 모인다', async () => {
    const telemetry = createRecordingTelemetry();
    const files = createMemoryFileSystem({
      files: {
        [IMAGE_URI]: fakeBytes(500),
        [VIDEO_URI]: fakeBytes(700),
        [POSTER_URI]: fakeBytes(20),
      },
    });
    const transport = createRecordingTransport();
    const api = createFakeUploadApi<string>({ asset: (input) => input.objectName });
    const localPoster: LocalPosterAdapter = {
      posterFromLocalFile: () => Promise.resolve({ uri: POSTER_URI }),
    };
    const binaryPoster: BinaryPosterAdapter = {
      posterFromBinary: () =>
        Promise.resolve(createBinarySource(fakeBytes(20), { name: 'p.jpg', type: 'image/jpeg' })),
    };

    const local = createLocalUploads<string>({
      api,
      limits: 'server-enforced',
      platform: fakePlatform('ios'),
      telemetry,
      files,
      transport,
      poster: localPoster,
    });
    const binary = createBinaryUploads<string>({
      api,
      limits: 'server-enforced',
      platform: fakePlatform('web'),
      telemetry,
      transport,
      poster: binaryPoster,
    });
    const saver = createMediaSaver({
      target: {
        kind: 'browser-download',
        browser: { saveByDownload: () => Promise.resolve() },
      },
      telemetry,
    });

    // 네이티브 동영상 = media.upload.native + media.upload.poster.native
    await local.uploadLocalFile({ uri: VIDEO_URI, fileName: 'v.mp4' });
    await local.uploadLocalFile({ uri: IMAGE_URI, fileName: 'a.jpg' });
    // 웹 동영상 = media.upload.web-video + media.upload.poster.web
    await binary.uploadBinary({
      source: createBinarySource(fakeBytes(300), { name: 'v.mp4', type: 'video/mp4' }),
    });
    await binary.uploadBinary({
      source: createBinarySource(fakeBytes(300), { name: 'a.png', type: 'image/png' }),
    });
    await saver.saveToDevice([{ id: '1', url: 'https://x.test/o/a.jpg' }]);

    expect(new Set(telemetry.operations())).toEqual(new Set(MEDIA_OPERATIONS));
    // 모든 스팬이 정확히 한 번 종료됐다.
    expect(telemetry.spans.every((span) => span.outcome !== null)).toBe(true);
    expect(telemetry.spans.filter((span) => span.outcome === 'fail')).toEqual([]);
  });
});

describe('시작 payload — 키와 값이 계약이다(§7.2)', () => {
  function localSetup() {
    const telemetry = createRecordingTelemetry();
    const files = createMemoryFileSystem();
    const transport = createRecordingTransport();
    const api = createFakeUploadApi<string>({ asset: (input) => input.objectName });
    const uploads = createLocalUploads<string>({
      api,
      limits: 'server-enforced',
      platform: fakePlatform('ios'),
      telemetry,
      files,
      transport,
    });
    return { telemetry, uploads };
  }

  it('media.upload.native — { contentType, sizeBucket, hasPoster }', async () => {
    const { telemetry, uploads } = localSetup();
    // 크기·해시를 주입하면 파일이 없어도 파이프라인이 돈다 — 버킷 경계만 보는 테스트다.
    await uploads.uploadLocalFile({
      uri: 'file:///x.jpg',
      fileName: 'a.jpg',
      sizeBytes: 500,
      contentHash: 'h',
    });
    expect(telemetry.spans[0]).toMatchObject({
      operation: 'media.upload.native',
      kind: 'track',
      extra: { contentType: 'image/jpeg', sizeBucket: 'under-1mb', hasPoster: false },
    });
  });

  it.each([
    [999_999, 'under-1mb'],
    [1_000_000, '1-10mb'],
    [9_999_999, '1-10mb'],
    [10_000_000, '10-100mb'],
    [99_999_999, '10-100mb'],
    [100_000_000, 'over-100mb'],
  ])('sizeBucket(%i) = %s — 경계를 바꾸면 과거 로그와 비교 불가능해진다', async (size, bucket) => {
    const { telemetry, uploads } = localSetup();
    await uploads.uploadLocalFile({
      uri: 'file:///x.jpg',
      fileName: 'a.jpg',
      sizeBytes: size,
      contentHash: 'h',
    });
    expect(telemetry.spans[0]?.extra).toMatchObject({ sizeBucket: bucket });
  });

  it('media.upload.web-image / web-video — { contentType, sizeBucket }', async () => {
    const telemetry = createRecordingTelemetry();
    const api = createFakeUploadApi<string>({ asset: (input) => input.objectName });
    const uploads = createBinaryUploads<string>({
      api,
      limits: 'server-enforced',
      platform: fakePlatform('web'),
      telemetry,
      transport: createRecordingTransport(),
    });

    await uploads.uploadBinary({
      source: createBinarySource(fakeBytes(10), { name: 'a.png', type: 'image/png' }),
    });
    await uploads.uploadBinary({
      source: createBinarySource(fakeBytes(10), { name: 'v.mp4', type: 'video/mp4' }),
    });

    expect(telemetry.spans[0]).toMatchObject({
      operation: 'media.upload.web-image',
      extra: { contentType: 'image/png', sizeBucket: 'under-1mb' },
    });
    expect(telemetry.spans[1]).toMatchObject({
      operation: 'media.upload.web-video',
      extra: { contentType: 'video/mp4', sizeBucket: 'under-1mb' },
    });
  });

  it('실패는 fail로 종료되고 예외는 삼켜지지 않는다', async () => {
    const telemetry = createRecordingTelemetry();
    const api = createFakeUploadApi<string>({ asset: (input) => input.objectName });
    const uploads = createBinaryUploads<string>({
      api,
      limits: 'server-enforced',
      platform: fakePlatform('web'),
      telemetry,
      transport: createRecordingTransport({ failWithStatus: 500 }),
    });

    await expect(
      uploads.uploadBinary({
        source: createBinarySource(fakeBytes(10), { name: 'a.png', type: 'image/png' }),
      }),
    ).rejects.toThrow();

    expect(telemetry.spans[0]?.outcome).toBe('fail');
  });
});

describe('빈 포스터는 cancel이다 (§7.2 unit 3)', () => {
  it('media.upload.poster.native가 cancel 1회 + reason:"empty-poster"', async () => {
    const telemetry = createRecordingTelemetry();
    const files = createMemoryFileSystem({
      files: { [VIDEO_URI]: fakeBytes(700), [POSTER_URI]: new Uint8Array(0) },
    });
    const api = createFakeUploadApi<string>({ asset: (input) => input.objectName });
    const uploads = createLocalUploads<string>({
      api,
      limits: 'server-enforced',
      platform: fakePlatform('ios'),
      telemetry,
      files,
      transport: createRecordingTransport(),
      poster: { posterFromLocalFile: () => Promise.resolve({ uri: POSTER_URI }) },
    });

    await uploads.uploadLocalFile({ uri: VIDEO_URI, fileName: 'v.mp4' });

    const posterSpans = telemetry.spans.filter(
      (span) => span.operation === 'media.upload.poster.native',
    );
    expect(posterSpans).toHaveLength(1);
    expect(posterSpans[0]?.outcome).toBe('cancel');
    expect(posterSpans[0]?.finish).toEqual({ extra: { reason: 'empty-poster' } });
    // 성공률 지표에 섞이지 않는다.
    expect(posterSpans.filter((span) => span.outcome === 'succeed')).toEqual([]);
    expect(posterSpans.filter((span) => span.outcome === 'fail')).toEqual([]);
  });

  it('포스터가 실제로 올라가면 succeed + sizeBucket', async () => {
    const telemetry = createRecordingTelemetry();
    const files = createMemoryFileSystem({
      files: { [VIDEO_URI]: fakeBytes(700), [POSTER_URI]: fakeBytes(20) },
    });
    const api = createFakeUploadApi<string>({ asset: (input) => input.objectName });
    const uploads = createLocalUploads<string>({
      api,
      limits: 'server-enforced',
      platform: fakePlatform('ios'),
      telemetry,
      files,
      transport: createRecordingTransport(),
      poster: { posterFromLocalFile: () => Promise.resolve({ uri: POSTER_URI }) },
    });

    await uploads.uploadLocalFile({ uri: VIDEO_URI, fileName: 'v.mp4' });

    const poster = telemetry.spans.find(
      (span) => span.operation === 'media.upload.poster.native',
    );
    expect(poster?.outcome).toBe('succeed');
    expect(poster?.finish).toEqual({ extra: { sizeBucket: 'under-1mb' } });
    // 본 업로드 스팬은 포스터가 확정된 뒤에 열린다.
    expect(telemetry.spans.map((span) => span.operation)).toEqual([
      'media.upload.poster.native',
      'media.upload.native',
    ]);
    expect(telemetry.spans[1]?.extra).toMatchObject({ hasPoster: true });
  });

  it('웹 포스터도 같은 규약 — 빈 포스터는 스팬 자체를 열지 않는다', async () => {
    const telemetry = createRecordingTelemetry();
    const api = createFakeUploadApi<string>({ asset: (input) => input.objectName });
    const empty: BinarySource = createBinarySource(new Uint8Array(0), {
      name: 'p.jpg',
      type: 'image/jpeg',
    });
    const uploads = createBinaryUploads<string>({
      api,
      limits: 'server-enforced',
      platform: fakePlatform('web'),
      telemetry,
      transport: createRecordingTransport(),
      poster: { posterFromBinary: () => Promise.resolve(empty) },
    });

    await uploads.uploadBinary({
      source: createBinarySource(fakeBytes(10), { name: 'v.mp4', type: 'video/mp4' }),
    });

    expect(telemetry.operations()).toEqual(['media.upload.web-video']);
  });
});
