/**
 * Grouped numbers, percentages, and the storage-ratio arithmetic they pair with.
 *
 * Every Intl call in this module is the same one: a decimal formatter. The
 * package never asks Intl for a currency or percentage rendering, because those
 * let locale data move and re-glyph the symbol — see {@link formatKrw} and
 * {@link formatPercent}.
 */
import { CACHE_LIMIT, createBoundedCache } from './cache';
import { FormatError } from './errors';
import type { FormatLocale } from './types';

/** `'device'` means "no locale argument": the runtime default is used. */
function localeArgument(locale: FormatLocale): string | string[] | undefined {
  if (locale === 'device') return undefined;
  if (typeof locale === 'string') return locale;
  return [...locale];
}

function describeLocale(locale: FormatLocale): string {
  if (typeof locale === 'string') return `'${locale}'`;
  return `[${locale.map((tag) => `'${tag}'`).join(', ')}]`;
}

function cacheKey(
  locale: FormatLocale,
  minimumFractionDigits: number | undefined,
  maximumFractionDigits: number | undefined,
): string {
  const localeKey = typeof locale === 'string' ? locale : locale.join(',');
  return `${localeKey} ${minimumFractionDigits ?? ''} ${maximumFractionDigits ?? ''}`;
}

/**
 * Bounded for the same reason the zone cache is: `FormatLocale` accepts any
 * string, so the key space belongs to the caller — see {@link ./cache}.
 */
const formatterCache = createBoundedCache<Intl.NumberFormat>(CACHE_LIMIT);

/** ECMA-402's accepted range for both fraction-digit options. */
const MAX_FRACTION_DIGITS = 100;

/**
 * Configuration errors are typed (§1-3): the three-category contract says a
 * programmer mistake surfaces as {@link FormatError}, never as a bare
 * `RangeError` from inside Intl that `isFormatError` reports as false.
 */
function assertFractionDigits(
  minimumFractionDigits: number | undefined,
  maximumFractionDigits: number | undefined,
): void {
  const bounds = [
    ['minimumFractionDigits', minimumFractionDigits],
    ['maximumFractionDigits', maximumFractionDigits],
  ] as const;

  for (const [name, digits] of bounds) {
    if (digits === undefined) continue;
    if (!Number.isInteger(digits) || digits < 0 || digits > MAX_FRACTION_DIGITS) {
      throw new FormatError(
        'ERR_FRACTION_DIGITS_INVALID',
        `${name} must be an integer between 0 and ${MAX_FRACTION_DIGITS}; received ${String(digits)}.`,
      );
    }
  }

  if (
    minimumFractionDigits !== undefined &&
    maximumFractionDigits !== undefined &&
    minimumFractionDigits > maximumFractionDigits
  ) {
    throw new FormatError(
      'ERR_FRACTION_DIGITS_INVALID',
      `minimumFractionDigits (${minimumFractionDigits}) cannot exceed maximumFractionDigits (${maximumFractionDigits}).`,
    );
  }
}

/**
 * Internal: the package's only number formatter. Construction is expensive and
 * `format()` is not, so instances are memoised per locale/precision pair.
 */
export function decimalFormatter(
  locale: FormatLocale,
  minimumFractionDigits: number | undefined,
  maximumFractionDigits: number | undefined,
): Intl.NumberFormat {
  assertFractionDigits(minimumFractionDigits, maximumFractionDigits);

  const key = cacheKey(locale, minimumFractionDigits, maximumFractionDigits);
  const cached = formatterCache.get(key);
  if (cached !== undefined) return cached;

  let created: Intl.NumberFormat;
  try {
    created = new Intl.NumberFormat(localeArgument(locale), {
      style: 'decimal',
      ...(minimumFractionDigits === undefined ? {} : { minimumFractionDigits }),
      ...(maximumFractionDigits === undefined ? {} : { maximumFractionDigits }),
    });
  } catch (cause) {
    // Fraction digits were validated above and `'device'` passes no argument at
    // all, so what is left is the tag itself: `FormatLocale` accepts any string
    // and a malformed one ('ko_KR', 'en US', 'ko-KR-') makes the constructor
    // throw. The engine's own message is kept — it is the only part of this
    // that is engine-specific.
    throw new FormatError(
      'ERR_LOCALE_INVALID',
      `Invalid locale ${describeLocale(locale)}: ${cause instanceof Error ? cause.message : String(cause)}`,
    );
  }
  formatterCache.set(key, created);
  return created;
}

/** `-0` is normalised to `0` everywhere in this package. */
export function normalizeZero(value: number): number {
  return Object.is(value, -0) ? 0 : value;
}

