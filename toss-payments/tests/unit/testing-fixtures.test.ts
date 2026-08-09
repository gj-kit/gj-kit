import { describe, expect, it } from 'vitest';

import { orThrow } from '../../src/index';
import { signWebhookPayload, memoryDedupeStore, webhookFixture } from '../../src/testing';
import { createWebhookVerifier, parseSecurityKey, parseTossTimestamp } from '../../src/webhook';
import type { SecurityKey, WebhookVerifierConfig } from '../../src/webhook';

// ── 헬퍼 ───────────────────────────────────────────────────────────────────

const KEY_HEX = '0123456789abcdef'.repeat(4);
const OTHER_KEY_HEX = 'fedcba9876543210'.repeat(4);

function secKey(hex: string): SecurityKey {
  return orThrow(parseSecurityKey(hex));
}

/** 픽스처가 실제 verifier를 통과하는지가 검증 대상 — 테스트 대역 없이 진짜 verifier 사용. */
function makeVerifier(overrides?: Partial<WebhookVerifierConfig>) {
  return createWebhookVerifier({
    dedupe: memoryDedupeStore(),
    securityKeys: [secKey(KEY_HEX)],
    depositSecrets: {
      getSecret: (orderId) => Promise.resolve(orderId === 'order-va-1' ? 'sec-1' : null),
    },
    ...overrides,
  });
}

function bodyOf(rawBody: string): Record<string, unknown> {
  return JSON.parse(rawBody) as Record<string, unknown>;
}

// ── signedEvent — 서명 생성→검증 왕복 ──────────────────────────────────────

describe('webhookFixture.signedEvent', () => {
  it('생성한 서명이 실제 verify를 통과한다 (SignatureVerified)', async () => {
    const fx = await webhookFixture.signedEvent({
      eventType: 'payout.changed',
      entityBody: { id: 'po-1', status: 'COMPLETED' },
      securityKey: secKey(KEY_HEX),
    });
    const r = await makeVerifier().verify(fx.rawBody, fx.headers);
    expect(r.ok).toBe(true);
    if (!r.ok || r.value.duplicate) return;
    expect(r.value.webhook.trust).toBe('signature');
    if (r.value.webhook.trust !== 'signature') return;
    expect(r.value.webhook.event.eventType).toBe('payout.changed');
    expect(r.value.webhook.event.entityType).toBe('payout');
    expect(r.value.webhook.event.entityBody).toEqual({ id: 'po-1', status: 'COMPLETED' });
  });

  it('seller.changed는 entityType seller로 합성된다', async () => {
    const fx = await webhookFixture.signedEvent({
      eventType: 'seller.changed',
      entityBody: { id: 'seller-1' },
      securityKey: secKey(KEY_HEX),
    });
    const r = await makeVerifier().verify(fx.rawBody, fx.headers);
    expect(r.ok).toBe(true);
    if (!r.ok || r.value.duplicate || r.value.webhook.trust !== 'signature') return;
    expect(r.value.webhook.event.eventType).toBe('seller.changed');
    expect(r.value.webhook.event.entityType).toBe('seller');
  });

  it('다른 보안 키의 verifier에서는 invalid-signature로 거절된다', async () => {
    const fx = await webhookFixture.signedEvent({
      eventType: 'payout.changed',
      entityBody: null,
      securityKey: secKey(KEY_HEX),
    });
    const r = await makeVerifier({ securityKeys: [secKey(OTHER_KEY_HEX)] }).verify(
      fx.rawBody,
      fx.headers,
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.kind).toBe('invalid-signature');
  });

  it('transmissionTime 지정 시 헤더·서명 대상에 그대로 반영된다', async () => {
    const time = '2026-08-09T12:00:00+09:00';
    const fx = await webhookFixture.signedEvent({
      eventType: 'payout.changed',
      entityBody: { id: 'po-2' },
      securityKey: secKey(KEY_HEX),
      transmissionTime: time,
    });
    expect(fx.headers['tosspayments-webhook-transmission-time']).toBe(time);
    const r = await makeVerifier().verify(fx.rawBody, fx.headers);
    expect(r.ok).toBe(true);
  });

  it('entityBody undefined는 null로 직렬화된다 — 신형 봉투 판별(entityBody 키 존재) 유지', async () => {
    const fx = await webhookFixture.signedEvent({
      eventType: 'payout.changed',
      entityBody: undefined,
      securityKey: secKey(KEY_HEX),
    });
    expect('entityBody' in bodyOf(fx.rawBody)).toBe(true);
    const r = await makeVerifier().verify(fx.rawBody, fx.headers);
    expect(r.ok).toBe(true);
    if (!r.ok || r.value.duplicate) return;
    expect(r.value.webhook.trust).toBe('signature');
  });
});

