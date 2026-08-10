/**
 * 비즈니스 환불 견적을 Toss 취소 primitive에 안전하게 결속하는 서버 계층.
 *
 * 정책 계산은 core의 RefundQuote가 소유하고, 이 모듈은 현재 조회 스냅샷과 견적의
 * 신원/잔액을 다시 대조한 뒤 기존 TossCancels에만 위임한다. 견적 금액을 현재 잔액에
 * 조용히 맞추지 않는다 — stale 견적은 새 조회·새 견적·새 멱등키가 필요한 별도 요청이다.
 */
import type { Brand } from "../core/brand";
import {
  cancelReason as parseCancelReason,
  cancelRequestId as parseCancelRequestId,
  idempotencyKey as parseIdempotencyKey,
  type CancelReason,
  type CancelRequestId,
  type IdempotencyKey,
  type OrderId,
  type PaymentKey,
} from "../core/ids";
import type { Env } from "../core/keys";
import type { Payment } from "../core/payment";
import {
  isExecutableRefundQuote,
  matchesRefundObservedPaymentState,
  observeRefundPaymentState,
  parseRefundQuote,
  type RefundQuote,
} from "../core/refund";
import { err, ok, type Result } from "../core/result";
import {
  asCancelable,
  refundAccount as parseRefundAccount,
  type AwaitingDepositCancelable,
  type CancelablePayment,
  type CancelError,
  type CancelOutcome,
  type DepositedVaCancelable,
  type NotCancelableError,
  type RefundAccount,
  type SettledCancelable,
} from "./cancel";
import type {
  CallOptions,
  KeyKind,
  LookupError,
  TossServerClient,
} from "./client";

export type RefundTargetKind = CancelablePayment["kind"];

export type RefundPlanErrorReason =
  | "invalid-quote"
  | "payment-key-mismatch"
  | "order-id-mismatch"
  | "currency-mismatch"
  | "stale-quote"
  | "expired-quote"
  | "payment-state-mismatch"
  | "pending-cancellation"
  | "partial-refund-not-allowed"
  | "partial-refund-before-deposit"
  | "forged-plan"
  | "forged-attempt"
  | "plan-metadata-mismatch"
  | "attempt-metadata-mismatch"
  | "missing-idempotency-key"
  | "invalid-request"
  | "refund-account-required"
  | "refund-account-not-allowed"
  | "tax-free-amount-not-allowed";

/** source/kind가 기존 Result 오류 모델과 같은 서버 미도달 오류. */
export interface RefundPlanError {
  readonly source: "library";
  readonly kind: "invalid-refund-plan";
  readonly reason: RefundPlanErrorReason;
  readonly field?: string;
  readonly expected?: unknown;
  readonly actual?: unknown;
}

export interface NoRefundPreparation {
  readonly kind: "no-refund";
  readonly quote: RefundQuote;
}

interface RefundExecutionPlanBase extends Brand<"RefundExecutionPlan"> {
  readonly kind: "refund";
  readonly paymentKey: PaymentKey;
  readonly orderId: OrderId;
  readonly currency: Payment["currency"];
  readonly expectedBalanceAmount: number;
  readonly amount: number;
  readonly quote: RefundQuote;
}

/**
 * 직렬화 가능한 공개 메타만 열거된다. 실제 CancelablePayment는 비열거 symbol로 봉인되어
 * prepareRefund를 통과하지 않은 객체를 실행할 수 없다.
 */
export type RefundExecutionPlan =
  | (RefundExecutionPlanBase & {
      readonly mode: "full" | "partial";
      readonly targetKind: "settled";
    })
  | (RefundExecutionPlanBase & {
      readonly mode: "full" | "partial";
      readonly targetKind: "deposited-virtual-account";
    })
  | (RefundExecutionPlanBase & {
      readonly mode: "full";
      readonly targetKind: "awaiting-deposit";
    });

export type RefundPreparation = NoRefundPreparation | RefundExecutionPlan;

type RefundPreparationFor<Kind extends RefundTargetKind> =
  | NoRefundPreparation
  | Extract<RefundExecutionPlan, { readonly targetKind: Kind }>;

