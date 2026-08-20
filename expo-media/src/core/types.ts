// 설계 문서 §5.1 — 백엔드 계약 · 결과 타입 · 메타데이터.
//
// 전신(`packages/photo-kit/src/types.ts`) 파일 주석의 설계 의도를 계승한다:
//   "The kit is server-agnostic: everything it needs from a backend arrives through
//    MediaUploadApi, and everything it reports leaves through MediaTelemetry.
//    No other seams exist on purpose — keeping the integration surface this small
//    is what makes the kit portable between projects."

import type { MediaContentType } from './mediaTypes';

// ── 메타데이터 ──────────────────────────────────────────────────────────────
/** 전신 `PhotoGeoPoint`. */
export type GeoPoint = { readonly latitude: number; readonly longitude: number };

/**
 * EXIF에서 유도한 촬영 메타데이터. `capturedAt`은 ISO 타임스탬프이며, EXIF 벽시계는
 * **기기 로컬 타임존**으로 해석한다(§7 하드닝 11 — 근거는 `metadata.ts`에 원문 그대로 있다).
 *
 * ⚠ **필드명은 전신 그대로다.** 초안의 `geoPoint → location` 리네임은 **철회**했다(G5 확정).
 * 이 객체는 `api.completeUpload({ photo })`로 **호스트 백엔드에 그대로 전달**된다
 * (전신 uploader.ts:442). 리네임의 파손은 타입에 잡히지 않는다:
 *   · 호스트 대입 지점 `kit.ts:40-44`가 `completeUpload({...input})`을 zod 파생 타입에 넘긴다.
 *   · 타깃은 `packages/shared/src/index.ts:105-108` `photoMetadataSchema = { capturedAt?, geoPoint? }`.
 *   · `{capturedAt?, location?}` → `{capturedAt?, geoPoint?}` 대입은 공통 프로퍼티 `capturedAt`이
 *     있어 **weak type 검사를 통과**하고, 변수 전달이라 초과 프로퍼티 검사도 걸리지 않는다.
 *   · 런타임에서는 서버 zod가 non-strict라 미지의 `location` 키를 **조용히 스트립**한다.
 * 즉 컴파일도 테스트도 통과하고 위치정보만 사라지는 §6.1의 전형적 "조용히 깨지는" 클래스이며,
 * 얻는 것은 명명 취향뿐이었다.
 *
 * ⚠ 초안의 `width`/`height`는 **삭제**했다. 전신 EXIF 파서는 `PixelXDimension`/`PixelYDimension`을
 * 읽지 않으므로(photoMetadata.ts 전문에 `Pixel`·`width`·`height` 0건 — grep 실측) 영구 `undefined`인
 * 죽은 필드였고, `MediaUploadCompletion`에 이미 최상위 `width`/`height`(피커 자산 치수,
 * uploader.ts:749-756)가 있어 의미도 중복이다.
 */
export type MediaMetadata = {
  readonly capturedAt?: string | undefined;
  readonly geoPoint?: GeoPoint | undefined;
};

// ── 백엔드 계약 ─────────────────────────────────────────────────────────────
/** 백엔드가 발급한 단일 오브젝트 presigned 업로드 슬롯. */
export type MediaUploadIntent = {
  readonly uploadUrl: string;
  readonly method: 'PUT';
  readonly headers: Readonly<Record<string, string>>;
  readonly objectName: string;
};

export type MediaUploadIntentRequest<TCollectionId extends string = string> = {
  readonly fileName: string;
  /** ⚠ 전신은 `string`이었다. 닫힌 8종 유니언으로 좁혀 서버 zod와 클라이언트가 어긋나지 않게 한다. */
  readonly contentType: MediaContentType;
  readonly sizeBytes: number;
  /**
   * 업로드를 시작하기 전에 백엔드가 권한·용량을 확인해야 하는 경우의 불투명 그룹 id.
   * 완료 단계의 `collectionId`와 같은 값이며, 킷은 해석하거나 생성하지 않고 그대로 전달한다.
   * 선택적 필드라 기존 presign-only 소비자는 변경 없이 동작한다.
   */
  readonly collectionId?: TCollectionId | undefined;
};

/**
 * 스토리지에 쓸 수 있는 이름으로 발급된 오브젝트의 안전한 식별 정보.
 *
 * URL·헤더·서명은 의도적으로 없다. 앱은 이 값만 자기 cleanup API에 넘겨, 실패한
 * 업로드가 남긴 object를 best-effort로 정리할 수 있다. `objectName`의 권한 검증은
 * 언제나 서버가 다시 해야 하며, 이 타입은 클라이언트 권한 증명이 아니다. 런타임에서는
 * 1024자 이하 ASCII unreserved 경로 세그먼트(`[A-Za-z0-9._~-]`)와 `/`만 허용한다.
 * URL/query/percent-encoding/공백을 받지 않으므로, 서버는 그 문법을 발급 키에도 맞춰야 한다.
 */
export type MediaUploadObject = {
  readonly objectName: string;
  readonly contentType: MediaContentType;
  readonly sizeBytes: number;
};

/**
 * 실패 시 정리 후보인 스토리지 오브젝트.
 *
 * `uploaded`는 2xx 응답까지 확인한 PUT, `possibly-uploaded`는 응답 유실·전송 예외처럼
 * 서버에는 도달했을 수도 있는 PUT이다. 후자도 cleanup endpoint가 멱등으로 처리해야 한다.
 */
export type MediaOrphanedUpload = MediaUploadObject & {
  readonly storageState: 'uploaded' | 'possibly-uploaded';
};

/** 업로드 파이프라인에서 안전하게 공개할 수 있는 실패 단계. URL·헤더·원본 예외는 포함하지 않는다. */
export type MediaUploadFailureStage = 'intent' | 'put' | 'complete';

