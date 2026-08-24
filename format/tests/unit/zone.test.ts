// Intl 자기검사와 에러 3분류 — 설계 문서 §1-3 · §3.3 · §3.4 구현 각서 ③ · §5.1.
//
// 핵심 주장: 자기검사가 **모양이 아니라 값**을 본다. `/^\d+$/`만 보는 검사는 이 패키지가
// 막으려는 실패(엔진이 `timeZone`을 무시하고 기기 wall clock을 돌려주는 것)를 구조적으로
// 통과시킨다 — 출력이 여전히 순수 숫자이기 때문이다. 아래 가짜 엔진 3종이 그 구분을 고정한다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { canFormatTimeZone, formatDateTime, isFormatError } from '../../src/index';
import { resetZoneCachesForTests } from '../../src/zone';

const REAL_DTF = Intl.DateTimeFormat;
const PROBE = Date.UTC(2021, 0, 1, 0, 0, 0);

type Fields = { year: number; month: number; day: number; hour: number; minute: number };

/** 오프셋 분을 적용한 wall clock — 가짜 엔진들이 공유하는 계산. */
function shifted(epochMs: number, offsetMinutes: number): Fields {
  const shiftedDate = new Date(epochMs + offsetMinutes * 60_000);
  return {
    year: shiftedDate.getUTCFullYear(),
    month: shiftedDate.getUTCMonth() + 1,
    day: shiftedDate.getUTCDate(),
    hour: shiftedDate.getUTCHours(),
    minute: shiftedDate.getUTCMinutes(),
  };
}

function requestedField(options: Intl.DateTimeFormatOptions): keyof Fields {
  if (options.year !== undefined) return 'year';
  if (options.month !== undefined) return 'month';
  if (options.day !== undefined) return 'day';
  if (options.hour !== undefined) return 'hour';
  return 'minute';
}

interface FakeSpec {
  /** 존 이름 → 오프셋 분. `null`이면 생성자가 RangeError를 던진다. */
  readonly offsetFor: (timeZone: string) => number | null;
  /** 필드 값을 문자열로 바꾸는 훅 — 12시간제·비숫자 출력을 흉내낸다.
   *  `undefined`를 돌려주면 기본(정상) 렌더가 쓰인다. */
  readonly renderField?: (field: keyof Fields, value: number) => string | undefined;
}

function installFake(spec: FakeSpec): { readonly constructions: () => number } {
  let constructions = 0;

  class FakeDateTimeFormat {
    private readonly options: Intl.DateTimeFormatOptions;
    private readonly offsetMinutes: number;

    constructor(_locales?: unknown, options: Intl.DateTimeFormatOptions = {}) {
      constructions += 1;
      this.options = options;
      const offset = spec.offsetFor(String(options.timeZone ?? ''));
      if (offset === null) throw new RangeError(`Invalid time zone: ${String(options.timeZone)}`);
      this.offsetMinutes = offset;
    }

    format(value?: Date | number): string {
      const epochMs = typeof value === 'number' ? value : (value?.getTime() ?? 0);
      const field = requestedField(this.options);
      const raw = shifted(epochMs, this.offsetMinutes)[field];
      const rendered = spec.renderField?.(field, raw);
      if (rendered !== undefined) return rendered;
      return field === 'year' ? String(raw) : String(raw).padStart(2, '0');
    }
  }

  // `Intl`의 프로퍼티는 열거 불가라 스프레드로는 복사되지 않는다 — 필요한 두 개만 명시한다.
  vi.stubGlobal('Intl', {
    NumberFormat: Intl.NumberFormat,
    DateTimeFormat: FakeDateTimeFormat,
  } as unknown as typeof Intl);
  return { constructions: () => constructions };
}

beforeEach(() => {
  resetZoneCachesForTests();
});

afterEach(() => {
  vi.unstubAllGlobals();
  resetZoneCachesForTests();
  expect(Intl.DateTimeFormat).toBe(REAL_DTF);
});

