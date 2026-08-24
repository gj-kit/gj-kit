// "./storage" — node/browser branch (design doc §2.1·§3.8). Peer-free and DOM-lib-free: web
// storage is reached through structural types + globalThis reflection (§2.4), so this file
// compiles under lib:["ES2022"] and the shared storage.d.ts stays branch-invariant (§2.3).
// This file is NOT a subpath — the exports condition fork routes `./storage` here for
// `node`/`browser` consumers; `@gj-kit/expo-auth/storage.web` cannot be imported.

import type { TokenPair, TokenPersistence, TokenStorage } from './core/types';
import { toTokenPair, tokenKeys, type WebStorageLike } from './storage/shared';

export type { TokenStorageOptions } from './storage/shared';
import type { TokenStorageOptions } from './storage/shared';
export { createWebLocksRefreshLock } from './storage/webLock';

function resolveWebStorage(name: 'localStorage' | 'sessionStorage'): WebStorageLike | null {
  try {
    const candidate = (globalThis as Record<string, unknown>)[name];
    if (
      typeof candidate === 'object' &&
      candidate !== null &&
      typeof (candidate as WebStorageLike).getItem === 'function' &&
      typeof (candidate as WebStorageLike).setItem === 'function' &&
      typeof (candidate as WebStorageLike).removeItem === 'function'
    ) {
      return candidate as WebStorageLike;
    }
    return null;
  } catch {
    // Some sandboxed documents throw on storage access — treat as absent (§2.4).
    return null;
  }
}

// §2.4 — storage-less environments (SSR render passes, plain node) degrade to memory-only
// instead of throwing (preserves the predecessor's `typeof localStorage === "undefined"` guard).
function createMemoryWebStorage(): WebStorageLike {
  const entries = new Map<string, string>();
  return {
    getItem: (key) => entries.get(key) ?? null,
    setItem: (key, value) => {
      entries.set(key, value);
    },
    removeItem: (key) => {
      entries.delete(key);
    },
  };
}

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
  const durable = resolveWebStorage('localStorage') ?? createMemoryWebStorage();
  const session = resolveWebStorage('sessionStorage') ?? createMemoryWebStorage();

  const readFrom = (store: WebStorageLike): TokenPair | null =>
    toTokenPair(store.getItem(keys.access), store.getItem(keys.refresh)); // H12

  const removeFrom = (store: WebStorageLike): void => {
    store.removeItem(keys.access);
    store.removeItem(keys.refresh);
  };

  // H14 — the current mode is derived from where a complete pair actually lives.
  const currentPersistence = (): TokenPersistence => {
    if (readFrom(session) !== null) return 'session';
    if (readFrom(durable) !== null) return 'durable';
    return defaultPersistence;
  };

  return {
    async getTokens() {
      // §3.8 — session first, then durable; always read-through (H2b/H3 freshness).
      return readFrom(session) ?? readFrom(durable);
    },

    async setTokens(tokens, setOptions) {
      const persistence = setOptions?.persistence ?? currentPersistence(); // H14
      if (persistence === 'session') {
        removeFrom(durable);
        session.setItem(keys.access, tokens.accessToken);
        session.setItem(keys.refresh, tokens.refreshToken);
        return;
      }
      removeFrom(session);
      durable.setItem(keys.access, tokens.accessToken);
      durable.setItem(keys.refresh, tokens.refreshToken);
    },

    async clearTokens() {
      // Idempotent; with no pair left anywhere the derived mode falls back to the default (§3.1).
      removeFrom(session);
      removeFrom(durable);
    },
  };
}
