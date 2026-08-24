import { describe, expect, it } from 'vitest';

import { customerKey, orderId, orThrow } from '../../src/index';
import type { BillingKeyRecord, CancelRetryRecord, StoredOrder } from '../../src/server';
import {
  memoryBillingKeyStore,
  memoryCancelRetryStore,
  memoryDedupeStore,
  memoryDepositSecretStore,
  memoryOrderStore,
} from '../../src/testing';

// ── 픽스처 ─────────────────────────────────────────────────────────────────

function storedOrder(id: string, amount = 1000): StoredOrder {
  return {
    orderId: orThrow(orderId(id)),
    amount,
    currency: 'KRW',
    orderName: '테스트 주문',
    createdAt: '2026-08-09T12:00:00+09:00',
  };
}

function billingRecord(ck: string): BillingKeyRecord {
  return {
    customerKey: ck,
    billingKey: `bill_${ck}`,
    method: '카드',
    issuedAt: '2026-08-09T12:00:00+09:00',
    card: { issuerCode: '21', number: '941000******890', cardType: '신용', ownerType: '개인' },
    transfers: null,
  };
}

// ── memoryOrderStore ───────────────────────────────────────────────────────

describe('memoryOrderStore', () => {
  it('saveOrder → loadOrder 왕복', async () => {
    const store = memoryOrderStore();
    const order = storedOrder('order-123456');
    await store.saveOrder(order);
    expect(await store.loadOrder(order.orderId)).toEqual(order);
  });

  it('저장하지 않은 orderId는 null', async () => {
    const store = memoryOrderStore();
    expect(await store.loadOrder(orThrow(orderId('order-none01')))).toBeNull();
  });

  it('같은 orderId 재저장은 덮어쓴다', async () => {
    const store = memoryOrderStore();
    await store.saveOrder(storedOrder('order-123456', 1000));
    await store.saveOrder(storedOrder('order-123456', 2000));
    expect((await store.loadOrder(orThrow(orderId('order-123456'))))?.amount).toBe(2000);
  });

  it('인스턴스 간 상태가 격리된다', async () => {
    const a = memoryOrderStore();
    const b = memoryOrderStore();
    await a.saveOrder(storedOrder('order-123456'));
    expect(await b.loadOrder(orThrow(orderId('order-123456')))).toBeNull();
  });
});

// ── memoryBillingKeyStore ──────────────────────────────────────────────────

describe('memoryBillingKeyStore', () => {
  it('save → find 왕복 (customerKey 키)', async () => {
    const store = memoryBillingKeyStore();
    const record = billingRecord('cust-0001');
    await store.save(record);
    expect(await store.find(orThrow(customerKey('cust-0001')))).toEqual(record);
  });

  it('없는 customerKey는 null', async () => {
    const store = memoryBillingKeyStore();
    expect(await store.find(orThrow(customerKey('cust-none')))).toBeNull();
  });

  it('현재 billingKey와 일치하는 delete 후에는 find가 null', async () => {
    const store = memoryBillingKeyStore();
    const ck = orThrow(customerKey('cust-0001'));
    const record = billingRecord('cust-0001');
    await store.save(record);
    expect(await store.delete({ customerKey: ck, expectedBillingKey: record.billingKey })).toBe(true);
    expect(await store.find(ck)).toBeNull();
  });

  it('오래된 billingKey로 delete하면 재발급된 현재 행을 보존한다', async () => {
    const store = memoryBillingKeyStore();
    const ck = orThrow(customerKey('cust-0001'));
    await store.save({ ...billingRecord('cust-0001'), billingKey: 'bill_new' });
    expect(await store.delete({ customerKey: ck, expectedBillingKey: 'bill_old' })).toBe(false);
    expect((await store.find(ck))?.billingKey).toBe('bill_new');
  });

  it('같은 customerKey 재저장은 upsert', async () => {
    const store = memoryBillingKeyStore();
    const ck = orThrow(customerKey('cust-0001'));
    await store.save(billingRecord('cust-0001'));
    await store.save({ ...billingRecord('cust-0001'), billingKey: 'bill_new' });
    expect((await store.find(ck))?.billingKey).toBe('bill_new');
  });
});