/**
 * `mediaUploadFailureInfo(error)`가 돌려주는, cross-entry-safe 실패 복구 정보.
 *
 * 이 정보는 에러에 전역 심볼로 비열거형 각인되므로 code splitting으로 코어 사본이 갈린
 * 엔트리에서도 검사할 수 있다. `orphanedObjects`는 attachment/등록이 끝나기 전에 남은
 * 정리 후보이며, 앱은 자신의 권한 있는 cleanup API로만 처리해야 한다.
 */
export type MediaUploadFailureInfo = {
  readonly stage: MediaUploadFailureStage;
  readonly orphanedObjects: readonly MediaOrphanedUpload[];
};

/**
 * 구 `posterObjectName` / `posterSizeBytes` 2필드를 쌍 객체로 통합(§6.1-②).
 * 한쪽만 채워 보내면 서버가 반쪽 메타로 등록해 **썸네일이 영구 누락**된다 — 그 상태를
 * 표현 불가능하게 만든다.
 */
export type UploadedPoster = { readonly objectName: string; readonly sizeBytes: number };

/** 바이트가 스토리지에 올라간 뒤 보내는 등록 페이로드. */
export type MediaUploadCompletion<TCollectionId extends string = string> = {
  readonly fileName: string;
  readonly contentType: MediaContentType;
  readonly sizeBytes: number;
  readonly objectName: string;
  readonly contentHash?: string | undefined;
  /**
   * 불투명 그룹 id — 킷은 해석하지 않고 전달만 한다(§6.2 기각: `CollectionId` 브랜드).
   * memorylog2는 이것을 `albumId`로 매핑한다. 빈 문자열은 런타임 차단(§6.1-⑪) —
   * falsy 스프레드로 조용히 탈락해 앨범 없이 저장되는 경로를 막는다.
   */
  readonly collectionId?: TCollectionId | undefined;
  readonly photo?: MediaMetadata | undefined;
  readonly durationMs?: number | undefined;
  readonly width?: number | undefined;
  readonly height?: number | undefined;
  readonly poster?: UploadedPoster | undefined;
};

/**
 * 전신 `CompletedPhotoUpload<TAsset>`.
 * ⚠ `duplicate`는 **필수**다(§6.1-⑯). 옵셔널이면 호스트가 중복 판정을 반환하지 않을 때
 * 킷이 "새로 만들어졌다"로 오독하고, 중복 취소 경로가 **사용자의 예전 사진을 지운다**.
 */
export type UploadResult<TAsset> = {
  readonly asset: TAsset;
  readonly duplicate: boolean;
};

/**
 * Presign-only backend seam.
 *
 * Some products deliberately attach the uploaded object in a later domain
 * transaction (for example, after creating a record). They must not pretend
 * that a registration endpoint exists just to use the local streaming path.
 * `MediaUploadApi` extends this narrower contract for the usual
 * presign → PUT → complete flow.
 */
export interface MediaUploadIntentApi<TCollectionId extends string = string> {
  createUploadIntent(input: MediaUploadIntentRequest<TCollectionId>): Promise<MediaUploadIntent>;
}

/**
 * 백엔드 계약: presigned 슬롯을 발급받고, 올라간 오브젝트를 등록한다.
 * `TAsset`은 호스트 API가 저장된 자산으로 반환하는 무엇이든 된다.
 */
export interface MediaUploadApi<TAsset, TCollectionId extends string = string>
  extends MediaUploadIntentApi<TCollectionId> {
  completeUpload(input: MediaUploadCompletion<TCollectionId>): Promise<UploadResult<TAsset>>;
}

// ── 정책 값 ─────────────────────────────────────────────────────────────────
/**
 * 백엔드 정책을 반영한 클라이언트 크기 캡. 같은 문구로 **빨리** 실패시켜 사용자가 전체 업로드를
 * 마친 뒤 413을 받는 일을 없앤다.
 */
export type MediaUploadLimit = { readonly maxBytes: number; readonly message?: string | undefined };

/**
 * ⚠ 팩토리에서 이 값은 **생략 불가**다(§6.1-③). 무제한 업로드는 명시적 결정이어야 한다.
 * 서버만 검증하는 정책도 정당하므로 팩토리 설정은 `MediaUploadLimits | 'server-enforced'`를 받는다
 * (`Number.POSITIVE_INFINITY`는 JSON 직렬화 불가라 기각 — §0.4 기각 8).
 */
export type MediaUploadLimits = {
  readonly image?: MediaUploadLimit | undefined;
  readonly video?: MediaUploadLimit | undefined;
};

/**
 * 디버그 로거 설정. 전신 `PhotoUploaderConfig`의 `debugTag`/`debugContext`에 1:1 대응한다.
 * ⚠ core에는 `__DEV__`가 없으므로 기본값은 **비활성**이다. 실제 게이트는
 * `createMediaDebugLogger`가 `platform.isDev && platform.os !== 'web'`로 건다(§7 하드닝 8).
 */
export type MediaDebugOptions = {
  readonly enabled: boolean;
  readonly tag?: string | undefined;
  readonly context?: (() => Record<string, unknown>) | undefined;
};

/**
 * 편의 재export. 설계 문서 §3.3은 이 두 타입을 `adapters.ts`에 두지만, 백엔드 계약 쪽에서
 * 바이너리 업로드를 다루는 소비자가 `"./core"` 배럴 밖에서 파일 단위로 import할 때
 * 어느 쪽을 집어도 같은 심볼이 되도록 한다(선언 지점은 `adapters.ts` 하나뿐이다).
 */
export type { BinarySource, NamedBinarySource } from './adapters';
