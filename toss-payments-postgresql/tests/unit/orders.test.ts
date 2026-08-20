/**
 * §3.1 orders — 금액 대조의 단일 진실 공급원.
 *
 * 핵심 불변식: saveOrder는 insert-only + 동일값 재저장 무해. 조용한 upsert로 원본
 * 금액을 덮으면 confirm의 금액 대조 검증 전체가 무력화되므로, 상이값 재저장은
 * order-conflict로 거부하고 동일값 재시도만 멱등하게 성공시킨다.
 */
import { describe, expect, it } from 'vitest';

import { isTossPostgresError } from '../../src/errors';
import { createPgOrderStore } from '../../src/stores/orders';
import { createFakeSql, norm } from './helpers/fake-sql';
import { ORDER_ID, makeStoredOrder } from './helpers/fixtures';

async function captureRejection(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
    return undefined;
  } catch (error) {
    return error;
  }
}

describe('§3.1 saveOrder — insert-only + 동일값 멱등', () => {
  it('신규 주문: INSERT ... ON CONFLICT DO NOTHING RETURNING 1문으로 끝난다', async () => {
    const fake = createFakeSql();
    fake.enqueueRows([{ order_id: ORDER_ID }]); // RETURNING이 행을 돌려줌 = 신규 insert
    const store = createPgOrderStore(fake);
    const order = makeStoredOrder();

    await store.saveOrder(order);

    expect(fake.calls).toHaveLength(1); // 충돌 판정 SELECT 없이 종료
    const call = fake.calls[0];
    expect(norm(call?.text ?? '')).toContain('INSERT INTO "toss_payments".orders');
    expect(norm(call?.text ?? '')).toContain('ON CONFLICT (order_id) DO NOTHING');
    expect(norm(call?.text ?? '')).toContain('RETURNING order_id'); // rowCount 미의존 계약
    expect(call?.params).toEqual([
      order.orderId,
      order.amount,
      order.currency,
      order.orderName,
      order.createdAt,
    ]);
  });

  it('동일값 재저장: 충돌 후 SELECT 비교(amount·currency·orderName)가 일치하면 멱등 성공한다', async () => {
    const fake = createFakeSql();
    fake.enqueueRows([]); // 충돌 — RETURNING 없음
    fake.enqueueRows([
      // pg 드라이버 시맨틱: bigint는 string으로 내려온다
      { amount: '10000', currency: 'KRW', order_name: '테스트 주문', created_at: '2026-08-20T12:00:00+09:00' },
    ]);
    const store = createPgOrderStore(fake);

    await expect(store.saveOrder(makeStoredOrder())).resolves.toBeUndefined();

    expect(fake.calls).toHaveLength(2);
    expect(norm(fake.calls[1]?.text ?? '')).toContain('SELECT amount, currency, order_name, created_at');
    expect(fake.calls[1]?.params).toEqual([ORDER_ID]);
  });

  it('createdAt만 다른 재저장은 멱등 성공한다 — 코어 createOrder가 호출마다 clock()으로 새로 찍으므로 대조 대상이 아니다', async () => {
    const fake = createFakeSql();
    fake.enqueueRows([]); // 충돌 — RETURNING 없음
    fake.enqueueRows([
      { amount: '10000', currency: 'KRW', order_name: '테스트 주문', created_at: '2026-08-19T00:00:00+09:00' },
    ]);
    const store = createPgOrderStore(fake);

    // 소비자 orderId 재제출(더블클릭) 시나리오 — 비즈니스 값이 같으면 성공해야 한다
    await expect(
      store.saveOrder(makeStoredOrder({ createdAt: '2026-08-20T12:00:00+09:00' })),
    ).resolves.toBeUndefined();
  });

  it.each([
    ['amount', { amount: '99999' }],
    ['currency', { currency: 'USD' }],
    ['order_name', { order_name: '다른 주문명' }],
  ])('상이값 재저장(%s 다름): order-conflict로 throw한다', async (_field, diff) => {
    const fake = createFakeSql();
    fake.enqueueRows([]);
    fake.enqueueRows([
      {
        amount: '10000',
        currency: 'KRW',
        order_name: '테스트 주문',
        created_at: '2026-08-20T12:00:00+09:00',
        ...diff,
      },
    ]);
    const store = createPgOrderStore(fake);

    const thrown = await captureRejection(store.saveOrder(makeStoredOrder()));

    expect(isTossPostgresError(thrown)).toBe(true);
    if (isTossPostgresError(thrown)) {
      expect(thrown.code).toBe('order-conflict');
      // 로그 표면 최소화 — 금액·통화 등 구체 값은 메시지에 싣지 않는다(orderId만)
      expect(thrown.message).toContain(ORDER_ID);
      expect(thrown.message).not.toContain('10000');
      expect(thrown.message).not.toContain('99999');
    }
  });

  it('충돌인데 기존 행 조회가 비면 invalid-row — 조용히 넘기지 않는다', async () => {
    const fake = createFakeSql();
    fake.enqueueRows([]);
    fake.enqueueRows([]); // 극단 레이스: 충돌 직후 행 실종
    const store = createPgOrderStore(fake);

    const thrown = await captureRejection(store.saveOrder(makeStoredOrder()));

    expect(isTossPostgresError(thrown)).toBe(true);
    if (isTossPostgresError(thrown)) expect(thrown.code).toBe('invalid-row');
  });
});

