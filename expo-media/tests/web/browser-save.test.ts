// 설계 문서 §5.6 `"./web"` · §7.1 — 브라우저 다운로드 저장.
//
// ⚠ 이 파일이 지키는 것 셋:
//   ① **`download=1&filename=` 리다이렉트 트릭.** 없으면 이미지가 새 탭에서 열리기만 하고
//      저장되지 않는다(서명 URL이 `Content-Disposition: attachment`를 달고 오게 하는 장치다).
//   ② **CORS 실패 시 숨김 iframe 폴백.** `location.href = url`이면 앱 화면이 교체되거나 이미지
//      탭이 뜬다. iframe은 현재 페이지와 격리된 채 서버의 attachment 흐름만 유지하며,
//      60초 뒤 제거된다(즉시 지우면 다운로드 시작 전에 요청이 취소된다).
//   ③ SSR처럼 `document`가 없는 환경에서는 `platform-unsupported` — 전신은 bare Error라
//      code로 분기할 수 없었다.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mediaErrorCode } from '../../src/core/errors';
import { createBrowserSaveTarget, createDirectBrowserSave } from '../../src/web/browserSave';

const OBJECT_URL = 'blob:https://test.local/download';

type FetchResult = { readonly ok: boolean };

function fakeFetch(result: FetchResult | Error) {
  const calls: string[] = [];
  const fetchRef = ((url: string) => {
    calls.push(url);
    if (result instanceof Error) return Promise.reject(result);
    return Promise.resolve({
      ok: result.ok,
      blob: () => Promise.resolve(new Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' })),
    });
  }) as unknown as typeof fetch;
  return { fetchRef, calls };
}

const clicks: { href: string; download: string; rel: string; connected: boolean }[] = [];
const revoked: string[] = [];

beforeEach(() => {
  clicks.length = 0;
  revoked.length = 0;
  document.body.innerHTML = '';
  URL.createObjectURL = vi.fn(() => OBJECT_URL);
  URL.revokeObjectURL = vi.fn((url: string) => {
    revoked.push(url);
  });
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    // ⚠ 클릭 **시점**의 상태를 남긴다 — 어댑터가 직후에 anchor를 제거하므로 나중엔 볼 수 없다.
    clicks.push({
      href: this.href,
      download: this.download,
      rel: this.rel,
      connected: this.isConnected,
    });
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('createBrowserSaveTarget — anchor 경로', () => {
  it('서빙 URL 트릭을 붙여 받아온 blob을 anchor로 저장하고 흔적을 남기지 않는다', async () => {
    const { fetchRef, calls } = fakeFetch({ ok: true });
    const target = createBrowserSaveTarget({ document, fetch: fetchRef });

    await target.saveByDownload({ url: 'https://x.test/serve/1', fileName: 'media-1.jpg' });

    expect(calls).toEqual(['https://x.test/serve/1?download=1&filename=media-1.jpg']);
    expect(clicks).toEqual([
      { href: OBJECT_URL, download: 'media-1.jpg', rel: 'noopener noreferrer', connected: true },
    ]);
    // anchor는 클릭 직후 제거되고 objectURL은 회수된다.
    expect(document.body.querySelectorAll('a')).toHaveLength(0);
    expect(revoked).toEqual([OBJECT_URL]);
    expect(document.body.querySelectorAll('iframe')).toHaveLength(0);
  });

  it('이미 쿼리가 있는 URL에는 &로 이어 붙인다', async () => {
    const { fetchRef, calls } = fakeFetch({ ok: true });
    const target = createBrowserSaveTarget({ document, fetch: fetchRef });

    await target.saveByDownload({ url: 'https://x.test/serve?v=2', fileName: 'a b.jpg' });

    expect(calls).toEqual(['https://x.test/serve?v=2&download=1&filename=a%20b.jpg']);
  });
});

describe('createBrowserSaveTarget — CORS 실패 시 iframe 폴백', () => {
  it('fetch가 거부되면 숨김 iframe으로 떨어지고 60초 뒤 제거된다', async () => {
    vi.useFakeTimers();
    const { fetchRef } = fakeFetch(new Error('CORS blocked'));
    const target = createBrowserSaveTarget({ document, fetch: fetchRef });

    await target.saveByDownload({ url: 'https://x.test/serve/1', fileName: 'media-1.jpg' });

    const iframes = document.body.querySelectorAll('iframe');
    expect(iframes).toHaveLength(1);
    expect(iframes[0]?.getAttribute('src')).toBe(
      'https://x.test/serve/1?download=1&filename=media-1.jpg',
    );
    expect((iframes[0] as HTMLIFrameElement).style.display).toBe('none');
    // ⚠ 앱 화면을 교체하지 않는다 — anchor 클릭도 없었다.
    expect(clicks).toEqual([]);

    // 즉시 제거하면 다운로드가 시작되기 전에 요청이 취소된다.
    await vi.advanceTimersByTimeAsync(59_999);
    expect(document.body.querySelectorAll('iframe')).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(document.body.querySelectorAll('iframe')).toHaveLength(0);
  });

  it('2xx가 아닌 응답도 같은 폴백으로 간다', async () => {
    const { fetchRef } = fakeFetch({ ok: false });
    const target = createBrowserSaveTarget({ document, fetch: fetchRef });

    await target.saveByDownload({ url: 'https://x.test/serve/1', fileName: 'media-1.jpg' });

    expect(document.body.querySelectorAll('iframe')).toHaveLength(1);
    expect(clicks).toEqual([]);
  });
});

describe('createDirectBrowserSave — 비네이티브 저장 포크가 쓰는 변형', () => {
  it('서빙 URL 트릭을 붙이지 않는다 — 로컬 파일 URI에 쿼리를 붙이면 URI가 깨진다', async () => {
    const { fetchRef, calls } = fakeFetch({ ok: true });
    const save = createDirectBrowserSave({ document, fetch: fetchRef });

    await save.saveByDownload({ url: 'blob:https://test.local/file', fileName: 'media-1.jpg' });

    expect(calls).toEqual(['blob:https://test.local/file']);
    expect(clicks[0]?.download).toBe('media-1.jpg');
  });

  it('document가 없는 환경(SSR·프리렌더)에서는 platform-unsupported', async () => {
    vi.stubGlobal('document', undefined);
    try {
      const save = createDirectBrowserSave();
      const error = await save
        .saveByDownload({ url: 'https://x.test/a.jpg', fileName: 'media-1.jpg' })
        .catch((thrown: unknown) => thrown);
      expect(mediaErrorCode(error)).toBe('platform-unsupported');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('fetch가 없는 환경에서도 platform-unsupported', async () => {
    vi.stubGlobal('fetch', undefined);
    try {
      const save = createDirectBrowserSave({ document });
      const error = await save
        .saveByDownload({ url: 'https://x.test/a.jpg', fileName: 'media-1.jpg' })
        .catch((thrown: unknown) => thrown);
      expect(mediaErrorCode(error)).toBe('platform-unsupported');
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
