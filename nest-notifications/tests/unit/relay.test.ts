/**
 * §5.1 릴레이 — 소스 relay 스펙 11케이스 전수 이식.
 */
import { describe, expect, it } from 'vitest';

import { createNotificationRelay } from '../../src/core/relay';
import type { NotificationRelayStore, NotificationRelayTransaction } from '../../src/core/store';
import { recordingNotificationLogger } from '../../src/testing/recording-logger';
import { APP, CATEGORY, command, harness, RECIPIENT } from './helpers';

function relayOver(store: NotificationRelayStore, context: ReturnType<typeof harness>) {
  return createNotificationRelay({
    applicationKey: APP,
    store,
    policy: context.policy,
    runtime: context.runtime,
    logger: recordingNotificationLogger(),
  });
}

/** 트랜잭션 seam 하나만 갈아끼우는 얇은 래퍼 — 저장소 동작을 바꾸지 않는다. */
function withTransactionPatch(
  store: NotificationRelayStore,
  patch: (tx: NotificationRelayTransaction) => NotificationRelayTransaction,
): NotificationRelayStore {
  return {
    claimDue: (request) => store.claimDue(request),
    completeClaim: (request) => store.completeClaim(request),
    releaseClaim: (request) => store.releaseClaim(request),
    relayInTransaction: (request, work) =>
      store.relayInTransaction(request, (tx) => work(patch(tx))),
  };
}

describe('릴레이 — 기본 경로', () => {
  it('claim 하나가 배달 1개와 항목 1개를 만든다', async () => {
    const context = harness();
    await context.stores.stage(command({ eventKey: 'e1' }));
    const summary = await relayOver(context.stores.relayStore, context).relayDue();

    expect(summary).toMatchObject({ ok: true, claimed: 1, relayed: 1, failed: 0 });
    const snapshot = context.stores.snapshot();
    expect(snapshot.deliveries).toHaveLength(1);
    expect(snapshot.items).toHaveLength(1);
    expect(snapshot.outbox[0]?.relayedAt).not.toBeNull();
  });

  it('소스 항목이 이미 있으면 재생은 already-relayed다 — 중복 배달 0(G2)', async () => {
    const context = harness();
    await context.stores.stage(command({ eventKey: 'e1' }));
    const relay = relayOver(context.stores.relayStore, context);
    await relay.relayDue();

    // 완료 기록만 잃은 상태를 만든다(F1): 행을 다시 due로 되돌린다.
    const store = context.stores.relayStore;
    const outboxId = context.stores.snapshot().outbox[0]?.id ?? '';
    await store.releaseClaim({ applicationKey: APP, outboxId, claimToken: 'x', errorCode: null });
    const replay = createNotificationRelay({
      applicationKey: APP,
      store: {
        ...store,
        claimDue: async (request) => {
          const rows = await store.claimDue({ ...request, claimStaleMs: 0 });
          return rows;
        },
      },
      policy: context.policy,
      runtime: context.runtime,
    });
    // 첫 패스가 relayedAt을 찍었으므로 due에서 빠져 있다 — 재생 경로는 아래 F1 테스트가 본다.
    const second = await replay.relayDue();
    expect(second.claimed).toBe(0);
    expect(context.stores.snapshot().deliveries).toHaveLength(1);
  });

  it('비활성 카테고리의 NORMAL은 suppressed로 마감된다', async () => {
    const context = harness();
    await context.stores.setCategoryEnabled({
      applicationKey: APP,
      recipientRef: RECIPIENT,
      category: CATEGORY,
      enabled: false,
    });
    await context.stores.stage(command({ eventKey: 'e1' }));
    const summary = await relayOver(context.stores.relayStore, context).relayDue();

    expect(summary.suppressed).toBe(1);
    expect(context.stores.snapshot().deliveries).toHaveLength(0);
    expect(context.stores.snapshot().outbox[0]?.suppressedAt).not.toBeNull();
  });

  it('ESSENTIAL은 선호도로 억제되지 않는다', async () => {
    const context = harness();
    await context.stores.setCategoryEnabled({
      applicationKey: APP,
      recipientRef: RECIPIENT,
      category: CATEGORY,
      enabled: false,
    });
    await context.stores.stage(command({ eventKey: 'e1', priority: 'ESSENTIAL' }));
    const summary = await relayOver(context.stores.relayStore, context).relayDue();

    expect(summary.relayed).toBe(1);
    expect(context.stores.snapshot().deliveries).toHaveLength(1);
  });
});

