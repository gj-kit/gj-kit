/**
 * 웹훅 inbox — 이벤트 원문 보존 + withWebhookInbox 실동작 (설계 §3.7·§8).
 *
 * 증명 대상: ① 재전송이 upsert로 deliveries 증가로 관측된다 ② 래퍼는 record를
 * 핸들러 **앞**에서 실행한다(핸들러 안에서 자기 행이 이미 보인다) ③ record 실패의
 * 기본 동작은 삼킴 + onRecordError 통지이고 failOnRecordError=true면 throw다.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { SecretVerified, WebhookHandlers, WebhookMeta } from '@gj-kit/toss-payments/webhook';

import { createPgWebhookInboxStore, migrate, withWebhookInbox } from '../../src/index';
import { createTestContext, dropSchema, randomSchema } from './helpers';
import type { PgTestContext } from './helpers';

let ctx: PgTestContext;

beforeAll(async () => {
  ctx = createTestContext();
  await migrate(ctx.sql, { schema: ctx.schema });
});

afterAll(async () => {
  await dropSchema(ctx.pool, ctx.schema);
  await ctx.pool.end();
});

/** DEPOSIT_CALLBACK 픽스처 — SecretVerified는 순수 데이터라 실 웹훅 없이 구성 가능. */
function depositWebhook(dedupeKey: string, retriedCount: number): SecretVerified {
  return {
    trust: 'secret',
    event: {
      envelope: 'flat',
      eventType: 'DEPOSIT_CALLBACK',
      createdAt: '2026-08-20T12:00:00+09:00',
      orderId: 'it-inbox-order',
      status: 'DONE',
      transactionKey: `tx-${dedupeKey}-${retriedCount}`,
    },
    meta: {
      transmissionId: `tid-${dedupeKey}-${retriedCount}`,
      transmissionTime: '2026-08-20T12:00:00+09:00',
      retriedCount,
      dedupeKey,
    },
  };
}

describe('inbox.record', () => {
  it('사업 이벤트 1건 = 1행, 재전송은 deliveries 증가 + retried_count/event 갱신', async () => {
    const inbox = createPgWebhookInboxStore(ctx.sql, { schema: ctx.schema });

    await inbox.record(depositWebhook('it-inbox-1', 0));
    await inbox.record(depositWebhook('it-inbox-1', 1));
    await inbox.record(depositWebhook('it-inbox-1', 2));

    const result = await ctx.pool.query(
      `SELECT transmission_id, retried_count, trust, event_type, event, deliveries,
              first_received_at <= last_received_at AS time_order_ok
       FROM "${ctx.schema}".webhook_inbox WHERE dedupe_key = $1`,
      ['it-inbox-1'],
    );
    expect(result.rows).toHaveLength(1);
    const row = result.rows[0] as Record<string, unknown>;
    expect(row['deliveries']).toBe(3);
    expect(row['retried_count']).toBe(2);
    expect(row['trust']).toBe('secret');
    expect(row['event_type']).toBe('DEPOSIT_CALLBACK');
    // event는 최신 전송본으로 교체된다
    expect((row['event'] as { transactionKey: string }).transactionKey).toBe('tx-it-inbox-1-2');
    expect(row['time_order_ok']).toBe(true);
  });
});

describe('withWebhookInbox', () => {
  it('record → inner 순서로 실행된다 — 핸들러 안에서 자기 행이 이미 보인다', async () => {
    const inbox = createPgWebhookInboxStore(ctx.sql, { schema: ctx.schema });
    const seenInsideHandler: number[] = [];
    const received: SecretVerified[] = [];

    const handlers: WebhookHandlers = {
      onDepositCallback: async (w) => {
        received.push(w);
        const inRow = await ctx.pool.query(
          `SELECT deliveries FROM "${ctx.schema}".webhook_inbox WHERE dedupe_key = $1`,
          [w.meta.dedupeKey],
        );
        seenInsideHandler.push((inRow.rows[0] as { deliveries: number } | undefined)?.deliveries ?? 0);
      },
    };
    const wrapped = withWebhookInbox(inbox, handlers);

    const webhook = depositWebhook('it-wrap-1', 0);
    await wrapped.onDepositCallback?.(webhook);

    expect(received).toHaveLength(1);
    expect(received[0]).toBe(webhook); // 래퍼는 받은 webhook을 그대로 통과시킨다
    expect(seenInsideHandler).toEqual([1]); // 핸들러 실행 시점에 record가 이미 커밋됨
  });

  it('record 실패 기본 동작: 삼키고 onRecordError(meta만) 통지, 핸들러는 계속 실행', async () => {
    // 마이그레이션 안 된 스키마 → record의 INSERT가 실제 드라이버 에러로 실패한다
    const brokenInbox = createPgWebhookInboxStore(ctx.sql, { schema: randomSchema() });
    const notified: WebhookMeta[] = [];
    let handlerRan = false;

    const wrapped = withWebhookInbox(
      brokenInbox,
      {
        onDepositCallback: () => {
          handlerRan = true;
        },
      },
      { onRecordError: (_cause, meta) => notified.push(meta) },
    );

    await expect(wrapped.onDepositCallback?.(depositWebhook('it-broken-1', 0))).resolves.toBeUndefined();
    expect(handlerRan).toBe(true);
    expect(notified).toHaveLength(1);
    expect(notified[0]?.dedupeKey).toBe('it-broken-1');
  });

  it('failOnRecordError: true — record 실패가 그대로 throw된다 (어댑터 500 → 재전송)', async () => {
    const brokenInbox = createPgWebhookInboxStore(ctx.sql, { schema: randomSchema() });
    let handlerRan = false;

    const wrapped = withWebhookInbox(
      brokenInbox,
      {
        onDepositCallback: () => {
          handlerRan = true;
        },
      },
      { failOnRecordError: true },
    );

    await expect(wrapped.onDepositCallback?.(depositWebhook('it-broken-2', 0))).rejects.toThrow();
    expect(handlerRan).toBe(false);
  });
});
