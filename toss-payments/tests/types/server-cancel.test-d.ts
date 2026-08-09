import { describe, it } from 'vitest';

import type {
  AwaitingDepositCancelable,
  CancelablePayment,
  CancelRetryTicket,
  DepositedVaCancelable,
  RefundAccount,
  SettledCancelable,
  TossServerClient,
} from '../../src/server';
import type { CancelReason, CancelRequestId, Payment } from '../../src/index';

const forge = <T>(): T => undefined as T; // 타입 테스트 전용 헬퍼

describe('§3.2 cancel — 오용 = 컴파일 에러', () => {
  const client = forge<TossServerClient<'test', 'api'>>();
  const payment = forge<Payment>();
  const some = forge<CancelablePayment>();
  const awaiting = forge<AwaitingDepositCancelable>();
  const vaDeposited = forge<DepositedVaCancelable>();
  const settled = forge<SettledCancelable>();
  const reason = forge<CancelReason>();
  const acct = forge<RefundAccount>();

  it('검증 우회 경로가 존재하지 않는다', () => {
    // @ts-expect-error paymentKey 문자열로 바로 취소하는 시그니처는 존재하지 않는다
    void client.cancels.cancelFully('tviva20260809xxxx', { reason, expectedAmount: 1000 });

    // @ts-expect-error 조회한 Payment 그대로는 불가 — asCancelable 검증 통과 필수
    void client.cancels.cancelFully(payment, { reason, expectedAmount: 1000 });

    // @ts-expect-error 유니언 상태로는 호출 불가 — kind 내로잉(가상계좌 분기)을 건너뛸 수 없다
    void client.cancels.cancelFully(some, { reason, expectedAmount: 1000 });
  });

  it('가상계좌 조건부 필수/금지 규칙이 타입으로 강제된다', () => {
    // @ts-expect-error 입금 전 가상계좌 부분취소 — 해당 오버로드 자체가 없다
    void client.cancels.cancelPartially(awaiting, { reason, amount: 1000 });

    // @ts-expect-error 입금 완료 가상계좌 전액취소에 refundAccount 누락
    void client.cancels.cancelFully(vaDeposited, { reason, expectedAmount: 10_000 });

    // @ts-expect-error 전액 환불에 expectedAmount 누락 — 금액 동일성 검증 생략 불가
    void client.cancels.cancelFully(settled, { reason });

    const viaVar = { reason, expectedAmount: 10_000, refundAccount: acct };
    // @ts-expect-error 일반 결제 취소에 refundAccount — ?: never라 변수 경유도 차단
    void client.cancels.cancelFully(settled, viaVar);
  });

  it('정상 경로는 컴파일된다', () => {
    void client.cancels.cancelFully(settled, { reason, expectedAmount: 1000 });
    void client.cancels.cancelFully(vaDeposited, {
      reason,
      expectedAmount: 10_000,
      refundAccount: acct,
    });
    void client.cancels.cancelFully(awaiting, { reason, expectedAmount: 1000 });
    void client.cancels.cancelPartially(settled, { reason, amount: 500 });
    void client.cancels.cancelPartially(vaDeposited, { reason, amount: 500, refundAccount: acct });
    void client.cancels.retry(forge<CancelRetryTicket>());
  });

  it('cancelRequestId — 스마트 생성자 브랜드만 수용(중국·동남아 비동기 취소)', () => {
    const crid = forge<CancelRequestId>();
    // 5개 오버로드 전부에서 옵션으로 컴파일된다
    void client.cancels.cancelFully(settled, { reason, expectedAmount: 1000, cancelRequestId: crid });
    void client.cancels.cancelFully(vaDeposited, {
      reason,
      expectedAmount: 10_000,
      refundAccount: acct,
      cancelRequestId: crid,
    });
    void client.cancels.cancelFully(awaiting, { reason, expectedAmount: 1000, cancelRequestId: crid });
    void client.cancels.cancelPartially(settled, { reason, amount: 500, cancelRequestId: crid });
    void client.cancels.cancelPartially(vaDeposited, {
      reason,
      amount: 500,
      refundAccount: acct,
      cancelRequestId: crid,
    });

    // @ts-expect-error 평문 문자열은 불가 — cancelRequestId() 스마트 생성자(6-64자 검증) 통과 필수
    void client.cancels.cancelPartially(settled, { reason, amount: 500, cancelRequestId: 'raw-1' });
  });
});
