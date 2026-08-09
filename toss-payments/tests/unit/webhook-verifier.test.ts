import { describe, expect, it } from 'vitest';

import { ok, orThrow } from '../../src/index';
import type { Payment } from '../../src/index';
import { createWebhookVerifier, parseSecurityKey } from '../../src/webhook';
import type {
  PaymentLookup,
  SecurityKey,
  WebhookDedupeStore,
  WebhookVerifierConfig,
} from '../../src/webhook';

// ── 테스트 픽스처 ──────────────────────────────────────────────────────────

const KEY_A_HEX = '0123456789abcdef'.repeat(4);
const KEY_B_HEX = 'fedcba9876543210'.repeat(4);
const TIME = '2026-08-09T12:00:00+09:00';

function secKey(hex: string): SecurityKey {
  return orThrow(parseSecurityKey(hex));
}

/** 검증기 내부와 동일한 산식으로 유효 서명을 생성한다 — 생성→검증 왕복 테스트용. */
async function signPayload(rawBody: string, transmissionTime: string, keyHex: string): Promise<string> {
  const keyBytes = new Uint8Array(keyHex.length / 2);
  for (let i = 0; i < keyBytes.length; i++) {
    keyBytes[i] = Number.parseInt(keyHex.slice(i * 2, i * 2 + 2), 16);
  }
  const key = await globalThis.crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const mac = new Uint8Array(
    await globalThis.crypto.subtle.sign(
      'HMAC',
      key,
      new TextEncoder().encode(`${rawBody}:${transmissionTime}`),
    ),
  );
  return `v1:${btoa(String.fromCharCode(...mac))}`;
}

function memoryDedupe(): WebhookDedupeStore & { readonly seen: Set<string> } {
  const seen = new Set<string>();
  return {
    seen,
    claim: (id) => {
      if (seen.has(id)) return Promise.resolve(false);
      seen.add(id);
      return Promise.resolve(true);
    },
  };
}

let seq = 0;
function headersFor(extra?: Record<string, string>): Record<string, string> {
  seq += 1;
  return {
    'tosspayments-webhook-transmission-id': `tx-${seq}`,
    'tosspayments-webhook-transmission-time': TIME,
    'tosspayments-webhook-transmission-retried-count': '0',
    ...extra,
  };
}

function verifier(overrides?: Partial<WebhookVerifierConfig>) {
  return createWebhookVerifier({
    dedupe: memoryDedupe(),
    securityKeys: [secKey(KEY_A_HEX)],
    depositSecrets: { getSecret: (orderId) => Promise.resolve(orderId === 'order-va-1' ? 'sec-1' : null) },
    ...overrides,
  });
}

const PAYOUT_BODY = JSON.stringify({
  eventType: 'payout.changed',
  createdAt: TIME,
  version: '2022-11-16',
  eventId: 'evt-1',
  entityType: 'payout',
  entityBody: { id: 'po-1', status: 'COMPLETED' },
});

const DEPOSIT_BODY = JSON.stringify({
  createdAt: '2022-06-09T15:40:09+09:00',
  secret: 'sec-1',
  status: 'DONE',
  transactionKey: 'tx-key-1',
  orderId: 'order-va-1',
});

const LEGACY_BODY = JSON.stringify({
  eventType: 'PAYMENT_STATUS_CHANGED',
  createdAt: '2026-08-09T12:00:00.000000',
  data: { paymentKey: 'pay_123', orderId: 'order-abc1', status: 'DONE', totalAmount: 1000 },
});

// ── 서명 검증 (payout/seller) ──────────────────────────────────────────────

