/**
 * browser/widgets — typestate 전이·SDK 예외 매핑·사용자 취소·런타임 검증.
 * SDK는 vi.mock으로 대체한다 (위젯 키 미보유 — E2E 불가, prompts 지시).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { orThrow, orderId, orderName, parseWidgetClientKey, widgetCustomerKey } from '../../src/index';
import { ANONYMOUS, loadWidgets } from '../../src/browser';
import type { RenderedTossWidgets } from '../../src/browser';

const mocks = vi.hoisted(() => ({ loadTossPayments: vi.fn() }));

vi.mock('@tosspayments/tosspayments-sdk', () => ({
  ANONYMOUS: '@@ANONYMOUS',
  loadTossPayments: mocks.loadTossPayments,
}));

const gck = orThrow(parseWidgetClientKey('test_gck_docs_abc'));
const wck = orThrow(widgetCustomerKey('cust-001'));

interface SdkFixture {
  paymentMethodWidget: {
    on: ReturnType<typeof vi.fn>;
    getSelectedPaymentMethod: ReturnType<typeof vi.fn>;
    destroy: ReturnType<typeof vi.fn>;
  };
  agreementWidget: { on: ReturnType<typeof vi.fn>; destroy: ReturnType<typeof vi.fn> };
  widgets: {
    setAmount: ReturnType<typeof vi.fn>;
    renderPaymentMethods: ReturnType<typeof vi.fn>;
    renderAgreement: ReturnType<typeof vi.fn>;
    requestPayment: ReturnType<typeof vi.fn>;
  };
  sdkInstance: { widgets: ReturnType<typeof vi.fn>; payment: ReturnType<typeof vi.fn> };
}

function sdkFixture(): SdkFixture {
  const paymentMethodWidget = {
    on: vi.fn(),
    getSelectedPaymentMethod: vi.fn().mockResolvedValue({ code: 'CARD' }),
    destroy: vi.fn().mockResolvedValue(undefined),
  };
  const agreementWidget = { on: vi.fn(), destroy: vi.fn().mockResolvedValue(undefined) };
  const widgets = {
    setAmount: vi.fn().mockResolvedValue(undefined),
    renderPaymentMethods: vi.fn().mockResolvedValue(paymentMethodWidget),
    renderAgreement: vi.fn().mockResolvedValue(agreementWidget),
    requestPayment: vi.fn().mockResolvedValue(undefined),
  };
  const sdkInstance = { widgets: vi.fn().mockReturnValue(widgets), payment: vi.fn() };
  mocks.loadTossPayments.mockResolvedValue(sdkInstance);
  return { paymentMethodWidget, agreementWidget, widgets, sdkInstance };
}

const paymentRequest = {
  orderId: orThrow(orderId('order-000001')),
  orderName: orThrow(orderName('테스트 주문')),
  successUrl: 'https://shop.example/api/payments/confirm',
  failUrl: 'https://shop.example/checkout/fail',
};

async function renderedFixture(): Promise<{ f: SdkFixture; rendered: RenderedTossWidgets }> {
  const f = sdkFixture();
  const w = orThrow(await loadWidgets(gck, wck));
  const priced = orThrow(await w.setAmount({ currency: 'KRW', value: 1000 }));
  const rendered = orThrow(await priced.renderPaymentMethods({ selector: '#methods' }));
  return { f, rendered };
}

beforeEach(() => {
  mocks.loadTossPayments.mockReset();
});

describe('loadWidgets', () => {
  it('gck·customerKey를 SDK에 그대로 전달하고 상태 0 래퍼를 반환한다', async () => {
    const f = sdkFixture();
    const result = await loadWidgets(gck, wck);
    expect(result.ok).toBe(true);
    expect(mocks.loadTossPayments).toHaveBeenCalledWith('test_gck_docs_abc');
    expect(f.sdkInstance.widgets).toHaveBeenCalledWith({ customerKey: 'cust-001' });
    // 상태 0 — 런타임 객체도 setAmount만 노출한다 (typestate의 런타임 미러)
    if (result.ok) expect(Object.keys(result.value)).toEqual(['setAmount']);
  });

  it('ANONYMOUS는 SDK ANONYMOUS 문자열(@@ANONYMOUS)로 전달된다', async () => {
    const f = sdkFixture();
    const result = await loadWidgets(gck, ANONYMOUS);
    expect(result.ok).toBe(true);
    expect(f.sdkInstance.widgets).toHaveBeenCalledWith({ customerKey: '@@ANONYMOUS' });
  });

  it('widgets() 초기화 예외 → SdkError (code/message 추출)', async () => {
    const f = sdkFixture();
    f.sdkInstance.widgets.mockImplementation(() => {
      throw { code: 'INVALID_CLIENT_KEY', message: '클라이언트 키가 올바르지 않습니다' };
    });
    const result = await loadWidgets(gck, wck);
    expect(result).toEqual({
      ok: false,
      error: { kind: 'sdk', code: 'INVALID_CLIENT_KEY', message: '클라이언트 키가 올바르지 않습니다' },
    });
  });

  it('loadTossPayments 거부 → SdkError', async () => {
    sdkFixture();
    mocks.loadTossPayments.mockRejectedValue(new Error('script load error'));
    const result = await loadWidgets(gck, wck);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toEqual({ kind: 'sdk', code: 'UNKNOWN', message: 'script load error' });
    }
  });
});

describe('typestate 전이', () => {
  it('setAmount → 상태 1 (render 2종 + setAmount), SDK에 금액 전달', async () => {
    const f = sdkFixture();
    const w = orThrow(await loadWidgets(gck, wck));
    const priced = orThrow(await w.setAmount({ currency: 'KRW', value: 50_000 }));
    expect(f.widgets.setAmount).toHaveBeenCalledWith({ currency: 'KRW', value: 50_000 });
    expect(Object.keys(priced).sort()).toEqual(['renderAgreement', 'renderPaymentMethods', 'setAmount']);
  });

  it('renderPaymentMethods → 상태 2 (requestPayment 등장), selector/variantKey 전달', async () => {
    const f = sdkFixture();
    const w = orThrow(await loadWidgets(gck, wck));
    const priced = orThrow(await w.setAmount({ currency: 'KRW', value: 1000 }));
    const rendered = orThrow(
      await priced.renderPaymentMethods({ selector: '#methods', variantKey: 'DEFAULT' }),
    );
    expect(f.widgets.renderPaymentMethods).toHaveBeenCalledWith({
      selector: '#methods',
      variantKey: 'DEFAULT',
    });
    expect(Object.keys(rendered).sort()).toEqual([
      'destroy',
      'getSelectedPaymentMethod',
      'on',
      'requestPayment',
      'setAmount',
    ]);
  });

  it('상태 2의 setAmount는 상태 2를 유지한다 (렌더 완료 후 금액 변경)', async () => {
    const { rendered } = await renderedFixture();
    const again = orThrow(await rendered.setAmount({ currency: 'KRW', value: 900 }));
    expect(Object.keys(again)).toContain('requestPayment');
  });

  it('SDK setAmount 예외 → SdkError, code 없는 Error는 UNKNOWN', async () => {
    const f = sdkFixture();
    const w = orThrow(await loadWidgets(gck, wck));
    f.widgets.setAmount.mockRejectedValue({ code: 'INVALID_AMOUNT_VALUE', message: '금액 오류' });
    const r1 = await w.setAmount({ currency: 'KRW', value: -1 });
    expect(r1).toEqual({
      ok: false,
      error: { kind: 'sdk', code: 'INVALID_AMOUNT_VALUE', message: '금액 오류' },
    });
    f.widgets.setAmount.mockRejectedValue(new Error('boom'));
    const r2 = await w.setAmount({ currency: 'KRW', value: 1 });
    expect(r2).toEqual({ ok: false, error: { kind: 'sdk', code: 'UNKNOWN', message: 'boom' } });
  });
});

describe('requestPayment — 리다이렉트 모드 고정', () => {
  it('성공 → redirecting, 요청 필드가 SDK로 매핑된다 (metadata는 복사본)', async () => {
    const { f, rendered } = await renderedFixture();
    const metadata = { a: '1', b: '2' };
    const outcome = await rendered.requestPayment({ ...paymentRequest, metadata });
    expect(outcome).toEqual({ ok: true, value: { kind: 'redirecting' } });
    const sent = f.widgets.requestPayment.mock.calls[0]?.[0];
    expect(sent).toMatchObject({
      orderId: 'order-000001',
      orderName: '테스트 주문',
      successUrl: paymentRequest.successUrl,
      failUrl: paymentRequest.failUrl,
      metadata: { a: '1', b: '2' },
    });
    expect(sent.metadata).not.toBe(metadata);
  });

  it('USER_CANCEL / PAY_PROCESS_CANCELED 거부 → 에러가 아닌 user-canceled variant', async () => {
    const { f, rendered } = await renderedFixture();
    for (const code of ['USER_CANCEL', 'PAY_PROCESS_CANCELED'] as const) {
      f.widgets.requestPayment.mockRejectedValue({ code, message: '취소했습니다' });
      const outcome = await rendered.requestPayment(paymentRequest);
      expect(outcome).toEqual({
        ok: true,
        value: { kind: 'user-canceled', code, message: '취소했습니다' },
      });
    }
  });

  it('그 외 SDK 거부 → Err(SdkError)', async () => {
    const { f, rendered } = await renderedFixture();
    f.widgets.requestPayment.mockRejectedValue({ code: 'PAY_PROCESS_ABORTED', message: '실패' });
    const outcome = await rendered.requestPayment(paymentRequest);
    expect(outcome).toEqual({
      ok: false,
      error: { kind: 'sdk', code: 'PAY_PROCESS_ABORTED', message: '실패' },
    });
  });

  it('successUrl/failUrl에 origin이 없으면 SDK 호출 전에 Err', async () => {
    const { f, rendered } = await renderedFixture();
    const bad1 = await rendered.requestPayment({ ...paymentRequest, successUrl: '/api/confirm' });
    expect(bad1.ok).toBe(false);
    if (!bad1.ok) expect(bad1.error.code).toBe('INCORRECT_SUCCESS_URL_FORMAT');
    const bad2 = await rendered.requestPayment({ ...paymentRequest, failUrl: 'checkout/fail' });
    expect(bad2.ok).toBe(false);
    if (!bad2.ok) expect(bad2.error.code).toBe('INCORRECT_FAIL_URL_FORMAT');
    expect(f.widgets.requestPayment).not.toHaveBeenCalled();
  });

  it('metadata 6쌍 → SDK 호출 전에 Err, 5쌍은 통과', async () => {
    const { f, rendered } = await renderedFixture();
    const six = Object.fromEntries(Array.from({ length: 6 }, (_, i) => [`k${i}`, 'v']));
    const bad = await rendered.requestPayment({ ...paymentRequest, metadata: six });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error.code).toBe('INVALID_METADATA');
    expect(f.widgets.requestPayment).not.toHaveBeenCalled();

    const five = Object.fromEntries(Array.from({ length: 5 }, (_, i) => [`k${i}`, 'v']));
    const good = await rendered.requestPayment({ ...paymentRequest, metadata: five });
    expect(good).toEqual({ ok: true, value: { kind: 'redirecting' } });
  });

  it('metadata 키 41자 / 값 2001자 → SDK 호출 전에 Err (문서: 키 40자·값 2000자)', async () => {
    const { f, rendered } = await renderedFixture();
    const longKey = await rendered.requestPayment({
      ...paymentRequest,
      metadata: { ['k'.repeat(41)]: 'v' },
    });
    expect(longKey.ok).toBe(false);
    if (!longKey.ok) expect(longKey.error.code).toBe('INVALID_METADATA');

    const longValue = await rendered.requestPayment({
      ...paymentRequest,
      metadata: { k: 'v'.repeat(2001) },
    });
    expect(longValue.ok).toBe(false);
    if (!longValue.ok) expect(longValue.error.code).toBe('INVALID_METADATA');
    expect(f.widgets.requestPayment).not.toHaveBeenCalled();

    const boundary = await rendered.requestPayment({
      ...paymentRequest,
      metadata: { ['k'.repeat(40)]: 'v'.repeat(2000) },
    });
    expect(boundary).toEqual({ ok: true, value: { kind: 'redirecting' } });
  });
});

describe('부속 위젯 API', () => {
  it('getSelectedPaymentMethod → code만 노출', async () => {
    const { rendered } = await renderedFixture();
    const selected = await rendered.getSelectedPaymentMethod();
    expect(selected).toEqual({ ok: true, value: { code: 'CARD' } });
  });

  it('on()의 반환 함수로 구독 해제 — 해제 후 이벤트가 전달되지 않는다', async () => {
    const { f, rendered } = await renderedFixture();
    const handler = vi.fn();
    const unsubscribe = rendered.on('paymentMethodSelect', handler);
    const sdkCallback = f.paymentMethodWidget.on.mock.calls[0]?.[1] as (m: {
      code: string;
    }) => void;
    sdkCallback({ code: 'CARD' });
    expect(handler).toHaveBeenCalledWith({ code: 'CARD' });
    unsubscribe();
    sdkCallback({ code: 'TRANSFER' });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('renderAgreement → AgreementWidget, agreedRequiredTerms만 전달 + 구독 해제', async () => {
    const f = sdkFixture();
    const w = orThrow(await loadWidgets(gck, wck));
    const priced = orThrow(await w.setAmount({ currency: 'KRW', value: 1000 }));
    const agreement = orThrow(await priced.renderAgreement({ selector: '#agreement' }));
    expect(f.widgets.renderAgreement).toHaveBeenCalledWith({ selector: '#agreement' });

    const handler = vi.fn();
    const unsubscribe = agreement.on('agreementStatusChange', handler);
    const sdkCallback = f.agreementWidget.on.mock.calls[0]?.[1] as (s: {
      agreedRequiredTerms: boolean;
      agreements: unknown[];
    }) => void;
    sdkCallback({ agreedRequiredTerms: true, agreements: [] });
    expect(handler).toHaveBeenCalledWith({ agreedRequiredTerms: true });
    unsubscribe();
    sdkCallback({ agreedRequiredTerms: false, agreements: [] });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('destroy는 SDK destroy로 위임된다', async () => {
    const { f, rendered } = await renderedFixture();
    await rendered.destroy();
    expect(f.paymentMethodWidget.destroy).toHaveBeenCalledTimes(1);
  });
});
