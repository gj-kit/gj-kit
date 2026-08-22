/**
 * §3.7 webhook_inbox — 이벤트 원문 보존 + WebhookHandlers 래퍼.
 *
 * 불변식: record는 핸들러 **앞**에서 실행된다(핸들러 실패에도 수신 사실은 남김).
 * record 실패 기본 동작은 삼키고 onRecordError 통지 — 관측 계층이 웹훅 가용성을
 * 볼모로 잡지 않는다. failOnRecordError: true만 throw → 어댑터 500 → 토스 재전송.
 */
import { describe, expect, it } from 'vitest';

import type { SecretVerified, WebhookHandlers, WebhookMeta } from '@gj-kit/toss-payments/webhook';

import { createPgWebhookInboxStore, withWebhookInbox } from '../../src/stores/inbox';
import type { WebhookInboxStore } from '../../src/stores/inbox';
import { createFakeSql, norm } from './helpers/fake-sql';
import { makeSecretVerifiedWebhook } from './helpers/fixtures';

describe('§3.7 record — upsert(dedupe_key)', () => {
  it('신규 insert + 재전송 시 deliveries 증가 upsert SQL을 실행한다', async () => {
    const fake = createFakeSql();
    const inbox = createPgWebhookInboxStore(fake);
    const webhook = makeSecretVerifiedWebhook();

    await inbox.record(webhook);

    expect(fake.calls).toHaveLength(1);
    const text = norm(fake.calls[0]?.text ?? '');
    expect(text).toContain('INSERT INTO "toss_payments".webhook_inbox');
    expect(text).toContain('ON CONFLICT (dedupe_key) DO UPDATE');
    expect(text).toContain('deliveries = webhook_inbox.deliveries + 1');
    expect(text).toContain('last_received_at = now()');
    expect(text).toContain('retried_count = excluded.retried_count');
    expect(fake.calls[0]?.params).toEqual([
      webhook.meta.dedupeKey,
      webhook.meta.transmissionId,
      webhook.meta.transmissionTime,
      webhook.meta.retriedCount,
      webhook.trust,
      webhook.event.eventType,
      JSON.stringify(webhook.event), // secret 키·문제 문자가 없는 이벤트는 통짜 직렬화와 바이트 동일
    ]);
  });

  it('이벤트의 모든 깊이 secret 키를 [REDACTED]로 마스킹해 저장한다 — 무기한 보존 테이블에 입금 웹훅 위조 재료를 남기지 않는다', async () => {
    const fake = createFakeSql();
    const inbox = createPgWebhookInboxStore(fake);
    // PAYMENT_STATUS_CHANGED의 data는 코어 Payment 통짜 — 가상계좌면 secret과
    // raw.secret이 함께 실려 온다(envelope.ts toWebhookPayment의 { ...data, raw: data }).
    const raw = { paymentKey: 'pk-1', orderId: 'order-1', status: 'DONE', secret: 'vault-secret' };
    const webhook = {
      trust: 'unverified',
      event: {
        envelope: 'legacy',
        eventType: 'PAYMENT_STATUS_CHANGED',
        createdAt: '2026-08-20T12:00:00+09:00',
        data: { ...raw, raw },
      },
      meta: makeSecretVerifiedWebhook().meta,
    } as unknown as Parameters<WebhookInboxStore['record']>[0];

    await inbox.record(webhook);

    const stored = String(fake.calls[0]?.params?.[6]);
    expect(stored).not.toContain('vault-secret');
    const parsed = JSON.parse(stored) as {
      data: { secret: string; raw: { secret: string } };
    };
    expect(parsed.data.secret).toBe('[REDACTED]');
    expect(parsed.data.raw.secret).toBe('[REDACTED]');
  });

  it('billing/auth key·token·password·card/account 계열을 모든 깊이에서 마스킹하고 handler 원본은 변형하지 않는다', async () => {
    const fake = createFakeSql();
    const inbox = createPgWebhookInboxStore(fake);
    const sensitiveEvent = {
      envelope: 'legacy',
      eventType: 'PAYMENT_STATUS_CHANGED',
      createdAt: '2026-08-20T12:00:00+09:00',
      data: {
        billingKey: 'bkey-should-never-persist',
        auth_key: 'auth-should-never-persist',
        tokens: ['access-token-1', 'refresh-token-2'],
        password: 'password-should-never-persist',
        cardNumber: '4111111111111111',
        card: { number: '5555555555554444', issuer: 'issuer-kept-out-with-card' },
        nested: {
          Authorization: 'Bearer should-never-persist',
          bank_account_no: '100012345678',
          keep: 'audit-safe-value',
        },
      },
    };
    const webhook = {
      trust: 'unverified',
      event: sensitiveEvent,
      meta: makeSecretVerifiedWebhook().meta,
    } as unknown as Parameters<WebhookInboxStore['record']>[0];
    const before = JSON.stringify(sensitiveEvent);

    await inbox.record(webhook);

    const stored = String(fake.calls[0]?.params?.[6]);
    for (const raw of [
      'bkey-should-never-persist',
      'auth-should-never-persist',
      'access-token-1',
      'refresh-token-2',
      'password-should-never-persist',
      '4111111111111111',
      '5555555555554444',
      'Bearer should-never-persist',
      '100012345678',
    ]) {
      expect(stored).not.toContain(raw);
    }
    const parsed = JSON.parse(stored) as {
      data: {
        billingKey: string;
        auth_key: string;
        tokens: string;
        password: string;
        cardNumber: string;
        card: string;
        nested: { Authorization: string; bank_account_no: string; keep: string };
      };
    };
    expect(parsed.data.billingKey).toBe('[REDACTED]');
    expect(parsed.data.auth_key).toBe('[REDACTED]');
    expect(parsed.data.tokens).toBe('[REDACTED]');
    expect(parsed.data.password).toBe('[REDACTED]');
    expect(parsed.data.cardNumber).toBe('[REDACTED]');
    expect(parsed.data.card).toBe('[REDACTED]');
    expect(parsed.data.nested.Authorization).toBe('[REDACTED]');
    expect(parsed.data.nested.bank_account_no).toBe('[REDACTED]');
    expect(parsed.data.nested.keep).toBe('audit-safe-value');
    // serializeJsonb가 새 객체를 만들므로 실제 handler가 받는 webhook/event는 그대로다.
    expect(JSON.stringify(sensitiveEvent)).toBe(before);
    expect(sensitiveEvent.data.billingKey).toBe('bkey-should-never-persist');
    expect(sensitiveEvent.data.card.number).toBe('5555555555554444');
  });

  it('jsonb가 거부하는 U+0000·비페어 서로게이트는 U+FFFD로 정화해 저장한다 — poison message 차단', async () => {
    const fake = createFakeSql();
    const inbox = createPgWebhookInboxStore(fake);
    const webhook = makeSecretVerifiedWebhook();
    const dirty = {
      ...webhook,
      event: { ...webhook.event, orderId: 'nul\u0000중간\ud800끝' },
    };

    await inbox.record(dirty);

    const stored = String(fake.calls[0]?.params?.[6]);
    expect(stored).not.toContain('\\u0000');
    expect(stored).not.toContain('\\ud800');
    const parsed = JSON.parse(stored) as { orderId: string };
    expect(parsed.orderId).toBe('nul�중간�끝');
  });
});

