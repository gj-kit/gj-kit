/**
 * §3.4 retry — 하드 가드 4조건(설정으로 확장 불가), jitter, abort, 마지막 실패 원형 반환.
 *
 * fetch 호출 수(calls.length)로 재시도 발동/불발을 검증한다 — 키 없는 POST 절대 불발이 핵심.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { isErr, isOk, orThrow, parseApiSecretKey, paymentKey } from '../../src/server';
import { createTossClient, getInternalHttp } from '../../src/server/client';
import type { TossClientOptions, TossHttp } from '../../src/server/client';
import { failingFetch, mockFetch, rawPayment } from './helpers';

const KEY = 'test_sk_abcdef';
const secretKey = () => orThrow(parseApiSecretKey(KEY));

/** 내부 http 계층 획득 — 키 유무별 POST/DELETE 가드 검증은 내부 관문에서 직접 한다. */
function httpOf(options: TossClientOptions): TossHttp {
  const client = createTossClient(secretKey(), options);
  const http = getInternalHttp(client);
  if (http === null) throw new Error('내부 http 계층이 없습니다');
  return http;
}

/** 재시도 대기 0ms — 테스트 시간 단축(지연 값 자체는 jitter 테스트에서 별도 검증). */
const fastRetry = { maxAttempts: 3, delaysMs: [0, 0] } as const;

afterEach(() => {
  vi.restoreAllMocks();
});

describe('하드 가드 1 — GET은 TransportFailure만 재시도(자체 멱등)', () => {
  it('GET transport 실패 → maxAttempts까지 재시도 후 마지막 실패 원형 반환', async () => {
    const { fetch, calls } = failingFetch(new Error('conn reset'));
    const client = createTossClient(secretKey(), { fetch, retry: fastRetry });
    const r = await client.getPayment(orThrow(paymentKey('pk-1')));

    expect(calls).toHaveLength(3);
    expect(isErr(r)).toBe(true);
    if (isErr(r)) {
      expect(r.error.source).toBe('network');
      if (r.error.source === 'network') expect((r.error.cause as Error).message).toBe('conn reset');
    }
  });

  it('GET 토스 에러 응답(404) → 재시도 없음', async () => {
    const { fetch, calls } = mockFetch(() => ({
      status: 404,
      body: { code: 'NOT_FOUND_PAYMENT', message: '없음' },
    }));
    const client = createTossClient(secretKey(), { fetch, retry: fastRetry });
    await client.getPayment(orThrow(paymentKey('pk-1')));
    expect(calls).toHaveLength(1);
  });

  it('중간에 성공하면 그 시점에 종료한다', async () => {
    const { fetch, calls } = mockFetch((_call, index) => {
      if (index === 0) throw new Error('first fails');
      return { status: 200, body: rawPayment() };
    });
    const client = createTossClient(secretKey(), { fetch, retry: fastRetry });
    const r = await client.getPayment(orThrow(paymentKey('pk-1')));
    expect(calls).toHaveLength(2);
    expect(isOk(r)).toBe(true);
  });
});

