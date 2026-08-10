// 설계 문서 §5.6 `"./testing"` — EXIF · 서명 URL 픽스처.
//
// 두 픽스처군이 필요한 이유는 각각 하드닝 하나씩을 붙잡기 때문이다:
//   · **서명 URL** — §7 하드닝 8. iOS URLSession 실패는 서명 업로드 URL 전문(임시 자격증명 포함)을
//     그대로 에코한다. `sanitizeMediaErrorMessage`가 그것을 `[URL]`로 치환하는지 검증하려면
//     "실제로 자격증명이 실린 URL 모양"이 필요하다. 손으로 지어낸 `https://x/y`로는
//     쿼리 파라미터 경계·다중 URL·1000자 절단 어느 것도 걸리지 않는다.
//   · **EXIF** — §7 하드닝 11. dict 경로(`mediaMetadataFromExif`)와 바이트 경로
//     (`mediaMetadataFromJpeg`)가 **같은 값**을 내야 한다. 두 픽스처가 같은 촬영시각·좌표를
//     표현하도록 짝지어 둔 이유가 그것이다 — 한쪽만 있으면 파서 회귀를 dict 테스트가 가려 준다.
//
// ⚠ peer 0 · DOM 0. JPEG 픽스처는 `DataView`로 직접 쓴다(ES2022 lib 안에 있다).

// ── 서명 URL ────────────────────────────────────────────────────────────────

/**
 * 임시 자격증명이 쿼리에 실린 presigned PUT URL.
 * ⚠ 실제 자격증명이 아니다 — 형태만 재현한 고정 문자열이다.
 */
export const SIGNED_UPLOAD_URL =
  'https://media.example.test/objects/photo-1.jpg' +
  '?X-Amz-Algorithm=AWS4-HMAC-SHA256' +
  '&X-Amz-Credential=EXAMPLEKEYID%2F20260810%2Fap-northeast-2%2Fs3%2Faws4_request' +
  '&X-Amz-Date=20260810T000000Z' +
  '&X-Amz-Expires=900' +
  '&X-Amz-SignedHeaders=host' +
  '&X-Amz-Signature=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

/** 오브젝트별 서명 URL. `createFakeUploadApi`의 기본 발급기이기도 하다. */
export function signedUploadUrl(objectName: string): string {
  return SIGNED_UPLOAD_URL.replace('objects/photo-1.jpg', encodeURI(objectName));
}

/**
 * iOS URLSession이 서명 URL을 그대로 에코한 실패 메시지의 모양.
 * `sanitizeMediaErrorMessage` 유닛이 "플랫폼 코드·설명은 남고 URL만 `[URL]`이 되는가"를 본다.
 */
export function signedUrlErrorMessage(url: string = SIGNED_UPLOAD_URL): string {
  return `Error Domain=NSURLErrorDomain Code=-1001 "The request timed out." UserInfo={NSErrorFailingURLKey=${url}}`;
}

// ── EXIF (dict 경로) ────────────────────────────────────────────────────────

/** EXIF 원문 벽시계. ⚠ 타임존이 없다 — 그것이 하드닝 11의 전제다. */
export const EXIF_CAPTURED_AT = '2024:01:02 03:04:05';

/**
 * `EXIF_CAPTURED_AT`을 **기기 로컬 타임존**으로 해석한 ISO 문자열.
 *
 * ⚠ 상수가 아니라 함수인 것이 요점이다. §7 하드닝 11의 회귀는 `TZ=Asia/Seoul`과 `TZ=UTC`
 * 두 실행에서 **서로 다른 값**이 나오는지로만 잡힌다 — 고정 문자열로 박아 두면 그 유닛이
 * 한 타임존에서만 통과하는 가짜 검증이 된다.
 */
export function exifCapturedAtIso(): string {
  return new Date(2024, 0, 2, 3, 4, 5).toISOString();
}

/** `EXIF_FIXTURE`가 표현하는 좌표. `validGeoPoint`의 소수 6자리 반올림까지 반영된 값이다. */
export const EXIF_GEO_POINT = { latitude: 37.5665, longitude: 126.978 } as const;

/**
 * 피커·PhotoKit이 주는 형태의 EXIF dict.
 * 좌표는 도·분·초 배열이고 부호는 Ref가 정한다(§5.3의 GPS 3형식 중 대표형).
 * ⚠ 아래 `jpegWithExif()`가 **같은 값**을 바이트로 표현한다 — 두 경로의 동치가 계약이다.
 */
export const EXIF_FIXTURE: Readonly<Record<string, unknown>> = {
  DateTimeOriginal: EXIF_CAPTURED_AT,
  GPSLatitude: [37, 33, 59.4],
  GPSLatitudeRef: 'N',
  GPSLongitude: [126, 58, 40.8],
  GPSLongitudeRef: 'E',
};

