// Core seams (design doc §3.1–§3.3). This module — like everything reachable from the
// "." entry — imports no react/react-native/expo-* module and references no DOM global
// (design §1 invariant 1; enforced by entry-guard and by tsconfig.json's lib:["ES2022"]).

/** An access/refresh token pair. Both members are required — half states never leave storage (H12). */
export type TokenPair = {
  readonly accessToken: string;
  readonly refreshToken: string;
};

/**
 * Where tokens survive to (design §3.1).
 *
 * - `'durable'`: survives restarts and revisits (native SecureStore / web localStorage).
 * - `'session'`: session-scoped. ⚠ The scope differs per platform (design §7-5): on web it is
 *   the tab (sessionStorage); on native it is the process — tokens live in memory only and a
 *   process restart signs the user out. See the README platform table.
 */
export type TokenPersistence = 'durable' | 'session';

/**
 * Storage seam (design §3.1). Implementation contract:
 *
 * - `getTokens` returns a pair only when BOTH tokens are present; half states converge to
 *   `null` (H12 — a torn write reads as "signed out", never as corrupt data).
 * - `getTokens` **freshness**: inside the refresh critical section (§3.5) a read must reflect
 *   the last write committed by any other tab/instance — the precondition of the H2b adoption
 *   and the H3 comparison. An in-memory cache is only allowed where no external writer exists
 *   (native single process — §3.8); the web implementation is read-through.
 * - `setTokens` with `persistence` omitted keeps the current mode (H14 — a rotation after a
 *   session login must not silently promote tokens to durable). The initial default is
 *   implementation-defined.
 * - `clearTokens` is idempotent and resets the persistence mode to the implementation default.
 * - No method may throw an error whose message contains a token string (§4.2).
 */
export interface TokenStorage {
  getTokens(): Promise<TokenPair | null>;
  setTokens(
    tokens: TokenPair,
    options?: { readonly persistence?: TokenPersistence | undefined }
  ): Promise<void>;
  clearTokens(): Promise<void>;
}

/**
 * Serializes the refresh critical section across tabs/instances (H5, design §3.2).
 * The web default implementation is `createWebLocksRefreshLock` from `"./storage"` (§3.8),
 * which falls back to direct execution where the Web Locks API is unavailable.
 */
export interface RefreshLock {
  acquire<T>(run: () => Promise<T>): Promise<T>;
}

/**
 * All time dependencies of the proactive-refresh scheduler (design §3.2). The default
 * implementation uses `Date.now` plus timers obtained via `globalThis` reflection — the core
 * never references the global `setTimeout` identifier, because `lib:["ES2022"]` does not have
 * it and the typecheck would fail (design §2.4).
 */
export interface AuthClock {
  nowMs(): number;
  setTimeout(callback: () => void, delayMs: number): unknown;
  clearTimeout(handle: unknown): void;
}

/**
 * The host calls its own HTTP stack against its refresh endpoint and translates the response
 * into this three-way classification (design §3.3):
 *
 * - `'rotated'`: the server issued a new token pair. `tokens` is required — omitting it is a
 *   compile error (§4.1-②).
 * - `'invalid'`: a definitive rejection (401/403 — token revoked or expired). The session ended.
 * - `'transient'`: the server could not decide (network error, 5xx, CORS, timeout). The tokens
 *   may still be valid.
 *
 * ⚠ If the callback throws, the core treats it as `{ status: 'transient', cause: <thrown value> }`:
 * a classifier bug must not fail toward signing the user out (fail-safe in the H1 direction),
 * and the thrown value is preserved as `cause` so it is never silently swallowed — it flows to
 * the caller's return value and to `onScheduledOutcome`, letting host telemetry distinguish a
 * classifier bug from network flapping (§3.4). `cause` is a structured field; the library never
 * stringifies it, so this does not conflict with §4.2.
 */
export type RefreshRequestResult =
  | {
      readonly status: 'rotated';
      readonly tokens: TokenPair;
      /** Access-token lifetime in seconds, as stated by the server. When present it takes priority over JWT `exp` decoding (§3.6). */
      readonly accessTtlSeconds?: number | undefined;
    }
  | { readonly status: 'invalid' }
  | { readonly status: 'transient' };

/** The host-owned refresh callback (design §3.3). */
export type RefreshRequest = (
  input: { readonly refreshToken: string }
) => Promise<RefreshRequestResult>;
