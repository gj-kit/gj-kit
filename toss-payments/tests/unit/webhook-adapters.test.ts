import { afterEach, describe, expect, it, vi } from 'vitest';

import { createWebhookVerifier } from '../../src/webhook';
import type {
  NodeIncomingMessageLike,
  NodeServerResponseLike,
  WebhookDedupeStore,
} from '../../src/webhook';

const TIME = '2026-08-09T12:00:00+09:00';

function memoryDedupe(): WebhookDedupeStore {
  const states = new Map<string, 'processing' | 'completed'>();
  return {
    claim: (id) => {
      const state = states.get(id);
      if (state !== undefined) return Promise.resolve(state);
      states.set(id, 'processing');
      return Promise.resolve('claimed');
    },
    complete: (id) => {
      states.set(id, 'completed');
      return Promise.resolve();
    },
    release: (id) => {
      states.delete(id);
      return Promise.resolve();
    },
  };
}

let seq = 0;
function headersFor(): Record<string, string> {
  seq += 1;
  return {
    'tosspayments-webhook-transmission-id': `atx-${seq}`,
    'tosspayments-webhook-transmission-time': TIME,
    'tosspayments-webhook-transmission-retried-count': '0',
  };
}

const LEGACY_BODY = JSON.stringify({
  eventType: 'PAYMENT_STATUS_CHANGED',
  createdAt: '2026-08-09T12:00:00.000000',
  data: { paymentKey: 'pay_123', orderId: 'order-abc1', status: 'DONE', totalAmount: 1000 },
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ── fetchHandler ───────────────────────────────────────────────────────────

describe('fetchHandler — Request → rawBody → 검증 → 디스패치 → 200', () => {
  function makeRequest(body: string, headers: Record<string, string>): Request {
    return new Request('https://shop.example/api/webhooks/toss', {
      method: 'POST',
      headers,
      body,
    });
  }

  it('정상 이벤트 → 핸들러 완료 + claim complete 후 200', async () => {
    const verifier = createWebhookVerifier({ dedupe: memoryDedupe(), allowedSourceIps: false });
    const received: string[] = [];
    const handler = verifier.fetchHandler({
      onPaymentStatusChanged: (w) => {
        received.push(`${w.event.data.orderId}:${w.event.data.status}`);
      },
    });

    const res1 = await handler(makeRequest(LEGACY_BODY, headersFor()));
    expect(res1.status).toBe(200);
    // sync-complete: 응답 시점에 핸들러가 이미 완료돼 있다
    expect(received).toEqual(['order-abc1:DONE']);

    await handler(makeRequest(LEGACY_BODY, headersFor()));
  });

  it('검증 거부 → 400, 핸들러 미호출', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const verifier = createWebhookVerifier({ dedupe: memoryDedupe(), allowedSourceIps: false });
    const onPaymentStatusChanged = vi.fn();
    const handler = verifier.fetchHandler({ onPaymentStatusChanged });

    const res = await handler(makeRequest('{broken json', headersFor()));
    expect(res.status).toBe(400);
    expect(onPaymentStatusChanged).not.toHaveBeenCalled();
  });

  it('duplicate → 200 ack(재전송 중단) + 핸들러는 1회만', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const verifier = createWebhookVerifier({ dedupe: memoryDedupe(), allowedSourceIps: false });
    const onPaymentStatusChanged = vi.fn();
    const handler = verifier.fetchHandler({ onPaymentStatusChanged });

    const headers = headersFor(); // 같은 transmission-id 재사용 = 재전송 시뮬레이션
    const first = await handler(makeRequest(LEGACY_BODY, headers));
    const second = await handler(makeRequest(LEGACY_BODY, headers));
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(onPaymentStatusChanged).toHaveBeenCalledTimes(1);
  });

  it('비동기 핸들러 완료 후에만 200을 응답한다', async () => {
    const verifier = createWebhookVerifier({ dedupe: memoryDedupe(), allowedSourceIps: false });
    let handled = false;
    const handler = verifier.fetchHandler({
      onPaymentStatusChanged: async () => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        handled = true;
      },
    });

    const res = await handler(makeRequest(LEGACY_BODY, headersFor()));
    expect(res.status).toBe(200);
    expect(handled).toBe(true);
  });

  it('핸들러 예외 → claim release + 500, 같은 이벤트 재전송이 다시 처리된다', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const verifier = createWebhookVerifier({ dedupe: memoryDedupe(), allowedSourceIps: false });
    let attempts = 0;
    const handler = verifier.fetchHandler({ onPaymentStatusChanged: () => {
      attempts += 1;
      if (attempts === 1) throw new Error('handler boom');
    } });
    const headers = headersFor();
    expect((await handler(makeRequest(LEGACY_BODY, headers))).status).toBe(500);
    expect((await handler(makeRequest(LEGACY_BODY, headers))).status).toBe(200);
    expect(attempts).toBe(2);
    expect(error).toHaveBeenCalled();
  });
});

