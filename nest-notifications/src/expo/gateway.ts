/**
 * Expo 전송 게이트웨이 — SDK를 소유하지 않고 **전송 콜백을 주입받는다**(설계 §2.2-C).
 *
 * SDK에서 실제로 쓰던 것은 셋이었다: 토큰 형태 검사(정규식 한 줄), 청킹(100개 슬라이스),
 * 그리고 `POST https://exp.host/--/api/v2/push/send`. 앞의 둘은 순수 함수라 우리가 소유하는
 * 편이 낫고(청킹을 소유하면 ticket 대응이 자료구조가 된다), 남는 것은 HTTP 호출 하나이며
 * 호스트가 SDK를 쓰든 `fetch`를 쓰든 20줄이다.
 */
import type {
  NotificationPushEndpoint,
  NotificationPushGateway,
  NotificationPushPayload,
  NotificationPushResult,
} from '../core/push';
import { chunkExpoPushMessages } from './chunk';
import { classifyExpoPushTickets } from './tickets';
import type { ExpoPushEntry, ExpoPushMessage, ExpoPushTicket } from './wire';

const EXPO_PUSH_TOKEN_PATTERN = /^Expo(nent)?PushToken\[[^\s\]]+\]$/u;

/** `ExpoPushToken[…]` / `ExponentPushToken[…]` shape check. No network, no SDK. */
export function isExpoPushToken(address: string): boolean {
  return typeof address === 'string' && EXPO_PUSH_TOKEN_PATTERN.test(address);
}

export interface ExpoPushGatewayOptions {
  /**
   * Sends one chunk. Declared with method syntax on purpose: method parameters
   * are compared bivariantly, so an `expo-server-sdk` instance's
   * `sendPushNotificationsAsync(messages: ExpoPushMessage[])` is assignable as is.
   * As an arrow-function property it would not be - under `strictFunctionTypes`
   * the parameter is contravariant and `readonly ExpoPushMessage[]` is not
   * assignable to `ExpoPushMessage[]` (design 2.2). A 15-line `fetch` call fits
   * the same shape; the library never imports either.
   *
   * **Assignability is not binding.** The gateway detaches this callback from the
   * options object and calls it with no receiver, so a class method that reads
   * `this` MUST be bound:
   *
   * ```ts
   * send: expo.sendPushNotificationsAsync.bind(expo)
   * // or: send: (messages) => expo.sendPushNotificationsAsync([...messages])
   * ```
   *
   * `expo-server-sdk`'s method is exactly such a method (it dereferences
   * `this.limitConcurrentRequests`), so `send: expo.sendPushNotificationsAsync`
   * type-checks and then throws on the first call - which this gateway absorbs
   * into `accepted: false`. Every push then fails silently, every delivery burns
   * its attempts, and nothing in the log names the cause.
   */
  send(messages: readonly ExpoPushMessage[]): Promise<readonly ExpoPushTicket[]>;
  /**
   * Title used when a notification has none. Required and nullable rather than
   * defaulted: the source hard-coded its product name here, and that is a value
   * this library cannot hold.
   */
  readonly defaultTitle: string | null;
  /** Defaults to `'default'`, matching the source. */
  readonly sound?: 'default' | null | undefined;
  readonly channelId?: string | undefined;
  /** Continue remaining chunks after one fails. Default true (matches source). */
  readonly continueAfterChunkFailure?: boolean | undefined;
}

function buildMessage(
  endpoint: NotificationPushEndpoint,
  payload: NotificationPushPayload,
  options: ExpoPushGatewayOptions,
): ExpoPushMessage {
  const title = payload.title ?? options.defaultTitle;
  return {
    to: endpoint.address,
    ...(title === null ? {} : { title }),
    body: payload.body,
    sound: options.sound === undefined ? 'default' : options.sound,
    priority: payload.priority === 'ESSENTIAL' ? 'high' : 'default',
    ...(options.channelId === undefined ? {} : { channelId: options.channelId }),
    // 중복 완화의 유일한 레버 — 재시도가 at-least-once인 이상 provider의 dedupe/collapse에
    // 값을 주는 것 말고 할 수 있는 일이 없다(설계 §0.2-⑨).
    collapseId: payload.collapseKey ?? payload.idempotencyKey,
    data: {
      notificationId: payload.notificationId,
      idempotencyKey: payload.idempotencyKey,
      action: payload.action,
    },
  };
}

/**
 * Builds a {@link NotificationPushGateway} over an injected send callback.
 *
 * Locally malformed addresses come back as `rejectedEndpointIds`, never merged
 * into the provider-confirmed `invalidEndpointIds` (design 0.2-6). A transport
 * failure is absorbed into `accepted: false` rather than thrown, and a partial
 * chunk failure re-sends the whole delivery on the next pass — the concrete cost
 * of at-least-once (design 3.1 F4).
 */
export function createExpoPushGateway(options: ExpoPushGatewayOptions): NotificationPushGateway {
  const continueAfterChunkFailure = options.continueAfterChunkFailure ?? true;
  // 수신자를 여기서 떼어 낸다. `options.send(...)`로 부르면 `this`가 옵션 객체가 되어,
  // 바인딩을 잊은 클래스 메서드가 "그럴듯한 무언가" 위에서 실패한다. 떼어 두면 `this`는
  // `undefined`가 확정이라 실패가 재현 가능하고, 테스트가 그것을 고정할 수 있다.
  const send = options.send;

  return {
    isValidEndpoint: (endpoint) => isExpoPushToken(endpoint.address),

    async send(endpoints, payload): Promise<NotificationPushResult> {
      const rejectedEndpointIds: string[] = [];
      const entries: ExpoPushEntry[] = [];
      for (const endpoint of endpoints) {
        if (!isExpoPushToken(endpoint.address)) {
          rejectedEndpointIds.push(endpoint.id);
          continue;
        }
        entries.push({ endpoint, message: buildMessage(endpoint, payload, options) });
      }

      if (entries.length === 0) {
        return { accepted: true, invalidEndpointIds: [], rejectedEndpointIds };
      }

      let accepted = true;
      const invalidEndpointIds: string[] = [];
      for (const chunk of chunkExpoPushMessages(entries)) {
        let tickets: readonly ExpoPushTicket[];
        try {
          tickets = await send(chunk.map((entry) => entry.message));
        } catch {
          // 전송 실패는 throw하지 않고 결과로 흡수한다(소스 스펙).
          accepted = false;
          if (continueAfterChunkFailure) continue;
          break;
        }
        const classification = classifyExpoPushTickets(chunk, tickets);
        if (!classification.accepted) accepted = false;
        invalidEndpointIds.push(...classification.invalidEndpointIds);
      }

      return { accepted, invalidEndpointIds, rejectedEndpointIds };
    },
  };
}
