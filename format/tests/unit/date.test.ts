// 날짜 3종 — 설계 문서 §3.4 · §5.1.
//
// 세 축을 고정한다: (a) 시간대 매트릭스(무DST · DST 경계 · 45분 오프셋), (b) 필드 폭,
// (c) IANA 경로와 `'UTC'` 경로가 같은 인스턴트에 같은 문자열을 낸다는 것.
//
// (c)를 위해 **oracle 교차검증**을 쓴다: Node full-icu의 `formatToParts`가 정답이고,
// 라이브러리의 단일 필드 합성이 그 정답과 어긋나면 여기서 죽는다. 런타임 코드는
// `formatToParts`를 쓸 수 없다(Hermes 미지원 — 가드가 금지한다). 테스트만 쓴다.
import { describe, expect, it } from 'vitest';

import {
  formatDateOnly,
  formatDateTime,
  formatMonthDayTime,
  parseIsoInstant,
} from '../../src/index';

const ZONES = ['UTC', 'Asia/Seoul', 'America/New_York', 'Asia/Kathmandu', 'Pacific/Chatham'];

/** 테스트 전용 정답지. 런타임 코드에는 존재할 수 없는 API다. */
function oracle(epochMs: number, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(epochMs);
  const field = (type: string): string =>
    parts.find((part) => part.type === type)?.value ?? '';
  return `${field('year')}-${field('month')}-${field('day')} ${field('hour')}:${field('minute')}`;
}

const at = (iso: string): number => {
  const parsed = parseIsoInstant(iso, { assumeNoOffset: 'reject' });
  if (parsed === null) throw new Error(`fixture is not a valid ISO instant: ${iso}`);
  return parsed.getTime();
};

const INSTANTS: readonly (readonly [string, number])[] = [
  ['평범한 오전', at('2026-06-08T09:05:00Z')],
  ['13시 (h11/h12 폴백 탐지)', at('2026-06-08T13:05:00Z')],
  ['서울 자정', at('2026-06-07T15:00:00Z')],
  ['뉴욕 spring-forward 1분 전', at('2026-03-08T06:59:00Z')],
  ['뉴욕 spring-forward 직후', at('2026-03-08T07:00:00Z')],
  ['뉴욕 fall-back 1분 전', at('2026-11-01T05:59:00Z')],
  ['뉴욕 fall-back 직후', at('2026-11-01T06:00:00Z')],
];

describe('시간대 매트릭스 — oracle 교차검증', () => {
  for (const zone of ZONES) {
    for (const [label, epochMs] of INSTANTS) {
      it(`${zone} · ${label}`, () => {
        expect(formatDateTime(epochMs, { timeZone: zone, separator: '-' })).toBe(
          oracle(epochMs, zone),
        );
      });
    }
  }
});

describe('DST 경계 — 명시 인스턴트의 실제 wall clock', () => {
  it('spring-forward: 01:59 다음 wall clock은 03:00이다', () => {
    const options = { timeZone: 'America/New_York', separator: '-' } as const;
    expect(formatDateTime(at('2026-03-08T06:59:00Z'), options)).toBe('2026-03-08 01:59');
    expect(formatDateTime(at('2026-03-08T07:00:00Z'), options)).toBe('2026-03-08 03:00');
  });

  it('fall-back: 01:59 다음 wall clock은 01:00으로 되돌아간다', () => {
    const options = { timeZone: 'America/New_York', separator: '-' } as const;
    expect(formatDateTime(at('2026-11-01T05:59:00Z'), options)).toBe('2026-11-01 01:59');
    expect(formatDateTime(at('2026-11-01T06:00:00Z'), options)).toBe('2026-11-01 01:00');
  });

  it('45분 오프셋 존도 분 단위까지 맞다', () => {
    expect(
      formatDateTime(at('2026-06-08T09:05:00Z'), {
        timeZone: 'Asia/Kathmandu',
        separator: '-',
      }),
    ).toBe('2026-06-08 14:50');
    expect(
      formatDateTime(at('2026-06-08T09:05:00Z'), {
        timeZone: 'Pacific/Chatham',
        separator: '-',
      }),
    ).toBe('2026-06-08 21:50');
  });
});

