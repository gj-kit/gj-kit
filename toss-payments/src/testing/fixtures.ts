/**
 * 웹훅 픽스처 — 실수신 자동화 불가(Phase 0 확정) 대응.
 *
 * 토스는 (a) localhost URL 등록 불가, (b) 웹훅 등록/관리 API 부재(개발자센터 UI
 * 전용), (c) 가상계좌 입금의 개발자센터 수동 버튼 의존 때문에 CI에서 실제 웹훅을
 * 받을 수 없다. 대신 이벤트 스키마·헤더·서명 산식이 완전히 문서화되어 있으므로
 * 페이로드를 합성해 `createWebhookVerifier().verify(rawBody, headers)`에 넣는
 * 왕복 테스트가 공식 대체 경로다.
 * 출처: docs/research/toss-payments-v2.md "Phase 0 확인 결과" 7.
 *
 * 서명·인코딩은 WebCrypto/btoa만 사용한다(플랫폼 중립 — node: 빌트인 금지).
 */
import type { Payment } from '../core/payment';
import type { DepositCallbackEvent } from '../webhook/events';
import type { SecurityKey } from '../webhook/verifier';

/** 픽스처 산출물 — verify(rawBody, headers)에 그대로 넣는다. */
type WebhookFixturePayload = {
  rawBody: string;
  headers: Record<string, string>;
};

/** Omit의 비분배 문제 회피 — Payment 같은 유니언에 변형별로 Omit을 적용한다. */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

// ── 시간 형식 헬퍼 ─────────────────────────────────────────────────────────
// 토스 웹훅의 createdAt은 이벤트마다 형식이 다르다(문서):
// 구형 = 마이크로초 6자리 무오프셋(KST), DEPOSIT_CALLBACK/신형 = ±hh:mm 오프셋.

/** `yyyy-MM-dd'T'HH:mm:ss+09:00` — DEPOSIT_CALLBACK/신형 이벤트·전송 헤더 형식. */
function kstOffsetTimestamp(date: Date): string {
  const kst = new Date(date.getTime() + 9 * 3_600_000);
  return `${kst.toISOString().slice(0, 19)}+09:00`;
}

/** `yyyy-MM-dd'T'HH:mm:ss.SSSSSS` — 구형 이벤트의 마이크로초 6자리 무오프셋(KST) 형식. */
function kstMicroTimestamp(date: Date): string {
  const kst = new Date(date.getTime() + 9 * 3_600_000);
  return `${kst.toISOString().slice(0, 23)}000`;
}

// ── 공통 헤더 ──────────────────────────────────────────────────────────────

/**
 * 문서 공통 헤더 3종. transmission-id는 호출마다 새로 발급된다 —
 * dedupe(중복 수신) 테스트는 같은 픽스처 산출물을 재사용해 재현한다.
 */
function baseHeaders(transmissionTime: string): Record<string, string> {
  return {
    'tosspayments-webhook-transmission-id': globalThis.crypto.randomUUID(),
    'tosspayments-webhook-transmission-time': transmissionTime,
    'tosspayments-webhook-transmission-retried-count': '0',
  };
}

// ── 바이트/HMAC 유틸 (WebCrypto 전용) ──────────────────────────────────────

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/**
 * `tosspayments-webhook-signature` 헤더 값 생성 —
 * HMAC-SHA256("{rawBody}:{transmissionTime}", 보안 키) → base64에 "v1:" 접두사.
 *
 * ⚠ 설계 문서(§3.6)의 동기 시그니처에서 Promise 반환으로 변형했다: 서명은
 * WebCrypto(`crypto.subtle`)로만 계산하는데(플랫폼 중립 — node:crypto 금지)
 * subtle API가 Promise 전용이라 동기 반환이 불가능하다.
 */
