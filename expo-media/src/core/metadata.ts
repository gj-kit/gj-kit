// 설계 문서 §5.3 · §7 하드닝 11 · §7.1 — EXIF 촬영 메타데이터 추출.
//
// 전신(`packages/photo-kit/src/photoMetadata.ts`, 290줄)의 **로직과 주석 원문을 그대로** 옮긴다.
// 유일한 구조 변경은 `Blob` → `BinarySource`다 — 그래야 코어가 DOM lib 없이 컴파일되고
// (`tsconfig.core.json`, §2.4) 유닛 테스트가 plain object로 전 경로를 돌 수 있다(§10.1).
//
// 여기 있는 파서는 "있으면 좋은" 코드가 아니다. iOS 웹 피커 경로에서 EXIF를 잃으면
// 촬영 시각·위치가 영구 소실되고, 그것은 타입에도 테스트에도 잡히지 않는다(§6.1).

import type { BinarySource } from './adapters';
import type { GeoPoint, MediaMetadata } from './types';
import type { MediaContentType } from './mediaTypes';

/**
 * 선언 지점은 `types.ts` 하나다(§5.7.2-①). §5.3이 이 두 타입을 metadata 모듈의 표면으로
 * 적었으므로 같은 선언을 여기서도 이름으로 집을 수 있게 재export한다 — 배럴이 어느 쪽에서
 * 집어도 **같은 선언**이라 중복 export가 되지 않는다.
 */
export type { GeoPoint, MediaMetadata } from './types';

type ExifRecord = Record<string, unknown>;
type ReadonlyExifRecord = Readonly<Record<string, unknown>>;

// 키 후보들 — 플랫폼·라이브러리마다 대문자 규칙이 다르다(iOS PhotoKit / expo 피커 / 브라우저).
const GPS_LATITUDE_KEYS = ['GPSLatitude', 'gpsLatitude', 'latitude'];
const GPS_LONGITUDE_KEYS = ['GPSLongitude', 'gpsLongitude', 'longitude'];
const GPS_LATITUDE_REF_KEYS = ['GPSLatitudeRef', 'gpsLatitudeRef', 'LatitudeRef'];
const GPS_LONGITUDE_REF_KEYS = ['GPSLongitudeRef', 'gpsLongitudeRef', 'LongitudeRef'];
const CAPTURED_AT_KEYS = ['DateTimeOriginal', 'DateTimeDigitized', 'DateTime'];

function firstValue(exif: ReadonlyExifRecord, keys: readonly string[]): unknown {
  return keys.map((key) => exif[key]).find((value) => value !== undefined);
}

/**
 * EXIF 수치는 number·문자열·유리수 문자열(`"1/3"`)·`{numerator,denominator}` 객체로 온다.
 * 네 형태를 모두 받아야 하는 이유는 소스가 넷이기 때문이다(네이티브 피커·웹 피커·직접 파서·호스트).
 */
function numberFromUnknown(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const rationalMatch = trimmed.match(/^(-?\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)$/);
    if (rationalMatch) {
      const numerator = Number(rationalMatch[1]);
      const denominator = Number(rationalMatch[2]);
      if (Number.isFinite(numerator) && Number.isFinite(denominator) && denominator !== 0) {
        return numerator / denominator;
      }
    }
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (value && typeof value === 'object') {
    const candidate = value as { numerator?: unknown; denominator?: unknown };
    const numerator = numberFromUnknown(candidate.numerator);
    const denominator = numberFromUnknown(candidate.denominator);
    if (numerator !== null && denominator !== null && denominator !== 0) {
      return numerator / denominator;
    }
  }
  return null;
}

/** 도·분·초 배열([도, 분, 초])과 십진 도수 양쪽을 받는다. 부호는 Ref가 정한다. */
function decimalDegreesFromExif(value: unknown): number | null {
  if (Array.isArray(value)) {
    if (value.length >= 3) {
      const degrees = numberFromUnknown(value[0]);
      const minutes = numberFromUnknown(value[1]);
      const seconds = numberFromUnknown(value[2]);
      if (degrees === null || minutes === null || seconds === null) return null;
      return Math.abs(degrees) + minutes / 60 + seconds / 3600;
    }
    if (value.length === 1) return numberFromUnknown(value[0]);
    return null;
  }
  return numberFromUnknown(value);
}

