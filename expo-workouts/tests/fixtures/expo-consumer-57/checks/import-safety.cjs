#!/usr/bin/env node
/**
 * Mission §4.1 / design §9.3 `import-safety-guard`, executed against the PACKED
 * artifact from a real consumer install.
 *
 * Plain Node resolves the `node` condition, so this loads `dist/index.unsupported.*`
 * — never the native branch. That fork is the whole reason the package can be
 * imported by a Jest/Vitest suite, an Expo Router server component, or an
 * `app.config.ts` without `expo` being loadable: `require('expo')` throws under
 * plain Node (SDK 56 ships no `exports` map and `main: src/Expo.ts`).
 *
 * The contract asserted here: importing NEVER throws, `getAvailability()`
 * settles as `unavailable`, and every other member rejects with the public code
 * `unavailable` — not with a `MODULE_NOT_FOUND`, and not by hanging.
 */
const assert = require('node:assert/strict');

const api = require('@gj-kit/expo-workouts');
const { isWorkoutsError, workoutsErrorCode } = require('@gj-kit/expo-workouts/core');

const NAMED = [
  'getAvailability',
  'requestAuthorization',
  'getAuthorizationState',
  'listWorkouts',
  'syncWorkouts',
  'getRoute',
  'readHeartRate',
  'readSteps',
  'saveWorkout',
  'deleteWorkout',
  'openSettings',
  'openStoreListing',
];

async function expectUnavailable(label, thunk) {
  try {
    await thunk();
  } catch (error) {
    assert.ok(isWorkoutsError(error), `${label}: rejected with a non-WorkoutsError: ${String(error)}`);
    assert.equal(workoutsErrorCode(error), 'unavailable', `${label}: wrong code`);
    return;
  }
  throw new Error(`${label}: resolved but should have rejected with 'unavailable'.`);
}

async function main() {
  for (const name of NAMED) {
    assert.equal(typeof api[name], 'function', `missing named export ${name}`);
    assert.equal(typeof api.workouts[name], 'function', `missing workouts.${name}`);
  }

  const availability = await api.getAvailability();
  assert.equal(availability.status, 'unavailable', 'getAvailability must settle, not reject');
  assert.equal(availability.reason, 'notSupported');

  const window = { fromMs: 0, toMs: 1 };
  await expectUnavailable('requestAuthorization', () => api.requestAuthorization({ read: ['workouts'] }));
  await expectUnavailable('getAuthorizationState', () => api.getAuthorizationState());
  await expectUnavailable('listWorkouts', () => api.listWorkouts({ ...window }));
  await expectUnavailable('syncWorkouts', () => api.syncWorkouts(null));
  await expectUnavailable('readHeartRate', () => api.readHeartRate({ ...window }));
  await expectUnavailable('readSteps', () => api.readSteps({ ...window }));
  await expectUnavailable('saveWorkout', () =>
    api.saveWorkout({ kind: 'running', startMs: 0, endMs: 1, clientId: 'smoke' }),
  );
  await expectUnavailable('deleteWorkout', () => api.deleteWorkout({ id: 'smoke' }));
  await expectUnavailable('openSettings', () => api.openSettings());
  await expectUnavailable('openStoreListing', () => api.openStoreListing());

  // `getRoute` is lazy by contract: building the iterable must not throw, and
  // the first pull is where `unavailable` surfaces.
  const route = api.getRoute('smoke');
  await expectUnavailable('getRoute', async () => {
    for await (const chunk of route) void chunk;
  });

  console.log('import-safety: 12 members settled as unavailable without loading the native branch.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