describe('하드 가드 2 — Idempotency-Key 부착 POST/DELETE', () => {
  it('(a) 키 부착 POST transport 실패 → 재시도', async () => {
    const { fetch, calls } = failingFetch(new Error('boom'));
    const http = httpOf({ fetch, retry: fastRetry });
    const r = await http.request({
      method: 'POST',
      path: '/v1/payments/pk-1/cancel',
      bodyJson: '{"cancelReason":"x"}',
      idempotencyKey: 'idem-1',
    });
    expect(calls).toHaveLength(3);
    expect(r.ok).toBe(false);
    // 동일 키 재전송 검증 — 멱등 재생의 전제(키+주소+메서드)
    expect(calls.every((c) => c.headers['idempotency-key'] === 'idem-1')).toBe(true);
    expect(calls.every((c) => c.body === '{"cancelReason":"x"}')).toBe(true);
  });

  it('(b) 409 IDEMPOTENT_REQUEST_PROCESSING → 재시도, 원 요청의 4xx 재생을 받으면 그대로 종료', async () => {
    const { fetch, calls } = mockFetch((_call, index) =>
      index === 0
        ? { status: 409, body: { code: 'IDEMPOTENT_REQUEST_PROCESSING', message: '처리 중' } }
        : { status: 400, body: { code: 'INVALID_REQUEST', message: '잘못된 요청' } },
    );
    const http = httpOf({ fetch, retry: fastRetry });
    const r = await http.request({
      method: 'POST',
      path: '/v1/payments/pk-1/cancel',
      bodyJson: '{}',
      idempotencyKey: 'idem-2',
    });
    expect(calls).toHaveLength(2); // 409 후 1회 재요청, 4xx 재생은 재시도 대상 아님
    expect(r.ok).toBe(false);
    if (!r.ok && r.error.source === 'toss') expect(r.error.code).toBe('INVALID_REQUEST');
  });

  it('(b) 409 후 성공 응답 확인 — "다시 요청해서 응답을 확인" 경로', async () => {
    const { fetch, calls } = mockFetch((_call, index) =>
      index === 0
        ? { status: 409, body: { code: 'IDEMPOTENT_REQUEST_PROCESSING', message: '처리 중' } }
        : { status: 200, body: rawPayment() },
    );
    const http = httpOf({ fetch, retry: fastRetry });
    const r = await http.request({
      method: 'POST',
      path: '/v1/payments/confirm',
      bodyJson: '{}',
      idempotencyKey: 'idem-3',
    });
    expect(calls).toHaveLength(2);
    expect(r.ok).toBe(true);
  });

  it('키 부착 DELETE transport 실패 → 재시도', async () => {
    const { fetch, calls } = failingFetch(new Error('boom'));
    const http = httpOf({ fetch, retry: { maxAttempts: 2, delaysMs: [0] } });
    await http.request({ method: 'DELETE', path: '/v1/billing/bkey', idempotencyKey: 'idem-4' });
    expect(calls).toHaveLength(2);
  });
});

describe('하드 가드 3 — 키 없는 POST/DELETE는 어떤 실패든 절대 재시도 없음(이중 승인 방지)', () => {
  it('키 없는 POST transport 실패 → fetch 정확히 1회', async () => {
    const { fetch, calls } = failingFetch(new Error('boom'));
    const http = httpOf({ fetch, retry: fastRetry });
    const r = await http.request({ method: 'POST', path: '/v1/payments/confirm', bodyJson: '{}' });
    expect(calls).toHaveLength(1);
    expect(r.ok).toBe(false);
  });

  it('키 없는 POST + retryable:true 토스 에러(PROVIDER_ERROR)여도 무시 → 1회', async () => {
    const { fetch, calls } = mockFetch(() => ({
      status: 400,
      body: { code: 'PROVIDER_ERROR', message: '일시 오류' },
    }));
    const http = httpOf({ fetch, retry: fastRetry });
    const r = await http.request({ method: 'POST', path: '/v1/payments/confirm', bodyJson: '{}' });
    expect(calls).toHaveLength(1);
    expect(r.ok).toBe(false);
    if (!r.ok && r.error.source === 'toss') expect(r.error.retryable).toBe(true); // 각인은 보존
  });

  it('키 없는 DELETE transport 실패 → 1회 (허용 집합 밖은 전부 보수 배제)', async () => {
    const { fetch, calls } = failingFetch(new Error('boom'));
    const http = httpOf({ fetch, retry: fastRetry });
    await http.request({ method: 'DELETE', path: '/v1/billing/bkey' });
    expect(calls).toHaveLength(1);
  });
});

