/**
 * 결제 취소 — 조회 → asCancelable → 실행 3단계 강제.
 *
 * paymentKey 문자열이나 Payment로 바로 취소하는 API는 존재하지 않는다 — asCancelable
 * 검증 통과가 브랜드 획득의 유일한 경로이고, 실행은 kind 내로잉 없이는 컴파일 에러다.
 */
import type { Brand } from '../core/brand';
import type { CancelErrorCode, TossApiFailure, TransportFailure } from '../core/errors';
import type { InternalTossEmit } from '../core/events';
import {
  generateIdempotencyKey,
  idempotencyKey as parseIdempotencyKey,
  paymentKey as parsePaymentKey,
  type CancelReason,
  type CancelRequestId,
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
import { parsePaymentChecked, type CallOptions, type TossHttp } from './client';
// 타입 전용 import — events.ts도 이 모듈을 type-only로 참조하므로 런타임 순환이 없다
import type { TossEventMap } from './events';

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

interface SettledCancelableBase extends Brand<'Cancelable'> {
  /** DONE|PARTIAL_CANCELED, 가상계좌 아님. */
  readonly kind: 'settled';
  readonly payment: Exclude<Payment, VirtualAccountPayment> & {
    readonly status: 'DONE' | 'PARTIAL_CANCELED';
  };
  /** 조회 시점 서버 잔액 — refundableAmount로 항상 전송된다(낙관적 잠금). */
  readonly balanceAmount: number;
}

export type SettledCancelable =
  | (SettledCancelableBase & {
      readonly partialAllowed: true;
      readonly payment: SettledCancelableBase['payment'] & { readonly isPartialCancelable: true };
    })
  | (SettledCancelableBase & {
      readonly partialAllowed: false;
      readonly payment: SettledCancelableBase['payment'] & { readonly isPartialCancelable: false };
    });

interface DepositedVaCancelableBase extends Brand<'Cancelable'> {
  /** 가상계좌 + 입금 완료 → refundAccount 필수. */
  readonly kind: 'deposited-virtual-account';
  readonly payment: VirtualAccountPayment & { readonly status: 'DONE' | 'PARTIAL_CANCELED' };
  readonly balanceAmount: number;
}

export type DepositedVaCancelable =
  | (DepositedVaCancelableBase & {
      readonly partialAllowed: true;
      readonly payment: DepositedVaCancelableBase['payment'] & {
        readonly isPartialCancelable: true;
      };
    })
  | (DepositedVaCancelableBase & {
      readonly partialAllowed: false;
      readonly payment: DepositedVaCancelableBase['payment'] & {
        readonly isPartialCancelable: false;
      };
    });

export type PartiallyCancelable =
  | Extract<SettledCancelable, { readonly partialAllowed: true }>
  | Extract<DepositedVaCancelable, { readonly partialAllowed: true }>;

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
        partialAllowed: payment.isPartialCancelable,
      } as DepositedVaCancelable);
    }
    // 검증 통과가 브랜드 부여의 유일한 경로 — method/status 협착은 분기로 확인 완료
    return ok({
      kind: 'settled',
      payment,
      balanceAmount: payment.balanceAmount,
      partialAllowed: payment.isPartialCancelable,
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
 * transport 실패 시 발급되는 불투명 재시도 티켓. 같은 프로세스에서는 비열거 봉인을,
 * 재시작 뒤에는 CancelRetryStore의 암호화 record를 사용해 동일 멱등키+body를 복원한다.
 * issuedAt 기준 15일이 지난 티켓은 새 요청으로 처리될 위험이 있어 로컬에서 거부한다.
 */
export interface CancelRetryTicket extends Brand<'CancelRetryTicket'> {
  readonly ticketId: string;
  readonly paymentKey: PaymentKey;
  readonly idempotencyKey: IdempotencyKey;
  readonly issuedAt: string;
  /** true면 네트워크 요청 전에 주입된 CancelRetryStore에 요청 바이트가 저장된 상태. */
  readonly durable: boolean;
}

/** 환불계좌 등 민감 요청을 포함할 수 있으므로 반드시 암호화 at-rest 저장할 것. */
export interface CancelRetryRecord {
  readonly ticketId: string;
  readonly paymentKey: string;
  readonly idempotencyKey: string;
  readonly issuedAt: string;
  readonly path: string;
  readonly bodyJson: string;
  readonly testCode: string | undefined;
  readonly expectedCancelAmount: number;
  readonly previousBalanceAmount: number;
}

export interface CancelRetryStore {
  save(record: CancelRetryRecord): Promise<void>;
  load(ticketId: string): Promise<CancelRetryRecord | null>;
  delete(ticketId: string): Promise<void>;
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
    }
  | {
      readonly source: 'library';
      readonly kind: 'partial-cancel-not-allowed';
      readonly paymentKey: PaymentKey;
    }
  | {
      readonly source: 'library';
      readonly kind: 'retry-ticket-expired';
      readonly issuedAt: string;
    }
  | {
      readonly source: 'library';
      readonly kind: 'retry-store-failure';
      readonly operation: 'save' | 'load' | 'delete';
      readonly cause: unknown;
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
      /** 중국·동남아 비동기(Alipay 등) 결제 취소에만 필수 — 상점 발급 고유값(문서 ID 53 §5). */
      readonly cancelRequestId?: CancelRequestId;
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
      /** 중국·동남아 비동기(Alipay 등) 결제 취소에만 필수 — 상점 발급 고유값(문서 ID 53 §5). */
      readonly cancelRequestId?: CancelRequestId;
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
      /** 중국·동남아 비동기(Alipay 등) 결제 취소에만 필수 — 상점 발급 고유값(문서 ID 53 §5). */
      readonly cancelRequestId?: CancelRequestId;
    },
    options?: CallOptions<E>,
  ): Promise<Result<CancelOutcome, CancelError>>;

  /**
   * 부분 환불. AwaitingDepositCancelable 오버로드 없음 → 입금 전 부분취소는 컴파일 에러
   * (서버: NOT_ALLOWED_PARTIAL_REFUND_WAITING_DEPOSIT). 사전검증: amount ≤ balanceAmount.
   */
  cancelPartially(
    target: Extract<SettledCancelable, { readonly partialAllowed: true }>,
    request: {
      readonly reason: CancelReason;
      readonly amount: number;
      readonly refundAccount?: never;
      readonly taxFreeAmount?: number;
      readonly currency?: 'KRW' | 'USD' | 'JPY';
      /** 중국·동남아 비동기(Alipay 등) 결제 취소에만 필수 — 상점 발급 고유값(문서 ID 53 §5). */
      readonly cancelRequestId?: CancelRequestId;
    },
    options?: CallOptions<E>,
  ): Promise<Result<CancelOutcome, CancelError>>;
  cancelPartially(
    target: Extract<DepositedVaCancelable, { readonly partialAllowed: true }>,
    request: {
      readonly reason: CancelReason;
      readonly amount: number;
      readonly refundAccount: RefundAccount;
      readonly taxFreeAmount?: number;
      readonly currency?: 'KRW' | 'USD' | 'JPY';
      /** 중국·동남아 비동기(Alipay 등) 결제 취소에만 필수 — 상점 발급 고유값(문서 ID 53 §5). */
      readonly cancelRequestId?: CancelRequestId;
    },
    options?: CallOptions<E>,
  ): Promise<Result<CancelOutcome, CancelError>>;

  /** transport 실패 티켓 재실행 — 봉인된 동일 멱등키+body. 서버에 도달했었다면 멱등 재생, 아니면 재실행. */
  retry(
    ticket: CancelRetryTicket,
    options?: Pick<CallOptions<E>, 'signal'>,
  ): Promise<Result<CancelOutcome, CancelError>>;

  /** 영속 CancelRetryStore의 opaque ticketId로 프로세스 재시작 후 재실행. */
  retryById(
    ticketId: string,
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
  readonly expectedCancelAmount: number;
  readonly previousBalanceAmount: number;
}

const CANCEL_RETRY_TTL_MS = 15 * 24 * 60 * 60 * 1000;

function restoreSealedRecord(record: CancelRetryRecord): SealedCancelRequest | null {
  const parsedPaymentKey = parsePaymentKey(record.paymentKey);
  if (!parsedPaymentKey.ok) return null;
  const expectedPath = `/v1/payments/${encodeURIComponent(parsedPaymentKey.value)}/cancel`;
  if (record.path !== expectedPath) return null;
  if (record.testCode !== undefined && typeof record.testCode !== 'string') return null;
  if (
    !Number.isSafeInteger(record.expectedCancelAmount) ||
    record.expectedCancelAmount <= 0 ||
    !Number.isSafeInteger(record.previousBalanceAmount) ||
    record.previousBalanceAmount < record.expectedCancelAmount
  ) {
    return null;
  }
  try {
    const body = JSON.parse(record.bodyJson) as unknown;
    if (typeof body !== 'object' || body === null || Array.isArray(body)) return null;
    const bodyRecord = body as Record<string, unknown>;
    if (typeof bodyRecord['cancelReason'] !== 'string' || bodyRecord['cancelReason'].length === 0) {
      return null;
    }
    const cancelAmount = bodyRecord['cancelAmount'];
    if (bodyRecord['refundableAmount'] !== record.previousBalanceAmount) return null;
    if (cancelAmount !== undefined && cancelAmount !== record.expectedCancelAmount) return null;
    if (cancelAmount === undefined && record.expectedCancelAmount !== record.previousBalanceAmount) {
      return null;
    }
  } catch {
    return null;
  }
  return {
    path: record.path,
    bodyJson: record.bodyJson,
    testCode: record.testCode,
    expectedCancelAmount: record.expectedCancelAmount,
    previousBalanceAmount: record.previousBalanceAmount,
  };
}

function invalidResponse(cause: string, retry: CancelRetryTicket): CancelError {
  return {
    source: 'network',
    code: 'NETWORK_ERROR',
    retryable: true,
    cause: new Error(cause),
    retry,
  };
}

function isCancelTransaction(value: unknown): value is CancelTransaction {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record['transactionKey'] === 'string' &&
    record['transactionKey'].length > 0 &&
    typeof record['cancelAmount'] === 'number' &&
    Number.isFinite(record['cancelAmount']) &&
    record['cancelAmount'] > 0 &&
    (record['cancelStatus'] === 'DONE' ||
      record['cancelStatus'] === 'IN_PROGRESS' ||
      record['cancelStatus'] === 'ABORTED')
  );
}

