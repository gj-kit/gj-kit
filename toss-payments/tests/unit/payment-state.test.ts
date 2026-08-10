import { describe, expect, it } from "vitest";

import {
  diffPaymentState,
  summarizePaymentState,
  type PaymentStateSnapshot,
} from "../../src/core/payment-state";
import type { Payment } from "../../src/core/payment";
import { asPaymentFixture, rawCancelTransaction, rawPayment } from "./helpers";

function payment(overrides: Record<string, unknown> = {}): Payment {
  return asPaymentFixture(rawPayment(overrides));
}

function snapshot(
  overrides: Record<string, unknown> = {}
): PaymentStateSnapshot {
  return summarizePaymentState(payment(overrides));
}

describe("summarizePaymentState", () => {
  it("민감한 Payment 원문 없이 현재 결제·취소 가능 상태를 요약한다", () => {
    const state = summarizePaymentState(
      payment({
        secret: "secret-value",
        raw: { cardNumber: "4111111111111111" },
      })
    );

    expect(state).toMatchObject({
      status: "DONE",
      lifecycle: "paid",
      totalAmount: 1000,
      balanceAmount: 1000,
      canceledAmount: 0,
      amountState: "none",
      hasPendingCancellation: false,
      hasAbortedCancellation: false,
      isCancelable: true,
      isPartiallyCancelable: true,
      cancels: [],
      consistencyIssues: [],
    });
    expect(state).not.toHaveProperty("secret");
    expect(state).not.toHaveProperty("raw");
    expect(JSON.stringify(state)).not.toContain("secret-value");
    expect(JSON.stringify(state)).not.toContain("4111111111111111");
  });

  it("부분취소 금액과 최소 트랜잭션 정보만 보존한다", () => {
    const cancel = rawCancelTransaction({
      transactionKey: "cancel-300",
      cancelAmount: 300,
      refundableAmount: 700,
      cancelReason: "로그에 남기지 않을 사유",
      receiptKey: "receipt-secret-ish",
    });
    const state = snapshot({
      status: "PARTIAL_CANCELED",
      balanceAmount: 700,
      lastTransactionKey: "cancel-300",
      cancels: [cancel],
    });

    expect(state).toMatchObject({
      lifecycle: "partially-canceled",
      canceledAmount: 300,
      amountState: "partial",
      isCancelable: true,
      isPartiallyCancelable: true,
    });
    expect(state.cancels).toEqual([
      {
        transactionKey: "cancel-300",
        cancelAmount: 300,
        refundableAmount: 700,
        canceledAt: "2026-08-09T13:00:00+09:00",
        cancelStatus: "DONE",
        cancelRequestId: null,
      },
    ]);
    expect(JSON.stringify(state)).not.toContain("로그에 남기지 않을 사유");
    expect(JSON.stringify(state)).not.toContain("receipt-secret-ish");
    expect(state.consistencyIssues).toEqual([]);
  });

  it("부분취소 이력 뒤 잔액 0인 PARTIAL_CANCELED도 기존 판정대로 완전취소다", () => {
    const state = snapshot({
      status: "PARTIAL_CANCELED",
      balanceAmount: 0,
      lastTransactionKey: "cancel-700",
      cancels: [
        rawCancelTransaction({
          transactionKey: "cancel-300",
          cancelAmount: 300,
          refundableAmount: 700,
        }),
        rawCancelTransaction({
          transactionKey: "cancel-700",
          cancelAmount: 700,
          refundableAmount: 0,
        }),
      ],
    });

    expect(state.lifecycle).toBe("fully-canceled");
    expect(state.amountState).toBe("full");
    expect(state.canceledAmount).toBe(1000);
    expect(state.isCancelable).toBe(false);
    expect(state.isPartiallyCancelable).toBe(false);
    expect(state.consistencyIssues).toEqual([]);
  });

  it("비동기 취소 진행 중에는 추가 취소 가능 힌트를 보수적으로 끈다", () => {
    const state = snapshot({
      status: "PARTIAL_CANCELED",
      balanceAmount: 700,
      cancels: [
        rawCancelTransaction({
          transactionKey: "cancel-pending",
          cancelAmount: 200,
          refundableAmount: 700,
          cancelStatus: "IN_PROGRESS",
        }),
        rawCancelTransaction({
          transactionKey: "cancel-aborted",
          cancelAmount: 100,
          refundableAmount: 700,
          cancelStatus: "ABORTED",
        }),
      ],
    });

    expect(state.hasPendingCancellation).toBe(true);
    expect(state.hasAbortedCancellation).toBe(true);
    expect(state.lifecycle).toBe("cancellation-pending");
    expect(state.isCancelable).toBe(false);
    expect(state.isPartiallyCancelable).toBe(false);
  });

  it("잔액이 모두 줄었어도 IN_PROGRESS 취소는 fully-canceled lifecycle보다 우선한다", () => {
    const state = snapshot({
      status: "PARTIAL_CANCELED",
      balanceAmount: 0,
      lastTransactionKey: "cancel-pending-full",
      cancels: [
        rawCancelTransaction({
          transactionKey: "cancel-pending-full",
          cancelAmount: 1000,
          refundableAmount: 0,
          cancelStatus: "IN_PROGRESS",
        }),
      ],
    });

    expect(state.amountState).toBe("full");
    expect(state.hasPendingCancellation).toBe(true);
    expect(state.lifecycle).toBe("cancellation-pending");
    expect(state.isCancelable).toBe(false);
  });

  it("0원 비취소 상태와 취소 이력 없는 PARTIAL_CANCELED를 실행 불가 이슈로 남긴다", () => {
    const zeroDone = snapshot({
      status: "DONE",
      balanceAmount: 0,
      cancels: null,
    });
    expect(zeroDone.lifecycle).toBe("inconsistent");
    expect(zeroDone.isCancelable).toBe(false);
    expect(zeroDone.consistencyIssues.map((issue) => issue.kind)).toContain(
      "zero-balance-with-non-canceled-status"
    );

    const partialWithoutHistory = snapshot({
      status: "PARTIAL_CANCELED",
      balanceAmount: 700,
      cancels: null,
    });
    expect(partialWithoutHistory.isCancelable).toBe(false);
    expect(
      partialWithoutHistory.consistencyIssues.map((issue) => issue.kind)
    ).toContain("cancellation-status-without-history");
  });

  it("완료 취소 이력과 DONE status가 충돌하면 추가 취소 힌트를 끈다", () => {
    const state = snapshot({
      status: "DONE",
      balanceAmount: 700,
      cancels: [
        rawCancelTransaction({
          transactionKey: "completed-with-done-status",
          cancelAmount: 300,
          refundableAmount: 700,
        }),
      ],
    });

    expect(state.isCancelable).toBe(false);
    expect(state.isPartiallyCancelable).toBe(false);
    expect(state.consistencyIssues.map((issue) => issue.kind)).toContain(
      "completed-cancel-status-mismatch"
    );
  });

  it("ABORTED와 EXPIRED를 실패와 만료로 구분한다", () => {
    expect(snapshot({ status: "ABORTED" }).lifecycle).toBe("failed");
    expect(snapshot({ status: "EXPIRED" }).lifecycle).toBe("expired");
  });

  it("status와 잔액·이력이 충돌해도 throw하지 않고 이슈로 남긴다", () => {
    const state = snapshot({
      status: "CANCELED",
      balanceAmount: 1000,
      cancels: null,
    });

    expect(state.lifecycle).toBe("inconsistent");
    expect(state.amountState).toBe("none");
    expect(state.consistencyIssues.map((issue) => issue.kind)).toEqual([
      "canceled-status-with-balance",
      "cancellation-status-without-history",
    ]);
  });

  it("잔액·부분취소 이력이 모순이면 모든 공개 취소 가능 힌트를 fail-closed한다", () => {
    const excessiveBalance = snapshot({
      status: "DONE",
      totalAmount: 1000,
      balanceAmount: 1200,
    });
    expect(excessiveBalance.lifecycle).toBe("inconsistent");
    expect(excessiveBalance.isCancelable).toBe(false);
    expect(
      excessiveBalance.consistencyIssues.map((issue) => issue.kind)
    ).toContain("balance-exceeds-total");

    const partialWithoutReducedBalance = snapshot({
      status: "PARTIAL_CANCELED",
      totalAmount: 1000,
      balanceAmount: 1000,
      cancels: [
        rawCancelTransaction({
          transactionKey: "cancel-done-without-balance-change",
          cancelAmount: 100,
          refundableAmount: 1000,
        }),
      ],
    });
    expect(partialWithoutReducedBalance.lifecycle).toBe("inconsistent");
    expect(partialWithoutReducedBalance.isCancelable).toBe(false);
    expect(
      partialWithoutReducedBalance.consistencyIssues.map((issue) => issue.kind)
    ).toContain("partial-status-without-canceled-amount");

    const abortedOnly = snapshot({
      status: "PARTIAL_CANCELED",
      balanceAmount: 700,
      cancels: [
        rawCancelTransaction({
          transactionKey: "cancel-aborted-only",
          cancelAmount: 300,
          refundableAmount: 700,
          cancelStatus: "ABORTED",
        }),
      ],
    });
    expect(abortedOnly.lifecycle).toBe("inconsistent");
    expect(abortedOnly.isCancelable).toBe(false);
    expect(abortedOnly.consistencyIssues.map((issue) => issue.kind)).toContain(
      "partial-status-without-effective-cancellation"
    );
  });
});

