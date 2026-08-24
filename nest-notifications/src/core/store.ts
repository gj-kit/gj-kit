/**
 * 저장소 포트 3종과 동시성 계약(설계 §3.3). **§3.1과 함께 이 패키지의 핵심이다.**
 *
 * 라이브러리는 테이블·ORM·마이그레이션을 소유하지 않는다. 대신 저장소가 무엇을 원자적으로
 * 해야 하는지를 의무 R1–R13 · D1–D9로 못 박고, `./testing`의
 * `notificationStoreContractCases()`가 그 문장을 실행 가능한 검사로 바꾼다.
 *
 * 여기 없는 것에 주목한다 — **staging 메서드가 없다.** 행은 호스트의
 * `NotificationPublisher`를 통해 호스트 트랜잭션 안에서 들어오므로, ingress 멱등은 저장소
 * 의무가 아니라 ingress 의무 I1이다(`./lifecycle`).
 */
import type { NotificationAction, NotificationPriority, NotificationTiming } from './contracts';
import type { NotificationPushEndpoint } from './push';

/** Five minutes — the source value. Long enough to survive a GC pause, short enough to recover. */
export const DEFAULT_CLAIM_STALE_MS = 300_000;
export const DEFAULT_RELAY_PAGE_SIZE = 100;
export const DEFAULT_DISPATCH_PAGE_SIZE = 100;

// ───────────────────────────── 릴레이 측 ─────────────────────────────

export interface ClaimedNotificationCommand {
  readonly id: string;
  readonly applicationKey: string;
  readonly recipientRef: string;
  readonly actorRef: string | null;
  readonly targetRef: string | null;
  readonly category: string;
  /** A plain string: narrow it with `notificationPriorityFrom`. */
  readonly priority: string;
  readonly title: string | null;
  readonly body: string;
  readonly action: NotificationAction | null;
  readonly eventKey: string;
  readonly batchKey: string | null;
  readonly batchLabel: string | null;
  readonly batchItemCount: number;
  readonly timing: NotificationTiming;
  /**
   * When this row entered the ingress outbox. The library never writes it: it has
   * no staging method (staging belongs to the host's `NotificationPublisher`), so
   * this timestamp comes from the host's staging path (R13). It is also the input
   * to the batch bucket, which is why R13 makes it an obligation rather than a
   * field description.
   */
  readonly createdAt: Date;
  /** How many times a worker has claimed this row, including this claim (R13). */
  readonly attempts: number;
}

export interface RelayClaimRequest {
  readonly applicationKey: string;
  readonly limit: number;
  /**
   * From the injected clock. Recorded verbatim on completion stamps and passed to
   * the policy (R9). It is NOT the input to the staleness comparison - see
   * `claimStaleMs`.
   */
  readonly at: Date;
  /**
   * A duration, deliberately not an instant. The store decides staleness on its
   * own clock (`claimedAt < now() - claimStaleMs`, R12): with N workers there are
   * N process clocks, and the only clock they share is the store's.
   */
  readonly claimStaleMs: number;
  /**
   * Skip rows already attempted this many times. Absent means no bound, which
   * lets a permanently failing row occupy the due page forever (R13, design 7-16).
   *
   * The predicate is `attempts < maxAttempts` and nothing else: there is no
   * cooldown column and no `retryAfter` field on this request or on
   * {@link RelayReleaseRequest}, because retry timing has exactly one owner and
   * it is the host's scheduler (design 0.4-7). A released row is therefore due
   * again on the very next pass, so this bound is a pass count, not a duration.
   */
  readonly maxAttempts?: number | undefined;
  /** Opaque token this worker writes onto every row it wins. */
  readonly claimToken: string;
}

export interface RelayCompleteRequest {
  readonly applicationKey: string;
  readonly outboxId: string;
  readonly claimToken: string;
  readonly at: Date;
  readonly suppressed: boolean;
}

export interface RelayReleaseRequest {
  readonly applicationKey: string;
  readonly outboxId: string;
  readonly claimToken: string;
  /** Already redacted by the relay: a stable short code, never an exception message. */
  readonly errorCode: string | null;
}

export interface RelayTransactionRequest {
  readonly applicationKey: string;
  readonly outboxId: string;
  readonly claimToken: string;
  readonly at: Date;
}

