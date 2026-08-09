/**
 * 시나리오 6 — 멱등성: cancelPartially에 명시적 Idempotency-Key를 주고,
 * 같은 키+같은 body를 raw로 재전송하면 서버가 첫 응답을 재생한다(중복 취소 없음).
 *
 * Phase 0 실측: 멱등 판정 조합은 "키 + API 키 + 주소 + 메서드"(body 미포함)이며,
 * 같은 키+같은 body 재전송은 바이트 단위 동일 body 재생이었다.
 * 라이브러리의 retry 티켓 경로는 transport 실패를 라이브에서 유발하기 어려우므로
 * 여기서는 키 재사용의 서버 동작만 검증한다(티켓 봉인 자체는 단위 테스트가 커버).
 */
import { afterAll, describe, expect, it } from 'vitest';

import { generateIdempotencyKey } from '../../src/server';
import {
  createIntegrationContext,
  createPaidBillingPayment,
  expectOk,
  loadSettledTarget,
  pace,
  rawTossRequest,
  testCancelReason,
} from './helpers';

const TOTAL = 1000;
const PARTIAL = 300;
const REMAIN = 700;

const ctx = createIntegrationContext();
afterAll(() => ctx.cleanup(), 60_000);

describe('멱등성 — 같은 Idempotency-Key 재전송 (시나리오 6)', () => {
  it(
    '명시적 키로 부분취소 후 같은 키+같은 body를 raw 재전송 → 동일 응답 재생 + 잔액 불변',
    async () => {
      const fixture = await createPaidBillingPayment(ctx, TOTAL);
      const target = await loadSettledTarget(ctx, fixture.payment.paymentKey, '시나리오 6');
      const reason = testCancelReason();
      const key = generateIdempotencyKey();

      // (a) 라이브러리로 부분취소 — 명시적 멱등키
      await pace();
      const outcome = expectOk(
        await ctx.client.cancels.cancelPartially(
          target,
          { reason, amount: PARTIAL },
          { idempotencyKey: key },
        ),
        `시나리오 6 — cancelPartially(${PARTIAL}, 명시적 키)`,
      );
      expect(outcome.idempotencyKey).toBe(key);
      expect(outcome.payment.balanceAmount, JSON.stringify(outcome.payment.raw)).toBe(REMAIN);
      expect(outcome.payment.cancels ?? [], JSON.stringify(outcome.payment.raw)).toHaveLength(1);

      // (b) 같은 키 + 같은 body(라이브러리 직렬화 순서 그대로: cancelReason →
      //     refundableAmount → cancelAmount)를 raw로 재전송 — 재시도 티켓 없이 키 재사용
      const res = await rawTossRequest({
        method: 'POST',
        path: `/v1/payments/${encodeURIComponent(fixture.payment.paymentKey)}/cancel`,
        bodyJson: JSON.stringify({
          cancelReason: reason,
          refundableAmount: TOTAL,
          cancelAmount: PARTIAL,
        }),
        idempotencyKey: key,
      });
      expect(res.status, res.text).toBe(200);

      // 첫 응답 재생 — 라이브러리가 받은 원문(outcome.payment.raw)과 동일해야 한다
      // (Phase 0 실측: 바이트 단위 동일 body 재생, cancels 1건 유지)
      expect(res.json, res.text).toEqual(outcome.payment.raw);

      // (c) 잔액 불변 — 중복 취소가 일어나지 않았음을 조회로 실증
      await pace();
      const refreshed = expectOk(
        await ctx.client.getPayment(fixture.payment.paymentKey),
        '시나리오 6 — 재조회',
      );
      expect(refreshed.balanceAmount, JSON.stringify(refreshed.raw)).toBe(REMAIN);
      expect(refreshed.cancels ?? [], JSON.stringify(refreshed.raw)).toHaveLength(1);
    },
    60_000,
  );
});
