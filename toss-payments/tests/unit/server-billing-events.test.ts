/**
 * §3.3 billing 이벤트 4종 + §3.6 approve 멱등키 강제.
 *
 * - 이벤트 payload에 billingKey 원천 부재(봉인 원칙) — JSON 직렬화로 검증.
 * - approve 멱등키는 모든 구성에서 타입·런타임 필수다.
 */
import { describe, expect, it } from 'vitest';

import {
  confirmPendingAuth,
  createBillingFlow,
  createTossClient,
  createTossEvents,
  customerKey,
  idempotencyKey,
  isErr,
  isOk,
  orThrow,
  orderId,
  orderName,
  parseApiSecretKey,
  parseBillingAuthCallback,
  type AuthKeyReceived,
  type BillingKeyRecord,
  type BillingKeyStore,
  type BillingOrder,
} from '../../src/server';
import { mockFetch, rawPayment, type MockResponse, type RecordedCall } from './helpers';

const CK = 'cust-0001';
const BILLING_KEY = 'bill_abcdef=';

function apiClient(fetchImpl: typeof fetch) {
  return createTossClient(orThrow(parseApiSecretKey('test_sk_abcdef')), { fetch: fetchImpl });
}

function memoryBillingStore(): BillingKeyStore {
  const map = new Map<string, BillingKeyRecord>();
  return {
    save: async (record) => {
      map.set(record.customerKey, record);
    },
    find: async (ck) => map.get(ck) ?? null,
    delete: async (ck) => {
      map.delete(ck);
    },
  };
}

const issueResponse = {
  mId: 'tvivarepublica',
  customerKey: CK,
  authenticatedAt: '2026-08-09T12:00:00+09:00',
  method: '카드',
  billingKey: BILLING_KEY,
  card: { issuerCode: '21', number: '941000******890', cardType: '신용', ownerType: '개인' },
};

function receivedAuth(): AuthKeyReceived {
  const parsed = orThrow(parseBillingAuthCallback(`?customerKey=${CK}&authKey=auth-one-time`));
  if (parsed.status !== 'authorized') throw new Error('authorized여야 한다');
  return orThrow(confirmPendingAuth(parsed.pending, orThrow(customerKey(CK))));
}

function billingOrder(): BillingOrder {
  return {
    orderId: orThrow(orderId('order-123456')),
    orderName: orThrow(orderName('구독 8월')),
    amount: 9_900,
  };
}

const approveOptions = () => ({ idempotencyKey: orThrow(idempotencyKey('billing-event-cycle-1')) });

/** 호출 순서대로 응답을 돌려주는 fetch — 이벤트 검증용 시나리오 조립. */
function sequencedFetch(responses: readonly MockResponse[]) {
  return mockFetch((_call: RecordedCall, index: number) => {
    const res = responses[index];
    if (res === undefined) throw new Error(`예상 밖 ${index + 1}번째 호출`);
    return res;
  });
}

