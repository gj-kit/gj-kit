/**
 * no-nest 픽스처 — `node_modules/@nestjs`·`rxjs`·`reflect-metadata`를 지운 뒤 실행한다.
 * §2.1의 "Nest 없는 워커·람다" 주장을 **모듈 그래프 층에서** 증명하는 유일한 실행이다.
 * 설치 층의 비용(peer 3종이 required라는 사실)은 이 실행으로도 없어지지 않는다.
 */
const assert = require('node:assert/strict');

const core = require('@gj-kit/nest-notifications/core');
const testing = require('@gj-kit/nest-notifications/testing');

async function main() {
  const runtime = testing.fakeNotificationRuntime({ now: new Date('2026-08-18T03:00:00Z') });
  const stores = testing.memoryNotificationStores(runtime);
  const sent = [];

  await stores.registerEndpoint({
    applicationKey: 'worker',
    recipientRef: 'user-1',
    provider: 'EXPO',
    address: 'ExponentPushToken[abc]',
  });
  await stores.stage({
    applicationKey: 'worker',
    recipientRef: 'user-1',
    category: 'general',
    priority: 'NORMAL',
    body: 'core-only body',
    eventKey: 'e1',
  });

  const relay = core.createNotificationRelay({
    applicationKey: 'worker',
    store: stores.relayStore,
    policy: core.createQuietHoursPolicy({ timeZone: 'UTC', quietHours: null }),
    runtime,
  });
  const dispatcher = core.createNotificationDispatcher({
    applicationKey: 'worker',
    store: stores.deliveryStore,
    endpoints: stores.endpointStore,
    pushGateway: {
      isValidEndpoint: () => true,
      send: async (endpoints, payload) => {
        sent.push(payload);
        return { accepted: true, invalidEndpointIds: [], rejectedEndpointIds: [] };
      },
    },
    presenter: testing.passthroughPresenter(),
    providers: ['EXPO'],
    runtime,
  });

  const relayed = await relay.relayDue();
  assert.equal(relayed.relayed, 1, 'relay did not materialize the command');
  const dispatched = await dispatcher.dispatchDue();
  assert.equal(dispatched.delivered, 1, 'dispatch did not deliver');
  assert.equal(sent.length, 1, 'push gateway never ran');

  console.log('no-nest core-only smoke: ok');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
