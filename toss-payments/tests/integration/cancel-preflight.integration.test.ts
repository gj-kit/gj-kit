/**
 * 시나리오 2 + 3 — 취소 사전검증(라이브러리)이 API 호출 **전에** 막는다는 것을
 * 라이브로 증명한다: fetch 스파이가 아니라 서버 잔액 불변으로 검증.
 *
 * 두 테스트 모두 결제를 변형하지 않으므로(사전검증 Err / 서버 403) 결제 하나를
 * 공유한다 — 캐시 픽스처라 어느 테스트가 먼저 돌든 단독 실행 가능.
 */
import { afterAll, describe, expect, it } from 'vitest';

import { asCancelable, classifyTossErrorCode } from '../../src/server';
import type { SettledCancelable } from '../../src/server';
import type { PaidBillingFixture } from './helpers';
import {
  createIntegrationContext,
  createPaidBillingPayment,
  expectErr,
  expectOk,
  loadSettledTarget,
  pace,
  rawTossRequest,
  testCancelReason,
  tossFailureFromRaw,
} from './helpers';

const TOTAL = 1000;

const ctx = createIntegrationContext();
afterAll(() => ctx.cleanup(), 60_000);

interface PreflightFixture {
  readonly fixture: PaidBillingFixture;
  /** 잔액 1000의 취소 대상 — 이 파일의 테스트들은 잔액을 바꾸지 않는다. */
  readonly target: SettledCancelable;
}

let cached: Promise<PreflightFixture> | null = null;

function loadFixture(): Promise<PreflightFixture> {
  cached ??= (async (): Promise<PreflightFixture> => {
    const fixture = await createPaidBillingPayment(ctx, TOTAL);
    const target = await loadSettledTarget(ctx, fixture.payment.paymentKey, '사전검증 픽스처');
    return { fixture, target };
  })();
  return cached;
}

/** 서버 잔액이 그대로 1000인지 라이브로 재확인 — "API 미도달"의 실증. */
async function expectBalanceUntouched(paymentKey: SettledCancelable['payment']['paymentKey'], label: string): Promise<void> {
  await pace();
  const payment = expectOk(await ctx.client.getPayment(paymentKey), `${label} — 잔액 재확인 getPayment`);
  expect(payment.balanceAmount, JSON.stringify(payment.raw)).toBe(TOTAL);
  expect(payment.cancels ?? [], JSON.stringify(payment.raw)).toHaveLength(0);
}

describe('전액 환불 사전검증 — expectedAmount 불일치 (시나리오 2)', () => {
  it(
    'expectedAmount ≠ balanceAmount → API 호출 전 Err — 서버 잔액 불변으로 실증',
    async () => {
      const { fixture, target } = await loadFixture();

      const result = await ctx.client.cancels.cancelFully(target, {
        reason: testCancelReason(),
        expectedAmount: TOTAL - 1, // 호출자 장부가 999라고 주장 — 서버 잔액 1000과 불일치
      });
      const error = expectErr(result, '시나리오 2 — cancelFully(expectedAmount 999)');
      if (error.source !== 'library' || error.kind !== 'expected-amount-mismatch') {
        throw new Error(`expected-amount-mismatch 기대, 실제: ${JSON.stringify(error)}`);
      }
      expect(error.expected).toBe(TOTAL - 1);
      expect(error.actual).toBe(TOTAL);

      // fetch 스파이 없이 라이브 검증: 취소가 서버에 도달하지 않았다면 잔액이 그대로다
      await expectBalanceUntouched(fixture.payment.paymentKey, '시나리오 2');
    },
    60_000,
  );
});

describe('부분취소 사전검증 — cancelAmount > balanceAmount (시나리오 3)', () => {
  it(
    '라이브러리는 사전 Err, 같은 요청을 우회 전송하면 서버가 403 NOT_CANCELABLE_AMOUNT — 매핑 일치',
    async () => {
      const { fixture, target } = await loadFixture();
      const overAmount = TOTAL * 2;

      // (a) 라이브러리 사전검증 — API 호출 전 차단
      const result = await ctx.client.cancels.cancelPartially(target, {
        reason: testCancelReason(),
        amount: overAmount,
      });
      const error = expectErr(result, `시나리오 3 — cancelPartially(${overAmount})`);
      if (error.source !== 'library' || error.kind !== 'amount-exceeds-balance') {
        throw new Error(`amount-exceeds-balance 기대, 실제: ${JSON.stringify(error)}`);
      }
      expect(error.cancelAmount).toBe(overAmount);
      expect(error.balanceAmount).toBe(TOTAL);

      // (b) 우회 대조 — 라이브러리가 보냈을 것과 같은 body를 raw fetch로 직접 전송
      const res = await rawTossRequest({
        method: 'POST',
        path: `/v1/payments/${encodeURIComponent(fixture.payment.paymentKey)}/cancel`,
        bodyJson: JSON.stringify({
          cancelReason: 'gj-kit 통합 테스트 취소',
          refundableAmount: TOTAL,
          cancelAmount: overAmount,
        }),
      });
      expect(res.status, res.text).toBe(403);
      const failure = tossFailureFromRaw(res, '시나리오 3 우회');
      expect(failure.code, res.text).toBe('NOT_CANCELABLE_AMOUNT');

      // (c) 에러 매핑 대조 — classifyTossErrorCode가 서버 실응답 코드를 AMOUNT/비재시도로 분류
      expect(classifyTossErrorCode(failure.code)).toEqual({ category: 'AMOUNT', retryable: false });
      expect(failure.category).toBe('AMOUNT');
      expect(failure.retryable).toBe(false);

      // (d) 서버 403이므로 잔액 역시 불변 — 라이브러리 사전검증과 서버 판정이 같은 결론
      await expectBalanceUntouched(fixture.payment.paymentKey, '시나리오 3');

      // (e) 잔액 초과가 아닌 유효 요청이었다면 asCancelable 재검증도 여전히 통과 상태임을 확인
      await pace();
      const refreshed = expectOk(
        await ctx.client.getPayment(fixture.payment.paymentKey),
        '시나리오 3 — 재조회',
      );
      expectOk(asCancelable(refreshed), '시나리오 3 — 여전히 취소 가능');
    },
    60_000,
  );
});
