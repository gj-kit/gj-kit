// createAuthSession (design doc §3.5) — single-flight, cross-tab lock, retry-once, scheduler.
// This module ports the refresh machinery of the predecessor client.ts:176-343 while removing
// its four module-global mutables and its endpoint/error-vocabulary/telemetry coupling (§1).

import { AuthError } from './errors';
import { decodeJwtExpiryEpochSeconds } from './jwt';
import type { EagerRefreshOutcome, RefreshOutcome } from './outcome';
import type {
  AuthClock,
  RefreshLock,
  RefreshRequest,
  RefreshRequestResult,
  TokenPair,
  TokenPersistence,
  TokenStorage,
} from './types';

// H7 — the predecessor's constants (client.ts:22-24), kept as defaults.
const DEFAULT_LEAD_SECONDS = 90;
const DEFAULT_MIN_DELAY_MS = 30_000;
const DEFAULT_FALLBACK_TTL_SECONDS = 14 * 60;
// §3.5 — new: cap for the consecutive-transient exponential backoff (§7-8 self-DoS fix).
const DEFAULT_TRANSIENT_MAX_DELAY_MS = 300_000;
// H9 — the predecessor's foreground-return threshold (client.ts:315).
const DEFAULT_EAGER_THRESHOLD_SECONDS = 120;
// Platform timers store the delay as a 32-bit signed int (Node and browsers alike): anything
// above 2^31−1 ms (~24.86 days) overflows into an (effectively) immediate fire, which would
// turn a long-lived access token (server accessTtlSeconds, a far-future JWT exp, or a device
// clock set into the past) into an immediate-refresh hot loop — the exact self-DoS the §7-8
// backoff exists to prevent, reachable through the success path. Delays are clamped to the
// platform max; each fire recomputes the TTL from current state, so longer horizons stay
// correct through re-arming.
const MAX_TIMER_DELAY_MS = 2 ** 31 - 1;

/** Proactive-refresh scheduling knobs (design §3.5). All defaults preserve H7. */
export type RefreshScheduleOptions = {
  /** How many seconds before expiry to refresh. Default 90 (H7). */
  readonly leadSeconds?: number | undefined;
  /** Minimum timer delay. Default 30_000 (H7 — prevents instant re-fire storms for nearly expired tokens). */
  readonly minDelayMs?: number | undefined;
  /** Assumed TTL in seconds when the expiry is unknown. Default 840 = 14 minutes (H7). */
  readonly fallbackTtlSeconds?: number | undefined;
  /**
   * Cap (ms) for the exponential backoff of consecutive `'transient'` retries. Default 300_000
   * (5 minutes). The n-th consecutive transient retries after
   * `min(minDelayMs × 2^(n−1), transientMaxDelayMs)`; the counter resets on
   * `'refreshed'`/`'adopted'`/`signIn` — this replaces the predecessor's fixed-30s infinite
   * retry loop, which was a self-DoS against the auth endpoint (§7-8).
   */
  readonly transientMaxDelayMs?: number | undefined;
};

export type AuthSessionOptions = {
  readonly storage: TokenStorage;
  readonly refresh: RefreshRequest;
  /** Cross-tab serialization (H5). When omitted, only the in-instance single flight applies (sufficient on native). */
  readonly lock?: RefreshLock | undefined;
  /** Defaults to the system clock. Tests inject `createManualClock` from `"./testing"` (§5.1). */
  readonly clock?: AuthClock | undefined;
  /**
   * Access token → remaining lifetime in seconds, or null when unknown. Defaults to the
   * strategy based on {@link decodeJwtExpiryEpochSeconds}. Hosts with opaque (non-JWT) tokens
   * supply their own strategy here.
   */
  readonly accessTokenTtlSeconds?: ((accessToken: string) => number | null) | undefined;
  readonly schedule?: RefreshScheduleOptions | undefined;
  /**
   * Notification of outcomes for refreshes the scheduler performed in the background. Not
   * called for caller-initiated `refresh()` (that caller already knows via the return value).
   * On `'invalid'` it is the host's call whether to navigate to sign-in — the library hands an
   * outcome here too, it does not "fire a logout event". `'transient'` carries `cause` (the
   * callback-throw diagnostic, §3.4) — the telemetry's only window into classifier bugs.
   */
  readonly onScheduledOutcome?: ((outcome: RefreshOutcome) => void) | undefined;
};

