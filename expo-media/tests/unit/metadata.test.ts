// 설계 문서 §5.3 · §7 하드닝 11 · §7.1 — EXIF 촬영 메타데이터.
//
// ⚠ 이 파일이 지키는 것 셋:
//   ① **로컬 벽시계 해석**(하드닝 11). `new Date(y,m,d,…)`(로컬)을 `new Date(iso)`(UTC)로 바꾸면
//      이 하드닝이 조용히 사라진다. 그 회귀는 **서로 다른 TZ 두 실행의 값을 비교**해야만 잡힌다 —
//      한 타임존에서만 도는 유닛은 두 구현을 구별하지 못한다. 그래서 여기서는 `process.env.TZ`를
//      바꿔 가며 같은 입력의 결과가 실제로 갈리는지 본다.
//   ② GPS 3형식 × Ref 부호 / 범위 밖 좌표 거부 / 유효값 없으면 `undefined`(빈 객체 금지).
//   ③ `mediaMetadataFromJpeg` 4규칙 — 특히 **필드 단위 병합**의 직접 증거.
//      (규칙 ②가 죽으면 웹 경로에서 위치가 조용히 사라진다. 컴파일도 테스트도 통과한다.)

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { BinarySource } from '../../src/core/adapters';
import { mediaMetadataFromExif, mediaMetadataFromJpeg } from '../../src/core/metadata';
import {
  EXIF_CAPTURED_AT,
  EXIF_FIXTURE,
  EXIF_GEO_POINT,
  createBinarySource,
  exifCapturedAtIso,
  jpegWithExif,
  jpegWithoutExif,
  truncatedJpegWithExif,
} from '../../src/testing';

const ORIGINAL_TZ = process.env['TZ'];

/** ⚠ Node는 `process.env.TZ` 대입 즉시 이후 생성되는 Date에 반영한다 — 그것이 이 검증의 수단이다. */
function withTimeZone<T>(timeZone: string, run: () => T): T {
  process.env['TZ'] = timeZone;
  try {
    return run();
  } finally {
    if (ORIGINAL_TZ === undefined) delete process.env['TZ'];
    else process.env['TZ'] = ORIGINAL_TZ;
  }
}

describe('mediaMetadataFromExif — 촬영 시각의 로컬 벽시계 해석(하드닝 11)', () => {
  it('TZ=Asia/Seoul과 TZ=UTC 두 실행에서 **서로 다른** ISO가 나온다', () => {
    const seoul = withTimeZone('Asia/Seoul', () =>
      mediaMetadataFromExif({ DateTimeOriginal: EXIF_CAPTURED_AT }),
    );
    const utc = withTimeZone('UTC', () =>
      mediaMetadataFromExif({ DateTimeOriginal: EXIF_CAPTURED_AT }),
    );

    // "2024:01:02 03:04:05"를 기기 로컬 벽시계로 읽은 결과다.
    expect(seoul?.capturedAt).toBe('2024-01-01T18:04:05.000Z');
    expect(utc?.capturedAt).toBe('2024-01-02T03:04:05.000Z');
    // 이 한 줄이 UTC 파싱 회귀를 잡는다 — 두 값이 같아지는 순간 하드닝이 죽은 것이다.
    expect(seoul?.capturedAt).not.toBe(utc?.capturedAt);
  });

  it('픽스처의 exifCapturedAtIso()는 현재 TZ의 기대값과 일치한다', () => {
    expect(mediaMetadataFromExif(EXIF_FIXTURE)?.capturedAt).toBe(exifCapturedAtIso());
  });

  it('DateTimeOriginal → DateTimeDigitized → DateTime 순으로 고른다', () => {
    expect(
      mediaMetadataFromExif({ DateTime: '2024:01:02 03:04:05', DateTimeOriginal: '2020:05:06 07:08:09' })
        ?.capturedAt,
    ).toBe(new Date(2020, 4, 6, 7, 8, 9).toISOString());
    expect(mediaMetadataFromExif({ DateTimeDigitized: EXIF_CAPTURED_AT })?.capturedAt).toBe(
      exifCapturedAtIso(),
    );
  });

  it('타임존이 붙은 ISO 문자열은 그대로 해석한다', () => {
    expect(mediaMetadataFromExif({ DateTimeOriginal: '2024-01-02T03:04:05.000Z' })?.capturedAt).toBe(
      '2024-01-02T03:04:05.000Z',
    );
  });

  it('빈 문자열·비문자열·파싱 불가는 값이 없는 것이다', () => {
    expect(mediaMetadataFromExif({ DateTimeOriginal: '   ' })).toBeUndefined();
    expect(mediaMetadataFromExif({ DateTimeOriginal: 12345 })).toBeUndefined();
    expect(mediaMetadataFromExif({ DateTimeOriginal: 'not a date' })).toBeUndefined();
  });
});

