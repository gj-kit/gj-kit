/**
 * Accepted date inputs: an instant, never a wall-clock string.
 *
 * Strings are deliberately absent. `new Date('2026-06-08T09:05:00')` resolves
 * an offset-less string against the *device* zone, so the same API payload
 * becomes a different instant on different phones — and no `timeZone` option
 * can undo that, because it happened before the formatter saw the value.
 * Parse strings with {@link parseIsoInstant}, which makes that choice explicit.
 *
 * A number is epoch milliseconds.
 */
export type FormatDateInput = Date | number;

/**
 * Explicit time zone selector. There is deliberately no default:
 * - `'UTC'`        — UTC wall clock (no Intl involved).
 * - `'device'`     — the runtime's local time (no Intl involved). This is an
 *                    explicit opt-in, not a silent fallback: the dependency on
 *                    device state is visible at every call site.
 * - IANA zone name — e.g. `'Asia/Seoul'`; resolved via `Intl.DateTimeFormat`.
 *                    An unknown name throws `FormatError('ERR_TIMEZONE_INVALID')`.
 *                    Ask {@link canFormatTimeZone} first if the runtime's Intl
 *                    is not known to be healthy.
 */
export type FormatTimeZone = 'UTC' | 'device' | (string & {});

/**
 * Explicit locale selector for the Intl-backed formatters.
 *
 * It selects **digit grouping and the decimal separator only**. Currency
 * symbols, symbol position and the percent sign are pinned by this package and
 * do not vary with the locale — see {@link formatKrw} and {@link formatPercent}.
 * `'device'` opts into the runtime default locale (grouping then varies by
 * device settings — an explicit, visible choice).
 */
export type FormatLocale = 'device' | (string & {}) | readonly string[];
