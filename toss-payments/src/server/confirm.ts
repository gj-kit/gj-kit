/**
 * confirm 플로우 — parse → verify(OrderStore) → confirm 3단계 + confirmCallback 원스톱.
 *
 * 금액 대조("쿼리 파라미터의 amount 값과 setAmount()의 amount 값이 같은지 반드시
 * 확인하세요" — 문서 의무)와 10분 승인 시한을 타입으로 강제한다: confirm은
 * VerifiedCheckout만 받고, VerifiedCheckout은 verify 통과로만 얻는다.
 */
import type { Brand } from '../core/brand';
import type { ConfirmErrorCode, TossApiFailure, TransportFailure } from '../core/errors';
import { getInternalEmit } from '../core/events';
import type { InternalTossEmit } from '../core/events';
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
  type LookupError,
  type TossServerClient,
} from './client';
// 타입 전용 import — events.ts가 이 모듈을 type-only로 참조하므로 런타임 순환이 없다
import type { TossEventMap, TossEvents } from './events';
import type { DepositSecretStore, OrderStore, StoredOrder } from './stores';

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
  /**
   * §3.1 가상계좌 secret 자동 저장 — confirm/confirmCallback이 Ok이고
   * **`payment.method === '가상계좌'`일 때만** saveSecret을 await 호출한다.
   *
   * method 가드 근거(Phase 5 실측): BILLING 카드 결제 응답에도 secret이 non-null로
   * 내려온다 — secret 존재로 판정하면 빌링 결제마다 무의미한 저장이 발생한다.
   *
   * 저장 실패여도 confirm은 **Ok 유지**(협상 불가) — 승인은 토스 측에서 이미 완결이라
   * Err로 뒤집으면 "승인됐는데 실패 처리 + 사용자 재confirm"이라는 더 큰 사고가 된다.
   * secret은 `getPaymentByOrderId` 재조회 응답에도 있어(실측) 유실이 영구적이지 않다.
   * 실패 통지: {@link onDepositSecretSaveFailed} + 'deposit.secret-save-failed' 이벤트.
   */
  readonly depositSecrets?: DepositSecretStore;
  /**
   * saveSecret 실패 통지 — payload에 **secret 원문 미포함**(로그 유출 방지).
   * 복구: `getPaymentByOrderId(orderId)` → `Payment.secret` → `saveSecret` 재시도.
   * 미지정 시 실패 1건당 console.warn 1회(라이브러리에서 유일하게 시끄러운 기본값 —
   * 침묵 유실 방지: 저장 누락 = 해당 주문의 DEPOSIT_CALLBACK 전부 unknown-order 거부).
   * 이 콜백의 throw는 삼켜진다(Ok 확정 결과 무간섭).
   */
  readonly onDepositSecretSaveFailed?: (info: {
    readonly orderId: OrderId;
    readonly paymentKey: PaymentKey;
    readonly cause: unknown;
  }) => void;
  /**
   * §3.3 이벤트 버스 — 'payment.confirmed' / 'payment.confirm-failed' /
   * 'deposit.secret-saved' / 'deposit.secret-save-failed' 발행 지점.
   * createTossEvents 산출물만 발행이 흐른다(구조적 모조 객체는 no-op).
   */
  readonly events?: TossEvents;
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

/**
 * §3.7 confirm 실패 복구·안내 3분기 — "confirm Err ≠ 결제 실패"(G8).
 *
 * transport 실패(승인됐는데 응답 유실)·ALREADY_PROCESSED_PAYMENT(새로고침 이중 confirm)를
 * 일괄 실패 처리하면 "돈은 나갔는데 실패 안내"라는 최악의 CS 사고가 난다 — 조회로 진실을
 * 확정한 뒤 분기하라.
 */
export type ConfirmResolution =
  /** 조회로 DONE|WAITING_FOR_DEPOSIT 확인됨 — 성공으로 처리하라. */
  | { readonly resolution: 'actually-confirmed'; readonly payment: ConfirmedPayment }
  /** NOT_FOUND_PAYMENT_SESSION(10분 초과) 등 — 결제 재요청 유도. */
  | { readonly resolution: 'retry-payment' }
  /** 조회로도 미승인 확정. */
  | { readonly resolution: 'definitively-failed'; readonly error: ConfirmError };