describe('mediaMetadataFromExif — GPS 3형식 × Ref 부호', () => {
  it('① 도·분·초 배열', () => {
    expect(mediaMetadataFromExif(EXIF_FIXTURE)?.geoPoint).toEqual(EXIF_GEO_POINT);
  });

  it('② 십진 도수(number)', () => {
    expect(
      mediaMetadataFromExif({
        GPSLatitude: 37.5665,
        GPSLatitudeRef: 'N',
        GPSLongitude: 126.978,
        GPSLongitudeRef: 'E',
      })?.geoPoint,
    ).toEqual(EXIF_GEO_POINT);
  });

  it('③ 유리수 문자열과 {numerator,denominator} 객체', () => {
    expect(
      mediaMetadataFromExif({
        GPSLatitude: ['37/1', '33/1', '594/10'],
        GPSLatitudeRef: 'N',
        GPSLongitude: [
          { numerator: 126, denominator: 1 },
          { numerator: 58, denominator: 1 },
          { numerator: 408, denominator: 10 },
        ],
        GPSLongitudeRef: 'E',
      })?.geoPoint,
    ).toEqual(EXIF_GEO_POINT);
  });

  it('Ref가 S·W면 부호가 뒤집힌다 — 소문자·공백도 받는다', () => {
    expect(
      mediaMetadataFromExif({
        GPSLatitude: [37, 33, 59.4],
        GPSLatitudeRef: ' s ',
        GPSLongitude: [126, 58, 40.8],
        GPSLongitudeRef: 'w',
      })?.geoPoint,
    ).toEqual({ latitude: -37.5665, longitude: -126.978 });
  });

  it('플랫폼별 키 변형(gpsLatitude·latitude)도 받는다', () => {
    expect(
      mediaMetadataFromExif({ latitude: 10, LatitudeRef: 'N', longitude: 20, LongitudeRef: 'E' })
        ?.geoPoint,
    ).toEqual({ latitude: 10, longitude: 20 });
  });

  it('범위를 벗어난 좌표는 좌표가 아니라 파싱 실패다', () => {
    expect(
      mediaMetadataFromExif({ GPSLatitude: 91, GPSLongitude: 10, DateTimeOriginal: EXIF_CAPTURED_AT })
        ?.geoPoint,
    ).toBeUndefined();
    expect(
      mediaMetadataFromExif({ GPSLatitude: 10, GPSLongitude: 181, DateTimeOriginal: EXIF_CAPTURED_AT })
        ?.geoPoint,
    ).toBeUndefined();
  });

  it('소수 6자리에서 자른다 — EXIF 정밀도를 넘어선 잡음은 직렬화 비용일 뿐이다', () => {
    expect(
      mediaMetadataFromExif({ GPSLatitude: 1.23456789, GPSLongitude: 2.98765432 })?.geoPoint,
    ).toEqual({ latitude: 1.234568, longitude: 2.987654 });
  });

  it('한쪽 좌표만 있으면 좌표가 없는 것이다', () => {
    expect(mediaMetadataFromExif({ GPSLatitude: 37.5, GPSLatitudeRef: 'N' })).toBeUndefined();
  });
});

