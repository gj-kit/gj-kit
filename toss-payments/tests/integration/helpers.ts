/**
 * 통합 테스트 헬퍼 — 실제 api.tosspayments.com 호출(test_sk_ 전용, 실과금 없음).
 *
 * - 라이브러리는 공개 API('../../src/server' 등)로만 사용한다 — 내부 계층 접근 금지.
 * - 분당 100건 제한 대응: 모든 실호출 직전 {@link pace}(300ms) — vitest.integration.config.ts의
 *   직렬 실행(fileParallelism: false)과 결합해 여유 있게 한도 아래를 유지한다.
 * - ⚠ 키 값(TOSS_SECRET_KEY)은 어떤 에러 메시지/로그에도 싣지 않는다.
 * - 실패 메시지는 서버 응답 원문(JSON.stringify된 에러 값 — code/message/traceId 포함)을 담는다.
 */
import {
  asCancelable,
  classifyTossErrorCode,
  createBillingFlow,
  createTossClient,
  generateCustomerKey,
  generateIdempotencyKey,
  generateOrderId,
  isTestKey,
  orThrow,
  orderName,
  cancelReason,
  parseApiSecretKey,
} from '../../src/server';
import type {
  ApiSecretKey,
  BillingFlow,
  BillingKeyStore,
  BillingPayment,
  BillingProfile,
  CancelReason,
  CustomerKey,
  OrderName,
  PaymentKey,
  Result,
  SettledCancelable,
  TossApiFailure,
  TossServerClient,
} from '../../src/server';
import { TEST_BILLING_CARD, memoryBillingKeyStore } from '../../src/testing';

// ─── 페이싱 ─────────────────────────────────────────────────────────────────

/** API당 분당 100건 제한(테스트 환경) — 호출 간 최소 300ms 지연. */
export const PACE_MS = 300;

export function pace(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, PACE_MS));
}

// ─── 키 로드 (setup.ts가 루트 .env를 process.env로 로드해 둔 상태) ──────────

/**
 * TOSS_SECRET_KEY → ApiSecretKey<'test'>.
 * isTestKey 술어로 env를 'test'로 내로잉한다 — 이 내로잉이 있어야 CallOptions의
 * testCode(TossPayments-Test-Code)가 타입상 허용된다. live 키면 즉시 중단(실과금 방지).
 */
export function testSecretKey(): ApiSecretKey<'test'> {
  const raw = process.env['TOSS_SECRET_KEY'];
  if (raw === undefined || raw.length === 0) {
    throw new Error('TOSS_SECRET_KEY가 없습니다 — 루트 .env를 확인하세요 (키 값은 로그 금지).');
  }
  const parsed = orThrow(parseApiSecretKey(raw), 'TOSS_SECRET_KEY');
  if (!isTestKey(parsed)) {
    throw new Error('TOSS_SECRET_KEY가 test_sk_ 키가 아닙니다 — 통합 테스트는 테스트 키 전용입니다.');
  }
  return parsed;
}

// ─── 컨텍스트 (클라이언트 + 빌링 플로우 + 뒷정리) ───────────────────────────

export interface IntegrationContext {
  readonly client: TossServerClient<'test', 'api'>;
  /** 카드 직접 발급 capability 활성 — 통합 테스트의 결제 생성 경로(실발급). */
  readonly flow: BillingFlow<'test', { readonly directCardIssue: true }>;
  /** 인메모리 스토어 — 우회 대조 테스트가 record(billingKey 평문)를 꺼낼 수 있는 유일한 공개 경로. */
  readonly store: BillingKeyStore;
  readonly trackForCleanup: (profile: BillingProfile) => void;
  /** afterAll 전용 — 발급한 빌링키 전부 DELETE. ALREADY_REMOVED_BILLING_KEY는 허용(멱등 뒷정리). */
  readonly cleanup: () => Promise<void>;
}

export function createIntegrationContext(): IntegrationContext {
  const client = createTossClient(testSecretKey());
  const store = memoryBillingKeyStore();
  const capabilities = { directCardIssue: true } as const;
  const flow = createBillingFlow(client, store, { capabilities });
  const tracked: BillingProfile[] = [];

  return {
    client,
    flow,
    store,
    trackForCleanup: (profile) => {
      tracked.push(profile);
    },
    async cleanup() {
      for (const profile of tracked) {
        await pace();
        const r = await flow.revoke(profile);
        if (!r.ok) {
          const alreadyRemoved =
            r.error.source === 'toss' && r.error.code === 'ALREADY_REMOVED_BILLING_KEY';
          if (!alreadyRemoved) {
            // 뒷정리 실패는 테스트 실패로 승격하지 않는다 — 관찰 가능하게만 남긴다
            console.warn(
              `[integration cleanup] 빌링키 revoke 실패 (customerKey=${profile.customerKey}):`,
              JSON.stringify(r.error),
            );
          }
        }
      }
    },
  };
}

// ─── Result 단언 (실패 메시지에 서버 응답 원문 포함) ────────────────────────

export function expectOk<T, E>(r: Result<T, E>, label: string): T {
  if (!r.ok) {
    throw new Error(`${label} — Ok 기대, 실제 Err: ${JSON.stringify(r.error)}`);
  }
  return r.value;
}

export function expectErr<T, E>(r: Result<T, E>, label: string): E {
  if (r.ok) {
    throw new Error(`${label} — Err 기대, 실제 Ok: ${JSON.stringify(r.value)}`);
  }
  return r.error;
}