describe('signWebhookPayload', () => {
  it('"v1:" 접두사 + base64(HMAC-SHA256 32바이트) 형식을 만든다', async () => {
    const signature = await signWebhookPayload(
      '{"a":1}',
      '2026-08-09T12:00:00+09:00',
      secKey(KEY_HEX),
    );
    expect(signature.startsWith('v1:')).toBe(true);
    expect(atob(signature.slice(3)).length).toBe(32);
  });

  it('같은 입력이면 결정적, transmissionTime이 다르면 서명도 달라진다', async () => {
    const key = secKey(KEY_HEX);
    const a = await signWebhookPayload('{"a":1}', '2026-08-09T12:00:00+09:00', key);
    const b = await signWebhookPayload('{"a":1}', '2026-08-09T12:00:00+09:00', key);
    const c = await signWebhookPayload('{"a":1}', '2026-08-09T12:00:01+09:00', key);
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });
});

// ── depositCallback — secret 대조 ──────────────────────────────────────────

describe('webhookFixture.depositCallback', () => {
  it('저장된 secret과 일치하면 SecretVerified로 통과한다', async () => {
    const fx = webhookFixture.depositCallback({ orderId: 'order-va-1', secret: 'sec-1' });
    const r = await makeVerifier().verify(fx.rawBody, fx.headers);
    expect(r.ok).toBe(true);
    if (!r.ok || r.value.duplicate) return;
    expect(r.value.webhook.trust).toBe('secret');
    if (r.value.webhook.trust !== 'secret') return;
    expect(r.value.webhook.event.eventType).toBe('DEPOSIT_CALLBACK');
    expect(r.value.webhook.event.orderId).toBe('order-va-1');
    expect(r.value.webhook.event.status).toBe('DONE'); // 기본값
    // secret은 검증에 소비된 뒤 이벤트에 남지 않는다 (verifier 규약 왕복 확인)
    expect('secret' in r.value.webhook.event).toBe(false);
  });

  it('secret 불일치는 secret-mismatch로 거절된다 (위조 시뮬레이션)', async () => {
    const fx = webhookFixture.depositCallback({ orderId: 'order-va-1', secret: 'wrong' });
    const r = await makeVerifier().verify(fx.rawBody, fx.headers);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.kind).toBe('secret-mismatch');
  });

  it('status·transactionKey 지정이 본문에 반영된다', async () => {
    const fx = webhookFixture.depositCallback({
      orderId: 'order-va-1',
      secret: 'sec-1',
      status: 'WAITING_FOR_DEPOSIT',
      transactionKey: 'txn-fixed',
    });
    const body = bodyOf(fx.rawBody);
    expect(body['status']).toBe('WAITING_FOR_DEPOSIT');
    expect(body['transactionKey']).toBe('txn-fixed');
    expect('eventType' in body).toBe(false); // 평탄 구조 — eventType 부재가 판별 조건
    expect('paymentKey' in body).toBe(false);
  });

  it('createdAt은 ±hh:mm 오프셋 형식 — parseTossTimestamp를 통과한다', () => {
    const fx = webhookFixture.depositCallback({ orderId: 'o', secret: 's' });
    const createdAt = bodyOf(fx.rawBody)['createdAt'];
    expect(typeof createdAt).toBe('string');
    expect(createdAt).toMatch(/\+09:00$/);
    expect(parseTossTimestamp(createdAt as string).ok).toBe(true);
  });
});

// ── paymentStatusChanged / legacyEvent ─────────────────────────────────────

