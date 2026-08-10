// 설계 문서 §10.1 — **전 파이프라인 왕복**을 expo·react-native 모킹 0으로 돈다.
//
//   pick → stat → hash → intent → PUT → complete → staging cleanup
//
// 이 파일의 존재 이유는 개별 유닛이 잡지 못하는 것 하나다: **단계의 순서**. 전신의 동종 테스트는
// `jest.mock("…/photo-kit/src/hashFile")` 같은 딥 경로 모듈 모킹 4중첩이었고, 구현을 조금만
// 옮겨도 통째로 무너지면서 무엇이 검증되고 있었는지도 알 수 없었다(§5.6 머리말).
// 인메모리 어댑터는 **계약**에 붙으므로 구현이 움직여도 살아남고, 단계 순서를 실제 호출 순서로
// 관측한다.

import { describe, expect, it } from 'vitest';
import type { FileSystemAdapter, HashAdapter } from '../../src/core/adapters';
import { createDeviceLibrary } from '../../src/core/device/deviceLibrary';
import { createStagingCache } from '../../src/core/staging';
import { createDeviceUploads } from '../../src/core/upload/deviceUploads';
import { createPickerFlows } from '../../src/core/upload/pickerFlows';
import { createLocalUploads } from '../../src/core/upload/uploader';
import type { MemoryFileSystem } from '../../src/testing';
import {
  EXIF_FIXTURE,
  EXIF_GEO_POINT,
  createFakeDeviceLibrary,
  createFakePicker,
  createFakeUploadApi,
  createMemoryFileSystem,
  createRecordingTransport,
  exifCapturedAtIso,
  fakeBytes,
  fakePlatform,
} from '../../src/testing';

/** 단계 순서를 관측하기 위한 얇은 래퍼. 페이크의 동작은 그대로 통과시킨다. */
function tracedFiles(memory: MemoryFileSystem, events: string[]): FileSystemAdapter {
  return {
    cacheDirectory: () => memory.cacheDirectory(),
    stat: (uri) => {
      events.push('stat');
      return memory.stat(uri);
    },
    copy: (input) => {
      events.push('copy');
      return memory.copy(input);
    },
    remove: (uri) => {
      events.push('cleanup');
      return memory.remove(uri);
    },
    readBase64: (uri, range) => memory.readBase64(uri, range),
  };
}

function tracedHasher(events: string[]): HashAdapter {
  return {
    hashLocalFile: () => {
      events.push('hash');
      return Promise.resolve('content-hash');
    },
    hashBinary: () => {
      events.push('hash');
      return Promise.resolve('content-hash');
    },
  };
}

describe('피커 파이프라인 — pick → stat → hash → intent → PUT → complete', () => {
  it('한 번의 호출로 전 구간을 돌고 각 단계가 정확히 한 번씩 순서대로 일어난다', async () => {
    const events: string[] = [];
    const memory = createMemoryFileSystem({ files: { 'file:///dcim/a.jpg': fakeBytes(2048) } });
    const files = tracedFiles(memory, events);
    const transport = createRecordingTransport({
      onPut: () => {
        events.push('put');
      },
    });
    const api = createFakeUploadApi<string>({
      asset: (input) => input.objectName,
      objectName: (input) => `objects/${input.fileName}`,
    });
    const picker = createFakePicker([
      {
        uri: 'file:///dcim/a.jpg',
        assetId: 'A1',
        fileName: 'a.jpg',
        mimeType: 'image/jpeg',
        width: 4032,
        height: 3024,
        exif: EXIF_FIXTURE,
        reportedSizeBytes: 999_999, // ⚠ 자칭 크기 — file-system stat이 이겨야 한다.
      },
    ]);
    const uploads = createLocalUploads<string>({
      api,
      limits: { image: { maxBytes: 10_000_000 } },
      platform: fakePlatform('android'),
      files,
      transport,
      hasher: tracedHasher(events),
    });
    const flows = createPickerFlows<string>({ picker, uploads, platform: fakePlatform('android') });

    const results = await flows.pickAndUpload({ collectionId: 'album-1' });

    // ① 단계 순서
    expect(events).toEqual(['stat', 'hash', 'put']);
    // ② 권한 → 선택
    expect(picker.calls.libraryPermission).toEqual([['image']]);
    expect(picker.calls.pick).toEqual([{ kinds: ['image'], max: 12 }]);
    // ③ presign — 크기는 stat 값이지 자칭 값이 아니다(§7 하드닝 3)
    expect(api.intents).toEqual([
      { fileName: 'a.jpg', contentType: 'image/jpeg', sizeBytes: 2048 },
    ]);
    // ④ PUT — 발급받은 슬롯 그대로, 로컬 URI 스트리밍(본문 없음 = 바이트를 힙에 올리지 않았다)
    expect(transport.puts).toEqual([
      {
        url: api.issued[0]?.uploadUrl,
        method: 'PUT',
        headers: { 'content-type': 'image/jpeg' },
        uri: 'file:///dcim/a.jpg',
      },
    ]);
    expect(memory.calls.readBase64).toEqual([]);
    // ⑤ complete — EXIF·해시·치수·앨범이 모두 실린다
    expect(api.completions).toEqual([
      {
        fileName: 'a.jpg',
        contentType: 'image/jpeg',
        sizeBytes: 2048,
        objectName: 'objects/a.jpg',
        contentHash: 'content-hash',
        collectionId: 'album-1',
        photo: { capturedAt: exifCapturedAtIso(), geoPoint: EXIF_GEO_POINT },
        width: 4032,
        height: 3024,
      },
    ]);
    expect(results).toEqual([{ asset: 'objects/a.jpg', duplicate: false }]);
  });
});