/** (내부) 취소 요청 공통 실행 — 티켓 봉인·응답 해석을 소유한다. */
async function executeCancel(
  http: TossHttp,
  paymentKey: PaymentKey,
  idempotencyKey: IdempotencyKey,
  sealed: SealedCancelRequest,
  issuedAt: Date,
  signal: AbortSignal | undefined,
  retryStore?: CancelRetryStore,
  ticketId: string = globalThis.crypto.randomUUID(),
): Promise<Result<CancelOutcome, CancelError>> {
  const record: CancelRetryRecord = {
    ticketId,
    paymentKey,
    idempotencyKey,
    issuedAt: issuedAt.toISOString(),
    ...sealed,
  };
  let durable = false;
  if (retryStore !== undefined) {
    try {
      // 요청보다 먼저 저장해야 "토스 처리 직후 프로세스 종료"에도 동일 요청을 복구할 수 있다.
      await retryStore.save(record);
      durable = true;
    } catch (cause) {
      // 영속 복구를 요구한 구성에서 저장 실패를 무시하고 취소부터 보내면 복구 불가능한 공백이 생긴다.
      return err({ source: 'library', kind: 'retry-store-failure', operation: 'save', cause });
    }
  }

  const makeTicket = (): CancelRetryTicket => {
    const ticket = {
      ticketId,
      paymentKey,
      idempotencyKey,
      issuedAt: record.issuedAt,
      durable,
    };
    Object.defineProperty(ticket, retrySeal, { value: sealed, enumerable: false });
    // 봉인 완료 — 브랜드는 이 생성 경로로만 부여된다
    return ticket as CancelRetryTicket;
  };

  const deleteDurableRecord = async (): Promise<void> => {
    if (!durable || retryStore === undefined) return;
    try {
      await retryStore.delete(ticketId);
    } catch {
      // 요청 결과는 이미 확정됐다. 같은 멱등키의 잔존 record는 재실행돼도 결과가 재생되고
      // 저장소 TTL로 제거되므로 결제 결과를 저장소 정리 실패로 뒤집지 않는다.
    }
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
    await deleteDurableRecord();
    return err(r.error);
  }

  const parsed = parsePaymentChecked(r.value);
  if (!parsed.ok) {
    return err(invalidResponse(String(parsed.error.cause), makeTicket()));
  }
  const payment = parsed.value;
  if (
    (payment.status !== 'CANCELED' && payment.status !== 'PARTIAL_CANCELED') ||
    payment.paymentKey !== paymentKey ||
    payment.balanceAmount !== sealed.previousBalanceAmount - sealed.expectedCancelAmount
  ) {
    return err(
      invalidResponse(
        '취소 2xx 응답이 요청(paymentKey/status/balanceAmount)과 일치하지 않습니다.',
        makeTicket(),
      ),
    );
  }
  const cancels = payment.cancels ?? [];
  const cancel =
    cancels.find((c) => c.transactionKey === payment.lastTransactionKey) ??
    cancels[cancels.length - 1];
  if (!isCancelTransaction(cancel) || cancel.cancelAmount !== sealed.expectedCancelAmount) {
    // 200인데 cancels가 비어 있음 — 응답 이상. 같은 멱등키 재실행(티켓)으로 회수 가능하게 남긴다.
    return err({
      ...invalidResponse(
        '취소 응답에 요청 금액과 일치하는 유효한 cancel 항목이 없습니다.',
        makeTicket(),
      ),
    });
  }

  await deleteDurableRecord();
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
  expectedCancelAmount: number,
): SealedCancelRequest {
  return {
    path: `/v1/payments/${encodeURIComponent(target.payment.paymentKey)}/cancel`,
    bodyJson: JSON.stringify(body),
    testCode,
    expectedCancelAmount,
    previousBalanceAmount: target.balanceAmount,
  };
}

