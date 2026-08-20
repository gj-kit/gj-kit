/**
 * toNestWebhookHandler — Nest 컨트롤러에서 코어 웹훅 어댑터를 rawBody 강제와 함께
 * 사용하는 헬퍼 (설계 §4.2, G9).
 *
 * Nest의 기본 body-parser가 JSON을 선파싱하면 서명/secret 검증이 전멸한다 — 이 헬퍼는
 * `NestFactory.create(AppModule, { rawBody: true })` 전제로 `req.rawBody`만 신뢰하고,
 * 부재 시 핸들러를 실행하지 않고 **명시적 500 + 설정 안내 로그**를 남긴다(조용한 검증
 * 전멸 방지 — 400 응답이 반복되며 원인을 못 찾는 사고를 차단).
 */
import type { RawBodyRequest } from '@nestjs/common';
import type {
  NodeIncomingMessageLike,
  NodeHandlerOptions,
  NodeServerResponseLike,
  WebhookHandlers,
  WebhookVerifier,
} from '@gj-kit/toss-payments/webhook';

/**
 * Express/Fastify의 IncomingMessage와 구조 호환인 최소 요청 형태 —
 * 코어의 NodeIncomingMessageLike(구조적 타입)를 재사용해 `node:http` 타입 결합을 피한다.
 * `RawBodyRequest<Request>`(Express)·`RawBodyRequest<FastifyRequest['raw']>` 모두 충족.
 */
export type NestWebhookRequest = RawBodyRequest<NodeIncomingMessageLike>;

/**
 * 코어 `nodeHandler`의 source IP 옵션을 Nest raw-body 경계에 그대로 전달한다.
 *
 * 기본값은 원본 Node socket의 `remoteAddress`다. reverse proxy 뒤에서 원본 IP가
 * 필요하면, **앱이 신뢰하는 ingress가 재작성한 헤더만** 읽도록 sourceIp를 명시적으로
 * 제공해야 한다. 임의의 `X-Forwarded-For`를 기본 신뢰하지 않는다.
 */
export type NestWebhookHandlerOptions = NodeHandlerOptions;

/**
 * 컨트롤러 사용 (설계 §4.4):
 * ```ts
 * @Post('webhooks/toss')
 * async handle(@Req() req: RawBodyRequest<Request>, @Res() res: Response) {
 *   await toNestWebhookHandler(verifier, handlers)(req, res);
 * }
 * ```
 *
 * 위임 구조: rawBody 확보만 이 헬퍼가 소유하고, 검증·dedupe·200 ack·autoRefetch
 * prefetch·핸들러 디스패치는 전부 코어 `verifier.nodeHandler`에 위임한다 — 로직 중복 0.
 */
export function toNestWebhookHandler(
  verifier: WebhookVerifier,
  handlers: WebhookHandlers,
  options?: NestWebhookHandlerOptions,
): (req: NestWebhookRequest, res: NodeServerResponseLike) => Promise<void> {
  const nodeHandler = verifier.nodeHandler(handlers, options);
  return async (req, res) => {
    const rawBody = req.rawBody;
    if (rawBody === undefined) {
      // 협상 불가 — rawBody 없이는 서명/secret 검증이 불가능하므로 핸들러 미실행.
      // 400(토스 재전송 유도)이 아닌 500: 상점 서버 설정 결함이지 요청 결함이 아니다.
      console.error(
        '[@gj-kit/toss-payments-nestjs] req.rawBody가 없습니다 — 서명/secret 검증을 수행할 수 없어 ' +
          '웹훅 핸들러를 실행하지 않고 500을 반환합니다. 다음을 확인하세요: ' +
          '① NestFactory.create(AppModule, { rawBody: true }) 설정(Express 기본 어댑터) ' +
          '② Fastify는 rawBody 지원 설정 후 사용 ' +
          '③ 웹훅 라우트에 별도 JSON body 미들웨어가 선적용되지 않았는지.',
      );
      res.statusCode = 500;
      res.end();
      return;
    }
    // body에 rawBody(Buffer = Uint8Array 서브클래스)를 실은 구조 호환 요청으로 위임 —
    // 코어 nodeHandler는 body가 Uint8Array/string이면 스트림을 소비하지 않는다.
    const shim: NodeIncomingMessageLike = {
      headers: req.headers,
      body: rawBody,
      // 일반 상태 웹훅은 기본적으로 socket.remoteAddress로 IP를 검증한다. Nest wrapper가
      // 이를 누락하면 코어의 fail-closed 정책 때문에 정상 이벤트도 모두 400이 된다.
      ...(req.socket === undefined ? {} : { socket: req.socket }),
      // NodeIncomingMessageLike의 AsyncIterable 계약 충족용 — body가 실려 있어 순회되지 않는다
      async *[Symbol.asyncIterator]() {
        yield rawBody;
      },
    };
    await nodeHandler(shim, res);
  };
}
