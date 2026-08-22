/**
 * migrate() 실 PostgreSQL 검증 (설계 §4·§8).
 *
 * 핵심 계약: 명시 호출 전용 마이그레이션이 ① 실제로 테이블 7종 + version column + 버전 테이블을
 * 만들고 ② 재실행 시 전부 skipped로 멱등하며 ③ 동시 실행이 advisory lock으로
 * 직렬화돼 어느 쪽도 실패하지 않는다는 것. fake로는 ③이 증명 불가라 실 DB가 필요하다.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { migrate } from '../../src/index';
import { createTestContext, dropSchema } from './helpers';
import type { PgTestContext } from './helpers';

const EXPECTED_TABLES = [
  'orders',
  'deposit_secrets',
  'billing_keys',
  'cancel_retries',
  'webhook_dedupe',
  'audit_entries',
  'webhook_inbox',
  'toss_pg_migrations',
] as const;

let ctx: PgTestContext;

beforeAll(() => {
  ctx = createTestContext();
});

afterAll(async () => {
  await dropSchema(ctx.pool, ctx.schema);
  await ctx.pool.end();
});

describe('migrate', () => {
  it('첫 실행: 0001_init/0002를 적용하고 테이블 7종 + lifecycle fingerprint + 버전 테이블을 만든다', async () => {
    const result = await migrate(ctx.sql, { schema: ctx.schema });
    expect(result.applied).toEqual(['0001_init', '0002_billing_key_operation_fingerprint']);
    expect(result.skipped).toEqual([]);

    const tables = await ctx.pool.query(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = $1 ORDER BY table_name`,
      [ctx.schema],
    );
    const names = tables.rows.map((row: { table_name: string }) => row.table_name);
    expect(names).toEqual([...EXPECTED_TABLES].sort());
    const columns = await ctx.pool.query(
      `SELECT column_name FROM information_schema.columns WHERE table_schema = $1 AND table_name = 'billing_keys'`,
      [ctx.schema],
    );
    expect(columns.rows.map((row: { column_name: string }) => row.column_name)).toContain(
      'operation_fingerprint',
    );
  });

  it('2회째 실행: 전부 skipped — 멱등 재실행', async () => {
    const result = await migrate(ctx.sql, { schema: ctx.schema });
    expect(result.applied).toEqual([]);
    expect(result.skipped).toEqual(['0001_init', '0002_billing_key_operation_fingerprint']);
  });

  it('동시 실행: advisory lock 직렬화로 양쪽 모두 성공하고 합산 applied는 정확히 1회다', async () => {
    // 새 스키마에서 두 migrate를 동시에 — 한쪽이 적용하고 다른 쪽은 skipped여야 한다.
    // (advisory lock이 없다면 CREATE TABLE 경합으로 한쪽이 duplicate 에러를 낸다.)
    const schema = `${ctx.schema}_race`;
    try {
      const [a, b] = await Promise.all([
        migrate(ctx.sql, { schema }),
        migrate(ctx.sql, { schema }),
      ]);
      const appliedCount = a.applied.length + b.applied.length;
      const skippedCount = a.skipped.length + b.skipped.length;
      expect(appliedCount).toBe(2);
      expect(skippedCount).toBe(2);
    } finally {
      await dropSchema(ctx.pool, schema);
    }
  });
});
