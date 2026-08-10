import { describe, expect, it } from "vitest";

import {
  REFUND_TIME,
  createCustomRefundPolicy,
  createRefundPolicy,
  err,
  ok,
  orThrow,
  parseRefundQuote,
  remainingCalendarDays,
  type RefundQuoteInput,
} from "../../src/index";
import { asPaymentFixture, rawPayment } from "./helpers";

const DEFAULT_EVALUATED_AT = new Date("2026-08-10T03:00:00.000Z");

interface CommonInputOptions {
  readonly balanceAmount?: number;
  readonly basisAmount?: number;
  readonly alreadyRefundedAmount?: number;
  readonly expectedBalanceAmount?: number;
  readonly evaluatedAt?: Date;
  readonly validUntil?: Date;
}

function commonInput(options: CommonInputOptions = {}): RefundQuoteInput {
  const balanceAmount = options.balanceAmount ?? 1_000;
  const basisAmount = options.basisAmount ?? 1_000;
  return {
    payment: asPaymentFixture(
      rawPayment({ balanceAmount, totalAmount: basisAmount })
    ),
    basisAmount,
    alreadyRefundedAmount: options.alreadyRefundedAmount ?? 0,
    expectedBalanceAmount: options.expectedBalanceAmount ?? balanceAmount,
    evaluatedAt: options.evaluatedAt ?? DEFAULT_EVALUATED_AT,
    ...(options.validUntil === undefined
      ? {}
      : { validUntil: options.validUntil }),
  };
}

describe("createRefundPolicy — 기본·퍼센트 정책", () => {
  it("full은 현재 Toss 잔액 전부를 이번 환불액으로 만든다", () => {
    const policy = orThrow(
      createRefundPolicy({ id: "full", version: "1", kind: "full" })
    );

    const quote = orThrow(
      policy.quote(
        commonInput({
          balanceAmount: 700,
          basisAmount: 1_000,
          alreadyRefundedAmount: 300,
        })
      )
    );

    expect(quote).toMatchObject({
      kind: "full",
      entitlementAmount: 1_000,
      amount: 700,
      balanceAfterRefund: 0,
      rateBps: 10_000,
      calculation: { kind: "full" },
    });
    expect(quote.validUntil).toBe("2026-08-10T03:05:00.000Z");
  });

  it("percentage의 0%와 100%를 각각 no-refund와 full로 구분한다", () => {
    const zero = orThrow(
      createRefundPolicy({
        id: "percentage-zero",
        version: "1",
        kind: "percentage",
        rateBps: 0,
        rounding: "floor",
      })
    );
    const hundred = orThrow(
      createRefundPolicy({
        id: "percentage-hundred",
        version: "1",
        kind: "percentage",
        rateBps: 10_000,
        rounding: "floor",
      })
    );

    expect(orThrow(zero.quote(commonInput()))).toMatchObject({
      kind: "none",
      entitlementAmount: 0,
      amount: 0,
      balanceAfterRefund: 1_000,
    });
    expect(orThrow(hundred.quote(commonInput()))).toMatchObject({
      kind: "full",
      entitlementAmount: 1_000,
      amount: 1_000,
      balanceAfterRefund: 0,
    });
  });

  it.each([
    ["floor", 50],
    ["ceil", 51],
    ["half-up", 51],
  ] as const)(
    "%s 반올림을 정수 금액 계산에 적용한다",
    (rounding, expectedAmount) => {
      const policy = orThrow(
        createRefundPolicy({
          id: `percentage-${rounding}`,
          version: "1",
          kind: "percentage",
          rateBps: 5_000,
          rounding,
        })
      );

      const quote = orThrow(
        policy.quote(commonInput({ balanceAmount: 101, basisAmount: 101 }))
      );

      expect(quote.entitlementAmount).toBe(expectedAmount);
      expect(quote.amount).toBe(expectedAmount);
    }
  );

  it("MAX_SAFE_INTEGER 금액도 중간 곱셈 overflow 없이 계산한다", () => {
    const policy = orThrow(
      createRefundPolicy({
        id: "bigint-safe",
        version: "1",
        kind: "percentage",
        rateBps: 10_000,
        rounding: "floor",
      })
    );
    const quote = orThrow(
      policy.quote(
        commonInput({
          balanceAmount: Number.MAX_SAFE_INTEGER,
          basisAmount: Number.MAX_SAFE_INTEGER,
        })
      )
    );

    expect(quote.amount).toBe(Number.MAX_SAFE_INTEGER);
  });
});