describe('verify — HMAC 서명 (payout.changed / seller.changed)', () => {
  it('생성→검증 왕복: 유효 서명이면 SignatureVerified', async () => {
    const signature = await signPayload(PAYOUT_BODY, TIME, KEY_A_HEX);
    const r = await verifier().verify(
      PAYOUT_BODY,
      headersFor({ 'tosspayments-webhook-signature': signature }),
    );
    expect(r.ok).toBe(true);
    if (!r.ok || r.value.duplicate) return;
    expect(r.value.webhook.trust).toBe('signature');
    if (r.value.webhook.trust !== 'signature') return;
    expect(r.value.webhook.event.eventType).toBe('payout.changed');
    expect(r.value.webhook.meta.transmissionTime).toBe(TIME);
  });

  it('rawBody를 Uint8Array로 넘겨도 동일하게 검증된다', async () => {
    const signature = await signPayload(PAYOUT_BODY, TIME, KEY_A_HEX);
    const r = await verifier().verify(
      new TextEncoder().encode(PAYOUT_BODY),
      headersFor({ 'tosspayments-webhook-signature': signature }),
    );
    expect(r.ok).toBe(true);
  });

  it('본문 변조 → invalid-signature', async () => {
    const signature = await signPayload(PAYOUT_BODY, TIME, KEY_A_HEX);
    const tampered = PAYOUT_BODY.replace('COMPLETED', 'FAILED___');
    const r = await verifier().verify(
      tampered,
      headersFor({ 'tosspayments-webhook-signature': signature }),
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toEqual({ kind: 'invalid-signature', signatureCount: 1, keysTried: 1 });
  });

  it('키 로테이션: 옛 키 서명 + [새 키, 옛 키] 배열 → 통과', async () => {
    const signedWithOld = await signPayload(PAYOUT_BODY, TIME, KEY_A_HEX);
    const v = verifier({ securityKeys: [secKey(KEY_B_HEX), secKey(KEY_A_HEX)] });
    const r = await v.verify(
      PAYOUT_BODY,
      headersFor({ 'tosspayments-webhook-signature': signedWithOld }),
    );
    expect(r.ok).toBe(true);
  });

  it('콤마 구분 복수 서명 중 1개만 일치해도 통과', async () => {
    const good = await signPayload(PAYOUT_BODY, TIME, KEY_A_HEX);
    const bogus = `v1:${btoa('not-a-real-signature-x')}`;
    const r = await verifier().verify(
      PAYOUT_BODY,
      headersFor({ 'tosspayments-webhook-signature': `${bogus}, ${good}` }),
    );
    expect(r.ok).toBe(true);
  });

  it('서명 헤더 누락 → invalid-signature(signatureCount 0)', async () => {
    const r = await verifier().verify(PAYOUT_BODY, headersFor());
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toEqual({ kind: 'invalid-signature', signatureCount: 0, keysTried: 1 });
  });

  it('securityKeys 미주입 상태서 서명 이벤트 수신 → missing-config', async () => {
    const v = createWebhookVerifier({ dedupe: memoryDedupe() });
    const r = await v.verify(PAYOUT_BODY, headersFor());
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toEqual({ kind: 'missing-config', needed: 'securityKeys' });
  });
});

// ── secret 대조 (DEPOSIT_CALLBACK) ─────────────────────────────────────────

describe('verify — DEPOSIT_CALLBACK secret 대조', () => {
  it('저장된 secret과 일치 → SecretVerified, 이벤트에서 secret 제거', async () => {
    const r = await verifier().verify(DEPOSIT_BODY, headersFor());
    expect(r.ok).toBe(true);
    if (!r.ok || r.value.duplicate) return;
    expect(r.value.webhook.trust).toBe('secret');
    if (r.value.webhook.trust !== 'secret') return;
    expect(r.value.webhook.event.orderId).toBe('order-va-1');
    expect(r.value.webhook.event.status).toBe('DONE');
    expect('secret' in r.value.webhook.event).toBe(false);
  });

  it('secret 불일치 → secret-mismatch (위조 의심)', async () => {
    const forged = DEPOSIT_BODY.replace('sec-1', 'wrong');
    const r = await verifier().verify(forged, headersFor());
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toEqual({ kind: 'secret-mismatch', orderId: 'order-va-1' });
  });

  it('저장 누락(getSecret null) → unknown-order', async () => {
    const body = DEPOSIT_BODY.replace('order-va-1', 'order-nope');
    const r = await verifier().verify(body, headersFor());
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toEqual({ kind: 'unknown-order', orderId: 'order-nope' });
  });

  it('depositSecrets 미주입 → missing-config', async () => {
    const v = createWebhookVerifier({ dedupe: memoryDedupe() });
    const r = await v.verify(DEPOSIT_BODY, headersFor());
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toEqual({ kind: 'missing-config', needed: 'depositSecrets' });
  });

  it('getSecret 예외 → store-failure', async () => {
    const v = createWebhookVerifier({
      dedupe: memoryDedupe(),
      depositSecrets: { getSecret: () => Promise.reject(new Error('db down')) },
    });
    const r = await v.verify(DEPOSIT_BODY, headersFor());
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.kind).toBe('store-failure');
  });
});

