/**
 * §3.3 billing_keys — 토스에 조회 API가 없어 이 테이블이 유일한 보관 수단.
 *
 * 보안 불변식(코어 stores.ts ⚠): 어떤 에러 메시지에도 billing_key 값을 싣지 않고,
 * customerKey와 billingKey를 같은 문자열에 함께 두지 않는다 — 이 파일이 그 계약을
 * 회귀 방지선으로 고정한다.
 */
import { describe, expect, it } from 'vitest';

import { isTossPostgresError } from '../../src/errors';
import { createPgBillingKeyStore } from '../../src/stores/billing-keys';
import { createFakeSql, norm } from './helpers/fake-sql';
import {
  CUSTOMER_KEY,
  TEST_UNSAFE_SENSITIVE_STORE_OPTIONS,
  makeBillingKeyRecord,
} from './helpers/fixtures';

describe('§3.3 save — upsert(customer_key)', () => {
  it('INSERT ... ON CONFLICT (customer_key) DO UPDATE로 최신 발급본을 유지한다', async () => {
    const fake = createFakeSql();
    const store = createPgBillingKeyStore(fake, TEST_UNSAFE_SENSITIVE_STORE_OPTIONS);
    const record = makeBillingKeyRecord();

    await store.save(record);

    expect(fake.calls).toHaveLength(1);
    const text = norm(fake.calls[0]?.text ?? '');
    expect(text).toContain('INSERT INTO "toss_payments".billing_keys');
    expect(text).toContain('ON CONFLICT (customer_key) DO UPDATE');
    expect(text).toContain('billing_key = excluded.billing_key');
    // unsafe opt-in 테스트에서는 record JSON이 그대로 보이지만, 실제 protector에서는
    // 이 자리에 ciphertext가 온다(전용 sensitive-values.test.ts가 암호문 경계를 검증).
    expect(fake.calls[0]?.params).toEqual([
      record.customerKey,
      JSON.stringify(record),
      record.method,
      record.issuedAt,
      null,
      null,
    ]);
  });

  it('card/transfers는 보호된 record payload 밖의 JSONB 컬럼에 복사하지 않는다', async () => {
    const fake = createFakeSql();
    const store = createPgBillingKeyStore(fake, TEST_UNSAFE_SENSITIVE_STORE_OPTIONS);
    const transfers = [{ bankName: '토스뱅크', bankAccountNumber: '100012345678' }];
    const record = makeBillingKeyRecord({ method: '계좌이체', card: null, transfers });

    await store.save(record);

    expect(fake.calls[0]?.params?.[1]).toBe(JSON.stringify(record));
    expect(fake.calls[0]?.params?.[4]).toBeNull();
    expect(fake.calls[0]?.params?.[5]).toBeNull();
  });
});

describe('§3.3 find — 복원과 null', () => {
  it('행이 없으면 null을 반환한다', async () => {
    const fake = createFakeSql();
    const store = createPgBillingKeyStore(fake, TEST_UNSAFE_SENSITIVE_STORE_OPTIONS);

    await expect(store.find(CUSTOMER_KEY)).resolves.toBeNull();
    expect(fake.calls[0]?.params).toEqual([CUSTOMER_KEY]);
  });

  it('보호된 JSON payload를 BillingKeyRecord로 복원한다 — card/transfers까지 같은 경계', async () => {
    const fake = createFakeSql();
    const record = makeBillingKeyRecord();
    fake.enqueueRows([
      { billing_key: JSON.stringify(record) },
    ]);
    const store = createPgBillingKeyStore(fake, TEST_UNSAFE_SENSITIVE_STORE_OPTIONS);

    await expect(store.find(CUSTOMER_KEY)).resolves.toEqual(record);
  });

  it('customerKey가 payload와 다르면 invalid-row — AAD 구현 누락/행 교체도 조용히 수용하지 않는다', async () => {
    const fake = createFakeSql();
    const record = makeBillingKeyRecord();
    fake.enqueueRows([{ billing_key: JSON.stringify({ ...record, customerKey: 'other-customer' }) }]);
    const store = createPgBillingKeyStore(fake, TEST_UNSAFE_SENSITIVE_STORE_OPTIONS);

    await expect(store.find(CUSTOMER_KEY)).rejects.toMatchObject({ code: 'invalid-row' });
  });

  it('계약 위반 행은 invalid-row — 메시지에 billingKey·customerKey 어느 쪽도 없다', async () => {
    const fake = createFakeSql();
    fake.enqueueRows([
      { billing_key: JSON.stringify({ ...makeBillingKeyRecord(), method: 'CARD' }) },
    ]);
    const store = createPgBillingKeyStore(fake, TEST_UNSAFE_SENSITIVE_STORE_OPTIONS);

    let thrown: unknown;
    try {
      await store.find(CUSTOMER_KEY);
    } catch (error) {
      thrown = error;
    }

    expect(isTossPostgresError(thrown)).toBe(true);
    if (isTossPostgresError(thrown)) {
      expect(thrown.code).toBe('invalid-row');
      // 보안 불변식 — 쌍 분리: 메시지에 billingKey도 customerKey도 싣지 않는다
      expect(thrown.message).not.toContain('bkey_leak_canary');
      expect(thrown.message).not.toContain(CUSTOMER_KEY);
    }
  });

  it('보호된 JSON payload가 손상되면 invalid-row — 복호화 평문 cause도 보존하지 않는다', async () => {
    const fake = createFakeSql();
    fake.enqueueRows([
      { billing_key: '{"billingKey":"bkey_leak_canary", broken' },
    ]);
    const store = createPgBillingKeyStore(fake, TEST_UNSAFE_SENSITIVE_STORE_OPTIONS);

    let thrown: unknown;
    try {
      await store.find(CUSTOMER_KEY);
    } catch (error) {
      thrown = error;
    }

    expect(isTossPostgresError(thrown)).toBe(true);
    if (isTossPostgresError(thrown)) {
      expect(thrown.code).toBe('invalid-row');
      expect(thrown.cause).toBeUndefined();
      expect(thrown.message).not.toContain('bkey_leak_canary');
    }
  });
});

describe('§3.3 delete', () => {
  it('customer_key 기준 DELETE를 실행한다', async () => {
    const fake = createFakeSql();
    const store = createPgBillingKeyStore(fake, TEST_UNSAFE_SENSITIVE_STORE_OPTIONS);

    await store.delete(CUSTOMER_KEY);

    expect(norm(fake.calls[0]?.text ?? '')).toBe(
      'DELETE FROM "toss_payments".billing_keys WHERE customer_key = $1',
    );
    expect(fake.calls[0]?.params).toEqual([CUSTOMER_KEY]);
  });
});
