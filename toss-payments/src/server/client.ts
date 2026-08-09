/**
 * createTossClient — 토스 서버 API 클라이언트 + 요청 공통 계층.
 *
 * Basic 인증 문자열 생성(`base64(secretKey + ":")` — 콜론 필수, BOM 금지)은 이 모듈
 * 내부에 캡슐화되며 공개 API가 없다 — INCORRECT_BASIC_AUTH_FORMAT 도달 불가 목표(§2).
 */
import { classifyTossErrorCode } from '../core/errors';
import type { TossApiFailure, TransportFailure } from '../core/errors';
import type { IdempotencyKey, OrderId, PaymentKey } from '../core/ids';
import type { ApiSecretKey, Env, WidgetSecretKey } from '../core/keys';
import type { Payment } from '../core/payment';
import { err, ok, type Result } from '../core/result';
import { createCancels, type TossCancels } from './cancel';

export type KeyKind = 'api' | 'widget';

export interface TossClientOptions {
  /** 기본 globalThis.fetch (Node 20+ 내장). 테스트에서는 모킹 주입 지점. */
  readonly fetch?: typeof fetch;
  /** 기본 https://api.tosspayments.com */
  readonly baseUrl?: string;
  /** 기본 30_000ms — AbortSignal.timeout과 호출자 signal을 결합해 적용한다. */
  readonly timeoutMs?: number;
}

export interface CallOptions<E extends Env> {
  /**
   * ≤300자, POST 전용. 처음 사용일부터 15일 유효 — TTL 초과 후 재사용하면 새 요청으로
   * 처리된다(문서). 멱등 판정 조합은 "키 + API 키 + 주소 + 메서드"이며 body는 포함되지
   * 않는다(문서 명시) — 키 재사용 시 body 동일성은 호출자(또는 재시도 티켓)가 보장해야 한다.
   */
  readonly idempotencyKey?: IdempotencyKey;
  /**
   * TossPayments-Test-Code 헤더 — 에러 시나리오 시뮬레이션.
   * 라이브 키에선 서버가 조용히 무시하는 함정 → 타입으로 차단.
   * ⚠ 비분배 조건부 — 미내로잉 union 키(E = Env)도 never다.
   */
  readonly testCode?: [E] extends ['test'] ? string : never;
  readonly signal?: AbortSignal;
}

export type LookupError =
  | TossApiFailure<'NOT_FOUND_PAYMENT' | 'UNAUTHORIZED_KEY' | (string & {})>
  | TransportFailure;

export interface TossServerClient<E extends Env = Env, K extends KeyKind = KeyKind> {
  readonly env: E;
  readonly keyKind: K;
  getPayment(
    key: PaymentKey,
    options?: Pick<CallOptions<E>, 'signal'>,
  ): Promise<Result<Payment, LookupError>>;
  /** DEPOSIT_CALLBACK에는 paymentKey가 없다 — orderId 재조회가 1급 경로. */
  getPaymentByOrderId(
    orderId: OrderId,
    options?: Pick<CallOptions<E>, 'signal'>,
  ): Promise<Result<Payment, LookupError>>;
  readonly cancels: TossCancels<E>;
}

// ─── 내부 요청 계층 — server/index.ts에서 재export하지 않는다 ───────────────

/** (내부) 요청 서술 — bodyJson은 호출자가 직렬화한다(재시도 티켓의 바이트 동일성 보장). */
export interface TossHttpInit {
  readonly method: 'GET' | 'POST' | 'DELETE';
  /** baseUrl 뒤에 붙는 경로 — 경로 세그먼트는 호출자가 encodeURIComponent 처리. */
  readonly path: string;
  readonly bodyJson?: string | undefined;
  readonly idempotencyKey?: string | undefined;
  readonly testCode?: string | undefined;
  readonly signal?: AbortSignal | undefined;
}

/** (내부) 공통 요청 계층 — 인증/타임아웃/에러 분류를 소유한다. */
export interface TossHttp {
  request(init: TossHttpInit): Promise<Result<unknown, TossApiFailure | TransportFailure>>;
}

/**
 * (내부) 클라이언트에 http 계층을 매다는 비공개 심볼 — 비열거라 JSON/스프레드에 새지 않고,
 * 공개 타입 TossServerClient에도 나타나지 않는다. confirm/billing 플로우가 이 심볼로
 * confirm/빌링 엔드포인트에 접근한다 (공개 표면에 raw request API를 두지 않기 위함).
 */
