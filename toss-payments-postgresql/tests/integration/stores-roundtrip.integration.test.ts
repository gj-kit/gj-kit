/**
 * 스토어 6종 왕복 — 실 PostgreSQL (설계 §8).
 *
 * fake SqlClient 단위 테스트가 증명 못 하는 것만 여기서 증명한다:
 * 실제 컬럼 타입(bigint/text/jsonb)을 거친 저장→조회 왕복이 코어 계약 값과
 * 정확히 일치하는가, 그리고 ON CONFLICT 시맨틱(insert-only vs upsert)이
 * 실 DB에서 의도대로 동작하는가.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { AuditEntry } from '@gj-kit/toss-payments';
import { generateCustomerKey, generateOrderId } from '@gj-kit/toss-payments/server';
import type { BillingKeyRecord, CancelRetryRecord, StoredOrder } from '@gj-kit/toss-payments/server';

import { createTossPaymentsPostgres, isTossPostgresError } from '../../src/index';
import type { TossPaymentsPostgres } from '../../src/index';
import { countRows, createTestContext, dropSchema } from './helpers';
import type { PgTestContext } from './helpers';

let ctx: PgTestContext;
let pg: TossPaymentsPostgres;

beforeAll(async () => {
  ctx = createTestContext();
  pg = createTossPaymentsPostgres({ sql: ctx.sql, schema: ctx.schema });
  await pg.migrate();
});

afterAll(async () => {
  await dropSchema(ctx.pool, ctx.schema);
  await ctx.pool.end();
});

describe('OrderStore', () => {
  const order: StoredOrder = {
    orderId: generateOrderId('it'),
    amount: 15_000,
    currency: 'KRW',
    orderName: '통합 테스트 주문 🧾',
    createdAt: '2026-08-20T10:00:00.000Z',
  };

  it('saveOrder → loadOrder 왕복 (bigint→number, createdAt 원문 보존)', async () => {
    await pg.orders.saveOrder(order);
    const loaded = await pg.orders.loadOrder(order.orderId);
    expect(loaded).toEqual(order);
    // 금액은 정확한 number여야 한다 — pg bigint(string) → Number 변환 경로 검증
    expect(loaded?.amount).toBe(15_000);
  });

  it('없는 orderId → null', async () => {
    expect(await pg.orders.loadOrder(generateOrderId('none'))).toBeNull();
  });

  it('동일값 재저장은 멱등하게 성공한다 (네트워크 재시도 시나리오)', async () => {
    await expect(pg.orders.saveOrder(order)).resolves.toBeUndefined();
    expect(await countRows(ctx.pool, ctx.schema, 'orders', `WHERE order_id = '${order.orderId}'`)).toBe(1);
  });

  it('createdAt만 다른 재저장도 멱등 성공하고 최초 저장본이 유지된다 — 코어 createOrder 재제출(더블클릭) 시나리오', async () => {
    // 코어 createOrder는 호출마다 clock()으로 createdAt을 새로 찍는다 — 비교에 넣으면
    // 소비자 orderId 재제출이 영구 conflict가 되므로 대조 대상은 amount·currency·orderName뿐이다.
    const resubmitted: StoredOrder = { ...order, createdAt: '2026-08-20T10:00:05.000Z' };
    await expect(pg.orders.saveOrder(resubmitted)).resolves.toBeUndefined();
    const loaded = await pg.orders.loadOrder(order.orderId);
    expect(loaded?.createdAt).toBe(order.createdAt); // 최초 저장본 유지 — 덮어쓰지 않는다
  });

  it("상이값 재저장은 'order-conflict'로 거부한다 — 금액 대조 원본 보호", async () => {
    const tampered: StoredOrder = { ...order, amount: order.amount + 1 };
    const failure = await pg.orders.saveOrder(tampered).then(
      () => null,
      (cause: unknown) => cause,
    );
    expect(isTossPostgresError(failure) && failure.code === 'order-conflict').toBe(true);
    // 원본은 그대로다
    const loaded = await pg.orders.loadOrder(order.orderId);
    expect(loaded?.amount).toBe(order.amount);
  });
});

describe('DepositSecretStore', () => {
  it('saveSecret → getSecret 왕복 + upsert(재저장이 최신값으로 교체)', async () => {
    const orderId = generateOrderId('dep');
    await pg.depositSecrets.saveSecret(orderId, 'secret-v1');
    expect(await pg.depositSecrets.getSecret(orderId)).toBe('secret-v1');

    // upsert 시맨틱 계약 — 이중 저장 무해 + 최신값 유지
    await pg.depositSecrets.saveSecret(orderId, 'secret-v2');
    expect(await pg.depositSecrets.getSecret(orderId)).toBe('secret-v2');
  });

  it('없는 orderId → null', async () => {
    expect(await pg.depositSecrets.getSecret(generateOrderId('nodep'))).toBeNull();
  });
});

describe('BillingKeyStore', () => {
  it('card 비null/transfers null 왕복 → 같은 customerKey upsert로 card null/transfers 비null 교체 → delete', async () => {
    const customerKey = generateCustomerKey();
    const cardRecord: BillingKeyRecord = {
      customerKey,
      billingKey: 'it-billing-key-card',
      method: '카드',
      issuedAt: '2026-08-20T10:00:00+09:00',
      card: {
        issuerCode: '61',
        number: '12345678****789*',
        cardType: '신용',
        ownerType: '개인',
      },
      transfers: null,
    };
    await pg.billingKeys.save(cardRecord);
    expect(await pg.billingKeys.find(customerKey)).toEqual(cardRecord);

    // 재발급 시나리오 — 최신 발급본 유지(upsert), jsonb null↔비null 양방향 왕복
    const transferRecord: BillingKeyRecord = {
      customerKey,
      billingKey: 'it-billing-key-transfer',
      method: '계좌이체',
      issuedAt: '2026-08-21T09:30:00+09:00',
      card: null,
      transfers: [{ bankName: '토스뱅크', bankAccountNumber: '100012345678' }],
    };
    await pg.billingKeys.save(transferRecord);
    expect(await pg.billingKeys.find(customerKey)).toEqual(transferRecord);
    expect(await countRows(ctx.pool, ctx.schema, 'billing_keys')).toBe(1);

    await pg.billingKeys.delete(customerKey);
    expect(await pg.billingKeys.find(customerKey)).toBeNull();
  });

  it('jsonb가 거부하는 U+0000·비페어 서로게이트가 섞인 card도 저장에 성공한다(U+FFFD 정화) — 저장 실패 = 복구 불가 방지', async () => {
    const customerKey = generateCustomerKey();
    const record: BillingKeyRecord = {
      customerKey,
      billingKey: 'it-billing-key-nul',
      method: '카드',
      issuedAt: '2026-08-20T10:00:00+09:00',
      card: {
        issuerCode: '61',
        // 실 PostgreSQL jsonb 파서가 정화본을 수용하는지가 이 테스트의 증명 대상이다
        number: 'NUL\u0000중\ud800간',
        cardType: '신용',
        ownerType: '개인',
      },
      transfers: null,
    };
    await pg.billingKeys.save(record);
    const found = await pg.billingKeys.find(customerKey);
    expect(found?.card?.number).toBe('NUL�중�간'); // U+0000·비페어 서로게이트 → U+FFFD 치환본이 왕복된다
    await pg.billingKeys.delete(customerKey);
  });
});

describe('CancelRetryStore', () => {
  it('save → load 왕복: bodyJson 바이트 무손실 (이모지·유니코드 이스케이프·NUL 이스케이프)', async () => {
    // NUL(\u0000)·제어문자는 JSON 텍스트 안에서 이스케이프 시퀀스로 존재한다 —
    // jsonb 컬럼이었다면 \u0000 이스케이프에서 저장이 거부된다. text 컬럼 선택의 결정적 증거.
    const bodyJson = JSON.stringify({
      cancelReason: '고객 변심 🙂😀 — émotion',
      control: '\u0000\u0001\u001f',
      literalBackslashU: '원문 백슬래시 시퀀스: \\u00e9 (é 아님)',
      cancelAmount: 5_000,
    });
    const record: CancelRetryRecord = {
      ticketId: 'it-ticket-1',
      paymentKey: 'it-payment-key',
      idempotencyKey: 'it-idem-key',
      issuedAt: '2026-08-20T10:00:00.000Z',
      path: '/v1/payments/it-payment-key/cancel',
      bodyJson,
      testCode: undefined,
      expectedCancelAmount: 5_000,
      previousBalanceAmount: 15_000,
    };
    await pg.cancelRetries.save(record);
    const loaded = await pg.cancelRetries.load(record.ticketId);
    expect(loaded).toEqual(record);

    // 바이트 계약 — UTF-8 인코딩 결과가 완전히 동일해야 멱등 재생이 성립한다
    expect(loaded?.bodyJson).toBe(bodyJson);
    expect(Buffer.from(loaded?.bodyJson ?? '', 'utf8').equals(Buffer.from(bodyJson, 'utf8'))).toBe(
      true,
    );
    expect(loaded?.testCode).toBeUndefined();

    await pg.cancelRetries.delete(record.ticketId);
    expect(await pg.cancelRetries.load(record.ticketId)).toBeNull();
  });
});

describe('AuditSink', () => {
  const entry: AuditEntry = {
    id: '11111111-2222-4333-8444-555555555555',
    at: '2026-08-20T10:00:00.000Z',
    env: 'test',
    method: 'POST',
    path: '/v1/payments/confirm',
    attempt: 1,
    idempotencyKey: 'it-audit-idem',
    requestBody: { orderId: 'it-audit-order', amount: 1000 },
    durationMs: 42,
    traceId: 'it-trace-1',
    outcome: { kind: 'ok', httpStatus: 200, responseBody: { status: 'DONE' } },
  };

  it('record → flush → 행 존재 + entry jsonb 통짜 왕복', async () => {
    // 코어와 동일하게 반환 Promise를 await하지 않는다 — flush가 정착을 회수한다
    void pg.audit.record(entry);
    await pg.audit.flush();

    const result = await ctx.pool.query(
      `SELECT at, env, method, path, attempt, idempotency_key, trace_id, duration_ms, outcome_kind, entry
       FROM "${ctx.schema}".audit_entries WHERE id = $1`,
      [entry.id],
    );
    expect(result.rows).toHaveLength(1);
    const row = result.rows[0] as Record<string, unknown>;
    expect(row['at']).toBe(entry.at);
    expect(row['env']).toBe('test');
    expect(row['outcome_kind']).toBe('ok');
    expect(row['duration_ms']).toBe(42);
    expect(row['entry']).toEqual(entry);
  });

  it('동일 id 재기록은 멱등 — 기존 행을 덮지 않는다 (ON CONFLICT DO NOTHING)', async () => {
    void pg.audit.record({ ...entry, durationMs: 9_999 });
    await pg.audit.flush();

    const result = await ctx.pool.query(
      `SELECT duration_ms FROM "${ctx.schema}".audit_entries WHERE id = $1`,
      [entry.id],
    );
    expect(result.rows).toHaveLength(1);
    // 첫 기록의 값이 유지된다 — 조용한 덮어쓰기 없음
    expect((result.rows[0] as { duration_ms: number }).duration_ms).toBe(42);
  });
});
