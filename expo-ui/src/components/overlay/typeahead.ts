import type {
  FindTypeaheadMatchOptions,
  TypeaheadItem,
  TypeaheadMatchResult,
  TypeaheadState,
} from './types';

const DEFAULT_TYPEAHEAD_TIMEOUT_MS = 700;

export function createTypeaheadState(): TypeaheadState {
  return { query: '', lastTypedAt: null, lastMatchId: null };
}

function normalize(value: string, locale?: string | readonly string[]): string {
  // Case first: Turkish `İ` becomes `i` before decomposition. Strip combining
  // marks only from Latin bases; marks are semantic vowels in scripts such as
  // Devanagari and must not collapse distinct labels.
  const lower = locale === undefined
    ? value.toLocaleLowerCase()
    : value.toLocaleLowerCase(locale);
  let latinBase = false;
  let normalized = '';
  for (const point of lower.normalize('NFKD')) {
    if (/\p{Mark}/u.test(point)) {
      if (!latinBase) normalized += point;
      continue;
    }
    latinBase = /\p{Script=Latin}/u.test(point);
    normalized += point;
  }
  return normalized.normalize('NFC');
}

function isRepeatedInput(value: string, input: string): boolean {
  if (input.length === 0 || value.length <= input.length || value.length % input.length !== 0) {
    return false;
  }
  return input.repeat(value.length / input.length) === value;
}

function rotatedIndices(length: number, startAfter: number, includeStart: boolean): number[] {
  if (length === 0) return [];
  const first = includeStart ? Math.max(0, startAfter) : (startAfter + 1 + length) % length;
  return Array.from({ length }, (_, offset) => (first + offset) % length);
}

/** Deterministic typeahead; callers own clocks and focus movement. */
export function findTypeaheadMatch<T extends TypeaheadItem>(
  options: FindTypeaheadMatchOptions<T>,
): TypeaheadMatchResult<T> {
  if (!Number.isFinite(options.now)) throw new RangeError('now must be finite.');
  const timeoutMs = options.timeoutMs ?? DEFAULT_TYPEAHEAD_TIMEOUT_MS;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new RangeError('timeoutMs must be finite and greater than 0.');
  }

  const input = normalize(options.input, options.locale);
  if (input.length === 0) {
    return { state: options.state, match: null, matchIndex: -1 };
  }

  const expired =
    options.state.lastTypedAt === null ||
    options.now < options.state.lastTypedAt ||
    options.now - options.state.lastTypedAt > timeoutMs;
  const accumulated = expired ? input : `${options.state.query}${input}`;
  // Compare complete input tokens instead of UTF-16 units, so emoji and composed
  // scripts cycle without requiring Intl.Segmenter support from the native runtime.
  const repeated = isRepeatedInput(accumulated, input);
  const query = repeated ? input : accumulated;
  const currentId = options.state.lastMatchId ?? options.activeId ?? null;
  const currentIndex = options.items.findIndex((item) => item.id === currentId);
  const includeCurrent = !expired && !repeated && options.state.lastMatchId !== null;
  const indices = rotatedIndices(options.items.length, currentIndex, includeCurrent);

  let matchIndex = -1;
  for (const index of indices) {
    const item = options.items[index];
    if (item === undefined || item.disabled) continue;
    if (normalize(item.textValue.trimStart(), options.locale).startsWith(query)) {
      matchIndex = index;
      break;
    }
  }

  const match = matchIndex < 0 ? null : (options.items[matchIndex] ?? null);
  return {
    state: {
      query,
      lastTypedAt: options.now,
      lastMatchId: match?.id ?? options.state.lastMatchId,
    },
    match,
    matchIndex,
  };
}
