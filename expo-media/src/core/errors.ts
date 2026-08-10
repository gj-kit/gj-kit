// 설계 문서 §5.2 — 타입 있는 에러. 코드 14종.
//
// 전신(`packages/photo-kit/src/errors.ts`) 주석의 계약을 그대로 계승한다:
//   "Callers classify by `code` — never by matching the user-facing Korean copy,
//    which must stay free to change."
// 전신은 코드 8종이었고, uploader.ts의 한국어 bare Error 9사이트는 code로 분류할 방법이
// 아예 없었다. 신설 6종 중 5종이 그 9사이트에 1:1 대응하고, `platform-unsupported`만
// §8.5의 비네이티브 포크 계약에서 온다. 그 결과 위 주석이 처음으로 코드 전체에서 참이 된다.

/**
 * ⚠ **순서·문자열이 계약이다.** 소비자가 `Set<MediaErrorCode>`(예: memorylog2의
 * `ACTIONABLE_ERROR_CODES`)를 리터럴로 만들어 두고 분기하므로 rename = 파괴적 변경이다.
 * 유니언을 넓히는 것(추가)은 비파괴이므로 minor로 가능하다.
 */
export const MEDIA_ERROR_CODES = [
  'device-timeout', // 자산 정보 조회 데드라인 초과
  'device-icloud-only', // 원본이 iCloud에만 있음 — 내려받은 뒤 재시도
  'device-not-found', // 로컬 파일 없음/판독 불가
  'unsupported-file-type', // 업로드 시작 전에 클라이언트가 거절
  'file-too-large', // 바이트를 하나도 보내기 전에 클라이언트가 거절
  'upload-failed', // 전송/등록 실패 (대체로 재시도 가능)
  'save-permission-denied', // 미디어 라이브러리 쓰기 권한 없음 — OS 설정에서 해결
  'save-download-failed', // 서빙 엔드포인트가 다운로드를 거절 (예: 만료된 URL)
  // ── 신설 6종 = bare Error 대응 5 + 비네이티브 포크 1 ──
  //    (앞 5개는 V6 실측의 uploader.ts 한국어 bare Error 9사이트에 1:1 대응.
  //     'platform-unsupported'만 bare Error와 무관한 §8.5 포크 계약이다.)
  'permission-denied', // uploader.ts:918/937/973/998 — 호스트가 "설정으로 이동" UI를 띄울 근거
  'poster-upload-failed', // uploader.ts:237/295
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

/**
 * `instanceof` 대신 이것을 쓴다(§5.2). 엔트리마다 복제된 코어 사본이 만든 에러도 인식한다.
 */
export function isMediaError(error: unknown): error is MediaError {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as Record<symbol, unknown>)[MEDIA_ERROR_TAG] === true
  );
}

/** 전신 `photoErrorCode`. 소비자는 이 값으로만 분기한다 — 문구 매칭 금지. */
export function mediaErrorCode(error: unknown): MediaErrorCode | null {
  return isMediaError(error) ? error.code : null;
}

/**
 * 전신 `photoErrorUserMessage`.
 * `MediaError`의 message는 이미 사용자 노출 가능 문구다(`MediaStrings` 주입 결과 — §4).
 * 화면은 일반 실패 문구 대신 이 값을 그대로 표시해도 된다.
 */
export function mediaErrorUserMessage(error: unknown): string | null {
  return isMediaError(error) ? error.message : null;
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
