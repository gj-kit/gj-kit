// 타입 계약 — 설계 문서 §5.2.
//
// ① 제네릭 `fallback` 추론, ② EOP 소비자 보호 2종, ③ 닫힌 유니언의 source compatibility.
import { describe, expectTypeOf, it } from 'vitest';

import {
  canFormatTimeZone,
  formatBytes,
  formatDateOnly,
  formatDurationKo,
  formatKrw,
  formatNumber,
  formatPercent,
  formatRelativeKo,
  formatText,
  parseIsoInstant,
  relativeBucket,
  storageRatio,
} from '../../src/index';
import type {
  FormatErrorCode,
  FormatLocale,
  FormatRelativeBucket,
  FormatTimeZone,
} from '../../src/index';

const now = new Date(0);
const instant = new Date(0);

describe('제네릭 fallback 추론', () => {
  it('fallback을 주지 않으면 string이다', () => {
    expectTypeOf(formatBytes(1, { system: 'decimal', unitSpace: false, nonPositive: 'render' })).toEqualTypeOf<string>();
    expectTypeOf(formatDateOnly(instant, { timeZone: 'UTC', separator: '-' })).toEqualTypeOf<string>();
    expectTypeOf(formatDurationKo(1000)).toEqualTypeOf<string>();
  });

  it('fallback을 주면 정확히 그만큼만 넓어진다', () => {
    expectTypeOf(
      formatBytes(1, {
        system: 'decimal',
        unitSpace: false,
        nonPositive: 'fallback',
        fallback: null,
      }),
    ).toEqualTypeOf<string | null>();
    expectTypeOf(
      formatDateOnly(instant, { timeZone: 'UTC', separator: '-', fallback: 0 }),
    ).toEqualTypeOf<string | number>();
    expectTypeOf(
      formatKrw(1, { style: 'symbol', locale: 'ko-KR', fallback: null }),
    ).toEqualTypeOf<string | null>();
  });
});

describe('EOP 소비자 보호 — 규약은 `?: T | undefined`다', () => {
  // 값을 함수 파라미터로 받는 것은 필요다. `const x: string | undefined = undefined`는
  // 제어 흐름 분석이 참조를 `undefined`로 좁혀 버려서, 소비 앱이 실제로 넘기는
  // "좁혀지지 않은 `string | undefined`"를 재현하지 못한다.
  it('① T | undefined 값을 옵셔널 필드에 넘겨도 컴파일된다 (TS2379 없음)', () => {
    const call = (
      maybeLabel: string | undefined,
      maybeDigits: 0 | 1 | 2 | undefined,
    ): [string, string] => [
      formatRelativeKo(instant, {
        now,
        suffixSpace: false,
        fallback: '-',
        onFuture: 'empty',
        justNowLabel: maybeLabel,
        yesterdayLabel: maybeLabel,
      }),
      formatPercent(0.5, { locale: 'ko-KR', fractionDigits: maybeDigits }),
    ];
    expectTypeOf(call).returns.toEqualTypeOf<[string, string]>();
  });

  it('② 그때 반환 타입은 여전히 string이다 — TFallback이 undefined를 흡수하지 않는다', () => {
    const call = (maybeFallback: string | undefined): void => {
      expectTypeOf(
        formatNumber(1, { locale: 'ko-KR', fallback: maybeFallback }),
      ).toEqualTypeOf<string>();
      expectTypeOf(
        formatKrw(1, { style: 'symbol', locale: 'ko-KR', fallback: maybeFallback }),
      ).toEqualTypeOf<string>();
      expectTypeOf(
        formatDateOnly(instant, { timeZone: 'UTC', separator: '-', fallback: maybeFallback }),
      ).toEqualTypeOf<string>();
      expectTypeOf(
        formatBytes(1, {
          system: 'decimal',
          unitSpace: false,
          nonPositive: 'render',
          fallback: maybeFallback,
        }),
      ).toEqualTypeOf<string>();
    };
    expectTypeOf(call).parameter(0).toEqualTypeOf<string | undefined>();
  });
});

describe('닫힌 유니언 — source compatibility (AGENTS.md §2)', () => {
  it('FormatRelativeBucket 전수 스위치가 never로 끝난다', () => {
    const render = (bucket: FormatRelativeBucket): string => {
      switch (bucket.kind) {
        case 'future':
          return `${bucket.ms}`;
        case 'just-now':
          return `${bucket.seconds}`;
        case 'minutes':
        case 'hours':
        case 'days':
        case 'months':
        case 'years':
          return `${bucket.count}`;
        default: {
          const exhaustive: never = bucket;
          return exhaustive;
        }
      }
    };
    expectTypeOf(render).returns.toEqualTypeOf<string>();
  });

  it('FormatErrorCode 전수 스위치가 never로 끝난다', () => {
    const describeCode = (code: FormatErrorCode): string => {
      switch (code) {
        // 설정 오류 3종 (프로그래머가 고칠 수 있다)
        case 'ERR_TIMEZONE_INVALID':
        case 'ERR_LOCALE_INVALID':
        case 'ERR_FRACTION_DIGITS_INVALID':
        // 환경 오류 2종 (고칠 수 없다 — 부팅 시 probe)
        case 'ERR_INTL_UNUSABLE':
        case 'ERR_INTL_FIELD_OUTPUT':
          return code;
        default: {
          const exhaustive: never = code;
          return exhaustive;
        }
      }
    };
    expectTypeOf(describeCode).returns.toEqualTypeOf<string>();
  });
});

describe('나머지 표면의 반환 타입', () => {
  it('산술과 파서는 문자열을 만들지 않는다', () => {
    expectTypeOf(storageRatio(1, 2)).toEqualTypeOf<number | null>();
    expectTypeOf(parseIsoInstant('2026-06-08', { assumeNoOffset: 'utc' })).toEqualTypeOf<
      Date | null
    >();
    expectTypeOf(relativeBucket(instant, now)).toEqualTypeOf<FormatRelativeBucket | null>();
    expectTypeOf(canFormatTimeZone('UTC')).toEqualTypeOf<boolean>();
    expectTypeOf(formatText(null)).toEqualTypeOf<string>();
  });

  it('토큰 타입은 임의 문자열도 받는다 (IANA 이름 · BCP 47 태그)', () => {
    expectTypeOf<FormatTimeZone>().toMatchTypeOf<string>();
    const zone: FormatTimeZone = 'Asia/Seoul';
    const locale: FormatLocale = ['ko-KR', 'en-US'];
    expectTypeOf(zone).toMatchTypeOf<FormatTimeZone>();
    expectTypeOf(locale).toMatchTypeOf<FormatLocale>();
  });
});
