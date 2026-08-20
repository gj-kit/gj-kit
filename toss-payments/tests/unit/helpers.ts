/**
 * server 모듈 단위 테스트 헬퍼 — fetch 주입 모킹(실제 네트워크 금지)과 응답 픽스처.
 * 테스트 픽스처이므로 타입 단언을 허용한다.
 */
import type { Payment } from '../../src/index';

export interface RecordedCall {
  readonly url: string;
  readonly method: string;
  /** 키는 소문자로 정규화. */
  readonly headers: Record<string, string>;
  readonly body: string | null;
}

export interface MockResponse {
  readonly status: number;
  readonly body?: unknown;
  readonly headers?: Record<string, string>;
}

/** fetch 모킹 — 호출 기록(URL/메서드/헤더/바디 원문)을 남긴다. */
export function mockFetch(
  handler: (call: RecordedCall, index: number) => MockResponse | Promise<MockResponse>,
): { fetch: typeof fetch; calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];
  const impl = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url =
      typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const headers: Record<string, string> = {};
    new Headers(init?.headers).forEach((value, key) => {
      headers[key.toLowerCase()] = value;
    });
    const call: RecordedCall = {
      url,
      method: init?.method ?? 'GET',
      headers,
      body: typeof init?.body === 'string' ? init.body : null,
    };
    calls.push(call);
    const res = await handler(call, calls.length - 1);
    return new Response(res.body === undefined ? null : JSON.stringify(res.body), {
      status: res.status,
      ...(res.headers === undefined ? {} : { headers: res.headers }),
    });
  };
  return { fetch: impl as typeof fetch, calls };
}

/** 항상 네트워크 예외를 던지는 fetch. */
export function failingFetch(cause: Error): { fetch: typeof fetch; calls: RecordedCall[] } {
  return mockFetch(() => {
    throw cause;
  });
}

/** 호출되면 테스트 실패로 간주하는 fetch (API 미호출 검증용). */
export function forbiddenFetch(): { fetch: typeof fetch; calls: RecordedCall[] } {
  return mockFetch(() => {
    throw new Error('이 테스트에서는 fetch가 호출되면 안 됩니다');
  });
}

/** Payment 응답 원문 픽스처 (raw 필드 없음 — 서버 응답 그대로). */
export function rawPayment(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const payment: Record<string, unknown> = {
    version: '2022-11-16',
    paymentKey: 'tviva20260809abcdef',
    type: 'NORMAL',
    orderId: 'order-123456',
    orderName: '테스트 주문',
    mId: 'tvivarepublica',
    currency: 'KRW',
    totalAmount: 1000,
    balanceAmount: 1000,
    status: 'DONE',
    requestedAt: '2026-08-09T12:00:00+09:00',
    approvedAt: '2026-08-09T12:00:05+09:00',
    useEscrow: false,
    lastTransactionKey: 'txn-1',
    suppliedAmount: 909,
    vat: 91,
    cultureExpense: false,
    taxFreeAmount: 0,
    taxExemptionAmount: 0,
    cancels: null,
    isPartialCancelable: true,
    method: '카드',
    card: {
      amount: 1000,
      issuerCode: '21',
      acquirerCode: null,
      number: '433012******890',
      installmentPlanMonths: 0,
      approveNo: '00000000',
      useCardPoint: false,
      cardType: '신용',
      ownerType: '개인',
      acquireStatus: 'READY',
      isInterestFree: false,
      interestPayer: null,
    },
    virtualAccount: null,
    secret: null,
    metadata: null,
    receipt: null,
    checkout: null,
    country: 'KR',
    failure: null,
    ...overrides,
  };

  // `Payment`의 가상계좌 variant는 실제 승인 응답에서 내려오는 detail 전체를 약속한다.
  // 테스트에서 accountNumber만 관심 있는 경우에도 API 응답 픽스처 자체는 유효한 계약을
  // 유지한다. 누락/nullable 경계 테스트는 `virtualAccount: null` 또는 `secret: null`을
  // 명시해 정상화 없이 만들 수 있다.
  if (payment['method'] === '가상계좌') {
    if (!Object.prototype.hasOwnProperty.call(overrides, 'card')) payment['card'] = null;
    if (!Object.prototype.hasOwnProperty.call(overrides, 'secret')) {
      payment['secret'] = 'va-secret-fixture';
    }

    const virtualAccount = payment['virtualAccount'];
    if (!Object.prototype.hasOwnProperty.call(overrides, 'virtualAccount')) {
      payment['virtualAccount'] = defaultVirtualAccount();
    } else if (
      typeof virtualAccount === 'object' &&
      virtualAccount !== null &&
      !Array.isArray(virtualAccount)
    ) {
      payment['virtualAccount'] = {
        ...defaultVirtualAccount(),
        ...(virtualAccount as Record<string, unknown>),
      };
    }
  }

  return payment;
}

function defaultVirtualAccount(): Record<string, unknown> {
  return {
    accountNumber: '70123456789',
    accountType: '일반',
    bankCode: '20',
    customerName: '테스트 고객',
    dueDate: '2026-08-12T23:59:59+09:00',
    expired: false,
    settlementStatus: 'INCOMPLETED',
    refundStatus: 'NONE',
    refundReceiveAccount: null,
  };
}

/** 응답 원문 → Payment 값 (asCancelable 등 입력용 — 테스트 픽스처 단언). */
export function asPaymentFixture(raw: Record<string, unknown>): Payment {
  return { ...raw, raw } as unknown as Payment;
}

/** CancelTransaction 응답 원문 픽스처. */
export function rawCancelTransaction(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    transactionKey: 'txn-cancel-1',
    cancelAmount: 1000,
    cancelReason: '고객 요청',
    taxFreeAmount: 0,
    taxExemptionAmount: 0,
    refundableAmount: 0,
    transferDiscountAmount: 0,
    easyPayDiscountAmount: 0,
    canceledAt: '2026-08-09T13:00:00+09:00',
    receiptKey: null,
    cancelStatus: 'DONE',
    cancelRequestId: null,
    ...overrides,
  };
}