describe("'UTC'와 'device'는 Intl을 전혀 호출하지 않는다", () => {
  it('가짜 엔진을 깔아 놔도 두 토큰 경로는 영향받지 않는다', () => {
    const fake = installFake({ offsetFor: () => 9 * 60 });
    expect(canFormatTimeZone('UTC')).toBe(true);
    expect(canFormatTimeZone('device')).toBe(true);
    expect(formatDateTime(PROBE, { timeZone: 'UTC', separator: '-' })).toBe('2021-01-01 00:00');
    expect(fake.constructions()).toBe(0);
  });
});

describe('설정 오류 — 잘못된 IANA 이름', () => {
  it('ERR_TIMEZONE_INVALID로 즉시 throw하고 isFormatError가 참이다', () => {
    let thrown: unknown;
    try {
      formatDateTime(PROBE, { timeZone: 'Asia/Seoul ', separator: '-' });
    } catch (error) {
      thrown = error;
    }
    expect(isFormatError(thrown)).toBe(true);
    if (!isFormatError(thrown)) throw new Error('unreachable');
    expect(thrown.code).toBe('ERR_TIMEZONE_INVALID');
    expect(thrown.name).toBe('FormatError');
  });

  it('canFormatTimeZone은 던지지 않고 false를 준다', () => {
    expect(canFormatTimeZone('Asia/Seoul ')).toBe(false);
    expect(canFormatTimeZone('Not/AZone')).toBe(false);
    expect(canFormatTimeZone('Asia/Seoul')).toBe(true);
  });
});

describe('환경 오류 ① — 엔진이 timeZone을 무시한다', () => {
  it('모든 존에서 기기 오프셋을 돌려주면 ERR_INTL_UNUSABLE', () => {
    // 출력은 여전히 순수 숫자다. 모양 검사는 통과하고 값 검사만 잡는다.
    installFake({ offsetFor: () => 9 * 60 });
    expect(() => formatDateTime(PROBE, { timeZone: 'Asia/Seoul', separator: '-' })).toThrow(
      /ignored \{ timeZone: 'UTC' \}/,
    );
    expect(canFormatTimeZone('Asia/Seoul')).toBe(false);
  });

  it('기기가 정확히 UTC+0이어도 프로브 존 검사 ②가 잡는다', () => {
    // ①은 통과한다(UTC 요청에 UTC를 돌려주므로). ②가 Etc/GMT-9에도 0을 돌려줘서 실패한다.
    installFake({ offsetFor: () => 0 });
    expect(() => formatDateTime(PROBE, { timeZone: 'Asia/Seoul', separator: '-' })).toThrow(
      /ignored \{ timeZone: 'Etc\/GMT-9' \}/,
    );
  });
});

describe('환경 오류 ② — 엔진이 hourCycle/hour12를 무시한다', () => {
  it('13시를 01로 렌더하면 ERR_INTL_UNUSABLE', () => {
    // h11 폴백을 흉내낸다: 자정은 0이라 검사 ①·②를 통과하고, 13시만 어긋난다.
    installFake({
      offsetFor: (zone) => (zone === 'UTC' ? 0 : 9 * 60),
      renderField: (field, value) =>
        field === 'hour' ? String(value % 12).padStart(2, '0') : undefined,
    });

    let thrown: unknown;
    try {
      formatDateTime(PROBE, { timeZone: 'Asia/Seoul', separator: '-' });
    } catch (error) {
      thrown = error;
    }
    expect(isFormatError(thrown)).toBe(true);
    if (!isFormatError(thrown)) throw new Error('unreachable');
    expect(thrown.code).toBe('ERR_INTL_UNUSABLE');
    expect(thrown.message).toMatch(/12-hour clock/);
  });
});

