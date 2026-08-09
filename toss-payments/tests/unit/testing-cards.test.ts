import { describe, expect, it } from 'vitest';

import { TEST_BILLING_CARD } from '../../src/testing';

describe('TEST_BILLING_CARD', () => {
  it('Phase 0 실측 성공 body의 값 그대로다 (오타 회귀 방지)', () => {
    expect(TEST_BILLING_CARD).toEqual({
      cardNumber: '9410001234567890',
      cardExpirationYear: '30',
      cardExpirationMonth: '12',
      customerIdentityNumber: '900101',
      cardPassword: '12',
    });
  });

  it('DirectCardIssueInput 카드 필드 5종만 담는다 — customerKey는 호출자가 스프레드로 추가', () => {
    expect(Object.keys(TEST_BILLING_CARD).sort()).toEqual([
      'cardExpirationMonth',
      'cardExpirationYear',
      'cardNumber',
      'cardPassword',
      'customerIdentityNumber',
    ]);
  });
});
