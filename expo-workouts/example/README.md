# `@gj-kit/expo-workouts` example

A dev-client smoke harness. It is **not** a product, **not** a workspace package, and **not** packed
into the tarball — it exists so a human can watch the twelve public functions behave on a real
simulator and emulator, and so `example/maestro/*.yaml` has something to drive.

## Why it is not a workspace package

The repo's `pnpm-workspace.yaml` says `packages: ["*"]`, which matches **direct children of the repo
root only**. `expo-workouts/example` is two levels down, so pnpm never sees it:

```
$ corepack pnpm list --recursive --depth -1
gj-kit, @gj-kit/expo-media, @gj-kit/expo-ui, @gj-kit/expo-ui-docs,
@gj-kit/expo-workouts, @gj-kit/toss-payments, @gj-kit/toss-payments-nestjs,
@gj-kit/toss-payments-postgresql        # <- no example
```

`pnpm -r build` / `-r test` / `-r typecheck` therefore skip it, and root `pnpm install` neither
installs nor links it. (`build`, `test` and `test:types` are still defined here as no-ops, so that a
future `packages: ["**"]` could not turn this folder into a red recursive script.)

It is also excluded from the tarball twice over: the package's `files` allow-list does not mention
it, and `scripts/check-pack-contents.mjs` lists `example/` under `forbiddenPrefixes`.

## Install and run

Use **npm**, the `create-expo-module` convention — the library is consumed by relative path, and
React Native's Metro and Gradle both want a hoisted `node_modules`:

```sh
cd expo-workouts && corepack pnpm run build   # the example imports dist/, so build first
cd example && npm install
```

`"@gj-kit/expo-workouts": "file:.."` makes npm **symlink** `node_modules/@gj-kit/expo-workouts` to
the package root, so an edit + rebuild in the library is picked up with no reinstall.

```sh
npm run introspect     # expo config --type introspect — the fastest plugin check
npm run typecheck      # tsc --noEmit, including app.config.ts
npm run prebuild       # regenerate ios/ + android/ from app.config.ts

open -a Simulator      # MANDATORY before anything that touches HealthKit (f126)
npm run ios            # expo run:ios

emulator -avd Pixel_9a_hcprobe -port 5556 &
JAVA_HOME=<a JDK 17> npm run android
```

> **Gotcha, measured here.** The library's podspec uses a glob
> (`s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"`), and CocoaPods expands globs at **`pod install`
> time**, not at build time. When a native lane adds a new Swift file, an existing `example/ios/Pods`
> keeps the old file list, `expo run:ios` sees a fresh `Podfile.lock` and skips reinstalling, and the
> build dies with `cannot find 'GjKitWorkoutsModule' in scope` inside the generated
> `ExpoModulesProvider.swift` — a message that points at the app, not at the real cause. After the
> library gains or loses an `ios/*.swift` file, run
> `cd example/ios && LANG=en_US.UTF-8 pod install` before rebuilding.
> (`LANG` is not optional: without a UTF-8 locale, CocoaPods 1.16.2 on Ruby 4.0 dies inside
> `unicode_normalize` with `Encoding::CompatibilityError` before it reads the Podfile.)

`ios/` and `android/` here are **`expo prebuild` output** and are gitignored — regenerate them, never
edit them. Everything the app needs from the native side comes from the config plugin, so
`npx expo prebuild --clean` is always safe.

## What the screen does

| Control | Function | Phase 2 behaviour |
|---|---|---|
| Availability row | `getAvailability()` | the one function that never rejects |
| Authorization row | `getAuthorizationState()` | |
| Request authorization | `requestAuthorization()` | validates the request, then the native stub answers |
| List / Sync / Get route / Read heart rate / Read steps / Save workout | the matching function | prints the `WorkoutsError` **`code`** when it rejects |
| Open health settings | `openSettings()` | |

The log prints **codes and key shapes, never values** — no coordinate, heart rate or kcal reaches the
UI. `00-smoke.yaml` asserts that, so a change that starts leaking values fails the flow.

