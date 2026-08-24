/**
 * 이 패키지에서 ambient 시간·타이머가 등장하는 **유일한 파일**이다.
 * tests/unit/guards/ambient-clock.test.ts가 이 사실을 문자열 스캔으로 고정한다.
 */
import { OperationsJobsError } from './errors';

/** Cancels a scheduled callback. Calling it twice is a no-op. */
export type JobTimerCancel = () => void;

/**
 * The largest delay this package will hand a timer: 2^31 - 1 ms (~24.8 days).
 *
 * Node's timer subsystem holds delays in a 32-bit signed integer and silently
 * clamps anything larger to 1 ms — a job declaring a 25-day deadline would time
 * out instantly on every run, with a stderr warning as the only diagnostic.
 * Every option that becomes a timer is rejected above this value instead.
 *
 * @internal — not part of the `./core` public surface.
 */
export const MAX_JOB_TIMER_MS = 2_147_483_647;

/**
 * Validate a millisecond option that will become a timer, returning it.
 *
 * Both bounds matter and only one of them is obvious. Below zero the timer fires
 * immediately; above {@link MAX_JOB_TIMER_MS} it *also* fires immediately, after
 * a silent 32-bit clamp whose only diagnostic is a warning on stderr. Callers
 * pass the option's own name so the boot failure says which value to fix.
 *
 * @internal — not part of the `./core` public surface.
 */
export function assertJobDurationMs(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new OperationsJobsError(
      'ERR_JOB_INVALID',
      `${label} must be a positive, finite number of milliseconds: got ${String(value)}`,
    );
  }
  if (value > MAX_JOB_TIMER_MS) {
    throw new OperationsJobsError(
      'ERR_JOB_INVALID',
      `${label} exceeds the ${MAX_JOB_TIMER_MS}ms timer ceiling: got ${String(value)}. A larger delay overflows the 32-bit timer and fires after 1ms, so the job would end on its deadline on every single run.`,
    );
  }
  return value;
}

/**
 * Injected time source. Every runner decision that depends on time — the
 * deadline, the heartbeat cadence, how long a failing heartbeat is tolerated,
 * and `durationMs` — reads this and nothing else. `now()` is epoch milliseconds
 * because that is what the store port carries, so no date object is ever
 * constructed outside this module. Staleness is not on this list: the cutoff
 * belongs to the store's clock, not the runner's (obligation S6).
 *
 * This is the only module in the package allowed to touch ambient time or timers.
 */
export interface JobClock {
  /** Epoch milliseconds. */
  now(): number;
  /** Fires once after `delayMs`. */
  after(delayMs: number, handler: () => void): JobTimerCancel;
  /** Fires repeatedly every `intervalMs`. */
  every(intervalMs: number, handler: () => void): JobTimerCancel;
}

/** RN/DOM lib 환경에선 타이머 핸들에 unref가 없다 — Node에서만 조용히 적용. */
function unrefTimer(timer: unknown): void {
  (timer as { unref?: () => void } | undefined)?.unref?.();
}

/**
 * Node timers plus the ambient wall clock. Timers are unref'd where the runtime
 * supports it, so a pending heartbeat never keeps a CLI process alive.
 */
export function systemJobClock(): JobClock {
  return {
    now: () => Date.now(),
    after: (delayMs, handler) => {
      const timer = setTimeout(handler, delayMs);
      unrefTimer(timer);
      return () => {
        clearTimeout(timer);
      };
    },
    every: (intervalMs, handler) => {
      const timer = setInterval(handler, intervalMs);
      unrefTimer(timer);
      return () => {
        clearInterval(timer);
      };
    },
  };
}