/**
 * confirm 실패를 조회 기반으로 판정한다 (설계 §3.7 확정 로직):
 * - `source === 'network'`(transport) 또는 `ALREADY_PROCESSED_PAYMENT` →
 *   `getPaymentByOrderId` 조회 → status가 DONE|WAITING_FOR_DEPOSIT이면 'actually-confirmed'.
 * - `NOT_FOUND_PAYMENT_SESSION`(10분 초과 — 라이브러리 시한 초과 에러 동일 취급) →
 *   조회 없이 'retry-payment'.
 * - 그 외 REJECT/AUTH 계열 → 조회 없이 'definitively-failed'.
 *
 * ⚠ 조회 자체가 Err면 진실 미확정이다 — **성공/실패 어느 쪽으로도 사용자에게 단정 안내하지
 * 말 것**(재시도 또는 수동 확인으로 넘겨라).
 *
 * 미해결(Phase 6 실측 항목): ALREADY_PROCESSED_PAYMENT인데 조회 status가 CANCELED인 희귀
 * 케이스(다른 경로로 이미 취소) — 현재는 'definitively-failed'로 분류된다.
 */
export async function resolveConfirmFailure<E extends Env>(
  client: Pick<TossServerClient<E>, 'getPaymentByOrderId'>,
  orderId: OrderId,
  error: ConfirmError,
): Promise<Result<ConfirmResolution, LookupError>> {
  // 라이브러리 시한 초과(approval-window-exceeded)는 NOT_FOUND_PAYMENT_SESSION과 동일
  // 상황(10분 초과)의 선제 차단이다 — 같은 분기(재요청 유도)로 판정한다.
  if (error.source === 'library' || error.code === 'NOT_FOUND_PAYMENT_SESSION') {
    return ok({ resolution: 'retry-payment' });
  }
  if (error.source === 'network' || error.code === 'ALREADY_PROCESSED_PAYMENT') {
    const looked = await client.getPaymentByOrderId(orderId);
    if (!looked.ok) return looked;
    const status = looked.value.status;
    if (status === 'DONE' || status === 'WAITING_FOR_DEPOSIT') {
      // 조회로 승인 완결 확인 — 협착 단언 근거는 위 status 가드
      return ok({ resolution: 'actually-confirmed', payment: looked.value as ConfirmedPayment });
    }
    return ok({ resolution: 'definitively-failed', error });
  }
  return ok({ resolution: 'definitively-failed', error });
}

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

  /**
   * §3.7 {@link resolveConfirmFailure}의 플로우 결합판 — 플로우의 client를 재사용하고,
   * 'actually-confirmed'가 **가상계좌면 §3.1 depositSecrets 저장 경로를 재사용**한다
   * (secret이 조회 응답에 있음 — 실측. confirm 실패로 저장 기회를 잃은 secret의 복구 지점).
   *
   * ⚠ 조회 Err = 진실 미확정 — 성공/실패 어느 쪽으로도 사용자에게 단정 안내하지 말 것.
   */
  resolveFailure(
    orderId: OrderId,
    error: ConfirmError,
  ): Promise<Result<ConfirmResolution, LookupError>>;
}

