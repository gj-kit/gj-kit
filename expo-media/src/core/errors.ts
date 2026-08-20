// 설계 문서 §5.2 — 타입 있는 에러. 코드 16종 + 업로드 실패 복구 정보.
//
// 전신(`packages/photo-kit/src/errors.ts`) 주석의 계약을 그대로 계승한다:
//   "Callers classify by `code` — never by matching the user-facing Korean copy,
//    which must stay free to change."
// 전신은 코드 8종이었고, uploader.ts의 한국어 bare Error 9사이트는 code로 분류할 방법이
// 아예 없었다. 추가 코드는 그 실패 경계를 분류 가능하게 만들고, `platform-unsupported`는
// §8.5의 비네이티브 포크 계약에서 온다. 그 결과 위 주석이 처음으로 코드 전체에서 참이 된다.

import { MEDIA_CONTENT_TYPES, type MediaContentType } from './mediaTypes';
import type { MediaOrphanedUpload, MediaUploadFailureInfo, MediaUploadFailureStage } from './types';
import { isSafeMediaStorageKey } from './storageKey';

/**
 * ⚠ **순서·문자열이 계약이다.** 소비자가 `Set<MediaErrorCode>`(예: memorylog2의
 * `ACTIONABLE_ERROR_CODES`)를 리터럴로 만들어 두고 분기하므로 rename = 파괴적 변경이다.
 * 유니언을 넓히는 것(추가)은 비파괴이므로 minor로 가능하다.
 */
export const MEDIA_ERROR_CODES = [
  'device-timeout', // 자산 정보 조회 데드라인 초과
  'device-icloud-only', // 원본이 iCloud에만 있음 — 내려받은 뒤 재시도
  'device-not-found', // 로컬 파일 없음/판독 불가
  'device-library-failed', // 기기 라이브러리 adapter/OS 조회 실패 (원문은 공개하지 않음)
  'picker-failed', // 피커 adapter/웹 loader 실패 (원문은 공개하지 않음)
  'image-processing-failed', // image adapter/OS transform 실패 (원문은 공개하지 않음)
  'unsupported-file-type', // 업로드 시작 전에 클라이언트가 거절
  'file-too-large', // 바이트를 하나도 보내기 전에 클라이언트가 거절
  'upload-failed', // 전송/등록 실패 (대체로 재시도 가능)
  'save-permission-denied', // 미디어 라이브러리 쓰기 권한 없음 — OS 설정에서 해결
  'save-download-failed', // 서빙 엔드포인트가 다운로드를 거절 (예: 만료된 URL)
  // ── legacy bare Error와 비네이티브 포크에서 분리한 분류 코드 ──────────────
  'permission-denied', // uploader.ts:918/937/973/998 — 호스트가 "설정으로 이동" UI를 띄울 근거
  'poster-upload-failed', // 선택적 포스터 프레임 생성/검증 실패(본체는 계속 가능)
  'no-media-selected', // uploader.ts:625
  'picked-asset-invalid', // uploader.ts:678/717
  'config-invalid', // 어댑터·네임스페이스 오구성. 부팅 시 즉사
  'platform-unsupported', // 비네이티브 포크(web·SSR·RSC)의 resolve/upload 경로(§8.5)
] as const;

export type MediaErrorCode = (typeof MEDIA_ERROR_CODES)[number];

/**
 * 사본 간 인식용 전역 태그.
 *
 * §2.4의 `splitting:false`로 **엔트리마다 코어가 복제되므로 `instanceof`는 반드시 깨진다** —
 * `"./device"`가 던진 에러를 `"."`이 검사하면 두 클래스 객체가 서로 다르다. 전신 소비자
 * `src/sync/syncStateMachine.ts:36`이 정확히 `error instanceof PhotoUploadError`였고,
 * 그 코드는 `isMediaError(error)`로 교체되어야 한다(§5.7.2-②).
 *
 * ⚠ 브랜드(`src/core/brand.ts`)에는 같은 해법을 쓸 수 없다 — 목적이 정반대이기 때문이다
 * (브랜드 = 위조 차단 → 전역 레지스트리 금지 / 에러 태그 = 사본 인식 → 전역 레지스트리 필수).
 */
