# Android Health Connect — reading exercise sessions + exercise routes (state as of 2026-08-22)

Scope: `androidx.health.connect:connect-client` (Jetpack) on top of the Health Connect platform module (Android 14+) / Health Connect APK (Android 9–13). Everything version-specific below was checked against live sources today; where the live page contradicted my prior knowledge, the live page wins and I say so.

Confidence tags: [official-doc] developer.android.com / support.google.com page · [source-code] androidx GitHub mirror, AOSP gitiles, maven.google.com artifacts, npm/GitHub registry JSON · [secondary] blog/third-party · [unverified] could not confirm live.

---

## 1. Facts

### Artifact versions / minSdk

1. Latest **stable** `androidx.health.connect:connect-client` is **1.1.0, released October 08, 2025** ("promoted to its first stable release with no changes since its previous RC release"). [official-doc] https://developer.android.com/jetpack/androidx/releases/health-connect
2. Latest **pre-release** is **1.2.0-alpha05, released August 12, 2026** (maven-metadata `lastUpdated=20260812170546`, `<latest>1.2.0-alpha05</latest>`). Sibling artifacts: `connect-client-external-protobuf`, `connect-client-proto` (same versions, pulled transitively); `connect-testing` latest is `1.0.0-alpha04`. [source-code] https://dl.google.com/android/maven2/androidx/health/connect/connect-client/maven-metadata.xml , https://dl.google.com/android/maven2/androidx/health/connect/group-index.xml
3. 1.2.0 alpha train (all [official-doc], releases page above):
   - alpha01 (2025-07-30): Activity Intensity API for Android 14+; back-compat for Skin Temperature and Mindfulness.
   - alpha02 (2025-10-08): new `Device` type enums.
   - alpha03 (2026-03-25): new fields on `ExerciseSessionRecord`/`ExerciseSegment` (RPE, weight, setIndex → guarded by `FEATURE_EXERCISE_SESSION_IMPROVEMENTS`); **`HealthConnectClient#getChanges(changeLogsToken, pageSize)`** (soft limit, 1..5000); record validation deferred to platform on Android U+; activity intensity enabled for the APK.
   - alpha04 (2026-04-22): Matchmaking APIs (`checkIfMatchmakingIsPossible`, `createMatchmakingIntent`, experimental).
   - alpha05 (2026-08-12): release note says "The minimum SDK requirement for this library is now API 24 (minSdk 24)"; `@IntRange/@FloatRange` on `ExerciseSegment`; "Secured Health Connect intents on Android versions prior to 14"; "Fixed a signature validation issue".
4. **minSdk contradiction (verified by downloading the AARs):** both `connect-client-1.1.0.aar` and `connect-client-1.2.0-alpha05.aar` ship `AndroidManifest.xml` with `<uses-sdk android:minSdkVersion="26" />`. The alpha05 release note's "minSdk 24" is **not** reflected in the published artifact. The get-started guide also says "The Health Connect SDK supports Android 8 (API level 26) or higher, while the Health Connect app is only compatible with Android 9 (API level 28) or higher." [source-code] AAR manifests; [official-doc] https://developer.android.com/health-and-fitness/health-connect/get-started
5. Expo SDK 57's Gradle root plugin defaults to **minSdk 24** (`versionCatalogs.getVersionOrDefault("minSdk", "24")`, compileSdk/targetSdk default "35", overridable via `android.minSdkVersion` property / expo-build-properties). A consumer app at minSdk 24 will hit a manifest-merger error against the AAR's minSdk 26 unless minSdk is raised to 26 or `tools:overrideLibrary` is used. [source-code] https://raw.githubusercontent.com/expo/expo/sdk-57/packages/expo-modules-autolinking/android/expo-gradle-plugin/expo-autolinking-plugin/src/main/kotlin/expo/modules/plugin/ExpoRootProjectPlugin.kt ; RN 0.86 template: minSdk 24 / compileSdk 36 / targetSdk 36 https://raw.githubusercontent.com/react-native-community/template/0.86-stable/template/android/build.gradle

### Platform availability

6. "Starting Android 14 (API Level 34), Health Connect is part of the Android Framework ... there's no setup necessary." "On Android 13 (API Level 33) and lower versions ... you need to install the Health Connect app from the Google Play Store." Provider package `com.google.android.apps.healthdata` (APK launched on Play November 11, 2022). Health Connect requires Android 9 (API 28)+ with Google Play services; **not supported in work profiles**. [official-doc] https://developer.android.com/health-and-fitness/health-connect/get-started , https://developer.android.com/health-and-fitness/health-connect/availability
7. `HealthConnectClient.getSdkStatus(context, providerPackageName = "com.google.android.apps.healthdata")` returns `SDK_UNAVAILABLE = 1`, `SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED = 2`, `SDK_AVAILABLE = 3`. Logic: API < 28 → UNAVAILABLE; API 28–33 → provider must be installed, enabled, signature-valid, `versionCode >= DEFAULT_PROVIDER_MIN_VERSION_CODE (68623)` and expose a bindable service, else PROVIDER_UPDATE_REQUIRED; API 34+ → AVAILABLE unless running in a profile or `HEALTHCONNECT_SERVICE` is null. `getOrCreate` throws `UnsupportedOperationException` (UNAVAILABLE) / `IllegalStateException` (UPDATE_REQUIRED). [source-code] https://github.com/androidx/androidx/blob/androidx-main/health/connect/connect-client/src/main/java/androidx/health/connect/client/HealthConnectClient.kt , .../androidx/health/platform/client/service/HealthDataServiceConstants.java
8. Official Play Store deep link for the UPDATE_REQUIRED case: `"market://details?id=$providerPackageName&url=healthconnect%3A%2F%2Fonboarding"` sent as `Intent(ACTION_VIEW)` with `setPackage("com.android.vending")`, `putExtra("overlay", true)`, `putExtra("callerId", context.packageName)`. [official-doc] https://developer.android.com/health-and-fitness/health-connect/features/exercise-routes (availability snippet)
9. Settings intents: `HealthConnectClient.ACTION_HEALTH_CONNECT_SETTINGS` = `"android.health.connect.action.HEALTH_HOME_SETTINGS"` on API 34+, `"androidx.health.ACTION_HEALTH_CONNECT_SETTINGS"` below; `HealthConnectClient.getHealthConnectManageDataIntent(context)` resolves the manage-data screen with fallback to settings. Platform also exposes `HealthConnectManager.ACTION_MANAGE_HEALTH_PERMISSIONS` (`"android.health.connect.action.MANAGE_HEALTH_PERMISSIONS"`, API 34, takes `Intent.EXTRA_PACKAGE_NAME`). [source-code] HealthConnectClient.kt; [official-doc] https://developer.android.com/reference/android/health/connect/HealthConnectManager

### Permission strings (platform reference, with API levels)

