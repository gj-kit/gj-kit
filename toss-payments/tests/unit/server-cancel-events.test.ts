/**
 * §3.3 'cancel.executed'/'cancel.failed' — 공개 TossEventMap이 약속한 취소 이벤트의 발행
 * 배선 회귀 테스트(발견: 선언만 있고 emit 지점 0곳 — 구독자가 영원히 미수신).
 *
 * 발행 지점: createCancels(http, emit) — createTossClient가 options.events에서 배선한다.
 * Result 확정 후 fire-and-forget, 사전검증(preflight) Err 포함(전부 CancelError).
 */
import { describe, expect, it, vi } from 'vitest';

import {
  asCancelable,
  cancelReason,
  createTossClient,
  createTossEvents,
  createTossPayments,
  isErr,
  isOk,
  orThrow,
  parseApiSecretKey,
  type SettledCancelable,
  type TossEvents,
} from '../../src/server';
import type { TossEvent } from '../../src/server/events';
import {
  asPaymentFixture,
  forbiddenFetch,
  mockFetch,
  rawCancelTransaction,
  rawPayment,
} from './helpers';

const secretKey = () => orThrow(parseApiSecretKey('test_sk_abcdef'));
const reason = () => orThrow(cancelReason('고객 요청 환불'));

function settledTarget(): Extract<SettledCancelable, { readonly partialAllowed: true }> {
  const checked = orThrow(asCancelable(asPaymentFixture(rawPayment())));
  if (checked.kind !== 'settled' || !checked.partialAllowed) {
    throw new Error('부분취소 가능 settled 픽스처여야 한다');
  }
  return checked;
}

/** 취소 성공 응답 — lastTransactionKey가 이번 취소 건을 가리킨다. */
const canceledResponse = () =>
  rawPayment({
    status: 'CANCELED',
    balanceAmount: 0,
    cancels: [rawCancelTransaction()],
    lastTransactionKey: 'txn-cancel-1',
  });

function collect(events: TossEvents) {
  const executed: Array<TossEvent<'cancel.executed'>> = [];
  const failed: Array<TossEvent<'cancel.failed'>> = [];
  events.on('cancel.executed', (e) => {
    executed.push(e);
  });
  events.on('cancel.failed', (e) => {
    failed.push(e);
  });
  return { executed, failed };
}

describe("'cancel.executed' — Result Ok 확정 후 발화", () => {
  it('cancelFully 성공 → outcome(fullyCanceled/pending/idempotencyKey) 동봉 1회 발화', async () => {
    const events = createTossEvents();
    const { executed, failed } = collect(events);
    const { fetch } = mockFetch(() => ({ status: 200, body: canceledResponse() }));
    const client = createTossClient(secretKey(), { fetch, events });

    const r = await client.cancels.cancelFully(settledTarget(), {
      reason: reason(),
      expectedAmount: 1000,
    });

    expect(isOk(r)).toBe(true);
    expect(failed).toHaveLength(0);
    expect(executed).toHaveLength(1);
    expect(executed[0]?.type).toBe('cancel.executed');
    expect(executed[0]?.outcome.fullyCanceled).toBe(true);
    expect(executed[0]?.outcome.pending).toBe(false);
    if (!isOk(r)) throw new Error('Ok여야 한다');
    expect(executed[0]?.outcome).toBe(r.value); // 반환 outcome과 동일 값(재계산 없음)
  });

  it('cancelPartially 성공도 발화한다', async () => {
    const events = createTossEvents();
    const { executed } = collect(events);
    const { fetch } = mockFetch(() => ({
      status: 200,
      body: rawPayment({
        status: 'PARTIAL_CANCELED',
        balanceAmount: 500,
        cancels: [rawCancelTransaction({ cancelAmount: 500, refundableAmount: 500 })],
        lastTransactionKey: 'txn-cancel-1',
      }),
    }));
    const client = createTossClient(secretKey(), { fetch, events });

    const r = await client.cancels.cancelPartially(settledTarget(), {
      reason: reason(),
      amount: 500,
    });
    expect(isOk(r)).toBe(true);
    expect(executed).toHaveLength(1);
    expect(executed[0]?.outcome.fullyCanceled).toBe(false);
  });

  it('파사드 경유(config.events) — kit.client.cancels도 동일 버스로 발화(자동 배선)', async () => {
    const events = createTossEvents();
    const { executed } = collect(events);
    const { fetch } = mockFetch(() => ({ status: 200, body: canceledResponse() }));
    const kit = createTossPayments({ secretKey: secretKey(), client: { fetch }, events });

    const r = await kit.client.cancels.cancelFully(settledTarget(), {
      reason: reason(),
      expectedAmount: 1000,
    });
    expect(isOk(r)).toBe(true);
    expect(executed).toHaveLength(1);
  });
});