/** The five columns whose combination must be unique per delivery (R5). */
export interface BatchIdentity {
  readonly applicationKey: string;
  readonly recipientRef: string;
  readonly batchKey: string;
  readonly batchWindowStartedAt: Date;
  readonly batchPolicyKey: string;
}

export interface CreateDeliveryInput {
  readonly applicationKey: string;
  readonly recipientRef: string;
  readonly actorRef: string | null;
  readonly category: string;
  readonly priority: NotificationPriority;
  readonly title: string | null;
  readonly body: string;
  readonly action: NotificationAction | null;
  /** Null for a standalone delivery: the batch unique constraint then does not apply. */
  readonly batchKey: string | null;
  readonly batchWindowStartedAt: Date | null;
  readonly batchPolicyKey: string | null;
  readonly aggregationLabel: string | null;
  readonly batchCount: number;
  readonly batchItemCount: number;
  /** Not dispatchable before this instant (D5). */
  readonly deliverAfter: Date;
  readonly createdAt: Date;
}

export interface MergeBatchInput {
  readonly applicationKey: string;
  readonly deliveryId: string;
  /** Added to `batchCount`. Always 1 today; a parameter so a store never guesses. */
  readonly addedCount: number;
  readonly addedItemCount: number;
  readonly aggregationLabel: string | null;
  readonly at: Date;
}

export interface AppendItemInput {
  readonly applicationKey: string;
  readonly deliveryId: string;
  readonly sourceOutboxId: string;
  readonly at: Date;
}

export interface OpenBatchDelivery {
  readonly id: string;
  /** False once the delivery is claimed, presentation-locked or delivered. */
  readonly open: boolean;
}

/**
 * `created: false` means a delivery with this batch identity already existed and
 * `id` is that row. It is NOT an error and MUST NOT throw (R11): the caller falls
 * back to `mergeIntoBatch`, and to the follow-up route when that fails.
 * Appending an item to a delivery you did not create can bind it to a
 * presentation-locked row, which loses the notification silently (design 0.3-7).
 */
export interface CreateDeliveryResult {
  readonly id: string;
  readonly created: boolean;
}

export interface NotificationRelayTransaction {
  /** Re-read the locked source row. `null` means it is gone (recipient purge). */
  readCommand(): Promise<ClaimedNotificationCommand | null>;
  /** Category preference gate. Absent rows mean enabled. */
  isCategoryEnabled(input: {
    readonly recipientRef: string;
    readonly category: string;
  }): Promise<boolean>;
  /** Idempotency probe for this source row (G2). */
  findDeliveryBySource(): Promise<{ readonly deliveryId: string } | null>;
  findOpenBatch(key: BatchIdentity): Promise<OpenBatchDelivery | null>;
  /** Conditional merge. `false` means the batch closed between read and write (R6). */
  mergeIntoBatch(input: MergeBatchInput): Promise<boolean>;
  /** Conflict-safe. Never throws on the batch-identity unique constraint (R11). */
  createDelivery(input: CreateDeliveryInput): Promise<CreateDeliveryResult>;
  /** `false` means an item for this source row already existed (R4). */
  appendItem(input: AppendItemInput): Promise<boolean>;
}

/**
 * Ingress outbox persistence. The library owns no schema; a host maps these four
 * operations onto its own table. The obligations R1-R13 documented in the design
 * are part of the contract, and `notificationStoreContractCases()` from the
 * `./testing` subpath checks them.
 */
export interface NotificationRelayStore {
  /** Atomically claim up to `limit` due rows. Only rows this call actually won are returned (R1). */
  claimDue(request: RelayClaimRequest): Promise<readonly ClaimedNotificationCommand[]>;
  /**
   * Run `work` in one transaction that holds the outbox row lock (R7). Resolves
   * to `null` without running `work` when this worker no longer owns the claim.
   */
  relayInTransaction<T>(
    request: RelayTransactionRequest,
    work: (tx: NotificationRelayTransaction) => Promise<T>,
  ): Promise<T | null>;
  /** `false` means the claim was lost; the stored outcome is unchanged (R8). */
  completeClaim(request: RelayCompleteRequest): Promise<boolean>;
  /** Release a failed claim so the next pass can retry it. Never throws for a lost claim. */
  releaseClaim(request: RelayReleaseRequest): Promise<void>;
}

// ──────────────────────────── 디스패치 측 ────────────────────────────

