import { describe, expect, it, vi } from "vitest";

import {
  createCustomRefundPolicy,
  parseRefundQuote,
  type RefundQuote,
} from "../../src/core/refund";
import {
  asCancelable,
  cancelReason,
  cancelRequestId,
  createTossClient,
  idempotencyKey,
  isErr,
  isOk,
  isTestKey,
  ok,
  orThrow,
  parseApiSecretKey,
  refundAccount,
  type AwaitingDepositCancelable,
  type DepositedVaCancelable,
  type SettledCancelable,
} from "../../src/server";
import {
  executeRefund,
  prepareRefund,
  prepareRefundExecution,
  type RefundExecutionAttempt,
  type RefundExecutionPlan,
} from "../../src/server/refund";
import {
  asPaymentFixture,
  forbiddenFetch,
  mockFetch,
  rawCancelTransaction,
  rawPayment,
} from "./helpers";

function testClient(fetchImpl: typeof fetch) {
  const parsed = orThrow(parseApiSecretKey("test_sk_abcdef"));
  if (!isTestKey(parsed)) throw new Error("test 키여야 한다");
  return createTossClient(parsed, { fetch: fetchImpl });
}

const reason = () => orThrow(cancelReason("정책 환불"));
const stableIdempotencyKey = () =>
  orThrow(idempotencyKey("refund-request-order-123456-v1"));

function settledTarget(
  overrides: Record<string, unknown> = {}
): Extract<SettledCancelable, { readonly partialAllowed: true }> {
  const checked = orThrow(
    asCancelable(asPaymentFixture(rawPayment(overrides)))
  );
  if (checked.kind !== "settled" || !checked.partialAllowed) {
    throw new Error("부분취소 가능한 settled 픽스처여야 한다");
  }
  return checked;
}

function nonPartialSettledTarget(): Extract<
  SettledCancelable,
  { readonly partialAllowed: false }
> {
  const checked = orThrow(
    asCancelable(asPaymentFixture(rawPayment({ isPartialCancelable: false })))
  );
  if (checked.kind !== "settled" || checked.partialAllowed) {
    throw new Error("부분취소 불가능한 settled 픽스처여야 한다");
  }
  return checked;
}

function awaitingTarget(): AwaitingDepositCancelable {
  const checked = orThrow(
    asCancelable(
      asPaymentFixture(
        rawPayment({
          status: "WAITING_FOR_DEPOSIT",
          method: "가상계좌",
          secret: "va-secret",
          card: null,
          virtualAccount: { accountNumber: "1", bankCode: "88" },
        })
      )
    )
  );
  if (checked.kind !== "awaiting-deposit")
    throw new Error("awaiting 픽스처여야 한다");
  return checked;
}

function depositedVaTarget(): Extract<
  DepositedVaCancelable,
  { readonly partialAllowed: true }
> {
  const checked = orThrow(
    asCancelable(
      asPaymentFixture(
        rawPayment({
          method: "가상계좌",
          secret: "va-secret",
          card: null,
          virtualAccount: { accountNumber: "1", bankCode: "88" },
        })
      )
    )
  );
  if (checked.kind !== "deposited-virtual-account" || !checked.partialAllowed) {
    throw new Error("부분취소 가능한 입금 완료 가상계좌 픽스처여야 한다");
  }
  return checked;
}

