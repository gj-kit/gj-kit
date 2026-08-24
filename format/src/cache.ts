/**
 * Internal: the one bounded-LRU implementation both memo tables in this package
 * use.
 *
 * Both caches memoise Intl formatters, whose construction costs milliseconds
 * while `format()` costs nothing, and both are keyed on **caller-supplied**
 * strings — an IANA zone name in {@link ./zone} and a locale tag in
 * {@link ./number}. A server that renders a per-request zone or a per-request
 * `Accept-Language` would therefore retain one formatter per distinct value for
 * the lifetime of the process if the map were unbounded. The bound is the same
 * for both tables on purpose: two policies that must agree cannot be allowed to
 * drift apart in two hand-written copies.
 */

/** Least-recently-used string map with a hard entry cap. */
export interface BoundedCache<TValue> {
  /** Reading refreshes recency, so the cap evicts the genuinely cold entry. */
  get(key: string): TValue | undefined;
  set(key: string, value: TValue): void;
  clear(): void;
}

/**
 * Real apps use a single-digit number of zones and locale/precision pairs, so
 * 32 is far above the working set while still bounding the map for a server
 * rendering arbitrary user input.
 */
export const CACHE_LIMIT = 32;

export function createBoundedCache<TValue>(limit: number = CACHE_LIMIT): BoundedCache<TValue> {
  const entries = new Map<string, TValue>();

  return {
    get(key: string): TValue | undefined {
      const value = entries.get(key);
      if (value === undefined) return undefined;
      entries.delete(key);
      entries.set(key, value);
      return value;
    },
    set(key: string, value: TValue): void {
      entries.delete(key);
      entries.set(key, value);
      if (entries.size > limit) {
        const oldest = entries.keys().next();
        if (oldest.done !== true) entries.delete(oldest.value);
      }
    },
    clear(): void {
      entries.clear();
    },
  };
}