export async function signWebhookPayload(
  rawBody: string,
  transmissionTime: string,
  key: SecurityKey,
): Promise<string> {
  const cryptoKey = await globalThis.crypto.subtle.importKey(
    'raw',
    hexToBytes(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const mac = new Uint8Array(
    await globalThis.crypto.subtle.sign(
      'HMAC',
      cryptoKey,
      new TextEncoder().encode(`${rawBody}:${transmissionTime}`),
    ),
  );
  return `v1:${bytesToBase64(mac)}`;
}

// ── 구형 이벤트 기본 Payment 원문 ──────────────────────────────────────────

/**
 * PAYMENT_STATUS_CHANGED data 기본값 — 카드 결제 응답 원문 형태.
 * 실제 웹훅 data는 Payment 전체 객체이므로(문서) 판별 최소 필드만 넣으면
 * 핸들러 테스트에서 쓸 수 없는 반쪽 이벤트가 된다. 입력이 항상 우선한다.
 */
function defaultPaymentData(): Record<string, unknown> {
  return {
    version: '2022-11-16',
    type: 'NORMAL',
    orderName: '테스트 주문',
    mId: 'tvivarepublica',
    currency: 'KRW',
    method: '카드',
    totalAmount: 1000,
    balanceAmount: 1000,
    requestedAt: '2026-08-09T12:00:00+09:00',
    approvedAt: '2026-08-09T12:00:05+09:00',
    useEscrow: false,
    lastTransactionKey: null,
    suppliedAmount: 909,
    vat: 91,
    taxFreeAmount: 0,
    taxExemptionAmount: 0,
    cancels: null,
    isPartialCancelable: true,
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
  };
}

// ── 픽스처 본체 ────────────────────────────────────────────────────────────

/**
 * verify(rawBody, headers) 왕복 테스트용 웹훅 페이로드 합성기.
 *
 * 봉투 3종(구형 {eventType,data} / 평탄 DEPOSIT_CALLBACK / 신형 {eventId,entityBody})
 * 을 실제 전송 형식(헤더·createdAt 포맷 포함)대로 만든다.
 */
export const webhookFixture = {
  /**
   * 평탄 구조 DEPOSIT_CALLBACK — eventType·paymentKey 없이 5필드
   * (createdAt/secret/status/transactionKey/orderId)뿐인 실제 형식.
   *
   * verify를 통과시키려면 `depositSecrets.getSecret(orderId)`가 여기 넣은
   * secret과 같은 값을 돌려줘야 한다(승인 시 저장한 Payment.secret 대조 모델).
   * 검증 통과 후 이벤트에는 secret이 남지 않는다(로그 유출 방지 — verifier 규약).
   */
  depositCallback(input: {
    orderId: string;
    secret: string;
    status?: DepositCallbackEvent['status'];
    transactionKey?: string;
  }): WebhookFixturePayload {
    const now = new Date();
    const rawBody = JSON.stringify({
      createdAt: kstOffsetTimestamp(now),
      secret: input.secret,
      status: input.status ?? 'DONE',
      transactionKey: input.transactionKey ?? `txn-${globalThis.crypto.randomUUID()}`,
      orderId: input.orderId,
    });
    return { rawBody, headers: baseHeaders(kstOffsetTimestamp(now)) };
  },

  /**
   * 구형 PAYMENT_STATUS_CHANGED — data는 카드 결제 원문 기본값 위에 입력을
   * 덮어쓴 Payment 전체 객체다(입력이 항상 우선 — 상태와 금액의 정합은 호출자 책임).
   *
   * paymentKey/orderId를 raw string으로 받도록 브랜드 필드만 Omit했다 —
   * 설계 문서 표기(`Partial<Payment> & {...}`) 그대로는 교집합이 브랜드 타입을
   * 요구해 plain string 입력이 컴파일 에러가 된다(문서 의도 보존 변형).
   */
  paymentStatusChanged(input: {
    payment: DistributiveOmit<Partial<Payment>, 'paymentKey' | 'orderId'> & {
      paymentKey: string;
      orderId: string;
      status: 'DONE' | 'CANCELED' | 'PARTIAL_CANCELED' | 'ABORTED' | 'EXPIRED';
    };
  }): WebhookFixturePayload {
    const now = new Date();
    const rawBody = JSON.stringify({
      eventType: 'PAYMENT_STATUS_CHANGED',
      createdAt: kstMicroTimestamp(now),
      data: { ...defaultPaymentData(), ...input.payment },
    });
    return { rawBody, headers: baseHeaders(kstOffsetTimestamp(now)) };
  },

  /**
   * 구형 봉투 {eventType, createdAt, data} 저수준 합성기 — BILLING_DELETED 등
   * 나머지 구형 이벤트와 미지 이벤트(UNKNOWN 전방 호환 경로) 테스트용.
   * data 구조는 검증하지 않는다 — 기대 구조와 다르면 verifier가 UNKNOWN으로 수용한다.
   */
  legacyEvent(eventType: string, data: unknown): WebhookFixturePayload {
    const now = new Date();
    const rawBody = JSON.stringify({
      eventType,
      createdAt: kstMicroTimestamp(now),
      data,
    });
    return { rawBody, headers: baseHeaders(kstOffsetTimestamp(now)) };
  },

  /**
   * 신형 서명 이벤트(payout.changed / seller.changed) — 유효 HMAC 서명 헤더 포함.
   * 생성→검증 왕복으로 SignatureVerified 등급을 테스트한다.
   *
   * ⚠ 설계 문서(§3.6)의 동기 시그니처에서 Promise 반환으로 변형 —
   * 서명 계산이 WebCrypto 전용이라 비동기가 불가피하다({@link signWebhookPayload} 참조).
   */
  async signedEvent(input: {
    eventType: 'payout.changed' | 'seller.changed';
    entityBody: unknown;
    securityKey: SecurityKey;
    transmissionTime?: string;
  }): Promise<WebhookFixturePayload> {
    const transmissionTime = input.transmissionTime ?? kstOffsetTimestamp(new Date());
    const rawBody = JSON.stringify({
      eventType: input.eventType,
      createdAt: transmissionTime,
      version: '2022-11-16',
      eventId: globalThis.crypto.randomUUID(),
      entityType: input.eventType === 'payout.changed' ? 'payout' : 'seller',
      // undefined는 JSON 직렬화에서 키가 사라져 신형 봉투 판별(entityBody 존재)이 깨진다
      entityBody: input.entityBody ?? null,
    });
    const headers = baseHeaders(transmissionTime);
    headers['tosspayments-webhook-signature'] = await signWebhookPayload(
      rawBody,
      transmissionTime,
      input.securityKey,
    );
    return { rawBody, headers };
  },
};
