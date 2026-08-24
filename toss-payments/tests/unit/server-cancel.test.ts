import { describe, expect, it } from 'vitest';

import { cancelReason, cancelRequestId, isErr, isOk, orThrow, isTestKey } from '../../src/server';
import {
  asCancelable,
  createTossClient,
  parseApiSecretKey,
  refundAccount,
  type CancelRetryTicket,
  type CancelRetryStore,
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
import { memoryCancelRetryStore } from '../../src/testing';
import { DEFAULT_IDEMPOTENCY_REPLAY_WINDOW_MS, TOSS_IDEMPOTENCY_KEY_TTL_MS } from '../../src/index';

function testClient(fetchImpl: typeof fetch, cancelRetries?: CancelRetryStore) {
  const parsed = orThrow(parseApiSecretKey('test_sk_abcdef'));
  if (!isTestKey(parsed)) throw new Error('test 키여야 한다');
  return createTossClient(parsed, {
    fetch: fetchImpl,
    ...(cancelRetries ? { cancelRetries } : {}),
  });
}

const reason = () => orThrow(cancelReason('고객 요청 환불'));

function settledTarget(
  overrides: Record<string, unknown> = {},
): Extract<SettledCancelable, { readonly partialAllowed: true }> {
  const checked = orThrow(asCancelable(asPaymentFixture(rawPayment(overrides))));
  if (checked.kind !== 'settled' || !checked.partialAllowed) {
    throw new Error('부분취소 가능 settled 픽스처여야 한다');
  }
  return checked;
}

function vaTarget(
  overrides: Record<string, unknown> = {},
): Extract<DepositedVaCancelable, { readonly partialAllowed: true }> {
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
  if (checked.kind !== 'deposited-virtual-account' || !checked.partialAllowed) {
    throw new Error('부분취소 가능 VA 픽스처여야 한다');
  }
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
      asPaymentFixture(
        rawPayment({
          status: 'PARTIAL_CANCELED',
          balanceAmount: 700,
          cancels: [rawCancelTransaction({ cancelAmount: 300, refundableAmount: 700 })],
        }),
      ),
    );
    expect(isOk(partial)).toBe(true);
    // 단일 전액 취소 후 CANCELED → already-fully-canceled
    const canceled = asCancelable(
      asPaymentFixture(rawPayment({ status: 'CANCELED', balanceAmount: 0 })),
    );
    expect(isErr(canceled)).toBe(true);
  });

  it('status·잔액·취소 이력이 모순이면 cancelable을 만들지 않는다', () => {
    const canceledWithBalance = asCancelable(
      asPaymentFixture(rawPayment({ status: 'CANCELED', balanceAmount: 100 })),
    );
    expect(
      !canceledWithBalance.ok && canceledWithBalance.error.kind === 'inconsistent-payment-state'
        ? canceledWithBalance.error.reason
        : null,
    ).toBe('canceled-status-with-balance');

    for (const cancels of [null, [rawCancelTransaction()]] as const) {
      const zeroDone = asCancelable(
        asPaymentFixture(rawPayment({ status: 'DONE', balanceAmount: 0, cancels })),
      );
      expect(
        !zeroDone.ok && zeroDone.error.kind === 'inconsistent-payment-state'
          ? zeroDone.error.reason
          : null,
      ).toBe('zero-balance-with-non-canceled-status');
    }

    const partialWithoutHistory = asCancelable(
      asPaymentFixture(
        rawPayment({ status: 'PARTIAL_CANCELED', balanceAmount: 700, cancels: null }),
      ),
    );
    expect(
      !partialWithoutHistory.ok && partialWithoutHistory.error.kind === 'inconsistent-payment-state'
        ? partialWithoutHistory.error.reason
        : null,
    ).toBe('cancellation-status-without-history');

    const completedWithDoneStatus = asCancelable(
      asPaymentFixture(
        rawPayment({
          status: 'DONE',
          balanceAmount: 700,
          cancels: [rawCancelTransaction({ cancelAmount: 300, refundableAmount: 700 })],
        }),
      ),
    );
    expect(
      !completedWithDoneStatus.ok &&
        completedWithDoneStatus.error.kind === 'inconsistent-payment-state'
        ? completedWithDoneStatus.error.reason
        : null,
    ).toBe('completed-cancel-status-mismatch');

    const excessiveBalance = asCancelable(
      asPaymentFixture(rawPayment({ status: 'DONE', totalAmount: 1000, balanceAmount: 1200 })),
    );
    expect(
      !excessiveBalance.ok && excessiveBalance.error.kind === 'inconsistent-payment-state'
        ? excessiveBalance.error.reason
        : null,
    ).toBe('balance-exceeds-total');

    const partialWithoutReducedBalance = asCancelable(
      asPaymentFixture(
        rawPayment({
          status: 'PARTIAL_CANCELED',
          totalAmount: 1000,
          balanceAmount: 1000,
          cancels: [rawCancelTransaction({ cancelAmount: 100, refundableAmount: 1000 })],
        }),
      ),
    );
    expect(
      !partialWithoutReducedBalance.ok &&
        partialWithoutReducedBalance.error.kind === 'inconsistent-payment-state'
        ? partialWithoutReducedBalance.error.reason
        : null,
    ).toBe('partial-status-without-canceled-amount');

    const abortedOnly = asCancelable(
      asPaymentFixture(
        rawPayment({
          status: 'PARTIAL_CANCELED',
          balanceAmount: 700,
          cancels: [
            rawCancelTransaction({
              cancelAmount: 300,
              refundableAmount: 700,
              cancelStatus: 'ABORTED',
            }),
          ],
        }),
      ),
    );
    expect(
      !abortedOnly.ok && abortedOnly.error.kind === 'inconsistent-payment-state'
        ? abortedOnly.error.reason
        : null,
    ).toBe('partial-status-without-effective-cancellation');
  });

  it('진행 중인 provider 취소가 있으면 status와 무관하게 추가 취소를 차단한다', () => {
    const result = asCancelable(
      asPaymentFixture(
        rawPayment({
          status: 'PARTIAL_CANCELED',
          balanceAmount: 700,
          cancels: [
            rawCancelTransaction({
              transactionKey: 'pending-cancel-1',
              cancelAmount: 300,
              refundableAmount: 700,
              cancelStatus: 'IN_PROGRESS',
            }),
          ],
        }),
      ),
    );

    expect(result).toEqual({
      ok: false,
      error: {
        source: 'library',
        kind: 'pending-cancellation',
        paymentKey: 'tviva20260809abcdef',
        status: 'PARTIAL_CANCELED',
        transactionKeys: ['pending-cancel-1'],
      },
    });

    const zeroDonePending = asCancelable(
      asPaymentFixture(
        rawPayment({
          status: 'DONE',
          balanceAmount: 0,
          cancels: [rawCancelTransaction({ cancelStatus: 'IN_PROGRESS' })],
        }),
      ),
    );
    expect(!zeroDonePending.ok && zeroDonePending.error.kind).toBe('pending-cancellation');
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

  it('isPartialCancelable=false는 부분취소를 요청 전 차단한다', async () => {
    const pair = forbiddenFetch();
    const client = testClient(pair.fetch);
    const target = orThrow(
      asCancelable(asPaymentFixture(rawPayment({ isPartialCancelable: false }))),
    );
    if (target.kind !== 'settled') return expect.unreachable('settled여야 한다');
    const r = await client.cancels.cancelPartially(target as never, {
      reason: reason(),
      amount: 100,
    });
    expect(isErr(r)).toBe(true);
    if (isErr(r) && 'kind' in r.error) expect(r.error.kind).toBe('partial-cancel-not-allowed');
    expect(pair.calls).toHaveLength(0);
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

  it('cancelRequestId 지정 시 body에 전송된다 (중국·동남아 비동기 취소 필수 파라미터)', async () => {
    const pair = mockFetch(() => ({
      status: 200,
      body: rawPayment({
        status: 'PARTIAL_CANCELED',
        balanceAmount: 900,
        lastTransactionKey: 'txn-cancel-1',
        cancels: [rawCancelTransaction({ cancelAmount: 100, cancelRequestId: 'my-cancel-req-000001' })],
      }),
    }));
    const client = testClient(pair.fetch);
    const r = await client.cancels.cancelPartially(settledTarget(), {
      reason: reason(),
      amount: 100,
      cancelRequestId: orThrow(cancelRequestId('my-cancel-req-000001')),
    });
    expect(isOk(r)).toBe(true);
    const body = JSON.parse(pair.calls[0]?.body ?? '{}') as Record<string, unknown>;
    expect(body['cancelRequestId']).toBe('my-cancel-req-000001');
  });

  it('cancelRequestId 미지정 시 body에 실리지 않는다', async () => {
    const pair = mockFetch(() => ({ status: 200, body: successBody() }));
    const client = testClient(pair.fetch);
    await client.cancels.cancelFully(settledTarget(), { reason: reason(), expectedAmount: 1000 });
    const body = JSON.parse(pair.calls[0]?.body ?? '{}') as Record<string, unknown>;
    expect('cancelRequestId' in body).toBe(false);
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
    const r = await client.cancels.cancelFully(
      settledTarget({
        status: 'PARTIAL_CANCELED',
        balanceAmount: 700,
        cancels: [rawCancelTransaction({ cancelAmount: 300, refundableAmount: 700 })],
      }),
      {
        reason: reason(),
        expectedAmount: 700,
      },
    );
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

  it('cancelStatus ABORTED는 성공 outcome이 아니라 명시적 library 실패다', async () => {
    const pair = mockFetch(() => ({
      status: 200,
      body: rawPayment({
        // 비동기 취소가 거부되면 결제 status/잔액은 원래 상태로 복구될 수 있다.
        status: 'DONE',
        balanceAmount: 1000,
        lastTransactionKey: 'txn-cancel-aborted',
        cancels: [
          rawCancelTransaction({
            transactionKey: 'txn-cancel-aborted',
            cancelStatus: 'ABORTED',
            cancelRequestId: 'cr-aborted-1',
          }),
        ],
      }),
    }));

    const result = await testClient(pair.fetch).cancels.cancelFully(settledTarget(), {
      reason: reason(),
      expectedAmount: 1000,
    });

    expect(result).toEqual({
      ok: false,
      error: {
        source: 'library',
        kind: 'cancel-aborted',
        paymentKey: 'tviva20260809abcdef',
        transactionKey: 'txn-cancel-aborted',
        cancelRequestId: 'cr-aborted-1',
      },
    });
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
  it('영속 store는 요청 전에 저장하고 확정 성공 뒤 record를 제거한다', async () => {
    const operations: string[] = [];
    const retryStore: CancelRetryStore = {
      save: () => {
        operations.push('save');
        return Promise.resolve();
      },
      load: () => Promise.resolve(null),
      delete: () => {
        operations.push('delete');
        return Promise.resolve();
      },
    };
    const pair = mockFetch(() => {
      operations.push('fetch');
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

    const result = await testClient(pair.fetch, retryStore).cancels.cancelFully(settledTarget(), {
      reason: reason(),
      expectedAmount: 1000,
    });

    expect(isOk(result)).toBe(true);
    expect(operations).toEqual(['save', 'fetch', 'delete']);
  });

  it('영속 store 저장 실패는 fail-closed — Toss 요청을 보내지 않는다', async () => {
    const retryStore: CancelRetryStore = {
      save: () => Promise.reject(new Error('database unavailable')),
      load: () => Promise.resolve(null),
      delete: () => Promise.resolve(),
    };
    const pair = forbiddenFetch();

    const result = await testClient(pair.fetch, retryStore).cancels.cancelFully(settledTarget(), {
      reason: reason(),
      expectedAmount: 1000,
    });

    expect(isErr(result)).toBe(true);
    if (isErr(result) && result.error.source === 'library') {
      expect(result.error.kind).toBe('retry-store-failure');
      if (result.error.kind === 'retry-store-failure') expect(result.error.operation).toBe('save');
    } else {
      expect.unreachable('retry-store-failure여야 한다');
    }
    expect(pair.calls).toHaveLength(0);
  });

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

  it('게이트웨이 504 + HTML body → source network + retry 티켓 — 응답 유실을 같은 멱등키로 회수', async () => {
    // mockFetch는 body를 JSON.stringify하므로 HTML 원문 응답은 fetch를 직접 구현한다
    const recorded: { headers: Record<string, string>; body: string | null }[] = [];
    const fetchImpl = (async (_url: unknown, init?: RequestInit) => {
      const headers: Record<string, string> = {};
      new Headers(init?.headers).forEach((value, key) => {
        headers[key.toLowerCase()] = value;
      });
      recorded.push({ headers, body: typeof init?.body === 'string' ? init.body : null });
      if (recorded.length === 1) {
        return new Response('<html><body>504 Gateway Time-out</body></html>', { status: 504 });
      }
      return new Response(
        JSON.stringify(
          rawPayment({
            status: 'CANCELED',
            balanceAmount: 0,
            lastTransactionKey: 'txn-cancel-1',
            cancels: [rawCancelTransaction()],
          }),
        ),
        { status: 200 },
      );
    }) as typeof fetch;

    const client = testClient(fetchImpl);
    const first = await client.cancels.cancelFully(settledTarget(), {
      reason: reason(),
      expectedAmount: 1000,
    });
    expect(isErr(first)).toBe(true);
    if (!isErr(first) || !('source' in first.error) || first.error.source !== 'network') {
      return expect.unreachable('게이트웨이 응답은 toss가 아닌 network 실패여야 한다');
    }
    expect(first.error.retryable).toBe(true);
    expect(String((first.error.cause as Error).message)).toContain('HTTP 504');
    if (!('retry' in first.error)) {
      return expect.unreachable('응답 유실 회수용 retry 티켓이 동봉돼야 한다');
    }

    const second = await client.cancels.retry(first.error.retry);
    expect(isOk(second)).toBe(true);
    expect(recorded.length).toBe(2);
    expect(recorded[1]?.headers['idempotency-key']).toBe(recorded[0]?.headers['idempotency-key']);
    expect(recorded[1]?.body).toBe(recorded[0]?.body);
  });

  it('게이트웨이 502 + 빈 body → source network + retry 티켓 (UNKNOWN_ERROR/toss 오분류 금지)', async () => {
    const pair = mockFetch(() => ({ status: 502 })); // 빈 본문
    const client = testClient(pair.fetch);
    const r = await client.cancels.cancelFully(settledTarget(), {
      reason: reason(),
      expectedAmount: 1000,
    });
    expect(isErr(r)).toBe(true);
    if (isErr(r) && 'source' in r.error && r.error.source === 'network') {
      expect(r.error.retryable).toBe(true);
      expect('retry' in r.error).toBe(true);
    } else {
      expect.unreachable('network 실패 + retry 티켓이어야 한다');
    }
  });

  it('진짜 토스 5xx({code,message} JSON)는 여전히 toss 분류 — 티켓 없음', async () => {
    const pair = mockFetch(() => ({
      status: 500,
      body: { code: 'FAILED_INTERNAL_SYSTEM_PROCESSING', message: '내부 시스템 처리 작업이 실패했습니다.' },
    }));
    const client = testClient(pair.fetch);
    const r = await client.cancels.cancelFully(settledTarget(), {
      reason: reason(),
      expectedAmount: 1000,
    });
    expect(isErr(r)).toBe(true);
    if (isErr(r) && 'source' in r.error && r.error.source === 'toss') {
      expect(r.error.code).toBe('FAILED_INTERNAL_SYSTEM_PROCESSING');
      expect('retry' in r.error).toBe(false);
    } else {
      expect.unreachable('toss 실패여야 한다');
    }
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

  it('영속 store + opaque ticketId로 프로세스 재시작 후에도 동일 body·멱등키를 재실행한다', async () => {
    const retryStore = memoryCancelRetryStore();
    let attempt = 0;
    const pair = mockFetch(() => {
      attempt += 1;
      if (attempt === 1) throw new Error('connection reset');
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
    const firstClient = testClient(pair.fetch, retryStore);
    const failed = await firstClient.cancels.cancelFully(settledTarget(), {
      reason: reason(),
      expectedAmount: 1000,
    });
    if (!isErr(failed) || !('retry' in failed.error)) {
      return expect.unreachable('retry 티켓이 필요하다');
    }
    expect(failed.error.retry.durable).toBe(true);
    const ticketId = failed.error.retry.ticketId;

    // 새 클라이언트 = 프로세스 재시작 시뮬레이션. 인메모리 봉인은 전달하지 않는다.
    const restartedClient = testClient(pair.fetch, retryStore);
    const retried = await restartedClient.cancels.retryById(ticketId);
    expect(isOk(retried)).toBe(true);
    expect(pair.calls[1]?.body).toBe(pair.calls[0]?.body);
    expect(pair.calls[1]?.headers['idempotency-key']).toBe(
      pair.calls[0]?.headers['idempotency-key'],
    );
    expect(await retryStore.load(ticketId)).toBeNull();
  });

  it('영속 record의 path/body/금액 불변식이 깨졌으면 API 호출 전에 거부한다', async () => {
    const retryStore: CancelRetryStore = {
      save: () => Promise.resolve(),
      load: () =>
        Promise.resolve({
          ticketId: 'tampered-ticket',
          paymentKey: 'tviva20260809abcdef',
          idempotencyKey: 'retry-corrupt-idem',
          issuedAt: new Date().toISOString(),
          path: '/v1/billing/should-never-be-called',
          bodyJson: JSON.stringify({ cancelReason: '고객 요청 환불' }),
          testCode: undefined,
          expectedCancelAmount: 1000,
          previousBalanceAmount: 1000,
        }),
      delete: () => Promise.resolve(),
    };
    const { fetch, calls } = forbiddenFetch();
    const r = await testClient(fetch, retryStore).cancels.retryById('tampered-ticket');
    expect(isErr(r)).toBe(true);
    if (isErr(r) && r.error.source === 'library') {
      expect(r.error.kind).toBe('invalid-input');
    }
    expect(calls).toHaveLength(0);
  });

  it('재생 창(DEFAULT_IDEMPOTENCY_REPLAY_WINDOW_MS = 14일)이 지난 retry 티켓은 API 호출 전 거부한다', async () => {
    const { fetch, calls } = failingFetch(new Error('down'));
    const client = testClient(fetch);
    const failed = await client.cancels.cancelFully(settledTarget(), {
      reason: reason(),
      expectedAmount: 1000,
    });
    if (!isErr(failed) || !('retry' in failed.error)) return expect.unreachable('retry 티켓 필요');
    for (const ageMs of [
      DEFAULT_IDEMPOTENCY_REPLAY_WINDOW_MS + 60_000, // 14일 + 1분 — 창 밖
      TOSS_IDEMPOTENCY_KEY_TTL_MS - 60_000, // 14일 23시간 59분 — 이전 설계(15일)에서는 재전송되던 구간
      16 * 24 * 60 * 60 * 1000,
    ]) {
      const expired = {
        ...failed.error.retry,
        issuedAt: new Date(Date.now() - ageMs).toISOString(),
      } as CancelRetryTicket;
      const r = await client.cancels.retry(expired);
      expect(isErr(r)).toBe(true);
      if (isErr(r) && 'kind' in r.error) expect(r.error.kind, String(ageMs)).toBe('retry-ticket-expired');
    }
    expect(calls).toHaveLength(1);
  });

  it('재생 창 경계 — 영속 티켓 14일 - 1분은 같은 멱등키로 재전송, 14일 + 1분은 API 호출 없이 만료', async () => {
    const canceledBody = () =>
      rawPayment({
        status: 'CANCELED',
        balanceAmount: 0,
        lastTransactionKey: 'txn-cancel-1',
        cancels: [rawCancelTransaction()],
      });
    const ageRecord = async (store: CancelRetryStore, ticketId: string, ageMs: number) => {
      const record = await store.load(ticketId);
      if (record === null) return expect.unreachable('영속 record가 있어야 한다');
      await store.save({ ...record, issuedAt: new Date(Date.now() - ageMs).toISOString() });
    };

    // 안: 14일 - 1분
    {
      const retryStore = memoryCancelRetryStore();
      let attempt = 0;
      const pair = mockFetch(() => {
        attempt += 1;
        if (attempt === 1) throw new Error('connection reset');
        return { status: 200, body: canceledBody() };
      });
      const failed = await testClient(pair.fetch, retryStore).cancels.cancelFully(settledTarget(), {
        reason: reason(),
        expectedAmount: 1000,
      });
      if (!isErr(failed) || !('retry' in failed.error)) return expect.unreachable('retry 티켓 필요');
      await ageRecord(retryStore, failed.error.retry.ticketId, DEFAULT_IDEMPOTENCY_REPLAY_WINDOW_MS - 60_000);
      const retried = await testClient(pair.fetch, retryStore).cancels.retryById(failed.error.retry.ticketId);
      expect(isOk(retried)).toBe(true);
      expect(pair.calls).toHaveLength(2);
      expect(pair.calls[1]?.headers['idempotency-key']).toBe(pair.calls[0]?.headers['idempotency-key']);
    }

    // 밖: 14일 + 1분 — 이전 설계(provider TTL 15일 그대로)에서는 재전송되던 구간
    {
      const retryStore = memoryCancelRetryStore();
      const pair = failingFetch(new Error('down'));
      const failed = await testClient(pair.fetch, retryStore).cancels.cancelFully(settledTarget(), {
        reason: reason(),
        expectedAmount: 1000,
      });
      if (!isErr(failed) || !('retry' in failed.error)) return expect.unreachable('retry 티켓 필요');
      await ageRecord(retryStore, failed.error.retry.ticketId, DEFAULT_IDEMPOTENCY_REPLAY_WINDOW_MS + 60_000);
      const r = await testClient(pair.fetch, retryStore).cancels.retryById(failed.error.retry.ticketId);
      expect(isErr(r)).toBe(true);
      if (isErr(r) && 'kind' in r.error) expect(r.error.kind).toBe('retry-ticket-expired');
      expect(pair.calls).toHaveLength(1);
    }
  });
});
