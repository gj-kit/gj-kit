/**
 * billingKey 경로 유출 차단 — approve/revoke의 실제 경로는 `/v1/billing/{billingKey}`지만,
 * 관측 채널 3곳(AuditEntry.path · 'api.call' 이벤트 path · onRetry.path)에는 치환본
 * `/v1/billing/[REDACTED]`만 실린다(TossHttpInit.auditPath).
 *
 * 근거: §3.2 redaction은 body 키만 순회해 URL 경로의 billingKey는 통과했고, 같은 audit
 * 엔트리의 requestBody에 customerKey가 동거해 "빌링키+customerKey를 같은 로그에 함께
 * 남기지 말 것"(stores.ts, 토스 빌링 보안 모델)이 깨졌다 — billing.ts 봉인 원칙의
 * audit/events 옵션 우회 회귀 테스트.
 */
import { describe, expect, it, vi } from 'vitest';

import {
  cancelReason,
  createBillingFlow,
  createTossClient,
  createTossEvents,
  asCancelable,
  idempotencyKey,
  isErr,
  isOk,
  orThrow,
  orderId,
  orderName,
  parseApiSecretKey,
  type BillingKeyRecord,
  type BillingOrder,
  type SettledCancelable,
} from '../../src/server';
import type { TossEvent } from '../../src/server/events';
import { memoryAuditSink, memoryBillingKeyStore } from '../../src/testing';
import { asPaymentFixture, failingFetch, mockFetch, rawCancelTransaction, rawPayment } from './helpers';

const BILLING_KEY = 'bill_SECRET_abcdef';
const CK = 'cust-0001';
const REDACTED_PATH = '/v1/billing/[REDACTED]';

function record(): BillingKeyRecord {
  return {
    customerKey: CK,
    billingKey: BILLING_KEY,
    method: '카드',
    issuedAt: '2026-08-09T12:00:00+09:00',
    card: { issuerCode: '21', number: '433012******890', cardType: '신용', ownerType: '개인' },
    transfers: null,
  };
}

function billingOrder(): BillingOrder {
  return {
    orderId: orThrow(orderId('order-123456')),
    orderName: orThrow(orderName('구독 8월')),
    amount: 9_900,
  };
}

const secretKey = () => orThrow(parseApiSecretKey('test_sk_abcdef'));

describe('billing approve/revoke — 관측 채널 3곳의 billingKey 경로 치환', () => {
  it('approve — AuditEntry.path와 api.call path는 치환본, 실제 전송 URL은 원본(무간섭)', async () => {
    const sink = memoryAuditSink();
    const events = createTossEvents();
    const apiCalls: Array<TossEvent<'api.call'>> = [];
    events.on('api.call', (e) => {
      apiCalls.push(e);
    });
    const { fetch, calls } = mockFetch(() => ({
      status: 200,
      body: rawPayment({ type: 'BILLING', status: 'DONE' }),
    }));
    const client = createTossClient(secretKey(), { fetch, audit: { sink }, events });
    const billing = createBillingFlow(client, memoryBillingKeyStore());
    const profile = orThrow(await billing.import(record()));

    const r = await billing.approve(profile, billingOrder());
    expect(isOk(r)).toBe(true);

    // ① AuditEntry.path — 치환본만
    expect(sink.entries).toHaveLength(1);
    expect(sink.entries[0]?.path).toBe(REDACTED_PATH);
    // ② 'api.call' 이벤트 path — 치환본만
    expect(apiCalls).toHaveLength(1);
    expect(apiCalls[0]?.path).toBe(REDACTED_PATH);
    // 실제 전송 경로는 불변 — 치환은 관측 채널 전용이다
    expect(calls[0]?.url).toContain(`/v1/billing/${encodeURIComponent(BILLING_KEY)}`);

    // 봉인 보증: 관측 채널 직렬화 전문 어디에도 billingKey 평문이 없다.
    // requestBody의 customerKey는 남는다(의도된 동작) — 금지 쌍(billingKey+customerKey)의
    // 동거가 해소되었음을 함께 고정한다.
    const serialized = JSON.stringify([sink.entries, apiCalls]);
    expect(serialized).not.toContain(BILLING_KEY);
    expect(serialized).toContain(CK);
  });

  it('revoke — AuditEntry.path 치환본, 전송 URL 원본', async () => {
    const sink = memoryAuditSink();
    const { fetch, calls } = mockFetch(() => ({ status: 200 }));
    const client = createTossClient(secretKey(), { fetch, audit: { sink } });
    const billing = createBillingFlow(client, memoryBillingKeyStore());
    const profile = orThrow(await billing.import(record()));

    const r = await billing.revoke(profile);
    expect(isOk(r)).toBe(true);
    expect(sink.entries[0]?.path).toBe(REDACTED_PATH);
    expect(calls[0]?.url).toContain(`/v1/billing/${encodeURIComponent(BILLING_KEY)}`);
    expect(JSON.stringify(sink.entries)).not.toContain(BILLING_KEY);
  });

  it('onRetry.path도 치환본 — retry 관측 콜백으로도 billingKey가 새지 않는다', async () => {
    const onRetry = vi.fn();
    const { fetch } = failingFetch(new Error('conn reset'));
    const client = createTossClient(secretKey(), {
      fetch,
      retry: { maxAttempts: 2, delaysMs: [0], onRetry },
    });
    const billing = createBillingFlow(client, memoryBillingKeyStore());
    const profile = orThrow(await billing.import(record()));

    // 멱등키 부착 POST — transport 실패가 재시도 대상이 되어 onRetry가 호출된다(§3.4 가드 2a)
    const r = await billing.approve(profile, billingOrder(), {
      idempotencyKey: orThrow(idempotencyKey('idem-audit-1')),
    });
    expect(isErr(r)).toBe(true);
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onRetry.mock.calls[0]?.[0]).toMatchObject({ path: REDACTED_PATH });
    expect(JSON.stringify(onRetry.mock.calls)).not.toContain(BILLING_KEY);
  });

  it('발급 경로(/v1/billing/authorizations/*)와 취소 경로는 치환하지 않는다 — 민감 세그먼트 없음', async () => {
    const sink = memoryAuditSink();
    // 취소: paymentKey 경로는 민감 아님 — 원본 그대로 기록되어야 관측 가치가 유지된다
    const { fetch } = mockFetch(() => ({
      status: 200,
      body: rawPayment({
        status: 'CANCELED',
        balanceAmount: 0,
        cancels: [rawCancelTransaction()],
        lastTransactionKey: 'txn-cancel-1',
      }),
    }));
    const client = createTossClient(secretKey(), { fetch, audit: { sink } });
    const target = orThrow(asCancelable(asPaymentFixture(rawPayment())));
    expect(target.kind).toBe('settled');
    const r = await client.cancels.cancelFully(target as SettledCancelable, {
      reason: orThrow(cancelReason('고객 요청 환불')),
      expectedAmount: 1000,
    });
    expect(isOk(r)).toBe(true);
    expect(sink.entries[0]?.path).toBe('/v1/payments/tviva20260809abcdef/cancel');
  });
});
