/**
 * §5.1 디스패처 — 소스 dispatch/fan-out 스펙 이식 + §3.7이 보존하기로 한 동작 5종.
 */
import { describe, expect, it } from 'vitest';

import { createNotificationDispatcher } from '../../src/core/dispatch';
import { createNotificationRelay } from '../../src/core/relay';
import type { NotificationDeliveryStore } from '../../src/core/store';
import { passthroughPresenter } from '../../src/testing/passthrough';
import { recordingNotificationLogger } from '../../src/testing/recording-logger';
import { APP, command, harness, PROVIDER, RECIPIENT, recordingGateway } from './helpers';
import type { Harness } from './helpers';
import type { MemoryNotificationStores } from '../../src/testing/memory-stores';

const TOKEN = 'ExponentPushToken[aaaaaaaaaaaaaaaaaaaaaa]';

async function seedDue(
  context: Harness,
  overrides?: Parameters<typeof command>[0],
): Promise<void> {
  await context.stores.stage(command(overrides ?? { eventKey: 'e1' }));
  await createNotificationRelay({
    applicationKey: APP,
    store: context.stores.relayStore,
    policy: context.policy,
    runtime: context.runtime,
  }).relayDue();
}

function dispatcherOver(
  context: Harness,
  options: {
    readonly gateway: ReturnType<typeof recordingGateway>;
    readonly store?: NotificationDeliveryStore | undefined;
    readonly presenter?: Parameters<typeof createNotificationDispatcher>[0]['presenter'] | undefined;
    readonly logger?: ReturnType<typeof recordingNotificationLogger> | undefined;
    readonly disableRejectedEndpoints?: boolean | undefined;
  },
) {
  return createNotificationDispatcher({
    applicationKey: APP,
    store: options.store ?? context.stores.deliveryStore,
    endpoints: context.stores.endpointStore,
    pushGateway: options.gateway,
    presenter: options.presenter ?? passthroughPresenter(),
    providers: [PROVIDER],
    runtime: context.runtime,
    logger: options.logger ?? recordingNotificationLogger(),
    ...(options.disableRejectedEndpoints === undefined
      ? {}
      : { disableRejectedEndpoints: options.disableRejectedEndpoints }),
  });
}

async function register(stores: MemoryNotificationStores, address = TOKEN): Promise<string> {
  const endpoint = await stores.registerEndpoint({
    applicationKey: APP,
    recipientRef: RECIPIENT,
    provider: PROVIDER,
    address,
  });
  return endpoint.id;
}