describe("createRefundPolicy — 경과시간 정책", () => {
  it("REFUND_TIME은 정책 설정에 쓸 고정 밀리초 단위다", () => {
    expect(REFUND_TIME).toEqual({
      minute: 60_000,
      hour: 3_600_000,
      day: 86_400_000,
    });
  });

  it("반열린 경계 직전/동일/직후에 각각 올바른 구간을 고른다", () => {
    const anchorAt = new Date("2026-08-10T00:00:00.000Z");
    const policy = orThrow(
      createRefundPolicy({
        id: "elapsed",
        version: "1",
        kind: "elapsed-time-rate",
        brackets: [
          { untilMs: REFUND_TIME.hour, rateBps: 10_000, reason: "first-hour" },
          {
            untilMs: REFUND_TIME.hour * 2,
            rateBps: 5_000,
            reason: "second-hour",
          },
        ],
        fallbackRateBps: 0,
        fallbackReason: "expired",
        rounding: "floor",
      })
    );
    const quoteAt = (elapsedMs: number) =>
      orThrow(
        policy.quote({
          ...commonInput({
            evaluatedAt: new Date(anchorAt.getTime() + elapsedMs),
          }),
          anchorAt,
        })
      );

    expect(quoteAt(REFUND_TIME.hour - 1)).toMatchObject({
      kind: "full",
      amount: 1_000,
      rateBps: 10_000,
      reason: "first-hour",
      calculation: { elapsedMs: REFUND_TIME.hour - 1, bracketIndex: 0 },
    });
    expect(quoteAt(REFUND_TIME.hour - 1).validUntil).toBe(
      "2026-08-10T01:00:00.000Z"
    );
    expect(quoteAt(REFUND_TIME.hour)).toMatchObject({
      kind: "partial",
      amount: 500,
      rateBps: 5_000,
      reason: "second-hour",
      calculation: { elapsedMs: REFUND_TIME.hour, bracketIndex: 1 },
    });
    expect(quoteAt(REFUND_TIME.hour + 1)).toMatchObject({
      kind: "partial",
      amount: 500,
      rateBps: 5_000,
      reason: "second-hour",
      calculation: { elapsedMs: REFUND_TIME.hour + 1, bracketIndex: 1 },
    });
    expect(quoteAt(REFUND_TIME.hour * 2)).toMatchObject({
      kind: "none",
      amount: 0,
      rateBps: 0,
      reason: "expired",
      calculation: { bracketIndex: null },
    });
  });

  it("untilMs가 역순인 설정은 정책 생성 시 거부한다", () => {
    const result = createRefundPolicy({
      id: "elapsed-reversed",
      version: "1",
      kind: "elapsed-time-rate",
      brackets: [
        { untilMs: REFUND_TIME.hour * 2, rateBps: 10_000 },
        { untilMs: REFUND_TIME.hour, rateBps: 5_000 },
      ],
      fallbackRateBps: 0,
      rounding: "floor",
    });

    expect(result).toMatchObject({
      ok: false,
      error: {
        kind: "invalid-refund-policy",
        policyId: "elapsed-reversed",
        field: "brackets[1].untilMs",
      },
    });
  });

  it("생성 뒤 원본 brackets를 바꿔도 같은 정책 버전의 계산은 변하지 않는다", () => {
    const brackets = [{ untilMs: REFUND_TIME.hour, rateBps: 10_000 }];
    const policy = orThrow(
      createRefundPolicy({
        id: "elapsed-snapshot",
        version: "1",
        kind: "elapsed-time-rate",
        brackets,
        fallbackRateBps: 0,
        rounding: "floor",
      })
    );
    brackets[0] = { untilMs: REFUND_TIME.hour, rateBps: 0 };

    const quote = orThrow(
      policy.quote({
        ...commonInput({ evaluatedAt: new Date("2026-08-10T00:30:00.000Z") }),
        anchorAt: new Date("2026-08-10T00:00:00.000Z"),
      })
    );
    expect(quote.amount).toBe(1_000);
  });
});

