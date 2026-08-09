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
    expect(cancel.value.event.data.paymentKey).toBe('pay_1');
    expect(cancel.value.event.data.orderId).toBe('order-1');

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

  it('CANCEL_STATUS_CHANGED — 공식 Cancel 객체 형태(paymentKey/orderId 없음)도 UNKNOWN 강등 없이 판별한다', () => {
    // 문서상 data는 'Cancel 객체' — 그 필드 목록에 paymentKey/orderId가 없다(창작 필수 필드 금지)
    const r = parseWebhookEnvelope(
      JSON.stringify({
        eventType: 'CANCEL_STATUS_CHANGED',
        createdAt: '2026-08-09T12:00:00.000000',
        data: {
          cancelAmount: 1000,
          cancelReason: '고객 요청',
          transactionKey: 'TXN123456789',
          cancelStatus: 'DONE',
          cancelRequestId: 'req-123',
          canceledAt: '2026-08-09T12:00:00+09:00',
        },
      }),
    );
    expect(r.ok && r.value.kind === 'unverified').toBe(true);
    if (!r.ok || r.value.kind !== 'unverified') return;
    expect(r.value.event.eventType).toBe('CANCEL_STATUS_CHANGED');
    if (r.value.event.eventType !== 'CANCEL_STATUS_CHANGED') return;
    expect(r.value.event.data.cancelStatus).toBe('DONE');
    expect(r.value.event.data.paymentKey).toBeNull();
    expect(r.value.event.data.orderId).toBeNull();
    expect(r.value.event.data.cancelRequestId).toBe('req-123');
    expect(r.value.event.data.transactionKey).toBe('TXN123456789');
  });

  it('CANCEL_STATUS_CHANGED — 판별 기준은 cancelStatus만: 미지 cancelStatus는 UNKNOWN', () => {
    const r = parseWebhookEnvelope(
      JSON.stringify({
        eventType: 'CANCEL_STATUS_CHANGED',
        createdAt: '2026-08-09T12:00:00.000000',
        data: { cancelStatus: 'SOMETHING_NEW' },
      }),
    );
    expect(r.ok && r.value.kind === 'unverified').toBe(true);
    if (!r.ok || r.value.kind !== 'unverified') return;
    expect(r.value.event.eventType).toBe('UNKNOWN');
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

describe('parseWebhookEnvelope — UNKNOWN 폴백의 secret 마스킹 (로그 유출 방지 불변식)', () => {
  const SECRET = 'ps_SECRET_VALUE_123';

  it('평탄 봉투 + DEPOSIT_STATUSES 밖 status → UNKNOWN이며 raw의 secret은 [redacted]', () => {
    const r = parseWebhookEnvelope(
      JSON.stringify({
        createdAt: '2026-01-01T00:00:00+09:00',
        secret: SECRET,
        status: 'REFUND_PENDING', // deposit 4종 밖 — deposit 경로(secret 분리·소비)에 들지 못한다
        transactionKey: 'tk_1',
        orderId: 'order-123456',
      }),
    );
    expect(r.ok).toBe(true);
    if (!r.ok || r.value.kind !== 'unverified') return expect.unreachable('unverified여야 한다');
    expect(r.value.event.eventType).toBe('UNKNOWN');
    if (r.value.event.eventType !== 'UNKNOWN') return;
    // UNKNOWN 이벤트 통째 로깅은 자연스러운 모니터링 패턴 — secret 원문이 남으면 웹훅 위조 재료가 된다
    expect(JSON.stringify(r.value.event)).not.toContain(SECRET);
    expect((r.value.event.raw as Record<string, unknown>)['secret']).toBe('[redacted]');
    // 나머지 필드는 보존 — 전방 호환 디버깅 정보 유지
    expect((r.value.event.raw as Record<string, unknown>)['orderId']).toBe('order-123456');
  });

  it('평탄 봉투 + transactionKey 누락(판별 실패) → UNKNOWN이며 secret 미유출', () => {
    const r = parseWebhookEnvelope(
      JSON.stringify({
        createdAt: '2026-01-01T00:00:00+09:00',
        secret: SECRET,
        status: 'DONE',
        orderId: 'order-123456', // transactionKey 없음
      }),
    );
    expect(r.ok).toBe(true);
    if (!r.ok || r.value.kind !== 'unverified') return;
    expect(JSON.stringify(r.value.event)).not.toContain(SECRET);
  });

  it('legacy/v2 UNKNOWN 폴백도 최상위 secret을 마스킹한다 (방어 일관성)', () => {
    // (a) eventType 있음 + data 없음 → legacy UNKNOWN 폴백
    const noData = parseWebhookEnvelope(
      JSON.stringify({ eventType: 'WEIRD_EVENT', createdAt: '2026-01-01T00:00:00+09:00', secret: SECRET }),
    );
    expect(noData.ok).toBe(true);
    if (noData.ok && noData.value.kind === 'unverified') {
      expect(JSON.stringify(noData.value.event)).not.toContain(SECRET);
    }

    // (b) 미지 eventType + data 있음 → parseLegacy unknown()
    const legacyUnknown = parseWebhookEnvelope(
      JSON.stringify({
        eventType: 'BRAND_NEW_EVENT',
        createdAt: '2026-01-01T00:00:00+09:00',
        secret: SECRET,
        data: {},
      }),
    );
    expect(legacyUnknown.ok).toBe(true);
    if (legacyUnknown.ok && legacyUnknown.value.kind === 'unverified') {
      expect(JSON.stringify(legacyUnknown.value.event)).not.toContain(SECRET);
    }

    // (c) entityBody 있음 + 미지 eventType → parseV2 unknown()
    const v2Unknown = parseWebhookEnvelope(
      JSON.stringify({
        eventType: 'mystery.changed',
        createdAt: '2026-01-01T00:00:00+09:00',
        eventId: 'evt-1',
        entityType: 'mystery',
        entityBody: {},
        secret: SECRET,
      }),
    );
    expect(v2Unknown.ok).toBe(true);
    if (v2Unknown.ok && v2Unknown.value.kind === 'unverified') {
      expect(JSON.stringify(v2Unknown.value.event)).not.toContain(SECRET);
    }
  });

  it('secret이 없는 UNKNOWN raw는 원문 그대로 보존된다', () => {
    const body = { createdAt: '2026-01-01T00:00:00+09:00', something: 'else' };
    const r = parseWebhookEnvelope(JSON.stringify(body));
    expect(r.ok).toBe(true);
    if (!r.ok || r.value.kind !== 'unverified' || r.value.event.eventType !== 'UNKNOWN') return;
    expect(r.value.event.raw).toEqual(body);
  });
});
