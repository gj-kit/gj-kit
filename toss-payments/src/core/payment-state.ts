/**
 * 결제 상태 스냅샷과 변경 요약.
 *
 * Payment 상태는 단방향 상태 머신이 아니다. 특히 입금 오류로
 * DONE -> WAITING_FOR_DEPOSIT 역전이가 가능하므로, 이 모듈은 전이를 허용/거부하지 않고
 * 두 관측값의 차이만 기술한다. 영속화 순서와 동시성 제어는 호출자의 저장소가 맡는다.
 */
import {
  orderId as parseOrderId,
  paymentKey as parsePaymentKey,
  type InvalidInput,
  type OrderId,
  type PaymentKey,
} from "./ids";
import {
  isFullyCanceled,
  type CancelTransaction,
  type Payment,
  type PaymentStatus,
} from "./payment";
import { err, ok, type Err, type Result } from "./result";

export type PaymentLifecycle =
  | "pending"
  | "awaiting-deposit"
  | "paid"
  | "cancellation-pending"
  | "partially-canceled"
  | "fully-canceled"
  | "failed"
  | "expired"
  | "inconsistent";

/** 현재 금액만으로 본 취소 정도. full 판정은 기존 {@link isFullyCanceled} 계약을 따른다. */
export type PaymentAmountState = "none" | "partial" | "full";

/** 상태 관리에 필요한 최소 취소 트랜잭션. 사유·영수증 및 Payment.raw는 의도적으로 제외한다. */
export interface PaymentCancelTransactionSnapshot {
  readonly transactionKey: string;
  readonly cancelAmount: number;
  readonly refundableAmount: number;
  readonly canceledAt: string;
  readonly cancelStatus: CancelTransaction["cancelStatus"];
  readonly cancelRequestId: string | null;
}

export type PaymentStateConsistencyIssue =
  | {
      readonly kind: "invalid-amount";
      readonly field: "totalAmount" | "balanceAmount";
      readonly value: number;
      readonly reason: "not-safe-integer" | "negative";
    }
  | {
      readonly kind: "balance-exceeds-total";
      readonly totalAmount: number;
      readonly balanceAmount: number;
    }
  | {
      readonly kind: "zero-balance-with-non-canceled-status";
      readonly status: Exclude<PaymentStatus, "CANCELED" | "PARTIAL_CANCELED">;
    }
  | {
      readonly kind: "cancellation-status-without-history";
      readonly status: "CANCELED" | "PARTIAL_CANCELED";
    }
  | {
      readonly kind: "canceled-status-with-balance";
      readonly balanceAmount: number;
    }
  | {
      readonly kind: "partial-status-without-canceled-amount";
      readonly totalAmount: number;
      readonly balanceAmount: number;
    }
  | {
      readonly kind: "partial-status-without-effective-cancellation";
    }
  | {
      readonly kind: "paid-status-with-canceled-amount";
      readonly totalAmount: number;
      readonly balanceAmount: number;
    }
  | {
      readonly kind: "full-cancellation-status-mismatch";
      readonly status: Exclude<PaymentStatus, "CANCELED" | "PARTIAL_CANCELED">;
    }
  | {
      readonly kind: "completed-cancel-status-mismatch";
      readonly status: Exclude<PaymentStatus, "CANCELED" | "PARTIAL_CANCELED">;
    }
  | {
      readonly kind: "latest-cancel-balance-mismatch";
      readonly transactionKey: string;
      readonly cancelRefundableAmount: number;
      readonly paymentBalanceAmount: number;
    }
  | {
      readonly kind: "duplicate-cancel-transaction-key";
      readonly transactionKey: string;
    };

/**
 * 저장·로그하기 안전한 결제 상태 요약.
 *
 * Payment.secret, Payment.raw, 카드/계좌 상세 및 취소 사유는 포함하지 않는다.
 */
export interface PaymentStateSnapshot {
  /** 영속 스키마 진화를 위한 고정 버전. */
  readonly schemaVersion: 1;
  readonly paymentKey: PaymentKey;
  readonly orderId: OrderId;
  readonly status: PaymentStatus;
  readonly lifecycle: PaymentLifecycle;
  readonly totalAmount: number;
  readonly balanceAmount: number;
  readonly lastTransactionKey: string | null;
  /** totalAmount - balanceAmount. 비정상 응답에서는 음수일 수 있으며 consistencyIssues에 남는다. */
  readonly canceledAmount: number;
  readonly amountState: PaymentAmountState;
  readonly hasPendingCancellation: boolean;
  readonly hasAbortedCancellation: boolean;
  /** 현재 스냅샷에서 새 취소 요청을 시도할 수 있는지에 대한 보수적 힌트. */
  readonly isCancelable: boolean;
  /** 입금 전·비동기 취소 진행 중을 제외하고 부분취소가 가능한지에 대한 보수적 힌트. */
  readonly isPartiallyCancelable: boolean;
  readonly cancels: readonly PaymentCancelTransactionSnapshot[];
  readonly consistencyIssues: readonly PaymentStateConsistencyIssue[];
}

/**
 * The minimal structural input {@link summarizePaymentState} actually reads — exactly these
 * eight fields, nothing else (verified against the implementation: the lifecycle, amount and
 * consistency judgments consume `status`/`totalAmount`/`balanceAmount`/`lastTransactionKey`/
 * `isPartialCancelable`/`cancels`, and the snapshot carries `paymentKey`/`orderId`).
 *
 * A full `Payment` is always assignable — including a fresh inline object literal:
 * {@link summarizePaymentState} is typed `PaymentStateInput | Payment`, and the `Payment`
 * union member exists solely so TypeScript's excess-property check accepts literals that
 * spell out non-Pick `Payment` fields (`version`, `requestedAt`, …). Existing call sites
 * compile unchanged. The point of the reduced shape is the opposite direction: an app-owned
 * payment view that stripped `raw`/`secret`/card details can still produce a snapshot,
 * **provided its eight fields are faithful copies of a real Payment response**. Do not fabricate `lastTransactionKey`,
 * `isPartialCancelable` or `cancels` to satisfy the type — the consistency and
 * cancelability judgments would then describe your fabrication, not the provider state.
 */
export type PaymentStateInput = Pick<
  Payment,
  | "paymentKey"
  | "orderId"
  | "status"
  | "totalAmount"
  | "balanceAmount"
  | "lastTransactionKey"
  | "isPartialCancelable"
  | "cancels"
>;

function summarizeCancel(
  cancel: CancelTransaction
): PaymentCancelTransactionSnapshot {
  return {
    transactionKey: cancel.transactionKey,
    cancelAmount: cancel.cancelAmount,
    refundableAmount: cancel.refundableAmount,
    canceledAt: cancel.canceledAt,
    cancelStatus: cancel.cancelStatus,
    cancelRequestId: cancel.cancelRequestId,
  };
}