/**
 * An auth session (design §3.5): storage binding (signIn/signOut), single-flight refresh with
 * cross-tab adoption, retry-once request wrapping and the proactive refresh scheduler.
 *
 * ⚠ The single flight is **per instance** — create exactly one per app (a module-scope
 * singleton is the recommended shape, §7-6).
 */
export interface AuthSession {
  /** The stored access token (bearer injection belongs to the app's HTTP layer — §6-1). */
  getAccessToken(): Promise<string | null>;
  getTokens(): Promise<TokenPair | null>;

  /**
   * Persist tokens and schedule the proactive refresh. (Calling the login API is app-owned.)
   *
   * - `persistence` is **required**: `clearTokens`/`signOut` reset the mode to the
   *   implementation default, so an optional here would let "session login → signOut →
   *   option-less re-login" silently promote to durable — betraying the shared-PC user who
   *   chose a session login. The library does not know the product's persistence policy, so a
   *   default would be a lie (§4.1-⑥). Only internal rotations use the mode-sticky omission
   *   (H14).
   * - `accessTtlSeconds`: the login response's `expires_in` — first-priority TTL source for
   *   the initial schedule (§3.5 priority ①).
   */
  signIn(
    tokens: TokenPair,
    options: {
      readonly persistence: TokenPersistence;
      readonly accessTtlSeconds?: number | undefined;
    }
  ): Promise<void>;
  /** Cancel the schedule and clear tokens. Idempotent. */
  signOut(): Promise<void>;

  /**
   * Single flight (H4): concurrent calls on this instance share one in-flight result. With a
   * lock, the critical section is serialized across tabs (H5). After acquiring the lock the
   * storage is re-read: if it was already rotated the pair is adopted without consuming it
   * (H2b), and after a failed request a re-read that finds a rotation also adopts (H2).
   * A `'rotated'` result is persisted only while the attempted pair is still the stored one
   * (the H3 discipline applied to the success path): a signOut/signIn or another tab's write
   * that raced the in-flight request wins — the outcome becomes `'signed-out'`/`'adopted'`
   * and the stale rotation is discarded. `'refreshed'`/`'adopted'` return only after
   * rescheduling completed.
   *
   * Lock-boundary invariant (§3.5): the critical section spans from the post-lock re-read
   * (H2b) through persisting the result — `setTokens` for `'rotated'`, `clearTokens` for a
   * confirmed invalid (H3) — and the lock is NOT released before persistence completes.
   * Releasing earlier would let the next tab's post-lock re-read observe the pre-rotation
   * state and replay a consumed single-use token.
   */
  refresh(): Promise<RefreshOutcome>;

  /**
   * Eager refresh on foreground return (H9). Refreshes only when the remaining lifetime is
   * ≤ `thresholdSeconds` (default 120). When the lifetime is unknown (non-JWT and no strategy)
   * it returns `'not-needed'` — preserving the predecessor's behavior. The return union is the
   * named type {@link EagerRefreshOutcome} (§3.4).
   */
  refreshIfExpiringSoon(
    options?: { readonly thresholdSeconds?: number | undefined }
  ): Promise<EagerRefreshOutcome>;

  /**
   * 401 → refresh → retry exactly once (H6), structurally: the retry execution cannot re-enter
   * the refresh path (the predecessor's `allowRefresh` boolean recursion is unrepresentable).
   * `run` receives the access token current at each attempt (an expired header can never be
   * replayed — H6). Flow: `run(current token)` → it throws `e` → if
   * `shouldRetryAfterRefresh(e)` and a token existed, `refresh()` → on
   * `'refreshed'`/`'adopted'` run once with the new token — that result is final (value or
   * throw). Any other outcome (`'invalid'`/`'transient'`/`'signed-out'`) rethrows the original
   * `e` — on transient the tokens are untouched, so upstream retry policy takes over (H1).
   */
  runAuthorized<T>(
    run: (accessToken: string | null) => Promise<T>,
    options: {
      /** Classifies "expired 401" in the app's error vocabulary. Required — no default (§4.1-④). */
      readonly shouldRetryAfterRefresh: (error: unknown) => boolean;
    }
  ): Promise<T>;

