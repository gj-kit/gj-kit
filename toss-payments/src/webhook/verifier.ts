/**
 * createWebhookVerifier — verify(rawBody, headers) + 신뢰 3등급 판정.
 *
 * raw body 강제: 파싱된 객체를 받는 오버로드는 없다 — 서명 검증이 원천 불가능해진다.
 * HMAC은 WebCrypto(globalThis.crypto.subtle)만 사용한다 — Edge 런타임 호환(node: import 금지).
 */
import type { Brand } from '../core/brand';
import { getInternalEmit } from '../core/events';
import type { InternalTossEmit } from '../core/events';
import type { KeyParseError } from '../core/keys';
import type { Payment } from '../core/payment';
import { err, ok } from '../core/result';
import type { Result } from '../core/result';
// 타입 전용 import — webhook→server 런타임 의존을 만들지 않는다(verbatimModuleSyntax로 완전 소거)
import type { TossEvents } from '../server/events';
import { createFetchHandler, createNodeHandler } from './adapters';
import type {
  FetchHandlerOptions,
  NodeIncomingMessageLike,
  NodeServerResponseLike,
  WebhookPrefetchFn,
} from './adapters';
import { parseWebhookEnvelope } from './envelope';
import { createUnverified, TOSS_WEBHOOK_SOURCE_IPS } from './events';
import type {
  AcceptedWebhook,
  LookupError,
  NoPaymentReference,
  PaymentLookup,
  WebhookHandlers,
  WebhookMeta,
  WebhookRejection,
  WebhookVerdict,
} from './events';

// ── SecurityKey — 64자 hex (웹훅 HMAC + 지급대행 JWE 공용 키) ──────────────

export type SecurityKey = string & Brand<'SecurityKey'>;

const HEX_64 = /^[0-9a-fA-F]{64}$/;
const SECURITY_KEY_EXPECTED = '64자 hex (개발자센터 > API 키 > API 개별 키 > 보안 키)';

export function parseSecurityKey(raw: string): Result<SecurityKey, KeyParseError> {
  if (raw.length === 0) {
    return err({
      source: 'library',
      kind: 'invalid-key',
      expected: SECURITY_KEY_EXPECTED,
      reason: 'empty-body',
      message: '보안 키가 비어 있습니다.',
    });
  }
  if (raw.length !== 64) {
    return err({
      source: 'library',
      kind: 'invalid-key',
      expected: SECURITY_KEY_EXPECTED,
      reason: 'bad-length',
      message: `보안 키는 64자 hex 문자열이어야 합니다 — ${raw.length}자를 받았습니다.`,
    });
  }
  if (!HEX_64.test(raw)) {
    // KeyParseError.reason 유니언 제약상 문자 집합 위반은 bad-prefix로 보고한다(메시지로 구분)
    return err({
      source: 'library',
      kind: 'invalid-key',
      expected: SECURITY_KEY_EXPECTED,
      reason: 'bad-prefix',
      message: '보안 키에 hex(0-9a-f) 외 문자가 있습니다.',
    });
  }
  // 검증 통과가 브랜드 부여의 유일한 경로 — 팬텀 브랜드는 단언으로만 각인 가능
  return ok(raw as SecurityKey);
}

// ── 주입 인터페이스 ────────────────────────────────────────────────────────

/**
 * 원자적 단일 메서드 — seen/markSeen 2단계는 TOCTOU 레이스라 금지.
 * 처음 봤으면 점유 후 true, 이미 봤으면 false. 예: Redis `SET NX`.
 * TTL은 재전송 최장 기간(약 3일 19시간)보다 길게 잡을 것 — 권장 5일(432,000초).
 */
export interface WebhookDedupeStore {
  claim(transmissionId: string): Promise<boolean>;
}

export interface DepositSecretSource {
  /** 승인 시 저장해 둔 Payment.secret 조회 — DEPOSIT_CALLBACK에는 paymentKey가 없으므로 orderId가 유일한 키. */
  getSecret(orderId: string): Promise<string | null>;
}