const MEDIA_ERROR_TAG: unique symbol = Symbol.for('@gj-kit/expo-media#MediaError');
/**
 * 실패 복구 정보도 `MediaError`와 같은 이유로 전역 태그를 쓴다.
 *
 * ESM/CJS·서브패스마다 코어 사본이 생겨도 `mediaUploadFailureInfo()`가 같은 에러를
 * 읽을 수 있어야 한다. 값은 URL·헤더·원본 예외를 절대 담지 않는 순수 메타데이터다.
 */
const MEDIA_UPLOAD_FAILURE_TAG: unique symbol = Symbol.for(
  // Keep the package key derived from the one allowed core purity exception above. A second
  // package-name literal would look like an accidental optional-peer import to that guard.
  (Symbol.keyFor(MEDIA_ERROR_TAG) ?? 'MediaError').replace('MediaError', 'MediaUploadFailure'),
);

export class MediaError extends Error {
  readonly code: MediaErrorCode;

  constructor(code: MediaErrorCode, message: string) {
    super(message);
    this.name = 'MediaError';
    this.code = code;
    // 태그를 class 필드로 선언하지 않는 이유: 비export 심볼이 공개 .d.ts에 새어
    // "has or is using private name"이 되기 때문이다. 런타임에만 각인한다.
    // enumerable:false — 호스트가 에러를 직렬화해 로그로 보낼 때 잡음이 되지 않게.
    Object.defineProperty(this, MEDIA_ERROR_TAG, {
      value: true,
      enumerable: false,
      writable: false,
      configurable: false,
    });
  }
}

function isMediaUploadFailureStage(value: unknown): value is MediaUploadFailureStage {
  return value === 'intent' || value === 'put' || value === 'complete';
}

/**
 * A recovery record crosses an untrusted global-symbol boundary. Do not accept an arbitrary
 * MIME-shaped string here: the public type promises the same closed set as upload intents, and a
 * forged record must not manufacture a value that only *looks* like a `MediaContentType`.
 */
function isMediaContentType(value: unknown): value is MediaContentType {
  return (
    typeof value === 'string' &&
    MEDIA_CONTENT_TYPES.includes(value as MediaContentType)
  );
}

/**
 * Snapshot, validate, and clone cross-entry recovery metadata in one pass.
 *
 * This global-symbol seam reads foreign runtime values, not trusted local TypeScript objects. Do
 * not split it into `isValid(value)` followed by `value.field` reads: getters/Proxies can return a
 * safe key during validation and a presigned URL during cloning. Every observable field is read
 * exactly once into a primitive local before validation; the returned graph contains only our
 * frozen plain records.
 */
function normalizedMediaUploadFailureInfo(value: unknown): MediaUploadFailureInfo | null {
  try {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
    const source = value as Record<string, unknown>;
    const stage = source['stage'];
    const orphanedObjects = source['orphanedObjects'];
    if (!isMediaUploadFailureStage(stage) || !Array.isArray(orphanedObjects)) return null;

    const snapshot: MediaOrphanedUpload[] = [];
    // `for...of` obtains each item once; do not call `map` or spread a foreign array/object after
    // it has been checked. A proxy iterator is still contained by this outer try/catch.
    for (const candidate of orphanedObjects) {
      if (typeof candidate !== 'object' || candidate === null || Array.isArray(candidate)) return null;
      const object = candidate as Record<string, unknown>;
      const objectName = object['objectName'];
      const contentType = object['contentType'];
      const sizeBytes = object['sizeBytes'];
      const storageState = object['storageState'];
      if (
        // Keep exactly aligned with the backend intent parser, including percent/double-encoded
        // URL payloads. The global symbol must not become a credential extraction route.
        !isSafeMediaStorageKey(objectName) ||
        !isMediaContentType(contentType) ||
        typeof sizeBytes !== 'number' ||
        !Number.isFinite(sizeBytes) ||
        sizeBytes <= 0 ||
        (storageState !== 'uploaded' && storageState !== 'possibly-uploaded')
      ) {
        return null;
      }
      snapshot.push(
        Object.freeze({ objectName, contentType, sizeBytes, storageState }) as MediaOrphanedUpload,
      );
    }

    return Object.freeze({
      stage,
      orphanedObjects: Object.freeze(snapshot),
    });
  } catch {
    // A Proxy/host object must not make error inspection itself a new public failure boundary.
    return null;
  }
}

