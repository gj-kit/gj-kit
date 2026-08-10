/**
 * §2 파사드 타입 회귀 — 조건부 프로퍼티 존재/부재, 오버로드 불충족, 타입 보존.
 *
 * 배선 누락 = "프로퍼티 자체가 없다"(사용 시점 컴파일 에러) — 기지 리스크(에러 메시지가
 * 원인을 직접 말하지 않음)의 완화책 ③: expectTypeOf로 판정을 회귀 고정한다.
 */
import { describe, expectTypeOf, it } from 'vitest';

import { createTossPayments, defineTossPaymentsConfig } from '../../src/server';
import type {
  ApiSecretKey,
  BillingFlow,
  BillingKeyStore,
  BillingOrder,
  BillingProfile,
  ConfirmFlow,
  DepositSecretStore,
  IdempotencyKey,
  OrderStore,
  TossEvents,
  TossServerClient,
  WidgetSecretKey,
} from '../../src/server';
import type { WebhookDedupeStore, WebhookVerifier } from '../../src/webhook';

const forge = <T>(): T => undefined as T; // 타입 테스트 전용 헬퍼

const sk = forge<ApiSecretKey<'test'>>();
const gsk = forge<WidgetSecretKey<'test'>>();
const orders = forge<OrderStore>();
const billingKeys = forge<BillingKeyStore>();
const dedupe = forge<WebhookDedupeStore>();
const depositSecrets = forge<DepositSecretStore>();

describe('§2 파사드 — 배선한 플로우만 프로퍼티가 존재한다', () => {
  it('orders 배선 → confirm 존재, billingKeys 미배선 → billing 부재', () => {
    const kit = createTossPayments({ secretKey: sk, orders });
    expectTypeOf(kit.client).toEqualTypeOf<TossServerClient<'test', 'api'>>();
    expectTypeOf(kit.confirm).toEqualTypeOf<ConfirmFlow<'test'>>();
    expectTypeOf(kit.events).toEqualTypeOf<TossEvents>(); // 항상 존재(미주입 시 no-op 표면)

    // @ts-expect-error billingKeys 미배선 — billing 프로퍼티 자체가 없다
    void kit.billing;
    // @ts-expect-error webhook 미배선 — webhook 프로퍼티 자체가 없다
    void kit.webhook;
  });

  it('webhook 배선 → webhook 존재, orders 미배선 → confirm 부재', () => {
    const kit = createTossPayments({ secretKey: sk, webhook: { dedupe, autoRefetch: true } });
    expectTypeOf(kit.webhook).toEqualTypeOf<WebhookVerifier>();

    // @ts-expect-error orders 미배선 — confirm 프로퍼티 자체가 없다
    void kit.confirm;
  });

  it('풀 배선(§2 예제 픽스처) — confirm/billing/webhook/events 전부 존재', () => {
    const kit = createTossPayments({
      secretKey: sk,
      orders,
      depositSecrets,
      billingKeys,
      webhook: { dedupe },
    });
    expectTypeOf(kit.confirm).toEqualTypeOf<ConfirmFlow<'test'>>();
    expectTypeOf(kit.webhook).toEqualTypeOf<WebhookVerifier>();
    expectTypeOf(kit.events).toEqualTypeOf<TossEvents>();
    expectTypeOf(kit.billing).toEqualTypeOf<BillingFlow<'test', {}>>();
  });
});

describe('§2 오버로드 — 키 쌍 규칙을 오버로드 불충족으로 선차단', () => {
  it('위젯 시크릿 키 파사드 — confirm/webhook은 되고 billing 배선은 컴파일 에러', () => {
    const widgetKit = createTossPayments({ secretKey: gsk, orders, webhook: { dedupe } });
    expectTypeOf(widgetKit.client).toEqualTypeOf<TossServerClient<'test', 'widget'>>();
    expectTypeOf(widgetKit.confirm).toEqualTypeOf<ConfirmFlow<'test'>>();

    // @ts-expect-error 위젯 시크릿 키 + billingKeys — 오버로드 불충족(빌링은 API 키 전용, 400 INVALID_API_KEY 선차단)
    createTossPayments({ secretKey: gsk, orders, billingKeys });

    // @ts-expect-error 위젯 시크릿 키 + billing capabilities — 오버로드 불충족(키 쌍 규칙)
    createTossPayments({ secretKey: gsk, billing: { capabilities: {} } });
  });

  it('raw string 키 미수용(§7-1 기각) — 브랜드 파서 통과가 유일한 경로', () => {
    // @ts-expect-error raw string 키 — parseApiSecretKey/parseWidgetSecretKey 통과 필수
    createTossPayments({ secretKey: 'test_sk_abcdef', orders });
  });
});

describe('§3.6 billing approve — 파사드에서도 멱등키 상시 강제', () => {
  it('capability 선언 없이도 approve의 options와 idempotencyKey가 필수', () => {
    const kit = createTossPayments({
      secretKey: sk,
      billingKeys,
    });
    const profile = forge<BillingProfile>();
    const order = forge<BillingOrder>();

    // @ts-expect-error 멱등키 없는 approve — 모든 구성에서 타입 필수
    void kit.billing.approve(profile, order);

    void kit.billing.approve(profile, order, { idempotencyKey: forge<IdempotencyKey>() }); // 정상 경로
  });
});

describe('defineTossPaymentsConfig — const 추론 고정(타입 보존 identity)', () => {
  it('간접 전달에도 배선 판정이 보존된다', () => {
    const config = defineTossPaymentsConfig({ secretKey: sk, orders, webhook: { dedupe } });
    // orders/webhook 배선 사실이 config 타입에 남는다
    expectTypeOf(config.orders).toEqualTypeOf<OrderStore>();

    const kit = createTossPayments(config);
    expectTypeOf(kit.confirm).toEqualTypeOf<ConfirmFlow<'test'>>();
    expectTypeOf(kit.webhook).toEqualTypeOf<WebhookVerifier>();

    // @ts-expect-error billingKeys 미배선 — 간접 전달 후에도 billing 부재 판정 유지
    void kit.billing;
  });
});
