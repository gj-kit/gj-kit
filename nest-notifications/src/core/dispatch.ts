/**
 * 디스패처 — due 배달을 inbox 메시지로 물질화하고 endpoint에 fan-out한다(설계 §3.7).
 *
 * 소스 스펙이 고정한 동작 5종을 그대로 보존한다: ① endpoint가 하나도 없어도 inbox 메시지는
 * 쓰고 배달은 완료한다, ② 한 수신자의 핸드오프 실패가 페이지의 나머지를 막지 않는다,
 * ③ 핸드오프가 실패해도 provider가 확인한 무효 endpoint는 비활성화한다, ④ 다른 워커가
 * claim을 가로채면 inbox 쓰기 **전에** 멈춘다, ⑤ 게이트웨이에 넘기는 것은 `actorRef`가
 * 아니라 `recipientRef`다.
 */
import { notificationPriorityFrom } from './contracts';
import { NotificationsError, safeErrorCode } from './errors';
import type { NotificationLogger } from './logger';
import { silentNotificationLogger } from './logger';
import type { NotificationPresentation, NotificationPresenter } from './presentation';
import type { NotificationPushGateway, NotificationPushPayload } from './push';
import type { NotificationRuntime } from './runtime';
import { systemNotificationRuntime } from './runtime';
import type {
  ClaimedNotificationDelivery,
  NotificationDeliveryStore,
  NotificationEndpointDisableTarget,
  NotificationEndpointStore,
  ObservedNotificationEndpoint,
} from './store';
import { DEFAULT_CLAIM_STALE_MS, DEFAULT_DISPATCH_PAGE_SIZE } from './store';

export interface NotificationDispatcherOptions {
  readonly applicationKey: string;
  readonly store: NotificationDeliveryStore;
  readonly endpoints: NotificationEndpointStore;
  readonly pushGateway: NotificationPushGateway;
  readonly presenter: NotificationPresenter;
  /** Which endpoint providers this gateway handles. Required: no default provider. */
  readonly providers: readonly string[];
  readonly runtime?: NotificationRuntime | undefined;
  readonly logger?: NotificationLogger | undefined;
  /** Defaults to {@link DEFAULT_DISPATCH_PAGE_SIZE}. */
  readonly pageSize?: number | undefined;
  /** A duration; the store compares it against its own clock (D8). */
  readonly claimStaleMs?: number | undefined;
  /**
   * Deliveries already attempted this many times are left out of the page (D9).
   * Same trade-off, same arithmetic and the same silence as
   * `NotificationRelayOptions.maxAttempts` - read that one. The dispatch
   * side loses less on exhaustion (the inbox message is already written, so only
   * the push is lost), but the push is lost for good.
   */
  readonly maxAttempts?: number | undefined;
  /**
   * Disable locally rejected endpoints too. Default false: a local shape check is
   * not a provider confirmation, and the day our check becomes stricter than the
   * provider's it would permanently darken live devices (design 0.2-6).
   */
  readonly disableRejectedEndpoints?: boolean | undefined;
}

/** A type alias for the same reason `NotificationRelaySummary` is (design 3.6). */
export type NotificationDispatchSummary = {
  readonly ok: boolean;
  readonly claimed: number;
  readonly delivered: number;
  readonly failed: number;
  /**
   * Endpoints this pass asked the store to disable. `disable` returns void, so a
   * revision that no longer matches is counted here even though the store made
   * it a no-op (D6). It is a request count, not a row count.
   */
  readonly endpointsDisabled: number;
};

export interface NotificationDispatcher {
  dispatchDue(): Promise<NotificationDispatchSummary>;
}

interface MaterializedDelivery {
  readonly messageId: string;
  readonly presentation: NotificationPresentation;
  readonly delivery: ClaimedNotificationDelivery;
}

/**
 * 게이트웨이가 돌려준 무효 id를 `listEnabled` 관측 결과에 되짚어 리비전 쌍을 만든다.
 * 이 되짚기가 D6의 stale 안전성이 실제로 작동하는 지점이다 — 없으면 전송 중에 앱을 다시
 * 열어 재등록한 기기가 꺼진다(§0.3-⑨).
 */
