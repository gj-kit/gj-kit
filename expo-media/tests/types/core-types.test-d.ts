// ═══════════════════════════════════════════════════════════════════════════
// 타입 픽스처 — 코어 값 타입(메타데이터·contentType·에러 코드). 설계 문서 §6.3 ⑫·⑱ + §10.2.
//
// ⑫와 ⑱은 같은 부류의 사고를 막는다: **컴파일도 테스트도 통과하는데 데이터만 사라지는** 경로.
//   ⑫ `geoPoint → location` 리네임은 weak type 검사를 통과하고, 서버 zod가 미지의 키를
//      조용히 스트립해 위치정보만 유실된다(§5.3 · G5 환원).
//   ⑱ 클라이언트 유니언이 서버보다 넓으면 gif가 presign 단계에서 서버에 거절당한다(§5.1 · G15).
// 둘 다 얻는 것이 없으므로 타입이 애초에 그 문을 닫는다.
// ═══════════════════════════════════════════════════════════════════════════

import { describe, expectTypeOf, it } from 'vitest';

import {
  MEDIA_CONTENT_TYPES,
  MEDIA_ERROR_CODES,
  MediaError,
  assertNeverMediaError,
  isMediaError,
  mediaErrorCode,
  mediaErrorUserMessage,
  mediaUploadFailureInfo,
  mediaKindOf,
} from '../../src/core';
import type {
  GeoPoint,
  ImageContentType,
  MediaContentType,
  MediaErrorCode,
  MediaKind,
  MediaMetadata,
  MediaPlatform,
  MediaOrphanedUpload,
  MediaUploadFailureInfo,
  MediaUploadLimits,
  DurableFile,
  DurableFileStore,
  DurableFileStoreAdapter,
  ExifCapturedAtOptions,
  ExifWallClock,
  VideoContentType,
} from '../../src/core';
import { capturedAtFromExif, parseExifWallClock } from '../../src/core';

describe('§6.3-⑫ MediaMetadata는 geoPoint다 — location은 없다 (§5.3 · G5)', () => {
  it('`geoPoint` 프로퍼티가 존재한다', () => {
    expectTypeOf<MediaMetadata>().toHaveProperty('geoPoint');
    expectTypeOf<MediaMetadata['geoPoint']>().toEqualTypeOf<GeoPoint | undefined>();
    expectTypeOf<GeoPoint>().toEqualTypeOf<{ readonly latitude: number; readonly longitude: number }>();
  });

  it('`location` 필드는 존재하지 않는다', () => {
    // @ts-expect-error ⑫ 리네임은 weak type 검사를 통과하고 서버 zod가 조용히 스트립한다
    const metadata: MediaMetadata = { location: { latitude: 1, longitude: 2 } };
    void metadata;
  });

  it('초안의 width/height는 삭제됐다 — EXIF 파서가 읽지 않는 죽은 필드였다', () => {
    // @ts-expect-error 치수의 주소는 `MediaUploadCompletion` 최상위다(의미 중복 제거)
    const metadata: MediaMetadata = { width: 100, height: 200 };
    void metadata;
  });

  it('정상 조합 — 두 필드 모두 옵셔널이고 EOP 규약을 따른다', () => {
    const full: MediaMetadata = {
      capturedAt: '2024-01-02T03:04:05.000Z',
      geoPoint: { latitude: 37.5665, longitude: 126.978 },
    };
    const empty: MediaMetadata = {};
    const explicit: MediaMetadata = { capturedAt: undefined, geoPoint: undefined };
    void full;
    void empty;
    void explicit;
  });
});

