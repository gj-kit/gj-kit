/** Stable machine-readable codes. Never emitted for data problems. */
export type FormatErrorCode =
  /** Configuration error: `timeZone` is not 'UTC' | 'device' | a zone name the
   *  runtime's Intl accepts. A programmer can fix this. */
  | 'ERR_TIMEZONE_INVALID'
  /** Configuration error: `locale` is not a tag the runtime's Intl accepts
   *  (`'ko_KR'`, `'en US'`, `'ko-KR-'`). `FormatLocale` accepts any string, so
   *  this is the runtime half of that axis. A programmer can fix this. */
  | 'ERR_LOCALE_INVALID'
  /** Configuration error: `minimumFractionDigits`/`maximumFractionDigits` is not
   *  an integer in 0–100, or the minimum exceeds the maximum. A programmer can
   *  fix this. */
  | 'ERR_FRACTION_DIGITS_INVALID'
  /** Environment error: the runtime's Intl failed this package's self-test —
   *  it ignores the `timeZone` option, or ignores `hourCycle`/`hour12`.
   *  A programmer cannot fix this; ask {@link canFormatTimeZone} up front. */
  | 'ERR_INTL_UNUSABLE'
  /** Environment error: a single-field formatter produced a non-numeric or
   *  out-of-range string for this specific zone. */
  | 'ERR_INTL_FIELD_OUTPUT';

/**
 * Cross-realm brand. Dual ESM+CJS bundles can load this class twice in one
 * runtime, which makes `instanceof` unreliable for consumers; the branded
 * property survives that, so {@link isFormatError} keeps working.
 */
const FORMAT_ERROR_BRAND = Symbol.for('gj-kit.format.error');

/**
 * Thrown for configuration and environment errors only. Data problems — null,
 * invalid dates, NaN, unparsable strings — never throw; they render `fallback`.
 */
export class FormatError extends Error {
  readonly code: FormatErrorCode;

  constructor(code: FormatErrorCode, message: string) {
    super(message);
    this.name = 'FormatError';
    this.code = code;
    Object.defineProperty(this, FORMAT_ERROR_BRAND, {
      value: true,
      enumerable: false,
      writable: false,
      configurable: false,
    });
  }
}

/** Type guard usable across realms/bundles. */
export function isFormatError(value: unknown): value is FormatError {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as Record<symbol, unknown>)[FORMAT_ERROR_BRAND] === true
  );
}
