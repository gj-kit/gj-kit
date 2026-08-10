/**
 * 시나리오 10 — v1.1 옵션 통합 검증 (설계 §5 C3, 실 api.tosspayments.com · test_sk_ 전용).
 *
 * ① 파사드 풀 배선 왕복 — createTossPayments(인메모리 스토어 전부 + events + audit)로
 *    실발급→approve→getPayment→전액취소 1루프. events 수신 + audit의 Authorization
 *    구조적 부재·billingKey 관측 채널 치환(/v1/billing/[REDACTED]) 확인.
 * ② retry 409 — TossPayments-Test-Code로 IDEMPOTENT_REQUEST_PROCESSING 시뮬 가능 여부
 *    실측 후 분기 검증(시뮬 가능 → onRetry 'idempotent-processing' / 불가 → transport 재시도).
 * ③ autoRefetch 실조회 — 실결제 Payment로 PAYMENT_STATUS_CHANGED(Unverified) 픽스처 합성 →
 *    fetchHandler(waitUntil 주입) 경유 → 핸들러의 w.prefetched가 실 서버 조회 Ok인지 단언.
 *    ⚠ DEPOSIT_CALLBACK은 SecretVerified라 autoRefetch 대상이 아니다 — 대상은 Unverified뿐(§3.5).
 * ④ audit 실응답 redaction 전수 스냅샷 — ①의 memoryAuditSink 엔트리 전체를 순회해
 *    AUDIT_REDACTED_KEYS의 어떤 키도 원문 값으로 남지 않음을 단언.
 *
 * ①·②·③·④는 한 루프(fullLoop 캐시)를 공유한다 — 신규 실호출 ~10회 이내
 * (루프 4 + ③ prefetch 1 + ② 프로브 ≤2(+뒷정리 ≤2) + afterAll revoke 1).
 * ⚠ 키 값(TOSS_SECRET_KEY)은 어떤 로그·실패 메시지에도 싣지 않는다.
 */
import { afterAll, describe, expect, it } from 'vitest';

import {
  AUDIT_REDACTED_KEYS,
  asCancelable,
  createBillingFlow,
  createTossClient,
  createTossEvents,
  createTossPayments,
  generateCustomerKey,
  generateIdempotencyKey,
  generateOrderId,
} from '../../src/server';
import type {
  BillingPayment,
  BillingProfile,
  CancelOutcome,
  RetryOptions,
  TossEvent,
} from '../../src/server';
import type { PaymentStatusChangedEvent, Unverified } from '../../src/webhook';
import {
  TEST_BILLING_CARD,
  memoryAuditSink,
  memoryBillingKeyStore,
  memoryDedupeStore,
  memoryDepositSecretStore,
  memoryOrderStore,
  webhookFixture,
} from '../../src/testing';
import { expectOk, pace, testCancelReason, testOrderName, testSecretKey } from './helpers';

// ─── 파사드 풀 배선 — 인메모리 스토어 전부 + events + audit(memoryAuditSink) ──

const events = createTossEvents();
const sink = memoryAuditSink();
const billingKeys = memoryBillingKeyStore();

/** 수신 이벤트 누적 — 구독은 파사드 생성 전에 걸어도 무방(발화는 호출 시점). */
const received: TossEvent[] = [];
events.on('api.call', (e) => {
  received.push(e);
});
events.on('billing.issued', (e) => {
  received.push(e);
});
events.on('billing.approved', (e) => {
  received.push(e);
});
events.on('cancel.executed', (e) => {
  received.push(e);
});

const kit = createTossPayments({
  secretKey: testSecretKey(),
  orders: memoryOrderStore(),
  depositSecrets: memoryDepositSecretStore(),
  billingKeys,
  billing: { capabilities: { directCardIssue: true } },
  webhook: { dedupe: memoryDedupeStore(), autoRefetch: true },
  events,
  audit: { sink },
});

// ─── 공유 루프 — 실발급→approve→getPayment→전액취소 (①·②·③·④가 공유해 호출 절약) ──

interface LoopResult {
  readonly profile: BillingProfile;
  readonly payment: BillingPayment;
  readonly outcome: CancelOutcome;
}

let trackedProfile: BillingProfile | null = null;
let loopCache: Promise<LoopResult> | null = null;

