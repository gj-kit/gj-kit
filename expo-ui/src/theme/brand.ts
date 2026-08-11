/**
 * (internal) Brand imprinting — design doc §3.1.
 *
 * Inherits the technique settled on in toss-payments core/brand.ts:
 * - `Symbol`, not `Symbol.for` — blocks forgery through the global symbol registry.
 * - Record imprinting (`{ [K in Name]: true }`) — literal imprinting was rejected
 *   after it was measured collapsing to never when brands intersect
 *   (toss-payments Phase 0).
 *
 * No entry re-exports this module. The symbol and the Brand type never leave the
 * package, so a branded value cannot be manufactured from outside without `as`.
 */
const brand: unique symbol = Symbol('gj-kit/expo-ui#brand');

export type Brand<Name extends string> = {
  readonly [brand]: { readonly [K in Name]: true };
};

/** (internal) The single place that imprints the brand onto an already validated and merged value. */
export function stamp<T>(value: unknown): T {
  // 브랜드 부여의 유일한 경로 — createTheme/createThemes만 이 함수를 호출한다.
  return value as T;
}
