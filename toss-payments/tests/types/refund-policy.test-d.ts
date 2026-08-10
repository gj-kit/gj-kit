import { describe, expectTypeOf, it } from "vitest";

import {
  createCustomRefundPolicy,
  createRefundPolicy,
  ok,
  orThrow,
  parseRefundQuote,
  type CancelReason,
  type IdempotencyKey,
  type ParsedRefundQuote,
  type RefundQuote,
  type RefundQuoteInput,
} from "../../src/index";
import {
  executeRefund,
  prepareRefund,
  prepareRefundExecution,
  type NoRefundPreparation,
  type RefundAccount,
  type RefundExecutionAttempt,
  type RefundExecutionPlan,
  type SettledCancelable,
  type TossServerClient,
} from "../../src/server";

const forge = <T>(): T => undefined as T; // 타입 테스트 전용 헬퍼

describe("refund policy 입력 — 정책 kind별 추가 필드 강제", () => {
  const common = forge<RefundQuoteInput>();

  it("elapsed-time-rate에는 anchorAt이 필수다", () => {
    const policy = orThrow(
      createRefundPolicy({
        id: "elapsed",
        version: "1",
        kind: "elapsed-time-rate",
        brackets: [{ untilMs: 60_000, rateBps: 10_000 }],
        fallbackRateBps: 0,
        rounding: "floor",
      })
    );

    const input = { ...common, anchorAt: new Date() };
    void policy.quote(input);
    void policy.restoreQuote(forge<unknown>(), input);
    // @ts-expect-error elapsed-time-rate는 경과시간 기준 시각을 생략할 수 없다
    void policy.quote(common);
    // @ts-expect-error elapsed-time-rate 저장 quote 복원에도 anchorAt이 필수다
    void policy.restoreQuote(forge<unknown>(), common);
  });

  it("remaining-units에는 totalUnits와 remainingUnits가 모두 필수다", () => {
    const policy = orThrow(
      createRefundPolicy({
        id: "remaining",
        version: "1",
        kind: "remaining-units",
        rounding: "half-up",
      })
    );

    const input = { ...common, totalUnits: 30, remainingUnits: 10 };
    void policy.quote(input);
    void policy.restoreQuote(forge<unknown>(), input);
    // @ts-expect-error remaining-units의 두 단위 입력을 모두 생략할 수 없다
    void policy.quote(common);
    // @ts-expect-error remaining-units 저장 quote 복원에도 두 단위가 모두 필요하다
    void policy.restoreQuote(forge<unknown>(), common);
    // @ts-expect-error remainingUnits만 생략하는 것도 허용하지 않는다
    void policy.quote({ ...common, totalUnits: 30 });
  });

  it("custom context는 프로젝트가 선언한 타입 그대로 calculate와 quote에 흐른다", () => {
    interface MembershipContext {
      readonly tier: "standard" | "vip";
      readonly usedDays: number;
    }

    const policy = orThrow(
      createCustomRefundPolicy<MembershipContext>({
        id: "custom",
        version: "1",
        kind: "custom",
        rounding: "floor",
        calculate: (input) => {
          expectTypeOf(input.context).toEqualTypeOf<MembershipContext>();
          return ok({ kind: "amount", amount: input.context.usedDays });
        },
      })
    );

    const input = { ...common, context: { tier: "vip", usedDays: 3 } } as const;
    void policy.quote(input);
    void policy.restoreQuote(forge<unknown>(), input);
    // @ts-expect-error custom 정책 context는 생략할 수 없다
    void policy.quote(common);
    // @ts-expect-error custom 저장 quote 복원에도 동일 context 타입이 필요하다
    void policy.restoreQuote(forge<unknown>(), common);
    // @ts-expect-error 선언한 MembershipContext의 usedDays가 필요하다
    void policy.quote({ ...common, context: { tier: "vip" } });
    // @ts-expect-error tier 리터럴 유니언 밖의 값은 허용하지 않는다
    void policy.quote({ ...common, context: { tier: "guest", usedDays: 3 } });
  });

  it("parse는 비실행 ParsedRefundQuote, 활성 policy 복원은 RefundQuote를 반환한다", () => {
    const policy = orThrow(
      createRefundPolicy({
        id: "persisted-percentage",
        version: "1",
        kind: "percentage",
        rateBps: 8_000,
        rounding: "floor",
      })
    );
    const parsed = parseRefundQuote(forge<unknown>());
    if (parsed.ok) {
      expectTypeOf(parsed.value).toEqualTypeOf<ParsedRefundQuote>();
      const restored = policy.restoreQuote(parsed.value, common);
      if (restored.ok) {
        expectTypeOf(restored.value).toEqualTypeOf<RefundQuote>();
      }
    }
  });
});

