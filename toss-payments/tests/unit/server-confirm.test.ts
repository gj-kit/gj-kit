import { describe, expect, it } from 'vitest';

import { isErr, isOk, isTestKey, orThrow, orderId, idempotencyKey } from '../../src/server';
import {
  createConfirmFlow,
  createTossClient,
  parseApiSecretKey,
  parseFailCallback,
  parseSuccessCallback,
  type OrderStore,
  type StoredOrder,
} from '../../src/server';
import { forbiddenFetch, mockFetch, rawPayment, type RecordedCall } from './helpers';

function secretKey() {
  const parsed = orThrow(parseApiSecretKey('test_sk_abcdef'));
  if (!isTestKey(parsed)) throw new Error('test 키여야 한다');
  return parsed;
}

function memoryOrders(): OrderStore & { readonly map: Map<string, StoredOrder> } {
  const map = new Map<string, StoredOrder>();
  return {
    map,
    saveOrder: async (order) => {
      map.set(order.orderId, order);
    },
    loadOrder: async (id) => map.get(id) ?? null,
  };
}

const CALLBACK_URL =
  'https://shop.example/api/confirm?paymentKey=pk-abc&orderId=order-123456&amount=1000&paymentType=NORMAL';

describe('parseSuccessCallback — 입력 4형태 정규화', () => {
  it('완전 URL 문자열 / URL / URLSearchParams / Record 전부 수용', () => {
    const inputs = [
      CALLBACK_URL,
      new URL(CALLBACK_URL),
      new URL(CALLBACK_URL).searchParams,
      { paymentKey: 'pk-abc', orderId: 'order-123456', amount: '1000', paymentType: ['NORMAL'] },
    ] as const;
    for (const input of inputs) {
      const r = parseSuccessCallback(input);
      expect(isOk(r)).toBe(true);
      if (isOk(r)) {
        expect(r.value.paymentKey).toBe('pk-abc');
        expect(r.value.orderId).toBe('order-123456');
        expect(r.value.amount).toBe(1000);
        expect(r.value.paymentType).toBe('NORMAL');
      }
    }
  });

  it('amount는 문자열 → number 변환·검증 (bad-amount)', () => {
    const r = parseSuccessCallback('?paymentKey=pk&orderId=order-123456&amount=1000won');
    expect(isErr(r)).toBe(true);
    if (isErr(r)) expect(r.error.reason).toBe('bad-amount');
  });

  it('필수 파라미터 누락 → missing-param + 누락 목록', () => {
    const r = parseSuccessCallback('?orderId=order-123456');
    expect(isErr(r)).toBe(true);
    if (isErr(r)) {
      expect(r.error.reason).toBe('missing-param');
      expect(r.error.missing).toEqual(['paymentKey', 'amount']);
    }
  });

  it('orderId 형식 위반 → bad-order-id', () => {
    const r = parseSuccessCallback('?paymentKey=pk&orderId=bad%20id!&amount=1000');
    expect(isErr(r)).toBe(true);
    if (isErr(r)) expect(r.error.reason).toBe('bad-order-id');
  });

  it('paymentType 미지·부재는 null (문서 간 불일치 — 옵셔널 파싱)', () => {
    const r = parseSuccessCallback('?paymentKey=pk&orderId=order-123456&amount=1000');
    if (isOk(r)) expect(r.value.paymentType).toBeNull();
    const r2 = parseSuccessCallback(
      '?paymentKey=pk&orderId=order-123456&amount=1000&paymentType=WEIRD',
    );
    if (isOk(r2)) expect(r2.value.paymentType).toBeNull();
  });
});

describe('parseFailCallback', () => {
  it('사용자 취소는 에러가 아닌 별도 variant', () => {
    const r = parseFailCallback('?code=PAY_PROCESS_CANCELED&message=x&orderId=order-123456');
    expect(isOk(r)).toBe(true);
    if (isOk(r)) {
      expect(r.value.kind).toBe('user-canceled');
      expect(r.value.orderId).toBe('order-123456');
    }
  });

  it('그 외 코드는 failed variant', () => {
    const r = parseFailCallback('?code=REJECT_CARD_COMPANY&message=%EA%B1%B0%EC%A0%88');
    if (isOk(r) && r.value.kind === 'failed') {
      expect(r.value.code).toBe('REJECT_CARD_COMPANY');
      expect(r.value.message).toBe('거절');
      expect(r.value.orderId).toBeNull();
    } else {
      expect.unreachable('failed variant여야 한다');
    }
  });

  it('code 누락 → missing-param', () => {
    const r = parseFailCallback('?message=x');
    expect(isErr(r)).toBe(true);
  });
});

