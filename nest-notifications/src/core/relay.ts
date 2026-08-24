/**
 * 릴레이 — ingress outbox 행을 배달로 물질화한다(설계 §3.6).
 *
 * 소스 로직을 유지하되 저장소 호출만 포트로 바꾼다. 소스와 달라지는 지점은 세 개이고
 * 전부 결함 수정이다: 시각을 행마다 다시 읽고(§0.2-⑦), stale 임계를 기간으로만 넘기며
 * (R12), `createDelivery`의 `created: false`를 병합/follow-up으로 되돌린다(R11 · §0.3-⑦).
 */
import type { ClaimedNotificationCommand, NotificationRelayStore } from './store';
import { DEFAULT_CLAIM_STALE_MS, DEFAULT_RELAY_PAGE_SIZE } from './store';
import type { BatchIdentity, NotificationRelayTransaction } from './store';
import type { NotificationSchedulingPolicy } from './policy';
import { notificationBatchPolicyKey, notificationFollowUpBatchPolicyKey } from './policy';
import type { NotificationLogger } from './logger';
import { silentNotificationLogger } from './logger';
import type { NotificationRuntime } from './runtime';
import { systemNotificationRuntime, toInstant } from './runtime';
import { notificationPriorityFrom } from './contracts';
import type { NotificationPriority } from './contracts';
import { safeErrorCode } from './errors';

export interface NotificationRelayOptions {
  readonly applicationKey: string;
  readonly store: NotificationRelayStore;
  readonly policy: NotificationSchedulingPolicy;
  readonly runtime?: NotificationRuntime | undefined;
  readonly logger?: NotificationLogger | undefined;
  /** Defaults to {@link DEFAULT_RELAY_PAGE_SIZE}. */
  readonly pageSize?: number | undefined;
  /**
   * Passed to the store as a duration; the store compares it against its own
   * clock (R12). Defaults to {@link DEFAULT_CLAIM_STALE_MS}.
   */
  readonly claimStaleMs?: number | undefined;
  /**
   * Rows already attempted this many times are left out of the due page (R13).
   * Absent means no bound - a permanently failing row is then re-claimed every
   * pass and, at `pageSize` such rows, starves healthy notifications (design
   * 7-16). The library owns no backoff policy (design 0.4-7); this is the only
   * lever it offers, and choosing a value is an operational decision.
   *
   * **Both settings lose something, so read this before picking one.**
   *
   * - `attempts` counts *claims*, not elapsed time: there is no cooldown between
   *   a `releaseClaim` and the next claim, so the retry window this buys is
   *   `maxAttempts ÷ pass frequency`, not a duration. Every pass counts - a
   *   periodic runner's and a `NotificationPipelineWakeup` pass alike - so with
   *   the wakeup hint enabled a staging burst can spend the whole budget of an
   *   unrelated failing row in seconds.
   * - An exhausted row leaves the due page **permanently**, and nothing in this
   *   package reports it: neither summary type counts it, and the store is asked
   *   for a filtered page rather than for what it filtered out. Watching for
   *   exhausted rows is a host query (design 6-15), and a host that does not run
   *   one converts a transport outage longer than the budget into silent loss.
   */
  readonly maxAttempts?: number | undefined;
}

export type NotificationRelayOutcome =
  | 'relayed'
  | 'suppressed'
  | 'already-relayed'
  | 'no-longer-live';

/**
 * Declared as a type alias, NOT an interface. Only object type aliases get an
 * implicit index signature, so only this form is assignable to
 * `Record<string, unknown>` - which is exactly the shape a sibling job runner's
 * summary slot has. An interface fails with "Index signature for type 'string'
 * is missing" and the 12-line job adapter in the README stops compiling
 * (measured; design 0.4-3).
 *
 * The outcome counters can sum to less than `claimed`: a claim lost mid-pass is
 * neither an outcome nor a failure, and it is logged rather than counted.
 */
export type NotificationRelaySummary = {
  readonly ok: boolean;
  readonly claimed: number;
  readonly relayed: number;
  readonly suppressed: number;
  readonly alreadyRelayed: number;
  readonly noLongerLive: number;
  readonly failed: number;
};

