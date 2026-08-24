// createMemoryTokenStorage (design doc §5.1) — the in-memory TokenStorage every unit scenario
// runs on, plus the cross-tab simulators that are the only way to reproduce H2/H2b/H3.

import type { TokenPair, TokenPersistence, TokenStorage } from '../core/types';

/** In-memory {@link TokenStorage} with cross-tab simulators. Practical in SSR and app tests too. */
export type MemoryTokenStorage = TokenStorage & {
  /** Simulate another tab's rotation — the only way to reproduce the H2/H2b/H3 scenarios. */
  simulateExternalRotation(tokens: TokenPair): void;
  /** Simulate another tab clearing storage (sign-out elsewhere). */
  simulateExternalClear(): void;
  /** Observability: the current persistence mode (asserting H14 stickiness). */
  readonly persistence: TokenPersistence;
  /** Observability: number of underlying reads (asserting H2b/H3 re-read counts and H10 caching). */
  readonly readCount: number;
};

/**
 * Create an in-memory token storage (design §5.1). Reads are always read-through (a
 * `simulateExternalRotation` is visible to the very next `getTokens` — the §3.1 freshness
 * clause), `setTokens` without `persistence` keeps the current mode (H14), and `clearTokens`
 * resets the mode to `'durable'`, the implementation default.
 */
export function createMemoryTokenStorage(initial?: {
  readonly tokens?: TokenPair | undefined;
  readonly persistence?: TokenPersistence | undefined;
}): MemoryTokenStorage {
  let tokens: TokenPair | null = initial?.tokens ?? null;
  let persistence: TokenPersistence = initial?.persistence ?? 'durable';
  let readCount = 0;

  return {
    async getTokens() {
      readCount += 1;
      return tokens;
    },
    async setTokens(next, options) {
      // H14 — omission keeps the current mode.
      if (options?.persistence !== undefined) persistence = options.persistence;
      tokens = next;
    },
    async clearTokens() {
      tokens = null;
      persistence = 'durable';
    },
    simulateExternalRotation(next) {
      tokens = next;
    },
    simulateExternalClear() {
      tokens = null;
    },
    get persistence() {
      return persistence;
    },
    get readCount() {
      return readCount;
    },
  };
}