function fullLoop(): Promise<LoopResult> {
  loopCache ??= (async () => {
    const customerKey = generateCustomerKey();
    await pace();
    const profile = expectOk(
      await kit.billing.issueWithCard({ customerKey, ...TEST_BILLING_CARD }),
      '① 빌링키 실발급(issueWithCard)',
    );
    trackedProfile = profile;

    await pace();
    const payment = expectOk(
      await kit.billing.approve(profile, {
        orderId: generateOrderId('gjv11'),
        orderName: testOrderName(),
        amount: 1000,
      }),
      '① 빌링 승인(approve)',
    );

    await pace();
    const looked = expectOk(await kit.client.getPayment(payment.paymentKey), '① getPayment');
    const cancelable = expectOk(asCancelable(looked), '① asCancelable');
    if (cancelable.kind !== 'settled') {
      throw new Error(`① settled 기대, 실제 kind=${cancelable.kind}`);
    }

    await pace();
    const outcome = expectOk(
      await kit.client.cancels.cancelFully(cancelable, {
        reason: testCancelReason(),
        expectedAmount: 1000,
      }),
      '① 전액 취소(cancelFully)',
    );
    return { profile, payment, outcome };
  })();
  return loopCache;
}

afterAll(async () => {
  if (trackedProfile !== null) {
    await pace();
    const r = await kit.billing.revoke(trackedProfile);
    if (!r.ok) {
      const alreadyRemoved =
        r.error.source === 'toss' && r.error.code === 'ALREADY_REMOVED_BILLING_KEY';
      if (!alreadyRemoved) {
        console.warn('[v11 cleanup] 빌링키 revoke 실패:', JSON.stringify(r.error));
      }
    }
  }
}, 60_000);

// ─── redaction 단언 헬퍼 ─────────────────────────────────────────────────────

const DENYLIST_LOWER: ReadonlySet<string> = new Set(
  AUDIT_REDACTED_KEYS.map((key) => key.toLowerCase()),
);

/** 객체 그래프의 모든 키(소문자)를 수집 — Authorization 구조적 부재 단언용. */
function collectKeysLower(value: unknown, out: Set<string> = new Set()): Set<string> {
  if (value === null || typeof value !== 'object') return out;
  if (Array.isArray(value)) {
    for (const item of value) collectKeysLower(item, out);
    return out;
  }
  for (const [key, child] of Object.entries(value)) {
    out.add(key.toLowerCase());
    collectKeysLower(child, out);
  }
  return out;
}

/** denylist 키가 원문 값으로 남아 있으면 실패 — null/undefined는 "비어 있었다" 보존 계약. */
function assertRedacted(value: unknown, path: string): void {
  if (value === null || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    value.forEach((item, i) => assertRedacted(item, `${path}[${i}]`));
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    if (DENYLIST_LOWER.has(key.toLowerCase())) {
      if (child !== null && child !== undefined) {
        expect(child, `${path}.${key} — 원문 잔존`).toBe('[REDACTED]');
      }
    } else {
      assertRedacted(child, `${path}.${key}`);
    }
  }
}

// ─── ① 파사드 풀 배선 왕복 ───────────────────────────────────────────────────

