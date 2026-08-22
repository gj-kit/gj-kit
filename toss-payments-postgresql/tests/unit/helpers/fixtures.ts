/**
 * 코어 계약 픽스처 — 테스트 간 중복 없이 계약 형태를 한 곳에 고정한다.
 *
 * 브랜드 타입(OrderId, CustomerKey)은 단언으로 각인한다 — 이 패키지는 저장 계층이라
 * 파싱 검증은 코어 소관이고, 스토어 계약의 파라미터 전달만 검증 대상이다.
 */
import type { AuditEntry, CustomerKey, OrderId } from '@gj-kit/toss-payments';
import type {
  BillingKeyRecord,
  CancelRetryRecord,
  StoredOrder,
} from '@gj-kit/toss-payments/server';
import type {
  DepositCallbackEvent,
  SecretVerified,
  WebhookMeta,
} from '@gj-kit/toss-payments/webhook';

import { unsafePlaintextSensitiveValueProtector } from '../../../src/sensitive-values';

export const ORDER_ID = 'order_20260820_0001' as OrderId;
export const CUSTOMER_KEY = 'cust_20260820_0001' as CustomerKey;

/** 기존 저장소 계약 테스트용 명시적 개발 DB opt-in — 프로덕션 protector 대체 금지. */
export const TEST_UNSAFE_SENSITIVE_STORE_OPTIONS = {
  sensitiveValueProtector: unsafePlaintextSensitiveValueProtector,
} as const;

export function makeStoredOrder(overrides?: Partial<StoredOrder>): StoredOrder {
  return {
    orderId: ORDER_ID,
    amount: 10_000,
    currency: 'KRW',
    orderName: '테스트 주문',
    createdAt: '2026-08-20T12:00:00+09:00',
    ...overrides,
  };
}

export function makeBillingKeyRecord(overrides?: Partial<BillingKeyRecord>): BillingKeyRecord {
  return {
    customerKey: CUSTOMER_KEY,
    billingKey: 'bkey_fixture_do_not_log',
    method: '카드',
    issuedAt: '2026-08-20T12:00:00+09:00',
    card: {
      issuerCode: '61',
      number: '12345678****789*',
      cardType: '신용',
      ownerType: '개인',
    },
    transfers: null,
    ...overrides,
  };
}

export function makeCancelRetryRecord(overrides?: Partial<CancelRetryRecord>): CancelRetryRecord {
  return {
    ticketId: 'ticket-0001',
    paymentKey: 'pay_key_0001',
    idempotencyKey: 'idem-0001',
    issuedAt: '2026-08-20T12:00:00+09:00',
    path: '/v1/payments/pay_key_0001/cancel',
    bodyJson: '{"cancelReason":"고객 요청","cancelAmount":1000}',
    testCode: undefined,
    expectedCancelAmount: 1000,
    previousBalanceAmount: 10_000,
    ...overrides,
  };
}

export function makeAuditEntry(overrides?: Partial<AuditEntry>): AuditEntry {
  return {
    id: 'audit-0001',
    at: '2026-08-20T12:00:00+09:00',
    env: 'test',
    method: 'POST',
    path: '/v1/payments/confirm',
    attempt: 1,
    idempotencyKey: null,
    requestBody: { orderId: 'order_20260820_0001', amount: 10_000 },
    durationMs: 42,
    traceId: 'trace-0001',
    outcome: { kind: 'ok', httpStatus: 200, responseBody: { status: 'DONE' } },
    ...overrides,
  };
}

export function makeWebhookMeta(overrides?: Partial<WebhookMeta>): WebhookMeta {
  return {
    transmissionId: 'tx-0001',
    transmissionTime: '2026-08-20T12:00:00+09:00',
    retriedCount: 0,
    dedupeKey: 'evt-dedupe-0001',
    ...overrides,
  };
}

export function makeDepositCallbackEvent(
  overrides?: Partial<DepositCallbackEvent>,
): DepositCallbackEvent {
  return {
    envelope: 'flat',
    eventType: 'DEPOSIT_CALLBACK',
    createdAt: '2026-08-20T12:00:00+09:00',
    orderId: 'order_20260820_0001',
    status: 'DONE',
    transactionKey: 'txn-0001',
    ...overrides,
  };
}

/** trust 3등급 중 refetch 클로저가 없는 SecretVerified가 순수 데이터 픽스처로 가장 단순하다. */
export function makeSecretVerifiedWebhook(meta?: Partial<WebhookMeta>): SecretVerified {
  return {
    trust: 'secret',
    event: makeDepositCallbackEvent(),
    meta: makeWebhookMeta(meta),
  };
}
