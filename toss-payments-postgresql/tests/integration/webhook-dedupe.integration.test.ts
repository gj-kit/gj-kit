/**
 * WebhookDedupeStore — 원자성·lease·상태 전이의 실 DB 증명 (설계 §3.5·§8).
 *
 * 이 파일의 존재 이유는 동시 claim 시나리오다: 단일 문 CTE의 원자성은 실제
 * PostgreSQL의 동시 커넥션 경합 없이는 증명할 수 없다(fake로는 TOCTOU가 재현
 * 불가). Pool max 10 + Promise.all 10건이 10개의 실 커넥션에서 경합한다.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createPgWebhookDedupeStore } from '../../src/index';
import { createTestContext, dropSchema, sleep } from './helpers';
import type { PgTestContext } from './helpers';
import { migrate } from '../../src/index';

let ctx: PgTestContext;

beforeAll(async () => {
  ctx = createTestContext(10);
  await migrate(ctx.sql, { schema: ctx.schema });
});

afterAll(async () => {
  await dropSchema(ctx.pool, ctx.schema);
  await ctx.pool.end();
});

describe('claim 원자성', () => {
  it("동시 claim 10건 중 정확히 1건만 'claimed' — 나머지는 'processing'", async () => {
    const store = createPgWebhookDedupeStore(ctx.sql, { schema: ctx.schema });
    const outcomes = await Promise.all(
      Array.from({ length: 10 }, () => store.claim('it-concurrent-key')),
    );
    expect(outcomes.filter((o) => o === 'claimed')).toHaveLength(1);
    expect(outcomes.filter((o) => o === 'processing')).toHaveLength(9);
  });
});

describe('상태 전이', () => {
  it("complete 후 재claim은 'completed' — 중복 처리 차단", async () => {
    const store = createPgWebhookDedupeStore(ctx.sql, { schema: ctx.schema });
    expect(await store.claim('it-complete-key')).toBe('claimed');
    await store.complete('it-complete-key');
    expect(await store.claim('it-complete-key')).toBe('completed');
  });

  it("release 후 재claim은 'claimed' — 처리 실패 시 재전송 재점유", async () => {
    const store = createPgWebhookDedupeStore(ctx.sql, { schema: ctx.schema });
    expect(await store.claim('it-release-key')).toBe('claimed');
    await store.release('it-release-key');
    expect(await store.claim('it-release-key')).toBe('claimed');
  });

  it('release는 completed 행을 지우지 않는다', async () => {
    const store = createPgWebhookDedupeStore(ctx.sql, { schema: ctx.schema });
    expect(await store.claim('it-release-completed-key')).toBe('claimed');
    await store.complete('it-release-completed-key');
    await store.release('it-release-completed-key');
    // completed가 release로 지워졌다면 여기서 'claimed'가 나와 중복 처리가 열린다
    expect(await store.claim('it-release-completed-key')).toBe('completed');
  });
});

describe('lease 만료 (crash-recovery)', () => {
  it("leaseSeconds 1 — 만료 전 'processing', 1.2초 후 재claim 'claimed'", async () => {
    const store = createPgWebhookDedupeStore(ctx.sql, { schema: ctx.schema, leaseSeconds: 1 });
    expect(await store.claim('it-lease-key')).toBe('claimed');
    // lease가 살아 있는 동안은 재점유 불가
    expect(await store.claim('it-lease-key')).toBe('processing');
    await sleep(1_200);
    // 만료 후 재점유 — crash한 처리자의 행을 재전송이 이어받는다
    expect(await store.claim('it-lease-key')).toBe('claimed');
  });
});
