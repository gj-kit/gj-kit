// 설계 문서 §5.6 `"./web"` — fetch 기반 `BinaryTransport`.
//
// ⚠ **이 파일이 웹 바이너리 업로드의 정본이다**(§8.5 · §2.3 파생 사실).
//   `"."`의 `localTransport`(expo-file-system의 네이티브 스트리밍 업로드)를 web/SSR에서
//   태우면 안 된다: web 셰이프(`ExpoFileSystem.web.ts`)에는 그 메서드가 아예 없고
//   `FileSystemUploadTask.start()`가 `{ body:'', status:0, headers:{} }`를 반환하는 **no-op**다.
//   즉 실패가 아니라 **조용히 성공한 것처럼 보인다** — 사용자는 업로드됐다고 믿고 앱을 닫는다.
//   `hardening-guard` ⑥이 `src/web/**`와 비네이티브 포크에서 그 호출 0건을 정적으로 강제한다.
//
// 전신 대응: `uploader.ts:505-512`(웹 이미지)·`565-…`(웹 동영상)의 `fetch(intent.uploadUrl, …)`.
// 전신은 `response.ok`로 판정했으나 계약은 status를 그대로 넘기는 것이다 — 성공 판정(2xx 범위)은
// 코어의 `isSuccessStatus`가 단일 지점에서 소유한다.

import type { BinarySource, BinaryTransport, PutRequest } from '../core/adapters';

/**
 * `BinarySource` → fetch `body`.
 * 실제 Blob이면 **그대로 넘긴다** — 브라우저가 스트리밍할 수 있고 힙 복사가 생기지 않는다.
 * 그 외(테스트의 plain object 등)만 arrayBuffer로 실체화한다.
 */
async function toRequestBody(source: BinarySource): Promise<BodyInit> {
  if (typeof Blob !== 'undefined' && source instanceof Blob) return source;
  return source.arrayBuffer();
}

/**
 * fetch 기반 바이너리 PUT 전송기(§5.6).
 *
 * `fetch`는 주입 가능하지만 **호출 시점에** 해석한다. 생성 시점에 붙잡으면 SSR·폴리필 환경에서
 * 모듈 평가 순간의 값(대개 undefined)이 영구히 고정된다.
 */
export function createFetchBinaryTransport(
  input?: { readonly fetch?: typeof fetch | undefined } | undefined,
): BinaryTransport {
  return {
    async putBinary(
      request: PutRequest & { readonly body: BinarySource },
    ): Promise<{ readonly status: number }> {
      const fetchRef = input?.fetch ?? globalThis.fetch;
      const response = await fetchRef(request.url, {
        method: request.method,
        headers: { ...request.headers },
        body: await toRequestBody(request.body),
      });
      // ⚠ 여기서 throw하지 않는다. 실패 문구는 종류별로 갈리고(사진/동영상/포스터)
      //   그 분기는 `MediaStrings`를 가진 코어의 몫이다(§4 — 어댑터에 사용자 문구 리터럴 금지).
      return { status: response.status };
    },
  };
}
