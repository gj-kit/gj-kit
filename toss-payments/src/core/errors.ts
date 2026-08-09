/**
 * 에러 모델 — 최상위 판별자 `source`: 'library'(API 미도달 보장) / 'toss'(서버 응답) / 'network'(전송).
 *
 * retryable 판정은 **코드 테이블**로만 한다 — HTTP status 판정 금지.
 * 근거: PROVIDER_ERROR는 400이지만 재시도 가능, REFUND_REJECTED는 400이지만 비재시도.
 */

export interface TossApiFailure<Code extends string = string> {
  readonly source: 'toss';
  /** 토스 응답 {code, message} 원문 무손실 보존. */
  readonly code: Code;
  readonly message: string;
  /** 보존하되 판정에 쓰지 않는다. */
  readonly httpStatus: number;
  readonly category: ErrorCategory;
  /** ⚠ 코드 테이블 판정 — HTTP status 아님. */
  readonly retryable: boolean;
  /** x-tosspayments-trace-id */
  readonly traceId: string | null;
}

export interface TransportFailure {
  readonly source: 'network';
  readonly code: 'NETWORK_ERROR' | 'TIMEOUT';
  readonly retryable: true;
  readonly cause: unknown;
}
// 'library' 계열은 각 플로우의 Preflight/Verify 에러 타입 — 공통 형태: { source: 'library'; kind: ... }

export type ErrorCategory =
  | 'STATE'
  | 'AMOUNT'
  | 'PARTIAL_NOT_ALLOWED'
  | 'DEADLINE'
  | 'ACCOUNT'
  | 'CONCURRENCY'
  | 'TRANSIENT'
  | 'AUTH'
  | 'NOT_FOUND'
  | 'REJECTED'
  | 'REQUEST'
  | 'UNKNOWN';

/** 취소 API 공식 표 30개 + 실측 보강 — `(string & {})`로 열린 확장(미등록 코드도 수용). */
export type CancelErrorCode =
  | 'ALREADY_CANCELED_PAYMENT'
  | 'ALREADY_REFUND_PAYMENT'
  | 'NOT_CANCELABLE_PAYMENT'
  | 'NOT_CANCELABLE_PAYMENT_FOR_DORMANT_USER'
  | 'NOT_CANCELABLE_AMOUNT'
  | 'EXCEED_CANCEL_AMOUNT_DISCOUNT_AMOUNT'
  | 'EXCEED_CANCEL_LIMIT'
  | 'EXCEED_MAX_REFUND_DUE'
  | 'NOT_ALLOWED_PARTIAL_REFUND'
  | 'NOT_ALLOWED_PARTIAL_REFUND_WAITING_DEPOSIT'
  | 'INVALID_REFUND_ACCOUNT_INFO'
  | 'INVALID_REFUND_ACCOUNT_NUMBER'
  | 'INVALID_BANK'
  | 'NOT_AVAILABLE_BANK'
  | 'FORBIDDEN_BANK_REFUND_REQUEST'
  | 'NOT_MATCHES_REFUNDABLE_AMOUNT'
  | 'FORBIDDEN_CONSECUTIVE_REQUEST'
  | 'IDEMPOTENT_REQUEST_PROCESSING'
  | 'INVALID_IDEMPOTENCY_KEY'
  | 'PROVIDER_ERROR'
  | 'FAILED_INTERNAL_SYSTEM_PROCESSING'
  | 'FAILED_REFUND_PROCESS'
  | 'FAILED_METHOD_HANDLING_CANCEL'
  | 'FAILED_PARTIAL_REFUND'
  | 'COMMON_ERROR'
  | 'FAILED_PAYMENT_INTERNAL_SYSTEM_PROCESSING'
  | 'REFUND_REJECTED'
  | 'UNAUTHORIZED_KEY'
  | 'INCORRECT_BASIC_AUTH_FORMAT'
  | 'FORBIDDEN_REQUEST'
  | 'INVALID_REQUEST'
  | 'NOT_FOUND_PAYMENT'
  | (string & {});

export type ConfirmErrorCode =
  | 'ALREADY_PROCESSED_PAYMENT'
  /** 인증 후 10분 초과 404 — 재시도 불가한 최종 실패(결제 재요청 필요). */
  | 'NOT_FOUND_PAYMENT_SESSION'
  | 'PAY_PROCESS_ABORTED'
  | 'INVALID_REQUEST'
  | 'INVALID_PAYMENT_KEY'
  | 'REJECT_CARD_PAYMENT'
  | 'PROVIDER_ERROR'
  | 'UNAUTHORIZED_KEY'
  | 'INVALID_API_KEY'
  | 'FORBIDDEN_REQUEST'
  | 'NOT_FOUND_PAYMENT'
  | (string & {});

