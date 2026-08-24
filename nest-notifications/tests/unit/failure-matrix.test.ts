/**
 * §3.1.3 실패 행렬 F1–F12 — 표가 문서에만 있고 테스트에 없으면 계약이 아니다.
 *
 * 각 지점에서 저장소·전송이 실패하도록 주입하고 **다음 패스의 결과**를 단언한다.
 * F4·F6·F7·F8이 전부 "중복 푸시"로 수렴한다는 사실도 여기서 실행으로 남긴다.
 */
import { describe, expect, it } from 'vitest';

import { createNotificationDispatcher } from '../../src/core/dispatch';
import { createNotificationRelay } from '../../src/core/relay';
import { createNotificationWakeup } from '../../src/core/wakeup';
import { createExpoPushGateway } from '../../src/expo/gateway';
import type { ExpoPushTicket } from '../../src/expo/wire';
import type {
  NotificationDeliveryStore,
  NotificationRelayStore,
} from '../../src/core/store';
import { passthroughPresenter } from '../../src/testing/passthrough';
import { recordingNotificationLogger } from '../../src/testing/recording-logger';
import { APP, command, harness, PROVIDER, RECIPIENT, recordingGateway } from './helpers';
import type { Harness } from './helpers';

const TOKEN = 'ExponentPushToken[aaaaaaaaaaaaaaaaaaaaaa]';

function relayOf(context: Harness, store?: NotificationRelayStore) {
  return createNotificationRelay({
    applicationKey: APP,
    store: store ?? context.stores.relayStore,
    policy: context.policy,
    runtime: context.runtime,
    logger: recordingNotificationLogger(),
  });
}

function dispatcherOf(
  context: Harness,
  gateway: ReturnType<typeof recordingGateway>,
  overrides?: {
    readonly store?: NotificationDeliveryStore | undefined;
    readonly claimStaleMs?: number | undefined;
    readonly maxAttempts?: number | undefined;
    readonly pageSize?: number | undefined;
    readonly presenter?: Parameters<typeof createNotificationDispatcher>[0]['presenter'] | undefined;
    readonly logger?: ReturnType<typeof recordingNotificationLogger> | undefined;
  },
) {
  return createNotificationDispatcher({
    applicationKey: APP,
    store: overrides?.store ?? context.stores.deliveryStore,
    endpoints: context.stores.endpointStore,
    pushGateway: gateway,
    presenter: overrides?.presenter ?? passthroughPresenter(),
    providers: [PROVIDER],
    runtime: context.runtime,
    logger: overrides?.logger ?? recordingNotificationLogger(),
    ...(overrides?.claimStaleMs === undefined ? {} : { claimStaleMs: overrides.claimStaleMs }),
    ...(overrides?.maxAttempts === undefined ? {} : { maxAttempts: overrides.maxAttempts }),
    ...(overrides?.pageSize === undefined ? {} : { pageSize: overrides.pageSize }),
  });
}

async function registerToken(context: Harness, recipientRef = RECIPIENT): Promise<string> {
  const endpoint = await context.stores.registerEndpoint({
    applicationKey: APP,
    recipientRef,
    provider: PROVIDER,
    address: `${TOKEN.slice(0, -1)}${recipientRef}]`,
  });
  return endpoint.id;
}

describe('F1 — relay 트랜잭션은 커밋됐고 완료 기록만 잃었다', () => {
  it('다음 패스가 already-relayed로 마감한다 — 중복 배달 0', async () => {
    const context = harness();
    await context.stores.stage(command({ eventKey: 'e1' }));

    let completions = 0;
    const store: NotificationRelayStore = {
      ...context.stores.relayStore,
      completeClaim: async (request) => {
        completions += 1;
        if (completions === 1) throw new Error('completion write lost');
        return context.stores.relayStore.completeClaim(request);
      },
    };

    const first = await relayOf(context, store).relayDue();
    expect(first.failed).toBe(1);
    expect(context.stores.snapshot().deliveries).toHaveLength(1);

    const second = await relayOf(context, store).relayDue();
    expect(second.alreadyRelayed).toBe(1);
    expect(second.failed).toBe(0);
    expect(context.stores.snapshot().deliveries).toHaveLength(1);
    expect(context.stores.snapshot().items).toHaveLength(1);
    expect(context.stores.snapshot().outbox[0]?.relayedAt).not.toBeNull();
  });
});