export type RefundExecutionError =
  | CancelError
  | LookupError
  | NotCancelableError
  | RefundPlanError;

export interface SettledRefundRequest {
  readonly reason: CancelReason;
  readonly refundAccount?: never;
  readonly taxFreeAmount?: number;
  readonly cancelRequestId?: CancelRequestId;
  /** 견적의 결제 통화가 자동 전송된다. */
  readonly currency?: never;
}

export interface DepositedVirtualAccountRefundRequest {
  readonly reason: CancelReason;
  readonly refundAccount: RefundAccount;
  readonly taxFreeAmount?: number;
  readonly cancelRequestId?: CancelRequestId;
  readonly currency?: never;
}

export interface AwaitingDepositRefundRequest {
  readonly reason: CancelReason;
  readonly refundAccount?: never;
  readonly taxFreeAmount?: never;
  readonly cancelRequestId?: CancelRequestId;
  readonly currency?: never;
}

export type RefundExecutionRequest =
  | SettledRefundRequest
  | DepositedVirtualAccountRefundRequest
  | AwaitingDepositRefundRequest;

type RefundExecutionRequestFor<Kind extends RefundTargetKind> = {
  readonly settled: SettledRefundRequest;
  readonly "deposited-virtual-account": DepositedVirtualAccountRefundRequest;
  readonly "awaiting-deposit": AwaitingDepositRefundRequest;
}[Kind];

/** 요청 본문과 함께 attempt에 한 번만 봉인되는 프로젝트 수준의 안정적인 멱등키. */
export interface RefundExecutionAttemptOptions {
  readonly idempotencyKey: IdempotencyKey;
}

/** 실행 시점에만 결정되는 transport 옵션. body와 멱등키에는 영향을 주지 않는다. */
export type RefundRuntimeOptions<E extends Env> = Pick<
  CallOptions<E>,
  "signal" | "testCode"
>;

interface RefundExecutionAttemptBase extends Brand<"RefundExecutionAttempt"> {
  readonly kind: "refund-execution";
  readonly mode: "full" | "partial";
  readonly paymentKey: PaymentKey;
  readonly orderId: OrderId;
  readonly currency: Payment["currency"];
  readonly expectedBalanceAmount: number;
  readonly amount: number;
  readonly quote: RefundQuote;
  readonly idempotencyKey: IdempotencyKey;
}

/**
 * 준비된 plan에 실행 request와 멱등키를 불변 결속한 재실행 가능한 요청 서술.
 * 반복 실행은 조회를 다시 하되 Toss POST의 body와 멱등키는 항상 동일하다.
 */
export type RefundExecutionAttempt =
  | (RefundExecutionAttemptBase & {
      readonly targetKind: "settled";
      readonly mode: "full" | "partial";
    })
  | (RefundExecutionAttemptBase & {
      readonly targetKind: "deposited-virtual-account";
      readonly mode: "full" | "partial";
    })
  | (RefundExecutionAttemptBase & {
      readonly targetKind: "awaiting-deposit";
      readonly mode: "full";
    });

const sealedTarget: unique symbol = Symbol(
  "gj-kit/toss-payments#refund-target"
);
const sealedAttempt: unique symbol = Symbol(
  "gj-kit/toss-payments#refund-attempt"
);

type SealedExecutionPlan = RefundExecutionPlan & {
  readonly [sealedTarget]?: CancelablePayment;
};

type SealedRequest =
  | {
      readonly targetKind: "settled";
      readonly request: Readonly<SettledRefundRequest>;
    }
  | {
      readonly targetKind: "deposited-virtual-account";
      readonly request: Readonly<DepositedVirtualAccountRefundRequest>;
    }
  | {
      readonly targetKind: "awaiting-deposit";
      readonly request: Readonly<AwaitingDepositRefundRequest>;
    };

interface AttemptSeal {
  readonly plan: RefundExecutionPlan;
  readonly request: SealedRequest;
  readonly idempotencyKey: IdempotencyKey;
}

type SealedExecutionAttempt = RefundExecutionAttempt & {
  readonly [sealedAttempt]?: AttemptSeal;
};