// ── dedupe ─────────────────────────────────────────────────────────────────

describe('verify — dedupe.claim (진위 통과 후에만)', () => {
  it('같은 transmission-id 2회째 → duplicate verdict (Err 아님)', async () => {
    const v = verifier();
    const headers = headersFor();
    const first = await v.verify(LEGACY_BODY, headers);
    expect(first.ok && !first.value.duplicate).toBe(true);
    const second = await v.verify(LEGACY_BODY, headers);
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.value.duplicate).toBe(true);
    if (!second.value.duplicate) return;
    expect(second.value.transmissionId).toBe(headers['tosspayments-webhook-transmission-id']);
  });

  it('진위 실패 요청은 id를 점유하지 않는다 — 이후 정상 요청이 duplicate가 되면 안 된다', async () => {
    const dedupe = memoryDedupe();
    const v = verifier({ dedupe });
    const headers = headersFor(); // 서명 없음 → invalid-signature
    const rejected = await v.verify(PAYOUT_BODY, headers);
    expect(rejected.ok).toBe(false);
    expect(dedupe.seen.size).toBe(0);

    const signature = await signPayload(PAYOUT_BODY, TIME, KEY_A_HEX);
    const accepted = await v.verify(PAYOUT_BODY, {
      ...headers,
      'tosspayments-webhook-signature': signature,
    });
    expect(accepted.ok).toBe(true);
    if (!accepted.ok) return;
    expect(accepted.value.duplicate).toBe(false);
  });

  it('dedupe.claim 예외 → store-failure', async () => {
    const v = verifier({ dedupe: { claim: () => Promise.reject(new Error('redis down')) } });
    const r = await v.verify(LEGACY_BODY, headersFor());
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.kind).toBe('store-failure');
  });
});

// ── IP 검사 ────────────────────────────────────────────────────────────────

describe('verify — 소스 IP 검사 (context.sourceIp 전달 시에만)', () => {
  it('sourceIp 미전달이면 검사하지 않는다', async () => {
    const r = await verifier().verify(LEGACY_BODY, headersFor());
    expect(r.ok).toBe(true);
  });

  it('기본 내장 목록에 없는 IP → untrusted-source-ip', async () => {
    const r = await verifier().verify(LEGACY_BODY, headersFor(), { sourceIp: '1.2.3.4' });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toEqual({ kind: 'untrusted-source-ip', ip: '1.2.3.4' });
  });

  it('기본 내장 목록의 IP는 통과한다 (문서 발신 IP)', async () => {
    const r = await verifier().verify(LEGACY_BODY, headersFor(), { sourceIp: '13.124.18.147' });
    expect(r.ok).toBe(true);
  });

  it('allowedSourceIps: false → 검사 끔', async () => {
    const v = verifier({ allowedSourceIps: false });
    const r = await v.verify(LEGACY_BODY, headersFor(), { sourceIp: '1.2.3.4' });
    expect(r.ok).toBe(true);
  });

  it('사용자 지정 목록이 기본 목록을 대체한다', async () => {
    const v = verifier({ allowedSourceIps: ['10.0.0.1'] });
    const okCase = await v.verify(LEGACY_BODY, headersFor(), { sourceIp: '10.0.0.1' });
    expect(okCase.ok).toBe(true);
    const blocked = await v.verify(LEGACY_BODY, headersFor(), { sourceIp: '13.124.18.147' });
    expect(blocked.ok).toBe(false);
  });
});

// ── 헤더/기타 ──────────────────────────────────────────────────────────────

