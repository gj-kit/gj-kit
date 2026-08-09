/**
 * 시나리오 4a — 부분취소 이력 **없이** 단일 전액취소한 결제의 재취소.
 *
 * Phase 0 실측(2026-08-09): 이 경우 status는 CANCELED가 되고, 재취소는
 * 400 ALREADY_CANCELED_PAYMENT다 (부분취소 이력 케이스의 403 NOT_CANCELABLE_AMOUNT와
 * 다른 코드 — 이중 매핑 분기의 나머지 절반).
 */
import { afterAll, describe, expect, it } from 'vitest';

import { asCancelable, isAlreadyFullyCanceledError } from '../../src/server';
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

describe('재취소 — 단일 전액취소 결제 (시나리오 4a)', () => {
  it(
    '전액취소 → status CANCELED, 재취소는 400 ALREADY_CANCELED_PAYMENT — isAlreadyFullyCanceledError true',
    async () => {
      const fixture = await createPaidBillingPayment(ctx, TOTAL);
      const target = await loadSettledTarget(ctx, fixture.payment.paymentKey, '시나리오 4a');

      // 부분취소 이력 없는 단일 전액취소 → status CANCELED (Phase 0 실측)
      await pace();
      const full = expectOk(
        await ctx.client.cancels.cancelFully(target, {
          reason: testCancelReason(),
          expectedAmount: TOTAL,
        }),
        `시나리오 4a — cancelFully(expectedAmount ${TOTAL})`,
      );
      expect(full.fullyCanceled, JSON.stringify(full.payment.raw)).toBe(true);
      expect(full.payment.balanceAmount, JSON.stringify(full.payment.raw)).toBe(0);
      expect(full.payment.status, JSON.stringify(full.payment.raw)).toBe('CANCELED');

      // 라이브러리 경로: 재조회 → asCancelable이 API 호출 전에 차단
      await pace();
      const refreshed = expectOk(
        await ctx.client.getPayment(fixture.payment.paymentKey),
        '시나리오 4a — 재조회',
      );
      const blocked = expectErr(asCancelable(refreshed), '시나리오 4a — asCancelable');
      if (blocked.kind !== 'already-fully-canceled') {
        throw new Error(`already-fully-canceled 기대, 실제: ${JSON.stringify(blocked)}`);
      }
      expect(blocked.status).toBe('CANCELED');

      // 서버 대조: 우회 재취소 → 400 ALREADY_CANCELED_PAYMENT (Phase 0 실측 고정)
      const res = await rawTossRequest({
        method: 'POST',
        path: `/v1/payments/${encodeURIComponent(fixture.payment.paymentKey)}/cancel`,
        bodyJson: JSON.stringify({ cancelReason: 'gj-kit 통합 테스트 재취소(4a)' }),
      });
      expect(res.status, res.text).toBe(400);
      const failure = tossFailureFromRaw(res, '시나리오 4a 재취소');
      expect(failure.code, res.text).toBe('ALREADY_CANCELED_PAYMENT');

      // 이중 매핑 헬퍼가 이 코드도 "이미 완전 취소됨"으로 수용
      expect(isAlreadyFullyCanceledError(failure), res.text).toBe(true);
      expect(failure.category).toBe('STATE');
      expect(failure.retryable).toBe(false);
    },
    60_000,
  );
});
