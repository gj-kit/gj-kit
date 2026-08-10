// 설계 문서 §8.5 — `"./save"`의 **비네이티브 포크**(exports의 `browser` + `node` 조건).
//
// ⚠ **`expo-media-library` import 0.** `"./device"`의 포크와 같은 이유다 — 웹·SSR 번들에서
//   그 문자열이 사라져야 `dist-peer-graph`·`web-export-guard`가 통과한다(§10.3).
//
// 전신 `saveImages.ts`는 `if (platformOS === 'web')` 한 줄로 브라우저 다운로드와 MediaLibrary
// 저장을 갈랐다. 그 분기가 여기서 **구조적으로 소멸**한다(§8.5): 어느 구현이 실릴지는 런타임
// 조건문이 아니라 exports 맵이 결정하고, 네이티브 번들에는 `document`를 만지는 코드가 애초에
// 실리지 않는다.
//
// ⚠ **공개 표면은 네이티브 포크와 동일해야 한다**(§2.4 파생 규칙). 양 포크가 같은 `.d.ts`
//   (`dist/save.d.ts`)를 가리키므로 `Document`·`typeof fetch`를 시그니처에 노출할 수 없다 —
//   DOM 타입이 공개 시그니처에 나타나도 되는 엔트리는 `"./web"` 하나뿐이다.
//   그래서 DOM은 **내부에서만** 쓰고, 주입은 `globalThis` 폴백으로 받는다.
//   (이 파일과 `src/save.web.ts`는 그 대가로 `tsconfig.core.json`의 무DOM 소스 가드에서 제외돼 있다.)

import type { MediaLibrarySaveAdapter, MediaPermission } from '../core/adapters';
import { createDirectBrowserSave } from '../web/browserSave';

/** URI 마지막 경로 조각을 파일명으로 쓸 수 없을 때의 폴백. `DEFAULT_FILE_NAME_PREFIX`와 같은 값이다(§5.4.1-13). */
const FALLBACK_FILE_NAME = 'media';

/**
 * 저장 대상 파일명 추출.
 *
 * 코어의 `createMediaSaver`가 `library.saveToLibrary(download.uri)`에 넘기는 값은
 * `${cacheDirectory}${mediaDownloadFileName(...)}`이다(saver.ts:103·111). 즉 **마지막 경로
 * 조각이 곧 코어가 정한 파일명**이며, 여기서 이름을 새로 짓는 대신 그것을 되읽는다 —
 * 파일명 규칙의 거처는 `src/core/save/fileName.ts` 하나여야 한다(§5.7.3, G8).
 */
function fileNameFromUri(uri: string): string {
  const path = uri.split('?')[0]?.split('#')[0] ?? '';
  const last = path.split('/').pop() ?? '';
  if (!last) return FALLBACK_FILE_NAME;
  try {
    return decodeURIComponent(last) || FALLBACK_FILE_NAME;
  } catch {
    // 잘못된 퍼센트 인코딩이 저장 자체를 실패시키지 않게 한다.
    return last;
  }
}

/**
 * 비네이티브 기기 저장 어댑터(§8.5).
 *
 * 브라우저에서 "기기에 저장"의 등가물은 **브라우저 다운로드**이므로 그것으로 위임한다 —
 * 전신 웹 분기(anchor + CORS 실패 시 숨김 iframe 폴백)와 같은 구현체를 재사용한다.
 * **SSR에는 `document`가 없다**. 그 경로에서 저장을 호출하면
 * `MediaError('platform-unsupported')`가 나온다(`createDirectBrowserSave` 내부 판정).
 *
 * @param input 네이티브 포크와 시그니처를 맞추기 위한 자리다. `isExpoGo`(Android Expo Go
 *   권한 우회)는 네이티브 전용 개념이라 여기서는 의미가 없다.
 *   ⚠ 이름을 `_input`으로 두면 그 이름이 `dist/save.web.d.ts`에 그대로 방출돼 양 포크의
 *   공개 표면이 문자 단위로 갈린다(§8.4-3 "양 포크는 같은 .d.ts를 가리킨다"의 취지).
 */
export function expoDeviceSave(
  input?: { readonly isExpoGo?: boolean | undefined } | undefined,
): MediaLibrarySaveAdapter {
  void input;
  // 서빙 URL 트릭(`download=1&filename=`)을 쓰지 않는 변형이다 — 여기 들어오는 값은
  // 서빙 엔드포인트가 아니라 코어가 이미 내려받아 둔 로컬 파일 URI이므로, 쿼리를 덧붙이면
  // URI 자체가 깨진다.
  const browser = createDirectBrowserSave();

  return {
    async requestWritePermission(): Promise<MediaPermission> {
      // 브라우저 다운로드에는 OS 권한 모델이 없다. `granted`는 "지금 저장할 수 있는가"를
      // 그대로 보고한다 — 브라우저면 true, SSR·프리렌더면 false다.
      // (UI가 저장 버튼을 그릴지 판단할 근거이므로 throw는 과잉이다 — §8.5 권한 행과 같은 원칙.)
      const available = Boolean(globalThis.document?.body);
      return { granted: available, canAskAgain: false, limited: false };
    },

    async saveToLibrary(uri: string): Promise<void> {
      await browser.saveByDownload({ url: uri, fileName: fileNameFromUri(uri) });
    },

    /**
     * 권한 요청 단계를 건너뛴다. 브라우저에는 요청할 권한이 없고, 여기서 `false`를 두면
     * 코어가 `save-permission-denied`를 던져 **실제 원인(플랫폼 미지원)을 가린다** —
     * 건너뛰면 `saveToLibrary`가 정확한 `platform-unsupported`를 표면화한다(§6.1-⑭).
     */
    skipPermissionRequest: true,
  };
}
