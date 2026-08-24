/**
 * 인메모리 저장소 스위트 — 참조 구현이자 우리 자신의 테스트 대상(설계 §3.9).
 *
 * 세 저장소만이 아니라 `stage`·`tombstoneRecipient`·`registerEndpoint`까지 갖는 이유는
 * I1–I3(ingress)과 L1–L4(계정 삭제)가 저장소 포트에 **없기** 때문이다. 호스트는 자기 어댑터
 * 위에 같은 seam을 얇게 세워 같은 적합성 케이스를 돌린다 — 그 입구가 없으면 이 패키지의 첫
 * 보증(G1)과 유일한 개인정보 등급 보증(G7)이 호스트 구현에 대해 한 줄도 검사되지 않는다.
 */
import { assertNotificationCommand } from '../core/contracts';
import type {
  NotificationAction,
  NotificationCommand,
  NotificationPriority,
  NotificationStageResult,
  NotificationTiming,
} from '../core/contracts';
import { notificationRecipientKey } from '../core/recipient-key';
import type { NotificationRuntime } from '../core/runtime';
import { systemNotificationRuntime } from '../core/runtime';
import type {
  BatchIdentity,
  ClaimedNotificationCommand,
  ClaimedNotificationDelivery,
  NotificationDeliveryStore,
  NotificationEndpointStore,
  NotificationRelayStore,
  ObservedNotificationEndpoint,
} from '../core/store';

interface OutboxRow {
  id: string;
  applicationKey: string;
  recipientRef: string;
  actorRef: string | null;
  targetRef: string | null;
  category: string;
  priority: string;
  title: string | null;
  body: string;
  action: NotificationAction | null;
  eventKey: string;
  batchKey: string | null;
  batchLabel: string | null;
  batchItemCount: number;
  timing: NotificationTiming;
  createdAt: Date;
  attempts: number;
  claimToken: string | null;
  claimedAt: Date | null;
  relayedAt: Date | null;
  suppressedAt: Date | null;
  lastErrorCode: string | null;
}

interface DeliveryRow {
  id: string;
  applicationKey: string;
  recipientRef: string;
  actorRef: string | null;
  category: string;
  priority: NotificationPriority;
  title: string | null;
  body: string;
  action: NotificationAction | null;
  batchKey: string | null;
  batchWindowStartedAt: Date | null;
  batchPolicyKey: string | null;
  aggregationLabel: string | null;
  batchCount: number;
  batchItemCount: number;
  deliverAfter: Date;
  createdAt: Date;
  attempts: number;
  dispatchClaimToken: string | null;
  dispatchClaimedAt: Date | null;
  presentationLockedAt: Date | null;
  deliveredAt: Date | null;
  lastErrorCode: string | null;
}

interface ItemRow {
  id: string;
  applicationKey: string;
  deliveryId: string;
  sourceOutboxId: string;
  createdAt: Date;
}

interface MessageRow {
  id: string;
  applicationKey: string;
  deliveryId: string;
  recipientRef: string;
  actorRef: string | null;
  category: string;
  priority: NotificationPriority;
  title: string | null;
  body: string;
  action: NotificationAction | null;
  createdAt: Date;
}

interface EndpointRow {
  id: string;
  applicationKey: string;
  recipientRef: string;
  provider: string;
  address: string;
  enabled: boolean;
  revision: number;
  disabledAt: Date | null;
}

/** A read-only view of everything the in-memory suite holds. */
export interface MemoryNotificationSnapshot {
  readonly outbox: readonly Readonly<OutboxRow>[];
  readonly deliveries: readonly Readonly<DeliveryRow>[];
  readonly items: readonly Readonly<ItemRow>[];
  readonly messages: readonly Readonly<MessageRow>[];
  readonly endpoints: readonly Readonly<EndpointRow>[];
  readonly preferences: readonly {
    readonly applicationKey: string;
    readonly recipientRef: string;
    readonly category: string;
    readonly enabled: boolean;
  }[];
  /** Opaque recipient keys, as `notificationRecipientKey` computes them. */
  readonly tombstones: readonly string[];
}

/**
 * What the contract cases drive. A host implements it by wiring its own three
 * stores plus thin adapters over its publisher and account lifecycle, so the
 * obligations that live outside `NotificationRelayStore` — I1-I3 (ingress) and
 * L1-L4 (lifecycle) — are checkable against a real implementation rather than
 * only against ours.
 */
