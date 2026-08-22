# Follow-up verification batch 3 — route filtering, permission automation, SDK levels, rate limits, route API shape, time-window semantics, Android ≤13 scope

Date: 2026-08-22. Method: primary sources only (Apple doc JSON + iOS 26.5 SDK headers/swiftinterface, AOSP gitiles per release branch, Jetpack source already cached in `research/src` + `research/hc-src`, GitHub API, npm registry, local toolchain). Every verdict cites the decisive line.

Verdict summary

| # | Item | Verdict |
|---|---|---|
| 1 | HK stores points verbatim; Fitness hides out-of-window / indoor routes | PARTIALLY — filtering: UNRESOLVABLE-WITHOUT-DEVICE-TEST; timestamp rule: DTS statement only; outdoor/type rule: community post only |
| 2 | Simulator/emulator permission automation | PARTIALLY — `simctl` gap CONFIRMED; `pm grant` on 34/35 UNRESOLVABLE (new risk: `READ_EXERCISE_ROUTES` absent before android14-qpr2); applesimutils/HK-sheet/HC-UI: device tests |
| 3 | Expo 57 compileSdk 35 vs 36 | CONFIRMED B (compileSdk 36); health-connect-read.md fact 5 / §3 are wrong |
| 4 | HC quota 2000/16000 vs 1000/5000 | PARTIALLY — AOSP constants are 2000/16000/1000/8000 on 15/16/main; DeviceConfig override path only exists in android14-release; emulator `RateLimiter__*` keys have no reader in AOSP 16 |
| 5 | Route eager vs lazy | RESOLVED (recommendation): `routeState` on workout + lazy streaming `getRoute` + Android per-page cache |
| 6 | `from/to` semantics | RESOLVED — HK default overlap, HC framework = start-time-only; use `.strictStartDate` on iOS |
| 7 | Android 9–13 APK scope | PARTIALLY resolved — API 26/27 are always `SDK_UNAVAILABLE`; routes not feature-gated in Jetpack; APK versionCode for routes [unverified]; needs USER decision |

## 1. Facts

### Item 1 — HealthKit route storage and Fitness display

1. Apple's "Creating a workout route" puts accuracy filtering on the app, not the store: "Because raw Core Location data can contain a significant amount of noise, your app needs to filter out any inaccurate locations before adding them to the route builder. Don't add any locations whose accuracy is greater than 50 meters. For best results, try to keep the time between locations to 3 seconds or less." [official-doc] https://developer.apple.com/documentation/healthkit/creating-a-workout-route
2. The only documented server-side transformation is sorting. iOS 26.5 SDK `HKWorkoutRouteBuilder.h` `insertRouteData:completion:`: "Note that CLLocation may be inserted in any order but will be sorted according to date when the series is finalized." The Apple doc page repeats: "the builder sorts them by date when finalizing the route." No mention of dropping points by accuracy, negative accuracy, or timestamp. [source-code][official-doc] iPhoneOS26.5.sdk HealthKit.framework/Headers/HKWorkoutRouteBuilder.h L47-60; https://developer.apple.com/documentation/healthkit/hkworkoutroutebuilder/insertroutedata(_:completion:)
3. "Reading route data": "Locations from the HealthKit store are accurate within 50 meters, but they may need additional smoothing before you can use them." This is compatible with both "HealthKit drops worse points" and "Apple assumes writers obeyed fact 1"; the docs do not say which. [official-doc] https://developer.apple.com/documentation/healthkit/reading-route-data
4. `HKWorkoutRoute.h` is an empty subclass (`@interface HKWorkoutRoute : HKSeriesSample @end`) — no validation hooks or constraints are exposed in the header. [source-code] iPhoneOS26.5.sdk .../Headers/HKWorkoutRoute.h
5. Fitness/timestamps: the only Apple-authored statement is DTS (Ziqiao Chen) in thread 773069: "Regarding the workout route issue, it is typically because the route data has something wrong. One example is that the timestamps in the track points of the route are not set or are not consistent with the workout start / end time." The thread contains nothing about indoor/outdoor or accuracy filtering. [secondary] https://developer.apple.com/forums/thread/773069
6. Fitness/activity-type + outdoor: thread 83855 has no Apple staff replies. Community user ethanfan (Sep 2017): "Only a few workouts are supported e.g running, walking, and cycling. Make sure you have the workout metadata with "Outdoor"". The accepted answer there is about a missing `HKObjectType.workoutType()` permission, not display. [unverified — single community post] https://developer.apple.com/forums/thread/83855
7. `HKMetadataKeyIndoorWorkout` doc says only: "Set this key's value to true if the workout was performed indoors; otherwise, set it to false." — no link to route display. [official-doc] https://developer.apple.com/documentation/healthkit/hkmetadatakeyindoorworkout
8. `HKWorkoutRouteQueryDescriptor` exists for the read-back test and for streaming: `public struct HKWorkoutRouteQueryDescriptor { public var workoutRoute: HKWorkoutRoute; public init(_ workoutRoute:) }`, `@available(iOS 15.4, …) extension … : HKAsyncSequenceQuery { public struct Results : AsyncSequence { Element = CLLocation … } }`. [source-code] iPhoneOS26.5.sdk HealthKit.framework/Modules/HealthKit.swiftmodule/arm64e-apple-ios.swiftinterface L549-561
9. iOS 26.5 simulator runtime ships `Fitness.app` and `Health.app` (`RuntimeRoot/Applications`), so the visual check is possible on the Simulator. [source-code] local `ls` (re-verified today)

