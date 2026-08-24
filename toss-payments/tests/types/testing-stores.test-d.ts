import { describe, expectTypeOf, it } from 'vitest';

import {
  memoryBillingKeyStore,
  memoryCancelRetryStore,
  memoryDedupeStore,
  memoryDepositSecretStore,
  memoryOrderStore,
} from '../../src/testing';
import type {
  BillingKeyRecord,
  BillingKeyStore,
  CancelRetryRecord,
  CancelRetryStore,
  DepositSecretStore,
  OrderStore,
  StoredOrder,
} from '../../src/server';
import type { WebhookDedupeStore } from '../../src/webhook';

describe('memory* inspection — 기존 스토어 계약 유지', () => {
  it('반환값은 여전히 각 스토어 인터페이스에 할당 가능 (additive)', () => {
    expectTypeOf(memoryOrderStore()).toExtend<OrderStore>();
    expectTypeOf(memoryBillingKeyStore()).toExtend<BillingKeyStore>();
    expectTypeOf(memoryDepositSecretStore()).toExtend<DepositSecretStore>();
    expectTypeOf(memoryCancelRetryStore()).toExtend<CancelRetryStore>();
    expectTypeOf(memoryDedupeStore()).toExtend<WebhookDedupeStore>();
  });

  it('inspection 시그니처', () => {
    expectTypeOf(memoryDedupeStore().stateOf).toEqualTypeOf<
      (dedupeKey: string) => 'processing' | 'completed' | undefined
    >();
    expectTypeOf(memoryOrderStore().orderOf).returns.toEqualTypeOf<
      StoredOrder | undefined
    >();
    expectTypeOf(memoryBillingKeyStore().recordOf).returns.toEqualTypeOf<
      BillingKeyRecord | undefined
    >();
    expectTypeOf(memoryDepositSecretStore().secretOf).returns.toEqualTypeOf<
      string | undefined
    >();
    expectTypeOf(memoryCancelRetryStore().recordOf).returns.toEqualTypeOf<
      CancelRetryRecord | undefined
    >();
  });
});

describe('memory* inspection — readonly 뷰 (변이는 컴파일 에러)', () => {
  it('orderOf 결과는 변이 불가', () => {
    const order = memoryOrderStore().orderOf('order-123456');
    if (order !== undefined) {
      // @ts-expect-error readonly
      order.amount = 99_999;
    }
  });

  it('recordOf 결과는 중첩까지 변이 불가', () => {
    const record = memoryBillingKeyStore().recordOf('cust-0001');
    if (record !== undefined) {
      // @ts-expect-error readonly
      record.billingKey = 'bill_other';
      if (record.card !== null) {
        // @ts-expect-error 중첩 card도 readonly
        record.card.issuerCode = 'XX';
      }
      if (record.transfers !== null) {
        // @ts-expect-error readonly 배열에는 push가 없다
        record.transfers.push({ bankName: 'x', bankAccountNumber: 'y' });
      }
    }
  });

  it('cancel retry recordOf 결과는 변이 불가', () => {
    const record = memoryCancelRetryStore().recordOf('ticket-1');
    if (record !== undefined) {
      // @ts-expect-error readonly
      record.bodyJson = '{}';
    }
  });
});
