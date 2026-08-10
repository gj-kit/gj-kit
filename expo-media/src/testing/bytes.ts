// 설계 문서 §2.2 `"./testing"` — 바이트 유틸.
//
// ⚠ 이 디렉토리도 **peer 0 · DOM 0**이다. `tsconfig.core.json`은 `src/web*`만 제외하므로
//   `src/testing/**`은 `lib:["ES2022"]`로 컴파일된다 — `Blob`·`btoa`·`TextEncoder`·`fetch`가
//   전부 없다. 그래서 base64 인코더도 여기서 순수 구현한다(코어의 `hashFile.ts`가 디코더를
//   순수 구현한 것과 같은 이유다).
//
// 이 제약은 비용이 아니라 목적이다: 유닛 테스트가 네이티브 peer도 jsdom도 없이
// 전 파이프라인(pick → stat → hash → intent → PUT → complete → cleanup)을 돌 수 있는
// 이유가 정확히 이것이다(§10.1).

import type { NamedBinarySource } from '../core/adapters';

const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/**
 * 바이트 → base64.
 *
 * ⚠ **인메모리 파일시스템이 `readBase64`를 이걸로 구현한다.** 코어의 스트리밍 해시는
 * 이 문자열을 다시 디코드해 SHA-256에 먹이므로, 여기가 틀리면 §7 하드닝 9(3의 배수 창 정렬)의
 * 유닛 검증이 **틀린 기준을 통과**하게 된다 — 페이크가 부실하면 테스트도 부실해지는 지점의 실례다.
 * 그래서 패딩까지 표준 그대로 구현한다.
 */
export function bytesToBase64(bytes: Uint8Array): string {
  let out = '';
  let index = 0;
  for (; index + 2 < bytes.length; index += 3) {
    const chunk = ((bytes[index] ?? 0) << 16) | ((bytes[index + 1] ?? 0) << 8) | (bytes[index + 2] ?? 0);
    out +=
      (BASE64_ALPHABET[(chunk >> 18) & 63] ?? '') +
      (BASE64_ALPHABET[(chunk >> 12) & 63] ?? '') +
      (BASE64_ALPHABET[(chunk >> 6) & 63] ?? '') +
      (BASE64_ALPHABET[chunk & 63] ?? '');
  }
  const remaining = bytes.length - index;
  if (remaining === 1) {
    const chunk = (bytes[index] ?? 0) << 16;
    out += (BASE64_ALPHABET[(chunk >> 18) & 63] ?? '') + (BASE64_ALPHABET[(chunk >> 12) & 63] ?? '') + '==';
  } else if (remaining === 2) {
    const chunk = ((bytes[index] ?? 0) << 16) | ((bytes[index + 1] ?? 0) << 8);
    out +=
      (BASE64_ALPHABET[(chunk >> 18) & 63] ?? '') +
      (BASE64_ALPHABET[(chunk >> 12) & 63] ?? '') +
      (BASE64_ALPHABET[(chunk >> 6) & 63] ?? '') +
      '=';
  }
  return out;
}

/**
 * `Uint8Array` → 독립 `ArrayBuffer`.
 *
 * `bytes.buffer`를 그대로 쓰지 않는 이유 둘: (i) `subarray` 결과는 **버퍼를 공유**해
 * 호출자가 페이크 내부 바이트를 뒤에서 고칠 수 있고, (ii) TS 5.7+의 `ArrayBufferLike`
 * 타입 파라미터화 때문에 `Uint8Array.buffer`가 `ArrayBuffer`로 좁혀지지 않는 조합이 있다.
 * 새 버퍼에 복사하면 두 문제가 동시에 사라지고 캐스트도 필요 없다.
 */
export function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.length);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

/** 결정론적 더미 바이트 — `0,1,2,…,255` 순환. 크기만 중요한 테스트가 쓴다. */
export function fakeBytes(sizeBytes: number): Uint8Array {
  const bytes = new Uint8Array(Math.max(0, sizeBytes));
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = index & 0xff;
  }
  return bytes;
}

/**
 * `Uint8Array` → `NamedBinarySource`(§3.3).
 *
 * 웹 업로드 경로(`createBinaryUploads`·`uploadDropped`)를 **DOM `Blob` 없이** 태우는 수단이다.
 * `BinarySource`가 `{size, type?, arrayBuffer()}` 구조 최소 타입인 이유가 바로 이것이며
 * (§3.3 주석), 이 함수가 그 설계 의도를 실제로 발화시킨다.
 */
export function createBinarySource(
  bytes: Uint8Array,
  input: { readonly name: string; readonly type?: string | undefined },
): NamedBinarySource {
  // 호출자가 나중에 배열을 고쳐도 소스가 흔들리지 않도록 복사본을 잠근다.
  const owned = new Uint8Array(bytes.length);
  owned.set(bytes);
  return {
    name: input.name,
    size: owned.length,
    type: input.type,
    arrayBuffer: () => Promise.resolve(toArrayBuffer(owned)),
  };
}