describe('디스패처 — 소스가 고정한 동작', () => {
  it('endpoint가 하나도 없어도 inbox 메시지는 쓰고 배달은 완료한다', async () => {
    const context = harness();
    await seedDue(context);
    const gateway = recordingGateway();
    const summary = await dispatcherOver(context, { gateway }).dispatchDue();

    expect(summary).toMatchObject({ ok: true, claimed: 1, delivered: 1, failed: 0 });
    expect(gateway.sends).toHaveLength(0);
    const snapshot = context.stores.snapshot();
    expect(snapshot.messages).toHaveLength(1);
    expect(snapshot.deliveries[0]?.deliveredAt).not.toBeNull();
  });

  it('게이트웨이에 넘기는 것은 actorRef가 아니라 recipientRef이고, 멱등 키는 배달 id다', async () => {
    const context = harness();
    await seedDue(context, { eventKey: 'e1', actorRef: 'actor-9' });
    await register(context.stores);
    const gateway = recordingGateway();
    await dispatcherOver(context, { gateway }).dispatchDue();

    const snapshot = context.stores.snapshot();
    expect(gateway.sends[0]?.payload.recipientRef).toBe(RECIPIENT);
    expect(gateway.sends[0]?.payload.idempotencyKey).toBe(snapshot.deliveries[0]?.id);
    expect(gateway.sends[0]?.payload.notificationId).toBe(snapshot.messages[0]?.id);
  });

  it('한 배달의 실패가 페이지의 나머지를 막지 않는다', async () => {
    const context = harness();
    await seedDue(context, { eventKey: 'e1' });
    await seedDue(context, { eventKey: 'e2', recipientRef: 'recipient-2' });
    await register(context.stores);

    let calls = 0;
    const gateway = recordingGateway(() => {
      calls += 1;
      if (calls === 1) throw new Error('transport exploded');
      return { accepted: true, invalidEndpointIds: [], rejectedEndpointIds: [] };
    });
    const summary = await dispatcherOver(context, { gateway }).dispatchDue();

    expect(summary.claimed).toBe(2);
    expect(summary.failed).toBe(1);
    expect(summary.delivered).toBe(1);
    // 두 배달 모두 inbox 메시지는 남는다 — 실패한 쪽은 재시도가 이어받는다.
    expect(context.stores.snapshot().messages).toHaveLength(2);
  });

  it('핸드오프가 실패해도 provider가 확인한 무효 endpoint는 비활성화한다', async () => {
    const context = harness();
    await seedDue(context);
    const endpointId = await register(context.stores);
    const gateway = recordingGateway(() => ({
      accepted: false,
      invalidEndpointIds: [endpointId],
      rejectedEndpointIds: [],
    }));
    const summary = await dispatcherOver(context, { gateway }).dispatchDue();

    expect(summary.failed).toBe(1);
    expect(summary.endpointsDisabled).toBe(1);
    expect(context.stores.snapshot().endpoints[0]?.enabled).toBe(false);
    expect(context.stores.snapshot().deliveries[0]?.deliveredAt).toBeNull();
    expect(context.stores.snapshot().deliveries[0]?.lastErrorCode).toBe(
      'ERR_NOTIFICATION_PUSH_HANDOFF_REJECTED',
    );
  });

  it('다른 워커가 claim을 가로채면 inbox 쓰기 전에 멈춘다', async () => {
    const context = harness();
    await seedDue(context);
    const store: NotificationDeliveryStore = {
      ...context.stores.deliveryStore,
      materializeInTransaction: async () => null,
    };
    const gateway = recordingGateway();
    const summary = await dispatcherOver(context, { gateway, store }).dispatchDue();

    expect(summary.delivered).toBe(0);
    expect(summary.failed).toBe(0);
    expect(context.stores.snapshot().messages).toHaveLength(0);
    expect(gateway.sends).toHaveLength(0);
  });
});

describe('디스패처 — endpoint 판정', () => {
  it('로컬 형태 거부는 기본적으로 비활성화하지 않는다 (§0.2-⑥)', async () => {
    const context = harness();
    await seedDue(context);
    const endpointId = await register(context.stores, 'not-a-token');
    const gateway = recordingGateway(() => ({
      accepted: true,
      invalidEndpointIds: [],
      rejectedEndpointIds: [endpointId],
    }));
    const logger = recordingNotificationLogger();
    const summary = await dispatcherOver(context, { gateway, logger }).dispatchDue();

    expect(summary.endpointsDisabled).toBe(0);
    expect(context.stores.snapshot().endpoints[0]?.enabled).toBe(true);
    expect(logger.entries.some((entry) => entry.level === 'warn')).toBe(true);
  });

  it('disableRejectedEndpoints: true면 로컬 거부분도 끈다 — 명시적 선택일 때만', async () => {
    const context = harness();
    await seedDue(context);
    const endpointId = await register(context.stores, 'not-a-token');
    const gateway = recordingGateway(() => ({
      accepted: true,
      invalidEndpointIds: [],
      rejectedEndpointIds: [endpointId],
    }));
    const summary = await dispatcherOver(context, {
      gateway,
      disableRejectedEndpoints: true,
    }).dispatchDue();

    expect(summary.endpointsDisabled).toBe(1);
    expect(context.stores.snapshot().endpoints[0]?.enabled).toBe(false);
  });

  it('전송 중에 재등록된 기기는 무효 ticket으로도 꺼지지 않는다 (D6 되짚기)', async () => {
    const context = harness();
    await seedDue(context);
    const endpointId = await register(context.stores);
    const gateway = recordingGateway(async () => {
      // 전송이 진행되는 사이 사용자가 앱을 다시 열어 같은 토큰을 재등록한다.
      await context.stores.registerEndpoint({
        applicationKey: APP,
        recipientRef: RECIPIENT,
        provider: PROVIDER,
        address: TOKEN,
      });
      return { accepted: true, invalidEndpointIds: [endpointId], rejectedEndpointIds: [] };
    });
    await dispatcherOver(context, { gateway }).dispatchDue();

    expect(context.stores.snapshot().endpoints[0]?.enabled).toBe(true);
  });

  it('목록에 없던 endpoint를 게이트웨이가 보고하면 조용히 건너뛰고 warn만 남긴다', async () => {
    const context = harness();
    await seedDue(context);
    await register(context.stores);
    const gateway = recordingGateway(() => ({
      accepted: true,
      invalidEndpointIds: ['ghost-endpoint'],
      rejectedEndpointIds: [],
    }));
    const logger = recordingNotificationLogger();
    const summary = await dispatcherOver(context, { gateway, logger }).dispatchDue();

    expect(summary.endpointsDisabled).toBe(0);
    expect(summary.delivered).toBe(1);
    expect(
      logger.entries.some((entry) => entry.fields['endpointId'] === 'ghost-endpoint'),
    ).toBe(true);
  });
});

