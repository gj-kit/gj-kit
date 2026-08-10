// 설계 문서 §5.1 · §5.3 · §5.7.2-③ — "이 파일이 어떤 미디어인가"를 정하는 단일 지점.
//
// 전신(`packages/photo-kit/src/mediaTypes.ts`, 168줄) 파일 주석의 설계 의도를 계승한다:
//   "확장자↔MIME 테이블, 엄격/관대 감지, 지원 여부 술어, 폴백 파일명 결정의 단일 거처.
//    킷이 앱 의존성을 지지 않도록 자기완결적이다. 다른 형식 집합을 받는 백엔드를 쓰는
//    호스트는 서버에서 반드시 다시 검증해야 한다 — 이 테이블은 모바일 사진 파이프라인이
//    실제로 만나는 일반적인 사진/동영상 형식만 덮는다."
//
// 전신 심볼 20개의 판정(공개 13 / 내부화 5 / 통합 3→1)은 §5.7.2-③이 확정했다.
// 내부화된 5종(`IMAGE_CONTENT_TYPES`·`VIDEO_CONTENT_TYPES`·`mediaContentTypeFromPath`·
// `imageContentTypeFromPath`·`isVideoContentType`)은 **로직이 그대로 살아 있고** 공개 표면에서만
// 내려왔다. 각각의 동치 공개 대체는 아래 선언 지점에 적어 둔다.

import type { MediaKind } from './adapters';

/**
 * ⚠ **8종 고정 — 전신 `MEDIA_FILE_EXTENSIONS`(mediaTypes.ts:7-16)와 정확히 동일하다.**
 * 초안이 신설했던 `image/gif`는 **제거**했다(G15 확정, §5.1):
 *   ① 전신 확장자 테이블에 gif 항목이 없다 → §7의 "전신 168줄 그대로" 문구가 참이 된다.
 *   ② 호스트(memorylog2)의 `SUPPORTED_MEDIA_CONTENT_TYPES`에도 없고 서버 zod가 그 목록으로
 *      정규식 검증을 한다 → gif를 통과시키면 **presign 단계에서 서버가 거절**하는
 *      클라이언트/서버 불일치가 생긴다. 클라이언트가 서버보다 넓은 유니언을 갖는 것은 순손실이다.
 * 형식을 넓히려면 서버 유니언을 먼저 넓히고 minor로 추가한다(유니언 확장은 소비자에게 비파괴).
 */
export type MediaContentType =
  | 'image/jpeg'
  | 'image/png'
  | 'image/webp'
  | 'image/heic'
  | 'image/heif'
  | 'video/mp4'
  | 'video/quicktime'
  | 'video/webm';

export type ImageContentType = Extract<MediaContentType, `image/${string}`>;
export type VideoContentType = Extract<MediaContentType, `video/${string}`>;

/**
 * 확장자↔MIME 단일 테이블.
 *
 * 공개하는 이유(§5.7.2-③): 호스트가 "지원 형식" 안내 문구나 파일 입력의 `accept` 속성을 그리려면
 * 이 테이블이 필요하다. 숨기면 3자 소비자가 재구현하고, 재구현본은 라이브러리가 형식을 추가할 때
 * 조용히 어긋난다.
 *
 * ⚠ 각 값의 **첫 원소가 정규 확장자**다(`extensionForContentType`). 순서를 바꾸면 저장 파일명과
 * 스테이징 사본 이름이 함께 바뀐다.
 */
export const MEDIA_FILE_EXTENSIONS: Readonly<Record<MediaContentType, readonly string[]>> = {
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/webp': ['.webp'],
  'image/heic': ['.heic'],
  'image/heif': ['.heif'],
  'video/mp4': ['.mp4', '.m4v'],
  'video/quicktime': ['.mov', '.qt'],
  'video/webm': ['.webm'],
};

/**
 * 지원 콘텐츠 타입 전량.
 *
 * §5.7.2-③이 내부화한 `IMAGE_CONTENT_TYPES`/`VIDEO_CONTENT_TYPES`의 **동치 공개 대체**가
 * `MEDIA_CONTENT_TYPES.filter((t) => mediaKindOf(t) === 'image')`이므로, 그 판정이 참이 되려면
 * 이 배열이 공개돼 있어야 한다.
 */
export const MEDIA_CONTENT_TYPES: readonly MediaContentType[] = Object.keys(
  MEDIA_FILE_EXTENSIONS,
) as MediaContentType[];

