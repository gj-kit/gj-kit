// createWebLocksRefreshLock (design doc §3.8) — branch-shared, peer-free. Ports the
// predecessor's withRefreshLock (client.ts:263-272): structural access to navigator.locks and
// a direct-execution fallback where the Web Locks API is absent (H5).

import type { RefreshLock } from '../core/types';
import { assertValidKeyPrefix } from './shared';

// §2.4 — structural minimum of the Web Locks API, reached only via globalThis reflection so
// the DOM lib is never required (the predecessor's LockManager structural cast, promoted to a
// contract).
type LockManagerLike = {
  request(name: string, callback: () => Promise<unknown>): Promise<unknown>;
};

type NavigatorHostLike = {
  navigator?: { locks?: LockManagerLike | undefined } | undefined;
};

/**
 * Cross-tab refresh serialization over the Web Locks API (H5). Where `navigator.locks` is
 * unavailable — including native, where this lock is therefore harmless to wire
 * unconditionally (§3.9) — `acquire` executes `run` directly, preserving the predecessor's
 * fallback. On lock-less browsers the tab race on single-use refresh tokens remains and the
 * H2 adoption path cleans up after it (§7-3) — the same exposure the predecessor had.
 */
export function createWebLocksRefreshLock(options: {
  /** Required. An origin-global name — using the same value as `keyPrefix` is recommended (§4.1-①). */
  readonly name: string;
}): RefreshLock {
  assertValidKeyPrefix(options.name);
  return {
    async acquire<T>(run: () => Promise<T>): Promise<T> {
      const locks = (globalThis as NavigatorHostLike).navigator?.locks;
      if (locks === undefined || typeof locks.request !== 'function') {
        return run();
      }
      return (await locks.request(options.name, run)) as T;
    },
  };
}
