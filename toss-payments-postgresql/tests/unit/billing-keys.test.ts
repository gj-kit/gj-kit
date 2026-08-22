/**
 * §3.3 billing_keys — 토스에 조회 API가 없어 이 테이블이 유일한 보관 수단.
 *
 * 보안 불변식(코어 stores.ts ⚠): 어떤 에러 메시지에도 billing_key 값을 싣지 않고,
 * customerKey와 billingKey를 같은 문자열에 함께 두지 않는다 — 이 파일이 그 계약을
 * 회귀 방지선으로 고정한다.
 */
import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';

import { isTossPostgresError } from '../../src/errors';
import { createPgBillingKeyStore } from '../../src/stores/billing-keys';
import { createFakeSql, norm, normTexts } from './helpers/fake-sql';
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

    // SqlClient aggregate/direct path는 첫 발급의 missing-row 경합까지 막기 위해
    // customerKey advisory lock + transaction에 save를 넣는다.
    expect(fake.calls).toHaveLength(5);
    expect(normTexts(fake).slice(0, 3)).toEqual([
      'BEGIN',
      'SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))',
      'SELECT billing_key, operation_fingerprint FROM "toss_payments".billing_keys WHERE customer_key = $1 FOR UPDATE',
    ]);
    const text = norm(fake.calls[3]?.text ?? '');
    expect(text).toContain('INSERT INTO "toss_payments".billing_keys');
    expect(text).toContain('ON CONFLICT (customer_key) DO UPDATE');
    expect(text).toContain('billing_key = excluded.billing_key');
    // unsafe opt-in 테스트에서는 record JSON이 그대로 보이지만, 실제 protector에서는
    // 이 자리에 ciphertext가 온다(전용 sensitive-values.test.ts가 암호문 경계를 검증).
    expect(fake.calls[3]?.params).toEqual([
      record.customerKey,
      JSON.stringify(record),
      record.method,
      record.issuedAt,
      null,
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

    expect(fake.calls[3]?.params?.[1]).toBe(JSON.stringify(record));
    expect(fake.calls[3]?.params?.[4]).toBeNull();
    expect(fake.calls[3]?.params?.[5]).toBeNull();
    expect(fake.calls[3]?.params?.[6]).toBeNull();
  });

  it('operationId 원문 대신 SHA-256 fingerprint만 저장한다', async () => {
    const fake = createFakeSql();
    const store = createPgBillingKeyStore(fake, TEST_UNSAFE_SENSITIVE_STORE_OPTIONS);
    const operationId = 'billing-intent-operation-123';

    await store.save(makeBillingKeyRecord(), { operationId });

    const fingerprint = fake.calls[3]?.params?.[6];
    expect(fingerprint).toBe(createHash('sha256').update(operationId, 'utf8').digest('hex'));
    expect(JSON.stringify(fake.calls)).not.toContain(operationId);
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

describe('§3.3 delete — 코어 조건부 compare-and-delete', () => {
  it('현재 billing key가 일치할 때만 lock → decrypt → DELETE를 실행한다', async () => {
    const fake = createFakeSql();
    const record = makeBillingKeyRecord();
    fake.respond((text) => {
      if (norm(text).startsWith('SELECT billing_key')) {
        return [{ billing_key: JSON.stringify(record) }];
      }
      if (norm(text).startsWith('DELETE FROM')) return [{ deleted: 1 }];
      return [];
    });
    const store = createPgBillingKeyStore(fake, TEST_UNSAFE_SENSITIVE_STORE_OPTIONS);

    await expect(
      store.delete({ customerKey: CUSTOMER_KEY, expectedBillingKey: record.billingKey }),
    ).resolves.toBe(true);

    expect(normTexts(fake)).toEqual([
      'BEGIN',
      'SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))',
      'SELECT billing_key, operation_fingerprint FROM "toss_payments".billing_keys WHERE customer_key = $1 FOR UPDATE',
      'DELETE FROM "toss_payments".billing_keys WHERE customer_key = $1 RETURNING 1 AS deleted',
      'COMMIT',
    ]);
    expect(fake.calls[3]?.params).toEqual([CUSTOMER_KEY]);
  });
});

describe('§3.3 PostgreSQL conditional mutation — stale webhook/compensation CAS', () => {
  it('replaceAndGetPrevious는 같은 transaction에서 직전 snapshot을 읽고 새 record를 저장한다', async () => {
    const fake = createFakeSql();
    const previous = makeBillingKeyRecord({ billingKey: 'bkey_previous' });
    const issued = makeBillingKeyRecord({ billingKey: 'bkey_issued' });
    fake.respond((text) =>
      norm(text).startsWith('SELECT billing_key')
        ? [{ billing_key: JSON.stringify(previous) }]
        : [],
    );
    const store = createPgBillingKeyStore(fake, TEST_UNSAFE_SENSITIVE_STORE_OPTIONS);

    await expect(store.replaceAndGetPrevious(issued)).resolves.toMatchObject({ record: previous });

    expect(normTexts(fake)).toEqual([
      'BEGIN',
      'SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))',
      'SELECT billing_key, operation_fingerprint FROM "toss_payments".billing_keys WHERE customer_key = $1 FOR UPDATE',
      expect.stringContaining('INSERT INTO "toss_payments".billing_keys'),
      'COMMIT',
    ]);
    expect(fake.calls.every((call) => call.via === 'session')).toBe(true);
    expect(fake.calls[3]?.params?.[1]).toBe(JSON.stringify(issued));
  });

  it('없는 행 또는 다른 billing key면 false이며 DELETE/UPDATE를 실행하지 않는다', async () => {
    const fake = createFakeSql();
    const current = makeBillingKeyRecord({ billingKey: 'bkey_current' });
    fake.respond((text) =>
      norm(text).startsWith('SELECT billing_key')
        ? [{ billing_key: JSON.stringify(current) }]
        : [],
    );
    const store = createPgBillingKeyStore(fake, TEST_UNSAFE_SENSITIVE_STORE_OPTIONS);

    await expect(
      store.deleteIfBillingKeyMatches({ customerKey: CUSTOMER_KEY, expectedBillingKey: 'bkey_stale' }),
    ).resolves.toBe(false);

    expect(normTexts(fake)).toEqual([
      'BEGIN',
      'SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))',
      'SELECT billing_key, operation_fingerprint FROM "toss_payments".billing_keys WHERE customer_key = $1 FOR UPDATE',
      'COMMIT',
    ]);
  });

  it('matching billing key만 lock → decrypt → timing-safe compare 뒤에 DELETE한다', async () => {
    const fake = createFakeSql();
    const current = makeBillingKeyRecord({ billingKey: 'bkey_current' });
    fake.respond((text) => {
      const normalized = norm(text);
      if (normalized.startsWith('SELECT billing_key')) {
        return [{ billing_key: JSON.stringify(current) }];
      }
      if (normalized.startsWith('DELETE FROM')) return [{ deleted: 1 }];
      return [];
    });
    const store = createPgBillingKeyStore(fake, TEST_UNSAFE_SENSITIVE_STORE_OPTIONS);

    await expect(
      store.deleteIfBillingKeyMatches({
        customerKey: CUSTOMER_KEY,
        expectedBillingKey: current.billingKey,
      }),
    ).resolves.toBe(true);

    expect(normTexts(fake)).toEqual([
      'BEGIN',
      'SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))',
      'SELECT billing_key, operation_fingerprint FROM "toss_payments".billing_keys WHERE customer_key = $1 FOR UPDATE',
      'DELETE FROM "toss_payments".billing_keys WHERE customer_key = $1 RETURNING 1 AS deleted',
      'COMMIT',
    ]);
  });

  it('matching billing key만 raw replacement로 바꾸며 raw record replacement는 operation fingerprint를 비운다', async () => {
    const fake = createFakeSql();
    const current = makeBillingKeyRecord({ billingKey: 'bkey_issued' });
    const previous = makeBillingKeyRecord({ billingKey: 'bkey_previous' });
    fake.respond((text) => {
      const normalized = norm(text);
      if (normalized.startsWith('SELECT billing_key')) {
        return [{ billing_key: JSON.stringify(current) }];
      }
      if (normalized.startsWith('UPDATE')) return [{ replaced: 1 }];
      return [];
    });
    const store = createPgBillingKeyStore(fake, TEST_UNSAFE_SENSITIVE_STORE_OPTIONS);

    await expect(
      store.replaceIfBillingKeyMatches(CUSTOMER_KEY, current.billingKey, previous),
    ).resolves.toBe(true);

    expect(norm(fake.calls[3]?.text ?? '')).toContain('UPDATE "toss_payments".billing_keys');
    expect(fake.calls[3]?.params).toEqual([
      CUSTOMER_KEY,
      JSON.stringify(previous),
      previous.method,
      previous.issuedAt,
      null,
      null,
      null,
    ]);
  });

  it('replaceAndGetPrevious snapshot 원본을 restore하면 prior operation fingerprint도 보존한다', async () => {
    const fake = createFakeSql();
    const priorOperationId = 'billing-intent-prior';
    const currentOperationId = 'billing-intent-current';
    const previous = makeBillingKeyRecord({ billingKey: 'bkey_previous' });
    const current = makeBillingKeyRecord({ billingKey: 'bkey_current' });
    let selectCount = 0;
    fake.respond((text) => {
      const normalized = norm(text);
      if (normalized.startsWith('SELECT billing_key')) {
        selectCount += 1;
        return selectCount === 1
          ? [{
              billing_key: JSON.stringify(previous),
              operation_fingerprint: createHash('sha256').update(priorOperationId).digest('hex'),
            }]
          : [{
              billing_key: JSON.stringify(current),
              operation_fingerprint: createHash('sha256').update(currentOperationId).digest('hex'),
            }];
      }
      if (normalized.startsWith('UPDATE')) return [{ replaced: 1 }];
      return [];
    });
    const store = createPgBillingKeyStore(fake, TEST_UNSAFE_SENSITIVE_STORE_OPTIONS);

    const snapshot = await store.replaceAndGetPrevious(current, { operationId: currentOperationId });
    if (snapshot === null) throw new Error('previous snapshot expected');
    await expect(
      store.replaceIfBillingKeyMatches(CUSTOMER_KEY, current.billingKey, snapshot),
    ).resolves.toBe(true);

    expect(fake.calls[8]?.params?.[6]).toBe(
      createHash('sha256').update(priorOperationId).digest('hex'),
    );
  });

  it('snapshot을 상속·재구성한 객체는 prior operation fingerprint를 복원할 수 없다', async () => {
    const fake = createFakeSql();
    const priorOperationId = 'billing-intent-prior-sealed';
    const current = makeBillingKeyRecord({ billingKey: 'bkey_current-sealed' });
    const previous = makeBillingKeyRecord({ billingKey: 'bkey_previous-sealed' });
    let selectCount = 0;
    fake.respond((text) => {
      const normalized = norm(text);
      if (normalized.startsWith('UPDATE')) return [{ replaced: 1 }];
      if (!normalized.startsWith('SELECT billing_key')) return [];
      selectCount += 1;
      return selectCount === 1
        ? [{
            billing_key: JSON.stringify(previous),
            operation_fingerprint: createHash('sha256').update(priorOperationId).digest('hex'),
          }]
        : [{ billing_key: JSON.stringify(current) }];
    });
    const store = createPgBillingKeyStore(fake, TEST_UNSAFE_SENSITIVE_STORE_OPTIONS);

    const snapshot = await store.replaceAndGetPrevious(current);
    if (snapshot === null) throw new Error('previous snapshot expected');
    // `Object.create`는 public record를 상속할 수 있어도 module-local WeakMap identity에는 없다.
    const inheritedCopy = Object.assign(Object.create(snapshot), previous);
    await expect(
      store.replaceIfBillingKeyMatches(CUSTOMER_KEY, current.billingKey, inheritedCopy),
    ).resolves.toBe(true);

    expect(fake.calls[8]?.params?.[6]).toBeNull();
  });

  it('locked current-operation check은 raw operationId를 저장/반환하지 않고 current row에서만 판정한다', async () => {
    const fake = createFakeSql();
    const record = makeBillingKeyRecord();
    const operationId = 'billing-intent-current';
    fake.respond((text) =>
      norm(text).startsWith('SELECT billing_key')
        ? [{
            billing_key: JSON.stringify(record),
            operation_fingerprint: createHash('sha256').update(operationId).digest('hex'),
          }]
        : [],
    );
    const store = createPgBillingKeyStore(fake, TEST_UNSAFE_SENSITIVE_STORE_OPTIONS);

    await expect(
      store.withMutationLock(CUSTOMER_KEY, (mutation) => mutation.isCurrentOperationId(operationId)),
    ).resolves.toBe(true);
    await expect(
      store.withMutationLock(CUSTOMER_KEY, (mutation) => mutation.isCurrentOperationId('other-intent')),
    ).resolves.toBe(false);
    expect(JSON.stringify(fake.calls)).not.toContain(operationId);
  });

  it('lock handle은 customerKey 하나에 고정되고 다른 record를 write하지 않는다', async () => {
    const fake = createFakeSql();
    const store = createPgBillingKeyStore(fake, TEST_UNSAFE_SENSITIVE_STORE_OPTIONS);
    const otherCustomerRecord = makeBillingKeyRecord({
      customerKey: 'cust_other' as typeof CUSTOMER_KEY,
    });

    await expect(
      store.withMutationLock(CUSTOMER_KEY, async (mutation) => mutation.save(otherCustomerRecord)),
    ).rejects.toThrow('customerKey는 대상 customerKey와 같아야 합니다.');

    expect(normTexts(fake)).toEqual([
      'BEGIN',
      'SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))',
      'ROLLBACK',
    ]);
  });

  it('lock callback이 throw하면 그 callback의 generic write는 rollback된다', async () => {
    const fake = createFakeSql();
    const previous = makeBillingKeyRecord({ billingKey: 'bkey_previous' });
    const issued = makeBillingKeyRecord({ billingKey: 'bkey_issued' });
    fake.respond((text) =>
      norm(text).startsWith('SELECT billing_key')
        ? [{ billing_key: JSON.stringify(previous) }]
        : [],
    );
    const store = createPgBillingKeyStore(fake, TEST_UNSAFE_SENSITIVE_STORE_OPTIONS);
    const projectionFailed = new Error('projection failed');

    await expect(
      store.withMutationLock(CUSTOMER_KEY, async (mutation) => {
        await mutation.replaceAndGetPrevious(issued);
        throw projectionFailed;
      }),
    ).rejects.toBe(projectionFailed);

    expect(normTexts(fake)).toEqual([
      'BEGIN',
      'SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))',
      'SELECT billing_key, operation_fingerprint FROM "toss_payments".billing_keys WHERE customer_key = $1 FOR UPDATE',
      expect.stringContaining('INSERT INTO "toss_payments".billing_keys'),
      'ROLLBACK',
    ]);
  });
});
