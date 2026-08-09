/**
 * 결제 취소 — 조회 → asCancelable → 실행 3단계 강제.
 *
 * paymentKey 문자열이나 Payment로 바로 취소하는 API는 존재하지 않는다 — asCancelable
 * 검증 통과가 브랜드 획득의 유일한 경로이고, 실행은 kind 내로잉 없이는 컴파일 에러다.
 */
import type { Brand } from '../core/brand';
import type { CancelErrorCode, TossApiFailure, TransportFailure } from '../core/errors';
import {
  generateIdempotencyKey,
  type CancelReason,
  type IdempotencyKey,
  type InvalidInput,
  type PaymentKey,
} from '../core/ids';
import type { Env } from '../core/keys';
import type {
  CancelTransaction,
  Payment,
  PaymentStatus,
  VirtualAccountPayment,
} from '../core/payment';
import { err, ok, type Result } from '../core/result';
// parsePayment는 값 import — client.ts와의 순환은 함수 선언만 서로 참조하므로 안전하다
// (ESM 라이브 바인딩 + tsup 번들 시 단일 청크).
import { parsePayment, type CallOptions, type TossHttp } from './client';

/**
 * asCancelable을 통과해야만 얻는 3-변형 판별 유니언.
 *
 * 취소 가능 상태 집합 DONE|PARTIAL_CANCELED|WAITING_FOR_DEPOSIT는 **비공식 유도**다 —
 * 문서는 집합을 명시적으로 열거하지 않으며, DONE 취소 가능 명시 + "가상계좌 입금 전에는
 * 일반 결제와 똑같이 취소" 서술 + 부분취소 잔액 흐름에서 유도했다. 서버 정책 변경 시
 * 과잉/과소 차단 가능성이 있다 (설계 문서 부록 A).
 */
export type CancelablePayment =
  | SettledCancelable
  | DepositedVaCancelable
  | AwaitingDepositCancelable;

export interface SettledCancelable extends Brand<'Cancelable'> {
  /** DONE|PARTIAL_CANCELED, 가상계좌 아님. */
  readonly kind: 'settled';
  readonly payment: Exclude<Payment, VirtualAccountPayment> & {
    readonly status: 'DONE' | 'PARTIAL_CANCELED';
  };
  /** 조회 시점 서버 잔액 — refundableAmount로 항상 전송된다(낙관적 잠금). */
  readonly balanceAmount: number;
}

export interface DepositedVaCancelable extends Brand<'Cancelable'> {
  /** 가상계좌 + 입금 완료 → refundAccount 필수. */
  readonly kind: 'deposited-virtual-account';
  readonly payment: VirtualAccountPayment & { readonly status: 'DONE' | 'PARTIAL_CANCELED' };
  readonly balanceAmount: number;
}

export interface AwaitingDepositCancelable extends Brand<'Cancelable'> {
  /** WAITING_FOR_DEPOSIT → 전액만 + refundAccount 금지(환불할 금액이 없다). */
  readonly kind: 'awaiting-deposit';
  readonly payment: Payment & { readonly status: 'WAITING_FOR_DEPOSIT' };
  readonly balanceAmount: number;
}

export type NotCancelableError =
  | {
      readonly source: 'library';
      readonly kind: 'not-cancelable-status';
      readonly status: Exclude<PaymentStatus, 'DONE' | 'PARTIAL_CANCELED' | 'WAITING_FOR_DEPOSIT'>;
    }
  /**
   * balanceAmount === 0 — Phase 0 실측(2026-08-09): 부분취소 이력이 있으면 잔액 전액
   * 취소 후에도 status가 PARTIAL_CANCELED로 남는다. status 무관하게 잔액이 판정 기준.
   */
  | {
      readonly source: 'library';
      readonly kind: 'already-fully-canceled';
      readonly paymentKey: PaymentKey;
      readonly status: 'CANCELED' | 'PARTIAL_CANCELED';
    };