describe('verify — 헤더 처리와 Unverified 등급', () => {
  it('필수 공통 헤더 누락 → parse-failed', async () => {
    const r = await verifier().verify(LEGACY_BODY, {});
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.kind).toBe('parse-failed');
  });

  it('Record 헤더 키 대소문자 무시 + retried-count 파싱', async () => {
    seq += 1;
    const r = await verifier().verify(LEGACY_BODY, {
      'TossPayments-Webhook-Transmission-Id': `tx-${seq}`,
      'TossPayments-Webhook-Transmission-Time': TIME,
      'TossPayments-Webhook-Transmission-Retried-Count': '3',
    });
    expect(r.ok).toBe(true);
    if (!r.ok || r.value.duplicate) return;
    expect(r.value.webhook.meta.retriedCount).toBe(3);
  });

  it('일반 이벤트는 Unverified — refetch로 조회 API 재확인 (paymentKey 경로)', async () => {
    const r = await verifier().verify(LEGACY_BODY, headersFor());
    expect(r.ok).toBe(true);
    if (!r.ok || r.value.duplicate) return;
    const webhook = r.value.webhook;
    expect(webhook.trust).toBe('unverified');
    if (webhook.trust !== 'unverified') return;

    const calls: string[] = [];
    // 테스트 픽스처 — Payment 전체 필드 구성은 refetch 경로 검증에 불필요
    const fresh = { paymentKey: 'pay_123', status: 'DONE' } as unknown as Payment;
    const client: PaymentLookup = {
      getPayment: (key) => {
        calls.push(`byKey:${key}`);
        return Promise.resolve(ok(fresh));
      },
      getPaymentByOrderId: (orderId) => {
        calls.push(`byOrder:${orderId}`);
        return Promise.resolve(ok(fresh));
      },
    };
    const refetched = await webhook.refetch(client);
    expect(refetched.ok).toBe(true);
    expect(calls).toEqual(['byKey:pay_123']);
  });

  it('결제 참조가 없는 이벤트의 refetch → no-payment-reference', async () => {
    const body = JSON.stringify({
      eventType: 'BILLING_DELETED',
      createdAt: '2026-08-09T12:00:00.000000',
      data: { billingKey: 'bill_1', reason: '고객 탈퇴' },
    });
    const r = await verifier().verify(body, headersFor());
    expect(r.ok).toBe(true);
    if (!r.ok || r.value.duplicate || r.value.webhook.trust !== 'unverified') return;
    const client: PaymentLookup = {
      getPayment: () => Promise.reject(new Error('호출되면 안 된다')),
      getPaymentByOrderId: () => Promise.reject(new Error('호출되면 안 된다')),
    };
    const refetched = await r.value.webhook.refetch(client);
    expect(refetched.ok).toBe(false);
    if (refetched.ok) return;
    expect(refetched.error).toEqual({ source: 'library', kind: 'no-payment-reference' });
  });

  it('알 수 없는 이벤트도 Unverified UNKNOWN으로 verdict에 도달한다(전방 호환)', async () => {
    const body = JSON.stringify({
      eventType: 'BRAND_NEW_EVENT',
      createdAt: '2026-08-09T12:00:00.000000',
      data: {},
    });
    const r = await verifier().verify(body, headersFor());
    expect(r.ok).toBe(true);
    if (!r.ok || r.value.duplicate || r.value.webhook.trust !== 'unverified') return;
    expect(r.value.webhook.event.eventType).toBe('UNKNOWN');
  });
});

// ── parseSecurityKey ───────────────────────────────────────────────────────

describe('parseSecurityKey — 64자 hex', () => {
  it('유효한 64자 hex → 통과', () => {
    expect(parseSecurityKey(KEY_A_HEX).ok).toBe(true);
    expect(parseSecurityKey(KEY_A_HEX.toUpperCase()).ok).toBe(true);
  });

  it('빈 문자열 / 길이 위반 / hex 외 문자 → 각각의 reason', () => {
    const empty = parseSecurityKey('');
    expect(!empty.ok && empty.error.reason === 'empty-body').toBe(true);
    const short = parseSecurityKey('abc123');
    expect(!short.ok && short.error.reason === 'bad-length').toBe(true);
    const notHex = parseSecurityKey('g'.repeat(64));
    expect(notHex.ok).toBe(false);
  });
});
