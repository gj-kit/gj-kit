/**
 * §2 createTossPayments 파사드 — 순수 조립층 검증.
 *
 * - 위임 동일성: 파사드 산출물의 동작이 개별 팩토리 조립과 동일하다(검증 로직 중복 0 —
 *   같은 mock fetch 시나리오에서 Result·와이어 요청이 일치).
 * - depositSecrets 1개 배선 → confirm측 자동 저장 + webhook측 대조 왕복 실증(G1).
 * - events 버스 1개 → client/confirm/billing/webhook 4곳 자동 배선.
 * - events 미주입 → kit.events는 no-op 구독 표면(구독해도 발화 없음).
 * - webhook.autoRefetch: true → 파사드 내부 client 자동 결속(§3.5 배선 1비트).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  confirmPendingAuth,
  createConfirmFlow,
  createTossClient,
  createTossEvents,
  createTossPayments,
  customerKey,
  isOk,
  orThrow,
  orderId,
  parseApiSecretKey,
  parseBillingAuthCallback,
  type AuthKeyReceived,
  type OrderStore,
  type StoredOrder,
  type TossEvent,
} from '../../src/server';
import {
  memoryBillingKeyStore,
  memoryDedupeStore,
  memoryDepositSecretStore,
  webhookFixture,
} from '../../src/testing';
import { mockFetch, rawPayment, type RecordedCall } from './helpers';

const SK_RAW = 'test_sk_facade0001';
const OID = 'order-123456';
const CALLBACK = `?paymentKey=pk-abc&orderId=${OID}&amount=1000`;
const CK = 'cust-0001';
const VA_SECRET = 'va-secret-001';

function sk() {
  return orThrow(parseApiSecretKey(SK_RAW));
}

function memoryOrders(): OrderStore {
  const map = new Map<string, StoredOrder>();
  return {
    saveOrder: async (order) => {
      map.set(order.orderId, order);
    },
    loadOrder: async (id) => map.get(id) ?? null,
  };
}

/** 저장된 주문(amount 1000)을 선적재한 OrderStore — confirmCallback 경로 최소 조립. */
async function preloadedOrders(): Promise<OrderStore> {
  const store = memoryOrders();
  await store.saveOrder({
    orderId: orThrow(orderId(OID)),
    amount: 1000,
    currency: 'KRW',
    orderName: '테스트 주문',
    createdAt: new Date().toISOString(),
  });
  return store;
}

function receivedAuth(): AuthKeyReceived {
  const parsed = orThrow(parseBillingAuthCallback(`?customerKey=${CK}&authKey=auth-one-time`));
  if (parsed.status !== 'authorized') throw new Error('authorized여야 한다');
  return orThrow(confirmPendingAuth(parsed.pending, orThrow(customerKey(CK))));
}

const issueResponse = {
  mId: 'tvivarepublica',
  customerKey: CK,
  authenticatedAt: '2026-08-09T12:00:00+09:00',
  method: '카드',
  billingKey: 'bill_abcdef=',
  card: { issuerCode: '21', number: '941000******890', cardType: '신용', ownerType: '개인' },
};

