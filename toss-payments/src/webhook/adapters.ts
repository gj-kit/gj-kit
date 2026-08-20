/**
 * 프레임워크 어댑터 — fetchHandler(Next.js Route Handler / Hono) + nodeHandler(Express).
 *
 * raw body 보존·검증·dedupe·처리 claim 수명주기를 라이브러리가 소유한다.
 * 검증 거부는 400, body 상한 초과는 413, store 장애와 이미 처리 중인 전달은 503으로 재전송을 유도한다.
 * duplicate는 정상 200 ack — 400을 돌려주면 3일 19시간 재전송 폭탄을 맞는다.
 */
import type { Result } from '../core/result';
import type {
  AcceptedWebhook,
  WebhookHandlers,
  WebhookRejection,
  WebhookVerdict,
} from './events';
// 타입 전용 import — verifier ↔ adapters의 런타임 순환을 만들지 않는다(verbatimModuleSyntax로 완전 소거)
import type { IncomingHeaders } from './verifier';

/** verifier.verify와 동일 시그니처. 어댑터는 신뢰 가능한 sourceIp 추출 결과를 전달한다. */
export type WebhookVerifyFn = (
  rawBody: string | Uint8Array,
  headers: IncomingHeaders,
  context?: { readonly sourceIp?: string },
) => Promise<Result<WebhookVerdict, WebhookRejection>>;

export type WebhookClaimAction = (dedupeKey: string) => Promise<void>;

/**
 * §3.5 autoRefetch 첨부 훅(내부) — verifier가 조립해 어댑터에 넘긴다.
 * 실행 시점 계약: 핸들러 디스패치 직전·dedupe 통과분만.
 * 반환 웹훅은 prefetched만 첨부될 뿐 trust 등급·event는 불변이다.
 */
export type WebhookPrefetchFn = (webhook: AcceptedWebhook) => Promise<AcceptedWebhook>;

export interface FetchHandlerOptions {
  /**
   * 수신 raw body의 최대 바이트 수. 기본 256 KiB.
   *
   * Content-Length가 이 값을 넘으면 body를 읽기 전에 413을 반환하고, 길이 헤더가
   * 없거나 거짓이어도 스트림을 이 값까지만 누적한다. webhook payload는 작아야 하므로
   * 앱의 reverse proxy/body-parser 제한과 같은 값으로 맞추는 것을 권장한다.
   */
  readonly maxBodyBytes?: number;
  /**
   * 신뢰할 수 있는 런타임/ingress 메타데이터에서 원본 클라이언트 IP를 추출한다.
   * X-Forwarded-For를 무조건 믿지 말고, 해당 ingress가 재작성한 값만 사용할 것.
   */
  readonly sourceIp?: (request: Request) => string | null | undefined;
}

export interface NodeHandlerOptions {
  /**
   * 수신 raw body의 최대 바이트 수. 기본 256 KiB.
   *
   * Content-Length 초과는 body를 읽기 전에 413으로 거부한다. 스트림 경로도 누적 상한을
   * 적용한다. `express.raw()`가 이미 Buffer를 만들었다면 그 할당을 되돌릴 수 없으므로
   * `express.raw({ limit: maxBodyBytes })`를 함께 설정해야 한다.
   */
  readonly maxBodyBytes?: number;
  /** 프록시 트러스트 설정을 반영한 원본 IP 추출기. 생략 시 socket.remoteAddress. */
  readonly sourceIp?: (request: NodeIncomingMessageLike) => string | null | undefined;
}

/** Fetch/Node 어댑터가 기본으로 수용하는 최대 raw webhook body 크기(256 KiB). */
export const DEFAULT_WEBHOOK_MAX_BODY_BYTES = 256 * 1024;

/** Node IncomingMessage와 구조 호환 — node: 빌트인 타입 import 없이 플랫폼 중립을 유지한다. */
export interface NodeIncomingMessageLike extends AsyncIterable<unknown> {
  readonly headers: Readonly<Record<string, string | readonly string[] | undefined>>;
  /** express.raw() 사용 시 Buffer가 이미 실려 온다 — 스트림 대신 그것을 쓴다. */
  readonly body?: unknown;
  readonly socket?: { readonly remoteAddress?: string | undefined };
}

/** Node ServerResponse와 구조 호환. */
export interface NodeServerResponseLike {
  statusCode: number;
  end(): unknown;
}

type BodyReadResult =
  | { readonly kind: 'ok'; readonly body: Uint8Array }
  | { readonly kind: 'too-large' };

const encoder = new TextEncoder();

function resolveMaxBodyBytes(value: number | undefined): number {
  const maxBodyBytes = value ?? DEFAULT_WEBHOOK_MAX_BODY_BYTES;
  if (!Number.isSafeInteger(maxBodyBytes) || maxBodyBytes <= 0) {
    throw new TypeError('maxBodyBytes는 0보다 큰 안전한 정수여야 합니다.');
  }
  return maxBodyBytes;
}