/** 에러 유니언에서 서버(toss) 실패만 추출 — 아니면 원문을 담아 실패시킨다. */
export function expectTossFailure<E extends { readonly source: string }>(
  error: E,
  label: string,
): Extract<E, { readonly source: 'toss' }> {
  if (error.source !== 'toss') {
    throw new Error(`${label} — 서버(toss) 에러 기대, 실제: ${JSON.stringify(error)}`);
  }
  return error as Extract<E, { readonly source: 'toss' }>;
}

// ─── 공용 도메인 값 ─────────────────────────────────────────────────────────

export function testOrderName(): OrderName {
  return orThrow(orderName('gj-kit 통합 테스트 주문'), 'orderName');
}

export function testCancelReason(): CancelReason {
  return orThrow(cancelReason('gj-kit 통합 테스트 취소'), 'cancelReason');
}

// ─── 결제 생성 픽스처 — 빌링키 실발급(issueWithCard) → 승인(approve) ────────

export interface PaidBillingFixture {
  readonly profile: BillingProfile;
  readonly customerKey: CustomerKey;
  /** approve 응답 — type 'BILLING', status 'DONE'. */
  readonly payment: BillingPayment;
}

/**
 * 카드 직접 발급 capability로 빌링키를 실발급하고 amount원을 승인해 결제를 만든다.
 * 카드는 TEST_BILLING_CARD(9410001234567890) — 발급+승인이 전부 통과하는 유일 실측 카드.
 * 발급된 키는 ctx.cleanup()이 DELETE 하도록 자동 추적된다.
 */
export async function createPaidBillingPayment(
  ctx: IntegrationContext,
  amount: number,
): Promise<PaidBillingFixture> {
  const customerKey = generateCustomerKey();
  await pace();
  const issued = await ctx.flow.issueWithCard({ customerKey, ...TEST_BILLING_CARD });
  const profile = expectOk(issued, '빌링키 실발급(issueWithCard)');
  ctx.trackForCleanup(profile);

  await pace();
  const approved = await ctx.flow.approve(
    profile,
    {
      orderId: generateOrderId('gjit'),
      orderName: testOrderName(),
      amount,
    },
    { idempotencyKey: generateIdempotencyKey() },
  );
  const payment = expectOk(approved, `빌링 승인(approve, amount=${amount})`);
  return { profile, customerKey, payment };
}

/** 재조회 → asCancelable → settled 협착까지 한 번에 — 취소 대상 로드의 표준 경로. */
export async function loadSettledTarget(
  ctx: IntegrationContext,
  key: PaymentKey,
  label: string,
): Promise<Extract<SettledCancelable, { readonly partialAllowed: true }>> {
  await pace();
  const looked = await ctx.client.getPayment(key);
  const payment = expectOk(looked, `${label} — getPayment`);
  const cancelable = expectOk(asCancelable(payment), `${label} — asCancelable`);
  if (cancelable.kind !== 'settled' || !cancelable.partialAllowed) {
    throw new Error(
      `${label} — 부분취소 가능 settled 기대, 실제 kind=${cancelable.kind}: ${JSON.stringify(cancelable.payment)}`,
    );
  }
  return cancelable;
}

// ─── raw fetch — 라이브러리를 거치지 않는 우회 대조 실험 전용 ───────────────

export interface RawTossResponse {
  readonly status: number;
  /** 응답 body 원문 — 실패 메시지에 그대로 싣는다. */
  readonly text: string;
  readonly json: unknown;
  readonly traceId: string | null;
}

/**
 * 라이브러리 사전검증이 서버 실동작과 일치하는지 대조하기 위한 직접 호출.
 * 정상 사용 경로 검증에는 쓰지 말 것 — 우회 실험(사전검증 우회, 멱등키 재전송,
 * 봉인이 컴파일 차단하는 요청의 실증)에만 사용한다.
 */
export async function rawTossRequest(init: {
  readonly method: 'GET' | 'POST' | 'DELETE';
  readonly path: string;
  readonly bodyJson?: string;
  readonly idempotencyKey?: string;
}): Promise<RawTossResponse> {
  await pace();
  const headers: Record<string, string> = {
    Authorization: `Basic ${btoa(`${testSecretKey()}:`)}`,
  };
  if (init.bodyJson !== undefined) headers['Content-Type'] = 'application/json';
  if (init.idempotencyKey !== undefined) headers['Idempotency-Key'] = init.idempotencyKey;

  const response = await fetch(`https://api.tosspayments.com${init.path}`, {
    method: init.method,
    headers,
    ...(init.bodyJson !== undefined ? { body: init.bodyJson } : {}),
  });
  const text = await response.text();
  let json: unknown = null;
  if (text.length > 0) {
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
  }
  return {
    status: response.status,
    text,
    json,
    traceId: response.headers.get('x-tosspayments-trace-id'),
  };
}

/**
 * raw 응답({code, message}) → 라이브러리 동형 TossApiFailure.
 * 라이브러리 에러 매핑(classifyTossErrorCode)이 서버 실응답과 일치하는지 대조할 때 쓴다.
 */
export function tossFailureFromRaw(res: RawTossResponse, label: string): TossApiFailure {
  const body =
    typeof res.json === 'object' && res.json !== null
      ? (res.json as { readonly code?: unknown; readonly message?: unknown })
      : {};
  if (typeof body.code !== 'string') {
    throw new Error(`${label} — 토스 에러 형식({code,message})이 아닙니다: HTTP ${res.status}, body: ${res.text}`);
  }
  const classified = classifyTossErrorCode(body.code);
  return {
    source: 'toss',
    code: body.code,
    message: typeof body.message === 'string' ? body.message : res.text,
    httpStatus: res.status,
    category: classified.category,
    retryable: classified.retryable,
    traceId: res.traceId,
  };
}
