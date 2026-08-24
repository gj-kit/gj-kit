/**
 * 빠른 경로 — 명시적 best-effort(설계 §3.8.1).
 *
 * 소스는 전역 `setTimeout` + `unref`로 항상 켜져 있었다. 여기서는 스케줄러가 주입 가능하고
 * (`runtime.defer`) `enabled: false`로 완전히 끌 수 있다 — 서버리스에서는 응답 후 실행이
 * 보장되지 않아 켜 두면 오해를 부르고, 테스트에서는 실시간 대기를 강요하기 때문이다.
 */
import { safeErrorCode } from './errors';
import type { NotificationLogger } from './logger';
import { silentNotificationLogger } from './logger';
import type { NotificationDispatcher } from './dispatch';
import type { NotificationRelay } from './relay';
import type { NotificationRuntime } from './runtime';
import { systemNotificationRuntime } from './runtime';

/**
 * Post-commit latency hint. NOT an ingress and NOT a correctness dependency.
 *
 * `request()` returns nothing: there is no promise to await, no result to
 * inspect, and no error to catch. A hint may be coalesced with others, dropped
 * entirely, or fail silently.
 *
 * A periodic runner owns correctness. A host that wires only this hint will never
 * deliver a batched, quiet-hours-held, or scheduled notification, because nothing
 * calls the pipeline at the instant those become due (design 0.3-1).
 */
export interface NotificationPipelineWakeup {
  request(): void;
}

export interface NotificationWakeupOptions {
  readonly relay: NotificationRelay;
  readonly dispatcher: NotificationDispatcher;
  /** Set false to make `request()` a no-op (serverless, tests). Default true. */
  readonly enabled?: boolean | undefined;
  readonly runtime?: NotificationRuntime | undefined;
  readonly logger?: NotificationLogger | undefined;
}

/**
 * Builds the best-effort wakeup hint.
 *
 * A burst of requests collapses into one pass, nothing runs on the caller's
 * stack, the deferred timer never keeps the process alive, and every failure is
 * swallowed into a single `warn` carrying only a redacted error code — a payload
 * must never reach the log from here.
 */
export function createNotificationWakeup(
  options: NotificationWakeupOptions,
): NotificationPipelineWakeup {
  const enabled = options.enabled ?? true;
  const runtime = options.runtime ?? systemNotificationRuntime();
  const logger = options.logger ?? silentNotificationLogger();

  let running = false;
  let pending = false;

  const pass = async (): Promise<void> => {
    try {
      const relayed = await options.relay.relayDue();
      // relay가 하나도 relay하지 못했으면 dispatcher를 부르지 않는다(소스 동작).
      if (relayed.relayed > 0) await options.dispatcher.dispatchDue();
    } catch (error) {
      logger.warn({ error: safeErrorCode(error) }, 'notification wakeup pass failed');
    }
  };

  const schedule = (): void => {
    running = true;
    runtime.defer(() => {
      void pass().then(() => {
        running = false;
        if (!pending) return;
        pending = false;
        schedule();
      });
    });
  };

  return {
    request(): void {
      if (!enabled) return;
      if (running) {
        pending = true;
        return;
      }
      schedule();
    },
  };
}
