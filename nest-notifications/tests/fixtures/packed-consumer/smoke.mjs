/**
 * packed consumer smoke (ESM) — 설치된 tarball에서 네 서브패스가 해석되고, Nest 컨테이너가
 * 부팅되며, 시각을 고정한 채 stage → relay → dispatch가 실제로 도는지 확인한다.
 *
 * 시각을 고정하기 때문에 **조용시간 홀드와 배치 창 경로까지 릴리스 게이트에서 실행된다** —
 * 그것이 `NestNotificationsOptions.runtime` 통로가 필요한 두 번째 이유다.
 */
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

import { NestFactory } from '@nestjs/core';
import { Module } from '@nestjs/common';
import {
  NestNotificationsModule,
  NotificationDispatchRunner,
  NotificationRelayRunner,
} from '@gj-kit/nest-notifications';
import { createQuietHoursPolicy } from '@gj-kit/nest-notifications/core';
import { chunkExpoPushMessages, isExpoPushToken } from '@gj-kit/nest-notifications/expo';
import {
  fakeNotificationRuntime,
  memoryNotificationStores,
  passthroughPresenter,
} from '@gj-kit/nest-notifications/testing';

const require = createRequire(import.meta.url);
const packageRoot = dirname(require.resolve('@gj-kit/nest-notifications/package.json'));
assert.ok(
  existsSync(join(packageRoot, 'dist', 'gj-kit-provenance.json')),
  'dist/gj-kit-provenance.json is missing from the installed package',
);

assert.equal(isExpoPushToken('ExponentPushToken[abc]'), true);
assert.equal(chunkExpoPushMessages([]).length, 0);

// 조용시간 한가운데로 시각을 고정한다 — NORMAL은 홀드되고 ESSENTIAL은 즉시 나가야 한다.
const runtime = fakeNotificationRuntime({ now: new Date('2026-08-18T18:00:00Z') });
const stores = memoryNotificationStores(runtime);
const sent = [];

class SmokeModule {}

// Node는 데코레이터 문법을 파싱하지 못한다 — 데코레이터를 함수로 적용한다.
Module({
  imports: [
    NestNotificationsModule.forRoot({
      applicationKey: 'smoke-app',
      relayStore: stores.relayStore,
      deliveryStore: stores.deliveryStore,
      endpointStore: stores.endpointStore,
      presenter: passthroughPresenter(),
      policy: createQuietHoursPolicy({
        timeZone: 'Asia/Seoul',
        quietHours: { startHour: 22, endHour: 8 },
        batchWindowMs: 600_000,
      }),
      pushGateway: {
        isValidEndpoint: () => true,
        send: async (endpoints, payload) => {
          sent.push({ endpoints, payload });
          return { accepted: true, invalidEndpointIds: [], rejectedEndpointIds: [] };
        },
      },
      providers: ['EXPO'],
      runtime,
      wakeup: { enabled: false },
    }),
  ],
})(SmokeModule);

const app = await NestFactory.createApplicationContext(SmokeModule, { logger: false });

await stores.registerEndpoint({
  applicationKey: 'smoke-app',
  recipientRef: 'user-1',
  provider: 'EXPO',
  address: 'ExponentPushToken[abc]',
});

const base = {
  applicationKey: 'smoke-app',
  recipientRef: 'user-1',
  category: 'general',
  body: 'smoke body',
};
await stores.stage({ ...base, priority: 'NORMAL', eventKey: 'held' });
await stores.stage({ ...base, priority: 'ESSENTIAL', eventKey: 'immediate' });

const relaySummary = await app.get(NotificationRelayRunner).run();
assert.equal(relaySummary.ok, true, 'relay pass failed');
assert.equal(relaySummary.relayed, 2, `expected 2 relayed, got ${relaySummary.relayed}`);

const dispatchSummary = await app.get(NotificationDispatchRunner).run();
assert.equal(dispatchSummary.ok, true, 'dispatch pass failed');
// 조용시간 홀드가 실제로 걸렸다: ESSENTIAL 하나만 나간다.
assert.equal(dispatchSummary.delivered, 1, `expected 1 delivered, got ${dispatchSummary.delivered}`);
assert.equal(sent.length, 1, 'push gateway did not receive the payload');
assert.equal(sent[0].payload.recipientRef, 'user-1');
assert.ok(sent[0].payload.idempotencyKey.length > 0, 'idempotencyKey must be present');

await app.close();
console.log('packed consumer ESM smoke: ok');