describe('F2 — relay 트랜잭션 중 실패', () => {
  it('아무것도 남지 않고 다음 패스가 그대로 재시도한다', async () => {
    const context = harness();
    await context.stores.stage(command({ eventKey: 'e1' }));

    let attempts = 0;
    const store: NotificationRelayStore = {
      ...context.stores.relayStore,
      relayInTransaction: async (request, work) =>
        context.stores.relayStore.relayInTransaction(request, async (tx) => {
          attempts += 1;
          if (attempts === 1) throw new Error('transaction aborted');
          return work(tx);
        }),
    };

    const first = await relayOf(context, store).relayDue();
    expect(first.failed).toBe(1);
    expect(context.stores.snapshot().deliveries).toHaveLength(0);

    const second = await relayOf(context, store).relayDue();
    expect(second.relayed).toBe(1);
    expect(context.stores.snapshot().deliveries).toHaveLength(1);
  });
});

describe('F3 · F8 — inbox는 남고 푸시만 재시도된다', () => {
  it('F3: 푸시 전송 실패 후 재시도해도 inbox 메시지는 하나다', async () => {
    const context = harness();
    await context.stores.stage(command({ eventKey: 'e1' }));
    await relayOf(context).relayDue();
    await registerToken(context);

    let sends = 0;
    const gateway = recordingGateway(() => {
      sends += 1;
      if (sends === 1) return { accepted: false, invalidEndpointIds: [], rejectedEndpointIds: [] };
      return { accepted: true, invalidEndpointIds: [], rejectedEndpointIds: [] };
    });

    const first = await dispatcherOf(context, gateway, { claimStaleMs: 0 }).dispatchDue();
    expect(first.failed).toBe(1);
    const second = await dispatcherOf(context, gateway, { claimStaleMs: 0 }).dispatchDue();
    expect(second.delivered).toBe(1);

    expect(sends).toBe(2);
    expect(context.stores.snapshot().messages).toHaveLength(1);
  });

  it('F8: 전송은 성공했고 완료 기록만 잃으면 다음 패스가 다시 전송한다 (중복 푸시)', async () => {
    const context = harness();
    await context.stores.stage(command({ eventKey: 'e1' }));
    await relayOf(context).relayDue();
    await registerToken(context);

    let completions = 0;
    const store: NotificationDeliveryStore = {
      ...context.stores.deliveryStore,
      complete: async (request) => {
        completions += 1;
        if (completions === 1) return false;
        return context.stores.deliveryStore.complete(request);
      },
    };
    const gateway = recordingGateway();

    await dispatcherOf(context, gateway, { store, claimStaleMs: 0 }).dispatchDue();
    expect(context.stores.snapshot().deliveries[0]?.deliveredAt).toBeNull();

    await dispatcherOf(context, gateway, { store, claimStaleMs: 0 }).dispatchDue();
    expect(gateway.sends).toHaveLength(2);
    expect(context.stores.snapshot().deliveries[0]?.deliveredAt).not.toBeNull();
    // 계약대로다: 배너는 두 번 뜨지만 inbox는 하나다(G4).
    expect(context.stores.snapshot().messages).toHaveLength(1);
  });
});

describe('F4 · F6 · F7 — 전송 계층의 세 가지 실패', () => {
  const entriesFor = (count: number) =>
    Array.from({ length: count }, (_unused, index) => ({
      id: `endpoint-${index}`,
      provider: PROVIDER,
      address: `${TOKEN.slice(0, -1)}${index}]`,
    }));
  const payload = {
    notificationId: 'message-1',
    idempotencyKey: 'delivery-1',
    recipientRef: RECIPIENT,
    title: null,
    body: 'body',
    action: null,
    priority: 'NORMAL' as const,
  };

  it('F4: 청크 경계에서 부분 성공하면 배달 전체가 재시도되고 첫 청크 기기가 또 받는다', async () => {
    const seen: string[][] = [];
    let calls = 0;
    const gateway = createExpoPushGateway({
      defaultTitle: null,
      send: async (messages) => {
        calls += 1;
        seen.push(messages.map((message) => message.to));
        if (calls === 2) throw new Error('chunk 2 exploded');
        return messages.map((_unused, index) => ({ status: 'ok', id: `t-${index}` }));
      },
    });

    const endpoints = entriesFor(150);
    const first = await gateway.send(endpoints, payload);
    expect(first.accepted).toBe(false);

    const second = await gateway.send(endpoints, payload);
    expect(second.accepted).toBe(true);
    // 첫 청크의 기기가 두 패스 모두에 등장한다 — at-least-once의 가장 구체적인 비용.
    expect(seen[0]).toEqual(seen[2]);
    expect(seen[0]).toHaveLength(100);
  });

  it('F6: 무효 endpoint 이외의 ticket 에러는 accepted:false다', async () => {
    const gateway = createExpoPushGateway({
      defaultTitle: null,
      send: async () => [
        { status: 'error', details: { error: 'MessageRateExceeded' } } satisfies ExpoPushTicket,
      ],
    });
    const result = await gateway.send(entriesFor(1), payload);
    expect(result.accepted).toBe(false);
    expect(result.invalidEndpointIds).toEqual([]);
  });

  it('F7: 요청보다 짧은 응답은 절대 핸드오프로 취급하지 않는다', async () => {
    const gateway = createExpoPushGateway({
      defaultTitle: null,
      send: async () => [
        { status: 'ok', id: 't-0' },
        { status: 'error', details: { error: 'DeviceNotRegistered' } },
      ],
    });
    const result = await gateway.send(entriesFor(3), payload);
    expect(result.accepted).toBe(false);
    // 이미 provider가 확인한 무효 endpoint는 그대로 돌려준다.
    expect(result.invalidEndpointIds).toEqual(['endpoint-1']);
  });
});