describe("refund execution attempt — request·멱등키 봉인 타입 안전성", () => {
  const client = forge<TossServerClient<"test", "api">>();
  const settled =
    forge<Extract<RefundExecutionPlan, { readonly targetKind: "settled" }>>();
  const depositedVirtualAccount =
    forge<
      Extract<
        RefundExecutionPlan,
        { readonly targetKind: "deposited-virtual-account" }
      >
    >();
  const awaitingDeposit =
    forge<
      Extract<RefundExecutionPlan, { readonly targetKind: "awaiting-deposit" }>
    >();
  const noRefund = forge<NoRefundPreparation>();
  const reason = forge<CancelReason>();
  const account = forge<RefundAccount>();
  const key = forge<IdempotencyKey>();
  const options = { idempotencyKey: key };
  const settledAttempt =
    forge<
      Extract<RefundExecutionAttempt, { readonly targetKind: "settled" }>
    >();
  const depositedAttempt =
    forge<
      Extract<
        RefundExecutionAttempt,
        { readonly targetKind: "deposited-virtual-account" }
      >
    >();
  const awaitingAttempt =
    forge<
      Extract<
        RefundExecutionAttempt,
        { readonly targetKind: "awaiting-deposit" }
      >
    >();

  it("구조만 parse한 저장 quote는 활성 policy 복원 전 실행 plan을 만들 수 없다", () => {
    const parsed = forge<ParsedRefundQuote>();
    const target = forge<SettledCancelable>();
    // @ts-expect-error ParsedRefundQuote는 policy.restoreQuote를 거쳐야 RefundQuote가 된다
    void prepareRefund(target, parsed);
  });

  it("no-refund와 plan은 executeRefund에 직접 전달할 수 없다", () => {
    // @ts-expect-error amount 0인 no-refund는 RefundExecutionAttempt가 아니다
    void executeRefund(client, noRefund);
    // @ts-expect-error request/key를 봉인하지 않은 plan은 실행할 수 없다
    void executeRefund(client, settled);
  });

  it("targetKind별 정상 요청으로 attempt를 준비한 뒤 실행한다", () => {
    void prepareRefundExecution(settled, { reason, taxFreeAmount: 0 }, options);
    void prepareRefundExecution(
      depositedVirtualAccount,
      { reason, refundAccount: account, taxFreeAmount: 0 },
      options
    );
    void prepareRefundExecution(awaitingDeposit, { reason }, options);

    void executeRefund(client, settledAttempt);
    void executeRefund(client, depositedAttempt, {
      signal: new AbortController().signal,
    });
    void executeRefund(client, awaitingAttempt, { testCode: "INVALID_REFUND" });
  });

  it("입금 완료 가상계좌에는 환불 계좌가 필수이고 다른 target에는 금지된다", () => {
    // @ts-expect-error deposited-virtual-account 요청에는 refundAccount가 필수다
    void prepareRefundExecution(depositedVirtualAccount, { reason }, options);

    const settledWithAccount = { reason, refundAccount: account };
    // @ts-expect-error settled에는 refundAccount를 보낼 수 없다(?: never가 변수 경유도 차단)
    void prepareRefundExecution(settled, settledWithAccount, options);

    const awaitingWithAccount = { reason, refundAccount: account };
    // @ts-expect-error 입금 대기 가상계좌에는 환불 계좌를 보낼 수 없다
    void prepareRefundExecution(awaitingDeposit, awaitingWithAccount, options);

    const awaitingWithTaxFreeAmount = { reason, taxFreeAmount: 0 };
    void prepareRefundExecution(
      awaitingDeposit,
      // @ts-expect-error 입금 대기 취소에는 taxFreeAmount를 보낼 수 없다
      awaitingWithTaxFreeAmount,
      options
    );
  });

  it("attempt 준비에 브랜드된 idempotencyKey가 필수이고 실행 때 바꿀 수 없다", () => {
    void prepareRefundExecution(settled, { reason }, options);

    // @ts-expect-error prepareRefundExecution은 options를 생략할 수 없다
    void prepareRefundExecution(settled, { reason });
    // @ts-expect-error 빈 options에는 필수 idempotencyKey가 없다
    void prepareRefundExecution(settled, { reason }, {});
    void prepareRefundExecution(
      settled,
      { reason },
      // @ts-expect-error raw string은 IdempotencyKey 브랜드를 갖지 않는다
      { idempotencyKey: "refund-raw-key" }
    );

    // @ts-expect-error 실행 시 멱등키를 덮어쓸 수 없다
    void executeRefund(client, settledAttempt, { idempotencyKey: key });
    // @ts-expect-error 실행 시 request를 다시 전달할 수 없다
    void executeRefund(client, settledAttempt, { reason }, options);
  });
});