describe('기기 라이브러리 파이프라인 — resolve → stat → hash → intent → PUT → complete → cleanup', () => {
  it('iOS 스테이징 사본을 만들어 올리고 마지막에 지운다', async () => {
    const events: string[] = [];
    const memory = createMemoryFileSystem({
      files: { 'file:///dcim/IMG_0001.jpg': fakeBytes(4096) },
    });
    const files = tracedFiles(memory, events);
    const transport = createRecordingTransport({
      onPut: () => {
        events.push('put');
      },
    });
    const api = createFakeUploadApi<string>({
      asset: (input) => input.objectName,
      objectName: (input) => `objects/${input.fileName}`,
      duplicateWhen: (input) => input.contentHash === 'content-hash',
    });
    const adapter = createFakeDeviceLibrary({
      assets: [
        {
          id: 'A1',
          filename: 'IMG_0001.jpg',
          uri: 'ph://A1/L0/001', // ⚠ iOS가 실제로 주는 값 — 그대로 올리면 URLSession이 죽는다.
          width: 4032,
          height: 3024,
          mediaType: 'image',
        },
      ],
      assetInfo: {
        A1: { localUri: 'file:///dcim/IMG_0001.jpg', uri: 'ph://A1/L0/001', isNetworkAsset: false },
      },
    });
    const staging = createStagingCache({ namespace: 'gj-media', files });
    const platform = fakePlatform('ios');
    const device = createDeviceLibrary({ adapter, files, staging, platform });
    const uploads = createLocalUploads<string>({
      api,
      limits: 'server-enforced',
      platform,
      files,
      transport,
      hasher: tracedHasher(events),
    });
    const deviceUploads = createDeviceUploads<string>({ device, uploads, staging });

    const results = await deviceUploads.uploadDeviceAssets([
      { id: 'A1', filename: 'IMG_0001.jpg' },
    ]);

    const stagedUri = 'file:///cache/gj-media-upload-A1.jpg';
    // ① 단계 순서 — copy(실체화) → stat(실측 크기) → hash → put → cleanup.
    //    ⚠ verified 크기가 있으므로 업로더는 stat을 다시 하지 않는다(§7 하드닝 3).
    expect(events).toEqual(['copy', 'stat', 'hash', 'put', 'cleanup']);
    // ② 어댑터 조회는 iCloud 다운로드 없이 한 번
    expect(adapter.calls.getAssetInfo).toEqual([{ assetId: 'A1', downloadFromNetwork: false }]);
    // ③ PUT 대상은 스테이징 사본이지 ph:// 가 아니다
    expect(transport.puts[0]?.uri).toBe(stagedUri);
    expect(api.intents).toEqual([
      { fileName: 'IMG_0001.jpg', contentType: 'image/jpeg', sizeBytes: 4096 },
    ]);
    // ④ 중복 판정이 그대로 전달된다(옵셔널이면 "새로 만들어졌다"로 오독된다 — §6.1-⑯)
    expect(results).toEqual([{ asset: 'objects/IMG_0001.jpg', duplicate: true }]);
    // ⑤ 앱 컨테이너에 사본이 남지 않는다
    expect(memory.list()).toEqual(['file:///dcim/IMG_0001.jpg']);
  });
});