describe("createRefundPolicy — 장부와 Toss 잔액 안전장치", () => {
  it("누적 entitlement에서 이미 확정된 환불액을 차감한다", () => {
    const policy = orThrow(
      createRefundPolicy({
        id: "existing-refund",
        version: "1",
        kind: "percentage",
        rateBps: 8_000,
        rounding: "floor",
      })
    );

    const quote = orThrow(
      policy.quote(
        commonInput({
          balanceAmount: 700,
          basisAmount: 1_000,
          alreadyRefundedAmount: 300,
        })
      )
    );

    expect(quote).toMatchObject({
      kind: "partial",
      entitlementAmount: 800,
      alreadyRefundedAmount: 300,
      amount: 500,
      balanceAfterRefund: 200,
      overRefundedAmount: 0,
    });
  });

  it("프로젝트 장부 잔액과 최신 Toss 잔액이 다르면 계산 전에 중단한다", () => {
    const policy = orThrow(
      createRefundPolicy({
        id: "balance-drift",
        version: "1",
        kind: "percentage",
        rateBps: 5_000,
        rounding: "floor",
      })
    );

    const result = policy.quote(
      commonInput({ balanceAmount: 700, expectedBalanceAmount: 800 })
    );

    expect(result).toEqual({
      ok: false,
      error: {
        source: "library",
        kind: "expected-refund-balance-mismatch",
        policyId: "balance-drift",
        expected: 800,
        actual: 700,
      },
    });
  });

  it("계산액이 Toss 잔액을 넘으면 잔액으로 clamp하지 않고 실패한다", () => {
    const policy = orThrow(
      createRefundPolicy({
        id: "no-clamp",
        version: "1",
        kind: "percentage",
        rateBps: 10_000,
        rounding: "floor",
      })
    );

    const result = policy.quote(
      commonInput({ balanceAmount: 600, basisAmount: 1_000 })
    );

    expect(result).toEqual({
      ok: false,
      error: {
        source: "library",
        kind: "calculated-refund-exceeds-balance",
        policyId: "no-clamp",
        calculatedAmount: 1_000,
        balanceAmount: 600,
      },
    });
  });

  it("DB JSON quote를 공통 산술·내장 정책 검증 뒤 안전하게 복원한다", () => {
    const policy = orThrow(
      createRefundPolicy({
        id: "persisted-percentage",
        version: "2",
        kind: "percentage",
        rateBps: 8_000,
        rounding: "floor",
      })
    );
    const input = commonInput({
      balanceAmount: 700,
      basisAmount: 1_000,
      alreadyRefundedAmount: 300,
    });
    const original = orThrow(policy.quote(input));
    const stored = JSON.parse(JSON.stringify(original)) as Record<
      string,
      unknown
    >;

    expect(orThrow(parseRefundQuote(stored))).toEqual(original);
    expect(orThrow(policy.restoreQuote(stored, input))).toEqual(original);

    const tampered = { ...stored, amount: 499 };
    expect(parseRefundQuote(tampered)).toMatchObject({
      ok: false,
      error: { kind: "invalid-refund-quote", field: "amount" },
    });

    const forgedByDifferentTerms = orThrow(
      orThrow(
        createRefundPolicy({
          id: "persisted-percentage",
          version: "2",
          kind: "percentage",
          rateBps: 10_000,
          rounding: "floor",
        })
      ).quote(input)
    );
    expect(
      parseRefundQuote(JSON.parse(JSON.stringify(forgedByDifferentTerms))).ok
    ).toBe(true);
    expect(
      policy.restoreQuote(
        JSON.parse(JSON.stringify(forgedByDifferentTerms)),
        input
      )
    ).toMatchObject({
      ok: false,
      error: { kind: "refund-quote-policy-mismatch" },
    });

    const extended = { ...stored, validUntil: "2099-01-01T00:00:00.000Z" };
    expect(parseRefundQuote(extended).ok).toBe(true);
    expect(policy.restoreQuote(extended, input)).toMatchObject({
      ok: false,
      error: { kind: "refund-quote-policy-mismatch" },
    });
  });

  it("동적 malformed 정책 설정도 throw하지 않고 Result 오류로 반환한다", () => {
    expect(() => createRefundPolicy(null as never)).not.toThrow();
    expect(createRefundPolicy(null as never)).toMatchObject({
      ok: false,
      error: { kind: "invalid-refund-policy", field: "config" },
    });
    expect(
      createRefundPolicy({
        id: "bad-brackets",
        version: "1",
        kind: "elapsed-time-rate",
        brackets: null,
        fallbackRateBps: 0,
        rounding: "floor",
      } as never)
    ).toMatchObject({
      ok: false,
      error: { kind: "invalid-refund-policy", field: "brackets" },
    });
  });

  it("동적 malformed Payment와 custom 결과도 throw 없이 입력 오류로 차단한다", () => {
    const policy = orThrow(
      createRefundPolicy({
        id: "runtime-payment-guard",
        version: "1",
        kind: "percentage",
        rateBps: 5_000,
        rounding: "floor",
      })
    );
    const malformedPayments = [
      {
        field: "payment.cancels",
        payment: asPaymentFixture(rawPayment({ cancels: {} })),
      },
      {
        field: "payment.cancels[0]",
        payment: asPaymentFixture(rawPayment({ cancels: [null] })),
      },
      {
        field: "payment.status",
        payment: asPaymentFixture(rawPayment({ status: "NOT_REAL" })),
      },
    ];

    for (const malformed of malformedPayments) {
      const invoke = () =>
        policy.quote({ ...commonInput(), payment: malformed.payment });
      expect(invoke).not.toThrow();
      expect(invoke()).toMatchObject({
        ok: false,
        error: {
          kind: "invalid-refund-input",
          field: malformed.field,
        },
      });
    }

    const custom = orThrow(
      createCustomRefundPolicy<undefined>({
        id: "runtime-custom-result-guard",
        version: "1",
        kind: "custom",
        rounding: "floor",
        calculate: () =>
          ok({ kind: "amount", amount: 100, reason: 123 } as never),
      })
    );
    expect(
      custom.quote({ ...commonInput(), context: undefined })
    ).toMatchObject({
      ok: false,
      error: { kind: "invalid-refund-input", field: "calculate.reason" },
    });
  });
});

