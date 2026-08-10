import { describe, expect, it } from 'vitest';

import { isErr, isOk, orThrow, paymentKey, orderId } from '../../src/server';
import { createTossClient, parseApiSecretKey } from '../../src/server';
import { failingFetch, mockFetch, rawPayment } from './helpers';

const KEY = 'test_sk_abcdef';
const secretKey = () => orThrow(parseApiSecretKey(KEY));

describe('createTossClient — 인증/요청 형식', () => {
  it('Basic 인증 헤더 — base64(secretKey + ":") 콜론 필수', async () => {
    const { fetch, calls } = mockFetch(() => ({ status: 200, body: rawPayment() }));
    const client = createTossClient(secretKey(), { fetch });
    await client.getPayment(orThrow(paymentKey('pk-1')));

    expect(calls[0]?.headers['authorization']).toBe(`Basic ${btoa(`${KEY}:`)}`);
    // 디코딩하면 키 뒤에 콜론이 붙어 있어야 한다
    const decoded = atob(calls[0]?.headers['authorization']?.slice('Basic '.length) ?? '');
    expect(decoded).toBe(`${KEY}:`);
  });

  it('키 종류/환경 각인 — sk는 api, gsk는 widget', () => {
    const { fetch } = mockFetch(() => ({ status: 200, body: rawPayment() }));
    expect(createTossClient(secretKey(), { fetch }).keyKind).toBe('api');
    expect(createTossClient(secretKey(), { fetch }).env).toBe('test');
  });

  it('live 키는 공식 HTTPS origin 외 baseUrl을 기본 거부한다', () => {
    const liveKey = orThrow(parseApiSecretKey('live_sk_abcdef'));
    expect(() => createTossClient(liveKey, { baseUrl: 'https://proxy.example.com' })).toThrow(
      'live 키의 baseUrl',
    );
    expect(() => createTossClient(liveKey, { baseUrl: 'http://api.tosspayments.com' })).toThrow(
      'live 키의 baseUrl',
    );
    expect(() =>
      createTossClient(liveKey, {
        baseUrl: 'https://proxy.example.com',
        dangerouslyAllowCustomLiveBaseUrl: true,
      }),
    ).not.toThrow();
  });

  it('경로의 paymentKey/orderId는 encodeURIComponent 처리된다', async () => {
    const { fetch, calls } = mockFetch(() => ({ status: 200, body: rawPayment() }));
    const client = createTossClient(secretKey(), { fetch });
    await client.getPayment(orThrow(paymentKey('pk/with space')));
    expect(calls[0]?.url).toBe('https://api.tosspayments.com/v1/payments/pk%2Fwith%20space');

    await client.getPaymentByOrderId(orThrow(orderId('order-123456')));
    expect(calls[1]?.url).toBe('https://api.tosspayments.com/v1/payments/orders/order-123456');
  });

  it('조회 성공 — Payment.raw에 응답 원문을 보존한다', async () => {
    const raw = rawPayment({ status: 'DONE' });
    const { fetch } = mockFetch(() => ({ status: 200, body: raw }));
    const client = createTossClient(secretKey(), { fetch });
    const r = await client.getPayment(orThrow(paymentKey('pk-1')));
    expect(isOk(r)).toBe(true);
    if (isOk(r)) {
      expect(r.value.status).toBe('DONE');
      expect(r.value.raw).toEqual(raw);
    }
  });
});