/**
 * The same rule applied **after** rounding, which is the only place it can be
 * applied honestly: `-0.0001` is not `-0`, but a formatter asked for whole
 * percent renders it as one, and `'-0%'` on a screen is a bug in every locale.
 *
 * Intl rounds half away from zero, so a magnitude strictly below half a unit in
 * the last rendered place renders as all zeros — that comparison is exact for
 * the digit counts this package allows, so the sign is dropped for precisely
 * the values Intl is about to flatten. The sign is never composed here: the
 * signed value still goes to Intl, so the locale keeps deciding which minus
 * glyph to use (`sv-SE` uses U+2212, not the ASCII hyphen).
 *
 * Siblings do the same thing in the shape their rounding allows —
 * {@link formatKrw} re-applies the sign only to a non-zero magnitude, and
 * `formatBytes` strips a `'-0.0'` produced by `toFixed`.
 */
function normalizeRenderedZero(value: number, maximumFractionDigits: number): number {
  if (Math.abs(value) < 0.5 / 10 ** maximumFractionDigits) return 0;
  return normalizeZero(value);
}

export interface FormatNumberOptions<TFallback = string> {
  /** Required grouping locale; `'device'` opts into the runtime default. */
  readonly locale: FormatLocale;
  /** Default: Intl's own default (max 3). */
  readonly maximumFractionDigits?: number | undefined;
  readonly minimumFractionDigits?: number | undefined;
  /** Rendered for null/undefined/non-finite input. Default `'-'`. */
  readonly fallback?: TFallback | undefined;
}

/**
 * Locale-grouped plain number (`12,345`). Deliberately NOT a passthrough to
 * Intl's own option bag — only Hermes-safe options are accepted.
 *
 * A locale the runtime's Intl rejects throws `FormatError('ERR_LOCALE_INVALID')`
 * and out-of-range fraction digits throw `FormatError('ERR_FRACTION_DIGITS_INVALID')`
 * — configuration errors, never data errors (§1-3).
 */
export function formatNumber<TFallback = string>(
  value: number | null | undefined,
  options: FormatNumberOptions<TFallback>,
): string | TFallback {
  const fallback: string | TFallback = options.fallback === undefined ? '-' : options.fallback;
  if (value === null || value === undefined || !Number.isFinite(value)) return fallback;
  const { minimumFractionDigits, maximumFractionDigits } = options;
  // Intl's own default cap is 3, or the minimum when that is larger.
  const renderedDigits = maximumFractionDigits ?? Math.max(minimumFractionDigits ?? 0, 3);
  return decimalFormatter(options.locale, minimumFractionDigits, maximumFractionDigits).format(
    normalizeRenderedZero(value, renderedDigits),
  );
}

/** Usage as a 0-1 fraction, or null when the limit is missing/zero/invalid.
 *  Arithmetic, not rendering — pair it with {@link formatPercent}. */
export function storageRatio(
  used: number | null | undefined,
  limit: number | null | undefined,
): number | null {
  // `|| 0` rather than `?? 0` on purpose: it reproduces the source coercion,
  // where NaN and null alike collapse to zero before the finite check.
  const usedNumber = used || 0;
  const limitNumber = limit || 0;
  if (!Number.isFinite(usedNumber) || !Number.isFinite(limitNumber) || limitNumber <= 0) {
    return null;
  }
  return Math.min(1, usedNumber / limitNumber);
}

export interface FormatPercentOptions<TFallback = string> {
  /** Required grouping locale — grouping and decimal separator only. */
  readonly locale: FormatLocale;
  /** Exact fraction digits. Default 0 (`'63%'`). */
  readonly fractionDigits?: 0 | 1 | 2 | undefined;
  /** Rendered for null/undefined/non-finite input. Default `'-'`. */
  readonly fallback?: TFallback | undefined;
}

/**
 * A 0-1 fraction as a percentage: `0.63` becomes `'63%'`. Closes the
 * {@link storageRatio} to screen pipe inside this package.
 *
 * The `%` sign is a literal suffix with no space, pinned like the `₩` glyph in
 * {@link formatKrw}. Intl's own percentage rendering moves the sign and inserts
 * a no-break space in some locales (French renders `63` then a space then `%`),
 * which is exactly the drift this package refuses to inherit.
 *
 * A ratio that rounds to zero renders `'0%'` — never `'-0%'`, whichever side of
 * zero it came from.
 */
export function formatPercent<TFallback = string>(
  ratio: number | null | undefined,
  options: FormatPercentOptions<TFallback>,
): string | TFallback {
  const fallback: string | TFallback = options.fallback === undefined ? '-' : options.fallback;
  if (ratio === null || ratio === undefined || !Number.isFinite(ratio)) return fallback;
  const digits = options.fractionDigits ?? 0;
  const scaled = normalizeRenderedZero(ratio * 100, digits);
  return `${decimalFormatter(options.locale, digits, digits).format(scaled)}%`;
}
