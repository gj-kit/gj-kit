# @gj-kit/expo-workouts

HealthKit (iOS) and Health Connect (Android) workouts + GPS routes for Expo, with a **gap-free
incremental sync protocol**, idempotent writes and streamed routes.

The protocol is **pure TypeScript**: cursor codec, reset classification, `added`/`removed`
reconciliation, route hygiene, size estimation, error mapping and the read budget all live in
`./core` and run on Node. The native layer implements primitives only. Runtime dependencies: **zero**.

> **Status: Phase 2 scaffold.** Every public signature and every JSDoc line below is final. The
> native HealthKit / Health Connect implementations land in Phase 3; until then the module resolves
> as `unavailable` outside a development build, and functions that need the native seam report
> `internal` with an explicit "not implemented yet (Phase 3)" message. What is already real:
> the whole `./core` protocol layer, the `./testing` seam fake, the config-plugin types, and the
> `unavailable` branch of `.`.

| | |
|---|---|
| Requires | Expo SDK 56 or 57, a **development build** (Expo Go cannot load native modules) |
| iOS | 16.4+, HealthKit |
| Android | API 26+ for the package, API 28+ for Health Connect |
| Peer | `expo >=56.0.0 <58.0.0`, optional |

---

## Install

```sh
npx expo install @gj-kit/expo-workouts
```

