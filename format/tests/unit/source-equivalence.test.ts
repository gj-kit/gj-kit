// 골든 벡터 (A) 소스 동치군 — 설계 문서 §5.1.
//
// §0.1(export 19종)·§0.2(비-export 2종)의 재현 파라미터로 호출했을 때, memorylog2
// admin/mobile 구현이 실제로 내던 문자열과 **바이트 단위로 같은** 출력이 나오는지를 고정한다.
// 기대값은 세 소스 파일을 그대로 옮겨 Node로 재실행해 얻은 것이다(설계 §부록 [실측 F][실측 G]).
//
// §0.4 변경표에 오르는 케이스는 여기가 아니라 divergence.test.ts에 있다 — 두 군을 갈라야
// 구현자가 "소스 동일"과 "의도된 변경" 중 무엇이 기대값인지 표에서 판정할 수 있다.
import { describe, expect, it } from 'vitest';

import {
  formatBytes,
  formatDateOnly,
  formatDateTime,
  formatDurationKo,
  formatKrw,
  formatMonthDayTime,
  formatNumber,
  formatRelativeKo,
  formatText,
  parseIsoInstant,
  storageRatio,
} from '../../src/index';
import {
  ADMIN_BYTES,
  MOBILE_BYTES,
  MOBILE_STORAGE_BYTES,
  OWNERSHIP_BYTES,
} from '../recipes';

describe('§0.1 #1 admin text → formatText', () => {
  it('빈 값 3종만 대시로 바뀐다', () => {
    expect(formatText(null)).toBe('-');
    expect(formatText(undefined)).toBe('-');
    expect(formatText('')).toBe('-');
    expect(formatText(0)).toBe('0');
    expect(formatText('hello')).toBe('hello');
    expect(formatText(1234)).toBe('1234');
  });
});

describe('§0.1 #2 admin number → formatNumber + locale ko-KR', () => {
  it.each([
    [0, '0'],
    [1000, '1,000'],
    [1234567, '1,234,567'],
    [-1000, '-1,000'],
    [1000.5, '1,000.5'],
    [12345.678, '12,345.678'],
  ])('number(%s) === %s', (value, expected) => {
    expect(formatNumber(value, { locale: 'ko-KR' })).toBe(expected);
  });
});

describe('§0.1 #3 admin won → formatKrw symbol/ko-KR', () => {
  it.each([
    [0, '₩0'],
    [1000, '₩1,000'],
    [1234567, '₩1,234,567'],
    [-1000, '-₩1,000'],
    [1000.5, '₩1,001'],
    [2.5, '₩3'],
    [-2.5, '-₩3'],
  ])('won(%s) === %s', (value, expected) => {
    expect(formatKrw(value, { style: 'symbol', locale: 'ko-KR' })).toBe(expected);
  });
});

describe('§0.1 #4 admin bytes → formatBytes', () => {
  it.each([
    [0, '0 B'],
    [-5, '-5 B'],
    [-5000, '-5000 B'],
    [999, '999 B'],
    [1000, '1.0 KB'],
    [1023, '1.0 KB'],
    [1024, '1.0 KB'],
    [250_500_000, '250.5 MB'],
    [1_500_000_000, '1.5 GB'],
    // 반올림 승격 경계 — 단위 재승격을 하지 않는다는 §3.7-1 계약의 실물
    [999_950, '1000.0 KB'],
    [999_999, '1000.0 KB'],
    [1_023_999, '1.0 MB'],
    // maxUnit 상한 — PB 위로 올라가지 않는다
    [1e18, '1000.0 PB'],
  ])('bytes(%s) === %s', (value, expected) => {
    expect(formatBytes(value, ADMIN_BYTES)).toBe(expected);
  });
});

describe('§0.1 #5 admin storageRatio', () => {
  it('한도가 없거나 0이면 null, 있으면 1로 clamp된 비율', () => {
    expect(storageRatio(null, null)).toBeNull();
    expect(storageRatio(500, 0)).toBeNull();
    expect(storageRatio(500, -1)).toBeNull();
    expect(storageRatio(500, 1000)).toBe(0.5);
    expect(storageRatio(2000, 1000)).toBe(1);
    expect(storageRatio(null, 1000)).toBe(0);
    // NaN이 0으로 coerce되던 소스 동작을 그대로 유지한다
    expect(storageRatio(Number.NaN, 1000)).toBe(0);
    expect(storageRatio(500, Number.NaN)).toBeNull();
  });
});

