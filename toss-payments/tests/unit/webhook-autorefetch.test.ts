/**
 * §3.5 autoRefetch — 어댑터 200 ack 이후·dedupe 통과분만 prefetched 첨부(수동 verify 불변,
 * trust 승격 없음) + §3.3 webhook 이벤트 3종(verdict 확정 후 요약 필드만).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { err, ok, type Payment, type Result } from '../../src/index';
import { createTossEvents } from '../../src/server';
import { createWebhookVerifier } from '../../src/webhook';
import type {
  LookupError,
  PaymentLookup,
  WebhookDedupeStore,
  WebhookVerifierConfig,
} from '../../src/webhook';
import { asPaymentFixture, rawPayment } from './helpers';

const TIME = '2026-08-09T12:00:00+09:00';

function memoryDedupe(): WebhookDedupeStore {
  const seen = new Set<string>();
  return {
    claim: (id) => {
      if (seen.has(id)) return Promise.resolve(false);
      seen.add(id);
      return Promise.resolve(true);
    },
  };
}

let seq = 0;
function headersFor(id?: string): Record<string, string> {
  seq += 1;
  return {
    'tosspayments-webhook-transmission-id': id ?? `atx-${seq}`,
    'tosspayments-webhook-transmission-time': TIME,
    'tosspayments-webhook-transmission-retried-count': '0',
  };
}

const PAYMENT_BODY = JSON.stringify({
  eventType: 'PAYMENT_STATUS_CHANGED',
  createdAt: '2026-08-09T12:00:00.000000',
  data: { paymentKey: 'pay_123', orderId: 'order-abc1', status: 'DONE', totalAmount: 1000 },
});

const BILLING_DELETED_BODY = JSON.stringify({
  eventType: 'BILLING_DELETED',
  createdAt: '2026-08-09T12:00:00.000000',
  data: { billingKey: 'bill_x', reason: '고객 삭제' },
});

/** 조회 호출을 기록하는 PaymentLookup — 결과 주입 가능. */
function lookupMock(result?: Result<Payment, LookupError>): PaymentLookup & { readonly calls: string[] } {
  const calls: string[] = [];
  const done = ok(asPaymentFixture(rawPayment({ status: 'DONE' })));
  return {
    calls,
    getPayment: async (key) => {
      calls.push(`pk:${key}`);
      return result ?? done;
    },
    getPaymentByOrderId: async (oid) => {
      calls.push(`oid:${oid}`);
      return result ?? done;
    },
  };
}

function makeRequest(body: string, headers: Record<string, string>): Request {
  return new Request('https://shop.example/api/webhooks/toss', { method: 'POST', headers, body });
}