describe('① 파사드 풀 배선 왕복 — events + audit 자동 배선', () => {
  it(
    '실발급→approve→getPayment→전액취소 + api.call/billing.approved/cancel.executed 수신 + audit 계약',
    async () => {
      const { payment, outcome } = await fullLoop();
      expect(outcome.fullyCanceled).toBe(true);

      // events — 4곳 자동 배선(§3.3): 루프의 실호출 4건이 전부 api.call로 흐른다
      const apiCalls = received.filter((e) => e.type === 'api.call');
      expect(apiCalls.length).toBeGreaterThanOrEqual(4);
      for (const call of apiCalls) {
        if (call.type === 'api.call') expect(call.outcome).toBe('ok');
      }

      const approvedEvents = received.filter((e) => e.type === 'billing.approved');
      expect(approvedEvents.length).toBe(1);
      const approvedEvent = approvedEvents[0];
      if (approvedEvent?.type === 'billing.approved') {
        expect(approvedEvent.payment.paymentKey).toBe(payment.paymentKey);
      }

      const cancelEvents = received.filter((e) => e.type === 'cancel.executed');
      expect(cancelEvents.length).toBe(1);
      const cancelEvent = cancelEvents[0];
      if (cancelEvent?.type === 'cancel.executed') {
        expect(cancelEvent.outcome.fullyCanceled).toBe(true);
      }

      expect(received.filter((e) => e.type === 'billing.issued').length).toBe(1);

      // audit — 시도 1건 = 엔트리 1건. 루프 4건 전부 기록됐다
      expect(sink.entries.length).toBeGreaterThanOrEqual(4);

      // Authorization은 AuditEntry에 필드 자체가 없다(구조적 부재) — 전체 그래프에 키 부재
      for (const entry of sink.entries) {
        expect(collectKeysLower(entry).has('authorization')).toBe(false);
      }
      // 시크릿 키 값이 어디에도 없다 — 값 비교만 하고 실패 메시지에도 싣지 않는다(boolean 단언)
      expect(JSON.stringify(sink.entries).includes(testSecretKey())).toBe(false);

      // billingKey 관측 채널 치환 — 빌링 경로는 authorizations/* 또는 치환본만 존재
      const billingPaths = sink.entries
        .map((e) => e.path)
        .filter((p) => p.startsWith('/v1/billing/'));
      expect(billingPaths.length).toBeGreaterThanOrEqual(2); // 발급 + 승인
      for (const p of billingPaths) {
        expect(
          p === '/v1/billing/[REDACTED]' || p.startsWith('/v1/billing/authorizations/'),
          `빌링 경로 평문 노출: ${p}`,
        ).toBe(true);
      }
      // approve 경로가 실제로 치환본으로 기록됐다
      const approveEntry = sink.entries.find(
        (e) => e.method === 'POST' && e.path === '/v1/billing/[REDACTED]',
      );
      expect(approveEntry).toBeDefined();
    },
    120_000,
  );
});

// ─── ② retry 409 — Test-Code 시뮬 가능 여부 실측 후 분기 검증 ────────────────

