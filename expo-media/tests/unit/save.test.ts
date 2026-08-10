// 설계 문서 §5.4-⑥ · §5.7.3(G8) · §7.1 — 기기 저장(역방향 경로).
//
// 지키는 것 넷:
//   ① 저장 파일명 4분기 + **5자 초과 확장자 거부** — 토큰 프록시 URL엔 확장자가 없고, 상한이
//      없으면 쿼리 조각이 확장자로 붙어 기기에서 열리지 않는 파일이 저장된다.
//   ② 다운로드 status **2xx 범위** 검증 + 실패 시 임시 파일 정리(`status < 400`이 아니다 —
//      3xx가 몸통 없이 도착하면 0바이트 파일이 사진첩에 저장된다).
//   ③ Android Expo Go 권한 요청 스킵(`skipPermissionRequest`).
//   ④ `SaveResult.mode`가 `target.kind`에서 **파생**된다 — 보고와 실동작이 어긋날 수 없다.

import { describe, expect, it } from 'vitest';
import type { BrowserSaveAdapter, MediaLibrarySaveAdapter, MediaPermission } from '../../src/core/adapters';
import { mediaErrorCode } from '../../src/core/errors';
import { mediaDownloadFileName } from '../../src/core/save/fileName';
import { createMediaSaver } from '../../src/core/save/saver';
import { createMemoryFileSystem, createRecordingTelemetry, fakeBytes } from '../../src/testing';

const GRANTED: MediaPermission = { granted: true, canAskAgain: true, limited: false };
const DENIED: MediaPermission = { granted: false, canAskAgain: false, limited: false };

function fakeLibrary(
  options?: { readonly permission?: MediaPermission; readonly skipPermissionRequest?: boolean },
): MediaLibrarySaveAdapter & { readonly saved: string[]; readonly permissionRequests: number[] } {
  const saved: string[] = [];
  const permissionRequests: number[] = [];
  return {
    saved,
    permissionRequests,
    requestWritePermission() {
      permissionRequests.push(1);
      return Promise.resolve(options?.permission ?? GRANTED);
    },
    saveToLibrary(uri) {
      saved.push(uri);
      return Promise.resolve();
    },
    skipPermissionRequest: options?.skipPermissionRequest ?? false,
  };
}

function fakeBrowser(): BrowserSaveAdapter & {
  readonly downloads: { readonly url: string; readonly fileName: string }[];
} {
  const downloads: { readonly url: string; readonly fileName: string }[] = [];
  return {
    downloads,
    saveByDownload(input) {
      downloads.push(input);
      return Promise.resolve();
    },
  };
}

describe('mediaDownloadFileName — 확장자 4분기', () => {
  it('① 저장된 fileName의 확장자가 최우선', () => {
    expect(
      mediaDownloadFileName({
        url: 'https://x.test/o/p.jpg',
        index: 0,
        id: 'abc',
        fileName: 'original.HEIC',
        contentType: 'image/png',
      }),
    ).toBe('media-abc.heic');
  });

  it('② fileName이 없으면 contentType', () => {
    expect(
      mediaDownloadFileName({
        url: 'https://x.test/o/p.jpg',
        index: 0,
        id: 'abc',
        contentType: 'video/quicktime',
      }),
    ).toBe('media-abc.mov');
  });

  it('③ 둘 다 없으면 URL 경로 — 쿼리·해시는 떼고 본다', () => {
    expect(
      mediaDownloadFileName({ url: 'https://x.test/o/p.PNG?token=a.b.c#frag', index: 0, id: 'abc' }),
    ).toBe('media-abc.png');
  });

  it('④ 아무것도 없으면 jpg — 토큰 프록시 URL의 정상 경로다', () => {
    expect(mediaDownloadFileName({ url: 'https://x.test/download/9f8e7d', index: 0, id: 'abc' })).toBe(
      'media-abc.jpg',
    );
  });

  it('5자를 넘는 확장자는 확장자로 인정하지 않는다', () => {
    expect(
      mediaDownloadFileName({ url: 'https://x.test/o/p.abcdef', index: 0, id: 'abc' }),
    ).toBe('media-abc.jpg');
    // 정확히 5자는 통과한다 — 경계.
    expect(mediaDownloadFileName({ url: 'https://x.test/o/p.abcde', index: 0, id: 'abc' })).toBe(
      'media-abc.abcde',
    );
  });

  it('id가 없거나 빈 문자열이면 index+1 — 여러 장의 파일명이 같아지지 않게', () => {
    expect(mediaDownloadFileName({ url: 'https://x.test/a.jpg', index: 0 })).toBe('media-1.jpg');
    expect(mediaDownloadFileName({ url: 'https://x.test/a.jpg', index: 4, id: '' })).toBe(
      'media-5.jpg',
    );
  });

  it('prefix는 호스트가 정한다', () => {
    expect(
      mediaDownloadFileName({ url: 'https://x.test/a.jpg', index: 0, id: 'z', prefix: 'memorylog' }),
    ).toBe('memorylog-z.jpg');
  });
});

