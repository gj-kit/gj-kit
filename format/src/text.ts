/**
 * The single non-numeric formatter: an empty-cell placeholder.
 *
 * The input type is narrowed from the source's `unknown` on purpose. In the
 * source that `unknown` travelled with a `Number(value || 0)` coercion in the
 * neighbouring formatters, which rendered "unknown" as a hard zero.
 */
export function formatText(
  value: string | number | null | undefined,
  fallback: string = '-',
): string {
  return value === null || value === undefined || value === '' ? fallback : String(value);
}