export interface WebhookVerifierConfig {
  /** 필수 — 재전송 최대 7회 + 가상계좌 이중 이벤트(PAYMENT_STATUS_CHANGED+DEPOSIT_CALLBACK 동시 구독). */
  readonly dedupe: WebhookDedupeStore;
  /** 키 로테이션(재발급 병행 기간) 대비 배열 — 서명×키 조합 중 1개 일치 시 통과. */
  readonly securityKeys?: readonly SecurityKey[];
  /** 미주입 상태서 DEPOSIT_CALLBACK 수신 → Err missing-config. */
  readonly depositSecrets?: DepositSecretSource;
  /**
   * 기본: 문서 IP 목록({@link TOSS_WEBHOOK_SOURCE_IPS}) 내장. `false` = 끔.
   * 검사는 verify의 `context.sourceIp` 전달 시에만 수행한다(§7 확정) —
   * 프록시/로드밸런서 뒤에서는 X-Forwarded-For 신뢰 문제로 오탐하기 쉽기 때문.
   * Unverified 이벤트의 보조 방어선일 뿐 암호학적 검증을 대체하지 않는다.
   *
   * IPv4-mapped IPv6(`::ffff:x.x.x.x`)는 비교 전에 순수 IPv4 표기로 정규화한다 —
   * Node dual-stack 리스너의 `req.socket.remoteAddress`가 이 형태이기 때문(목록 항목
   * 쪽도 동일 정규화). 항목은 순수 IPv4 표기 권장.
   */
  readonly allowedSourceIps?: readonly string[] | false;
  /**
   * §3.3 이벤트 버스 — webhook.accepted/duplicate/rejected 발행 지점(요약 필드만 —
   * DEPOSIT_CALLBACK rawBody의 secret은 어떤 이벤트 payload에도 실리지 않는다).
   * createTossEvents 산출물만 발행이 흐른다(구조적 모조 객체는 no-op).
   */
  readonly events?: TossEvents;
  /**
   * §3.5 — 설정 시 fetchHandler/nodeHandler의 핸들러 디스패치 직전(200 ack 이후)에
   * 결제 참조가 있는 Unverified 이벤트를 자동 재조회해 `prefetched`로 첨부한다.
   * dedupe 통과분에만 수행(재전송 7회가 조회 7회가 되지 않음).
   *
   * 수동 verify() 경로는 불변 — verify에 네트워크 호출을 심지 않는다(순수성 + 10초 규약
   * 보존). trust 등급 승격도 없다('unverified' 불변 — 조회 성공은 발신자 진위를 증명하지
   * 않는다, §7-2).
   */
  readonly autoRefetch?: {
    /** 기존 PaymentLookup 구조적 인터페이스 재사용 — webhook→server 런타임 의존 없음. */
    readonly client: PaymentLookup;
    /** 생략 시 결제 참조 보유 이벤트 전부. 분당 100건 쿼터 방어용 필터. */
    readonly eventTypes?: readonly (
      | 'PAYMENT_STATUS_CHANGED'
      | 'CANCEL_STATUS_CHANGED'
      | 'ORDER_PAYMENT_STATUS_CHANGED'
    )[];
  };
}

export type IncomingHeaders =
  | Headers
  | Readonly<Record<string, string | readonly string[] | undefined>>;

export interface WebhookVerifier {
  /**
   * raw body 강제 — 파싱된 객체를 받는 오버로드는 없다(서명 검증 원천 보장).
   * 순서: 헤더 추출 → (sourceIp 전달 시) IP 검사 → 봉투 판별 → 진위 검증 →
   * dedupe.claim(진위 통과 후에만) → verdict.
   */
  verify(
    rawBody: string | Uint8Array,
    headers: IncomingHeaders,
    context?: { readonly sourceIp?: string },
  ): Promise<Result<WebhookVerdict, WebhookRejection>>;