export function asCancelable(payment: Payment): Result<CancelablePayment, NotCancelableError> {
  const status = payment.status;
  if (status === 'CANCELED' || (status === 'PARTIAL_CANCELED' && payment.balanceAmount === 0)) {
    return err({
      source: 'library',
      kind: 'already-fully-canceled',
      paymentKey: payment.paymentKey,
      status,
    });
  }
  if (status === 'WAITING_FOR_DEPOSIT') {
    // 검증 통과가 브랜드 부여의 유일한 경로 — status 협착은 위 분기로 런타임 확인 완료
    return ok({
      kind: 'awaiting-deposit',
      payment,
      balanceAmount: payment.balanceAmount,
    } as AwaitingDepositCancelable);
  }
  if (status === 'DONE' || status === 'PARTIAL_CANCELED') {
    if (payment.method === '가상계좌') {
      // 검증 통과가 브랜드 부여의 유일한 경로 — method/status 협착은 분기로 확인 완료
      return ok({
        kind: 'deposited-virtual-account',
        payment,
        balanceAmount: payment.balanceAmount,
      } as DepositedVaCancelable);
    }
    // 검증 통과가 브랜드 부여의 유일한 경로 — method/status 협착은 분기로 확인 완료
    return ok({
      kind: 'settled',
      payment,
      balanceAmount: payment.balanceAmount,
    } as SettledCancelable);
  }
  return err({ source: 'library', kind: 'not-cancelable-status', status });
}

/**
 * 환불 계좌 스마트 생성자.
 * 필드명은 bank다 — bankCode 아님(레퍼런스 원문). accountNumber ≤20자 숫자만(하이픈 불가),
 * holderName ≤60자.
 */
export interface RefundAccount extends Brand<'RefundAccount'> {
  readonly bank: string;
  readonly accountNumber: string;
  readonly holderName: string;
}

export function refundAccount(input: {
  bank: string;
  accountNumber: string;
  holderName: string;
}): Result<RefundAccount, InvalidInput<'refundAccount'>> {
  const fail = (
    reason: InvalidInput<'refundAccount'>['reason'],
  ): Result<never, InvalidInput<'refundAccount'>> =>
    err({ source: 'library', kind: 'invalid-input', field: 'refundAccount', reason });
  if (input.bank.length === 0 || input.holderName.length === 0 || input.accountNumber.length === 0)
    return fail('empty');
  if (input.accountNumber.length > 20 || input.holderName.length > 60) return fail('too-long');
  if (!/^[0-9]+$/.test(input.accountNumber)) return fail('bad-charset');
  // 검증 통과가 브랜드 부여의 유일한 경로
  return ok({
    bank: input.bank,
    accountNumber: input.accountNumber,
    holderName: input.holderName,
  } as RefundAccount);
}

export interface CancelOutcome {
  /** 전액 취소여도 status 'CANCELED' 단정 금지 — 부분취소 이력이 있으면 PARTIAL_CANCELED 유지(실측). */
  readonly payment: Payment & { readonly status: 'CANCELED' | 'PARTIAL_CANCELED' };
  /** 이번 취소 건. */
  readonly cancel: CancelTransaction;
  /** 완전 취소 판정의 유일한 기준: balanceAmount === 0. status로 판정하지 않는다. */
  readonly fullyCanceled: boolean;
  /** cancelStatus === 'IN_PROGRESS' (PayPal 등 해외 비동기) → CANCEL_STATUS_CHANGED 웹훅 대기. */
  readonly pending: boolean;
  /** 실제 사용된 키 (자동 생성분 포함). */
  readonly idempotencyKey: IdempotencyKey;
}

/**
 * transport 실패 시 봉인된 재시도 티켓 — 같은 멱등키 + 같은 body(직렬화 바이트 그대로)가
 * 비공개 심볼(비열거)로 각인되어 있다. 멱등 판정은 body를 포함하지 않으므로(실측)
 * body 동일성은 이 봉인이 보장한다.
 *
 * ⚠ 멱등키는 최초 사용 후 15일 유효 — issuedAt 기준 15일이 지난 티켓의 retry는 새 요청으로
 * 처리될 수 있다(중복 취소 위험, 문서 근거).
 */
