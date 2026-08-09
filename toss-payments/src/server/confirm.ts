/**
 * confirm 플로우 — parse → verify(OrderStore) → confirm 3단계 + confirmCallback 원스톱.
 *
 * 금액 대조("쿼리 파라미터의 amount 값과 setAmount()의 amount 값이 같은지 반드시
 * 확인하세요" — 문서 의무)와 10분 승인 시한을 타입으로 강제한다: confirm은
 * VerifiedCheckout만 받고, VerifiedCheckout은 verify 통과로만 얻는다.
 */
import type { Brand } from '../core/brand';
import type { ConfirmErrorCode, TossApiFailure, TransportFailure } from '../core/errors';
import {
  generateOrderId,
  orderId as parseOrderIdRaw,
  orderName as parseOrderNameRaw,
  paymentKey as parsePaymentKeyRaw,
  type OrderId,
  type PaymentKey,
} from '../core/ids';
import type { Env } from '../core/keys';
import type { Payment } from '../core/payment';
import { err, ok, type Result } from '../core/result';
import {
  getInternalHttp,
  missingInternalHttpFailure,
  parsePaymentChecked,
  type CallOptions,
  type KeyKind,
  type TossServerClient,
} from './client';
import type { OrderStore, StoredOrder } from './stores';

/** 프레임워크 무관 콜백 입력 — Next.js req.url, Express req.query, Hono c.req.url, URL 전부 수용. */
export type CallbackQueryInput =
  | string
  | URL
  | URLSearchParams
  | Readonly<Record<string, string | readonly string[] | undefined>>;

export interface CallbackParseError {
  readonly source: 'library';
  readonly kind: 'callback-parse';
  /** 문제가 된 파라미터 이름 목록 (missing-param 외 reason에서도 대상 파라미터를 담는다). */
  readonly missing: readonly string[];
  readonly reason: 'missing-param' | 'bad-amount' | 'bad-order-id';
}

/** successUrl 쿼리의 유일한 파싱 결과 — confirm은 이 타입을 받지 않는다. */
export interface UnverifiedCallback extends Brand<'UnverifiedCallback'> {
  readonly paymentKey: PaymentKey;
  readonly orderId: OrderId;
  /** 쿼리 문자열 → number 변환·검증 완료. */
  readonly amount: number;
  /** 문서 간 불일치(위젯 가이드에만 등장) — 옵셔널 파싱. */
  readonly paymentType: 'NORMAL' | 'BILLING' | 'BRANDPAY' | null;
  /** 10분 승인 시한 판정 기준. */
  readonly receivedAt: Date;
}

/** failUrl 파싱 — 사용자 취소는 에러가 아닌 별도 variant. */
export type FailCallbackResult =
  | {
      readonly kind: 'user-canceled';
      readonly code: 'PAY_PROCESS_CANCELED' | 'USER_CANCEL';
      readonly orderId: OrderId | null;
    }
  | {
      readonly kind: 'failed';
      readonly code: string;
      readonly message: string;
      readonly orderId: OrderId | null;
    };

/** (내부 공유) 콜백 입력 4형태 → URLSearchParams 정규화. billing.ts도 사용한다. */
export function toSearchParams(input: CallbackQueryInput): URLSearchParams {
  if (typeof input === 'string') {
    try {
      return new URL(input).searchParams;
    } catch {
      // 절대 URL이 아님 — 상대 경로('/cb?a=1') 또는 쿼리 문자열('?a=1' / 'a=1')로 처리
    }
    const qIndex = input.indexOf('?');
    return new URLSearchParams(qIndex >= 0 ? input.slice(qIndex + 1) : input);
  }
  if (input instanceof URL) return input.searchParams;
  if (input instanceof URLSearchParams) return input;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined) continue;
    const first = typeof value === 'string' ? value : value[0];
    if (first === undefined) continue;
    params.set(key, first);
  }
  return params;
}