// ── 내부 파생 테이블 (전신과 동일한 자료구조) ───────────────────────────────
const IMAGE_CONTENT_TYPES = MEDIA_CONTENT_TYPES.filter(
  (contentType): contentType is ImageContentType => contentType.startsWith('image/'),
);
const VIDEO_CONTENT_TYPES = MEDIA_CONTENT_TYPES.filter(
  (contentType): contentType is VideoContentType => contentType.startsWith('video/'),
);

const IMAGE_CONTENT_TYPE_SET = new Set<string>(IMAGE_CONTENT_TYPES);
const VIDEO_CONTENT_TYPE_SET = new Set<string>(VIDEO_CONTENT_TYPES);

const CONTENT_TYPE_BY_EXTENSION = new Map<string, MediaContentType>(
  MEDIA_CONTENT_TYPES.flatMap((contentType) =>
    MEDIA_FILE_EXTENSIONS[contentType].map((extension) => [extension, contentType] as const),
  ),
);

const IMAGE_EXTENSIONS = IMAGE_CONTENT_TYPES.flatMap(
  (contentType) => MEDIA_FILE_EXTENSIONS[contentType],
);
const VIDEO_EXTENSIONS = VIDEO_CONTENT_TYPES.flatMap(
  (contentType) => MEDIA_FILE_EXTENSIONS[contentType],
);

/**
 * 전신 `isVideoContentType`의 자리를 잇는다(그쪽은 §5.7.2-③에서 내부화 —
 * 동치 대체가 `mediaKindOf(ct) === 'video'`다).
 */
export function mediaKindOf(contentType: MediaContentType): MediaKind {
  return VIDEO_CONTENT_TYPE_SET.has(contentType) ? 'video' : 'image';
}

/** 전신 `fileExtensionForContentType`. 정규 확장자를 **점 없이** 반환한다. */
export function extensionForContentType(contentType: MediaContentType): string {
  // `noUncheckedIndexedAccess`가 `[0]`에 `| undefined`를 붙인다. 테이블의 모든 값은 원소를
  // 최소 1개 갖도록 위에서 고정돼 있으므로 폴백은 도달하지 않는다(테이블이 곧 그 증거다).
  return MEDIA_FILE_EXTENSIONS[contentType][0]?.slice(1) ?? 'jpg';
}

