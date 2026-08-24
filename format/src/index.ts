/**
 * `@gj-kit/format` — explicit-by-construction formatting.
 *
 * Every axis on which two consuming apps rendered the same data differently
 * (time zone, currency spelling, grouping locale, date separator, relative-time
 * copy, byte unit system, what zero bytes means) is a required option here, so
 * omitting one is a compile error rather than a silent winner.
 *
 * The public surface is exactly what this file re-exports. Everything else is
 * internal and unreachable: the package publishes a single `'.'` entry.
 */
export type { FormatDateInput, FormatTimeZone, FormatLocale } from './types';

export { FormatError, isFormatError } from './errors';
export type { FormatErrorCode } from './errors';

export { parseIsoInstant } from './parse';
export type { IsoParseOptions } from './parse';

export { canFormatTimeZone } from './zone';

export { formatDateTime, formatDateOnly, formatMonthDayTime } from './date';
export type { FormatDateOptions } from './date';

export { relativeBucket, formatRelativeKo } from './relative';
export type { FormatRelativeBucket, FormatRelativeKoOptions } from './relative';

export { formatDurationKo } from './duration';
export type { FormatDurationKoOptions } from './duration';

export { formatBytes } from './bytes';
export type {
  FormatBytesOptions,
  FormatDecimalByteUnit,
  FormatBinaryByteUnit,
} from './bytes';

export { formatKrw } from './currency';
export type { FormatKrwOptions } from './currency';

export { formatNumber, formatPercent, storageRatio } from './number';
export type { FormatNumberOptions, FormatPercentOptions } from './number';

export { formatText } from './text';
