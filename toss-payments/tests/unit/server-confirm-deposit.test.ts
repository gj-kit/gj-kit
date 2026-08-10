/**
 * §3.1 depositSecrets 자동 저장 + §3.3 confirm 이벤트 + §3.7 resolveConfirmFailure.
 *
 * 협상 불가 계약 검증:
 * - saveSecret 실패여도 confirm은 Ok 유지(통지만) — 승인은 토스 측에서 이미 완결.
 * - method 가드: '가상계좌'만 저장(BILLING 카드도 secret non-null — Phase 5 실측).
 * - 이벤트는 Result 확정 후 발화, 통지 payload 어디에도 secret 원문 미포함.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createConfirmFlow,
  createTossClient,
  createTossEvents,
  isErr,
  isOk,
  orThrow,
  orderId,
  parseApiSecretKey,
  resolveConfirmFailure,
  type ConfirmError,
  type DepositSecretStore,
  type OrderStore,
  type StoredOrder,
} from '../../src/server';
import { memoryDepositSecretStore } from '../../src/testing';
import { forbiddenFetch, mockFetch, rawPayment } from './helpers';

const OID = 'order-123456';
const CALLBACK = `?paymentKey=pk-abc&orderId=${OID}&amount=1000`;
const VA_SECRET = 'va-secret-001';

function memoryOrders(): OrderStore {
  const map = new Map<string, StoredOrder>();
  return {
    saveOrder: async (order) => {
      map.set(order.orderId, order);
    },
    loadOrder: async (id) => map.get(id) ?? null,
  };
}

/** 가상계좌 confirm 성공 응답 — secret non-null, status WAITING_FOR_DEPOSIT(문서). */
function vaPayment(): Record<string, unknown> {
  return rawPayment({
    paymentKey: 'pk-abc',
    method: '가상계좌',
    status: 'WAITING_FOR_DEPOSIT',
    secret: VA_SECRET,
    card: null,
    virtualAccount: { accountNumber: '70123456789', bankCode: '20', dueDate: '2026-08-12T23:59:59+09:00' },
  });
}

function testClient(fetchImpl: typeof fetch) {
  return createTossClient(orThrow(parseApiSecretKey('test_sk_abcdef')), { fetch: fetchImpl });
}

