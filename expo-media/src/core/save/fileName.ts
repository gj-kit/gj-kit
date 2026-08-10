// 설계 문서 §5.7.3(저장 파일명 규칙 확정, G8) · §5.4-⑥.
//
// 전신 `saveImages.ts:51-72` `imageDownloadFileName`의 규칙을 그대로 재현한다.
// 전신은 호스트 DTO(`SaveableImage`)를 통째로 받았고, 그래서 `originalUrl`·`thumbnailUrl`이라는
// memorylog2 스키마가 라이브러리 시그니처에 새어 있었다. 여기서는 URL 하나만 받는다 —
// "어느 URL을 고를 것인가"는 호스트 DTO 지식이므로 앱이 소유한다(§5.7.3 확정 3).

import type { MediaContentType } from '../mediaTypes';
import { extensionForContentType } from '../mediaTypes';

/** §5.4.1-13 — 전신은 `'photo'`였다. 라이브러리명과의 일관성을 택해 `'media'`로 확정. */
const DEFAULT_FILE_NAME_PREFIX = 'media';

/**
 * 확장자가 5자를 넘으면 확장자로 인정하지 않는다.
 *
 * ⚠ 이 상한이 지키는 것: 다운로드 URL은 흔히 토큰화된 프록시라 경로에 확장자가 없고,
 * 대신 쿼리·해시 조각이 `.xxxxxxxxxx` 처럼 확장자처럼 보인다. 상한이 없으면 그 조각이
 * 파일명 끝에 붙어 기기에서 열리지 않는 파일이 저장된다.
 */
const MAX_EXTENSION_LENGTH = 5;

const TRAILING_EXTENSION = /\.([a-z0-9]+)$/i;

/**
 * 저장 파일명 = `` `${prefix}-${id || index + 1}.${ext}` `` (전신 saveImages.ts:71).
 *
 * 확장자 우선순위 — **저장된 fileName → contentType → URL 경로 → `'jpg'`**.
 * 전신 주석(saveImages.ts:56-58) 그대로의 근거: "저장된 원본 이름을 우선한다 — 다운로드 URL은
 * 흔히 경로에 확장자가 없는 토큰화된 프록시라, URL을 스니핑하면 모든 PNG/HEIC/동영상
 * 다운로드가 `<prefix>-<id>.jpg`가 되어버린다."
 *
 * ⚠ `index`는 **0-base 필수 인자**다(G8). `id`가 없거나 빈 문자열일 때 `index + 1`이
 * 유일한 구분자이며, 이것이 없으면 여러 장을 저장할 때 파일명이 전부 같아진다 —
 * 브라우저는 `(1)` 접미사로 얼버무리고, MediaLibrary 경로는 캐시 파일을 덮어쓴다.
 */
export function mediaDownloadFileName(input: {
  readonly url: string;
  readonly index: number;
  readonly id?: string | undefined;
  readonly fileName?: string | undefined;
  readonly contentType?: MediaContentType | undefined;
  readonly prefix?: string | undefined; // 기본 'media'
}): string {
  const prefix = input.prefix ?? DEFAULT_FILE_NAME_PREFIX;

  const storedExtension = input.fileName?.match(TRAILING_EXTENSION)?.[1]?.toLowerCase();
  // 전신은 `contentType in MEDIA_FILE_EXTENSIONS`로 걸렀다. 새 시그니처에서는 그 좁히기가
  // 타입으로 올라갔고(`MediaContentType`), 호스트는 `detectMediaContentType`으로 좁힌다 —
  // 두 검사는 동치다(§5.7.3).
  const contentTypeExtension = input.contentType
    ? extensionForContentType(input.contentType)
    : undefined;
  // 쿼리·해시를 떼고 경로만 본다 — `?token=...` 안의 점이 확장자로 오인되지 않게.
  const path = input.url.split('?')[0]?.split('#')[0] ?? '';
  const urlExtension = path.match(TRAILING_EXTENSION)?.[1]?.toLowerCase();

  const extension = storedExtension ?? contentTypeExtension ?? urlExtension;
  const safeExtension =
    extension && extension.length <= MAX_EXTENSION_LENGTH ? extension : 'jpg';

  return `${prefix}-${input.id || input.index + 1}.${safeExtension}`;
}
