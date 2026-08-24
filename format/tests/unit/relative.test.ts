// 상대시간 버킷 경계와 카피 축 — 설계 문서 §3.5 · §5.1 · §7-6.
import { describe, expect, it } from 'vitest';

import { formatRelativeKo, relativeBucket } from '../../src/index';
import type { FormatRelativeBucket } from '../../src/index';

const NOW = new Date('2026-06-08T11:24:43.000Z');
const ago = (ms: number): Date => new Date(NOW.getTime() - ms);

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

describe('relativeBucket 임계값', () => {
  it.each<[string, number, FormatRelativeBucket]>([
    ['59s', 59 * SECOND, { kind: 'just-now', seconds: 59 }],
    ['60s', 60 * SECOND, { kind: 'minutes', count: 1 }],
    ['59m', 59 * MINUTE, { kind: 'minutes', count: 59 }],
    ['60m', 60 * MINUTE, { kind: 'hours', count: 1 }],
    ['23h', 23 * HOUR, { kind: 'hours', count: 23 }],
    ['24h', 24 * HOUR, { kind: 'days', count: 1 }],
    ['29d', 29 * DAY, { kind: 'days', count: 29 }],
    ['30d', 30 * DAY, { kind: 'months', count: 1 }],
    ['359d', 359 * DAY, { kind: 'months', count: 11 }],
    ['360d', 360 * DAY, { kind: 'years', count: 1 }],
  ])('%s', (_label, elapsed, expected) => {
    expect(relativeBucket(ago(elapsed), NOW)).toEqual(expected);
  });

  it('미래는 ±1ms에서 갈린다', () => {
    expect(relativeBucket(new Date(NOW.getTime()), NOW)).toEqual({ kind: 'just-now', seconds: 0 });
    expect(relativeBucket(new Date(NOW.getTime() + 1), NOW)).toEqual({ kind: 'future', ms: 1 });
  });

  it('§7-6 — 1년 = 360일 근사를 기대값으로 고정한다', () => {
    // 달력 인지가 아니다. 소스 앱 둘 다 이 근사를 썼고, 골든 일치가 우선 계약이다.
    expect(relativeBucket(ago(360 * DAY), NOW)).toEqual({ kind: 'years', count: 1 });
    expect(relativeBucket(ago(3600 * DAY), NOW)).toEqual({ kind: 'years', count: 10 });
  });

  it('값 오류는 null', () => {
    expect(relativeBucket(null, NOW)).toBeNull();
    expect(relativeBucket(undefined, NOW)).toBeNull();
    expect(relativeBucket(new Date('nope'), NOW)).toBeNull();
    expect(relativeBucket(Number.NaN, NOW)).toBeNull();
    expect(relativeBucket(NOW, new Date('nope'))).toBeNull();
  });
});

describe('suffixSpace — 두 앱이 갈라진 축', () => {
  const base = { now: NOW, fallback: '-', onFuture: 'empty' } as const;

  it('true는 공백 있음, false는 무공백', () => {
    expect(formatRelativeKo(ago(3 * MINUTE), { ...base, suffixSpace: true })).toBe('3분 전');
    expect(formatRelativeKo(ago(3 * MINUTE), { ...base, suffixSpace: false })).toBe('3분전');
    expect(formatRelativeKo(ago(3 * HOUR), { ...base, suffixSpace: true })).toBe('3시간 전');
    expect(formatRelativeKo(ago(3 * DAY), { ...base, suffixSpace: false })).toBe('3일전');
    expect(formatRelativeKo(ago(60 * DAY), { ...base, suffixSpace: true })).toBe('2개월 전');
    expect(formatRelativeKo(ago(800 * DAY), { ...base, suffixSpace: true })).toBe('2년 전');
  });
});

describe('카피 옵션 — 라이브러리는 제품 결정을 기본값으로 승격하지 않는다', () => {
  const base = { now: NOW, suffixSpace: false, fallback: '-', onFuture: 'empty' } as const;

  it('justNowLabel 기본값은 "방금"이다', () => {
    expect(formatRelativeKo(ago(30 * SECOND), base)).toBe('방금');
    expect(formatRelativeKo(ago(30 * SECOND), { ...base, justNowLabel: '방금 전' })).toBe('방금 전');
  });

  it('yesterdayLabel은 1일 버킷에서만 쓰인다', () => {
    expect(formatRelativeKo(ago(26 * HOUR), base)).toBe('1일전');
    expect(formatRelativeKo(ago(26 * HOUR), { ...base, yesterdayLabel: '어제' })).toBe('어제');
    expect(formatRelativeKo(ago(50 * HOUR), { ...base, yesterdayLabel: '어제' })).toBe('2일전');
  });
});

describe('maxDays / onOverflow — 쌍으로만 존재한다', () => {
  const overflow = { now: NOW, suffixSpace: false, fallback: '-', onFuture: 'empty' } as const;

  it('정확히 그 날부터 onOverflow로 넘어간다', () => {
    const options = {
      ...overflow,
      maxDays: 7,
      onOverflow: (date: Date): string => `ABS:${date.toISOString().slice(0, 10)}`,
    };
    expect(formatRelativeKo(ago(7 * DAY - 1), options)).toBe('6일전');
    expect(formatRelativeKo(ago(7 * DAY), options)).toBe('ABS:2026-06-01');
    expect(formatRelativeKo(ago(400 * DAY), options)).toBe('ABS:2025-05-04');
  });
});

describe('onFuture — 두 앱이 갈라진 축', () => {
  const base = { now: NOW, suffixSpace: false, fallback: '-' } as const;

  it("'empty'는 빈 문자열", () => {
    expect(formatRelativeKo(new Date(NOW.getTime() + HOUR), { ...base, onFuture: 'empty' })).toBe('');
  });

  it('함수는 절대 표기를 만든다', () => {
    expect(
      formatRelativeKo(new Date(NOW.getTime() + HOUR), {
        ...base,
        onFuture: (date: Date): string => `FUT:${date.toISOString()}`,
      }),
    ).toBe('FUT:2026-06-08T12:24:43.000Z');
  });
});

describe('fallback — 필수 축', () => {
  it('두 앱의 서로 다른 빈 셀 표기가 전부 표현된다', () => {
    const admin = { now: NOW, suffixSpace: true, fallback: '', onFuture: 'empty' } as const;
    const mobile = { now: NOW, suffixSpace: false, fallback: '-', onFuture: 'empty' } as const;
    expect(formatRelativeKo(null, admin)).toBe('');
    expect(formatRelativeKo(null, mobile)).toBe('-');
    expect(formatRelativeKo(new Date('nope'), mobile)).toBe('-');
  });
});

describe('결정성 — 시계를 몰래 읽지 않는다', () => {
  it('같은 인자를 두 번 넣으면 같은 문자열', () => {
    const options = { now: NOW, suffixSpace: true, fallback: '', onFuture: 'empty' } as const;
    const first = formatRelativeKo(ago(5 * MINUTE), options);
    const second = formatRelativeKo(ago(5 * MINUTE), options);
    expect(first).toBe(second);
    expect(first).toBe('5분 전');
  });
});
