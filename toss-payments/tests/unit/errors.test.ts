import { describe, expect, it } from 'vitest';

import {
  categorizeCancelError,
  classifyTossErrorCode,
  isAlreadyFullyCanceledError,
  isRetryable,
} from '../../src/index';
import type { TossApiFailure, TransportFailure } from '../../src/index';

function tossFailure(code: string, httpStatus: number): TossApiFailure {
  const { category, retryable } = classifyTossErrorCode(code);
  return { source: 'toss', code, message: '', httpStatus, category, retryable, traceId: null };
}

describe('코드 테이블 — HTTP status가 아닌 코드로 판정 (§5 표 대조)', () => {
  it('PROVIDER_ERROR: 400이지만 TRANSIENT + retryable=true', () => {
    expect(classifyTossErrorCode('PROVIDER_ERROR')).toEqual({
      category: 'TRANSIENT',
      retryable: true,
    });
  });

  it('빌링 500 계열(FAILED_BILL_KEY_AUTH_CREATION/FAILED_BILLING_AUTO_CANCEL): TRANSIENT + retryable', () => {
    expect(classifyTossErrorCode('FAILED_BILL_KEY_AUTH_CREATION')).toEqual({
      category: 'TRANSIENT',
      retryable: true,
    });
    expect(classifyTossErrorCode('FAILED_BILLING_AUTO_CANCEL')).toEqual({
      category: 'TRANSIENT',
      retryable: true,
    });
  });

  it('REFUND_REJECTED: 400이지만 REJECTED + retryable=false', () => {
    expect(classifyTossErrorCode('REFUND_REJECTED')).toEqual({
      category: 'REJECTED',
      retryable: false,
    });
  });

  it('5xx TRANSIENT 계열 6종은 전부 재시도 가능', () => {
    const codes = [
      'FAILED_INTERNAL_SYSTEM_PROCESSING',
      'FAILED_REFUND_PROCESS',
      'FAILED_METHOD_HANDLING_CANCEL',
      'FAILED_PARTIAL_REFUND',
      'COMMON_ERROR',
      'FAILED_PAYMENT_INTERNAL_SYSTEM_PROCESSING',
    ];
    for (const code of codes) {
      expect(classifyTossErrorCode(code)).toEqual({ category: 'TRANSIENT', retryable: true });
    }
  });

  it('CONCURRENCY: 멱등 처리 중/연속 요청은 재시도, 낙관적 잠금 실패는 비재시도(재조회 필요)', () => {
    expect(classifyTossErrorCode('IDEMPOTENT_REQUEST_PROCESSING')).toEqual({
      category: 'CONCURRENCY',
      retryable: true,
    });
    expect(classifyTossErrorCode('FORBIDDEN_CONSECUTIVE_REQUEST')).toEqual({
      category: 'CONCURRENCY',
      retryable: true,
    });
    expect(classifyTossErrorCode('NOT_MATCHES_REFUNDABLE_AMOUNT')).toEqual({
      category: 'CONCURRENCY',
      retryable: false,
    });
  });

  it('주요 카테고리 표본 대조', () => {
    expect(categorizeCancelError('ALREADY_CANCELED_PAYMENT')).toBe('STATE');
    expect(categorizeCancelError('NOT_CANCELABLE_AMOUNT')).toBe('AMOUNT');
    expect(categorizeCancelError('NOT_ALLOWED_PARTIAL_REFUND')).toBe('PARTIAL_NOT_ALLOWED');
    expect(categorizeCancelError('NOT_FOUND_PAYMENT_SESSION')).toBe('DEADLINE');
    expect(categorizeCancelError('EXCEED_MAX_REFUND_DUE')).toBe('DEADLINE');
    expect(categorizeCancelError('INVALID_BANK')).toBe('ACCOUNT');
    expect(categorizeCancelError('UNAUTHORIZED_KEY')).toBe('AUTH');
    expect(categorizeCancelError('INVALID_API_KEY')).toBe('AUTH'); // 키 쌍 불일치 — 400인 점 주의
    expect(categorizeCancelError('INSECURE_KEY_USAGE')).toBe('AUTH');
    expect(categorizeCancelError('NOT_FOUND_PAYMENT')).toBe('NOT_FOUND');
    expect(categorizeCancelError('PAY_PROCESS_ABORTED')).toBe('REJECTED');
    expect(categorizeCancelError('INVALID_IDEMPOTENCY_KEY')).toBe('REQUEST');
    expect(categorizeCancelError('ALREADY_PROCESSED_PAYMENT')).toBe('STATE');
    expect(categorizeCancelError('ALREADY_REMOVED_BILLING_KEY')).toBe('STATE');
    expect(categorizeCancelError('NOT_MATCHES_CUSTOMER_KEY')).toBe('STATE');
  });

  it('미등록 코드는 UNKNOWN + 비재시도(보수 판정)', () => {
    expect(classifyTossErrorCode('SOME_FUTURE_CODE')).toEqual({
      category: 'UNKNOWN',
      retryable: false,
    });
  });
});

describe('isRetryable', () => {
  it('TossApiFailure는 각인된 retryable을 따른다', () => {
    expect(isRetryable(tossFailure('PROVIDER_ERROR', 400))).toBe(true);
    expect(isRetryable(tossFailure('REFUND_REJECTED', 400))).toBe(false);
  });

  it('TransportFailure는 항상 재시도 가능', () => {
    const transport: TransportFailure = {
      source: 'network',
      code: 'TIMEOUT',
      retryable: true,
      cause: new Error('timeout'),
    };
    expect(isRetryable(transport)).toBe(true);
  });
});

describe('isAlreadyFullyCanceledError — 재취소 이중 매핑 (Phase 0 실측)', () => {
  it('400 ALREADY_CANCELED_PAYMENT와 403 NOT_CANCELABLE_AMOUNT 양쪽 수용', () => {
    expect(isAlreadyFullyCanceledError(tossFailure('ALREADY_CANCELED_PAYMENT', 400))).toBe(true);
    expect(isAlreadyFullyCanceledError(tossFailure('NOT_CANCELABLE_AMOUNT', 403))).toBe(true);
  });

  it('다른 코드는 해당 없음', () => {
    expect(isAlreadyFullyCanceledError(tossFailure('NOT_CANCELABLE_PAYMENT', 400))).toBe(false);
    expect(isAlreadyFullyCanceledError(tossFailure('ALREADY_REFUND_PAYMENT', 400))).toBe(false);
  });
});
