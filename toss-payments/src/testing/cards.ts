/**
 * 테스트 환경 표준 빌링 카드 — Phase 0 실측값 그대로.
 *
 * 실측 근거(docs/research/toss-payments-v2.md "추가 실측 확정 사항", 2026-08-09,
 * test_sk_ 키로 api.tosspayments.com 실호출):
 * - `433012`(BIN 6자리 단독) → 400 INVALID_CARD_NUMBER — BIN만으로는 발급 불가
 * - `4330121234567890` / `5520221234567890` → 발급 200이지만 cardType "미확인"
 *   → 승인 시 400 NOT_SUPPORTED_CARD_TYPE
 * - `9410001234567890` → 발급(cardType "신용", ownerType "개인", issuerCode 21)
 *   + 승인(200 DONE) 모두 성공 — **발급·승인이 전부 통과하는 유일하게 확인된 카드**
 */

/**
 * 발급(신용/개인) + 승인(DONE)까지 통과하는 유일 확인 테스트 카드 (위 실측 근거).
 *
 * `DirectCardIssueInput`에서 customerKey만 빠진 형태 — 스프레드로 바로 쓴다:
 * ```ts
 * flow.issueWithCard({ customerKey, ...TEST_BILLING_CARD });
 * ```
 */
export const TEST_BILLING_CARD = {
  cardNumber: '9410001234567890',
  cardExpirationYear: '30',
  cardExpirationMonth: '12',
  customerIdentityNumber: '900101',
  cardPassword: '12',
} as const;
