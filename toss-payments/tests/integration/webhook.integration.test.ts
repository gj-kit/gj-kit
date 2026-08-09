/**
 * 시나리오 9 — 웹훅 시뮬레이션 (Phase 0 확정: 실수신 자동화 불가 → 픽스처 왕복이 공식 대체 경로).
 *
 * - 서명 생성→검증 왕복 (키 로테이션 배열 포함)
 * - DEPOSIT_CALLBACK secret 대조 — 픽스처 secret 사용 (refetch 테스트는 실 승인 응답 secret 사용;
 *   실측: 테스트 환경에서는 빌링 승인 응답에도 secret이 내려온다 — 문서와 다른 실측 확정)
 * - dedupe: 같은 전송(transmission-id) 2회째는 duplicate verdict
 * - DEPOSIT_CALLBACK orderId 기반 refetch: **실 클라이언트**로 getPaymentByOrderId → 실제 Payment
 */
import { afterAll, describe, expect, it } from 'vitest';

import { orderId } from '../../src/server';
import { createWebhookVerifier, parseSecurityKey } from '../../src/webhook';
import type { SecurityKey, WebhookVerdict } from '../../src/webhook';
import { memoryDedupeStore, webhookFixture } from '../../src/testing';
import type { PaidBillingFixture } from './helpers';
import {
  createIntegrationContext,
  createPaidBillingPayment,
  expectErr,
  expectOk,
  pace,
} from './helpers';

const ctx = createIntegrationContext();
afterAll(() => ctx.cleanup(), 60_000);

/** 64자 hex 보안 키 무작위 생성 — 실제 TOSS_SECURITY_KEY를 테스트 로그에 노출하지 않기 위함. */
function randomSecurityKey(): SecurityKey {
  const bytes = new Uint8Array(32);
  globalThis.crypto.getRandomValues(bytes);
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  const parsed = parseSecurityKey(hex);
  if (!parsed.ok) throw new Error(`테스트 보안 키 생성 실패: ${JSON.stringify(parsed.error)}`);
  return parsed.value;
}

function expectFresh(verdict: WebhookVerdict, label: string): Extract<WebhookVerdict, { duplicate: false }> {
  if (verdict.duplicate) {
    throw new Error(`${label} — 신규 verdict 기대, 실제 duplicate: ${JSON.stringify(verdict)}`);
  }
  return verdict;
}

// 실 결제 픽스처 — refetch 테스트 전용 (캐시로 1회만 생성)
let paymentCache: Promise<PaidBillingFixture> | null = null;
function realPayment(): Promise<PaidBillingFixture> {
  paymentCache ??= createPaidBillingPayment(ctx, 1000);
  return paymentCache;
}

describe('서명 생성→검증 왕복 (payout.changed)', () => {
  it('로테이션 배열의 두 번째 키로 서명해도 통과하고, 키가 없으면 invalid-signature', async () => {
    const oldKey = randomSecurityKey();
    const newKey = randomSecurityKey();
    const payload = await webhookFixture.signedEvent({
      eventType: 'payout.changed',
      entityBody: { payoutKey: 'payout-integration-1', status: 'COMPLETED' },
      securityKey: newKey, // 로테이션 후 새 키로 서명
    });

    // 로테이션 병행 기간 — [구키, 신키] 배열 중 하나만 맞으면 통과
    const rotating = createWebhookVerifier({
      dedupe: memoryDedupeStore(),
      securityKeys: [oldKey, newKey],
    });
    const verdict = expectFresh(
      expectOk(await rotating.verify(payload.rawBody, payload.headers), '서명 왕복 — 로테이션 배열'),
      '서명 왕복',
    );
    expect(verdict.webhook.trust).toBe('signature');
    if (verdict.webhook.trust !== 'signature') throw new Error('trust=signature 내로잉 실패');
    expect(verdict.webhook.event.eventType).toBe('payout.changed');
    expect(verdict.webhook.event.entityType).toBe('payout');

    // 서명 키를 모르는 verifier — 거부되어야 한다
    const stranger = createWebhookVerifier({
      dedupe: memoryDedupeStore(),
      securityKeys: [oldKey],
    });
    const rejection = expectErr(
      await stranger.verify(payload.rawBody, payload.headers),
      '서명 왕복 — 키 불일치',
    );
    expect(rejection.kind, JSON.stringify(rejection)).toBe('invalid-signature');
  });
});