`Get route (fake id)` is worth understanding: `getRoute()` returns an `AsyncIterable` and is **lazy**,
so its rejection lands on the first `for await` iteration, not on the call. The button iterates on
purpose.

### Two dependencies that look redundant and are not

* **`babel-preset-expo`.** Normally `expo` hoists it; here it does not. The library is symlinked in,
  its own pnpm `node_modules` carries a full **SDK 56** tree as devDependencies, and npm therefore
  refuses to hoist `babel-preset-expo@57` past the `babel-preset-expo@56` it can already reach —
  it nests it under `expo/node_modules` instead, where Babel cannot resolve it from
  `example/babel.config.js`. Metro then dies with a message that names neither Babel nor the preset:
  `Cannot read properties of undefined (reading 'transformFile')` at `metro/src/Bundler.js:55`, with
  the real cause (`Failed to construct transformer: Cannot find module 'babel-preset-expo'`) printed
  once, earlier, in the `expo start` output. Declaring it here pins it at the app root and the
  problem disappears.
* **`expo-build-properties`.** It exists only to set `android.minSdkVersion = 26`. Design decision
  **D7** is that the library's config plugin must NOT silently raise a consumer's `minSdkVersion`,
  so a consumer that skips this gets a manifest-merger failure — which is exactly what the README's
  Android checklist documents. Keeping the workaround visible here is the point.

## `app.config.ts`

The config file imports **types** from `@gj-kit/expo-workouts/plugin` and the
`WORKOUT_TOTALS_SCOPES` constant from `@gj-kit/expo-workouts/core`. Both subpaths have **zero
peers**, which is what makes them importable from a file that runs under plain Node before Metro
exists. The plugin itself is applied by module name — Expo resolves `@gj-kit/expo-workouts` to the
package's `app.plugin.js`.

Note the scope vocabulary: `'workouts'` is the **session list alone**. It does not include totals.
The example spreads `WORKOUT_TOTALS_SCOPES` for the coarse behaviour.

## Maestro

See [`maestro/README.md`](maestro/README.md) for the flows, the measured selector hazards, and the
one selector that is still `[unverified]`.

## Phase 2 status (measured 2026-08-22)

| Check | Result |
|---|---|
| `npx expo config --type introspect` | **pass** — HealthKit entitlement, both `NSHealth*UsageDescription` strings, 15 `android.permission.health.*` lines, the `<queries>` entry and both `activity-alias` blocks all appear |
| `npx expo prebuild` | **pass** on both platforms; the generated `.entitlements`, `Info.plist` and `AndroidManifest.xml` carry the same content |
| `npx expo run:ios` on iPhone 17 (`F852C6FF-…`) | **pass**, `0 error(s)`; app installed and launched |
| `npx expo run:android` on `Pixel_9a_hcprobe` | **pass**, APK installed and launched |
| `maestro test maestro/00-smoke.yaml` | **pass on both platforms** |
| `maestro test maestro/10-android-authorize.yaml` | **pass** (every Health Connect screen skipped — unreachable in Phase 2) |
| `maestro test maestro/11-android-route-consent.yaml` | **pass** (route dialog skipped — unreachable in Phase 2) |
| `maestro test maestro/20-ios-authorize.yaml` | **pass** (HealthKit sheet skipped — unreachable in Phase 2) |

Both platforms report `AVAILABILITY: available`, so the native modules really are linked and
answering — this is not the `null`-native fallback. The other functions reject with the Phase 2
stub's codes, which is the honest expected result.

One thing the harness surfaced that is **not** expected: `syncWorkouts` reports
`rejected non-WorkoutsError` on both platforms, because the native `takeCheckpoint` stub throws a
generic exception instead of a `Workouts*Exception`, so `mapNativeError` cannot turn it into a
public `code`. See the Phase 2 handoff — it is a native-layer defect, not an example-app one.
