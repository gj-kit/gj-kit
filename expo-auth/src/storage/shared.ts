// Branch-shared storage rules (design doc §2.1·§3.8): key assembly, keyPrefix validation and
// the H12 convergence rule. Peer-free — both `./storage` fork files import this. The in-memory
// cache is deliberately NOT here: it is native-branch-only (§3.8 — the web branch is
// read-through because a cache would break the H2b/H3 fresh-read precondition).

import { AuthError } from '../core/errors';
import type { TokenPair, TokenPersistence } from '../core/types';

/** Options of the platform-neutral `createTokenStorage` factory (design §3.8). */
export type TokenStorageOptions = {
  /**
   * Required — e.g. `'myapp.auth'`. The predecessor leaked its host app name through a
   * hardcoded prefix; this library refuses to own any default (§4.1-①). Empty or
   * whitespace-only values throw `AuthError('invalid-key-prefix')` (§4.1-ⓐ).
   */
  readonly keyPrefix: string;
  /** Persistence mode used before any explicit choice exists. Default `'durable'`. */
  readonly defaultPersistence?: TokenPersistence | undefined;
};

/** Runtime fail-fast ⓐ (§4.1): key prefixes and lock names must carry real content. */
export function assertValidKeyPrefix(value: string): void {
  if (value.trim().length === 0) throw new AuthError('invalid-key-prefix');
}

export type TokenKeys = {
  readonly access: string;
  readonly refresh: string;
};

/**
 * Key assembly — two separate keys per pair. The split halves the exposure to the SecureStore
 * value-size limit (Android ~2KB warning — §7-4); H12 makes the resulting torn-write risk
 * converge to "signed out" instead of corruption (§7-11).
 */
export function tokenKeys(keyPrefix: string): TokenKeys {
  assertValidKeyPrefix(keyPrefix);
  return {
    access: `${keyPrefix}.accessToken`,
    refresh: `${keyPrefix}.refreshToken`,
  };
}

/**
 * H12 — a pair exists only when BOTH tokens are present and non-empty; every half state
 * converges to null ("signed out"), never to a corrupt pair.
 */
export function toTokenPair(
  access: string | null | undefined,
  refresh: string | null | undefined
): TokenPair | null {
  if (
    access === null ||
    access === undefined ||
    access.length === 0 ||
    refresh === null ||
    refresh === undefined ||
    refresh.length === 0
  ) {
    return null;
  }
  return { accessToken: access, refreshToken: refresh };
}

// §2.4 — structural minimum of the Web Storage API. The web branch compiles without the DOM
// lib; this type is how localStorage/sessionStorage are accessed through globalThis reflection.
export type WebStorageLike = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};
