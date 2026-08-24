/**
 * 전송 포트 — provider 중립(설계 §3.4.5).
 *
 * 소스가 스스로 "provider port. 저장소도 recipient의 application identity도 모른다"고
 * 적어 둔 경계다. 우리는 그 경계를 지운 게 아니라 지킨다 — 어떤 provider SDK도 dependency,
 * peer, optional peer 중 무엇으로도 들어오지 않는다(설계 §2.2). provider 고유 지식은
 * 별도 서브패스가 무의존 순수 함수로 소유하고, 이 파일은 그 이름조차 모른다(가드가 강제).
 */
import type { NotificationAction, NotificationPriority } from './contracts';

export interface NotificationPushEndpoint {
  readonly id: string;
  /** Opaque to this library. The dispatcher's `providers` option decides routing. */
  readonly provider: string;
  readonly address: string;
}

export interface NotificationPushPayload {
  /** The durable inbox message id. */
  readonly notificationId: string;
  /**
   * Stable across every retry of this delivery. Transports that support
   * de-duplication or collapsing should map it onto their own key: retries are
   * at-least-once (design 3.1 G5), and this is the only lever that reduces
   * duplicates.
   */
  readonly idempotencyKey: string;
  readonly collapseKey?: string | undefined;
  readonly recipientRef: string;
  readonly title: string | null;
  readonly body: string;
  readonly action: NotificationAction | null;
  readonly priority: NotificationPriority;
}

export interface NotificationPushResult {
  /** False retains the durable delivery for retry. */
  readonly accepted: boolean;
  /** The provider confirmed these endpoints are gone. Safe to disable. */
  readonly invalidEndpointIds: readonly string[];
  /**
   * Locally malformed addresses. NOT provider-confirmed: the dispatcher logs
   * them and, by default, leaves them enabled (design 0.2-6). Merging the two
   * lists is how the source could permanently disable a live device the day its
   * own regex became stricter than the provider's.
   */
  readonly rejectedEndpointIds: readonly string[];
}

export interface NotificationPushGateway {
  /** Reject malformed provider addresses before they become durable endpoints. */
  isValidEndpoint(endpoint: Pick<NotificationPushEndpoint, 'provider' | 'address'>): boolean;
  /**
   * Hands one delivery to the transport. Implementations absorb transport
   * failures into `accepted: false` rather than throwing: a rejected handoff is
   * an outcome the dispatcher records, not an exception it has to classify.
   */
  send(
    endpoints: readonly NotificationPushEndpoint[],
    payload: NotificationPushPayload,
  ): Promise<NotificationPushResult>;
}