describe('DEPOSIT_CALLBACK secret 대조', () => {
  it('저장된 secret과 일치하면 SecretVerified, 이벤트에는 secret이 남지 않는다', async () => {
    const secret = globalThis.crypto.randomUUID();
    const depositOrderId = 'gjwh-deposit-123456';
    const payload = webhookFixture.depositCallback({ orderId: depositOrderId, secret });

    const verifier = createWebhookVerifier({
      dedupe: memoryDedupeStore(),
      depositSecrets: {
        getSecret: async (oid) => (oid === depositOrderId ? secret : null),
      },
    });
    const verdict = expectFresh(
      expectOk(await verifier.verify(payload.rawBody, payload.headers), 'secret 대조 — 일치'),
      'secret 대조',
    );
    expect(verdict.webhook.trust).toBe('secret');
    if (verdict.webhook.trust !== 'secret') throw new Error('trust=secret 내로잉 실패');
    expect(verdict.webhook.event.eventType).toBe('DEPOSIT_CALLBACK');
    expect(verdict.webhook.event.orderId).toBe(depositOrderId);
    // 검증 소비 후 secret은 이벤트 어디에도 남지 않는다(로그 유출 방지 규약)
    expect('secret' in verdict.webhook.event).toBe(false);
    expect(JSON.stringify(verdict.webhook.event)).not.toContain(secret);

    // 불일치 — 위조 의심 거부
    const wrongStore = createWebhookVerifier({
      dedupe: memoryDedupeStore(),
      depositSecrets: { getSecret: async () => 'different-secret-value' },
    });
    const otherPayload = webhookFixture.depositCallback({ orderId: depositOrderId, secret });
    const rejection = expectErr(
      await wrongStore.verify(otherPayload.rawBody, otherPayload.headers),
      'secret 대조 — 불일치',
    );
    expect(rejection.kind, JSON.stringify(rejection)).toBe('secret-mismatch');
  });
});

describe('dedupe — 재전송/이중 수신', () => {
  it('같은 픽스처 산출물(같은 transmission-id) 2회째 verify는 duplicate verdict', async () => {
    const verifier = createWebhookVerifier({ dedupe: memoryDedupeStore() });
    const payload = webhookFixture.legacyEvent('BILLING_DELETED', {
      billingKey: 'wh-dedupe-billing-key',
      reason: '고객 요청',
    });

    const first = expectOk(await verifier.verify(payload.rawBody, payload.headers), 'dedupe — 1회째');
    expectFresh(first, 'dedupe — 1회째');

    const second = expectOk(await verifier.verify(payload.rawBody, payload.headers), 'dedupe — 2회째');
    if (!second.duplicate) {
      throw new Error(`dedupe — duplicate 기대, 실제: ${JSON.stringify(second)}`);
    }
    expect(second.transmissionId).toBe(
      payload.headers['tosspayments-webhook-transmission-id'],
    );
  });
});

describe('DEPOSIT_CALLBACK → orderId 기반 refetch (실 클라이언트)', () => {
  it(
    '검증 통과한 이벤트의 orderId로 getPaymentByOrderId → 실제 Payment 획득',
    async () => {
      const fixture = await realPayment();
      // ⚠ 실측(2026-08-09, 리서치 문서와 다름): 문서는 secret을 가상계좌 검증용으로만
      // 기술하지만, 테스트 환경에서는 빌링(카드) 승인 응답에도 secret(ps_…)이 내려온다.
      // 실측 기준으로 고정하고, DEPOSIT_CALLBACK 대조는 실제 승인 응답의 secret을 사용한다
      // (승인 시 secret 저장 → 웹훅 secret 대조 — 프로덕션 흐름과 동형).
      const realSecret = fixture.payment.secret;
      if (realSecret === null) {
        throw new Error(
          `실측 고정 위반 — 빌링 승인 응답에 secret이 없습니다(테스트 환경 동작 변경?): ${JSON.stringify(fixture.payment.raw)}`,
        );
      }
      const realOrderId = String(fixture.payment.orderId);

      const payload = webhookFixture.depositCallback({
        orderId: realOrderId,
        secret: realSecret,
        status: 'DONE',
      });
      const verifier = createWebhookVerifier({
        dedupe: memoryDedupeStore(),
        depositSecrets: {
          getSecret: async (oid) => (oid === realOrderId ? realSecret : null),
        },
      });
      const verdict = expectFresh(
        expectOk(await verifier.verify(payload.rawBody, payload.headers), 'refetch — verify'),
        'refetch',
      );
      if (verdict.webhook.trust !== 'secret') {
        throw new Error(`trust=secret 기대, 실제: ${verdict.webhook.trust}`);
      }

      // 이벤트의 orderId(plain string) → 스마트 생성자 → 실 클라이언트 재조회
      const oid = expectOk(orderId(verdict.webhook.event.orderId), 'refetch — orderId 파싱');
      await pace();
      const payment = expectOk(
        await ctx.client.getPaymentByOrderId(oid),
        'refetch — getPaymentByOrderId',
      );
      expect(payment.paymentKey, JSON.stringify(payment.raw)).toBe(fixture.payment.paymentKey);
      expect(payment.type, JSON.stringify(payment.raw)).toBe('BILLING');
      expect(payment.totalAmount).toBe(1000);
    },
    60_000,
  );
});
