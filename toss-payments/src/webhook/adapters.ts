/**
 * 프레임워크 어댑터 — fetchHandler(Next.js Route Handler / Hono) + nodeHandler(Express).
 *
 * raw body 보존·검증·dedupe·"10초 내 200" 규약을 라이브러리가 소유한다.
 * 거부(WebhookRejection)는 400 — 토스가 재전송하므로 일시 장애(store-failure)도 회수된다.
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

/** verifier.verify와 동일 시그니처(어댑터는 sourceIp를 전달하지 않는다 — 프록시 오탐 회피). */
export type WebhookVerifyFn = (
  rawBody: string | Uint8Array,
  headers: IncomingHeaders,
) => Promise<Result<WebhookVerdict, WebhookRejection>>;

export interface FetchHandlerOptions {
  /** 서버리스(Vercel/Lambda 등)의 waitUntil — 200 응답 후 핸들러 실행을 회수해 준다. */
  readonly waitUntil?: (promise: Promise<unknown>) => void;
  /**
   * waitUntil 미주입 시 동작. 기본 'sync-complete': 핸들러 동기 완료 후 200(이벤트 유실 방지).
   * 'warn-and-detach': 즉시 200 + 핸들러는 분리 실행 — 서버리스에서는 응답 후 실행이
   * 회수되지 않고 중단될 수 있다(경고 로그).
   */
  readonly onMissingWaitUntil?: 'sync-complete' | 'warn-and-detach';
}

/** Node IncomingMessage와 구조 호환 — node: 빌트인 타입 import 없이 플랫폼 중립을 유지한다. */
export interface NodeIncomingMessageLike extends AsyncIterable<unknown> {
  readonly headers: Readonly<Record<string, string | readonly string[] | undefined>>;
  /** express.raw() 사용 시 Buffer가 이미 실려 온다 — 스트림 대신 그것을 쓴다. */
  readonly body?: unknown;
}

/** Node ServerResponse와 구조 호환. */
export interface NodeServerResponseLike {
  statusCode: number;
  end(): unknown;
}

/**
 * 이벤트 → 핸들러 디스패치.
 *
 * 핸들러 예외는 삼키고 로그만 남긴다 — dedupe가 이미 transmission-id를 점유했으므로
 * 여기서 500을 돌려줘도 재전송분은 duplicate로 스킵되어 이벤트가 복구되지 않는다.
 * 재처리가 필요한 실패는 핸들러 안에서 자체 큐로 넘길 것.
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
): (request: Request) => Promise<Response> {
  let warned = false;
  return async (request) => {
    const rawBody = await request.text();
    const result = await verify(rawBody, request.headers);
    if (!result.ok) return new Response(null, { status: 400 });
    if (result.value.duplicate) return new Response(null, { status: 200 });

    const job = dispatchWebhook(handlers, result.value.webhook).catch(logHandlerFailure);
    if (options?.waitUntil !== undefined) {
      options.waitUntil(job);
      return new Response(null, { status: 200 });
    }

    const mode = options?.onMissingWaitUntil ?? 'sync-complete';
    if (!warned) {
      warned = true;
      if (options?.onMissingWaitUntil === undefined) {
        console.warn(
          '[@gj-kit/toss-payments] fetchHandler: waitUntil이 주입되지 않아 핸들러 동기 완료 후 200을 반환합니다(기본 폴백 — 이벤트 유실 방지). ' +
            '서버리스에서는 fetchHandler(handlers, { waitUntil })로 런타임의 waitUntil을 주입하세요. 10초 안에 응답하지 못하면 재전송됩니다.',
        );
      } else if (mode === 'warn-and-detach') {
        console.warn(
          '[@gj-kit/toss-payments] fetchHandler: waitUntil 없이 warn-and-detach 모드 — 200 응답 후 핸들러 실행이 서버리스 런타임에 회수되지 않아 중단될 수 있습니다.',
        );
      }
    }
    if (mode === 'sync-complete') await job;
    return new Response(null, { status: 200 });
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
): (req: NodeIncomingMessageLike, res: NodeServerResponseLike) => Promise<void> {
  const encoder = new TextEncoder();
  return async (req, res) => {
    let rawBody: string | Uint8Array;
    if (req.body !== undefined) {
      // express.raw() 경유 — Buffer(Uint8Array 서브클래스)가 이미 실려 있다
      if (req.body instanceof Uint8Array) {
        rawBody = req.body;
      } else if (typeof req.body === 'string') {
        rawBody = req.body;
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
      const chunks: Uint8Array[] = [];
      for await (const chunk of req) {
        if (chunk instanceof Uint8Array) chunks.push(chunk);
        else if (typeof chunk === 'string') chunks.push(encoder.encode(chunk));
      }
      rawBody = concatChunks(chunks);
    }

    const result = await verify(rawBody, req.headers);
    if (!result.ok) {
      res.statusCode = 400;
      res.end();
      return;
    }
    // 10초 규약 — 응답을 먼저 보내고 처리한다 (Node 장수 프로세스는 응답 후에도 계속 실행됨)
    res.statusCode = 200;
    res.end();
    if (result.value.duplicate) return;
    try {
      await dispatchWebhook(handlers, result.value.webhook);
    } catch (cause) {
      logHandlerFailure(cause);
    }
  };
}
