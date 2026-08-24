// createFakeRefreshLock (design doc §5.1) — a real mutex with observability, so H5 is a
// numeric assertion and the "rotation while waiting for the lock" H2b scenario is reproducible.

import type { RefreshLock } from '../core/types';

/** Serialization-observing {@link RefreshLock}; `hold`/`releaseNext` reproduce H2b lock-wait races. */
export type FakeRefreshLock = RefreshLock & {
  /** Highest number of concurrently held critical sections observed (H5 asserts === 1). */
  readonly maxObservedConcurrency: number;
  /** After `hold()`, each `acquire` waits at its grant point until `releaseNext()` — the "rotation while waiting for the lock" scenario. */
  hold(): void;
  /** Release one held acquirer (or bank a credit if none is waiting yet). */
  releaseNext(): void;
};

/** Create a fake refresh lock (design §5.1). It genuinely serializes, like the Web Locks API. */
export function createFakeRefreshLock(): FakeRefreshLock {
  let tail: Promise<void> = Promise.resolve();
  let active = 0;
  let maxObservedConcurrency = 0;
  let holding = false;
  let releaseCredits = 0;
  const gateWaiters: Array<() => void> = [];

  function gate(): Promise<void> {
    if (!holding) return Promise.resolve();
    if (releaseCredits > 0) {
      releaseCredits -= 1;
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      gateWaiters.push(resolve);
    });
  }

  return {
    acquire<T>(run: () => Promise<T>): Promise<T> {
      const result = tail.then(async () => {
        await gate();
        active += 1;
        maxObservedConcurrency = Math.max(maxObservedConcurrency, active);
        try {
          return await run();
        } finally {
          active -= 1;
        }
      });
      tail = result.then(
        () => undefined,
        () => undefined
      );
      return result;
    },
    hold() {
      holding = true;
    },
    releaseNext() {
      const next = gateWaiters.shift();
      if (next !== undefined) next();
      else releaseCredits += 1;
    },
    get maxObservedConcurrency() {
      return maxObservedConcurrency;
    },
  };
}
