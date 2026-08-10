/**
 * 결제 상태 스냅샷과 변경 요약.
 *
 * Payment 상태는 단방향 상태 머신이 아니다. 특히 입금 오류로
 * DONE -> WAITING_FOR_DEPOSIT 역전이가 가능하므로, 이 모듈은 전이를 허용/거부하지 않고
 * 두 관측값의 차이만 기술한다. 영속화 순서와 동시성 제어는 호출자의 저장소가 맡는다.
 */
import type { OrderId, PaymentKey } from "./ids";
import {
  isFullyCanceled,
  type CancelTransaction,
  type Payment,
  type PaymentStatus,
} from "./payment";
import { err, ok, type Result } from "./result";

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
  payment: Payment,
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
  payment: Payment,
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

/** Payment에서 민감 필드를 제거한 현재 상태 스냅샷을 만든다. */
export function summarizePaymentState(payment: Payment): PaymentStateSnapshot {
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