Verdict 1: PARTIALLY. (a) "stores verbatim": no doc either way → UNRESOLVABLE-WITHOUT-DEVICE-TEST (test in §5). (b) "timestamps must sit in [start,end] or Fitness hides the route": best available is a DTS "typically" statement [secondary]; keep the clamp. (c) "outdoor / supported type required": [unverified] community claim; keep `HKMetadataKeyIndoorWorkout=false` for outdoor workouts because it is correct metadata anyway, but do not promise Fitness rendering. (d) Read-side: do not assume ≤50 m accuracy; keep `horizontalAccuracy` on every `RoutePoint` and let callers filter.

### Item 2 — Permission automation on Simulator / emulator

10. `xcrun simctl privacy` (Xcode 26.6, re-run today) lists exactly: `all, calendar, contacts-limited, contacts, location, location-always, photos-add, photos, media-library, microphone, motion, reminders, siri`. No `health`. [source-code] local `xcrun simctl privacy` help
11. `applesimutils` is not installed on this machine. Repo: last push 2025-06-18, latest release 0.9.12 (2025-06-18), 684 stars, 15 open issues including #123 (2024-04-05) "setPermissions for health get error: … NOT NULL constraint failed: authorization.sync_identity" and #129 (2025-09-17) "iOS 26 disabling face id permission doesn't work". No iOS 26 health fix since. [source-code] https://api.github.com/repos/wix/AppleSimulatorUtils , …/releases , …/issues
12. Maestro feature request #2942 "[Feature Request] add Health permission support" is still open (created 2026-01-20, not closed). [source-code] https://api.github.com/repos/mobile-dev-inc/maestro/issues/2942
13. Health permissions are ordinary runtime permissions in every AOSP branch: `HealthPermissionsManifest.xml` (main) declares e.g. `android.permission.health.READ_EXERCISE_ROUTES … android:protectionLevel="dangerous" android:permissionGroup="android.permission-group.HEALTH"` (same for `READ_EXERCISE`, `READ_HEALTH_DATA_HISTORY`, `READ_HEALTH_DATA_IN_BACKGROUND`). So `pm grant` is the correct mechanism on any API level where the permission is *defined*. [source-code] https://android.googlesource.com/platform/packages/modules/HealthFitness/+/refs/heads/main/apk/HealthPermissionsManifest.xml
14. NEW: the permission set differs by Android 14 module revision. `apk/HealthPermissionsManifest.xml` per branch: `android14-release` and `android14-qpr1-release` contain **no** `READ_EXERCISE_ROUTES`, `READ_HEALTH_DATA_HISTORY`, or `READ_HEALTH_DATA_IN_BACKGROUND` (only the legacy singular `android.permission.health.READ_EXERCISE_ROUTE` / `WRITE_EXERCISE_ROUTE`); `android14-qpr2-release` adds `READ_EXERCISE_ROUTES` and `READ_HEALTH_DATA_IN_BACKGROUND`; `android14-qpr3-release` adds `READ_HEALTH_DATA_HISTORY`. (72 `<permission>` entries in android14-release vs 96 in main.) Consequence: on an API 34 image whose HealthFitness module predates QPR2, `pm grant … READ_EXERCISE_ROUTES` fails with an unknown-permission error, and Jetpack reports `FEATURE_STATUS_UNAVAILABLE` (its gate is `HealthConnectPlatformVersion(buildVersionCode=34, sdkExtensionVersion=13)`). [source-code] gitiles `+/refs/heads/android14-{,qpr1-,qpr2-,qpr3-}release/apk/HealthPermissionsManifest.xml`; `src/HealthConnectFeatures.kt` L130-160
15. Locally installed system images: `android-32 google_apis`, `android-32 google_apis_playstore`, `android-36 google_apis_playstore`, `android-37.0 google_apis_playstore_ps16k`. No 34/35 → the 34/35 `pm grant` check cannot be run without downloading images (needs the user's go-ahead). [source-code] local `~/Library/Android/sdk/system-images`
16. The "Health Connect UI does not launch on headless locked emulator" failure has a specific code: ActivityManager result `-92` = `START_CLASS_NOT_FOUND` (`FIRST_START_FATAL_ERROR_CODE = -100` + 8). [source-code] https://android.googlesource.com/platform/frameworks/base/+/refs/heads/main/core/java/android/app/ActivityManager.java L165, L530
17. The HC controller's `<application android:name=".HealthConnectApplication" …>` declares no `android:directBootAware`, and `TrampolineActivity` (actions `HEALTH_HOME_SETTINGS`, `MANAGE_HEALTH_DATA`, `MAIN`) declares none either. PackageManager doc: "when a user is started but credentials have not been presented yet, the user is running "locked" and only MATCH_DIRECT_BOOT_AWARE components are returned." → Hypothesis (unverified): the emulator was in `RUNNING_LOCKED` (PIN set on a previous boot, cold boot without unlock), which makes non-direct-boot-aware components "not exist" to `am start`/`query-activities`. [source-code] https://android.googlesource.com/platform/packages/modules/HealthFitness/+/refs/heads/main/apk/AndroidManifest.xml L39-60; https://android.googlesource.com/platform/frameworks/base/+/refs/heads/main/core/java/android/content/pm/PackageManager.java L1228-1236 [unverified hypothesis]
18. HK sheet automation strings (`"Health Access"` nav bar, `"Turn On All"`, `"Allow"`) come from XCTHealthKit source (prior report fact 4); whether iOS 26.5 still uses those labels is untested. [source-code][unverified for iOS 26]

Verdict 2: PARTIALLY. CONFIRMED: no `simctl privacy health`; `pm grant` is the right mechanism (dangerous runtime perms). CORRECTED: "works on API 34/35" must be qualified — it can only work where the permission exists (module ≥ android14-qpr2 for routes/background, ≥ qpr3 for history). UNRESOLVABLE-WITHOUT-DEVICE-TEST: applesimutils on iOS 26.5, HK sheet labels on iOS 26.5, HC UI on a windowed/unlocked emulator (tests in §5).

### Item 3 — Expo SDK 56/57 Android SDK levels

19. `react-native@0.86.2` `packages/react-native/gradle/libs.versions.toml` (and branch `0.86-stable`): `minSdk = "24"`, `targetSdk = "36"`, `compileSdk = "36"`, `buildTools = "36.0.0"`, `ndkVersion = "27.1.12297006"`, `agp = "8.12.0"`, `kotlin = "2.1.20"`. Local `react-native@0.85.3` (SDK 56) is identical. npm: 0.86.x versions are `0.86.0, 0.86.2` (latest tag 0.87.0). [source-code] https://raw.githubusercontent.com/facebook/react-native/v0.86.2/packages/react-native/gradle/libs.versions.toml ; local `node_modules/.pnpm/react-native@0.85.3*/…/gradle/libs.versions.toml` ; https://registry.npmjs.org/react-native
20. Expo `sdk-57` `ExpoRootProjectPlugin.kt` L52-56: `getVersionOrDefault("buildTools","35.0.0")`, `("minSdk","24")`, `("compileSdk","35")`, `("targetSdk","35")` — the literals are only the fallback when the RN catalog lacks the key, which it never does for RN 0.85/0.86. [source-code] https://raw.githubusercontent.com/expo/expo/sdk-57/packages/expo-modules-autolinking/android/expo-gradle-plugin/expo-autolinking-plugin/src/main/kotlin/expo/modules/plugin/ExpoRootProjectPlugin.kt
21. `connect-client-1.1.0.aar`: `META-INF/com/android/build/gradle/aar-metadata.properties` = `minCompileSdk=36`, `minCompileSdkExtension=0`, `minAndroidGradlePluginVersion=8.9.1`; `AndroidManifest.xml` = `<uses-sdk android:minSdkVersion="26" />`. So compileSdk 35 would fail AGP's compileSdk check against this AAR. [source-code] local `research/aar/1.1.0.aar` (downloaded from dl.google.com/android/maven2)

Verdict 3: CONFIRMED B. Corrected statement for health-connect-read.md fact 5 and §3 (lines 271, 313): "Expo SDK 56 and 57 consumers build with compileSdk 36 / targetSdk 36 / minSdk 24 / AGP 8.12.0 / Kotlin 2.1.20 taken from RN's version catalog; the `35` in `ExpoRootProjectPlugin.kt` is a dead fallback. `connect-client:1.1.0` requires `minCompileSdk=36`, so an app that pins `android.compileSdkVersion=35` via expo-build-properties cannot resolve it. The only real mismatch is minSdk 24 vs the AAR's 26."

### Item 4 — Health Connect rate-limit numbers

22. `framework/java/android/health/connect/ratelimiter/RateLimiter.java` on `android15-release`, `android16-release`, and `main` all define `QUOTA_BUCKET_READS_PER_15M_FOREGROUND_DEFAULT_FLAG_VALUE = 2000`, `…24H_FOREGROUND = 16000`, `…15M_BACKGROUND = 1000`, `…24H_BACKGROUND = 8000`, `WRITES_PER_15M_{FOREGROUND,BACKGROUND} = 1000`, `WRITES_PER_24H_{FOREGROUND,BACKGROUND} = 8000`, `CHUNK_SIZE_LIMIT_IN_BYTES = 5000000`, `RECORD_SIZE_LIMIT_IN_BYTES = 1000000`, `DATA_PUSH_LIMIT_PER_APP_15M = 35000000`, `DATA_PUSH_LIMIT_ACROSS_APPS_15M = 100000000`. Each API call costs `DEFAULT_API_CALL_COST = 1`. [source-code] gitiles `+/refs/heads/{android15-release,android16-release,main}/framework/java/android/health/connect/ratelimiter/RateLimiter.java`
23. Who can override them: `android14-release` `HealthConnectDeviceConfigManager` reads DeviceConfig namespace `health_fitness` keys `max_read_requests_per_24h_foreground`, `max_read_requests_per_24h_background`, `max_read_requests_per_15m_foreground`, `max_read_requests_per_15m_background`, `max_write_requests_per_*`, `max_write_chunk_size`, `max_write_single_record_size`, `enable_rate_limiter`, and pushes them via `RateLimiter.updateApiCallQuotaMap(...)` / `updateMemoryQuotaMap(...)` (L514-518). Keys carry **no** `RateLimiter__` prefix. [source-code] gitiles `+/refs/heads/android14-release/service/java/com/android/server/healthconnect/HealthConnectDeviceConfigManager.java` L42-63, L514-518
24. `android15-release` `HealthConnectDeviceConfigManager` no longer defines the `max_*_requests_*` flags; the only RateLimiter hook left is `RateLimiter.updateEnableRateLimiterFlag(...)` (L505, L547). `android16-release` has **no** `HealthConnectDeviceConfigManager.java` at all (HTTP 404; directory listing shows none), and its `RateLimiter` is an instance whose `initQuotaBuckets()` fills the map purely from the constants in fact 22. So in AOSP 15/16 the quotas are not DeviceConfig-overridable. [source-code] gitiles android15-release `HealthConnectDeviceConfigManager.java`; android16-release `service/java/com/android/server/healthconnect/` listing; `RateLimiter.java` L60-120
25. The official "Plan to avoid rate limiting" page publishes no numbers: "Health Connect imposes two limits on the number of API calls available to your app: A periodic limit … A daily limit …" — searching the page text for "15 minutes"/"24 hours" finds nothing. [official-doc] https://developer.android.com/health-and-fitness/guides/health-connect/plan/rate-limiting (cached `rate-limiting.html`)
26. The testing-e2e observation (`device_config health_fitness` → `RateLimiter__max_read_requests_per_15m_foreground=1000`, `…per_24h_foreground=5000`) is therefore (a) a different key format from anything AOSP 14 reads, and (b) unread by AOSP 15/16 code. Whether Google's production HealthFitness module build (what the `google_apis_playstore` image runs) reads `RateLimiter__*` keys cannot be determined from AOSP. [unverified]

Verdict 4: PARTIALLY. Neither number set is "the" limit: 2000/16000 are the AOSP constants on current releases; 1000/5000 are server-pushed flags visible on the emulator with no AOSP reader. Planning rule stays as suggested: budget for 1000 / 15 min and 5000 / 24 h foreground (≈ 350 workouts per bucket at 2–3 calls each), surface `ERROR_RATE_LIMIT_EXCEEDED` as a typed retryable error, and measure the real ceiling on device (§5).

### Item 5 — Route: eager vs lazy

27. On Android the route (or its consent state) is already inside every session read, on both code paths. U+ (`RecordConverters.kt` L422-425): `exerciseRouteResult = route?.let { ExerciseRouteResult.Data(it.toSdkExerciseRoute()) } ?: if (hasRoute()) ExerciseRouteResult.ConsentRequired() else ExerciseRouteResult.NoData()`. APK path (`ProtoToRecordConverters.kt` L458-464): `subTypeDataListsMap["route"]?.let { Data(…) } ?: if (valuesMap["hasRoute"]?.booleanVal == true) ConsentRequired() else NoData()`. [source-code] cached `hc-src/RecordConverters.kt`, `hc-src/ProtoToRecordConverters.kt`
28. A lazy Android `getRoute` implemented as `readRecord(ExerciseSessionRecord::class, id)` costs one quota unit per call (fact 22) and, without `READ_HEALTH_DATA_HISTORY`, "Any attempt to read a single data point, via readRecord, older than 30 days … will result in an error" (prior fact 37; `HealthPermission.kt` KDoc L186-198 lists `readRecord` first). [source-code][official-doc] cached `src/HealthPermission.kt`; https://developer.android.com/health-and-fitness/health-connect/read-data
29. Background reads change the answer: "When your app runs in the background and tries to read an exercise route created by another app, Health Connect returns an ExerciseRouteResult.ConsentRequired response, even if your app has Always allow access to exercise route data." and "Even if your app has been granted "Always allow" access to exercise route data, background access to routes created by other apps is restricted." [official-doc] https://developer.android.com/health-and-fitness/guides/health-connect/develop/exercise-routes
30. On iOS the route is a separate `HKWorkoutRoute` sample per workout and must be streamed (`HKWorkoutRouteQuery` batches / `HKWorkoutRouteQueryDescriptor.results(for:)` AsyncSequence, fact 8); there is no per-route quota. [official-doc][source-code] https://developer.apple.com/documentation/healthkit/hkworkoutroute ; swiftinterface

Verdict 5 (recommendation): `Workout.routeState: 'available' | 'consentRequired' | 'none'` eagerly on every workout, plus lazy `getRoute(workoutId)` that streams/chunks. Android: compute `routeState` from the inline result for free and keep the `ExerciseRoute` of the **current page** in a bounded native cache keyed by record id, so `getRoute` right after `listWorkouts` costs zero extra quota; on cache miss fall back to `readRecord` (and map the >30-day error to a typed `historyPermissionRequired`). iOS: `routeState` needs one cheap local existence query per workout (`HKSampleQueryDescriptor(predicates: [.workoutRoute(HKQuery.predicateForObjects(from: workout))], limit: 1)`); no quota on HealthKit, so eager is fine. Do not add an `include: ['route']` flag in v1 (violates "minimal options"); revisit only if the per-workout existence query is measurably slow on 1000+ workouts.

### Item 6 — `from`/`to` window semantics

31. HealthKit default is overlap. `HKQuery.h`: "@constant HKQueryOptionNone — The sample's time period must overlap with the predicate's time period. @constant HKQueryOptionStrictStartDate — The sample's start date must fall in the time period (>= startDate, < endDate). @constant HKQueryOptionStrictEndDate — The sample's end date must fall in the time period (>= startDate, < endDate)". Apple doc for `strictStartDate`: "The sample's start time must be equal to or later than the target's start time, and the sample's start time must also be earlier than the target's end time." [source-code][official-doc] iPhoneOS26.5.sdk `HKQuery.h` L39-52; https://developer.apple.com/documentation/healthkit/hkqueryoptions/strictstartdate
32. Health Connect framework (API 34+) `readRecords` filters **only on the start-time column**, i.e. strict-start semantics. `main` `RecordHelper.getReadTableWhereClause`: `String timeColumnName = request.usesLocalTimeFilter() ? getLocalStartTimeColumnName() : getStartTimeColumnName(); … addWhereGreaterThanOrEqualClause(timeColumnName, startTimeMillis); … addWhereLessThanClause(timeColumnName, endTimeMillis);` → `start_time >= from AND start_time < to`. `IntervalRecordHelper` does not override this. [source-code] https://android.googlesource.com/platform/packages/modules/HealthFitness/+/refs/heads/main/service/java/com/android/server/healthconnect/storage/datatypehelpers/RecordHelper.java L730-780; `IntervalRecordHelper.java`
33. `android14-release` uses the same column but an inclusive upper bound: `clauses.addWhereBetweenTimeClause(getStartTimeColumnName(), startDateAccess, request.getEndTime())` → SQL `start_time BETWEEN a AND b` ("@param endTime the latest end time (inclusive)"). A session starting exactly at `to` is returned on the initial Android 14 module and excluded on later ones — a one-millisecond edge, irrelevant if pages are keyed by `pageToken`. [source-code] gitiles android14-release `RecordHelper.java` L644-652; main `WhereClauses.java` L60-74
34. Aggregates are the exception — they use overlap: `// data start time < filter end time … // for IntervalRecord, filters by overlapping // data end time >= filter start time`. So `aggregate(EXERCISE_DURATION_TOTAL, between(from,to))` counts a 23:50–00:10 session in both days while `readRecords` returns it once. [source-code] main `RecordHelper.java` L176-183
35. Jetpack `TimeRangeFilter.between(startTime: Instant, endTime: Instant)` is documented only as "[startTime, endTime)"; overlap-vs-start is not specified at the API layer. `LocalDateTime` overloads switch the server to the local-start-time column (fact 32). [official-doc] https://developer.android.com/reference/kotlin/androidx/health/connect/client/time/TimeRangeFilter
36. The APK (Android ≤13) server is closed source; its read semantics are not verifiable from source. [unverified]

Verdict 6: RESOLVED. The two platforms differ by default (HK overlap vs HC start-in-window). Use `HKQueryOptions.strictStartDate` on iOS (as healthkit-read's sketch already does) and `TimeRangeFilter.between(Instant, Instant)` on Android → identical rule "a workout belongs to the window containing its start instant; `to` exclusive". Document that rule; never expose an overlap option. For incremental sync use anchors/change tokens, not windows.

### Item 7 — Android 9–13 (Health Connect APK) scope

37. `HealthConnectClient.getSdkStatus`: `when (Build.VERSION.SDK_INT) { in UPSIDE_DOWN_CAKE..Int.MAX_VALUE -> Api34Impl.getSdkStatus(context); in P..TIRAMISU -> getProviderStatus(packageManager, providerPackageName); else -> return SDK_UNAVAILABLE }`. `getProviderStatus` returns `SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED` when the package is missing or disabled or `versionCode < 68623` (`DEFAULT_PROVIDER_MIN_VERSION_CODE`) or no bindable service, and `SDK_UNAVAILABLE` on an invalid signature. So API 26–27 always get `SDK_UNAVAILABLE` even though the AAR's minSdk is 26. [source-code] cached `src/HealthConnectClient.kt` L903-1013; `src/HealthDataServiceConstants.java` L34-35
38. Official scope statement: "The Health Connect SDK supports Android 8 (API level 26) or higher, while the Health Connect app is only compatible with Android 9 (API level 28) or higher." and "Starting Android 14 (API Level 34), Health Connect is part of the Android Framework." and "Features tied to the system module remain unavailable on Android 13 and lower, even with the APK." The page's `getSdkStatus` sample only handles `SDK_UNAVAILABLE`; it shows no Play-Store redirect for `PROVIDER_UPDATE_REQUIRED`. [official-doc] https://developer.android.com/health-and-fitness/guides/health-connect/develop/get-started
39. Jetpack feature gates for the APK path (`FEATURE_TO_VERSION_INFO_MAP`): `FEATURE_READ_HEALTH_DATA_IN_BACKGROUND` → `apkVersionCode = 171302`; `FEATURE_READ_HEALTH_DATA_HISTORY` → `171302`; `FEATURE_SKIN_TEMPERATURE` → `200027`; `FEATURE_MINDFULNESS_SESSION` → `194767`; `FEATURE_ACTIVITY_INTENSITY` → `220725`; `FEATURE_PLANNED_EXERCISE`, `FEATURE_PERSONAL_HEALTH_RECORD`, `FEATURE_EXTENDED_DEVICE_TYPES`, `FEATURE_EXERCISE_SESSION_IMPROVEMENTS`, `FEATURE_MATCHMAKING` have **no** `apkVersionCode` (module-only). There is no feature constant for exercise routes at all. [source-code] cached `src/HealthConnectFeatures.kt` L141-178
40. Routes on the APK path are therefore not gated: `ExerciseRouteRequestContract` delegates to `ExerciseRouteRequestAppContract` below API 34, which sends `Intent("androidx.health.action.REQUEST_EXERCISE_ROUTE").putExtra("androidx.health.connect.extra.SESSION_ID", id).setPackage("com.google.android.apps.healthdata")` and parses `android.health.connect.extra.EXERCISE_ROUTE`; on API 34+ it sends `HealthConnectManager.ACTION_REQUEST_EXERCISE_ROUTE` handled by the module's `.route.RouteRequestActivity` (`android.health.connect.action.REQUEST_EXERCISE_ROUTE`). The Jetpack route API shipped in `1.1.0-alpha03` (2023-07-26). Which Play APK `versionCode` first honours `hasRoute`/the route intent is not stated in any reachable source. [source-code] cached `src/ExerciseRouteRequestContract.kt` L40-45, `src/ExerciseRouteRequestAppContract.kt` L40-55, `src/ExerciseRouteRequestModuleContract.kt` L39-48; apk manifests; [official-doc] https://developer.android.com/jetpack/androidx/releases/health-connect#1.1.0-alpha03 ; APK versionCode [unverified]
41. Migration APK → module: "Changelogs won't be migrated as part of the switch from APK to Android 14." "After migration is complete, you will start to receive TOKEN_EXPIRED or TOKEN_INVALID exceptions." "Whilst the migration is progressing, the module APIs will be suspended with a 'Migration in Process' status." "Once migration is complete, the APK can be uninstalled." Recommended app reaction, in order: "Read and dedupe all data since the 'last read' timestamp, or for the last 30 days". [official-doc] https://developer.android.com/health-and-fitness/health-connect/migration/android-13-to-14
42. Jetpack `1.1.0-alpha11` (2025-01-15): "Updated background and history read permissions to support Android 13 and below." — i.e. those two permissions work on the APK path only from that client version and APK ≥ 171302. [official-doc] https://developer.android.com/jetpack/androidx/releases/health-connect#1.1.0-alpha11
43. An `android-32 google_apis_playstore` image is already installed locally, so the APK path can be tested without new downloads (Play APK install needs a Google account on the AVD or the Toolbox-style sideload). [source-code] local SDK listing

Verdict 7: PARTIALLY resolved; the scope itself is a USER decision. What is settled: minSdk floor for *functionality* is 28 regardless of the AAR (fact 37); `SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED` must be a first-class availability state; route APIs are not feature-gated so the library cannot pre-check them on the APK — it must treat `NoData` on a session that visibly has a route in the HC app as "APK too old" only heuristically; background/history need APK ≥ 171302; after a 13→14 OS upgrade the change token dies and the sync layer must re-window.

## 2. API sketch relevant to our library

```ts
// availability — one enum, same on both platforms
type Availability =
  | { status: 'available' }
  | { status: 'unavailable'; reason: 'platformTooOld' | 'notSupported' }   // iOS: !isHealthDataAvailable(); Android: SDK_INT < 28 or SDK_UNAVAILABLE
  | { status: 'updateRequired' };                                            // Android 9–13 only: SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED

// window rule: start instant in [from, to)
listWorkouts({ from, to, cursor? }): Promise<{ items: Workout[]; nextCursor?: string }>
// iOS: HKSampleQueryDescriptor(predicates: [.workout(HKQuery.predicateForSamples(withStart: from, end: to, options: [.strictStartDate]))], sortDescriptors: [SortDescriptor(\.startDate)], limit:)
// Android: readRecords(ReadRecordsRequest(ExerciseSessionRecord::class, TimeRangeFilter.between(Instant.ofEpochMilli(from), Instant.ofEpochMilli(to)), pageSize = 1000, pageToken = cursor))

interface Workout { id: string; /*…*/ routeState: 'available' | 'consentRequired' | 'none' }

getRoute(workoutId): AsyncIterable<RoutePoint[]>   // chunked; RoutePoint keeps horizontalAccuracy (never pre-filtered on read)
// iOS:  for try await loc in HKWorkoutRouteQueryDescriptor(route).results(for: store) { … }   // iOS 15.4+
// Android: page cache hit → emit; miss → readRecord(ExerciseSessionRecord::class, id).record.exerciseRouteResult

requestRouteAccess(workoutId): Promise<RoutePoint[] | null>  // Android: ExerciseRouteRequestContract(); iOS: delegates to getRoute

// write: client-side hygiene per Apple doc (not enforced by HealthKit as far as docs say)
// drop p.horizontalAccuracy < 0 || > 50; drop p.timestamp < start || p.timestamp >= end (HC requires maxTime < endTime strictly)
```

```kotlin
// Android health-permission automation (where the permission exists)
// adb shell pm grant <pkg> android.permission.health.READ_EXERCISE_ROUTES   // fails "Unknown permission" on module < android14-qpr2
```

## 3. Design implications for a minimal-options unified API

- One time-window rule, documented once: "start instant in [from, to)". iOS must pass `.strictStartDate`; Android must use `Instant` overloads. Never expose overlap or local-time variants.
- `routeState` lives on `Workout`; `getRoute` is lazy and streamed. Android fills `routeState` from the inline `exerciseRouteResult` and caches the page's routes natively; iOS runs a limit-1 existence query per workout. No `include` flag.
- `RoutePoint.horizontalAccuracy` is always present on read; the library never filters on read (fact 3 is not a guarantee). On write it applies Apple's published hygiene (≤ 50 m, non-negative, inside the window, HC's strict `< endTime`).
- Availability is a three-state enum; `updateRequired` exists only because of Android 9–13. If the user decides "API 34+ only", collapse to two states and set `minSdkVersion` guidance accordingly, but keep the enum shape so adding the tier later is non-breaking.
- Rate limiting is hidden; the sync layer paces to 1000 reads / 15 min and 5000 / 24 h and maps `HealthConnectException(ERROR_RATE_LIMIT_EXCEEDED)` / Jetpack `IllegalStateException` to one typed `rateLimited` error with `retryAfterMs` (approximate: next 15-min boundary).
- Change tokens are opaque and may die (`TOKEN_EXPIRED`/`TOKEN_INVALID` after 13→14 migration, and on any invalidation); `changesSince(token)` must return `{ reset: true }` so the caller re-windows by start instant — the same rule as `listWorkouts`.
- Android gradle: the module's `build.gradle` inherits compileSdk 36 from `rootProject.ext`; the config plugin only needs to handle minSdk (24 → 26) — do not add compileSdk overrides.

## 4. Pitfalls / gotchas

- Writing a route whose points are outside `[start, end]` is accepted by HealthKit (no documented rejection) but Fitness shows no map (DTS); HC rejects at insert (`maxTime < endTime` validation). Clamp on both.
- `HKQueryOptionNone` (overlap) silently double-counts midnight workouts across day windows; HC `readRecords` never does, but HC `aggregate` does (overlap) — never mix aggregate buckets with record windows to compute totals.
- `pm grant … READ_EXERCISE_ROUTES` / `READ_HEALTH_DATA_HISTORY` fails on Android 14 modules older than QPR2/QPR3 — an E2E job on a plain API 34 image may fail for that reason, not because the library is wrong.
- `device_config health_fitness` values on the emulator are not proof of the enforced quota (no AOSP reader in 15/16); only a probe that hits `ERROR_RATE_LIMIT_EXCEEDED` is.
- Android `getRoute` via `readRecord` throws for other apps' sessions older than 30 days without `READ_HEALTH_DATA_HISTORY`, and returns `ConsentRequired` in the background even with the route permission — both must map to typed states, not rejections.
- API 26–27 devices: the AAR links (minSdk 26) but `getSdkStatus` is hard-wired to `SDK_UNAVAILABLE`; do not advertise Android 8 support.
- `HKWorkoutRouteQueryDescriptor` needs iOS 15.4; below that fall back to `HKWorkoutRouteQuery` — or set the deployment floor to 15.4 (Expo 57's default is far above).
- A headless emulator with a PIN may boot `RUNNING_LOCKED`; every non-direct-boot-aware activity (HC UI included) then "does not exist" (-92). Unlock before driving HC UI.

## 5. Open questions

Needs a USER decision
- Android ≤13 support tier: (A) API 34+ only; (B) API 28–33 "best effort" via Play APK with `updateRequired` state and no route-version detection; (C) full support incl. APK test lane on the local android-32 playstore image. (Item 7)
- Accept `routeState` eager + per-workout existence query on iOS (N cheap local queries) vs `routeState: 'unknown'` on iOS. (Item 5)
- Rate-limit planning floor: adopt 1000 / 15 min, 5000 / 24 h (conservative) vs AOSP 2000 / 16000. (Item 4)

Needs a hands-on device test (concrete steps)
- Item 1 filtering: in a dev-client build, `HKWorkoutBuilder` → `seriesBuilder(for: .workoutRoute())` → `insertRouteData` with 100 good points + 1 point `horizontalAccuracy = 80`, 1 point `= -1`, 1 point at `start − 60 s`, 1 at `end + 60 s` → finish; then count `for try await _ in HKWorkoutRouteQueryDescriptor(route).results(for: store)` and compare with 104; open simulator Fitness → Workouts and Health → Browse → Activity → Workouts → route. Repeat with `HKMetadataKeyIndoorWorkout: true` and with `.yoga`.
- Item 2 applesimutils: `brew install applesimutils` (user go-ahead), boot iOS 26.5 iPhone 17, `applesimutils --byId <udid> --bundle <id> --setPermissions health=YES`, then `sqlite3 ~/Library/Developer/CoreSimulator/Devices/<udid>/data/Library/Health/healthdb.sqlite 'select count(*) from authorization'` and launch the app: `requestAuthorization` must return without a sheet.
- Item 2 HK sheet labels: `maestro hierarchy` while the sheet is up; confirm `Health Access`, `Turn On All`, `Allow` on iOS 26.5.
- Item 2 pm grant 34/35: `sdkmanager "system-images;android-34;google_apis;arm64-v8a" "system-images;android-35;google_apis;arm64-v8a"` (user go-ahead), boot, `adb shell pm list permissions -g | grep health.READ_EXERCISE_ROUTES`, then `pm grant` + `dumpsys package <pkg> | grep -A1 READ_EXERCISE_ROUTES`.
- Item 2 HC UI: boot Pixel_9a **windowed**, `adb shell am get-started-user-state 0` (expect `RUNNING_UNLOCKED`; if `RUNNING_LOCKED`: `adb shell input text 1234 && adb shell input keyevent 66`), then `am start -a android.health.connect.action.HEALTH_HOME_SETTINGS` and `createRequestPermissionResultContract()` from the dev client.
- Item 4 real quota: `adb shell device_config list health_fitness` for the record, then a foreground loop of `readRecords` (pageSize 1) until `HealthConnectException` with `errorCode == 7`; note the count (expect 1000 or 2000) and repeat in background (WorkManager) for the BG bucket.
- Item 6 empirical: insert a session 23:50–00:10 on Pixel_9a and on the iOS 26.5 simulator; query `[day1 00:00, day2 00:00)` and `[day2, day3)` with the library; expect exactly one hit (day 1) on both.
- Item 7 APK path: on the android-32 playstore AVD install the current Play Health Connect APK, record its `versionCode` (`dumpsys package com.google.android.apps.healthdata | grep versionCode`), write a session with a route from the dev client, read it back, and check `ExerciseRouteResult.Data` vs `NoData`.

Needs more research
- Play APK `versionCode` that introduced route read/write and the `REQUEST_EXERCISE_ROUTE` activity (fact 40) — no public source found.
- Whether Google's production HealthFitness module (not AOSP) reads `RateLimiter__*` DeviceConfig keys (fact 26).
- Any Apple documentation (or WWDC transcript) asserting HealthKit discards low-accuracy route points — none found in docs or headers.

## 6. Sources

Apple
- https://developer.apple.com/documentation/healthkit/creating-a-workout-route
- https://developer.apple.com/documentation/healthkit/reading-route-data
- https://developer.apple.com/documentation/healthkit/hkworkoutroutebuilder/insertroutedata(_:completion:)
- https://developer.apple.com/documentation/healthkit/hkworkoutroute
- https://developer.apple.com/documentation/healthkit/hkqueryoptions , …/hkqueryoptions/strictstartdate , …/hkqueryoptions/strictenddate
- https://developer.apple.com/documentation/healthkit/hkquery/predicateforsamples(withstart:end:options:)
- https://developer.apple.com/documentation/healthkit/hkmetadatakeyindoorworkout
- https://developer.apple.com/forums/thread/773069 , https://developer.apple.com/forums/thread/83855
- Local iPhoneOS26.5.sdk: HealthKit.framework/Headers/{HKWorkoutRouteBuilder.h, HKWorkoutRoute.h, HKQuery.h}; Modules/HealthKit.swiftmodule/arm64e-apple-ios.swiftinterface
- Local `xcrun simctl privacy` (Xcode 26.6); iOS 26.5 simruntime `RuntimeRoot/Applications`

Android / AOSP
- https://android.googlesource.com/platform/packages/modules/HealthFitness/+/refs/heads/{main,android14-release,android14-qpr1-release,android14-qpr2-release,android14-qpr3-release}/apk/HealthPermissionsManifest.xml
- https://android.googlesource.com/platform/packages/modules/HealthFitness/+/refs/heads/{main,android14-release}/apk/AndroidManifest.xml
- https://android.googlesource.com/platform/packages/modules/HealthFitness/+/refs/heads/{android14-release,android15-release,android16-release,main}/framework/java/android/health/connect/ratelimiter/RateLimiter.java
- https://android.googlesource.com/platform/packages/modules/HealthFitness/+/refs/heads/{android14-release,android15-release}/service/java/com/android/server/healthconnect/HealthConnectDeviceConfigManager.java (404 on android16-release)
- https://android.googlesource.com/platform/packages/modules/HealthFitness/+/refs/heads/{main,android14-release}/service/java/com/android/server/healthconnect/storage/datatypehelpers/RecordHelper.java ; main …/IntervalRecordHelper.java ; main …/storage/utils/WhereClauses.java
- https://android.googlesource.com/platform/frameworks/base/+/refs/heads/main/core/java/android/app/ActivityManager.java ; …/core/java/android/content/pm/PackageManager.java
- https://developer.android.com/health-and-fitness/guides/health-connect/develop/get-started
- https://developer.android.com/health-and-fitness/guides/health-connect/develop/exercise-routes
- https://developer.android.com/health-and-fitness/guides/health-connect/plan/rate-limiting
- https://developer.android.com/health-and-fitness/health-connect/migration/android-13-to-14
- https://developer.android.com/reference/kotlin/androidx/health/connect/client/time/TimeRangeFilter
- https://developer.android.com/jetpack/androidx/releases/health-connect
- Cached Jetpack sources (androidx-main): `src/HealthConnectClient.kt`, `src/HealthConnectFeatures.kt`, `src/HealthPermission.kt`, `src/HealthDataServiceConstants.java`, `src/ExerciseRouteRequest{,App,Module}Contract.kt`, `hc-src/RecordConverters.kt`, `hc-src/ProtoToRecordConverters.kt`
- https://dl.google.com/android/maven2/androidx/health/connect/connect-client/1.1.0/connect-client-1.1.0.aar (aar-metadata.properties, AndroidManifest.xml)

Expo / React Native / tooling
- https://raw.githubusercontent.com/facebook/react-native/v0.86.2/packages/react-native/gradle/libs.versions.toml ; …/0.86-stable/…
- https://raw.githubusercontent.com/expo/expo/sdk-57/packages/expo-modules-autolinking/android/expo-gradle-plugin/expo-autolinking-plugin/src/main/kotlin/expo/modules/plugin/ExpoRootProjectPlugin.kt
- https://registry.npmjs.org/react-native , https://registry.npmjs.org/expo-modules-autolinking
- https://api.github.com/repos/wix/AppleSimulatorUtils (+ /releases, /issues) ; https://api.github.com/repos/mobile-dev-inc/maestro/issues/2942
- Local: `~/Library/Android/sdk/system-images`, `emulator -list-avds`, monorepo `node_modules/.pnpm/react-native@0.85.3*/…/gradle/libs.versions.toml`
