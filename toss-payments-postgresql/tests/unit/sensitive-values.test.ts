/**
 * secure-by-default 저장 경계.
 *
 * 이 테스트의 protector는 평문을 DB 파라미터에 절대 넣지 않는 불투명 test double이며,
 * 세 스토어가 같은 purpose/recordId context를 encrypt/decrypt 양쪽에 전달하는지를
 * 고정한다. 실제 AES/KMS 선택은 앱 소유의 SensitiveValueProtector 구현 책임이다.
 */
import { describe, expect, it } from 'vitest';

import { createTossPaymentsPostgres } from '../../src/factory';
import { SENSITIVE_VALUE_PURPOSE, unsafePlaintextSensitiveValueProtector } from '../../src/sensitive-values';
import { createPgBillingKeyStore } from '../../src/stores/billing-keys';
import { createPgCancelRetryStore } from '../../src/stores/cancel-retries';
import { createPgDepositSecretStore } from '../../src/stores/deposit-secrets';
import { createFakeSql } from './helpers/fake-sql';
import {
  CUSTOMER_KEY,
  ORDER_ID,
  makeBillingKeyRecord,
  makeCancelRetryRecord,
} from './helpers/fixtures';
import { createSensitiveValueProtectorProbe } from './helpers/sensitive-protector';

describe('민감 스토어 — 보호기와 AAD context', () => {
  it('billing key record 전체를 opaque 값으로 저장하고 customerKey context로 복원한다', async () => {
    const fake = createFakeSql();
    const probe = createSensitiveValueProtectorProbe();
    const store = createPgBillingKeyStore(fake, { sensitiveValueProtector: probe.protector });
    const record = makeBillingKeyRecord({
      transfers: [{ bankName: '토스뱅크', bankAccountNumber: '100012345678' }],
    });

    await store.save(record);

    const stored = fake.calls[0]?.params;
    expect(stored?.[1]).toBe('sealed-1');
    expect(String(stored?.[1])).not.toContain(record.billingKey);
    expect(String(stored?.[1])).not.toContain('100012345678');
    // card/transfers JSONB에도 raw metadata를 복사하지 않는다.
    expect(stored?.slice(4)).toEqual([null, null]);
    expect(probe.calls).toEqual([
      {
        operation: 'encrypt',
        value: JSON.stringify(record),
        context: { purpose: SENSITIVE_VALUE_PURPOSE.billingKey, recordId: record.customerKey },
      },
    ]);

    fake.enqueueRows([{ billing_key: 'sealed-1' }]);
    await expect(store.find(CUSTOMER_KEY)).resolves.toEqual(record);
    expect(probe.calls[1]).toEqual({
      operation: 'decrypt',
      value: 'sealed-1',
      context: { purpose: SENSITIVE_VALUE_PURPOSE.billingKey, recordId: CUSTOMER_KEY },
    });
  });

  it('deposit secret은 orderId context에 결속된 opaque 값만 저장·복원한다', async () => {
    const fake = createFakeSql();
    const probe = createSensitiveValueProtectorProbe();
    const store = createPgDepositSecretStore(fake, { sensitiveValueProtector: probe.protector });
    const secret = 'ps_deposit_secret_do_not_store';

    await store.saveSecret(ORDER_ID, secret);

    expect(fake.calls[0]?.params).toEqual([ORDER_ID, 'sealed-1']);
    expect(String(fake.calls[0]?.params?.[1])).not.toContain(secret);
    expect(probe.calls[0]).toEqual({
      operation: 'encrypt',
      value: secret,
      context: { purpose: SENSITIVE_VALUE_PURPOSE.depositSecret, recordId: ORDER_ID },
    });

    fake.enqueueRows([{ secret: 'sealed-1' }]);
    await expect(store.getSecret(ORDER_ID)).resolves.toBe(secret);
    expect(probe.calls[1]).toEqual({
      operation: 'decrypt',
      value: 'sealed-1',
      context: { purpose: SENSITIVE_VALUE_PURPOSE.depositSecret, recordId: ORDER_ID },
    });
  });

  it('cancel retry record 전체를 ticketId context에 결속해 bodyJson 바이트를 복원한다', async () => {
    const fake = createFakeSql();
    const probe = createSensitiveValueProtectorProbe();
    const store = createPgCancelRetryStore(fake, { sensitiveValueProtector: probe.protector });
    const record = makeCancelRetryRecord({
      bodyJson: '{"refundAccount":"100012345678","memo":"원문 그대로"}',
    });

    await store.save(record);

    expect(fake.calls[0]?.params).toEqual([record.ticketId, 'sealed-1']);
    expect(String(fake.calls[0]?.params?.[1])).not.toContain('100012345678');
    expect(probe.calls[0]).toEqual({
      operation: 'encrypt',
      value: JSON.stringify(record),
      context: {
        purpose: SENSITIVE_VALUE_PURPOSE.cancelRetryRecord,
        recordId: record.ticketId,
      },
    });

    fake.enqueueRows([{ record_json: 'sealed-1' }]);
    await expect(store.load(record.ticketId)).resolves.toEqual(record);
    expect(probe.calls[1]).toEqual({
      operation: 'decrypt',
      value: 'sealed-1',
      context: {
        purpose: SENSITIVE_VALUE_PURPOSE.cancelRetryRecord,
        recordId: record.ticketId,
      },
    });
  });
});

describe('민감 스토어 — 실패와 명시적 평문 opt-in', () => {
  it('보호기 encrypt 실패면 SQL을 실행하지 않고 원인 실패를 그대로 전달한다', async () => {
    const failure = new Error('KMS temporarily unavailable');
    const fake = createFakeSql();
    const store = createPgDepositSecretStore(fake, {
      sensitiveValueProtector: {
        async encrypt() {
          throw failure;
        },
        async decrypt(ciphertext) {
          return ciphertext;
        },
      },
    });

    await expect(store.saveSecret(ORDER_ID, 'must-not-reach-db')).rejects.toBe(failure);
    expect(fake.calls).toHaveLength(0);
  });

  it('보호기 decrypt 실패면 저장본을 평문으로 취급하지 않고 실패를 전달한다', async () => {
    const failure = new Error('AAD authentication failed');
    const fake = createFakeSql();
    fake.enqueueRows([{ secret: 'opaque-ciphertext' }]);
    const store = createPgDepositSecretStore(fake, {
      sensitiveValueProtector: {
        async encrypt(plaintext) {
          return `encrypted:${plaintext.length}`;
        },
        async decrypt() {
          throw failure;
        },
      },
    });

    await expect(store.getSecret(ORDER_ID)).rejects.toBe(failure);
    expect(fake.calls).toHaveLength(1);
  });

  it('보호기를 생략한 JS 호출은 조립 시점에 거부한다 — raw 저장 fallback이 없다', () => {
    const fake = createFakeSql();

    expect(() => createTossPaymentsPostgres({ sql: fake } as never)).toThrow(
      /sensitiveValueProtector/,
    );
    expect(fake.calls).toHaveLength(0);
  });

  it('평문은 conspicuous unsafe protector를 명시했을 때만 저장된다', async () => {
    const fake = createFakeSql();
    const store = createPgDepositSecretStore(fake, {
      sensitiveValueProtector: unsafePlaintextSensitiveValueProtector,
    });

    await store.saveSecret(ORDER_ID, 'local-dev-only-secret');
    expect(fake.calls[0]?.params).toEqual([ORDER_ID, 'local-dev-only-secret']);
  });
});