  /**
   * (Re)arm the proactive refresh timer from the stored tokens. Hosts call this right after
   * boot restore. Empty storage cancels instead of arming — the fallback TTL applies only to
   * a present token whose expiry is unknown, so a never-signed-in app gets no timer and no
   * spurious background `'signed-out'` outcome.
   */
  scheduleRefresh(): Promise<void>;
  cancelScheduledRefresh(): void;

  /** Release the timer; every later method call throws `AuthError('session-disposed')`. */
  dispose(): void;
}

// §2.4 — structural timer host obtained by globalThis reflection. The handle type is `unknown`
// so nothing leaks into the d.ts, and a direct global setTimeout reference in this file would
// fail the lib:["ES2022"] typecheck by construction.
type TimerHostLike = {
  setTimeout(callback: () => void, delayMs: number): unknown;
  clearTimeout(handle: unknown): void;
};

function createSystemClock(): AuthClock {
  const host = globalThis as unknown as TimerHostLike;
  return {
    nowMs: () => Date.now(),
    setTimeout: (callback, delayMs) => host.setTimeout(callback, delayMs),
    clearTimeout: (handle) => {
      host.clearTimeout(handle);
    },
  };
}

/** Internal result of the critical section — carries the server-authoritative TTL out of the lock. */
type CriticalResult = {
  readonly outcome: RefreshOutcome;
  readonly serverTtlSeconds: number | null;
};

/**
 * Create an auth session (design §3.5). The name is `createAuthSession`, not
 * `createTokenRefreshCoordinator`: the returned object owns storage binding and the scheduler
 * lifecycle, not just refresh coordination.
 */