describe('§6.3-⑱ gif는 유니언에 없다 (§5.1 · G15)', () => {
  it("'image/gif'는 `MediaContentType`이 아니다", () => {
    // @ts-expect-error ⑱ 클라이언트가 서버 zod보다 넓은 유니언을 갖는 것은 순손실이다
    const contentType: MediaContentType = 'image/gif';
    void contentType;
  });

  it('닫힌 8종이 정본이다', () => {
    expectTypeOf<MediaContentType>().toEqualTypeOf<
      | 'image/jpeg'
      | 'image/png'
      | 'image/webp'
      | 'image/heic'
      | 'image/heif'
      | 'video/mp4'
      | 'video/quicktime'
      | 'video/webm'
    >();
    expectTypeOf<ImageContentType>().toEqualTypeOf<
      'image/jpeg' | 'image/png' | 'image/webp' | 'image/heic' | 'image/heif'
    >();
    expectTypeOf<VideoContentType>().toEqualTypeOf<'video/mp4' | 'video/quicktime' | 'video/webm'>();
    expectTypeOf(MEDIA_CONTENT_TYPES).toEqualTypeOf<readonly MediaContentType[]>();
  });

  it('`mediaKindOf`는 닫힌 유니언만 받고 닫힌 유니언만 준다', () => {
    expectTypeOf(mediaKindOf('video/webm')).toEqualTypeOf<MediaKind>();
    expectTypeOf<MediaKind>().toEqualTypeOf<'image' | 'video'>();
    expectTypeOf<MediaPlatform>().toEqualTypeOf<'ios' | 'android' | 'web'>();
    // @ts-expect-error 임의 MIME 문자열은 들어가지 않는다
    mediaKindOf('application/pdf');
  });

  it('`MediaUploadLimits`는 두 kind만 갖는다 — 형식별 캡은 없다', () => {
    const limits: MediaUploadLimits = { image: { maxBytes: 1 }, video: { maxBytes: 2 } };
    void limits;
    // @ts-expect-error kind가 아니라 contentType으로 나누는 문은 없다
    const bad: MediaUploadLimits = { 'image/jpeg': { maxBytes: 1 } };
    void bad;
  });
});

describe('`MediaErrorCode` 16종 exhaustive (§5.2)', () => {
  it('유니언이 정확히 16종이다 — 순서·문자열이 계약이다', () => {
    expectTypeOf<MediaErrorCode>().toEqualTypeOf<
      | 'device-timeout'
      | 'device-icloud-only'
      | 'device-not-found'
      | 'device-library-failed'
      | 'picker-failed'
      | 'unsupported-file-type'
      | 'file-too-large'
      | 'upload-failed'
      | 'save-permission-denied'
      | 'save-download-failed'
      | 'permission-denied'
      | 'poster-upload-failed'
      | 'no-media-selected'
      | 'picked-asset-invalid'
      | 'config-invalid'
      | 'platform-unsupported'
    >();
    // 튜플 길이로 개수를 못 박는다 — 스냅샷은 `-u`로 조용히 갱신되므로 쓰지 않는다(§7.2 선례).
    expectTypeOf(MEDIA_ERROR_CODES.length).toEqualTypeOf<16>();
    expectTypeOf(MEDIA_ERROR_CODES[0]).toEqualTypeOf<'device-timeout'>();
    expectTypeOf(MEDIA_ERROR_CODES[15]).toEqualTypeOf<'platform-unsupported'>();
  });

  it('16종을 전부 분기하면 `assertNeverMediaError`가 통과한다', () => {
    const classify = (code: MediaErrorCode): string => {
      switch (code) {
        case 'device-timeout':
        case 'device-icloud-only':
        case 'device-not-found':
        case 'device-library-failed':
        case 'picker-failed':
          return 'device';
        case 'unsupported-file-type':
        case 'file-too-large':
        case 'picked-asset-invalid':
        case 'no-media-selected':
          return 'input';
        case 'upload-failed':
        case 'poster-upload-failed':
          return 'transfer';
        case 'save-permission-denied':
        case 'permission-denied':
          return 'permission';
        case 'save-download-failed':
          return 'download';
        case 'config-invalid':
        case 'platform-unsupported':
          return 'setup';
        default:
          // 라이브러리가 코드를 추가하면 여기서 컴파일 에러가 난다(§6.1-⑫ — 제공만 하고 강제하지 않는다).
          return assertNeverMediaError(code);
      }
    };
    expectTypeOf(classify).returns.toBeString();
  });

  it('한 종이라도 빠지면 `assertNeverMediaError`가 컴파일 에러를 낸다', () => {
    const partial = (code: MediaErrorCode): string => {
      switch (code) {
        case 'device-timeout':
          return 'device';
        default:
          // @ts-expect-error 나머지 15종이 남아 있으므로 `never`가 아니다
          return assertNeverMediaError(code);
      }
    };
    void partial;
  });

  it('없는 코드는 만들 수 없다', () => {
    // @ts-expect-error 'network-offline'은 16종에 없다 — rename·추가는 라이브러리의 결정이다
    new MediaError('network-offline', 'x');
    // 정상 경로.
    void new MediaError('upload-failed', 'x');
  });

  it('분류는 `isMediaError`로 한다 — `instanceof`는 splitting:false에서 반드시 깨진다', () => {
    const error: unknown = new MediaError('upload-failed', 'x');
    expectTypeOf(mediaErrorCode(error)).toEqualTypeOf<MediaErrorCode | null>();
    expectTypeOf(mediaErrorUserMessage(error)).toEqualTypeOf<string | null>();
    if (isMediaError(error)) {
      // 좁히기가 실제로 일어나야 `error.code`로 분기할 수 있다.
      expectTypeOf(error).toEqualTypeOf<MediaError>();
      expectTypeOf(error.code).toEqualTypeOf<MediaErrorCode>();
      expectTypeOf(error.message).toBeString();
    }
  });
});

