/** packed consumer smoke (CJS) — 네 서브패스가 `require`로도 해석되는지 확인한다. */
const assert = require('node:assert/strict');

const index = require('@gj-kit/nest-notifications');
const core = require('@gj-kit/nest-notifications/core');
const expo = require('@gj-kit/nest-notifications/expo');
const testing = require('@gj-kit/nest-notifications/testing');

assert.equal(typeof index.NestNotificationsModule.forRoot, 'function');
assert.equal(typeof core.createNotificationRelay, 'function');
assert.equal(typeof expo.createExpoPushGateway, 'function');
assert.equal(typeof testing.memoryNotificationStores, 'function');

// `.`와 `./core`를 동시에 require해도 DI 토큰은 하나다 — Symbol.for가 그것을 보장한다.
assert.equal(
  index.NOTIFICATION_RELAY_STORE,
  Symbol.for('@gj-kit/nest-notifications:relay-store'),
);
// `.` 배럴은 코어의 런타임 값을 재수출하지 않는다.
assert.equal(index.createNotificationRelay, undefined);

// 이중 로드에서도 에러 가드가 양쪽을 잡는다.
const error = new core.NotificationsError('ERR_NOTIFICATION_CONFIG_INVALID', 'x');
assert.equal(core.isNotificationsError(error), true);

console.log('packed consumer CJS smoke: ok');