export interface NotificationStoreSuite {
  readonly relayStore: NotificationRelayStore;
  readonly deliveryStore: NotificationDeliveryStore;
  readonly endpointStore: NotificationEndpointStore;
  /** Runs the host's publisher inside its own transaction. Checks I1-I3, and so G1. */
  stage(command: NotificationCommand): Promise<NotificationStageResult>;
  /** Runs the host's account lifecycle for one recipient. Checks L1-L4, and so G7. */
  tombstoneRecipient(input: {
    readonly applicationKey: string;
    readonly recipientRef: string;
  }): Promise<void>;
  /** Registers or refreshes an endpoint and returns what `listEnabled` would observe. */
  registerEndpoint(input: {
    readonly applicationKey: string;
    readonly recipientRef: string;
    readonly provider: string;
    readonly address: string;
  }): Promise<ObservedNotificationEndpoint>;
  setCategoryEnabled(input: {
    readonly applicationKey: string;
    readonly recipientRef: string;
    readonly category: string;
    readonly enabled: boolean;
  }): Promise<void>;
}

export interface MemoryNotificationStores extends NotificationStoreSuite {
  snapshot(): MemoryNotificationSnapshot;
}

/** U+0000, as an escape. Composite map keys use it as a separator. */
const NUL = '\u0000';

function preferenceKey(applicationKey: string, recipientRef: string, category: string): string {
  return `${applicationKey}${NUL}${recipientRef}${NUL}${category}`;
}

function batchIdentityKey(identity: BatchIdentity): string {
  return [
    identity.applicationKey,
    identity.recipientRef,
    identity.batchKey,
    String(identity.batchWindowStartedAt.getTime()),
    identity.batchPolicyKey,
  ].join(NUL);
}

function deliveryIdentityKey(row: DeliveryRow): string | null {
  if (row.batchKey === null || row.batchWindowStartedAt === null || row.batchPolicyKey === null) {
    return null;
  }
  return [
    row.applicationKey,
    row.recipientRef,
    row.batchKey,
    String(row.batchWindowStartedAt.getTime()),
    row.batchPolicyKey,
  ].join(NUL);
}

function noop(): void {
  /* intentionally empty */
}

/**
 * Never use in production: no durability, no cross-process atomicity, and a
 * snapshot API that would expose every recipient's content.
 *
 * It implements the same `stage`, `tombstoneRecipient` and `registerEndpoint`
 * seams a host wires over its own adapters, so our own unit suite and a host's
 * conformance run enter through one door (design 5.4). Row locking is modelled
 * with a promise chain per outbox row, which is what makes the L1/L2 interleaving
 * cases mean anything here.
 */