  /**
   * Fetch 표준 어댑터(Next.js Route Handler / Hono) — raw body 추출·검증·dedupe·
   * 10초 내 200 응답을 소유. waitUntil 미제공 서버리스 감지 시 기본은
   * 경고 로그 + 핸들러 동기 완료 후 200 폴백(이벤트 유실 방지).
   */
  fetchHandler(
    handlers: WebhookHandlers,
    options?: FetchHandlerOptions,
  ): (request: Request) => Promise<Response>;

  /** Express/Node — 모든 content-type을 받는 `express.raw()` 뒤에 장착(JSON 파싱 미들웨어 금지). */
  nodeHandler(
    handlers: WebhookHandlers,
  ): (req: NodeIncomingMessageLike, res: NodeServerResponseLike) => Promise<void>;
}

// ── 헤더 정규화 ────────────────────────────────────────────────────────────

const HEADER_TRANSMISSION_ID = 'tosspayments-webhook-transmission-id';
const HEADER_TRANSMISSION_TIME = 'tosspayments-webhook-transmission-time';
const HEADER_RETRIED_COUNT = 'tosspayments-webhook-transmission-retried-count';
const HEADER_SIGNATURE = 'tosspayments-webhook-signature';

function headerValue(headers: IncomingHeaders, name: string): string | null {
  if (headers instanceof Headers) return headers.get(name);
  const lower = name.toLowerCase();
  let found: string | readonly string[] | undefined = headers[name] ?? headers[lower];
  if (found === undefined) {
    for (const key of Object.keys(headers)) {
      if (key.toLowerCase() === lower) {
        found = headers[key];
        break;
      }
    }
  }
  if (found === undefined) return null;
  return typeof found === 'string' ? found : (found[0] ?? null);
}

// ── 바이트/암호 유틸 (WebCrypto 전용) ──────────────────────────────────────

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function base64ToBytes(base64: string): Uint8Array | null {
  try {
    const binary = atob(base64);
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
    return out;
  } catch {
    return null; // 공격자 입력일 수 있는 서명 헤더 — 깨진 base64는 불일치로 취급
  }
}

/** 상수 시간 비교 — 길이 불일치는 조기 반환(길이는 비밀이 아니다). */
function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}

function timingSafeEqualString(a: string, b: string): boolean {
  return timingSafeEqual(textEncoder.encode(a), textEncoder.encode(b));
}

function concatBytes(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

async function hmacSha256(keyBytes: Uint8Array, message: Uint8Array): Promise<Uint8Array> {
  const key = await globalThis.crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return new Uint8Array(await globalThis.crypto.subtle.sign('HMAC', key, message));
}

/** 콤마 구분 복수 서명 — 각 항목은 "v1:<base64>" 형식. v1 외 버전 접두사는 무시한다. */
function parseSignatureHeader(header: string | null): readonly string[] {
  if (header === null) return [];
  return header
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.startsWith('v1:'))
    .map((part) => part.slice(3));
}

/** IPv4-mapped IPv6('::ffff:x.x.x.x') → 순수 IPv4 표기 정규화. 그 외 형태는 그대로. */
function normalizeSourceIp(ip: string): string {
  const lower = ip.toLowerCase();
  return lower.startsWith('::ffff:') ? lower.slice(7) : lower;
}

// ── verifier 본체 ──────────────────────────────────────────────────────────

/**
 * 웹훅 자기 이벤트 3종만 담은 구조적 서브맵 — server `TossEventMap`의 해당 항목과 필드
 * 단위 동일(§3.3). 발행은 이 서브맵으로만 흘러 webhook→server 런타임 의존이 없다.
 */
interface WebhookEmitMap {
  readonly 'webhook.accepted': {
    readonly trust: 'signature' | 'secret' | 'unverified';
    readonly eventType: string;
    readonly transmissionId: string;
  };
  readonly 'webhook.duplicate': { readonly transmissionId: string };
  readonly 'webhook.rejected': { readonly rejection: WebhookRejection };
}