describe('환경 오류 ③ — 특정 존에서만 필드 출력이 깨진다', () => {
  it('비숫자 필드는 ERR_INTL_FIELD_OUTPUT', () => {
    installFake({
      offsetFor: (zone) =>
        zone === 'UTC' ? 0 : zone === 'Etc/GMT-9' ? 9 * 60 : zone === 'Asia/Seoul' ? 9 * 60 : 0,
      renderField: (field, value) => {
        if (field !== 'month') return undefined;
        // 자기검사는 UTC·Etc/GMT-9만 본다. 그 두 존은 멀쩡하게 두고 대상 존만 깬다.
        return value === 1 ? undefined : 'N/A';
      },
    });
    // 프로브(1월)는 통과하고 6월 인스턴트에서만 깨지도록 존별 검사를 우회할 수 없게,
    // 존별 검사는 프로브 인스턴트로 돌린다 — 그래서 6월 렌더에서 잡힌다.
    const june = Date.UTC(2026, 5, 8, 9, 5, 0);
    let thrown: unknown;
    try {
      formatDateTime(june, { timeZone: 'Asia/Seoul', separator: '-' });
    } catch (error) {
      thrown = error;
    }
    expect(isFormatError(thrown)).toBe(true);
    if (!isFormatError(thrown)) throw new Error('unreachable');
    expect(thrown.code).toBe('ERR_INTL_FIELD_OUTPUT');
  });

  it('오프셋이 -12:00~+14:00 밖이면 ERR_INTL_FIELD_OUTPUT', () => {
    installFake({
      offsetFor: (zone) =>
        zone === 'UTC' ? 0 : zone === 'Etc/GMT-9' ? 9 * 60 : 20 * 60,
    });
    let thrown: unknown;
    try {
      formatDateTime(PROBE, { timeZone: 'Asia/Seoul', separator: '-' });
    } catch (error) {
      thrown = error;
    }
    expect(isFormatError(thrown)).toBe(true);
    if (!isFormatError(thrown)) throw new Error('unreachable');
    expect(thrown.code).toBe('ERR_INTL_FIELD_OUTPUT');
    expect(thrown.message).toMatch(/implausible offset \(1200 minutes\)/);
  });
});

describe('캐시 — 자기검사는 런타임당 1회, 존 검사는 존당 1회', () => {
  it('포매터 생성 횟수가 존 수에 선형이고 렌더 수와 무관하다', () => {
    const zoneOffsets: Record<string, number> = {
      UTC: 0,
      'Etc/GMT-9': 9 * 60,
      'Asia/Seoul': 9 * 60,
      'America/New_York': -5 * 60,
    };
    const fake = installFake({ offsetFor: (zone) => zoneOffsets[zone] ?? null });

    // 자기검사: UTC 5개 + Etc/GMT-9 5개 = 10회
    formatDateTime(PROBE, { timeZone: 'Asia/Seoul', separator: '-' });
    const afterFirst = fake.constructions();
    expect(afterFirst).toBe(15); // 10 (self-test) + 5 (Asia/Seoul)

    for (let index = 0; index < 200; index += 1) {
      formatDateTime(PROBE + index * 60_000, { timeZone: 'Asia/Seoul', separator: '-' });
    }
    expect(fake.constructions()).toBe(afterFirst);

    formatDateTime(PROBE, { timeZone: 'America/New_York', separator: '-' });
    expect(fake.constructions()).toBe(afterFirst + 5);
  });

  it('실패한 존도 캐시된다 — 반복 호출이 재검사를 유발하지 않는다', () => {
    const fake = installFake({
      offsetFor: (zone) => (zone === 'UTC' ? 0 : zone === 'Etc/GMT-9' ? 9 * 60 : null),
    });
    expect(canFormatTimeZone('Bad/Zone')).toBe(false);
    const afterFirst = fake.constructions();
    for (let index = 0; index < 50; index += 1) expect(canFormatTimeZone('Bad/Zone')).toBe(false);
    expect(fake.constructions()).toBe(afterFirst);
  });
});