function signedCoordinate(value: unknown, ref: unknown): number | null {
  const decimal = decimalDegreesFromExif(value);
  if (decimal === null) return null;
  const direction = typeof ref === 'string' ? ref.trim().toUpperCase() : '';
  if (direction === 'S' || direction === 'W') return -Math.abs(decimal);
  return decimal;
}

/**
 * 범위를 벗어난 좌표는 좌표가 아니라 파싱 실패다 — 통과시키면 지도에 엉뚱한 점이 찍힌다.
 * 소수 6자리(≈0.1m)에서 자른다: 그 이상은 EXIF의 정밀도를 넘어선 잡음이고, 직렬화 크기만 늘린다.
 */
function validGeoPoint(latitude: number | null, longitude: number | null): GeoPoint | null {
  if (latitude === null || longitude === null) return null;
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    return null;
  }
  return {
    latitude: Number(latitude.toFixed(6)),
    longitude: Number(longitude.toFixed(6)),
  };
}

/**
 * §7 하드닝 11 — **EXIF 로컬 타임존 해석**. 아래 주석은 전신 원문(photoMetadata.ts:97-102)이다.
 *
 *   "EXIF DateTime은 타임존을 담지 않는다. 이것을 **기기의 로컬 벽시계**로 해석한다 —
 *    MediaLibrary `creationTime` 경로와 같은 의미다 — 그래야 12:30 KST에 찍은 사진이
 *    EXIF로 들어왔는지 기기 그리드로 들어왔는지에 따라 아홉 시간씩 어긋나지 않고,
 *    기록 날짜가 양쪽 경로에서 같은 달력 날짜에 묶인다.
 *    (기기가 지금 있는 타임존과 다른 곳에서 찍은 사진에 대해서만 틀리는데, 그것이 가장 덜 나쁜
 *     선택이다.)"
 *
 * ⚠ `new Date(y, m, d, …)`(로컬 해석)를 `new Date(isoString)`(UTC 해석)으로 바꾸면 이 하드닝이
 * 조용히 사라진다. 그 회귀는 `TZ=Asia/Seoul`과 `TZ=UTC` 두 실행을 비교하는 유닛만이 잡는다(§7).
 */