// ── memoryDedupeStore ──────────────────────────────────────────────────────

describe('memoryDedupeStore', () => {
  it('processing → completed 수명주기를 구분한다', async () => {
    const store = memoryDedupeStore();
    expect(await store.claim('tx-1')).toBe('claimed');
    expect(await store.claim('tx-1')).toBe('processing');
    await store.complete('tx-1');
    expect(await store.claim('tx-1')).toBe('completed');
    expect(await store.claim('tx-2')).toBe('claimed');
  });

  it('동시 다발 claim에서도 정확히 하나만 점유한다 (원자성)', async () => {
    const store = memoryDedupeStore();
    const results = await Promise.all(
      Array.from({ length: 20 }, () => store.claim('same-id')),
    );
    expect(results.filter((state) => state === 'claimed')).toHaveLength(1);
    expect(results.filter((state) => state === 'processing')).toHaveLength(19);
  });

  it('인스턴스 간 상태가 격리된다', async () => {
    const a = memoryDedupeStore();
    const b = memoryDedupeStore();
    expect(await a.claim('tx-1')).toBe('claimed');
    expect(await b.claim('tx-1')).toBe('claimed');
  });

  it('release 후 다음 재전송이 재점유한다', async () => {
    const store = memoryDedupeStore();
    expect(await store.claim('tx-retry')).toBe('claimed');
    await store.release('tx-retry');
    expect(await store.claim('tx-retry')).toBe('claimed');
  });
});

// ── readonly inspection (부작용 없는 상태 단정) ─────────────────────────────

function retryRecord(ticketId: string): CancelRetryRecord {
  return {
    ticketId,
    paymentKey: 'pay_123',
    idempotencyKey: 'idem-1',
    issuedAt: '2026-08-09T12:00:00+09:00',
    path: '/v1/payments/pay_123/cancel',
    bodyJson: '{"cancelReason":"테스트"}',
    testCode: undefined,
    expectedCancelAmount: 1000,
    previousBalanceAmount: 1000,
  };
}

describe('memoryDedupeStore.stateOf — 부작용 없는 상태 조회', () => {
  it('claim/complete/release 수명주기를 그대로 비춘다', async () => {
    const store = memoryDedupeStore();
    expect(store.stateOf('tx-1')).toBeUndefined();
    await store.claim('tx-1');
    expect(store.stateOf('tx-1')).toBe('processing');
    await store.complete('tx-1');
    expect(store.stateOf('tx-1')).toBe('completed');
  });

  it('release 뒤 stateOf 프로브는 키를 재점유하지 않는다 (claim 프로브와 달리)', async () => {
    const store = memoryDedupeStore();
    await store.claim('tx-retry');
    await store.release('tx-retry');
    expect(store.stateOf('tx-retry')).toBeUndefined();
    expect(store.stateOf('tx-retry')).toBeUndefined(); // 반복 프로브도 무해
    // 프로브가 상태를 만들지 않았으므로 다음 claim이 새로 점유한다.
    expect(await store.claim('tx-retry')).toBe('claimed');
  });

  it('없는 키 프로브는 항목을 만들지 않는다', async () => {
    const store = memoryDedupeStore();
    expect(store.stateOf('tx-none')).toBeUndefined();
    expect(await store.claim('tx-none')).toBe('claimed');
  });
});

