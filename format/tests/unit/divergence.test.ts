// 골든 벡터 (B) 의도적 divergence군 — 설계 문서 §0.4 · §5.1.
//
// 여기 있는 행들만이 "소스와 바이트 단위 동일"의 예외다. 각 테스트 이름에 §0.4의 행 번호가
// 들어 있어서, 이관 중 화면이 달라졌을 때 "버그인가 계획된 변경인가"를 표에서 판정할 수 있다.
import { describe, expect, it } from 'vitest';

import {
  formatBytes,
  formatDateOnly,
  formatKrw,
  formatNumber,
  parseIsoInstant,
} from '../../src/index';
import { ADMIN_BYTES, OWNERSHIP_BYTES, OWNERSHIP_BYTES_MIN_MB } from '../recipes';
import { restoreTz, underTz } from '../tz';

describe('§0.4-① number(null) — 소스 "0" → 라이브러리 "-"', () => {
  it('null·undefined는 0으로 승격되지 않는다', () => {
    expect(formatNumber(null, { locale: 'ko-KR' })).toBe('-');
    expect(formatNumber(undefined, { locale: 'ko-KR' })).toBe('-');
    // NaN·Infinity도 같은 값 오류다 — 던지지 않는다
    expect(formatNumber(Number.NaN, { locale: 'ko-KR' })).toBe('-');
    expect(formatNumber(Number.POSITIVE_INFINITY, { locale: 'ko-KR' })).toBe('-');
  });
});

describe('§0.4-② won(null) — 소스 "₩0" → 라이브러리 "-"', () => {
  it('null·undefined는 0원이 아니다', () => {
    expect(formatKrw(null, { style: 'symbol', locale: 'ko-KR' })).toBe('-');
    expect(formatKrw(undefined, { style: 'suffix-ko', locale: 'ko-KR' })).toBe('-');
  });
});

describe('§0.4-③ won(-0) — 소스 "-₩0" → 라이브러리 "₩0"', () => {
  it('-0은 0으로 정규화된다', () => {
    expect(formatKrw(-0, { style: 'symbol', locale: 'ko-KR' })).toBe('₩0');
    expect(formatKrw(-0, { style: 'suffix-ko', locale: 'ko-KR' })).toBe('0원');
    // 반올림 결과가 0이 되는 음수도 같은 규칙을 탄다
    expect(formatKrw(-0.4, { style: 'symbol', locale: 'ko-KR' })).toBe('₩0');
  });
});

describe('§0.4-④ bytes(null) — 소스 "0 B" → 라이브러리 "-"', () => {
  it('null은 폴백, 음수는 변경 아님', () => {
    expect(formatBytes(null, ADMIN_BYTES)).toBe('-');
    expect(formatBytes(undefined, ADMIN_BYTES)).toBe('-');
    expect(formatBytes(Number.NaN, ADMIN_BYTES)).toBe('-');
    // `bytes(-5)` → `'-5 B'`는 변경이 아니다 (nonPositive:'render'로 재현)
    expect(formatBytes(-5, ADMIN_BYTES)).toBe('-5 B');
  });
});

describe('§0.4-⑤ 날짜 문자열 — parseIsoInstant를 통과해야 한다', () => {
  // 포매터가 문자열을 받지 않는다는 사실 자체는 타입 테스트(§4-7b)가 고정한다.
  // 여기서는 두 assumeNoOffset 선택이 실제로 다른 인스턴트를 만든다는 것을 고정한다.
  it("'utc'와 'device'가 같은 문자열을 다른 인스턴트로 읽는다 (TZ가 UTC가 아닐 때)", () => {
    try {
      underTz('Asia/Seoul', () => {
        const utc = parseIsoInstant('2026-06-08T09:05:00', { assumeNoOffset: 'utc' });
        const device = parseIsoInstant('2026-06-08T09:05:00', { assumeNoOffset: 'device' });
        expect(utc?.getTime()).toBe(Date.UTC(2026, 5, 8, 9, 5, 0));
        expect(device?.getTime()).toBe(Date.UTC(2026, 5, 8, 0, 5, 0));
      });
    } finally {
      restoreTz();
    }
  });

  it("'reject'는 null — 호출부가 폴백을 렌더한다", () => {
    expect(parseIsoInstant('2026-06-08T09:05:00', { assumeNoOffset: 'reject' })).toBeNull();
    // offset이 있으면 'reject'여도 파싱된다 — 애매하지 않기 때문이다
    expect(
      parseIsoInstant('2026-06-08T09:05:00Z', { assumeNoOffset: 'reject' })?.getTime(),
    ).toBe(Date.UTC(2026, 5, 8, 9, 5, 0));
  });
});

describe('§0.4-⑦ formatCurrency(1000.5) — 소스 "1,000.5원" → 라이브러리 "1,001원"', () => {
  it('KRW에 minor unit이 없으므로 정수 원으로 정규화된다', () => {
    expect(formatKrw(1000.5, { style: 'suffix-ko', locale: 'ko-KR' })).toBe('1,001원');
    expect(formatKrw(1000.4, { style: 'suffix-ko', locale: 'ko-KR' })).toBe('1,000원');
  });
});

describe('§0.4-⑧⑨ #20 소유권 이전 다이얼로그 — KB 스킵과 ceil이 사라진다', () => {
  it('⑧ formatBytes(500_000) — 소스 "500000B" → 라이브러리 "500KB"', () => {
    expect(formatBytes(500_000, OWNERSHIP_BYTES)).toBe('500KB');
  });

  it('⑨ formatBytes(1_200_000) — 소스 "2MB"(ceil) → 라이브러리 "1MB"(round)', () => {
    expect(formatBytes(1_200_000, OWNERSHIP_BYTES)).toBe('1MB');
  });

  it('§0.2가 적은 minUnit:"MB" 파라미터는 "0MB"가 아니라 "1MB"를 낸다', () => {
    // 문서의 두 서술이 어긋나는 지점을 기대값으로 남긴다: 0.5MB는 반올림돼 1이 된다.
    expect(formatBytes(500_000, OWNERSHIP_BYTES_MIN_MB)).toBe('1MB');
    expect(formatBytes(1_200_000, OWNERSHIP_BYTES_MIN_MB)).toBe('1MB');
  });
});

describe('§0.4-⑩ 연도 1–9999 밖은 fallback', () => {
  const options = { timeZone: 'UTC', separator: '-' } as const;
  const at = (iso: string): Date | null => parseIsoInstant(iso, { assumeNoOffset: 'utc' });

  it('지원 범위 안은 렌더된다 — 연도는 패딩하지 않는다', () => {
    expect(formatDateOnly(at('0001-07-08T14:00:00Z'), options)).toBe('1-07-08');
    expect(formatDateOnly(at('9999-06-08T01:02:00Z'), options)).toBe('9999-06-08');
  });

  it('지원 인스턴트 범위 밖은 폴백 — 던지지 않는다', () => {
    // 서기 1년 1월 1일 14:00Z보다 이른 인스턴트는 어떤 지원 시간대에서도 연도 0에 닿는다.
    expect(formatDateOnly(at('0001-01-01T13:59:59Z'), options)).toBe('-');
    expect(formatDateOnly(Date.UTC(10000, 0, 1, 0, 0, 0), options)).toBe('-');
    expect(formatDateOnly(-8.64e15, options)).toBe('-');
    expect(formatDateOnly(Number.NaN, options)).toBe('-');
  });
});
