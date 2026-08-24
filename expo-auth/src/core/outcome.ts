// Refresh outcomes (design doc §3.4). Signing out is not an event the library fires — it is a
// typed outcome the caller interprets. The library's only responsibility past classification is
// storage cleanup on a confirmed 'invalid' (H1·H3 discipline).

import type { TokenPair } from './types';

/**
 * The five endings of `refresh()` (design §3.4). The library cleans storage where required but
 * never navigates or resets app state — that is the caller's decision.
 *
 * - `'refreshed'`: this instance performed the rotation. Persisted and rescheduled.
 * - `'adopted'`: storage now holds a valid pair **different** from the entry snapshot and that
 *   pair was adopted (H2·H2b). Rescheduled. ⚠ Adoption does NOT guarantee the same subject —
 *   another tab's signOut→sign-in-as-someone-else also appears as `'adopted'`. Hosts where
 *   account switching is possible must re-confirm the subject (e.g. re-fetch /me) after
 *   adopting (§7-13).
 * - `'signed-out'`: storage holds no refresh token (already signed out).
 * - `'invalid'`: a definitive server rejection. `tokensCleared` follows the H3 discipline —
 *   `true` only when the attempted token was still the stored one. The caller decides whether
 *   to navigate to the sign-in screen.
 * - `'transient'`: undecidable. Tokens are preserved — never a sign-out (H1). `cause` carries
 *   the value thrown by the refresh callback (§3.3 fail-safe diagnostics channel), or is
 *   `undefined` when the callback reported `'transient'` normally. Retry policy belongs to the
 *   caller (React Query and friends).
 */
export type RefreshOutcome =
  | { readonly status: 'refreshed'; readonly tokens: TokenPair }
  | { readonly status: 'adopted'; readonly tokens: TokenPair }
  | { readonly status: 'signed-out' }
  | { readonly status: 'invalid'; readonly tokensCleared: boolean }
  | { readonly status: 'transient'; readonly cause?: unknown };

/** Result of `refreshIfExpiringSoon` — the named home of the sixth ending, `'not-needed'` (§3.4·§3.5). */
export type EagerRefreshOutcome = RefreshOutcome | { readonly status: 'not-needed' };

/**
 * Exhaustive matcher over the five endings. TypeScript does not force exhaustiveness on raw
 * `switch`/`if` (§4.1-③ — `assertNever` is only an opt-in pattern), so the library ships a
 * consumption form where a missing handler key is a **compile error**.
 */
export function matchRefreshOutcome<T>(
  outcome: RefreshOutcome,
  handlers: {
    readonly refreshed: (outcome: Extract<RefreshOutcome, { status: 'refreshed' }>) => T;
    readonly adopted: (outcome: Extract<RefreshOutcome, { status: 'adopted' }>) => T;
    readonly 'signed-out': (outcome: Extract<RefreshOutcome, { status: 'signed-out' }>) => T;
    readonly invalid: (outcome: Extract<RefreshOutcome, { status: 'invalid' }>) => T;
    readonly transient: (outcome: Extract<RefreshOutcome, { status: 'transient' }>) => T;
  }
): T {
  switch (outcome.status) {
    case 'refreshed':
      return handlers.refreshed(outcome);
    case 'adopted':
      return handlers.adopted(outcome);
    case 'signed-out':
      return handlers['signed-out'](outcome);
    case 'invalid':
      return handlers.invalid(outcome);
    case 'transient':
      return handlers.transient(outcome);
  }
}