const internalHttp: unique symbol = Symbol('gj-kit/toss-payments#server-http');

/** (내부) createTossClient 산출물에서 http 계층을 꺼낸다 — 구조적 모조 client면 null. */
export function getInternalHttp(client: TossServerClient): TossHttp | null {
  // 비공개 심볼 프로퍼티 조회 — 공개 타입에 없는 필드라 단언이 불가피 (심볼은 이 모듈 밖 비공개)
  const holder = client as { readonly [internalHttp]?: TossHttp };
  return holder[internalHttp] ?? null;
}

/**
 * (내부) createTossClient 산출물이 아닌 구조적 모조 client가 주입된 경우의 실패 값.
 * 공개 에러 유니언을 늘리지 않기 위해 TransportFailure로 표현한다 — cause에 원인 명시.
 */
export function missingInternalHttpFailure(): TransportFailure {
  return {
    source: 'network',
    code: 'NETWORK_ERROR',
    retryable: true,
    cause: new Error(
      'createTossClient로 생성된 클라이언트가 아닙니다 — 내부 요청 계층이 없어 API를 호출할 수 없습니다.',
    ),
  };
}

/**
 * (내부) 응답 원문 → Payment. 필드는 문서 근거 타입을 신뢰하고 원문 전체를 `raw`에 보존한다
 * (전체 런타임 스키마 검증은 범위 밖 — 타입에 없는 필드의 탈출구가 raw).
 */
export function parsePayment(data: unknown): Payment {
  const record: Record<string, unknown> =
    typeof data === 'object' && data !== null ? (data as Record<string, unknown>) : {};
  // 응답 shape 단언 — 위 문서 근거. Payment는 인터페이스 유니언이라 이중 단언이 필요하다.
  return { ...record, raw: data } as unknown as Payment;
}

/**
 * (내부) parsePayment의 Result 버전 — Payment를 반환해야 하는 소비 지점(confirm/approve/조회)
 * 전용 가드. 2xx인데 body가 비었거나(revoke처럼 빈 2xx가 정상인 API의 경로가 request()에서
 * ok(null)로 흐른다) 비객체 JSON이거나 필수 필드가 없으면, '전부 undefined인 Payment'를
 * 제조하는 대신 전송 계층 이상(TransportFailure, retryable)으로 표면화한다.
 */
export function parsePaymentChecked(data: unknown): Result<Payment, TransportFailure> {
  const record = typeof data === 'object' && data !== null ? (data as Record<string, unknown>) : null;
  if (
    record === null ||
    typeof record['paymentKey'] !== 'string' ||
    typeof record['orderId'] !== 'string' ||
    typeof record['status'] !== 'string'
  ) {
    return err({
      source: 'network',
      code: 'NETWORK_ERROR',
      retryable: true,
      cause: new Error(
        '2xx 응답에 Payment 필수 필드(paymentKey/orderId/status)가 없습니다 — 응답 이상. 조회 API로 실제 상태를 재확인하세요.',
      ),
    });
  }
  return ok(parsePayment(record));
}

/** AbortSignal.any는 Node 20.3+ — engines 하한(20.0)에서도 동작하도록 폴백 결합. */
function combineSignals(a: AbortSignal, b: AbortSignal): AbortSignal {
  if (typeof AbortSignal.any === 'function') return AbortSignal.any([a, b]);
  const controller = new AbortController();
  const forward = (s: AbortSignal) => {
    if (s.aborted) controller.abort(s.reason);
    else s.addEventListener('abort', () => controller.abort(s.reason), { once: true });
  };
  forward(a);
  forward(b);
  return controller.signal;
}