// ── 경로 기반 감지 (전신 mediaContentTypeFromPath / imageContentTypeFromPath — 내부화) ──
// 동치 공개 대체: `detectMediaContentType(null, path)` / `detectImageContentType(null, path)`.
// 내부화의 부수 효과로 호스트의 동명 심볼(`@memorylog/shared`의 `mediaContentTypeFromPath`)과의
// 이름 충돌 위험까지 사라진다(§5.7.2-③).
function mediaContentTypeFromPath(path: string | null | undefined): MediaContentType | null {
  // 쿼리·프래그먼트가 붙은 서명 URL에서도 확장자를 집어낸다.
  const extension = path?.toLowerCase().match(/(\.[a-z0-9]+)(?:[?#].*)?$/)?.[1];
  return (extension && CONTENT_TYPE_BY_EXTENSION.get(extension)) || null;
}

function imageContentTypeFromPath(path: string | null | undefined): ImageContentType | null {
  const contentType = mediaContentTypeFromPath(path);
  return contentType && IMAGE_CONTENT_TYPE_SET.has(contentType)
    ? (contentType as ImageContentType)
    : null;
}

/**
 * 엄격 감지 — MIME도 확장자도 지원 형식을 지목하지 못하면 `null`.
 *
 * 전신 주석의 계약 원문:
 *   "잘못 라벨링하면 데이터가 손상되는 곳(예: 백그라운드 동기화 스캐너)에는 이 엄격 감지를 쓰고,
 *    `infer*` 폴백은 **OS가 종류를 이미 보장하는 곳**(카메라·피커 출력)에만 쓴다."
 */
export function detectMediaContentType(
  mime?: string | null,
  nameOrUri?: string | null,
): MediaContentType | null {
  const normalized = mime?.toLowerCase();
  if (normalized && (IMAGE_CONTENT_TYPE_SET.has(normalized) || VIDEO_CONTENT_TYPE_SET.has(normalized))) {
    return normalized as MediaContentType;
  }
  return mediaContentTypeFromPath(nameOrUri);
}

/** 엄격 감지의 이미지 전용 판. 근거는 `detectMediaContentType`와 동일하다. */
export function detectImageContentType(
  mime?: string | null,
  nameOrUri?: string | null,
): ImageContentType | null {
  const normalized = mime?.toLowerCase();
  if (normalized && IMAGE_CONTENT_TYPE_SET.has(normalized)) {
    return normalized as ImageContentType;
  }
  return imageContentTypeFromPath(nameOrUri);
}

/** 관대 추론 — 항상 값을 준다. mime이 미디어를 지목하면 그것을, 아니면 이미지 폴백. */
export function inferMediaContentType(
  mime?: string | null,
  nameOrUri?: string | null,
): MediaContentType {
  return detectMediaContentType(mime, nameOrUri) ?? inferImageContentType(mime, nameOrUri);
}

/**
 * 전신 `inferContentType`. 폴백은 `image/jpeg`.
 *
 * ⚠ **반환값에 분기가 걸린다** — 호스트의 HEIC/HEIF 프리뷰 분기가 이 값을 읽는다
 * (`pendingPhotos.ts:56,131,143`). 폴백을 바꾸면 프리뷰 경로가 조용히 달라진다.
 */
export function inferImageContentType(
  mime?: string | null,
  nameOrUri?: string | null,
): ImageContentType {
  return detectImageContentType(mime, nameOrUri) ?? 'image/jpeg';
}

// ── 지원 여부 술어 ──────────────────────────────────────────────────────────
// ⚠ DOM `File`이 아니라 `{ name, type }` **구조 타입**을 받는다(§7 하드닝 10).
// 이것이 웹 드롭 배치 전체 검증(`assertAllSupportedMedia`)을 코어에 둘 수 있게 하는 유일한 이유다 —
// 코어가 DOM lib을 쓰는 순간 `tsconfig.core.json` 가드가 실패한다(§2.4).
type NamedFileLike = { readonly name: string; readonly type?: string | undefined };

export function isSupportedImageFile(file: NamedFileLike): boolean {
  const normalizedType = file.type?.toLowerCase();
  if (normalizedType && IMAGE_CONTENT_TYPE_SET.has(normalizedType)) return true;
  // 전신과 동일하게 `name` 부재를 방어한다 — 타입은 필수지만 JS 호출자는 그것을 지키지 않는다.
  const lowerName = file.name?.toLowerCase() ?? '';
  return IMAGE_EXTENSIONS.some((suffix) => lowerName.endsWith(suffix));
}

export function isSupportedVideoFile(file: NamedFileLike): boolean {
  const normalizedType = file.type?.toLowerCase();
  if (normalizedType && VIDEO_CONTENT_TYPE_SET.has(normalizedType)) return true;
  const lowerName = file.name?.toLowerCase() ?? '';
  return VIDEO_EXTENSIONS.some((suffix) => lowerName.endsWith(suffix));
}

export function isSupportedMediaFile(file: NamedFileLike): boolean {
  return isSupportedImageFile(file) || isSupportedVideoFile(file);
}

/**
 * 전신의 `defaultMediaFileName`·`inferFileName`·`inferWebFileName` **3종을 하나로 통합**(§5.7.2-③).
 *
 * `fileName`이 있으면 그대로 쓰고, 없으면 `${prefix}-${now}.${ext}`(전신 규칙 보존).
 * ⚠ `now`는 결정론적 테스트를 위한 주입구다 — 생략 시 `Date.now()`로 전신과 동일하게 동작한다
 * (§5.4.1-15). 전신은 `Date.now()`를 직접 호출해 파일명 규칙에 테스트가 없었다.
 * ⚠ `prefix` 기본값은 `'media'`다 — 전신 `'photo'`에서 바꿨다(§5.4.1-13). 호스트는 항상 자기
 * 프리픽스를 주입하므로 이관 영향이 0이며, 라이브러리 이름과의 일관성을 택했다.
 */
export function mediaFileName(input: {
  readonly fileName?: string | null | undefined;
  readonly contentType: MediaContentType;
  readonly prefix?: string | undefined;
  readonly now?: number | undefined;
}): string {
  const { fileName, contentType, prefix = 'media', now } = input;
  // 전신의 `asset.fileName || …` 그대로 — 빈 문자열도 폴백 대상이다(파일명 없는 웹 드롭).
  if (fileName) return fileName;
  return `${prefix}-${now ?? Date.now()}.${extensionForContentType(contentType)}`;
}
