# Verifying a HealthKit / Health Connect Expo module locally — simulator/emulator automation and test seams

Researched 2026-08-22 on the actual dev machine (Xcode 26.6 / iOS 26.5 simulator runtime, Android Emulator 36.5.10 with the `Pixel_9a` AVD = API 36 Google Play image, Maestro 2.8.0 on PATH). Several load-bearing claims below were **executed locally** rather than read; those are tagged `[local-verified]`. Everything else carries `[official-doc]`, `[source-code]`, `[secondary]` or `[unverified]`.

Scope reminder: this report covers *how to verify* the module without physical devices or cloud CI. It does not re-research the HealthKit / Health Connect data APIs beyond what the test plan needs.

---

## 1. Facts

### iOS — Simulator, HealthKit, permission sheet

1. HealthKit **works in the iOS Simulator**. A freshly booted iPhone 17 / iOS 26.5 simulator ships `com.apple.Health` (`xcrun simctl listapps`), and on first launch of Health the store files `healthdb.sqlite`, `healthdb_secure.sqlite` (+ `-wal/-shm`) are created under `~/Library/Developer/CoreSimulator/Devices/<UDID>/data/Library/Health/`. `[local-verified]` Corroborated by Stanford's XCTHealthKit, which describes itself as a framework "to test the creation of HealthKit samples using the Apple Health App on the iPhone simulator" and runs CI on `platform=iOS Simulator,name=iPhone 17 Pro` (repo pushed 2026-04-21). `[source-code]` https://github.com/StanfordBDHG/XCTHealthKit — Note: several blog posts surfaced by search claim "HealthKit doesn't work on the simulator"; the live machine contradicts them, the live machine wins.

2. `xcrun simctl privacy` on Xcode 26.6 (17F113) supports exactly: `all, calendar, contacts-limited, contacts, location, location-always, photos-add, photos, media-library, microphone, motion, reminders, siri`. **There is no `health` service**, so simctl cannot pre-grant HealthKit. `[local-verified]` (`xcrun simctl privacy` help output)

3. The **only known way to pre-grant HealthKit on a simulator** is wix `applesimutils --setPermissions "health=YES"` (`health=YES|NO|unset (iOS/tvOS 12.0 and above)`). It works by opening the simulator's `Library/Health/healthdb.sqlite` with FMDB, inserting a `sources`/`logical_sources` row for the bundle id, deleting that source's `authorization` rows and inserting 200 rows (`object_type` 0…199) with `status` 101 (allow) or 104 (deny), `request` 203, then restarting SpringBoard. Schema branches exist for iOS ≥16 and ≥16.1 (`sync_identity` column). Last release 0.9.12 (2025-06-18); open issue #123 (2024-04) "setPermissions for health get error … NOT NULL constraint failed: authorization.sync_identity", open issue #129 (2025-09) "iOS 26 disabling face id permission doesn't work". **Whether the health write still matches the iOS 26.5 healthdb schema is unverified** — it is a reverse-engineered private schema. `[source-code]` https://github.com/wix/AppleSimulatorUtils (README + `applesimutils/SetHealthKitPermission.m`) `[unverified for iOS 26]`

4. The HealthKit authorization sheet **is reachable from the app's own XCUIApplication hierarchy** (no SpringBoard / interruption monitor needed). XCTHealthKit's `handleHealthKitAuthorization()` is literally: `if self.navigationBars["Health Access"].waitForExistence(timeout:) { self.tables.staticTexts["Turn On All"].tap(); self.buttons["Allow"].tap() }`. `[source-code]` https://github.com/StanfordBDHG/XCTHealthKit/blob/main/Sources/XCTHealthKit/XCTest%2BHealthKit.swift — There is no API to dismiss the sheet programmatically; `requestAuthorization` only shows it for types the user has not yet decided, so once decided (by tap or by applesimutils DB edit) it returns without UI. `[official-doc behaviour, inferred for tests]`

5. The simulator Health app **can manually add a Workout** (Search tab → Activity → Workouts → "+"): fields are *Activity Type, Kilocalories, Distance (km), Starts, Ends*. **No route field exists**, so a workout *with* an `HKWorkoutRoute` can only be seeded through HealthKit write APIs (`HKWorkoutBuilder` + `HKWorkoutRouteBuilder`) from an app that has write authorization — i.e. from the module under test or a helper target. `[local-verified, Maestro-driven screenshots]` XCTHealthKit's well-known sample types (steps, active energy, resting HR, ECG, pushes) confirm only simple samples are scripted via the Health UI. `[source-code]`

