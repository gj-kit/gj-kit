import { describe, expect, it } from "vitest";

import {
  compareLedgerRefund,
  parsePaymentStateSnapshot,
  serializePaymentStateSnapshot,
  summarizePaymentState,
  type PaymentStateInput,
  type PaymentStateSnapshot,
  type SerializedPaymentStateSnapshot,
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

/** 부분취소 300 확정(잔액 700) — consistencyIssues 없는 정상 스냅샷. */
function partiallyCanceledSnapshot(): PaymentStateSnapshot {
  return snapshot({
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
}

// ── summarizePaymentState — PaymentStateInput ──────────────────────────────

describe("summarizePaymentState(PaymentStateInput) — 최소 구조 입력", () => {
  it("전체 Payment와 8필드 Pick이 동일한 스냅샷을 만든다", () => {
    const full = payment({
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
    const minimal: PaymentStateInput = {
      paymentKey: full.paymentKey,
      orderId: full.orderId,
      status: full.status,
      totalAmount: full.totalAmount,
      balanceAmount: full.balanceAmount,
      lastTransactionKey: full.lastTransactionKey,
      isPartialCancelable: full.isPartialCancelable,
      cancels: full.cancels,
    };

    expect(summarizePaymentState(minimal)).toEqual(summarizePaymentState(full));
  });

  it("cancels: null 등 경계 입력도 전체 Payment와 동일하게 처리한다", () => {
    const full = payment({ cancels: null, lastTransactionKey: null });
    const minimal: PaymentStateInput = {
      paymentKey: full.paymentKey,
      orderId: full.orderId,
      status: full.status,
      totalAmount: full.totalAmount,
      balanceAmount: full.balanceAmount,
      lastTransactionKey: full.lastTransactionKey,
      isPartialCancelable: full.isPartialCancelable,
      cancels: full.cancels,
    };
    expect(summarizePaymentState(minimal)).toEqual(summarizePaymentState(full));
  });
});

// ── serialize / parse 왕복 ─────────────────────────────────────────────────

describe("serializePaymentStateSnapshot / parsePaymentStateSnapshot", () => {
  it("serialize → JSON 왕복 → parse가 원본 스냅샷과 깊은 동등", () => {
    const original = partiallyCanceledSnapshot();
    const serialized = serializePaymentStateSnapshot(original);
    const revived = parsePaymentStateSnapshot(
      JSON.parse(JSON.stringify(serialized))
    );

    expect(revived.ok).toBe(true);
    if (revived.ok) expect(revived.value).toEqual(original);
  });

  it("consistencyIssues가 있는 스냅샷도 왕복된다", () => {
    // DONE + 잔액 0 → zero-balance-with-non-canceled-status 등 이슈 보존 확인.
    const original = snapshot({ status: "DONE", balanceAmount: 0 });
    expect(original.consistencyIssues.length).toBeGreaterThan(0);

    const revived = parsePaymentStateSnapshot(
      JSON.parse(JSON.stringify(serializePaymentStateSnapshot(original)))
    );
    expect(revived.ok).toBe(true);
    if (revived.ok) expect(revived.value).toEqual(original);
  });

  it("serialize 결과는 방어적 복사 — 변이해도 원본 스냅샷이 오염되지 않는다", () => {
    const original = partiallyCanceledSnapshot();
    const serialized = serializePaymentStateSnapshot(original);

    (serialized.cancels[0] as { cancelAmount: number }).cancelAmount = 1;
    (serialized as { paymentKey: string }).paymentKey = "tampered";

    expect(original.cancels[0]?.cancelAmount).toBe(300);
    expect(original.paymentKey).toBe("tviva20260809abcdef");
  });

  it.each([
    ["객체가 아니면 $", null, "$"],
    ["배열이면 $", [], "$"],
    ["schemaVersion 불일치", { schemaVersion: 2 }, "schemaVersion"],
  ] as const)("%s 경로로 거부한다", (_name, value, path) => {
    const parsed = parsePaymentStateSnapshot(value);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.error).toMatchObject({
        source: "library",
        kind: "invalid-input",
        field: "paymentStateSnapshot",
        reason: "malformed",
        path,
      });
    }
  });

  it("변조된 필드는 경로를 지목해 거부한다", () => {
    const good = JSON.parse(
      JSON.stringify(serializePaymentStateSnapshot(partiallyCanceledSnapshot()))
    ) as Record<string, unknown>;

    const cases: readonly [Record<string, unknown>, string][] = [
      [{ ...good, status: "PAID" }, "status"],
      [{ ...good, lifecycle: "settled" }, "lifecycle"],
      [{ ...good, totalAmount: "1000" }, "totalAmount"],
      [{ ...good, balanceAmount: null }, "balanceAmount"],
      [{ ...good, canceledAmount: undefined }, "canceledAmount"],
      // 산술 불변식: totalAmount/balanceAmount가 안전 정수면
      // canceledAmount는 정확히 total - balance여야 한다 (1000 - 700 = 300).
      [{ ...good, canceledAmount: 250 }, "canceledAmount"],
      [{ ...good, amountState: "half" }, "amountState"],
      [{ ...good, hasPendingCancellation: "no" }, "hasPendingCancellation"],
      [{ ...good, lastTransactionKey: 7 }, "lastTransactionKey"],
      [{ ...good, cancels: "none" }, "cancels"],
      [
        {
          ...good,
          cancels: [{ ...(good.cancels as object[])[0], cancelStatus: "WEIRD" }],
        },
        "cancels[0].cancelStatus",
      ],
      [
        {
          ...good,
          cancels: [{ ...(good.cancels as object[])[0], cancelAmount: "300" }],
        },
        "cancels[0].cancelAmount",
      ],
      [
        { ...good, consistencyIssues: [{ kind: "made-up-issue" }] },
        "consistencyIssues[0].kind",
      ],
      [
        {
          ...good,
          consistencyIssues: [
            { kind: "balance-exceeds-total", totalAmount: 1000 },
          ],
        },
        "consistencyIssues[0].balanceAmount",
      ],
      [
        {
          ...good,
          // 이슈의 status 리터럴 제약: CANCELED는 non-canceled 이슈에 올 수 없다.
          consistencyIssues: [
            { kind: "zero-balance-with-non-canceled-status", status: "CANCELED" },
          ],
        },
        "consistencyIssues[0].status",
      ],
    ];

    for (const [tampered, path] of cases) {
      const parsed = parsePaymentStateSnapshot(tampered);
      expect(parsed.ok).toBe(false);
      if (!parsed.ok) {
        expect(parsed.error.reason).toBe("malformed");
        expect(parsed.error.path).toBe(path);
      }
    }
  });

  it("접근자 프로퍼티가 검증 후 값을 바꿔치기할 수 없다 — 각 필드는 정확히 한 번 읽는다", () => {
    // 첫 읽기에는 유효한 값, 두 번째 읽기에는 오염된 값을 주는 getter.
    // validate-then-re-read라면 브랜드 스냅샷의 number 필드에 string이 심긴다.
    const good = JSON.parse(
      JSON.stringify(serializePaymentStateSnapshot(partiallyCanceledSnapshot()))
    ) as Record<string, unknown>;
    let totalReads = 0;
    Object.defineProperty(good, "totalAmount", {
      enumerable: true,
      configurable: true,
      get: () => (totalReads += 1) === 1 ? 1000 : "NOT A NUMBER",
    });
    const cancel0 = (good.cancels as Record<string, unknown>[])[0]!;
    let cancelReads = 0;
    Object.defineProperty(cancel0, "cancelAmount", {
      enumerable: true,
      configurable: true,
      get: () => (cancelReads += 1) === 1 ? 300 : "NOT A NUMBER",
    });

    const parsed = parsePaymentStateSnapshot(good);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.value.totalAmount).toBe(1000);
      expect(parsed.value.cancels[0]?.cancelAmount).toBe(300);
    }
    expect(totalReads).toBe(1);
    expect(cancelReads).toBe(1);
  });

  it("상속(프로토타입) 프로퍼티는 무시된다 — own 프로퍼티만 검증·수용한다", () => {
    const good = JSON.parse(
      JSON.stringify(serializePaymentStateSnapshot(partiallyCanceledSnapshot()))
    ) as Record<string, unknown>;
    const { totalAmount, ...withoutTotal } = good;
    const proto = { totalAmount };
    const inherited = Object.assign(Object.create(proto), withoutTotal);

    const parsed = parsePaymentStateSnapshot(inherited);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.error.path).toBe("totalAmount");
  });

  it("paymentKey/orderId는 기존 id 파서로 재브랜딩 — 파서 사유가 그대로 전달된다", () => {
    const good = serializePaymentStateSnapshot(partiallyCanceledSnapshot());

    const emptyKey = parsePaymentStateSnapshot({ ...good, paymentKey: "" });
    expect(emptyKey.ok).toBe(false);
    if (!emptyKey.ok) {
      expect(emptyKey.error.reason).toBe("empty");
      expect(emptyKey.error.path).toBe("paymentKey");
    }

    const badOrderId = parsePaymentStateSnapshot({
      ...good,
      orderId: "order!123456", // 길이는 통과, '!'가 charset 위반
    });
    expect(badOrderId.ok).toBe(false);
    if (!badOrderId.ok) {
      expect(badOrderId.error.reason).toBe("bad-charset");
      expect(badOrderId.error.path).toBe("orderId");
    }
  });
});