function disableTargets(
  observed: readonly ObservedNotificationEndpoint[],
  ids: readonly string[],
  logger: NotificationLogger,
): readonly NotificationEndpointDisableTarget[] {
  const revisions = new Map(observed.map((endpoint) => [endpoint.id, endpoint.revision]));
  const targets: NotificationEndpointDisableTarget[] = [];
  for (const id of ids) {
    const revision = revisions.get(id);
    if (revision === undefined) {
      logger.warn({ endpointId: id }, 'push gateway reported an endpoint that was not listed');
      continue;
    }
    targets.push({ id, revision });
  }
  return targets;
}

/**
 * Builds the dispatch stage of the pipeline.
 *
 * One pass claims a page of due deliveries — the claim also stamps the
 * presentation lock, which is what freezes what the user will read (D1) — writes
 * exactly one inbox message per delivery (G4), then hands the payload to the
 * transport. The push handoff is at-least-once and lives outside the
 * transaction, so a duplicate banner is a documented cost rather than a bug
 * (design 3.1 G5).
 */
export function createNotificationDispatcher(
  options: NotificationDispatcherOptions,
): NotificationDispatcher {
  const runtime = options.runtime ?? systemNotificationRuntime();
  const logger = options.logger ?? silentNotificationLogger();
  const pageSize = options.pageSize ?? DEFAULT_DISPATCH_PAGE_SIZE;
  const claimStaleMs = options.claimStaleMs ?? DEFAULT_CLAIM_STALE_MS;
  const disableRejected = options.disableRejectedEndpoints ?? false;

  const materialize = async (
    delivery: ClaimedNotificationDelivery,
    claimToken: string,
  ): Promise<MaterializedDelivery | null> =>
    options.store.materializeInTransaction(
      {
        applicationKey: options.applicationKey,
        deliveryId: delivery.id,
        claimToken,
        at: runtime.clock.now(),
      },
      async (tx): Promise<MaterializedDelivery | null> => {
        const current = await tx.readDelivery();
        if (current === null) return null;
        const priority = notificationPriorityFrom(current.priority);
        const presentation = options.presenter.present({
          title: current.title,
          body: current.body,
          action: current.action,
          category: current.category,
          priority,
          batchCount: current.batchCount,
          batchItemCount: current.batchItemCount,
          aggregationLabel: current.aggregationLabel,
        });
        if (typeof presentation.body !== 'string' || presentation.body.trim().length === 0) {
          // 빈 본문은 사용자에게 보이지 않는 카드다. 쓰느니 실패하는 편이 낫다.
          throw new NotificationsError(
            'ERR_NOTIFICATION_MESSAGE_NOT_VISIBLE',
            'presenter returned an empty body; the notification would be invisible.',
          );
        }
        const message = await tx.ensureMessage({
          applicationKey: options.applicationKey,
          deliveryId: current.id,
          recipientRef: current.recipientRef,
          actorRef: current.actorRef,
          category: current.category,
          priority,
          title: presentation.title,
          body: presentation.body,
          action: presentation.action,
          at: runtime.clock.now(),
        });
        return { messageId: message.id, presentation, delivery: current };
      },
    );

  /**
   * 실패 한 건을 기록한다. 이 claim이 예산의 마지막이었는지는 여기서만 알 수 있다 —
   * 다음 패스의 `claimDue`는 이 배달을 돌려주지 않으므로 그때는 물어볼 대상이 없다.
   * 소진을 요약이나 새 포트로 내보내지 않는 것은 설계 결정이고(§6-15), 관측은 구조화
   * 로거에서 파생된다(§6-13).
   */
  const reportFailure = (delivery: ClaimedNotificationDelivery, errorCode: string): void => {
    const exhausted =
      options.maxAttempts !== undefined && delivery.attempts >= options.maxAttempts;
    logger.error(
      {
        deliveryId: delivery.id,
        error: errorCode,
        attempts: delivery.attempts,
        ...(options.maxAttempts === undefined ? {} : { maxAttempts: options.maxAttempts }),
        exhausted,
      },
      exhausted
        ? 'dispatch pass failed and this delivery just spent its last attempt; the push will not be retried'
        : 'dispatch pass failed for one delivery',
    );
  };

  return {
    async dispatchDue(): Promise<NotificationDispatchSummary> {
      const claimToken = runtime.claimToken();
      const claimed = await options.store.claimDue({
        applicationKey: options.applicationKey,
        limit: pageSize,
        at: runtime.clock.now(),
        claimStaleMs,
        ...(options.maxAttempts === undefined ? {} : { maxAttempts: options.maxAttempts }),
        claimToken,
      });

      let delivered = 0;
      let failed = 0;
      let endpointsDisabled = 0;

      for (const delivery of claimed) {
        try {
          const materialized = await materialize(delivery, claimToken);
          if (materialized === null) {
            logger.warn(
              { deliveryId: delivery.id },
              'dispatch claim lost before the inbox message was written',
            );
            continue;
          }

          const observed = await options.endpoints.listEnabled({
            applicationKey: options.applicationKey,
            recipientRef: materialized.delivery.recipientRef,
            providers: options.providers,
          });

          let accepted = true;
          if (observed.length > 0) {
            const payload: NotificationPushPayload = {
              notificationId: materialized.messageId,
              idempotencyKey: materialized.delivery.id,
              recipientRef: materialized.delivery.recipientRef,
              title: materialized.presentation.title,
              body: materialized.presentation.body,
              action: materialized.presentation.action,
              priority: notificationPriorityFrom(materialized.delivery.priority),
            };
            const result = await options.pushGateway.send(
              observed.map((endpoint) => ({
                id: endpoint.id,
                provider: endpoint.provider,
                address: endpoint.address,
              })),
              payload,
            );
            accepted = result.accepted;

            const ids = disableRejected
              ? [...result.invalidEndpointIds, ...result.rejectedEndpointIds]
              : result.invalidEndpointIds;
            if (result.rejectedEndpointIds.length > 0 && !disableRejected) {
              logger.warn(
                { deliveryId: delivery.id, rejected: result.rejectedEndpointIds.length },
                'push gateway rejected endpoint addresses locally; leaving them enabled',
              );
            }
            const targets = disableTargets(observed, ids, logger);
            if (targets.length > 0) {
              // 핸드오프가 실패해도 provider가 확인한 무효 endpoint는 비활성화한다(소스 ③).
              await options.endpoints.disable({
                applicationKey: options.applicationKey,
                endpoints: targets,
                at: runtime.clock.now(),
              });
              endpointsDisabled += targets.length;
            }
          }

          if (!accepted) {
            failed += 1;
            reportFailure(delivery, 'ERR_NOTIFICATION_PUSH_HANDOFF_REJECTED');
            await options.store.releaseClaim({
              applicationKey: options.applicationKey,
              deliveryId: delivery.id,
              claimToken,
              errorCode: 'ERR_NOTIFICATION_PUSH_HANDOFF_REJECTED',
            });
            continue;
          }

          const completed = await options.store.complete({
            applicationKey: options.applicationKey,
            deliveryId: delivery.id,
            claimToken,
            at: runtime.clock.now(),
          });
          if (!completed) {
            // F8: 푸시는 확실히 나갔고 완료 기록만 잃었다. 다음 stale 회수가 재전송한다.
            logger.warn(
              { deliveryId: delivery.id },
              'dispatch completion write was rejected after a successful handoff',
            );
          }
          delivered += 1;
        } catch (error) {
          failed += 1;
          const errorCode = safeErrorCode(error);
          reportFailure(delivery, errorCode);
          await options.store.releaseClaim({
            applicationKey: options.applicationKey,
            deliveryId: delivery.id,
            claimToken,
            errorCode,
          });
        }
      }

      return { ok: failed === 0, claimed: claimed.length, delivered, failed, endpointsDisabled };
    },
  };
}