describe('F5 — 무효 endpoint 정리', () => {
  it('DeviceNotRegistered는 그 endpoint만 끄고 핸드오프는 성공이다', async () => {
    const context = harness();
    await context.stores.stage(command({ eventKey: 'e1' }));
    await relayOf(context).relayDue();
    const deadId = await registerToken(context);
    await context.stores.registerEndpoint({
      applicationKey: APP,
      recipientRef: RECIPIENT,
      provider: PROVIDER,
      address: `${TOKEN.slice(0, -1)}live]`,
    });

    const gateway = recordingGateway(() => ({
      accepted: true,
      invalidEndpointIds: [deadId],
      rejectedEndpointIds: [],
    }));
    const summary = await dispatcherOf(context, gateway).dispatchDue();

    expect(summary.delivered).toBe(1);
    expect(summary.endpointsDisabled).toBe(1);
    const snapshot = context.stores.snapshot();
    expect(snapshot.endpoints.filter((row) => row.enabled)).toHaveLength(1);
  });
});

describe('F9 — 릴레이 진행 중 수신자 삭제', () => {
  it('purge가 먼저 커밋되면 배달이 생기지 않는다', async () => {
    const context = harness();
    await context.stores.stage(command({ eventKey: 'e1' }));
    const store: NotificationRelayStore = {
      ...context.stores.relayStore,
      claimDue: async (request) => {
        const rows = await context.stores.relayStore.claimDue(request);
        await context.stores.tombstoneRecipient({
          applicationKey: APP,
          recipientRef: RECIPIENT,
        });
        return rows;
      },
    };

    const summary = await relayOf(context, store).relayDue();
    expect(summary.relayed).toBe(0);
    expect(context.stores.snapshot().deliveries).toHaveLength(0);
    expect(context.stores.snapshot().messages).toHaveLength(0);
  });
});

describe('stale 회수가 살아 있는 워커와 겹칠 때', () => {
  it('진 워커는 inbox 쓰기 전에 멈춘다 — 겹침이 곧 중복 inbox는 아니다', async () => {
    const context = harness();
    await context.stores.stage(command({ eventKey: 'e1' }));
    await relayOf(context).relayDue();
    await registerToken(context);

    const gateway = recordingGateway();
    const workerA = dispatcherOf(context, gateway, { claimStaleMs: 0 });
    const workerB = dispatcherOf(context, gateway, { claimStaleMs: 0 });
    const [summaryA, summaryB] = await Promise.all([workerA.dispatchDue(), workerB.dispatchDue()]);

    // 둘 다 행을 집었지만(claimStaleMs: 0이 신선한 claim을 회수한다) 진 쪽은 아무것도 쓰지 않는다.
    expect(summaryA.claimed + summaryB.claimed).toBe(2);
    expect(summaryA.delivered + summaryB.delivered).toBe(1);
    expect(context.stores.snapshot().messages).toHaveLength(1);
  });

  it('멈췄던 워커가 전송까지 마친 뒤 회수당하면 푸시만 중복된다 — G4가 지키고 G5가 판다', async () => {
    const context = harness();
    await context.stores.stage(command({ eventKey: 'e1' }));
    await relayOf(context).relayDue();
    await registerToken(context);

    let stalledWorker: { dispatchDue(): Promise<unknown> } | null = null;
    let raced = false;
    // A가 전송하는 사이 B가 stale 회수로 같은 배달을 집어 전송까지 끝낸다.
    const gateway = recordingGateway(async () => {
      if (!raced && stalledWorker !== null) {
        raced = true;
        await stalledWorker.dispatchDue();
      }
      return { accepted: true, invalidEndpointIds: [], rejectedEndpointIds: [] };
    });
    const workerA = dispatcherOf(context, gateway, { claimStaleMs: 0 });
    stalledWorker = dispatcherOf(context, gateway, { claimStaleMs: 0 });

    const summaryA = await workerA.dispatchDue();

    // 같은 배달이 두 번 전송됐다 — at-least-once가 파는 것이 정확히 이것이다.
    expect(gateway.sends).toHaveLength(2);
    expect(gateway.sends[0]?.payload.idempotencyKey).toBe(gateway.sends[1]?.payload.idempotencyKey);
    // 그래도 inbox는 하나이고(G4·D2), 완료는 토큰을 쥔 워커만 쓴다(D3).
    expect(context.stores.snapshot().messages).toHaveLength(1);
    expect(summaryA.delivered).toBe(1);
    expect(context.stores.snapshot().deliveries[0]?.deliveredAt).not.toBeNull();
  });
});