describe('§0.1 #8·#9·#10 admin date/dateOnly/dateShort (로컬 = device)', () => {
  // admin은 `new Date(String(v))` → offset 없는 문자열을 기기 시간대로 읽었다.
  // 그 동작의 라이브러리 표현이 parseIsoInstant(assumeNoOffset:'device')다(§0.4-⑤).
  const parsed = parseIsoInstant('2026-06-08T09:05:00', { assumeNoOffset: 'device' });

  it('세 함수가 소스와 같은 고정폭 문자열을 만든다', () => {
    expect(formatDateTime(parsed, { timeZone: 'device', separator: '-' })).toBe(
      '2026-06-08 09:05',
    );
    expect(formatDateOnly(parsed, { timeZone: 'device', separator: '-' })).toBe('2026-06-08');
    expect(formatMonthDayTime(parsed, { timeZone: 'device', separator: '-' })).toBe(
      '06-08 09:05',
    );
  });

  it('빈 값과 invalid 입력은 대시', () => {
    expect(formatDateTime(null, { timeZone: 'device', separator: '-' })).toBe('-');
    expect(formatDateOnly(undefined, { timeZone: 'device', separator: '-' })).toBe('-');
    expect(
      formatDateTime(parseIsoInstant('not-a-date', { assumeNoOffset: 'device' }), {
        timeZone: 'device',
        separator: '-',
      }),
    ).toBe('-');
  });
});

describe('§0.1 #11 admin relative → formatRelativeKo (공백 있음 · 미래는 빈 문자열)', () => {
  const now = new Date('2026-06-08T11:24:43Z');
  const ago = (ms: number): Date => new Date(now.getTime() - ms);
  const admin = { now, suffixSpace: true, fallback: '', onFuture: 'empty' } as const;

  it.each([
    [30_000, '방금'],
    [5 * 60_000, '5분 전'],
    [3 * 3_600_000, '3시간 전'],
    [26 * 3_600_000, '1일 전'],
    [4 * 86_400_000, '4일 전'],
    [40 * 86_400_000, '1개월 전'],
    [400 * 86_400_000, '1년 전'],
  ])('%s ms 전 === %s', (elapsed, expected) => {
    expect(formatRelativeKo(ago(elapsed), admin)).toBe(expected);
  });

  it('미래·빈 값은 빈 문자열', () => {
    expect(formatRelativeKo(new Date(now.getTime() + 60_000), admin)).toBe('');
    expect(formatRelativeKo(null, admin)).toBe('');
  });
});

describe('§0.1 #12 admin duration → formatDurationKo(endMs - startMs)', () => {
  it.each([
    [800, '0.8초'],
    [59_900, '59.9초'],
    [60_000, '1분'],
    [90_000, '2분'],
    [3_600_000, '1.0시간'],
    [5_400_000, '1.5시간'],
  ])('duration(%s ms) === %s', (ms, expected) => {
    expect(formatDurationKo(ms)).toBe(expected);
  });

  it('음수·비유한값은 대시', () => {
    expect(formatDurationKo(-1)).toBe('-');
    expect(formatDurationKo(Number.NaN)).toBe('-');
    expect(formatDurationKo(Number.POSITIVE_INFINITY)).toBe('-');
  });
});

describe('§0.1 #13 mobile formatStorageBytes → 단위별 반올림', () => {
  it.each([
    [0, '0MB'],
    [1, '0MB'],
    [500_000, '1MB'],
    [250_500_000, '251MB'],
    [1_000_000_000, '1GB'],
    // trim vs trim-exact를 가르는 케이스 — 1.04GB는 '1GB'가 아니라 '1.0GB'다
    [1_040_000_000, '1.0GB'],
    [1_500_000_000, '1.5GB'],
    [1e12, '1TB'],
    [1.5e12, '1.5TB'],
    [1e15, '1000TB'],
  ])('formatStorageBytes(%s) === %s', (value, expected) => {
    expect(formatBytes(value, MOBILE_STORAGE_BYTES)).toBe(expected);
  });
});

describe('§0.1 #14 mobile formatBytes → 0 이하는 null 패스스루', () => {
  it.each([
    [1, '1B'],
    [999, '999B'],
    [1000, '1KB'],
    [1023, '1KB'],
    [1024, '1KB'],
    [999_950, '1000KB'],
    [999_999, '1000KB'],
    [1_023_999, '1MB'],
    [12_345_678, '12MB'],
    [1_500_000_000, '1.5GB'],
  ])('formatBytes(%s) === %s', (value, expected) => {
    expect(formatBytes(value, MOBILE_BYTES)).toBe(expected);
  });

  it('0·음수·null은 null — 칩이 사라지던 동작 그대로', () => {
    expect(formatBytes(0, MOBILE_BYTES)).toBeNull();
    expect(formatBytes(-1, MOBILE_BYTES)).toBeNull();
    expect(formatBytes(null, MOBILE_BYTES)).toBeNull();
    expect(formatBytes(undefined, MOBILE_BYTES)).toBeNull();
  });
});

describe('§0.1 #15 mobile formatCurrency → formatKrw suffix-ko', () => {
  it.each([
    [0, '0원'],
    [1000, '1,000원'],
    [1234567, '1,234,567원'],
    [-1000, '-1,000원'],
  ])('formatCurrency(%s) === %s', (value, expected) => {
    expect(formatKrw(value, { style: 'suffix-ko', locale: 'en-US' })).toBe(expected);
  });
});