export function createAuthSession(options: AuthSessionOptions): AuthSession {
  const storage = options.storage;
  const refreshRequest = options.refresh;
  const lock = options.lock;
  const clock = options.clock ?? createSystemClock();
  const leadSeconds = options.schedule?.leadSeconds ?? DEFAULT_LEAD_SECONDS;
  const minDelayMs = options.schedule?.minDelayMs ?? DEFAULT_MIN_DELAY_MS;
  const fallbackTtlSeconds = options.schedule?.fallbackTtlSeconds ?? DEFAULT_FALLBACK_TTL_SECONDS;
  const transientMaxDelayMs =
    options.schedule?.transientMaxDelayMs ?? DEFAULT_TRANSIENT_MAX_DELAY_MS;
  const onScheduledOutcome = options.onScheduledOutcome;
  const ttlStrategy = options.accessTokenTtlSeconds;

  // Instance-owned state — the predecessor's module globals, demoted (§1 defect 2).
  let disposed = false;
  let inFlight: Promise<RefreshOutcome> | null = null; // H4
  let timerHandle: unknown = null;
  let transientStreak = 0; // §3.5 backoff counter
  // signIn/signOut write to storage WITHOUT entering the refresh lock (they must never wait
  // on an in-flight network request). The epoch + settled-mirror pair lets the critical
  // section detect such an instance-local write and wait for it to land before deciding what
  // to persist — a rotation completing after signOut must not resurrect the session, and a
  // rotation completing after a re-login must not overwrite the new account's pair.
  let localWriteEpoch = 0;
  let lastLocalWrite: Promise<void> = Promise.resolve();

  function trackLocalWrite(write: Promise<void>): Promise<void> {
    localWriteEpoch += 1;
    lastLocalWrite = write.then(
      () => undefined,
      () => undefined // the caller surfaces the raw rejection; this mirror only sequences
    );
    return write;
  }

  function assertNotDisposed(): void {
    if (disposed) throw new AuthError('session-disposed');
  }

  // TTL priority ② — strategy (default: unverified JWT exp decode, §3.6) — and ③ fallback
  // is applied by armFromTtl.
  function ttlOfAccessToken(accessToken: string): number | null {
    if (ttlStrategy !== undefined) return ttlStrategy(accessToken);
    const exp = decodeJwtExpiryEpochSeconds(accessToken);
    if (exp === null) return null;
    return exp - Math.floor(clock.nowMs() / 1000);
  }

  async function ttlFromStorage(): Promise<number | null> {
    const tokens = await storage.getTokens();
    if (tokens === null) return null;
    return ttlOfAccessToken(tokens.accessToken);
  }

  function cancelTimer(): void {
    if (timerHandle !== null) {
      clock.clearTimeout(timerHandle);
      timerHandle = null;
    }
  }

  function armTimer(delayMs: number): void {
    cancelTimer();
    if (disposed) return;
    // MAX_TIMER_DELAY_MS clamp — a raw delay past 2^31−1 ms would overflow the platform's
    // 32-bit timer into an immediate fire and re-arm the same overflow: a hot loop.
    timerHandle = clock.setTimeout(onScheduledFire, Math.min(delayMs, MAX_TIMER_DELAY_MS));
  }

  // Delay = max((ttl − lead) × 1000, minDelay); unknown ttl uses the fallback (H7,
  // predecessor client.ts:291-303).
  function armFromTtl(ttlSeconds: number | null): void {
    // A non-finite TTL (broken strategy returning NaN/Infinity) must not poison the delay
    // arithmetic — treat it exactly like an unknown TTL.
    const baseTtl =
      ttlSeconds !== null && Number.isFinite(ttlSeconds) ? ttlSeconds : fallbackTtlSeconds;
    armTimer(Math.max((baseTtl - leadSeconds) * 1000, minDelayMs));
  }

  // H8 — retry after a transient, but with exponential backoff instead of the predecessor's
  // fixed 30s loop (§3.5·§7-8). The reactive 401 path (H6) remains the safety net, so a
  // widened interval never means a sign-out.
  function armTransientRetry(): void {
    transientStreak += 1;
    armTimer(Math.min(minDelayMs * 2 ** (transientStreak - 1), transientMaxDelayMs));
  }

  function onScheduledFire(): void {
    timerHandle = null;
    if (disposed) return;
    void refresh().then(
      (outcome) => {
        if (disposed) return;
        if (outcome.status === 'transient') {
          armTransientRetry();
        }
        // 'refreshed'/'adopted' rescheduled inside refresh(); 'invalid'/'signed-out' stopped the
        // timer there as well. The scheduler's job here is only the transient retry + notification.
        onScheduledOutcome?.(outcome);
      },
      (cause) => {
        // Storage adapter exceptions deliberately propagate raw out of refresh() (errors.ts
        // header) — a caller-initiated refresh has a caller to receive them, but a scheduled
        // flight has none. Without this handler the rejection would surface as an unhandled
        // promise rejection and the scheduler would die silently: no retry timer, no
        // onScheduledOutcome. Treat it like a transient with cause (H1 direction — tokens
        // untouched): back off, keep the scheduler and its diagnostic channel alive.
        if (disposed) return;
        armTransientRetry();
        onScheduledOutcome?.({ status: 'transient', cause });
      }
    );
  }

  function acquire<T>(run: () => Promise<T>): Promise<T> {
    // H5 — direct-execution fallback when no lock was supplied (predecessor client.ts:263-272).
    return lock !== undefined ? lock.acquire(run) : run();
  }

  async function performRefresh(): Promise<RefreshOutcome> {
    // Pre-lock snapshot — the baseline for the H2b post-lock comparison.
    const entry = await storage.getTokens();
    if (entry === null) return { status: 'signed-out' };

    const result = await acquire<CriticalResult>(async () => {
      // §3.5 lock-boundary invariant: everything from this re-read through persisting the
      // result stays inside the critical section (the predecessor's withRefreshLock wrapped
      // read→request→setTokens for exactly this reason, client.ts:187-228).

      // H2b — re-confirm after lock entry: if another tab already rotated while we waited,
      // adopt without consuming the rotation.
      const current = await storage.getTokens();
      if (current === null) {
        return { outcome: { status: 'signed-out' }, serverTtlSeconds: null };
      }
      if (current.refreshToken !== entry.refreshToken) {
        return { outcome: { status: 'adopted', tokens: current }, serverTtlSeconds: null };
      }

      const attempted = current;
      const attemptEpoch = localWriteEpoch;
      // Re-read for the persist decision. A local signIn/signOut bypasses the lock, so when
      // one raced this flight (epoch moved) its storage write is awaited first — otherwise
      // the re-read could still observe the pre-write pair and the disciplines below would
      // misfire (e.g. clearTokens wiping a concurrent signIn's fresh pair).
      const settledLatest = async (): Promise<TokenPair | null> => {
        if (localWriteEpoch !== attemptEpoch) await lastLocalWrite;
        return storage.getTokens();
      };
      let requestResult: RefreshRequestResult;
      let thrownCause: unknown;
      let didThrow = false;
      try {
        requestResult = await refreshRequest({ refreshToken: attempted.refreshToken });
      } catch (cause) {
        // §3.3 fail-safe: a classifier bug must not sign the user out (H1 direction), and the
        // thrown value is preserved as `cause` so it cannot be silently swallowed (§3.4).
        didThrow = true;
        thrownCause = cause;
        requestResult = { status: 'transient' };
      }

      if (requestResult.status === 'rotated') {
        // Rotated-path persist discipline — the H3 re-read applied to the SUCCESS path:
        // persist only while the attempted pair is still the stored one. signOut/signIn
        // (instance-local, lock-free) and other tabs can write while our request is in
        // flight; persisting unconditionally would re-persist a fresh valid pair AFTER the
        // user's clearTokens (a failed logout — durable tokens surviving an apparently
        // successful signOut) or overwrite a concurrent re-login with the OLD account's
        // rotation.
        const stored = await settledLatest();
        if (stored === null) {
          // The user signed out mid-flight. Discarding the rotation is correct — logout wins.
          return { outcome: { status: 'signed-out' }, serverTtlSeconds: null };
        }
        if (stored.refreshToken !== attempted.refreshToken) {
          // A concurrent signIn (or another tab's write) won — adopt it, never overwrite it.
          return { outcome: { status: 'adopted', tokens: stored }, serverTtlSeconds: null };
        }
        // H14 — internal rotation is mode-sticky: no `persistence` option, so a session login
        // never silently promotes to durable. Persist BEFORE the lock releases (§3.5).
        const persistEpoch = localWriteEpoch; // no await between this read and the persist issue
        await storage.setTokens(requestResult.tokens);
        if (localWriteEpoch !== persistEpoch) {
          // A signOut/signIn started while the persist itself was in flight. Wait for it to
          // land and report the settled state instead of claiming 'refreshed' over the
          // user's decision.
          await lastLocalWrite;
          const settled = await storage.getTokens();
          if (settled === null) {
            return { outcome: { status: 'signed-out' }, serverTtlSeconds: null };
          }
          if (settled.refreshToken !== requestResult.tokens.refreshToken) {
            return { outcome: { status: 'adopted', tokens: settled }, serverTtlSeconds: null };
          }
        }
        return {
          outcome: { status: 'refreshed', tokens: requestResult.tokens },
          serverTtlSeconds: requestResult.accessTtlSeconds ?? null,
        };
      }

      // H2 — the request failed: re-read. Another tab may have rotated the single-use token
      // while we were in flight; if storage now holds a different pair, adopt it instead of
      // treating our stale-token rejection as a sign-out.
      const latest = await settledLatest();
      if (latest !== null && latest.refreshToken !== attempted.refreshToken) {
        return { outcome: { status: 'adopted', tokens: latest }, serverTtlSeconds: null };
      }

      if (requestResult.status === 'invalid') {
        // H3 — clear only when the attempted token is still the stored one; if another tab
        // already cleared (latest === null) we must not report having cleared anything.
        let tokensCleared = false;
        if (latest !== null && latest.refreshToken === attempted.refreshToken) {
          await storage.clearTokens();
          tokensCleared = true;
        }
        return { outcome: { status: 'invalid', tokensCleared }, serverTtlSeconds: null };
      }

      // H1 — transient never signs out: storage untouched, tokens preserved.
      return {
        outcome: didThrow ? { status: 'transient', cause: thrownCause } : { status: 'transient' },
        serverTtlSeconds: null,
      };
    });

    const outcome = result.outcome;
    if (outcome.status === 'refreshed' || outcome.status === 'adopted') {
      transientStreak = 0; // §3.5 — backoff counter resets on success
      // TTL priority ① server value (rotation path) → ② strategy → ③ fallback (§3.5).
      armFromTtl(result.serverTtlSeconds ?? ttlOfAccessToken(outcome.tokens.accessToken));
    } else if (outcome.status === 'invalid' || outcome.status === 'signed-out') {
      cancelTimer();
    }
    return outcome;
  }

  // async so that after dispose() this REJECTS with AuthError('session-disposed') like every
  // other Promise-returning method — a plain function would throw synchronously past a
  // caller's `.catch(...)` (§4.1-ⓑ: one uniform failure channel across the interface).
  async function refresh(): Promise<RefreshOutcome> {
    assertNotDisposed();
    if (inFlight !== null) return inFlight; // H4 — share the in-flight result
    const flight = performRefresh().finally(() => {
      inFlight = null;
    });
    inFlight = flight;
    return flight;
  }

  return {
    async getAccessToken() {
      assertNotDisposed();
      const tokens = await storage.getTokens();
      return tokens === null ? null : tokens.accessToken;
    },

    async getTokens() {
      assertNotDisposed();
      return storage.getTokens();
    },

    async signIn(tokens, signInOptions) {
      assertNotDisposed();
      // §4.1-⑥ — persistence is a required, caller-owned decision. Tracked as a local write
      // so an in-flight rotation cannot overwrite this fresh pair with the old account's.
      await trackLocalWrite(storage.setTokens(tokens, { persistence: signInOptions.persistence }));
      transientStreak = 0; // §3.5 — counter resets on signIn
      // TTL priority ① — the login response's expires_in feeds the first schedule (§3.5).
      armFromTtl(signInOptions.accessTtlSeconds ?? ttlOfAccessToken(tokens.accessToken));
    },

    async signOut() {
      assertNotDisposed();
      cancelTimer();
      transientStreak = 0;
      // Tracked as a local write so an in-flight rotation cannot re-persist a valid pair
      // after this clear — logout must stick.
      await trackLocalWrite(storage.clearTokens());
    },

    refresh,

    async refreshIfExpiringSoon(eagerOptions) {
      assertNotDisposed();
      const thresholdSeconds =
        eagerOptions?.thresholdSeconds ?? DEFAULT_EAGER_THRESHOLD_SECONDS; // H9
      const ttl = await ttlFromStorage();
      if (ttl === null || ttl > thresholdSeconds) return { status: 'not-needed' };
      return refresh();
    },

    async runAuthorized(run, runOptions) {
      assertNotDisposed();
      const tokens = await storage.getTokens();
      const accessToken = tokens === null ? null : tokens.accessToken;
      try {
        return await run(accessToken);
      } catch (error) {
        // H6 — refresh only when the classifier says "expired 401" AND a token existed.
        if (accessToken === null || !runOptions.shouldRetryAfterRefresh(error)) throw error;
        const outcome = await refresh();
        if (outcome.status === 'refreshed' || outcome.status === 'adopted') {
          // H6 — structurally exactly one retry: this call cannot reach the refresh path
          // again, and it receives the fresh token as an argument (never the expired header).
          return await run(outcome.tokens.accessToken);
        }
        // H1 — on transient the tokens are untouched; surface the ORIGINAL error so the
        // caller's retry policy (React Query etc.) takes over instead of bouncing to login.
        throw error;
      }
    },

    async scheduleRefresh() {
      assertNotDisposed();
      // §3.5 — the timer is armed FROM the stored tokens: no token, no timer. The
      // fallback-TTL branch (H7) is for a PRESENT token whose expiry is unknown — arming it
      // on empty storage would deliver a spurious background 'signed-out' scheduled outcome
      // ~12.5 minutes later on an app that was never signed in.
      const tokens = await storage.getTokens();
      if (tokens === null) {
        cancelTimer();
        return;
      }
      armFromTtl(ttlOfAccessToken(tokens.accessToken));
    },

    cancelScheduledRefresh() {
      assertNotDisposed();
      cancelTimer();
    },

    dispose() {
      if (disposed) return;
      disposed = true;
      cancelTimer();
    },
  };
}
