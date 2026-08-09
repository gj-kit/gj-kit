import { describe, expect, it } from 'vitest';

import { cancelReason, isErr, isOk, orThrow, isTestKey } from '../../src/server';
import {
  asCancelable,
  createTossClient,
  parseApiSecretKey,
  refundAccount,
  type CancelRetryTicket,
  type DepositedVaCancelable,
  type SettledCancelable,
} from '../../src/server';
import {
  asPaymentFixture,
  failingFetch,
  forbiddenFetch,
  mockFetch,
  rawCancelTransaction,
  rawPayment,
} from './helpers';

function testClient(fetchImpl: typeof fetch) {
  const parsed = orThrow(parseApiSecretKey('test_sk_abcdef'));
  if (!isTestKey(parsed)) throw new Error('test 키여야 한다');
  return createTossClient(parsed, { fetch: fetchImpl });
}

const reason = () => orThrow(cancelReason('고객 요청 환불'));

function settledTarget(overrides: Record<string, unknown> = {}): SettledCancelable {
  const checked = orThrow(asCancelable(asPaymentFixture(rawPayment(overrides))));
  if (checked.kind !== 'settled') throw new Error('settled 픽스처여야 한다');
  return checked;
}

function vaTarget(overrides: Record<string, unknown> = {}): DepositedVaCancelable {
  const checked = orThrow(
    asCancelable(
      asPaymentFixture(
        rawPayment({
          method: '가상계좌',
          secret: 'vs-1',
          card: null,
          virtualAccount: { accountNumber: '1', bankCode: '88' },
          ...overrides,
        }),
      ),
    ),
  );
  if (checked.kind !== 'deposited-virtual-account') throw new Error('VA 픽스처여야 한다');
  return checked;
}

describe('asCancelable — 3-변형 판별 + 잔액 기준 완전 취소 판정', () => {
  it('DONE 카드 → settled / 가상계좌 DONE → deposited-virtual-account / 입금 대기 → awaiting-deposit', () => {
    expect(settledTarget().kind).toBe('settled');
    expect(vaTarget().kind).toBe('deposited-virtual-account');
    const awaiting = orThrow(
      asCancelable(asPaymentFixture(rawPayment({ status: 'WAITING_FOR_DEPOSIT' }))),
    );
    expect(awaiting.kind).toBe('awaiting-deposit');
  });

  it('READY 등 취소 불가 상태 → not-cancelable-status', () => {
    const r = asCancelable(asPaymentFixture(rawPayment({ status: 'READY' })));
    expect(isErr(r)).toBe(true);
    if (isErr(r) && r.error.kind === 'not-cancelable-status') expect(r.error.status).toBe('READY');
    else expect.unreachable('not-cancelable-status여야 한다');
  });

  it('balanceAmount 0이면 status가 PARTIAL_CANCELED여도 already-fully-canceled (실측)', () => {
    const r = asCancelable(
      asPaymentFixture(rawPayment({ status: 'PARTIAL_CANCELED', balanceAmount: 0 })),
    );
    expect(isErr(r)).toBe(true);
    if (isErr(r) && r.error.kind === 'already-fully-canceled') {
      expect(r.error.status).toBe('PARTIAL_CANCELED');
    } else {
      expect.unreachable('already-fully-canceled여야 한다');
    }
    // 부분취소 이력 + 잔액 있음 → 여전히 취소 가능
    const partial = asCancelable(
      asPaymentFixture(rawPayment({ status: 'PARTIAL_CANCELED', balanceAmount: 700 })),
    );
    expect(isOk(partial)).toBe(true);
    // 단일 전액 취소 후 CANCELED → already-fully-canceled
    const canceled = asCancelable(
      asPaymentFixture(rawPayment({ status: 'CANCELED', balanceAmount: 0 })),
    );
    expect(isErr(canceled)).toBe(true);
  });
});

describe('refundAccount 스마트 생성자', () => {
  it('bank(코드)/accountNumber(≤20 숫자만)/holderName(≤60) 검증', () => {
    expect(isOk(refundAccount({ bank: '88', accountNumber: '1234567890', holderName: '홍길동' }))).toBe(true);
    const hyphen = refundAccount({ bank: '88', accountNumber: '123-456', holderName: '홍길동' });
    if (isErr(hyphen)) expect(hyphen.error.reason).toBe('bad-charset');
    else expect.unreachable('하이픈은 거부');
    const long = refundAccount({ bank: '88', accountNumber: '1'.repeat(21), holderName: '홍길동' });
    if (isErr(long)) expect(long.error.reason).toBe('too-long');
    else expect.unreachable('21자는 거부');
  });
});

