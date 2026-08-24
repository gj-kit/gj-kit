import { describe, expectTypeOf, it } from 'vitest';

import {
  compareLedgerRefund,
  isFullyCanceled,
  parsePaymentStateSnapshot,
  serializePaymentStateSnapshot,
  summarizePaymentState,
} from '../../src/index';
import type {
  InvalidInput,
  InvalidPaymentStateSnapshot,
  LedgerRefundComparison,
  LedgerRefundMismatchDirection,
  LedgerRefundShortfall,
  OrderId,
  Payment,
  PaymentKey,
  PaymentStateConsistencyIssue,
  PaymentStateInput,
  PaymentStateSnapshot,
  Result,
  SerializedPaymentStateSnapshot,
} from '../../src/index';

const forge = <T>(): T => undefined as T; // 타입 테스트 전용 헬퍼

describe('PaymentStateInput — 최소 구조 입력', () => {
  it('전체 Payment는 항상 할당 가능 (비파괴 완화)', () => {
    expectTypeOf<Payment>().toExtend<PaymentStateInput>();
    summarizePaymentState(forge<Payment>()); // 기존 호출부 형태 그대로 컴파일
  });

  it('역방향은 불가 — 8필드 Pick으로 전체 Payment를 위조할 수 없다', () => {
    expectTypeOf<PaymentStateInput>().not.toExtend<Payment>();
  });

  it('summarizePaymentState의 파라미터는 PaymentStateInput | Payment — 유니언 멤버 Payment는 인라인 리터럴의 excess-property 검사 통과용', () => {
    expectTypeOf(summarizePaymentState)
      .parameter(0)
      .toEqualTypeOf<PaymentStateInput | Payment>();
    expectTypeOf(summarizePaymentState).returns.toEqualTypeOf<PaymentStateSnapshot>();
  });

  it('fresh 인라인 리터럴이 Payment 고유 필드를 나열해도 컴파일된다 (기존 호출부 보존)', () => {
    // 회귀 방지: 파라미터가 Pick 단독이면 아래는 TS2353(excess property)이었다.
    summarizePaymentState({
      paymentKey: forge<PaymentKey>(),
      orderId: forge<OrderId>(),
      status: 'DONE',
      totalAmount: 1000,
      balanceAmount: 1000,
      lastTransactionKey: null,
      isPartialCancelable: true,
      cancels: null,
      version: '2022-11-16',
      requestedAt: '2026-01-01T00:00:00+09:00',
    });
    isFullyCanceled({
      status: 'CANCELED',
      balanceAmount: 0,
      cancels: null,
      version: '2022-11-16',
    });
    // Payment 어느 멤버에도 없는 필드는 여전히 excess-property 에러다.
    summarizePaymentState({
      paymentKey: forge<PaymentKey>(),
      orderId: forge<OrderId>(),
      status: 'DONE',
      totalAmount: 1000,
      balanceAmount: 1000,
      lastTransactionKey: null,
      isPartialCancelable: true,
      cancels: null,
      // @ts-expect-error 모든 유니언 멤버에 없는 필드
      madeUpField: true,
    });
  });

  it('필수 필드 누락은 컴파일 에러', () => {
    // @ts-expect-error 빈 객체는 PaymentStateInput이 아니다
    summarizePaymentState({});
    // @ts-expect-error lastTransactionKey/isPartialCancelable 누락
    summarizePaymentState({
      paymentKey: forge<PaymentKey>(),
      orderId: forge<OrderId>(),
      status: 'DONE',
      totalAmount: 1000,
      balanceAmount: 1000,
      cancels: null,
    });
  });

  it('paymentKey/orderId는 여전히 브랜드 — raw string으로 채울 수 없다', () => {
    summarizePaymentState({
      // @ts-expect-error raw string은 PaymentKey가 아니다
      paymentKey: 'pay_raw',
      orderId: forge<OrderId>(),
      status: 'DONE',
      totalAmount: 1000,
      balanceAmount: 1000,
      lastTransactionKey: null,
      isPartialCancelable: true,
      cancels: null,
    });
  });
});