/** URL 라우팅 mock fetch — confirm/발급/조회를 한 시나리오에서 응답한다. */
function routedFetch(confirmBody: Record<string, unknown>) {
  return mockFetch((call: RecordedCall) => {
    if (call.url.endsWith('/v1/payments/confirm')) return { status: 200, body: confirmBody };
    if (call.url.endsWith('/v1/billing/authorizations/issue')) {
      return { status: 200, body: issueResponse };
    }
    if (call.url.includes('/v1/payments/')) return { status: 200, body: rawPayment() };
    throw new Error(`예상 밖 URL: ${call.url}`);
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('§2 파사드 — 개별 팩토리 위임 동일성', () => {
  it('confirmCallback: 파사드와 개별 조립의 Result·와이어 요청이 일치한다', async () => {
    const confirmBody = rawPayment({ paymentKey: 'pk-abc' });

    const viaFacadeFetch = routedFetch(confirmBody);
    const kit = createTossPayments({
      secretKey: sk(),
      orders: await preloadedOrders(),
      client: { fetch: viaFacadeFetch.fetch },
    });
    const facadeResult = await kit.confirm.confirmCallback(CALLBACK);

    const manualFetch = routedFetch(confirmBody);
    const manualClient = createTossClient(sk(), { fetch: manualFetch.fetch });
    const manualFlow = createConfirmFlow(manualClient, await preloadedOrders());
    const manualResult = await manualFlow.confirmCallback(CALLBACK);

    // Result 동일 — 파사드는 조립만 하고 검증·요청 로직을 중복 구현하지 않는다
    expect(isOk(facadeResult)).toBe(true);
    expect(facadeResult).toEqual(manualResult);
    // 와이어 요청 동일(URL/메서드/바디/인증 헤더) — 같은 팩토리에 위임된 증거
    expect(viaFacadeFetch.calls).toEqual(manualFetch.calls);
  });
});

describe('§3.1 depositSecrets — 1회 배선으로 confirm 저장 → 웹훅 대조 왕복', () => {
  it('가상계좌 confirm Ok가 저장한 secret으로 DEPOSIT_CALLBACK이 검증된다', async () => {
    const depositSecrets = memoryDepositSecretStore();
    const confirmBody = rawPayment({
      paymentKey: 'pk-abc',
      method: '가상계좌',
      status: 'WAITING_FOR_DEPOSIT',
      secret: VA_SECRET,
    });
    const { fetch } = routedFetch(confirmBody);

    const kit = createTossPayments({
      secretKey: sk(),
      orders: await preloadedOrders(),
      depositSecrets,
      webhook: { dedupe: memoryDedupeStore(), allowedSourceIps: false },
      client: { fetch },
    });

    const confirmed = await kit.confirm.confirmCallback(CALLBACK);
    expect(isOk(confirmed)).toBe(true);
    // confirm측 자동 저장 실증
    expect(await depositSecrets.getSecret(OID)).toBe(VA_SECRET);

    // 같은 store의 getSecret이 웹훅 대조에 쓰인다 — 별도 배선 없이 왕복 성립
    const { rawBody, headers } = webhookFixture.depositCallback({ orderId: OID, secret: VA_SECRET });
    const verdict = await kit.webhook.verify(rawBody, headers);
    expect(isOk(verdict)).toBe(true);
    if (isOk(verdict) && !verdict.value.duplicate) {
      expect(verdict.value.webhook.trust).toBe('secret');
    } else {
      expect.unreachable('non-duplicate verdict여야 한다');
    }
  });
});

describe('§3.3 events — 버스 1개가 4곳(client/confirm/billing/webhook)에 자동 배선', () => {
  it('api.call·payment.confirmed·billing.issued·webhook.accepted가 단일 버스로 흐른다', async () => {
    const events = createTossEvents();
    const seen: TossEvent['type'][] = [];
    events.on('api.call', (e) => void seen.push(e.type));
    events.on('payment.confirmed', (e) => void seen.push(e.type));
    events.on('billing.issued', (e) => void seen.push(e.type));
    events.on('webhook.accepted', (e) => void seen.push(e.type));

    const { fetch } = routedFetch(rawPayment({ paymentKey: 'pk-abc' }));
    const kit = createTossPayments({
      secretKey: sk(),
      orders: await preloadedOrders(),
      billingKeys: memoryBillingKeyStore(),
      webhook: { dedupe: memoryDedupeStore(), allowedSourceIps: false },
      events,
      client: { fetch },
    });

    // client+confirm 경유 — api.call(1) + payment.confirmed(1)
    expect(isOk(await kit.confirm.confirmCallback(CALLBACK))).toBe(true);
    // billing 경유 — api.call(1) + billing.issued(1)
    expect(isOk(await kit.billing.issue(receivedAuth()))).toBe(true);
    // webhook 경유 — webhook.accepted(1)
    const { rawBody, headers } = webhookFixture.paymentStatusChanged({
      payment: { paymentKey: 'pay_123', orderId: OID, status: 'DONE' },
    });
    expect(isOk(await kit.webhook.verify(rawBody, headers))).toBe(true);

    expect(seen).toEqual([
      'api.call',
      'payment.confirmed',
      'api.call',
      'billing.issued',
      'webhook.accepted',
    ]);
    // kit.events === 주입 버스 — 구독 표면도 같은 인스턴스가 반환된다
    expect(kit.events).toBe(events);
  });

  it('events 미주입 → kit.events는 no-op 구독 표면(구독해도 발화 없음, 해제 무해)', async () => {
    const { fetch } = routedFetch(rawPayment({ paymentKey: 'pk-abc' }));
    const kit = createTossPayments({
      secretKey: sk(),
      orders: await preloadedOrders(),
      client: { fetch },
    });

    const handler = vi.fn();
    const off = kit.events.on('payment.confirmed', handler);
    expect(isOk(await kit.confirm.confirmCallback(CALLBACK))).toBe(true);
    // 발행 지점이 존재하지 않는다(버스 미배선) — 기본 꺼짐 = 현행 동작 동일
    expect(handler).not.toHaveBeenCalled();
    expect(() => off()).not.toThrow();
  });
});

describe('§3.5 webhook.autoRefetch: true — 파사드 내부 client 자동 결속', () => {
  it('어댑터 경유 Unverified에 내부 client 조회 결과가 prefetched로 첨부된다', async () => {
    const { fetch, calls } = routedFetch(rawPayment({ paymentKey: 'pk-abc' }));
    const kit = createTossPayments({
      secretKey: sk(),
      webhook: { dedupe: memoryDedupeStore(), autoRefetch: true, allowedSourceIps: false },
      client: { fetch },
    });

    const received: { trust: string; prefetchedStatus: string | null }[] = [];
    const handler = kit.webhook.fetchHandler({
        onPaymentStatusChanged: (w) => {
          received.push({
            trust: w.trust,
            prefetchedStatus: w.prefetched?.ok === true ? w.prefetched.value.status : null,
          });
        },
    });

    const { rawBody, headers } = webhookFixture.paymentStatusChanged({
      payment: { paymentKey: 'pay_123', orderId: OID, status: 'DONE' },
    });
    const res = await handler(
      new Request('https://shop.example/api/webhooks/toss', {
        method: 'POST',
        headers,
        body: rawBody,
      }),
    );
    expect(res.status).toBe(200);
    // 내부 client가 결속된 증거 — 별도 client 주입 없이 조회가 수행됐다(trust 승격은 없음)
    expect(received).toEqual([{ trust: 'unverified', prefetchedStatus: 'DONE' }]);
    expect(calls.some((c) => c.url.includes('/v1/payments/pay_123'))).toBe(true);
  });
});
