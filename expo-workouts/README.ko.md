# @gj-kit/expo-workouts

[English](./README.md) · **한국어**

<!-- gj-kit-localized-overview -->

HealthKit과 Health Connect의 운동, 경로, 권한, 증분 동기화를 위한 native Expo bridge입니다.

## Golden path

> **완료 상태:** native Expo 앱에서 HealthKit 또는 Health Connect 사용 가능 여부를 확인하고 운동 권한을 요청합니다.

### 1. 설치

```sh
pnpm add @gj-kit/expo-workouts
```

### 2. 앱이 소유할 경계를 정합니다

config plugin을 추가하고 development build를 사용하세요. Expo Go와 웹은 native module을 호출할 수 없습니다.

### 3. 최소 연결부터 시작합니다

먼저 아래 코드를 복사한 뒤, 위에서 언급한 앱 소유 값만 교체하세요.

```ts
import { getAvailability, requestAuthorization } from '@gj-kit/expo-workouts';

export async function requestWorkoutAccess() {
  const availability = await getAvailability();
  if (availability.status === 'available') {
    await requestAuthorization({ read: ['workouts'] });
  }
  return availability;
}
```

## 사용할 때

Expo 앱이 위치 수집, UI, 동기화 소유권을 유지하면서 플랫폼 건강 데이터가 필요할 때 사용합니다.

## 사용하지 않을 때

실시간 GPS 추적, 백그라운드 위치 정책, 서버 측 건강 데이터 처리를 위해 사용하지 마세요.

## 런타임과 peer 조건

| Peer | 지원 범위 |
| --- | --- |
| `expo` | `>=56.0.0 <58.0.0` |

## 공개 entry point

- `@gj-kit/expo-workouts`
- `@gj-kit/expo-workouts/core`
- `@gj-kit/expo-workouts/testing`
- `@gj-kit/expo-workouts/plugin`

## 안전 경계

이는 native module입니다. Expo Go와 web/Node에서는 native 호출을 의도적으로 지원하지 않습니다. 권한 요청 전에 건강 데이터 권한의 이유를 설명하세요.

## 문서