export interface CancelRetryTicket extends Brand<'CancelRetryTicket'> {
  readonly paymentKey: PaymentKey;
  readonly idempotencyKey: IdempotencyKey;
  readonly issuedAt: Date;
}

export type CancelPreflightError =
  | {
      /** 우회해서 서버로 보내면 403 NOT_CANCELABLE_AMOUNT (실측) — API 호출 전에 차단한다. */
      readonly source: 'library';
      readonly kind: 'amount-exceeds-balance';
      readonly cancelAmount: number;
      readonly balanceAmount: number;
    }
  | {
      readonly source: 'library';
      readonly kind: 'expected-amount-mismatch';
      readonly expected: number;
      readonly actual: number;
    }
  | {
      readonly source: 'library';
      readonly kind: 'invalid-input';
      readonly field: string;
      readonly reason: string;
    };

export type CancelError =
  | TossApiFailure<CancelErrorCode>
  /** 응답 유실 — retry(ticket)로 동일 멱등키+동일 body 재실행. */
  | (TransportFailure & { readonly retry: CancelRetryTicket })
  | CancelPreflightError;

/** 취소 실행 네임스페이스 — TossServerClient.cancels 의 타입. */
export interface TossCancels<E extends Env> {
  /**
   * 전액 환불. expectedAmount는 필수이며 **호출자 장부(자체 DB)의 기대 금액**이어야 한다 —
   * 서버 balanceAmount(= target.balanceAmount)를 되돌려 넣으면 검증이 항진식이 된다.
   * 불일치 시 API 호출 전 Err. refundableAmount는 항상 자동 전송(서버 낙관적 잠금).
   * 멱등키 미지정 시 실행 전에 UUID 생성·body와 함께 봉인 — 실패 시 retry 티켓으로 회수.
   * ⚠ 유니언 오버로드 없음 — kind 내로잉 없이는 호출 자체가 컴파일 에러.
   */
  cancelFully(
    target: SettledCancelable,
    request: {
      readonly reason: CancelReason;
      readonly expectedAmount: number;
      /** 가상계좌 아님 — 변수/스프레드 경유도 차단. */
      readonly refundAccount?: never;
      readonly taxFreeAmount?: number;
      readonly currency?: 'KRW' | 'USD' | 'JPY';
    },
    options?: CallOptions<E>,
  ): Promise<Result<CancelOutcome, CancelError>>;
  cancelFully(
    target: DepositedVaCancelable,
    request: {
      readonly reason: CancelReason;
      readonly expectedAmount: number;
      /** 입금 완료 가상계좌 — 필수. */
      readonly refundAccount: RefundAccount;
      readonly taxFreeAmount?: number;
      readonly currency?: 'KRW' | 'USD' | 'JPY';
    },
    options?: CallOptions<E>,
  ): Promise<Result<CancelOutcome, CancelError>>;
  cancelFully(
    target: AwaitingDepositCancelable,
    request: {
      readonly reason: CancelReason;
      readonly expectedAmount: number;
      /** 입금 전 — 환불할 금액이 없으므로 금지. */
      readonly refundAccount?: never;
    },
    options?: CallOptions<E>,
  ): Promise<Result<CancelOutcome, CancelError>>;