/**
 * @internal
 * 안전한 업로드 실패 메타데이터를 MediaError에 비열거형으로 각인한다.
 *
 * public API는 아래 `mediaUploadFailureInfo()`뿐이다. 이 함수를 배럴로 내보내지 않아
 * 소비자가 임의의 Error에 성공한 스토리지 오브젝트를 위조해 붙이는 통로를 만들지 않는다.
 */
export function attachMediaUploadFailureInfo(
  error: MediaError,
  info: MediaUploadFailureInfo,
): MediaError {
  // This is internal-only and all call sites construct the values from a validated intent. Still
  // normalize here so future internal callers cannot accidentally attach URL-shaped metadata.
  const safeInfo = normalizedMediaUploadFailureInfo(info);
  if (!safeInfo) return error;
  Object.defineProperty(error, MEDIA_UPLOAD_FAILURE_TAG, {
    value: safeInfo,
    enumerable: false,
    writable: false,
    configurable: false,
  });
  return error;
}

/**
 * `instanceof` 대신 이것을 쓴다(§5.2). 엔트리마다 복제된 코어 사본이 만든 에러도 인식한다.
 */
export function isMediaError(error: unknown): error is MediaError {
  try {
    return (
      typeof error === 'object' &&
      error !== null &&
      (error as Record<symbol, unknown>)[MEDIA_ERROR_TAG] === true
    );
  } catch {
    // Error boundaries frequently inspect values supplied by host adapters. A Proxy getter must
    // not turn a classification check into a new raw exception path.
    return false;
  }
}

/** 전신 `photoErrorCode`. 소비자는 이 값으로만 분기한다 — 문구 매칭 금지. */
export function mediaErrorCode(error: unknown): MediaErrorCode | null {
  try {
    return isMediaError(error) ? error.code : null;
  } catch {
    return null;
  }
}

/**
 * 전신 `photoErrorUserMessage`.
 * `MediaError`의 message는 이미 사용자 노출 가능 문구다(`MediaStrings` 주입 결과 — §4).
 * 화면은 일반 실패 문구 대신 이 값을 그대로 표시해도 된다.
 */
export function mediaErrorUserMessage(error: unknown): string | null {
  try {
    return isMediaError(error) ? error.message : null;
  } catch {
    return null;
  }
}

/**
 * 실패한 업로드가 남긴 정리 후보를 읽는다.
 *
 * `MediaError`와 마찬가지로 `instanceof`가 아니라 전역 심볼을 읽으므로, `.`에서 잡은
 * 에러가 `./core` 또는 다른 CJS/ESM 사본에서 만들어졌어도 동작한다. 값에는 presigned URL,
 * HTTP header, 원본 네트워크 에러가 절대 포함되지 않는다.
 */
export function mediaUploadFailureInfo(error: unknown): MediaUploadFailureInfo | null {
  if (typeof error !== 'object' || error === null) return null;
  try {
    const info = (error as Record<symbol, unknown>)[MEDIA_UPLOAD_FAILURE_TAG];
    return normalizedMediaUploadFailureInfo(info);
  } catch {
    return null;
  }
}

/**
 * switch의 `default`에서 호출하면, 라이브러리가 코드를 추가할 때 소비자에게 컴파일 에러가 난다.
 * ⚠ 강제하지 않는다 — 제공만 한다(§6.1-⑫). 코드 추가는 비파괴 변경이어야 하므로
 * 라이브러리가 소비자에게 exhaustive 분기를 요구할 수는 없다.
 */
export function assertNeverMediaError(code: never): never {
  // ⚠ 여기서만 `MediaError`가 아니라 plain Error를 던진다. 이 문구는 **사용자에게 보이지 않는**
  // 개발자 단언이므로 `MediaStrings`에 키가 없고, `new MediaError(...)`로 만들면 두 번째 인자가
  // `strings.` 멤버 접근이 아니어서 `string-guard`(§10.3)에 걸린다. 도달하면 그 자체가 버그다.
  throw new Error(`Unhandled MediaErrorCode: ${String(code)}`);
}
