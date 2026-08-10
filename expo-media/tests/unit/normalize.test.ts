// 설계 문서 §5.3 · §7 하드닝 3(크기 결정 3분기) · 하드닝 4(duration 초/밀리초).
//
// 두 함수 모두 순수하지만, 잘못되면 **예외 없이 값만 틀리는** 부류다:
//   · 크기가 어긋나면 서버가 업로드를 거절한다(Android 재인코딩 자산).
//   · duration이 1000배 작으면 20분 영상이 1200ms로 저장돼 **어떤 길이 캡도 통과한다**.

import { describe, expect, it } from 'vitest';
import { resolveUploadSize } from '../../src/core/upload/resolveSize';
import { normalizeDurationMs } from '../../src/core/upload/duration';
import { deviceAssetCapturedAt } from '../../src/core/device/toPickedAsset';

describe('resolveUploadSize — 신뢰도 서열 verified > file-system > reported', () => {
  it('verified가 있으면 나머지를 무시한다', () => {
    expect(
      resolveUploadSize({ verifiedSizeBytes: 10, statSizeBytes: 20, reportedSizeBytes: 30 }),
    ).toEqual({ sizeBytes: 10, source: 'verified' });
  });

  it('verified가 없으면 file-system stat', () => {
    expect(resolveUploadSize({ statSizeBytes: 20, reportedSizeBytes: 30 })).toEqual({
      sizeBytes: 20,
      source: 'file-system',
    });
  });

  it('둘 다 없을 때만 피커 자칭(reported)로 내려간다', () => {
    expect(resolveUploadSize({ reportedSizeBytes: 30 })).toEqual({
      sizeBytes: 30,
      source: 'reported',
    });
  });

  it('전부 부재면 null — 호출자가 sizeUnknown 문구로 실패시킨다', () => {
    expect(resolveUploadSize({})).toBeNull();
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    '%s 는 "값이 없다"와 동일하게 다뤄 다음 후보로 넘긴다',
    (bad) => {
      expect(resolveUploadSize({ verifiedSizeBytes: bad, statSizeBytes: 20 })).toEqual({
        sizeBytes: 20,
        source: 'file-system',
      });
      expect(resolveUploadSize({ verifiedSizeBytes: bad })).toBeNull();
    },
  );
});

describe('normalizeDurationMs — 정규화 지점은 core 한 곳뿐이다', () => {
  it('web은 초 단위이므로 ×1000', () => {
    expect(normalizeDurationMs(20, 'web')).toBe(20_000);
    // 전신 사고 그대로: 20분 영상이 1200ms로 저장되던 값.
    expect(normalizeDurationMs(1200, 'web')).toBe(1_200_000);
  });

  it('네이티브는 이미 밀리초이므로 그대로', () => {
    expect(normalizeDurationMs(20_000, 'ios')).toBe(20_000);
    expect(normalizeDurationMs(20_000, 'android')).toBe(20_000);
  });

  it('소수점 밀리초는 반올림해 서버에 보내지 않는다', () => {
    expect(normalizeDurationMs(1.2345, 'web')).toBe(1235);
    expect(normalizeDurationMs(10.4, 'ios')).toBe(10);
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY, undefined])(
    '%s 는 undefined — 전신의 `duration > 0` 게이트 보존',
    (raw) => {
      expect(normalizeDurationMs(raw, 'ios')).toBeUndefined();
      expect(normalizeDurationMs(raw, 'web')).toBeUndefined();
    },
  );
});

describe('deviceAssetCapturedAt', () => {
  it('creationTime(ms 에폭)을 ISO로 바꾼다', () => {
    expect(deviceAssetCapturedAt({ creationTime: 1_700_000_000_000 })).toBe(
      new Date(1_700_000_000_000).toISOString(),
    );
  });

  it('0·undefined는 null — 에폭 0을 흘리면 서버 타임라인이 1970년으로 끌려간다', () => {
    expect(deviceAssetCapturedAt({ creationTime: 0 })).toBeNull();
    expect(deviceAssetCapturedAt({})).toBeNull();
  });

  it('NaN도 null', () => {
    expect(deviceAssetCapturedAt({ creationTime: Number.NaN })).toBeNull();
  });
});