describe('하드 가드 4 — 토스 4xx/5xx 에러 응답은 재시도 안 함(4xx 멱등 재생 실측)', () => {
  it('키 부착 POST + 4xx(REJECT 계열) → 1회', async () => {
    const { fetch, calls } = mockFetch(() => ({
      status: 400,
      body: { code: 'REJECT_CARD_PAYMENT', message: '한도 초과' },
    }));
    const http = httpOf({ fetch, retry: fastRetry });
    await http.request({ method: 'POST', path: '/v1/payments/confirm', bodyJson: '{}', idempotencyKey: 'k' });
    expect(calls).toHaveLength(1);
  });

  it('키 부착 POST + 5xx retryable(FAILED_INTERNAL_SYSTEM_PROCESSING) → 1회 (5xx 재생 미실측 보수 배제)', async () => {
    const { fetch, calls } = mockFetch(() => ({
      status: 500,
      body: { code: 'FAILED_INTERNAL_SYSTEM_PROCESSING', message: '내부 오류' },
    }));
    const http = httpOf({ fetch, retry: fastRetry });
    await http.request({ method: 'POST', path: '/v1/payments/confirm', bodyJson: '{}', idempotencyKey: 'k' });
    expect(calls).toHaveLength(1);
  });
});

describe('retry 기본 꺼짐 + onRetry/jitter/abort', () => {
  it('retry 미설정 = 1회 시도(현행 동작 동일)', async () => {
    const { fetch, calls } = failingFetch(new Error('boom'));
    const client = createTossClient(secretKey(), { fetch });
    await client.getPayment(orThrow(paymentKey('pk-1')));
    expect(calls).toHaveLength(1);
  });

  it('onRetry — attempt/reason/nextDelayMs/path 통지, jitter ±25% 범위', async () => {
    // Math.random 고정으로 jitter 결정화: 0 → ×0.75(하한), 그다음 0.999… → ×1.25(상한) 근사
    const randomSpy = vi.spyOn(Math, 'random');
    randomSpy.mockReturnValueOnce(0).mockReturnValue(0.9999999);

    const infos: Array<{ attempt: number; reason: string; nextDelayMs: number; path: string }> = [];
    const { fetch } = failingFetch(new Error('boom'));
    const client = createTossClient(secretKey(), {
      fetch,
      retry: {
        maxAttempts: 3,
        delaysMs: [8], // 부족하면 마지막 값 재사용 — 두 대기 모두 base 8ms
        onRetry: (info) => {
          infos.push(info);
        },
      },
    });
    await client.getPayment(orThrow(paymentKey('pk-1')));

    expect(infos).toHaveLength(2);
    expect(infos[0]).toMatchObject({ attempt: 1, reason: 'transport', nextDelayMs: 6 }); // 8 × 0.75
    expect(infos[1]?.attempt).toBe(2);
    expect(infos[1]?.nextDelayMs).toBe(10); // 8 × 1.25 반올림
    expect(infos[0]?.path).toBe('/v1/payments/pk-1');
    // 범위 불변식: base의 75%~125%
    for (const info of infos) {
      expect(info.nextDelayMs).toBeGreaterThanOrEqual(6);
      expect(info.nextDelayMs).toBeLessThanOrEqual(10);
    }
  });

  it('onRetry의 throw는 삼켜지고 재시도는 계속된다(요청 무간섭)', async () => {
    const { fetch, calls } = failingFetch(new Error('boom'));
    const client = createTossClient(secretKey(), {
      fetch,
      retry: {
        maxAttempts: 2,
        delaysMs: [0],
        onRetry: () => {
          throw new Error('observer-boom');
        },
      },
    });
    const r = await client.getPayment(orThrow(paymentKey('pk-1')));
    expect(calls).toHaveLength(2);
    expect(isErr(r)).toBe(true);
  });

  it('호출자 AbortSignal — 대기 중 abort 시 즉시 중단, 마지막 실패 원형 반환', async () => {
    const { fetch, calls } = failingFetch(new Error('boom'));
    const http = httpOf({ fetch, retry: { maxAttempts: 3, delaysMs: [5_000] } });
    const controller = new AbortController();

    const startedAt = Date.now();
    const pending = http.request({ method: 'GET', path: '/v1/payments/pk-1', signal: controller.signal });
    setTimeout(() => controller.abort(new Error('caller aborted')), 20);
    const r = await pending;

    expect(Date.now() - startedAt).toBeLessThan(1_500); // 5초 대기를 기다리지 않았다
    expect(calls).toHaveLength(1); // abort 후 새 시도 없음
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.source).toBe('network');
  });
});