export interface NotificationRelay {
  relayDue(): Promise<NotificationRelaySummary>;
}

interface RelayContext {
  readonly applicationKey: string;
  readonly policy: NotificationSchedulingPolicy;
  readonly runtime: NotificationRuntime;
}

function itemCountOf(command: ClaimedNotificationCommand): number {
  return Number.isInteger(command.batchItemCount) && command.batchItemCount > 0
    ? command.batchItemCount
    : 1;
}

/**
 * f · f-bis · follow-up 라우팅(설계 §3.6). 되돌림은 정체성당 최대 1회다 —
 * 두 번째에는 `findOpenBatch`가 반드시 그 행을 보므로 무한 루프가 없다.
 */
async function resolveBatchDelivery(
  tx: NotificationRelayTransaction,
  context: RelayContext,
  command: ClaimedNotificationCommand,
  priority: NotificationPriority,
  identity: BatchIdentity,
  deliverAfter: Date,
): Promise<string> {
  const itemCount = itemCountOf(command);
  const aggregationLabel = command.batchLabel;

  const createFollowUp = async (): Promise<string> => {
    // 늦은 항목은 잠긴 배달에 붙이지 않고 자기 배달을 받는다 — 사용자가 하나 더 받는 쪽이
    // 조용히 잃는 쪽보다 낫다(F10).
    const result = await tx.createDelivery({
      applicationKey: context.applicationKey,
      recipientRef: command.recipientRef,
      actorRef: command.actorRef,
      category: command.category,
      priority,
      title: command.title,
      body: command.body,
      action: command.action,
      batchKey: command.batchKey,
      batchWindowStartedAt: identity.batchWindowStartedAt,
      batchPolicyKey: notificationFollowUpBatchPolicyKey(identity.batchPolicyKey, command.id),
      aggregationLabel,
      batchCount: 1,
      batchItemCount: itemCount,
      deliverAfter,
      createdAt: context.runtime.clock.now(),
    });
    return result.id;
  };

  const mergeInto = async (deliveryId: string): Promise<boolean> =>
    tx.mergeIntoBatch({
      applicationKey: context.applicationKey,
      deliveryId,
      addedCount: 1,
      addedItemCount: itemCount,
      aggregationLabel,
      at: context.runtime.clock.now(),
    });

  const open = await tx.findOpenBatch(identity);
  if (open !== null) {
    if (open.open && (await mergeInto(open.id))) return open.id;
    return createFollowUp();
  }

  const created = await tx.createDelivery({
    applicationKey: context.applicationKey,
    recipientRef: command.recipientRef,
    actorRef: command.actorRef,
    category: command.category,
    priority,
    title: command.title,
    body: command.body,
    action: command.action,
    batchKey: command.batchKey,
    batchWindowStartedAt: identity.batchWindowStartedAt,
    batchPolicyKey: identity.batchPolicyKey,
    aggregationLabel,
    batchCount: 1,
    batchItemCount: itemCount,
    deliverAfter,
    createdAt: context.runtime.clock.now(),
  });
  if (created.created) return created.id;

  // f-bis (F11): 같은 배치 정체성을 노리던 **다른** outbox 행이 방금 배달을 만들었다.
  // 돌아온 id를 그대로 쓰면 이미 잠긴 배달에 항목이 붙어 알림이 조용히 사라진다(§0.3-⑦).
  const again = await tx.findOpenBatch(identity);
  if (again !== null && again.open && (await mergeInto(again.id))) return again.id;
  return createFollowUp();
}

