/**
 * Korean won, in the two spellings the source apps disagreed about.
 *
 * Neither spelling comes from Intl's currency rendering. That path lets the
 * locale choose the glyph and its position: German renders the symbol after the
 * amount, and Spanish renders the ISO code `KRW` outright. A call site that
 * wrote `{ style: 'symbol', locale: 'device' }` would then show a currency code
 * on a Spanish phone — exactly the class of drift this package exists to stop.
 * So the number is grouped with a decimal formatter and the `₩` glyph and the
 * `원` suffix are composed here, where they cannot move.
 */
import { decimalFormatter } from './number';
import type { FormatLocale } from './types';

export interface FormatKrwOptions<TFallback = string> {
  /**
   * Required rendering style — the source apps disagreed:
   * `'symbol'` renders `'₩1,000'`, `'suffix-ko'` renders `'1,000원'`.
   */
  readonly style: 'symbol' | 'suffix-ko';
  /**
   * Required **grouping** locale; `'device'` is the explicit opt-in to the
   * runtime default. It selects grouping and the decimal separator only — the
   * `₩` glyph, its position and the `원` suffix are fixed by this package and
   * never vary with the locale.
   */
  readonly locale: FormatLocale;
  /** Rendered for null/undefined/non-finite input. Default `'-'`. */
  readonly fallback?: TFallback | undefined;
}

/**
 * Korean won. Fractions are never shown — KRW has no minor unit, so the value is
 * rounded to whole won first (`1000.5` becomes `'₩1,001'`). Negative values put
 * the sign before the symbol (`'-₩1,000'`), and a value that rounds to zero
 * never renders a negative zero.
 */
export function formatKrw<TFallback = string>(
  value: number | null | undefined,
  options: FormatKrwOptions<TFallback>,
): string | TFallback {
  const fallback: string | TFallback = options.fallback === undefined ? '-' : options.fallback;
  if (value === null || value === undefined || !Number.isFinite(value)) return fallback;

  // Round the magnitude, then re-apply the sign: rounding half away from zero is
  // what Intl does internally, and it keeps `-2.5` at `-3` instead of `-2`.
  const magnitude = Math.round(Math.abs(value));
  const negative = value < 0 && magnitude !== 0;
  const digits = decimalFormatter(options.locale, undefined, 0).format(magnitude);

  if (options.style === 'suffix-ko') return `${negative ? '-' : ''}${digits}원`;
  return `${negative ? '-' : ''}₩${digits}`;
}