describe('cancels — 사전검증(preflight)은 API 호출 전에 실패한다', () => {
  it('expectedAmount ≠ balanceAmount → Err, fetch 0회', async () => {
    const pair = forbiddenFetch();
    const client = testClient(pair.fetch);
    const r = await client.cancels.cancelFully(settledTarget(), {
      reason: reason(),
      expectedAmount: 900, // 장부 기대 금액이 서버 잔액(1000)과 다름
    });
    expect(isErr(r)).toBe(true);
    if (isErr(r) && 'kind' in r.error && r.error.kind === 'expected-amount-mismatch') {
      expect(r.error.expected).toBe(900);
      expect(r.error.actual).toBe(1000);
    } else {
      expect.unreachable('expected-amount-mismatch여야 한다');
    }
    expect(pair.calls.length).toBe(0);
  });

  it('cancelAmount > balanceAmount → Err(amount-exceeds-balance), fetch 0회', async () => {
    const pair = forbiddenFetch();
    const client = testClient(pair.fetch);
    const r = await client.cancels.cancelPartially(settledTarget(), {
      reason: reason(),
      amount: 2000,
    });
    expect(isErr(r)).toBe(true);
    if (isErr(r) && 'kind' in r.error && r.error.kind === 'amount-exceeds-balance') {
      expect(r.error.cancelAmount).toBe(2000);
      expect(r.error.balanceAmount).toBe(1000);
    } else {
      expect.unreachable('amount-exceeds-balance여야 한다');
    }
    expect(pair.calls.length).toBe(0);
  });
});

describe('cancels — 요청 형식', () => {
  const successBody = () =>
    rawPayment({
      status: 'CANCELED',
      balanceAmount: 0,
      lastTransactionKey: 'txn-cancel-1',
      cancels: [rawCancelTransaction()],
    });

  it('refundableAmount는 항상 자동 전송(= 조회 시점 balanceAmount), 전액은 cancelAmount 미전송', async () => {
    const pair = mockFetch(() => ({ status: 200, body: successBody() }));
    const client = testClient(pair.fetch);
    const r = await client.cancels.cancelFully(settledTarget(), {
      reason: reason(),
      expectedAmount: 1000,
    });
    expect(isOk(r)).toBe(true);

    const body = JSON.parse(pair.calls[0]?.body ?? '{}') as Record<string, unknown>;
    expect(body['refundableAmount']).toBe(1000);
    expect(body['cancelReason']).toBe('고객 요청 환불');
    expect(body['cancelAmount']).toBeUndefined();
    expect(pair.calls[0]?.url).toBe(
      'https://api.tosspayments.com/v1/payments/tviva20260809abcdef/cancel',
    );
  });

  it('부분취소는 cancelAmount 전송, 가상계좌는 refundReceiveAccount(bank 필드명) 전송', async () => {
    const pair = mockFetch(() => ({
      status: 200,
      body: rawPayment({
        status: 'PARTIAL_CANCELED',
        balanceAmount: 700,
        method: '가상계좌',
        secret: 'vs-1',
        lastTransactionKey: 'txn-cancel-1',
        cancels: [rawCancelTransaction({ cancelAmount: 300 })],
      }),
    }));
    const client = testClient(pair.fetch);
    const account = orThrow(
      refundAccount({ bank: '88', accountNumber: '1234567890', holderName: '홍길동' }),
    );
    const r = await client.cancels.cancelPartially(vaTarget(), {
      reason: reason(),
      amount: 300,
      refundAccount: account,
    });
    expect(isOk(r)).toBe(true);

    const body = JSON.parse(pair.calls[0]?.body ?? '{}') as Record<string, unknown>;
    expect(body['cancelAmount']).toBe(300);
    expect(body['refundReceiveAccount']).toEqual({
      bank: '88',
      accountNumber: '1234567890',
      holderName: '홍길동',
    });
  });

  it('멱등키 미지정 시 자동 생성 — 헤더 부착 + outcome에 실제 사용 키 반환', async () => {
    const pair = mockFetch(() => ({ status: 200, body: successBody() }));
    const client = testClient(pair.fetch);
    const r = await client.cancels.cancelFully(settledTarget(), {
      reason: reason(),
      expectedAmount: 1000,
    });
    if (!r.ok) return expect.unreachable('성공해야 한다');
    const sent = pair.calls[0]?.headers['idempotency-key'];
    expect(sent).toBeDefined();
    expect(r.value.idempotencyKey).toBe(sent);
  });

  it('testCode는 TossPayments-Test-Code 헤더로 전송된다', async () => {
    const pair = mockFetch(() => ({ status: 200, body: successBody() }));
    const client = testClient(pair.fetch);
    await client.cancels.cancelFully(
      settledTarget(),
      { reason: reason(), expectedAmount: 1000 },
      { testCode: 'REFUND_REJECTED' },
    );
    expect(pair.calls[0]?.headers['tosspayments-test-code']).toBe('REFUND_REJECTED');
  });
});