- [패키지 가이드](https://gj-kit.github.io/gj-kit/ko/packages/expo-workouts/)
- [전체 API 명세](https://gj-kit.github.io/gj-kit/ko/api/expo-workouts/)
- [기계 판독 API JSON](https://gj-kit.github.io/gj-kit/api/expo-workouts.json)

포털은 npm 최신 공개판 선언 파일 스냅샷을 기준으로 합니다. 문서화된 public entry point만 사용하고 internal source file을 deep import하지 마세요.

## 상세 가이드


HealthKit (iOS) and Health Connect (Android) workouts + GPS routes for Expo, with a **gap-free
incremental sync protocol**, idempotent writes and streamed routes.

The protocol is **pure TypeScript**: cursor codec, reset classification, `added`/`removed`
reconciliation, route hygiene, size estimation, error mapping and the read budget all live in
`./core` and run on Node. The native layer implements primitives only. Runtime dependencies: **zero**.

| | |
|---|---|
| Requires | Expo SDK 56 or 57, a **development build** (Expo Go cannot load native modules) |
| iOS | 16.4+, HealthKit |
| Android | API 26+ for the package, API 28+ for Health Connect |
| Peer | `expo >=56.0.0 <58.0.0`, optional |

### What is verified, and what is not

Both native implementations are complete and were driven on real platforms: the full save → list →
sync → read-the-route-back → re-save → sync-shows-the-replacement → delete → sync-shows-the-removal
loop runs green on the iOS 26.5 simulator and on an Android 16 emulator, with Health.app and Health
Connect showing exactly one workout at each step and nothing left behind afterwards.

Four things are honestly **not** proven, and you should know them before you ship:

- **iOS `pendingUnlock` has never been reproduced.** No simulator can force protected-data-unavailable
  and no physical iPhone was available. The `status: 'pendingUnlock'` branch is a defensive design
  backed only by seam tests. Handle it; do not expect it to be exercised for you.
- **iOS distance for `swimming` / `rowing` / `wheelchair` is not share-authorized.** The write path
  attaches the matching HealthKit distance sample, but the authorization set requests only
  walking/running and cycling distance. A swimming workout carrying `distanceM` is therefore expected
  to fail the write with `notAuthorized` on iOS. Send those kinds without `distanceM` in v1, or file
  an issue so the authorization set is widened before 1.0.
- **The Health Connect permission dialog and the per-route consent dialog were not exercised end to
  end** — the test emulator already held every permission, so the request returned immediately. The
  flows are written for those screens but have never seen them.
- **Health Connect API 28–33** (the Play-APK path, as opposed to the Android 14+ APEX path) was never
  tested at all. `openSettings()` has a version branch for it that has never run.

---

## Install

```sh
npx expo install @gj-kit/expo-workouts
```

Then add the config plugin (see [Config plugin](#config-plugin)) and rebuild the development client.
`npx expo prebuild` is required — this package ships native code.

### Android: you must raise your app's `minSdk` to 26 yourself

Health Connect's `androidx.health.connect:connect-client:1.1.0` declares `minSdkVersion 26`. React
Native's default is 24. This plugin **never touches your `minSdk`** — silently raising the floor of
an app is not a config plugin's business — so the merge fails at build time with:

```
uses-sdk:minSdkVersion 24 cannot be smaller than version 26 declared in library
[androidx.health.connect:connect-client:1.1.0] … or use tools:overrideLibrary="androidx.health.connect.client"
to force usage (may lead to runtime failures)
```

Fix it in `app.json` / `app.config.ts` with `expo-build-properties`:

```json
{
  "plugins": [
    ["expo-build-properties", { "android": { "minSdkVersion": 26 } }],
    ["@gj-kit/expo-workouts", { "privacyPolicyUrl": "https://example.com/privacy" }]
  ]
}
```

Do **not** take the `tools:overrideLibrary` escape the error suggests. It compiles and then crashes
on API 24–25 devices, which is exactly the "may lead to runtime failures" the message warns about.

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

Every scope you will ever ask for at runtime must also be declared in the config plugin. Asking for
an undeclared scope throws `invalidArgument` naming the plugin prop you are missing, rather than
showing the user a dialog that cannot work.

### An empty permission result is *inconclusive*, not *denied*

On Android, backing out of Health Connect's first-run onboarding with "Go back" returns an **empty
permission set after ~20 seconds** — byte-identical to the user tapping "Don't allow" on everything.
`AuthorizationResult.conclusive` is `false` in that case. Never write a "you denied Health access"
screen from it: offer the request again. A conclusive denial (`conclusive: true` with `'denied'`
statuses) is the only thing that justifies sending the user to `openSettings()`.

`requestAuthorization()` has **no internal timeout**, on purpose. Onboarding plus the
additional-access screen took 41.6 s of scripted tapping on a real device; a timeout there would
cancel a user who is doing exactly the right thing.

### iOS read denial is invisible by design — `'unknown'` is the honest answer

HealthKit deliberately does not tell an app whether a *read* was granted, so that the absence of
data cannot be used to infer that the user is hiding something. There is no API that returns it, and
there is no trick that recovers it.

So on iOS every read scope that has already been asked about reports `read.<scope> === 'unknown'`,
permanently. Consequences you must design around:

- **`'unknown'` never accuses.** `authorizationAdvice()` will never return `'openSettings'` because
  of an `'unknown'`, and `unpopulatedWorkoutMetrics()` always returns `[]` on iOS. Showing every iOS
  user a "check your Health settings" banner forever would be worse than saying nothing.
- **An empty result is ambiguous, not "no data".** Do not render "you have no workouts" with any
  confidence on iOS. Render "no workouts found" plus a way to re-check.
- **A read-permission change made in Health › Sharing cannot be detected.** Give the user a
  "re-import" button that calls `syncWorkouts(null)`. This is a UI requirement, not a suggestion.
- The **write** direction *is* knowable on iOS (`sharingAuthorized` / `sharingDenied` /
  `notDetermined`), so `write.*` carries real `'granted'` / `'denied'` / `'undetermined'` values and
  `'openSettings'` advice does fire for a denied share type.

`getAuthorizationState()` reads facts; what to do with them is a pure function you can adopt or
re-implement:

```ts
import { authorizationAdvice, WORKOUT_TOTALS_SCOPES } from '@gj-kit/expo-workouts/core';

const facts = await workouts.getAuthorizationState();
switch (authorizationAdvice({
  state: facts,
  requiredRead: [...WORKOUT_TOTALS_SCOPES, 'routes'],
  requiredWrite: ['workouts', 'distance'],
})) {
  case 'ready':
    break;
  case 'requestable':
    showToast('Tap to connect Health.');
    break;
  case 'openSettings':
    await workouts.openSettings();
    break;
  case 'openStoreListing':
    await workouts.openStoreListing();
    break;
  case 'unsupported':
    showToast('Health data is not available on this device.');
    break;
}
```

### Android route access has three tiers, and one of them is not a permission you can request

`READ_EXERCISE_ROUTES` is **manifest-declared and never requestable at runtime.** Putting it in a
runtime permission request is silently ignored — no dialog row, no error, no grant. It is granted in
exactly two places: Health Connect Settings (→ your app → *Manage app* → **Additional access** →
*Access exercise routes* → **Always allow**), or by the user tapping **"Allow all routes"** in the
platform's own per-route dialog.

Asking for `'routes'` in `read` is neither an error nor a no-op: the returned state reports whether
it is held. What it reports is `AuthorizationState.routeAccess`:

| `routeAccess` | Meaning | What reads inline |
|---|---|---|
| `'all'` | the route permission is held **and** the app is in the foreground | every route, foreign ones included |
| `'own'` | it is not held, but `WRITE_EXERCISE_ROUTE` is | only routes this app wrote |
| `'perRoute'` | neither | nothing — each route needs `getRoute(id, { consent: 'prompt' })` |

Three measured traps behind that table:

1. **`WRITE_EXERCISE_ROUTE` is a read-affecting scope on Android.** Revoke it and your app loses the
   ability to read back routes *it wrote itself* — they start reporting `consentRequired`. Never
   cache `routeState` across app sessions; it is recomputed on every read for this reason.
2. **Health Connect's first-run onboarding is an undocumented further precondition.** With the
   permission genuinely held and the app in the foreground, foreign routes still fail with
   `consentRequired` until the user has completed Health Connect's own first-run screens. There is no
   API that reports this. `routeAccess === 'all'` **plus** `getRoute` throwing `consentRequired` is
   the signature — send the user to `openSettings()`, which lands on that screen.
3. **Route reads never work from the background**, and `READ_HEALTH_DATA_IN_BACKGROUND` does not
   help. Foreground is a hard precondition.

On iOS `routeAccess` is always `'all'` and is **not evidence of anything** — read it together with
`read.routes === 'unknown'`.

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

### `undefined` means unknown. It never means `0`

This is a contract, and on Android it is the reason the metric path looks the way it does.

Health Connect's `aggregate()` API returned `null` for every metric on every device we could
measure, before *and* after onboarding, with the root cause unknown. So this library **does not use
`aggregate()` at all** — a static guard keeps the call out of the Kotlin sources. Metrics come from
`readRecords` plus a client-side sum, filtered by `dataOrigin` so a workout's own samples are not
mixed with the wearer's unrelated background samples.

If the records are not there, the field is `undefined`. It is never rounded down to `0 m` or
`0 kcal`, because "the user burned no calories" and "we could not read the calories" are different
claims and only one of them is true.

`distanceProvenance` / `energyProvenance` tell you how much to trust a number that *is* there:
`'associated'` (summed from samples explicitly attached to the workout — trustworthy), `'total'` (a
total the writing app stated but did not back with samples), `'derived'` (summed over the workout's
time window from whatever was there — **may include other sources**; treat it as a hint, never as
the workout's own number).

---

## Incremental sync

`reset: true` always means: *the cursor you gave me is useless. Refill the window you care about
with `listWorkouts`, then continue from the cursor I just gave you.* It is never an exception.

### The initial-backfill rule

`syncWorkouts(null)` **reads nothing.** All it does is take a checkpoint — an anchor query with
`limit: 0` on iOS, a changes token on Android — and hand it back with `reset: true`,
`resetReason: 'noCursor'` and empty `added` / `removed`.

That is what makes the protocol gap-free, and it only works if you do the two steps in this order:

1. **Backfill** the window you care about with `listWorkouts`, paging to the end.
2. **Then** continue draining from the cursor that `syncWorkouts(null)` already gave you.

The cursor was taken *before* the backfill ran, so anything created during the backfill is reported
again by the drain — never skipped. That is also why the same workout can appear twice, and why
`added` is an **idempotent upsert set, not a delta append**.

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
   items loses those workouts permanently. `drainSync({ killAfterPages })` in `./testing` reproduces
   exactly that loss so you can see it happen.

`reset: true` does **not** mean "empty your table". Mark this platform's local rows *unconfirmed*,
run the `listWorkouts` backfill and the `hasMore` drain to completion, then delete whatever is still
unconfirmed. Emptying the table takes your local join data (server ids, upload state, notes) with it.

Six reasons produce a reset, and `describeCursor()` will tell you which: `noCursor`, `malformed`,
`formatUnsupported`, `platformMismatch`, `expired` (Android's 30-day idle token expiry) and
`scopesChanged`. The last one is a feature: when the user later grants `steps`, the fingerprint baked
into the cursor stops matching, everything re-syncs, and workouts you already stored get their
`steps` filled in. The read trap self-heals the moment permission is granted.

> ⚠ **Deletions are not authoritative.** HealthKit may purge a deletion record before we ever see
> it, so a workout can vanish with no `removed` entry at all. Never drive a destructive action
> (deleting an activity on your server) from `removed` alone — only a periodic full `listWorkouts`
> re-read makes deletion authoritative.

> ⚠ **A metric-only change is not reported.** If a workout object is unchanged but its separate
> distance/calorie records were updated, `syncWorkouts` says nothing. That is a structural limit of
> both platforms, not ours. Apps that need exact totals re-read the window with `listWorkouts`.

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
and the consenting call *is* the route read. The dialog's other button, **"Allow all routes"**, does
grant `READ_EXERCISE_ROUTES` — which is one of only two ways it can ever be granted.

Android only: route reads never run while the app is backgrounded, only one consent prompt may be in
flight per process (a concurrent call throws `busy`), and the prompt is wrapped in a timeout because
the platform's callback provably never fires when the route is too large for the underlying Intent.
A timed-out prompt ends the stream **empty** rather than throwing.

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

**`route` is required.** An Android upsert is full-state: it replaces everything stored, so an upsert
that omits the route **deletes the route that is already there**. Making the field optional would
mean every `saveWorkout` that forgot it silently destroyed data. `'none'` and `[]` are not the same
call shape — an empty array is `invalidArgument`, because it is almost always a bug rather than an
intent.

Everything else you send replaces everything stored, too. An equal `version` replaces; a lower one
throws `staleVersion` and writes nothing. On Android a stale version is *undetectable from the write
result alone* — the platform silently no-ops and hands back the same record id — so this library
always reads the record back after a write and raises `staleVersion` itself. That read-back is not
optional and cannot be turned off; budget for it if you are bulk-migrating.

The write path pre-flights your granted write scopes before touching the platform, so a missing scope
is `notAuthorized` naming the scope rather than a half-written transaction.

Route hygiene runs before any platform call and is identical on both platforms: out-of-range
coordinates are rejected, low-accuracy and out-of-window points are dropped, duplicate timestamps
collapse to the last one. If nothing survives, the workout is still saved with `route: 'dropped'`.
Above 20 000 points an Android write is rejected with `routeTooLarge` **before** the platform call —
`estimateAndroidRecordBytes()` is exported so you can check your own device's ceiling.

If the route step fails only because the route permission is missing, the workout is still saved:
`{ status: 'saved', route: 'notPermitted' }`. A missing route permission never fails a workout.

`deleteWorkout` removes the workout **and every record this library wrote for it** — distance,
active energy, elevation, steps, heart rate and the route. Neither platform cascades fully, so this
is six deletes on Android and an explicit sample sweep on iOS. Deleting an id we never wrote is
`deleted: false`, not an error.

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

One more asymmetry, measured on iOS 26.5: a workout **we** write can never read back as "indoor
unknown". We deliberately do not write the `HKIndoorWorkout` key when `indoor` is `undefined`, but
`HKWorkoutBuilder` stamps it itself, and there is no API to stop it. A foreign workout can still be
unknown; ours cannot.

## `kind: 'other'` is lossy, and `steps` is not a universal number

`WorkoutKind` has nine members: `running · walking · hiking · cycling · swimming · rowing ·
strength · wheelchair · other`.

`'other'` is the documented lossy sink. It stores as `OTHER_WORKOUT(0)` on Android and `.other(3000)`
on iOS, and **the original activity is not recoverable from it** — not even through `platformData`,
which is a read-only escape hatch with no write-direction counterpart, and which on Android collapses
`exerciseType` to `0` as well. If you round-trip a ski tour through this library it comes back as
"other" on both platforms. That is a v1 limitation, not a bug.

`steps` is the **platform's step count**, and it is **not meaningful for `wheelchair`**. HealthKit
counts wheelchair propulsion as `HKQuantityTypeIdentifierPushCount`, which v1 does not model; Health
Connect has only `StepsRecord`. Writing your push count into `steps` would corrupt the user's step
total, so on iOS this library **skips the step sample entirely for wheelchair workouts** and says so
here rather than quietly getting it wrong. If you need pushes, say so before 1.0 and it can be added
as a new field additively.

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

`WorkoutsError.message` is always our own English sentence and never contains a coordinate, a health
value, a workout title or a note. `nativeMessage` carries the platform's own text (capped) for your
logs — it is also scrubbed of user data by construction, but treat it as diagnostic, not as UI.

Typed codes survive the native bridge. Expo's module layer wraps a throw from an async native
function in its own exception, so the error mapping walks the whole `cause` chain and, as a last
resort, recovers the code from the wrapper's message text. Anything genuinely unrecognisable becomes
`internal` — you will never receive a bare `Error` from this library.

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

Scenario controls map one-to-one onto measured platform states:

| Control | The platform state it reproduces |
|---|---|
| `authorize()` / `setDeclared()` | granted vs *declared* scopes — an undeclared request is `invalidArgument` |
| `setNextPermissionOutcome('inconclusive')` | Health Connect onboarding's "Go back": an empty set that is not a denial |
| `setRouteAccess()` / `setOnboarded()` / `setForeground()` | the three-tier route matrix, the undocumented onboarding precondition, the background lockout |
| `expireCursor(reason)` + `corruptCursor(cursor, reason)` | all six `CursorResetReason`s |
| `replaceWorkout()` | iOS mints a new native id and emits `removed{replaced:true}`; Android reuses the id |
| `purgeDeletion()` | HealthKit purging a deletion record — the workout vanishes with no `removed` |
| `emitNoOpUpsertion()` | Android's undetectable stale-version no-op that still emits a change |
| `setMetricsMissing()` | every total stays `undefined`, never `0` |
| `setRateLimited()` | Health Connect's overloaded rate-limit error code |
| `setStoreLocked()` / `nextSaveIsPendingUnlock()` | the iOS locked-device paths |
| `failNext(primitive, payload)` | a platform-shaped throw, so the error *mapping* is what is under test |
| `hangNext(primitive)` | a promise that never settles — the Intent-overflow callback that never fires |
| `drainSync({ killAfterPages })` | a crash mid-drain, and whether the cursor was committed without the items |
| `openRouteHandles` | assert no native route handle leaked |

Three states the fake honestly **cannot** reach, because there is no measured behaviour to imitate:
the iOS sub-case where the workout landed but only the route builder failed while locked; Health
Connect's 30-day history wall silently truncating a large read (the platform emits no signal at all);
and `FLAG_PERMISSION_USER_FIXED`, the state in which route consent is cancelled silently forever.

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

`read` and `write` here are the same seven-member vocabulary as at runtime, and the same sentence
applies: **`'workouts'` is the session list, and it does not include totals.** In `app.json` that
mistake surfaces as `undefined` fields at runtime, far from the file that caused it — so in an
`app.config.ts` prefer importing `WORKOUT_TOTALS_SCOPES` from `@gj-kit/expo-workouts/core`, which
has zero peers and is safe to import from a config file.

`privacyPolicyUrl` is required: Android 14+ opens it from the health permission dialog, and Play's
Health apps declaration requires one anyway.

`history: true` adds `READ_HEALTH_DATA_HISTORY`. Without it, Android reads are walled to the last 30
days and a wider window throws `historyRequired`. Requesting `history` at runtime without the
manifest entry throws `invalidArgument` naming the missing prop.

The plugin does exactly four things — the iOS entitlement plus usage strings, the Android
`<uses-permission>` lines, the `<queries>` entry, and the two permission-rationale activity aliases.
It **never** touches your `minSdk`, your `compileSdk` or your Gradle configuration.

`@gj-kit/expo-workouts/plugin` exports the props type and nothing else — not even `ConfigPlugin` —
so `app.config.ts` type-checks in a repo that has not installed `expo`.

---

## Subpaths

| Subpath | Contents | Peers |
|---|---|---|
| `.` | the twelve functions + `workouts`, plus everything in `./core` | `expo` (native branch only) |
| `./core` | all public types, `WorkoutsError`, the activity tables, time/route/size utilities, `describeCursor`, `reconcileSyncPage`, `authorizationAdvice`, `ReadBudget`, `createWorkoutsApi` | **none** |
| `./testing` | the in-memory native-seam fake | **none** |
| `./plugin` | `GjKitWorkoutsPluginProps` | **none** |

Importing `.` on web, Node, SSR or in Expo Go **never throws**: the exports map routes those
runtimes to a build whose module graph contains no `expo` at all. There, `getAvailability()`
resolves `{ status: 'unavailable', reason: 'notSupported' }` and the other eleven reject with
`unavailable`.

---

## Native checklist (local gate)

Native compilation is deliberately **not** a CI gate — no CI runner here has Xcode, an Android SDK
and a booted emulator, and a gate that is skipped is worse than one that is documented. Before a
release, run this locally against `example/`:

| # | Step | What it proves |
|---|---|---|
| 1 | `npx expo run:ios` and `npx expo run:android` | the Swift and Kotlin sources actually compile against the pinned SDKs |
| 2 | `xcodebuild test -scheme GjKitWorkoutsSeam -parallel-testing-enabled NO` | the iOS seam tests (no device, no entitlement, no HealthKit) |
| 3 | `./gradlew :gj-kit-expo-workouts:testDebugUnitTest` | the Kotlin rule layer against the same shared JSON fixtures the TS tests read |
| 4 | the Maestro flows in `example/maestro/` | authorization, route consent and the self-verification loop, on both platforms |
| 5 | **the self-verification loop** | see below |
| 6 | Health.app / Health Connect, by eye | that the store agrees with what we reported |

The self-verification loop is step 5 and it is the one that matters: save a workout with a
3 600-point route → `listWorkouts` finds exactly it → `syncWorkouts` reports it as own → `getRoute`
reads back the same number of points with zero mismatches → bump the version and re-save → sync
reports the replacement (a *new* native id on iOS, the *same* id on Android) → delete → sync reports
the removal → nothing is left behind. Check Health / Health Connect shows **exactly one** workout at
each step, that the route polyline renders, and that after the delete every associated sample is gone
too.

Two machine traps worth writing down: boot the iOS simulator windowed (`open -a Simulator`) or the
HealthKit sheet never appears at all, and pass `-parallel-testing-enabled NO` to `xcodebuild test` or
you will read a stale container from a throwaway clone and believe a false green.

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

---

## FAQ

**Why do I need a development build?** This package ships native code. Expo Go cannot load it. On
web, Node and in Expo Go the import still resolves and `getAvailability()` answers `unavailable` —
so a shared codebase does not need platform branches around the import itself.

**Why is `distanceM` undefined even though the workout clearly has a distance?** You almost certainly
requested `read: ['workouts']` and not the metric scopes. `'workouts'` is the session alone. Call
`unpopulatedWorkoutMetrics(await getAuthorizationState())` — it names the fields that cannot be
filled. On iOS it returns `[]` by design, because iOS never reveals a read denial.

**Why does `readSteps` disagree with the Health Connect app?** `readSteps` returns the **largest
single-source total** in the window. That is the only deterministic rule that does not double-count a
phone and a watch recording the same walk. Health Connect's UI instead merges sources by its own
priority list, which apps cannot read. The two numbers are both defensible and they will differ.

**Can I request `READ_EXERCISE_ROUTES` at runtime?** No. Nothing you do in code can grant it. See
[Android route access](#android-route-access-has-three-tiers-and-one-of-them-is-not-a-permission-you-can-request).

**The user granted everything and routes still fail with `consentRequired`.** Health Connect's
first-run onboarding is not complete. There is no API that reports this; `routeAccess === 'all'` plus
`consentRequired` is the signature. Send them to `openSettings()`.

**Why does the same workout arrive twice from `syncWorkouts`?** Because the checkpoint is taken
before the backfill reads anything, which is what makes the protocol gap-free. Upsert instead of
appending and it costs you nothing.

**Can I turn off the Android read-back after every write?** No. Health Connect reports a stale-version
no-op as a success and hands back the same record id; reading back is the only way to know. Removing
it would mean silently telling you a write succeeded when it did nothing.

**Why can't I batch writes?** There is no batch API in v1, deliberately. Every write carries a
read-back, and a batch API would encourage exactly the bulk-migration pattern that burns Health
Connect's rate-limit budget. `ReadBudget` will raise `rateLimited` with a `retryAfterMs` before the
platform does.

**Does this library store or transmit anything?** No. It has zero runtime dependencies, no network
code and no telemetry. Nothing is written to disk except by the platform health store itself.

## License

MIT