export function createWebhookVerifier(config: WebhookVerifierConfig): WebhookVerifier {
  // 발행 계층 — createTossEvents 산출물이 아니면 null(발행 지점 no-op, 비용 0 수렴)
  const emit: InternalTossEmit<WebhookEmitMap> | null = getInternalEmit<WebhookEmitMap>(
    config.events,
  );

  const verifyImpl: WebhookVerifier['verify'] = async (rawBody, headers, context) => {
    // (1) 헤더 추출 — 공통 헤더(문서)가 없으면 토스 발신으로 볼 수 없다
    const transmissionId = headerValue(headers, HEADER_TRANSMISSION_ID);
    const transmissionTime = headerValue(headers, HEADER_TRANSMISSION_TIME);
    if (transmissionId === null || transmissionTime === null) {
      return err({
        kind: 'parse-failed',
        detail: `필수 웹훅 헤더 누락: ${HEADER_TRANSMISSION_ID} / ${HEADER_TRANSMISSION_TIME}`,
      });
    }
    const retriedRaw = headerValue(headers, HEADER_RETRIED_COUNT);
    const retriedParsed = retriedRaw === null ? Number.NaN : Number.parseInt(retriedRaw, 10);
    const meta: WebhookMeta = {
      transmissionId,
      transmissionTime,
      retriedCount: Number.isNaN(retriedParsed) ? 0 : retriedParsed,
    };

    // (2) IP 검사 — context.sourceIp 전달 시에만 (§7 확정)
    if (context?.sourceIp !== undefined && config.allowedSourceIps !== false) {
      const allowed = config.allowedSourceIps ?? TOSS_WEBHOOK_SOURCE_IPS;
      // IPv4-mapped IPv6 정규화 — Node dual-stack 리스너(server.listen(port) → '::' 바인딩)의
      // req.socket.remoteAddress는 IPv4 클라이언트를 '::ffff:13.124.18.147' 형태로 보고한다.
      // 문자열 완전 일치만 하면 순수 IPv4 표기 허용목록과 전량 불일치 → 정상 웹훅 전량 거부.
      // 허용목록 항목 쪽도 같은 정규화를 적용한다(사용자 제공 목록의 표기 자유 허용).
      const ip = normalizeSourceIp(context.sourceIp);
      if (!allowed.some((entry) => normalizeSourceIp(entry) === ip)) {
        // 거부 에러의 ip는 원본 값 유지 — 디버깅 시 실제 수신 형태가 보이도록
        return err({ kind: 'untrusted-source-ip', ip: context.sourceIp });
      }
    }

    // (3) 봉투 구조 판별
    const bodyText = typeof rawBody === 'string' ? rawBody : textDecoder.decode(rawBody);
    const parsed = parseWebhookEnvelope(bodyText);
    if (!parsed.ok) return parsed;

    // (4) 진위 검증 — 등급별 경로
    let webhook: AcceptedWebhook;
    switch (parsed.value.kind) {
      case 'signed': {
        const keys = config.securityKeys ?? [];
        if (keys.length === 0) return err({ kind: 'missing-config', needed: 'securityKeys' });
        const signatures = parseSignatureHeader(headerValue(headers, HEADER_SIGNATURE));
        // 서명 대상은 수신한 raw body 바이트 그대로 — JSON 재직렬화 후 검증하면 실패한다(문서 경고)
        const bodyBytes = typeof rawBody === 'string' ? textEncoder.encode(rawBody) : rawBody;
        const message = concatBytes(bodyBytes, textEncoder.encode(`:${transmissionTime}`));
        let matched = false;
        for (const key of keys) {
          const mac = await hmacSha256(hexToBytes(key), message);
          for (const signature of signatures) {
            const signatureBytes = base64ToBytes(signature);
            if (signatureBytes !== null && timingSafeEqual(mac, signatureBytes)) matched = true;
          }
        }
        if (!matched) {
          return err({
            kind: 'invalid-signature',
            signatureCount: signatures.length,
            keysTried: keys.length,
          });
        }
        webhook = { trust: 'signature', event: parsed.value.event, meta };
        break;
      }
      case 'deposit': {
        const source = config.depositSecrets;
        if (source === undefined) return err({ kind: 'missing-config', needed: 'depositSecrets' });
        const event = parsed.value.event;
        let stored: string | null;
        try {
          stored = await source.getSecret(event.orderId);
        } catch (cause) {
          return err({ kind: 'store-failure', cause });
        }
        if (stored === null) return err({ kind: 'unknown-order', orderId: event.orderId });
        if (!timingSafeEqualString(stored, parsed.value.secret)) {
          return err({ kind: 'secret-mismatch', orderId: event.orderId });
        }
        // secret은 여기서 소비 완료 — event에는 처음부터 포함되지 않는다(로그 유출 방지)
        webhook = { trust: 'secret', event, meta };
        break;
      }
      case 'unverified':
        webhook = createUnverified(parsed.value.event, meta);
        break;
    }

    // (5) dedupe — 진위 통과 후에만 점유한다 (위조 요청이 정상 웹훅의 id를 선점하지 못하게)
    let fresh: boolean;
    try {
      fresh = await config.dedupe.claim(meta.transmissionId);
    } catch (cause) {
      return err({ kind: 'store-failure', cause });
    }
    if (!fresh) return ok({ duplicate: true, transmissionId: meta.transmissionId });

    // (6) verdict
    return ok({ duplicate: false, webhook });
  };

  // §3.3 이벤트 래퍼 — verdict(Result) 확정 **후** fire-and-forget 발화. 수동 verify와
  // 어댑터 경유 양쪽이 이 단일 지점을 통과한다(중복 발화 없음).
  const verify: WebhookVerifier['verify'] = async (rawBody, headers, context) => {
    const r = await verifyImpl(rawBody, headers, context);
    if (emit !== null) {
      if (!r.ok) {
        emit.emit('webhook.rejected', { rejection: r.error });
      } else if (r.value.duplicate) {
        emit.emit('webhook.duplicate', { transmissionId: r.value.transmissionId });
      } else {
        // 요약 3필드만 — AcceptedWebhook 통짜 전달 금지(secret 제거·타입 순환 회피, §3.3)
        emit.emit('webhook.accepted', {
          trust: r.value.webhook.trust,
          eventType: r.value.webhook.event.eventType,
          transmissionId: r.value.webhook.meta.transmissionId,
        });
      }
    }
    return r;
  };

  // §3.5 prefetch — 어댑터 전용(수동 verify 경로 불변). 결제 참조 보유 이벤트에만 첨부
  // (BILLING_DELETED 등에는 미첨부 — 거짓 제공 금지). trust 승격 없음.
  const autoRefetch = config.autoRefetch;
  const prefetch: WebhookPrefetchFn | undefined =
    autoRefetch === undefined
      ? undefined
      : async (webhook) => {
          if (webhook.trust !== 'unverified') return webhook;
          const eventType = webhook.event.eventType;
          if (
            eventType !== 'PAYMENT_STATUS_CHANGED' &&
            eventType !== 'CANCEL_STATUS_CHANGED' &&
            eventType !== 'ORDER_PAYMENT_STATUS_CHANGED'
          ) {
            return webhook;
          }
          // 분당 100건 쿼터 방어 필터 — 미해당 타입은 prefetched 미첨부(undefined 유지)
          if (autoRefetch.eventTypes !== undefined && !autoRefetch.eventTypes.includes(eventType)) {
            return webhook;
          }
          let prefetched: Result<Payment, LookupError | NoPaymentReference>;
          try {
            prefetched = await webhook.refetch(autoRefetch.client);
          } catch (cause) {
            // PaymentLookup 계약은 Result 반환이지만 사용자 구조적 구현의 throw 방어 —
            // Err로 감싸 핸들러 도달을 보장한다(이벤트를 버리지 않는다, §3.5)
            prefetched = err({ source: 'network', code: 'NETWORK_ERROR', retryable: true, cause });
          }
          // 스프레드는 own enumerable만 복사 — refetch는 객체 리터럴 메서드라 보존된다
          return { ...webhook, prefetched };
        };

  return {
    verify,
    fetchHandler: (handlers, options) => createFetchHandler(verify, handlers, options, prefetch),
    nodeHandler: (handlers) => createNodeHandler(verify, handlers, prefetch),
  };
}