async function relayOne(
  store: NotificationRelayStore,
  context: RelayContext,
  command: ClaimedNotificationCommand,
  claimToken: string,
): Promise<NotificationRelayOutcome | null> {
  return store.relayInTransaction(
    {
      applicationKey: context.applicationKey,
      outboxId: command.id,
      claimToken,
      at: context.runtime.clock.now(),
    },
    async (tx): Promise<NotificationRelayOutcome> => {
      // 잠긴 최신 행을 다시 읽는다 — 동시 actor 익명화를 반영하고 삭제를 관측한다(F9).
      const current = await tx.readCommand();
      if (current === null) return 'no-longer-live';

      const priority = notificationPriorityFrom(current.priority);

      // 선호도 게이트는 NORMAL에만 적용한다. ESSENTIAL은 선호도로 억제되지 않는다.
      if (priority === 'NORMAL') {
        const enabled = await tx.isCategoryEnabled({
          recipientRef: current.recipientRef,
          category: current.category,
        });
        if (!enabled) return 'suppressed';
      }

      // G2: 이 소스 행은 배달 항목을 정확히 하나만 만든다(재생·stale 회수와 무관).
      if ((await tx.findDeliveryBySource()) !== null) return 'already-relayed';

      const deliverAt = context.policy.resolveDeliveryAt({
        priority,
        timing: current.timing,
        now: context.runtime.clock.now(),
        recipientRef: current.recipientRef,
        category: current.category,
      });

      // ESSENTIAL은 NORMAL 배치에 갇히지 않는다 — 단독 배달로 나간다.
      if (current.batchKey === null || priority === 'ESSENTIAL') {
        const standalone = await tx.createDelivery({
          applicationKey: context.applicationKey,
          recipientRef: current.recipientRef,
          actorRef: current.actorRef,
          category: current.category,
          priority,
          title: current.title,
          body: current.body,
          action: current.action,
          batchKey: null,
          batchWindowStartedAt: null,
          batchPolicyKey: null,
          aggregationLabel: current.batchLabel,
          batchCount: 1,
          batchItemCount: itemCountOf(current),
          deliverAfter: deliverAt,
          createdAt: context.runtime.clock.now(),
        });
        await tx.appendItem({
          applicationKey: context.applicationKey,
          deliveryId: standalone.id,
          sourceOutboxId: current.id,
          at: context.runtime.clock.now(),
        });
        return 'relayed';
      }

      // 배치 버킷의 입력은 staging 시각이다 — 라이브러리가 쓰지 않는 유일한 시각(R13).
      const window = context.policy.batchWindow(current.createdAt);
      const identity: BatchIdentity = {
        applicationKey: context.applicationKey,
        recipientRef: current.recipientRef,
        batchKey: current.batchKey,
        batchWindowStartedAt: window.startedAt,
        batchPolicyKey: notificationBatchPolicyKey(current.category, priority, current.timing),
      };
      // 배치 배달은 창이 끝난 뒤에 나간다. 조용시간 홀드가 더 늦으면 그쪽이 이긴다.
      const windowClose = toInstant(Math.max(deliverAt.getTime(), window.endsAt.getTime()));
      // …그리고 **그 시각에 대해 홀드를 다시 본다.** `deliverAt`은 relay 시각으로 판정된
      // 값이라, 창 끝이 조용시간 안으로 들어가는 경우를 하나도 잡지 못한다: 21:55에 stage된
      // 10분 창은 22:00에, 18:05에 stage된 6시간 digest는 자정에 나가 버린다. 홀드는 실제로
      // 고른 순간에 대해 성립해야 한다. 홀드 대상이 아니거나 조용시간 밖이면
      // `resolveDeliveryAt`이 입력을 그대로 돌려주므로 ESSENTIAL·비조용 경로는 불변이다.
      const held = context.policy.resolveDeliveryAt({
        priority,
        timing: { mode: 'IMMEDIATE' },
        now: windowClose,
        recipientRef: current.recipientRef,
        category: current.category,
      });
      // 정책 구현이 호스트 것일 수 있으므로 "창 끝보다 이르지 않다"는 하한을 여기서 지킨다.
      const deliverAfter = toInstant(Math.max(windowClose.getTime(), held.getTime()));

      const deliveryId = await resolveBatchDelivery(
        tx,
        context,
        current,
        priority,
        identity,
        deliverAfter,
      );
      await tx.appendItem({
        applicationKey: context.applicationKey,
        deliveryId,
        sourceOutboxId: current.id,
        at: context.runtime.clock.now(),
      });
      return 'relayed';
    },
  );
}

