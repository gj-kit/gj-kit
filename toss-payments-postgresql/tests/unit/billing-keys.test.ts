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
import { CUSTOMER_KEY, makeBillingKeyRecord } from './helpers/fixtures';

describe('§3.3 save — upsert(customer_key)', () => {
  it('INSERT ... ON CONFLICT (customer_key) DO UPDATE로 최신 발급본을 유지한다', async () => {
    const fake = createFakeSql();
    const store = createPgBillingKeyStore(fake);
    const record = makeBillingKeyRecord();

    await store.save(record);

    expect(fake.calls).toHaveLength(1);
    const text = norm(fake.calls[0]?.text ?? '');
    expect(text).toContain('INSERT INTO "toss_payments".billing_keys');
    expect(text).toContain('ON CONFLICT (customer_key) DO UPDATE');
    expect(text).toContain('billing_key = excluded.billing_key');
    // jsonb 파라미터는 드라이버 중립을 위해 스토어가 직접 직렬화한다
    expect(fake.calls[0]?.params).toEqual([
      record.customerKey,
      record.billingKey,
      record.method,
      record.issuedAt,
      JSON.stringify(record.card),
      null, // transfers null → SQL NULL (JSON 문자열 'null'이 아니다)
    ]);
  });

  it('card null / transfers 존재 조합도 각각 NULL·직렬화로 보낸다', async () => {
    const fake = createFakeSql();
    const store = createPgBillingKeyStore(fake);
    const transfers = [{ bankName: '토스뱅크', bankAccountNumber: '100012345678' }];
    const record = makeBillingKeyRecord({ method: '계좌이체', card: null, transfers });

    await store.save(record);

    expect(fake.calls[0]?.params?.[4]).toBeNull();
    expect(fake.calls[0]?.params?.[5]).toBe(JSON.stringify(transfers));
  });
});

describe('§3.3 find — 복원과 null', () => {
  it('행이 없으면 null을 반환한다', async () => {
    const fake = createFakeSql();
    const store = createPgBillingKeyStore(fake);

    await expect(store.find(CUSTOMER_KEY)).resolves.toBeNull();
    expect(fake.calls[0]?.params).toEqual([CUSTOMER_KEY]);
  });

  it('pg 스타일(jsonb → 객체) 행을 BillingKeyRecord로 복원한다 — card/transfers 왕복', async () => {
    const fake = createFakeSql();
    const record = makeBillingKeyRecord();
    fake.enqueueRows([
      {
        billing_key: record.billingKey,
        method: record.method,
        issued_at: record.issuedAt,
        card: record.card, // pg는 jsonb를 파싱된 객체로 내려준다
        transfers: null,
      },
    ]);
    const store = createPgBillingKeyStore(fake);

    await expect(store.find(CUSTOMER_KEY)).resolves.toEqual(record);
  });

  it('커스텀 SqlClient 스타일(jsonb → JSON 문자열)도 동일하게 복원한다', async () => {
    const fake = createFakeSql();
    const record = makeBillingKeyRecord();
    fake.enqueueRows([
      {
        billing_key: record.billingKey,
        method: record.method,
        issued_at: record.issuedAt,
        card: JSON.stringify(record.card),
        transfers: null,
      },
    ]);
    const store = createPgBillingKeyStore(fake);

    await expect(store.find(CUSTOMER_KEY)).resolves.toEqual(record);
  });

  it('card/transfers 컬럼 undefined도 null로 정규화한다(커스텀 드라이버 수용)', async () => {
    const fake = createFakeSql();
    const record = makeBillingKeyRecord({ card: null, transfers: null });
    fake.enqueueRows([
      { billing_key: record.billingKey, method: record.method, issued_at: record.issuedAt },
    ]);
    const store = createPgBillingKeyStore(fake);

    const found = await store.find(CUSTOMER_KEY);
    expect(found?.card).toBeNull();
    expect(found?.transfers).toBeNull();
  });

  it('계약 위반 행은 invalid-row — 메시지에 billingKey·customerKey 어느 쪽도 없다', async () => {
    const fake = createFakeSql();
    fake.enqueueRows([
      {
        billing_key: 'bkey_leak_canary',
        method: 'CARD', // 응답 원문은 한글 리터럴이어야 한다 — 유니언 위반
        issued_at: '2026-08-20T12:00:00+09:00',
        card: null,
        transfers: null,
      },
    ]);
    const store = createPgBillingKeyStore(fake);

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

  it('jsonb 문자열이 손상되면 invalid-row(cause 보존) — 값은 메시지에 없다', async () => {
    const fake = createFakeSql();
    fake.enqueueRows([
      {
        billing_key: 'bkey_leak_canary',
        method: '카드',
        issued_at: '2026-08-20T12:00:00+09:00',
        card: '{broken json',
        transfers: null,
      },
    ]);
    const store = createPgBillingKeyStore(fake);

    let thrown: unknown;
    try {
      await store.find(CUSTOMER_KEY);
    } catch (error) {
      thrown = error;
    }

    expect(isTossPostgresError(thrown)).toBe(true);
    if (isTossPostgresError(thrown)) {
      expect(thrown.code).toBe('invalid-row');
      expect(thrown.cause).toBeInstanceOf(SyntaxError);
      expect(thrown.message).not.toContain('bkey_leak_canary');
    }
  });
});

describe('§3.3 delete', () => {
  it('customer_key 기준 DELETE를 실행한다', async () => {
    const fake = createFakeSql();
    const store = createPgBillingKeyStore(fake);

    await store.delete(CUSTOMER_KEY);

    expect(norm(fake.calls[0]?.text ?? '')).toBe(
      'DELETE FROM "toss_payments".billing_keys WHERE customer_key = $1',
    );
    expect(fake.calls[0]?.params).toEqual([CUSTOMER_KEY]);
  });
});