export function memoryNotificationStores(runtime?: NotificationRuntime): MemoryNotificationStores {
  const clock = (runtime ?? systemNotificationRuntime()).clock;
  const outbox = new Map<string, OutboxRow>();
  const deliveries = new Map<string, DeliveryRow>();
  const items = new Map<string, ItemRow>();
  const messages = new Map<string, MessageRow>();
  const endpoints = new Map<string, EndpointRow>();
  const preferences = new Map<string, boolean>();
  const tombstones = new Set<string>();
  const rowLocks = new Map<string, Promise<void>>();
  let sequence = 0;

  const nextId = (prefix: string): string => {
    sequence += 1;
    return `${prefix}-${String(sequence).padStart(6, '0')}`;
  };

  /** 소스 행 잠금(R7)의 인메모리 모형. 같은 행을 노리는 작업이 직렬화된다. */
  const withRowLock = <T>(key: string, work: () => Promise<T>): Promise<T> => {
    const previous = rowLocks.get(key) ?? Promise.resolve();
    const result = previous.then(work);
    rowLocks.set(
      key,
      result.then(noop, noop),
    );
    return result;
  };

  const isStale = (claimedAt: Date | null, claimStaleMs: number): boolean => {
    if (claimedAt === null) return true;
    // R12·D8: 컷오프를 만드는 시계는 **저장소 것**이다. 호출자가 준 `at`은 여기 들어오지 않는다.
    return claimedAt.getTime() <= clock.now().getTime() - claimStaleMs;
  };

  const toClaimedCommand = (row: OutboxRow): ClaimedNotificationCommand => ({
    id: row.id,
    applicationKey: row.applicationKey,
    recipientRef: row.recipientRef,
    actorRef: row.actorRef,
    targetRef: row.targetRef,
    category: row.category,
    priority: row.priority,
    title: row.title,
    body: row.body,
    action: row.action,
    eventKey: row.eventKey,
    batchKey: row.batchKey,
    batchLabel: row.batchLabel,
    batchItemCount: row.batchItemCount,
    timing: row.timing,
    createdAt: row.createdAt,
    attempts: row.attempts,
  });

  const toClaimedDelivery = (row: DeliveryRow): ClaimedNotificationDelivery => ({
    id: row.id,
    applicationKey: row.applicationKey,
    recipientRef: row.recipientRef,
    actorRef: row.actorRef,
    category: row.category,
    priority: row.priority,
    title: row.title,
    body: row.body,
    action: row.action,
    batchCount: row.batchCount,
    batchItemCount: row.batchItemCount,
    aggregationLabel: row.aggregationLabel,
    attempts: row.attempts,
  });

  const relayStore: NotificationRelayStore = {
    async claimDue(request) {
      const won: ClaimedNotificationCommand[] = [];
      const due = [...outbox.values()]
        .filter((row) => row.applicationKey === request.applicationKey)
        .filter((row) => row.relayedAt === null && row.suppressedAt === null)
        .filter(
          (row) => request.maxAttempts === undefined || row.attempts < request.maxAttempts,
        )
        .filter((row) => row.claimToken === null || isStale(row.claimedAt, request.claimStaleMs))
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
      for (const row of due) {
        if (won.length >= request.limit) break;
        // R1·R2·R13: claim·회수·시도 증가가 한 문장이다.
        row.claimToken = request.claimToken;
        row.claimedAt = clock.now();
        row.attempts += 1;
        won.push(toClaimedCommand(row));
      }
      return won;
    },

    async relayInTransaction(request, work) {
      return withRowLock(request.outboxId, async () => {
        const row = outbox.get(request.outboxId);
        if (
          row === undefined ||
          row.applicationKey !== request.applicationKey ||
          row.claimToken !== request.claimToken ||
          row.relayedAt !== null
        ) {
          return null;
        }
        return work({
          async readCommand() {
            const current = outbox.get(request.outboxId);
            return current === undefined ? null : toClaimedCommand(current);
          },
          async isCategoryEnabled(input) {
            return (
              preferences.get(
                preferenceKey(request.applicationKey, input.recipientRef, input.category),
              ) ?? true
            );
          },
          async findDeliveryBySource() {
            for (const item of items.values()) {
              if (
                item.applicationKey === request.applicationKey &&
                item.sourceOutboxId === request.outboxId
              ) {
                return { deliveryId: item.deliveryId };
              }
            }
            return null;
          },
          async findOpenBatch(key) {
            const wanted = batchIdentityKey(key);
            for (const delivery of deliveries.values()) {
              if (deliveryIdentityKey(delivery) !== wanted) continue;
              return {
                id: delivery.id,
                open:
                  delivery.deliveredAt === null &&
                  delivery.dispatchClaimToken === null &&
                  delivery.presentationLockedAt === null,
              };
            }
            return null;
          },
          async mergeIntoBatch(input) {
            const delivery = deliveries.get(input.deliveryId);
            if (delivery === undefined || delivery.applicationKey !== input.applicationKey) {
              return false;
            }
            // R6: 조건이 UPDATE 안에 있어야 한다. 읽고 나서 쓰면 claim 경쟁에 진다.
            if (
              delivery.deliveredAt !== null ||
              delivery.dispatchClaimToken !== null ||
              delivery.presentationLockedAt !== null
            ) {
              return false;
            }
            delivery.batchCount += input.addedCount;
            delivery.batchItemCount += input.addedItemCount;
            if (input.aggregationLabel !== null) delivery.aggregationLabel = input.aggregationLabel;
            return true;
          },
          async createDelivery(input) {
            const identity =
              input.batchKey === null ||
              input.batchWindowStartedAt === null ||
              input.batchPolicyKey === null
                ? null
                : [
                    input.applicationKey,
                    input.recipientRef,
                    input.batchKey,
                    String(input.batchWindowStartedAt.getTime()),
                    input.batchPolicyKey,
                  ].join(NUL);
            if (identity !== null) {
              for (const delivery of deliveries.values()) {
                // R11: 충돌은 예외가 아니다. `batchCount`도 건드리지 않는다 — 병합은 R6의 일이다.
                if (deliveryIdentityKey(delivery) === identity) {
                  return { id: delivery.id, created: false };
                }
              }
            }
            const id = nextId('delivery');
            deliveries.set(id, {
              id,
              applicationKey: input.applicationKey,
              recipientRef: input.recipientRef,
              actorRef: input.actorRef,
              category: input.category,
              priority: input.priority,
              title: input.title,
              body: input.body,
              action: input.action,
              batchKey: input.batchKey,
              batchWindowStartedAt: input.batchWindowStartedAt,
              batchPolicyKey: input.batchPolicyKey,
              aggregationLabel: input.aggregationLabel,
              batchCount: input.batchCount,
              batchItemCount: input.batchItemCount,
              deliverAfter: input.deliverAfter,
              createdAt: input.createdAt,
              attempts: 0,
              dispatchClaimToken: null,
              dispatchClaimedAt: null,
              presentationLockedAt: null,
              deliveredAt: null,
              lastErrorCode: null,
            });
            return { id, created: true };
          },
          async appendItem(input) {
            for (const item of items.values()) {
              // R4: 중복은 예외가 아니라 false다.
              if (
                item.applicationKey === input.applicationKey &&
                item.sourceOutboxId === input.sourceOutboxId
              ) {
                return false;
              }
            }
            const id = nextId('item');
            items.set(id, {
              id,
              applicationKey: input.applicationKey,
              deliveryId: input.deliveryId,
              sourceOutboxId: input.sourceOutboxId,
              createdAt: input.at,
            });
            return true;
          },
        });
      });
    },

    async completeClaim(request) {
      const row = outbox.get(request.outboxId);
      // R8: 토큰 일치 + 미마감일 때만 쓴다.
      if (
        row === undefined ||
        row.applicationKey !== request.applicationKey ||
        row.claimToken !== request.claimToken ||
        row.relayedAt !== null
      ) {
        return false;
      }
      // R9: 호출자가 준 `at`을 그대로 쓴다.
      row.relayedAt = request.at;
      if (request.suppressed) row.suppressedAt = request.at;
      return true;
    },

    async releaseClaim(request) {
      const row = outbox.get(request.outboxId);
      if (row === undefined || row.claimToken !== request.claimToken) return;
      row.claimToken = null;
      row.claimedAt = null;
      row.lastErrorCode = request.errorCode;
    },
  };

  const deliveryStore: NotificationDeliveryStore = {
    async claimDue(request) {
      const won: ClaimedNotificationDelivery[] = [];
      const due = [...deliveries.values()]
        .filter((row) => row.applicationKey === request.applicationKey)
        .filter((row) => row.deliveredAt === null)
        // D5: 미래 배달은 절대 반환하지 않는다.
        .filter((row) => row.deliverAfter.getTime() <= request.at.getTime())
        .filter((row) => request.maxAttempts === undefined || row.attempts < request.maxAttempts)
        .filter(
          (row) => row.dispatchClaimToken === null || isStale(row.dispatchClaimedAt, request.claimStaleMs),
        )
        .sort((a, b) => a.deliverAfter.getTime() - b.deliverAfter.getTime());
      for (const row of due) {
        if (won.length >= request.limit) break;
        row.dispatchClaimToken = request.claimToken;
        row.dispatchClaimedAt = clock.now();
        // D1: claim과 presentation lock은 한 문장이다.
        row.presentationLockedAt = clock.now();
        row.attempts += 1;
        won.push(toClaimedDelivery(row));
      }
      return won;
    },

    async materializeInTransaction(request, work) {
      const row = deliveries.get(request.deliveryId);
      if (
        row === undefined ||
        row.applicationKey !== request.applicationKey ||
        row.dispatchClaimToken !== request.claimToken ||
        row.deliveredAt !== null
      ) {
        return null;
      }
      return work({
        async readDelivery() {
          const current = deliveries.get(request.deliveryId);
          return current === undefined ? null : toClaimedDelivery(current);
        },
        async ensureMessage(input) {
          for (const message of messages.values()) {
            // D2: conflict-safe 삽입 후 조회. 예외를 던지지 않는다.
            if (
              message.applicationKey === input.applicationKey &&
              message.deliveryId === input.deliveryId
            ) {
              return { id: message.id };
            }
          }
          const id = nextId('message');
          messages.set(id, {
            id,
            applicationKey: input.applicationKey,
            deliveryId: input.deliveryId,
            recipientRef: input.recipientRef,
            actorRef: input.actorRef,
            category: input.category,
            priority: input.priority,
            title: input.title,
            body: input.body,
            action: input.action,
            createdAt: input.at,
          });
          return { id };
        },
      });
    },

    async complete(request) {
      const row = deliveries.get(request.deliveryId);
      if (
        row === undefined ||
        row.applicationKey !== request.applicationKey ||
        row.dispatchClaimToken !== request.claimToken ||
        row.deliveredAt !== null
      ) {
        return false;
      }
      row.deliveredAt = request.at;
      return true;
    },

    async releaseClaim(request) {
      const row = deliveries.get(request.deliveryId);
      if (row === undefined || row.dispatchClaimToken !== request.claimToken) return;
      row.dispatchClaimToken = null;
      row.dispatchClaimedAt = null;
      // presentation lock은 풀지 않는다 — inbox 문장은 이미 노출됐을 수 있다(D1).
      row.lastErrorCode = request.errorCode;
    },
  };

  const endpointStore: NotificationEndpointStore = {
    async listEnabled(input) {
      const providers = new Set(input.providers);
      return [...endpoints.values()]
        .filter(
          (row) =>
            row.applicationKey === input.applicationKey &&
            row.recipientRef === input.recipientRef &&
            row.enabled &&
            providers.has(row.provider),
        )
        .map((row) => ({
          id: row.id,
          provider: row.provider,
          address: row.address,
          revision: String(row.revision),
        }));
    },

    async disable(input) {
      for (const target of input.endpoints) {
        const row = endpoints.get(target.id);
        if (row === undefined || row.applicationKey !== input.applicationKey) continue;
        // D6: 관측한 리비전과 다르면 **오류가 아니라 no-op**이다. 전송 중에 재등록한 기기를
        // 늦은 disable이 다시 끄는 경로를 이 한 줄이 닫는다.
        if (String(row.revision) !== target.revision) continue;
        row.enabled = false;
        row.disabledAt = input.at;
      }
    },
  };

  return {
    relayStore,
    deliveryStore,
    endpointStore,

    async stage(command) {
      assertNotificationCommand(command);
      // I2: 게이트가 삽입 **전에** 있고, 획득 실패면 아무것도 쓰지 않는다.
      if (tombstones.has(notificationRecipientKey(command.applicationKey, command.recipientRef))) {
        return { id: null, staged: false, discarded: true };
      }
      for (const row of outbox.values()) {
        // I1: 중복 stage는 예외가 아니라 `staged: false`다.
        if (
          row.applicationKey === command.applicationKey &&
          row.recipientRef === command.recipientRef &&
          row.eventKey === command.eventKey
        ) {
          return { id: row.id, staged: false };
        }
      }
      const id = nextId('outbox');
      outbox.set(id, {
        id,
        applicationKey: command.applicationKey,
        recipientRef: command.recipientRef,
        actorRef: command.actorRef ?? null,
        targetRef: command.targetRef ?? null,
        category: command.category,
        priority: command.priority,
        title: command.title ?? null,
        body: command.body,
        action: command.action ?? null,
        eventKey: command.eventKey,
        batchKey: command.batch?.key ?? null,
        batchLabel: command.batch?.label ?? null,
        batchItemCount: command.batch?.itemCount ?? 1,
        timing: command.timing ?? { mode: 'IMMEDIATE' },
        // I3: staging 시각은 여기서 한 번만 쓰고 이후 어떤 경로로도 갱신되지 않는다.
        createdAt: clock.now(),
        attempts: 0,
        claimToken: null,
        claimedAt: null,
        relayedAt: null,
        suppressedAt: null,
        lastErrorCode: null,
      });
      return { id, staged: true };
    },

    async tombstoneRecipient(input) {
      // L1: tombstone과 모든 삭제가 하나의 트랜잭션이다.
      tombstones.add(notificationRecipientKey(input.applicationKey, input.recipientRef));

      // L2: ingress를 배달보다 **먼저** 지운다. 그 삭제가 릴레이 트랜잭션의 행 잠금(R7)에서
      // 블록되므로, 그 릴레이는 이 문장 앞이나 뒤 중 하나로 직렬화되고, 뒤라면 이어지는
      // delivery·message 삭제가 방금 커밋된 것을 마저 지운다.
      const ingressIds = [...outbox.values()]
        .filter(
          (row) =>
            row.applicationKey === input.applicationKey &&
            row.recipientRef === input.recipientRef,
        )
        .map((row) => row.id);
      for (const id of ingressIds) {
        await withRowLock(id, async () => {
          outbox.delete(id);
        });
      }

      const deliveryIds = new Set(
        [...deliveries.values()]
          .filter(
            (row) =>
              row.applicationKey === input.applicationKey &&
              row.recipientRef === input.recipientRef,
          )
          .map((row) => row.id),
      );
      for (const id of deliveryIds) deliveries.delete(id);
      for (const [id, item] of [...items.entries()]) {
        if (deliveryIds.has(item.deliveryId)) items.delete(id);
      }
      for (const [id, message] of [...messages.entries()]) {
        if (
          message.applicationKey === input.applicationKey &&
          message.recipientRef === input.recipientRef
        ) {
          messages.delete(id);
        }
      }
      for (const [id, endpoint] of [...endpoints.entries()]) {
        if (
          endpoint.applicationKey === input.applicationKey &&
          endpoint.recipientRef === input.recipientRef
        ) {
          endpoints.delete(id);
        }
      }
      for (const key of [...preferences.keys()]) {
        if (key.startsWith(`${input.applicationKey}${NUL}${input.recipientRef}${NUL}`)) {
          preferences.delete(key);
        }
      }

      // L4: actor 익명화는 수신자 삭제와 별개다 — **다른** 수신자의 배달·메시지에 남은
      // actor 참조를 지운다. 호스트의 계정 삭제는 purge와 anonymize를 한 트랜잭션에서
      // 부르며(L1), 이 seam이 그 전체를 대표한다.
      for (const delivery of deliveries.values()) {
        if (delivery.applicationKey === input.applicationKey && delivery.actorRef === input.recipientRef) {
          delivery.actorRef = null;
        }
      }
      for (const message of messages.values()) {
        if (message.applicationKey === input.applicationKey && message.actorRef === input.recipientRef) {
          message.actorRef = null;
        }
      }
      // L3: tombstone 행만 남는다.
    },

    async registerEndpoint(input) {
      for (const row of endpoints.values()) {
        if (
          row.applicationKey === input.applicationKey &&
          row.provider === input.provider &&
          row.address === input.address
        ) {
          // 재등록은 **같은 행**을 다시 켜고 리비전을 올린다(D6이 존재하는 이유).
          row.recipientRef = input.recipientRef;
          row.enabled = true;
          row.disabledAt = null;
          row.revision += 1;
          return {
            id: row.id,
            provider: row.provider,
            address: row.address,
            revision: String(row.revision),
          };
        }
      }
      const id = nextId('endpoint');
      endpoints.set(id, {
        id,
        applicationKey: input.applicationKey,
        recipientRef: input.recipientRef,
        provider: input.provider,
        address: input.address,
        enabled: true,
        revision: 1,
        disabledAt: null,
      });
      return { id, provider: input.provider, address: input.address, revision: '1' };
    },

    async setCategoryEnabled(input) {
      preferences.set(
        preferenceKey(input.applicationKey, input.recipientRef, input.category),
        input.enabled,
      );
    },

    snapshot() {
      return {
        outbox: [...outbox.values()].map((row) => ({ ...row })),
        deliveries: [...deliveries.values()].map((row) => ({ ...row })),
        items: [...items.values()].map((row) => ({ ...row })),
        messages: [...messages.values()].map((row) => ({ ...row })),
        endpoints: [...endpoints.values()].map((row) => ({ ...row })),
        preferences: [...preferences.entries()].map(([key, enabled]) => {
          const [applicationKey = '', recipientRef = '', category = ''] = key.split(NUL);
          return { applicationKey, recipientRef, category, enabled };
        }),
        tombstones: [...tombstones],
      };
    },
  };
}