/**
 * Builds the relay stage of the pipeline.
 *
 * One pass claims a page of due ingress rows, materialises each into a delivery
 * inside the store's own transaction, and stamps completion. It is safe to run
 * concurrently on many workers: every safety property comes from the store's
 * atomicity obligations (R1-R13) rather than from this code.
 *
 * A periodic runner owns correctness. `relayDue()` is what a scheduler calls;
 * the wakeup hint is only a latency optimisation (design 0.3-1).
 */
export function createNotificationRelay(options: NotificationRelayOptions): NotificationRelay {
  const runtime = options.runtime ?? systemNotificationRuntime();
  const logger = options.logger ?? silentNotificationLogger();
  const pageSize = options.pageSize ?? DEFAULT_RELAY_PAGE_SIZE;
  const claimStaleMs = options.claimStaleMs ?? DEFAULT_CLAIM_STALE_MS;
  const context: RelayContext = {
    applicationKey: options.applicationKey,
    policy: options.policy,
    runtime,
  };

  return {
    async relayDue(): Promise<NotificationRelaySummary> {
      const claimToken = runtime.claimToken();
      const claimed = await options.store.claimDue({
        applicationKey: options.applicationKey,
        limit: pageSize,
        at: runtime.clock.now(),
        claimStaleMs,
        ...(options.maxAttempts === undefined ? {} : { maxAttempts: options.maxAttempts }),
        claimToken,
      });

      let relayed = 0;
      let suppressed = 0;
      let alreadyRelayed = 0;
      let noLongerLive = 0;
      let failed = 0;

      for (const command of claimed) {
        try {
          const outcome = await relayOne(options.store, context, command, claimToken);
          if (outcome === null) {
            // 다른 워커가 이미 이 행을 가져갔다. 실패가 아니다.
            logger.warn({ outboxId: command.id }, 'relay claim lost before the transaction ran');
            continue;
          }
          if (outcome === 'relayed') relayed += 1;
          else if (outcome === 'suppressed') suppressed += 1;
          else if (outcome === 'already-relayed') alreadyRelayed += 1;
          else noLongerLive += 1;

          const completed = await options.store.completeClaim({
            applicationKey: options.applicationKey,
            outboxId: command.id,
            claimToken,
            at: runtime.clock.now(),
            suppressed: outcome === 'suppressed',
          });
          if (!completed) {
            // F1: 배달은 이미 커밋됐고 완료 기록만 잃었다. 다음 stale 회수가 마저 찍는다.
            logger.warn({ outboxId: command.id, outcome }, 'relay completion write was rejected');
          }
        } catch (error) {
          failed += 1;
          const errorCode = safeErrorCode(error);
          // 이 claim이 예산의 마지막이었는지를 여기서만 알 수 있다 — 다음 패스의 `claimDue`는
          // 이 행을 아예 돌려주지 않으므로 그때는 물어볼 대상조차 없다. 소진을 요약이나 새
          // 포트로 내보내지 않는 것은 설계 결정이고(§6-15), 관측은 구조화 로거에서 파생된다
          // (§6-13). README 체크리스트가 요구하는 "소진 행 알림"이 걸리는 고리가 이 필드다.
          const exhausted =
            options.maxAttempts !== undefined && command.attempts >= options.maxAttempts;
          logger.error(
            {
              outboxId: command.id,
              error: errorCode,
              attempts: command.attempts,
              ...(options.maxAttempts === undefined ? {} : { maxAttempts: options.maxAttempts }),
              exhausted,
            },
            exhausted
              ? 'relay pass failed and this row just spent its last attempt; it will not be claimed again'
              : 'relay pass failed for one row',
          );
          await options.store.releaseClaim({
            applicationKey: options.applicationKey,
            outboxId: command.id,
            claimToken,
            errorCode,
          });
        }
      }

      return {
        ok: failed === 0,
        claimed: claimed.length,
        relayed,
        suppressed,
        alreadyRelayed,
        noLongerLive,
        failed,
      };
    },
  };
}