function quoteFor(
  target: SettledCancelable | DepositedVaCancelable | AwaitingDepositCancelable,
  input: {
    readonly kind?: "none" | "full" | "partial";
    readonly amount?: number;
    readonly paymentKey?: string;
    readonly orderId?: string;
    readonly currency?: "KRW" | "USD" | "JPY";
    readonly observedBalanceAmount?: number;
    readonly expectedBalanceAmount?: number;
    readonly validUntil?: string;
  } = {}
): RefundQuote {
  const evaluatedAt = new Date("2026-08-10T12:00:00.000Z");
  const validUntil = input.validUntil ?? "2099-08-10T12:00:00.000Z";
  const kind = input.kind ?? "partial";
  const amount =
    input.amount ??
    (kind === "none" ? 0 : kind === "full" ? target.balanceAmount : 300);
  const observedBalanceAmount =
    input.observedBalanceAmount ?? target.balanceAmount;
  const payment = {
    ...target.payment,
    paymentKey: input.paymentKey ?? target.payment.paymentKey,
    orderId: input.orderId ?? target.payment.orderId,
    currency: input.currency ?? target.payment.currency,
    balanceAmount: observedBalanceAmount,
  } as typeof target.payment;
  const alreadyRefundedAmount = payment.totalAmount - payment.balanceAmount;
  const policy = orThrow(
    createCustomRefundPolicy<undefined>({
      id: "standard-refund",
      version: "1",
      kind: "custom",
      rounding: "floor",
      quoteTtlMs: Date.parse(validUntil) - evaluatedAt.getTime(),
      calculate: () =>
        ok({
          kind: "amount",
          amount: alreadyRefundedAmount + amount,
          ...(kind === "none" ? { reason: "policy-zero" } : {}),
        }),
    })
  );
  const quote = orThrow(
    policy.quote({
      payment,
      basisAmount: payment.totalAmount,
      alreadyRefundedAmount,
      expectedBalanceAmount:
        input.expectedBalanceAmount ?? observedBalanceAmount,
      evaluatedAt,
      context: undefined,
    })
  );
  if (quote.kind !== kind) {
    throw new Error(`요청한 ${kind} quote가 생성되어야 한다: ${quote.kind}`);
  }
  return quote;
}

function expectPlan(
  target: SettledCancelable | DepositedVaCancelable | AwaitingDepositCancelable,
  quote: RefundQuote
): RefundExecutionPlan {
  const prepared = prepareRefund(target, quote);
  if (!prepared.ok || prepared.value.kind !== "refund") {
    throw new Error(`실행 계획이어야 한다: ${JSON.stringify(prepared)}`);
  }
  return prepared.value;
}

function expectAttempt(
  plan: RefundExecutionPlan,
  request: Parameters<typeof prepareRefundExecution>[1],
  key = stableIdempotencyKey()
): RefundExecutionAttempt {
  const prepared = prepareRefundExecution(plan, request, {
    idempotencyKey: key,
  });
  if (!prepared.ok) {
    throw new Error(`실행 attempt여야 한다: ${JSON.stringify(prepared)}`);
  }
  return prepared.value;
}

function lookupThenCancel(
  freshPayment: Record<string, unknown>,
  canceledPayment: Record<string, unknown>
) {
  return mockFetch((call) => ({
    status: 200,
    body: call.method === "GET" ? freshPayment : canceledPayment,
  }));
}