export type BillingErrorCode =
  | 'NOT_MATCHES_CUSTOMER_KEY'
  | 'ALREADY_REMOVED_BILLING_KEY'
  | 'NOT_SUPPORTED_METHOD'
  | 'NOT_SUPPORTED_CARD_TYPE'
  | 'INVALID_BILL_KEY_REQUEST'
  | 'INVALID_BILLING_AUTH'
  | 'INVALID_CARD_NUMBER'
  | 'FAILED_BILL_KEY_AUTH_CREATION'
  | 'FAILED_BILLING_AUTO_CANCEL'
  | (string & {});

export interface ErrorCodeClassification {
  readonly category: ErrorCategory;
  readonly retryable: boolean;
}

const RETRY = { retryable: true } as const;
const NO_RETRY = { retryable: false } as const;

/**
 * 코드 → {category, retryable} 테이블 (설계 문서 §5 전체).
 * ⚠ HTTP status로 판정하지 않는다: PROVIDER_ERROR(400)→재시도 가능, REFUND_REJECTED(400)→불가.
 */
const ERROR_CODE_TABLE: Readonly<Record<string, ErrorCodeClassification>> = {
  // STATE
  ALREADY_CANCELED_PAYMENT: { category: 'STATE', ...NO_RETRY }, // 단일 전액 취소 후 재취소 (실측 400)
  ALREADY_REFUND_PAYMENT: { category: 'STATE', ...NO_RETRY },
  NOT_CANCELABLE_PAYMENT: { category: 'STATE', ...NO_RETRY },
  NOT_CANCELABLE_PAYMENT_FOR_DORMANT_USER: { category: 'STATE', ...NO_RETRY },
  ALREADY_PROCESSED_PAYMENT: { category: 'STATE', ...NO_RETRY }, // confirm 멱등 성격 — 조회로 확정 후 성공 처리 가능
  NOT_MATCHES_CUSTOMER_KEY: { category: 'STATE', ...NO_RETRY }, // 봉인 설계로 구조적 도달 불가 목표 (실측 400)
  ALREADY_REMOVED_BILLING_KEY: { category: 'STATE', ...NO_RETRY }, // 재발급 플로우 유도 (실측 400)
  // AMOUNT
  NOT_CANCELABLE_AMOUNT: { category: 'AMOUNT', ...NO_RETRY }, // 403 — 잔액 초과 및 부분취소 이력 후 재취소 (실측)
  EXCEED_CANCEL_AMOUNT_DISCOUNT_AMOUNT: { category: 'AMOUNT', ...NO_RETRY },
  EXCEED_CANCEL_LIMIT: { category: 'AMOUNT', ...NO_RETRY },
  // PARTIAL_NOT_ALLOWED
  NOT_ALLOWED_PARTIAL_REFUND: { category: 'PARTIAL_NOT_ALLOWED', ...NO_RETRY },
  NOT_ALLOWED_PARTIAL_REFUND_WAITING_DEPOSIT: { category: 'PARTIAL_NOT_ALLOWED', ...NO_RETRY }, // 타입이 선차단(오버로드 부재)
  // DEADLINE
  EXCEED_MAX_REFUND_DUE: { category: 'DEADLINE', ...NO_RETRY },
  NOT_FOUND_PAYMENT_SESSION: { category: 'DEADLINE', ...NO_RETRY }, // 인증 후 10분 초과 404 — 결제 재요청 필요
  // ACCOUNT
  INVALID_REFUND_ACCOUNT_INFO: { category: 'ACCOUNT', ...NO_RETRY },
  INVALID_REFUND_ACCOUNT_NUMBER: { category: 'ACCOUNT', ...NO_RETRY },
  INVALID_BANK: { category: 'ACCOUNT', ...NO_RETRY },
  NOT_AVAILABLE_BANK: { category: 'ACCOUNT', ...NO_RETRY }, // 은행 점검은 시간차 재시도 여지 — 자동 재시도 대상은 아님
  FORBIDDEN_BANK_REFUND_REQUEST: { category: 'ACCOUNT', ...NO_RETRY },
  // CONCURRENCY
  NOT_MATCHES_REFUNDABLE_AMOUNT: { category: 'CONCURRENCY', ...NO_RETRY }, // 낙관적 잠금 실패 — 재조회 후 재시도 (실측: 취소 미실행)
  FORBIDDEN_CONSECUTIVE_REQUEST: { category: 'CONCURRENCY', ...RETRY }, // 지연 재시도
  IDEMPOTENT_REQUEST_PROCESSING: { category: 'CONCURRENCY', ...RETRY }, // 409 — "다시 요청해서 응답 확인" (문서)
  // TRANSIENT
  PROVIDER_ERROR: { category: 'TRANSIENT', ...RETRY }, // ⚠ 400이지만 재시도 가능 — HTTP status 판정 금지의 근거
  FAILED_INTERNAL_SYSTEM_PROCESSING: { category: 'TRANSIENT', ...RETRY },
  FAILED_REFUND_PROCESS: { category: 'TRANSIENT', ...RETRY },
  FAILED_METHOD_HANDLING_CANCEL: { category: 'TRANSIENT', ...RETRY },
  FAILED_PARTIAL_REFUND: { category: 'TRANSIENT', ...RETRY },
  COMMON_ERROR: { category: 'TRANSIENT', ...RETRY },
  FAILED_PAYMENT_INTERNAL_SYSTEM_PROCESSING: { category: 'TRANSIENT', ...RETRY },
  // AUTH
  UNAUTHORIZED_KEY: { category: 'AUTH', ...NO_RETRY },
  INVALID_API_KEY: { category: 'AUTH', ...NO_RETRY }, // 키 쌍 불일치 — 400인 점 주의
  INCORRECT_BASIC_AUTH_FORMAT: { category: 'AUTH', ...NO_RETRY }, // 내부 캡슐화로 도달 불가 목표
  FORBIDDEN_REQUEST: { category: 'AUTH', ...NO_RETRY },
  INSECURE_KEY_USAGE: { category: 'AUTH', ...NO_RETRY }, // 타입이 선차단(시크릿 키 브라우저 유입)
  // NOT_FOUND
  NOT_FOUND_PAYMENT: { category: 'NOT_FOUND', ...NO_RETRY },
  // REJECTED
  REFUND_REJECTED: { category: 'REJECTED', ...NO_RETRY }, // ⚠ 400이지만 비재시도
  REJECT_CARD_PAYMENT: { category: 'REJECTED', ...NO_RETRY },
  PAY_PROCESS_ABORTED: { category: 'REJECTED', ...NO_RETRY },
  // REQUEST
  INVALID_IDEMPOTENCY_KEY: { category: 'REQUEST', ...NO_RETRY }, // >300자
  INVALID_REQUEST: { category: 'REQUEST', ...NO_RETRY },
};

