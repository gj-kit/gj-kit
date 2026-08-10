/**
 * 환불 정책 계산 — Toss 취소 API와 분리된 환경 중립 순수 계층.
 *
 * 프로젝트는 장부 금액과 정책 값만 제공하고, 이 모듈은 정수 금액 계산·반올림·
 * 기존 환불 차감·최신 Toss 잔액 대조·감사 가능한 quote 생성을 소유한다.
 * 실제 API 실행은 server/refund.ts가 기존 cancel primitive에 위임한다.
 */
import type { Brand } from "./brand";
import { orderId, paymentKey, type OrderId, type PaymentKey } from "./ids";
import type { CancelTransaction, Payment, PaymentStatus } from "./payment";
import { err, ok, type Result } from "./result";

/** 100% = 10,000 basis points. 부동소수 퍼센트를 공개 계약으로 쓰지 않는다. */
export const REFUND_RATE_SCALE = 10_000 as const;

/** 별도 경계가 없는 견적도 무기한 실행되지 않도록 하는 기본 수명(5분). */
export const DEFAULT_REFUND_QUOTE_TTL_MS = 5 * 60_000;

/** 경과시간 정책을 읽기 좋게 정의하기 위한 고정 길이 상수. 달력 일수 계산에는 쓰지 않는다. */
export const REFUND_TIME = Object.freeze({
  minute: 60_000,
  hour: 60 * 60_000,
  day: 24 * 60 * 60_000,
});

export type RefundRoundingMode = "floor" | "ceil" | "half-up";

export interface RefundPolicyIdentity {
  /** CS·원장에 남길 안정적인 정책 ID. */
  readonly id: string;
  /** 정책 변경 뒤에도 과거 계산을 재현하기 위한 버전. */
  readonly version: string;
  /** quote의 최대 수명. 생략하면 {@link DEFAULT_REFUND_QUOTE_TTL_MS}. */
  readonly quoteTtlMs?: number;
}

export interface FullRefundPolicyConfig extends RefundPolicyIdentity {
  readonly kind: "full";
}

export interface PercentageRefundPolicyConfig extends RefundPolicyIdentity {
  readonly kind: "percentage";
  /** 0..10,000 정수. */
  readonly rateBps: number;
  readonly rounding: RefundRoundingMode;
  readonly reason?: string;
}

export interface ElapsedTimeRefundBracket {
  /** anchorAt부터 이 값 미만인 반열린 구간에 적용된다. 양수 밀리초. */
  readonly untilMs: number;
  /** 0..10,000 정수. */
  readonly rateBps: number;
  readonly reason?: string;
}

export interface ElapsedTimeRefundPolicyConfig extends RefundPolicyIdentity {
  readonly kind: "elapsed-time-rate";
  /** untilMs가 엄격한 오름차순이어야 한다. 경계 시각은 다음 구간으로 넘어간다. */
  readonly brackets: readonly ElapsedTimeRefundBracket[];
  readonly fallbackRateBps: number;
  readonly fallbackReason?: string;
  readonly rounding: RefundRoundingMode;
}

export interface RemainingUnitsRefundPolicyConfig extends RefundPolicyIdentity {
  readonly kind: "remaining-units";
  /** 잔여 비율에 추가로 곱할 비율. 기본 10,000(100%). */
  readonly rateBps?: number;
  readonly rounding: RefundRoundingMode;
  readonly reason?: string;
}

export type BuiltInRefundPolicyConfig =
  | FullRefundPolicyConfig
  | PercentageRefundPolicyConfig
  | ElapsedTimeRefundPolicyConfig
  | RemainingUnitsRefundPolicyConfig;

/**
 * 모든 정책 quote의 공통 입력.
 *
 * basisAmount/alreadyRefundedAmount/expectedBalanceAmount는 프로젝트 장부가 제공한다.
 * 라이브러리는 expectedBalanceAmount를 최신 Payment.balanceAmount와 대조하므로 외부
 * 부분취소나 장부 drift가 있으면 계산 전에 멈춘다.
 */
export interface RefundQuoteInput {
  readonly payment: Payment;
  /** 정책 비율을 곱할 프로젝트 장부 기준 금액. */
  readonly basisAmount: number;
  /** 프로젝트 장부에 provider 완료로 확정된 누적 환불액. */
  readonly alreadyRefundedAmount: number;
  /** 프로젝트 장부가 기대하는 현재 Toss 환불 가능 잔액. */
  readonly expectedBalanceAmount: number;
  /** 정책을 평가한 시각. 테스트 가능한 명시 입력이며 quote에 ISO로 남는다. */
  readonly evaluatedAt: Date;
  /**
   * 프로젝트 상태가 반드시 다시 평가되어야 하는 더 이른 경계(선택).
   * 예: 잔여 달력 일수는 다음 현지 자정. 정책 TTL/시간 구간 경계와의 최솟값이 적용된다.
   */
  readonly validUntil?: Date;
}

export interface ElapsedTimeRefundQuoteInput extends RefundQuoteInput {
  /** 경과시간 0의 기준 시각. evaluatedAt이 더 이르면 경과시간은 0으로 clamp한다. */
  readonly anchorAt: Date;
}

export interface RemainingUnitsRefundQuoteInput extends RefundQuoteInput {
  /** 전체 일수·회차·사용량 단위. 양수 안전한 정수. */
  readonly totalUnits: number;
  /** 0..totalUnits 안전한 정수. */
  readonly remainingUnits: number;
}

export interface CustomRefundQuoteInput<Context> extends RefundQuoteInput {
  readonly context: Context;
}

export type RefundCalculationDetail = string | number | boolean | null;

/** custom 정책이 반환하는 누적 환불 entitlement. 현재 실행액은 기존 환불을 차감해 계산한다. */
export type RefundEntitlement =
  | {
      readonly kind: "rate";
      readonly rateBps: number;
      readonly reason?: string;
      readonly details?: Readonly<Record<string, RefundCalculationDetail>>;
    }
  | {
      readonly kind: "amount";
      /** 이번 환불액이 아니라 정책상 누적 환불 가능 총액. */
      readonly amount: number;
      readonly reason?: string;
      readonly details?: Readonly<Record<string, RefundCalculationDetail>>;
    };

export interface CustomRefundPolicyConfig<Context>
  extends RefundPolicyIdentity {
  readonly kind: "custom";
  readonly rounding: RefundRoundingMode;
  /** throw 대신 Result 실패를 사용한다. throw도 라이브러리가 포착해 quote 오류로 바꾼다. */
  readonly calculate: (
    input: CustomRefundQuoteInput<Context>
  ) => Result<RefundEntitlement, unknown>;
}

export type RefundPolicyKind = BuiltInRefundPolicyConfig["kind"] | "custom";

export type RefundCalculation =
  | { readonly kind: "full" }
  | { readonly kind: "percentage"; readonly rateBps: number }
  | {
      readonly kind: "elapsed-time-rate";
      readonly elapsedMs: number;
      /** fallback이면 null. */
      readonly bracketIndex: number | null;
      readonly rateBps: number;
    }
  | {
      readonly kind: "remaining-units";
      readonly totalUnits: number;
      readonly remainingUnits: number;
      readonly rateBps: number;
    }
  | {
      readonly kind: "custom";
      readonly entitlementKind: "rate" | "amount";
      readonly details: Readonly<Record<string, RefundCalculationDetail>>;
    };

export interface RefundObservedCancelState {
  readonly transactionKey: string;
  readonly cancelAmount: number;
  readonly refundableAmount: number;
  readonly canceledAt: string;
  readonly cancelStatus: CancelTransaction["cancelStatus"];
}

/** quote를 만든 Payment와 실행 직전 재조회 Payment가 같은 관측 상태인지 대조하는 값. */
export interface RefundObservedPaymentState {
  readonly status: PaymentStatus;
  readonly method: Payment["method"];
  readonly lastTransactionKey: string | null;
  readonly isPartialCancelable: boolean;
  readonly cancels: readonly RefundObservedCancelState[];
}

/**
 * 정책 계산 결과. plain serializable 값이며 실제 cancel 실행 전 server의 prepareRefund를
 * 통과해야 한다. quote.amount는 항상 이번에 추가로 실행할 금액이다.
 */
