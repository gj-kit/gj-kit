// 수·비율·통화·텍스트 — 설계 문서 §3.8 · §3.9 · §5.1.
import { describe, expect, it } from 'vitest';

import {
  FormatError,
  formatKrw,
  formatNumber,
  formatPercent,
  formatText,
  isFormatError,
  storageRatio,
} from '../../src/index';

describe('formatNumber — locale은 그룹핑만 정한다', () => {
  it('로케일별 그룹핑', () => {
    expect(formatNumber(1234567.5, { locale: 'ko-KR' })).toBe('1,234,567.5');
    expect(formatNumber(1234567.5, { locale: 'de-DE' })).toBe('1.234.567,5');
    expect(formatNumber(1234567.5, { locale: ['de-DE', 'en-US'] })).toBe('1.234.567,5');
  });

  it('fraction digits 화이트리스트', () => {
    expect(formatNumber(1.23456, { locale: 'en-US', maximumFractionDigits: 2 })).toBe('1.23');
    expect(formatNumber(1, { locale: 'en-US', minimumFractionDigits: 2 })).toBe('1.00');
  });

  it('-0은 0으로 정규화된다', () => {
    expect(formatNumber(-0, { locale: 'en-US' })).toBe('0');
  });

  it('반올림 후 0이 되는 음수도 부호를 잃는다 — 리터럴 -0만의 문제가 아니다', () => {
    // 정규화가 반올림 **앞**에만 걸려 있으면 여기서 '-0'이 나온다. 화면에 음의 0이
    // 뜨는 것은 어느 로케일에서도 버그다(bytes의 `'-0.0'` 스트립·krw의 부호 재적용과
    // 같은 규칙).
    expect(formatNumber(-0.4, { locale: 'ko-KR', maximumFractionDigits: 0 })).toBe('0');
    expect(formatNumber(-0.04, { locale: 'ko-KR', maximumFractionDigits: 1 })).toBe('0');
    expect(
      formatNumber(-0.04, {
        locale: 'ko-KR',
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      }),
    ).toBe('0.0');
    expect(formatNumber(-0.0001, { locale: 'ko-KR' })).toBe('0');
    // 경계 — 정확히 half는 여전히 반올림돼 부호가 남는다 (Intl은 0에서 멀어지는 방향)
    expect(formatNumber(-0.5, { locale: 'ko-KR', maximumFractionDigits: 0 })).toBe('-1');
    expect(formatNumber(-0.6, { locale: 'ko-KR', maximumFractionDigits: 0 })).toBe('-1');
  });
});

describe('storageRatio — 산술이지 렌더가 아니다', () => {
  it('clamp와 null 조건', () => {
    expect(storageRatio(630, 1000)).toBe(0.63);
    expect(storageRatio(1500, 1000)).toBe(1);
    expect(storageRatio(0, 1000)).toBe(0);
    expect(storageRatio(500, 0)).toBeNull();
    expect(storageRatio(500, null)).toBeNull();
    expect(storageRatio(500, Number.POSITIVE_INFINITY)).toBeNull();
  });
});