describe("createRefundPolicy — 잔여 단위 정책", () => {
  it("서비스 시작/중간/끝의 잔여 비율을 각각 full/partial/none으로 계산한다", () => {
    const policy = orThrow(
      createRefundPolicy({
        id: "remaining-days",
        version: "1",
        kind: "remaining-units",
        rounding: "floor",
      })
    );
    const quoteAt = (remainingUnits: number) =>
      orThrow(
        policy.quote({
          ...commonInput({ balanceAmount: 1_200, basisAmount: 1_200 }),
          totalUnits: 12,
          remainingUnits,
        })
      );

    expect(quoteAt(12)).toMatchObject({
      kind: "full",
      amount: 1_200,
      calculation: { totalUnits: 12, remainingUnits: 12, rateBps: 10_000 },
    });
    expect(quoteAt(6)).toMatchObject({
      kind: "partial",
      amount: 600,
      calculation: { totalUnits: 12, remainingUnits: 6, rateBps: 10_000 },
    });
    expect(quoteAt(0)).toMatchObject({
      kind: "none",
      amount: 0,
      calculation: { totalUnits: 12, remainingUnits: 0, rateBps: 10_000 },
    });
  });
});

describe("remainingCalendarDays", () => {
  it("같은 UTC 시각을 Asia/Seoul의 달력 날짜로 평가한다", () => {
    const result = orThrow(
      remainingCalendarDays({
        startsOn: "2026-01-01",
        endsOnExclusive: "2026-01-04",
        evaluatedAt: new Date("2025-12-31T15:00:00.000Z"),
        timeZone: "Asia/Seoul",
        requestDay: "refundable",
      })
    );

    expect(result).toEqual({
      startsOn: "2026-01-01",
      endsOnExclusive: "2026-01-04",
      evaluatedOn: "2026-01-01",
      timeZone: "Asia/Seoul",
      requestDay: "refundable",
      validUntil: "2026-01-01T15:00:00.000Z",
      totalUnits: 3,
      remainingUnits: 3,
    });
  });

  it("윤년 2월 말 경계를 포함한 Gregorian 달력 일수를 센다", () => {
    const base = {
      startsOn: "2024-02-28",
      endsOnExclusive: "2024-03-02",
      evaluatedAt: new Date("2024-02-29T03:00:00.000Z"),
      timeZone: "Asia/Seoul",
    } as const;

    const refundable = orThrow(
      remainingCalendarDays({ ...base, requestDay: "refundable" })
    );
    const consumed = orThrow(
      remainingCalendarDays({ ...base, requestDay: "consumed" })
    );

    expect(refundable).toMatchObject({
      evaluatedOn: "2024-02-29",
      totalUnits: 3,
      remainingUnits: 2,
      requestDay: "refundable",
    });
    expect(consumed).toMatchObject({
      evaluatedOn: "2024-02-29",
      totalUnits: 3,
      remainingUnits: 1,
      requestDay: "consumed",
    });
  });

  it("월말에서 다음 달로 넘어가도 날짜 단위를 유지한다", () => {
    const result = orThrow(
      remainingCalendarDays({
        startsOn: "2026-01-31",
        endsOnExclusive: "2026-02-03",
        evaluatedAt: new Date("2026-02-01T03:00:00.000Z"),
        timeZone: "Asia/Seoul",
        requestDay: "refundable",
      })
    );

    expect(result).toMatchObject({
      evaluatedOn: "2026-02-01",
      totalUnits: 3,
      remainingUnits: 2,
    });
  });

  it("DST로 하루가 23시간이어도 IANA 달력 일수는 줄지 않는다", () => {
    const result = orThrow(
      remainingCalendarDays({
        startsOn: "2026-03-07",
        endsOnExclusive: "2026-03-11",
        evaluatedAt: new Date("2026-03-09T16:00:00.000Z"),
        timeZone: "America/New_York",
        requestDay: "refundable",
      })
    );

    expect(result).toMatchObject({
      evaluatedOn: "2026-03-09",
      totalUnits: 4,
      remainingUnits: 2,
      validUntil: "2026-03-10T04:00:00.000Z",
    });
  });

  it("지원되지 않는 time zone을 명시적 Result 오류로 반환한다", () => {
    const result = remainingCalendarDays({
      startsOn: "2026-01-01",
      endsOnExclusive: "2026-01-02",
      evaluatedAt: DEFAULT_EVALUATED_AT,
      timeZone: "Mars/Olympus_Mons",
      requestDay: "refundable",
    });

    expect(result).toMatchObject({
      ok: false,
      error: { kind: "invalid-refund-calendar", field: "timeZone" },
    });
  });

  it("다음 현지 자정을 remaining-units quote의 더 이른 만료 경계로 사용한다", () => {
    const evaluatedAt = new Date("2026-01-01T14:58:00.000Z");
    const days = orThrow(
      remainingCalendarDays({
        startsOn: "2026-01-01",
        endsOnExclusive: "2026-01-04",
        evaluatedAt,
        timeZone: "Asia/Seoul",
        requestDay: "consumed",
      })
    );
    const policy = orThrow(
      createRefundPolicy({
        id: "calendar-expiry",
        version: "1",
        kind: "remaining-units",
        rounding: "floor",
      })
    );
    const quote = orThrow(
      policy.quote({
        ...commonInput({ evaluatedAt, validUntil: new Date(days.validUntil) }),
        totalUnits: days.totalUnits,
        remainingUnits: days.remainingUnits,
      })
    );

    expect(quote.validUntil).toBe("2026-01-01T15:00:00.000Z");
  });
});

