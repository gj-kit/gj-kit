/**
 * browser/billing-auth — CARD/TRANSFER 요청 매핑·사용자 취소·SDK 예외.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { orThrow, parseApiClientKey, widgetCustomerKey } from '../../src/index';
import { requestBillingAuth } from '../../src/browser';

const mocks = vi.hoisted(() => ({ loadTossPayments: vi.fn() }));

vi.mock('@tosspayments/tosspayments-sdk', () => ({
  ANONYMOUS: '@@ANONYMOUS',
  loadTossPayments: mocks.loadTossPayments,
}));

const ck = orThrow(parseApiClientKey('test_ck_docs_abc'));
const wck = orThrow(widgetCustomerKey('cust-001'));

function sdkFixture() {
  const payment = { requestBillingAuth: vi.fn().mockResolvedValue(undefined) };
  const sdkInstance = { widgets: vi.fn(), payment: vi.fn().mockReturnValue(payment) };
  mocks.loadTossPayments.mockResolvedValue(sdkInstance);
  return { payment, sdkInstance };
}

const urls = {
  successUrl: 'https://shop.example/billing/callback',
  failUrl: 'https://shop.example/billing/fail',
};

beforeEach(() => {
  mocks.loadTossPayments.mockReset();
});

describe('requestBillingAuth', () => {
  it('CARD — payment({customerKey}) 경유, 필드 매핑 + selectableCardTypes는 복사본', async () => {
    const f = sdkFixture();
    const selectableCardTypes = ['PERSONAL', 'CORPORATE'] as const;
    const result = await requestBillingAuth(ck, wck, {
      method: 'CARD',
      ...urls,
      customerName: '김토스',
      windowTarget: 'self',
      selectableCardTypes,
    });
    expect(result).toEqual({ ok: true, value: { kind: 'redirecting' } });
    expect(mocks.loadTossPayments).toHaveBeenCalledWith('test_ck_docs_abc');
    expect(f.sdkInstance.payment).toHaveBeenCalledWith({ customerKey: 'cust-001' });
    const sent = f.payment.requestBillingAuth.mock.calls[0]?.[0];
    expect(sent).toEqual({
      method: 'CARD',
      successUrl: urls.successUrl,
      failUrl: urls.failUrl,
      customerName: '김토스',
      windowTarget: 'self',
      selectableCardTypes: ['PERSONAL', 'CORPORATE'],
    });
    expect(sent.selectableCardTypes).not.toBe(selectableCardTypes);
  });

  it('TRANSFER — selectableCardTypes 키 자체가 실리지 않는다', async () => {
    const f = sdkFixture();
    const result = await requestBillingAuth(ck, wck, {
      method: 'TRANSFER',
      ...urls,
      customerEmail: 'customer@example.com',
    });
    expect(result).toEqual({ ok: true, value: { kind: 'redirecting' } });
    const sent = f.payment.requestBillingAuth.mock.calls[0]?.[0];
    expect(sent).toEqual({
      method: 'TRANSFER',
      successUrl: urls.successUrl,
      failUrl: urls.failUrl,
      customerEmail: 'customer@example.com',
    });
    expect('selectableCardTypes' in sent).toBe(false);
  });

  it('USER_CANCEL 거부 → 에러가 아닌 user-canceled variant', async () => {
    const f = sdkFixture();
    f.payment.requestBillingAuth.mockRejectedValue({
      code: 'USER_CANCEL',
      message: '인증창을 닫았습니다',
    });
    const result = await requestBillingAuth(ck, wck, { method: 'CARD', ...urls });
    expect(result).toEqual({
      ok: true,
      value: { kind: 'user-canceled', code: 'USER_CANCEL', message: '인증창을 닫았습니다' },
    });
  });

  it('그 외 SDK 거부 → Err(SdkError)', async () => {
    const f = sdkFixture();
    f.payment.requestBillingAuth.mockRejectedValue({
      code: 'INVALID_PARAMETERS',
      message: '파라미터 오류',
    });
    const result = await requestBillingAuth(ck, wck, { method: 'TRANSFER', ...urls });
    expect(result).toEqual({
      ok: false,
      error: { kind: 'sdk', code: 'INVALID_PARAMETERS', message: '파라미터 오류' },
    });
  });

  it('loadTossPayments 거부 → Err(SdkError, code UNKNOWN)', async () => {
    sdkFixture();
    mocks.loadTossPayments.mockRejectedValue(new Error('script load error'));
    const result = await requestBillingAuth(ck, wck, { method: 'CARD', ...urls });
    expect(result).toEqual({
      ok: false,
      error: { kind: 'sdk', code: 'UNKNOWN', message: 'script load error' },
    });
  });
});
