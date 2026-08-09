import { describe, it } from 'vitest';

import { createConfirmFlow } from '../../src/server';
import type {
  ConfirmFlow,
  OrderStore,
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