describe('F12 — 영구 실패 배달의 굶김', () => {
  const poisonPresenter = () => ({
    present: (input: { readonly body: string }) => {
      if (input.body === 'poison') throw new Error('presenter exploded');
      return { title: null, body: input.body, action: null };
    },
  });

  async function seedPoisonPage(context: Harness): Promise<void> {
    await context.stores.stage(command({ eventKey: 'poison', body: 'poison' }));
    await context.stores.stage(
      command({ eventKey: 'healthy', recipientRef: 'recipient-2', body: 'healthy' }),
    );
    await relayOf(context).relayDue();
  }

  it('maxAttempts 없이 운영하면 건강한 알림이 페이지에 못 들어온다', async () => {
    const context = harness();
    await seedPoisonPage(context);
    const gateway = recordingGateway();

    for (let pass = 0; pass < 3; pass += 1) {
      await dispatcherOf(context, gateway, {
        pageSize: 1,
        claimStaleMs: 0,
        presenter: poisonPresenter(),
      }).dispatchDue();
    }

    const healthy = context.stores
      .snapshot()
      .deliveries.find((row) => row.recipientRef === 'recipient-2');
    expect(healthy?.deliveredAt).toBeNull();
  });

  it('반대편 대가 — maxAttempts는 일시적 전송 장애를 영구 유실로 바꾼다', async () => {
    const context = harness();
    await context.stores.stage(
      command({ eventKey: 'security', priority: 'ESSENTIAL', body: 'password changed' }),
    );
    await relayOf(context).relayDue();
    await registerToken(context);

    let transportDown = true;
    const gateway = recordingGateway(() => ({
      accepted: !transportDown,
      invalidEndpointIds: [],
      rejectedEndpointIds: [],
    }));
    const dispatcher = dispatcherOf(context, gateway, { maxAttempts: 3 });

    const startedAt = context.runtime.clock.now().getTime();
    for (let pass = 0; pass < 3; pass += 1) {
      expect((await dispatcher.dispatchDue()).claimed).toBe(1);
    }

    // 전송이 돌아왔는데도 이 배달은 다시는 claim되지 않는다. 해제 경로에 쿨다운이 없어
    // `attempts`가 **경과 시간이 아니라 패스 수**를 세기 때문이다 — 시계는 제자리다.
    transportDown = false;
    for (let pass = 0; pass < 5; pass += 1) {
      expect((await dispatcher.dispatchDue()).claimed).toBe(0);
    }
    expect(context.runtime.clock.now().getTime()).toBe(startedAt);
    expect(gateway.sends).toHaveLength(3);
    expect(context.stores.snapshot().deliveries[0]?.deliveredAt).toBeNull();

    // 요약에는 그 사실을 말하는 숫자가 없다 — 소진 상태는 라이브러리 표면이 아니다(§6-15).
    expect(await dispatcher.dispatchDue()).toEqual({
      ok: true,
      claimed: 0,
      delivered: 0,
      failed: 0,
      endpointsDisabled: 0,
    });
    // inbox 문장은 남는다. 유실되는 것은 푸시다(D1·G4).
    expect(context.stores.snapshot().messages).toHaveLength(1);
  });

  it('마지막 시도를 태우는 순간이 로그에 남는다 — 체크리스트의 "소진 행 알림"이 걸리는 고리', async () => {
    const context = harness();
    await context.stores.stage(command({ eventKey: 'security', priority: 'ESSENTIAL' }));
    await relayOf(context).relayDue();
    await registerToken(context);

    const logger = recordingNotificationLogger();
    const gateway = recordingGateway(() => ({
      accepted: false,
      invalidEndpointIds: [],
      rejectedEndpointIds: [],
    }));
    const dispatcher = dispatcherOf(context, gateway, { maxAttempts: 2, logger });

    await dispatcher.dispatchDue();
    await dispatcher.dispatchDue();

    const failures = logger.entries.filter((entry) => entry.level === 'error');
    expect(failures.map((entry) => entry.fields['exhausted'])).toEqual([false, true]);
    expect(failures[1]?.fields).toMatchObject({ attempts: 2, maxAttempts: 2, exhausted: true });
    // 예외 메시지는 절대 로그에 들어가지 않는다 — 축약된 코드만 나간다.
    expect(failures[1]?.fields['error']).toBe('ERR_NOTIFICATION_PUSH_HANDOFF_REJECTED');
  });

  it('릴레이 쪽도 같은 신호를 낸다 — 소진되면 inbox 행조차 남지 않는다', async () => {
    const context = harness();
    await context.stores.stage(command({ eventKey: 'e1' }));
    const logger = recordingNotificationLogger();
    const exploding: NotificationRelayStore = {
      ...context.stores.relayStore,
      relayInTransaction: async () => {
        throw new Error('transient deadlock');
      },
    };
    const relay = createNotificationRelay({
      applicationKey: APP,
      store: exploding,
      policy: context.policy,
      runtime: context.runtime,
      logger,
      maxAttempts: 2,
    });

    await relay.relayDue();
    await relay.relayDue();
    expect((await relay.relayDue()).claimed).toBe(0);

    const failures = logger.entries.filter((entry) => entry.level === 'error');
    expect(failures.map((entry) => entry.fields['exhausted'])).toEqual([false, true]);
    // 소진의 대가가 여기서는 배달 0 · inbox 0이다 — 릴레이 실패는 아무것도 남기지 않는다.
    const snapshot = context.stores.snapshot();
    expect(snapshot.deliveries).toHaveLength(0);
    expect(snapshot.messages).toHaveLength(0);
    expect(snapshot.outbox[0]?.relayedAt).toBeNull();
  });

  it('wakeup 패스도 같은 예산을 태운다 — 무관한 staging 버스트가 남의 재시도를 소진시킨다', async () => {
    const context = harness();
    await context.stores.stage(
      command({ eventKey: 'security', priority: 'ESSENTIAL', body: 'password changed' }),
    );
    await relayOf(context).relayDue();
    await registerToken(context);

    const gateway = recordingGateway(() => ({
      accepted: false,
      invalidEndpointIds: [],
      rejectedEndpointIds: [],
    }));
    const dispatcher = dispatcherOf(context, gateway, { maxAttempts: 3 });
    const wakeup = createNotificationWakeup({
      relay: relayOf(context),
      dispatcher,
      runtime: context.runtime,
      logger: recordingNotificationLogger(),
    });

    // 무관한 명령 세 건. 각 staging의 wakeup 힌트가 due 페이지를 통째로 다시 claim한다.
    for (const eventKey of ['unrelated-1', 'unrelated-2', 'unrelated-3']) {
      await context.stores.stage(command({ eventKey, recipientRef: 'recipient-2' }));
      wakeup.request();
      context.runtime.flush();
      // `defer`된 패스는 비동기다 — 마이크로태스크가 다 돌 때까지 기다린다.
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 0);
      });
    }

    const securityOf = () =>
      context.stores.snapshot().deliveries.find((row) => row.recipientRef === RECIPIENT);

    // 주기 실행자는 이 배달을 아직 한 번도 부르지 않았는데 예산은 이미 다 탔다.
    expect(securityOf()?.attempts).toBe(3);
    await dispatcher.dispatchDue();
    expect(securityOf()?.attempts).toBe(3);
    expect(securityOf()?.deliveredAt).toBeNull();
  });

  it('maxAttempts를 주면 소진된 행이 due에서 빠지고 건강한 알림이 통과한다', async () => {
    const context = harness();
    await seedPoisonPage(context);
    const gateway = recordingGateway();

    for (let pass = 0; pass < 3; pass += 1) {
      await dispatcherOf(context, gateway, {
        pageSize: 1,
        claimStaleMs: 0,
        maxAttempts: 2,
        presenter: poisonPresenter(),
      }).dispatchDue();
    }

    const healthy = context.stores
      .snapshot()
      .deliveries.find((row) => row.recipientRef === 'recipient-2');
    expect(healthy?.deliveredAt).not.toBeNull();
  });
});
