/**
 * 시나리오 1 + 4b — 정상 플로우(실발급→승인→조회→부분취소→전액취소)와
 * 부분취소 이력 결제의 재취소(403 NOT_CANCELABLE_AMOUNT) 대조.
 *
 * 두 테스트는 같은 결제를 공유한다(분당 100건 예산 절약) — 캐시된 플로우 실행이
 * 어느 테스트가 먼저 돌든 1회만 수행되므로 각 테스트는 단독 실행도 가능하다.
 */
import { afterAll, describe, expect, it } from 'vitest';

import { asCancelable, isAlreadyFullyCanceledError } from '../../src/server';
import type { BillingPayment, CancelOutcome, Payment, SettledCancelable } from '../../src/server';
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
const PARTIAL = 300;
const REMAIN = 700;

const ctx = createIntegrationContext();
afterAll(() => ctx.cleanup(), 60_000);

interface FlowRun {
  /** approve 응답 (type BILLING, status DONE). */
  readonly approved: BillingPayment;
  /** 승인 직후 getPayment 재조회 결과. */
  readonly fetched: Payment;
  /** 부분취소(300) 결과. */
  readonly partial: CancelOutcome;
  /** 부분취소 후 재조회로 얻은 잔액 700 취소 대상. */
  readonly target700: SettledCancelable;
  /** 잔액 700 전액취소 결과. */
  readonly full: CancelOutcome;
}

let cached: Promise<FlowRun> | null = null;

function runFlow(): Promise<FlowRun> {
  cached ??= (async (): Promise<FlowRun> => {
    // 실발급(카드 직접 발급 capability — import 아님) → 승인
    const fixture = await createPaidBillingPayment(ctx, TOTAL);

    // 승인 응답을 신뢰하지 않고 조회로 재확인
    await pace();
    const fetched = expectOk(
      await ctx.client.getPayment(fixture.payment.paymentKey),
      '정상 플로우 — 승인 후 getPayment',
    );

    const target1000 = expectOk(asCancelable(fetched), '정상 플로우 — asCancelable(잔액 1000)');
    if (target1000.kind !== 'settled' || !target1000.partialAllowed) {
      throw new Error(`정상 플로우 — settled 기대, 실제 kind=${target1000.kind}`);
    }

    await pace();
    const partial = expectOk(
      await ctx.client.cancels.cancelPartially(target1000, {
        reason: testCancelReason(),
        amount: PARTIAL,
      }),
      `정상 플로우 — cancelPartially(${PARTIAL})`,
    );

    // 부분취소 후 재조회 — cancelFully는 조회 시점 잔액(balanceAmount)을 낙관적 잠금으로 쓴다
    const target700 = await loadSettledTarget(
      ctx,
      fixture.payment.paymentKey,
      '정상 플로우 — 부분취소 후 재조회',
    );

    await pace();
    const full = expectOk(
      await ctx.client.cancels.cancelFully(target700, {
        reason: testCancelReason(),
        expectedAmount: REMAIN,
      }),
      `정상 플로우 — cancelFully(expectedAmount ${REMAIN})`,
    );

    return { approved: fixture.payment, fetched, partial, target700, full };
  })();
  return cached;
}

describe('정상 플로우 — 실발급 → approve → getPayment → 부분취소 → 전액취소', () => {
  it(
    'balanceAmount 추적: 1000 → 700 → 0, 전액취소 후에도 status는 PARTIAL_CANCELED(실측 고정)',
    async () => {
      const run = await runFlow();

      // 승인: type BILLING / status DONE / 금액
      expect(run.approved.type).toBe('BILLING');
      expect(run.approved.status).toBe('DONE');
      expect(run.approved.totalAmount, JSON.stringify(run.approved.raw)).toBe(TOTAL);

      // 조회 재확인: 잔액 1000
      expect(run.fetched.balanceAmount, JSON.stringify(run.fetched.raw)).toBe(TOTAL);
      expect(run.fetched.paymentKey).toBe(run.approved.paymentKey);

      // 부분취소(300): 잔액 700, 아직 완전 취소 아님
      expect(run.partial.cancel.cancelAmount, JSON.stringify(run.partial.payment.raw)).toBe(PARTIAL);
      expect(run.partial.payment.balanceAmount, JSON.stringify(run.partial.payment.raw)).toBe(REMAIN);
      expect(run.partial.fullyCanceled).toBe(false);

      // 재조회 대상: 잔액 700 + status PARTIAL_CANCELED
      expect(run.target700.balanceAmount).toBe(REMAIN);
      expect(run.target700.payment.status).toBe('PARTIAL_CANCELED');

      // 전액취소(expectedAmount 700): fullyCanceled true — 단, status는 CANCELED가 아니라
      // PARTIAL_CANCELED로 남는다 (Phase 0 실측 2026-08-09 — 부분취소 이력이 있으면 유지).
      expect(run.full.fullyCanceled, JSON.stringify(run.full.payment.raw)).toBe(true);
      expect(run.full.payment.balanceAmount, JSON.stringify(run.full.payment.raw)).toBe(0);
      expect(run.full.payment.status, JSON.stringify(run.full.payment.raw)).toBe('PARTIAL_CANCELED');
      expect(run.full.cancel.cancelAmount).toBe(REMAIN);
    },
    120_000,
  );
});

describe('재취소 — 부분취소 이력 결제 (시나리오 4b)', () => {
  it(
    '라이브러리는 asCancelable에서 차단하고, 서버 직행은 403 NOT_CANCELABLE_AMOUNT — isAlreadyFullyCanceledError true',
    async () => {
      const run = await runFlow();

      // 라이브러리 경로: 재조회 → asCancelable이 API 호출 전에 차단 (already-fully-canceled)
      await pace();
      const refreshed = expectOk(
        await ctx.client.getPayment(run.approved.paymentKey),
        '재취소(4b) — getPayment',
      );
      const blocked = expectErr(asCancelable(refreshed), '재취소(4b) — asCancelable');
      if (blocked.kind !== 'already-fully-canceled') {
        throw new Error(`already-fully-canceled 기대, 실제: ${JSON.stringify(blocked)}`);
      }
      expect(blocked.status).toBe('PARTIAL_CANCELED');

      // 서버 대조: 라이브러리를 우회해 재취소 → 403 NOT_CANCELABLE_AMOUNT
      // (Phase 0 실측: 부분취소 이력이 있으면 ALREADY_CANCELED_PAYMENT가 아니라 이 코드다)
      const res = await rawTossRequest({
        method: 'POST',
        path: `/v1/payments/${encodeURIComponent(run.approved.paymentKey)}/cancel`,
        bodyJson: JSON.stringify({ cancelReason: 'gj-kit 통합 테스트 재취소(4b)' }),
      });
      expect(res.status, res.text).toBe(403);
      const failure = tossFailureFromRaw(res, '재취소(4b)');
      expect(failure.code, res.text).toBe('NOT_CANCELABLE_AMOUNT');

      // 에러 매핑 대조: 이 코드도 "이미 완전 취소됨" 계열로 수용된다(이중 매핑 헬퍼)
      expect(isAlreadyFullyCanceledError(failure), res.text).toBe(true);
      expect(failure.category).toBe('AMOUNT');
      expect(failure.retryable).toBe(false);
    },
    120_000,
  );
});
