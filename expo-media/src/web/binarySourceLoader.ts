// 설계 문서 §5.6 · §5.7.4(G18) — 웹 피커 자산 → 업로드 가능한 바이너리.
//
// **이 어댑터가 없으면 웹에서 피커 업로드 경로가 통째로 사라진다.**
// 실측(V9-d): memorylog2 `app/profile-edit.tsx:137`의 `pickAndUploadPhoto()`에는 플랫폼 게이트가
// 없다. 웹에서 그 호출은 전신 `uploader.ts:692-710`으로 들어가
//   `fetch(asset.uri)` → `Blob` → `inferContentType` → `inferFileName` → `uploadImageBlob({ fallbackExif })`
// 를 탔다. 새 구조에서 그 첫 두 단계(`fetch` → `Blob`)가 이 파일이고, 나머지는 코어의
// `createPickerFlows` → `BinaryUploads.uploadBinary`가 맡는다(§8.5 마지막 행).
//
// 웹 피커가 주는 uri는 `blob:` 또는 `data:`다 — 네트워크 요청이 아니라 인메모리 참조 해제이므로
// fetch 한 번이면 끝난다. 그래서 이 어댑터의 peer는 0이다.

import type { BinarySourceLoader, NamedBinarySource } from '../core/adapters';

/**
 * `blob:`/`data:` URI → `NamedBinarySource`(§3.3-⑤-b).
 *
 * `fetch`는 주입 가능하지만 **호출 시점에** 해석한다(생성 시점 캡처는 SSR·폴리필 환경에서
 * undefined를 영구 고정한다).
 */
export function createFetchBinarySourceLoader(
  input?: { readonly fetch?: typeof fetch | undefined } | undefined,
): BinarySourceLoader {
  return {
    async fromUri({ uri, fileName }): Promise<NamedBinarySource> {
      const fetchRef = input?.fetch ?? globalThis.fetch;
      const response = await fetchRef(uri);
      // ⚠ `response.ok` 검사를 두지 않는다 — 전신도 두지 않았다(uploader.ts:704-705).
      //   `blob:`/`data:`는 404를 만들지 않으며, 참조가 이미 해제됐다면 fetch 자체가 reject한다.
      //   여기서 상태 코드를 해석하면 없는 실패 모드에 문구가 생긴다(§4 — 어댑터에 문구 금지).
      const blob = await response.blob();
      return {
        // ⚠ `name`은 **코어가 정한 이름**을 그대로 쓴다. 코어는 `mediaFileName({ fileName,
        //   contentType })`로 확장자까지 정규화한 뒤 넘기며(pickerFlows.ts:98), 여기서 다시
        //   지으면 정규화 지점이 둘이 된다.
        name: fileName,
        size: blob.size,
        // 코어의 `inferMediaContentType(source.type, source.name)`이 1차로 읽는 값이다(binary.ts:288).
        type: blob.type,
        arrayBuffer: () => blob.arrayBuffer(),
      };
    },
  };
}