export interface RefundQuote extends Brand<"RefundQuote"> {
  readonly kind: "none" | "full" | "partial";
  readonly policy: {
    readonly id: string;
    readonly version: string;
    readonly kind: RefundPolicyKind;
  };
  readonly paymentKey: PaymentKey;
  readonly orderId: OrderId;
  readonly currency: Payment["currency"];
  readonly evaluatedAt: string;
  /** exclusive. 실행 시각이 이 값 이상이면 반드시 재조회·재견적한다. */
  readonly validUntil: string;
  readonly observedPaymentState: RefundObservedPaymentState;
  /** quote 생성 때 관찰한 Toss Payment.balanceAmount. */
  readonly observedBalanceAmount: number;
  /** 프로젝트 장부가 기대한 잔액. 생성 성공 시 observed와 같다. */
  readonly expectedBalanceAmount: number;
  readonly basisAmount: number;
  readonly alreadyRefundedAmount: number;
  /** 정책상 누적 환불 가능 총액(반올림 후). */
  readonly entitlementAmount: number;
  /** entitlement에서 기존 확정 환불을 뺀 이번 실행액. */
  readonly amount: number;
  readonly balanceAfterRefund: number;
  /** 과거 확정 환불이 현재 정책 entitlement를 이미 넘은 금액. */
  readonly overRefundedAmount: number;
  /** 금액 직접 산출 정책이면 null. */
  readonly rateBps: number | null;
  readonly rounding: RefundRoundingMode;
  readonly calculation: RefundCalculation;
  readonly reason: string | null;
}

/** JSON 구조·산술 검증은 통과했지만 활성 policy로 재계산되기 전인 비실행 데이터. */
export type ParsedRefundQuote = Omit<RefundQuote, keyof Brand<"RefundQuote">>;

// 루트와 ./server가 별도 CJS 번들로 로드돼도 같은 in-memory quote를 인식해야 한다.
// 이 값은 보안 비밀이 아니라 JSON/스프레드로 실행 capability가 우연히 복원되는 것을 막는
// 프로세스 내 표식이다. 호환 불가능한 quote 스키마에서는 registry key의 v1을 올린다.
const refundQuoteSeal: unique symbol = Symbol.for(
  "@gj-kit/toss-payments/refund-quote/v1"
);
type RuntimeSealedRefundQuote = RefundQuote & {
  readonly [refundQuoteSeal]?: true;
};

/** policy.quote/restoreQuote가 만든 실행 가능한 in-memory quote인지 확인한다. */
export function isExecutableRefundQuote(value: unknown): value is RefundQuote {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as RuntimeSealedRefundQuote)[refundQuoteSeal] === true
  );
}

export type RefundPolicyConfigError = {
  readonly source: "library";
  readonly kind: "invalid-refund-policy";
  readonly policyId: string;
  readonly field: string;
  readonly reason: string;
};

export type RefundQuoteError =
  | {
      readonly source: "library";
      readonly kind: "invalid-refund-input";
      readonly policyId: string;
      readonly field: string;
      readonly reason: string;
    }
  | {
      readonly source: "library";
      readonly kind: "expected-refund-balance-mismatch";
      readonly policyId: string;
      readonly expected: number;
      readonly actual: number;
    }
  | {
      readonly source: "library";
      readonly kind: "calculated-refund-exceeds-balance";
      readonly policyId: string;
      readonly calculatedAmount: number;
      readonly balanceAmount: number;
    }
  | {
      readonly source: "library";
      readonly kind: "custom-refund-calculation-failed";
      readonly policyId: string;
      readonly cause: unknown;
    };

export interface RefundQuoteParseError {
  readonly source: "library";
  readonly kind: "invalid-refund-quote";
  readonly field: string;
  readonly reason: string;
}

export interface RefundQuotePolicyMismatchError {
  readonly source: "library";
  readonly kind: "refund-quote-policy-mismatch";
  readonly policyId: string;
  readonly reason: "stored-quote-does-not-match-recalculation";
}

export type RefundQuoteRestoreError =
  | RefundQuoteParseError
  | RefundQuoteError
  | RefundQuotePolicyMismatchError;

export interface RefundPolicy<Input extends RefundQuoteInput = RefundQuoteInput>
  extends Brand<"RefundPolicy"> {
  readonly id: string;
  readonly version: string;
  readonly kind: RefundPolicyKind;
  quote(input: Input): Result<RefundQuote, RefundQuoteError>;
  /** 저장 JSON을 활성 policy와 동일 입력으로 재계산해 실행 가능한 quote로 복원한다. */
  restoreQuote(
    stored: unknown,
    input: Input
  ): Result<RefundQuote, RefundQuoteRestoreError>;
}

type QuoteInputFor<Config extends BuiltInRefundPolicyConfig> =
  Config extends ElapsedTimeRefundPolicyConfig
    ? ElapsedTimeRefundQuoteInput
    : Config extends RemainingUnitsRefundPolicyConfig
    ? RemainingUnitsRefundQuoteInput
    : RefundQuoteInput;

function policyIdOf(config: unknown): string {
  return isObject(config) && typeof config.id === "string"
    ? config.id
    : "<invalid>";
}

function configError(
  config: unknown,
  field: string,
  reason: string
): RefundPolicyConfigError {
  return {
    source: "library",
    kind: "invalid-refund-policy",
    policyId: policyIdOf(config),
    field,
    reason,
  };
}

function validateIdentity(config: unknown): RefundPolicyConfigError | null {
  if (!isObject(config))
    return configError(config, "config", "객체여야 합니다.");
  if (
    typeof config.id !== "string" ||
    config.id.length === 0 ||
    config.id.length > 100
  )
    return configError(config, "id", "1자 이상 100자 이하여야 합니다.");
  if (
    typeof config.version !== "string" ||
    config.version.length === 0 ||
    config.version.length > 100
  )
    return configError(config, "version", "1자 이상 100자 이하여야 합니다.");
  if (
    config.quoteTtlMs !== undefined &&
    (typeof config.quoteTtlMs !== "number" ||
      !Number.isSafeInteger(config.quoteTtlMs) ||
      config.quoteTtlMs <= 0)
  ) {
    return configError(
      config,
      "quoteTtlMs",
      "0보다 큰 안전한 정수 밀리초여야 합니다."
    );
  }
  return null;
}

function validRate(rateBps: number): boolean {
  return (
    Number.isSafeInteger(rateBps) &&
    rateBps >= 0 &&
    rateBps <= REFUND_RATE_SCALE
  );
}

function validRounding(value: unknown): value is RefundRoundingMode {
  return value === "floor" || value === "ceil" || value === "half-up";
}

function validOptionalReason(value: unknown): value is string | undefined {
  return value === undefined || typeof value === "string";
}

function validateBuiltInConfig(
  config: BuiltInRefundPolicyConfig
): RefundPolicyConfigError | null {
  const identity = validateIdentity(config);
  if (identity !== null) return identity;
  if (
    config.kind !== "full" &&
    config.kind !== "percentage" &&
    config.kind !== "elapsed-time-rate" &&
    config.kind !== "remaining-units"
  ) {
    return configError(config, "kind", "지원되는 내장 정책 kind여야 합니다.");
  }
  if (config.kind === "full") return null;
  if (!validRounding(config.rounding))
    return configError(
      config,
      "rounding",
      "floor|ceil|half-up 중 하나여야 합니다."
    );
  if (config.kind === "percentage") {
    if (!validRate(config.rateBps))
      return configError(config, "rateBps", "0..10000 안전한 정수여야 합니다.");
    return validOptionalReason(config.reason)
      ? null
      : configError(config, "reason", "문자열이어야 합니다.");
  }
  if (config.kind === "remaining-units") {
    if (config.rateBps !== undefined && !validRate(config.rateBps))
      return configError(config, "rateBps", "0..10000 안전한 정수여야 합니다.");
    return validOptionalReason(config.reason)
      ? null
      : configError(config, "reason", "문자열이어야 합니다.");
  }
  if (!validRate(config.fallbackRateBps))
    return configError(
      config,
      "fallbackRateBps",
      "0..10000 안전한 정수여야 합니다."
    );
  if (!validOptionalReason(config.fallbackReason))
    return configError(config, "fallbackReason", "문자열이어야 합니다.");
  if (!Array.isArray(config.brackets) || config.brackets.length === 0)
    return configError(config, "brackets", "최소 한 구간이 필요합니다.");
  let previous = 0;
  for (let index = 0; index < config.brackets.length; index += 1) {
    const bracket = config.brackets[index];
    if (!isObject(bracket)) {
      return configError(config, `brackets[${index}]`, "객체여야 합니다.");
    }
    const untilMs = bracket.untilMs;
    const rateBps = bracket.rateBps;
    if (
      typeof untilMs !== "number" ||
      !Number.isSafeInteger(untilMs) ||
      untilMs <= previous
    ) {
      return configError(
        config,
        `brackets[${index}].untilMs`,
        "양수 안전한 정수이며 앞 구간보다 커야 합니다."
      );
    }
    if (typeof rateBps !== "number" || !validRate(rateBps)) {
      return configError(
        config,
        `brackets[${index}].rateBps`,
        "0..10000 안전한 정수여야 합니다."
      );
    }
    if (!validOptionalReason(bracket.reason)) {
      return configError(
        config,
        `brackets[${index}].reason`,
        "문자열이어야 합니다."
      );
    }
    previous = untilMs;
  }
  return null;
}

