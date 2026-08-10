// 설계 문서 §5.4-⑤ · §7 하드닝 7 · §7.1(의도적 순차 실행).
//
// ⚠ **순차 실행은 취향이 아니라 하드닝이다.** iOS에서 각 resolve는 PhotoKit 원본을 앱 캐시로
//   실체화하므로(하드닝 2), 병렬화하면 동시에 존재하는 사본 수만큼 디스크·네트워크 압력이
//   곱해진다. 그 규율은 "동시 진행 0"으로만 관측되며, 관측하려면 전송이 실제로 지연되어야
//   한다 — `RecordingTransport.timeline`이 그 수단이다.

import { describe, expect, it } from 'vitest';
import type { DeviceAssetRef } from '../../src/core/adapters';
import { createDeviceLibrary } from '../../src/core/device/deviceLibrary';
import { createStagingCache } from '../../src/core/staging';
import { createDeviceUploads } from '../../src/core/upload/deviceUploads';
import { createLocalUploads } from '../../src/core/upload/uploader';
import {
  createFakeDeviceLibrary,
  createFakeUploadApi,
  createMemoryFileSystem,
  createRecordingTransport,
  fakeBytes,
  fakePlatform,
} from '../../src/testing';

const REFS: readonly DeviceAssetRef[] = [
  { id: 'A1', filename: 'IMG_0001.jpg' },
  { id: 'A2', filename: 'IMG_0002.jpg' },
  { id: 'A3', filename: 'IMG_0003.jpg' },
];

function setup(options?: {
  readonly failWithStatus?: number;
  readonly onPut?: () => Promise<void> | void;
}) {
  const sources = Object.fromEntries(
    REFS.map((ref) => [`file:///dcim/${ref.filename}`, fakeBytes(128)]),
  );
  const files = createMemoryFileSystem({ files: sources });
  const transport = createRecordingTransport({
    ...(options?.failWithStatus === undefined ? {} : { failWithStatus: options.failWithStatus }),
    ...(options?.onPut ? { onPut: options.onPut } : {}),
  });
  const api = createFakeUploadApi<string>({ asset: (input) => input.objectName });
  const staging = createStagingCache({ namespace: 'gj-media', files });
  const adapter = createFakeDeviceLibrary({
    assets: REFS.map((ref) => ({
      id: ref.id,
      filename: ref.filename,
      uri: `file:///dcim/${ref.filename}`,
      width: 100,
      height: 100,
      mediaType: 'image' as const,
    })),
  });
  const device = createDeviceLibrary({
    adapter,
    files,
    staging,
    platform: fakePlatform('ios'), // iOS이므로 file:// 후보도 캐시로 실체화된다(하드닝 2).
  });
  // ⚠ `LocalUploads`에는 staging을 주지 않는다 — 정리 주체를 하나로 고정해야
  //   "정확히 1회"라는 단언이 의미를 갖는다(킷 조립에서는 양쪽이 다 갖지만, remove는 멱등이다).
  const uploads = createLocalUploads<string>({
    api,
    limits: 'server-enforced',
    platform: fakePlatform('ios'),
    files,
    transport,
  });
  const deviceUploads = createDeviceUploads<string>({ device, uploads, staging });
  return { files, transport, api, deviceUploads, staging };
}

const stagedUri = (ref: DeviceAssetRef): string => `file:///cache/gj-media-upload-${ref.id}.jpg`;

describe('uploadDeviceAssets — 의도적 순차 실행', () => {
  it('동시 진행 0 — 전송 시작/종료가 교차하지 않는다', async () => {
    const { transport, deviceUploads } = setup({
      // 지연이 없으면 순차와 병렬의 타임라인이 구분되지 않는다.
      onPut: () => new Promise<void>((resolve) => setTimeout(resolve, 5)),
    });

    await deviceUploads.uploadDeviceAssets(REFS);

    expect(transport.timeline).toEqual([
      'start:0',
      'end:0',
      'start:1',
      'end:1',
      'start:2',
      'end:2',
    ]);
  });

  it('max로 자른다', async () => {
    const { api, deviceUploads } = setup();
    const results = await deviceUploads.uploadDeviceAssets(REFS, { max: 2 });
    expect(results).toHaveLength(2);
    expect(api.completions.map((completion) => completion.fileName)).toEqual([
      'IMG_0001.jpg',
      'IMG_0002.jpg',
    ]);
  });

  it('resolve 결과의 verified 크기가 presign에 그대로 실린다', async () => {
    const { api, deviceUploads } = setup();
    await deviceUploads.uploadDeviceAssets([REFS[0]!]);
    expect(api.intents[0]?.sizeBytes).toBe(128);
  });
});

describe('스테이징 정리 (§7 하드닝 7)', () => {
  it('업로드 성공 후 사본이 정확히 1회 지워진다', async () => {
    const { files, deviceUploads } = setup();

    await deviceUploads.uploadDeviceAssets(REFS);

    expect(files.calls.remove).toEqual(REFS.map(stagedUri));
    // 앱 컨테이너에 원본 사본이 남지 않는다 — 누락 시 업로드한 모든 사진만큼 축적된다.
    expect(files.list().filter((uri) => uri.includes('gj-media-upload-'))).toEqual([]);
  });

  it('업로드 실패에도 정확히 1회 지워진다 — finally 보장', async () => {
    const { files, deviceUploads } = setup({ failWithStatus: 500 });

    await expect(deviceUploads.uploadDeviceAssets(REFS)).rejects.toThrow();

    // 첫 자산에서 멈추지만 그 사본은 반드시 정리된다.
    expect(files.calls.remove).toEqual([stagedUri(REFS[0]!)]);
    expect(files.list().filter((uri) => uri.includes('gj-media-upload-'))).toEqual([]);
  });
});
