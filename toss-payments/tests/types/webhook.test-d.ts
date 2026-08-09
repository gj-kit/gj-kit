import { describe, expectTypeOf, it } from 'vitest';

import { createWebhookVerifier } from '../../src/webhook';
import type {
  AcceptedWebhook,
  DepositCallbackEvent,
  IncomingHeaders,
  PaymentStatusChangedEvent,
  SecurityKey,
  Unverified,
  WebhookHandlers,
  WebhookVerdict,
  WebhookVerifier,
} from '../../src/webhook';

const forge = <T>(): T => undefined as T; // 타입 테스트 전용 헬퍼

describe('웹훅 오용 = 컴파일 에러 (설계 §3.4)', () => {
  it('파싱된 객체로 verify 불가 — raw body(string | Uint8Array)만 허용', () => {
    const verifier = forge<WebhookVerifier>();
    const headers = forge<IncomingHeaders>();
    const parsed = forge<Record<string, unknown>>();
    // @ts-expect-error 파싱된 객체로 verify — 서명 검증이 원천 불가능해진다
    void verifier.verify(parsed, headers);
    // 정상 경로는 둘 다 허용
    void verifier.verify('raw', headers);
    void verifier.verify(new Uint8Array(), headers);
  });

  it('dedupe store 없이 verifier 생성 불가 (재전송 7회 + 가상계좌 이중 이벤트)', () => {
    const secKey = forge<SecurityKey>();
    // @ts-expect-error dedupe는 필수 인자
    createWebhookVerifier({ securityKeys: [secKey] });
    // @ts-expect-error 빈 설정도 불가
    createWebhookVerifier({});
  });

  it('onBillingApproved 핸들러 키는 존재하지 않는다 — 빌링 승인 웹훅 부재', () => {
    const verifier = forge<WebhookVerifier>();
    // @ts-expect-error 토스가 빌링 승인 웹훅을 제공하지 않는다 — 핸들러 키 자체가 없음
    verifier.fetchHandler({ onBillingApproved: async () => {} });
    // @ts-expect-error keyof에도 존재하지 않는다
    const key: keyof WebhookHandlers = 'onBillingApproved';
    void key;
  });

  it('서명 등급의 이벤트는 payout/seller뿐 — DEPOSIT_CALLBACK 협착 불가', () => {
    const accepted = forge<AcceptedWebhook>();
    if (accepted.trust === 'signature') {
      // @ts-expect-error 서명은 payout/seller에만 존재 — DEPOSIT_CALLBACK은 서명 등급이 아니다
      const bad: 'DEPOSIT_CALLBACK' = accepted.event.eventType;
      void bad;
      expectTypeOf(accepted.event.eventType).toEqualTypeOf<'payout.changed' | 'seller.changed'>();
    }
    if (accepted.trust === 'secret') {
      expectTypeOf(accepted.event.eventType).toEqualTypeOf<'DEPOSIT_CALLBACK'>();
    }
  });

  it('DEPOSIT_CALLBACK에는 paymentKey가 없다 — orderId 기반 설계 강제', () => {
    const deposit = forge<DepositCallbackEvent>();
    // @ts-expect-error paymentKey 없음 — orderId가 1급 키
    void deposit.paymentKey;
    // @ts-expect-error secret은 검증 후 제거 — 타입에도 없다
    void deposit.secret;
    expectTypeOf(deposit.orderId).toEqualTypeOf<string>();
  });

  it('duplicate는 Err가 아닌 정상 verdict variant', () => {
    const verdict = forge<WebhookVerdict>();
    if (verdict.duplicate) {
      expectTypeOf(verdict.transmissionId).toEqualTypeOf<string>();
      // @ts-expect-error duplicate variant에는 webhook이 없다
      void verdict.webhook;
    } else {
      expectTypeOf(verdict.webhook).toEqualTypeOf<AcceptedWebhook>();
    }
  });

  it('핸들러 파라미터는 신뢰 등급이 결합된 타입이다', () => {
    type PaymentStatusHandlerArg = Parameters<
      NonNullable<WebhookHandlers['onPaymentStatusChanged']>
    >[0];
    expectTypeOf<PaymentStatusHandlerArg>().toExtend<Unverified>();
    expectTypeOf<PaymentStatusHandlerArg['event']>().toEqualTypeOf<PaymentStatusChangedEvent>();
    // Unverified에는 refetch가 있다 — payload 직접 신뢰 대신 재조회 유도
    expectTypeOf<PaymentStatusHandlerArg['refetch']>().toBeFunction();
  });
});