describe("prepareRefund — 견적 결속", () => {
  it("정상 0원 견적은 no-refund이며 API를 호출하지 않는다", () => {
    const pair = forbiddenFetch();
    void testClient(pair.fetch); // 네트워크 가능한 client가 있어도 prepare는 순수하다.
    const target = settledTarget();

    const prepared = prepareRefund(
      target,
      quoteFor(target, { kind: "none", amount: 0 })
    );

    expect(isOk(prepared)).toBe(true);
    if (prepared.ok) expect(prepared.value.kind).toBe("no-refund");
    expect(pair.calls).toHaveLength(0);
  });

  it("amount === balance인 full 견적은 full 실행 계획이 된다", () => {
    const target = settledTarget();
    const prepared = prepareRefund(
      target,
      quoteFor(target, { kind: "full", amount: target.balanceAmount })
    );

    if (!prepared.ok || prepared.value.kind !== "refund") {
      return expect.unreachable("환불 계획이어야 한다");
    }
    expect(prepared.value.mode).toBe("full");
    expect(prepared.value.targetKind).toBe("settled");
    expect(Object.keys(prepared.value)).not.toContain("target");
    expect(JSON.stringify(prepared.value)).not.toContain("partialAllowed");
  });

  it.each([
    ["payment-key-mismatch", { paymentKey: "another-payment" }],
    ["order-id-mismatch", { orderId: "another-order" }],
    ["currency-mismatch", { currency: "USD" as const }],
    ["stale-quote", { observedBalanceAmount: 900, expectedBalanceAmount: 900 }],
  ] as const)("%s를 API 호출 전에 거부한다", (expectedReason, overrides) => {
    const target = settledTarget();
    const prepared = prepareRefund(target, quoteFor(target, overrides));

    expect(isErr(prepared)).toBe(true);
    if (!prepared.ok) {
      expect(prepared.error.kind).toBe("invalid-refund-plan");
      expect(prepared.error.reason).toBe(expectedReason);
    }
  });

  it("부분취소 불가 결제와 입금 대기 결제의 부분 견적을 거부한다", () => {
    const nonPartial = nonPartialSettledTarget();
    const denied = prepareRefund(
      nonPartial,
      quoteFor(nonPartial, { kind: "partial", amount: 300 })
    );
    expect(!denied.ok && denied.error.reason).toBe(
      "partial-refund-not-allowed"
    );

    const awaiting = awaitingTarget();
    const beforeDeposit = prepareRefund(
      awaiting,
      quoteFor(awaiting, { kind: "partial", amount: 300 })
    );
    expect(!beforeDeposit.ok && beforeDeposit.error.reason).toBe(
      "partial-refund-before-deposit"
    );
  });

  it("provider 취소가 IN_PROGRESS면 추가 환불 계획을 만들지 않는다", () => {
    const checked = settledTarget();
    // 공개 경로에서는 asCancelable이 먼저 막는다. prepareRefund의 방어-in-depth를 확인하기
    // 위해 이미 발급된 target 뒤 Payment가 pending 상태로 바뀐 상황을 모사한다.
    const target = {
      ...checked,
      payment: asPaymentFixture(
        rawPayment({
          status: "PARTIAL_CANCELED",
          cancels: [
            rawCancelTransaction({
              cancelStatus: "IN_PROGRESS",
              refundableAmount: 1_000,
            }),
          ],
        })
      ),
    } as typeof checked;
    const prepared = prepareRefund(
      target,
      quoteFor(target, { kind: "partial", amount: 300 })
    );

    expect(!prepared.ok && prepared.error.reason).toBe("pending-cancellation");
  });

  it("JSON parse·spread로 runtime seal이 사라진 quote는 강제 캐스팅해도 거부한다", () => {
    const target = settledTarget();
    const quote = quoteFor(target, { kind: "partial", amount: 300 });
    const parsed = orThrow(parseRefundQuote(JSON.parse(JSON.stringify(quote))));
    const spread = { ...quote };

    for (const unsealed of [parsed, spread]) {
      const prepared = prepareRefund(target, unsealed as RefundQuote);
      expect(!prepared.ok && prepared.error.reason).toBe("invalid-quote");
    }
  });
});

