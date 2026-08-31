# @gj-kit/expo-workouts

[![npm](https://img.shields.io/npm/v/@gj-kit/expo-workouts?label=npm&style=flat-square&color=0a7ea4)](https://www.npmjs.com/package/@gj-kit/expo-workouts)
[![CI](https://img.shields.io/github/actions/workflow/status/gj-kit/gj-kit/ci.yml?branch=main&label=CI&style=flat-square&color=0a7ea4)](https://github.com/gj-kit/gj-kit/actions/workflows/ci.yml)
[![types included](https://img.shields.io/badge/types-included-0a7ea4?style=flat-square)](https://www.npmjs.com/package/@gj-kit/expo-workouts)
[![runtime dependencies: 0](https://img.shields.io/badge/runtime%20deps-0-0a7ea4?style=flat-square)](https://www.npmjs.com/package/@gj-kit/expo-workouts)
[![license](https://img.shields.io/npm/l/@gj-kit/expo-workouts?label=license&style=flat-square&color=0a7ea4)](https://github.com/gj-kit/gj-kit/blob/main/expo-workouts/LICENSE)

**English** · [한국어](./README.ko.md)

> **HealthKit and Health Connect workouts in Expo, where destroying stored data is a compile error.**

## Why this exists

A Health Connect upsert is full-state: a saveWorkout that omits the route deletes the route already stored, and a write with a lower version returns normally with the same record id, so nothing but a read-back can tell it apart from a real write. HealthKit never reports read authorization at all, so a scope you forgot to declare leaves distanceM undefined on every workout with no error anywhere. And a sync loop that commits its cursor before the rows it just received loses those workouts permanently.

## What it does about it

- **Route omission is a compile error** — WorkoutWrite.route is a required `readonly RoutePoint[] | 'none'`, so omitting it is TS2741 — a Health Connect upsert without it deletes the route already stored.
- **Locked-device branch cannot be skipped** — SaveResult is a union discriminated on status, so `saved.nativeId` is TS2339 until `status === 'saved'` narrows away the pendingUnlock branch a locked device produces.
- **Missing scopes named before reading** — unpopulatedWorkoutMetrics(state) returns the Workout field names, distanceM among them, whose gating read scope is denied or never requested — before you read a single workout.
- **Safe to import anywhere** — The node/browser condition routes to index.unsupported, whose built module graph contains no expo; in Expo Go requireOptionalNativeModule returns null, so import never throws and getAvailability() resolves unavailable.
- **Sync gaps reproduce on Node** — createFakeWorkouts() replaces the NativeWorkoutsModule seam rather than WorkoutsApi, so real ./core code runs under vitest for all six CursorResetReason values and a crash mid-drain.

## Golden path

> **Outcome:** A native Expo app can check HealthKit or Health Connect availability and request workout access.

### 1. Install

```sh
pnpm add @gj-kit/expo-workouts
```

### 2. Keep the app-owned boundary explicit

Add the config plugin and use a development build; Expo Go and the web cannot call the native module.

### 3. Start with the smallest integration

Copy this first, then replace only the app-owned values named above.

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

## What that looks like

The two saveWorkout mistakes that only surface in production — a forgotten route and an unhandled locked device — are a TS2741 and a TS2339.

```ts
import { workouts } from '@gj-kit/expo-workouts';
import type { WorkoutWrite } from '@gj-kit/expo-workouts/core';

export const write: WorkoutWrite = {
  id: 'a2f6c0b8-0d7e-4f31-9d1a-7c2b5e8f0a11', // your own idempotency key, not the platform's
  version: 3, // never Date.now(): a crash retry would mint a second workout
  kind: 'running',
  startMs: 1_754_000_000_000,
  endMs: 1_754_000_600_000,
  route: 'none', // delete this line -> TS2741; an Android upsert without it erases the stored route
};

export async function save(): Promise<string | null> {
  const saved = await workouts.saveWorkout(write);
  // @ts-expect-error TS2339 — `nativeId` is absent on the `pendingUnlock` branch
  void saved.nativeId;
  if (saved.status === 'pendingUnlock') return null; // locked device: retry the same id + version
  return saved.nativeId; // narrowed past pendingUnlock, so it exists
}
```

## Verified, not asserted

- 460+ tests across unit, native and plugin
- 33 @ts-expect-error guards
- 0 runtime dependencies
- 60 XCTest + 70 Kotlin tests on shared fixtures

Every code block on this page is type-checked against the published declarations before release; `pnpm verify:release` is the gate all ten packages share.

## Use it when

Use it when an Expo app needs platform health data while retaining location collection, UI, and sync ownership.

## Do not use it when

Do not use it for live GPS tracking, background location policy, or server-side health-data processing.

## Runtime and peers

| Peer | Supported range |
| --- | --- |
| `expo` | `>=56.0.0 <58.0.0` |

## Public entry points

- `@gj-kit/expo-workouts`
- `@gj-kit/expo-workouts/core`
- `@gj-kit/expo-workouts/testing`
- `@gj-kit/expo-workouts/plugin`

## Safety boundary

This is a native module: Expo Go and web/Node are intentionally unsupported for native calls. Explain health permissions before requesting them.

## Documentation

- [Package guide](https://gj-kit.github.io/gj-kit/packages/expo-workouts/)
- [Complete API reference](https://gj-kit.github.io/gj-kit/api/expo-workouts/)
- [Machine-readable API JSON](https://gj-kit.github.io/gj-kit/api/expo-workouts.json)

The documentation references the npm-latest declaration snapshot. Use only documented public entry points; do not deep-import internal source files.

## Release notes and support

- [Changelog](./CHANGELOG.md)
- [GitHub repository](https://github.com/gj-kit/gj-kit/tree/main/expo-workouts)
- [npm package](https://www.npmjs.com/package/@gj-kit/expo-workouts)