function contentLengthExceeds(
  headers: Readonly<Record<string, string | readonly string[] | undefined>> | Headers,
  maxBodyBytes: number,
): boolean {
  let raw: string | null | undefined;
  if (headers instanceof Headers) {
    raw = headers.get('content-length');
  } else {
    let value = headers['content-length'];
    if (value === undefined) {
      for (const key of Object.keys(headers)) {
        if (key.toLowerCase() === 'content-length') {
          value = headers[key];
          break;
        }
      }
    }
    raw = value === undefined ? undefined : (typeof value === 'string' ? value : value[0]);
  }
  if (raw === null || raw === undefined || !/^\d+$/.test(raw)) return false;
  const length = Number(raw);
  return Number.isSafeInteger(length) && length > maxBodyBytes;
}

function tooLargeResponse(): Response {
  return new Response(null, { status: 413 });
}

function writePayloadTooLarge(res: NodeServerResponseLike): void {
  res.statusCode = 413;
  res.end();
}

async function readFetchBody(request: Request, maxBodyBytes: number): Promise<BodyReadResult> {
  const stream = request.body;
  if (stream === null) return { kind: 'ok', body: new Uint8Array() };

  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) return { kind: 'ok', body: concatChunks(chunks) };
      if (value === undefined) continue;
      total += value.byteLength;
      if (total > maxBodyBytes) {
        // 더 큰 request를 계속 읽지 않는다. cancel 실패는 이미 413을 보낼 결정에 영향을 주지 않는다.
        await reader.cancel().catch(() => undefined);
        return { kind: 'too-large' };
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
}

async function readNodeStream(
  req: NodeIncomingMessageLike,
  maxBodyBytes: number,
): Promise<BodyReadResult> {
  const chunks: Uint8Array[] = [];
  let total = 0;
  for await (const chunk of req) {
    const bytes =
      chunk instanceof Uint8Array
        ? chunk
        : typeof chunk === 'string'
          ? encoder.encode(chunk)
          : undefined;
    if (bytes === undefined) continue;
    total += bytes.byteLength;
    if (total > maxBodyBytes) return { kind: 'too-large' };
    chunks.push(bytes);
  }
  return { kind: 'ok', body: concatChunks(chunks) };
}

/**
 * 이벤트 → 핸들러 디스패치.
 *
 * 핸들러 예외는 호출자에게 전파된다. 어댑터가 claim을 release하고 500을 반환하므로
 * 재전송이 다시 비즈니스 처리에 도달할 수 있다.
 */
export async function dispatchWebhook(
  handlers: WebhookHandlers,
  webhook: AcceptedWebhook,
): Promise<void> {
  if (webhook.trust === 'secret') {
    await handlers.onDepositCallback?.(webhook);
    return;
  }
  if (webhook.trust === 'signature') {
    const event = webhook.event;
    if (event.eventType === 'payout.changed') {
      await handlers.onPayoutChanged?.({ ...webhook, event });
    } else {
      await handlers.onSellerChanged?.({ ...webhook, event });
    }
    return;
  }
  const event = webhook.event;
  switch (event.eventType) {
    case 'PAYMENT_STATUS_CHANGED':
      await handlers.onPaymentStatusChanged?.({ ...webhook, event });
      return;
    case 'CANCEL_STATUS_CHANGED':
      await handlers.onCancelStatusChanged?.({ ...webhook, event });
      return;
    case 'BILLING_DELETED':
      await handlers.onBillingDeleted?.({ ...webhook, event });
      return;
    case 'METHOD_UPDATED':
      await handlers.onMethodUpdated?.({ ...webhook, event });
      return;
    case 'CUSTOMER_STATUS_CHANGED':
      await handlers.onCustomerStatusChanged?.({ ...webhook, event });
      return;
    case 'ORDER_PAYMENT_STATUS_CHANGED':
      await handlers.onOrderPaymentStatusChanged?.({ ...webhook, event });
      return;
    case 'ars-reservation.changed':
      await handlers.onArsReservationChanged?.({ ...webhook, event });
      return;
    case 'UNKNOWN':
      await handlers.onUnknownEvent?.({ ...webhook, event });
      return;
  }
}

function logHandlerFailure(cause: unknown): void {
  console.error('[@gj-kit/toss-payments] 웹훅 핸들러에서 처리되지 않은 예외:', cause);
}

