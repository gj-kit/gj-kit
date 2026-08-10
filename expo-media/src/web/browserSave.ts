// 설계 문서 §5.6 `"./web"` — 브라우저 다운로드 저장 어댑터(`BrowserSaveAdapter` 구현).
//
// 전신 `packages/photo-kit/src/saveImages.ts`의 웹 분기(142-199)를 통째로 계승한다.
// 전신에서는 이 코드가 `saveImagesToDevice` 안의 `if (platformOS === 'web')` 가지였고,
// 그래서 네이티브 번들에도 `document`를 만지는 코드가 실려 있었다. 새 구조에서는 그 분기가
// **구조적으로 소멸**한다 — `SaveTarget` 판별 유니언(§6.1-⑦)과 exports 조건 포크(§8)가
// 같은 선택을 타입과 번들 그래프로 해준다.
//
// ⚠ DOM 접근을 이 어댑터 안에 가둔다(§3.3 `BrowserSaveAdapter` TSDoc). 코어는 `saveByDownload`
//   시그니처만 알고 `document`·`fetch`의 존재를 모른다.

import type { BrowserSaveAdapter } from '../core/adapters';
import { MediaError } from '../core/errors';
import { enMediaStrings } from '../core/strings';

/** 문구 주입구가 없는 어댑터다(§5.6 시그니처). 기본 문구를 그대로 쓴다 — 코어 규약상 리터럴 금지. */
const strings = enMediaStrings;

/**
 * CORS 폴백 iframe의 수명. 전신 `saveImages.ts:197` `setTimeout(() => iframe.remove(), 60_000)`.
 * 즉시 지우면 다운로드가 시작되기 전에 요청이 취소되고, 안 지우면 DOM에 영구 누적된다.
 */
const IFRAME_LIFETIME_MS = 60_000;

type BrowserSaveDeps = {
  readonly document?: Document | undefined;
  readonly fetch?: typeof fetch | undefined;
};

/**
 * 전신 `saveImages.ts:142-151` `imageBrowserDownloadUrl`.
 *
 * "다운로드 가능한 서빙 엔드포인트는 서명된 스토리지로 302 리다이렉트할 수 있다. 다운로드를
 *  요청하면 그 서명 URL이 `Content-Disposition: attachment`를 달고 오므로, **교차 출처여도**
 *  브라우저가 파일을 열지 않고 저장한다."
 * — 이 트릭이 없으면 이미지가 새 탭에서 열리기만 하고 저장되지 않는다.
 *
 * ⚠ 공개 표면에서는 내린다(§5.7.7 내부화). 앱 소스 사용처 0건이었다.
 */
