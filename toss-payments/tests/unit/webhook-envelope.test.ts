import { describe, expect, it } from 'vitest';

import { parseTossTimestamp, parseWebhookEnvelope } from '../../src/webhook/envelope';

describe('parseWebhookEnvelope — 봉투 3종 구조 판별', () => {
  it('구형 {eventType, data} — PAYMENT_STATUS_CHANGED를 legacy로 판별하고 data를 Payment로 매핑한다', () => {
    const data = {
      paymentKey: 'pay_123',
      orderId: 'order-abc1',
      status: 'DONE',
      totalAmount: 1000,
    };
    const r = parseWebhookEnvelope(
      JSON.stringify({
        eventType: 'PAYMENT_STATUS_CHANGED',
        createdAt: '2026-08-09T12:00:00.000000',
        data,
      }),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.kind).toBe('unverified');
    if (r.value.kind !== 'unverified') return;
    const event = r.value.event;
    expect(event.eventType).toBe('PAYMENT_STATUS_CHANGED');
    if (event.eventType !== 'PAYMENT_STATUS_CHANGED') return;
    expect(event.envelope).toBe('legacy');
    expect(event.data.paymentKey).toBe('pay_123');
    expect(event.data.status).toBe('DONE');
    // 원문 무손실 보존 탈출구
    expect(event.data.raw).toEqual(data);
  });

  it('구형 — 종결 status가 아닌 PAYMENT_STATUS_CHANGED는 UNKNOWN으로 수용한다(전방 호환)', () => {
    const r = parseWebhookEnvelope(
      JSON.stringify({
        eventType: 'PAYMENT_STATUS_CHANGED',
        createdAt: '2026-08-09T12:00:00.000000',
        data: { paymentKey: 'pay_123', orderId: 'order-abc1', status: 'READY' },
      }),
    );
    expect(r.ok).toBe(true);
    if (!r.ok || r.value.kind !== 'unverified') return;
    expect(r.value.event.eventType).toBe('UNKNOWN');
    if (r.value.event.eventType !== 'UNKNOWN') return;
    expect(r.value.event.rawEventType).toBe('PAYMENT_STATUS_CHANGED');
  });

  it('구형 — CANCEL_STATUS_CHANGED / BILLING_DELETED를 세분화한다', () => {
    const cancel = parseWebhookEnvelope(
      JSON.stringify({
        eventType: 'CANCEL_STATUS_CHANGED',
        createdAt: '2026-08-09T12:00:00.000000',
        data: { paymentKey: 'pay_1', orderId: 'order-1', cancelStatus: 'IN_PROGRESS' },
      }),
    );
    expect(cancel.ok && cancel.value.kind === 'unverified').toBe(true);
    if (!cancel.ok || cancel.value.kind !== 'unverified') return;
    expect(cancel.value.event.eventType).toBe('CANCEL_STATUS_CHANGED');
    if (cancel.value.event.eventType !== 'CANCEL_STATUS_CHANGED') return;
    expect(cancel.value.event.data.cancelRequestId).toBe(null);

    const billing = parseWebhookEnvelope(
      JSON.stringify({
        eventType: 'BILLING_DELETED',
        createdAt: '2026-08-09T12:00:00.000000',
        data: { billingKey: 'bill_1', reason: '카드 만료' },
      }),
    );
    expect(billing.ok && billing.value.kind === 'unverified').toBe(true);
    if (!billing.ok || billing.value.kind !== 'unverified') return;
    expect(billing.value.event.eventType).toBe('BILLING_DELETED');
  });

  it('평탄 구조(eventType 없음 + secret/transactionKey) — DEPOSIT_CALLBACK으로 판별하고 secret을 이벤트 밖으로 분리한다', () => {
    const r = parseWebhookEnvelope(
      JSON.stringify({
        createdAt: '2022-06-09T15:40:09+09:00',
        secret: 'ps_secret_1',
        status: 'DONE',
        transactionKey: 'tx_1',
        orderId: 'order-va-1',
      }),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.kind).toBe('deposit');
    if (r.value.kind !== 'deposit') return;
    expect(r.value.secret).toBe('ps_secret_1');
    expect(r.value.event.eventType).toBe('DEPOSIT_CALLBACK');
    expect(r.value.event.orderId).toBe('order-va-1');
    // secret은 검증 소비 후 제거 — 이벤트 객체에 처음부터 없다
    expect('secret' in r.value.event).toBe(false);
    expect('paymentKey' in r.value.event).toBe(false);
  });

  it('신형 {eventId, entityBody} — payout/seller는 signed, ars-reservation은 unverified', () => {
    const base = {
      createdAt: '2026-08-09T12:00:00+09:00',
      version: '2022-11-16',
      eventId: 'evt-1',
      entityBody: { id: 'x' },
    };
    const payout = parseWebhookEnvelope(
      JSON.stringify({ ...base, eventType: 'payout.changed', entityType: 'payout' }),
    );
    expect(payout.ok && payout.value.kind === 'signed').toBe(true);

    const seller = parseWebhookEnvelope(
      JSON.stringify({ ...base, eventType: 'seller.changed', entityType: 'seller' }),
    );
    expect(seller.ok && seller.value.kind === 'signed').toBe(true);

    const ars = parseWebhookEnvelope(
      JSON.stringify({
        ...base,
        eventType: 'ars-reservation.changed',
        entityType: 'ars-reservation',
      }),
    );
    expect(ars.ok && ars.value.kind === 'unverified').toBe(true);
    if (!ars.ok || ars.value.kind !== 'unverified') return;
    expect(ars.value.event.eventType).toBe('ars-reservation.changed');
  });

  it('알 수 없는 eventType / 알 수 없는 구조 — UNKNOWN 래퍼로 수용한다', () => {
    const newEvent = parseWebhookEnvelope(
      JSON.stringify({
        eventType: 'SOME_FUTURE_EVENT',
        createdAt: '2026-08-09T12:00:00.000000',
        data: { anything: true },
      }),
    );
    expect(newEvent.ok && newEvent.value.kind === 'unverified').toBe(true);
    if (!newEvent.ok || newEvent.value.kind !== 'unverified') return;
    expect(newEvent.value.event.eventType).toBe('UNKNOWN');
    if (newEvent.value.event.eventType !== 'UNKNOWN') return;
    expect(newEvent.value.event.rawEventType).toBe('SOME_FUTURE_EVENT');
    expect(newEvent.value.event.envelope).toBe('legacy');

    const noShape = parseWebhookEnvelope(JSON.stringify({ hello: 'world' }));
    expect(noShape.ok && noShape.value.kind === 'unverified').toBe(true);
    if (!noShape.ok || noShape.value.kind !== 'unverified') return;
    expect(noShape.value.event.eventType).toBe('UNKNOWN');
    if (noShape.value.event.eventType !== 'UNKNOWN') return;
    expect(noShape.value.event.envelope).toBe('flat');
  });

  it('깨진 JSON / 객체가 아닌 본문 — parse-failed', () => {
    const broken = parseWebhookEnvelope('{not json');
    expect(broken.ok).toBe(false);
    if (broken.ok) return;
    expect(broken.error.kind).toBe('parse-failed');

    const array = parseWebhookEnvelope('[1,2,3]');
    expect(array.ok).toBe(false);
  });
});

