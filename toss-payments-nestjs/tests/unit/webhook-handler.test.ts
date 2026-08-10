/**
 * §4.2/§4.4 toNestWebhookHandler — rawBody 부재 시 명시적 500(핸들러 미실행),
 * rawBody 존재 시 코어 nodeHandler 전량 위임(검증·200 ack·디스패치).
 */
import { describe, expect, it, vi } from 'vitest';

import { orThrow, orderId } from '@gj-kit/toss-payments';
import { createWebhookVerifier } from '@gj-kit/toss-payments/webhook';
import type { NodeServerResponseLike } from '@gj-kit/toss-payments/webhook';
import {
  memoryDedupeStore,
  memoryDepositSecretStore,
  webhookFixture,
} from '@gj-kit/toss-payments/testing';

import { toNestWebhookHandler } from '../../src/index';
import type { NestWebhookRequest } from '../../src/index';

const OID = 'order-nest-0001';
const VA_SECRET = 'va-secret-nest';

function makeRes(): NodeServerResponseLike & { ended: boolean } {
  return {
    statusCode: 0,
    ended: false,
    end() {
      this.ended = true;
      return this;
    },
  };
}

function makeReq(input: {
  headers: Readonly<Record<string, string | readonly string[] | undefined>>;
  rawBody?: Buffer;
}): NestWebhookRequest {
  return {
    headers: input.headers,
    ...(input.rawBody !== undefined ? { rawBody: input.rawBody } : {}),
    async *[Symbol.asyncIterator]() {
      // rawBody 경로만 검증 대상 — 스트림 소비는 일어나지 않아야 한다
      throw new Error('스트림을 소비하면 안 된다(rawBody/body 우선 계약 위반)');
    },
  };
}

async function makeVerifier() {
  const secrets = memoryDepositSecretStore();
  await secrets.saveSecret(orThrow(orderId(OID)), VA_SECRET);
  return createWebhookVerifier({ dedupe: memoryDedupeStore(), depositSecrets: secrets });
}

describe('rawBody 부재 — 조용한 검증 전멸 방지(설계 §4.2)', () => {
  it('핸들러 미실행 + 명시적 500 + 설정 안내(console.error)', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const verifier = await makeVerifier();
      const onDepositCallback = vi.fn();
      const handle = toNestWebhookHandler(verifier, { onDepositCallback });

      const { headers } = webhookFixture.depositCallback({ orderId: OID, secret: VA_SECRET });
      const res = makeRes();
      await handle(makeReq({ headers }), res); // rawBody 없음

      expect(res.statusCode).toBe(500);
      expect(res.ended).toBe(true);
      expect(onDepositCallback).not.toHaveBeenCalled();
      expect(errorSpy).toHaveBeenCalledTimes(1);
      expect(String(errorSpy.mock.calls[0]?.[0])).toContain('rawBody: true');
    } finally {
      errorSpy.mockRestore();
    }
  });
});

describe('rawBody 존재 — 코어 nodeHandler 위임(검증→dedupe→200→디스패치)', () => {
  it('DEPOSIT_CALLBACK이 secret 대조를 통과해 onDepositCallback에 도달한다', async () => {
    const verifier = await makeVerifier();
    const seen: string[] = [];
    const handle = toNestWebhookHandler(verifier, {
      onDepositCallback: (w) => {
        seen.push(w.event.orderId);
      },
    });

    const { rawBody, headers } = webhookFixture.depositCallback({
      orderId: OID,
      secret: VA_SECRET,
    });
    const res = makeRes();
    await handle(makeReq({ headers, rawBody: Buffer.from(rawBody) }), res);

    expect(res.statusCode).toBe(200);
    expect(res.ended).toBe(true);
    expect(seen).toEqual([OID]);
  });

  it('재전송(동일 transmission-id)은 dedupe로 200만 반환하고 핸들러 재실행이 없다', async () => {
    const verifier = await makeVerifier();
    const onDepositCallback = vi.fn();
    const handle = toNestWebhookHandler(verifier, { onDepositCallback });

    const { rawBody, headers } = webhookFixture.depositCallback({
      orderId: OID,
      secret: VA_SECRET,
    });
    const first = makeRes();
    await handle(makeReq({ headers, rawBody: Buffer.from(rawBody) }), first);
    const second = makeRes();
    await handle(makeReq({ headers, rawBody: Buffer.from(rawBody) }), second);

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    expect(onDepositCallback).toHaveBeenCalledTimes(1);
  });

  it('검증 실패(secret 불일치)는 400 — 코어 시맨틱 그대로 통과', async () => {
    const verifier = await makeVerifier();
    const onDepositCallback = vi.fn();
    const handle = toNestWebhookHandler(verifier, { onDepositCallback });

    const { rawBody, headers } = webhookFixture.depositCallback({
      orderId: OID,
      secret: 'wrong-secret',
    });
    const res = makeRes();
    await handle(makeReq({ headers, rawBody: Buffer.from(rawBody) }), res);

    expect(res.statusCode).toBe(400);
    expect(onDepositCallback).not.toHaveBeenCalled();
  });
});