function lifecycleOf(
  payment: PaymentStateInput,
  fullyCanceled: boolean,
  hasPendingCancellation: boolean
): PaymentLifecycle {
  if (hasPendingCancellation) return "cancellation-pending";
  if (
    payment.balanceAmount === 0 &&
    payment.status !== "CANCELED" &&
    payment.status !== "PARTIAL_CANCELED"
  ) {
    return "inconsistent";
  }
  if (fullyCanceled) {
    return payment.status === "CANCELED" ||
      payment.status === "PARTIAL_CANCELED"
      ? "fully-canceled"
      : "inconsistent";
  }
  switch (payment.status) {
    case "READY":
    case "IN_PROGRESS":
      return "pending";
    case "WAITING_FOR_DEPOSIT":
      return "awaiting-deposit";
    case "DONE":
      return "paid";
    case "PARTIAL_CANCELED":
      return "partially-canceled";
    case "CANCELED":
      // CANCELED인데 기존 완전취소 불변식(balance 0 + cancels 존재)을 만족하지 않는다.
      return "inconsistent";
    case "ABORTED":
      return "failed";
    case "EXPIRED":
      return "expired";
  }
}

function inspectAmount(
  issues: PaymentStateConsistencyIssue[],
  field: "totalAmount" | "balanceAmount",
  value: number
): void {
  if (!Number.isSafeInteger(value)) {
    issues.push({
      kind: "invalid-amount",
      field,
      value,
      reason: "not-safe-integer",
    });
  } else if (value < 0) {
    issues.push({ kind: "invalid-amount", field, value, reason: "negative" });
  }
}

function consistencyIssuesOf(
  payment: PaymentStateInput,
  cancels: readonly PaymentCancelTransactionSnapshot[],
  canceledAmount: number,
  fullyCanceled: boolean
): readonly PaymentStateConsistencyIssue[] {
  const issues: PaymentStateConsistencyIssue[] = [];
  inspectAmount(issues, "totalAmount", payment.totalAmount);
  inspectAmount(issues, "balanceAmount", payment.balanceAmount);

  if (
    Number.isFinite(payment.totalAmount) &&
    Number.isFinite(payment.balanceAmount) &&
    payment.balanceAmount > payment.totalAmount
  ) {
    issues.push({
      kind: "balance-exceeds-total",
      totalAmount: payment.totalAmount,
      balanceAmount: payment.balanceAmount,
    });
  }

  if (
    payment.balanceAmount === 0 &&
    payment.status !== "CANCELED" &&
    payment.status !== "PARTIAL_CANCELED"
  ) {
    issues.push({
      kind: "zero-balance-with-non-canceled-status",
      status: payment.status,
    });
  }

  if (
    payment.status === "CANCELED" &&
    !fullyCanceled &&
    payment.balanceAmount > 0
  ) {
    issues.push({
      kind: "canceled-status-with-balance",
      balanceAmount: payment.balanceAmount,
    });
  }
  if (
    (payment.status === "CANCELED" || payment.status === "PARTIAL_CANCELED") &&
    cancels.length === 0
  ) {
    issues.push({
      kind: "cancellation-status-without-history",
      status: payment.status,
    });
  }
  if (payment.status === "PARTIAL_CANCELED" && canceledAmount <= 0) {
    issues.push({
      kind: "partial-status-without-canceled-amount",
      totalAmount: payment.totalAmount,
      balanceAmount: payment.balanceAmount,
    });
  }
  if (
    fullyCanceled &&
    payment.status !== "CANCELED" &&
    payment.status !== "PARTIAL_CANCELED"
  ) {
    issues.push({
      kind: "full-cancellation-status-mismatch",
      status: payment.status,
    });
  }

  const hasCompletedCancellation = cancels.some(
    (cancel) => cancel.cancelStatus === "DONE"
  );
  const hasPendingCancellation = cancels.some(
    (cancel) => cancel.cancelStatus === "IN_PROGRESS"
  );
  if (
    payment.status === "PARTIAL_CANCELED" &&
    canceledAmount > 0 &&
    !hasCompletedCancellation &&
    !hasPendingCancellation
  ) {
    issues.push({ kind: "partial-status-without-effective-cancellation" });
  }
  if (
    payment.status === "DONE" &&
    canceledAmount > 0 &&
    !hasCompletedCancellation &&
    !hasPendingCancellation
  ) {
    issues.push({
      kind: "paid-status-with-canceled-amount",
      totalAmount: payment.totalAmount,
      balanceAmount: payment.balanceAmount,
    });
  }
  if (
    hasCompletedCancellation &&
    canceledAmount > 0 &&
    payment.status !== "CANCELED" &&
    payment.status !== "PARTIAL_CANCELED"
  ) {
    issues.push({
      kind: "completed-cancel-status-mismatch",
      status: payment.status,
    });
  }

  const latestCancel =
    payment.lastTransactionKey === null
      ? undefined
      : cancels.find(
          (cancel) => cancel.transactionKey === payment.lastTransactionKey
        );
  if (
    latestCancel !== undefined &&
    latestCancel.cancelStatus === "DONE" &&
    latestCancel.refundableAmount !== payment.balanceAmount
  ) {
    issues.push({
      kind: "latest-cancel-balance-mismatch",
      transactionKey: latestCancel.transactionKey,
      cancelRefundableAmount: latestCancel.refundableAmount,
      paymentBalanceAmount: payment.balanceAmount,
    });
  }

  const seen = new Set<string>();
  const reportedDuplicates = new Set<string>();
  for (const cancel of cancels) {
    if (
      seen.has(cancel.transactionKey) &&
      !reportedDuplicates.has(cancel.transactionKey)
    ) {
      issues.push({
        kind: "duplicate-cancel-transaction-key",
        transactionKey: cancel.transactionKey,
      });
      reportedDuplicates.add(cancel.transactionKey);
    }
    seen.add(cancel.transactionKey);
  }
  return issues;
}

/**
 * Payment에서 민감 필드를 제거한 현재 상태 스냅샷을 만든다.
 *
 * Accepts the structural {@link PaymentStateInput} (the eight fields the summary actually
 * reads) rather than a full `Payment`, so app-owned reduced payment views can produce
 * snapshots too. Full `Payment` values remain assignable unchanged — the explicit
 * `| Payment` union member keeps fresh inline full-`Payment` literals free of
 * excess-property errors.
 */
