// formatBytes 경계값과 축 상호작용 — 설계 문서 §3.7 · §5.1.
import { describe, expect, it } from 'vitest';

import { formatBytes } from '../../src/index';
import type { FormatBytesOptions } from '../../src/index';

const BASE: FormatBytesOptions = { system: 'decimal', unitSpace: false, nonPositive: 'render' };
const BINARY: FormatBytesOptions = { system: 'binary', unitSpace: true, nonPositive: 'render' };

describe('system — 라벨이 나눈 수를 정직하게 말한다', () => {
  it('decimal은 1000, binary는 1024로 나눈다', () => {
    expect(formatBytes(1000, BASE)).toBe('1.0KB');
    expect(formatBytes(1023, BINARY)).toBe('1023 B');
    expect(formatBytes(1024, BINARY)).toBe('1.0 KiB');
    expect(formatBytes(1_048_576, BINARY)).toBe('1.0 MiB');
    expect(formatBytes(1_048_576, BASE)).toBe('1.0MB');
  });

  it('binary 라벨 전량', () => {
    const options = { ...BINARY, unitSpace: false } as const;
    expect(formatBytes(1, options)).toBe('1B');
    expect(formatBytes(1024, options)).toBe('1.0KiB');
    expect(formatBytes(1024 ** 2, options)).toBe('1.0MiB');
    expect(formatBytes(1024 ** 3, options)).toBe('1.0GiB');
    expect(formatBytes(1024 ** 4, options)).toBe('1.0TiB');
    expect(formatBytes(1024 ** 5, options)).toBe('1.0PiB');
    expect(formatBytes(1024 ** 6, options)).toBe('1024.0PiB');
  });
});

describe('원시 경계와 반올림 승격 경계', () => {
  it('단위 선택은 반올림 전에 끝난다 — 반올림 결과가 1000을 넘어도 재승격 없다', () => {
    expect(formatBytes(999, BASE)).toBe('999B');
    expect(formatBytes(1000, BASE)).toBe('1.0KB');
    expect(formatBytes(999_950, BASE)).toBe('1000.0KB');
    expect(formatBytes(999_999, BASE)).toBe('1000.0KB');
    expect(formatBytes(1_023_999, BASE)).toBe('1.0MB');
  });
});

describe('nonPositive — 필수 축', () => {
  it("'render'는 0·음수를 그대로 렌더한다", () => {
    expect(formatBytes(0, BASE)).toBe('0B');
    expect(formatBytes(-1, BASE)).toBe('-1B');
    expect(formatBytes(-5000, BASE)).toBe('-5000B');
  });

  it("'fallback'은 0 이하를 전부 폴백으로 바꾼다", () => {
    const options = { ...BASE, nonPositive: 'fallback' } as const;
    expect(formatBytes(0, options)).toBe('-');
    expect(formatBytes(-1, options)).toBe('-');
    expect(formatBytes(1, options)).toBe('1B');
    expect(formatBytes(0, { ...options, fallback: null })).toBeNull();
  });
});

describe('trailingZeros 3종 — trim과 trim-exact는 다르다', () => {
  const at = (trailingZeros: 'keep' | 'trim' | 'trim-exact', value: number): string | null =>
    formatBytes(value, { ...BASE, trailingZeros });

  it('1.04GB에서 갈린다', () => {
    expect(at('keep', 1_040_000_000)).toBe('1.0GB');
    expect(at('trim', 1_040_000_000)).toBe('1GB');
    expect(at('trim-exact', 1_040_000_000)).toBe('1.0GB');
  });

  it('정확히 정수인 값에서는 trim과 trim-exact가 같다', () => {
    expect(at('keep', 2_000_000_000)).toBe('2.0GB');
    expect(at('trim', 2_000_000_000)).toBe('2GB');
    expect(at('trim-exact', 2_000_000_000)).toBe('2GB');
  });

  it('B 단위는 trailingZeros와 무관하게 항상 정수', () => {
    expect(at('keep', 999)).toBe('999B');
    expect(at('trim', 999)).toBe('999B');
    expect(at('trim-exact', 999)).toBe('999B');
  });
});

describe('fractionDigits — 단일 값과 단위별 맵', () => {
  it('단일 값', () => {
    expect(formatBytes(1_234_567, { ...BASE, fractionDigits: 0 })).toBe('1MB');
    expect(formatBytes(1_234_567, { ...BASE, fractionDigits: 1 })).toBe('1.2MB');
    expect(formatBytes(1_234_567, { ...BASE, fractionDigits: 2 })).toBe('1.23MB');
  });

  it('단위별 맵 — 맵에 없는 단위는 기본 1자리', () => {
    const options: FormatBytesOptions = { ...BASE, fractionDigits: { MB: 0, GB: 2 } };
    expect(formatBytes(1_234_567, options)).toBe('1MB');
    expect(formatBytes(1_234_567_890, options)).toBe('1.23GB');
    expect(formatBytes(1234, options)).toBe('1.2KB');
  });
});

describe('minUnit / maxUnit', () => {
  it('minUnit 아래로 내려가지 않는다', () => {
    expect(formatBytes(500, { ...BASE, minUnit: 'MB', fractionDigits: 2 })).toBe('0.00MB');
    expect(formatBytes(500, { ...BASE, minUnit: 'KB', fractionDigits: 1 })).toBe('0.5KB');
  });

  it('maxUnit 위로 올라가지 않는다', () => {
    expect(formatBytes(1e15, { ...BASE, maxUnit: 'GB' })).toBe('1000000.0GB');
    expect(formatBytes(1e15, { ...BASE, maxUnit: 'TB' })).toBe('1000.0TB');
  });

  it('minUnit이 maxUnit보다 위면 minUnit이 이긴다', () => {
    expect(formatBytes(1e12, { ...BASE, minUnit: 'GB', maxUnit: 'MB' })).toBe('1000.0GB');
  });
});

describe('wholeNumberFrom', () => {
  it('임계 이상은 정수로 렌더된다', () => {
    const options = { ...BASE, wholeNumberFrom: 10, trailingZeros: 'trim' } as const;
    expect(formatBytes(9_500_000, options)).toBe('9.5MB');
    expect(formatBytes(10_400_000, options)).toBe('10MB');
    expect(formatBytes(12_345_678, options)).toBe('12MB');
  });
});

describe('값 오류와 -0', () => {
  it('null·undefined·NaN·Infinity는 폴백', () => {
    expect(formatBytes(null, BASE)).toBe('-');
    expect(formatBytes(undefined, BASE)).toBe('-');
    expect(formatBytes(Number.NaN, BASE)).toBe('-');
    expect(formatBytes(Number.POSITIVE_INFINITY, BASE)).toBe('-');
    expect(formatBytes(Number.NEGATIVE_INFINITY, BASE)).toBe('-');
  });

  it("음수 0은 '-0'으로 렌더되지 않는다", () => {
    expect(formatBytes(-0, BASE)).toBe('0B');
    expect(formatBytes(-40, { ...BASE, minUnit: 'KB', fractionDigits: 1 })).toBe('0.0KB');
    expect(formatBytes(-40, { ...BASE, minUnit: 'KB', fractionDigits: 1, trailingZeros: 'trim' })).toBe(
      '0KB',
    );
  });
});
