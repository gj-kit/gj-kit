/**
 * 러너 — 주기 실행자가 부르는 것은 `run()`이다(설계 §3.8.2).
 *
 * 반환 타입이 곧 계약이다: `run(): Promise<Summary>`가 정확성 경로이고
 * `NotificationPipelineWakeup.request(): void`가 지연 경로다. 두 요약 타입이 **type alias**라
 * `Record<string, unknown>`에 구조적으로 대입되므로, 형제 잡 패키지의 어댑터가 12줄이 된다
 * — 그것은 의존이 아니라 구조적 호환의 결과다(설계 §0.4-③).
 */
import type { NotificationDispatcher, NotificationDispatchSummary } from '../core/dispatch';
import type { NotificationRelay, NotificationRelaySummary } from '../core/relay';

/** Injectable wrapper whose `run()` is what a scheduler calls. */
export class NotificationRelayRunner {
  readonly #relay: NotificationRelay;

  constructor(relay: NotificationRelay) {
    this.#relay = relay;
  }

  /** One relay pass. Never throws for a single failed row; the summary reports it. */
  run(): Promise<NotificationRelaySummary> {
    return this.#relay.relayDue();
  }
}

/** Injectable wrapper whose `run()` is what a scheduler calls. */
export class NotificationDispatchRunner {
  readonly #dispatcher: NotificationDispatcher;

  constructor(dispatcher: NotificationDispatcher) {
    this.#dispatcher = dispatcher;
  }

  /** One dispatch pass. Never throws for a single failed delivery. */
  run(): Promise<NotificationDispatchSummary> {
    return this.#dispatcher.dispatchDue();
  }
}
