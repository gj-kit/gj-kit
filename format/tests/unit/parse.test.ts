// parseIsoInstant 문법 수용/거부 전수 — 설계 문서 §3.2 · §5.1.
//
// 이 파서의 존재 이유는 엔진 편차 제거다. 그래서 검증도 "엔진이 뭘 하든 우리는 이 값"이라는
// 형태로 쓴다: 기대값은 전부 `Date.UTC` 산술로 직접 계산한 인스턴트다.
import { describe, expect, it } from 'vitest';

import { parseIsoInstant } from '../../src/index';
import { restoreTz, underTz } from '../tz';

const utc = { assumeNoOffset: 'utc' } as const;
const device = { assumeNoOffset: 'device' } as const;
const reject = { assumeNoOffset: 'reject' } as const;

describe('수용 문법', () => {
  it.each([
    ['2026-06-08', Date.UTC(2026, 5, 8, 0, 0, 0, 0)],
    ['2026-06-08T09:05', Date.UTC(2026, 5, 8, 9, 5, 0, 0)],
    ['2026-06-08 09:05', Date.UTC(2026, 5, 8, 9, 5, 0, 0)],
    ['2026-06-08T09:05:07', Date.UTC(2026, 5, 8, 9, 5, 7, 0)],
    ['2026-06-08T09:05:07.123', Date.UTC(2026, 5, 8, 9, 5, 7, 123)],
    ['2026-06-08T09:05:07.1', Date.UTC(2026, 5, 8, 9, 5, 7, 100)],
    ['2026-06-08T09:05:07.123456', Date.UTC(2026, 5, 8, 9, 5, 7, 123)],
    ['2026-06-08T09:05:00Z', Date.UTC(2026, 5, 8, 9, 5, 0, 0)],
    ['2026-06-08T09:05:00z', Date.UTC(2026, 5, 8, 9, 5, 0, 0)],
    ['2026-06-08T09:05:00+09:00', Date.UTC(2026, 5, 8, 0, 5, 0, 0)],
    ['2026-06-08T09:05:00+0900', Date.UTC(2026, 5, 8, 0, 5, 0, 0)],
    ['2026-06-08T09:05:00-05:00', Date.UTC(2026, 5, 8, 14, 5, 0, 0)],
    ['2026-06-08T09:05:00-0530', Date.UTC(2026, 5, 8, 14, 35, 0, 0)],
    ['2024-02-29T00:00:00Z', Date.UTC(2024, 1, 29, 0, 0, 0, 0)],
  ])('%s', (input, expected) => {
    expect(parseIsoInstant(input, utc)?.getTime()).toBe(expected);
  });

  it('연도 1–9999 경계', () => {
    expect(parseIsoInstant('0001-01-01', utc)?.getUTCFullYear()).toBe(1);
    expect(parseIsoInstant('0099-06-08', utc)?.getUTCFullYear()).toBe(99);
    expect(parseIsoInstant('9999-12-31', utc)?.getUTCFullYear()).toBe(9999);
  });
});

describe('거부 문법 — 전부 null, 절대 throw하지 않는다', () => {
  it.each([
    null,
    undefined,
    '',
    ' ',
    'not-a-date',
    '2026/06/08',
    'Sun, 08 Jun 2026 09:05:00 GMT',
    '2026-6-8',
    '2026-06-08T9:05',
    '2026-02-30',
    '2026-13-01',
    '2026-00-10',
    '2026-06-00',
    '2023-02-29',
    '0000-01-01',
    '10000-01-01',
    '2026-06-08T24:00:00Z',
    '2026-06-08T09:60:00Z',
    '2026-06-08T09:05:60Z',
    '2026-06-08T09:05:00+24:00',
    '2026-06-08T09:05:00+09:60',
    '2026-06-08T09:05:00 ',
    ' 2026-06-08',
  ])('%s → null', (input) => {
    expect(parseIsoInstant(input, utc)).toBeNull();
    expect(parseIsoInstant(input, device)).toBeNull();
    expect(parseIsoInstant(input, reject)).toBeNull();
  });
});

describe('assumeNoOffset 3값', () => {
  it("date-only는 세 값 모두 UTC 자정 — 애매하지 않으므로 옵션의 영향을 받지 않는다", () => {
    const expected = Date.UTC(2026, 5, 8, 0, 0, 0, 0);
    expect(parseIsoInstant('2026-06-08', utc)?.getTime()).toBe(expected);
    expect(parseIsoInstant('2026-06-08', device)?.getTime()).toBe(expected);
    expect(parseIsoInstant('2026-06-08', reject)?.getTime()).toBe(expected);
  });

  it('offset이 명시되면 세 값 모두 같은 인스턴트', () => {
    const expected = Date.UTC(2026, 5, 8, 0, 5, 0, 0);
    expect(parseIsoInstant('2026-06-08T09:05:00+09:00', utc)?.getTime()).toBe(expected);
    expect(parseIsoInstant('2026-06-08T09:05:00+09:00', device)?.getTime()).toBe(expected);
    expect(parseIsoInstant('2026-06-08T09:05:00+09:00', reject)?.getTime()).toBe(expected);
  });

  it("offset이 없으면 'utc'는 UTC 벽시계, 'reject'는 null", () => {
    expect(parseIsoInstant('2026-06-08T09:05:00', utc)?.getTime()).toBe(
      Date.UTC(2026, 5, 8, 9, 5, 0, 0),
    );
    expect(parseIsoInstant('2026-06-08T09:05:00', reject)).toBeNull();
  });

  it("'device'는 기기 시간대로 읽는다 — TZ를 바꾸면 인스턴트가 달라진다", () => {
    try {
      const seoul = underTz('Asia/Seoul', () =>
        parseIsoInstant('2026-06-08T09:05:00', device)?.getTime(),
      );
      const newYork = underTz('America/New_York', () =>
        parseIsoInstant('2026-06-08T09:05:00', device)?.getTime(),
      );
      expect(seoul).toBe(Date.UTC(2026, 5, 8, 0, 5, 0, 0));
      expect(newYork).toBe(Date.UTC(2026, 5, 8, 13, 5, 0, 0));
    } finally {
      restoreTz();
    }
  });
});