/** 호출 순서·인자를 기록하는 inbox 대역 — 래퍼 검증의 관심사는 순서뿐이다. */
function makeProbe(recordImpl?: (webhook: unknown) => Promise<void>) {
  const order: string[] = [];
  const inbox: WebhookInboxStore = {
    record: async (webhook) => {
      order.push('record');
      await recordImpl?.(webhook);
    },
  };
  return { order, inbox };
}

describe('§3.7 withWebhookInbox — record → 핸들러 순서', () => {
  it('핸들러보다 record가 먼저 실행되고, 핸들러는 원본 webhook을 그대로 받는다', async () => {
    const { order, inbox } = makeProbe();
    const webhook = makeSecretVerifiedWebhook();
    let received: SecretVerified | undefined;
    const handlers: WebhookHandlers = {
      onDepositCallback: (w) => {
        order.push('handler');
        received = w;
      },
    };

    const wrapped = withWebhookInbox(inbox, handlers);
    await wrapped.onDepositCallback?.(webhook);

    expect(order).toEqual(['record', 'handler']);
    expect(received).toBe(webhook); // 래퍼는 이벤트를 변형하지 않는다
  });

  it('핸들러가 throw해도 record는 이미 실행돼 있다(수신 사실 보존)', async () => {
    const { order, inbox } = makeProbe();
    const handlers: WebhookHandlers = {
      onDepositCallback: () => {
        order.push('handler');
        throw new Error('핸들러 실패');
      },
    };

    const wrapped = withWebhookInbox(inbox, handlers);
    await expect(wrapped.onDepositCallback?.(makeSecretVerifiedWebhook())).rejects.toThrow(
      '핸들러 실패',
    );
    expect(order).toEqual(['record', 'handler']);
  });

  it('배선하지 않은 핸들러 키는 래퍼에도 없다 — 코어의 "핸들러 없는 이벤트 무시" 동작 보존', () => {
    const { inbox } = makeProbe();
    const handlers: WebhookHandlers = {
      onDepositCallback: () => undefined,
    };

    const wrapped = withWebhookInbox(inbox, handlers);

    expect(typeof wrapped.onDepositCallback).toBe('function');
    expect(wrapped.onPaymentStatusChanged).toBeUndefined();
    expect(wrapped.onUnknownEvent).toBeUndefined();
    expect(Object.keys(wrapped)).toEqual(['onDepositCallback']); // 키 집합 불변
  });

  it('클래스 인스턴스 handlers(프로토타입 메서드)도 감싼다 — Object.keys가 못 보는 키를 유실하지 않는다', async () => {
    const { order, inbox } = makeProbe();
    // NestJS 서비스 패턴 — 메서드가 own property가 아니라 프로토타입에 있다
    class DepositService implements WebhookHandlers {
      readonly handled: SecretVerified[] = [];

      onDepositCallback(w: SecretVerified): void {
        this.handled.push(w); // this 참조 — 메서드 호출 시맨틱까지 함께 검증
      }
    }
    const service = new DepositService();
    expect(Object.keys(service)).toEqual(['handled']); // 전제 확인: 핸들러 키는 own이 아니다

    const wrapped = withWebhookInbox(inbox, service);
    const webhook = makeSecretVerifiedWebhook();
    await wrapped.onDepositCallback?.(webhook);

    expect(order).toEqual(['record']); // 프로토타입 메서드도 record가 선행한다
    expect(service.handled).toEqual([webhook]); // this === service로 실행됐다
  });

  it('객체 리터럴 메서드의 this도 보존한다 — 코어 어댑터의 handlers.onX?.(w) 메서드 호출과 동일 시맨틱', async () => {
    const { inbox } = makeProbe();
    const saved: SecretVerified[] = [];
    const handlers = {
      onDepositCallback(w: SecretVerified) {
        this.save(w); // 감싸지 않은 채 코어에 넘기면 동작하는 코드 — 래핑 후에도 깨지면 안 된다
      },
      save(w: SecretVerified) {
        saved.push(w);
      },
    };

    const wrapped = withWebhookInbox(inbox, handlers);
    const webhook = makeSecretVerifiedWebhook();
    await wrapped.onDepositCallback?.(webhook);

    expect(saved).toEqual([webhook]);
  });
});