6. First launch of the simulator Health app shows a system alert "“Health” Would Like to Send You Notifications" (Don't Allow / Allow) and, per XCTHealthKit, sometimes an onboarding / account sheet (`navigationBars["HealthExperienceUI.ProfileView"].buttons["Done"]`); automation must dismiss these. `[local-verified + source-code]`

7. Maestro 2.8.0 **drives the iOS 26.5 simulator on this Mac** (installs its XCUITest runner, `launchApp: com.apple.Health`, `tapOn`, `scrollUntilVisible`, `takeScreenshot` all succeeded; screenshots land in `~/.maestro/tests/<timestamp>/<flow>/takeScreenshot/*.png`, not in cwd). `[local-verified]` Maestro issue #3318 ("iOS driver XCUITest port unreachable … iPhone 17 Pro / iOS 26.5", v2.6.0) was closed 2026-05-27. `[source-code]`

8. Maestro iOS permission pre-grant list (`LocalSimulatorUtils.kt`): `calendar, camera, contacts, faceid, homekit, medialibrary, microphone, motion, photos, reminders, siri, speech, userTracking` via a **pinned applesimutils at `~/.maestro/deps/applesimutils`** (falls back to PATH), plus `location` via `simctl privacy`. **`health` is absent**; the docs table marks `health` ❌ on both iOS and Android; feature request #2942 "add Health permission support" is open since 2026-01-20. `[source-code]` https://github.com/mobile-dev-inc/maestro/blob/main/maestro-ios-driver/src/main/kotlin/util/LocalSimulatorUtils.kt , https://docs.maestro.dev/maestro-flows/flow-control-and-logic/permissions , https://github.com/mobile-dev-inc/maestro/issues/2942

9. Detox: `device.launchApp({ permissions: { health: 'YES' } })` — documented as "Requires AppleSimUtils; unsupported by simctl"; the `permissions` parameter is iOS-only. Detox 20.51.4 (npm, 2026-06-16) documents RN **0.77.x–0.84.x** as tested and says "Expo integration with Detox is entirely a community-driven effort. There is no special support for Expo projects in Detox." Our consumer is RN 0.86. `[official-doc]` https://wix.github.io/Detox/docs/api/device , https://wix.github.io/Detox/docs/introduction/environment-setup

10. Appium XCUITest driver: `appium:permissions` capability (`{"<bundleId>": {"<service>": "yes|no|unset"}}`) and `mobile: setPermission`; `location`/`location-always` go through `xcrun simctl privacy`, every other service (incl. `health`) through applesimutils, which "needs to be installed on the host". `autoAcceptAlerts` only covers standard alerts. `[official-doc]` https://appium.github.io/appium-xcuitest-driver/latest/reference/capabilities/ , https://github.com/appium/appium-xcuitest-driver/blob/master/docs/reference/execute-methods.md

11. The Claude Code iOS Simulator MCP tool (`mcp__Claude_Code_iOS_Simulator__control`) **failed on this machine** with "Xcode is installed but not selected. Run `sudo xcode-select -s /Applications/Xcode.app/Contents/Developer`", even though `xcode-select -p` already prints that path. Until the user resolves it (sudo), the working fallbacks are `xcrun simctl io <udid> screenshot x.png` + Maestro flows (both verified today). `[local-verified]`

12. GPS can be scripted on the simulator: `xcrun simctl location <device> set <lat>,<lon>` | `run <scenario>` | `start [--speed=m/s] [--distance=m | --interval=s] lat1,lon1 lat2,lon2 …` (waypoints interpolated; `-` reads waypoints from stdin) | `clear`. `[local-verified]` (`xcrun simctl location` help)

13. HealthKit store persistence: the store is an ordinary SQLite file inside the device data container, so it survives `simctl shutdown`/`boot`; `simctl erase` ("Erase a device's contents and settings") wipes it; `simctl clone` copies a device including its data. `[local: help text]` Surviving reboot is inferred from file location, not exercised today. `[unverified-inferred]`

14. `HKHealthStore.isHealthDataAvailable()` is `true` on iOS, watchOS, visionOS and iPadOS 17+, `false` on iPadOS ≤16 and macOS ("framework is available … but your app can't read or write HealthKit data"). Entitlement key `com.apple.developer.healthkit`; Info.plist keys `NSHealthShareUsageDescription` (read) and `NSHealthUpdateUsageDescription` (write). `[official-doc]` https://developer.apple.com/documentation/healthkit/hkhealthstore/ishealthdataavailable() , https://developer.apple.com/documentation/healthkit/setting-up-healthkit

15. Saving an `HKWorkout` with `totalDistance` does **not** create `distanceWalkingRunning` samples; a query for them returns 0 even though the Health app shows the workout. Samples must be added explicitly (`HKWorkoutBuilder.add([...])`). `[secondary — Apple Developer Forums thread 692302]` https://developer.apple.com/forums/thread/692302

### Android — Emulator, Health Connect, `pm grant`

16. Local AVD `Pixel_9a`: `system-images/android-36/google_apis_playstore/arm64-v8a`, Android 16, SDK 36, security patch 2025-04-05, fingerprint `google/sdk_gphone64_arm64/emu64a:16/BP22.250325.006`, SDK extensions u/v/b = 17. Other installed images: android-32 google_apis + playstore, android-37.0 google_apis_playstore_ps16k. `[local-verified]`

17. Health Connect on that image is the **framework module**: APEX `com.google.android.healthfitness` (updated copy active at `/data/apex/active/com.android.healthfitness@360915160.apex`), apk-in-apex UI `com.google.android.healthconnect.controller` (versionName 16, minSdk 34) and `com.google.android.health.connect.backuprestore`. **`com.google.android.apps.healthdata` is NOT an installed package** on Android 14+ images; it remains the `<queries>` name the SDK docs prescribe and the Play-Store APK name for Android ≤13. `[local-verified]` Android docs: "Starting Android 14 (API Level 34), Health Connect is part of the Android Framework … there's no setup necessary"; on Android 13 and lower "you need to install the Health Connect app from the Google Play Store" (so only Play-Store images can be used below API 34). `[official-doc]` https://developer.android.com/health-and-fitness/guides/health-connect/develop/get-started

18. All `android.permission.health.*` permissions are declared with `android:protectionLevel="dangerous"` and `android:permissionGroup="android.permission-group.HEALTH"` (AOSP `packages/modules/HealthFitness/apk/HealthPermissionsManifest.xml`), and `adb shell pm list permissions -f` on the emulator shows the same (`protectionLevel:dangerous`, package `com.google.android.healthconnect.controller`). The singular `android.permission.health.READ_EXERCISE_ROUTE` is `signature` (internal to the controller); the plural `READ_EXERCISE_ROUTES` is the app-facing dangerous one. `[source-code + local-verified]` https://android.googlesource.com/platform/packages/modules/HealthFitness/+/refs/heads/main/apk/HealthPermissionsManifest.xml

19. **`adb shell pm grant` works for Health Connect permissions on the API 36 emulator.** I built a codeless probe APK (`aapt2 link` + `zipalign` + `apksigner` with the debug keystore, manifest with `android:hasCode="false"`) declaring 7 health permissions, installed it, and `pm grant dev.gjkit.healthprobe android.permission.health.{READ_EXERCISE, WRITE_EXERCISE, READ_EXERCISE_ROUTES, WRITE_EXERCISE_ROUTE, READ_HEALTH_DATA_IN_BACKGROUND, READ_HEALTH_DATA_HISTORY, READ_DISTANCE}` all exited 0; `dumpsys package` then showed each as `granted=true, flags=[ USER_SENSITIVE_WHEN_GRANTED|USER_SENSITIVE_WHEN_DENIED]`. `pm revoke` also worked. `[local-verified on Android 16 / API 36]` Android 14 (API 34) and 15 (API 35) were **not** exercised; same protection level makes it very likely but `[unverified for 34/35]`.

20. **Health Connect's own UI could not be launched via intents on the headless, keyguard-locked emulator boot.** `dumpsys package` lists `TrampolineActivity` (actions `HEALTH_HOME_SETTINGS`, `MANAGE_HEALTH_DATA`, `MAIN`), `PermissionsActivity` (`REQUEST_HEALTH_PERMISSIONS`) and the `PermissionControllerEntryPoint` alias (`MANAGE_HEALTH_PERMISSIONS`, guarded by `android.permission.GRANT_RUNTIME_PERMISSIONS`), the package is `installed=true hidden=false enabled=0(default)` with no disabled components except `LegacySettingsEntryPoint` — yet `am start -a android.health.connect.action.HEALTH_HOME_SETTINGS`, `cmd package query-activities`, and even the explicit component start all fail ("Activity class … does not exist", ActivityTaskManager result code -92). The emulator was started with `-no-window` and the keyguard stayed up (`isKeyguardShowing=true`, `wm dismiss-keyguard` did not clear it). Root cause **unknown**; must be re-checked with a windowed boot, unlocked screen, and a real app calling `PermissionController.createRequestPermissionResultContract()`. `[local, unexplained]`

21. Health Connect requires a device lock: "To protect your data, Health Connect requires you to lock your phone with a PIN, pattern, or password." On an emulator: `adb shell locksettings set-pin 1234` (and `locksettings clear --old 1234` to remove). `[official-doc for the requirement]` https://developer.android.com/codelabs/health-connect ; the adb command is standard `lockSettings` tooling (`adb shell locksettings help` exists on the image). `[local]`

22. Health Connect Toolbox: `https://goo.gle/health-connect-toolbox` → `https://www.gstatic.com/health-ecosystems/health_connect_toolbox.zip` (11,802,500 bytes, Last-Modified 2026-08-18), install with `adb install HealthConnectToolbox-{Version Number}.apk`; it "supports reading and writing all Health Connect data types"; the codelab uses "INSERT HEALTH RECORD > Activity > ExerciseSession". Whether its ExerciseSession form lets you enter **route points** is not documented → `[unverified]`. Not downloaded today (download needs the user's go-ahead). `[official-doc]` https://developer.android.com/health-and-fitness/guides/health-connect/test/health-connect-toolbox

23. Cross-app read rules (also apply on the emulator): "By default, all applications can read data from Health Connect for up to 30 days prior to when any permission was first granted"; Android 14+: "No historical limit on an app reading its own data. 30-day limit on an app reading other data"; older data needs `android.permission.health.READ_HEALTH_DATA_HISTORY`; background reads need `android.permission.health.READ_HEALTH_DATA_IN_BACKGROUND`; filter by `DataOrigin` in `ReadRecordsRequest.dataOriginFilter`; default `pageSize` 1000. Rate-limiter values live on the emulator in `device_config health_fitness` (e.g. `RateLimiter__max_read_requests_per_15m_foreground=1000`, `…per_24h_foreground=5000`, same for writes). `[official-doc + local]` https://developer.android.com/health-and-fitness/guides/health-connect/develop/read-data

24. Exercise routes: `PERMISSION_READ_EXERCISE_ROUTES` "can't be granted via the standard permission request mechanism, and can only be granted by a user in Settings, or via the dialog launched by ExerciseRouteRequestContract … When this permission is granted, the app can read exercise routes without user interaction, however reading apps must be in the foreground unless READ_HEALTH_DATA_IN_BACKGROUND is also granted." Reading another app's session yields `ExerciseRouteResult.Data | ConsentRequired | NoData`; `ExerciseRouteRequestContract : ActivityResultContract<String /*sessionId*/, ExerciseRoute?>` launches the per-route consent dialog (buttons "Allow this route" / "Don't allow"; the activity requires the caller to hold `READ_EXERCISE`). Writing a route needs `WRITE_EXERCISE_ROUTE` or "the session insertion/update will be rejected". `[source-code]` https://android.googlesource.com/platform/frameworks/support/+/refs/heads/androidx-main/health/connect/connect-client/src/main/java/androidx/health/connect/client/permission/HealthPermission.kt , …/contracts/ExerciseRouteRequestContract.kt , AOSP `apk/res/values/strings.xml` — **Consequence for tests: `pm grant … READ_EXERCISE_ROUTES` (verified to grant, fact 19) is the only non-UI way to bypass per-route consent on an emulator.**

25. Health Connect permission-request UI strings (for UiAutomator/Maestro selectors): header "Allow <app> to access Health Connect?", buttons **"Allow all"**, **"Allow"**, **"Don't allow"**; route dialog **"Allow this route"** / "Don't allow". `[source-code]` AOSP `packages/modules/HealthFitness/apk/res/values/strings.xml`

26. `androidx.health.connect.client.HealthConnectClient` is a Kotlin **`interface`** (so trivially fakeable in JUnit/Robolectric); `getSdkStatus()` → `SDK_UNAVAILABLE = 1`, `SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED = 2`, `SDK_AVAILABLE = 3`, and on API ≥34 it checks `HealthConnectManager` instead of the APK. Maven: stable `1.1.0`, newest `1.2.0-alpha05` (metadata lastUpdated 2026-08-12); the get-started doc currently shows `1.2.0-alpha05`. `[source-code + registry]` https://dl.google.com/android/maven2/androidx/health/connect/connect-client/maven-metadata.xml

27. Emulator GPS: `adb emu geo fix <lon> <lat> [alt] [sat] [vel]`, `adb emu geo nmea <sentence>`, `adb emu geo gnss <sentence>` (console `help geo`). GPX/KML playback is only in the Extended Controls UI (no CLI flag found in `emulator -help`). `[local-verified]`

28. Maestro Android permissions: `launchApp`/`setPermissions` with `all: allow` reads the APK's `uses-permission` list and runs `pm grant <app> <perm>` for each (ignoring "is not a changeable permission type"), so **health permissions get granted implicitly by `all` even though Maestro's named map has no `health` key** (named map: bluetooth, calendar, camera, contacts, location, medialibrary, microphone, notifications, phone, sms, …). `[source-code]` https://github.com/mobile-dev-inc/maestro/blob/main/maestro-client/src/main/java/maestro/drivers/AndroidDriver.kt

### Expo test plumbing

29. `jest-expo` "will automatically return the exported functions because of a `requireNativeModule` call when running during a unit test"; default mocks go in the module's `__mocks__/<NativeModuleName>.ts` ("Create a file with the same name as the native module you want to mock"); `npx expo-modules-test-core generate-ts-mocks` (needs `brew install sourcekitten`) scaffolds TS mocks from Swift signatures; Android-only methods must be added by hand. `[official-doc]` https://docs.expo.dev/modules/mocking/

30. `expo-module-scripts` (npm 56.0.3, 2026-05-29; `jest-expo` 57.0.4; `@expo/config-plugins` 57.0.8, 2026-08-14): `expo-module test plugin` = `jest --rootDir plugin --config plugin/jest.config.js` (or the built-in `jest-preset-plugin.cjs`: `testEnvironment: 'node'`, `testRegex: '/__tests__/.*(test|spec)\.[jt]sx?$'`, swc transform, `passWithNoTests: true`). Required plugin layout: `app.plugin.js` → `plugin/build`, `plugin/src/index.ts`, `plugin/tsconfig.json` extending `expo-module-scripts/tsconfig.plugin`, optional `plugin/__tests__/`. `[source-code]` https://github.com/expo/expo/tree/main/packages/expo-module-scripts

31. `@expo/config-plugins` exports `compileModsAsync(config, { projectRoot, platforms?: ModPlatform[], introspect?: boolean })`, `evalModsAsync`, `withDefaultBaseMods`; with `introspect: true` it swaps in `withIntrospectionBaseMods` which "never write[s]" and drops dangerous mods, covering `ios.infoPlist, ios.entitlements, ios.expoPlist, ios.podfileProperties, android.manifest, android.gradleProperties, android.strings, android.colors, android.colorsNight, android.styles`; results land in `config._internal.modResults`. CLI twin: `npx expo config --type introspect`; debugging: `EXPO_DEBUG=1 npx expo prebuild`, `npx expo prebuild --clean`, `EXPO_CONFIG_PLUGIN_VERBOSE_ERRORS=1`. `[official-doc + source-code]` https://docs.expo.dev/config-plugins/development-and-debugging/ , https://github.com/expo/expo/blob/main/packages/@expo/config-plugins/src/plugins/mod-compiler.ts

32. Expo's own plugin tests (e.g. `packages/expo-notifications/plugin/src/__tests__/withNotificationsiOS-test.ts`) use `memfs` (`vol.fromJSON`, `jest.mock('fs')`) plus `IOSConfig.XcodeUtils.getPbxproj(projectRoot)` against a template `project.pbxproj`. `[source-code]`

33. `expo-modules-test-core` 57.0.6 (2026-07-29): the iOS podspec "ships no sources. It exists so that test specs can depend on a single pod to pull in the JS runtime that ExpoModulesCore requires when running tests" (deps `ExpoModulesCore` + `React-hermes`/`React-jsc`, platform iOS 16.4); Android `build.gradle` exposes as `api`: `junit:junit:4.13.2`, `org.robolectric:robolectric:4.16`, `io.mockk:mockk:1.13.5`, `androidx.test:core/runner/rules 1.7.0`, `androidx.test.ext:junit 1.3.0`, `com.google.truth:truth:1.4.5`, `kotlinx-coroutines-test:1.10.2`. Expo's own iOS native tests are plain XCTest Swift files (`packages/expo-modules-core/ios/Tests/*.swift`). `[source-code]`

34. Tool liveness (GitHub API, 2026-08-22): Maestro pushed 2026-08-21 (494 open issues); appium-xcuitest-driver pushed 2026-08-21; Detox pushed 2026-06-16 (203 open); AppleSimulatorUtils pushed 2025-06-18 (15 open, last release 0.9.12); XCTHealthKit pushed 2026-04-21 (0 open). `[registry]`

---

## 2. API sketch relevant to our library (test seams and automation recipes)

### 2.1 TypeScript seam (gate 1 — vitest, no native)

```ts
// src/native.ts — the ONLY file that touches requireNativeModule
import { requireNativeModule } from 'expo-modules-core';
export interface NativeHealthModule {
  isAvailable(): Promise<'available' | 'unavailable' | 'update-required'>;
  requestAuthorization(req: { read: string[]; write: string[] }): Promise<void>;
  readWorkouts(q: { from: number; to: number; includeRoutes: boolean }): Promise<RawWorkout[]>;
  writeWorkout(w: RawWorkoutInput): Promise<string>;
}
export const Native: NativeHealthModule = requireNativeModule('GjKitHealth');
```
- `__mocks__/GjKitHealth.ts` (jest-expo convention) *or* for vitest: `vi.mock('../src/native', () => ({ Native: fakeNative }))`.
- Pure functions live apart from the seam and are the unit-test surface: `normalizeWorkout(raw, platform)`, `simplifyRoute(points, epsilonM)`, `haversineM(a, b)`, `routeDistanceM`, `toIso(msSinceEpoch, tzOffsetS)`.

### 2.2 Swift seam (gate 2 — XCTest in `example/ios`)

```swift
protocol HealthStoring {                       // wraps HKHealthStore so XCTest can fake it
  func requestAuthorization(toShare: Set<HKSampleType>, read: Set<HKObjectType>) async throws
  func execute(_ query: HKQuery)
  func save(_ objects: [HKObject]) async throws
}
extension HKHealthStore: HealthStoring {}
// Seeding a workout WITH a route (works on the simulator once write auth exists):
let builder = HKWorkoutBuilder(healthStore: store, configuration: cfg, device: .local())
try await builder.beginCollection(at: start)
try await builder.addSamples([distanceSample, energySample])
try await builder.endCollection(at: end)
let workout = try await builder.finishWorkout()
let route = HKWorkoutRouteBuilder(healthStore: store, device: nil)
try await route.insertRouteData(locations)            // [CLLocation]
try await route.finishRoute(with: workout!, metadata: nil)
// Reading back: HKSampleQuery(sampleType: .workoutType(), …) then
// HKWorkoutRouteQuery(route:) on HKSeriesType.workoutRoute() samples belonging to the workout.
```
XCUITest helper for the sheet (copy of XCTHealthKit, fact 4):
```swift
if app.navigationBars["Health Access"].waitForExistence(timeout: 20) {
  app.tables.staticTexts["Turn On All"].tap(); app.buttons["Allow"].tap()
}
```

### 2.3 Kotlin seam (gate 2 — JUnit/Robolectric via expo-modules-test-core deps)

```kotlin
// HealthConnectClient is an interface → inject it
class HealthConnectGateway(private val client: HealthConnectClient) {
  suspend fun writeWorkout(w: WorkoutInput): String {
    val route = w.route?.let { pts -> ExerciseRoute(pts.map {
      ExerciseRoute.Location(time = it.time, latitude = it.lat, longitude = it.lon,
        horizontalAccuracy = it.hAcc?.let(Length::meters), altitude = it.alt?.let(Length::meters)) }) }
    val rec = ExerciseSessionRecord(startTime = w.start, startZoneOffset = w.zone, endTime = w.end,
      endZoneOffset = w.zone, exerciseType = ExerciseSessionRecord.EXERCISE_TYPE_RUNNING,
      title = w.title, exerciseRoute = route, metadata = Metadata.activelyRecorded(Device(type = Device.TYPE_PHONE)))
    return client.insertRecords(listOf(rec)).recordIdsList.first()
  }
  suspend fun readRoute(id: String) = when (val r = client.readRecord(ExerciseSessionRecord::class, id).record.exerciseRouteResult) {
    is ExerciseRouteResult.Data -> r.exerciseRoute
    is ExerciseRouteResult.ConsentRequired -> null /* surface as 'consentRequired' */
    else -> null
  }
}
```

### 2.4 Permission pre-grant / dialog automation recipes

```sh
# Android (verified on API 36): pre-grant everything the app declares
PKG=com.yourapp
for p in READ_EXERCISE WRITE_EXERCISE READ_EXERCISE_ROUTES WRITE_EXERCISE_ROUTE \
         READ_HEALTH_DATA_IN_BACKGROUND READ_HEALTH_DATA_HISTORY READ_DISTANCE; do
  adb shell pm grant $PKG android.permission.health.$p; done
adb shell dumpsys package $PKG | grep android.permission.health   # expect granted=true
adb shell locksettings set-pin 1234                                # HC wants a screen lock
adb emu geo fix 126.9780 37.5665                                   # lon lat (note the order)

# iOS: no simctl service; either tap the sheet or (unverified on iOS 26) applesimutils
xcrun simctl location booted start --speed=3 --interval=1 37.5665,126.9780 37.5700,126.9820
applesimutils --booted --bundle com.yourapp --setPermissions "health=YES"   # brew tap wix/brew && brew install applesimutils
xcrun simctl io booted screenshot shot.png
```
Maestro flows (tool already installed, iOS run verified today):
```yaml
# ios-auth.yaml
appId: com.yourapp
---
- launchApp
- tapOn: "Request Health Access"          # your example-app button
- tapOn: "Turn On All"
- tapOn: "Allow"
```
```yaml
# android-auth.yaml (if you do NOT pm grant)
appId: com.yourapp
---
- launchApp:
    permissions: { all: unset }
- tapOn: "Request Health Access"
- tapOn: "Allow all"
- tapOn: "Allow"
# per-route consent dialog, if READ_EXERCISE_ROUTES was not pre-granted:
- tapOn: "Allow this route"
```

### 2.5 Config-plugin snapshot test (gate 4)

```ts
// plugin/__tests__/withGjKitHealth-test.ts  (run: `expo-module test plugin`)
import { compileModsAsync } from '@expo/config-plugins';
import withGjKitHealth from '../src';
it('introspected mods match snapshot', async () => {
  let config: any = { name: 'app', slug: 'app', ios: { bundleIdentifier: 'dev.gjkit.app' }, android: { package: 'dev.gjkit.app' } };
  config = withGjKitHealth(config, { readUsage: 'r', writeUsage: 'w', background: true });
  config = await compileModsAsync(config, { projectRoot: '/tmp/fixture-prebuilt-app', platforms: ['ios', 'android'], introspect: true });
  expect(config._internal.modResults).toMatchSnapshot();   // infoPlist, entitlements, AndroidManifest
});
```
(`projectRoot` must contain a bare template; Expo's own tests mount one via `memfs`.) A belt-and-braces CLI variant for the example app: `EXPO_DEBUG=1 npx expo prebuild --clean --no-install` then `git diff --exit-code example/ios example/android` against committed snapshots, or `npx expo config --type introspect --json`.

---

## 3. Design implications for a minimal-options unified API

1. **Make the native boundary one TS file and one native protocol per platform.** Everything the team can run in vitest (normalisation, route simplification, unit conversion, time-zone math, pagination) must not import `expo-modules-core` except through `src/native.ts`. This is what makes gate 1 possible without a simulator.

2. **Expose a single `authorize({ read, write })` + `getAuthorizationState()` that can legitimately answer `"undetermined" | "granted" | "denied" | "unknown"`.** HealthKit never reveals read-denial (reads just come back empty), Health Connect reveals it but `READ_EXERCISE_ROUTES` cannot be requested through the normal contract (fact 24). A minimal API should *not* pretend it can report "routes readable" on iOS; it can only report what the platform reports. Tests then assert the state machine, not platform truth.

3. **Route reading must have an explicit tri-state result per workout**: `route: Point[] | null` plus `routeStatus: 'available' | 'none' | 'consentRequired'`. On Android `ConsentRequired` is a normal outcome for other apps' sessions; hiding it behind `null` makes the self-verifying test (write → read) pass while production silently loses routes.

4. **Offer `requestRouteAccess(workoutId)` (Android-only no-op on iOS) rather than a boolean option.** It maps 1:1 to `ExerciseRouteRequestContract` and is the only thing that can turn `consentRequired` into data without Settings. Keep it out of the core read call so the read stays side-effect free.

5. **Writes must go through the platform builders, never raw `HKWorkout(...)` init** (fact 15): distance/energy samples are separate objects on iOS; on Android routes are a field of `ExerciseSessionRecord` and need `WRITE_EXERCISE_ROUTE`. Normalise the input to `{ type, start, end, distanceM?, energyKcal?, route?: Point[] }` and let each native side derive the samples. The write path is also what seeds the simulator for every read test, so it must exist even if the user only "needs read".

6. **Config plugin must own**: iOS `com.apple.developer.healthkit` (+ `com.apple.developer.healthkit.background-delivery` only if background delivery is exposed), `NSHealthShareUsageDescription`, `NSHealthUpdateUsageDescription`; Android `uses-permission`s for exactly the data types the library supports, `<queries><package android:name="com.google.android.apps.healthdata"/></queries>`, the rationale `activity-alias` (`VIEW_PERMISSION_USAGE` + `HEALTH_PERMISSIONS`). Because these are all "safe" mods (infoPlist/entitlements/manifest) they are 100 % covered by `compileModsAsync({introspect:true})` snapshots — no prebuild needed in CI.

7. **Normalise time as epoch-ms + zone offset seconds** (Health Connect stores `startZoneOffset`; HealthKit has `HKMetadataKeyTimeZone` only as optional metadata). Tests can then be deterministic across the Mac's TZ.

8. **Hide**: HealthKit anchors/`HKAnchoredObjectQuery`, Health Connect change tokens, `pageSize`, rate-limit knobs (fact 23 shows the limits are device_config driven — not something callers should tune). If incremental sync is wanted later, expose `changesSince(token)` as one opaque-token call.

9. **Availability check is not optional** — `isHealthDataAvailable()` false on iPad ≤16/macOS, `getSdkStatus()` 1/2/3 on Android (fact 26); surface as `'available' | 'unavailable' | 'update-required'` and make every other call reject with a typed error when not available, so the example-app smoke can assert the negative path on an API 32 image (no HC) too.

---

## 4. Pitfalls / gotchas

- **No `simctl privacy health`** (fact 2). Anyone who writes `xcrun simctl privacy booted grant health …` gets "Invalid service". Plan for tapping the sheet or applesimutils.
- **applesimutils edits a private SQLite schema**; it already broke once on iOS 16/16.1 and has an open NOT-NULL issue. Treat `health=YES` on iOS 26 as "try once, fall back to tapping". Also it restarts SpringBoard, which Maestro issue #2103 reports can wedge a simulator.
- **Maestro has no `health` permission key on either platform**; on Android `all: allow` silently covers it via `pm grant` (fact 28) but on iOS nothing is pre-granted — the sheet will appear and must be tapped by text.
- **HealthKit sheet text is localised.** `"Turn On All"` / `"Allow"` / `"Health Access"` only match on an English simulator. Pin the simulator language (`xcrun simctl spawn booted defaults write "Apple Global Domain" AppleLanguages -array en`) or use accessibility identifiers where available.
- **Health app first-launch chrome** (notifications alert, onboarding/account sheet) will break flows that launch Health to inspect data; dismiss defensively (fact 6).
- **Simulator Health app cannot add routes** (fact 5) → the only route fixture source is your own write API. A read-only first release still needs a write path in the example app.
- **`HKWorkout(totalDistance:)` ≠ distance samples** (fact 15): a read test that sums `distanceWalkingRunning` will see 0 unless the writer adds samples.
- **Route queries need the workout object from the same store**; `HKWorkoutRouteQuery` streams in batches — a test that awaits the first callback only will see a truncated route.
- **Android `ConsentRequired` is the default for other apps' routes** (fact 24); the Toolbox-written session will come back without a route unless `READ_EXERCISE_ROUTES` is `pm grant`-ed or the dialog is tapped ("Allow this route").
- **30-day history wall** (fact 23): Toolbox/test data older than 30 days before first grant is invisible without `READ_HEALTH_DATA_HISTORY` — the codelab deliberately inserts "an exercise session from 40 days ago" to demonstrate this. Fixture timestamps should be recent.
- **Health Connect UI did not resolve on a headless, locked emulator** (fact 20). Boot the emulator windowed (or at least `-no-window` + `adb shell input keyevent 82` after setting no lock) and verify `am start -a android.health.connect.action.HEALTH_HOME_SETTINGS` opens before blaming the module. Set a PIN (fact 21) because HC refuses to show data without a secure lock.
- **`com.google.android.apps.healthdata` is not a package on API 34+** (fact 17): a "does the provider exist" check via `PackageManager.getPackageInfo(...)` would wrongly report *unavailable*; use `HealthConnectClient.getSdkStatus()`.
- **Robolectric has no HealthConnectManager shadow**; any Kotlin test touching the real `HealthConnectClient.getOrCreate()` will crash — hence the interface seam (fact 26).
- **Detox** documents RN ≤0.84 and no Expo support; adopting it for an RN 0.86 + Expo SDK 57 module means being the community. Maestro (already installed, works with iOS 26.5 here) or raw XCUITest/UiAutomator are the pragmatic choices.
- **Claude Code iOS Simulator tool currently errors** on this Mac (fact 11). The next session should either ask the user to run the `sudo xcode-select -s …` command it prints or plan on `simctl io … screenshot` + Maestro.
- **App Store review**: HealthKit apps must include both usage strings, must not write to HealthKit without the entitlement, and Health data cannot be used for advertising — unrelated to testing but an unfinished `NSHealthUpdateUsageDescription` in the config plugin is the classic ITMS-90683 rejection. `[secondary, well known; not re-verified]`

---

## 5. Open questions

### Needs a USER decision
1. **Permission strategy for iOS E2E**: (a) tap the sheet in every flow (robust, ~2 s), (b) install applesimutils via Homebrew and try `health=YES` on iOS 26.5 (fast if it works, private schema), or (c) both with fallback. Installing brew packages and downloading the Toolbox zip need the user's OK.
2. **Do we ship a write API in v1?** Even a read-only consumer needs it for the self-verifying simulator loop (fact 5). Decide whether it is public or an `internal`/example-only entry point.
3. **E2E tool of record**: Maestro (installed, cross-platform, YAML, no `health` key but workable) vs XCUITest + UiAutomator (most control, two languages) vs Detox (Expo/RN 0.86 unsupported). Recommendation: Maestro for the smoke loop, XCTest/JUnit for native units.
4. **Minimum Android for Health Connect**: treat API < 34 as "install Health Connect from Play" (needs Play images in the emulator matrix) or declare API 34+ only.

### Needs a hands-on device/simulator test
5. applesimutils 0.9.12 `health=YES` against iOS 26.5 healthdb (fact 3).
6. HealthKit sheet element names on iOS 26.5 (`"Health Access"`, `"Turn On All"`, `"Allow"`) inside an Expo dev-client build — XCTHealthKit's CI suggests yes, but confirm through Maestro's hierarchy (`maestro studio` / `maestro hierarchy`).
7. `HKWorkoutRouteQuery` returns the inserted `CLLocation`s on the simulator (write→read round trip).
8. Why Health Connect activities do not resolve on a headless/locked API 36 emulator (fact 20); confirm they appear after a windowed boot + PIN, and that `PermissionController.createRequestPermissionResultContract()` shows "Allow all".
9. `pm grant android.permission.health.*` on API 34 and 35 images (only API 36 verified) — download `system-images;android-34;google_apis;arm64-v8a` / `android-35` via `sdkmanager` (cmdline-tools are not installed at `$ANDROID_HOME/cmdline-tools`).
10. Whether the Toolbox's ExerciseSession form accepts route points (fact 22), and its `DataOrigin` package name for `dataOriginFilter` tests.
11. HealthKit store survives `simctl shutdown/boot` and `simctl clone` (fact 13) — cheap to confirm; would enable a "golden seeded simulator" fixture.

### Needs more research
12. Apple's exact HealthKit review requirements for 2026 (usage-string wording, background delivery justification) — outside this dimension, not re-verified.
13. Whether Health Connect on Android 16 Play images receives the HC module via Play system updates on emulators (the local APEX was already an updated copy at `/data/apex/active`), i.e. how reproducible the emulator HC version is across machines.
14. Maestro's roadmap for #2942 (health permission) — if it lands, the iOS flow can drop the sheet-tapping step.

---

## 6. Sources

Local (executed 2026-08-22 on the dev Mac)
- `xcodebuild -version`, `xcrun simctl privacy`, `xcrun simctl location`, `xcrun simctl list runtimes`, `xcrun simctl listapps`, `ls …/data/Library/Health/`, `xcrun simctl io booted screenshot`
- Maestro 2.8.0 flows against iPhone 17 / iOS 26.5 (`~/.maestro/tests/2026-08-22_0039*/`, `…_0041*/`)
- Android Emulator 36.5.10, AVD `Pixel_9a` (android-36 google_apis_playstore): `getprop`, `pm list packages`, `pm list permissions -f -g`, `dumpsys package`, `device_config list health_fitness`, probe APK built with build-tools 37.0.0 (`aapt2`, `zipalign`, `apksigner`), `pm grant` / `pm revoke`, `am start`, `cmd package query-activities`, `adb emu help geo`, `locksettings`
- GitHub REST API metadata for wix/AppleSimulatorUtils, wix/Detox, mobile-dev-inc/maestro, appium/appium-xcuitest-driver, StanfordBDHG/XCTHealthKit; npm registry for detox, expo-module-scripts, expo-modules-test-core, jest-expo, @expo/config-plugins; Google Maven metadata for connect-client

Apple
- https://developer.apple.com/documentation/healthkit/hkhealthstore/ishealthdataavailable()
- https://developer.apple.com/documentation/healthkit/setting-up-healthkit
- https://developer.apple.com/forums/thread/692302 (secondary)

Android / AOSP / Jetpack
- https://developer.android.com/health-and-fitness/guides/health-connect/develop/get-started
- https://developer.android.com/health-and-fitness/guides/health-connect/develop/read-data
- https://developer.android.com/health-and-fitness/guides/health-connect/develop/exercise-routes
- https://developer.android.com/health-and-fitness/guides/health-connect/plan/data-types
- https://developer.android.com/health-and-fitness/guides/health-connect/test/health-connect-toolbox (download: https://goo.gle/health-connect-toolbox → https://www.gstatic.com/health-ecosystems/health_connect_toolbox.zip)
- https://developer.android.com/codelabs/health-connect
- https://android.googlesource.com/platform/packages/modules/HealthFitness/+/refs/heads/main/apk/HealthPermissionsManifest.xml
- https://android.googlesource.com/platform/packages/modules/HealthFitness/+/refs/heads/main/apk/AndroidManifest.xml
- https://android.googlesource.com/platform/packages/modules/HealthFitness/+/refs/heads/main/apk/res/values/strings.xml
- https://android.googlesource.com/platform/packages/modules/HealthFitness/+/refs/heads/main/apk/src/com/android/healthconnect/controller/utils/DeviceInfoUtils.kt
- https://android.googlesource.com/platform/frameworks/support/+/refs/heads/androidx-main/health/connect/connect-client/src/main/java/androidx/health/connect/client/HealthConnectClient.kt
- https://android.googlesource.com/platform/frameworks/support/+/refs/heads/androidx-main/health/connect/connect-client/src/main/java/androidx/health/connect/client/permission/HealthPermission.kt
- https://android.googlesource.com/platform/frameworks/support/+/refs/heads/androidx-main/health/connect/connect-client/src/main/java/androidx/health/connect/client/contracts/ExerciseRouteRequestContract.kt
- https://dl.google.com/android/maven2/androidx/health/connect/connect-client/maven-metadata.xml

E2E tooling
- https://github.com/wix/AppleSimulatorUtils (README; `applesimutils/applesimutils/SetHealthKitPermission.m`; issues #123, #129; releases)
- https://github.com/StanfordBDHG/XCTHealthKit (README; `Sources/XCTHealthKit/XCTest+HealthKit.swift`, `XCTest+AddSamples.swift`, `HealthAppSampleType.swift`; `.github/workflows/build-and-test.yml`)
- https://docs.maestro.dev/maestro-flows/flow-control-and-logic/permissions
- https://github.com/mobile-dev-inc/maestro/blob/main/maestro-ios-driver/src/main/kotlin/util/LocalSimulatorUtils.kt
- https://github.com/mobile-dev-inc/maestro/blob/main/maestro-client/src/main/java/maestro/drivers/AndroidDriver.kt
- https://github.com/mobile-dev-inc/maestro/issues/2942 , https://github.com/mobile-dev-inc/maestro/issues/3318
- https://wix.github.io/Detox/docs/api/device , https://wix.github.io/Detox/docs/introduction/environment-setup
- https://appium.github.io/appium-xcuitest-driver/latest/reference/capabilities/ , https://github.com/appium/appium-xcuitest-driver/blob/master/docs/reference/execute-methods.md

Expo
- https://docs.expo.dev/modules/mocking/
- https://docs.expo.dev/config-plugins/development-and-debugging/
- https://github.com/expo/expo/tree/main/packages/expo-module-scripts (README, `jest-preset-plugin.cjs`, `bin/expo-module-test`)
- https://github.com/expo/expo/tree/main/packages/expo-modules-test-core (`ios/ExpoModulesTestCore.podspec`, `android/build.gradle`, `package.json`)
- https://github.com/expo/expo/blob/main/packages/@expo/config-plugins/src/plugins/mod-compiler.ts
- https://github.com/expo/expo/blob/main/packages/expo-notifications/plugin/src/__tests__/withNotificationsiOS-test.ts