function capturedAtFromExif(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const exifDateTime = trimmed.match(/^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/);
  const date = exifDateTime
    ? new Date(
        Number(exifDateTime[1]),
        Number(exifDateTime[2]) - 1,
        Number(exifDateTime[3]),
        Number(exifDateTime[4]),
        Number(exifDateTime[5]),
        Number(exifDateTime[6]),
      )
    : new Date(trimmed);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/**
 * 전신 `extractPhotoMetadata`.
 *
 * ⚠ **유효값이 하나도 없으면 `undefined`를 반환한다 — 빈 객체 금지**(photoMetadata.ts:130 규칙).
 * truthy한 빈 객체를 주면 호출자가 "EXIF가 있었다"고 믿게 되고, 그 오해는 업로드 완료 페이로드의
 * `photo` 필드까지 그대로 흘러간다.
 */
export function mediaMetadataFromExif(
  exif?: ReadonlyExifRecord | null,
): MediaMetadata | undefined {
  if (!exif) return undefined;
  const latitude = signedCoordinate(
    firstValue(exif, GPS_LATITUDE_KEYS),
    firstValue(exif, GPS_LATITUDE_REF_KEYS),
  );
  const longitude = signedCoordinate(
    firstValue(exif, GPS_LONGITUDE_KEYS),
    firstValue(exif, GPS_LONGITUDE_REF_KEYS),
  );
  const geoPoint = validGeoPoint(latitude, longitude);
  const capturedAt = capturedAtFromExif(firstValue(exif, CAPTURED_AT_KEYS));
  if (!geoPoint && !capturedAt) return undefined;
  return {
    ...(capturedAt ? { capturedAt } : {}),
    ...(geoPoint ? { geoPoint } : {}),
  };
}

// ═══ JPEG APP1 → TIFF IFD 파서 ═══════════════════════════════════════════════
// 웹 피커가 주는 Blob에는 EXIF 필드가 붙어 오지 않는다. 바이트에서 직접 읽는 이 파서가 없으면
// 웹 업로드 경로의 촬영시각·위치가 통째로 비게 된다.

function readAscii(view: DataView, offset: number, length: number): string {
  let value = '';
  for (let index = 0; index < length; index += 1) {
    const code = view.getUint8(offset + index);
    if (code === 0) break;
    value += String.fromCharCode(code);
  }
  return value.trim();
}

function readRational(view: DataView, offset: number, littleEndian: boolean): number | null {
  const numerator = view.getUint32(offset, littleEndian);
  const denominator = view.getUint32(offset + 4, littleEndian);
  return denominator === 0 ? null : numerator / denominator;
}

function parseTiffExif(view: DataView, tiffStart: number): MediaMetadata | undefined {
  const byteOrder = readAscii(view, tiffStart, 2);
  const littleEndian = byteOrder === 'II';
  if (!littleEndian && byteOrder !== 'MM') return undefined;
  // 42는 TIFF 매직이다. 아니면 EXIF가 아니므로 더 읽지 않는다.
  if (view.getUint16(tiffStart + 2, littleEndian) !== 42) return undefined;

  const exif: ExifRecord = {};
  // ⚠ **IFD 순환 방지.** 손상되거나 악의적인 파일은 IFD 포인터를 자기 자신(또는 서로)에게
  // 되돌려 무한 재귀를 만든다. 방문한 상대 오프셋을 기억해 한 번씩만 내려간다.
  const visitedOffsets = new Set<number>();

  const absoluteOffset = (relativeOffset: number): number => tiffStart + relativeOffset;
  // ⚠ **경계 검사.** 오프셋은 파일 안의 값이므로 신뢰할 수 없다. 읽기 전에 항상 버퍼 안인지 본다 —
  // 이 술어가 없으면 잘린 JPEG 하나가 DataView RangeError로 업로드 전체를 죽인다.
  const isReadable = (offset: number, length: number): boolean =>
    offset >= 0 && offset + length <= view.byteLength;

  const valueOffset = (entryOffset: number, type: number, count: number): number | null => {
    const typeSize = type === 2 ? 1 : type === 3 ? 2 : type === 4 ? 4 : type === 5 ? 8 : 0;
    if (!typeSize) return null;
    const byteLength = typeSize * count;
    // 4바이트 이하는 엔트리 안에 값이 들어 있고, 그보다 크면 엔트리가 오프셋을 담는다(TIFF 규칙).
    if (byteLength <= 4) return entryOffset + 8;
    return absoluteOffset(view.getUint32(entryOffset + 8, littleEndian));
  };

  const parseIfd = (relativeOffset: number): void => {
    if (visitedOffsets.has(relativeOffset)) return;
    visitedOffsets.add(relativeOffset);

    const ifdOffset = absoluteOffset(relativeOffset);
    if (!isReadable(ifdOffset, 2)) return;
    const entries = view.getUint16(ifdOffset, littleEndian);

    for (let index = 0; index < entries; index += 1) {
      const entryOffset = ifdOffset + 2 + index * 12;
      if (!isReadable(entryOffset, 12)) return;
      const tag = view.getUint16(entryOffset, littleEndian);
      const type = view.getUint16(entryOffset + 2, littleEndian);
      const count = view.getUint32(entryOffset + 4, littleEndian);
      const offset = valueOffset(entryOffset, type, count);
      if (offset === null) continue;

      if ((tag === 0x0132 || tag === 0x9003 || tag === 0x9004) && type === 2 && isReadable(offset, count)) {
        // 0x0132 DateTime / 0x9003 DateTimeOriginal / 0x9004 DateTimeDigitized
        const key =
          tag === 0x0132 ? 'DateTime' : tag === 0x9003 ? 'DateTimeOriginal' : 'DateTimeDigitized';
        exif[key] = readAscii(view, offset, count);
      } else if ((tag === 0x8769 || tag === 0x8825) && type === 4 && count === 1 && isReadable(offset, 4)) {
        // 0x8769 Exif IFD / 0x8825 GPS IFD — 하위 IFD로 내려간다(순환은 위에서 막았다).
        parseIfd(view.getUint32(offset, littleEndian));
      } else if ((tag === 0x0001 || tag === 0x0003) && type === 2 && isReadable(offset, count)) {
        // GPSLatitudeRef / GPSLongitudeRef — 부호(S·W)를 여기서 얻는다.
        exif[tag === 0x0001 ? 'GPSLatitudeRef' : 'GPSLongitudeRef'] = readAscii(view, offset, count);
      } else if ((tag === 0x0002 || tag === 0x0004) && type === 5 && count >= 3 && isReadable(offset, 24)) {
        // GPSLatitude / GPSLongitude — 유리수 3개(도·분·초)가 8바이트씩 이어진다.
        const coordinate = [
          readRational(view, offset, littleEndian),
          readRational(view, offset + 8, littleEndian),
          readRational(view, offset + 16, littleEndian),
        ];
        exif[tag === 0x0002 ? 'GPSLatitude' : 'GPSLongitude'] = coordinate;
      }
    }
  };

  parseIfd(view.getUint32(tiffStart + 4, littleEndian));
  return mediaMetadataFromExif(exif);
}

function parseJpegExif(buffer: ArrayBuffer): MediaMetadata | undefined {
  const view = new DataView(buffer);
  if (view.byteLength < 4 || view.getUint16(0) !== 0xffd8) return undefined;

  let offset = 2;
  while (offset + 4 <= view.byteLength) {
    if (view.getUint8(offset) !== 0xff) return undefined;
    const marker = view.getUint8(offset + 1);
    // SOS(0xda)·EOI(0xd9) 이후에는 메타데이터가 없다 — 이미지 데이터를 세그먼트로 오독하지 않도록
    // 여기서 멈춘다.
    if (marker === 0xda || marker === 0xd9) return undefined;
    const length = view.getUint16(offset + 2);
    if (length < 2 || offset + 2 + length > view.byteLength) return undefined;
    if (marker === 0xe1 && length >= 8 && readAscii(view, offset + 4, 6) === 'Exif') {
      // APP1 헤더 "Exif\0\0" 6바이트 뒤부터가 TIFF 헤더다.
      return parseTiffExif(view, offset + 10);
    }
    offset += 2 + length;
  }

  return undefined;
}

/**
 * 전신 `extractPhotoMetadataFromBlob(blob, fallbackExif, contentType)`(photoMetadata.ts:265-290).
 * 초안이 지웠던 인자 2개를 `options`로 **복원**한다(G6 · §7.1). **4규칙이 계약이다**:
 *   ① 비-JPEG 스킵 — `(contentType ?? source.type)`이 'jpeg'/'jpg'를 포함하지 않으면 파싱하지 않고
 *      fallback을 그대로 반환한다.
 *   ② **필드 단위 병합** — `parsed?.X ?? fallback?.X`. 객체 단위 폴백이 아니다.
 *      capturedAt만 파싱되고 geoPoint는 fallback에서 오는 조합이 **정상 결과**다.
 *   ③ 파싱 예외 시 fallback 반환 — throw 금지. 메타데이터 때문에 업로드가 죽어선 안 된다.
 *   ④ ①②③ 이후에도 유효값이 없으면 `undefined`(빈 객체 금지 — `mediaMetadataFromExif`와 동일).
 *
 * ⚠ 인자를 지우면 웹 피커 경로(`fallbackExif: asset.exif`)에서 JPEG 파싱이 실패했을 때 피커가 준
 * EXIF가 통째로 버려져 촬영시각·위치가 유실된다. 그 유실은 컴파일도 테스트도 통과한다.
 */
export async function mediaMetadataFromJpeg(
  source: BinarySource,
  options?:
    | {
        readonly fallbackExif?: ReadonlyExifRecord | null | undefined;
        readonly contentType?: MediaContentType | string | null | undefined;
      }
    | undefined,
): Promise<MediaMetadata | undefined> {
  const fallback = mediaMetadataFromExif(options?.fallbackExif);
  // 전신은 `contentType || blob.type`이었다. `BinarySource.type`은 선택 필드이므로 빈 문자열로 낮춘다
  // — 결과는 동일하다(빈 문자열은 'jpeg'를 포함하지 않으므로 규칙 ①에 걸린다).
  const normalizedType = (options?.contentType || source.type || '').toLowerCase();
  if (!normalizedType.includes('jpeg') && !normalizedType.includes('jpg')) {
    return fallback;
  }

  try {
    const parsed = parseJpegExif(await source.arrayBuffer());
    const geoPoint = parsed?.geoPoint ?? fallback?.geoPoint;
    const capturedAt = parsed?.capturedAt ?? fallback?.capturedAt;
    // `mediaMetadataFromExif`와 같은 규칙: 쓸 만한 필드가 없으면 메타데이터가 없는 것이다 —
    // truthy한 빈 객체는 호출자에게 EXIF가 있었다고 믿게 만든다.
    if (!geoPoint && !capturedAt) return undefined;
    return {
      ...(capturedAt ? { capturedAt } : {}),
      ...(geoPoint ? { geoPoint } : {}),
    };
  } catch {
    return fallback;
  }
}