// ── nodeHandler ────────────────────────────────────────────────────────────

interface MockResponse extends NodeServerResponseLike {
  ended: boolean;
}

function mockRes(): MockResponse {
  return {
    statusCode: 0,
    ended: false,
    end() {
      this.ended = true;
      return this;
    },
  };
}

function streamReq(body: string, headers: Record<string, string>): NodeIncomingMessageLike {
  const bytes = new TextEncoder().encode(body);
  return {
    headers,
    async *[Symbol.asyncIterator]() {
      // 청크 분할 수신 시뮬레이션
      yield bytes.slice(0, 5);
      yield bytes.slice(5);
    },
  };
}

describe('nodeHandler — IncomingMessage 스트림/express.raw 수용', () => {
  it('스트림 수집 → 200 + 핸들러 호출', async () => {
    const verifier = createWebhookVerifier({ dedupe: memoryDedupe(), allowedSourceIps: false });
    const received: string[] = [];
    const handler = verifier.nodeHandler({
      onPaymentStatusChanged: (w) => {
        received.push(w.event.data.orderId);
      },
    });
    const res = mockRes();
    await handler(streamReq(LEGACY_BODY, headersFor()), res);
    expect(res.statusCode).toBe(200);
    expect(res.ended).toBe(true);
    expect(received).toEqual(['order-abc1']);
  });

  it('req.body가 이미 Buffer(express.raw)면 그것을 사용한다', async () => {
    const verifier = createWebhookVerifier({ dedupe: memoryDedupe(), allowedSourceIps: false });
    const onPaymentStatusChanged = vi.fn();
    const handler = verifier.nodeHandler({ onPaymentStatusChanged });
    const req: NodeIncomingMessageLike = {
      headers: headersFor(),
      body: new TextEncoder().encode(LEGACY_BODY),
      async *[Symbol.asyncIterator]() {
        throw new Error('body가 있으면 스트림을 읽으면 안 된다');
      },
    };
    const res = mockRes();
    await handler(req, res);
    expect(res.statusCode).toBe(200);
    expect(onPaymentStatusChanged).toHaveBeenCalledTimes(1);
  });

  it('req.body가 파싱된 객체(express.json)면 명확한 에러 로그와 400', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const verifier = createWebhookVerifier({ dedupe: memoryDedupe(), allowedSourceIps: false });
    const onPaymentStatusChanged = vi.fn();
    const handler = verifier.nodeHandler({ onPaymentStatusChanged });
    const req: NodeIncomingMessageLike = {
      headers: headersFor(),
      body: JSON.parse(LEGACY_BODY) as unknown,
      async *[Symbol.asyncIterator]() {
        /* 도달하지 않음 */
      },
    };
    const res = mockRes();
    await handler(req, res);
    expect(res.statusCode).toBe(400);
    expect(onPaymentStatusChanged).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledWith(expect.stringContaining('express.raw'));
  });

  it('검증 거부 → 400 / duplicate → 200 + 핸들러 1회', async () => {
    const verifier = createWebhookVerifier({ dedupe: memoryDedupe(), allowedSourceIps: false });
    const onPaymentStatusChanged = vi.fn();
    const handler = verifier.nodeHandler({ onPaymentStatusChanged });

    const badRes = mockRes();
    await handler(streamReq('{broken', headersFor()), badRes);
    expect(badRes.statusCode).toBe(400);

    const headers = headersFor();
    const res1 = mockRes();
    const res2 = mockRes();
    await handler(streamReq(LEGACY_BODY, headers), res1);
    await handler(streamReq(LEGACY_BODY, headers), res2);
    expect(res1.statusCode).toBe(200);
    expect(res2.statusCode).toBe(200);
    expect(onPaymentStatusChanged).toHaveBeenCalledTimes(1);
  });
});