function invalidPlan(
  reason: RefundPlanErrorReason,
  details: {
    readonly field?: string;
    readonly expected?: unknown;
    readonly actual?: unknown;
  } = {}
): RefundPlanError {
  return {
    source: "library",
    kind: "invalid-refund-plan",
    reason,
    ...(details.field === undefined ? {} : { field: details.field }),
    ...(details.expected === undefined ? {} : { expected: details.expected }),
    ...(details.actual === undefined ? {} : { actual: details.actual }),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function expirationError(
  quote: RefundQuote,
  nowMs = Date.now()
): RefundPlanError | null {
  const validUntilMs = Date.parse(quote.validUntil);
  return nowMs >= validUntilMs
    ? invalidPlan("expired-quote", {
        field: "validUntil",
        expected: `> ${new Date(nowMs).toISOString()}`,
        actual: quote.validUntil,
      })
    : null;
}

/**
 * 순수 정책 견적을 방금 조회한 취소 가능 결제에 결속한다.
 *
 * core의 canonical quote.kind를 실행 mode로 사용한다. 잔액·정책 산술 불변식은
 * parseRefundQuote가 먼저 검증하며, 서버는 현재 Payment와의 결속만 담당한다.
 */
export function prepareRefund(
  target: SettledCancelable,
  quote: RefundQuote
): Result<RefundPreparationFor<"settled">, RefundPlanError>;
export function prepareRefund(
  target: DepositedVaCancelable,
  quote: RefundQuote
): Result<RefundPreparationFor<"deposited-virtual-account">, RefundPlanError>;
export function prepareRefund(
  target: AwaitingDepositCancelable,
  quote: RefundQuote
): Result<RefundPreparationFor<"awaiting-deposit">, RefundPlanError>;
export function prepareRefund(
  target: CancelablePayment,
  quote: RefundQuote
): Result<RefundPreparation, RefundPlanError>;
export function prepareRefund(
  target: CancelablePayment,
  quoteValue: RefundQuote
): Result<RefundPreparation, RefundPlanError> {
  if (!isExecutableRefundQuote(quoteValue)) {
    return err(
      invalidPlan("invalid-quote", {
        field: "quote",
        actual: "policy.quote 또는 policy.restoreQuote 결과가 아닙니다.",
      })
    );
  }
  const parsedQuote = parseRefundQuote(quoteValue);
  if (!parsedQuote.ok) {
    return err(
      invalidPlan("invalid-quote", {
        field: parsedQuote.error.field,
        actual: parsedQuote.error.reason,
      })
    );
  }
  const quote = quoteValue;
  const expired = expirationError(quote);
  if (expired !== null) return err(expired);

  if (quote.paymentKey !== target.payment.paymentKey) {
    return err(
      invalidPlan("payment-key-mismatch", {
        field: "paymentKey",
        expected: target.payment.paymentKey,
        actual: quote.paymentKey,
      })
    );
  }
  if (quote.orderId !== target.payment.orderId) {
    return err(
      invalidPlan("order-id-mismatch", {
        field: "orderId",
        expected: target.payment.orderId,
        actual: quote.orderId,
      })
    );
  }
  if (quote.currency !== target.payment.currency) {
    return err(
      invalidPlan("currency-mismatch", {
        field: "currency",
        expected: target.payment.currency,
        actual: quote.currency,
      })
    );
  }
  if (
    !matchesRefundObservedPaymentState(
      quote.observedPaymentState,
      target.payment
    )
  ) {
    return err(
      invalidPlan("payment-state-mismatch", {
        field: "observedPaymentState",
        expected: quote.observedPaymentState,
        actual: observeRefundPaymentState(target.payment),
      })
    );
  }
  if (quote.observedBalanceAmount !== target.balanceAmount) {
    return err(
      invalidPlan("stale-quote", {
        field: "observedBalanceAmount",
        expected: target.balanceAmount,
        actual: quote.observedBalanceAmount,
      })
    );
  }
  if (quote.kind === "none")
    return ok(Object.freeze({ kind: "no-refund", quote }));

  if (
    target.payment.cancels?.some(
      (cancel) => cancel.cancelStatus === "IN_PROGRESS"
    )
  ) {
    return err(
      invalidPlan("pending-cancellation", { field: "payment.cancels" })
    );
  }

  const mode = quote.kind;
  if (mode === "partial") {
    if (target.kind === "awaiting-deposit") {
      return err(invalidPlan("partial-refund-before-deposit"));
    }
    if (!target.partialAllowed) {
      return err(
        invalidPlan("partial-refund-not-allowed", {
          field: "isPartialCancelable",
          expected: true,
          actual: false,
        })
      );
    }
  }

  const plan = {
    kind: "refund",
    mode,
    targetKind: target.kind,
    paymentKey: target.payment.paymentKey,
    orderId: target.payment.orderId,
    currency: target.payment.currency,
    expectedBalanceAmount: quote.expectedBalanceAmount,
    amount: quote.amount,
    quote,
  } as RefundExecutionPlan;
  Object.defineProperty(plan, sealedTarget, {
    value: target,
    enumerable: false,
  });
  return ok(Object.freeze(plan));
}

function samePlanMetadata(
  a: RefundExecutionPlan,
  b: RefundExecutionPlan
): boolean {
  return (
    a.kind === b.kind &&
    a.mode === b.mode &&
    a.targetKind === b.targetKind &&
    a.paymentKey === b.paymentKey &&
    a.orderId === b.orderId &&
    a.currency === b.currency &&
    a.expectedBalanceAmount === b.expectedBalanceAmount &&
    a.amount === b.amount
  );
}

/** 봉인을 복구하고 현재 공개 메타/quote를 다시 검증해 mutation·강제 캐스팅 우회를 막는다. */
function restorePlan(
  prepared: RefundExecutionPlan
): Result<
  { readonly target: CancelablePayment; readonly plan: RefundExecutionPlan },
  RefundPlanError
> {
  if (!isRecord(prepared) || prepared.kind !== "refund") {
    return err(invalidPlan("forged-plan", { field: "prepared" }));
  }
  const target = (prepared as SealedExecutionPlan)[sealedTarget];
  if (target === undefined)
    return err(invalidPlan("forged-plan", { field: "prepared" }));

  const canonical = prepareRefund(target, prepared.quote);
  if (!canonical.ok) return canonical;
  if (
    canonical.value.kind !== "refund" ||
    !samePlanMetadata(prepared, canonical.value)
  ) {
    return err(invalidPlan("plan-metadata-mismatch"));
  }
  return ok({ target, plan: canonical.value });
}

function normalizeExecutionInput(
  plan: RefundExecutionPlan,
  requestValue: unknown,
  optionsValue: unknown
): Result<
  { readonly request: SealedRequest; readonly idempotencyKey: IdempotencyKey },
  RefundPlanError
> {
  try {
    if (!isRecord(requestValue)) {
      return err(
        invalidPlan("invalid-request", {
          field: "request",
          actual: requestValue,
        })
      );
    }
    const parsedReason =
      typeof requestValue.reason === "string"
        ? parseCancelReason(requestValue.reason)
        : null;
    if (parsedReason === null || !parsedReason.ok) {
      return err(invalidPlan("invalid-request", { field: "reason" }));
    }
    if (!isRecord(optionsValue)) {
      return err(
        invalidPlan("missing-idempotency-key", { field: "idempotencyKey" })
      );
    }
    const parsedKey =
      typeof optionsValue.idempotencyKey === "string"
        ? parseIdempotencyKey(optionsValue.idempotencyKey)
        : null;
    if (parsedKey === null || !parsedKey.ok) {
      return err(
        invalidPlan("missing-idempotency-key", { field: "idempotencyKey" })
      );
    }
    if (requestValue.currency !== undefined) {
      return err(
        invalidPlan("invalid-request", {
          field: "currency",
          actual: requestValue.currency,
        })
      );
    }

    const parsedCancelRequestId =
      requestValue.cancelRequestId === undefined
        ? null
        : typeof requestValue.cancelRequestId === "string"
        ? parseCancelRequestId(requestValue.cancelRequestId)
        : null;
    if (
      requestValue.cancelRequestId !== undefined &&
      (parsedCancelRequestId === null || !parsedCancelRequestId.ok)
    ) {
      return err(
        invalidPlan("invalid-request", {
          field: "cancelRequestId",
          actual: requestValue.cancelRequestId,
        })
      );
    }

    const taxFreeAmount = requestValue.taxFreeAmount;
    if (
      taxFreeAmount !== undefined &&
      (!Number.isSafeInteger(taxFreeAmount) ||
        (taxFreeAmount as number) < 0 ||
        (taxFreeAmount as number) > plan.amount)
    ) {
      return err(
        invalidPlan("invalid-request", {
          field: "taxFreeAmount",
          expected: `0..${plan.amount}`,
          actual: taxFreeAmount,
        })
      );
    }

    const common = {
      reason: parsedReason.value,
      ...(parsedCancelRequestId?.ok === true
        ? { cancelRequestId: parsedCancelRequestId.value }
        : {}),
    };
    if (plan.targetKind === "deposited-virtual-account") {
      if (!isRecord(requestValue.refundAccount)) {
        return err(invalidPlan("refund-account-required"));
      }
      const parsedAccount = parseRefundAccount({
        bank:
          typeof requestValue.refundAccount.bank === "string"
            ? requestValue.refundAccount.bank
            : "",
        accountNumber:
          typeof requestValue.refundAccount.accountNumber === "string"
            ? requestValue.refundAccount.accountNumber
            : "",
        holderName:
          typeof requestValue.refundAccount.holderName === "string"
            ? requestValue.refundAccount.holderName
            : "",
      });
      if (!parsedAccount.ok) {
        return err(
          invalidPlan("invalid-request", {
            field: "refundAccount",
            actual: parsedAccount.error.reason,
          })
        );
      }
      const request = Object.freeze({
        ...common,
        refundAccount: Object.freeze(parsedAccount.value),
        ...(taxFreeAmount === undefined
          ? {}
          : { taxFreeAmount: taxFreeAmount as number }),
      });
      return ok({
        request: { targetKind: plan.targetKind, request },
        idempotencyKey: parsedKey.value,
      });
    }

    if (requestValue.refundAccount !== undefined) {
      return err(invalidPlan("refund-account-not-allowed"));
    }
    if (plan.targetKind === "awaiting-deposit") {
      if (taxFreeAmount !== undefined)
        return err(invalidPlan("tax-free-amount-not-allowed"));
      return ok({
        request: {
          targetKind: plan.targetKind,
          request: Object.freeze(common),
        },
        idempotencyKey: parsedKey.value,
      });
    }
    return ok({
      request: {
        targetKind: plan.targetKind,
        request: Object.freeze({
          ...common,
          ...(taxFreeAmount === undefined
            ? {}
            : { taxFreeAmount: taxFreeAmount as number }),
        }),
      },
      idempotencyKey: parsedKey.value,
    });
  } catch {
    return err(invalidPlan("invalid-request", { field: "request" }));
  }
}

function sameAttemptMetadata(
  attempt: RefundExecutionAttempt,
  plan: RefundExecutionPlan,
  idempotencyKey: IdempotencyKey
): boolean {
  return (
    attempt.kind === "refund-execution" &&
    attempt.mode === plan.mode &&
    attempt.targetKind === plan.targetKind &&
    attempt.paymentKey === plan.paymentKey &&
    attempt.orderId === plan.orderId &&
    attempt.currency === plan.currency &&
    attempt.expectedBalanceAmount === plan.expectedBalanceAmount &&
    attempt.amount === plan.amount &&
    JSON.stringify(attempt.quote) === JSON.stringify(plan.quote) &&
    attempt.idempotencyKey === idempotencyKey
  );
}

export function prepareRefundExecution<const Plan extends RefundExecutionPlan>(
  plan: Plan,
  request: NoInfer<RefundExecutionRequestFor<Plan["targetKind"]>>,
  options: RefundExecutionAttemptOptions
): Result<
  Extract<RefundExecutionAttempt, { readonly targetKind: Plan["targetKind"] }>,
  RefundPlanError
>;
export function prepareRefundExecution(
  planValue: RefundExecutionPlan,
  requestValue: RefundExecutionRequest,
  optionsValue: RefundExecutionAttemptOptions
): Result<RefundExecutionAttempt, RefundPlanError> {
  try {
    const restored = restorePlan(planValue);
    if (!restored.ok) return restored;
    const { plan } = restored.value;
    const normalized = normalizeExecutionInput(
      plan,
      requestValue,
      optionsValue
    );
    if (!normalized.ok) return normalized;

    const attempt = {
      kind: "refund-execution",
      mode: plan.mode,
      targetKind: plan.targetKind,
      paymentKey: plan.paymentKey,
      orderId: plan.orderId,
      currency: plan.currency,
      expectedBalanceAmount: plan.expectedBalanceAmount,
      amount: plan.amount,
      quote: plan.quote,
      idempotencyKey: normalized.value.idempotencyKey,
    } as RefundExecutionAttempt;
    const seal = Object.freeze({
      plan,
      request: Object.freeze(normalized.value.request),
      idempotencyKey: normalized.value.idempotencyKey,
    });
    Object.defineProperty(attempt, sealedAttempt, {
      value: seal,
      enumerable: false,
    });
    return ok(Object.freeze(attempt));
  } catch {
    return err(invalidPlan("forged-plan", { field: "plan" }));
  }
}

function restoreAttempt(attemptValue: RefundExecutionAttempt): Result<
  {
    readonly plan: RefundExecutionPlan;
    readonly request: SealedRequest;
    readonly idempotencyKey: IdempotencyKey;
  },
  RefundPlanError
> {
  try {
    if (!isRecord(attemptValue) || attemptValue.kind !== "refund-execution") {
      return err(invalidPlan("forged-attempt", { field: "attempt" }));
    }
    const seal = (attemptValue as SealedExecutionAttempt)[sealedAttempt];
    if (seal === undefined)
      return err(invalidPlan("forged-attempt", { field: "attempt" }));
    const restored = restorePlan(seal.plan);
    if (!restored.ok) return restored;
    if (
      seal.request.targetKind !== restored.value.plan.targetKind ||
      !sameAttemptMetadata(
        attemptValue,
        restored.value.plan,
        seal.idempotencyKey
      )
    ) {
      return err(invalidPlan("attempt-metadata-mismatch"));
    }
    return ok({
      plan: restored.value.plan,
      request: seal.request,
      idempotencyKey: seal.idempotencyKey,
    });
  } catch {
    return err(invalidPlan("forged-attempt", { field: "attempt" }));
  }
}

function normalizeRuntimeOptions<E extends Env>(
  value: unknown
): Result<RefundRuntimeOptions<E>, RefundPlanError> {
  if (value === undefined) return ok({});
  try {
    if (!isRecord(value)) {
      return err(
        invalidPlan("invalid-request", {
          field: "runtimeOptions",
          actual: value,
        })
      );
    }
    if (value.idempotencyKey !== undefined) {
      return err(
        invalidPlan("invalid-request", {
          field: "runtimeOptions.idempotencyKey",
          actual: value.idempotencyKey,
        })
      );
    }
    if (value.testCode !== undefined && typeof value.testCode !== "string") {
      return err(
        invalidPlan("invalid-request", {
          field: "runtimeOptions.testCode",
          actual: value.testCode,
        })
      );
    }
    if (
      value.signal !== undefined &&
      (!isRecord(value.signal) ||
        typeof value.signal.aborted !== "boolean" ||
        typeof value.signal.addEventListener !== "function")
    ) {
      return err(
        invalidPlan("invalid-request", { field: "runtimeOptions.signal" })
      );
    }
    const normalized = {
      ...(value.signal === undefined
        ? {}
        : { signal: value.signal as unknown as AbortSignal }),
      ...(value.testCode === undefined
        ? {}
        : { testCode: value.testCode as RefundRuntimeOptions<E>["testCode"] }),
    } as RefundRuntimeOptions<E>;
    return ok(normalized);
  } catch {
    return err(invalidPlan("invalid-request", { field: "runtimeOptions" }));
  }
}

async function dispatchRefund<E extends Env, K extends KeyKind>(
  client: TossServerClient<E, K>,
  target: CancelablePayment,
  plan: RefundExecutionPlan,
  sealedRequestValue: SealedRequest,
  idempotencyKey: IdempotencyKey,
  runtimeOptions: RefundRuntimeOptions<E>
): Promise<Result<CancelOutcome, RefundExecutionError>> {
  const options = { ...runtimeOptions, idempotencyKey } as CallOptions<E>;

  if (sealedRequestValue.targetKind === "awaiting-deposit") {
    if (target.kind !== "awaiting-deposit" || plan.mode !== "full") {
      return err(
        invalidPlan("payment-state-mismatch", { field: "targetKind" })
      );
    }
    return client.cancels.cancelFully(
      target,
      {
        reason: sealedRequestValue.request.reason,
        expectedAmount: plan.expectedBalanceAmount,
        ...(sealedRequestValue.request.cancelRequestId === undefined
          ? {}
          : { cancelRequestId: sealedRequestValue.request.cancelRequestId }),
      },
      options
    );
  }

  if (sealedRequestValue.targetKind === "deposited-virtual-account") {
    if (target.kind !== "deposited-virtual-account") {
      return err(
        invalidPlan("payment-state-mismatch", { field: "targetKind" })
      );
    }
    const request = sealedRequestValue.request;
    const common = {
      reason: request.reason,
      refundAccount: request.refundAccount,
      currency: target.payment.currency,
      ...(request.taxFreeAmount === undefined
        ? {}
        : { taxFreeAmount: request.taxFreeAmount }),
      ...(request.cancelRequestId === undefined
        ? {}
        : { cancelRequestId: request.cancelRequestId }),
    };
    if (plan.mode === "full") {
      return client.cancels.cancelFully(
        target,
        { ...common, expectedAmount: plan.expectedBalanceAmount },
        options
      );
    }
    if (!target.partialAllowed)
      return err(invalidPlan("partial-refund-not-allowed"));
    return client.cancels.cancelPartially(
      target,
      { ...common, amount: plan.amount },
      options
    );
  }

  if (target.kind !== "settled") {
    return err(invalidPlan("payment-state-mismatch", { field: "targetKind" }));
  }
  const request = sealedRequestValue.request;
  const common = {
    reason: request.reason,
    currency: target.payment.currency,
    ...(request.taxFreeAmount === undefined
      ? {}
      : { taxFreeAmount: request.taxFreeAmount }),
    ...(request.cancelRequestId === undefined
      ? {}
      : { cancelRequestId: request.cancelRequestId }),
  };
  if (plan.mode === "full") {
    return client.cancels.cancelFully(
      target,
      { ...common, expectedAmount: plan.expectedBalanceAmount },
      options
    );
  }
  if (!target.partialAllowed)
    return err(invalidPlan("partial-refund-not-allowed"));
  return client.cancels.cancelPartially(
    target,
    { ...common, amount: plan.amount },
    options
  );
}

export async function executeRefund<E extends Env, K extends KeyKind>(
  client: TossServerClient<E, K>,
  attemptValue: RefundExecutionAttempt,
  runtimeOptionsValue?: RefundRuntimeOptions<E>
): Promise<Result<CancelOutcome, RefundExecutionError>> {
  const attempt = restoreAttempt(attemptValue);
  if (!attempt.ok) return attempt;
  const runtimeOptions = normalizeRuntimeOptions<E>(runtimeOptionsValue);
  if (!runtimeOptions.ok) return runtimeOptions;

  const lookup = await client.getPayment(
    attempt.value.plan.paymentKey,
    runtimeOptions.value.signal === undefined
      ? undefined
      : { signal: runtimeOptions.value.signal }
  );
  if (!lookup.ok) return lookup;
  const cancelable = asCancelable(lookup.value);
  if (!cancelable.ok) return cancelable;
  const refreshed = prepareRefund(cancelable.value, attempt.value.plan.quote);
  if (!refreshed.ok) return refreshed;
  if (refreshed.value.kind !== "refund") {
    return err(invalidPlan("payment-state-mismatch", { field: "quote.kind" }));
  }
  if (!samePlanMetadata(attempt.value.plan, refreshed.value)) {
    return err(invalidPlan("plan-metadata-mismatch"));
  }
  return dispatchRefund(
    client,
    cancelable.value,
    refreshed.value,
    attempt.value.request,
    attempt.value.idempotencyKey,
    runtimeOptions.value
  );
}