interface CancelRequestImpl {
  readonly reason: CancelReason;
  readonly expectedAmount?: number | undefined;
  readonly amount?: number | undefined;
  readonly refundAccount?: RefundAccount | undefined;
  readonly taxFreeAmount?: number | undefined;
  readonly currency?: 'KRW' | 'USD' | 'JPY' | undefined;
  readonly cancelRequestId?: CancelRequestId | undefined;
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
  // 중국·동남아 비동기 결제 취소 필수 파라미터(문서 ID 53) — 미지정 시 body에 싣지 않는다
  if (request.cancelRequestId !== undefined) body['cancelRequestId'] = request.cancelRequestId;
  if (request.refundAccount !== undefined) {
    body['refundReceiveAccount'] = {
      bank: request.refundAccount.bank,
      accountNumber: request.refundAccount.accountNumber,
      holderName: request.refundAccount.holderName,
    };
  }
  return body;
}

/**
 * (내부) client.ts가 cancels 네임스페이스를 조립할 때 사용 — index에서 재export하지 않는다.
 *
 * emit은 §3.3 'cancel.executed'/'cancel.failed' 발행 계층 — createTossClient가
 * getInternalEmit(options.events) 결과를 전달한다(미주입/모조 이미터면 null → 발행 no-op).
 * 발화는 Result 확정 후 fire-and-forget — 발화가 반환값을 바꾸는 경로 없음(핸들러 격리는
 * 이미터 소유). 사전검증 실패(preflight Err)도 CancelError이므로 동일하게 발화한다.
 */