function createHttp(secretKey: string, options: TossClientOptions): TossHttp {
  const fetchImpl = options.fetch ?? globalThis.fetch;
  const baseUrl = options.baseUrl ?? 'https://api.tosspayments.com';
  const timeoutMs = options.timeoutMs ?? 30_000;
  // Basic 인증 캡슐화 — 콜론 필수(문서: 콜론 누락·UTF-8 BOM이 대표 실수)
  const authorization = `Basic ${btoa(`${secretKey}:`)}`;

  return {
    async request(init) {
      const timeout = AbortSignal.timeout(timeoutMs);
      const signal = init.signal === undefined ? timeout : combineSignals(timeout, init.signal);

      const headers: Record<string, string> = { Authorization: authorization };
      if (init.bodyJson !== undefined) headers['Content-Type'] = 'application/json';
      if (init.idempotencyKey !== undefined) headers['Idempotency-Key'] = init.idempotencyKey;
      if (init.testCode !== undefined) headers['TossPayments-Test-Code'] = init.testCode;

      const transportErr = (cause: unknown): Result<never, TransportFailure> =>
        err({
          source: 'network',
          code: timeout.aborted ? 'TIMEOUT' : 'NETWORK_ERROR',
          retryable: true,
          cause,
        });

      let response: Response;
      try {
        response = await fetchImpl(baseUrl + init.path, {
          method: init.method,
          headers,
          ...(init.bodyJson !== undefined ? { body: init.bodyJson } : {}),
          signal,
        });
      } catch (cause) {
        return transportErr(cause);
      }

      const traceId = response.headers.get('x-tosspayments-trace-id');

      let text: string;
      try {
        text = await response.text();
      } catch (cause) {
        return transportErr(cause);
      }

      let data: unknown = null;
      let parseFailed = false;
      if (text.length > 0) {
        try {
          data = JSON.parse(text);
        } catch {
          parseFailed = true;
        }
      }

      if (!response.ok) {
        // 에러 응답 {code, message} 원문 무손실 보존
        const body =
          typeof data === 'object' && data !== null
            ? (data as { readonly code?: unknown; readonly message?: unknown })
            : {};
        if (typeof body.code !== 'string') {
          // 비-2xx인데 토스 에러 형식({code, message})이 아님 — 게이트웨이/프록시/LB 응답
          // (502 HTML, 504 빈 body 등). 진짜 토스 에러는 항상 {code, message} JSON이므로
          // source:'toss'로 오분류하면 retryable:false 각인 + cancel의 retry 티켓 미발급
          // (응답 유실 복구 구멍)이 된다 — 전송 계층 이상으로 분류한다.
          return transportErr(
            new Error(`비-2xx 비토스 형식 응답: HTTP ${response.status}, body: ${text.slice(0, 200)}`),
          );
        }
        const code = body.code;
        const message = typeof body.message === 'string' ? body.message : text;
        const classified = classifyTossErrorCode(code);
        return err({
          source: 'toss',
          code,
          message,
          httpStatus: response.status,
          category: classified.category,
          retryable: classified.retryable,
          traceId,
        });
      }

      if (parseFailed) {
        // 2xx인데 본문이 JSON이 아님 — 프록시 응답 등 전송 계층 이상으로 분류
        return transportErr(new Error(`2xx 응답 본문 JSON 파싱 실패: ${text.slice(0, 200)}`));
      }
      return ok(data);
    },
  };
}

/**
 * 오버로드로 키 종류가 각인된다 — 위젯 상점의 confirm은 gsk 필수(키 쌍 규칙, 불일치 시
 * INVALID_API_KEY — 400인 점 주의). 빌링 플로우는 'api' KeyKind만 받는다.
 */
export function createTossClient<E extends Env>(
  key: ApiSecretKey<E>,
  options?: TossClientOptions,
): TossServerClient<E, 'api'>;
export function createTossClient<E extends Env>(
  key: WidgetSecretKey<E>,
  options?: TossClientOptions,
): TossServerClient<E, 'widget'>;
export function createTossClient(
  key: string,
  options: TossClientOptions = {},
): TossServerClient<Env, KeyKind> {
  const env: Env = key.startsWith('live_') ? 'live' : 'test';
  const keyKind: KeyKind =
    key.startsWith('test_gsk_') || key.startsWith('live_gsk_') ? 'widget' : 'api';
  const http = createHttp(key, options);

  const lookup = async (path: string, signal: AbortSignal | undefined) => {
    const r = await http.request({ method: 'GET', path, signal });
    // 2xx라도 빈 body/비객체 JSON이면 '빈 Payment' 제조 금지 — 가드 통과 후에만 Ok
    return r.ok ? parsePaymentChecked(r.value) : r;
  };

  const client: TossServerClient<Env, KeyKind> = {
    env,
    keyKind,
    getPayment: (paymentKey, callOptions) =>
      lookup(`/v1/payments/${encodeURIComponent(paymentKey)}`, callOptions?.signal),
    getPaymentByOrderId: (orderId, callOptions) =>
      lookup(`/v1/payments/orders/${encodeURIComponent(orderId)}`, callOptions?.signal),
    cancels: createCancels(http),
  };
  Object.defineProperty(client, internalHttp, { value: http, enumerable: false });
  return client;
}