export function createConfirmFlow<E extends Env>(
  client: TossServerClient<E, KeyKind>,
  store: OrderStore,
  options?: ConfirmFlowOptions,
): ConfirmFlow<E> {
  const approvalWindowMs = options?.approvalWindowMs ?? 600_000;
  const clock = options?.clock ?? (() => new Date());
  const http = getInternalHttp(client);
  const depositSecrets = options?.depositSecrets;
  const onDepositSecretSaveFailed = options?.onDepositSecretSaveFailed;
  // 발행 계층 — createTossEvents 산출물이 아니면 null(발행 지점 no-op, 비용 0 수렴)
  const emit: InternalTossEmit<TossEventMap> | null = getInternalEmit<TossEventMap>(
    options?.events,
  );

  /** §3.1 실패 통지 — payload에 secret 원문 미포함(로그 유출 방지). 콜백 throw는 삼킨다(Ok 확정 무간섭). */
  const notifySecretSaveFailed = (
    orderIdValue: OrderId,
    paymentKeyValue: PaymentKey,
    cause: unknown,
  ): void => {
    if (onDepositSecretSaveFailed !== undefined) {
      try {
        onDepositSecretSaveFailed({ orderId: orderIdValue, paymentKey: paymentKeyValue, cause });
      } catch {
        // 관측 콜백의 throw가 확정된 Ok를 예외로 뒤집는 경로 차단
      }
    } else {
      // 콜백 미지정 시 실패 1건당 console.warn 1회 — 라이브러리에서 유일하게 시끄러운
      // 기본값(§3.1). 침묵 유실 = 이 주문의 DEPOSIT_CALLBACK 전부 unknown-order 거부.
      console.warn(
        `[@gj-kit/toss-payments] 가상계좌 secret 저장 실패 (orderId=${orderIdValue}) — ` +
          '이 주문의 입금 웹훅(DEPOSIT_CALLBACK)이 전부 unknown-order로 거부됩니다. ' +
          'getPaymentByOrderId(orderId) → Payment.secret → saveSecret 재시도로 복구하세요. ' +
          '(onDepositSecretSaveFailed 콜백 지정 시 이 경고 대신 콜백으로 통지됩니다)',
        cause,
      );
    }
    emit?.emit('deposit.secret-save-failed', {
      orderId: orderIdValue,
      paymentKey: paymentKeyValue,
      cause,
    });
  };

  /**
   * §3.1 — Ok 확정 후 가상계좌 secret 자동 저장. method 가드('가상계좌'만 — Phase 5 실측:
   * BILLING 카드 응답도 secret non-null이라 secret 존재로 판정하면 무의미한 저장 발생).
   * 저장 실패여도 호출측 Result는 Ok 불변(협상 불가) — 통지만 흐른다.
   */
  const saveDepositSecret = async (payment: ConfirmedPayment): Promise<void> => {
    if (depositSecrets === undefined || payment.method !== '가상계좌') return;
    try {
      await depositSecrets.saveSecret(payment.orderId, payment.secret);
      emit?.emit('deposit.secret-saved', { orderId: payment.orderId });
    } catch (cause) {
      notifySecretSaveFailed(payment.orderId, payment.paymentKey, cause);
    }
  };

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

  const verifyImpl: ConfirmFlow<E>['verify'] = async (callback) => {
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

  const confirmImpl: ConfirmFlow<E>['confirm'] = async (checkout, callOptions) => {
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
    if (
      (parsed.value.status !== 'DONE' && parsed.value.status !== 'WAITING_FOR_DEPOSIT') ||
      parsed.value.paymentKey !== checkout.paymentKey ||
      parsed.value.orderId !== checkout.orderId ||
      parsed.value.totalAmount !== checkout.amount
    ) {
      return err({
        source: 'network',
        code: 'NETWORK_ERROR',
        retryable: true,
        cause: new Error('결제 승인 2xx 응답이 요청(status/paymentKey/orderId/amount)과 일치하지 않습니다.'),
      });
    }
    return ok(parsed.value as ConfirmedPayment);
  };

  // ── §3.3 이벤트 래퍼 — Result 확정 **후** fire-and-forget 발화(핸들러 격리는 이미터 소유),
  //    이벤트가 플로우 결과를 바꾸는 경로가 타입상 존재하지 않는다 ──────────────────
  const verify: ConfirmFlow<E>['verify'] = async (callback) => {
    const r = await verifyImpl(callback);
    if (!r.ok) {
      emit?.emit('payment.confirm-failed', { orderId: callback.orderId, error: r.error });
    }
    return r;
  };

  const confirm: ConfirmFlow<E>['confirm'] = async (checkout, callOptions) => {
    const r = await confirmImpl(checkout, callOptions);
    if (!r.ok) {
      emit?.emit('payment.confirm-failed', { orderId: checkout.orderId, error: r.error });
      return r;
    }
    // §3.1 — 승인 완결(Ok 확정) 후 자동 저장을 await. 실패여도 Ok 불변(통지만).
    await saveDepositSecret(r.value);
    emit?.emit('payment.confirmed', { payment: r.value });
    return r;
  };

  return {
    createOrder,
    verify,
    confirm,
    async confirmCallback(input, callOptions) {
      const parsed = parseSuccessCallback(input);
      if (!parsed.ok) {
        // parse 단계 실패 — orderId를 아직 모른다(null). verify/confirm 실패 발화는
        // 각 래퍼가 소유하므로 여기서 중복 발화하지 않는다.
        emit?.emit('payment.confirm-failed', { orderId: null, error: parsed.error });
        return parsed;
      }
      const verified = await verify(parsed.value);
      if (!verified.ok) return verified;
      return confirm(verified.value, callOptions);
    },
    async resolveFailure(orderIdValue, error) {
      const resolved = await resolveConfirmFailure(client, orderIdValue, error);
      if (resolved.ok && resolved.value.resolution === 'actually-confirmed') {
        // §3.1 저장 경로 재사용 — confirm 실패로 저장 기회를 잃은 가상계좌 secret의
        // 복구 지점(secret이 조회 응답에 있음 — 실측). 실패여도 판정 결과는 불변.
        await saveDepositSecret(resolved.value.payment);
      }
      return resolved;
    },
  };
}
