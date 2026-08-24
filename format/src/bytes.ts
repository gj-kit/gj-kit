/**
 * Byte quantities.
 *
 * Four hand-rolled implementations existed across the two source apps, and they
 * disagreed on the separator, on the rounding policy, on whether a unit label
 * may be skipped, and on what zero means. Each disagreement is an option here:
 * `unitSpace`, `fractionDigits` / `trailingZeros` / `wholeNumberFrom`, the
 * `minUnit` / `maxUnit` pair, and `nonPositive`.
 *
 * Two invariants hold across every combination:
 *
 * 1. The label always tells the truth about the divisor. `system: 'decimal'`
 *    divides by 1000 and labels KB/MB; `system: 'binary'` divides by 1024 and
 *    labels KiB/MiB. The type makes a mismatched pair uncompilable.
 * 2. The unit is chosen *before* rounding and is never re-promoted afterwards.
 *    That is what the source apps did, and it is visible: 999_999 bytes render
 *    as `'1000.0 KB'`, not `'1.0 MB'`. Source equivalence wins over tidiness.
 */
import { normalizeZero } from './number';

export type FormatDecimalByteUnit = 'B' | 'KB' | 'MB' | 'GB' | 'TB' | 'PB';
export type FormatBinaryByteUnit = 'B' | 'KiB' | 'MiB' | 'GiB' | 'TiB' | 'PiB';

/** Exact fraction digits above the B unit. */
type ByteFractionDigits = 0 | 1 | 2;