describe('§3.3 billing 이벤트 — Result 확정 후 발화, billingKey 미포함', () => {
  it('issue Ok → billing.issued(customerKey만) — billingKey는 payload 원천 부재', async () => {
    const { fetch } = sequencedFetch([{ status: 200, body: issueResponse }]);
    const events = createTossEvents();
    const received: unknown[] = [];
    events.on('billing.issued', (e) => {
      received.push(e);
    });
    const flow = createBillingFlow(apiClient(fetch), memoryBillingStore(), { events });

    expect(isOk(await flow.issue(receivedAuth()))).toBe(true);
    expect(received).toHaveLength(1);
    expect((received[0] as { customerKey: string }).customerKey).toBe(CK);
    // 봉인 원칙 — 이벤트를 통째로 로깅해도 billingKey가 새지 않는다
    expect(JSON.stringify(received)).not.toContain(BILLING_KEY);
  });

  it('approve Ok → billing.approved(payment + customerKey)', async () => {
    const { fetch } = sequencedFetch([
      { status: 200, body: issueResponse },
      { status: 200, body: rawPayment({ type: 'BILLING', status: 'DONE', totalAmount: 9_900 }) },
    ]);
    const events = createTossEvents();
    const approved: unknown[] = [];
    events.on('billing.approved', (e) => {
      approved.push(e);
    });
    const flow = createBillingFlow(apiClient(fetch), memoryBillingStore(), { events });

    const profile = orThrow(await flow.issue(receivedAuth()));
    expect(isOk(await flow.approve(profile, billingOrder(), approveOptions()))).toBe(true);
    expect(approved).toHaveLength(1);
    const e = approved[0] as { customerKey: string; payment: { status: string } };
    expect(e.customerKey).toBe(CK);
    expect(e.payment.status).toBe('DONE');
    expect(JSON.stringify(approved)).not.toContain(BILLING_KEY);
  });

  it('approve Err → billing.approve-failed(error 동봉) — approved는 미발화', async () => {
    const { fetch } = sequencedFetch([
      { status: 200, body: issueResponse },
      { status: 400, body: { code: 'NOT_MATCHES_CUSTOMER_KEY', message: '고객 불일치' } },
    ]);
    const events = createTossEvents();
    const seen: string[] = [];
    events.on('billing.approved', () => {
      seen.push('approved');
    });
    events.on('billing.approve-failed', (e) => {
      seen.push(`failed:${'code' in e.error ? e.error.code : e.error.kind}`);
    });
    const flow = createBillingFlow(apiClient(fetch), memoryBillingStore(), { events });

    const profile = orThrow(await flow.issue(receivedAuth()));
    expect(isErr(await flow.approve(profile, billingOrder(), approveOptions()))).toBe(true);
    expect(seen).toEqual(['failed:NOT_MATCHES_CUSTOMER_KEY']);
  });

  it('revoke Ok → billing.revoked(customerKey만)', async () => {
    const { fetch } = sequencedFetch([
      { status: 200, body: issueResponse },
      { status: 200, body: {} },
    ]);
    const events = createTossEvents();
    const revoked: unknown[] = [];
    events.on('billing.revoked', (e) => {
      revoked.push(e);
    });
    const flow = createBillingFlow(apiClient(fetch), memoryBillingStore(), { events });

    const profile = orThrow(await flow.issue(receivedAuth()));
    expect(isOk(await flow.revoke(profile))).toBe(true);
    expect(revoked).toHaveLength(1);
    expect((revoked[0] as { customerKey: string }).customerKey).toBe(CK);
    expect(JSON.stringify(revoked)).not.toContain(BILLING_KEY);
  });

  it('events 미주입 = 발행 지점 no-op(현행 동작 동일)', async () => {
    const { fetch } = sequencedFetch([{ status: 200, body: issueResponse }]);
    const flow = createBillingFlow(apiClient(fetch), memoryBillingStore());
    expect(isOk(await flow.issue(receivedAuth()))).toBe(true);
  });
});

describe('§3.6 billing approve — 멱등키 상시 강제', () => {
  it('기본 구성 approve도 멱등키가 헤더로 부착되고 정상 승인된다', async () => {
    const { fetch, calls } = sequencedFetch([
      { status: 200, body: issueResponse },
      { status: 200, body: rawPayment({ type: 'BILLING', status: 'DONE', totalAmount: 9_900 }) },
    ]);
    const flow = createBillingFlow(apiClient(fetch), memoryBillingStore());

    const profile = orThrow(await flow.issue(receivedAuth()));
    const r = await flow.approve(profile, billingOrder(), {
      idempotencyKey: orThrow(idempotencyKey('sub:2026-08:cust-0001')),
    });
    expect(isOk(r)).toBe(true);
    expect(calls[1]?.headers['idempotency-key']).toBe('sub:2026-08:cust-0001');
  });

  it('deprecated capability를 둔 기존 설정도 base 메서드(load/revoke 등)를 유지한다', async () => {
    const { fetch } = sequencedFetch([{ status: 200, body: issueResponse }]);
    const flow = createBillingFlow(apiClient(fetch), memoryBillingStore(), {
      capabilities: { requireApproveIdempotencyKey: true },
    });
    orThrow(await flow.issue(receivedAuth()));
    const loaded = await flow.load(orThrow(customerKey(CK)));
    expect(isOk(loaded)).toBe(true);
    if (isOk(loaded)) expect(loaded.value?.customerKey).toBe(CK);
  });
});