describe('createConfirmFlow — createOrder', () => {
  it('검증 + saveOrder까지 완료된 뒤에만 Ok — 금액을 저장 시점에 고정', async () => {
    const { fetch } = forbiddenFetch();
    const store = memoryOrders();
    const flow = createConfirmFlow(createTossClient(secretKey(), { fetch }), store);

    const r = await flow.createOrder({ amount: 12_900, orderName: '프리미엄 플랜' });
    expect(isOk(r)).toBe(true);
    if (isOk(r)) {
      expect(store.map.get(r.value.orderId)).toBeDefined();
      expect(r.value.toClientProps()).toEqual({
        orderId: r.value.orderId,
        amount: 12_900,
        orderName: '프리미엄 플랜',
        currency: 'KRW',
      });
    }
  });

  it('orderName 101자 → invalid-input, 저장 실패 → store-failure(save)', async () => {
    const { fetch } = forbiddenFetch();
    const client = createTossClient(secretKey(), { fetch });
    const flow = createConfirmFlow(client, memoryOrders());
    const bad = await flow.createOrder({ amount: 1000, orderName: '가'.repeat(101) });
    expect(isErr(bad)).toBe(true);
    if (isErr(bad)) expect(bad.error.kind).toBe('invalid-input');

    const boom = new Error('db down');
    const failingStore: OrderStore = {
      saveOrder: async () => {
        throw boom;
      },
      loadOrder: async () => null,
    };
    const flow2 = createConfirmFlow(client, failingStore);
    const r = await flow2.createOrder({ amount: 1000, orderName: 'x' });
    expect(isErr(r)).toBe(true);
    if (isErr(r) && r.error.kind === 'store-failure') expect(r.error.cause).toBe(boom);
  });
});