describe('SerializedPaymentStateSnapshot — 브랜드 경계', () => {
  it('브랜드 스냅샷 → 직렬화 형태는 상향 할당 가능, 역방향은 parse를 거쳐야 한다', () => {
    expectTypeOf<PaymentStateSnapshot>().toExtend<SerializedPaymentStateSnapshot>();
    expectTypeOf<SerializedPaymentStateSnapshot>().not.toExtend<PaymentStateSnapshot>();
  });

  it('직렬화 형태의 id는 plain string', () => {
    expectTypeOf<SerializedPaymentStateSnapshot['paymentKey']>().toEqualTypeOf<string>();
    expectTypeOf<SerializedPaymentStateSnapshot['orderId']>().toEqualTypeOf<string>();
    expectTypeOf<SerializedPaymentStateSnapshot['paymentKey']>().not.toEqualTypeOf<PaymentKey>();
  });

  it('serialize/parse 시그니처', () => {
    expectTypeOf(serializePaymentStateSnapshot)
      .parameter(0)
      .toEqualTypeOf<PaymentStateSnapshot>();
    expectTypeOf(serializePaymentStateSnapshot).returns.toEqualTypeOf<SerializedPaymentStateSnapshot>();
    expectTypeOf(parsePaymentStateSnapshot).parameter(0).toEqualTypeOf<unknown>();
    expectTypeOf(parsePaymentStateSnapshot).returns.toEqualTypeOf<
      Result<PaymentStateSnapshot, InvalidPaymentStateSnapshot>
    >();
  });

  it('parse 에러는 InvalidInput<paymentStateSnapshot> 확장 + path', () => {
    expectTypeOf<InvalidPaymentStateSnapshot>().toExtend<
      InvalidInput<
        'paymentStateSnapshot',
        'too-short' | 'too-long' | 'bad-charset' | 'empty' | 'malformed'
      >
    >();
    expectTypeOf<InvalidPaymentStateSnapshot['path']>().toEqualTypeOf<string>();
    // 기존 파서들의 InvalidInput 기본 reason 유니언은 변하지 않았다.
    expectTypeOf<InvalidInput<'orderId'>['reason']>().toEqualTypeOf<
      'too-short' | 'too-long' | 'bad-charset' | 'empty'
    >();
  });

  it('스냅샷 필드는 readonly — 변이는 컴파일 에러', () => {
    // @ts-expect-error readonly
    forge<PaymentStateSnapshot>().totalAmount = 0;
    // @ts-expect-error readonly
    forge<SerializedPaymentStateSnapshot>().paymentKey = 'other';
    // @ts-expect-error readonly 배열에는 push가 없다
    forge<SerializedPaymentStateSnapshot>().cancels.push(forge<never>());
  });
});

describe('compareLedgerRefund — 판별 유니언 내로잉', () => {
  it('브랜드/직렬화 두 형태 모두 수용', () => {
    compareLedgerRefund(forge<PaymentStateSnapshot>(), { expectedRefundedAmount: 0 });
    compareLedgerRefund(forge<SerializedPaymentStateSnapshot>(), { expectedRefundedAmount: 0 });
    // requestedAmount는 선택 — 현재 대사 중인 단일 환불 요청 금액.
    compareLedgerRefund(forge<PaymentStateSnapshot>(), {
      expectedRefundedAmount: 300,
      requestedAmount: 300,
    });
    // @ts-expect-error expectedRefundedAmount 누락
    compareLedgerRefund(forge<PaymentStateSnapshot>(), {});
    expectTypeOf(compareLedgerRefund).returns.toEqualTypeOf<LedgerRefundComparison>();
  });

  it('kind로 내로잉 — 분기 전용 필드가 다른 분기로 새지 않는다', () => {
    const verdict = forge<LedgerRefundComparison>();
    if (verdict.kind === 'settled') {
      expectTypeOf(verdict.canceledAmount).toEqualTypeOf<number>();
      expectTypeOf(verdict.pendingCancelAmount).toEqualTypeOf<number>();
      // @ts-expect-error direction은 mismatch 전용
      void verdict.direction;
      // @ts-expect-error consistencyIssues는 mismatch 전용
      void verdict.consistencyIssues;
      // @ts-expect-error shortfall은 mismatch 전용
      void verdict.shortfall;
    } else if (verdict.kind === 'unconfirmed') {
      expectTypeOf(verdict.pendingCancelAmount).toEqualTypeOf<number>();
      // @ts-expect-error invalidLedgerTarget은 mismatch 전용
      void verdict.invalidLedgerTarget;
    } else {
      expectTypeOf(verdict.kind).toEqualTypeOf<'mismatch'>();
      expectTypeOf(verdict.direction).toEqualTypeOf<LedgerRefundMismatchDirection>();
      expectTypeOf(verdict.direction).toEqualTypeOf<
        'provider-exceeds-ledger' | 'provider-below-ledger' | 'indeterminate'
      >();
      expectTypeOf(verdict.invalidLedgerTarget).toEqualTypeOf<boolean>();
      expectTypeOf(verdict.consistencyIssues).toEqualTypeOf<
        readonly PaymentStateConsistencyIssue[]
      >();
      expectTypeOf(verdict.shortfall).toEqualTypeOf<
        LedgerRefundShortfall | undefined
      >();
      expectTypeOf<LedgerRefundShortfall>().toEqualTypeOf<
        'at-prior-state' | 'unexplained'
      >();
    }
  });

  it('3분기 외 kind는 존재하지 않는다', () => {
    expectTypeOf<LedgerRefundComparison['kind']>().toEqualTypeOf<
      'settled' | 'unconfirmed' | 'mismatch'
    >();
  });
});
