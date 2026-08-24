/**
 * `Date`·타이머·난수가 등장하는 **유일한 파일**이다(설계 §1-2 · §3.4.2).
 *
 * `tests/unit/guards/ambient-runtime.test.ts`가 `src/**` 전역에서 `new Date(`·`Date.now(`·
 * `setTimeout(`·`setInterval(`·`randomUUID`를 이 파일 밖에서 금지하고, 환경 변수 읽기는
 * **이 파일을 포함해** 전면 금지한다 — 이 런타임은 환경을 읽을 이유가 없다.
 *
 * 그 규율의 대가로 이 파일은 내부용 `Date` 생성 헬퍼도 소유한다: 정책·인메모리 저장소가
 * 공개 계약(`Date`를 나르는 포트)을 만족하려면 어디선가는 `Date`를 만들어야 하고,
 * 그 자리를 한 파일로 묶어야 가드가 예외 없이 작동한다.
 */
import { randomUUID } from 'node:crypto';

/** The single source of "now" for every policy decision the pipeline makes. */
export interface NotificationClock {
  now(): Date;
}

export interface NotificationRuntime {
  readonly clock: NotificationClock;
  /** Opaque claim token. Must be unguessable enough that two workers never collide. */
  claimToken(): string;
  /** Defers work off the caller's stack. Must not keep the process alive. */
  defer(work: () => void): void;
}

/** Uses `Date`, `crypto.randomUUID`, and an unref'd `setTimeout(0)`. */
export function systemNotificationRuntime(): NotificationRuntime {
  return {
    clock: { now: () => new Date() },
    claimToken: () => randomUUID(),
    defer: (work) => {
      const timer: unknown = setTimeout(work, 0);
      if (typeof timer === 'object' && timer !== null) {
        const unref = (timer as { readonly unref?: () => void }).unref;
        if (typeof unref === 'function') unref.call(timer);
      }
    },
  };
}

/**
 * @internal `Date` 생성의 유일한 자리. 공개 표면이 아니다 — `src/core.ts` 배럴이
 * 재수출하지 않는다.
 */
export function toInstant(epochMs: number): Date {
  return new Date(epochMs);
}