describe("executeRefund — 기존 TossCancels 위임", () => {
  it("full 계획은 cancelAmount 없이 cancelFully로 위임하고 명시 멱등키를 보낸다", async () => {
    const target = settledTarget();
    const plan = expectPlan(
      target,
      quoteFor(target, { kind: "full", amount: 1_000 })
    );
    if (plan.targetKind !== "settled")
      return expect.unreachable("settled 계획이어야 한다");
    const pair = lookupThenCancel(
      rawPayment(),
      rawPayment({
        status: "CANCELED",
        balanceAmount: 0,
        lastTransactionKey: "txn-refund-full",
        cancels: [rawCancelTransaction({ transactionKey: "txn-refund-full" })],
      })
    );
    const key = stableIdempotencyKey();
    const attempt = expectAttempt(
      plan,
      { reason: reason(), taxFreeAmount: 0 },
      key
    );

    const result = await executeRefund(testClient(pair.fetch), attempt);

    expect(isOk(result)).toBe(true);
    const post = pair.calls.find((call) => call.method === "POST");
    const body = JSON.parse(post?.body ?? "{}") as Record<string, unknown>;
    expect(body["cancelAmount"]).toBeUndefined();
    expect(body["refundableAmount"]).toBe(1_000);
    expect(body["currency"]).toBe("KRW");
    expect(post?.headers["idempotency-key"]).toBe(key);
  });

  it("partial 계획은 계산 금액만 cancelPartially로 위임한다", async () => {
    const target = settledTarget();
    const plan = expectPlan(
      target,
      quoteFor(target, { kind: "partial", amount: 300 })
    );
    if (plan.targetKind !== "settled")
      return expect.unreachable("settled 계획이어야 한다");
    const pair = lookupThenCancel(
      rawPayment(),
      rawPayment({
        status: "PARTIAL_CANCELED",
        balanceAmount: 700,
        lastTransactionKey: "txn-refund-partial",
        cancels: [
          rawCancelTransaction({
            transactionKey: "txn-refund-partial",
            cancelAmount: 300,
            refundableAmount: 700,
          }),
        ],
      })
    );
    const attempt = expectAttempt(plan, { reason: reason() });

    const result = await executeRefund(testClient(pair.fetch), attempt);

    expect(isOk(result)).toBe(true);
    const post = pair.calls.find((call) => call.method === "POST");
    const body = JSON.parse(post?.body ?? "{}") as Record<string, unknown>;
    expect(body["cancelAmount"]).toBe(300);
    expect(body["refundableAmount"]).toBe(1_000);
    expect(body["currency"]).toBe("KRW");
  });

  it("입금 완료 가상계좌는 검증된 refundReceiveAccount를 필수 전송한다", async () => {
    const target = depositedVaTarget();
    const plan = expectPlan(
      target,
      quoteFor(target, { kind: "partial", amount: 300 })
    );
    if (plan.targetKind !== "deposited-virtual-account") {
      return expect.unreachable("가상계좌 계획이어야 한다");
    }
    const pair = lookupThenCancel(
      target.payment.raw as Record<string, unknown>,
      rawPayment({
        method: "가상계좌",
        secret: "va-secret",
        card: null,
        virtualAccount: { accountNumber: "1", bankCode: "88" },
        status: "PARTIAL_CANCELED",
        balanceAmount: 700,
        lastTransactionKey: "txn-va-refund",
        cancels: [
          rawCancelTransaction({
            transactionKey: "txn-va-refund",
            cancelAmount: 300,
          }),
        ],
      })
    );
    const account = orThrow(
      refundAccount({
        bank: "88",
        accountNumber: "1234567890",
        holderName: "홍길동",
      })
    );

    const attempt = expectAttempt(plan, {
      reason: reason(),
      refundAccount: account,
    });
    const result = await executeRefund(testClient(pair.fetch), attempt);

    expect(isOk(result)).toBe(true);
    const post = pair.calls.find((call) => call.method === "POST");
    const body = JSON.parse(post?.body ?? "{}") as Record<string, unknown>;
    expect(body["refundReceiveAccount"]).toEqual({
      bank: "88",
      accountNumber: "1234567890",
      holderName: "홍길동",
    });
  });

  it("봉인 없는 forged attempt는 조회/API 호출 전에 거부한다", async () => {
    const target = settledTarget();
    const plan = expectPlan(
      target,
      quoteFor(target, { kind: "partial", amount: 300 })
    );
    const valid = expectAttempt(plan, { reason: reason() });
    const forged = { ...valid } as RefundExecutionAttempt; // 비열거 request/plan 봉인이 복사되지 않는다.
    const pair = forbiddenFetch();

    const result = await executeRefund(testClient(pair.fetch), forged);

    expect(isErr(result)).toBe(true);
    if (
      !result.ok &&
      result.error.source === "library" &&
      "kind" in result.error
    ) {
      expect(result.error.kind).toBe("invalid-refund-plan");
      if (result.error.kind === "invalid-refund-plan") {
        expect(result.error.reason).toBe("forged-attempt");
      }
    }
    expect(pair.calls).toHaveLength(0);
  });

  it("attempt 준비 시 가상계좌 계좌·멱등키 누락과 null 입력을 fail-closed 한다", () => {
    const target = depositedVaTarget();
    const plan = expectPlan(
      target,
      quoteFor(target, { kind: "partial", amount: 300 })
    );
    if (plan.targetKind !== "deposited-virtual-account") {
      return expect.unreachable("가상계좌 계획이어야 한다");
    }
    const pair = forbiddenFetch();

    const noAccount = prepareRefundExecution(
      plan,
      { reason: reason() } as never,
      {
        idempotencyKey: stableIdempotencyKey(),
      }
    );
    expect(
      !noAccount.ok &&
        noAccount.error.source === "library" &&
        "reason" in noAccount.error
        ? noAccount.error.reason
        : null
    ).toBe("refund-account-required");

    const account = orThrow(
      refundAccount({
        bank: "88",
        accountNumber: "1234567890",
        holderName: "홍길동",
      })
    );
    const noKey = prepareRefundExecution(
      plan,
      { reason: reason(), refundAccount: account },
      undefined as never
    );
    expect(
      !noKey.ok && noKey.error.source === "library" && "reason" in noKey.error
        ? noKey.error.reason
        : null
    ).toBe("missing-idempotency-key");
    const nullRequest = prepareRefundExecution(
      plan,
      null as never,
      null as never
    );
    expect(!nullRequest.ok && nullRequest.error.reason).toBe("invalid-request");
    expect(pair.calls).toHaveLength(0);
  });

  it("같은 attempt 반복 실행은 원본 request body와 멱등키를 그대로 재사용한다", async () => {
    const target = depositedVaTarget();
    const plan = expectPlan(
      target,
      quoteFor(target, { kind: "partial", amount: 300 })
    );
    const account = orThrow(
      refundAccount({
        bank: "88",
        accountNumber: "111122223333",
        holderName: "원래 예금주",
      })
    );
    const originalCancelRequestId = orThrow(
      cancelRequestId("async-refund-000001")
    );
    const request = {
      reason: reason(),
      refundAccount: account,
      taxFreeAmount: 7,
      cancelRequestId: originalCancelRequestId,
    };
    const key = stableIdempotencyKey();
    const preparationOptions = { idempotencyKey: key };
    const attempt = expectAttempt(plan, request, key);

    // attempt 생성 뒤 원본 객체가 바뀌어도 봉인된 canonical snapshot에는 영향이 없어야 한다.
    (account as unknown as { accountNumber: string }).accountNumber =
      "999900001111";
    (
      request as unknown as {
        reason: string;
        taxFreeAmount: number;
        cancelRequestId: string;
      }
    ).reason = "변경된 사유";
    (request as unknown as { taxFreeAmount: number }).taxFreeAmount = 99;
    (request as unknown as { cancelRequestId: string }).cancelRequestId =
      "changed-request-0001";
    (
      preparationOptions as unknown as { idempotencyKey: string }
    ).idempotencyKey = "another-refund-key";

    const pair = lookupThenCancel(
      target.payment.raw as Record<string, unknown>,
      rawPayment({
        method: "가상계좌",
        secret: "va-secret",
        card: null,
        virtualAccount: { accountNumber: "1", bankCode: "88" },
        status: "PARTIAL_CANCELED",
        balanceAmount: 700,
        lastTransactionKey: "txn-va-repeat",
        cancels: [
          rawCancelTransaction({
            transactionKey: "txn-va-repeat",
            cancelAmount: 300,
            refundableAmount: 700,
          }),
        ],
      })
    );
    const client = testClient(pair.fetch);

    const first = await executeRefund(client, attempt);
    const second = await executeRefund(client, attempt);

    expect(isOk(first)).toBe(true);
    expect(isOk(second)).toBe(true);
    const posts = pair.calls.filter((call) => call.method === "POST");
    expect(posts).toHaveLength(2);
    expect(posts[0]?.body).toBe(posts[1]?.body);
    expect(posts[0]?.headers["idempotency-key"]).toBe(key);
    expect(posts[1]?.headers["idempotency-key"]).toBe(key);
    const body = JSON.parse(posts[0]?.body ?? "{}") as Record<string, unknown>;
    expect(body["cancelReason"]).toBe("정책 환불");
    expect(body["taxFreeAmount"]).toBe(7);
    expect(body["cancelRequestId"]).toBe(originalCancelRequestId);
    expect(body["refundReceiveAccount"]).toEqual({
      bank: "88",
      accountNumber: "111122223333",
      holderName: "원래 예금주",
    });
  });

  it("실행 시 멱등키 덮어쓰기와 malformed runtime 옵션을 조회 전에 거부한다", async () => {
    const target = settledTarget();
    const plan = expectPlan(
      target,
      quoteFor(target, { kind: "partial", amount: 300 })
    );
    const attempt = expectAttempt(plan, { reason: reason() });
    const pair = forbiddenFetch();
    const client = testClient(pair.fetch);

    const override = await executeRefund(client, attempt, {
      idempotencyKey: orThrow(idempotencyKey("different-refund-key")),
    } as never);
    const malformed = await executeRefund(client, attempt, null as never);

    expect(
      !override.ok &&
        override.error.source === "library" &&
        "reason" in override.error
        ? override.error.reason
        : null
    ).toBe("invalid-request");
    expect(
      !malformed.ok &&
        malformed.error.source === "library" &&
        "reason" in malformed.error
        ? malformed.error.reason
        : null
    ).toBe("invalid-request");
    expect(pair.calls).toHaveLength(0);
  });

  it.each([
    ["status", { status: "WAITING_FOR_DEPOSIT" }],
    [
      "method",
      {
        method: "간편결제",
        easyPay: { provider: "테스트", amount: 1_000, discountAmount: 0 },
      },
    ],
    ["lastTransactionKey", { lastTransactionKey: "txn-2" }],
    [
      "cancel fingerprint",
      {
        cancels: [
          rawCancelTransaction({
            transactionKey: "txn-observed-change",
            cancelAmount: 100,
            refundableAmount: 1_000,
          }),
        ],
      },
    ],
  ] as const)(
    "fresh Payment의 %s 변화는 같은 잔액이어도 POST 전에 거부한다",
    async (_, change) => {
      const target = settledTarget();
      const plan = expectPlan(
        target,
        quoteFor(target, { kind: "partial", amount: 300 })
      );
      const attempt = expectAttempt(plan, { reason: reason() });
      const pair = mockFetch(() => ({ status: 200, body: rawPayment(change) }));

      const result = await executeRefund(testClient(pair.fetch), attempt);

      expect(
        !result.ok &&
          result.error.source === "library" &&
          "reason" in result.error
          ? result.error.reason
          : null
      ).toBe("payment-state-mismatch");
      expect(pair.calls).toHaveLength(1);
      expect(pair.calls[0]?.method).toBe("GET");
    }
  );

  it("validUntil exclusive 경계에 도달한 attempt는 fresh 조회 전 만료된다", async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-08-10T12:00:00.000Z"));
      const target = settledTarget();
      const quote = quoteFor(target, {
        kind: "partial",
        amount: 300,
        validUntil: "2026-08-10T12:01:00.000Z",
      });
      const plan = expectPlan(target, quote);
      const attempt = expectAttempt(plan, { reason: reason() });
      const pair = forbiddenFetch();

      vi.setSystemTime(new Date("2026-08-10T12:01:00.000Z"));
      const result = await executeRefund(testClient(pair.fetch), attempt);

      expect(
        !result.ok &&
          result.error.source === "library" &&
          "reason" in result.error
          ? result.error.reason
          : null
      ).toBe("expired-quote");
      expect(pair.calls).toHaveLength(0);
    } finally {
      vi.useRealTimers();
    }
  });
});
