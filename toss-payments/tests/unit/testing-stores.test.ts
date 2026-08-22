import { describe, expect, it } from 'vitest';

import { customerKey, orderId, orThrow } from '../../src/index';
import type { BillingKeyRecord, StoredOrder } from '../../src/server';
import { memoryBillingKeyStore, memoryDedupeStore, memoryOrderStore } from '../../src/testing';

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