describe('릴레이 — 배치', () => {
  it('같은 창의 두 명령이 배달 하나로 병합되고 창 컬럼이 명시적으로 기록된다', async () => {
    const context = harness();
    await context.stores.stage(command({ eventKey: 'e1', batch: { key: 'thread-1', itemCount: 2 } }));
    await context.stores.stage(command({ eventKey: 'e2', batch: { key: 'thread-1' } }));
    const summary = await relayOver(context.stores.relayStore, context).relayDue();

    expect(summary.relayed).toBe(2);
    const snapshot = context.stores.snapshot();
    expect(snapshot.deliveries).toHaveLength(1);
    expect(snapshot.items).toHaveLength(2);
    const delivery = snapshot.deliveries[0];
    expect(delivery?.batchCount).toBe(2);
    expect(delivery?.batchItemCount).toBe(3);
    expect(delivery?.batchWindowStartedAt).not.toBeNull();
    expect(delivery?.batchPolicyKey).not.toBeNull();
    // 배치 배달은 창이 끝난 뒤에 나간다.
    expect(delivery?.deliverAfter.getTime()).toBe(
      context.policy.batchWindow(delivery?.createdAt ?? new Date()).endsAt.getTime(),
    );
  });

  it('창 끝이 조용시간 안이면 배치도 홀드된다 — 22:00에 새지 않는다', async () => {
    // 로컬 21:55(=UTC+9). 10분 창의 끝은 22:00 — 조용시간이 막 시작하는 순간이다.
    const context = harness({ now: new Date(Date.UTC(2026, 7, 18, 12, 55, 0)) });
    await context.stores.stage(command({ eventKey: 'e1', batch: { key: 'thread-1' } }));
    await relayOver(context.stores.relayStore, context).relayDue();

    const delivery = context.stores.snapshot().deliveries[0];
    const windowEnd = context.policy.batchWindow(delivery?.createdAt ?? new Date()).endsAt;
    // 창 끝(22:00)이 아니라 다음 아침 08:00이다.
    expect(context.policy.isQuietHours(windowEnd)).toBe(true);
    expect(delivery?.deliverAfter.toISOString()).toBe('2026-08-18T23:00:00.000Z');
    expect(context.policy.isQuietHours(delivery?.deliverAfter ?? new Date())).toBe(false);
  });

  it('6시간 digest 창이 자정에 닫혀도 홀드가 걸린다 — 창이 클수록 새는 깊이가 깊다', async () => {
    // 로컬 18:05. 6시간 버킷 [18:00, 24:00)의 끝은 자정 — 조용시간 한복판이다.
    const context = harness({
      now: new Date(Date.UTC(2026, 7, 18, 9, 5, 0)),
      batchWindowMs: 21_600_000,
    });
    await context.stores.stage(command({ eventKey: 'e1', batch: { key: 'thread-1' } }));
    await relayOver(context.stores.relayStore, context).relayDue();

    const delivery = context.stores.snapshot().deliveries[0];
    expect(delivery?.deliverAfter.toISOString()).toBe('2026-08-18T23:00:00.000Z');
  });

  it('조용시간 밖에서 닫히는 창은 창 끝 그대로 나간다 — 홀드 재적용이 다른 경로를 건드리지 않는다', async () => {
    const context = harness();
    await context.stores.stage(command({ eventKey: 'e1', batch: { key: 'thread-1' } }));
    await relayOver(context.stores.relayStore, context).relayDue();

    const delivery = context.stores.snapshot().deliveries[0];
    expect(delivery?.deliverAfter.getTime()).toBe(
      context.policy.batchWindow(delivery?.createdAt ?? new Date()).endsAt.getTime(),
    );
  });

  it('ESSENTIAL은 같은 batchKey여도 NORMAL 배치에 갇히지 않는다', async () => {
    const context = harness();
    await context.stores.stage(command({ eventKey: 'e1', batch: { key: 'thread-1' } }));
    await context.stores.stage(
      command({ eventKey: 'e2', priority: 'ESSENTIAL', batch: { key: 'thread-1' } }),
    );
    await relayOver(context.stores.relayStore, context).relayDue();

    const snapshot = context.stores.snapshot();
    expect(snapshot.deliveries).toHaveLength(2);
    const essential = snapshot.deliveries.find((row) => row.priority === 'ESSENTIAL');
    expect(essential?.batchKey).toBeNull();
    // 단독 배달이므로 창을 기다리지 않는다.
    expect(essential?.deliverAfter.getTime()).toBe(context.runtime.clock.now().getTime());
  });

  it('예약 타이밍은 즉시 타이밍과 다른 배치 라우트를 쓴다', async () => {
    const context = harness();
    await context.stores.stage(command({ eventKey: 'e1', batch: { key: 'thread-1' } }));
    await context.stores.stage(
      command({
        eventKey: 'e2',
        batch: { key: 'thread-1' },
        timing: { mode: 'SCHEDULED', at: '2026-08-18T05:00:00Z' },
      }),
    );
    await relayOver(context.stores.relayStore, context).relayDue();

    const snapshot = context.stores.snapshot();
    expect(snapshot.deliveries).toHaveLength(2);
    expect(new Set(snapshot.deliveries.map((row) => row.batchPolicyKey)).size).toBe(2);
  });

  it('이미 잠긴 배치에 늦게 도착한 항목은 follow-up 배달로 간다 (F10)', async () => {
    const context = harness();
    await context.stores.stage(command({ eventKey: 'e1', batch: { key: 'thread-1' } }));
    const relay = relayOver(context.stores.relayStore, context);
    await relay.relayDue();

    // dispatch가 claim하면서 presentation lock을 찍는다 → 배치가 닫힌다(D1).
    // 시계를 전진시키지 않는 것이 요점이다 — 늦은 항목이 **같은 창**에 들어와야 F10이다.
    await context.stores.deliveryStore.claimDue({
      applicationKey: APP,
      limit: 10,
      at: new Date(context.runtime.clock.now().getTime() + 600_000),
      claimStaleMs: 300_000,
      claimToken: 'dispatch-1',
    });

    await context.stores.stage(command({ eventKey: 'e2', batch: { key: 'thread-1' } }));
    await relay.relayDue();

    const snapshot = context.stores.snapshot();
    expect(snapshot.deliveries).toHaveLength(2);
    expect(snapshot.items).toHaveLength(2);
    const locked = snapshot.deliveries[0];
    const followUp = snapshot.deliveries[1];
    expect(locked?.batchCount).toBe(1);
    expect(followUp?.batchPolicyKey).toContain('follow-up');
    // 잠긴 배달에 항목이 붙지 않았다는 것이 요점이다.
    expect(snapshot.items[0]?.deliveryId).toBe(locked?.id);
    expect(snapshot.items[1]?.deliveryId).toBe(followUp?.id);
  });

  it('createDelivery가 created:false를 돌려주면 잠긴 배달에 붙이지 않고 follow-up으로 되돌린다 (F11)', async () => {
    const context = harness();
    // 배치 정체성 하나를 선점한 뒤 그 배달을 잠근다.
    await context.stores.stage(command({ eventKey: 'e1', batch: { key: 'thread-1' } }));
    const relay = relayOver(context.stores.relayStore, context);
    await relay.relayDue();
    await context.stores.deliveryStore.claimDue({
      applicationKey: APP,
      limit: 10,
      at: new Date(context.runtime.clock.now().getTime() + 600_000),
      claimStaleMs: 300_000,
      claimToken: 'dispatch-1',
    });
    const lockedId = context.stores.snapshot().deliveries[0]?.id;

    // 경쟁 워커가 방금 만든 것처럼 보이게 `findOpenBatch`가 첫 조회에서 null을 반환하게 한다.
    let firstLookup = true;
    const store = withTransactionPatch(context.stores.relayStore, (tx) => ({
      ...tx,
      findOpenBatch: async (key) => {
        if (firstLookup) {
          firstLookup = false;
          return null;
        }
        return tx.findOpenBatch(key);
      },
    }));

    await context.stores.stage(command({ eventKey: 'e2', batch: { key: 'thread-1' } }));
    await relayOver(store, context).relayDue();

    const snapshot = context.stores.snapshot();
    expect(snapshot.deliveries).toHaveLength(2);
    const item = snapshot.items[1];
    expect(item?.deliveryId).not.toBe(lockedId);
  });
});