describe("'cancel.failed' — Result Err 확정 후 발화(paymentKey + error)", () => {
  it('토스 에러 응답 → paymentKey와 에러 원형 동봉', async () => {
    const events = createTossEvents();
    const { executed, failed } = collect(events);
    const { fetch } = mockFetch(() => ({
      status: 403,
      body: { code: 'NOT_CANCELABLE_AMOUNT', message: '취소 할 수 없는 금액 입니다.' },
    }));
    const client = createTossClient(secretKey(), { fetch, events });

    const r = await client.cancels.cancelFully(settledTarget(), {
      reason: reason(),
      expectedAmount: 1000,
    });

    expect(isErr(r)).toBe(true);
    expect(executed).toHaveLength(0);
    expect(failed).toHaveLength(1);
    expect(failed[0]?.paymentKey).toBe('tviva20260809abcdef');
    expect(failed[0]?.error).toMatchObject({ source: 'toss', code: 'NOT_CANCELABLE_AMOUNT' });
  });

  it('사전검증(preflight) Err도 발화한다 — API 미호출이어도 부수 반응 배선은 놓치지 않는다', async () => {
    const events = createTossEvents();
    const { failed } = collect(events);
    const { fetch, calls } = forbiddenFetch();
    const client = createTossClient(secretKey(), { fetch, events });

    const r = await client.cancels.cancelFully(settledTarget(), {
      reason: reason(),
      expectedAmount: 999, // 장부 기대 금액 불일치 — API 호출 전 Err
    });

    expect(isErr(r)).toBe(true);
    expect(calls).toHaveLength(0);
    expect(failed).toHaveLength(1);
    expect(failed[0]?.error).toMatchObject({ source: 'library', kind: 'expected-amount-mismatch' });
  });

  it('transport 실패 → cancel.failed, retry(티켓) 성공 → cancel.executed — 시퀀스 고정', async () => {
    const events = createTossEvents();
    const { executed, failed } = collect(events);
    const { fetch } = mockFetch((_call, index) => {
      if (index === 0) throw new Error('conn reset');
      return { status: 200, body: canceledResponse() };
    });
    const client = createTossClient(secretKey(), { fetch, events });

    const first = await client.cancels.cancelFully(settledTarget(), {
      reason: reason(),
      expectedAmount: 1000,
    });
    expect(isErr(first)).toBe(true);
    if (isOk(first) || first.error.source !== 'network') throw new Error('transport Err여야 한다');
    expect(failed).toHaveLength(1);

    const retried = await client.cancels.retry(first.error.retry);
    expect(isOk(retried)).toBe(true);
    expect(executed).toHaveLength(1);
    expect(failed).toHaveLength(1); // retry 성공이 failed를 추가 발화하지 않는다
  });
});

describe('격리·기본 꺼짐 계약', () => {
  it('핸들러 throw여도 취소 Result 불변(핸들러 격리는 이미터 소유)', async () => {
    const onHandlerError = vi.fn();
    const events = createTossEvents({ onHandlerError });
    events.on('cancel.executed', () => {
      throw new Error('handler-boom');
    });
    const { fetch } = mockFetch(() => ({ status: 200, body: canceledResponse() }));
    const client = createTossClient(secretKey(), { fetch, events });

    const r = await client.cancels.cancelFully(settledTarget(), {
      reason: reason(),
      expectedAmount: 1000,
    });
    expect(isOk(r)).toBe(true);
    expect(onHandlerError).toHaveBeenCalledTimes(1);
    expect(onHandlerError.mock.calls[0]?.[0]).toMatchObject({ type: 'cancel.executed' });
  });

  it('events 미주입 — 발행 지점 no-op(현행 동작 동일)', async () => {
    const { fetch } = mockFetch(() => ({ status: 200, body: canceledResponse() }));
    const client = createTossClient(secretKey(), { fetch });
    const r = await client.cancels.cancelFully(settledTarget(), {
      reason: reason(),
      expectedAmount: 1000,
    });
    expect(isOk(r)).toBe(true);
  });
});