describe("createCustomRefundPolicy", () => {
  it("프로젝트 context로 계산한 성공 entitlement를 표준 quote로 캡슐화한다", () => {
    const policy = orThrow(
      createCustomRefundPolicy<{
        readonly fixedAmount: number;
        readonly membership: string;
      }>({
        id: "custom-success",
        version: "1",
        kind: "custom",
        rounding: "floor",
        calculate: ({ context }) =>
          ok({
            kind: "amount",
            amount: context.fixedAmount,
            reason: "membership-policy",
            details: { membership: context.membership },
          }),
      })
    );

    const quote = orThrow(
      policy.quote({
        ...commonInput(),
        context: { fixedAmount: 730, membership: "vip" },
      })
    );

    expect(quote).toMatchObject({
      kind: "partial",
      entitlementAmount: 730,
      amount: 730,
      rateBps: null,
      reason: "membership-policy",
      calculation: {
        kind: "custom",
        entitlementKind: "amount",
        details: { membership: "vip" },
      },
    });
  });

  it("custom 계산기가 반환한 Err의 cause를 보존한다", () => {
    const cause = { code: "RULES_UNAVAILABLE" } as const;
    const policy = orThrow(
      createCustomRefundPolicy<undefined>({
        id: "custom-err",
        version: "1",
        kind: "custom",
        rounding: "floor",
        calculate: () => err(cause),
      })
    );

    const result = policy.quote({ ...commonInput(), context: undefined });

    expect(result).toEqual({
      ok: false,
      error: {
        source: "library",
        kind: "custom-refund-calculation-failed",
        policyId: "custom-err",
        cause,
      },
    });
  });

  it("custom 계산기가 throw해도 예외를 Result 오류로 바꾼다", () => {
    const cause = new Error("calculator crashed");
    const policy = orThrow(
      createCustomRefundPolicy<undefined>({
        id: "custom-throw",
        version: "1",
        kind: "custom",
        rounding: "floor",
        calculate: () => {
          throw cause;
        },
      })
    );

    const result = policy.quote({ ...commonInput(), context: undefined });

    expect(result).toMatchObject({
      ok: false,
      error: {
        kind: "custom-refund-calculation-failed",
        policyId: "custom-throw",
        cause,
      },
    });
  });

  it("custom이 음수·비정수 금액 또는 basis 초과 entitlement를 반환하면 거부한다", () => {
    for (const amount of [-1, 1.5]) {
      const invalidAmount = orThrow(
        createCustomRefundPolicy<undefined>({
          id: `custom-invalid-${amount}`,
          version: "1",
          kind: "custom",
          rounding: "floor",
          calculate: () => ok({ kind: "amount", amount }),
        })
      );
      const result = invalidAmount.quote({
        ...commonInput(),
        context: undefined,
      });
      expect(result).toMatchObject({
        ok: false,
        error: { kind: "invalid-refund-input", field: "calculate.amount" },
      });
    }

    const aboveBasis = orThrow(
      createCustomRefundPolicy<undefined>({
        id: "custom-above-basis",
        version: "1",
        kind: "custom",
        rounding: "floor",
        calculate: () => ok({ kind: "amount", amount: 1_001 }),
      })
    );
    const result = aboveBasis.quote({ ...commonInput(), context: undefined });
    expect(result).toMatchObject({
      ok: false,
      error: { kind: "invalid-refund-input", field: "entitlementAmount" },
    });
  });

  it("custom details가 null인 동적 결과도 throw하지 않고 거부한다", () => {
    const policy = orThrow(
      createCustomRefundPolicy<undefined>({
        id: "custom-null-details",
        version: "1",
        kind: "custom",
        rounding: "floor",
        calculate: () =>
          ok({ kind: "amount", amount: 100, details: null as never }),
      })
    );

    expect(() =>
      policy.quote({ ...commonInput(), context: undefined })
    ).not.toThrow();
    expect(
      policy.quote({ ...commonInput(), context: undefined })
    ).toMatchObject({
      ok: false,
      error: { kind: "invalid-refund-input", field: "calculate.details" },
    });
  });
});
