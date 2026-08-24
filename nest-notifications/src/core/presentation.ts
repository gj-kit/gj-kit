/**
 * 표시 포트 — **기본 구현이 없다**(설계 §0.2-② · §3.4.4).
 *
 * 소스는 `새 알림 N건`을 하드코딩했다. 사용자가 실제로 읽는 문장은 제품 카피이고,
 * 기본값을 주면 영어권 소비자가 남의 언어를 배포하며, 중립 폴백을 주면 5건짜리 배치가
 * 첫 항목의 문장으로 나간다(둘 다 거짓말이다). 필수 옵션이면 컴파일 에러가 결정을 강제한다.
 */
import type { NotificationAction, NotificationPriority } from './contracts';

export interface NotificationPresentationInput {
  readonly title: string | null;
  readonly body: string;
  readonly action: NotificationAction | null;
  readonly category: string;
  readonly priority: NotificationPriority;
  /** How many source commands were merged into this delivery. */
  readonly batchCount: number;
  /** Sum of the merged commands' item counts. */
  readonly batchItemCount: number;
  readonly aggregationLabel: string | null;
}

export interface NotificationPresentation {
  readonly title: string | null;
  readonly body: string;
  readonly action: NotificationAction | null;
}

/**
 * Produces the sentence a person actually reads, in the inbox and in the push
 * payload. The library ships no implementation: batch copy is product copy, and
 * a default would ship one product's language to every consumer.
 *
 * A presenter that returns an empty body makes the notification invisible, which
 * the dispatcher treats as a permanent failure
 * (`ERR_NOTIFICATION_MESSAGE_NOT_VISIBLE`) rather than writing a blank inbox card.
 */
export interface NotificationPresenter {
  present(input: NotificationPresentationInput): NotificationPresentation;
}