export function summarizePaymentState(
  payment: PaymentStateInput | Payment
): PaymentStateSnapshot {
  const cancels = (payment.cancels ?? []).map(summarizeCancel);
  const fullyCanceled = isFullyCanceled(payment);
  const canceledAmount = payment.totalAmount - payment.balanceAmount;
  const amountState: PaymentAmountState = fullyCanceled
    ? "full"
    : canceledAmount > 0
    ? "partial"
    : "none";
  const hasPendingCancellation = cancels.some(
    (cancel) => cancel.cancelStatus === "IN_PROGRESS"
  );
  const hasAbortedCancellation = cancels.some(
    (cancel) => cancel.cancelStatus === "ABORTED"
  );
  const consistencyIssues = consistencyIssuesOf(
    payment,
    cancels,
    canceledAmount,
    fullyCanceled
  );
  const cancelableStatus =
    payment.status === "DONE" ||
    payment.status === "PARTIAL_CANCELED" ||
    payment.status === "WAITING_FOR_DEPOSIT";
  const hasRefundableBalance =
    Number.isSafeInteger(payment.balanceAmount) && payment.balanceAmount > 0;
  const isCancelable =
    cancelableStatus &&
    hasRefundableBalance &&
    !fullyCanceled &&
    !hasPendingCancellation &&
    consistencyIssues.length === 0;
  const isPartiallyCancelable =
    isCancelable &&
    payment.status !== "WAITING_FOR_DEPOSIT" &&
    payment.isPartialCancelable === true;
  const lifecycle =
    consistencyIssues.length > 0 && !hasPendingCancellation
      ? "inconsistent"
      : lifecycleOf(payment, fullyCanceled, hasPendingCancellation);

  return {
    schemaVersion: 1,
    paymentKey: payment.paymentKey,
    orderId: payment.orderId,
    status: payment.status,
    lifecycle,
    totalAmount: payment.totalAmount,
    balanceAmount: payment.balanceAmount,
    lastTransactionKey: payment.lastTransactionKey,
    canceledAmount,
    amountState,
    hasPendingCancellation,
    hasAbortedCancellation,
    isCancelable,
    isPartiallyCancelable,
    cancels,
    consistencyIssues,
  };
}

export interface PaymentStateValueChange<T> {
  readonly previous: T;
  readonly next: T;
}

export interface PaymentStateBalanceChange
  extends PaymentStateValueChange<number> {
  /** next - previous. 취소가 진행되면 보통 음수다. */
  readonly delta: number;
}

export interface PaymentCancelTransactionUpdate {
  readonly previous: PaymentCancelTransactionSnapshot;
  readonly next: PaymentCancelTransactionSnapshot;
}

export interface PaymentCancelChanges {
  readonly added: readonly PaymentCancelTransactionSnapshot[];
  readonly updated: readonly PaymentCancelTransactionUpdate[];
  readonly removed: readonly PaymentCancelTransactionSnapshot[];
}

export type PaymentStateDiffWarning =
  | {
      /** 환불 취소·입금 오류 등 정상적인 역전이일 수도 있으므로 오류로 차단하지 않는다. */
      readonly kind: "balance-increased";
      readonly previousBalanceAmount: number;
      readonly nextBalanceAmount: number;
      readonly delta: number;
    }
  | {
      /** 제공자 응답의 취소 배열에서 이전 transactionKey가 사라졌다. */
      readonly kind: "cancel-removed";
      readonly transactionKey: string;
    };

export interface PaymentStateDiff {
  readonly previous: PaymentStateSnapshot;
  readonly next: PaymentStateSnapshot;
  readonly changed: boolean;
  readonly statusChange: PaymentStateValueChange<PaymentStatus> | null;
  readonly lifecycleChange: PaymentStateValueChange<PaymentLifecycle> | null;
  readonly balanceAmountChange: PaymentStateBalanceChange | null;
  readonly lastTransactionKeyChange: PaymentStateValueChange<
    string | null
  > | null;
  readonly amountStateChange: PaymentStateValueChange<PaymentAmountState> | null;
  readonly pendingCancellationChange: PaymentStateValueChange<boolean> | null;
  readonly abortedCancellationChange: PaymentStateValueChange<boolean> | null;
  readonly cancelableChange: PaymentStateValueChange<boolean> | null;
  readonly partiallyCancelableChange: PaymentStateValueChange<boolean> | null;
  readonly cancelChanges: PaymentCancelChanges;
  readonly warnings: readonly PaymentStateDiffWarning[];
}

export interface PaymentStateIdentityMismatch {
  readonly field: "paymentKey" | "orderId";
  readonly previous: string;
  readonly next: string;
}

/** 서로 다른 결제의 스냅샷을 비교하려 한 경우에만 반환되는 오류. */
export interface PaymentStateIdentityError {
  readonly source: "library";
  readonly kind: "payment-state-identity-mismatch";
  readonly mismatches: readonly PaymentStateIdentityMismatch[];
}

function sameCancel(
  previous: PaymentCancelTransactionSnapshot,
  next: PaymentCancelTransactionSnapshot
): boolean {
  return (
    previous.transactionKey === next.transactionKey &&
    previous.cancelAmount === next.cancelAmount &&
    previous.refundableAmount === next.refundableAmount &&
    previous.canceledAt === next.canceledAt &&
    previous.cancelStatus === next.cancelStatus &&
    previous.cancelRequestId === next.cancelRequestId
  );
}

/**
 * 동일 결제의 두 상태 스냅샷을 비교한다.
 *
 * 어떤 status 전이도 거부하지 않는다. 식별자가 다를 때만 Err이며, 잔액 증가와 취소
 * transaction 제거는 성공 결과의 warnings로 전달한다.
 */