function parseError(
  reason: CallbackParseError['reason'],
  missing: readonly string[],
): Result<never, CallbackParseError> {
  return err({ source: 'library', kind: 'callback-parse', missing, reason });
}

export function parseSuccessCallback(
  input: CallbackQueryInput,
  options?: { readonly receivedAt?: Date },
): Result<UnverifiedCallback, CallbackParseError> {
  const q = toSearchParams(input);
  const paymentKeyRaw = q.get('paymentKey');
  const orderIdRaw = q.get('orderId');
  const amountRaw = q.get('amount');

  const missing: string[] = [];
  if (paymentKeyRaw === null || paymentKeyRaw === '') missing.push('paymentKey');
  if (orderIdRaw === null || orderIdRaw === '') missing.push('orderId');
  if (amountRaw === null || amountRaw === '') missing.push('amount');
  if (missing.length > 0 || paymentKeyRaw === null || orderIdRaw === null || amountRaw === null) {
    return parseError('missing-param', missing);
  }

  // paymentKey 형식 이상(>200자 등)은 별도 reason이 없어 missing-param으로 분류한다
  const pk = parsePaymentKeyRaw(paymentKeyRaw);
  if (!pk.ok) return parseError('missing-param', ['paymentKey']);

  const oid = parseOrderIdRaw(orderIdRaw);
  if (!oid.ok) return parseError('bad-order-id', ['orderId']);

  const amount = Number(amountRaw);
  if (!Number.isFinite(amount) || amountRaw.trim() === '') {
    return parseError('bad-amount', ['amount']);
  }

  const paymentTypeRaw = q.get('paymentType');
  const paymentType =
    paymentTypeRaw === 'NORMAL' || paymentTypeRaw === 'BILLING' || paymentTypeRaw === 'BRANDPAY'
      ? paymentTypeRaw
      : null;

  // 파싱 통과가 브랜드 부여의 유일한 경로
  return ok({
    paymentKey: pk.value,
    orderId: oid.value,
    amount,
    paymentType,
    receivedAt: options?.receivedAt ?? new Date(),
  } as UnverifiedCallback);
}

export function parseFailCallback(
  input: CallbackQueryInput,
): Result<FailCallbackResult, CallbackParseError> {
  const q = toSearchParams(input);
  const code = q.get('code');
  if (code === null || code === '') return parseError('missing-param', ['code']);

  const orderIdRaw = q.get('orderId');
  let orderIdValue: OrderId | null = null;
  if (orderIdRaw !== null && orderIdRaw !== '') {
    const oid = parseOrderIdRaw(orderIdRaw);
    if (oid.ok) orderIdValue = oid.value;
  }

  if (code === 'PAY_PROCESS_CANCELED' || code === 'USER_CANCEL') {
    return ok({ kind: 'user-canceled', code, orderId: orderIdValue });
  }
  return ok({ kind: 'failed', code, message: q.get('message') ?? '', orderId: orderIdValue });
}

// ─── confirm 플로우 ─────────────────────────────────────────────────────────

export interface ConfirmFlowOptions {
  /**
   * 기본 10분(600_000ms). Phase 0 확정: 인증 완료(successUrl 리다이렉트) 후 10분,
   * 초과 시 상태 EXPIRED → confirm은 404 NOT_FOUND_PAYMENT_SESSION(재시도 불가 최종 실패).
   * 30분은 결제창 실행(READY)→구매자 인증 구간의 별개 시한 — 라이브러리 통제 밖.
   */
  readonly approvalWindowMs?: number;
  readonly clock?: () => Date;
}

export interface PendingOrder extends StoredOrder, Brand<'PendingOrder'> {
  /** 브라우저로 넘길 직렬화 페이로드 — 위젯 requestPayment 입력과 필드명 일치. */
  toClientProps(): { orderId: string; amount: number; orderName: string; currency: string };
}

export type CreateOrderError =
  | {
      readonly source: 'library';
      readonly kind: 'invalid-input';
      readonly field: string;
      readonly reason: string;
    }
  | {
      readonly source: 'library';
      readonly kind: 'store-failure';
      readonly operation: 'save';
      readonly cause: unknown;
    };

