/**
 * §3.2 deposit_secrets — 가상계좌 secret 저장소.
 *
 * saveSecret은 upsert 시맨틱 계약(코어 TSDoc)이고, secret 값은 어떤 에러 메시지에도
 * 싣지 않는다 — 이 파일의 보안 검증이 그 불변식을 고정한다.
 */
import { describe, expect, it } from 'vitest';

import { isTossPostgresError } from '../../src/errors';
import { createPgDepositSecretStore } from '../../src/stores/deposit-secrets';
import { createFakeSql, norm } from './helpers/fake-sql';
import { ORDER_ID } from './helpers/fixtures';

const SECRET = 'ps_vbank_secret_do_not_log';

describe('§3.2 saveSecret — upsert 시맨틱', () => {
  it('INSERT ... ON CONFLICT (order_id) DO UPDATE 1문으로 저장한다', async () => {
    const fake = createFakeSql();
    const store = createPgDepositSecretStore(fake);

    await store.saveSecret(ORDER_ID, SECRET);

    expect(fake.calls).toHaveLength(1);
    const text = norm(fake.calls[0]?.text ?? '');
    expect(text).toContain('INSERT INTO "toss_payments".deposit_secrets');
    expect(text).toContain('ON CONFLICT (order_id) DO UPDATE');
    expect(text).toContain('SET secret = excluded.secret'); // 재저장은 최신값으로 교체
    expect(text).toContain('updated_at = now()');
    expect(fake.calls[0]?.params).toEqual([ORDER_ID, SECRET]);
  });

  it('스키마 옵션이 SQL에 반영된다', async () => {
    const fake = createFakeSql();
    const store = createPgDepositSecretStore(fake, { schema: 'custom_schema' });

    await store.saveSecret(ORDER_ID, SECRET);

    expect(fake.calls[0]?.text).toContain('"custom_schema".deposit_secrets');
  });
});

describe('§3.2 getSecret — 조회', () => {
  it('행이 없으면 null을 반환한다', async () => {
    const fake = createFakeSql();
    const store = createPgDepositSecretStore(fake);

    await expect(store.getSecret(ORDER_ID)).resolves.toBeNull();
    expect(norm(fake.calls[0]?.text ?? '')).toContain(
      'SELECT secret FROM "toss_payments".deposit_secrets WHERE order_id = $1',
    );
    expect(fake.calls[0]?.params).toEqual([ORDER_ID]);
  });

  it('저장된 secret을 그대로 반환한다', async () => {
    const fake = createFakeSql();
    fake.enqueueRows([{ secret: SECRET }]);
    const store = createPgDepositSecretStore(fake);

    await expect(store.getSecret(ORDER_ID)).resolves.toBe(SECRET);
  });

  it('secret 컬럼이 문자열이 아니면 invalid-row — 메시지에 컬럼 값 미포함', async () => {
    const fake = createFakeSql();
    fake.enqueueRows([{ secret: 987654321 }]);
    const store = createPgDepositSecretStore(fake);

    let thrown: unknown;
    try {
      await store.getSecret(ORDER_ID);
    } catch (error) {
      thrown = error;
    }

    expect(isTossPostgresError(thrown)).toBe(true);
    if (isTossPostgresError(thrown)) {
      expect(thrown.code).toBe('invalid-row');
      expect(thrown.message).not.toContain('987654321'); // 값 자체는 절대 싣지 않는다
      expect(thrown.message).toContain(ORDER_ID); // 추적 키는 orderId만
    }
  });

  it('드라이버 에러는 그대로 통과하며 메시지에 secret이 섞이지 않는다', async () => {
    const fake = createFakeSql();
    const driverError = new Error('deadlock detected');
    fake.enqueueError(driverError);
    const store = createPgDepositSecretStore(fake);

    await expect(store.saveSecret(ORDER_ID, SECRET)).rejects.toBe(driverError);
    expect(driverError.message).not.toContain(SECRET);
  });
});