describe('업로드 실패 복구 정보 — URL 없는 cross-entry inspection API', () => {
  it('임의 caught value에서만 읽고, 결과는 null 또는 안전한 immutable metadata다', () => {
    const error: unknown = new MediaError('upload-failed', 'Upload failed.');
    expectTypeOf(mediaUploadFailureInfo(error)).toEqualTypeOf<MediaUploadFailureInfo | null>();
    expectTypeOf<MediaUploadFailureInfo>().toEqualTypeOf<{
      readonly stage: 'intent' | 'put' | 'complete';
      readonly orphanedObjects: readonly MediaOrphanedUpload[];
    }>();
    expectTypeOf<MediaOrphanedUpload['objectName']>().toEqualTypeOf<string>();
    expectTypeOf<MediaOrphanedUpload['contentType']>().toEqualTypeOf<MediaContentType>();
    expectTypeOf<MediaOrphanedUpload['sizeBytes']>().toEqualTypeOf<number>();
    expectTypeOf<MediaOrphanedUpload['storageState']>().toEqualTypeOf<
      'uploaded' | 'possibly-uploaded'
    >();
  });
});

describe('durable local-file store contract', () => {
  it('only accepts a constrained copy input and reports a verified persistent file', () => {
    expectTypeOf<DurableFile>().toEqualTypeOf<{
      readonly uri: string;
      readonly sizeBytes: number;
    }>();
    expectTypeOf<DurableFileStore>().toHaveProperty('copy');
    expectTypeOf<DurableFileStoreAdapter>().toHaveProperty('ensureDirectory');
  });
});

describe('EXIF historical time-zone contract', () => {
  it('keeps a timezone-free wall clock distinct from an ISO instant', () => {
    expectTypeOf<ExifWallClock>().toEqualTypeOf<{
      readonly year: number;
      readonly month: number;
      readonly day: number;
      readonly hour: number;
      readonly minute: number;
      readonly second: number;
      readonly millisecond: number;
    }>();
    expectTypeOf(parseExifWallClock('2024:01:02 03:04:05')).toEqualTypeOf<ExifWallClock | undefined>();
    expectTypeOf<ExifCapturedAtOptions>().toEqualTypeOf<{
      readonly timeZoneOffsetMinutes?: number | undefined;
    }>();
    expectTypeOf(capturedAtFromExif({}, { timeZoneOffsetMinutes: 540 })).toEqualTypeOf<string | undefined>();
  });
});