describe('디스패처 — 영구 실패는 배달 하나만 죽인다', () => {
  it('지원하지 않는 우선순위 문자열이 페이지 전체를 죽이지 않는다', async () => {
    const context = harness();
    await seedDue(context, { eventKey: 'e1' });
    await seedDue(context, { eventKey: 'e2', recipientRef: 'recipient-2' });

    const store: NotificationDeliveryStore = {
      ...context.stores.deliveryStore,
      claimDue: async (request) => {
        const rows = await context.stores.deliveryStore.claimDue(request);
        return rows.map((row, index) => (index === 0 ? { ...row, priority: 'URGENT' } : row));
      },
      materializeInTransaction: async (request, work) =>
        context.stores.deliveryStore.materializeInTransaction(request, async (tx) =>
          work({
            ...tx,
            readDelivery: async () => {
              const current = await tx.readDelivery();
              if (current === null) return null;
              return current.recipientRef === 'recipient-1'
                ? { ...current, priority: 'URGENT' }
                : current;
            },
          }),
        ),
    };

    const gateway = recordingGateway();
    const summary = await dispatcherOver(context, { gateway, store }).dispatchDue();

    expect(summary.claimed).toBe(2);
    expect(summary.failed).toBe(1);
    expect(summary.delivered).toBe(1);
    expect(context.stores.snapshot().deliveries.find((row) => row.recipientRef === 'recipient-1')
      ?.lastErrorCode).toBe('ERR_NOTIFICATION_PRIORITY_UNSUPPORTED');
  });

  it('빈 본문을 만든 presenter는 ERR_NOTIFICATION_MESSAGE_NOT_VISIBLE로 실패한다', async () => {
    const context = harness();
    await seedDue(context);
    const gateway = recordingGateway();
    const summary = await dispatcherOver(context, {
      gateway,
      presenter: { present: () => ({ title: null, body: '   ', action: null }) },
    }).dispatchDue();

    expect(summary.failed).toBe(1);
    expect(context.stores.snapshot().messages).toHaveLength(0);
    expect(context.stores.snapshot().deliveries[0]?.lastErrorCode).toBe(
      'ERR_NOTIFICATION_MESSAGE_NOT_VISIBLE',
    );
  });

  it('예외 메시지는 저장소에도 로그에도 들어가지 않는다', async () => {
    const context = harness();
    await seedDue(context);
    await register(context.stores);
    const secret = 'postgres://user:hunter2@db/internal';
    const gateway = recordingGateway(() => {
      throw new Error(`connection failed for ${secret}`);
    });
    const logger = recordingNotificationLogger();
    await dispatcherOver(context, { gateway, logger }).dispatchDue();

    const stored = context.stores.snapshot().deliveries[0]?.lastErrorCode ?? '';
    expect(stored).toBe('Error');
    expect(JSON.stringify(logger.entries)).not.toContain('hunter2');
  });
});
