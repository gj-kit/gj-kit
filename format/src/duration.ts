/**
 * Elapsed-time copy. The admin source took two timestamps and parsed them; this
 * takes the duration itself, so the family stays clock-free and the subtraction
 * stays at the call site where the two instants already are.
 */
export interface FormatDurationKoOptions<TFallback = string> {
  /** Rendered for NaN/negative/non-finite input. Default `'-'`. */
  readonly fallback?: TFallback | undefined;
}

/**
 * Elapsed milliseconds as Korean text: `'0.8초'`, `'5분'`, `'1.2시간'`.
 * Takes a duration, not two timestamps — clock-free like the rest of the family.
 */
export function formatDurationKo<TFallback = string>(
  milliseconds: number,
  options?: FormatDurationKoOptions<TFallback>,
): string | TFallback {
  const fallback: string | TFallback = options?.fallback === undefined ? '-' : options.fallback;
  if (!Number.isFinite(milliseconds)) return fallback;

  const seconds = milliseconds / 1000;
  if (seconds < 0) return fallback;
  if (seconds < 60) return `${seconds.toFixed(1)}초`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}분`;
  return `${(seconds / 3600).toFixed(1)}시간`;
}