  /**
   * 부분 환불. AwaitingDepositCancelable 오버로드 없음 → 입금 전 부분취소는 컴파일 에러
   * (서버: NOT_ALLOWED_PARTIAL_REFUND_WAITING_DEPOSIT). 사전검증: amount ≤ balanceAmount.
   */
  cancelPartially(
    target: SettledCancelable,
    request: {
      readonly reason: CancelReason;
      readonly amount: number;
      readonly refundAccount?: never;
      readonly taxFreeAmount?: number;
      readonly currency?: 'KRW' | 'USD' | 'JPY';
    },
    options?: CallOptions<E>,
  ): Promise<Result<CancelOutcome, CancelError>>;
  cancelPartially(
    target: DepositedVaCancelable,
    request: {
      readonly reason: CancelReason;
      readonly amount: number;
      readonly refundAccount: RefundAccount;
      readonly taxFreeAmount?: number;
      readonly currency?: 'KRW' | 'USD' | 'JPY';
    },
    options?: CallOptions<E>,
  ): Promise<Result<CancelOutcome, CancelError>>;

  /** transport 실패 티켓 재실행 — 봉인된 동일 멱등키+body. 서버에 도달했었다면 멱등 재생, 아니면 재실행. */
  retry(
    ticket: CancelRetryTicket,
    options?: Pick<CallOptions<E>, 'signal'>,
  ): Promise<Result<CancelOutcome, CancelError>>;
}

// ─── 내부 구현 ───────────────────────────────────────────────────────────────

/** 봉인 심볼 — 비열거라 JSON.stringify/스프레드에 새지 않는다. */
const retrySeal: unique symbol = Symbol('gj-kit/toss-payments#cancel-retry');

interface SealedCancelRequest {
  readonly path: string;
  readonly bodyJson: string;
  readonly testCode: string | undefined;
}

/** (내부) 취소 요청 공통 실행 — 티켓 봉인·응답 해석을 소유한다. */
async function executeCancel(
  http: TossHttp,
  paymentKey: PaymentKey,
  idempotencyKey: IdempotencyKey,
  sealed: SealedCancelRequest,
  issuedAt: Date,
  signal: AbortSignal | undefined,
): Promise<Result<CancelOutcome, CancelError>> {
  const makeTicket = (): CancelRetryTicket => {
    const ticket = { paymentKey, idempotencyKey, issuedAt };
    Object.defineProperty(ticket, retrySeal, { value: sealed, enumerable: false });
    // 봉인 완료 — 브랜드는 이 생성 경로로만 부여된다
    return ticket as CancelRetryTicket;
  };

  const r = await http.request({
    method: 'POST',
    path: sealed.path,
    bodyJson: sealed.bodyJson,
    idempotencyKey,
    testCode: sealed.testCode,
    signal,
  });
  if (!r.ok) {
    if (r.error.source === 'network') return err({ ...r.error, retry: makeTicket() });
    return err(r.error);
  }

  const payment = parsePayment(r.value);
  const cancels = payment.cancels ?? [];
  const cancel =
    cancels.find((c) => c.transactionKey === payment.lastTransactionKey) ??
    cancels[cancels.length - 1];
  if (cancel === undefined) {
    // 200인데 cancels가 비어 있음 — 응답 이상. 같은 멱등키 재실행(티켓)으로 회수 가능하게 남긴다.
    return err({
      source: 'network',
      code: 'NETWORK_ERROR',
      retryable: true,
      cause: new Error('취소 응답에 cancels 배열이 없습니다 — retry 티켓으로 재확인하세요.'),
      retry: makeTicket(),
    });
  }

  return ok({
    // 취소 성공 응답의 status는 CANCELED|PARTIAL_CANCELED (문서/실측) — 응답 협착 단언
    payment: payment as CancelOutcome['payment'],
    cancel,
    fullyCanceled: payment.balanceAmount === 0,
    pending: cancel.cancelStatus === 'IN_PROGRESS',
    idempotencyKey,
  });
}

/** (내부) 실행 전 봉인 — body를 이 시점에 직렬화해 재시도의 바이트 동일성을 확정한다. */
function sealRequest(
  target: CancelablePayment,
  body: Record<string, unknown>,
  testCode: string | undefined,
): SealedCancelRequest {
  return {
    path: `/v1/payments/${encodeURIComponent(target.payment.paymentKey)}/cancel`,
    bodyJson: JSON.stringify(body),
    testCode,
  };
}