describe('§3.1 loadOrder — 행 복원과 bigint 변환', () => {
  it('행이 없으면 null을 반환한다', async () => {
    const fake = createFakeSql();
    const store = createPgOrderStore(fake);

    await expect(store.loadOrder(ORDER_ID)).resolves.toBeNull();
    expect(fake.calls[0]?.params).toEqual([ORDER_ID]);
  });

  it('pg 스타일 bigint string은 number로 변환해 StoredOrder를 복원한다', async () => {
    const fake = createFakeSql();
    fake.enqueueRows([
      { amount: '10000', currency: 'KRW', order_name: '테스트 주문', created_at: '2026-08-20T12:00:00+09:00' },
    ]);
    const store = createPgOrderStore(fake);

    const loaded = await store.loadOrder(ORDER_ID);

    expect(loaded).toEqual(makeStoredOrder());
    expect(typeof loaded?.amount).toBe('number');
  });

  it.each([
    ['number 그대로', 5000, 5000],
    ['bigint → number', 5000n, 5000],
    ['string "0"', '0', 0],
  ])('커스텀 SqlClient의 amount 표현(%s)도 수용한다', async (_label, raw, expected) => {
    const fake = createFakeSql();
    fake.enqueueRows([
      { amount: raw, currency: 'KRW', order_name: '테스트 주문', created_at: '2026-08-20T12:00:00+09:00' },
    ]);
    const store = createPgOrderStore(fake);

    const loaded = await store.loadOrder(ORDER_ID);
    expect(loaded?.amount).toBe(expected);
  });

  it.each([
    ['safe integer 밖 string', '9007199254740993'],
    ['safe integer 밖 bigint', 2n ** 53n],
    ['숫자가 아닌 string', 'not-a-number'],
  ])('안전 정수 범위 밖 amount(%s)는 unsafe-amount로 throw한다', async (_label, raw) => {
    const fake = createFakeSql();
    fake.enqueueRows([
      { amount: raw, currency: 'KRW', order_name: '주문', created_at: '2026-08-20T12:00:00+09:00' },
    ]);
    const store = createPgOrderStore(fake);

    const thrown = await captureRejection(store.loadOrder(ORDER_ID));

    expect(isTossPostgresError(thrown)).toBe(true);
    if (isTossPostgresError(thrown)) expect(thrown.code).toBe('unsafe-amount');
  });

  it.each([
    ['currency 유니언 밖', { currency: 'EUR' }],
    ['order_name 비문자열', { order_name: 7 }],
    ['created_at 비문자열', { created_at: null }],
    ['amount 비숫자 타입', { amount: { boxed: 1 } }],
  ])('계약 위반 행(%s)은 invalid-row로 throw한다', async (_label, corrupt) => {
    const fake = createFakeSql();
    fake.enqueueRows([
      {
        amount: '10000',
        currency: 'KRW',
        order_name: '주문',
        created_at: '2026-08-20T12:00:00+09:00',
        ...corrupt,
      },
    ]);
    const store = createPgOrderStore(fake);

    const thrown = await captureRejection(store.loadOrder(ORDER_ID));

    expect(isTossPostgresError(thrown)).toBe(true);
    if (isTossPostgresError(thrown)) expect(thrown.code).toBe('invalid-row');
  });

  it('드라이버 에러는 감싸지 않고 그대로 통과한다(cause 체인 보존 원칙)', async () => {
    const fake = createFakeSql();
    const driverError = Object.assign(new Error('connection refused'), { code: 'ECONNREFUSED' });
    fake.enqueueError(driverError);
    const store = createPgOrderStore(fake);

    await expect(store.loadOrder(ORDER_ID)).rejects.toBe(driverError);
  });
});
