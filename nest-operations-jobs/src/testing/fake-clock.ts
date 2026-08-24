import type { JobClock, JobTimerCancel } from '../core/clock';

/** 고정 리터럴 — 이 패키지는 ambient 시간을 src/core/clock.ts에서만 읽는다. */
const DEFAULT_START_MS = 1_700_000_000_000;

interface ScheduledTimer {
  dueAt: number;
  readonly intervalMs: number | undefined;
  readonly handler: () => void;
  cancelled: boolean;
}

/** 타이머 핸들러가 띄운 비동기 작업이 정착할 여유를 준다(저장소 호출 등). */
async function flushMicrotasks(): Promise<void> {
  for (let turn = 0; turn < 12; turn += 1) {
    await Promise.resolve();
  }
}

export interface FakeJobClock extends JobClock {
  /** Fires every timer due within the interval, in order, awaiting microtasks between. */
  advance(ms: number): Promise<void>;
  readonly pendingTimers: number;
}

/**
 * Deterministic clock. `advance` fires every timer due in the interval, in order.
 * `startMs` defaults to a fixed literal, never to the ambient wall clock: this
 * package reads ambient time in `src/core/clock.ts` and nowhere else.
 */
export function fakeJobClock(startMs: number = DEFAULT_START_MS): FakeJobClock {
  let current = startMs;
  const timers = new Set<ScheduledTimer>();

  const schedule = (
    delayMs: number,
    handler: () => void,
    intervalMs: number | undefined,
  ): JobTimerCancel => {
    const timer: ScheduledTimer = {
      dueAt: current + delayMs,
      intervalMs,
      handler,
      cancelled: false,
    };
    timers.add(timer);
    return () => {
      timer.cancelled = true;
      timers.delete(timer);
    };
  };

  return {
    now: () => current,
    after: (delayMs, handler) => schedule(delayMs, handler, undefined),
    every: (intervalMs, handler) => schedule(intervalMs, handler, intervalMs),
    get pendingTimers() {
      return timers.size;
    },
    async advance(ms: number): Promise<void> {
      const target = current + ms;
      for (;;) {
        let next: ScheduledTimer | undefined;
        for (const timer of timers) {
          if (timer.cancelled || timer.dueAt > target) continue;
          if (next === undefined || timer.dueAt < next.dueAt) next = timer;
        }
        if (next === undefined) break;
        current = next.dueAt;
        if (next.intervalMs === undefined) timers.delete(next);
        else next.dueAt = current + next.intervalMs;
        next.handler();
        await flushMicrotasks();
      }
      current = target;
      await flushMicrotasks();
    },
  };
}