const DECIMAL_UNITS: readonly FormatDecimalByteUnit[] = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
const BINARY_UNITS: readonly FormatBinaryByteUnit[] = ['B', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB'];

export type FormatBytesOptions<TFallback = string> = {
  /** Required: `'1.5 GB'` vs `'1.5GB'` — the source apps disagreed. */
  readonly unitSpace: boolean;
  /**
   * Required policy for zero and negative input — the source apps disagreed and
   * the difference is visible: admin renders `'0 B'`/`'-5 B'`, mobile treats
   * anything `<= 0` as "size unknown" and hides the chip.
   * `'render'` formats the value; `'fallback'` returns `fallback`.
   */
  readonly nonPositive: 'render' | 'fallback';
  /**
   * How trailing zeros are handled. Default `'keep'`.
   * - `'keep'`       renders `'1.0 GB'` — fixed column width (`toFixed`).
   * - `'trim'`       renders `'1GB'` — drops trailing zeros after rounding.
   * - `'trim-exact'` drops the fraction only when the value was an exact
   *                  integer *before* rounding, so `1.04 GB` still renders
   *                  `'1.0GB'`. This is not the same as `'trim'`; it is what
   *                  `Number.isInteger(v) ? v : v.toFixed(1)` does.
   */
  readonly trailingZeros?: 'keep' | 'trim' | 'trim-exact' | undefined;
  /** Values >= this (in the chosen unit) render as integers (e.g. 10 gives `'12MB'`). */
  readonly wholeNumberFrom?: number | undefined;
  /** Rendered for null/undefined/non-finite input, and for non-positive input
   *  when `nonPositive` is `'fallback'`. Default `'-'`. */
  readonly fallback?: TFallback | undefined;
} & (
  | {
      /** Decimal SI: 1 KB = 1000 B. Unit labels KB/MB/.../PB. */
      readonly system: 'decimal';
      /**
       * Exact fraction digits above the B unit — a single value, or a per-unit
       * map when the policy differs by unit. Default 1.
       * The per-unit form exists because a real source app rounds MB to whole
       * numbers while giving GB/TB one decimal, and no numeric threshold can
       * separate those two ranges (both span 1-999 in their own unit).
       */
      readonly fractionDigits?:
        | ByteFractionDigits
        | Partial<Record<FormatDecimalByteUnit, ByteFractionDigits>>
        | undefined;
      readonly minUnit?: FormatDecimalByteUnit | undefined;
      readonly maxUnit?: FormatDecimalByteUnit | undefined;
    }
  | {
      /** Binary: 1 KiB = 1024 B. Unit labels KiB/MiB/.../PiB. */
      readonly system: 'binary';
      readonly fractionDigits?:
        | ByteFractionDigits
        | Partial<Record<FormatBinaryByteUnit, ByteFractionDigits>>
        | undefined;
      readonly minUnit?: FormatBinaryByteUnit | undefined;
      readonly maxUnit?: FormatBinaryByteUnit | undefined;
    }
);

function unitIndex(units: readonly string[], unit: string | undefined, fallbackIndex: number): number {
  if (unit === undefined) return fallbackIndex;
  const index = units.indexOf(unit);
  return index === -1 ? fallbackIndex : index;
}

function digitsFor(
  fractionDigits:
    | ByteFractionDigits
    | Partial<Record<string, ByteFractionDigits>>
    | undefined,
  unit: string,
): ByteFractionDigits {
  if (fractionDigits === undefined) return 1;
  if (typeof fractionDigits === 'number') return fractionDigits;
  return fractionDigits[unit] ?? 1;
}

/**
 * Render the magnitude with the source apps' own rounding primitives.
 *
 * `'keep'`/`'trim-exact'` go through `toFixed` and `'trim'` goes through
 * `Math.round`, because that is literally what the sources did. Normalising
 * both onto one "half-up" helper would make the golden vectors drift from the
 * screens they are supposed to reproduce.
 */
function renderMagnitude(
  size: number,
  digits: ByteFractionDigits,
  trailingZeros: 'keep' | 'trim' | 'trim-exact',
): string {
  if (trailingZeros === 'trim') {
    const factor = 10 ** digits;
    return String(normalizeZero(Math.round(size * factor) / factor));
  }
  if (trailingZeros === 'trim-exact' && Number.isInteger(size)) {
    return String(normalizeZero(size));
  }
  const text = normalizeZero(size).toFixed(digits);
  // `(-0.04).toFixed(1)` is `'-0.0'`; no screen should ever show a negative zero.
  return /^-0(?:\.0*)?$/.test(text) ? text.slice(1) : text;
}

/**
 * Byte quantity with an explicit unit system. `system: 'decimal'` divides by
 * 1000 and labels KB/MB; `system: 'binary'` divides by 1024 and labels
 * KiB/MiB — the label always tells the truth about the divisor.
 */
export function formatBytes<TFallback = string>(
  value: number | null | undefined,
  options: FormatBytesOptions<TFallback>,
): string | TFallback {
  // `?? '-'`가 아니라 `=== undefined`다 — `fallback: null`(mobile의 null 패스스루)이
  // 조용히 대시로 바뀌면 §0.1 #14 재현이 깨진다.
  const fallback: string | TFallback = options.fallback === undefined ? '-' : options.fallback;
  if (value === null || value === undefined || !Number.isFinite(value)) return fallback;
  if (value <= 0 && options.nonPositive === 'fallback') return fallback;

  const decimal = options.system === 'decimal';
  const units: readonly string[] = decimal ? DECIMAL_UNITS : BINARY_UNITS;
  const base = decimal ? 1000 : 1024;

  const minIndex = unitIndex(units, options.minUnit, 0);
  const maxIndex = Math.max(minIndex, unitIndex(units, options.maxUnit, units.length - 1));

  // Repeated division, not `value / base ** n`: the sources divided step by
  // step, and the two are not bit-identical in floating point.
  let size = value;
  let index = 0;
  while (index < minIndex) {
    size /= base;
    index += 1;
  }
  // The comparison is signed, so a negative value never leaves the smallest
  // unit — `-5000` stays `'-5000 B'`, which is what admin rendered.
  while (size >= base && index < maxIndex) {
    size /= base;
    index += 1;
  }

  const unit = units[index] ?? units[units.length - 1] ?? 'B';
  const trailingZeros = options.trailingZeros ?? 'keep';
  const wholeNumberFrom = options.wholeNumberFrom;
  const digits =
    index === 0 || (wholeNumberFrom !== undefined && size >= wholeNumberFrom)
      ? 0
      : digitsFor(options.fractionDigits, unit);

  return `${renderMagnitude(size, digits, trailingZeros)}${options.unitSpace ? ' ' : ''}${unit}`;
}
