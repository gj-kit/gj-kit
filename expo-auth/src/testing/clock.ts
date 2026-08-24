// createManualClock (design doc §5.1) — the deterministic AuthClock unit tests inject so the
// H7/H8 scheduler matrix is assertable without real time.

import type { AuthClock } from '../core/types';

/** Deterministic {@link AuthClock}: `advance` fires elapsed timers and drains microtasks. */
export type ManualClock = AuthClock & {
  /** Move time forward, firing due timers in order and letting their async chains settle. */
  advance(ms: number): Promise<void>;
  /** Observability: number of currently armed timers (asserting "timer stopped" outcomes). */
  readonly pendingTimerCount: number;
};

// Lets the async chains a timer callback kicks off (storage reads, scripted refreshes, the
// session's finally/then wrappers) settle between fires. Each await yields one microtask tick.
async function drainMicrotasks(): Promise<void> {
  for (let i = 0; i < 64; i += 1) {
    await Promise.resolve();
  }
}

/** Create a manual clock (design §5.1). Time starts at `startMs` (default 0) and only moves via `advance`. */
export function createManualClock(options?: { readonly startMs?: number | undefined }): ManualClock {
  let now = options?.startMs ?? 0;
  let nextId = 0;
  const timers = new Map<number, { readonly at: number; readonly callback: () => void }>();

  return {
    nowMs: () => now,
    setTimeout(callback, delayMs) {
      nextId += 1;
      timers.set(nextId, { at: now + Math.max(0, delayMs), callback });
      return nextId;
    },
    clearTimeout(handle) {
      if (typeof handle === 'number') timers.delete(handle);
    },
    async advance(ms) {
      const target = now + ms;
      // Fire due timers in time order; timers armed DURING the window (e.g. the scheduler's
      // transient retry) fire too when they land inside it.
      for (;;) {
        let dueId: number | null = null;
        let dueAt = Number.POSITIVE_INFINITY;
        for (const [id, timer] of timers) {
          if (timer.at <= target && (timer.at < dueAt || (timer.at === dueAt && (dueId === null || id < dueId)))) {
            dueId = id;
            dueAt = timer.at;
          }
        }
        if (dueId === null) break;
        const due = timers.get(dueId);
        timers.delete(dueId);
        now = Math.max(now, dueAt);
        due?.callback();
        await drainMicrotasks();
      }
      now = target;
      await drainMicrotasks();
    },
    get pendingTimerCount() {
      return timers.size;
    },
  };
}