// ── compareLedgerRefund ────────────────────────────────────────────────────

describe("compareLedgerRefund — provider 스냅샷 vs 앱 장부 목표", () => {
  it("settled: provider 확정 누적 취소액 = 장부 목표", () => {
    const verdict = compareLedgerRefund(partiallyCanceledSnapshot(), {
      expectedRefundedAmount: 300,
    });
    expect(verdict).toEqual({
      kind: "settled",
      canceledAmount: 300,
      pendingCancelAmount: 0,
      expectedRefundedAmount: 300,
    });
  });

  it("unconfirmed: 접수된 비동기 취소는 이미 잔액을 줄였다 — IN_PROGRESS가 남아 있으면 확정 보류", () => {
    // 실측 모델(cancel.ts 2xx 검증과 동일): 비동기 취소 접수 시점에 잔액이 이미 줄어든다.
    // 확정 300이 진행 중(IN_PROGRESS) — ABORTED로 되돌 수 있으므로 settled가 아니다.
    const pending = snapshot({
      status: "PARTIAL_CANCELED",
      balanceAmount: 700,
      lastTransactionKey: "cancel-async",
      cancels: [
        rawCancelTransaction({
          transactionKey: "cancel-async",
          cancelAmount: 300,
          refundableAmount: 700,
          cancelStatus: "IN_PROGRESS",
        }),
      ],
    });
    expect(pending.hasPendingCancellation).toBe(true);
    expect(pending.canceledAmount).toBe(300);

    const verdict = compareLedgerRefund(pending, { expectedRefundedAmount: 300 });
    expect(verdict).toEqual({
      kind: "unconfirmed",
      canceledAmount: 300,
      pendingCancelAmount: 300,
      expectedRefundedAmount: 300,
    });
  });

  it("unconfirmed: 금액상 전액 취소여도 IN_PROGRESS면 원장 확정 불가 (ABORTED로 되돌 수 있다)", () => {
    // README §4.2.2 do-not-record 규칙: CancelOutcome.pending === true를 곧바로
    // REFUND_SUCCEEDED로 기록하면, CANCEL_STATUS_CHANGED가 ABORTED를 보고할 때
    // 움직이지 않은 돈으로 원장을 확정한 것이 된다.
    const inFlightFull = snapshot({
      status: "CANCELED",
      balanceAmount: 0,
      lastTransactionKey: "cancel-full",
      cancels: [
        rawCancelTransaction({
          transactionKey: "cancel-full",
          cancelAmount: 1000,
          refundableAmount: 0,
          cancelStatus: "IN_PROGRESS",
        }),
      ],
    });
    expect(inFlightFull.lifecycle).toBe("cancellation-pending");

    const verdict = compareLedgerRefund(inFlightFull, {
      expectedRefundedAmount: 1000,
    });
    expect(verdict).toEqual({
      kind: "unconfirmed",
      canceledAmount: 1000,
      pendingCancelAmount: 1000,
      expectedRefundedAmount: 1000,
    });
  });

  it("settled: 진행 중이던 취소가 ABORTED로 정산되고 잔액이 복원되면 확정 가능", () => {
    // 위 in-flight 스냅샷의 한 가지 결말: 300 취소는 DONE, 이후 200 취소는 ABORTED
    // (잔액 700 복원). 진행 건이 없으므로 확정액 300 = 목표 300 → settled.
    const resolved = snapshot({
      status: "PARTIAL_CANCELED",
      balanceAmount: 700,
      lastTransactionKey: "cancel-300",
      cancels: [
        rawCancelTransaction({
          transactionKey: "cancel-300",
          cancelAmount: 300,
          refundableAmount: 700,
        }),
        rawCancelTransaction({
          transactionKey: "cancel-aborted-200",
          cancelAmount: 200,
          refundableAmount: 700,
          cancelStatus: "ABORTED",
        }),
      ],
    });
    expect(resolved.hasPendingCancellation).toBe(false);

    expect(
      compareLedgerRefund(resolved, { expectedRefundedAmount: 300 })
    ).toEqual({
      kind: "settled",
      canceledAmount: 300,
      pendingCancelAmount: 0,
      expectedRefundedAmount: 300,
    });
  });

  it("mismatch(provider-below-ledger): 확정액이 목표에 못 미치면 모순 — requestedAmount 없이는 shortfall도 없다", () => {
    const verdict = compareLedgerRefund(partiallyCanceledSnapshot(), {
      expectedRefundedAmount: 600,
    });
    expect(verdict).toMatchObject({
      kind: "mismatch",
      direction: "provider-below-ledger",
      canceledAmount: 300,
      expectedRefundedAmount: 600,
      invalidLedgerTarget: false,
      consistencyIssues: [],
    });
    expect("shortfall" in verdict).toBe(false);
  });

  it("shortfall 'at-prior-state': provider가 정확히 요청 전 상태면 봉인 요청 재실행이 안전", () => {
    // 앱 스타일 PROVIDER_CANCEL_UNCONFIRMED: 환불 요청이 provider에 도달하지 못했다.
    // 스냅샷은 환불 전 그대로(DONE, 잔액 = 총액, cancels 없음) — kit에서는
    // unconfirmed가 아니라 mismatch(provider-below-ledger)로 나타나며,
    // requestedAmount를 주면 at-prior-state로 구분된다.
    const untouched = snapshot({ status: "DONE", balanceAmount: 1000 });
    const verdict = compareLedgerRefund(untouched, {
      expectedRefundedAmount: 300,
      requestedAmount: 300,
    });
    expect(verdict).toEqual({
      kind: "mismatch",
      direction: "provider-below-ledger",
      canceledAmount: 0,
      pendingCancelAmount: 0,
      expectedRefundedAmount: 300,
      invalidLedgerTarget: false,
      shortfall: "at-prior-state",
      consistencyIssues: [],
    });

    // 이전 확정 환불(200)이 있는 결제에서도 동일 — prior = expected - requested.
    const priorRefunded = compareLedgerRefund(partiallyCanceledSnapshot(), {
      expectedRefundedAmount: 500,
      requestedAmount: 200,
    });
    expect(priorRefunded).toMatchObject({
      kind: "mismatch",
      direction: "provider-below-ledger",
      shortfall: "at-prior-state",
    });
  });

  it("shortfall 'unexplained': 요청 전 상태로 설명되지 않는 부족분은 자동 재실행 금지", () => {
    // 확정 300, 목표 600, 요청 100 → prior였어야 할 500과 불일치.
    const verdict = compareLedgerRefund(partiallyCanceledSnapshot(), {
      expectedRefundedAmount: 600,
      requestedAmount: 100,
    });
    expect(verdict).toMatchObject({
      kind: "mismatch",
      direction: "provider-below-ledger",
      shortfall: "unexplained",
    });
  });

  it("requestedAmount가 유효하지 않으면 mismatch(indeterminate) + invalidLedgerTarget", () => {
    const clean = partiallyCanceledSnapshot();
    for (const bad of [-1, 12.5, Number.NaN, 301]) {
      // 301 > expectedRefundedAmount(300) — prior가 음수가 되는 목표는 무효.
      const verdict = compareLedgerRefund(clean, {
        expectedRefundedAmount: 300,
        requestedAmount: bad,
      });
      expect(verdict.kind).toBe("mismatch");
      if (verdict.kind === "mismatch") {
        expect(verdict.direction).toBe("indeterminate");
        expect(verdict.invalidLedgerTarget).toBe(true);
      }
    }
  });

  it("mismatch(provider-exceeds-ledger): provider 확정액이 장부 목표보다 크다", () => {
    const verdict = compareLedgerRefund(partiallyCanceledSnapshot(), {
      expectedRefundedAmount: 100,
    });
    expect(verdict).toMatchObject({
      kind: "mismatch",
      direction: "provider-exceeds-ledger",
      canceledAmount: 300,
      expectedRefundedAmount: 100,
    });
  });

  it("settled는 진행 중 취소가 없을 때만 — 금액이 일치해도 IN_PROGRESS가 남으면 unconfirmed", () => {
    // DONE 300 + IN_PROGRESS 200 → 잔액 500(둘 다 이미 감액), canceledAmount 500.
    // 목표 300은 [500-200, 500] 구간 안: 200이 ABORTED면 300으로 settle되고,
    // DONE이면 provider-exceeds-ledger가 된다. 진행 중에는 어느 쪽도 단정하지 않는다.
    const withPending = snapshot({
      status: "PARTIAL_CANCELED",
      balanceAmount: 500,
      lastTransactionKey: "cancel-async-200",
      cancels: [
        rawCancelTransaction({
          transactionKey: "cancel-300",
          cancelAmount: 300,
          refundableAmount: 700,
        }),
        rawCancelTransaction({
          transactionKey: "cancel-async-200",
          cancelAmount: 200,
          refundableAmount: 500,
          cancelStatus: "IN_PROGRESS",
        }),
      ],
    });
    expect(compareLedgerRefund(withPending, { expectedRefundedAmount: 300 })).toEqual({
      kind: "unconfirmed",
      canceledAmount: 500,
      pendingCancelAmount: 200,
      expectedRefundedAmount: 300,
    });
    expect(compareLedgerRefund(withPending, { expectedRefundedAmount: 500 })).toEqual({
      kind: "unconfirmed",
      canceledAmount: 500,
      pendingCancelAmount: 200,
      expectedRefundedAmount: 500,
    });
    // 목표가 가능한 최종 구간 밖이면 진행 중이어도 mismatch로 단정할 수 있다.
    expect(
      compareLedgerRefund(withPending, { expectedRefundedAmount: 600 })
    ).toMatchObject({ kind: "mismatch", direction: "provider-below-ledger" });
    expect(
      compareLedgerRefund(withPending, { expectedRefundedAmount: 250 })
    ).toMatchObject({ kind: "mismatch", direction: "provider-exceeds-ledger" });
  });

  it("스냅샷 금액이 신뢰 불가면 추측하지 않고 mismatch(indeterminate) + 이슈 동봉", () => {
    // balance > total → balance-exceeds-total, canceledAmount 음수.
    const broken = snapshot({ totalAmount: 1000, balanceAmount: 1200 });
    expect(broken.canceledAmount).toBe(-200);

    const verdict = compareLedgerRefund(broken, { expectedRefundedAmount: 0 });
    expect(verdict.kind).toBe("mismatch");
    if (verdict.kind === "mismatch") {
      expect(verdict.direction).toBe("indeterminate");
      expect(verdict.invalidLedgerTarget).toBe(false);
      expect(
        verdict.consistencyIssues.some(
          (issue) => issue.kind === "balance-exceeds-total"
        )
      ).toBe(true);
    }
  });

  it("장부 목표가 유효하지 않으면 mismatch(indeterminate) + invalidLedgerTarget", () => {
    const clean = partiallyCanceledSnapshot();
    for (const bad of [Number.NaN, -1, 12.5, Number.POSITIVE_INFINITY]) {
      const verdict = compareLedgerRefund(clean, {
        expectedRefundedAmount: bad,
      });
      expect(verdict.kind).toBe("mismatch");
      if (verdict.kind === "mismatch") {
        expect(verdict.direction).toBe("indeterminate");
        expect(verdict.invalidLedgerTarget).toBe(true);
      }
    }
  });

  it("직렬화된 스냅샷도 동일하게 판정한다 (브랜드 불필요)", () => {
    const serialized: SerializedPaymentStateSnapshot =
      serializePaymentStateSnapshot(partiallyCanceledSnapshot());
    expect(
      compareLedgerRefund(serialized, { expectedRefundedAmount: 300 })
    ).toEqual(
      compareLedgerRefund(partiallyCanceledSnapshot(), {
        expectedRefundedAmount: 300,
      })
    );
  });
});