describe('formatPercent — % 기호는 로케일이 옮기지 못한다', () => {
  it('admin의 인라인 percent 4곳을 바이트 단위로 재현한다', () => {
    expect(formatPercent(0.63, { locale: 'ko-KR' })).toBe('63%');
    expect(formatPercent(0, { locale: 'ko-KR' })).toBe('0%');
    expect(formatPercent(1, { locale: 'ko-KR' })).toBe('100%');
    expect(formatPercent(0.005, { locale: 'ko-KR' })).toBe('1%');
    expect(formatPercent(0.004, { locale: 'ko-KR' })).toBe('0%');
  });

  it('프랑스어 로케일에서도 기호와 간격이 고정이다', () => {
    expect(formatPercent(0.63, { locale: 'fr-FR' })).toBe('63%');
  });

  it('fractionDigits', () => {
    expect(formatPercent(0.6349, { locale: 'en-US', fractionDigits: 1 })).toBe('63.5%');
    expect(formatPercent(0.6349, { locale: 'en-US', fractionDigits: 2 })).toBe('63.49%');
  });

  it('값 오류는 폴백, -0은 0', () => {
    expect(formatPercent(null, { locale: 'en-US' })).toBe('-');
    expect(formatPercent(Number.NaN, { locale: 'en-US' })).toBe('-');
    expect(formatPercent(-0, { locale: 'en-US' })).toBe('0%');
    expect(formatPercent(null, { locale: 'en-US', fallback: null })).toBeNull();
  });

  it("반올림해서 0이 되는 음수 비율은 '-0%'가 아니라 '0%'다", () => {
    // 소스(admin)의 `${Math.round(ratio * 100)}%`는 `Math.round(-0.1)` → `-0`이
    // 템플릿 리터럴에서 `'0'`으로 찍혀 `'0%'`였다. 여기서 '-0%'가 나오면 §0.4에 없는
    // 무단 divergence다.
    expect(formatPercent(-0.0001, { locale: 'ko-KR' })).toBe('0%');
    expect(formatPercent(-0.001, { locale: 'ko-KR' })).toBe('0%');
    expect(formatPercent(-0.0049, { locale: 'ko-KR' })).toBe('0%');
    expect(formatPercent(-0.00049, { locale: 'ko-KR', fractionDigits: 1 })).toBe('0.0%');
    expect(formatPercent(-0.000049, { locale: 'ko-KR', fractionDigits: 2 })).toBe('0.00%');
    expect(formatPercent(storageRatio(-1, 1000), { locale: 'ko-KR' })).toBe('0%');
    // 진짜 음수는 그대로 음수다 — 부호를 통째로 지우는 것이 아니다
    expect(formatPercent(-0.005, { locale: 'ko-KR' })).toBe('-1%');
    expect(formatPercent(-0.63, { locale: 'ko-KR' })).toBe('-63%');
    expect(formatPercent(-0.00051, { locale: 'ko-KR', fractionDigits: 1 })).toBe('-0.1%');
  });

  it('storageRatio → formatPercent 파이프가 패키지 안에서 닫힌다', () => {
    expect(formatPercent(storageRatio(630, 1000), { locale: 'ko-KR' })).toBe('63%');
    expect(formatPercent(storageRatio(630, 0), { locale: 'ko-KR' })).toBe('-');
  });
});

describe('formatKrw — 기호 글리프와 위치가 로케일에 흔들리지 않는다', () => {
  it('어떤 로케일에서도 ₩는 앞에, 원은 뒤에 붙는다', () => {
    for (const locale of ['ko-KR', 'en-US', 'de-DE', 'es-ES', 'fr-FR']) {
      expect(formatKrw(1000, { style: 'symbol', locale })).toMatch(/^₩/);
      expect(formatKrw(1000, { style: 'suffix-ko', locale })).toMatch(/원$/);
      expect(formatKrw(1000, { style: 'symbol', locale })).not.toMatch(/KRW/);
    }
  });

  it('그룹핑만 로케일을 따른다', () => {
    expect(formatKrw(1234567, { style: 'symbol', locale: 'de-DE' })).toBe('₩1.234.567');
    expect(formatKrw(1234567, { style: 'suffix-ko', locale: 'ko-KR' })).toBe('1,234,567원');
  });

  it('minor unit이 없다 — 항상 정수 원', () => {
    expect(formatKrw(1000.5, { style: 'symbol', locale: 'ko-KR' })).toBe('₩1,001');
    expect(formatKrw(1000.49, { style: 'symbol', locale: 'ko-KR' })).toBe('₩1,000');
    expect(formatKrw(-1000.5, { style: 'symbol', locale: 'ko-KR' })).toBe('-₩1,001');
  });

  it('값 오류는 폴백', () => {
    expect(formatKrw(null, { style: 'symbol', locale: 'ko-KR' })).toBe('-');
    expect(formatKrw(Number.NaN, { style: 'symbol', locale: 'ko-KR' })).toBe('-');
    expect(formatKrw(Number.POSITIVE_INFINITY, { style: 'symbol', locale: 'ko-KR' })).toBe('-');
    expect(formatKrw(null, { style: 'symbol', locale: 'ko-KR', fallback: 0 })).toBe(0);
  });
});