describe('필드 폭 — 월/일/시/분은 2자리, 연도는 패딩 없음', () => {
  it.each([
    ['0999-06-08T01:02:00Z', '999-06-08 01:02'],
    ['1000-06-08T01:02:00Z', '1000-06-08 01:02'],
    ['9999-06-08T01:02:00Z', '9999-06-08 01:02'],
  ])('%s → %s (UTC 경로)', (iso, expected) => {
    expect(formatDateTime(at(iso), { timeZone: 'UTC', separator: '-' })).toBe(expected);
  });

  it('IANA 경로와 UTC 경로의 연도 표기가 같다', () => {
    // 같은 인스턴트를 UTC와 Etc/GMT-0(= UTC 고정 오프셋)으로 렌더해 비교한다.
    for (const iso of ['0999-06-08T01:02:00Z', '1000-06-08T01:02:00Z', '9999-06-08T01:02:00Z']) {
      const epochMs = at(iso);
      expect(formatDateTime(epochMs, { timeZone: 'Etc/GMT', separator: '-' })).toBe(
        formatDateTime(epochMs, { timeZone: 'UTC', separator: '-' }),
      );
    }
  });

  it('자정은 00, 오후 1시는 13이다 (24시간제)', () => {
    expect(formatDateTime(at('2026-06-08T00:00:00Z'), { timeZone: 'UTC', separator: '-' })).toBe(
      '2026-06-08 00:00',
    );
    expect(formatDateTime(at('2026-06-08T13:05:00Z'), { timeZone: 'UTC', separator: '-' })).toBe(
      '2026-06-08 13:05',
    );
    expect(
      formatDateTime(at('2026-06-07T15:00:00Z'), { timeZone: 'Asia/Seoul', separator: '-' }),
    ).toBe('2026-06-08 00:00');
  });
});

describe('세 가지 shape과 두 구분자', () => {
  const epochMs = at('2026-06-08T13:05:00Z');

  it('dash', () => {
    const options = { timeZone: 'UTC', separator: '-' } as const;
    expect(formatDateTime(epochMs, options)).toBe('2026-06-08 13:05');
    expect(formatDateOnly(epochMs, options)).toBe('2026-06-08');
    expect(formatMonthDayTime(epochMs, options)).toBe('06-08 13:05');
  });

  it('dot', () => {
    const options = { timeZone: 'UTC', separator: '.' } as const;
    expect(formatDateTime(epochMs, options)).toBe('2026.06.08 13:05');
    expect(formatDateOnly(epochMs, options)).toBe('2026.06.08');
    expect(formatMonthDayTime(epochMs, options)).toBe('06.08 13:05');
  });
});

describe('입력 형태와 값 오류', () => {
  const options = { timeZone: 'Asia/Seoul', separator: '-' } as const;

  it('Date와 epoch ms가 같은 결과를 낸다', () => {
    const epochMs = at('2026-06-08T09:05:00Z');
    expect(formatDateTime(new Date(epochMs), options)).toBe(formatDateTime(epochMs, options));
  });

  it('null·undefined·invalid Date·NaN은 전부 폴백 — 던지지 않는다', () => {
    expect(formatDateTime(null, options)).toBe('-');
    expect(formatDateTime(undefined, options)).toBe('-');
    expect(formatDateTime(new Date('nope'), options)).toBe('-');
    expect(formatDateTime(Number.NaN, options)).toBe('-');
    expect(formatDateTime(Number.POSITIVE_INFINITY, options)).toBe('-');
  });

  it('제네릭 fallback이 반환 타입을 넓힌다', () => {
    expect(formatDateTime(null, { ...options, fallback: null })).toBeNull();
    expect(formatDateTime(null, { ...options, fallback: 0 })).toBe(0);
  });
});

describe('결정성', () => {
  it('같은 인자로 두 번 부르면 같은 문자열', () => {
    const epochMs = at('2026-06-08T09:05:00Z');
    for (const zone of ZONES) {
      const options = { timeZone: zone, separator: '-' } as const;
      expect(formatDateTime(epochMs, options)).toBe(formatDateTime(epochMs, options));
    }
  });
});
