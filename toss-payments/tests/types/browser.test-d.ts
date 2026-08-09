/**
 * browser — §3.5 "오용 = 컴파일 에러" 블록 전체.
 * 시크릿/API 키 유입, 300자 CustomerKey, ANONYMOUS 빌링, typestate 순서 위반 등.
 */
import { describe, expectTypeOf, it } from 'vitest';

import type {
  ApiClientKey,
  ApiSecretKey,
  CustomerKey,
  OrderName,
  WidgetClientKey,
  WidgetCustomerKey,
} from '../../src/index';
import { ANONYMOUS, loadWidgets, requestBillingAuth } from '../../src/browser';
import type {
  Anonymous,
  RenderedTossWidgets,
  TossWidgets,
  TossWidgetsWithAmount,
  WidgetPaymentRequest,
} from '../../src/browser';

const forge = <T>(): T => undefined as T; // 타입 테스트 전용 헬퍼

describe('loadWidgets — 키·customerKey 오용 차단', () => {
  const apiSecret = forge<ApiSecretKey<'test'>>();
  const gck = forge<WidgetClientKey<'test'>>();
  const ck = forge<ApiClientKey<'test'>>();
  const serverCk = forge<CustomerKey>(); // 300자 허용 서버용
  const wck = forge<WidgetCustomerKey>();

  it('시크릿 키·API 키·서버용 CustomerKey 유입은 전부 컴파일 에러', () => {
    // @ts-expect-error 시크릿 키의 브라우저 유입 — WidgetClientKey만 허용 (INSECURE_KEY_USAGE의 타입 차단)
    void loadWidgets(apiSecret, wck);
    // @ts-expect-error API 클라이언트 키(ck)로 위젯 로드 불가 — 위젯은 gck 전용
    void loadWidgets(ck, wck);
    // @ts-expect-error 300자 허용 서버용 CustomerKey를 위젯에 — WidgetCustomerKey(≤50)만
    void loadWidgets(gck, serverCk);
  });

  it('정상 경로 — WidgetCustomerKey와 ANONYMOUS만 통과한다', () => {
    void loadWidgets(gck, wck);
    void loadWidgets(gck, ANONYMOUS);
    expectTypeOf(loadWidgets).parameter(1).toEqualTypeOf<WidgetCustomerKey | Anonymous>();
  });
});

describe('requestBillingAuth — 키·ANONYMOUS·TRANSFER 파라미터 차단', () => {
  const gck = forge<WidgetClientKey<'test'>>();
  const ck = forge<ApiClientKey<'test'>>();
  const wck = forge<WidgetCustomerKey>();
  const u = forge<string>();
  const f = forge<string>();

  it('ANONYMOUS 빌링·위젯 키 빌링은 컴파일 에러', () => {
    // @ts-expect-error 빌링 인증에 ANONYMOUS — 고유 customerKey 전제 (타입 구조로 차단)
    void requestBillingAuth(ck, ANONYMOUS, { method: 'CARD', successUrl: u, failUrl: f });
    // @ts-expect-error 위젯 키로 빌링 인증창 — 빌링은 API 개별키
    void requestBillingAuth(gck, wck, { method: 'CARD', successUrl: u, failUrl: f });
  });

  it('TRANSFER에 selectableCardTypes — ?: never라 변수 경유도 차단', () => {
    const transferOpts = {
      method: 'TRANSFER' as const,
      successUrl: u,
      failUrl: f,
      selectableCardTypes: ['PERSONAL' as const],
    };
    // @ts-expect-error 카드 전용 파라미터 (SDK v2.7.1 타입 정합)
    void requestBillingAuth(ck, wck, transferOpts);
  });

  it('정상 경로 — CARD의 selectableCardTypes는 허용', () => {
    void requestBillingAuth(ck, wck, {
      method: 'CARD',
      successUrl: u,
      failUrl: f,
      selectableCardTypes: ['PERSONAL', 'CORPORATE'],
    });
    void requestBillingAuth(ck, wck, { method: 'TRANSFER', successUrl: u, failUrl: f });
  });
});

describe('위젯 typestate — 순서 위반은 메서드 부재로 컴파일 에러', () => {
  const w = forge<TossWidgets>();
  const priced = forge<TossWidgetsWithAmount>();
  const req = forge<WidgetPaymentRequest>();

  it('setAmount 전에는 render가, render 전에는 requestPayment가 타입에 없다', () => {
    // @ts-expect-error setAmount 전에는 renderPaymentMethods가 타입에 없다 (SDK 순서 제약)
    void w.renderPaymentMethods({ selector: '#pm' });
    // @ts-expect-error render 전에 requestPayment — 메서드가 타입에 없음
    void priced.requestPayment(req);
  });

  it('각 상태의 메서드 집합이 정확히 고정된다', () => {
    expectTypeOf<keyof TossWidgets>().toEqualTypeOf<'setAmount'>();
    expectTypeOf<keyof TossWidgetsWithAmount>().toEqualTypeOf<
      'renderPaymentMethods' | 'renderAgreement' | 'setAmount'
    >();
    expectTypeOf<keyof RenderedTossWidgets>().toEqualTypeOf<
      'requestPayment' | 'setAmount' | 'getSelectedPaymentMethod' | 'on' | 'destroy'
    >();
  });
});

describe('WidgetPaymentRequest — 스마트 생성자 강제', () => {
  const oname = forge<OrderName>();
  const u = forge<string>();
  const f = forge<string>();

  it('raw string은 OrderId가 아니다 — orderId()/generateOrderId()만이 생성 경로', () => {
    // @ts-expect-error raw string 대입 불가
    const bad: WidgetPaymentRequest = { orderId: 'my-order-1', orderName: oname, successUrl: u, failUrl: f };
    void bad;
  });

  it('orderName도 raw string 불가', () => {
    // @ts-expect-error raw string은 OrderName이 아니다
    const bad: WidgetPaymentRequest = { orderId: forge(), orderName: '주문', successUrl: u, failUrl: f };
    void bad;
  });
});

describe('Anonymous — WidgetCustomerKey와 상호 대입 불가', () => {
  it('브랜드 축이 다르다', () => {
    const wck = forge<WidgetCustomerKey>();
    // @ts-expect-error WidgetCustomerKey는 Anonymous가 아니다
    const a: Anonymous = wck;
    void a;
    // @ts-expect-error Anonymous는 WidgetCustomerKey가 아니다
    const k: WidgetCustomerKey = ANONYMOUS;
    void k;
  });
});
