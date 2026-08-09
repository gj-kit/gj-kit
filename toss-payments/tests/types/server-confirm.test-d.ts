import { describe, expectTypeOf, it } from 'vitest';

import { createConfirmFlow } from '../../src/server';
import type {
  ConfirmError,
  ConfirmFlow,
  ConfirmedPayment,
  DepositSecretStore,
  OrderStore,
  TossEvents,
  TossServerClient,
  UnverifiedCallback,
  VerifiedCheckout,
} from '../../src/server';
import type { OrderId, PaymentKey } from '../../src/index';

const forge = <T>(): T => undefined as T; // 타입 테스트 전용 헬퍼

describe('§3.1 confirm — 오용 = 컴파일 에러', () => {
  it('검증 안 된 콜백/수제 조립/스토어 생략은 전부 컴파일 에러', () => {
    const unverified = forge<UnverifiedCallback>();
    const flow = forge<ConfirmFlow<'test'>>();
    const pk = forge<PaymentKey>();
    const oid = forge<OrderId>();

    // @ts-expect-error 검증 안 된 콜백을 confirm에 직접 — VerifiedCheckout만 허용
    void flow.confirm(unverified);

    // @ts-expect-error VerifiedCheckout 수제 조립 — 브랜드 심볼이 비공개라 충족 불가
    void flow.confirm({
      paymentKey: pk,
      orderId: oid,
      amount: 1000,
      verifiedAt: new Date(),
      approvalDeadline: new Date(),
    });

    const client = forge<TossServerClient<'test', 'api'>>();
    // @ts-expect-error OrderStore 없이 플로우 생성 불가 — 금액 비교 원본 강제
    void createConfirmFlow(client);
  });

  it('정상 경로는 컴파일된다 — 위젯 키(gsk) 클라이언트도 confirm 플로우 생성 가능(키 쌍 규칙)', () => {
    const apiClient = forge<TossServerClient<'test', 'api'>>();
    const widgetClient = forge<TossServerClient<'test', 'widget'>>();
    const store = forge<OrderStore>();
    void createConfirmFlow(apiClient, store);
    void createConfirmFlow(widgetClient, store);

    const flow = forge<ConfirmFlow<'test'>>();
    const verified = forge<VerifiedCheckout>();
    void flow.confirm(verified);
  });
});

describe('§3.1/§3.7 v1.1 additive — depositSecrets 옵션 + resolveFailure', () => {
  it('ConfirmFlowOptions — depositSecrets/onDepositSecretSaveFailed/events는 전부 옵셔널(파괴 없음)', () => {
    const client = forge<TossServerClient<'test', 'api'>>();
    const store = forge<OrderStore>();
    // 기존 호출 형태 그대로 유효
    void createConfirmFlow(client, store);
    void createConfirmFlow(client, store, { approvalWindowMs: 600_000 });
    // 신규 옵션 결합
    void createConfirmFlow(client, store, {
      depositSecrets: forge<DepositSecretStore>(),
      onDepositSecretSaveFailed: (info) => {
        // 통지 payload에 secret 필드가 없다 — 유출 방지 확정 표
        expectTypeOf(info).toEqualTypeOf<{
          readonly orderId: OrderId;
          readonly paymentKey: PaymentKey;
          readonly cause: unknown;
        }>();
      },
      events: forge<TossEvents>(),
    });

    // @ts-expect-error getSecret 없는 객체는 DepositSecretStore가 아니다 — 웹훅측 대조 배선 강제
    void createConfirmFlow(client, store, { depositSecrets: { saveSecret: forge<DepositSecretStore['saveSecret']>() } });
  });

  it('resolveFailure — ConfirmResolution 3분기 판별 유니언', () => {
    const flow = forge<ConfirmFlow<'test'>>();
    const resolution = forge<Awaited<ReturnType<ConfirmFlow<'test'>['resolveFailure']>>>();
    void flow.resolveFailure(forge<OrderId>(), forge<ConfirmError>());
    if (resolution.ok) {
      if (resolution.value.resolution === 'actually-confirmed') {
        expectTypeOf(resolution.value.payment).toEqualTypeOf<ConfirmedPayment>();
      }
      if (resolution.value.resolution === 'definitively-failed') {
        expectTypeOf(resolution.value.error).toEqualTypeOf<ConfirmError>();
      }
      if (resolution.value.resolution === 'retry-payment') {
        // @ts-expect-error retry-payment variant에는 payment가 없다
        void resolution.value.payment;
      }
    }
  });
});