/** Fetch 표준 어댑터 팩토리 — verifier.fetchHandler가 사용한다. */
export function createFetchHandler(
  verify: WebhookVerifyFn,
  handlers: WebhookHandlers,
  options?: FetchHandlerOptions,
  prefetch?: WebhookPrefetchFn,
  complete?: WebhookClaimAction,
  release?: WebhookClaimAction,
): (request: Request) => Promise<Response> {
  const maxBodyBytes = resolveMaxBodyBytes(options?.maxBodyBytes);
  return async (request) => {
    if (contentLengthExceeds(request.headers, maxBodyBytes)) return tooLargeResponse();
    const body = await readFetchBody(request, maxBodyBytes);
    if (body.kind === 'too-large') return tooLargeResponse();
    const sourceIp = options?.sourceIp?.(request) ?? undefined;
    const result = await verify(
      body.body,
      request.headers,
      sourceIp === undefined ? undefined : { sourceIp },
    );
    if (!result.ok) {
      const retryable = result.error.kind === 'store-failure' || result.error.kind === 'processing';
      return new Response(null, { status: retryable ? 503 : 400 });
    }
    if (result.value.duplicate) return new Response(null, { status: 200 });
    const webhook = result.value.webhook;
    try {
      const prepared = prefetch === undefined ? webhook : await prefetch(webhook);
      await dispatchWebhook(handlers, prepared);
      await complete?.(webhook.meta.dedupeKey);
      return new Response(null, { status: 200 });
    } catch (cause) {
      logHandlerFailure(cause);
      try {
        await release?.(webhook.meta.dedupeKey);
      } catch (releaseCause) {
        logHandlerFailure(releaseCause);
      }
      return new Response(null, { status: 500 });
    }
  };
}

function concatChunks(chunks: readonly Uint8Array[]): Uint8Array {
  let total = 0;
  for (const chunk of chunks) total += chunk.length;
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

/** Express/Node 어댑터 팩토리 — verifier.nodeHandler가 사용한다. */
export function createNodeHandler(
  verify: WebhookVerifyFn,
  handlers: WebhookHandlers,
  options?: NodeHandlerOptions,
  prefetch?: WebhookPrefetchFn,
  complete?: WebhookClaimAction,
  release?: WebhookClaimAction,
): (req: NodeIncomingMessageLike, res: NodeServerResponseLike) => Promise<void> {
  const maxBodyBytes = resolveMaxBodyBytes(options?.maxBodyBytes);
  return async (req, res) => {
    if (contentLengthExceeds(req.headers, maxBodyBytes)) {
      writePayloadTooLarge(res);
      return;
    }

    let rawBody: Uint8Array;
    if (req.body !== undefined) {
      // express.raw() 경유 — Buffer(Uint8Array 서브클래스)가 이미 실려 있다
      if (req.body instanceof Uint8Array) {
        if (req.body.byteLength > maxBodyBytes) {
          writePayloadTooLarge(res);
          return;
        }
        rawBody = req.body;
      } else if (typeof req.body === 'string') {
        const bytes = encoder.encode(req.body);
        if (bytes.byteLength > maxBodyBytes) {
          writePayloadTooLarge(res);
          return;
        }
        rawBody = bytes;
      } else {
        console.error(
          '[@gj-kit/toss-payments] nodeHandler: req.body가 이미 JSON으로 파싱된 객체입니다. ' +
            '서명/secret 검증에는 raw body가 필요합니다 — 이 라우트에는 express.json() 대신 ' +
            "express.raw({ type: '*/*' })를 사용하세요.",
        );
        res.statusCode = 400;
        res.end();
        return;
      }
    } else {
      // 미들웨어 없는 순수 http 서버 — 스트림을 직접 수집한다
      const body = await readNodeStream(req, maxBodyBytes);
      if (body.kind === 'too-large') {
        writePayloadTooLarge(res);
        return;
      }
      rawBody = body.body;
    }

    const sourceIp = options?.sourceIp?.(req) ?? req.socket?.remoteAddress;
    const result = await verify(
      rawBody,
      req.headers,
      sourceIp === undefined ? undefined : { sourceIp },
    );
    if (!result.ok) {
      res.statusCode = result.error.kind === 'store-failure' || result.error.kind === 'processing'
        ? 503
        : 400;
      res.end();
      return;
    }
    if (result.value.duplicate) {
      res.statusCode = 200;
      res.end();
      return;
    }
    const webhook = result.value.webhook;
    try {
      const prepared = prefetch === undefined ? webhook : await prefetch(webhook);
      await dispatchWebhook(handlers, prepared);
      await complete?.(webhook.meta.dedupeKey);
      res.statusCode = 200;
    } catch (cause) {
      logHandlerFailure(cause);
      try {
        await release?.(webhook.meta.dedupeKey);
      } catch (releaseCause) {
        logHandlerFailure(releaseCause);
      }
      res.statusCode = 500;
    }
    res.end();
  };
}
