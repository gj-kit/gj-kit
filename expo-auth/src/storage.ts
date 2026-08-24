// "./storage" — NATIVE branch (design doc §2.1·§3.8). This file is the single static-import
// site of expo-secure-store in the whole package (§1 invariant 3; entry-guard enforces it).
// The exports-map condition fork routes `node`/`browser` consumers to `storage.web.ts`
// instead, so the web bundle never contains SecureStore (§2.3 — the predecessor's web bundle
// did, §1 defect 3). The public signatures and the shared `storage.d.ts` are branch-invariant.

import * as SecureStore from 'expo-secure-store';

import type { TokenPair, TokenPersistence, TokenStorage } from './core/types';
import { toTokenPair, tokenKeys } from './storage/shared';

export type { TokenStorageOptions } from './storage/shared';
import type { TokenStorageOptions } from './storage/shared';
export { createWebLocksRefreshLock } from './storage/webLock';

/**
 * Platform-neutral token storage factory (design §3.8). The implementation is selected by the
 * `./storage` exports condition fork (§2.2·§2.3) — one public name, one branch-invariant
 * signature, one app-side assembly file, no `Platform.OS` branching in the consumer (§1
 * invariant 2):
 *
 * **Native branch** (Expo iOS/Android — the only graph that contains expo-secure-store):
 * - `'durable'`: two SecureStore keys — `{keyPrefix}.accessToken` / `{keyPrefix}.refreshToken`
 *   (split to dodge the Android ~2KB value-size warning, §7-4).
 * - `'session'`: removed from SecureStore and kept in factory memory only. Process exit =
 *   signed out (§7-5).
 * - In-memory cache (H10): allowed only here — a single native process has no external
 *   writer, so the cache cannot violate the §3.1 freshness clause.
 *
 * **node/browser branch** (peer-free, DOM-lib-free — §2.4):
 * - `'durable'`: localStorage. `'session'`: sessionStorage (tab-scoped). ⚠ Web storage is NOT
 *   a security boundary — any XSS on the origin can read the tokens (§7-12).
 * - `getTokens` is always a read-through (no cache) and prefers sessionStorage, and the
 *   persistence mode is derived from where a complete pair actually lives (H14).
 * - Missing localStorage/sessionStorage (SSR): memory-only fallback, no throw (§2.4).
 */
export function createTokenStorage(options: TokenStorageOptions): TokenStorage {
  const keys = tokenKeys(options.keyPrefix); // validates keyPrefix (§4.1-ⓐ)
  const defaultPersistence = options.defaultPersistence ?? 'durable';

  // Factory-owned state — the predecessor's module globals memoryTokens/memoryPersist,
  // demoted so two factories and test isolation are possible (§1 defect 2).
  let cached: TokenPair | null = null; // H10
  let knownPersistence: TokenPersistence | null = null;
  // Write generation — setTokens/clearTokens bump it (synchronously, before their native IPC
  // is awaited) so a cold read that was already in flight when the write landed can never
  // repopulate the cache with the pre-write pair. §3.1 freshness: the H10 "no external
  // writer" exemption does not cover this factory's OWN concurrent writers — a boot-time
  // getTokens racing a signIn/signOut must not resurrect the old pair.
  let generation = 0;
  let inFlightRead: Promise<TokenPair | null> | null = null;

  return {
    async getTokens() {
      // H10 — concurrent callers share one in-flight read, narrowing the stale-token race
      // window (and halving the SecureStore IPC under a cold-start burst).
      if (cached !== null) return cached;
      inFlightRead ??= (async () => {
        const startGeneration = generation;
        try {
          const [access, refresh] = await Promise.all([
            SecureStore.getItemAsync(keys.access),
            SecureStore.getItemAsync(keys.refresh),
          ]);
          if (generation !== startGeneration) {
            // A setTokens/clearTokens landed while this read was in flight — the write is
            // newer than anything we read: surface the state the writer left behind and do
            // NOT touch the cache with the stale pair.
            return cached;
          }
          const pair = toTokenPair(access, refresh); // H12
          if (pair !== null) {
            cached = pair;
            // SecureStore only ever holds durable pairs — session pairs live in memory alone.
            knownPersistence = 'durable';
          }
          return pair;
        } finally {
          inFlightRead = null;
        }
      })();
      return inFlightRead;
    },

    async setTokens(tokens, setOptions) {
      // H14 — omission keeps the current mode; a rotation after a session login never
      // silently promotes to durable.
      const persistence = setOptions?.persistence ?? knownPersistence ?? defaultPersistence;
      generation += 1; // invalidate any in-flight cold read — this write is newer
      cached = tokens;
      knownPersistence = persistence;
      if (persistence === 'session') {
        // §3.8 — session tokens are memory-only on native: remove any durable copy so a
        // restart cannot resurrect a session the user scoped to this run.
        await Promise.all([
          SecureStore.deleteItemAsync(keys.access),
          SecureStore.deleteItemAsync(keys.refresh),
        ]);
        return;
      }
      await Promise.all([
        SecureStore.setItemAsync(keys.access, tokens.accessToken),
        SecureStore.setItemAsync(keys.refresh, tokens.refreshToken),
      ]);
    },

    async clearTokens() {
      // Idempotent; resets the persistence mode to the implementation default (§3.1).
      generation += 1; // invalidate any in-flight cold read — the clear must stick
      cached = null;
      knownPersistence = null;
      await Promise.all([
        SecureStore.deleteItemAsync(keys.access),
        SecureStore.deleteItemAsync(keys.refresh),
      ]);
    },
  };
}