10. `android.permission.health.READ_EXERCISE` / `WRITE_EXERCISE` — "Added in API level 34 Also in U Extensions 7", protection level dangerous. [official-doc] https://developer.android.com/reference/android/health/connect/HealthPermissions
11. `android.permission.health.WRITE_EXERCISE_ROUTE` (singular) — API 34 / U Ext 7. [official-doc] same page
12. **`android.permission.health.READ_EXERCISE_ROUTES` (plural) EXISTS** — "Added in API level 35 Also in U Extensions 12". Verbatim: "Allows an application to read ExerciseRoute. **This permission can only be granted manually by a user in Health Connect settings or in the route request activity which can be launched using ACTION_REQUEST_EXERCISE_ROUTE. Attempts to request the permission by applications will be ignored.** Applications should check if the permission has been granted before reading ExerciseRoute." [official-doc] same page. (This contradicts my prior memory that only the per-session consent dialog existed — the live page wins.)
13. `android.permission.health.READ_HEALTH_DATA_HISTORY` and `android.permission.health.READ_HEALTH_DATA_IN_BACKGROUND` — both "Added in API level 35 Also in U Extensions 13"; Jetpack 1.1.0-alpha11 (2025-01-15) "Updated background and history read permissions to support Android 13 and below" (i.e. the APK path). [official-doc] same page + releases page
14. Jetpack constants (androidx-main, `HealthPermission`): `PERMISSION_PREFIX = "android.permission.health."`, `PERMISSION_WRITE_EXERCISE_ROUTE`, `PERMISSION_READ_EXERCISE_ROUTES`, `PERMISSION_READ_HEALTH_DATA_IN_BACKGROUND`, `PERMISSION_READ_HEALTH_DATA_HISTORY`, `getReadPermission(KClass)` / `getWritePermission(KClass)` (+ reified overloads). KDoc for `PERMISSION_READ_EXERCISE_ROUTES`: "can't be granted via the standard permission request mechanism, and can only be granted by a user in Settings, or via the dialog launched by ExerciseRouteRequestContract. When this permission is granted, the app can read exercise routes without user interaction, however reading apps must be in the foreground unless READ_HEALTH_DATA_IN_BACKGROUND is also granted. When this permission is revoked, exercise routes can only be obtained by launching the ExerciseRouteRequestContract intent." [source-code] https://github.com/androidx/androidx/blob/androidx-main/health/connect/connect-client/src/main/java/androidx/health/connect/client/permission/HealthPermission.kt
15. **`PERMISSION_READ_EXERCISE_ROUTES` is NOT in the 1.1.0 stable AAR; it IS in 1.2.0-alpha05** (verified by inspecting `HealthPermission$Companion.class` in both AARs; added by androidx commit "Add definition for exercise routes read permission", 2025-06-24, after the 1.1.0 RC branch). The string itself is usable on 1.1.0 by spelling it out; the *behaviour* is platform-side anyway. [source-code] AAR inspection; https://api.github.com/repos/androidx/androidx/commits?path=health/connect/connect-client/src/main/java/androidx/health/connect/client/permission/HealthPermission.kt
16. Does READ_EXERCISE_ROUTES *replace* the per-session consent flow? **No — they coexist.** Exercise-routes guide (updated 2026-06-05): "Reading: For the session owner, data is accessed using a session read. From a third-party app, through a dialog that allows the user to grant a one-time read of a route." The guide's manifest snippet now declares `READ_EXERCISE_ROUTES`, but the permission set passed to `createRequestPermissionResultContract` only contains `getReadPermission(ExerciseSessionRecord::class)` / write — consistent with "attempts to request the permission ... will be ignored". [official-doc] https://developer.android.com/health-and-fitness/health-connect/features/exercise-routes
17. Server-side rule (AOSP `ExerciseSessionRecordHelper.getExerciseRouteReadAccessType`): routes are attached to read results for **all** sessions only when `isInForeground && granted.contains(READ_EXERCISE_ROUTES)`; otherwise only the caller's **own** sessions' routes are attached. (A hidden `READ_EXERCISE_ROUTE` singular permission is reserved for the HC UI controller.) Jetpack converter then maps: `route != null → ExerciseRouteResult.Data`, `route == null && hasRoute() → ConsentRequired`, else `NoData`. So `ConsentRequired` means "a route exists but you may not see it in this context". [source-code] https://android.googlesource.com/platform/packages/modules/HealthFitness/+/refs/heads/main/service/java/com/android/server/healthconnect/storage/datatypehelpers/ExerciseSessionRecordHelper.java ; https://github.com/androidx/androidx/blob/androidx-main/health/connect/connect-client/src/main/java/androidx/health/connect/client/impl/platform/records/RecordConverters.kt
18. Background + routes: "Your app can't read exercise route data created by other apps when it runs in the background. When your app runs in the background and tries to read an exercise route created by another app, Health Connect returns an `ExerciseRouteResult.ConsentRequired` response, even if your app has **Always allow** access to exercise route data." "we strongly recommend that you request routes upon deliberate user interaction with your app". [official-doc] exercise-routes guide
19. `ExerciseRouteRequestContract : ActivityResultContract<String, ExerciseRoute?>` — input = `metadata.id` of the session (non-empty), output `null` "if the user didn't grant access to the exercise route or if there's no exercise route for the session id". API 34+: `Intent(HealthConnectManager.ACTION_REQUEST_EXERCISE_ROUTE = "android.health.connect.action.REQUEST_EXERCISE_ROUTE")` + `EXTRA_SESSION_ID` ("android.health.connect.extra.SESSION_ID"), result in `EXTRA_EXERCISE_ROUTE`; API 28–33: `HealthDataServiceConstants.ACTION_REQUEST_ROUTE` targeted at the provider package (throws `SecurityException` if provider signature invalid). [source-code] .../contracts/ExerciseRouteRequestContract.kt, .../permission/ExerciseRouteRequestAppContract.kt, .../permission/platform/ExerciseRouteRequestModuleContract.kt; [official-doc] HealthConnectManager reference
20. Write rules for routes: `WRITE_EXERCISE_ROUTE` "must be granted to successfully insert a route as a field of the corresponding ExerciseSessionRecord. An attempt to insert/update a session with a set route without the permission granted will result in a failed call". "If your app has a route write permission and tries to update a session by passing in a session object without a route, the existing route is deleted." Without the permission, an update leaves the stored route untouched. [source-code] HealthPermission.kt KDoc; [official-doc] exercise-routes guide

### Requesting permissions

21. `PermissionController` (interface, obtained via `client.permissionController`): `suspend fun getGrantedPermissions(): Set<String>`, `suspend fun revokeAllPermissions()`, companion `createRequestPermissionResultContract(providerPackageName = DEFAULT_PROVIDER_PACKAGE_NAME): ActivityResultContract<Set<String>, Set<String>>`. The contract `require`s every input to start with `android.permission.health.` and at least one permission; output = set actually granted. Throws `RemoteException` (IPC), `IOException`, `IllegalStateException` (service unavailable). [source-code] https://github.com/androidx/androidx/blob/androidx-main/health/connect/connect-client/src/main/java/androidx/health/connect/client/PermissionController.kt , .../contracts/HealthPermissionsRequestContract.kt
22. UX policy: "If the user selects Cancel on the permissions request screen twice in a row, your app should present the user with a screen similar to [insufficient access]. Note: Once this screen is displayed, users need to re-enable permissions from within the Health Connect Settings menu." After `revokeAllPermissions()` "changes aren't immediately reflected without an app restart". "Because users can grant or revoke permissions at any time, your app needs to check for permissions every time before using them." [official-doc] https://developer.android.com/health-and-fitness/health-connect/ui/permissions , get-started
23. Data attribution requirement: "clearly show how your app obtains data, which comes from the `packageName` property of the `DataOrigin` class" — at minimum app icon + name via `PackageManager.getApplicationInfo/Label/Icon` (no `QUERY_ALL_PACKAGES` needed), ideally with a link to Health Connect "App permissions". [official-doc] https://developer.android.com/health-and-fitness/health-connect/ui/data