describe('§0.1 #16 mobile formatUtcDate → timeZone UTC', () => {
  const parsed = parseIsoInstant('2026-06-05T00:00:00.000Z', { assumeNoOffset: 'utc' });

  it('구분자·시각 유무 조합이 소스와 같다', () => {
    expect(formatDateOnly(parsed, { timeZone: 'UTC', separator: '-' })).toBe('2026-06-05');
    expect(formatDateOnly(parsed, { timeZone: 'UTC', separator: '.' })).toBe('2026.06.05');
    expect(formatDateTime(parsed, { timeZone: 'UTC', separator: '-' })).toBe('2026-06-05 00:00');
  });

  it('제네릭 fallback 계약이 유지된다', () => {
    expect(formatDateOnly(null, { timeZone: 'UTC', separator: '-', fallback: null })).toBeNull();
  });
});

describe('§0.1 #17·#18 mobile formatKoreanDate/DateTime — 실제 앱 테스트의 기대값', () => {
  // apps/mobile/src/utils/datetime.test.ts가 고정하고 있는 문자열 그대로다.
  it('formatKoreanDate("2026-06-08T11:24:43") === "2026.06.08"', () => {
    const parsed = parseIsoInstant('2026-06-08T11:24:43', { assumeNoOffset: 'device' });
    expect(formatDateOnly(parsed, { timeZone: 'device', separator: '.' })).toBe('2026.06.08');
  });

  it('formatKoreanDateTime("2026-06-08T09:05:00") === "2026.06.08 09:05"', () => {
    const parsed = parseIsoInstant('2026-06-08T09:05:00', { assumeNoOffset: 'device' });
    expect(formatDateTime(parsed, { timeZone: 'device', separator: '.' })).toBe(
      '2026.06.08 09:05',
    );
  });

  it('invalid 입력은 대시', () => {
    const parsed = parseIsoInstant('not-a-date', { assumeNoOffset: 'device' });
    expect(formatDateOnly(parsed, { timeZone: 'device', separator: '.' })).toBe('-');
  });
});

describe('§0.1 #19 mobile formatRelativeTime — 실제 앱 테스트의 기대값', () => {
  // apps/mobile/src/utils/datetime.test.ts의 now와 기대 문자열을 그대로 옮겼다.
  // 소스의 now는 `new Date("2026-06-08T11:24:43")`(offset 없음 = 기기 시간대)이지만,
  // 이 테스트가 고정하는 값은 전부 now와의 **차이**라서 기기 시간대와 무관하다 —
  // 다만 절대 폴백 두 건은 device 렌더이므로 now도 device 기준으로 만든다.
  const now = parseIsoInstant('2026-06-08T11:24:43', { assumeNoOffset: 'device' }) as Date;
  const ago = (ms: number): Date => new Date(now.getTime() - ms);
  const mobile = {
    now,
    suffixSpace: false,
    fallback: '-',
    justNowLabel: '방금 전',
    yesterdayLabel: '어제',
    maxDays: 7,
    onFuture: (date: Date): string =>
      formatDateTime(date, { timeZone: 'device', separator: '.' }),
    onOverflow: (date: Date): string =>
      formatDateOnly(date, { timeZone: 'device', separator: '.' }),
  } as const;

  it.each([
    [30 * 1000, '방금 전'],
    [5 * 60 * 1000, '5분전'],
    [3 * 60 * 60 * 1000, '3시간전'],
    [26 * 60 * 60 * 1000, '어제'],
    [4 * 24 * 60 * 60 * 1000, '4일전'],
  ])('%s ms 전 === %s', (elapsed, expected) => {
    expect(formatRelativeKo(ago(elapsed), mobile)).toBe(expected);
  });

  it('7일을 넘으면 절대 날짜 — "2026.05.29"', () => {
    expect(formatRelativeKo(ago(10 * 24 * 60 * 60 * 1000), mobile)).toBe('2026.05.29');
  });

  it('미래는 절대 시각 — "2026.06.08 12:24"', () => {
    expect(formatRelativeKo(new Date(now.getTime() + 60 * 60 * 1000), mobile)).toBe(
      '2026.06.08 12:24',
    );
  });

  it('invalid 입력은 "-"', () => {
    expect(formatRelativeKo(null, mobile)).toBe('-');
  });
});

describe('§0.2 #20 OwnershipTransferRequest — 1MB 이상은 소스와 동일', () => {
  it.each([
    [1_000_000, '1MB'],
    [1_040_000_000, '1.0GB'],
    [2_000_000_000, '2GB'],
  ])('formatBytes(%s) === %s', (value, expected) => {
    expect(formatBytes(value, OWNERSHIP_BYTES)).toBe(expected);
  });
});