describe('parseTossTimestamp — 3형식 관대 파서', () => {
  it('마이크로초 6자리 무오프셋(구형) — KST(+09:00)로 해석하고 밀리초로 절단한다', () => {
    const r = parseTossTimestamp('2024-01-15T10:30:45.123456');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.toISOString()).toBe('2024-01-15T01:30:45.123Z');
  });

  it('±hh:mm 오프셋 (DEPOSIT_CALLBACK/신형)', () => {
    const plus = parseTossTimestamp('2022-06-09T15:40:09+09:00');
    expect(plus.ok).toBe(true);
    if (!plus.ok) return;
    expect(plus.value.toISOString()).toBe('2022-06-09T06:40:09.000Z');

    const minus = parseTossTimestamp('2024-01-15T10:30:45-05:00');
    expect(minus.ok).toBe(true);
    if (!minus.ok) return;
    expect(minus.value.toISOString()).toBe('2024-01-15T15:30:45.000Z');
  });

  it('밀리초 형식 (Z 포함)', () => {
    const r = parseTossTimestamp('2024-01-15T10:30:45.123Z');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.toISOString()).toBe('2024-01-15T10:30:45.123Z');
  });

  it('잘못된 형식 — bad-timestamp', () => {
    for (const raw of ['nope', '2024-13-01T00:00:00Z', '2024-01-15 10:30:45', '2024-01-15T25:00:00Z']) {
      const r = parseTossTimestamp(raw);
      expect(r.ok).toBe(false);
      if (r.ok) continue;
      expect(r.error).toEqual({ kind: 'bad-timestamp', raw });
    }
  });
});