### AndroidManifest entries

24. Required/expected manifest entries (all [official-doc] https://developer.android.com/health-and-fitness/health-connect/get-started , https://developer.android.com/health-and-fitness/health-connect/migration/android-13-to-14):
    ```xml
    <uses-permission android:name="android.permission.health.READ_EXERCISE"/>
    <uses-permission android:name="android.permission.health.WRITE_EXERCISE"/>
    <uses-permission android:name="android.permission.health.READ_EXERCISE_ROUTES"/>
    <uses-permission android:name="android.permission.health.WRITE_EXERCISE_ROUTE"/>
    <!-- per-stat read perms as needed: READ_DISTANCE, READ_TOTAL_CALORIES_BURNED, READ_ACTIVE_CALORIES_BURNED, READ_ELEVATION_GAINED, READ_HEART_RATE, READ_STEPS, READ_SPEED -->
    <!-- optional: READ_HEALTH_DATA_HISTORY, READ_HEALTH_DATA_IN_BACKGROUND -->
    <queries><package android:name="com.google.android.apps.healthdata"/></queries>

    <!-- Rationale / privacy-policy activity. Pre-Android-14 -->
    <activity android:name=".PermissionsRationaleActivity" android:exported="true">
      <intent-filter><action android:name="androidx.health.ACTION_SHOW_PERMISSIONS_RATIONALE"/></intent-filter>
    </activity>
    <!-- Android 14+ -->
    <activity-alias android:name="ViewPermissionUsageActivity" android:exported="true"
        android:targetActivity=".PermissionsRationaleActivity"
        android:permission="android.permission.START_VIEW_PERMISSION_USAGE">
      <intent-filter>
        <action android:name="android.intent.action.VIEW_PERMISSION_USAGE"/>
        <category android:name="android.intent.category.HEALTH_PERMISSIONS"/>
      </intent-filter>
    </activity-alias>
    <!-- Optional onboarding hook: pre-14 action androidx.health.ACTION_SHOW_ONBOARDING guarded by
         com.google.android.apps.healthdata.permission.START_ONBOARDING; 14+ alias with action
         android.health.connect.action.SHOW_ONBOARDING guarded by android.permission.health.START_ONBOARDING -->
    ```
    The pre-14 APK used to require a `<meta-data android:name="health_permissions" android:resource="@array/health_permissions"/>` array; the Android-14 guide drops it in favour of `<uses-permission>` lines (both can be carried for old APK versions).

### ExerciseSessionRecord (androidx-main)

25. Public constructor: `ExerciseSessionRecord(startTime: Instant, startZoneOffset: ZoneOffset?, endTime: Instant, endZoneOffset: ZoneOffset?, metadata: Metadata, exerciseType: Int, title: String? = null, notes: String? = null, segments: List<ExerciseSegment> = emptyList(), laps: List<ExerciseLap> = emptyList(), exerciseRoute: ExerciseRoute? = null, plannedExerciseSessionId: String? = null, rateOfPerceivedExertion: Float? = null)`. Read-side property is `exerciseRouteResult: ExerciseRouteResult` (`Data(exerciseRoute)`, `ConsentRequired()`, `NoData()`; abstract class with internal ctor → must handle an `else` branch in `when`). `rateOfPerceivedExertion` (0..10) requires `FEATURE_EXERCISE_SESSION_IMPROVEMENTS (=9)`; `plannedExerciseSessionId` requires `FEATURE_PLANNED_EXERCISE (=3)` / SDK ext 13. [source-code] https://github.com/androidx/androidx/blob/androidx-main/health/connect/connect-client/src/main/java/androidx/health/connect/client/records/ExerciseSessionRecord.kt , .../ExerciseRouteResult.kt
26. Exercise type constants (Int): `EXERCISE_TYPE_OTHER_WORKOUT = 0` ("Any unknown new value definition will also fall automatically into OTHER_WORKOUT", "Next Id: 84"), `BIKING = 8`, `BIKING_STATIONARY = 9`, `ELLIPTICAL = 25`, `HIKING = 37`, `ROWING = 53`, `RUNNING = 56`, `RUNNING_TREADMILL = 57`, `SKIING = 61`, `SNOWSHOEING = 63`, `STAIR_CLIMBING = 68`, `SWIMMING_OPEN_WATER = 73`, `WALKING = 79`, `WHEELCHAIR = 82`, `YOGA = 83` (full list in source; the library's internal string map uses `"running"`, `"running_treadmill"`, `"hiking"`, `"walking"`, `"biking"`, `"workout"`). [source-code] same file
27. Client-side validation (only applied below Android U / without SDK ext 21; above that the platform validates): `startTime` strictly before `endTime`; segments and laps must not overlap and must lie inside the session; **route points must satisfy `!minTime.isBefore(startTime) && maxTime.isBefore(endTime)`** — i.e. the last GPS fix must be strictly *before* `endTime`; `rateOfPerceivedExertion in 0.0..10.0`. [source-code] same file
28. `EXERCISE_DURATION_TOTAL: AggregateMetric<Duration>` is the only session aggregate. [source-code] same file; [official-doc] exercise-routes guide ("Supported aggregations")

### ExerciseRoute / Location

29. `class ExerciseRoute(val route: List<Location>)` — "Contains a sequence of location points, with timestamps, which do not have to be in order", but init **requires strictly increasing timestamps after sorting** (`require(sorted[i].time.isBefore(sorted[i+1].time))` → duplicate timestamps throw `IllegalArgumentException`). [source-code] https://github.com/androidx/androidx/blob/androidx-main/health/connect/connect-client/src/main/java/androidx/health/connect/client/records/ExerciseRoute.kt
30. `ExerciseRoute.Location(time: Instant, latitude: Double /*[-90,90]*/, longitude: Double /*[-180,180]*/, horizontalAccuracy: Length? = null /*>=0*/, verticalAccuracy: Length? = null /*>=0*/, altitude: Length? = null)`. **There is no speed, bearing/course, heart rate, or cadence field on a route point** — per-point speed must be derived or read from `SpeedRecord` samples by time. [source-code] same file

### Metadata

31. `Metadata` (constructor `internal` since 1.1.0-alpha12): `id: String` ("" until inserted; the Health Connect UUID afterwards), `dataOrigin: DataOrigin(packageName)` (set by the system on insert), `lastModifiedTime: Instant`, `clientRecordId: String?`, `clientRecordVersion: Long = 0`, `device: Device?`, `recordingMethod: Int` (`RECORDING_METHOD_UNKNOWN = 0`, `ACTIVELY_RECORDED = 1`, `AUTOMATICALLY_RECORDED = 2`, `MANUAL_ENTRY = 3`). Factories: `Metadata.activelyRecorded(device)` / `autoRecorded(device)` (Device mandatory), `manualEntry(device = null)`, `unknownRecordingMethod(device = null)`, each with `(clientRecordId, clientRecordVersion = 0, device)` and `…WithId(id, device)` overloads. `Device(type = Device.TYPE_PHONE /*=2*/, manufacturer?, model?)`; `TYPE_WATCH = 1`, `TYPE_FITNESS_BAND = 6`, extended types 9–15 need `FEATURE_EXTENDED_DEVICE_TYPES (=8)`. Docs warn: "Updating to Health Connect 1.1.0-alpha12+ without implementing these metadata changes will break your Health Connect integration." [source-code] .../records/metadata/Metadata.kt, Device.kt, DataOrigin.kt; [official-doc] https://developer.android.com/health-and-fitness/health-connect/metadata
32. Upsert semantics: existing data is overwritten "as long as the clientRecordId values exist in the Health Connect datastore, and the clientRecordVersion is higher than the existing value. Otherwise, the upserted data is written as new data." Store the returned `InsertRecordsResponse.recordIdsList` ids — needed to process `DeletionChange`. [official-doc] https://developer.android.com/health-and-fitness/health-connect/sync-data

### Reading / paging / aggregation

33. `ReadRecordsRequest(recordType: KClass<T>, timeRangeFilter: TimeRangeFilter, dataOriginFilter: Set<DataOrigin> = emptySet(), ascendingOrder: Boolean = true, pageSize: Int = 1000 /*must be > 0*/, pageToken: String? = null)` → `ReadRecordsResponse(records: List<T>, pageToken: String?)`; loop while `pageToken != null`. There is also an `@ExperimentalDeduplicationApi deduplicateStrategy` ctor param (restricted, default disabled). `readRecord(recordType, recordId)` → `ReadRecordResponse(record)`. [source-code] .../request/ReadRecordsRequest.kt, .../response/ReadRecordsResponse.kt; [official-doc] https://developer.android.com/health-and-fitness/health-connect/read-data
34. Per-session stats are **separate records, not linked to the session**: "Data associated with workout sessions is represented by individual record types. Common types include: HeartRateRecord, SpeedRecord, DistanceRecord, TotalCaloriesBurnedRecord, ElevationGainedRecord, StepsCadenceRecord, PowerRecord"; "To read specific granular data ... use the session's startTime and endTime to filter the request for that data type." Aggregate with `AggregateRequest(metrics, timeRangeFilter = TimeRangeFilter.between(session.startTime, session.endTime), dataOriginFilter = setOf(session.metadata.dataOrigin))` and read `response[DistanceRecord.DISTANCE_TOTAL]?.inMeters`, `TotalCaloriesBurnedRecord.ENERGY_TOTAL` (Energy), `ActiveCaloriesBurnedRecord.ACTIVE_CALORIES_TOTAL`, `ElevationGainedRecord.ELEVATION_GAINED_TOTAL` (Length), `HeartRateRecord.BPM_AVG/BPM_MIN/BPM_MAX` (Long), `StepsRecord.COUNT_TOTAL`, `ExerciseSessionRecord.EXERCISE_DURATION_TOTAL`; each metric needs that type's READ permission or the aggregate call throws. [official-doc] https://developer.android.com/health-and-fitness/health-connect/experiences/workouts , https://developer.android.com/health-and-fitness/health-connect/aggregate-data
35. Troubleshooting table in the workouts guide: "Health Connect may reject records that overlap with existing data from the same app" (sessions); "Verify the ExerciseRoute is written with a time range that falls entirely within the ExerciseSessionRecord duration." [official-doc] workouts guide

### Changes API (incremental sync)

36. `getChangesToken(ChangesTokenRequest(recordTypes: Set<KClass<out Record>>, dataOriginFilters: Set<DataOrigin> = setOf())): String`; `getChanges(changesToken): ChangesResponse(changes: List<Change>, nextChangesToken: String, hasMore: Boolean, changesTokenExpired: Boolean)`; `getChanges(token, pageSize: Int /*1..5000*/)` from 1.2.0-alpha03. Changes are `UpsertionChange(record)` or `DeletionChange(recordId)` — "DeletionChange only contains the id of the deleted record, and not the record type, due to privacy." "an unused Changes token expires within 30 days". "We recommend getting separate tokens per data type". Change logs **include your own writes** — filter `change.record.metadata.dataOrigin.packageName != context.packageName`. Changelogs are not migrated from the Android-13 APK to the Android-14 module (apps get TOKEN_EXPIRED/INVALID once after upgrade). [source-code] .../request/ChangesTokenRequest.kt, .../response/ChangesResponse.kt, HealthConnectClient.kt; [official-doc] https://developer.android.com/health-and-fitness/health-connect/sync-data , .../migration/android-13-to-14

### History (30-day) and background reads

37. Default read window: "For Android 14 and higher: No historical limit on an app reading its own data. 30-day limit on an app reading other data. For Android 13 and lower: 30-day limit on app reading any data." The 30 days are counted from **before the first Health Connect permission was granted** to the app; uninstall/reinstall resets it ("Delete on May 10, reinstall May 15 → can only read from April 15 onward"). Without `READ_HEALTH_DATA_HISTORY`: "Any attempt to read a single data point, via readRecord, older than 30 days ... will result in an error. Any other read attempts will not return data points older than 30 days" (silent truncation for readRecords/aggregate/changes). Check `features.getFeatureStatus(FEATURE_READ_HEALTH_DATA_HISTORY /*=4*/) == FEATURE_STATUS_AVAILABLE /*=2*/` before requesting. [official-doc] https://developer.android.com/health-and-fitness/health-connect/read-data ; [source-code] HealthPermission.kt KDoc, HealthConnectFeatures.kt
38. Background reads need `PERMISSION_READ_HEALTH_DATA_IN_BACKGROUND` and `FEATURE_READ_HEALTH_DATA_IN_BACKGROUND (=1)`; docs recommend WorkManager `CoroutineWorker`; "An attempt to read data in background without this permission may result in an error." Routes of other apps are never returned in background (fact 18). [official-doc] read-data page; [source-code] HealthPermission.kt

### Rate limits

39. Docs state only the *shape*: per-period + daily limits for reads/changelogs; per-period + daily + two memory limits for writes; "Background rate limiting is stricter than foreground rate limiting"; advice: use changelogs instead of repeated raw reads, retry from the failure point. **No numbers are published.** [official-doc] https://developer.android.com/health-and-fitness/health-connect/rate-limiting
40. AOSP default flag values (`android.health.connect.ratelimiter.RateLimiter`, can be overridden by DeviceConfig flags, so treat as indicative): reads **2000 / 15 min foreground, 16 000 / 24 h foreground, 1000 / 15 min background, 8000 / 24 h background**; writes 1000 / 15 min and 8000 / 24 h (both FG and BG); chunk (bulk insert) 5 000 000 bytes; single record 1 000 000 bytes; data push 35 MB / 15 min per app, 100 MB / 15 min across apps. Exceeding throws `RateLimiterException extends HealthConnectException(ERROR_RATE_LIMIT_EXCEEDED = 7)`. [source-code] https://android.googlesource.com/platform/packages/modules/HealthFitness/+/refs/heads/main/framework/java/android/health/connect/ratelimiter/RateLimiter.java , RateLimiterException.java, HealthConnectException.java
41. Jetpack exception mapping on API 34+ (`ExceptionConverter.toKtException`): `ERROR_IO → IOException`, `ERROR_REMOTE → RemoteException`, `ERROR_SECURITY → SecurityException`, `ERROR_INVALID_ARGUMENT → IllegalArgumentException`, **everything else (incl. rate limit 7, data-sync-in-progress 8, unsupported 9) → `IllegalStateException`** with the platform exception as cause. [source-code] https://github.com/androidx/androidx/blob/androidx-main/health/connect/connect-client/src/main/java/androidx/health/connect/client/impl/platform/ExceptionConverter.kt

### Google Play policy / approval

42. Policy "Health Connect by Android Permissions" (inside "Permissions and APIs that Access Sensitive Information"): "Access to Health Connect data is restricted to apps with approved health, fitness, medical care, or health research core use cases." "Approved use cases include: fitness and wellness, rewards, fitness coaching, corporate wellness, medical care, health research, and games." Requires "Submit a declaration form in your Play Console and provide a clear and detailed justification explaining how your app will use the data to benefit the user." Prohibits selling/transferring for ads, credit-worthiness, data brokers; "Do not access data obtained through Health Connect using headless apps"; no children-only apps; privacy policy must be the same one linked from Health Connect. [official-doc] https://support.google.com/googleplay/android-developer/answer/9888170 (the "effective January 27, 2027" banner on that page concerns new Location/Contacts permission policies, not Health Connect)
43. Process: Play Console → **Policy > App content > Health apps** declaration (first screen: health features; second: per-data-type-category justification). "After August 31, 2024, all apps will be required to have completed an accurate Health apps declaration." Apps that previously used the old Google form had to re-declare in Play Console by January 22, 2025. Review happens "as part of the app review process"; "If your request is incomplete or denied, you will receive feedback through the Play Console" and you may resubmit. Consequence: "If your health app is published in the Play store and released to the public, but you didn't request for data type accesses, your end users receive the following dialog when attempting to link with Health Connect" (a "can't access Health Connect" dialog). No published review SLA. [official-doc] https://developer.android.com/health-and-fitness/health-connect/publish , https://support.google.com/googleplay/android-developer/answer/14738291 , https://support.google.com/googleplay/android-developer/answer/12991134
44. Whether debug/internal-track builds are gated before approval is **not documented** anywhere I found. [unverified]

### Testing / emulator / tooling

45. Android 14+ (API 34+) system images contain Health Connect as a framework module ("no setup necessary"); on API 28–33 use a Play-Store-enabled image and install Health Connect from Play ("choose a device with an icon in the Play Store column"). Health Connect requires a screen lock (PIN/pattern/password) to open. Whether Google-APIs (non-Play) API 34+ images ship the full HC UI is not stated. [official-doc] get-started; https://developer.android.com/codelabs/health-connect ; [secondary] https://www.kodeco.com/35028713-health-connect-android-api
46. Health Connect Toolbox: ZIP of APKs at https://goo.gle/health-connect-toolbox, `adb install HealthConnectToolbox-{Version Number}.apk`; "supports reading and writing all Health Connect data types"; codelab path "INSERT HEALTH RECORD > Activity > ExerciseSession" (used there to seed a session "from 40 days ago" for history testing). **The docs never say the Toolbox can attach an ExerciseRoute** — route seeding probably needs a small test app or a real app (e.g. Fitbit/Strava/Samsung Health) or our own write path. Page last updated 2026-01-19. [official-doc] https://developer.android.com/health-and-fitness/health-connect/test/health-connect-toolbox , codelab
47. Unit testing: `testImplementation("androidx.health.connect:connect-testing:1.0.0-alpha03")` per docs (maven has alpha04) — `FakeHealthConnectClient` (in-memory records, change tokens, pagination; aggregation is stub-only via `fake.overrides.aggregate = stub(result)`), `FakePermissionController(grantAll = false)`. [official-doc] https://developer.android.com/health-and-fitness/health-connect/test/unit-tests ; [source-code] group-index.xml

### Google Fit shutdown (why HC is the only target)

48. "The Google Fit APIs, including the Google Fit REST API, will be deprecated in 2026. As of May 1, 2024, developers cannot sign up to use these APIs." developer.android.com banner: "Google Fit APIs will be supported until the end of 2026." Migration: Sessions API → Health Connect `ExerciseSessionRecord` (or cloud Google Health API); History API → Google Health API / HC read-write; Recording API → HC write + read (steps). No exact day published. [official-doc] https://developers.google.com/fit , https://developer.android.com/health-and-fitness/health-connect/migration/fit , .../migration/fit/faq

### 2025–2026 changes worth knowing

49. Android 15 (API 35): READ_EXERCISE_ROUTES, READ_HEALTH_DATA_HISTORY, READ_HEALTH_DATA_IN_BACKGROUND permissions; skin temperature; training plans (`PlannedExerciseSessionRecord`, `FEATURE_PLANNED_EXERCISE`). [official-doc] https://developer.android.com/about/versions/15/features , HealthPermissions reference
50. Android 16 (API 36): `ACTIVITY_INTENSITY` data type; medical records (FHIR) APIs; Play FAQ notes BODY_SENSORS → granular `android.permission.health.*` starting Android 16. Medical Records Jetpack APIs (1.1.0-beta02+) are `@ExperimentalPersonalHealthRecordApi`, "Updating your Jetpack dependency to this version requires that apps be compiled against the Android 16 SDK", "changelogs-based APIs have not been developed for Medical Records APIs yet", and Play policy for them "is still being developed". Irrelevant to a fitness-only library except for the compileSdk ≥ 36 requirement. [official-doc] https://developer.android.com/about/versions/16/features , https://developer.android.com/health-and-fitness/health-connect/medical-records , https://support.google.com/googleplay/android-developer/answer/12991134
51. 1.1.0-alpha12 (2025-02-26) breaking change: `Metadata` constructor internal, recording method mandatory, `Device.type` mandatory. 1.1.0-alpha11: legacy permission methods removed; JSpecify nullness (`-Xjspecify-annotations=strict`). [official-doc] releases page
52. RN ecosystem snapshot (for positioning): `react-native-health-connect` 4.1.3 published 2026-08-06, 413 stars, 51 open issues, pins `connect-client:1.1.0`, exposes `requestExerciseRoute(recordId)` via the contract and returns `exerciseRoute` only for `ExerciseRouteResult.Data`; `expo-health-connect` 0.1.1 (2026-08-01) is only a config plugin for it. [source-code] https://api.github.com/repos/matinzd/react-native-health-connect , https://registry.npmjs.org/react-native-health-connect , https://registry.npmjs.org/expo-health-connect

---

## 2. API sketch relevant to our library (Kotlin side of the Expo Module)

```kotlin
// build.gradle (module):  implementation("androidx.health.connect:connect-client:1.1.0")  // or 1.2.0-alpha05
// AAR minSdk = 26 → consumer app must set android.minSdkVersion >= 26 (Expo default 24) or overrideLibrary.

import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.HealthConnectFeatures
import androidx.health.connect.client.PermissionController
import androidx.health.connect.client.contracts.ExerciseRouteRequestContract
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.*
import androidx.health.connect.client.records.metadata.*
import androidx.health.connect.client.request.*
import androidx.health.connect.client.time.TimeRangeFilter

// 1. availability
when (HealthConnectClient.getSdkStatus(ctx)) {           // providerPackageName defaults to com.google.android.apps.healthdata
  HealthConnectClient.SDK_AVAILABLE -> client = HealthConnectClient.getOrCreate(ctx)
  HealthConnectClient.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED -> /* open market://details?id=com.google.android.apps.healthdata&url=healthconnect%3A%2F%2Fonboarding */
  else /* SDK_UNAVAILABLE */ -> /* hide integration (API<28, profile) */
}

// 2. permissions (strings)
val READ_SESSIONS  = HealthPermission.getReadPermission(ExerciseSessionRecord::class)   // android.permission.health.READ_EXERCISE
val WRITE_SESSIONS = HealthPermission.getWritePermission(ExerciseSessionRecord::class)  // android.permission.health.WRITE_EXERCISE
val WRITE_ROUTE    = HealthPermission.PERMISSION_WRITE_EXERCISE_ROUTE                   // android.permission.health.WRITE_EXERCISE_ROUTE
val READ_ROUTES    = "android.permission.health.READ_EXERCISE_ROUTES"                   // HealthPermission.PERMISSION_READ_EXERCISE_ROUTES only in 1.2.0-alpha05+; NOT requestable via contract
val READ_DISTANCE  = HealthPermission.getReadPermission(DistanceRecord::class)           // etc. for TotalCaloriesBurnedRecord, ActiveCaloriesBurnedRecord, ElevationGainedRecord, HeartRateRecord, SpeedRecord, StepsRecord
val HISTORY        = HealthPermission.PERMISSION_READ_HEALTH_DATA_HISTORY
val BACKGROUND     = HealthPermission.PERMISSION_READ_HEALTH_DATA_IN_BACKGROUND

val granted: Set<String> = client.permissionController.getGrantedPermissions()
// request (Activity-bound; Expo: AppContext.currentActivity + registerForActivityResult / OnActivityResult)
val launcher = activity.registerForActivityResult(PermissionController.createRequestPermissionResultContract()) { grantedNow: Set<String> -> … }
launcher.launch(setOf(READ_SESSIONS, READ_DISTANCE, HISTORY))   // all must start with "android.permission.health."

// feature gates before asking for HISTORY / BACKGROUND
client.features.getFeatureStatus(HealthConnectFeatures.FEATURE_READ_HEALTH_DATA_HISTORY) == HealthConnectFeatures.FEATURE_STATUS_AVAILABLE
client.features.getFeatureStatus(HealthConnectFeatures.FEATURE_READ_HEALTH_DATA_IN_BACKGROUND) == HealthConnectFeatures.FEATURE_STATUS_AVAILABLE

// 3. read sessions (paged)
var token: String? = null
do {
  val resp = client.readRecords(ReadRecordsRequest(
      recordType = ExerciseSessionRecord::class,
      timeRangeFilter = TimeRangeFilter.between(start, end),
      dataOriginFilter = emptySet(),            // or setOf(DataOrigin("com.strava"))
      ascendingOrder = false,                   // newest first
      pageSize = 100,
      pageToken = token))
  for (s in resp.records) {
    s.metadata.id; s.metadata.dataOrigin.packageName; s.metadata.clientRecordId; s.metadata.clientRecordVersion
    s.metadata.lastModifiedTime; s.metadata.device?.type; s.metadata.recordingMethod
    s.exerciseType                               // Int: 56 RUNNING, 57 RUNNING_TREADMILL, 37 HIKING, 79 WALKING, 8 BIKING, 0 OTHER_WORKOUT
    s.startTime; s.startZoneOffset; s.endTime; s.endZoneOffset; s.title; s.notes; s.segments; s.laps
    when (val r = s.exerciseRouteResult) {
      is ExerciseRouteResult.Data -> r.exerciseRoute.route.map { it.time; it.latitude; it.longitude; it.altitude?.inMeters; it.horizontalAccuracy?.inMeters; it.verticalAccuracy?.inMeters }
      is ExerciseRouteResult.ConsentRequired -> /* route exists; need foreground + READ_EXERCISE_ROUTES, or per-session dialog */
      is ExerciseRouteResult.NoData -> /* no route */
      else -> {}
    }
  }
  token = resp.pageToken
} while (token != null)

// 4. per-session one-time route consent (foreground Activity only)
val routeLauncher = activity.registerForActivityResult(ExerciseRouteRequestContract()) { route: ExerciseRoute? -> /* null = denied or no route */ }
routeLauncher.launch(session.metadata.id)

// 5. stats for one session (records are NOT linked; aggregate over the session window, scoped to the writer app)
val agg = client.aggregate(AggregateRequest(
    metrics = setOf(DistanceRecord.DISTANCE_TOTAL, TotalCaloriesBurnedRecord.ENERGY_TOTAL, ActiveCaloriesBurnedRecord.ACTIVE_CALORIES_TOTAL,
                    ElevationGainedRecord.ELEVATION_GAINED_TOTAL, HeartRateRecord.BPM_AVG, HeartRateRecord.BPM_MAX, StepsRecord.COUNT_TOTAL),
    timeRangeFilter = TimeRangeFilter.between(s.startTime, s.endTime),
    dataOriginFilter = setOf(s.metadata.dataOrigin)))
agg[DistanceRecord.DISTANCE_TOTAL]?.inMeters; agg[TotalCaloriesBurnedRecord.ENERGY_TOTAL]?.inKilocalories
agg[ElevationGainedRecord.ELEVATION_GAINED_TOTAL]?.inMeters; agg[HeartRateRecord.BPM_AVG]; agg.dataOrigins

// 6. incremental sync
var changesToken = client.getChangesToken(ChangesTokenRequest(setOf(ExerciseSessionRecord::class)))
do {
  val c = client.getChanges(changesToken)        // 1.2.0-alpha03+: getChanges(token, pageSize)
  if (c.changesTokenExpired) { /* full re-read last 30d + dedupe by metadata.id */ }
  c.changes.forEach { when (it) { is UpsertionChange -> it.record; is DeletionChange -> it.recordId } }
  changesToken = c.nextChangesToken
} while (c.hasMore)

// 7. write our own workout + route
val rec = ExerciseSessionRecord(
  startTime = start, startZoneOffset = off, endTime = end, endZoneOffset = off,
  metadata = Metadata.activelyRecorded(clientRecordId = localId, clientRecordVersion = 1, device = Device(type = Device.TYPE_PHONE)),
  exerciseType = ExerciseSessionRecord.EXERCISE_TYPE_RUNNING, title = "Morning run",
  exerciseRoute = if (WRITE_ROUTE in granted) ExerciseRoute(points /* strictly increasing time, all < end */) else null)
val ids = client.insertRecords(listOf(rec)).recordIdsList    // persist ids for later deletions
```

---

## 3. Design implications for a minimal-options unified API

**Expose (Android side of the unified surface)**
- `getAvailability(): 'available' | 'needsInstallOrUpdate' | 'unavailable'` mapped 1:1 from `getSdkStatus`, plus `openHealthConnect()` (settings intent) and `openInstall()` (the documented `market://` deep link). On `'unavailable'` (API < 28, work profile) the JS API should behave like iOS-without-HealthKit: no throws, empty results, capability flag false.
- A **fixed permission vocabulary**, not raw strings: `{ workouts: 'read' | 'write' | 'readwrite', routes: boolean, stats: boolean, history: boolean, background: boolean }`. Internally expand to the exact `android.permission.health.*` set (READ_EXERCISE, WRITE_EXERCISE, WRITE_EXERCISE_ROUTE, READ_DISTANCE, READ_TOTAL_CALORIES_BURNED, READ_ACTIVE_CALORIES_BURNED, READ_ELEVATION_GAINED, READ_HEART_RATE, READ_SPEED, READ_STEPS, READ_HEALTH_DATA_HISTORY, READ_HEALTH_DATA_IN_BACKGROUND). Never put `READ_EXERCISE_ROUTES` into the request set (ignored by the platform); instead report it in `getPermissions()` and provide `openHealthConnect()` for the user to toggle it.
- `requestPermissions()` returns the *granted* subset (the contract already does), and the library must `getGrantedPermissions()` before every call rather than cache.
- `readWorkouts({ from, to, sources?, limit?, cursor? })` → `{ items, nextCursor }` wrapping `pageToken`. Return a normalised `Workout` with `route: { status: 'included' | 'consentRequired' | 'none', points?: RoutePoint[] }`; on iOS the equivalent is a separate `HKWorkoutRoute` query, so the 3-state field is the cross-platform shape that makes HC's `ConsentRequired` representable without an exception.
- `requestWorkoutRoute(workoutId)` → `RoutePoint[] | null` (per-session consent dialog; must be invoked from a foreground Activity; null = denied/no route). Document that once the user picks "always allow"/grants READ_EXERCISE_ROUTES, subsequent `readWorkouts` will include routes directly (foreground only).
- `getWorkoutStats(workoutId | {start,end,source})` → `{ distanceMeters?, activeEnergyKcal?, totalEnergyKcal?, elevationGainMeters?, heartRate?: {avg,min,max}, steps? }` implemented with one `aggregate` call scoped by `dataOriginFilter = session.dataOrigin` (avoids double counting when two apps wrote distance in the same window). Each field is `undefined` when the corresponding permission is missing (catch `SecurityException` per metric group rather than failing the whole call) — HC aggregates require per-type permissions.
- `getChanges(cursor?)` → `{ upserted: Workout[], deletedIds: string[], nextCursor, expired: boolean }` — a thin wrapper over the Changes API, one token per record type, own-app records filtered by `dataOrigin.packageName`.
- `writeWorkout(...)` with `clientRecordId` (= app's local id) and `clientRecordVersion` for idempotent upsert; route only attached when `WRITE_EXERCISE_ROUTE` is granted; return HC id.

**Normalise**
- `exerciseType: Int` → closed string union shared with HealthKit: `'running' | 'treadmillRunning' | 'hiking' | 'walking' | 'cycling' | 'other'` (HC 56/57/37/79/8/0). Keep the raw `nativeType: number` for debugging; unknown future ints already collapse to 0 on HC.
- Times: `Instant` → epoch ms or ISO-8601; keep `startZoneOffset`/`endZoneOffset` as `utcOffsetSeconds?` (nullable on HC).
- Units: `Length.inMeters`, `Energy.inKilocalories`, `Duration` → seconds; HR as integers.
- `RoutePoint = { timestamp, latitude, longitude, altitudeMeters?, horizontalAccuracyMeters?, verticalAccuracyMeters? }` — **no speed/course on Android**; make `speed`/`course` optional in the shared type (HealthKit CLLocation has them) and never synthesise them.
- Identity: `id = metadata.id`, `source = { packageName (Android) / bundleId (iOS), name?, icon? }`; Play policy requires showing source app name/icon, so resolve `PackageManager` label once and return it.
- Ordering: HC `ascendingOrder` default true; expose `order: 'asc' | 'desc'` with a sane default ('desc' for a "recent workouts" list).

**Hide**
- Raw permission strings, `providerPackageName`, `deduplicateStrategy`, `plannedExerciseSessionId`, `rateOfPerceivedExertion`, segments/laps (expose later behind `include: ['laps']` if ever needed), Device/recordingMethod on write (always `activelyRecorded(Device(TYPE_PHONE))` or `TYPE_WATCH` via one `recordedOn` option), medical/mindfulness/matchmaking APIs entirely.
- Page size: fix at ~100–500 internally; HC default 1000 is fine for sessions but routes inflate payloads across the bridge.
- Exception zoo → a small error enum: `unavailable`, `permissionDenied` (SecurityException), `rateLimited` (IllegalStateException whose cause is HealthConnectException code 7 — inspect `cause`), `invalidArgument`, `ioError`, `unknown`.

**Build/config plugin must**
- Add the `<uses-permission>` lines, `<queries>` entry, rationale Activity (`androidx.health.ACTION_SHOW_PERMISSIONS_RATIONALE`) **and** the Android-14 `activity-alias` (VIEW_PERMISSION_USAGE + HEALTH_PERMISSIONS + START_VIEW_PERMISSION_USAGE permission), pointing at a tiny Activity shipped by the module that opens the app's privacy-policy URL (config option `privacyPolicyUrl`).
- Raise `android.minSdkVersion` to 26 (or document `tools:overrideLibrary="androidx.health.connect.client"`); compileSdk ≥ 36 if we ever pick a 1.1.0-beta02+ line with PHR code paths (Expo 57 default 35 builds fine with 1.1.0 per the RN ecosystem, but verify — see §5).

---

## 4. Pitfalls / gotchas

1. **`READ_EXERCISE_ROUTES` cannot be requested programmatically** — putting it in the contract set is silently ignored; only Settings or the route dialog grants it. Our docs must say so or users will file "permission never granted" issues.
2. **Routes of other apps are never returned in background**, even with "Always allow" → background sync jobs get `ConsentRequired`; fetch routes lazily in the foreground.
3. **ConsentRequired vs NoData is only distinguishable because the platform sets `hasRoute`**; on the legacy APK path behaviour may differ per APK version — test on an Android 13 device with the Play APK.
4. **30-day history wall**: first-grant time is the anchor; sessions older than 30 days before the first grant silently vanish from `readRecords` unless `READ_HEALTH_DATA_HISTORY` is granted (and `readRecord` by id *throws*). Reinstall resets the window — tests that "worked yesterday" can fail after a reinstall.
5. **Records are not linked**: distance/calories/HR for a session come from overlapping records, possibly written by a different app than the session (e.g. watch app writes HR, phone app writes session). `dataOriginFilter = session.dataOrigin` avoids double counting but may *drop* HR from a second source — decide and document.
6. **Route validation**: duplicate timestamps throw `IllegalArgumentException` in `ExerciseRoute`; last point must be strictly before `endTime`; lat/lon ranges enforced. Sanitise GPS arrays before writing.
7. **Updating a session without the route while holding WRITE_EXERCISE_ROUTE deletes the stored route.** Always pass the route again on update.
8. **Overlapping sessions from the same app may be rejected**; use `clientRecordId` + `clientRecordVersion` for retries.
9. **Changes token expires after 30 days unused**; `DeletionChange` carries only the id (no type) → one token per record type, and persist HC ids for your own writes.
10. **Rate limits are invisible until hit**; AOSP defaults 2000 reads/15 min FG, 1000 BG. A naive "read all sessions, then per-session aggregate + per-session HR read" does 2–3 calls per workout → 700 workouts can exhaust a 15-minute bucket. Batch: one sessions read, one aggregateGroupByDuration or a few aggregates, lazy HR.
11. **Work profiles**: HC APIs unusable; `getSdkStatus` returns UNAVAILABLE — don't treat as a bug.
12. **Screen lock required** to open Health Connect UI; emulators without a PIN show a confusing prompt.
13. **Play approval gate**: publishing without the Health apps declaration / data-type approval makes the HC permission dialog show "can't access Health Connect" to real users even though debug builds work. Submit the declaration *before* the first production release, with justifications for each data type (exercise, exercise route, distance, calories, HR, elevation, history, background).
14. **Policy**: must show data source attribution (package label/icon) and keep a single privacy-policy URL reachable from the rationale activity and Play listing; no headless use; no ad use of data.
15. **minSdk 26 AAR vs Expo default 24** → manifest merger failure at consumer build time unless handled by the config plugin.
16. **1.1.0-alpha12+ Metadata factories are mandatory**; code copied from older blog posts (`Metadata(clientRecordId=...)`) no longer compiles.
17. **Android 13 → 14 upgrade** invalidates change tokens once; handle `changesTokenExpired` gracefully rather than crashing.
18. `ExerciseRouteResult` is an abstract class with internal ctor → Kotlin `when` needs an `else` branch; `ExerciseRouteResult.Data.hashCode()` is constant 0 (don't use as map key).

---

## 5. Open questions

**Needs a USER decision**
- Pin `connect-client` **1.1.0** (stable; lacks the `PERMISSION_READ_EXERCISE_ROUTES` constant and `getChanges(pageSize)`) or **1.2.0-alpha05** (alpha in a published library; newest intents/signature fixes). Recommendation: 1.1.0 + hard-coded route string, revisit when 1.2.0 goes beta/stable.
- Accept the **minSdk 26** floor for Android consumers (config plugin raises it) vs. `tools:overrideLibrary` hack.
- Include `history` (READ_HEALTH_DATA_HISTORY) and `background` (READ_HEALTH_DATA_IN_BACKGROUND) in v1? Each adds Play-declaration justification burden and a second consent dialog.
- Stats scoping policy: aggregate only the session writer's records (`dataOriginFilter`) vs all apps in the window.
- Write-back scope in v1: session + route only, or also distance/calories/HR series (each is another WRITE permission + policy justification).
- Shape of the route field (`status` tri-state on the workout vs separate `getRoute()` call) — this decides the HealthKit mapping too.

**Needs a hands-on device/emulator test**
- Pixel_9a AVD (API 35/36): confirm HC UI present, the route-request dialog offers an "always allow" option that flips `READ_EXERCISE_ROUTES`, and `readRecords` then returns `Data` for other apps' sessions in the foreground.
- Android 13 device/emulator with the current Play APK: does `ConsentRequired` appear for foreign sessions, does `READ_EXERCISE_ROUTES` exist there at all, minimum APK version for history/background/routes.
- Whether Health Connect Toolbox can insert an ExerciseSession *with* a route (docs silent); otherwise seed via our own write path or Strava/Samsung Health.
- What exception actually surfaces through Jetpack on rate limit / data-sync-in-progress on API 34+ (expect `IllegalStateException` with `HealthConnectException` cause) and on the APK path.
- Expo SDK 57 build with connect-client 1.1.0 at compileSdk 35 (RN ecosystem does it today) vs. any need for compileSdk 36.

**Needs more research**
- Play review turnaround for Health Connect data-type declarations and whether internal/closed testing tracks are gated before approval (undocumented).
- Exact HC APK `versionCode` thresholds that enable READ_EXERCISE_ROUTES / background / history on Android 9–13 (Jetpack only checks `>= 68623` for basic availability).
- Whether Google APIs (non-Play) API 34+ emulator images include the full Health Connect UI/permissions flow.
- Exact Google Fit API turn-down day in 2026 (only "end of 2026" published).

---

## 6. Sources

- https://developer.android.com/jetpack/androidx/releases/health-connect
- https://dl.google.com/android/maven2/androidx/health/connect/connect-client/maven-metadata.xml
- https://dl.google.com/android/maven2/androidx/health/connect/group-index.xml
- https://dl.google.com/android/maven2/androidx/health/connect/connect-client/1.1.0/connect-client-1.1.0.aar (manifest + classes inspected)
- https://dl.google.com/android/maven2/androidx/health/connect/connect-client/1.2.0-alpha05/connect-client-1.2.0-alpha05.aar (manifest + classes inspected)
- https://developer.android.com/health-and-fitness/health-connect/get-started
- https://developer.android.com/health-and-fitness/health-connect/availability
- https://developer.android.com/health-and-fitness/health-connect/features/exercise-routes
- https://developer.android.com/health-and-fitness/health-connect/experiences/workouts
- https://developer.android.com/health-and-fitness/health-connect/read-data
- https://developer.android.com/health-and-fitness/health-connect/aggregate-data
- https://developer.android.com/health-and-fitness/health-connect/sync-data
- https://developer.android.com/health-and-fitness/health-connect/metadata
- https://developer.android.com/health-and-fitness/health-connect/rate-limiting
- https://developer.android.com/health-and-fitness/health-connect/ui/permissions
- https://developer.android.com/health-and-fitness/health-connect/ui/data
- https://developer.android.com/health-and-fitness/health-connect/migration/android-13-to-14
- https://developer.android.com/health-and-fitness/health-connect/migration/fit and .../migration/fit/faq
- https://developer.android.com/health-and-fitness/health-connect/publish
- https://developer.android.com/health-and-fitness/health-connect/test/health-connect-toolbox
- https://developer.android.com/health-and-fitness/health-connect/test/test-cases
- https://developer.android.com/health-and-fitness/health-connect/test/unit-tests
- https://developer.android.com/health-and-fitness/health-connect/medical-records
- https://developer.android.com/codelabs/health-connect
- https://developer.android.com/reference/android/health/connect/HealthPermissions
- https://developer.android.com/reference/android/health/connect/HealthConnectManager
- https://developer.android.com/about/versions/15/features
- https://developer.android.com/about/versions/16/features
- https://developers.google.com/fit
- https://support.google.com/googleplay/android-developer/answer/9888170
- https://support.google.com/googleplay/android-developer/answer/12991134
- https://support.google.com/googleplay/android-developer/answer/14738291
- https://support.google.com/googleplay/android-developer/answer/12261419#health_apps
- androidx sources (androidx-main): HealthConnectClient.kt, PermissionController.kt, HealthConnectFeatures.kt, permission/HealthPermission.kt, contracts/ExerciseRouteRequestContract.kt, contracts/HealthPermissionsRequestContract.kt, permission/ExerciseRouteRequestAppContract.kt, permission/platform/ExerciseRouteRequestModuleContract.kt, records/ExerciseSessionRecord.kt, records/ExerciseRoute.kt, records/ExerciseRouteResult.kt, records/metadata/Metadata.kt, Device.kt, DataOrigin.kt, request/ReadRecordsRequest.kt, request/ChangesTokenRequest.kt, response/ChangesResponse.kt, response/ReadRecordsResponse.kt, impl/platform/ExceptionConverter.kt, impl/platform/records/RecordConverters.kt, androidx/health/platform/client/service/HealthDataServiceConstants.java — https://github.com/androidx/androidx/tree/androidx-main/health/connect/connect-client
- https://api.github.com/repos/androidx/androidx/commits?path=health/connect/connect-client/src/main/java/androidx/health/connect/client/permission/HealthPermission.kt
- AOSP HealthFitness module: framework/java/android/health/connect/ratelimiter/{RateLimiter,RateLimiterException}.java, HealthConnectException.java, service/.../storage/datatypehelpers/ExerciseSessionRecordHelper.java — https://android.googlesource.com/platform/packages/modules/HealthFitness/
- https://raw.githubusercontent.com/expo/expo/sdk-57/packages/expo-modules-autolinking/android/expo-gradle-plugin/expo-autolinking-plugin/src/main/kotlin/expo/modules/plugin/ExpoRootProjectPlugin.kt
- https://raw.githubusercontent.com/react-native-community/template/0.86-stable/template/android/build.gradle
- https://api.github.com/repos/matinzd/react-native-health-connect , https://registry.npmjs.org/react-native-health-connect , https://registry.npmjs.org/expo-health-connect
- [secondary] https://www.kodeco.com/35028713-health-connect-android-api (emulator with Play Store column)