// ── EXIF (JPEG APP1 바이트 경로) ────────────────────────────────────────────
//
// 아래 오프셋들은 TIFF 구조를 손으로 배치한 결과다. 배치를 바꾸면 파서가 읽는 위치가 바뀌므로
// 상수로 고정하고 각 블록의 크기 계산을 주석에 남긴다.
//   IFD 하나 = 2(엔트리 수) + 12×엔트리 + 4(다음 IFD 오프셋)

const TIFF_HEADER_LENGTH = 8; // 'MM' + 42 + IFD0 오프셋
const IFD0_OFFSET = TIFF_HEADER_LENGTH; // 8   — 엔트리 2 → 2 + 24 + 4 = 30
const EXIF_IFD_OFFSET = IFD0_OFFSET + 30; // 38  — 엔트리 1 → 2 + 12 + 4 = 18
const GPS_IFD_OFFSET = EXIF_IFD_OFFSET + 18; // 56  — 엔트리 4 → 2 + 48 + 4 = 54
const DATE_TIME_OFFSET = GPS_IFD_OFFSET + 54; // 110 — ASCII 20바이트(19자 + NUL)
const LATITUDE_OFFSET = DATE_TIME_OFFSET + 20; // 130 — RATIONAL 3개 = 24바이트
const LONGITUDE_OFFSET = LATITUDE_OFFSET + 24; // 154 — RATIONAL 3개 = 24바이트
const TIFF_LENGTH = LONGITUDE_OFFSET + 24; // 178

/** APP1 세그먼트 헤더: 길이 필드 2 + "Exif\0\0" 6. TIFF는 그 뒤에서 시작한다. */
const APP1_HEADER_LENGTH = 8;

function writeAscii(view: DataView, offset: number, value: string): void {
  for (let index = 0; index < value.length; index += 1) {
    view.setUint8(offset + index, value.charCodeAt(index));
  }
  view.setUint8(offset + value.length, 0); // NUL 종단 — `readAscii`가 여기서 멈춘다.
}

/** TIFF 엔트리 12바이트: tag(2) type(2) count(4) value|offset(4). */
function writeEntry(
  view: DataView,
  offset: number,
  tag: number,
  type: number,
  count: number,
  value: number,
): void {
  view.setUint16(offset, tag);
  view.setUint16(offset + 2, type);
  view.setUint32(offset + 4, count);
  view.setUint32(offset + 8, value);
}

function writeRational(view: DataView, offset: number, numerator: number, denominator: number): void {
  view.setUint32(offset, numerator);
  view.setUint32(offset + 4, denominator);
}

/**
 * `EXIF_FIXTURE`와 **같은 값**을 담은 최소 JPEG(빅엔디언 'MM' TIFF).
 *
 * 구조: `SOI` → `APP1(Exif)` → `EOI`. 이미지 데이터가 없어도 파서에는 충분하다 —
 * `parseJpegExif`는 SOS(0xda) 이전 세그먼트만 훑기 때문이다.
 *
 * ⚠ 이 픽스처가 없으면 웹 업로드 경로(`mediaMetadataFromJpeg`)의 EXIF 추출은 **영영 유닛으로
 * 검증되지 않는다** — 그 경로가 조용히 죽으면 촬영시각·위치가 영구 소실되고, 그것은 타입에도
 * 테스트에도 잡히지 않는다(§5.3 머리말).
 */