export interface VerifiedCheckout extends Brand<'VerifiedCheckout'> {
  readonly paymentKey: PaymentKey;
  readonly orderId: OrderId;
  readonly amount: number;
  readonly verifiedAt: Date;
  /** receivedAt + approvalWindowMs — UI 시한 안내용. */
  readonly approvalDeadline: Date;
}

export type VerifyCheckoutError =
  | { readonly source: 'library'; readonly kind: 'order-not-found'; readonly orderId: OrderId }
  | {
      /** 문서 "반드시 확인하세요"의 강제 지점 — 금액 변조 시도 신호. */
      readonly source: 'library';
      readonly kind: 'amount-mismatch';
      readonly orderId: OrderId;
      readonly expected: number;
      readonly received: number;
    }
  | {
      readonly source: 'library';
      readonly kind: 'approval-window-exceeded';
      readonly deadline: Date;
      readonly now: Date;
    }
  | {
      readonly source: 'library';
      readonly kind: 'store-failure';
      readonly operation: 'load';
      readonly cause: unknown;
    };

/** 가상계좌 confirm은 DONE이 아니다 — WAITING_FOR_DEPOSIT 포함. */
export type ConfirmedPayment = Payment & { readonly status: 'DONE' | 'WAITING_FOR_DEPOSIT' };

export type ConfirmError =
  | TossApiFailure<ConfirmErrorCode>
  | TransportFailure
  | {
      readonly source: 'library';
      readonly kind: 'approval-window-exceeded';
      readonly deadline: Date;
      readonly now: Date;
    };

export interface ConfirmFlow<E extends Env> {
  /** 검증 + store.saveOrder까지 완료된 뒤에만 Ok — 금액을 저장 시점에 고정. */
  createOrder(input: {
    amount: number;
    /** ≤100자 precheck. */
    orderName: string;
    /** 생략 시 generateOrderId(). */
    orderId?: OrderId;
    /** 기본 'KRW'. */
    currency?: 'KRW' | 'USD' | 'JPY';
  }): Promise<Result<PendingOrder, CreateOrderError>>;

  /** 저장 주문 로드 → amount 일치 → 시한 검증. 통과해야만 VerifiedCheckout. */
  verify(callback: UnverifiedCallback): Promise<Result<VerifiedCheckout, VerifyCheckoutError>>;

  /**
   * VerifiedCheckout만 받는다 — UnverifiedCallback은 컴파일 에러.
   * 멱등키는 일급 옵션이며 **기본 미부착**(§7 확정 5 — 에러 응답 멱등 재생 여부 미실측이라 보수적).
   */
  confirm(
    checkout: VerifiedCheckout,
    options?: CallOptions<E>,
  ): Promise<Result<ConfirmedPayment, ConfirmError>>;

  /** 원스톱: parse → verify → confirm. 검증을 생략이 아니라 내장 — 단계별 에러가 union으로 구분된다. */
  confirmCallback(
    input: CallbackQueryInput,
    options?: CallOptions<E>,
  ): Promise<Result<ConfirmedPayment, CallbackParseError | VerifyCheckoutError | ConfirmError>>;
}