describe('webhookFixture.paymentStatusChanged', () => {
  it('verify 왕복 — Unverified 등급 PAYMENT_STATUS_CHANGED로 판별된다', async () => {
    const fx = webhookFixture.paymentStatusChanged({
      payment: { paymentKey: 'pay_123', orderId: 'order-abc1', status: 'CANCELED' },
    });
    const r = await makeVerifier().verify(fx.rawBody, fx.headers);
    expect(r.ok).toBe(true);
    if (!r.ok || r.value.duplicate) return;
    expect(r.value.webhook.trust).toBe('unverified');
    if (r.value.webhook.trust !== 'unverified') return;
    expect(r.value.webhook.event.eventType).toBe('PAYMENT_STATUS_CHANGED');
    if (r.value.webhook.event.eventType !== 'PAYMENT_STATUS_CHANGED') return;
    expect(r.value.webhook.event.data.paymentKey).toBe('pay_123');
    expect(r.value.webhook.event.data.status).toBe('CANCELED');
  });

  it('기본 Payment 원문 위에 입력이 덮어써진다 (입력 우선)', () => {
    const fx = webhookFixture.paymentStatusChanged({
      payment: { paymentKey: 'pay_1', orderId: 'order-1', status: 'DONE', totalAmount: 99_000 },
    });
    const data = bodyOf(fx.rawBody)['data'] as Record<string, unknown>;
    expect(data['totalAmount']).toBe(99_000); // 입력 우선
    expect(data['currency']).toBe('KRW'); // 기본값 채움
    expect(data['method']).toBe('카드');
    expect(data['balanceAmount']).toBe(1000);
  });

  it('createdAt은 마이크로초 6자리 무오프셋 형식 — parseTossTimestamp를 통과한다', () => {
    const fx = webhookFixture.paymentStatusChanged({
      payment: { paymentKey: 'p', orderId: 'o', status: 'DONE' },
    });
    const createdAt = bodyOf(fx.rawBody)['createdAt'];
    expect(createdAt).toMatch(/\.\d{6}$/);
    expect(parseTossTimestamp(createdAt as string).ok).toBe(true);
  });
});

describe('webhookFixture.legacyEvent', () => {
  it('구형 이벤트(BILLING_DELETED)를 그대로 합성한다', async () => {
    const fx = webhookFixture.legacyEvent('BILLING_DELETED', {
      billingKey: 'bill_x',
      reason: '고객 요청',
    });
    const r = await makeVerifier().verify(fx.rawBody, fx.headers);
    expect(r.ok).toBe(true);
    if (!r.ok || r.value.duplicate || r.value.webhook.trust !== 'unverified') return;
    expect(r.value.webhook.event.eventType).toBe('BILLING_DELETED');
  });

  it('미지의 eventType은 UNKNOWN 전방 호환 래퍼로 수용된다 (400 아님)', async () => {
    const fx = webhookFixture.legacyEvent('SOMETHING_NEW', { anything: true });
    const r = await makeVerifier().verify(fx.rawBody, fx.headers);
    expect(r.ok).toBe(true);
    if (!r.ok || r.value.duplicate || r.value.webhook.trust !== 'unverified') return;
    expect(r.value.webhook.event.eventType).toBe('UNKNOWN');
    if (r.value.webhook.event.eventType !== 'UNKNOWN') return;
    expect(r.value.webhook.event.rawEventType).toBe('SOMETHING_NEW');
  });
});

// ── 헤더/중복 수신 ─────────────────────────────────────────────────────────

describe('픽스처 헤더', () => {
  it('호출마다 새 transmission-id를 발급한다', () => {
    const a = webhookFixture.depositCallback({ orderId: 'o', secret: 's' });
    const b = webhookFixture.depositCallback({ orderId: 'o', secret: 's' });
    expect(a.headers['tosspayments-webhook-transmission-id']).not.toBe(
      b.headers['tosspayments-webhook-transmission-id'],
    );
    expect(a.headers['tosspayments-webhook-transmission-retried-count']).toBe('0');
  });

  it('같은 픽스처를 재사용하면 두 번째 verify는 duplicate verdict (재전송 시뮬레이션)', async () => {
    const verifier = makeVerifier();
    const fx = webhookFixture.depositCallback({ orderId: 'order-va-1', secret: 'sec-1' });
    const first = await verifier.verify(fx.rawBody, fx.headers);
    const second = await verifier.verify(fx.rawBody, fx.headers);
    expect(first.ok && !first.value.duplicate).toBe(true);
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.value.duplicate).toBe(true);
  });
});
