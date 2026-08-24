// 오용 차단 — 설계 문서 §4 표 11항목. `typescript@~6.0.3` + 루트 tsconfig.base.json 플래그
// (strict · exactOptionalPropertyTypes · noUncheckedIndexedAccess)에서 검증된다.
//
// `@ts-expect-error`는 "에러가 나야 한다"는 주장이다 — 에러가 나지 않으면 그 자체로 실패한다.
// 즉 이 파일은 차단 장치가 실제로 존재한다는 것을 기계적으로 증명한다.
import { describe, expectTypeOf, it } from 'vitest';

import {
  formatBytes,
  formatDateTime,
  formatKrw,
  formatNumber,
  formatRelativeKo,
} from '../../src/index';
import type { FormatBytesOptions } from '../../src/index';

const now = new Date(0);
const instant = new Date(0);

describe('§4-1 시간대를 생각하지 않고 날짜를 렌더할 수 없다', () => {
  it('옵션 객체 자체가 required이고 timeZone도 required다', () => {
    // @ts-expect-error 옵션 객체 누락
    formatDateTime(instant);
    // @ts-expect-error timeZone 누락
    formatDateTime(instant, { separator: '-' });
    // @ts-expect-error separator 누락
    formatDateTime(instant, { timeZone: 'UTC' });
    expectTypeOf(formatDateTime(instant, { timeZone: 'UTC', separator: '-' })).toEqualTypeOf<
      string
    >();
  });
});

describe('§4-2 상대시간이 몰래 시계를 읽을 수 없다', () => {
  it('now가 required다', () => {
    // @ts-expect-error now 누락
    formatRelativeKo(instant, { suffixSpace: true, fallback: '', onFuture: 'empty' });
  });
});

describe('§4-3 통화 표기 스타일을 임의로 고를 수 없다', () => {
  it('style이 required다', () => {
    // @ts-expect-error style 누락
    formatKrw(1000, { locale: 'ko-KR' });
    // @ts-expect-error 정의되지 않은 스타일
    formatKrw(1000, { style: 'code', locale: 'ko-KR' });
  });
});

describe('§4-4 그룹핑이 기기 로케일에 몰래 의존할 수 없다', () => {
  it("locale이 required이고 기기 의존은 'device'라고 적어야만 가능하다", () => {
    // @ts-expect-error locale 누락
    formatNumber(1, {});
    expectTypeOf(formatNumber(1, { locale: 'device' })).toEqualTypeOf<string>();
  });
});

describe('§4-5 라벨이 나눈 수에 대해 거짓말할 수 없다', () => {
  it('리터럴에서 차단된다', () => {
    // 호출을 한 줄로 두는 것은 스타일이 아니라 필요다 — `@ts-expect-error`는 **다음 한 줄**만
    // 덮으므로, 여러 줄에 걸친 객체 리터럴에서는 어느 줄에 진단이 붙을지에 테스트가 의존하게 된다.
    // @ts-expect-error binary 체계에 decimal 라벨
    formatBytes(1, { system: 'binary', maxUnit: 'GB', unitSpace: false, nonPositive: 'render' });
  });

  it('변수 간접으로도 우회되지 않는다 — 유니언 멤버 불일치라 EPC에 의존하지 않는다', () => {
    const options = {
      system: 'binary',
      maxUnit: 'GB',
      unitSpace: false,
      nonPositive: 'render',
    } as const;
    // @ts-expect-error binary 체계에 decimal 라벨 (변수 간접)
    formatBytes(1, options);
  });

  it('단위별 fractionDigits 맵의 키에서도 차단된다', () => {
    // @ts-expect-error binary 맵에 decimal 단위 키
    formatBytes(1, { system: 'binary', fractionDigits: { GB: 0 }, unitSpace: false, nonPositive: 'render' });
  });

  it('올바른 조합은 통과한다', () => {
    const binary: FormatBytesOptions = {
      system: 'binary',
      maxUnit: 'GiB',
      fractionDigits: { GiB: 2 },
      unitSpace: false,
      nonPositive: 'render',
    };
    expectTypeOf(formatBytes(1, binary)).toEqualTypeOf<string>();
  });
});

describe('§4-6 절대시각 렌더를 라이브러리에 떠넘길 수 없다', () => {
  it('maxDays와 onOverflow는 쌍으로만 존재한다', () => {
    // @ts-expect-error onOverflow 없이 maxDays만
    formatRelativeKo(instant, { now, suffixSpace: false, fallback: '-', onFuture: 'empty', maxDays: 7 });
    expectTypeOf(
      formatRelativeKo(instant, {
        now,
        suffixSpace: false,
        fallback: '-',
        onFuture: 'empty',
        maxDays: 7,
        onOverflow: (date: Date) => date.toISOString(),
      }),
    ).toEqualTypeOf<string>();
  });
});

describe('§4-7 unknown을 받아 0으로 승격할 수 없다', () => {
  it('입력 타입이 좁다', () => {
    const value: unknown = 1;
    // @ts-expect-error unknown은 받지 않는다
    formatKrw(value, { style: 'symbol', locale: 'ko-KR' });
    // @ts-expect-error boolean은 인스턴트가 아니다
    formatDateTime(true, { timeZone: 'UTC', separator: '-' });
    // null·undefined는 정당한 입력이며 폴백으로 간다
    expectTypeOf(formatKrw(null, { style: 'symbol', locale: 'ko-KR' })).toEqualTypeOf<string>();
  });
});

describe('§4-7b 날짜 문자열을 포매터에 바로 넣을 수 없다', () => {
  it('FormatDateInput에 string이 없다', () => {
    // @ts-expect-error 문자열은 parseIsoInstant를 거쳐야 한다
    formatDateTime('2026-06-08T09:05:00', { timeZone: 'UTC', separator: '-' });
  });
});

describe('§4-8 Hermes 불안전 Intl 옵션은 표면에 존재하지 않는다', () => {
  it('신선한 객체 리터럴에서는 차단된다 (EPC)', () => {
    // @ts-expect-error 화이트리스트에 없는 옵션
    formatNumber(1, { locale: 'ko', notation: 'compact' });
  });

  it('변수 간접은 타입이 막지 못한다 — 그 한계를 여기에 못박는다', () => {
    // 구조적 타입 시스템이라 초과 프로퍼티를 가진 변수는 통과한다. 소스 유입은
    // tests/unit/guards/source-guard가 막고, 소비 앱 코드에는 효력이 없다.
    const options = { locale: 'ko' as const, notation: 'compact' as const };
    expectTypeOf(formatNumber(1, options)).toEqualTypeOf<string>();
  });
});