describe('mediaMetadataFromExif — 빈 객체 금지', () => {
  it('유효값이 하나도 없으면 undefined다 (truthy한 빈 객체를 주지 않는다)', () => {
    expect(mediaMetadataFromExif({})).toBeUndefined();
    expect(mediaMetadataFromExif({ Make: 'Apple', Model: 'iPhone' })).toBeUndefined();
    expect(mediaMetadataFromExif(null)).toBeUndefined();
    expect(mediaMetadataFromExif(undefined)).toBeUndefined();
  });

  it('한 필드만 유효하면 그 필드만 담긴다', () => {
    expect(mediaMetadataFromExif({ DateTimeOriginal: EXIF_CAPTURED_AT })).toEqual({
      capturedAt: exifCapturedAtIso(),
    });
    expect(mediaMetadataFromExif({ GPSLatitude: 10, GPSLongitude: 20 })).toEqual({
      geoPoint: { latitude: 10, longitude: 20 },
    });
  });
});

// ── mediaMetadataFromJpeg 4규칙 ─────────────────────────────────────────────

/** arrayBuffer() 호출 횟수를 세는 소스 — "파서를 부르지 않았다"의 직접 증거다. */
function countingSource(
  bytes: Uint8Array,
  type?: string,
): BinarySource & { readonly reads: number[] } {
  const reads: number[] = [];
  const inner = createBinarySource(bytes, { name: 'x.jpg', type });
  return {
    reads,
    size: inner.size,
    type: inner.type,
    arrayBuffer() {
      reads.push(1);
      return inner.arrayBuffer();
    },
  };
}

/**
 * IFD0의 **GPS IFD 포인터 태그(0x8825)** 를 미지의 태그로 바꾼 JPEG.
 * 파싱 결과가 `capturedAt`만 갖게 되므로, fallback이 채우는 `geoPoint`와 합쳐지는지를
 * 눈으로 구분할 수 있다 — 규칙 ②(필드 단위 병합)의 **유일한 직접 증거**다.
 */
function jpegWithDateOnly(): Uint8Array {
  const bytes = jpegWithExif();
  const positions: number[] = [];
  for (let index = 0; index + 1 < bytes.length; index += 1) {
    if (bytes[index] === 0x88 && bytes[index + 1] === 0x25) positions.push(index);
  }
  // 픽스처 안에서 GPS 포인터 태그는 정확히 한 번 나온다. 여러 번이면 픽스처가 바뀐 것이므로
  // 이 헬퍼의 전제가 깨진 것 — 조용히 다른 것을 검증하지 않도록 여기서 멈춘다.
  expect(positions).toHaveLength(1);
  const at = positions[0] ?? 0;
  bytes[at] = 0x99;
  bytes[at + 1] = 0x99;
  return bytes;
}