export function jpegWithExif(): Uint8Array {
  // SOI(2) + APP1 마커(2) + [길이(2) + "Exif\0\0"(6)] + TIFF + EOI(2)
  const totalLength = 2 + 2 + APP1_HEADER_LENGTH + TIFF_LENGTH + 2; // = 192
  const buffer = new ArrayBuffer(totalLength);
  const view = new DataView(buffer);

  view.setUint16(0, 0xffd8); // SOI
  view.setUint16(2, 0xffe1); // APP1
  view.setUint16(4, APP1_HEADER_LENGTH + TIFF_LENGTH); // 길이 = 자기 자신(2) + "Exif\0\0"(6) + TIFF
  writeAscii(view, 6, 'Exif'); // "Exif\0" — 뒤의 1바이트는 0으로 남아 "Exif\0\0"이 된다.

  const tiff = 2 + 2 + APP1_HEADER_LENGTH; // = 12. `parseJpegExif`의 `offset + 10`과 같은 지점이다.
  view.setUint16(tiff, 0x4d4d); // 'MM' — 빅엔디언
  view.setUint16(tiff + 2, 42); // TIFF 매직
  view.setUint32(tiff + 4, IFD0_OFFSET);

  // IFD0 — 하위 IFD 두 개를 가리킨다. type 4(LONG) count 1은 4바이트라 값이 엔트리에 인라인된다.
  view.setUint16(tiff + IFD0_OFFSET, 2);
  writeEntry(view, tiff + IFD0_OFFSET + 2, 0x8769, 4, 1, EXIF_IFD_OFFSET); // Exif IFD 포인터
  writeEntry(view, tiff + IFD0_OFFSET + 14, 0x8825, 4, 1, GPS_IFD_OFFSET); // GPS IFD 포인터
  view.setUint32(tiff + IFD0_OFFSET + 26, 0); // 다음 IFD 없음

  // Exif IFD — DateTimeOriginal(0x9003). 20바이트라 값이 밖에 놓이고 엔트리는 오프셋을 담는다.
  view.setUint16(tiff + EXIF_IFD_OFFSET, 1);
  writeEntry(view, tiff + EXIF_IFD_OFFSET + 2, 0x9003, 2, 20, DATE_TIME_OFFSET);
  view.setUint32(tiff + EXIF_IFD_OFFSET + 14, 0);

  // GPS IFD — Ref는 2바이트라 인라인, 좌표는 24바이트라 오프셋.
  view.setUint16(tiff + GPS_IFD_OFFSET, 4);
  const gpsEntries = tiff + GPS_IFD_OFFSET + 2;
  writeEntry(view, gpsEntries, 0x0001, 2, 2, 0); // GPSLatitudeRef — 값은 아래에서 직접 쓴다
  writeAscii(view, gpsEntries + 8, 'N');
  writeEntry(view, gpsEntries + 12, 0x0002, 5, 3, LATITUDE_OFFSET); // GPSLatitude
  writeEntry(view, gpsEntries + 24, 0x0003, 2, 2, 0); // GPSLongitudeRef
  writeAscii(view, gpsEntries + 32, 'E');
  writeEntry(view, gpsEntries + 36, 0x0004, 5, 3, LONGITUDE_OFFSET); // GPSLongitude
  view.setUint32(gpsEntries + 48, 0);

  writeAscii(view, tiff + DATE_TIME_OFFSET, EXIF_CAPTURED_AT);

  // 37° 33' 59.4" N = 37.5665 / 126° 58' 40.8" E = 126.978 — `EXIF_GEO_POINT`와 같은 값이다.
  writeRational(view, tiff + LATITUDE_OFFSET, 37, 1);
  writeRational(view, tiff + LATITUDE_OFFSET + 8, 33, 1);
  writeRational(view, tiff + LATITUDE_OFFSET + 16, 594, 10);
  writeRational(view, tiff + LONGITUDE_OFFSET, 126, 1);
  writeRational(view, tiff + LONGITUDE_OFFSET + 8, 58, 1);
  writeRational(view, tiff + LONGITUDE_OFFSET + 16, 408, 10);

  view.setUint16(totalLength - 2, 0xffd9); // EOI
  return new Uint8Array(buffer);
}

/**
 * EXIF가 없는 최소 JPEG(APP0 JFIF만). `mediaMetadataFromJpeg`가 `undefined`를 내고
 * fallback으로 내려가는 경로(규칙 ④)를 태운다.
 */
export function jpegWithoutExif(): Uint8Array {
  const buffer = new ArrayBuffer(22); // SOI(2) + APP0 마커(2) + 세그먼트(16) + EOI(2)
  const view = new DataView(buffer);
  view.setUint16(0, 0xffd8);
  view.setUint16(2, 0xffe0); // APP0
  view.setUint16(4, 16);
  writeAscii(view, 6, 'JFIF');
  view.setUint16(11, 0x0102); // 버전 1.2
  view.setUint16(20, 0xffd9);
  return new Uint8Array(buffer);
}

/**
 * APP1 길이 필드가 실제 바이트보다 긴 **잘린** JPEG.
 *
 * ⚠ 파서의 경계 검사(`isReadable`)가 살아 있으면 예외 없이 `undefined`가 나오고, 죽어 있으면
 * `DataView` RangeError가 업로드 전체를 죽인다(§5.3 파서 주석). 그 차이를 이 픽스처가 가른다.
 */
export function truncatedJpegWithExif(): Uint8Array {
  // `subarray`가 아니라 `slice`다 — 원본 192바이트 버퍼를 공유하면 파서의 `view.byteLength`가
  // 40이 아니라 192가 되어 경계 검사가 발화하지 않는다(픽스처가 아무것도 검증하지 않게 된다).
  return jpegWithExif().slice(0, 40);
}