export function createConfirmFlow<E extends Env>(
  client: TossServerClient<E, KeyKind>,
  store: OrderStore,
  options?: ConfirmFlowOptions,
): ConfirmFlow<E> {
  const approvalWindowMs = options?.approvalWindowMs ?? 600_000;
  const clock = options?.clock ?? (() => new Date());
  const http = getInternalHttp(client);

  const createOrder: ConfirmFlow<E>['createOrder'] = async (input) => {
    if (!Number.isFinite(input.amount) || input.amount <= 0) {
      return err({
        source: 'library',
        kind: 'invalid-input',
        field: 'amount',
        reason: '금액은 0보다 큰 수여야 합니다',
      });
    }
    const name = parseOrderNameRaw(input.orderName);
    if (!name.ok) {
      return err({
        source: 'library',
        kind: 'invalid-input',
        field: 'orderName',
        reason: name.error.reason,
      });
    }
    const stored: StoredOrder = {
      orderId: input.orderId ?? generateOrderId(),
      amount: input.amount,
      currency: input.currency ?? 'KRW',
      orderName: name.value,
      createdAt: clock().toISOString(),
    };
    try {
      await store.saveOrder(stored);
    } catch (cause) {
      return err({ source: 'library', kind: 'store-failure', operation: 'save', cause });
    }
    // 저장 성공 후에만 브랜드 부여 — '저장을 잊는' 실수가 플로우 안에서 불가능
    const toClientProps = (): {
      orderId: string;
      amount: number;
      orderName: string;
      currency: string;
    } => ({
      orderId: stored.orderId,
      amount: stored.amount,
      orderName: stored.orderName,
      currency: stored.currency,
    });
    return ok({ ...stored, toClientProps } as PendingOrder);
  };

  const verify: ConfirmFlow<E>['verify'] = async (callback) => {
    let stored: StoredOrder | null;
    try {
      stored = await store.loadOrder(callback.orderId);
    } catch (cause) {
      return err({ source: 'library', kind: 'store-failure', operation: 'load', cause });
    }
    if (stored === null) {
      return err({ source: 'library', kind: 'order-not-found', orderId: callback.orderId });
    }
    if (stored.amount !== callback.amount) {
      return err({
        source: 'library',
        kind: 'amount-mismatch',
        orderId: callback.orderId,
        expected: stored.amount,
        received: callback.amount,
      });
    }
    const deadline = new Date(callback.receivedAt.getTime() + approvalWindowMs);
    const now = clock();
    if (now.getTime() > deadline.getTime()) {
      return err({ source: 'library', kind: 'approval-window-exceeded', deadline, now });
    }
    // 금액 대조 + 시한 검증 통과가 브랜드 부여의 유일한 경로
    return ok({
      paymentKey: callback.paymentKey,
      orderId: callback.orderId,
      amount: callback.amount,
      verifiedAt: now,
      approvalDeadline: deadline,
    } as VerifiedCheckout);
  };

  const confirm: ConfirmFlow<E>['confirm'] = async (checkout, callOptions) => {
    const now = clock();
    if (now.getTime() > checkout.approvalDeadline.getTime()) {
      return err({
        source: 'library',
        kind: 'approval-window-exceeded',
        deadline: checkout.approvalDeadline,
        now,
      });
    }
    if (http === null) return err(missingInternalHttpFailure());
    const r = await http.request({
      method: 'POST',
      path: '/v1/payments/confirm',
      bodyJson: JSON.stringify({
        paymentKey: checkout.paymentKey,
        orderId: checkout.orderId,
        amount: checkout.amount,
      }),
      // §7 확정 5: 기본 미부착 — 옵션으로 지정했을 때만 헤더 부착
      idempotencyKey: callOptions?.idempotencyKey,
      testCode: callOptions?.testCode,
      signal: callOptions?.signal,
    });
    if (!r.ok) return err(r.error);
    // 2xx라도 빈 body/비객체 JSON이면 '빈 Payment' 제조 금지 — 필수 필드 가드 통과 후에만 Ok
    const parsed = parsePaymentChecked(r.value);
    if (!parsed.ok) return parsed;
    // 승인 성공 응답의 status는 DONE|WAITING_FOR_DEPOSIT(가상계좌) — 응답 협착 단언(문서 근거)
    return ok(parsed.value as ConfirmedPayment);
  };

  return {
    createOrder,
    verify,
    confirm,
    async confirmCallback(input, callOptions) {
      const parsed = parseSuccessCallback(input);
      if (!parsed.ok) return parsed;
      const verified = await verify(parsed.value);
      if (!verified.ok) return verified;
      return confirm(verified.value, callOptions);
    },
  };
}