describe("diffPaymentState", () => {
  it("상태·잔액·amountState와 새 취소 트랜잭션을 계산한다", () => {
    const previous = snapshot();
    const next = snapshot({
      status: "PARTIAL_CANCELED",
      balanceAmount: 700,
      lastTransactionKey: "cancel-300",
      cancels: [
        rawCancelTransaction({
          transactionKey: "cancel-300",
          cancelAmount: 300,
          refundableAmount: 700,
        }),
      ],
    });
    const result = diffPaymentState(previous, next);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.changed).toBe(true);
    expect(result.value.statusChange).toEqual({
      previous: "DONE",
      next: "PARTIAL_CANCELED",
    });
    expect(result.value.lifecycleChange).toEqual({
      previous: "paid",
      next: "partially-canceled",
    });
    expect(result.value.balanceAmountChange).toEqual({
      previous: 1000,
      next: 700,
      delta: -300,
    });
    expect(result.value.lastTransactionKeyChange).toEqual({
      previous: "txn-1",
      next: "cancel-300",
    });
    expect(result.value.amountStateChange).toEqual({
      previous: "none",
      next: "partial",
    });
    expect(
      result.value.cancelChanges.added.map((cancel) => cancel.transactionKey)
    ).toEqual(["cancel-300"]);
    expect(result.value.cancelChanges.updated).toEqual([]);
    expect(result.value.cancelChanges.removed).toEqual([]);
    expect(result.value.warnings).toEqual([]);
  });

  it("같은 transactionKey의 IN_PROGRESS -> DONE 변경을 updated로 분류한다", () => {
    const previous = snapshot({
      status: "PARTIAL_CANCELED",
      balanceAmount: 700,
      cancels: [
        rawCancelTransaction({
          transactionKey: "async-cancel",
          cancelAmount: 300,
          refundableAmount: 700,
          cancelStatus: "IN_PROGRESS",
        }),
      ],
    });
    const next = snapshot({
      status: "PARTIAL_CANCELED",
      balanceAmount: 700,
      cancels: [
        rawCancelTransaction({
          transactionKey: "async-cancel",
          cancelAmount: 300,
          refundableAmount: 700,
          cancelStatus: "DONE",
        }),
      ],
    });
    const result = diffPaymentState(previous, next);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.cancelChanges.added).toEqual([]);
    expect(result.value.cancelChanges.removed).toEqual([]);
    expect(result.value.cancelChanges.updated).toHaveLength(1);
    expect(result.value.cancelChanges.updated[0]?.previous.cancelStatus).toBe(
      "IN_PROGRESS"
    );
    expect(result.value.cancelChanges.updated[0]?.next.cancelStatus).toBe(
      "DONE"
    );
    expect(result.value.lifecycleChange).toEqual({
      previous: "cancellation-pending",
      next: "partially-canceled",
    });
    expect(result.value.pendingCancellationChange).toEqual({
      previous: true,
      next: false,
    });
    expect(result.value.cancelableChange).toEqual({
      previous: false,
      next: true,
    });
  });

  it("잔액 증가와 취소 이력 제거는 Err가 아닌 warning이다", () => {
    const previous = snapshot({
      status: "PARTIAL_CANCELED",
      balanceAmount: 700,
      cancels: [
        rawCancelTransaction({
          transactionKey: "removed-cancel",
          cancelAmount: 300,
          refundableAmount: 700,
        }),
      ],
    });
    const next = snapshot({
      status: "DONE",
      balanceAmount: 1000,
      cancels: null,
    });
    const result = diffPaymentState(previous, next);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(
      result.value.cancelChanges.removed.map((cancel) => cancel.transactionKey)
    ).toEqual(["removed-cancel"]);
    expect(result.value.warnings).toEqual([
      {
        kind: "balance-increased",
        previousBalanceAmount: 700,
        nextBalanceAmount: 1000,
        delta: 300,
      },
      { kind: "cancel-removed", transactionKey: "removed-cancel" },
    ]);
  });

  it("DONE -> WAITING_FOR_DEPOSIT 역전이를 정상 변경으로 허용한다", () => {
    const previous = snapshot({ status: "DONE" });
    const next = snapshot({ status: "WAITING_FOR_DEPOSIT", approvedAt: null });
    const result = diffPaymentState(previous, next);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.statusChange).toEqual({
      previous: "DONE",
      next: "WAITING_FOR_DEPOSIT",
    });
    expect(result.value.lifecycleChange).toEqual({
      previous: "paid",
      next: "awaiting-deposit",
    });
    expect(result.value.warnings).toEqual([]);
  });

  it("동일 스냅샷은 changed false다", () => {
    const state = snapshot();
    const result = diffPaymentState(state, state);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toMatchObject({
      changed: false,
      statusChange: null,
      lifecycleChange: null,
      balanceAmountChange: null,
      lastTransactionKeyChange: null,
      amountStateChange: null,
      pendingCancellationChange: null,
      abortedCancellationChange: null,
      cancelableChange: null,
      partiallyCancelableChange: null,
      cancelChanges: { added: [], updated: [], removed: [] },
      warnings: [],
    });
  });

  it("paymentKey/orderId 불일치만 Err로 반환한다", () => {
    const previous = snapshot();
    const next = snapshot({
      paymentKey: "different-payment-key",
      orderId: "different-order-id",
    });
    const result = diffPaymentState(previous, next);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toEqual({
      source: "library",
      kind: "payment-state-identity-mismatch",
      mismatches: [
        {
          field: "paymentKey",
          previous: previous.paymentKey,
          next: next.paymentKey,
        },
        { field: "orderId", previous: previous.orderId, next: next.orderId },
      ],
    });
  });
});
