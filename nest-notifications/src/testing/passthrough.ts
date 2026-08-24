/** 테스트 전용 presenter — 라이브러리가 카피를 배포하지 않는다는 규칙의 예외가 아니다. */
import type { NotificationPresenter } from '../core/presentation';

/**
 * Batch-unaware presenter for tests only: it passes the seed command's content
 * through unchanged, which is wrong copy for any merged batch. Production hosts
 * write their own — that is why the library ships no default (design 0.2-2).
 */
export function passthroughPresenter(): NotificationPresenter {
  return {
    present: (input) => ({ title: input.title, body: input.body, action: input.action }),
  };
}