function validateCustomConfig<Context>(
  config: CustomRefundPolicyConfig<Context>
): RefundPolicyConfigError | null {
  const identity = validateIdentity(config);
  if (identity !== null) return identity;
  if (config.kind !== "custom")
    return configError(config, "kind", "custom이어야 합니다.");
  if (!validRounding(config.rounding))
    return configError(
      config,
      "rounding",
      "floor|ceil|half-up 중 하나여야 합니다."
    );
  if (typeof config.calculate !== "function")
    return configError(config, "calculate", "함수여야 합니다.");
  return null;
}

function quoteInputError(
  policyId: string,
  field: string,
  reason: string
): RefundQuoteError {
  return {
    source: "library",
    kind: "invalid-refund-input",
    policyId,
    field,
    reason,
  };
}

function validAmount(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

function validDate(value: Date): boolean {
  return value instanceof Date && Number.isFinite(value.getTime());
}

function isObject(value: unknown): value is Record<PropertyKey, unknown> {
  return typeof value === "object" && value !== null;
}

function validateQuotePayment(
  policyId: string,
  value: unknown
): RefundQuoteError | null {
  if (!isObject(value) || Array.isArray(value)) {
    return quoteInputError(policyId, "payment", "Payment 객체여야 합니다.");
  }
  if (typeof value.paymentKey !== "string") {
    return quoteInputError(
      policyId,
      "payment.paymentKey",
      "문자열이어야 합니다."
    );
  }
  const parsedPaymentKey = paymentKey(value.paymentKey);
  if (!parsedPaymentKey.ok) {
    return quoteInputError(
      policyId,
      "payment.paymentKey",
      parsedPaymentKey.error.reason
    );
  }
  if (typeof value.orderId !== "string") {
    return quoteInputError(policyId, "payment.orderId", "문자열이어야 합니다.");
  }
  const parsedOrderId = orderId(value.orderId);
  if (!parsedOrderId.ok) {
    return quoteInputError(
      policyId,
      "payment.orderId",
      parsedOrderId.error.reason
    );
  }
  if (!validAmount(value.totalAmount as number)) {
    return quoteInputError(
      policyId,
      "payment.totalAmount",
      "0 이상의 안전한 정수여야 합니다."
    );
  }
  if (!validAmount(value.balanceAmount as number)) {
    return quoteInputError(
      policyId,
      "payment.balanceAmount",
      "0 이상의 안전한 정수여야 합니다."
    );
  }
  if (!PAYMENT_STATUSES.includes(value.status as PaymentStatus)) {
    return quoteInputError(
      policyId,
      "payment.status",
      "지원되는 PaymentStatus여야 합니다."
    );
  }
  if (!PAYMENT_METHODS.includes(value.method as Payment["method"])) {
    return quoteInputError(
      policyId,
      "payment.method",
      "지원되는 결제 수단이어야 합니다."
    );
  }
  if (
    value.currency !== "KRW" &&
    value.currency !== "USD" &&
    value.currency !== "JPY"
  ) {
    return quoteInputError(
      policyId,
      "payment.currency",
      "KRW|USD|JPY 중 하나여야 합니다."
    );
  }
  if (
    value.lastTransactionKey !== null &&
    (typeof value.lastTransactionKey !== "string" ||
      value.lastTransactionKey.length === 0)
  ) {
    return quoteInputError(
      policyId,
      "payment.lastTransactionKey",
      "비어 있지 않은 문자열 또는 null이어야 합니다."
    );
  }
  if (typeof value.isPartialCancelable !== "boolean") {
    return quoteInputError(
      policyId,
      "payment.isPartialCancelable",
      "boolean이어야 합니다."
    );
  }
  if (value.cancels !== null && !Array.isArray(value.cancels)) {
    return quoteInputError(
      policyId,
      "payment.cancels",
      "배열 또는 null이어야 합니다."
    );
  }
  const cancels = value.cancels ?? [];
  for (let index = 0; index < cancels.length; index += 1) {
    const cancel = cancels[index];
    const field = `payment.cancels[${index}]`;
    if (!isObject(cancel) || Array.isArray(cancel)) {
      return quoteInputError(policyId, field, "객체여야 합니다.");
    }
    if (
      typeof cancel.transactionKey !== "string" ||
      cancel.transactionKey.length === 0
    ) {
      return quoteInputError(
        policyId,
        `${field}.transactionKey`,
        "비어 있지 않은 문자열이어야 합니다."
      );
    }
    if (
      !Number.isSafeInteger(cancel.cancelAmount) ||
      (cancel.cancelAmount as number) <= 0
    ) {
      return quoteInputError(
        policyId,
        `${field}.cancelAmount`,
        "양의 안전한 정수여야 합니다."
      );
    }
    if (!validAmount(cancel.refundableAmount as number)) {
      return quoteInputError(
        policyId,
        `${field}.refundableAmount`,
        "0 이상의 안전한 정수여야 합니다."
      );
    }
    if (
      typeof cancel.canceledAt !== "string" ||
      !Number.isFinite(Date.parse(cancel.canceledAt))
    ) {
      return quoteInputError(
        policyId,
        `${field}.canceledAt`,
        "유효한 날짜 문자열이어야 합니다."
      );
    }
    if (
      cancel.cancelStatus !== "DONE" &&
      cancel.cancelStatus !== "IN_PROGRESS" &&
      cancel.cancelStatus !== "ABORTED"
    ) {
      return quoteInputError(
        policyId,
        `${field}.cancelStatus`,
        "유효한 취소 상태여야 합니다."
      );
    }
  }
  return null;
}

function validateCommonInput(
  policyId: string,
  input: RefundQuoteInput
): RefundQuoteError | null {
  if (!isObject(input))
    return quoteInputError(policyId, "input", "객체여야 합니다.");
  const invalidPayment = validateQuotePayment(policyId, input.payment);
  if (invalidPayment !== null) return invalidPayment;
  if (!validAmount(input.basisAmount))
    return quoteInputError(
      policyId,
      "basisAmount",
      "0 이상의 안전한 정수여야 합니다."
    );
  if (!validAmount(input.alreadyRefundedAmount))
    return quoteInputError(
      policyId,
      "alreadyRefundedAmount",
      "0 이상의 안전한 정수여야 합니다."
    );
  if (input.alreadyRefundedAmount > input.basisAmount)
    return quoteInputError(
      policyId,
      "alreadyRefundedAmount",
      "basisAmount를 넘을 수 없습니다."
    );
  if (!validAmount(input.expectedBalanceAmount))
    return quoteInputError(
      policyId,
      "expectedBalanceAmount",
      "0 이상의 안전한 정수여야 합니다."
    );
  if (!validDate(input.evaluatedAt))
    return quoteInputError(policyId, "evaluatedAt", "유효한 Date여야 합니다.");
  if (input.validUntil !== undefined) {
    if (!validDate(input.validUntil)) {
      return quoteInputError(policyId, "validUntil", "유효한 Date여야 합니다.");
    }
    if (input.validUntil.getTime() <= input.evaluatedAt.getTime()) {
      return quoteInputError(
        policyId,
        "validUntil",
        "evaluatedAt보다 뒤여야 합니다."
      );
    }
  }
  if (input.expectedBalanceAmount !== input.payment.balanceAmount) {
    return {
      source: "library",
      kind: "expected-refund-balance-mismatch",
      policyId,
      expected: input.expectedBalanceAmount,
      actual: input.payment.balanceAmount,
    };
  }
  return null;
}

/** BigInt로 곱한 뒤 정책이 고른 방식으로 정수 금액을 반올림한다. */
function roundRatio(
  amount: number,
  numerator: bigint,
  denominator: bigint,
  rounding: RefundRoundingMode
): number | null {
  if (denominator <= 0n || numerator < 0n) return null;
  const product = BigInt(amount) * numerator;
  let quotient = product / denominator;
  const remainder = product % denominator;
  if (remainder !== 0n) {
    if (rounding === "ceil") quotient += 1n;
    else if (rounding === "half-up" && remainder * 2n >= denominator)
      quotient += 1n;
  }
  if (quotient > BigInt(Number.MAX_SAFE_INTEGER)) return null;
  return Number(quotient);
}

type InternalEntitlement =
  | {
      readonly kind: "ratio";
      readonly numerator: bigint;
      readonly denominator: bigint;
      readonly rateBps: number;
      readonly calculation: RefundCalculation;
      readonly reason: string | null;
      /** 정책 자체가 바뀌는 다음 exclusive 경계. */
      readonly validUntilMs?: number;
    }
  | {
      readonly kind: "amount";
      readonly amount: number;
      readonly rateBps: number | null;
      readonly calculation: RefundCalculation;
      readonly reason: string | null;
      /** full만 basisAmount 상한을 의도적으로 사용하지 않는다. */
      readonly allowAboveBasis: boolean;
      readonly validUntilMs?: number;
    };

interface InternalQuoteInput extends RefundQuoteInput {
  readonly anchorAt?: Date;
  readonly totalUnits?: number;
  readonly remainingUnits?: number;
}

function evaluateBuiltIn(
  config: BuiltInRefundPolicyConfig,
  input: InternalQuoteInput
): Result<InternalEntitlement, RefundQuoteError> {
  if (config.kind === "full") {
    const amount = input.alreadyRefundedAmount + input.expectedBalanceAmount;
    if (!Number.isSafeInteger(amount)) {
      return err(
        quoteInputError(
          config.id,
          "amount",
          "누적 전액 환불 금액이 안전한 정수를 넘습니다."
        )
      );
    }
    return ok({
      kind: "amount",
      amount,
      rateBps: REFUND_RATE_SCALE,
      calculation: { kind: "full" },
      reason: null,
      allowAboveBasis: true,
    });
  }
  if (config.kind === "percentage") {
    return ok({
      kind: "ratio",
      numerator: BigInt(config.rateBps),
      denominator: BigInt(REFUND_RATE_SCALE),
      rateBps: config.rateBps,
      calculation: { kind: "percentage", rateBps: config.rateBps },
      reason: config.reason ?? null,
    });
  }
  if (config.kind === "elapsed-time-rate") {
    if (input.anchorAt === undefined || !validDate(input.anchorAt)) {
      return err(
        quoteInputError(config.id, "anchorAt", "유효한 Date여야 합니다.")
      );
    }
    const elapsedRaw = input.evaluatedAt.getTime() - input.anchorAt.getTime();
    if (!Number.isSafeInteger(elapsedRaw)) {
      return err(
        quoteInputError(
          config.id,
          "anchorAt",
          "evaluatedAt과의 차이가 안전한 정수 범위여야 합니다."
        )
      );
    }
    const elapsedMs = Math.max(0, elapsedRaw);
    let rateBps = config.fallbackRateBps;
    let reason = config.fallbackReason ?? null;
    let bracketIndex: number | null = null;
    for (let index = 0; index < config.brackets.length; index += 1) {
      const bracket = config.brackets[index];
      if (bracket !== undefined && elapsedMs < bracket.untilMs) {
        rateBps = bracket.rateBps;
        reason = bracket.reason ?? null;
        bracketIndex = index;
        break;
      }
    }
    const selectedBracket =
      bracketIndex === null ? undefined : config.brackets[bracketIndex];
    const validUntilMs =
      selectedBracket === undefined
        ? undefined
        : input.anchorAt.getTime() + selectedBracket.untilMs;
    if (validUntilMs !== undefined && !Number.isSafeInteger(validUntilMs)) {
      return err(
        quoteInputError(
          config.id,
          "anchorAt",
          "다음 정책 경계가 안전한 시각 범위여야 합니다."
        )
      );
    }
    return ok({
      kind: "ratio",
      numerator: BigInt(rateBps),
      denominator: BigInt(REFUND_RATE_SCALE),
      rateBps,
      calculation: {
        kind: "elapsed-time-rate",
        elapsedMs,
        bracketIndex,
        rateBps,
      },
      reason,
      ...(validUntilMs === undefined ? {} : { validUntilMs }),
    });
  }

  const totalUnits = input.totalUnits;
  const remainingUnits = input.remainingUnits;
  if (!Number.isSafeInteger(totalUnits) || (totalUnits ?? 0) <= 0) {
    return err(
      quoteInputError(
        config.id,
        "totalUnits",
        "0보다 큰 안전한 정수여야 합니다."
      )
    );
  }
  if (
    !Number.isSafeInteger(remainingUnits) ||
    (remainingUnits ?? -1) < 0 ||
    (remainingUnits ?? Number.MAX_SAFE_INTEGER) > (totalUnits ?? 0)
  ) {
    return err(
      quoteInputError(
        config.id,
        "remainingUnits",
        "0 이상 totalUnits 이하의 안전한 정수여야 합니다."
      )
    );
  }
  // 위 검증으로 number가 확정되지만 optional 프로퍼티 내로잉 보존을 위해 지역 상수 재확정.
  const total = totalUnits as number;
  const remaining = remainingUnits as number;
  const rateBps = config.rateBps ?? REFUND_RATE_SCALE;
  return ok({
    kind: "ratio",
    numerator: BigInt(remaining) * BigInt(rateBps),
    denominator: BigInt(total) * BigInt(REFUND_RATE_SCALE),
    rateBps,
    calculation: {
      kind: "remaining-units",
      totalUnits: total,
      remainingUnits: remaining,
      rateBps,
    },
    reason: config.reason ?? null,
  });
}

function validDetails(
  value: Readonly<Record<string, RefundCalculationDetail>> | undefined
): boolean {
  if (value === undefined) return true;
  if (!isObject(value) || Array.isArray(value)) return false;
  return Object.values(value).every(
    (item) =>
      item === null ||
      typeof item === "string" ||
      typeof item === "boolean" ||
      (typeof item === "number" && Number.isFinite(item))
  );
}

function evaluateCustom<Context>(
  config: CustomRefundPolicyConfig<Context>,
  input: CustomRefundQuoteInput<Context>
): Result<InternalEntitlement, RefundQuoteError> {
  let result: Result<RefundEntitlement, unknown>;
  try {
    result = config.calculate(input);
  } catch (cause) {
    return err({
      source: "library",
      kind: "custom-refund-calculation-failed",
      policyId: config.id,
      cause,
    });
  }
  if (!isObject(result) || typeof result.ok !== "boolean") {
    return err(
      quoteInputError(
        config.id,
        "calculate",
        "Result<RefundEntitlement, unknown>을 반환해야 합니다."
      )
    );
  }
  if (!result.ok) {
    return err({
      source: "library",
      kind: "custom-refund-calculation-failed",
      policyId: config.id,
      cause: result.error,
    });
  }
  const entitlement = result.value;
  if (
    !isObject(entitlement) ||
    (entitlement.kind !== "rate" && entitlement.kind !== "amount")
  ) {
    return err(
      quoteInputError(
        config.id,
        "calculate",
        "rate 또는 amount entitlement를 반환해야 합니다."
      )
    );
  }
  if (!validDetails(entitlement.details)) {
    return err(
      quoteInputError(
        config.id,
        "calculate.details",
        "값은 string|number|boolean|null만 허용됩니다."
      )
    );
  }
  if (!validOptionalReason(entitlement.reason)) {
    return err(
      quoteInputError(config.id, "calculate.reason", "문자열이어야 합니다.")
    );
  }
  const details = Object.freeze({ ...(entitlement.details ?? {}) });
  if (entitlement.kind === "rate") {
    if (!validRate(entitlement.rateBps)) {
      return err(
        quoteInputError(
          config.id,
          "calculate.rateBps",
          "0..10000 안전한 정수여야 합니다."
        )
      );
    }
    return ok({
      kind: "ratio",
      numerator: BigInt(entitlement.rateBps),
      denominator: BigInt(REFUND_RATE_SCALE),
      rateBps: entitlement.rateBps,
      calculation: { kind: "custom", entitlementKind: "rate", details },
      reason: entitlement.reason ?? null,
    });
  }
  if (!validAmount(entitlement.amount)) {
    return err(
      quoteInputError(
        config.id,
        "calculate.amount",
        "누적 환불 가능 총액은 0 이상의 안전한 정수여야 합니다."
      )
    );
  }
  return ok({
    kind: "amount",
    amount: entitlement.amount,
    rateBps: null,
    calculation: { kind: "custom", entitlementKind: "amount", details },
    reason: entitlement.reason ?? null,
    allowAboveBasis: false,
  });
}

function compareObservedCancel(
  left: RefundObservedCancelState,
  right: RefundObservedCancelState
): number {
  return (
    left.transactionKey.localeCompare(right.transactionKey) ||
    left.canceledAt.localeCompare(right.canceledAt) ||
    left.cancelStatus.localeCompare(right.cancelStatus) ||
    left.cancelAmount - right.cancelAmount ||
    left.refundableAmount - right.refundableAmount
  );
}

/** 민감한 취소 사유·환불계좌 없이 quote 결속에 필요한 Payment 관측값을 만든다. */
export function observeRefundPaymentState(
  payment: Payment
): RefundObservedPaymentState {
  const cancels = (payment.cancels ?? [])
    .map((cancel) =>
      Object.freeze({
        transactionKey: cancel.transactionKey,
        cancelAmount: cancel.cancelAmount,
        refundableAmount: cancel.refundableAmount,
        canceledAt: cancel.canceledAt,
        cancelStatus: cancel.cancelStatus,
      })
    )
    .sort(compareObservedCancel);
  return Object.freeze({
    status: payment.status,
    method: payment.method,
    lastTransactionKey: payment.lastTransactionKey,
    isPartialCancelable: payment.isPartialCancelable,
    cancels: Object.freeze(cancels),
  });
}

function sameObservedCancel(
  left: RefundObservedCancelState,
  right: RefundObservedCancelState
): boolean {
  return (
    left.transactionKey === right.transactionKey &&
    left.cancelAmount === right.cancelAmount &&
    left.refundableAmount === right.refundableAmount &&
    left.canceledAt === right.canceledAt &&
    left.cancelStatus === right.cancelStatus
  );
}

/** 실행 직전 재조회 Payment가 quote 생성 시점과 같은 상태인지 확인한다. */
export function matchesRefundObservedPaymentState(
  observed: RefundObservedPaymentState,
  payment: Payment
): boolean {
  const current = observeRefundPaymentState(payment);
  return (
    observed.status === current.status &&
    observed.method === current.method &&
    observed.lastTransactionKey === current.lastTransactionKey &&
    observed.isPartialCancelable === current.isPartialCancelable &&
    observed.cancels.length === current.cancels.length &&
    observed.cancels.every((cancel, index) => {
      const next = current.cancels[index];
      return next !== undefined && sameObservedCancel(cancel, next);
    })
  );
}

function buildQuote(
  config: RefundPolicyIdentity & {
    readonly kind: RefundPolicyKind;
    readonly rounding?: RefundRoundingMode;
  },
  input: RefundQuoteInput,
  entitlement: InternalEntitlement
): Result<RefundQuote, RefundQuoteError> {
  const rounding = config.rounding ?? "floor";
  const ttlMs = config.quoteTtlMs ?? DEFAULT_REFUND_QUOTE_TTL_MS;
  const ttlBoundary = input.evaluatedAt.getTime() + ttlMs;
  const validUntilMs = Math.min(
    ttlBoundary,
    input.validUntil?.getTime() ?? Number.POSITIVE_INFINITY,
    entitlement.validUntilMs ?? Number.POSITIVE_INFINITY
  );
  const validUntil = new Date(validUntilMs);
  if (
    !Number.isSafeInteger(ttlBoundary) ||
    !Number.isSafeInteger(validUntilMs) ||
    !validDate(validUntil) ||
    validUntilMs <= input.evaluatedAt.getTime()
  ) {
    return err(
      quoteInputError(
        config.id,
        "validUntil",
        "계산된 quote 만료 시각이 유효하지 않습니다."
      )
    );
  }
  const entitlementAmount =
    entitlement.kind === "ratio"
      ? roundRatio(
          input.basisAmount,
          entitlement.numerator,
          entitlement.denominator,
          rounding
        )
      : entitlement.amount;
  if (entitlementAmount === null || !validAmount(entitlementAmount)) {
    return err(
      quoteInputError(
        config.id,
        "entitlementAmount",
        "계산 결과가 안전한 정수 금액이 아닙니다."
      )
    );
  }
  if (
    entitlement.kind === "amount" &&
    !entitlement.allowAboveBasis &&
    entitlementAmount > input.basisAmount
  ) {
    return err(
      quoteInputError(
        config.id,
        "entitlementAmount",
        "basisAmount를 넘을 수 없습니다."
      )
    );
  }

  const rawDue = Math.max(0, entitlementAmount - input.alreadyRefundedAmount);
  if (rawDue > input.expectedBalanceAmount) {
    return err({
      source: "library",
      kind: "calculated-refund-exceeds-balance",
      policyId: config.id,
      calculatedAmount: rawDue,
      balanceAmount: input.expectedBalanceAmount,
    });
  }
  const kind: RefundQuote["kind"] =
    rawDue === 0
      ? "none"
      : rawDue === input.expectedBalanceAmount
      ? "full"
      : "partial";
  const policy = Object.freeze({
    id: config.id,
    version: config.version,
    kind: config.kind,
  });
  const quote = {
    kind,
    policy,
    paymentKey: input.payment.paymentKey,
    orderId: input.payment.orderId,
    currency: input.payment.currency,
    evaluatedAt: input.evaluatedAt.toISOString(),
    validUntil: validUntil.toISOString(),
    observedPaymentState: observeRefundPaymentState(input.payment),
    observedBalanceAmount: input.payment.balanceAmount,
    expectedBalanceAmount: input.expectedBalanceAmount,
    basisAmount: input.basisAmount,
    alreadyRefundedAmount: input.alreadyRefundedAmount,
    entitlementAmount,
    amount: rawDue,
    balanceAfterRefund: input.expectedBalanceAmount - rawDue,
    overRefundedAmount: Math.max(
      0,
      input.alreadyRefundedAmount - entitlementAmount
    ),
    rateBps: entitlement.rateBps,
    rounding,
    calculation: Object.freeze(entitlement.calculation),
    reason: entitlement.reason,
  };
  Object.defineProperty(quote, refundQuoteSeal, {
    value: true,
    enumerable: false,
  });
  return ok(Object.freeze(quote) as RefundQuote);
}

function quoteParseError(field: string, reason: string): RefundQuoteParseError {
  return { source: "library", kind: "invalid-refund-quote", field, reason };
}

const PAYMENT_STATUSES: readonly PaymentStatus[] = [
  "READY",
  "IN_PROGRESS",
  "WAITING_FOR_DEPOSIT",
  "DONE",
  "CANCELED",
  "PARTIAL_CANCELED",
  "ABORTED",
  "EXPIRED",
];
const PAYMENT_METHODS: readonly Payment["method"][] = [
  null,
  "카드",
  "가상계좌",
  "간편결제",
  "계좌이체",
  "휴대폰",
  "문화상품권",
  "도서문화상품권",
  "게임문화상품권",
];
const POLICY_KINDS: readonly RefundPolicyKind[] = [
  "full",
  "percentage",
  "elapsed-time-rate",
  "remaining-units",
  "custom",
];

function parseObservedPaymentState(
  input: unknown
): Result<RefundObservedPaymentState, RefundQuoteParseError> {
  if (!isObject(input) || Array.isArray(input)) {
    return err(quoteParseError("observedPaymentState", "객체여야 합니다."));
  }
  if (!PAYMENT_STATUSES.includes(input.status as PaymentStatus)) {
    return err(
      quoteParseError(
        "observedPaymentState.status",
        "지원되는 PaymentStatus여야 합니다."
      )
    );
  }
  if (!PAYMENT_METHODS.includes(input.method as Payment["method"])) {
    return err(
      quoteParseError(
        "observedPaymentState.method",
        "지원되는 결제 수단이어야 합니다."
      )
    );
  }
  if (
    input.lastTransactionKey !== null &&
    typeof input.lastTransactionKey !== "string"
  ) {
    return err(
      quoteParseError(
        "observedPaymentState.lastTransactionKey",
        "문자열 또는 null이어야 합니다."
      )
    );
  }
  if (typeof input.isPartialCancelable !== "boolean") {
    return err(
      quoteParseError(
        "observedPaymentState.isPartialCancelable",
        "boolean이어야 합니다."
      )
    );
  }
  if (!Array.isArray(input.cancels)) {
    return err(
      quoteParseError("observedPaymentState.cancels", "배열이어야 합니다.")
    );
  }
  const cancels: RefundObservedCancelState[] = [];
  for (let index = 0; index < input.cancels.length; index += 1) {
    const value = input.cancels[index];
    const field = `observedPaymentState.cancels[${index}]`;
    if (!isObject(value) || Array.isArray(value)) {
      return err(quoteParseError(field, "객체여야 합니다."));
    }
    if (
      typeof value.transactionKey !== "string" ||
      value.transactionKey.length === 0
    ) {
      return err(
        quoteParseError(
          `${field}.transactionKey`,
          "비어 있지 않은 문자열이어야 합니다."
        )
      );
    }
    if (
      !Number.isSafeInteger(value.cancelAmount) ||
      (value.cancelAmount as number) <= 0
    ) {
      return err(
        quoteParseError(`${field}.cancelAmount`, "양의 안전한 정수여야 합니다.")
      );
    }
    if (!validAmount(value.refundableAmount as number)) {
      return err(
        quoteParseError(
          `${field}.refundableAmount`,
          "0 이상의 안전한 정수여야 합니다."
        )
      );
    }
    if (
      typeof value.canceledAt !== "string" ||
      !Number.isFinite(Date.parse(value.canceledAt))
    ) {
      return err(
        quoteParseError(
          `${field}.canceledAt`,
          "유효한 ISO 날짜 문자열이어야 합니다."
        )
      );
    }
    if (
      value.cancelStatus !== "DONE" &&
      value.cancelStatus !== "IN_PROGRESS" &&
      value.cancelStatus !== "ABORTED"
    ) {
      return err(
        quoteParseError(`${field}.cancelStatus`, "유효한 취소 상태여야 합니다.")
      );
    }
    cancels.push(
      Object.freeze({
        transactionKey: value.transactionKey,
        cancelAmount: value.cancelAmount as number,
        refundableAmount: value.refundableAmount as number,
        canceledAt: value.canceledAt,
        cancelStatus: value.cancelStatus,
      })
    );
  }
  cancels.sort(compareObservedCancel);
  return ok(
    Object.freeze({
      status: input.status as PaymentStatus,
      method: input.method as Payment["method"],
      lastTransactionKey: input.lastTransactionKey as string | null,
      isPartialCancelable: input.isPartialCancelable,
      cancels: Object.freeze(cancels),
    })
  );
}

function parseCalculation(
  input: unknown,
  policyKind: RefundPolicyKind
): Result<RefundCalculation, RefundQuoteParseError> {
  if (
    !isObject(input) ||
    Array.isArray(input) ||
    typeof input.kind !== "string"
  ) {
    return err(quoteParseError("calculation", "유효한 계산 객체여야 합니다."));
  }
  if (policyKind !== "custom" && input.kind !== policyKind) {
    return err(
      quoteParseError("calculation.kind", "policy.kind와 일치해야 합니다.")
    );
  }
  if (policyKind === "full" && input.kind === "full")
    return ok(Object.freeze({ kind: "full" }));
  if (policyKind === "percentage" && input.kind === "percentage") {
    if (!validRate(input.rateBps as number)) {
      return err(
        quoteParseError(
          "calculation.rateBps",
          "0..10000 안전한 정수여야 합니다."
        )
      );
    }
    return ok(
      Object.freeze({ kind: "percentage", rateBps: input.rateBps as number })
    );
  }
  if (
    policyKind === "elapsed-time-rate" &&
    input.kind === "elapsed-time-rate"
  ) {
    if (!validAmount(input.elapsedMs as number)) {
      return err(
        quoteParseError(
          "calculation.elapsedMs",
          "0 이상의 안전한 정수여야 합니다."
        )
      );
    }
    if (
      input.bracketIndex !== null &&
      (!Number.isSafeInteger(input.bracketIndex) ||
        (input.bracketIndex as number) < 0)
    ) {
      return err(
        quoteParseError(
          "calculation.bracketIndex",
          "0 이상의 정수 또는 null이어야 합니다."
        )
      );
    }
    if (!validRate(input.rateBps as number)) {
      return err(
        quoteParseError(
          "calculation.rateBps",
          "0..10000 안전한 정수여야 합니다."
        )
      );
    }
    return ok(
      Object.freeze({
        kind: "elapsed-time-rate",
        elapsedMs: input.elapsedMs as number,
        bracketIndex: input.bracketIndex as number | null,
        rateBps: input.rateBps as number,
      })
    );
  }
  if (policyKind === "remaining-units" && input.kind === "remaining-units") {
    if (
      !Number.isSafeInteger(input.totalUnits) ||
      (input.totalUnits as number) <= 0
    ) {
      return err(
        quoteParseError(
          "calculation.totalUnits",
          "양의 안전한 정수여야 합니다."
        )
      );
    }
    if (
      !validAmount(input.remainingUnits as number) ||
      (input.remainingUnits as number) > (input.totalUnits as number)
    ) {
      return err(
        quoteParseError(
          "calculation.remainingUnits",
          "0..totalUnits 정수여야 합니다."
        )
      );
    }
    if (!validRate(input.rateBps as number)) {
      return err(
        quoteParseError(
          "calculation.rateBps",
          "0..10000 안전한 정수여야 합니다."
        )
      );
    }
    return ok(
      Object.freeze({
        kind: "remaining-units",
        totalUnits: input.totalUnits as number,
        remainingUnits: input.remainingUnits as number,
        rateBps: input.rateBps as number,
      })
    );
  }
  if (policyKind === "custom" && input.kind === "custom") {
    if (
      input.entitlementKind !== "rate" &&
      input.entitlementKind !== "amount"
    ) {
      return err(
        quoteParseError(
          "calculation.entitlementKind",
          "rate|amount여야 합니다."
        )
      );
    }
    if (
      !validDetails(
        input.details as Readonly<Record<string, RefundCalculationDetail>>
      )
    ) {
      return err(
        quoteParseError(
          "calculation.details",
          "직렬화 가능한 scalar 객체여야 합니다."
        )
      );
    }
    return ok(
      Object.freeze({
        kind: "custom",
        entitlementKind: input.entitlementKind,
        details: Object.freeze({
          ...(input.details as Record<string, RefundCalculationDetail>),
        }),
      })
    );
  }
  return err(
    quoteParseError("calculation.kind", "policy.kind에 맞는 계산이어야 합니다.")
  );
}

/**
 * DB/메시지의 JSON quote를 구조·공통 산술 기준으로 파싱한다.
 * 반환값은 실행할 수 없다. 반드시 활성 policy.restoreQuote(stored, input)로 재계산해야 한다.
 */
export function parseRefundQuote(
  input: unknown
): Result<ParsedRefundQuote, RefundQuoteParseError> {
  if (!isObject(input) || Array.isArray(input)) {
    return err(quoteParseError("quote", "객체여야 합니다."));
  }
  if (
    input.kind !== "none" &&
    input.kind !== "full" &&
    input.kind !== "partial"
  ) {
    return err(
      quoteParseError("kind", "none|full|partial 중 하나여야 합니다.")
    );
  }
  if (!isObject(input.policy) || Array.isArray(input.policy)) {
    return err(quoteParseError("policy", "객체여야 합니다."));
  }
  if (
    typeof input.policy.id !== "string" ||
    input.policy.id.length === 0 ||
    input.policy.id.length > 100
  ) {
    return err(quoteParseError("policy.id", "1자 이상 100자 이하여야 합니다."));
  }
  if (
    typeof input.policy.version !== "string" ||
    input.policy.version.length === 0 ||
    input.policy.version.length > 100
  ) {
    return err(
      quoteParseError("policy.version", "1자 이상 100자 이하여야 합니다.")
    );
  }
  if (!POLICY_KINDS.includes(input.policy.kind as RefundPolicyKind)) {
    return err(
      quoteParseError("policy.kind", "지원되는 환불 정책 kind여야 합니다.")
    );
  }
  if (typeof input.paymentKey !== "string") {
    return err(quoteParseError("paymentKey", "문자열이어야 합니다."));
  }
  const parsedPaymentKey = paymentKey(input.paymentKey);
  if (!parsedPaymentKey.ok)
    return err(quoteParseError("paymentKey", parsedPaymentKey.error.reason));
  if (typeof input.orderId !== "string") {
    return err(quoteParseError("orderId", "문자열이어야 합니다."));
  }
  const parsedOrderId = orderId(input.orderId);
  if (!parsedOrderId.ok)
    return err(quoteParseError("orderId", parsedOrderId.error.reason));
  if (
    input.currency !== "KRW" &&
    input.currency !== "USD" &&
    input.currency !== "JPY"
  ) {
    return err(quoteParseError("currency", "KRW|USD|JPY 중 하나여야 합니다."));
  }
  if (
    typeof input.evaluatedAt !== "string" ||
    !Number.isFinite(Date.parse(input.evaluatedAt))
  ) {
    return err(
      quoteParseError("evaluatedAt", "유효한 ISO 날짜 문자열이어야 합니다.")
    );
  }
  if (
    typeof input.validUntil !== "string" ||
    !Number.isFinite(Date.parse(input.validUntil))
  ) {
    return err(
      quoteParseError("validUntil", "유효한 ISO 날짜 문자열이어야 합니다.")
    );
  }
  const evaluatedAtMs = Date.parse(input.evaluatedAt);
  const validUntilMs = Date.parse(input.validUntil);
  if (validUntilMs <= evaluatedAtMs) {
    return err(quoteParseError("validUntil", "evaluatedAt보다 뒤여야 합니다."));
  }
  const observed = parseObservedPaymentState(input.observedPaymentState);
  if (!observed.ok) return observed;

  const amountFields = [
    "observedBalanceAmount",
    "expectedBalanceAmount",
    "basisAmount",
    "alreadyRefundedAmount",
    "entitlementAmount",
    "amount",
    "balanceAfterRefund",
    "overRefundedAmount",
  ] as const;
  for (const field of amountFields) {
    if (!validAmount(input[field] as number)) {
      return err(quoteParseError(field, "0 이상의 안전한 정수여야 합니다."));
    }
  }
  if ((input.alreadyRefundedAmount as number) > (input.basisAmount as number)) {
    return err(
      quoteParseError(
        "alreadyRefundedAmount",
        "basisAmount를 넘을 수 없습니다."
      )
    );
  }
  if (input.observedBalanceAmount !== input.expectedBalanceAmount) {
    return err(
      quoteParseError(
        "expectedBalanceAmount",
        "observedBalanceAmount와 같아야 합니다."
      )
    );
  }
  if (
    input.amount !==
    Math.max(
      0,
      (input.entitlementAmount as number) -
        (input.alreadyRefundedAmount as number)
    )
  ) {
    return err(
      quoteParseError(
        "amount",
        "entitlementAmount에서 기존 환불액을 뺀 값이어야 합니다."
      )
    );
  }
  if ((input.amount as number) > (input.expectedBalanceAmount as number)) {
    return err(quoteParseError("amount", "현재 잔액을 넘을 수 없습니다."));
  }
  if (
    input.balanceAfterRefund !==
    (input.expectedBalanceAmount as number) - (input.amount as number)
  ) {
    return err(
      quoteParseError(
        "balanceAfterRefund",
        "현재 잔액에서 amount를 뺀 값이어야 합니다."
      )
    );
  }
  if (
    input.overRefundedAmount !==
    Math.max(
      0,
      (input.alreadyRefundedAmount as number) -
        (input.entitlementAmount as number)
    )
  ) {
    return err(
      quoteParseError(
        "overRefundedAmount",
        "entitlement 대비 초과 환불액과 일치해야 합니다."
      )
    );
  }
  const expectedKind: RefundQuote["kind"] =
    input.amount === 0
      ? "none"
      : input.amount === input.expectedBalanceAmount
      ? "full"
      : "partial";
  if (input.kind !== expectedKind) {
    return err(
      quoteParseError(
        "kind",
        "amount와 expectedBalanceAmount의 관계와 일치해야 합니다."
      )
    );
  }
  if (!validRounding(input.rounding)) {
    return err(
      quoteParseError("rounding", "floor|ceil|half-up 중 하나여야 합니다.")
    );
  }
  if (input.rateBps !== null && !validRate(input.rateBps as number)) {
    return err(
      quoteParseError("rateBps", "0..10000 안전한 정수 또는 null이어야 합니다.")
    );
  }
  if (input.reason !== null && typeof input.reason !== "string") {
    return err(quoteParseError("reason", "문자열 또는 null이어야 합니다."));
  }

  const policyKind = input.policy.kind as RefundPolicyKind;
  const calculation = parseCalculation(input.calculation, policyKind);
  if (!calculation.ok) return calculation;
  let expectedEntitlement: number | null = null;
  if (calculation.value.kind === "full") {
    if (input.rateBps !== REFUND_RATE_SCALE) {
      return err(quoteParseError("rateBps", "full 정책은 10000이어야 합니다."));
    }
    expectedEntitlement =
      (input.alreadyRefundedAmount as number) +
      (input.expectedBalanceAmount as number);
  } else if (calculation.value.kind === "percentage") {
    if (input.rateBps !== calculation.value.rateBps) {
      return err(
        quoteParseError("rateBps", "calculation.rateBps와 같아야 합니다.")
      );
    }
    expectedEntitlement = roundRatio(
      input.basisAmount as number,
      BigInt(calculation.value.rateBps),
      BigInt(REFUND_RATE_SCALE),
      input.rounding
    );
  } else if (calculation.value.kind === "elapsed-time-rate") {
    if (input.rateBps !== calculation.value.rateBps) {
      return err(
        quoteParseError("rateBps", "calculation.rateBps와 같아야 합니다.")
      );
    }
    expectedEntitlement = roundRatio(
      input.basisAmount as number,
      BigInt(calculation.value.rateBps),
      BigInt(REFUND_RATE_SCALE),
      input.rounding
    );
  } else if (calculation.value.kind === "remaining-units") {
    if (input.rateBps !== calculation.value.rateBps) {
      return err(
        quoteParseError("rateBps", "calculation.rateBps와 같아야 합니다.")
      );
    }
    expectedEntitlement = roundRatio(
      input.basisAmount as number,
      BigInt(calculation.value.remainingUnits) *
        BigInt(calculation.value.rateBps),
      BigInt(calculation.value.totalUnits) * BigInt(REFUND_RATE_SCALE),
      input.rounding
    );
  } else if (calculation.value.entitlementKind === "rate") {
    if (input.rateBps === null) {
      return err(
        quoteParseError("rateBps", "custom rate 계산에는 비율이 필요합니다.")
      );
    }
    expectedEntitlement = roundRatio(
      input.basisAmount as number,
      BigInt(input.rateBps as number),
      BigInt(REFUND_RATE_SCALE),
      input.rounding
    );
  } else {
    if (input.rateBps !== null) {
      return err(
        quoteParseError("rateBps", "custom amount 계산은 null이어야 합니다.")
      );
    }
    if ((input.entitlementAmount as number) > (input.basisAmount as number)) {
      return err(
        quoteParseError(
          "entitlementAmount",
          "custom amount는 basisAmount를 넘을 수 없습니다."
        )
      );
    }
  }
  if (
    expectedEntitlement !== null &&
    input.entitlementAmount !== expectedEntitlement
  ) {
    return err(
      quoteParseError(
        "entitlementAmount",
        "저장된 정책 계산과 일치하지 않습니다."
      )
    );
  }

  const policy = Object.freeze({
    id: input.policy.id,
    version: input.policy.version,
    kind: policyKind,
  });
  const quote = {
    kind: input.kind,
    policy,
    paymentKey: parsedPaymentKey.value,
    orderId: parsedOrderId.value,
    currency: input.currency,
    evaluatedAt: new Date(evaluatedAtMs).toISOString(),
    validUntil: new Date(validUntilMs).toISOString(),
    observedPaymentState: observed.value,
    observedBalanceAmount: input.observedBalanceAmount as number,
    expectedBalanceAmount: input.expectedBalanceAmount as number,
    basisAmount: input.basisAmount as number,
    alreadyRefundedAmount: input.alreadyRefundedAmount as number,
    entitlementAmount: input.entitlementAmount as number,
    amount: input.amount as number,
    balanceAfterRefund: input.balanceAfterRefund as number,
    overRefundedAmount: input.overRefundedAmount as number,
    rateBps: input.rateBps as number | null,
    rounding: input.rounding,
    calculation: calculation.value,
    reason: input.reason as string | null,
  };
  return ok(Object.freeze(quote) as ParsedRefundQuote);
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(",")}]`;
  }
  if (isObject(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function restoreQuoteWith<Input extends RefundQuoteInput>(
  policyId: string,
  stored: unknown,
  input: Input,
  quote: (input: Input) => Result<RefundQuote, RefundQuoteError>
): Result<RefundQuote, RefundQuoteRestoreError> {
  const parsed = parseRefundQuote(stored);
  if (!parsed.ok) return parsed;
  const recalculated = quote(input);
  if (!recalculated.ok) return recalculated;
  if (stableJson(parsed.value) !== stableJson(recalculated.value)) {
    return err({
      source: "library",
      kind: "refund-quote-policy-mismatch",
      policyId,
      reason: "stored-quote-does-not-match-recalculation",
    });
  }
  return recalculated;
}

/** 내장 정책 생성. 설정 오류는 부팅 시 orThrow로 처리할 수 있도록 Result로 반환한다. */
export function createRefundPolicy<
  const Config extends BuiltInRefundPolicyConfig
>(
  config: Config
): Result<RefundPolicy<QuoteInputFor<Config>>, RefundPolicyConfigError> {
  const invalid = validateBuiltInConfig(config);
  if (invalid !== null) return err(invalid);
  // 호출자가 config/배열을 나중에 변경해 같은 정책 버전의 계산이 달라지지 않도록 스냅샷한다.
  const stableConfig = Object.freeze(
    config.kind === "elapsed-time-rate"
      ? {
          ...config,
          brackets: Object.freeze(
            config.brackets.map((bracket) => Object.freeze({ ...bracket }))
          ),
        }
      : { ...config }
  ) as unknown as Config;
  const quote = (
    input: QuoteInputFor<Config>
  ): Result<RefundQuote, RefundQuoteError> => {
    try {
      const common = validateCommonInput(stableConfig.id, input);
      if (common !== null) return err(common);
      const evaluated = evaluateBuiltIn(
        stableConfig,
        input as InternalQuoteInput
      );
      return evaluated.ok
        ? buildQuote(stableConfig, input, evaluated.value)
        : evaluated;
    } catch {
      return err(
        quoteInputError(
          stableConfig.id,
          "input",
          "견적 입력을 안전하게 읽을 수 없습니다."
        )
      );
    }
  };
  const policy = {
    id: stableConfig.id,
    version: stableConfig.version,
    kind: stableConfig.kind,
    quote,
    restoreQuote(stored: unknown, input: QuoteInputFor<Config>) {
      return restoreQuoteWith(stableConfig.id, stored, input, quote);
    },
  };
  return ok(Object.freeze(policy) as RefundPolicy<QuoteInputFor<Config>>);
}

/** 프로젝트 고유 규칙을 같은 검증·반올림·quote 계약에 연결하는 escape hatch. */
export function createCustomRefundPolicy<Context>(
  config: CustomRefundPolicyConfig<Context>
): Result<
  RefundPolicy<CustomRefundQuoteInput<Context>>,
  RefundPolicyConfigError
> {
  const invalid = validateCustomConfig(config);
  if (invalid !== null) return err(invalid);
  const stableConfig = Object.freeze({ ...config });
  const quote = (
    input: CustomRefundQuoteInput<Context>
  ): Result<RefundQuote, RefundQuoteError> => {
    try {
      const common = validateCommonInput(stableConfig.id, input);
      if (common !== null) return err(common);
      const evaluated = evaluateCustom(stableConfig, input);
      return evaluated.ok
        ? buildQuote(stableConfig, input, evaluated.value)
        : evaluated;
    } catch {
      return err(
        quoteInputError(
          stableConfig.id,
          "input",
          "견적 입력을 안전하게 읽을 수 없습니다."
        )
      );
    }
  };
  const policy = {
    id: stableConfig.id,
    version: stableConfig.version,
    kind: stableConfig.kind,
    quote,
    restoreQuote(stored: unknown, input: CustomRefundQuoteInput<Context>) {
      return restoreQuoteWith(stableConfig.id, stored, input, quote);
    },
  };
  return ok(
    Object.freeze(policy) as RefundPolicy<CustomRefundQuoteInput<Context>>
  );
}

export interface RemainingCalendarDaysInput {
  /** YYYY-MM-DD, 서비스 시작일 포함. */
  readonly startsOn: string;
  /** YYYY-MM-DD, 서비스 종료일 미포함 — 기간은 [startsOn, endsOnExclusive). */
  readonly endsOnExclusive: string;
  readonly evaluatedAt: Date;
  /** IANA time zone (예: Asia/Seoul). */
  readonly timeZone: string;
  /** 요청 당일을 환불 대상에 포함할지 명시한다. */
  readonly requestDay: "refundable" | "consumed";
}

export interface RemainingCalendarDays {
  readonly startsOn: string;
  readonly endsOnExclusive: string;
  readonly evaluatedOn: string;
  readonly timeZone: string;
  readonly requestDay: "refundable" | "consumed";
  /** 다음 현지 달력 날짜가 시작되는 exclusive 재평가 시각(ISO instant). */
  readonly validUntil: string;
  readonly totalUnits: number;
  readonly remainingUnits: number;
}

export type RefundCalendarError = {
  readonly source: "library";
  readonly kind: "invalid-refund-calendar";
  readonly field: string;
  readonly reason: string;
};

interface CivilDate {
  readonly year: number;
  readonly month: number;
  readonly day: number;
  readonly text: string;
}

function leapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function parseCivilDate(raw: string): CivilDate | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (match === null) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1 || month < 1 || month > 12 || day < 1) return null;
  const days = [
    31,
    leapYear(year) ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ];
  if (day > (days[month - 1] ?? 0)) return null;
  return { year, month, day, text: raw };
}

/** Gregorian civil date를 단조 증가 정수로 변환한다(Date.UTC의 0..99년 보정 함정 회피). */
function civilDayNumber(date: CivilDate): number {
  const adjustedYear = date.year - (date.month <= 2 ? 1 : 0);
  const era = Math.floor(adjustedYear / 400);
  const yearOfEra = adjustedYear - era * 400;
  const adjustedMonth = date.month + (date.month > 2 ? -3 : 9);
  const dayOfYear = Math.floor((153 * adjustedMonth + 2) / 5) + date.day - 1;
  const dayOfEra =
    yearOfEra * 365 +
    Math.floor(yearOfEra / 4) -
    Math.floor(yearOfEra / 100) +
    dayOfYear;
  return era * 146_097 + dayOfEra;
}

function nextCivilDate(date: CivilDate): CivilDate | null {
  const days = [
    31,
    leapYear(date.year) ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ];
  const maxDay = days[date.month - 1] ?? 0;
  if (date.day < maxDay) {
    return parseCivilDate(
      `${String(date.year).padStart(4, "0")}-${String(date.month).padStart(
        2,
        "0"
      )}-${String(date.day + 1).padStart(2, "0")}`
    );
  }
  if (date.month < 12) {
    return parseCivilDate(
      `${String(date.year).padStart(4, "0")}-${String(date.month + 1).padStart(
        2,
        "0"
      )}-01`
    );
  }
  if (date.year >= 9_999) return null;
  return parseCivilDate(`${String(date.year + 1).padStart(4, "0")}-01-01`);
}

function localCivilDate(at: Date, timeZone: string): CivilDate | null {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      calendar: "gregory",
      numberingSystem: "latn",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(at);
    const value = (type: "year" | "month" | "day"): string | undefined =>
      parts.find((part) => part.type === type)?.value;
    const year = Number(value("year"));
    const month = Number(value("month"));
    const day = Number(value("day"));
    const text = `${String(year).padStart(4, "0")}-${String(month).padStart(
      2,
      "0"
    )}-${String(day).padStart(2, "0")}`;
    return parseCivilDate(text);
  } catch {
    return null;
  }
}

/** target 현지 날짜가 시작되는 첫 instant를 이분 탐색한다(DST·자정 offset 변경 대응). */
function firstInstantOfCivilDate(
  target: CivilDate,
  timeZone: string
): number | null {
  const nominal = new Date(0);
  nominal.setUTCFullYear(target.year, target.month - 1, target.day);
  nominal.setUTCHours(0, 0, 0, 0);
  let low = nominal.getTime() - 36 * REFUND_TIME.hour;
  let high = nominal.getTime() + 36 * REFUND_TIME.hour;
  const targetDay = civilDayNumber(target);
  const localDayAt = (timestamp: number): number | null => {
    const local = localCivilDate(new Date(timestamp), timeZone);
    return local === null ? null : civilDayNumber(local);
  };
  const lowDay = localDayAt(low);
  const highDay = localDayAt(high);
  if (
    lowDay === null ||
    highDay === null ||
    lowDay >= targetDay ||
    highDay < targetDay
  ) {
    return null;
  }
  while (high - low > 1) {
    const middle = Math.floor((low + high) / 2);
    const middleDay = localDayAt(middle);
    if (middleDay === null) return null;
    if (middleDay >= targetDay) high = middle;
    else low = middle;
  }
  return high;
}

/**
 * IANA 시간대의 달력 일수로 totalUnits/remainingUnits를 만든다.
 * 반환값은 remaining-units 정책 quote 입력에 그대로 펼칠 수 있다.
 */
export function remainingCalendarDays(
  input: RemainingCalendarDaysInput
): Result<RemainingCalendarDays, RefundCalendarError> {
  if (!isObject(input)) {
    return err({
      source: "library",
      kind: "invalid-refund-calendar",
      field: "input",
      reason: "객체여야 합니다.",
    });
  }
  const starts =
    typeof input.startsOn === "string" ? parseCivilDate(input.startsOn) : null;
  if (starts === null) {
    return err({
      source: "library",
      kind: "invalid-refund-calendar",
      field: "startsOn",
      reason: "유효한 YYYY-MM-DD여야 합니다.",
    });
  }
  const ends =
    typeof input.endsOnExclusive === "string"
      ? parseCivilDate(input.endsOnExclusive)
      : null;
  if (ends === null) {
    return err({
      source: "library",
      kind: "invalid-refund-calendar",
      field: "endsOnExclusive",
      reason: "유효한 YYYY-MM-DD여야 합니다.",
    });
  }
  if (!validDate(input.evaluatedAt)) {
    return err({
      source: "library",
      kind: "invalid-refund-calendar",
      field: "evaluatedAt",
      reason: "유효한 Date여야 합니다.",
    });
  }
  if (input.requestDay !== "refundable" && input.requestDay !== "consumed") {
    return err({
      source: "library",
      kind: "invalid-refund-calendar",
      field: "requestDay",
      reason: "refundable|consumed 중 하나여야 합니다.",
    });
  }
  const evaluated =
    typeof input.timeZone === "string"
      ? localCivilDate(input.evaluatedAt, input.timeZone)
      : null;
  if (evaluated === null) {
    return err({
      source: "library",
      kind: "invalid-refund-calendar",
      field: "timeZone",
      reason: "지원되는 IANA time zone이어야 합니다.",
    });
  }
  const nextEvaluated = nextCivilDate(evaluated);
  const validUntilMs =
    nextEvaluated === null
      ? null
      : firstInstantOfCivilDate(nextEvaluated, input.timeZone);
  if (validUntilMs === null || validUntilMs <= input.evaluatedAt.getTime()) {
    return err({
      source: "library",
      kind: "invalid-refund-calendar",
      field: "evaluatedAt",
      reason: "다음 현지 달력 경계를 계산할 수 없습니다.",
    });
  }
  const startDay = civilDayNumber(starts);
  const endDay = civilDayNumber(ends);
  if (endDay <= startDay) {
    return err({
      source: "library",
      kind: "invalid-refund-calendar",
      field: "endsOnExclusive",
      reason: "startsOn보다 뒤여야 합니다.",
    });
  }
  const evaluatedDay = civilDayNumber(evaluated);
  const totalUnits = endDay - startDay;
  let remainingUnits: number;
  if (evaluatedDay < startDay) remainingUnits = totalUnits;
  else if (evaluatedDay >= endDay) remainingUnits = 0;
  else {
    const firstRemaining =
      input.requestDay === "refundable" ? evaluatedDay : evaluatedDay + 1;
    remainingUnits = Math.max(0, endDay - Math.max(startDay, firstRemaining));
  }
  return ok(
    Object.freeze({
      startsOn: starts.text,
      endsOnExclusive: ends.text,
      evaluatedOn: evaluated.text,
      timeZone: input.timeZone,
      requestDay: input.requestDay,
      validUntil: new Date(validUntilMs).toISOString(),
      totalUnits,
      remainingUnits,
    })
  );
}