export function diffPaymentState(
  previous: PaymentStateSnapshot,
  next: PaymentStateSnapshot
): Result<PaymentStateDiff, PaymentStateIdentityError> {
  const mismatches: PaymentStateIdentityMismatch[] = [];
  if (previous.paymentKey !== next.paymentKey) {
    mismatches.push({
      field: "paymentKey",
      previous: previous.paymentKey,
      next: next.paymentKey,
    });
  }
  if (previous.orderId !== next.orderId) {
    mismatches.push({
      field: "orderId",
      previous: previous.orderId,
      next: next.orderId,
    });
  }
  if (mismatches.length > 0) {
    return err({
      source: "library",
      kind: "payment-state-identity-mismatch",
      mismatches,
    });
  }

  const statusChange =
    previous.status === next.status
      ? null
      : { previous: previous.status, next: next.status };
  const lifecycleChange =
    previous.lifecycle === next.lifecycle
      ? null
      : { previous: previous.lifecycle, next: next.lifecycle };
  const balanceAmountChange =
    previous.balanceAmount === next.balanceAmount
      ? null
      : {
          previous: previous.balanceAmount,
          next: next.balanceAmount,
          delta: next.balanceAmount - previous.balanceAmount,
        };
  const amountStateChange =
    previous.amountState === next.amountState
      ? null
      : { previous: previous.amountState, next: next.amountState };
  const lastTransactionKeyChange =
    previous.lastTransactionKey === next.lastTransactionKey
      ? null
      : {
          previous: previous.lastTransactionKey,
          next: next.lastTransactionKey,
        };
  const pendingCancellationChange =
    previous.hasPendingCancellation === next.hasPendingCancellation
      ? null
      : {
          previous: previous.hasPendingCancellation,
          next: next.hasPendingCancellation,
        };
  const abortedCancellationChange =
    previous.hasAbortedCancellation === next.hasAbortedCancellation
      ? null
      : {
          previous: previous.hasAbortedCancellation,
          next: next.hasAbortedCancellation,
        };
  const cancelableChange =
    previous.isCancelable === next.isCancelable
      ? null
      : { previous: previous.isCancelable, next: next.isCancelable };
  const partiallyCancelableChange =
    previous.isPartiallyCancelable === next.isPartiallyCancelable
      ? null
      : {
          previous: previous.isPartiallyCancelable,
          next: next.isPartiallyCancelable,
        };

  const previousByKey = new Map(
    previous.cancels.map((cancel) => [cancel.transactionKey, cancel])
  );
  const nextByKey = new Map(
    next.cancels.map((cancel) => [cancel.transactionKey, cancel])
  );
  const added = next.cancels.filter(
    (cancel) => !previousByKey.has(cancel.transactionKey)
  );
  const removed = previous.cancels.filter(
    (cancel) => !nextByKey.has(cancel.transactionKey)
  );
  const updated: PaymentCancelTransactionUpdate[] = [];
  for (const nextCancel of next.cancels) {
    const previousCancel = previousByKey.get(nextCancel.transactionKey);
    if (
      previousCancel !== undefined &&
      !sameCancel(previousCancel, nextCancel)
    ) {
      updated.push({ previous: previousCancel, next: nextCancel });
    }
  }

  const warnings: PaymentStateDiffWarning[] = [];
  if (balanceAmountChange !== null && balanceAmountChange.delta > 0) {
    warnings.push({
      kind: "balance-increased",
      previousBalanceAmount: balanceAmountChange.previous,
      nextBalanceAmount: balanceAmountChange.next,
      delta: balanceAmountChange.delta,
    });
  }
  for (const cancel of removed) {
    warnings.push({
      kind: "cancel-removed",
      transactionKey: cancel.transactionKey,
    });
  }

  return ok({
    previous,
    next,
    changed:
      statusChange !== null ||
      lifecycleChange !== null ||
      balanceAmountChange !== null ||
      lastTransactionKeyChange !== null ||
      amountStateChange !== null ||
      pendingCancellationChange !== null ||
      abortedCancellationChange !== null ||
      cancelableChange !== null ||
      partiallyCancelableChange !== null ||
      added.length > 0 ||
      updated.length > 0 ||
      removed.length > 0,
    statusChange,
    lifecycleChange,
    balanceAmountChange,
    lastTransactionKeyChange,
    amountStateChange,
    pendingCancellationChange,
    abortedCancellationChange,
    cancelableChange,
    partiallyCancelableChange,
    cancelChanges: { added, updated, removed },
    warnings,
  });
}

// ── 브랜드 경계 밖으로: 직렬화 · 복원 · 장부 대조 ─────────────────────────────
//
// PaymentStateSnapshot의 paymentKey/orderId는 브랜드 타입이라, 스냅샷을 게이트웨이/
// toss 경계 밖(응답 DTO, 큐, 저장 컬럼)으로 내보내면 브랜드가 함께 새어 나간다.
// 아래 3종은 그 경계를 명시적으로 만든다: 내보낼 때는 브랜드를 벗기고(serialize),
// 다시 들일 때는 구조 검증 + 기존 id 파서로 재브랜딩하며(parse), 장부 대조는
// 어느 쪽 형태로든 받는다(compareLedgerRefund).

/**
 * Brand-free, JSON-ready form of {@link PaymentStateSnapshot}.
 *
 * Identical field-for-field, except `paymentKey`/`orderId` are plain `string`s — safe to put
 * in a response DTO, a queue message or a jsonb column without exporting the branded id types
 * across your provider boundary. Every other field is already a JSON primitive, a plain
 * object array, or `null`. A `PaymentStateSnapshot` is assignable to this type (brands are
 * strings underneath); the reverse direction must go through
 * {@link parsePaymentStateSnapshot}.
 *
 * JSON caveat: a snapshot whose `consistencyIssues` include `invalid-amount` with
 * `reason: 'not-safe-integer'` may carry non-finite numbers (`NaN`/`Infinity`), which
 * `JSON.stringify` silently turns into `null` — the later parse then rejects the value
 * honestly instead of resurrecting a fake amount. Check `consistencyIssues` before
 * persisting a snapshot as JSON.
 */
export interface SerializedPaymentStateSnapshot {
  readonly schemaVersion: 1;
  readonly paymentKey: string;
  readonly orderId: string;
  readonly status: PaymentStatus;
  readonly lifecycle: PaymentLifecycle;
  readonly totalAmount: number;
  readonly balanceAmount: number;
  readonly lastTransactionKey: string | null;
  readonly canceledAmount: number;
  readonly amountState: PaymentAmountState;
  readonly hasPendingCancellation: boolean;
  readonly hasAbortedCancellation: boolean;
  readonly isCancelable: boolean;
  readonly isPartiallyCancelable: boolean;
  readonly cancels: readonly PaymentCancelTransactionSnapshot[];
  readonly consistencyIssues: readonly PaymentStateConsistencyIssue[];
}

/**
 * Strips the id brands off a snapshot for transport/persistence.
 *
 * Pure structural copy — no field is renamed, derived or dropped, so
 * `parsePaymentStateSnapshot(JSON.parse(JSON.stringify(serialized)))` round-trips back to a
 * deep-equal branded snapshot (for JSON-safe snapshots; see the type's JSON caveat). The
 * result shares no object references with the input: mutating it cannot corrupt the
 * original snapshot.
 */
export function serializePaymentStateSnapshot(
  snapshot: PaymentStateSnapshot
): SerializedPaymentStateSnapshot {
  return {
    schemaVersion: snapshot.schemaVersion,
    paymentKey: snapshot.paymentKey,
    orderId: snapshot.orderId,
    status: snapshot.status,
    lifecycle: snapshot.lifecycle,
    totalAmount: snapshot.totalAmount,
    balanceAmount: snapshot.balanceAmount,
    lastTransactionKey: snapshot.lastTransactionKey,
    canceledAmount: snapshot.canceledAmount,
    amountState: snapshot.amountState,
    hasPendingCancellation: snapshot.hasPendingCancellation,
    hasAbortedCancellation: snapshot.hasAbortedCancellation,
    isCancelable: snapshot.isCancelable,
    isPartiallyCancelable: snapshot.isPartiallyCancelable,
    cancels: snapshot.cancels.map((cancel) => ({ ...cancel })),
    consistencyIssues: snapshot.consistencyIssues.map((issue) => ({
      ...issue,
    })),
  };
}