export function createCancels<E extends Env>(
  http: TossHttp,
  emit?: InternalTossEmit<TossEventMap> | null,
  retryStore?: CancelRetryStore,
): TossCancels<E> {
  /** Result 확정 후 §3.3 이벤트 발화 — 성공 executed / 실패 failed(paymentKey + error). */
  const finish = async (
    paymentKey: PaymentKey,
    exec: () => Promise<Result<CancelOutcome, CancelError>>,
  ): Promise<Result<CancelOutcome, CancelError>> => {
    const r = await exec();
    if (emit !== undefined && emit !== null) {
      if (r.ok) emit.emit('cancel.executed', { outcome: r.value });
      else emit.emit('cancel.failed', { paymentKey, error: r.error });
    }
    return r;
  };

  const run = (
    target: CancelablePayment,
    body: Record<string, unknown>,
    options: CallOptions<E> | undefined,
  ): Promise<Result<CancelOutcome, CancelError>> => {
    const idempotencyKey = options?.idempotencyKey ?? generateIdempotencyKey();
    const bodyCancelAmount = body['cancelAmount'];
    const expectedCancelAmount =
      typeof bodyCancelAmount === 'number' ? bodyCancelAmount : target.balanceAmount;
    const sealed = sealRequest(target, body, options?.testCode, expectedCancelAmount);
    return executeCancel(
      http,
      target.payment.paymentKey,
      idempotencyKey,
      sealed,
      new Date(),
      options?.signal,
      retryStore,
    );
  };

  return {
    cancelFully(target: CancelablePayment, request: CancelRequestImpl, options?: CallOptions<E>) {
      return finish(target.payment.paymentKey, async () => {
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
      });
    },

    cancelPartially(
      target: SettledCancelable | DepositedVaCancelable,
      request: CancelRequestImpl,
      options?: CallOptions<E>,
    ) {
      return finish(target.payment.paymentKey, async () => {
        if (!target.partialAllowed) {
          return err({
            source: 'library',
            kind: 'partial-cancel-not-allowed',
            paymentKey: target.payment.paymentKey,
          });
        }
        const amount = request.amount ?? Number.NaN;
        if (!Number.isSafeInteger(amount) || amount <= 0) {
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
      });
    },

    retry(ticket, options) {
      return finish(ticket.paymentKey, async () => {
        const parsedPaymentKey = parsePaymentKey(ticket.paymentKey);
        const parsedIdempotencyKey = parseIdempotencyKey(ticket.idempotencyKey);
        if (!parsedPaymentKey.ok || !parsedIdempotencyKey.ok || ticket.ticketId.length === 0) {
          return err({
            source: 'library',
            kind: 'invalid-input',
            field: 'ticket',
            reason: '티켓 ID/paymentKey/idempotencyKey 형식이 올바르지 않습니다.',
          });
        }
        const issuedAtMs = Date.parse(ticket.issuedAt);
        if (
          !Number.isFinite(issuedAtMs) ||
          Date.now() - issuedAtMs >= CANCEL_RETRY_TTL_MS ||
          issuedAtMs > Date.now() + 60_000
        ) {
          return err({
            source: 'library',
            kind: 'retry-ticket-expired',
            issuedAt: ticket.issuedAt,
          });
        }
        // 비공개 봉인 심볼 조회 — 공개 타입에 없는 필드라 단언이 불가피
        let sealed = (ticket as { readonly [retrySeal]?: SealedCancelRequest })[retrySeal];
        if (sealed === undefined && retryStore !== undefined) {
          let record: CancelRetryRecord | null;
          try {
            record = await retryStore.load(ticket.ticketId);
          } catch (cause) {
            return err({ source: 'library', kind: 'retry-store-failure', operation: 'load', cause });
          }
          if (
            record !== null &&
            record.ticketId === ticket.ticketId &&
            record.paymentKey === ticket.paymentKey &&
            record.idempotencyKey === ticket.idempotencyKey &&
            record.issuedAt === ticket.issuedAt
          ) {
            sealed = restoreSealedRecord(record) ?? undefined;
          }
        }
        if (sealed === undefined) {
          return err({
            source: 'library',
            kind: 'invalid-input',
            field: 'ticket',
            reason:
              '봉인 또는 영속 재시도 record가 없습니다. durable=true 티켓을 저장했는지 확인하세요.',
          });
        }
        return executeCancel(
          http,
          ticket.paymentKey,
          ticket.idempotencyKey,
          sealed,
          new Date(ticket.issuedAt),
          options?.signal,
          retryStore,
          ticket.ticketId,
        );
      });
    },

    async retryById(ticketId, options) {
      if (retryStore === undefined) {
        return err({
          source: 'library',
          kind: 'invalid-input',
          field: 'ticketId',
          reason: 'CancelRetryStore가 배선되지 않았습니다.',
        });
      }
      let record: CancelRetryRecord | null;
      try {
        record = await retryStore.load(ticketId);
      } catch (cause) {
        return err({ source: 'library', kind: 'retry-store-failure', operation: 'load', cause });
      }
      if (record === null) {
        return err({
          source: 'library',
          kind: 'invalid-input',
          field: 'ticketId',
          reason: '재시도 record를 찾을 수 없습니다.',
        });
      }
      if (record.ticketId !== ticketId) {
        return err({
          source: 'library',
          kind: 'invalid-input',
          field: 'retryRecord',
          reason: '저장소가 요청한 ticketId와 다른 record를 반환했습니다.',
        });
      }
      const paymentKey = parsePaymentKey(record.paymentKey);
      const idempotencyKey = parseIdempotencyKey(record.idempotencyKey);
      const issuedAtMs = Date.parse(record.issuedAt);
      if (!Number.isFinite(issuedAtMs) || Date.now() - issuedAtMs >= CANCEL_RETRY_TTL_MS || issuedAtMs > Date.now() + 60_000) {
        return err({ source: 'library', kind: 'retry-ticket-expired', issuedAt: record.issuedAt });
      }
      const sealed = restoreSealedRecord(record);
      if (!paymentKey.ok || !idempotencyKey.ok || sealed === null) {
        return err({
          source: 'library',
          kind: 'invalid-input',
          field: 'retryRecord',
          reason: '영속 재시도 record가 취소 요청 불변식을 만족하지 않습니다.',
        });
      }
      return finish(paymentKey.value, async () => {
        return executeCancel(
          http,
          paymentKey.value,
          idempotencyKey.value,
          sealed,
          new Date(record.issuedAt),
          options?.signal,
          retryStore,
          ticketId,
        );
      });
    },
  };
}