function servingDownloadUrl(url: string, fileName: string): string {
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}download=1&filename=${encodeURIComponent(fileName)}`;
}

/** 전신 `saveImages.ts:153-166`. anchor는 클릭 직후 제거한다 — 앱 DOM에 흔적을 남기지 않는다. */
function triggerAnchorDownload(documentRef: Document, url: string, fileName: string): void {
  const anchor = documentRef.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.rel = 'noopener noreferrer';
  anchor.style.display = 'none';
  documentRef.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

async function runBrowserDownload(input: {
  readonly deps: BrowserSaveDeps;
  readonly url: string;
  readonly fileName: string;
  /** 서빙 URL 트릭(`download=1&filename=`)을 붙일지. 로컬 파일 URI에는 붙이면 안 된다. */
  readonly useServingTrick: boolean;
}): Promise<void> {
  // ⚠ `document`·`fetch`는 **호출 시점에** 해석한다. 생성 시점에 붙잡으면 SSR에서 모듈이
  //   평가되는 순간의 undefined가 하이드레이션 이후까지 남는다.
  const documentRef = input.deps.document ?? globalThis.document;
  const fetchRef = input.deps.fetch ?? globalThis.fetch;
  if (!documentRef?.body || typeof fetchRef !== 'function') {
    // SSR·프리렌더 번들에도 이 파일이 실린다(`.web.` = "비네이티브", "브라우저 전용"이 아니다 — §8.4-7).
    // 전신은 bare `Error("Browser download is unavailable.")`라 code로 분기할 수 없었다(§5.2).
    throw new MediaError('platform-unsupported', strings.platformUnsupported);
  }

  const downloadUrl = input.useServingTrick
    ? servingDownloadUrl(input.url, input.fileName)
    : input.url;

  try {
    const response = await fetchRef(downloadUrl);
    // 응답이 200대일 때만 objectURL 경로를 탄다. 아니면 아래 폴백으로 떨어진다
    // (전신은 여기서 내부 Error를 던져 같은 catch로 합류시켰다 — 문구 리터럴을 남기지 않기 위해
    //  분기로 바꿨을 뿐 동작은 동일하다).
    if (response.ok) {
      const objectUrl = URL.createObjectURL(await response.blob());
      try {
        triggerAnchorDownload(documentRef, objectUrl, input.fileName);
      } finally {
        // objectURL은 탭 수명 내내 남으므로 클릭 직후 회수한다(전신 185-187).
        URL.revokeObjectURL(objectUrl);
      }
      return;
    }
  } catch {
    // fetch 실패(CORS·네트워크)와 anchor 조작 실패가 모두 여기로 온다 — 전신과 같은 범위다.
  }

  // 전신 `saveImages.ts:189-198` 주석 그대로:
  // "브라우저가 CORS 때문에 리다이렉트된 객체를 fetch하지 못하면, 서버의 attachment
  //  disposition 흐름은 유지하되 현재 페이지와 격리해 **앱 화면을 교체하거나 이미지 탭을
  //  띄우지 못하게** 한다."
  // → `location.href = url`이 아니라 숨김 iframe이어야 하는 이유가 이것이다.
  const iframe = documentRef.createElement('iframe');
  iframe.src = downloadUrl;
  iframe.style.display = 'none';
  documentRef.body.appendChild(iframe);
  setTimeout(() => iframe.remove(), IFRAME_LIFETIME_MS);
}

/**
 * 서빙 URL을 브라우저 다운로드로 저장하는 `BrowserSaveAdapter`(§5.6).
 * `createMediaSaver({ target: { kind: 'browser-download', browser } })`에 꽂는다.
 *
 * ⚠ `document`/`fetch`는 **필수 주입**이다(§5.6 시그니처 · §6.1-⑬ "런타임 + 생성 차단").
 *   옵셔널로 두고 `globalThis`로 폴백하면 네이티브·SSR에서도 **생성이 조용히 성공**해
 *   "웹 전용 API를 네이티브에서" 조합이 타입에서 걸리지 않는다 — ⑬이 막으려던 바로 그 결말이다.
 *   `dist/web.d.ts`의 DOM 각인(§2.4)이 무DOM 소비자에게서 이 두 필드를 지켜주는 것도
 *   **필드가 시그니처에 존재할 때만** 의미가 있다.
 *   호출 시점 판정(§8.5의 `platform-unsupported`)은 내부 `createDirectBrowserSave`가 계속 맡는다 —
 *   비네이티브 포크(`src/save/web.ts`)는 SSR에 `document`가 없어도 조립될 수 있어야 하기 때문이다.
 */
export function createBrowserSaveTarget(input: {
  readonly document: Document;
  readonly fetch: typeof fetch;
}): BrowserSaveAdapter {
  const deps: BrowserSaveDeps = input;
  return {
    async saveByDownload({ url, fileName }): Promise<void> {
      await runBrowserDownload({ deps, url, fileName, useServingTrick: true });
    },
  };
}

/**
 * @internal 비네이티브 저장 포크(`src/save/web.ts`) 전용 — 공개 표면이 아니다.
 *
 * `MediaLibrarySaveAdapter.saveToLibrary(uri)`가 받는 값은 **코어가 이미 내려받아 둔 로컬 파일
 * URI**(`${cacheDirectory}${fileName}`)이지 서빙 엔드포인트가 아니다. 거기에
 * `download=1&filename=`을 덧붙이면 URI 자체가 깨지므로 트릭을 끈 변형이 필요하다.
 */
export function createDirectBrowserSave(input?: BrowserSaveDeps | undefined): BrowserSaveAdapter {
  const deps: BrowserSaveDeps = input ?? {};
  return {
    async saveByDownload({ url, fileName }): Promise<void> {
      await runBrowserDownload({ deps, url, fileName, useServingTrick: false });
    },
  };
}