/**
 * Why {@link parsePaymentStateSnapshot} rejected a value: the four string-constraint reasons
 * come from re-branding `paymentKey`/`orderId` through the existing id parsers;
 * `'malformed'` covers every structural failure (wrong type, missing field, unknown literal,
 * unsupported `schemaVersion`). The offending location is in
 * {@link InvalidPaymentStateSnapshot.path}.
 */
export type PaymentStateSnapshotParseReason =
  | InvalidInput<"paymentStateSnapshot">["reason"]
  | "malformed";

/**
 * Parse failure for {@link parsePaymentStateSnapshot} — an
 * `InvalidInput<'paymentStateSnapshot'>` extended with the snapshot-specific reason union
 * and the `path` of the offending value (`'$'` for the root, otherwise a dotted path such as
 * `'cancels[2].cancelAmount'`).
 */
export interface InvalidPaymentStateSnapshot
  extends InvalidInput<"paymentStateSnapshot", PaymentStateSnapshotParseReason> {
  readonly path: string;
}

// Record 키 트릭 — PaymentStatus 등 유니언에 값이 추가되면 여기서 컴파일 에러가 나
// 런타임 허용 집합이 타입과 어긋난 채 배포되는 것을 막는다.
const PAYMENT_STATUS_FLAGS: Record<PaymentStatus, true> = {
  READY: true,
  IN_PROGRESS: true,
  WAITING_FOR_DEPOSIT: true,
  DONE: true,
  CANCELED: true,
  PARTIAL_CANCELED: true,
  ABORTED: true,
  EXPIRED: true,
};
const PAYMENT_STATUS_SET: ReadonlySet<string> = new Set(
  Object.keys(PAYMENT_STATUS_FLAGS)
);

const PAYMENT_LIFECYCLE_FLAGS: Record<PaymentLifecycle, true> = {
  pending: true,
  "awaiting-deposit": true,
  paid: true,
  "cancellation-pending": true,
  "partially-canceled": true,
  "fully-canceled": true,
  failed: true,
  expired: true,
  inconsistent: true,
};
const PAYMENT_LIFECYCLE_SET: ReadonlySet<string> = new Set(
  Object.keys(PAYMENT_LIFECYCLE_FLAGS)
);

const AMOUNT_STATE_FLAGS: Record<PaymentAmountState, true> = {
  none: true,
  partial: true,
  full: true,
};
const AMOUNT_STATE_SET: ReadonlySet<string> = new Set(
  Object.keys(AMOUNT_STATE_FLAGS)
);

const CANCEL_STATUS_FLAGS: Record<CancelTransaction["cancelStatus"], true> = {
  DONE: true,
  IN_PROGRESS: true,
  ABORTED: true,
};
const CANCEL_STATUS_SET: ReadonlySet<string> = new Set(
  Object.keys(CANCEL_STATUS_FLAGS)
);