interface CancelRequestImpl {
  readonly reason: CancelReason;
  readonly expectedAmount?: number | undefined;
  readonly amount?: number | undefined;
  readonly refundAccount?: RefundAccount | undefined;
  readonly taxFreeAmount?: number | undefined;
  readonly currency?: 'KRW' | 'USD' | 'JPY' | undefined;
}

function buildBody(target: CancelablePayment, request: CancelRequestImpl): Record<string, unknown> {
  const body: Record<string, unknown> = {
    cancelReason: request.reason,
    // 항상 자동 전송 — 조회 시점 잔액 불일치 시 서버가 NOT_MATCHES_REFUNDABLE_AMOUNT로 거절(낙관적 잠금)
    refundableAmount: target.balanceAmount,
  };
  if (request.amount !== undefined) body['cancelAmount'] = request.amount;
  if (request.taxFreeAmount !== undefined) body['taxFreeAmount'] = request.taxFreeAmount;
  if (request.currency !== undefined) body['currency'] = request.currency;
  if (request.refundAccount !== undefined) {
    body['refundReceiveAccount'] = {
      bank: request.refundAccount.bank,
      accountNumber: request.refundAccount.accountNumber,
      holderName: request.refundAccount.holderName,
    };
  }
  return body;
}

/** (내부) client.ts가 cancels 네임스페이스를 조립할 때 사용 — index에서 재export하지 않는다. */
export function createCancels<E extends Env>(http: TossHttp): TossCancels<E> {
  const run = (
    target: CancelablePayment,
    body: Record<string, unknown>,
    options: CallOptions<E> | undefined,
  ): Promise<Result<CancelOutcome, CancelError>> => {
    const idempotencyKey = options?.idempotencyKey ?? generateIdempotencyKey();
    const sealed = sealRequest(target, body, options?.testCode);
    return executeCancel(
      http,
      target.payment.paymentKey,
      idempotencyKey,
      sealed,
      new Date(),
      options?.signal,
    );
  };

  return {
    async cancelFully(
      target: CancelablePayment,
      request: CancelRequestImpl,
      options?: CallOptions<E>,
    ) {
      const expected = request.expectedAmount ?? Number.NaN;
      if (expected !== target.balanceAmount) {
        return err({
          source: 'library',
          kind: 'expected-amount-mismatch',
          expected,
          actual: target.balanceAmount,
        });
      }
      // 전액 취소 — cancelAmount 미전송(생략 = 전액, 문서 규칙)
      return run(target, buildBody(target, { ...request, amount: undefined }), options);
    },

    async cancelPartially(
      target: SettledCancelable | DepositedVaCancelable,
      request: CancelRequestImpl,
      options?: CallOptions<E>,
    ) {
      const amount = request.amount ?? Number.NaN;
      if (!(amount > 0)) {
        return err({
          source: 'library',
          kind: 'invalid-input',
          field: 'amount',
          reason: '취소 금액은 양수여야 합니다',
        });
      }
      if (amount > target.balanceAmount) {
        return err({
          source: 'library',
          kind: 'amount-exceeds-balance',
          cancelAmount: amount,
          balanceAmount: target.balanceAmount,
        });
      }
      return run(target, buildBody(target, request), options);
    },

    async retry(ticket, options) {
      // 비공개 봉인 심볼 조회 — 공개 타입에 없는 필드라 단언이 불가피
      const sealed = (ticket as { readonly [retrySeal]?: SealedCancelRequest })[retrySeal];
      if (sealed === undefined) {
        return err({
          source: 'library',
          kind: 'invalid-input',
          field: 'ticket',
          reason:
            '봉인이 소실된 티켓입니다 — 스프레드/직렬화 복제본은 재실행할 수 없습니다. 원본 티켓을 사용하세요.',
        });
      }
      return executeCancel(
        http,
        ticket.paymentKey,
        ticket.idempotencyKey,
        sealed,
        ticket.issuedAt,
        options?.signal,
      );
    },
  };
}