describe('memoryOrderStore.orderOf — 방어적 복사 inspection', () => {
  it('저장된 주문을 돌려주고, 없는 orderId는 undefined (항목 미생성)', async () => {
    const store = memoryOrderStore();
    expect(store.orderOf('order-none01')).toBeUndefined();
    expect(await store.loadOrder(orThrow(orderId('order-none01')))).toBeNull();
    const order = storedOrder('order-123456');
    await store.saveOrder(order);
    expect(store.orderOf('order-123456')).toEqual(order);
  });

  it('반환 객체를 변이해도 스토어가 오염되지 않는다', async () => {
    const store = memoryOrderStore();
    await store.saveOrder(storedOrder('order-123456', 1000));
    const copy = store.orderOf('order-123456');
    (copy as { amount: number }).amount = 99_999;
    expect((await store.loadOrder(orThrow(orderId('order-123456'))))?.amount).toBe(1000);
    expect(store.orderOf('order-123456')?.amount).toBe(1000);
  });
});

describe('memoryBillingKeyStore.recordOf — 깊은 방어적 복사', () => {
  it('저장된 레코드를 돌려주고, 없는 customerKey는 undefined', async () => {
    const store = memoryBillingKeyStore();
    expect(store.recordOf('cust-none')).toBeUndefined();
    const record = billingRecord('cust-0001');
    await store.save(record);
    expect(store.recordOf('cust-0001')).toEqual(record);
  });

  it('중첩 card 객체를 변이해도 스토어가 오염되지 않는다 (깊은 복사 증명)', async () => {
    const store = memoryBillingKeyStore();
    await store.save(billingRecord('cust-0001'));
    const copy = store.recordOf('cust-0001');
    (copy as { billingKey: string }).billingKey = 'bill_tampered';
    (copy?.card as { issuerCode: string }).issuerCode = 'XX';
    const current = await store.find(orThrow(customerKey('cust-0001')));
    expect(current?.billingKey).toBe('bill_cust-0001');
    expect(current?.card?.issuerCode).toBe('21');
  });

  it('transfers 배열도 복사된다', async () => {
    const store = memoryBillingKeyStore();
    await store.save({
      ...billingRecord('cust-0002'),
      method: '계좌이체',
      card: null,
      transfers: [{ bankName: '테스트은행', bankAccountNumber: '110***1234' }],
    });
    const copy = store.recordOf('cust-0002');
    (copy?.transfers?.[0] as { bankName: string }).bankName = '조작은행';
    const current = await store.find(orThrow(customerKey('cust-0002')));
    expect(current?.transfers?.[0]?.bankName).toBe('테스트은행');
  });
});

describe('memoryDepositSecretStore.secretOf — 부작용 없는 조회', () => {
  it('저장된 secret을 돌려주고, 없는 orderId는 undefined (getSecret null 계약과 별개)', async () => {
    const store = memoryDepositSecretStore();
    expect(store.secretOf('order-none01')).toBeUndefined();
    await store.saveSecret(orThrow(orderId('order-123456')), 'ps_secret');
    expect(store.secretOf('order-123456')).toBe('ps_secret');
    expect(await store.getSecret('order-none01')).toBeNull();
  });
});

describe('memoryCancelRetryStore.recordOf — 방어적 복사 inspection', () => {
  it('저장된 레코드를 돌려주고, 없는 ticketId는 undefined', async () => {
    const store = memoryCancelRetryStore();
    expect(store.recordOf('ticket-none')).toBeUndefined();
    const record = retryRecord('ticket-1');
    await store.save(record);
    expect(store.recordOf('ticket-1')).toEqual(record);
  });

  it('반환 객체를 변이해도 스토어가 오염되지 않는다', async () => {
    const store = memoryCancelRetryStore();
    await store.save(retryRecord('ticket-1'));
    const copy = store.recordOf('ticket-1');
    (copy as { bodyJson: string }).bodyJson = '{"tampered":true}';
    expect((await store.load('ticket-1'))?.bodyJson).toBe('{"cancelReason":"테스트"}');
  });

  it('delete 뒤에는 undefined', async () => {
    const store = memoryCancelRetryStore();
    await store.save(retryRecord('ticket-1'));
    await store.delete('ticket-1');
    expect(store.recordOf('ticket-1')).toBeUndefined();
  });
});