function invalidSnapshot(
  path: string,
  reason: PaymentStateSnapshotParseReason = "malformed"
): Err<InvalidPaymentStateSnapshot> {
  return err({
    source: "library",
    kind: "invalid-input",
    field: "paymentStateSnapshot",
    reason,
    path,
  });
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonCanceledStatus(
  value: unknown
): value is Exclude<PaymentStatus, "CANCELED" | "PARTIAL_CANCELED"> {
  return (
    typeof value === "string" &&
    PAYMENT_STATUS_SET.has(value) &&
    value !== "CANCELED" &&
    value !== "PARTIAL_CANCELED"
  );
}

function parseCancelSnapshot(
  value: unknown,
  path: string
): Result<PaymentCancelTransactionSnapshot, InvalidPaymentStateSnapshot> {
  if (!isPlainObject(value)) return invalidSnapshot(path);
  // 단일 읽기 원칙: 각 own enumerable 프로퍼티를 정확히 한 번 읽어 고정한다.
  // 접근자(getter)가 검증 후 다른 값을 심는 것을 막는다 — 검증한 값 = 반환하는 값.
  const v = { ...value };
  if (typeof v.transactionKey !== "string") {
    return invalidSnapshot(`${path}.transactionKey`);
  }
  if (typeof v.cancelAmount !== "number") {
    return invalidSnapshot(`${path}.cancelAmount`);
  }
  if (typeof v.refundableAmount !== "number") {
    return invalidSnapshot(`${path}.refundableAmount`);
  }
  if (typeof v.canceledAt !== "string") {
    return invalidSnapshot(`${path}.canceledAt`);
  }
  if (
    typeof v.cancelStatus !== "string" ||
    !CANCEL_STATUS_SET.has(v.cancelStatus)
  ) {
    return invalidSnapshot(`${path}.cancelStatus`);
  }
  if (v.cancelRequestId !== null && typeof v.cancelRequestId !== "string") {
    return invalidSnapshot(`${path}.cancelRequestId`);
  }
  return ok({
    transactionKey: v.transactionKey,
    cancelAmount: v.cancelAmount,
    refundableAmount: v.refundableAmount,
    canceledAt: v.canceledAt,
    cancelStatus: v.cancelStatus as CancelTransaction["cancelStatus"],
    cancelRequestId: v.cancelRequestId,
  });
}

function parseConsistencyIssue(
  value: unknown,
  path: string
): Result<PaymentStateConsistencyIssue, InvalidPaymentStateSnapshot> {
  if (!isPlainObject(value)) return invalidSnapshot(path);
  // 단일 읽기 원칙(parseCancelSnapshot 참고): own enumerable 프로퍼티를 한 번만 읽는다.
  const v = { ...value };
  switch (v.kind) {
    case "invalid-amount": {
      if (v.field !== "totalAmount" && v.field !== "balanceAmount") {
        return invalidSnapshot(`${path}.field`);
      }
      if (typeof v.value !== "number") {
        return invalidSnapshot(`${path}.value`);
      }
      if (v.reason !== "not-safe-integer" && v.reason !== "negative") {
        return invalidSnapshot(`${path}.reason`);
      }
      return ok({
        kind: "invalid-amount",
        field: v.field,
        value: v.value,
        reason: v.reason,
      });
    }
    case "balance-exceeds-total":
    case "partial-status-without-canceled-amount":
    case "paid-status-with-canceled-amount": {
      if (typeof v.totalAmount !== "number") {
        return invalidSnapshot(`${path}.totalAmount`);
      }
      if (typeof v.balanceAmount !== "number") {
        return invalidSnapshot(`${path}.balanceAmount`);
      }
      return ok({
        kind: v.kind,
        totalAmount: v.totalAmount,
        balanceAmount: v.balanceAmount,
      });
    }
    case "zero-balance-with-non-canceled-status":
    case "full-cancellation-status-mismatch":
    case "completed-cancel-status-mismatch": {
      if (!isNonCanceledStatus(v.status)) {
        return invalidSnapshot(`${path}.status`);
      }
      return ok({ kind: v.kind, status: v.status });
    }
    case "cancellation-status-without-history": {
      if (v.status !== "CANCELED" && v.status !== "PARTIAL_CANCELED") {
        return invalidSnapshot(`${path}.status`);
      }
      return ok({
        kind: "cancellation-status-without-history",
        status: v.status,
      });
    }
    case "canceled-status-with-balance": {
      if (typeof v.balanceAmount !== "number") {
        return invalidSnapshot(`${path}.balanceAmount`);
      }
      return ok({
        kind: "canceled-status-with-balance",
        balanceAmount: v.balanceAmount,
      });
    }
    case "partial-status-without-effective-cancellation":
      return ok({ kind: "partial-status-without-effective-cancellation" });
    case "latest-cancel-balance-mismatch": {
      if (typeof v.transactionKey !== "string") {
        return invalidSnapshot(`${path}.transactionKey`);
      }
      if (typeof v.cancelRefundableAmount !== "number") {
        return invalidSnapshot(`${path}.cancelRefundableAmount`);
      }
      if (typeof v.paymentBalanceAmount !== "number") {
        return invalidSnapshot(`${path}.paymentBalanceAmount`);
      }
      return ok({
        kind: "latest-cancel-balance-mismatch",
        transactionKey: v.transactionKey,
        cancelRefundableAmount: v.cancelRefundableAmount,
        paymentBalanceAmount: v.paymentBalanceAmount,
      });
    }
    case "duplicate-cancel-transaction-key": {
      if (typeof v.transactionKey !== "string") {
        return invalidSnapshot(`${path}.transactionKey`);
      }
      return ok({
        kind: "duplicate-cancel-transaction-key",
        transactionKey: v.transactionKey,
      });
    }
    default:
      return invalidSnapshot(`${path}.kind`);
  }
}

/**
 * Validates an untrusted value (a stored/transported
 * {@link SerializedPaymentStateSnapshot}) back into a branded {@link PaymentStateSnapshot}.
 *
 * Structure is checked exhaustively — `schemaVersion: 1`, every field's type, every literal
 * against its closed union (status, lifecycle, amountState, cancelStatus, issue kinds and
 * their per-kind fields) — and `paymentKey`/`orderId` are re-branded through the existing
 * {@link paymentKey}/{@link orderId} smart constructors, keeping validation-as-the-only-path
 * to a brand intact. The first failing location is reported in `error.path`.
 *
 * Two hardening rules beyond the per-field checks:
 *
 * - **Single read.** Every own enumerable property of the untrusted value is read exactly
 *   once (a one-shot shallow copy per level) before validation, so the value that was
 *   type-checked is the value placed in the branded result — an accessor property cannot
 *   return a valid value to the check and a different one to the constructor. Inherited
 *   (prototype-supplied) properties are ignored.
 * - **Pinned arithmetic.** `canceledAmount` must equal `totalAmount - balanceAmount`
 *   whenever both amounts are safe integers — the one derivation `schemaVersion: 1` pins
 *   that {@link compareLedgerRefund}'s verdict hangs on. Snapshots whose amounts already
 *   carry `invalid-amount` issues are left to the comparison's indeterminate gate instead.
 *
 * Otherwise this is a *shape* gate, not a re-summarization: the remaining derived fields
 * (`lifecycle`, `amountState`, `isCancelable`, `consistencyIssues`, …) are trusted as data
 * produced by an earlier {@link summarizePaymentState} and are not re-derived here.
 */
export function parsePaymentStateSnapshot(
  value: unknown
): Result<PaymentStateSnapshot, InvalidPaymentStateSnapshot> {
  if (!isPlainObject(value)) return invalidSnapshot("$");
  // 단일 읽기 원칙: 검증한 값이 곧 반환되는 값이도록 own enumerable 프로퍼티를
  // 정확히 한 번만 읽는다(아래 v). 접근자 기반 바꿔치기로 브랜드 결과에
  // 미검증 값이 심기는 것을 막는다. 상속 프로퍼티는 무시된다.
  const v = { ...value };
  if (v.schemaVersion !== 1) return invalidSnapshot("schemaVersion");

  if (typeof v.paymentKey !== "string") {
    return invalidSnapshot("paymentKey");
  }
  const paymentKeyResult = parsePaymentKey(v.paymentKey);
  if (!paymentKeyResult.ok) {
    return invalidSnapshot("paymentKey", paymentKeyResult.error.reason);
  }
  if (typeof v.orderId !== "string") return invalidSnapshot("orderId");
  const orderIdResult = parseOrderId(v.orderId);
  if (!orderIdResult.ok) {
    return invalidSnapshot("orderId", orderIdResult.error.reason);
  }

  if (
    typeof v.status !== "string" ||
    !PAYMENT_STATUS_SET.has(v.status)
  ) {
    return invalidSnapshot("status");
  }
  if (
    typeof v.lifecycle !== "string" ||
    !PAYMENT_LIFECYCLE_SET.has(v.lifecycle)
  ) {
    return invalidSnapshot("lifecycle");
  }
  if (typeof v.totalAmount !== "number") {
    return invalidSnapshot("totalAmount");
  }
  if (typeof v.balanceAmount !== "number") {
    return invalidSnapshot("balanceAmount");
  }
  if (
    v.lastTransactionKey !== null &&
    typeof v.lastTransactionKey !== "string"
  ) {
    return invalidSnapshot("lastTransactionKey");
  }
  if (typeof v.canceledAmount !== "number") {
    return invalidSnapshot("canceledAmount");
  }
  // schemaVersion: 1이 고정한 유일한 산술 불변식 — 장부 대조가 의존하는 파생값이므로
  // 교차 검증한다. 비정상(비안전 정수) 금액 스냅샷은 기존 indeterminate 경로에 맡긴다.
  if (
    Number.isSafeInteger(v.totalAmount) &&
    Number.isSafeInteger(v.balanceAmount) &&
    v.canceledAmount !== v.totalAmount - v.balanceAmount
  ) {
    return invalidSnapshot("canceledAmount");
  }
  if (
    typeof v.amountState !== "string" ||
    !AMOUNT_STATE_SET.has(v.amountState)
  ) {
    return invalidSnapshot("amountState");
  }
  if (typeof v.hasPendingCancellation !== "boolean") {
    return invalidSnapshot("hasPendingCancellation");
  }
  if (typeof v.hasAbortedCancellation !== "boolean") {
    return invalidSnapshot("hasAbortedCancellation");
  }
  if (typeof v.isCancelable !== "boolean") {
    return invalidSnapshot("isCancelable");
  }
  if (typeof v.isPartiallyCancelable !== "boolean") {
    return invalidSnapshot("isPartiallyCancelable");
  }

  if (!Array.isArray(v.cancels)) return invalidSnapshot("cancels");
  const cancels: PaymentCancelTransactionSnapshot[] = [];
  for (let index = 0; index < v.cancels.length; index++) {
    const parsed = parseCancelSnapshot(
      v.cancels[index],
      `cancels[${index}]`
    );
    if (!parsed.ok) return parsed;
    cancels.push(parsed.value);
  }

  if (!Array.isArray(v.consistencyIssues)) {
    return invalidSnapshot("consistencyIssues");
  }
  const consistencyIssues: PaymentStateConsistencyIssue[] = [];
  for (let index = 0; index < v.consistencyIssues.length; index++) {
    const parsed = parseConsistencyIssue(
      v.consistencyIssues[index],
      `consistencyIssues[${index}]`
    );
    if (!parsed.ok) return parsed;
    consistencyIssues.push(parsed.value);
  }

  return ok({
    schemaVersion: 1,
    paymentKey: paymentKeyResult.value,
    orderId: orderIdResult.value,
    status: v.status as PaymentStatus,
    lifecycle: v.lifecycle as PaymentLifecycle,
    totalAmount: v.totalAmount,
    balanceAmount: v.balanceAmount,
    lastTransactionKey: v.lastTransactionKey,
    canceledAmount: v.canceledAmount,
    amountState: v.amountState as PaymentAmountState,
    hasPendingCancellation: v.hasPendingCancellation,
    hasAbortedCancellation: v.hasAbortedCancellation,
    isCancelable: v.isCancelable,
    isPartiallyCancelable: v.isPartiallyCancelable,
    cancels,
    consistencyIssues,
  });
}

/**
 * The app-owned reconciliation target for {@link compareLedgerRefund}.
 *
 * The library never derives or stores this number — how much *should* have been refunded is
 * ledger state the consuming app owns, validates and persists. The helper only answers
 * whether the provider snapshot confirms it.
 */
export interface LedgerRefundTarget {
  /**
   * Cumulative amount the app's ledger expects the provider to have refunded for this
   * payment. Must be a non-negative safe integer; anything else yields
   * `kind: 'mismatch'` with `invalidLedgerTarget: true` instead of a guessed verdict.
   */
  readonly expectedRefundedAmount: number;
  /**
   * Optional: the amount of the *single refund request currently being reconciled* —
   * i.e. `expectedRefundedAmount` = previously-confirmed refunds + `requestedAmount`.
   *
   * When provided, a `'mismatch'` / `'provider-below-ledger'` verdict carries
   * {@link LedgerRefundShortfall} in `shortfall`, distinguishing `'at-prior-state'` (the
   * provider sits exactly at the pre-request amount with nothing in flight — the request
   * most likely never reached the provider, so replaying a sealed idempotent cancel request
   * is the natural recovery) from `'unexplained'` (any other shortfall — hold for a human).
   * Without it the helper cannot tell those two apart. Must, when present, be a safe
   * integer with `0 <= requestedAmount <= expectedRefundedAmount`; anything else yields
   * `kind: 'mismatch'` with `invalidLedgerTarget: true`.
   */
  readonly requestedAmount?: number;
}

/**
 * Sub-classification of a `'provider-below-ledger'` mismatch, present only when the ledger
 * supplied {@link LedgerRefundTarget.requestedAmount}.
 *
 * - `'at-prior-state'` — the provider's confirmed amount equals
 *   `expectedRefundedAmount - requestedAmount` and no cancel is in flight: the provider is
 *   exactly where it was before the reconciling refund request, so that request most likely
 *   never reached it. Replaying the persisted (sealed, idempotent) cancel request is safe.
 * - `'unexplained'` — any other shortfall (or one with cancels still in flight). Do not
 *   auto-replay; escalate.
 */
export type LedgerRefundShortfall = "at-prior-state" | "unexplained";

/** Which side is ahead in a `'mismatch'` verdict. */
export type LedgerRefundMismatchDirection =
  /** Provider-confirmed refunds exceed the ledger target — the ledger is missing refunds. */
  | "provider-exceeds-ledger"
  /**
   * Provider refunds fall short of the target — even if every in-flight cancel completes,
   * the confirmed amount cannot reach it.
   */
  | "provider-below-ledger"
  /** The amounts cannot be compared (inconsistent snapshot or invalid ledger target). */
  | "indeterminate";

/**
 * Verdict of {@link compareLedgerRefund} — a three-way discriminated union.
 *
 * Balance model (Phase-0 field measurements, enforced by the cancel path's response
 * validation): an accepted async cancel *already* reduces `balanceAmount` while its
 * `cancelStatus` is `IN_PROGRESS`; completion (`DONE`) keeps the reduction, abortion
 * (`ABORTED`) restores the balance. `snapshot.canceledAmount` therefore *includes*
 * in-flight amounts, and the final confirmed amount lies in
 * `[canceledAmount - pendingCancelAmount, canceledAmount]`.
 *
 * - `'settled'` — `snapshot.canceledAmount` equals the ledger target **and no cancel is in
 *   flight** (`pendingCancelAmount` is always `0` here). Only then is recording the refund
 *   as final safe: an `IN_PROGRESS` cancel could still resolve `ABORTED` and take the
 *   balance back up (money that never moved).
 * - `'unconfirmed'` — at least one `IN_PROGRESS` cancel keeps the verdict provisional, and
 *   the target lies within the possible final range above, so it may still settle without
 *   any new provider action. Do not settle the ledger yet; re-fetch the payment (a
 *   `CANCEL_STATUS_CHANGED` webhook is `unverified`) and compare again. This mirrors
 *   `lifecycle: 'cancellation-pending'` taking priority over amount-based `'full'`.
 * - `'mismatch'` — the target is outside every possible outcome (`direction` says which
 *   way; with `requestedAmount` supplied, `shortfall` splits `'provider-below-ledger'` into
 *   `'at-prior-state'` / `'unexplained'`), or the comparison is impossible
 *   (`direction: 'indeterminate'`): the snapshot's amounts carry consistency issues
 *   (attached in `consistencyIssues`), or the ledger target itself was invalid
 *   (`invalidLedgerTarget: true`).
 */
export type LedgerRefundComparison =
  | {
      readonly kind: "settled";
      /** Provider-confirmed cumulative canceled amount (`snapshot.canceledAmount`). */
      readonly canceledAmount: number;
      /** Always `0` in this verdict — any in-flight cancel forces `'unconfirmed'`. */
      readonly pendingCancelAmount: number;
      readonly expectedRefundedAmount: number;
    }
  | {
      readonly kind: "unconfirmed";
      readonly canceledAmount: number;
      readonly pendingCancelAmount: number;
      readonly expectedRefundedAmount: number;
    }
  | {
      readonly kind: "mismatch";
      readonly direction: LedgerRefundMismatchDirection;
      readonly canceledAmount: number;
      readonly pendingCancelAmount: number;
      readonly expectedRefundedAmount: number;
      /**
       * `true` when `expectedRefundedAmount` (or a supplied `requestedAmount`) was not a
       * valid ledger amount.
       */
      readonly invalidLedgerTarget: boolean;
      /**
       * Present only when `direction: 'provider-below-ledger'` and the ledger supplied
       * `requestedAmount` — see {@link LedgerRefundShortfall}.
       */
      readonly shortfall?: LedgerRefundShortfall;
      /**
       * The amount-integrity issues that blocked the comparison (`invalid-amount`,
       * `balance-exceeds-total`) — empty for a plain amount mismatch. The snapshot keeps
       * the full issue list.
       */
      readonly consistencyIssues: readonly PaymentStateConsistencyIssue[];
    };

/**
 * Compares a provider payment-state snapshot against the app ledger's cumulative refund
 * target — "has the provider confirmed the refunds my ledger claims?".
 *
 * Expressed purely in provider-snapshot terms: `snapshot.canceledAmount`
 * (`totalAmount - balanceAmount` at summarize time) is the provider's current cumulative
 * canceled amount, and `pendingCancelAmount` is the sum of `cancelAmount` over
 * `cancelStatus: 'IN_PROGRESS'` transactions. Per the kit's Phase-0 field measurements
 * (and the cancel path's own 2xx validation), an accepted async cancel already shows the
 * reduced balance while `IN_PROGRESS` — so pending amounts are *inside* `canceledAmount`,
 * and an aborted cancel takes the balance back up. `'settled'` therefore additionally
 * requires that nothing is in flight; see {@link LedgerRefundComparison} for the exact
 * three-way semantics. The ledger target stays app-owned — see {@link LedgerRefundTarget}.
 * Both the branded and the serialized snapshot forms are accepted; the ids play no part in
 * the verdict, so no re-branding is required. Comparing a snapshot of the *wrong payment*
 * against a ledger target is a caller-side identity error this helper cannot detect.
 *
 * Mapping to an app-side `SUCCEEDED / UNCONFIRMED / MISMATCH` three-way: `'settled'` maps
 * to succeeded, but the kit's `'unconfirmed'` is strictly the in-flight-cancel case — an
 * app-style "the cancel request likely never reached the provider, replay the sealed
 * request" state surfaces here as `'mismatch'` / `'provider-below-ledger'`. Pass
 * {@link LedgerRefundTarget.requestedAmount} to have that case labelled
 * `shortfall: 'at-prior-state'` (vs `'unexplained'`); do not map the three kit names 1:1
 * onto an app's replay policy without it.
 *
 * Honesty rule for broken inputs: when the snapshot's amounts are untrustworthy
 * (`invalid-amount`/`balance-exceeds-total` issues, or a `canceledAmount` that is not a
 * non-negative safe integer), the verdict is `'mismatch'` with
 * `direction: 'indeterminate'` and the gating issues attached. Deliberately *not*
 * reproduced: the "status CANCELED with only totalAmount valid ⇒ assume fully refunded"
 * fallback some reconciliation paths use — that is a guess, and settling a ledger on it
 * belongs to the app's explicit policy, not a library default.
 */
export function compareLedgerRefund(
  snapshot: PaymentStateSnapshot | SerializedPaymentStateSnapshot,
  ledger: LedgerRefundTarget
): LedgerRefundComparison {
  const expectedRefundedAmount = ledger.expectedRefundedAmount;
  const requestedAmount = ledger.requestedAmount;
  const canceledAmount = snapshot.canceledAmount;
  const pendingCancelAmount = snapshot.cancels
    .filter((cancel) => cancel.cancelStatus === "IN_PROGRESS")
    .reduce((sum, cancel) => sum + cancel.cancelAmount, 0);

  const gatingIssues = snapshot.consistencyIssues.filter(
    (issue) =>
      issue.kind === "invalid-amount" || issue.kind === "balance-exceeds-total"
  );
  const snapshotTrustworthy =
    gatingIssues.length === 0 &&
    Number.isSafeInteger(canceledAmount) &&
    canceledAmount >= 0 &&
    Number.isSafeInteger(pendingCancelAmount) &&
    pendingCancelAmount >= 0;
  const ledgerTargetValid =
    Number.isSafeInteger(expectedRefundedAmount) &&
    expectedRefundedAmount >= 0 &&
    (requestedAmount === undefined ||
      (Number.isSafeInteger(requestedAmount) &&
        requestedAmount >= 0 &&
        requestedAmount <= expectedRefundedAmount));

  if (!snapshotTrustworthy || !ledgerTargetValid) {
    return {
      kind: "mismatch",
      direction: "indeterminate",
      canceledAmount,
      pendingCancelAmount,
      expectedRefundedAmount,
      invalidLedgerTarget: !ledgerTargetValid,
      consistencyIssues: gatingIssues,
    };
  }

  // 실측 모델(cancel.ts의 2xx 검증과 동일): IN_PROGRESS 취소도 이미 잔액을 줄였다.
  // 각 진행 건은 DONE(감액 유지) 또는 ABORTED(잔액 복원)로 끝나므로, 최종 확정액은
  // [canceledAmount - pendingCancelAmount, canceledAmount] 구간 안에 있다.
  if (pendingCancelAmount > 0) {
    if (
      expectedRefundedAmount <= canceledAmount &&
      expectedRefundedAmount >= canceledAmount - pendingCancelAmount
    ) {
      // 목표가 아직 도달 가능한 구간 안 — 진행 중 취소가 남아 있는 한 확정하지 않는다
      // (lifecycle 'cancellation-pending' 우선순위, README §4.2.2 do-not-record 규칙).
      return {
        kind: "unconfirmed",
        canceledAmount,
        pendingCancelAmount,
        expectedRefundedAmount,
      };
    }
  } else if (canceledAmount === expectedRefundedAmount) {
    return {
      kind: "settled",
      canceledAmount,
      pendingCancelAmount,
      expectedRefundedAmount,
    };
  }

  const direction: LedgerRefundMismatchDirection =
    canceledAmount > expectedRefundedAmount
      ? "provider-exceeds-ledger"
      : "provider-below-ledger";
  if (direction === "provider-below-ledger" && requestedAmount !== undefined) {
    return {
      kind: "mismatch",
      direction,
      canceledAmount,
      pendingCancelAmount,
      expectedRefundedAmount,
      invalidLedgerTarget: false,
      shortfall:
        pendingCancelAmount === 0 &&
        canceledAmount === expectedRefundedAmount - requestedAmount
          ? "at-prior-state"
          : "unexplained",
      consistencyIssues: gatingIssues,
    };
  }
  return {
    kind: "mismatch",
    direction,
    canceledAmount,
    pendingCancelAmount,
    expectedRefundedAmount,
    invalidLedgerTarget: false,
    consistencyIssues: gatingIssues,
  };
}