async function seedOrder(flow: ReturnType<typeof createConfirmFlow<'test'>>, amount = 1000) {
  const created = await flow.createOrder({
    amount,
    orderName: '테스트 주문',
    orderId: orThrow(orderId(OID)),
  });
  expect(isOk(created)).toBe(true);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('§3.1 depositSecrets — 가상계좌 secret 자동 저장', () => {
  it('가상계좌 confirm Ok → saveSecret 자동 호출(웹훅 getSecret으로 즉시 대조 가능)', async () => {
    const { fetch } = mockFetch(() => ({ status: 200, body: vaPayment() }));
    const deposits = memoryDepositSecretStore();
    const flow = createConfirmFlow(testClient(fetch), memoryOrders(), { depositSecrets: deposits });
    await seedOrder(flow);

    const r = await flow.confirmCallback(CALLBACK);
    expect(isOk(r)).toBe(true);
    // 저장(confirm측)과 조회(웹훅측)가 같은 객체로 배선된다 — G1 해소의 핵심
    expect(await deposits.getSecret(OID)).toBe(VA_SECRET);
  });

  it('method 가드 — 카드 결제는 secret non-null이어도 저장하지 않는다(BILLING 실측 근거)', async () => {
    const { fetch } = mockFetch(() => ({
      status: 200,
      body: rawPayment({ paymentKey: 'pk-abc', method: '카드', secret: 'ps_billing_nonnull' }),
    }));
    const deposits = memoryDepositSecretStore();
    const flow = createConfirmFlow(testClient(fetch), memoryOrders(), { depositSecrets: deposits });
    await seedOrder(flow);

    const r = await flow.confirmCallback(CALLBACK);
    expect(isOk(r)).toBe(true);
    expect(await deposits.getSecret(OID)).toBeNull();
  });

  it('depositSecrets 미주입 = 현행 동작 동일(기본 꺼짐)', async () => {
    const { fetch } = mockFetch(() => ({ status: 200, body: vaPayment() }));
    const flow = createConfirmFlow(testClient(fetch), memoryOrders());
    await seedOrder(flow);
    expect(isOk(await flow.confirmCallback(CALLBACK))).toBe(true);
  });

  it('저장 실패여도 confirm Ok 유지 + 콜백 통지(payload에 secret 미포함) + 이벤트 발행', async () => {
    const { fetch } = mockFetch(() => ({ status: 200, body: vaPayment() }));
    const failing: DepositSecretStore = {
      saveSecret: async () => {
        throw new Error('db down');
      },
      getSecret: async () => null,
    };
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const events = createTossEvents();
    const eventPayloads: unknown[] = [];
    events.on('deposit.secret-save-failed', (e) => {
      eventPayloads.push(e);
    });
    const infos: { orderId: string; paymentKey: string; cause: unknown }[] = [];
    const flow = createConfirmFlow(testClient(fetch), memoryOrders(), {
      depositSecrets: failing,
      onDepositSecretSaveFailed: (info) => infos.push(info),
      events,
    });
    await seedOrder(flow);

    const r = await flow.confirmCallback(CALLBACK);
    // 협상 불가 — 승인은 이미 완결: Err로 뒤집으면 재confirm 유도라는 더 큰 사고
    expect(isOk(r)).toBe(true);
    expect(infos).toHaveLength(1);
    expect(infos[0]?.orderId).toBe(OID);
    // paymentKey는 승인 응답 Payment의 값 — 조회 복구(getPayment)에 쓰는 키
    expect(infos[0]?.paymentKey).toBe('pk-abc');
    expect((infos[0]?.cause as Error).message).toBe('db down');
    // secret 원문은 통지 payload 어디에도 없다(로그 유출 방지)
    expect(JSON.stringify(infos)).not.toContain(VA_SECRET);
    expect(JSON.stringify(eventPayloads)).not.toContain(VA_SECRET);
    expect(eventPayloads).toHaveLength(1);
    // 콜백 지정 시 console.warn 미발생(콜백이 통지를 대체)
    expect(warn).not.toHaveBeenCalled();
  });

  it('통지 콜백의 throw는 삼켜진다 — 확정된 Ok가 예외로 뒤집히지 않는다', async () => {
    const { fetch } = mockFetch(() => ({ status: 200, body: vaPayment() }));
    const failing: DepositSecretStore = {
      saveSecret: async () => {
        throw new Error('db down');
      },
      getSecret: async () => null,
    };
    const flow = createConfirmFlow(testClient(fetch), memoryOrders(), {
      depositSecrets: failing,
      onDepositSecretSaveFailed: () => {
        throw new Error('관측 콜백 폭발');
      },
    });
    await seedOrder(flow);
    expect(isOk(await flow.confirmCallback(CALLBACK))).toBe(true);
  });

  it('콜백 미지정 시 실패 1건당 console.warn 1회 — 침묵 유실 방지(유일하게 시끄러운 기본값)', async () => {
    const { fetch } = mockFetch(() => ({ status: 200, body: vaPayment() }));
    const failing: DepositSecretStore = {
      saveSecret: async () => {
        throw new Error('db down');
      },
      getSecret: async () => null,
    };
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const flow = createConfirmFlow(testClient(fetch), memoryOrders(), { depositSecrets: failing });
    await seedOrder(flow);

    expect(isOk(await flow.confirmCallback(CALLBACK))).toBe(true);
    expect(warn).toHaveBeenCalledTimes(1);
    // 경고 메시지에도 secret 원문은 없다
    expect(String(warn.mock.calls[0]?.[0])).not.toContain(VA_SECRET);
  });
});

describe('§3.3 confirm 이벤트 — Result 확정 후 발화', () => {
  it('Ok 경로: deposit.secret-saved → payment.confirmed 순서로 발화', async () => {
    const { fetch } = mockFetch(() => ({ status: 200, body: vaPayment() }));
    const events = createTossEvents();
    const seen: string[] = [];
    events.on('deposit.secret-saved', (e) => {
      seen.push(`saved:${e.orderId}`);
    });
    events.on('payment.confirmed', (e) => {
      seen.push(`confirmed:${e.payment.orderId}`);
    });
    const flow = createConfirmFlow(testClient(fetch), memoryOrders(), {
      depositSecrets: memoryDepositSecretStore(),
      events,
    });
    await seedOrder(flow);

    const r = await flow.confirmCallback(CALLBACK);
    expect(isOk(r)).toBe(true);
    // 저장(Result 부속 처리)까지 끝난 뒤 confirmed 발화 — 이벤트가 결과를 바꿀 수 없다
    expect(seen).toEqual([`saved:${OID}`, `confirmed:${OID}`]);
  });

  it('payment.confirm-failed — verify 단계 실패는 orderId 동봉, parse 단계 실패는 null', async () => {
    const { fetch } = forbiddenFetch();
    const events = createTossEvents();
    const failures: { orderId: string | null; kind: string }[] = [];
    events.on('payment.confirm-failed', (e) => {
      failures.push({
        orderId: e.orderId,
        kind: 'kind' in e.error ? e.error.kind : e.error.source,
      });
    });
    const flow = createConfirmFlow(testClient(fetch), memoryOrders(), { events });
    await seedOrder(flow, 2_000); // 저장 금액 2000 ≠ 콜백 1000 → amount-mismatch

    expect(isErr(await flow.confirmCallback(CALLBACK))).toBe(true);
    expect(isErr(await flow.confirmCallback('?paymentKey=pk-only'))).toBe(true);
    expect(failures).toEqual([
      { orderId: OID, kind: 'amount-mismatch' },
      { orderId: null, kind: 'callback-parse' },
    ]);
  });

  it('events 미주입 = 발행 지점 no-op(현행 동작 동일)', async () => {
    const { fetch } = mockFetch(() => ({
      status: 200,
      body: rawPayment({ paymentKey: 'pk-abc' }),
    }));
    const flow = createConfirmFlow(testClient(fetch), memoryOrders());
    await seedOrder(flow);
    expect(isOk(await flow.confirmCallback(CALLBACK))).toBe(true);
  });
});

// ─── §3.7 resolveConfirmFailure ─────────────────────────────────────────────

function tossError(code: string): ConfirmError {
  return {
    source: 'toss',
    code,
    message: '테스트 에러',
    httpStatus: 400,
    category: 'STATE',
    retryable: false,
    traceId: null,
  };
}

const transportError: ConfirmError = {
  source: 'network',
  code: 'NETWORK_ERROR',
  retryable: true,
  cause: new Error('socket hang up'),
};

describe('§3.7 resolveConfirmFailure — 조회 기반 3분기', () => {
  const oid = () => orThrow(orderId(OID));

  it('ALREADY_PROCESSED_PAYMENT → 조회 DONE이면 actually-confirmed(돈은 이미 나갔다)', async () => {
    const { fetch, calls } = mockFetch(() => ({ status: 200, body: rawPayment({ status: 'DONE' }) }));
    const r = await resolveConfirmFailure(testClient(fetch), oid(), tossError('ALREADY_PROCESSED_PAYMENT'));
    expect(isOk(r)).toBe(true);
    if (isOk(r)) {
      expect(r.value.resolution).toBe('actually-confirmed');
      if (r.value.resolution === 'actually-confirmed') {
        expect(r.value.payment.status).toBe('DONE');
      }
    }
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toContain(`/v1/payments/orders/${OID}`);
  });

  it('transport 실패 → 조회, 미승인(CANCELED)이면 definitively-failed(원 에러 동봉)', async () => {
    const { fetch } = mockFetch(() => ({ status: 200, body: rawPayment({ status: 'CANCELED' }) }));
    const r = await resolveConfirmFailure(testClient(fetch), oid(), transportError);
    expect(isOk(r)).toBe(true);
    if (isOk(r) && r.value.resolution === 'definitively-failed') {
      expect(r.value.error).toBe(transportError);
    } else {
      expect.unreachable('definitively-failed여야 한다');
    }
  });

  it('NOT_FOUND_PAYMENT_SESSION(10분 초과) → 조회 없이 즉시 retry-payment', async () => {
    const { fetch, calls } = forbiddenFetch();
    const r = await resolveConfirmFailure(testClient(fetch), oid(), tossError('NOT_FOUND_PAYMENT_SESSION'));
    expect(isOk(r)).toBe(true);
    if (isOk(r)) expect(r.value.resolution).toBe('retry-payment');
    expect(calls).toHaveLength(0);
  });

  it('라이브러리 시한 초과(approval-window-exceeded)도 동일 상황 — 조회 없이 retry-payment', async () => {
    const { fetch, calls } = forbiddenFetch();
    const windowError: ConfirmError = {
      source: 'library',
      kind: 'approval-window-exceeded',
      deadline: new Date(0),
      now: new Date(1),
    };
    const r = await resolveConfirmFailure(testClient(fetch), oid(), windowError);
    if (isOk(r)) expect(r.value.resolution).toBe('retry-payment');
    else expect.unreachable('Ok여야 한다');
    expect(calls).toHaveLength(0);
  });

  it('REJECT 계열 → 조회 없이 즉시 definitively-failed', async () => {
    const { fetch, calls } = forbiddenFetch();
    const rejectError = tossError('REJECT_CARD_PAYMENT');
    const r = await resolveConfirmFailure(testClient(fetch), oid(), rejectError);
    if (isOk(r) && r.value.resolution === 'definitively-failed') {
      expect(r.value.error).toBe(rejectError);
    } else {
      expect.unreachable('definitively-failed여야 한다');
    }
    expect(calls).toHaveLength(0);
  });

  it('조회 자체가 Err → Err 전파(진실 미확정 — 성공/실패 어느 쪽도 단정 금지)', async () => {
    const { fetch } = mockFetch(() => ({
      status: 500,
      body: { code: 'FAILED_INTERNAL_SYSTEM_PROCESSING', message: '내부 오류' },
    }));
    const r = await resolveConfirmFailure(testClient(fetch), oid(), transportError);
    expect(isErr(r)).toBe(true);
  });

  it('flow.resolveFailure — actually-confirmed 가상계좌면 depositSecrets 저장 경로 재사용', async () => {
    const { fetch } = mockFetch(() => ({ status: 200, body: vaPayment() }));
    const deposits = memoryDepositSecretStore();
    const events = createTossEvents();
    const seen: string[] = [];
    events.on('deposit.secret-saved', (e) => {
      seen.push(e.orderId);
    });
    const flow = createConfirmFlow(testClient(fetch), memoryOrders(), {
      depositSecrets: deposits,
      events,
    });

    const r = await flow.resolveFailure(oid(), transportError);
    if (isOk(r)) expect(r.value.resolution).toBe('actually-confirmed');
    else expect.unreachable('Ok여야 한다');
    // confirm 실패로 저장 기회를 잃은 secret이 조회 응답에서 복구된다(실측 근거)
    expect(await deposits.getSecret(OID)).toBe(VA_SECRET);
    expect(seen).toEqual([OID]);
  });
});