describe('createConfirmFlow — verify/confirm (검증 강제)', () => {
  async function flowWithOrder(fetchPair: { fetch: typeof fetch; calls: RecordedCall[] }) {
    const store = memoryOrders();
    const flow = createConfirmFlow(createTossClient(secretKey(), { fetch: fetchPair.fetch }), store);
    await flow.createOrder({
      amount: 1000,
      orderName: '테스트 주문',
      orderId: orThrow(orderId('order-123456')),
    });
    return flow;
  }

  it('금액 불일치 → API 미호출 Err (fetch 0회)', async () => {
    const pair = forbiddenFetch();
    const flow = await flowWithOrder(pair);
    const r = await flow.confirmCallback(
      '?paymentKey=pk-abc&orderId=order-123456&amount=999999',
    );
    expect(isErr(r)).toBe(true);
    if (isErr(r) && 'kind' in r.error && r.error.kind === 'amount-mismatch') {
      expect(r.error.expected).toBe(1000);
      expect(r.error.received).toBe(999999);
    } else {
      expect.unreachable('amount-mismatch여야 한다');
    }
    expect(pair.calls.length).toBe(0);
  });

  it('승인 시한(기본 10분) 초과 → approval-window-exceeded, API 미호출', async () => {
    const pair = forbiddenFetch();
    const flow = await flowWithOrder(pair);
    const parsed = parseSuccessCallback(CALLBACK_URL, {
      receivedAt: new Date(Date.now() - 11 * 60_000),
    });
    if (!parsed.ok) return expect.unreachable('파싱 성공해야 한다');
    const r = await flow.verify(parsed.value);
    expect(isErr(r)).toBe(true);
    if (isErr(r)) expect(r.error.kind).toBe('approval-window-exceeded');
    expect(pair.calls.length).toBe(0);
  });

  it('미저장 주문 → order-not-found', async () => {
    const pair = forbiddenFetch();
    const flow = createConfirmFlow(
      createTossClient(secretKey(), { fetch: pair.fetch }),
      memoryOrders(),
    );
    const parsed = parseSuccessCallback(CALLBACK_URL);
    if (!parsed.ok) return expect.unreachable('파싱 성공해야 한다');
    const r = await flow.verify(parsed.value);
    if (isErr(r)) expect(r.error.kind).toBe('order-not-found');
    else expect.unreachable('실패여야 한다');
  });

  it('confirm — body {paymentKey, orderId, amount}, 멱등키는 기본 미부착(§7 확정 5)', async () => {
    const pair = mockFetch(() => ({ status: 200, body: rawPayment({ status: 'DONE' }) }));
    const flow = await flowWithOrder(pair);
    const r = await flow.confirmCallback(CALLBACK_URL);
    expect(isOk(r)).toBe(true);

    const call = pair.calls[0];
    expect(call?.url).toBe('https://api.tosspayments.com/v1/payments/confirm');
    expect(call?.body).toBe(
      JSON.stringify({ paymentKey: 'pk-abc', orderId: 'order-123456', amount: 1000 }),
    );
    expect(call?.headers['idempotency-key']).toBeUndefined();
  });

  it('confirm — 멱등키 일급 옵션 지정 시에만 헤더 부착 + testCode 헤더', async () => {
    const pair = mockFetch(() => ({ status: 200, body: rawPayment({ status: 'DONE' }) }));
    const flow = await flowWithOrder(pair);
    const parsed = parseSuccessCallback(CALLBACK_URL);
    if (!parsed.ok) return expect.unreachable('파싱 성공해야 한다');
    const verified = await flow.verify(parsed.value);
    if (!verified.ok) return expect.unreachable('검증 통과해야 한다');

    const key = orThrow(idempotencyKey('confirm-2026-08-09-1'));
    const r = await flow.confirm(verified.value, { idempotencyKey: key, testCode: 'INVALID_CARD_EXPIRATION' });
    expect(isOk(r)).toBe(true);
    expect(pair.calls[0]?.headers['idempotency-key']).toBe('confirm-2026-08-09-1');
    expect(pair.calls[0]?.headers['tosspayments-test-code']).toBe('INVALID_CARD_EXPIRATION');
  });

  it('가상계좌 confirm은 DONE이 아니다 — WAITING_FOR_DEPOSIT도 성공', async () => {
    const pair = mockFetch(() => ({
      status: 200,
      body: rawPayment({ status: 'WAITING_FOR_DEPOSIT', method: '가상계좌', secret: 'vs-1' }),
    }));
    const flow = await flowWithOrder(pair);
    const r = await flow.confirmCallback(CALLBACK_URL);
    expect(isOk(r)).toBe(true);
    if (isOk(r)) expect(r.value.status).toBe('WAITING_FOR_DEPOSIT');
  });

  it('confirm 200 + 빈 body → 빈 ConfirmedPayment 제조 금지 — TransportFailure(재시도 가능)', async () => {
    const pair = mockFetch(() => ({ status: 200 })); // 0바이트 본문
    const flow = await flowWithOrder(pair);
    const r = await flow.confirmCallback(CALLBACK_URL);
    expect(isErr(r)).toBe(true);
    if (isErr(r) && 'source' in r.error && r.error.source === 'network') {
      expect(r.error.code).toBe('NETWORK_ERROR');
      expect(r.error.retryable).toBe(true);
    } else {
      expect.unreachable('network 실패여야 한다 — status undefined인 결제가 승인 성공으로 새면 안 된다');
    }
  });

  it('confirm 200 + 비객체 JSON → TransportFailure — Ok 통과 금지', async () => {
    const pair = mockFetch(() => ({ status: 200, body: 'OK' }));
    const flow = await flowWithOrder(pair);
    const r = await flow.confirmCallback(CALLBACK_URL);
    expect(isErr(r)).toBe(true);
    if (isErr(r) && 'source' in r.error) expect(r.error.source).toBe('network');
  });

  it('confirm 실패 — NOT_FOUND_PAYMENT_SESSION(10분 초과 404)은 DEADLINE·비재시도', async () => {
    const pair = mockFetch(() => ({
      status: 404,
      body: { code: 'NOT_FOUND_PAYMENT_SESSION', message: '세션 만료' },
    }));
    const flow = await flowWithOrder(pair);
    const r = await flow.confirmCallback(CALLBACK_URL);
    expect(isErr(r)).toBe(true);
    if (isErr(r) && 'source' in r.error && r.error.source === 'toss') {
      expect(r.error.category).toBe('DEADLINE');
      expect(r.error.retryable).toBe(false);
    } else {
      expect.unreachable('toss 실패여야 한다');
    }
  });
});
