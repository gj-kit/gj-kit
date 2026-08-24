/**
 * 결정적 런타임 — 시계·claim 토큰·defer를 전부 테스트가 소유한다.
 *
 * 소스의 wakeup 스펙은 실제로 `realSetTimeout(5ms)`로 기다렸다. 여기서는 `flush()`가 그
 * 대기를 없앤다 — 그것이 `defer`를 포트로 만든 이유이기도 하다(설계 §0.2-⑫).
 */
import type { NotificationRuntime } from '../core/runtime';
import { toInstant } from '../core/runtime';

export interface FakeNotificationRuntime extends NotificationRuntime {
  /** Moves the clock forward. Deferred work is not run by this call. */
  advance(ms: number): void;
  /** Runs every deferred callback synchronously, including ones they enqueue. */
  flush(): void;
}

const MAX_FLUSH_ROUNDS = 1000;

/** Deterministic runtime for tests. Claim tokens are a counter, not a UUID. */
export function fakeNotificationRuntime(options?: {
  readonly now?: Date | undefined;
}): FakeNotificationRuntime {
  let epochMs = options?.now === undefined ? 0 : options.now.getTime();
  let tokens = 0;
  let queue: (() => void)[] = [];

  return {
    clock: { now: () => toInstant(epochMs) },
    claimToken: () => {
      tokens += 1;
      return `claim-${String(tokens).padStart(6, '0')}`;
    },
    defer: (work) => {
      queue.push(work);
    },
    advance: (ms) => {
      epochMs += ms;
    },
    flush: () => {
      for (let round = 0; round < MAX_FLUSH_ROUNDS; round += 1) {
        if (queue.length === 0) return;
        const pending = queue;
        queue = [];
        for (const work of pending) work();
      }
      throw new Error('fakeNotificationRuntime.flush did not settle; deferred work is looping.');
    },
  };
}