describe('cancels — 결과 해석', () => {
  it('fullyCanceled는 balanceAmount === 0 판정 — status PARTIAL_CANCELED여도 true (실측)', async () => {
    const pair = mockFetch(() => ({
      status: 200,
      body: rawPayment({
        status: 'PARTIAL_CANCELED', // 부분취소 이력 → 잔액 전액 취소 후에도 유지
        balanceAmount: 0,
        lastTransactionKey: 'txn-cancel-1',
        cancels: [rawCancelTransaction({ cancelAmount: 700 })],
      }),
    }));
    const client = testClient(pair.fetch);
    const r = await client.cancels.cancelFully(settledTarget({ status: 'PARTIAL_CANCELED', balanceAmount: 700 }), {
      reason: reason(),
      expectedAmount: 700,
    });
    if (!r.ok) return expect.unreachable('성공해야 한다');
    expect(r.value.fullyCanceled).toBe(true);
    expect(r.value.payment.status).toBe('PARTIAL_CANCELED');
    expect(r.value.pending).toBe(false);
  });

  it('cancelStatus IN_PROGRESS(해외 비동기) → pending true', async () => {
    const pair = mockFetch(() => ({
      status: 200,
      body: rawPayment({
        status: 'CANCELED',
        balanceAmount: 0,
        lastTransactionKey: 'txn-cancel-1',
        cancels: [rawCancelTransaction({ cancelStatus: 'IN_PROGRESS', cancelRequestId: 'cr-1' })],
      }),
    }));
    const client = testClient(pair.fetch);
    const r = await client.cancels.cancelFully(settledTarget(), {
      reason: reason(),
      expectedAmount: 1000,
    });
    if (!r.ok) return expect.unreachable('성공해야 한다');
    expect(r.value.pending).toBe(true);
  });

  it('toss 에러는 retry 티켓 없이 코드 테이블 매핑 (403 NOT_CANCELABLE_AMOUNT → AMOUNT)', async () => {
    const pair = mockFetch(() => ({
      status: 403,
      body: { code: 'NOT_CANCELABLE_AMOUNT', message: '취소 할 수 없는 금액 입니다.' },
    }));
    const client = testClient(pair.fetch);
    const r = await client.cancels.cancelFully(settledTarget(), {
      reason: reason(),
      expectedAmount: 1000,
    });
    expect(isErr(r)).toBe(true);
    if (isErr(r) && 'source' in r.error && r.error.source === 'toss') {
      expect(r.error.category).toBe('AMOUNT');
      expect(r.error.retryable).toBe(false);
      expect('retry' in r.error).toBe(false);
    } else {
      expect.unreachable('toss 실패여야 한다');
    }
  });
});

describe('cancels — transport 실패 봉인 티켓 재시도', () => {
  it('전송 실패 → retry 티켓 동봉, retry는 같은 멱등키 + 바이트 동일 body를 재전송한다', async () => {
    let failFirst = true;
    const pair = mockFetch(() => {
      if (failFirst) {
        failFirst = false;
        throw new Error('socket hang up');
      }
      return {
        status: 200,
        body: rawPayment({
          status: 'CANCELED',
          balanceAmount: 0,
          lastTransactionKey: 'txn-cancel-1',
          cancels: [rawCancelTransaction()],
        }),
      };
    });
    const client = testClient(pair.fetch);
    const first = await client.cancels.cancelFully(settledTarget(), {
      reason: reason(),
      expectedAmount: 1000,
    });
    expect(isErr(first)).toBe(true);
    if (!isErr(first) || !('retry' in first.error)) {
      return expect.unreachable('retry 티켓이 동봉된 transport 실패여야 한다');
    }
    const ticket = first.error.retry;
    expect(ticket.idempotencyKey).toBe(pair.calls[0]?.headers['idempotency-key']);

    // 봉인은 직렬화/열거에 새지 않는다
    expect(JSON.stringify(ticket)).not.toContain('cancelReason');

    const second = await client.cancels.retry(ticket);
    expect(isOk(second)).toBe(true);
    expect(pair.calls.length).toBe(2);
    // 바이트 대조 — 멱등 판정에 body가 없으므로(실측) 동일성은 봉인이 보장한다
    expect(pair.calls[1]?.body).toBe(pair.calls[0]?.body);
    expect(pair.calls[1]?.headers['idempotency-key']).toBe(
      pair.calls[0]?.headers['idempotency-key'],
    );
    if (second.ok) expect(second.value.idempotencyKey).toBe(ticket.idempotencyKey);
  });

  it('스프레드 복제 티켓(봉인 소실)은 재실행 거부 — 명시적 Err', async () => {
    const { fetch } = failingFetch(new Error('down'));
    const client = testClient(fetch);
    const first = await client.cancels.cancelFully(settledTarget(), {
      reason: reason(),
      expectedAmount: 1000,
    });
    if (!isErr(first) || !('retry' in first.error)) {
      return expect.unreachable('retry 티켓이 동봉돼야 한다');
    }
    const cloned = { ...first.error.retry } as CancelRetryTicket; // 봉인(비열거 심볼) 소실
    const r = await client.cancels.retry(cloned);
    expect(isErr(r)).toBe(true);
    if (isErr(r) && 'kind' in r.error && r.error.kind === 'invalid-input')
      expect(r.error.field).toBe('ticket');
    else expect.unreachable('invalid-input(ticket)이어야 한다');
  });
});