describe('② retry 409 — TossPayments-Test-Code 시뮬 실측', () => {
  it(
    'IDEMPOTENT_REQUEST_PROCESSING 시뮬 가능이면 onRetry(idempotent-processing), 불가면 transport 재시도로 대체 검증',
    async () => {
      const { profile, payment } = await fullLoop();

      type RetryInfo = Parameters<NonNullable<RetryOptions['onRetry']>>[0];
      const onRetryCalls: RetryInfo[] = [];
      // retry 켠 클라이언트 + 공유 store 재사용 — profile 봉인은 모듈 공유 심볼이라 그대로 유효
      const retryClient = createTossClient(testSecretKey(), {
        retry: {
          maxAttempts: 2,
          delaysMs: [200],
          onRetry: (info) => {
            onRetryCalls.push(info);
          },
        },
      });
      const retryFlow = createBillingFlow(retryClient, billingKeys);

      await pace();
      const probe = await retryFlow.approve(
        profile,
        { orderId: generateOrderId('gjrt'), orderName: testOrderName(), amount: 1000 },
        {
          idempotencyKey: generateIdempotencyKey(), // 키 부착 — 409 재시도 가드 2b의 전제
          testCode: 'IDEMPOTENT_REQUEST_PROCESSING',
        },
      );

      if (
        !probe.ok &&
        probe.error.source === 'toss' &&
        probe.error.code === 'IDEMPOTENT_REQUEST_PROCESSING'
      ) {
        // 실측(2026-08-10): Test-Code가 IDEMPOTENT_REQUEST_PROCESSING을 재현한다(리서치 문서의
        // "빌링 승인 경로에서 Test-Code 유효" 실측과 정합). testCode는 시도마다 부착되므로
        // 재시도(2회째)도 같은 에러 → 최종 결과는 그 에러의 재생 확인으로 종료 —
        // §3.4 "처리 결과 확인" 시맨틱 그대로다.
        console.info(
          '[실측] TossPayments-Test-Code=IDEMPOTENT_REQUEST_PROCESSING → 시뮬 가능 (onRetry idempotent-processing 발화):',
          JSON.stringify({
            httpStatus: probe.error.httpStatus,
            retryable: probe.error.retryable,
            category: probe.error.category,
          }),
        );
        expect(onRetryCalls.length).toBe(1); // maxAttempts 2 → 재시도 직전 1회 발화
        expect(onRetryCalls[0]?.reason).toBe('idempotent-processing');
        expect(onRetryCalls[0]?.attempt).toBe(1);
        expect(onRetryCalls[0]?.path).toBe('/v1/billing/[REDACTED]'); // 관측 채널 치환 유지
      } else {
        // 실측: Test-Code로 이 코드는 시뮬되지 않는다 — 아래 로그가 실측 증거
        // (probe 에러/성공 원문에는 시크릿 키가 실리지 않는다).
        console.info(
          '[실측] Test-Code=IDEMPOTENT_REQUEST_PROCESSING 시뮬 불가 — 실제 응답:',
          probe.ok
            ? JSON.stringify({ ok: true, status: probe.value.status })
            : JSON.stringify(probe.error),
        );
        expect(onRetryCalls.length).toBe(0);

        if (probe.ok) {
          // Test-Code가 무시돼 실승인이 발생 — 전액 취소로 뒷정리
          await pace();
          const looked = expectOk(
            await kit.client.getPayment(probe.value.paymentKey),
            '② 뒷정리 getPayment',
          );
          const c = expectOk(asCancelable(looked), '② 뒷정리 asCancelable');
          if (c.kind === 'settled') {
            await pace();
            expectOk(
              await kit.client.cancels.cancelFully(c, {
                reason: testCancelReason(),
                expectedAmount: 1000,
              }),
              '② 뒷정리 전액 취소',
            );
          }
        }

        // 대체 검증: transport 재시도 — ⚠ 실 API 호출 아님. 닫힌 로컬 포트(port 1)로
        // NETWORK_ERROR를 유발해 maxAttempts만큼 fetch 시도 + onRetry reason 'transport'를
        // 라이브에 준하는 방식(진짜 fetch 실패)으로 확인한다.
        let fetchCalls = 0;
        const countingFetch: typeof fetch = (input, init) => {
          fetchCalls += 1;
          return globalThis.fetch(input, init);
        };
        const transportRetries: RetryInfo[] = [];
        const badClient = createTossClient(testSecretKey(), {
          baseUrl: 'http://127.0.0.1:1',
          timeoutMs: 3_000,
          fetch: countingFetch,
          retry: {
            maxAttempts: 2,
            delaysMs: [100],
            onRetry: (info) => {
              transportRetries.push(info);
            },
          },
        });
        const r = await badClient.getPayment(payment.paymentKey); // GET — transport 재시도 허용(가드 1)
        if (r.ok) throw new Error('닫힌 포트 호출이 성공할 수 없습니다 — 테스트 환경 이상');
        expect(r.error.source).toBe('network');
        expect(fetchCalls).toBe(2); // maxAttempts만큼 fetch 시도
        expect(transportRetries.length).toBe(1);
        expect(transportRetries[0]?.reason).toBe('transport');
      }
    },
    120_000,
  );
});

// ─── ③ autoRefetch 실조회 — Unverified(PAYMENT_STATUS_CHANGED) 경유 ──────────