describe('§3.7 withWebhookInbox — record 실패 정책', () => {
  const recordFailure = new Error('inbox insert 실패');

  it('기본: record 실패를 삼키고 핸들러는 그대로 실행된다', async () => {
    const { order, inbox } = makeProbe(async () => {
      throw recordFailure;
    });
    let handled = false;
    const handlers: WebhookHandlers = {
      onDepositCallback: () => {
        handled = true;
      },
    };

    const wrapped = withWebhookInbox(inbox, handlers);
    await expect(wrapped.onDepositCallback?.(makeSecretVerifiedWebhook())).resolves.toBeUndefined();

    expect(order).toEqual(['record']);
    expect(handled).toBe(true);
  });

  it('onRecordError는 (cause, meta)만 받는다 — 이벤트 본문은 통지에 싣지 않는다', async () => {
    const { inbox } = makeProbe(async () => {
      throw recordFailure;
    });
    const notified: { cause: unknown; meta: WebhookMeta }[] = [];
    const handlers: WebhookHandlers = { onDepositCallback: () => undefined };
    const webhook = makeSecretVerifiedWebhook();

    const wrapped = withWebhookInbox(inbox, handlers, {
      onRecordError: (cause, meta) => {
        notified.push({ cause, meta });
      },
    });
    await wrapped.onDepositCallback?.(webhook);

    expect(notified).toHaveLength(1);
    expect(notified[0]?.cause).toBe(recordFailure);
    expect(notified[0]?.meta).toBe(webhook.meta);
  });

  it('onRecordError 콜백의 throw도 삼켜진다 — 통지가 웹훅 처리를 막지 않는다', async () => {
    const { inbox } = makeProbe(async () => {
      throw recordFailure;
    });
    let handled = false;
    const handlers: WebhookHandlers = {
      onDepositCallback: () => {
        handled = true;
      },
    };

    const wrapped = withWebhookInbox(inbox, handlers, {
      onRecordError: () => {
        throw new Error('통지 콜백 실패');
      },
    });
    await expect(wrapped.onDepositCallback?.(makeSecretVerifiedWebhook())).resolves.toBeUndefined();
    expect(handled).toBe(true);
  });

  it('failOnRecordError: true — record 실패를 그대로 throw하고 핸들러는 실행하지 않는다', async () => {
    const { order, inbox } = makeProbe(async () => {
      throw recordFailure;
    });
    let handled = false;
    const handlers: WebhookHandlers = {
      onDepositCallback: () => {
        handled = true;
      },
    };

    const wrapped = withWebhookInbox(inbox, handlers, { failOnRecordError: true });
    await expect(wrapped.onDepositCallback?.(makeSecretVerifiedWebhook())).rejects.toBe(
      recordFailure,
    );

    expect(order).toEqual(['record']);
    expect(handled).toBe(false); // 내구 계약 모드 — 기록 실패 시 처리 자체를 중단
  });
});