function verifierWith(config: Partial<WebhookVerifierConfig> = {}) {
  return createWebhookVerifier({ dedupe: memoryDedupe(), ...config });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('§3.5 autoRefetch — 어댑터 경유 prefetched 첨부', () => {
  it('fetchHandler + autoRefetch → prefetched Ok(조회 결과), trust는 unverified 불변', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const client = lookupMock();
    const verifier = verifierWith({ autoRefetch: { client } });
    const received: { trust: string; prefetchedStatus: string | null }[] = [];
    const handler = verifier.fetchHandler({
      onPaymentStatusChanged: (w) => {
        received.push({
          trust: w.trust,
          prefetchedStatus: w.prefetched?.ok === true ? w.prefetched.value.status : null,
        });
      },
    });

    const res = await handler(makeRequest(PAYMENT_BODY, headersFor()));
    expect(res.status).toBe(200);
    // payload가 아닌 조회 결과가 채워진다 — trust 승격은 없다(§7-2)
    expect(received).toEqual([{ trust: 'unverified', prefetchedStatus: 'DONE' }]);
    expect(client.calls).toEqual(['pk:pay_123']);
  });

  it('수동 verify 경로는 불변 — prefetched undefined, 조회 0회(10초 규약·순수성 보존)', async () => {
    const client = lookupMock();
    const verifier = verifierWith({ autoRefetch: { client } });
    const r = await verifier.verify(PAYMENT_BODY, headersFor());
    expect(r.ok).toBe(true);
    if (r.ok && !r.value.duplicate) {
      expect(r.value.webhook.trust).toBe('unverified');
      if (r.value.webhook.trust === 'unverified') {
        expect(r.value.webhook.prefetched).toBeUndefined();
      }
    } else {
      expect.unreachable('non-duplicate verdict여야 한다');
    }
    expect(client.calls).toEqual([]);
  });

  it('조회 Err여도 이벤트는 버려지지 않는다 — prefetched Err 동봉으로 핸들러 도달', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const client = lookupMock(
      err({ source: 'network', code: 'NETWORK_ERROR', retryable: true, cause: new Error('down') }),
    );
    const verifier = verifierWith({ autoRefetch: { client } });
    const outcomes: boolean[] = [];
    const handler = verifier.fetchHandler({
      onPaymentStatusChanged: (w) => {
        outcomes.push(w.prefetched !== undefined && !w.prefetched.ok);
      },
    });

    expect((await handler(makeRequest(PAYMENT_BODY, headersFor()))).status).toBe(200);
    expect(outcomes).toEqual([true]);
  });

  it('eventTypes 필터 — 미포함 타입은 조회 없이 prefetched 미첨부(쿼터 방어)', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const client = lookupMock();
    const verifier = verifierWith({
      autoRefetch: { client, eventTypes: ['CANCEL_STATUS_CHANGED'] },
    });
    const prefetchedSeen: (unknown | undefined)[] = [];
    const handler = verifier.fetchHandler({
      onPaymentStatusChanged: (w) => {
        prefetchedSeen.push(w.prefetched);
      },
    });

    expect((await handler(makeRequest(PAYMENT_BODY, headersFor()))).status).toBe(200);
    expect(prefetchedSeen).toEqual([undefined]);
    expect(client.calls).toEqual([]);
  });

  it('결제 참조 없는 이벤트(BILLING_DELETED)에는 미첨부 — 거짓 제공 금지', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const client = lookupMock();
    const verifier = verifierWith({ autoRefetch: { client } });
    const prefetchedSeen: (unknown | undefined)[] = [];
    const handler = verifier.fetchHandler({
      onBillingDeleted: (w) => {
        prefetchedSeen.push(w.prefetched);
      },
    });

    expect((await handler(makeRequest(BILLING_DELETED_BODY, headersFor()))).status).toBe(200);
    expect(prefetchedSeen).toEqual([undefined]);
    expect(client.calls).toEqual([]);
  });

  it('duplicate는 조회하지 않는다 — 재전송 7회가 조회 7회가 되지 않음', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const client = lookupMock();
    const verifier = verifierWith({ autoRefetch: { client } });
    const handler = verifier.fetchHandler({ onPaymentStatusChanged: () => {} });

    await handler(makeRequest(PAYMENT_BODY, headersFor('atx-dup')));
    const res2 = await handler(makeRequest(PAYMENT_BODY, headersFor('atx-dup')));
    expect(res2.status).toBe(200);
    expect(client.calls).toHaveLength(1);
  });

  it('nodeHandler도 200 응답 후 prefetched 첨부', async () => {
    const client = lookupMock();
    const verifier = verifierWith({ autoRefetch: { client } });
    const received: (string | null)[] = [];
    const handler = verifier.nodeHandler({
      onPaymentStatusChanged: (w) => {
        received.push(w.prefetched?.ok === true ? w.prefetched.value.status : null);
      },
    });
    const res = { statusCode: 0, end: () => undefined };
    await handler(
      { headers: headersFor(), body: PAYMENT_BODY, [Symbol.asyncIterator]: async function* () {} },
      res,
    );
    expect(res.statusCode).toBe(200);
    expect(received).toEqual(['DONE']);
  });
});

describe('§3.3 webhook 이벤트 — verdict 확정 후 요약 필드만', () => {
  it('accepted / duplicate / rejected 3종 발화(수동 verify 경로 포함 — 단일 발화 지점)', async () => {
    const events = createTossEvents();
    const seen: string[] = [];
    events.on('webhook.accepted', (e) => {
      seen.push(`accepted:${e.trust}:${e.eventType}:${e.transmissionId}`);
    });
    events.on('webhook.duplicate', (e) => {
      seen.push(`duplicate:${e.transmissionId}`);
    });
    events.on('webhook.rejected', (e) => {
      seen.push(`rejected:${e.rejection.kind}`);
    });
    const verifier = verifierWith({ events });

    expect((await verifier.verify(PAYMENT_BODY, headersFor('atx-ev'))).ok).toBe(true);
    expect((await verifier.verify(PAYMENT_BODY, headersFor('atx-ev'))).ok).toBe(true); // duplicate verdict
    expect((await verifier.verify('{broken', headersFor())).ok).toBe(false);
    expect(seen).toEqual([
      'accepted:unverified:PAYMENT_STATUS_CHANGED:atx-ev',
      'duplicate:atx-ev',
      'rejected:parse-failed',
    ]);
  });

  it('어댑터 경유도 동일 지점에서 발화 — 중복 발화 없음', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const events = createTossEvents();
    let accepted = 0;
    events.on('webhook.accepted', () => {
      accepted += 1;
    });
    const verifier = verifierWith({ events });
    const handler = verifier.fetchHandler({ onPaymentStatusChanged: () => {} });
    await handler(makeRequest(PAYMENT_BODY, headersFor()));
    expect(accepted).toBe(1);
  });

  it('events 미주입 = 발행 지점 no-op(현행 동작 동일)', async () => {
    const verifier = verifierWith();
    expect((await verifier.verify(PAYMENT_BODY, headersFor())).ok).toBe(true);
  });
});
