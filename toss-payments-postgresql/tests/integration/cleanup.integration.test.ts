/**
 * cleanup() — TTL 행 정리의 실 DB 검증 (설계 §6·§8).
 *
 * 시간 경과는 기다리지 않고 recorded_at/completed_at을 SQL로 과거로 밀어 재현한다 —
 * 기본 TTL(5일/15일) 경로 그대로를 검증하기 위해서다(테스트용 초단위 TTL로 바꾸면
 * 프로덕션 기본값 경로가 미검증으로 남는다).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createTossPaymentsPostgres, unsafePlaintextSensitiveValueProtector } from '../../src/index';
import type { TossPaymentsPostgres } from '../../src/index';
import { countRows, createTestContext, dropSchema } from './helpers';
import type { PgTestContext } from './helpers';

let ctx: PgTestContext;
let pg: TossPaymentsPostgres;

beforeAll(async () => {
  ctx = createTestContext();
  pg = createTossPaymentsPostgres({
    sql: ctx.sql,
    schema: ctx.schema,
    // cleanup 범위만 검증하는 개발 DB 테스트 — 평문은 반드시 명시 opt-in이어야 한다.
    sensitiveValueProtector: unsafePlaintextSensitiveValueProtector,
  });
  await pg.migrate();
});

afterAll(async () => {
  await dropSchema(ctx.pool, ctx.schema);
  await ctx.pool.end();
});

describe('cleanup', () => {
  it('만료 행만 삭제하고 정확한 건수를 보고한다', async () => {
    // webhook_dedupe: completed 3건(2건은 TTL 초과) + processing 1건
    for (const key of ['dd-old-1', 'dd-old-2', 'dd-fresh']) {
      await pg.webhookDedupe.claim(key);
      await pg.webhookDedupe.complete(key);
    }
    await pg.webhookDedupe.claim('dd-processing');
    await ctx.pool.query(
      `UPDATE "${ctx.schema}".webhook_dedupe SET completed_at = now() - interval '6 days'
       WHERE dedupe_key IN ('dd-old-1', 'dd-old-2')`,
    );

    // cancel_retries: 3건 중 2건을 15일 TTL 밖으로
    const baseRecord = {
      paymentKey: 'pk',
      idempotencyKey: 'ik',
      issuedAt: '2026-08-20T10:00:00.000Z',
      path: '/v1/payments/pk/cancel',
      bodyJson: '{"cancelReason":"x"}',
      testCode: undefined,
      expectedCancelAmount: 1_000,
      previousBalanceAmount: 2_000,
    };
    for (const ticketId of ['cr-old-1', 'cr-old-2', 'cr-fresh']) {
      await pg.cancelRetries.save({ ...baseRecord, ticketId });
    }
    await ctx.pool.query(
      `UPDATE "${ctx.schema}".cancel_retries SET recorded_at = now() - interval '16 days'
       WHERE ticket_id IN ('cr-old-1', 'cr-old-2')`,
    );

    const result = await pg.cleanup();
    expect(result).toEqual({ dedupeDeleted: 2, cancelRetriesDeleted: 2 });

    // 살아남아야 하는 행: completed 최신 1 + processing 1, cancel_retries 최신 1
    expect(await countRows(ctx.pool, ctx.schema, 'webhook_dedupe')).toBe(2);
    expect(await countRows(ctx.pool, ctx.schema, 'webhook_dedupe', `WHERE dedupe_key = 'dd-processing'`)).toBe(1);
    expect(await countRows(ctx.pool, ctx.schema, 'cancel_retries')).toBe(1);
    expect(await pg.cancelRetries.load('cr-fresh')).not.toBeNull();
  });

  it('연속 호출은 0건 보고 — 멱등', async () => {
    expect(await pg.cleanup()).toEqual({ dedupeDeleted: 0, cancelRetriesDeleted: 0 });
  });
});