describe('mediaMetadataFromJpeg — 4규칙', () => {
  const fallbackExif = {
    DateTimeOriginal: '2019:09:09 09:09:09',
    GPSLatitude: 10,
    GPSLatitudeRef: 'N',
    GPSLongitude: 20,
    GPSLongitudeRef: 'E',
  } as const;
  const fallbackGeo = { latitude: 10, longitude: 20 };

  it('① 비-JPEG contentType이면 파서를 호출하지 않고 fallback을 그대로 준다', async () => {
    const source = countingSource(jpegWithExif(), 'image/png');
    const result = await mediaMetadataFromJpeg(source, {
      fallbackExif,
      contentType: 'image/png',
    });
    // arrayBuffer 0회 = 바이트를 읽지 않았다 = 파서를 태우지 않았다.
    expect(source.reads).toHaveLength(0);
    expect(result).toEqual({
      capturedAt: new Date(2019, 8, 9, 9, 9, 9).toISOString(),
      geoPoint: fallbackGeo,
    });
  });

  it('① contentType이 없으면 source.type으로 판정한다', async () => {
    const source = countingSource(jpegWithExif(), 'image/jpeg');
    const result = await mediaMetadataFromJpeg(source);
    expect(source.reads).toHaveLength(1);
    expect(result).toEqual({ capturedAt: exifCapturedAtIso(), geoPoint: EXIF_GEO_POINT });
  });

  it('② 필드 단위 병합 — capturedAt은 파싱값, geoPoint는 fallback값', async () => {
    const source = createBinarySource(jpegWithDateOnly(), { name: 'x.jpg', type: 'image/jpeg' });
    const result = await mediaMetadataFromJpeg(source, { fallbackExif });

    // 객체 단위 폴백이면 둘 다 fallback이 되거나 둘 다 파싱값이 된다 — 그 어느 쪽도 아니어야 한다.
    expect(result).toEqual({ capturedAt: exifCapturedAtIso(), geoPoint: fallbackGeo });
    expect(result?.capturedAt).not.toBe(new Date(2019, 8, 9, 9, 9, 9).toISOString());
  });

  it('② 파싱값이 fallback보다 우선한다', async () => {
    const source = createBinarySource(jpegWithExif(), { name: 'x.jpg', type: 'image/jpeg' });
    const result = await mediaMetadataFromJpeg(source, { fallbackExif });
    expect(result).toEqual({ capturedAt: exifCapturedAtIso(), geoPoint: EXIF_GEO_POINT });
  });

  it('③ 손상(잘린) JPEG는 예외 없이 fallback으로 내려간다 — 경계 검사가 살아 있다는 증거', async () => {
    const source = createBinarySource(truncatedJpegWithExif(), {
      name: 'x.jpg',
      type: 'image/jpeg',
    });
    await expect(mediaMetadataFromJpeg(source, { fallbackExif })).resolves.toEqual({
      capturedAt: new Date(2019, 8, 9, 9, 9, 9).toISOString(),
      geoPoint: fallbackGeo,
    });
  });

  it('③ 바이트 읽기 자체가 실패해도 throw하지 않는다 — 메타데이터로 업로드를 죽이지 않는다', async () => {
    const exploding: BinarySource = {
      size: 10,
      type: 'image/jpeg',
      arrayBuffer: () => Promise.reject(new Error('read exploded')),
    };
    await expect(mediaMetadataFromJpeg(exploding, { fallbackExif })).resolves.toEqual({
      capturedAt: new Date(2019, 8, 9, 9, 9, 9).toISOString(),
      geoPoint: fallbackGeo,
    });
  });

  it('④ EXIF 없는 JPEG + fallback 없음 → undefined (빈 객체 금지)', async () => {
    const source = createBinarySource(jpegWithoutExif(), { name: 'x.jpg', type: 'image/jpeg' });
    await expect(mediaMetadataFromJpeg(source)).resolves.toBeUndefined();
  });

  it('④ 비-JPEG + fallback 없음 → undefined', async () => {
    const source = createBinarySource(jpegWithExif(), { name: 'x.bin' });
    await expect(mediaMetadataFromJpeg(source)).resolves.toBeUndefined();
  });
});

describe('JPEG APP1 파서 — 두 경로가 같은 값을 낸다', () => {
  it('dict 경로와 바이트 경로의 결과가 일치한다', async () => {
    const fromBytes = await mediaMetadataFromJpeg(
      createBinarySource(jpegWithExif(), { name: 'x.jpg', type: 'image/jpeg' }),
    );
    expect(fromBytes).toEqual(mediaMetadataFromExif(EXIF_FIXTURE));
  });
});

// TZ 조작이 다른 파일로 새지 않도록 마지막에 원복을 한 번 더 확인한다.
beforeAll(() => {
  expect(process.env['TZ']).toBe(ORIGINAL_TZ);
});
afterAll(() => {
  expect(process.env['TZ']).toBe(ORIGINAL_TZ);
});
