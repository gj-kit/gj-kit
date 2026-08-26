# @gj-kit/expo-workouts

**English** · [한국어](./README.ko.md)

A native Expo bridge for HealthKit and Health Connect workouts, routes, authorization, and incremental sync.

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