export interface ClaimedNotificationDelivery {
  readonly id: string;
  readonly applicationKey: string;
  readonly recipientRef: string;
  readonly actorRef: string | null;
  readonly category: string;
  readonly priority: string;
  readonly title: string | null;
  readonly body: string;
  readonly action: NotificationAction | null;
  readonly batchCount: number;
  readonly batchItemCount: number;
  readonly aggregationLabel: string | null;
  /** How many times a worker has claimed this delivery, including this claim (D9). */
  readonly attempts: number;
}

export interface DispatchClaimRequest {
  readonly applicationKey: string;
  readonly limit: number;
  /** From the injected clock. Also the due cutoff for `deliverAfter` (D5). */
  readonly at: Date;
  /** A duration; the store compares it against its own clock (D8). */
  readonly claimStaleMs: number;
  /** Same predicate and the same "pass count, not duration" caveat as R13 (D9). */
  readonly maxAttempts?: number | undefined;
  readonly claimToken: string;
}

export interface DispatchTransactionRequest {
  readonly applicationKey: string;
  readonly deliveryId: string;
  readonly claimToken: string;
  readonly at: Date;
}

export interface DispatchCompleteRequest {
  readonly applicationKey: string;
  readonly deliveryId: string;
  readonly claimToken: string;
  readonly at: Date;
}

export interface DispatchReleaseRequest {
  readonly applicationKey: string;
  readonly deliveryId: string;
  readonly claimToken: string;
  /** Already redacted: a stable short code, never an exception message. */
  readonly errorCode: string | null;
}

export interface EnsureMessageInput {
  readonly applicationKey: string;
  readonly deliveryId: string;
  readonly recipientRef: string;
  readonly actorRef: string | null;
  readonly category: string;
  readonly priority: NotificationPriority;
  readonly title: string | null;
  readonly body: string;
  readonly action: NotificationAction | null;
  readonly at: Date;
}

export interface NotificationDispatchTransaction {
  readDelivery(): Promise<ClaimedNotificationDelivery | null>;
  /** Conflict-safe insert then read. Never throws on a duplicate (D2). */
  ensureMessage(input: EnsureMessageInput): Promise<{ readonly id: string }>;
}

export interface NotificationDeliveryStore {
  /**
   * Atomically claim due deliveries. The claim MUST also stamp the presentation
   * lock in the same statement (D1): split into two statements, a relay can merge
   * an item in between and the user never sees it.
   */
  claimDue(request: DispatchClaimRequest): Promise<readonly ClaimedNotificationDelivery[]>;
  materializeInTransaction<T>(
    request: DispatchTransactionRequest,
    work: (tx: NotificationDispatchTransaction) => Promise<T>,
  ): Promise<T | null>;
  /** `false` means the claim was lost; `deliveredAt` is unchanged (D3). */
  complete(request: DispatchCompleteRequest): Promise<boolean>;
  /**
   * Release a failed claim. The presentation lock is NOT released: the inbox
   * sentence may already have been shown to the user (D1).
   */
  releaseClaim(request: DispatchReleaseRequest): Promise<void>;
}

// ──────────────────────────── endpoint 측 ────────────────────────────

/**
 * An endpoint plus the registration revision observed when it was listed. A
 * disable computed from this observation must not survive a re-registration that
 * happened afterwards (D6).
 */
export interface ObservedNotificationEndpoint extends NotificationPushEndpoint {
  /**
   * Opaque and compared only for equality. Any value that changes whenever the
   * row is re-registered works: `lastSeenAt.toISOString()`, a version counter, or
   * an xmin/rowversion column.
   */
  readonly revision: string;
}

export interface NotificationEndpointDisableTarget {
  readonly id: string;
  /** Exactly the value `listEnabled` returned for this endpoint. */
  readonly revision: string;
}

export interface NotificationEndpointStore {
  listEnabled(input: {
    readonly applicationKey: string;
    readonly recipientRef: string;
    readonly providers: readonly string[];
  }): Promise<readonly ObservedNotificationEndpoint[]>;
  /**
   * Idempotent and stale-safe. An empty list is a no-op, and so is an entry whose
   * `revision` no longer matches the stored row: the device re-registered between
   * `listEnabled` and here, and disabling it would leave a live device dark
   * indefinitely (D6, design 0.2-18).
   */
  disable(input: {
    readonly applicationKey: string;
    readonly endpoints: readonly NotificationEndpointDisableTarget[];
    /** Recorded as the disable instant. From the injected clock (D7). */
    readonly at: Date;
  }): Promise<void>;
}