describe('릴레이 — 수명주기와 재읽기', () => {
  it('트랜잭션 안에서 소스 행이 사라졌으면 no-longer-live이고 아무것도 쓰지 않는다 (F9)', async () => {
    const context = harness();
    await context.stores.stage(command({ eventKey: 'e1' }));
    const store = withTransactionPatch(context.stores.relayStore, (tx) => ({
      ...tx,
      readCommand: async () => null,
    }));

    const summary = await relayOver(store, context).relayDue();
    expect(summary.noLongerLive).toBe(1);
    expect(summary.relayed).toBe(0);
    expect(context.stores.snapshot().deliveries).toHaveLength(0);
    expect(context.stores.snapshot().items).toHaveLength(0);
  });

  it('배달 내용은 claim 결과가 아니라 잠금 후 재읽기에서 나온다 — 동시 actor 익명화가 반영된다', async () => {
    const context = harness();
    await context.stores.stage(command({ eventKey: 'e1', actorRef: 'actor-1' }));
    const store = withTransactionPatch(context.stores.relayStore, (tx) => ({
      ...tx,
      readCommand: async () => {
        const current = await tx.readCommand();
        return current === null ? null : { ...current, actorRef: null };
      },
    }));

    await relayOver(store, context).relayDue();
    expect(context.stores.snapshot().deliveries[0]?.actorRef).toBeNull();
  });
});