describe('createTossClient — 에러 매핑 (코드 테이블 판정, HTTP status 아님)', () => {
  it('404 NOT_FOUND_PAYMENT → category NOT_FOUND, retryable false, traceId 보존', async () => {
    const { fetch } = mockFetch(() => ({
      status: 404,
      body: { code: 'NOT_FOUND_PAYMENT', message: '존재하지 않는 결제 입니다.' },
      headers: { 'x-tosspayments-trace-id': 'trace-abc' },
    }));
    const client = createTossClient(secretKey(), { fetch });
    const r = await client.getPayment(orThrow(paymentKey('pk-x')));
    expect(isErr(r)).toBe(true);
    if (isErr(r) && r.error.source === 'toss') {
      expect(r.error.code).toBe('NOT_FOUND_PAYMENT');
      expect(r.error.category).toBe('NOT_FOUND');
      expect(r.error.retryable).toBe(false);
      expect(r.error.httpStatus).toBe(404);
      expect(r.error.traceId).toBe('trace-abc');
      expect(r.error.message).toBe('존재하지 않는 결제 입니다.');
    } else {
      expect.unreachable('toss 실패여야 한다');
    }
  });

  it('PROVIDER_ERROR(400) → retryable true — HTTP status 판정 금지의 근거', async () => {
    const { fetch } = mockFetch(() => ({
      status: 400,
      body: { code: 'PROVIDER_ERROR', message: '일시적인 오류' },
    }));
    const client = createTossClient(secretKey(), { fetch });
    const r = await client.getPayment(orThrow(paymentKey('pk-x')));
    if (isErr(r) && r.error.source === 'toss') {
      expect(r.error.category).toBe('TRANSIENT');
      expect(r.error.retryable).toBe(true);
    } else {
      expect.unreachable('toss 실패여야 한다');
    }
  });

  it('미등록 코드 → UNKNOWN + 비재시도(보수 판정), 원문 무손실', async () => {
    const { fetch } = mockFetch(() => ({
      status: 418,
      body: { code: 'BRAND_NEW_CODE', message: '신규 에러' },
    }));
    const client = createTossClient(secretKey(), { fetch });
    const r = await client.getPayment(orThrow(paymentKey('pk-x')));
    if (isErr(r) && r.error.source === 'toss') {
      expect(r.error.code).toBe('BRAND_NEW_CODE');
      expect(r.error.category).toBe('UNKNOWN');
      expect(r.error.retryable).toBe(false);
      expect(r.error.httpStatus).toBe(418);
    } else {
      expect.unreachable('toss 실패여야 한다');
    }
  });

  it('fetch 예외 → TransportFailure NETWORK_ERROR, cause 보존', async () => {
    const cause = new Error('ECONNRESET');
    const { fetch } = failingFetch(cause);
    const client = createTossClient(secretKey(), { fetch });
    const r = await client.getPayment(orThrow(paymentKey('pk-x')));
    expect(isErr(r)).toBe(true);
    if (isErr(r) && r.error.source === 'network') {
      expect(r.error.code).toBe('NETWORK_ERROR');
      expect(r.error.retryable).toBe(true);
      expect(r.error.cause).toBe(cause);
    } else {
      expect.unreachable('network 실패여야 한다');
    }
  });

  it('2xx + 빈 body → 빈 Payment 제조 금지 — TransportFailure(NETWORK_ERROR, retryable)', async () => {
    const { fetch } = mockFetch(() => ({ status: 200 })); // body 없음 → 0바이트 본문
    const client = createTossClient(secretKey(), { fetch });
    const r = await client.getPayment(orThrow(paymentKey('pk-x')));
    expect(isErr(r)).toBe(true);
    if (isErr(r) && r.error.source === 'network') {
      expect(r.error.code).toBe('NETWORK_ERROR');
      expect(r.error.retryable).toBe(true);
      expect(String((r.error.cause as Error).message)).toContain('필수 필드');
    } else {
      expect.unreachable('network 실패여야 한다 — paymentKey undefined인 Payment가 Ok로 새면 안 된다');
    }
  });

  it('2xx + 비객체 JSON("OK" 문자열) → TransportFailure — Ok 통과 금지', async () => {
    const { fetch } = mockFetch(() => ({ status: 200, body: 'OK' })); // JSON 문자열 본문
    const client = createTossClient(secretKey(), { fetch });
    const r = await client.getPayment(orThrow(paymentKey('pk-x')));
    expect(isErr(r)).toBe(true);
    if (isErr(r)) expect(r.error.source).toBe('network');
  });

  it('2xx인데 필수 필드(status) 누락 → TransportFailure — 부분 결손 응답도 차단', async () => {
    const partial = rawPayment();
    delete (partial as Record<string, unknown>)['status'];
    const { fetch } = mockFetch(() => ({ status: 200, body: partial }));
    const client = createTossClient(secretKey(), { fetch });
    const r = await client.getPayment(orThrow(paymentKey('pk-x')));
    expect(isErr(r)).toBe(true);
    if (isErr(r)) expect(r.error.source).toBe('network');
  });

  it.each([
    ['null 원소', [null]],
    ['필수 필드 누락 원소', [{ transactionKey: 'cancel-incomplete' }]],
  ])('2xx의 cancels %s도 Payment로 통과시키지 않는다', async (_, cancels) => {
    const { fetch } = mockFetch(() => ({
      status: 200,
      body: rawPayment({ cancels: cancels as never }),
    }));
    const result = await createTossClient(secretKey(), { fetch }).getPayment(
      orThrow(paymentKey('pk-x')),
    );

    expect(result).toMatchObject({
      ok: false,
      error: { source: 'network', code: 'NETWORK_ERROR', retryable: true },
    });
  });

  it.each([
    ['currency', { currency: 'EUR' }],
    ['lastTransactionKey', { lastTransactionKey: 123 }],
  ])('환불 실행 지문에 쓰는 %s가 잘못된 2xx도 차단한다', async (_, overrides) => {
    const { fetch } = mockFetch(() => ({ status: 200, body: rawPayment(overrides) }));
    const result = await createTossClient(secretKey(), { fetch }).getPayment(
      orThrow(paymentKey('pk-x')),
    );

    expect(result).toMatchObject({
      ok: false,
      error: { source: 'network', code: 'NETWORK_ERROR', retryable: true },
    });
  });

  it('비-2xx + 비토스 형식(HTML 에러 페이지) → source network(재시도 가능) — toss UNKNOWN_ERROR 오분류 금지', async () => {
    const htmlFetch = (async () =>
      new Response('<html><body>502 Bad Gateway</body></html>', { status: 502 })) as typeof fetch;
    const client = createTossClient(secretKey(), { fetch: htmlFetch });
    const r = await client.getPayment(orThrow(paymentKey('pk-x')));
    expect(isErr(r)).toBe(true);
    if (isErr(r) && r.error.source === 'network') {
      expect(r.error.code).toBe('NETWORK_ERROR');
      expect(r.error.retryable).toBe(true);
      const message = String((r.error.cause as Error).message);
      expect(message).toContain('HTTP 502');
      expect(message).toContain('502 Bad Gateway');
    } else {
      expect.unreachable('network 실패여야 한다 — 게이트웨이 응답을 toss로 오분류하면 안 된다');
    }
  });

  it('비-2xx + 빈 body → source network — retryable:false 각인 금지', async () => {
    const { fetch } = mockFetch(() => ({ status: 504 })); // 빈 본문 504
    const client = createTossClient(secretKey(), { fetch });
    const r = await client.getPayment(orThrow(paymentKey('pk-x')));
    expect(isErr(r)).toBe(true);
    if (isErr(r) && r.error.source === 'network') {
      expect(r.error.retryable).toBe(true);
    } else {
      expect.unreachable('network 실패여야 한다');
    }
  });

  it('타임아웃 → TransportFailure TIMEOUT (AbortSignal.timeout 결합)', async () => {
    const hangingFetch = ((_url: unknown, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () =>
          reject(init.signal?.reason ?? new Error('aborted')),
        );
      })) as typeof fetch;
    const client = createTossClient(secretKey(), { fetch: hangingFetch, timeoutMs: 5 });
    const r = await client.getPayment(orThrow(paymentKey('pk-x')));
    expect(isErr(r)).toBe(true);
    if (isErr(r) && r.error.source === 'network') {
      expect(r.error.code).toBe('TIMEOUT');
    } else {
      expect.unreachable('network 실패여야 한다');
    }
  });
});