/** 미등록 코드 → UNKNOWN + 비재시도(보수 판정). 원문 code/message/httpStatus는 호출부가 무손실 보존한다. */
export function classifyTossErrorCode(code: string): ErrorCodeClassification {
  return ERROR_CODE_TABLE[code] ?? { category: 'UNKNOWN', retryable: false };
}

export function categorizeCancelError(code: string): ErrorCategory {
  return classifyTossErrorCode(code).category;
}

/** retryable은 생성 시 코드 테이블로 각인된 값 — TransportFailure는 항상 true. */
export function isRetryable(e: TossApiFailure | TransportFailure): boolean {
  return e.retryable;
}

/**
 * "이미 완전 취소됨" 재취소 이중 매핑 헬퍼.
 *
 * Phase 0 실측(2026-08-09): 단일 전액 취소 후 재취소는 400 ALREADY_CANCELED_PAYMENT,
 * **부분취소 이력이 있는 결제의 잔액 0 재취소는 403 NOT_CANCELABLE_AMOUNT**로 온다.
 * 두 코드를 모두 수용해야 한다. (라이브러리 사전검증이 잔액 초과 부분취소를 API 호출 전에
 * 차단하므로, 이 헬퍼에 도달하는 NOT_CANCELABLE_AMOUNT는 사실상 재취소 케이스다.)
 */
export function isAlreadyFullyCanceledError(e: TossApiFailure): boolean {
  return e.code === 'ALREADY_CANCELED_PAYMENT' || e.code === 'NOT_CANCELABLE_AMOUNT';
}
