import { describe, expect, it } from 'vitest';

import { isDone, isFullyCanceled, orThrow, orderId, paymentKey } from '../../src/index';
import type { CancelTransaction, CardPayment, Payment } from '../../src/index';

const cancelTx: CancelTransaction = {
  transactionKey: 'tx-cancel-1',
  cancelAmount: 300,
  cancelReason: '고객 요청',
  taxFreeAmount: 0,
  taxExemptionAmount: 0,
  refundableAmount: 700,
  transferDiscountAmount: 0,
  easyPayDiscountAmount: 0,
  canceledAt: '2026-08-09T12:00:00+09:00',
  receiptKey: null,
  cancelStatus: 'DONE',
  cancelRequestId: null,
};

const basePayment: CardPayment = {
  version: '2022-11-16',
  paymentKey: orThrow(paymentKey('tviva20260809test')),
  type: 'NORMAL',
  orderId: orThrow(orderId('order-000001')),
  orderName: '테스트 주문',
  mId: 'tosspayments',
  currency: 'KRW',
  totalAmount: 1000,
  balanceAmount: 1000,
  status: 'DONE',
  requestedAt: '2026-08-09T11:59:00+09:00',
  approvedAt: '2026-08-09T12:00:00+09:00',
  useEscrow: false,
  lastTransactionKey: 'tx-1',
  suppliedAmount: 909,
  vat: 91,
  cultureExpense: false,
  taxFreeAmount: 0,
  taxExemptionAmount: 0,
  cancels: null,
  isPartialCancelable: true,
  secret: null,
  metadata: null,
  receipt: { url: 'https://dashboard.tosspayments.com/receipt' },
  checkout: { url: 'https://api.tosspayments.com/v1/payments/checkout' },
  country: 'KR',
  failure: null,
  method: '카드',
  card: {
    amount: 1000,
    issuerCode: '21',
    acquirerCode: null,
    number: '433012******890',
    installmentPlanMonths: 0,
    approveNo: '00000000',
    useCardPoint: false,
    cardType: '신용',
    ownerType: '개인',
    acquireStatus: 'READY',
    isInterestFree: false,
    interestPayer: null,
  },
  virtualAccount: null,
  raw: {},
};

// 테스트 픽스처 전용 오버라이드 헬퍼 (src에서는 이런 단언 금지)
function payment(overrides: Partial<CardPayment>): Payment {
  return { ...basePayment, ...overrides } as Payment;
}

describe('isFullyCanceled — balanceAmount === 0 && cancels 존재 (Phase 0 실측)', () => {
  it('부분취소 이력 후 잔액 0: status PARTIAL_CANCELED여도 완전 취소다 (실측 케이스)', () => {
    const p = payment({ status: 'PARTIAL_CANCELED', balanceAmount: 0, cancels: [cancelTx, cancelTx] });
    expect(isFullyCanceled(p)).toBe(true);
  });

  it('단일 전액 취소: status CANCELED + 잔액 0', () => {
    const p = payment({ status: 'CANCELED', balanceAmount: 0, cancels: [cancelTx] });
    expect(isFullyCanceled(p)).toBe(true);
  });

  it('잔액이 남아 있으면 status와 무관하게 false', () => {
    const p = payment({ status: 'PARTIAL_CANCELED', balanceAmount: 700, cancels: [cancelTx] });
    expect(isFullyCanceled(p)).toBe(false);
  });

  it('취소 이력이 없으면 잔액 0이어도 false — status로 판정하지 않는다', () => {
    // 예: 승인 전(READY) 결제의 balanceAmount 0은 취소가 아니다
    const p = payment({ status: 'READY', balanceAmount: 0, cancels: null, approvedAt: null });
    expect(isFullyCanceled(p)).toBe(false);

    const emptyCancels = payment({ balanceAmount: 0, cancels: [] });
    expect(isFullyCanceled(emptyCancels)).toBe(false);
  });
});

describe('isDone — status DONE ∧ approvedAt non-null', () => {
  it('DONE + approvedAt이면 true', () => {
    expect(isDone(basePayment)).toBe(true);
  });

  it('DONE이 아니면 false', () => {
    expect(isDone(payment({ status: 'READY', approvedAt: null }))).toBe(false);
    expect(isDone(payment({ status: 'WAITING_FOR_DEPOSIT', approvedAt: null }))).toBe(false);
  });

  it('status DONE이라도 approvedAt이 null이면 false — 거짓 내로잉 방지', () => {
    expect(isDone(payment({ status: 'DONE', approvedAt: null }))).toBe(false);
  });
});
