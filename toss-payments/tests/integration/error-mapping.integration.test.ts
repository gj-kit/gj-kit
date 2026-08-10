/**
 * 시나리오 5 + 7 + 8 — 서버 에러 실증과 라이브러리 매핑 대조.
 *
 * - 5: NOT_MATCHES_CUSTOMER_KEY — 라이브러리로는 다른 customerKey 승인이 **컴파일 불가**
 *   (BillingOrder에 customerKey 필드가 없고 봉인 쌍으로만 승인 — tests/types가 커버).
 *   여기서는 raw fetch로 그 요청을 실제로 보내, 봉인 설계가 막는 것이 실재하는
 *   서버 에러(400)임을 대조 실증한다.
 * - 7: TossPayments-Test-Code 헤더(testCode 옵션 — test env 내로잉이 있어야 타입 허용).
 * - 8: 형식은 유효하나 무효한 test_sk_ 키 → 401 UNAUTHORIZED_KEY 매핑.
 */
import { afterAll, describe, expect, it } from 'vitest';

import {
  classifyTossErrorCode,
  createTossClient,
  generateCustomerKey,
  generateIdempotencyKey,
  generateOrderId,
  isTestKey,
  orThrow,
  parseApiSecretKey,
  paymentKey,
} from '../../src/server';
import type { BillingKeyRecord, BillingProfile } from '../../src/server';
import { TEST_BILLING_CARD } from '../../src/testing';
import {
  createIntegrationContext,
  expectErr,
  expectOk,
  expectTossFailure,
  pace,
  rawTossRequest,
  testOrderName,
  tossFailureFromRaw,
} from './helpers';

const ctx = createIntegrationContext();
afterAll(() => ctx.cleanup(), 60_000);

interface IssuedFixture {
  readonly profile: BillingProfile;
  /** 스토어에서 회수한 발급 record — billingKey 평문을 얻는 유일한 공개 경로(우회 실험 전용). */
  readonly record: BillingKeyRecord;
}

let issuedCache: Promise<IssuedFixture> | null = null;

/** 시나리오 5·7이 공유하는 발급 픽스처 — 5는 raw 실패 유발만 하므로 키를 소모하지 않는다. */
function issuedBillingKey(): Promise<IssuedFixture> {
  issuedCache ??= (async (): Promise<IssuedFixture> => {
    const customerKey = generateCustomerKey();
    await pace();
    const profile = expectOk(
      await ctx.flow.issueWithCard({ customerKey, ...TEST_BILLING_CARD }),
      '에러 매핑 픽스처 — issueWithCard',
    );
    ctx.trackForCleanup(profile);
    const record = await ctx.store.find(customerKey);
    if (record === null) {
      throw new Error('발급 성공 후 스토어에 record가 없습니다 — BillingKeyStore 저장 계약 위반');
    }
    return { profile, record };
  })();
  return issuedCache;
}

describe('NOT_MATCHES_CUSTOMER_KEY 대조 실험 (시나리오 5)', () => {
  it(
    '다른 customerKey로 raw 승인 시도 → 400 NOT_MATCHES_CUSTOMER_KEY — 봉인 설계가 막는 에러의 실재 증명',
    async () => {
      const { record } = await issuedBillingKey();
      const otherCustomerKey = generateCustomerKey(); // 발급에 쓴 키와 다른 키

      // 라이브러리로는 이 요청을 만들 수 없다(BillingOrder에 customerKey 필드 부재,
      // 승인은 봉인 쌍 profile로만) — raw fetch로만 재현 가능하다.
      const res = await rawTossRequest({
        method: 'POST',
        path: `/v1/billing/${encodeURIComponent(record.billingKey)}`,
        bodyJson: JSON.stringify({
          customerKey: otherCustomerKey,
          orderId: generateOrderId('gjnm'),
          orderName: 'NOT_MATCHES 대조 실험',
          amount: 100,
        }),
      });
      expect(res.status, res.text).toBe(400);
      const failure = tossFailureFromRaw(res, '시나리오 5');
      expect(failure.code, res.text).toBe('NOT_MATCHES_CUSTOMER_KEY');

      // 라이브러리 매핑 대조 — STATE / 비재시도 (봉인 설계로 구조적 도달 불가 목표)
      expect(classifyTossErrorCode(failure.code)).toEqual({ category: 'STATE', retryable: false });
    },
    60_000,
  );
});

describe('TossPayments-Test-Code 시뮬레이션 (시나리오 7)', () => {
  it(
    'billing approve에 testCode REJECT_CARD_PAYMENT → 서버가 해당 에러를 시뮬레이션한다',
    async () => {
      const { profile } = await issuedBillingKey();

      await pace();
      const result = await ctx.flow.approve(
        profile,
        {
          orderId: generateOrderId('gjtc'),
          orderName: testOrderName(),
          amount: 100,
        },
        // testCode는 E='test' 내로잉된 클라이언트에서만 타입 허용 — 라이브 키면 컴파일 에러
        { testCode: 'REJECT_CARD_PAYMENT', idempotencyKey: generateIdempotencyKey() },
      );

      // 실동작 실측 확정(2026-08-09, 이 테스트 단건 실행으로 확인): 빌링 승인 경로에서도
      // Test-Code가 적용되어 서버가 REJECT_CARD_PAYMENT를 반환한다(무시되지 않음).
      // 아래 단언은 그 관찰 결과 기준으로 고정된 것이다.
      const error = expectErr(result, '시나리오 7 — approve(testCode REJECT_CARD_PAYMENT)');
      const failure = expectTossFailure(error, '시나리오 7');
      expect(failure.code, JSON.stringify(failure)).toBe('REJECT_CARD_PAYMENT');
      expect(failure.category).toBe('REJECTED');
      expect(failure.retryable).toBe(false);
    },
    60_000,
  );
});

describe('잘못된 키 — UNAUTHORIZED_KEY 매핑 (시나리오 8)', () => {
  it(
    '형식은 유효하나 무효한 test_sk_ 키로 getPayment → 401 UNAUTHORIZED_KEY (AUTH/비재시도)',
    async () => {
      // 형식 검증(parseApiSecretKey)은 통과하지만 토스에 등록되지 않은 키
      const bogusRaw = 'test_sk_gjkit0integration0invalid0key0000';
      const parsed = orThrow(parseApiSecretKey(bogusRaw), '시나리오 8 — 무효 키 파싱');
      if (!isTestKey(parsed)) {
        throw new Error('무효 키가 test env로 내로잉되지 않았습니다');
      }
      const bogusClient = createTossClient(parsed);

      await pace();
      const result = await bogusClient.getPayment(
        orThrow(paymentKey('gjkit-integration-nonexistent-payment'), '시나리오 8 — paymentKey'),
      );
      const error = expectErr(result, '시나리오 8 — getPayment(무효 키)');
      const failure = expectTossFailure(error, '시나리오 8');
      expect(failure.code, JSON.stringify(failure)).toBe('UNAUTHORIZED_KEY');
      expect(failure.httpStatus, JSON.stringify(failure)).toBe(401);
      expect(failure.category).toBe('AUTH');
      expect(failure.retryable).toBe(false);
    },
    30_000,
  );
});
