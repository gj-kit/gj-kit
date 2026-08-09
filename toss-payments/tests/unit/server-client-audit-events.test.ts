/**
 * §3.2 audit 계측(시도 1건 = 엔트리 1건, 실패 무간섭) + §3.3 'api.call' 이벤트(최종 1회).
 */
import { describe, expect, it, vi } from 'vitest';

import type { AuditEntry } from '../../src/index';
import { createTossEvents, isOk, orThrow, parseApiSecretKey, paymentKey } from '../../src/server';
import { createTossClient, getInternalHttp } from '../../src/server/client';
import type { TossClientOptions, TossHttp } from '../../src/server/client';
import type { TossEvent } from '../../src/server/events';
import { memoryAuditSink } from '../../src/testing';
import { failingFetch, mockFetch, rawPayment } from './helpers';

const KEY = 'test_sk_abcdef';
const secretKey = () => orThrow(parseApiSecretKey(KEY));
const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

function httpOf(options: TossClientOptions): TossHttp {
  const http = getInternalHttp(createTossClient(secretKey(), options));
  if (http === null) throw new Error('내부 http 계층이 없습니다');
  return http;
}

describe('audit — 시도 1건 = AuditEntry 1건', () => {
  it('GET 성공 — env/method/path/attempt/traceId/outcome.ok + responseBody redaction 통과본', async () => {
    const sink = memoryAuditSink();
    const { fetch } = mockFetch(() => ({
      status: 200,
      body: rawPayment({ secret: 'va-secret-raw' }),
      headers: { 'x-tosspayments-trace-id': 'trace-xyz' },
    }));
    const client = createTossClient(secretKey(), { fetch, audit: { sink } });
    const r = await client.getPayment(orThrow(paymentKey('pk-1')));

    expect(isOk(r)).toBe(true);
    expect(sink.entries).toHaveLength(1);
    const entry = sink.entries[0];
    expect(entry).toMatchObject({
      env: 'test',
      method: 'GET',
      path: '/v1/payments/pk-1',
      attempt: 1,
      idempotencyKey: null,
      requestBody: null,
      traceId: 'trace-xyz',
    });
    expect(entry?.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(Number.isNaN(Date.parse(entry?.at ?? ''))).toBe(false);
    expect(entry?.durationMs).toBeGreaterThanOrEqual(0);
    if (entry?.outcome.kind !== 'ok') throw new Error('ok outcome이어야 합니다');
    expect(entry.outcome.httpStatus).toBe(200);
    const body = entry.outcome.responseBody as Record<string, unknown>;
    expect(body['secret']).toBe('[REDACTED]');
    expect((body['card'] as Record<string, unknown>)['number']).toBe('[REDACTED]');

    // Authorization은 구조적 부재 — 직렬화 전문에 시크릿 키·인증 헤더가 없다
    const serialized = JSON.stringify(sink.entries);
    expect(serialized).not.toContain(KEY);
    expect(serialized.toLowerCase()).not.toContain('authorization');
    expect(serialized).not.toContain('va-secret-raw');
  });

  it('retry 결합 — 시도마다 엔트리 1건(attempt 1..N), requestBody는 redaction 통과본', async () => {
    const sink = memoryAuditSink();
    const { fetch } = failingFetch(new Error('conn reset'));
    const http = httpOf({ fetch, audit: { sink }, retry: { maxAttempts: 3, delaysMs: [0, 0] } });
    await http.request({
      method: 'POST',
      path: '/v1/billing/authorizations/card',
      bodyJson: JSON.stringify({ cardNumber: '4330123456789012', customerKey: 'cust-1' }),
      idempotencyKey: 'idem-1',
    });

    expect(sink.entries).toHaveLength(3);
    expect(sink.entries.map((e) => e.attempt)).toEqual([1, 2, 3]);
    for (const entry of sink.entries) {
      expect(entry.idempotencyKey).toBe('idem-1');
      expect(entry.outcome).toEqual({ kind: 'transport', code: 'NETWORK_ERROR' });
      const body = entry.requestBody as Record<string, unknown>;
      expect(body['cardNumber']).toBe('[REDACTED]');
      expect(body['customerKey']).toBe('cust-1');
    }
    expect(JSON.stringify(sink.entries)).not.toContain('4330123456789012');
  });

  it('toss-error outcome — httpStatus/code/message 보존 (responseBody 필드 없음)', async () => {
    const sink = memoryAuditSink();
    const { fetch } = mockFetch(() => ({
      status: 404,
      body: { code: 'NOT_FOUND_PAYMENT', message: '존재하지 않는 결제 입니다.' },
      headers: { 'x-tosspayments-trace-id': 'trace-err' },
    }));
    const client = createTossClient(secretKey(), { fetch, audit: { sink } });
    await client.getPayment(orThrow(paymentKey('pk-x')));

    expect(sink.entries[0]?.outcome).toEqual({
      kind: 'toss-error',
      httpStatus: 404,
      code: 'NOT_FOUND_PAYMENT',
      message: '존재하지 않는 결제 입니다.',
    });
    expect(sink.entries[0]?.traceId).toBe('trace-err');
  });
});

describe('audit — 실패 무간섭 (협상 불가: 기록 실패 < 결제 실패)', () => {
  it('sink sync throw여도 Result 불변, onSinkError로만 통지', async () => {
    const onSinkError = vi.fn();
    const boom = new Error('sink-sync-boom');
    const { fetch } = mockFetch(() => ({ status: 200, body: rawPayment() }));
    const client = createTossClient(secretKey(), {
      fetch,
      audit: {
        sink: {
          record: () => {
            throw boom;
          },
        },
        onSinkError,
      },
    });
    const r = await client.getPayment(orThrow(paymentKey('pk-1')));

    expect(isOk(r)).toBe(true); // 결제 경로 무간섭
    expect(onSinkError).toHaveBeenCalledTimes(1);
    expect(onSinkError.mock.calls[0]?.[0]).toBe(boom);
    expect((onSinkError.mock.calls[0]?.[1] as AuditEntry).path).toBe('/v1/payments/pk-1');
  });

  it('sink async rejection도 삼켜지고 onSinkError로만 통지', async () => {
    const onSinkError = vi.fn();
    const { fetch } = mockFetch(() => ({ status: 200, body: rawPayment() }));
    const client = createTossClient(secretKey(), {
      fetch,
      audit: {
        sink: { record: () => Promise.reject(new Error('sink-async-boom')) },
        onSinkError,
      },
    });
    const r = await client.getPayment(orThrow(paymentKey('pk-1')));
    await tick(); // fire-and-forget rejection 정착 대기

    expect(isOk(r)).toBe(true);
    expect(onSinkError).toHaveBeenCalledTimes(1);
    expect((onSinkError.mock.calls[0]?.[0] as Error).message).toBe('sink-async-boom');
  });

  it('onSinkError 자신의 throw도 삼켜진다 (기본값: 통지 콜백 미지정도 무시)', async () => {
    const { fetch } = mockFetch(() => ({ status: 200, body: rawPayment() }));
    const withThrowingObserver = createTossClient(secretKey(), {
      fetch,
      audit: {
        sink: {
          record: () => {
            throw new Error('sink-boom');
          },
        },
        onSinkError: () => {
          throw new Error('observer-boom');
        },
      },
    });
    const r1 = await withThrowingObserver.getPayment(orThrow(paymentKey('pk-1')));
    expect(isOk(r1)).toBe(true);

    const withoutObserver = createTossClient(secretKey(), {
      fetch,
      audit: {
        sink: {
          record: () => {
            throw new Error('sink-boom');
          },
        },
      },
    });
    const r2 = await withoutObserver.getPayment(orThrow(paymentKey('pk-1')));
    expect(isOk(r2)).toBe(true);
  });
});

describe("events — 'api.call' 논리 요청당 최종 1회", () => {
  it('성공 — outcome ok/httpStatus/traceId/attempts=1', async () => {
    const events = createTossEvents();
    const seen: Array<TossEvent<'api.call'>> = [];
    events.on('api.call', (e) => {
      seen.push(e);
    });
    const { fetch } = mockFetch(() => ({
      status: 200,
      body: rawPayment(),
      headers: { 'x-tosspayments-trace-id': 'trace-ev' },
    }));
    const client = createTossClient(secretKey(), { fetch, events });
    await client.getPayment(orThrow(paymentKey('pk-1')));

    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({
      type: 'api.call',
      method: 'GET',
      path: '/v1/payments/pk-1',
      outcome: 'ok',
      httpStatus: 200,
      traceId: 'trace-ev',
      attempts: 1,
    });
  });

  it('retry 결합 — 시도 3회여도 이벤트는 최종 1회(attempts 집계), transport는 httpStatus null', async () => {
    const events = createTossEvents();
    const handler = vi.fn();
    events.on('api.call', handler);
    const { fetch, calls } = failingFetch(new Error('boom'));
    const client = createTossClient(secretKey(), {
      fetch,
      events,
      retry: { maxAttempts: 3, delaysMs: [0, 0] },
    });
    await client.getPayment(orThrow(paymentKey('pk-1')));

    expect(calls).toHaveLength(3);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0]?.[0]).toMatchObject({
      outcome: 'transport',
      httpStatus: null,
      traceId: null,
      attempts: 3,
    });
  });

  it('핸들러 throw여도 플로우 Result 불변 (핸들러 격리)', async () => {
    const onHandlerError = vi.fn();
    const events = createTossEvents({ onHandlerError });
    events.on('api.call', () => {
      throw new Error('handler-boom');
    });
    const { fetch } = mockFetch(() => ({ status: 200, body: rawPayment() }));
    const client = createTossClient(secretKey(), { fetch, events });
    const r = await client.getPayment(orThrow(paymentKey('pk-1')));

    expect(isOk(r)).toBe(true);
    expect(onHandlerError).toHaveBeenCalledTimes(1);
    expect(onHandlerError.mock.calls[0]?.[0]).toMatchObject({ type: 'api.call' });
  });

  it('구조적 모조 TossEvents 주입 — 발행이 조용히 no-op(요청은 정상)', async () => {
    const fake = { on: () => () => undefined };
    const { fetch } = mockFetch(() => ({ status: 200, body: rawPayment() }));
    const client = createTossClient(secretKey(), { fetch, events: fake });
    const r = await client.getPayment(orThrow(paymentKey('pk-1')));
    expect(isOk(r)).toBe(true);
  });

  it('버스 미주입 — 발행 지점 no-op(현행 동작 동일)', async () => {
    const { fetch } = mockFetch(() => ({ status: 200, body: rawPayment() }));
    const client = createTossClient(secretKey(), { fetch });
    const r = await client.getPayment(orThrow(paymentKey('pk-1')));
    expect(isOk(r)).toBe(true);
  });
});