describe('③ autoRefetch 실조회 — fetchHandler(waitUntil 주입)', () => {
  it(
    '핸들러가 받은 w.prefetched가 Ok이고 실 서버 조회값(paymentKey 일치)이다',
    async () => {
      const { payment } = await fullLoop();
      // ⚠ DEPOSIT_CALLBACK은 SecretVerified라 autoRefetch 대상이 아니다(§3.5 — 대상은
      // Unverified뿐). 실결제 Payment로 PAYMENT_STATUS_CHANGED 픽스처를 합성한다.
      const fixture = webhookFixture.paymentStatusChanged({
        payment: {
          paymentKey: String(payment.paymentKey),
          orderId: String(payment.orderId),
          status: 'CANCELED', // ①에서 전액 취소 완료 — 실 서버 상태와 정합
        },
      });

      const jobs: Promise<unknown>[] = [];
      let captured: (Unverified & { event: PaymentStatusChangedEvent }) | null = null;
      const handler = kit.webhook.fetchHandler(
        {
          onPaymentStatusChanged: (w) => {
            captured = w;
          },
        },
        // waitUntil 주입 필수 — sync-complete 폴백 모드에서는 prefetch가 실행되지 않는다(§3.5)
        {
          waitUntil: (promise) => {
            jobs.push(promise);
          },
        },
      );

      await pace(); // prefetch가 실 getPayment 1회를 수행한다
      const response = await handler(
        new Request('https://merchant.example/webhooks/toss', {
          method: 'POST',
          headers: fixture.headers,
          body: fixture.rawBody,
        }),
      );
      expect(response.status).toBe(200); // 200 ack 확정이 prefetch·핸들러에 선행(§3.5 계약)
      await Promise.all(jobs);

      if (captured === null) throw new Error('③ onPaymentStatusChanged 핸들러가 호출되지 않았습니다');
      const webhook: Unverified & { event: PaymentStatusChangedEvent } = captured;
      expect(webhook.trust).toBe('unverified'); // 조회 성공해도 승격 없음(§7-2)
      if (webhook.prefetched === undefined) {
        throw new Error('③ prefetched 미첨부 — autoRefetch 배선 또는 waitUntil 경로 실패');
      }
      const prefetched = expectOk(webhook.prefetched, '③ prefetched');
      expect(prefetched.paymentKey).toBe(payment.paymentKey); // 실 서버 조회값
      expect(prefetched.status).toBe('CANCELED');
    },
    120_000,
  );
});

// ─── ④ audit 실응답 redaction 전수 스냅샷 (①과 루프 공유) ────────────────────

describe('④ audit 실응답 redaction 전수 스냅샷', () => {
  it('memoryAuditSink 전 엔트리에 AUDIT_REDACTED_KEYS의 어떤 키도 원문 값으로 없다', async () => {
    await fullLoop();
    expect(sink.entries.length).toBeGreaterThanOrEqual(4);

    // 전수 단언 — req/res 양쪽 그래프를 재귀 순회(denylist 키 = '[REDACTED]' 또는 null)
    sink.entries.forEach((entry, i) => {
      assertRedacted(entry.requestBody, `entries[${i}](${entry.path}).requestBody`);
      if (entry.outcome.kind === 'ok') {
        assertRedacted(entry.outcome.responseBody, `entries[${i}](${entry.path}).responseBody`);
      }
    });

    // 요청 body에 실제로 실렸던 민감 값 — 발급 요청 엔트리에서 키 단위로 직접 단언
    const issueEntry = sink.entries.find((e) => e.path === '/v1/billing/authorizations/card');
    if (issueEntry === undefined) throw new Error('④ 발급 audit 엔트리가 없습니다');
    const issueBody = issueEntry.requestBody as Record<string, unknown>;
    expect(issueBody['cardNumber']).toBe('[REDACTED]'); // 원문: TEST_BILLING_CARD.cardNumber
    expect(issueBody['cardPassword']).toBe('[REDACTED]'); // 원문: '12'
    expect(issueBody['customerIdentityNumber']).toBe('[REDACTED]'); // 원문: '900101'
    expect(issueBody['customerKey']).not.toBe('[REDACTED]'); // 매핑 추적용 — denylist 아님

    // 직렬화 전문에도 원문 값이 없다(카드번호는 유일 원문, 식별번호는 JSON 문자열 값 형태로 검사)
    const serialized = JSON.stringify(sink.entries);
    expect(serialized.includes(TEST_BILLING_CARD.cardNumber)).toBe(false);
    expect(serialized.includes(`"${TEST_BILLING_CARD.customerIdentityNumber}"`)).toBe(false);

    // 응답 쪽 컨텍스트 규칙(card.number) — approve 성공 응답의 카드 마스킹본도 치환됐다
    const approveEntry = sink.entries.find(
      (e) => e.method === 'POST' && e.path === '/v1/billing/[REDACTED]' && e.outcome.kind === 'ok',
    );
    if (approveEntry !== undefined && approveEntry.outcome.kind === 'ok') {
      const body = approveEntry.outcome.responseBody as Record<string, unknown>;
      const card = body['card'] as Record<string, unknown> | null | undefined;
      if (card !== null && card !== undefined) {
        expect(card['number']).toBe('[REDACTED]');
      }
    }
  }, 120_000);
});