describe('createMediaSaver — media-library 타깃', () => {
  it('다운로드 → 저장 → 임시 파일 정리 순서로 돈다', async () => {
    const files = createMemoryFileSystem();
    const library = fakeLibrary();
    const saver = createMediaSaver({ target: { kind: 'media-library', files, library } });

    const result = await saver.saveToDevice([
      { id: 'a', url: 'https://x.test/o/a.png' },
      { id: 'b', url: 'https://x.test/o/b.jpg' },
    ]);

    expect(result).toEqual({ savedCount: 2, mode: 'media-library' });
    expect(files.calls.download.map((call) => call.to)).toEqual([
      'file:///cache/media-a.png',
      'file:///cache/media-b.jpg',
    ]);
    expect(library.saved).toEqual(['file:///cache/media-a.png', 'file:///cache/media-b.jpg']);
    // 저장이 끝난 뒤 임시 파일이 남지 않는다.
    expect(files.list()).toEqual([]);
  });

  it('2xx가 아니면 save-download-failed + 임시 파일을 즉시 지운다', async () => {
    const files = createMemoryFileSystem({ download: () => ({ status: 302 }) });
    const library = fakeLibrary();
    const saver = createMediaSaver({ target: { kind: 'media-library', files, library } });

    const error = await saver
      .saveToDevice([{ id: 'a', url: 'https://x.test/o/a.png' }])
      .catch((thrown: unknown) => thrown);

    expect(mediaErrorCode(error)).toBe('save-download-failed');
    // ⚠ 3xx는 몸통 없이 도착한다 — 0바이트 파일이 사진첩에 남으면 안 된다.
    expect(library.saved).toEqual([]);
    expect(files.calls.remove).toEqual(['file:///cache/media-a.png']);
    expect(files.list()).toEqual([]);
  });

  it('404도 같은 경로다', async () => {
    const files = createMemoryFileSystem({ download: () => ({ status: 404 }) });
    const saver = createMediaSaver({
      target: { kind: 'media-library', files, library: fakeLibrary() },
    });
    const error = await saver
      .saveToDevice([{ id: 'a', url: 'https://x.test/o/a.png' }])
      .catch((thrown: unknown) => thrown);
    expect(mediaErrorCode(error)).toBe('save-download-failed');
  });

  it('권한이 없으면 save-permission-denied — 다운로드조차 시작하지 않는다', async () => {
    const files = createMemoryFileSystem();
    const saver = createMediaSaver({
      target: {
        kind: 'media-library',
        files,
        library: fakeLibrary({ permission: DENIED }),
      },
    });

    const error = await saver
      .saveToDevice([{ id: 'a', url: 'https://x.test/o/a.png' }])
      .catch((thrown: unknown) => thrown);

    expect(mediaErrorCode(error)).toBe('save-permission-denied');
    expect(files.calls.download).toEqual([]);
  });

  it('skipPermissionRequest=true면 requestWritePermission을 부르지 않는다 (Android Expo Go)', async () => {
    const files = createMemoryFileSystem();
    const library = fakeLibrary({ permission: DENIED, skipPermissionRequest: true });
    const saver = createMediaSaver({ target: { kind: 'media-library', files, library } });

    const result = await saver.saveToDevice([{ id: 'a', url: 'https://x.test/o/a.png' }]);

    expect(library.permissionRequests).toEqual([]);
    expect(result.savedCount).toBe(1);
  });

  it('쓸 수 있는 디렉토리가 없으면 plain Error — 사용자가 조치할 수 있는 상태가 아니다', async () => {
    const files = createMemoryFileSystem({ cacheDirectory: null });
    const saver = createMediaSaver({
      target: { kind: 'media-library', files, library: fakeLibrary() },
    });
    const error = await saver
      .saveToDevice([{ id: 'a', url: 'https://x.test/o/a.png' }])
      .catch((thrown: unknown) => thrown);
    expect(mediaErrorCode(error)).toBeNull();
    expect(error).toBeInstanceOf(Error);
  });
});

describe('createMediaSaver — browser-download 타깃', () => {
  it('mode가 타깃에서 파생되고 파일명 규칙은 동일하다', async () => {
    const browser = fakeBrowser();
    const saver = createMediaSaver({ target: { kind: 'browser-download', browser } });

    const result = await saver.saveToDevice([
      { id: 'a', url: 'https://x.test/o/a.png' },
      { url: 'https://x.test/download/token' },
    ]);

    expect(result).toEqual({ savedCount: 2, mode: 'browser-download' });
    expect(browser.downloads).toEqual([
      { url: 'https://x.test/o/a.png', fileName: 'media-a.png' },
      { url: 'https://x.test/download/token', fileName: 'media-2.jpg' },
    ]);
  });
});

describe('createMediaSaver — 텔레메트리', () => {
  it('빈 배열도 스팬을 남긴다 — 호출이 있었다는 사실이 지표에서 사라지지 않게', async () => {
    const telemetry = createRecordingTelemetry();
    const saver = createMediaSaver({
      target: { kind: 'browser-download', browser: fakeBrowser() },
      telemetry,
    });

    const result = await saver.saveToDevice([]);

    expect(result).toEqual({ savedCount: 0, mode: 'browser-download' });
    expect(telemetry.spans).toEqual([
      {
        operation: 'media.save-to-device',
        extra: { imageCount: 0, mode: 'browser-download' },
        kind: 'track',
        outcome: 'succeed',
      },
    ]);
  });

  it('실패는 스팬에 fail로 남고 예외는 재throw된다', async () => {
    const telemetry = createRecordingTelemetry();
    const files = createMemoryFileSystem({
      files: { 'file:///cache/media-a.png': fakeBytes(4) },
      download: () => ({ status: 500 }),
    });
    const saver = createMediaSaver({
      target: { kind: 'media-library', files, library: fakeLibrary() },
      telemetry,
    });

    await expect(saver.saveToDevice([{ id: 'a', url: 'https://x.test/o/a.png' }])).rejects.toThrow();
    expect(telemetry.spans[0]?.operation).toBe('media.save-to-device');
    expect(telemetry.spans[0]?.outcome).toBe('fail');
  });
});