Then add the config plugin (see [Config plugin](#config-plugin)) and rebuild the development client.
`npx expo prebuild` is required — this package ships native code.

> **Packaging note.** This package deliberately has **no `"type": "module"`**, so `.js` files in
> `dist/` are CommonJS and `.mjs` are ES modules — the opposite convention from `@gj-kit/expo-media`.
> The reason is `app.plugin.js`: an ESM package root turns it into an ES module and `module.exports`
> dies there.

---

## Permissions and scopes

Copy this. It is the recipe for the common case:

```ts
import { workouts, WORKOUT_TOTALS_SCOPES } from '@gj-kit/expo-workouts';

const availability = await workouts.getAvailability();
if (availability.status === 'updateRequired') {
  await workouts.openStoreListing();
} else if (availability.status === 'available') {
  const result = await workouts.requestAuthorization({
    read: [...WORKOUT_TOTALS_SCOPES, 'routes'],
    write: [...WORKOUT_TOTALS_SCOPES, 'routes'],
  });
  if (!result.conclusive) {
    // The platform returned nothing we can attribute to the user. Ask again later.
    // NEVER treat this as a denial: on Android, backing out of Health Connect's first-run
    // onboarding returns an empty permission set that is byte-identical to denying everything.
    showToast('Health permissions were not confirmed. Try again.');
  }
}
```

**`'workouts'` is the session list. It does not include totals.** `WORKOUT_TOTALS_SCOPES` is the
one-token form that includes them. Name the members individually only when you have a reason to
read less:

| Scope | Gates | iOS | Android |
|---|---|---|---|
| `workouts` | the session itself: `id`, `kind`, `indoor`, start/end, `activeDurationS`, `pauses`, `laps`, `source`, `utcOffsetMin` | `HKObjectType.workoutType()` | `READ_EXERCISE` / `WRITE_EXERCISE` |
| `distance` | `distanceM`, `distanceProvenance` | walking/running **and** cycling distance, always both | `READ_DISTANCE` / `WRITE_DISTANCE` |
| `activeEnergy` | `activeEnergyKcal`, `activeEnergyProvenance` | `.activeEnergyBurned` | `READ_/WRITE_ACTIVE_CALORIES_BURNED` |
| `elevation` | `elevationGainM` | **empty set** — it is metadata on the workout, so this scope aliases `workouts` | `READ_/WRITE_ELEVATION_GAINED` |
| `routes` | `getRoute()` and route writes | `HKSeriesType.workoutRoute()` | `READ_EXERCISE_ROUTES` (manifest only) / `WRITE_EXERCISE_ROUTE` |
| `heartRate` | `Workout.heartRate`, `readHeartRate()` | `.heartRate` | `READ_/WRITE_HEART_RATE` |
| `steps` | `Workout.steps`, `readSteps()` | `.stepCount` | `READ_/WRITE_STEPS` |

A metric scope without `'workouts'` is `invalidArgument` — nothing in this library reads a metric
except through a workout.

`READ_EXERCISE_ROUTES` is **manifest-declared and never requestable at runtime**. Asking for
`'routes'` in `read` is neither an error nor a no-op: the returned state reports whether it is held.

### The read trap, and how to find it without a device

A field whose scope you did not request is `undefined` on every workout, forever, with no error.
Three defences, no knobs:

```ts
import { unpopulatedWorkoutMetrics } from '@gj-kit/expo-workouts/core';

const state = await workouts.getAuthorizationState();
const missing = unpopulatedWorkoutMetrics(state);
// e.g. ['distanceM', 'activeEnergyKcal', 'elevationGainM', 'heartRate', 'steps']
if (missing.length > 0) showToast(`These fields cannot be filled: ${missing.join(', ')}`);
```

1. Every optional field's JSDoc names the scope that gates it (hover it).
2. `unpopulatedWorkoutMetrics(state)` returns the **field names** — not scope names — whose gating
   read scope is `denied` **or** `undetermined`. On iOS it always returns `[]`, because every iOS
   read scope is permanently `unknown` and `unknown` never accuses.
3. `createFakeWorkouts()` in `./testing` honours scopes, so the trap is reproducible in your own
   `vitest`/`jest` suite, on Node, with no device.

---

## Reading workouts

```ts
const now = Date.now();
const page = await workouts.listWorkouts({ fromMs: now - 7 * 86_400_000, toMs: now });
for (const workout of page.items) {
  // Descending by start instant. `platform` narrows `platformData` with zero casts.
  if (workout.platform === 'ios') {
    void workout.platformData.activityTypeRaw;
  } else {
    void workout.platformData.exerciseType;
  }
}
```

The window always means the record's **START instant** in `[fromMs, toMs)`, on both platforms.
There is no overlap variant and no local-day variant: bucket days yourself from `utcOffsetMin`.

`undefined` means **unknown**, never `0`.

---

## Incremental sync

`reset: true` always means: *the cursor you gave me is useless. Refill the window you care about
with `listWorkouts`, then continue from the cursor I just gave you.* It is never an exception.

```ts
import { reconcileSyncPage } from '@gj-kit/expo-workouts/core';

let cursor = await db.readCursor();
for (;;) {
  const page = await workouts.syncWorkouts(cursor);
  if (page.reset) {
    // page.added / page.removed are empty; page.cursor was taken BEFORE anything was read,
    // so backfilling now and continuing from it misses nothing.
    void page.resetReason;
  }
  await db.transaction(async (tx) => {
    const { upserts, deletes, rekeys } = reconcileSyncPage(page);
    await tx.applyRekeys(rekeys);
    await tx.upsert(upserts);
    await tx.deleteByIds(deletes);
    await tx.writeCursor(page.cursor);
  });
  cursor = page.cursor;
  if (!page.hasMore) break;
}
```

Three caller obligations, and the library cannot enforce any of them:

1. **`added` is an idempotent upsert set, not a delta append.** The same workout may appear in two
   consecutive results — that is the price of gap-freeness and is harmless if you upsert.
   Key on `clientId` when `isOwn === true && clientId != null`, otherwise on `id`.
2. **`remove(unknown id)` must be a no-op.** Android deletion changes carry a bare record id, so we
   cannot filter them by your horizon.
3. **Apply the items and persist the cursor in ONE transaction.** Committing the cursor without the
   items loses those workouts permanently.

`reset: true` does **not** mean "empty your table". Mark this platform's local rows *unconfirmed*,
run the `listWorkouts` backfill and the `hasMore` drain to completion, then delete whatever is still
unconfirmed. Emptying the table takes your local join data (server ids, upload state, notes) with it.

> ⚠ **Deletions are not authoritative.** HealthKit may purge a deletion record before we ever see
> it, so a workout can vanish with no `removed` entry at all. Never drive a destructive action
> (deleting an activity on your server) from `removed` alone — only a periodic full `listWorkouts`
> re-read makes deletion authoritative.

> ⚠ **iOS cannot detect a read-permission change** made in Health › Sharing. Give the user a
> "re-import" button that calls `syncWorkouts(null)`.

---

## Routes

```ts
import { collectRoute } from '@gj-kit/expo-workouts/core';

const page = await workouts.listWorkouts({ fromMs: Date.now() - 86_400_000, toMs: Date.now() });
const workout = page.items[0];
if (workout !== undefined && workout.routeState === 'available') {
  for await (const chunk of workouts.getRoute(workout.id)) {
    renderMap(chunk);
  }
  // Or, if you can afford the heap: a 36 000-point route costs ~15 MB.
  const all = await collectRoute(workouts.getRoute(workout.id));
  void all.length;
}
```

Chunks are at most 1000 points, ascending by `t`, with duplicate timestamps already collapsed.
Breaking out of the loop releases the native handle.

Branch on `Workout.routeState`, never on `read.routes`:

- `'available'` — yields 1..n chunks.
- `'none'` — yields **nothing** and does not throw. An empty route is not an error.
- `'consentRequired'` — a route exists but is not readable. Throws `consentRequired` under the
  default `{ consent: 'skip' }`. With `{ consent: 'prompt' }` the platform's per-route dialog is
  shown and the route is streamed from that same call. **Never collapse this to `'none'`.**

There is no `requestRouteAccess()`: "Allow this route" is one-shot, does not grant the permission,
and the consenting call *is* the route read.

Android only: route reads never run while the app is backgrounded, and
`READ_HEALTH_DATA_IN_BACKGROUND` does not help. Only one consent prompt may be in flight per
process; a concurrent call throws `busy`.

---

## Writing

```ts
import type { WorkoutWrite } from '@gj-kit/expo-workouts/core';

const write: WorkoutWrite = {
  id: 'a2f6c0b8-0d7e-4f31-9d1a-7c2b5e8f0a11', // your own stable id — the idempotency key
  version: 3, // derive from your record's updatedAt; NEVER Date.now() at call time
  kind: 'running',
  indoor: false,
  startMs: Date.now() - 3_600_000,
  endMs: Date.now() - 1_800_000,
  distanceM: 8123,
  activeEnergyKcal: 512,
  route: 'none', // REQUIRED — say it out loud
};
const saved = await workouts.saveWorkout(write);
if (saved.status === 'saved') {
  void saved.nativeId;
  void saved.routePointsWritten;
} else {
  // Locked device. Do NOT re-save blindly: call again with the SAME id and version after unlock.
  void saved.route;
}
```

`route` is **required** because an Android upsert that omits it **deletes the stored route**.
`'none'` and `[]` are not the same call shape — an empty array is `invalidArgument`.

Everything you send replaces everything stored. An equal `version` replaces; a lower one throws
`staleVersion` and writes nothing.

Route hygiene runs before any platform call and is identical on both platforms: out-of-range
coordinates are rejected, low-accuracy and out-of-window points are dropped, duplicate timestamps
collapse to the last one. If nothing survives, the workout is still saved with `route: 'dropped'`.

`deleteWorkout` removes the workout **and every record this library wrote for it** — distance,
active energy, elevation, steps, heart rate and the route. Neither platform cascades fully.

---

## `indoor` is platform-asymmetric

This is not a footnote; it changes what round-trips.

On **iOS** `indoor` is *stored* (an `HKIndoorWorkout` metadata key orthogonal to the activity type),
so it round-trips for all nine kinds. On **Android** it is *derived* from `exerciseType` alone, and
Health Connect only has an indoor/outdoor constant **pair** for four kinds:

| kind | `indoor` survives an Android round-trip? |
|---|---|
| `running`, `cycling`, `swimming`, `rowing` | **yes** |
| `walking`, `hiking`, `strength`, `wheelchair`, `other` | **no** — reads back `undefined` |

So `indoor: true` on a hike round-trips on iOS and vanishes on Android. And on the four paired
kinds the opposite rounding happens: `indoor: undefined` normalizes to **`false`** after an Android
round-trip, because `RUNNING`, `BIKING`, `ROWING` and `SWIMMING_OPEN_WATER` all positively mean
"not indoor" — for swimming that is the fairly strong claim "open water". Both directions are
asserted by the round-trip tests so neither looks like a bug.

`WorkoutKind` has nine members: `running · walking · hiking · cycling · swimming · rowing ·
strength · wheelchair · other`. `'other'` is the documented lossy sink — the original activity is
not recoverable from it.

---

## Errors

Every failure is a `WorkoutsError` with one of fourteen codes. Use `isWorkoutsError` — **not
`instanceof`**, which is unreliable because the bundler copies the class into each entry.

| code | retry? | what to do |
|---|---|---|
| `unavailable` | never | hide the feature |
| `updateRequired` | on resume | `openStoreListing()` |
| `notAuthorized` | not silently | `requestAuthorization()` or `openSettings()` |
| `consentRequired` | no | `getRoute(id, { consent: 'prompt' })` from the foreground |
| `historyRequired` | no | narrow the window, or build with `history: true` |
| `rateLimited` | **after `retryAfterMs`** | do nothing until then |
| `busy` | once, ~1 s | then surface it |
| `invalidArgument` | no | **caller bug** — read the message and fix the call |
| `routeTooLarge` | not as-is | downsample below `MAX_ANDROID_ROUTE_POINTS` |
| `staleVersion` | not as-is | raise `version` and re-save |
| `storeLocked` | next activation | skip quietly |
| `cancelled` | no | no UI; offer the action again |
| `io` | once | then surface it |
| `internal` | no | log the `code` only; show a generic message |

There is deliberately no `isRetryableWorkoutsError()`: whether `io` is worth retrying is your
policy, not our fact.

---

## Testing without a device

```ts
import { createFakeWorkouts } from '@gj-kit/expo-workouts/testing';

const fake = createFakeWorkouts({
  platform: 'android',
  workouts: [
    {
      clientId: 'w-1',
      isOwn: true,
      kind: 'running',
      startMs: 1_754_000_000_000,
      endMs: 1_754_000_600_000,
      distanceM: 5000,
    },
  ],
});

const first = await fake.api.syncWorkouts(null);
void first.reset; // true, resetReason 'noCursor' — nothing was read, only a checkpoint taken
fake.replaceWorkout('00000000-0000-4000-8000-000000000001', { distanceM: 5200 });
const next = await fake.api.syncWorkouts(first.cursor);
void next.added.length;
```

`./testing` fakes the **native seam**, not the API — so the code running on top of it is the real
`./core` pipeline: DTO normalisation, sentinel cleanup, error-code mapping, the route stream wrapper
and its cancellation, window validation. `createFakeWorkouts().api` and `.`'s `workouts` come from
the same factory, so there is no behavioural difference to prove.

Scenario controls map one-to-one onto measured platform states: `purgeDeletion()`,
`emitNoOpUpsertion()`, `expireCursor(reason)`, `setForeground()`, `setOnboarded()`,
`setStoreLocked()`, `nextSaveIsPendingUnlock()`, `failNext(primitive, payload)`, and
`openRouteHandles` so a test can assert no handle leaked.

---

## Config plugin

```ts
import type { GjKitWorkoutsPluginProps } from '@gj-kit/expo-workouts/plugin';

export const workoutsPlugin: readonly [string, GjKitWorkoutsPluginProps] = [
  '@gj-kit/expo-workouts',
  {
    read: ['workouts', 'distance', 'activeEnergy', 'elevation', 'routes'],
    write: ['workouts', 'distance', 'routes'],
    privacyPolicyUrl: 'https://example.com/privacy',
    ios: {
      shareUsageDescription: 'Save your workouts and routes to Apple Health.',
      updateUsageDescription: 'Save your workouts and routes to Apple Health.',
    },
  },
];
```

`privacyPolicyUrl` is required: Android 14+ opens it from the health permission dialog, and Play's
Health apps declaration requires one anyway.

`@gj-kit/expo-workouts/plugin` exports the props type and nothing else — not even `ConfigPlugin` —
so `app.config.ts` type-checks in a repo that has not installed `expo`. `./core` has zero peers too,
so importing `WORKOUT_TOTALS_SCOPES` from a config file is safe.

---

## Subpaths

| Subpath | Contents | Peers |
|---|---|---|
| `.` | the twelve functions + `workouts`, plus everything in `./core` | `expo` (native branch only) |
| `./core` | all public types, `WorkoutsError`, the activity tables, time/route/size utilities, `describeCursor`, `reconcileSyncPage`, `ReadBudget`, `createWorkoutsApi` | **none** |
| `./testing` | the in-memory native-seam fake | **none** |
| `./plugin` | `GjKitWorkoutsPluginProps` | **none** |

Importing `.` on web, Node, SSR or in Expo Go **never throws**: the exports map routes those
runtimes to a build whose module graph contains no `expo` at all. There, `getAvailability()`
resolves `{ status: 'unavailable', reason: 'notSupported' }` and the other eleven reject with
`unavailable`.

---

## Store submission checklist

- **Library `PrivacyInfo.xcprivacy`** — the library itself collects nothing.
- **Your app's Apple privacy labels** — declare **Health** (plus **Fitness**, plus **Precise
  Location** if you upload routes) as *collected · linked to the user · not used for tracking · app
  functionality*, and enter the same in App Store Connect.
- **Play Health apps declaration** — Policy › App content. Every read and write data type must be
  declared; it is **mandatory** for closed, open and production tracks, and changing the data types
  triggers re-review. Shipping without approval shows users a "can't access Health Connect" dialog.
- **Play Data safety** must match those labels.
- **Apple 5.1.3(ii)** — never write fabricated health data. Seeding and debug paths are compiled out
  of release binaries and a static guard enforces it.

## Native checklist (local gate)

Native compilation is deliberately **not** a CI gate. Before a release, run locally: `npx expo
run:ios` and `npx expo run:android` against `example/`, the Maestro flows in `example/maestro/`, and
the self-verification loop (save a 3 600-point route → list → sync → read the route back → bump the
version and re-save → sync shows the replacement → delete → sync shows the removal), checking that
Health / Health Connect shows **exactly one** workout at each step.

## License

MIT