describe('formatText', () => {
  it('폴백을 바꿀 수 있다', () => {
    expect(formatText(null, '없음')).toBe('없음');
    expect(formatText('', '없음')).toBe('없음');
    expect(formatText(0, '없음')).toBe('0');
  });
});

describe('값 오류는 어떤 입력에도 throw하지 않는다', () => {
  it('전 포매터 스모크', () => {
    const bad = [null, undefined, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY];
    for (const value of bad) {
      expect(() => formatNumber(value, { locale: 'ko-KR' })).not.toThrow();
      expect(() => formatKrw(value, { style: 'symbol', locale: 'ko-KR' })).not.toThrow();
      expect(() => formatPercent(value, { locale: 'ko-KR' })).not.toThrow();
    }
  });
});

describe('설정 오류는 타입 있는 FormatError로 나온다 (§1-3 오류 3분류)', () => {
  // README의 `catch (error) { if (isFormatError(error)) ... }` 레시피를 따르는 호출부가
  // Intl의 맨 RangeError를 다시 던지지 않아야 한다. locale과 fraction digits는 둘 다
  // 타입이 열려 있으므로(임의 문자열 · 임의 number) 런타임이 마지막 방어선이다.
  const malformedLocales = ['ko_KR', 'ko-KR-', 'en US'];

  it('잘못된 로케일 태그 — ERR_LOCALE_INVALID', () => {
    for (const locale of malformedLocales) {
      for (const call of [
        () => formatNumber(1234, { locale }),
        () => formatPercent(0.5, { locale }),
        () => formatKrw(1000, { style: 'symbol', locale }),
        () => formatKrw(1000, { style: 'suffix-ko', locale }),
      ]) {
        let thrown: unknown;
        try {
          call();
        } catch (error) {
          thrown = error;
        }
        expect(isFormatError(thrown)).toBe(true);
        expect((thrown as FormatError).code).toBe('ERR_LOCALE_INVALID');
        expect((thrown as FormatError).message).toContain(locale);
      }
    }
  });

  it('배열 로케일 안의 잘못된 태그도 같은 코드다', () => {
    let thrown: unknown;
    try {
      formatNumber(1, { locale: ['en-US', 'ko_KR'] });
    } catch (error) {
      thrown = error;
    }
    expect(isFormatError(thrown)).toBe(true);
    expect((thrown as FormatError).code).toBe('ERR_LOCALE_INVALID');
  });

  it('범위 밖 fraction digits — ERR_FRACTION_DIGITS_INVALID', () => {
    const bad: Array<Parameters<typeof formatNumber>[1]> = [
      { locale: 'ko-KR', maximumFractionDigits: 101 },
      { locale: 'ko-KR', maximumFractionDigits: -1 },
      { locale: 'ko-KR', maximumFractionDigits: 1.5 },
      { locale: 'ko-KR', maximumFractionDigits: Number.NaN },
      { locale: 'ko-KR', minimumFractionDigits: 3, maximumFractionDigits: 1 },
    ];
    for (const options of bad) {
      let thrown: unknown;
      try {
        formatNumber(1, options);
      } catch (error) {
        thrown = error;
      }
      expect(isFormatError(thrown)).toBe(true);
      expect((thrown as FormatError).code).toBe('ERR_FRACTION_DIGITS_INVALID');
    }
  });

  it('정상 설정은 던지지 않는다 — 경계 0과 100 포함', () => {
    expect(() => formatNumber(1, { locale: 'ko-KR', maximumFractionDigits: 0 })).not.toThrow();
    expect(() =>
      formatNumber(1, { locale: 'ko-KR', minimumFractionDigits: 0, maximumFractionDigits: 100 }),
    ).not.toThrow();
    expect(() => formatNumber(1, { locale: 'device' })).not.toThrow();
  });

  it('실패한 로케일은 캐시되지 않는다 — 두 번째 호출도 같은 FormatError다', () => {
    for (const attempt of [1, 2]) {
      let thrown: unknown;
      try {
        formatNumber(attempt, { locale: 'ko_KR' });
      } catch (error) {
        thrown = error;
      }
      expect(isFormatError(thrown)).toBe(true);
    }
  });
});
