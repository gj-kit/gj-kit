/**
 * §4-1 오용 1순위 — "빠른 경로만 배선하고 주기 실행자를 안 붙인다".
 *
 * 타입으로는 막을 수 없는 오용이라 **라이브러리가 이 실패를 알고 있다는 증거**를 테스트로
 * 남긴다. 배치·예약·조용시간 알림은 명령이 staging되는 순간이 아니라 그보다 나중에 due가
 * 되고, 그 시점에 `request()`를 부르는 사람은 아무도 없다.
 */
import { describe, expect, it } from 'vitest';

import { createNotificationDispatcher } from '../../src/core/dispatch';
import { createNotificationRelay } from '../../src/core/relay';
import { createNotificationWakeup } from '../../src/core/wakeup';
import { passthroughPresenter } from '../../src/testing/passthrough';
import { APP, command, harness, PROVIDER, recordingGateway } from './helpers';

/** defer된 패스가 끝날 때까지 마이크로태스크 큐를 비운다. */
async function settle(): Promise<void> {
  for (let round = 0; round < 5; round += 1) {
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
  }
}

describe('빠른 경로만 배선한 호스트', () => {
  it('12시간을 전진해도 배치 배달이 나가지 않는다 — 정확성의 소유자는 주기 실행자다', async () => {
    const context = harness();
    const gateway = recordingGateway();
    const relay = createNotificationRelay({
      applicationKey: APP,
      store: context.stores.relayStore,
      policy: context.policy,
      runtime: context.runtime,
    });
    const dispatcher = createNotificationDispatcher({
      applicationKey: APP,
      store: context.stores.deliveryStore,
      endpoints: context.stores.endpointStore,
      pushGateway: gateway,
      presenter: passthroughPresenter(),
      providers: [PROVIDER],
      runtime: context.runtime,
    });
    const wakeup = createNotificationWakeup({ relay, dispatcher, runtime: context.runtime });

    // 소스 도메인이 커밋 직후 힌트를 준다 — 이것이 유일한 배선이다.
    await context.stores.stage(command({ eventKey: 'e1', batch: { key: 'thread-1' } }));
    wakeup.request();
    context.runtime.flush();
    await settle();

    // 배달은 만들어졌지만 창이 끝난 뒤에 나간다.
    expect(context.stores.snapshot().deliveries).toHaveLength(1);
    expect(context.stores.snapshot().deliveries[0]?.deliveredAt).toBeNull();

    // 창이 끝나고 12시간이 더 지나도 아무도 파이프라인을 부르지 않는다.
    context.runtime.advance(12 * 60 * 60 * 1000);
    context.runtime.flush();
    await settle();
    expect(context.stores.snapshot().deliveries[0]?.deliveredAt).toBeNull();
    expect(gateway.sends).toHaveLength(0);

    // 주기 실행자가 있었다면 이 한 줄이 그 자리다.
    await dispatcher.dispatchDue();
    expect(context.stores.snapshot().deliveries[0]?.deliveredAt).not.toBeNull();
  });
});
