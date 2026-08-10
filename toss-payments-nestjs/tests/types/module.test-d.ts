/**
 * §4.3 타입 보존 회귀 — defineTossPaymentsConfig + TossPaymentsFor<typeof config> 패턴으로
 * 조건부 파사드 타입(배선 판정)이 Nest 주입 경계를 넘어 보존되는지 고정한다.
 *
 * 배선 누락 = "프로퍼티 자체가 없다"(코어 §2와 동일 계약) — 주입부에서도 컴파일 에러.
 */
import { describe, expectTypeOf, it } from 'vitest';

import { defineTossPaymentsConfig } from '@gj-kit/toss-payments/server';
import type {
  ApiSecretKey,
  BillingFlow,
  BillingKeyStore,
  ConfirmFlow,
  OrderStore,
  TossEvents,
  TossServerClient,
  WidgetSecretKey,
} from '@gj-kit/toss-payments/server';
import type { WebhookDedupeStore, WebhookVerifier } from '@gj-kit/toss-payments/webhook';

import { TossPaymentsModule } from '../../src/index';
import type { TossPaymentsFor } from '../../src/index';

const forge = <T>(): T => undefined as T; // 타입 테스트 전용 헬퍼

const sk = forge<ApiSecretKey<'test'>>();
const gsk = forge<WidgetSecretKey<'test'>>();
const orders = forge<OrderStore>();
const billingKeys = forge<BillingKeyStore>();
const dedupe = forge<WebhookDedupeStore>();

describe('§4.3 TossPaymentsFor — 배선 판정 보존', () => {
  it('풀 배선 config — confirm/billing/webhook 전부 존재 + Env/KeyKind 복원', () => {
    const config = defineTossPaymentsConfig({
      secretKey: sk,
      orders,
      billingKeys,
      webhook: { dedupe },
    });
    type AppToss = TossPaymentsFor<typeof config>;
    const kit = forge<AppToss>();

    expectTypeOf(kit.client).toEqualTypeOf<TossServerClient<'test', 'api'>>();
    expectTypeOf(kit.confirm).toEqualTypeOf<ConfirmFlow<'test'>>();
    expectTypeOf(kit.billing).toEqualTypeOf<BillingFlow<'test', {}>>();
    expectTypeOf(kit.webhook).toEqualTypeOf<WebhookVerifier>();
    expectTypeOf(kit.events).toEqualTypeOf<TossEvents>();

    // 미션 B4 — 주입된 kit의 confirm 접근이 그대로 컴파일된다(서비스 코드 형태)
    void ((toss: AppToss) => toss.confirm.confirmCallback('?paymentKey=pk&orderId=o&amount=1'));
  });

  it('부분 배선 config — 미배선 플로우는 주입부에서도 프로퍼티 자체가 없다', () => {
    const config = defineTossPaymentsConfig({ secretKey: sk, orders });
    type AppToss = TossPaymentsFor<typeof config>;
    const kit = forge<AppToss>();

    expectTypeOf(kit.confirm).toEqualTypeOf<ConfirmFlow<'test'>>();
    // @ts-expect-error billingKeys 미배선 — billing 프로퍼티 자체가 없다(코어 §2 계약 보존)
    void kit.billing;
    // @ts-expect-error webhook 미배선 — webhook 프로퍼티 자체가 없다
    void kit.webhook;
  });

  it('위젯 키 config — widget KeyKind로 복원, billing 배선은 코어 규칙대로 불가', () => {
    const config = defineTossPaymentsConfig({ secretKey: gsk, orders });
    type WidgetToss = TossPaymentsFor<typeof config>;
    const kit = forge<WidgetToss>();

    expectTypeOf(kit.client).toEqualTypeOf<TossServerClient<'test', 'widget'>>();
    expectTypeOf(kit.confirm).toEqualTypeOf<ConfirmFlow<'test'>>();

    // @ts-expect-error 위젯 시크릿 키 + billingKeys — 코어 config 단계에서 이미 차단(키 쌍 규칙)
    defineTossPaymentsConfig({ secretKey: gsk, orders, billingKeys });
  });
});

describe('§4.2 모듈 시그니처 — config 수용 범위', () => {
  it('forRoot/forRootAsync가 defineTossPaymentsConfig 산출물을 그대로 받는다', () => {
    const config = defineTossPaymentsConfig({ secretKey: sk, orders });
    void TossPaymentsModule.forRoot(config);
    void TossPaymentsModule.forRoot(config, { global: false });
    void TossPaymentsModule.forRootAsync({ useFactory: () => config });
    void TossPaymentsModule.forRootAsync({
      inject: [],
      useFactory: async () => config,
      global: true,
    });
  });

  it('config가 아닌 값은 거부된다', () => {
    // @ts-expect-error secretKey 없는 객체 — AnyTossPaymentsConfig 불충족
    TossPaymentsModule.forRoot({ orders });
    // @ts-expect-error raw string 키 — 브랜드 파서 통과가 유일한 경로(§7-1 기각 보존)
    TossPaymentsModule.forRoot({ secretKey: 'test_sk_raw', orders });
  });
});
