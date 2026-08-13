// 업로드 intent는 TypeScript 타입이 아니라 **백엔드 JSON 경계**다.
//
// `MediaUploadIntentApi` 구현은 네트워크 응답을 그대로 돌려주는 경우가 많다. 타입 선언만 믿고
// transport에 넘기면 `headers: null`·빈 objectName·잘못된 method가 네이티브 브리지까지 흘러
// "undefined is not a function" 같은 진단 불가능한 실패가 된다. 이 파서는 URL 자체를 기록하거나
// 에러에 싣지 않는다 — 검증 실패의 사용자 노출은 업로드 코어가 안전한 MediaError로 바꾼다.

import type { MediaUploadIntent } from '../types';
import { isSafeMediaStorageKey } from '../storageKey';

function isRecord(value: unknown): value is Record<string, unknown> {
  // `Array.isArray` can throw for a revoked Proxy. This parser is the hostile backend JSON
  // boundary, so even its first shape check must fail closed rather than leak that host error.
  try {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  } catch {
    return false;
  }
}

function isUploadUrl(value: unknown): value is string {
  // localhost HTTP는 개발·사내 스토리지에서 정당하므로 HTTPS만 강제하지 않는다. 다만 비HTTP
  // scheme·공백 URL은 presigned PUT 슬롯으로 성립하지 않아 transport에 절대 넘기지 않는다.
  return typeof value === 'string' && /^https?:\/\/[^\s]+$/i.test(value);
}

function snapshotHeaders(value: unknown): Readonly<Record<string, string>> | null {
  if (!isRecord(value)) return null;
  let entries: [string, unknown][];
  try {
    // `Object.entries` reads each host getter exactly once. Never validate one property read and
    // then pass a second, potentially different value to transport.
    entries = Object.entries(value);
  } catch {
    return null;
  }

  // A null-prototype clone means even an otherwise-valid `__proto__` header name cannot mutate
  // the clone while it is being assembled. Freeze it before returning the intent to core.
  const headers = Object.create(null) as Record<string, string>;
  for (const [name, headerValue] of entries) {
    if (
      // RFC 9110 field-name token. Merely rejecting CR/LF still lets spaces/colons through,
      // which some native bridges can reinterpret as a second header.
      !/^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/.test(name) ||
      typeof headerValue !== 'string' ||
      // Reject every C0/DEL control byte, not only CR/LF. Header values are opaque to core but
      // must be safe to hand to platform transport implementations.
      /[\u0000-\u001f\u007f]/.test(headerValue)
    ) {
      return null;
    }
    Object.defineProperty(headers, name, {
      value: headerValue,
      enumerable: true,
      writable: false,
      configurable: false,
    });
  }
  return Object.freeze(headers);
}

/**
 * 런타임 응답을 전송 가능한 presigned PUT intent로 좁힌다.
 *
 * `null`은 불완전·위조·구버전 백엔드 응답이다. 이 모듈은 core 내부 seam이며 공개 API는
 * intentionally 없다 — 소비자가 실패한 응답을 "복구"하려고 URL을 다시 꺼내는 통로를 만들지 않는다.
 */
export function parseMediaUploadIntent(value: unknown): MediaUploadIntent | null {
  if (!isRecord(value)) return null;
  let uploadUrl: unknown;
  let method: unknown;
  let rawHeaders: unknown;
  let objectName: unknown;
  try {
    // The backend response is untrusted runtime data. Snapshot every top-level field once before
    // validation: a Proxy/getter may return a safe value first and a signed URL on a later read.
    uploadUrl = value['uploadUrl'];
    method = value['method'];
    rawHeaders = value['headers'];
    objectName = value['objectName'];
  } catch {
    return null;
  }
  const headers = snapshotHeaders(rawHeaders);
  if (
    !isUploadUrl(uploadUrl) ||
    method !== 'PUT' ||
    headers === null ||
    !isSafeMediaStorageKey(objectName)
  ) {
    return null;
  }
  return Object.freeze({
    uploadUrl,
    method: 'PUT',
    headers,
    objectName,
  });
}
