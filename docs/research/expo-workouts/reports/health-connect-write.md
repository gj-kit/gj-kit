# Android Health Connect — writing exercise sessions with routes and associated metrics

Researched 2026-08-22 against live sources. Library under study: `androidx.health.connect:connect-client` (Jetpack) on top of the Android 14+ platform module (`android.health.connect`) and the pre-14 APK (`com.google.android.apps.healthdata`). Jetpack source = `androidx-main` branch; platform source = `packages/modules/HealthFitness` `main` branch on android.googlesource.com. Confidence tags: [official-doc] [source-code] [secondary] [unverified].

## 1. Facts

### Versions / availability

1. Latest `connect-client` on Google Maven is **1.2.0-alpha05** (published 2026-08-12); latest stable is **1.1.0** (2025-10-08, "no changes since rc03"). Intermediate: 1.2.0-alpha01 (2025-07-30), alpha02 (2025-10-08), alpha03 (2026-03-25), alpha04 (2026-04-22). [source-code: maven-metadata.xml] https://dl.google.com/android/maven2/androidx/health/connect/connect-client/maven-metadata.xml ; [official-doc] https://developer.android.com/jetpack/androidx/releases/health-connect
2. 1.2.0-alpha05 lowered **minSdk to API 24**; 1.2.0-alpha03 "defers record validation to platform on Android U+" and added new ExerciseSessionRecord/ExerciseSegment fields (`rateOfPerceivedExertion`, 0..10). 1.1.0-alpha12 (2025-02-26) made the `Metadata` constructor **internal**, introduced factory methods, and made `recordingMethod` and `Device.type` mandatory. [official-doc] https://developer.android.com/jetpack/androidx/releases/health-connect
3. Get-started page (still says "compatible with 1.2.0-alpha05" dependency line `implementation "androidx.health.connect:connect-client:1.2.0-alpha05"`): Health Connect SDK needs Android 8 (API 26)+, the Health Connect *app* needs Android 9 (API 28)+; Android 14+ ships Health Connect as a platform module, Android 9–13 use the APK `com.google.android.apps.healthdata` (declare it in `<queries>`). `HealthConnectClient.getSdkStatus(context)` returns `SDK_UNAVAILABLE = 1`, `SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED = 2`, `SDK_AVAILABLE = 3`; `getOrCreate` throws when not available. [official-doc] https://developer.android.com/health-and-fitness/health-connect/get-started ; [source-code] HealthConnectClient.kt L868–939
4. On Android 14+ **with SDK extension ≥ 21** the Jetpack record constructors skip their own `require(...)` checks and instead call `toPlatformRecord()` so the platform `Builder.build()` validates (`isAtLeastSdkExtension21()` = `SdkExtensions.getExtensionVersion(UPSIDE_DOWN_CAKE) >= 21`). On older devices Jetpack validates itself. Error messages therefore differ by OS build. [source-code] ExerciseSessionRecord.kt L125–130, records/Utils.kt L52–55

### Permissions (exact strings)

5. Prefix is `android.permission.health.`. Relevant constants (HealthPermission.kt): `WRITE_EXERCISE`, `READ_EXERCISE`, `PERMISSION_WRITE_EXERCISE_ROUTE = "android.permission.health.WRITE_EXERCISE_ROUTE"` (singular), `PERMISSION_READ_EXERCISE_ROUTES = "android.permission.health.READ_EXERCISE_ROUTES"` (plural), `WRITE_DISTANCE`, `WRITE_TOTAL_CALORIES_BURNED`, `WRITE_ACTIVE_CALORIES_BURNED`, `WRITE_ELEVATION_GAINED`, `WRITE_HEART_RATE`, `WRITE_STEPS`, `WRITE_SPEED`, `PERMISSION_READ_HEALTH_DATA_IN_BACKGROUND`, `PERMISSION_READ_HEALTH_DATA_HISTORY`. `HealthPermission.getWritePermission(ExerciseSessionRecord::class)` yields `WRITE_EXERCISE`; the route permission is **not** derivable from a record class — it is the separate constant. [source-code] https://raw.githubusercontent.com/androidx/androidx/androidx-main/health/connect/connect-client/src/main/java/androidx/health/connect/client/permission/HealthPermission.kt L94–168, 402–478
6. The data-types page lists `android.permission.health.READ_EXERCISE_ROUTE` (singular) under ExerciseSessionRecord. In platform source the singular `READ_EXERCISE_ROUTE` is the **Health Connect controller (system UI) permission**; third-party apps use `READ_EXERCISE_ROUTES`. Treat the page's singular read string as a doc error. [official-doc] https://developer.android.com/health-and-fitness/health-connect/data-types ; [source-code] ExerciseSessionRecordHelper.java L21–23, L556–571
7. Manifest must also declare a privacy-policy rationale Activity: `androidx.health.ACTION_SHOW_PERMISSIONS_RATIONALE` intent filter (APK, Android ≤13) **and** an `<activity-alias>` with `android.intent.action.VIEW_PERMISSION_USAGE` + category `android.intent.category.HEALTH_PERMISSIONS`, `android:permission="android.permission.START_VIEW_PERMISSION_USAGE"` (Android 14+). Permissions are requested via `PermissionController.createRequestPermissionResultContract()` (ActivityResultContract<Set<String>, Set<String>>); check with `permissionController.getGrantedPermissions()`. [official-doc] https://developer.android.com/health-and-fitness/health-connect/get-started ; [source-code] PermissionController.kt L36–59

### ExerciseSessionRecord + ExerciseRoute construction

8. Public constructor (`@JvmOverloads`): `ExerciseSessionRecord(startTime: Instant, startZoneOffset: ZoneOffset?, endTime: Instant, endZoneOffset: ZoneOffset?, metadata: Metadata, exerciseType: Int, title: String? = null, notes: String? = null, segments: List<ExerciseSegment> = emptyList(), laps: List<ExerciseLap> = emptyList(), exerciseRoute: ExerciseRoute? = null, plannedExerciseSessionId: String? = null, rateOfPerceivedExertion: Float? = null)`. On read, the record exposes `exerciseRouteResult: ExerciseRouteResult` = `Data(exerciseRoute)` | `ConsentRequired()` | `NoData()`. [source-code] ExerciseSessionRecord.kt L37–120, ExerciseRouteResult.kt
9. Exercise type ints: `EXERCISE_TYPE_RUNNING = 56`, `EXERCISE_TYPE_RUNNING_TREADMILL = 57`, `EXERCISE_TYPE_HIKING = 37`, `EXERCISE_TYPE_WALKING = 79`, `EXERCISE_TYPE_BIKING = 8`, `EXERCISE_TYPE_OTHER_WORKOUT = 0` ("any unknown new value definition will also fall automatically into OTHER_WORKOUT"; "Next Id: 84"). [source-code] ExerciseSessionRecord.kt L248–308
10. `ExerciseRoute(route: List<Location>)`: class doc says points "do not have to be in order", but `init` sorts by time and `require`s every consecutive pair to be **strictly increasing** — two locations with the same `Instant` throw `IllegalArgumentException` (test `locationTimeOverlap_throws`). Empty list is allowed (`ExerciseRoute(listOf())` → `ExerciseRouteResult.Data` with empty route). [source-code] ExerciseRoute.kt L30–36, ExerciseRouteTest.kt L87–100, ExerciseSessionRecordTest.kt L193–223
11. `ExerciseRoute.Location(time: Instant, latitude: Double, longitude: Double, horizontalAccuracy: Length? = null, verticalAccuracy: Length? = null, altitude: Length? = null)`. Validation: latitude ∈ [-90, 90], longitude ∈ [-180, 180], accuracies ≥ 0 (else `IllegalArgumentException`). **There is no bearing, speed, or course field** — the workouts guide's "Optional bearing" bullet contradicts the source; source wins. [source-code] ExerciseRoute.kt L45–75 ; platform ExerciseRoute.java L151–190 (same ranges) ; [official-doc, contradicted] https://developer.android.com/health-and-fitness/health-connect/experiences/workouts
12. Time-range constraint — two different checks: Jetpack (pre-14 / ext<21): `require(!minTime.isBefore(startTime) && maxTime.isBefore(endTime))` → every location must satisfy `startTime <= t < endTime` (a point at exactly `endTime` throws "route can not be out of parent time range."). Platform (14+ ext≥21): `ExerciseSessionTypesValidation.validateExerciseRouteTimestamps` throws only if `t.isAfter(end) || t.isBefore(start)` → inclusive `[start, end]`. Safe cross-version rule: `start <= t < end`. Session itself requires `startTime.isBefore(endTime)`. Segments/laps must also lie inside the session and not overlap. The official guide's sample uses `time = sessionEndTime.minusSeconds(1)` for the last point for this reason. [source-code] ExerciseSessionRecord.kt L131–180 ; ExerciseSessionTypesValidation.java L318–336 ; [official-doc] https://developer.android.com/health-and-fitness/health-connect/features/exercise-routes
13. **No maximum number of locations** is enforced in Jetpack `ExerciseRoute`, platform `ExerciseRoute`, or the storage helper (`ExerciseRouteRecordHelper` just creates one child-row upsert per location). The effective caps are the platform rate-limiter **memory** quotas (fact 21) and Binder transaction size. [source-code] ExerciseRouteRecordHelper.java L71 ; [unverified] Binder/`TransactionTooLargeException` threshold for very large routes — needs a device test.
14. Routes are stored as a child table of the session (`PARENT_KEY`), so deleting the session removes its route; laps/segments likewise. Metric records are **not** children (fact 19). [source-code] ExerciseSessionRecordHelper.java L219–232

### Metadata, Device, recording method, zone offsets

15. `Metadata` factories (constructor is internal): `Metadata.activelyRecorded(device)`, `activelyRecorded(device, clientRecordId, clientRecordVersion = 0)`, `activelyRecordedWithId(id, device)` (for `updateRecords`), and the same trio for `autoRecorded…`, `manualEntry…` (device optional), `unknownRecordingMethod…` (device optional). Constants: `RECORDING_METHOD_UNKNOWN = 0`, `RECORDING_METHOD_ACTIVELY_RECORDED = 1` ("exercise session actively recorded by the user using a phone or a watch device. device must be specified"), `RECORDING_METHOD_AUTOMATICALLY_RECORDED = 2`, `RECORDING_METHOD_MANUAL_ENTRY = 3`. `clientRecordVersion` "starts with 0"; "Data with the highest clientRecordVersion takes precedence". `id`, `dataOrigin`, `lastModifiedTime` are sentinel values before insert and populated by Health Connect. [source-code] Metadata.kt
16. `Device(type: Int, manufacturer: String? = null, model: String? = null)`; `TYPE_UNKNOWN = 0`, `TYPE_WATCH = 1`, `TYPE_PHONE = 2`, `TYPE_SCALE = 3`, `TYPE_RING = 4`, `TYPE_HEAD_MOUNTED = 5`, `TYPE_FITNESS_BAND = 6`, `TYPE_CHEST_STRAP = 7`, `TYPE_SMART_DISPLAY = 8`; types 9–15 need `FEATURE_EXTENDED_DEVICE_TYPES` and degrade to UNKNOWN. Docs: manufacturer/model "optional but recommended". [source-code] Device.kt ; [official-doc] https://developer.android.com/health-and-fitness/health-connect/write-data
17. `startZoneOffset`/`endZoneOffset` are nullable. Guidance: "use the device's actual timezone, not UTC by default" — `ZoneId.systemDefault().rules.getOffset(instant)` per record boundary; the update sample shows offsets can be changed on update. [official-doc] https://developer.android.com/health-and-fitness/health-connect/write-data

### Insert / upsert / update / delete semantics

18. `suspend fun insertRecords(records: List<Record>): InsertRecordsResponse` (`recordIdsList` in input order); "Insertion of multiple records is executed in a transaction - if one fails, none is inserted". Throws `RemoteException` (IPC), `SecurityException` (unpermitted), `IOException`. `updateRecords(records)` updates by `metadata.id`; "Update with invalid identifiers will result in IPC failure". `deleteRecords(recordType, recordIdsList, clientRecordIdsList)` deletes by HC id **or** clientRecordId in one transaction; deleting a non-existent id or the same id twice → IPC failure. `deleteRecords(recordType, timeRangeFilter)` is "automatically filtered to Record belonging to the calling application". [source-code] HealthConnectClient.kt L95–180
19. Upsert: docs say "we recommend using insertRecords instead of updateRecords" when you have clientRecordId; "If the version from the inserted data is higher than the version from the existing data, the upsert happens. Otherwise, the process ignores the change"; versions are not auto-incremented. **Platform source disagrees on the equal case**: `RecordHelper` updates when `newClientRecordVersion >= clientRecordVersion` (same version overwrites). Do not rely on either — always bump the version. [official-doc] https://developer.android.com/health-and-fitness/health-connect/write-data ; [source-code] RecordHelper.java L291–298
20. Association between a session and Distance/Calories/Elevation/HeartRate/Steps records is **by time range (and optionally dataOrigin) only**; there is no foreign key. Official pattern: `ReadRecordsRequest(HeartRateRecord::class, TimeRangeFilter.between(session.startTime, session.endTime))`; the sample app aggregates `StepsRecord.COUNT_TOTAL`, `DistanceRecord.DISTANCE_TOTAL`, `TotalCaloriesBurnedRecord.ENERGY_TOTAL`, `HeartRateRecord.BPM_AVG/MAX/MIN` over that range with `dataOriginFilter = setOf(session.metadata.dataOrigin)`, and its delete flow deletes each raw type by time range after deleting the session. [official-doc] https://developer.android.com/health-and-fitness/health-connect/experiences/workouts ; [source-code] android/health-samples (Context7 `/android/health-samples`)
21. Rate limits. Docs only name the categories (periodic + daily call limits for reads/changelogs; periodic + daily + bulk-memory + single-record-memory for insert/update/delete; background stricter). Platform defaults (DeviceConfig-overridable flags): reads 2000 / 15 min fg, 16000 / 24 h fg, 1000 / 15 min bg, 8000 / 24 h bg; **writes 1000 / 15 min and 8000 / 24 h (fg and bg)**; `RECORD_SIZE_LIMIT_IN_BYTES = 1,000,000` (single record), `CHUNK_SIZE_LIMIT_IN_BYTES = 5,000,000` (one request), `DATA_PUSH_LIMIT_PER_APP_15M = 35,000,000`. Exceeding → `HealthConnectException(ERROR_RATE_LIMIT_EXCEEDED, "API call quota exceeded…")`. Docs: retry from the failure point, don't delete-and-rewrite. [official-doc] https://developer.android.com/health-and-fitness/health-connect/rate-limiting ; [source-code] RateLimiter.java L60–71, L305 ; [unverified] how Jetpack's `wrapPlatformException` surfaces this (likely `RemoteException`) — see open questions.
22. Write guidance: "Chunk requests to at most 1000 records per write request"; "the maximum interval between writes should be 15 minutes"; for series data prefer several smaller records; "Only write zero values when they reflect true inactivity while the user was wearing the device"; write only new/changed data on each sync. Read default `pageSize` 1000 (platform `MAXIMUM_PAGE_SIZE = 5000`). [official-doc] https://developer.android.com/health-and-fitness/health-connect/write-data ; [source-code] Constants.java L34–36

### Metric records (value ranges, Jetpack validation)

23. `DistanceRecord(startTime, startZoneOffset, endTime, endZoneOffset, distance: Length, metadata)` — distance 0..1,000,000 m; `TotalCaloriesBurnedRecord(..., energy: Energy, ...)` and `ActiveCaloriesBurnedRecord` — 0..1,000,000 kcal; `ElevationGainedRecord(..., elevation: Length, ...)` — −1,000,000..1,000,000 m; `StepsRecord(..., count: Long, ...)` — **1..1,000,000 (count 0 throws)**; `HeartRateRecord(startTime, startZoneOffset, endTime, endZoneOffset, samples: List<HeartRateRecord.Sample(time, beatsPerMinute)>, metadata)` — bpm 1..300, `startTime` must not be after `endTime` (equal allowed). All interval records require `startTime.isBefore(endTime)`. [source-code] DistanceRecord.kt, TotalCaloriesBurnedRecord.kt, ActiveCaloriesBurnedRecord.kt, ElevationGainedRecord.kt, StepsRecord.kt, HeartRateRecord.kt
24. The workouts guide lists the types to write with a session: HeartRateRecord, SpeedRecord, DistanceRecord, **TotalCaloriesBurnedRecord**, ElevationGainedRecord, StepsCadenceRecord, PowerRecord, StepsRecord — it does not mention ActiveCaloriesBurnedRecord; the official sample app writes TotalCaloriesBurnedRecord. Both types exist with separate permissions (`WRITE_TOTAL_CALORIES_BURNED`, `WRITE_ACTIVE_CALORIES_BURNED`) and aggregates (`ENERGY_TOTAL`, `ACTIVE_CALORIES_TOTAL`). [official-doc] https://developer.android.com/health-and-fitness/health-connect/experiences/workouts ; https://developer.android.com/health-and-fitness/health-connect/data-types
25. The workouts guide's duplicate-prevention sample uses `Metadata(clientRecordId = …)` — this **no longer compiles** (constructor internal since 1.1.0-alpha12). Use `Metadata.activelyRecorded(device, clientRecordId, clientRecordVersion)`. [official-doc, stale] https://developer.android.com/health-and-fitness/health-connect/experiences/workouts ; [source-code] Metadata.kt

### Route read / own-data rules

26. Route write permission doubles as own-route read: platform comment "WRITE_EXERCISE_ROUTE is in fact a read permission as it allows reading own routes". Access type: `READ_EXERCISE_ROUTE` (controller) → all; `READ_EXERCISE_ROUTES` **and in foreground** → all; otherwise → own routes only; no route permission at all → none. When the app has no route access but `hasRoute` is true, the SDK returns `ExerciseRouteResult.ConsentRequired` — this applies to the app's **own** sessions too if `WRITE_EXERCISE_ROUTE` was later revoked. [source-code] ExerciseSessionRecordHelper.java L338–342, L549–571 ; RecordConverters.kt L422–425
27. Update semantics with routes: with `WRITE_EXERCISE_ROUTE` granted, upserting/updating a session whose `exerciseRoute == null` **deletes the stored route**; without it, the route and `hasRoute` are left untouched. [official-doc] https://developer.android.com/health-and-fitness/health-connect/features/exercise-routes ; [source-code] ExerciseSessionRecordHelper.java L226–250
28. Reading other apps' routes: never in background (always `ConsentRequired`, even with "Always allow"); per-session one-time consent via `ExerciseRouteRequestContract : ActivityResultContract<String /*sessionId*/, ExerciseRoute?>`. The HC `RouteRequestActivity` finishes without a result if the caller has not declared `READ_EXERCISE_ROUTES` in its manifest; returns immediately if caller owns the session or holds route read/write permission; otherwise shows a dialog with a map preview. [official-doc] same page ; [source-code] ExerciseRouteRequestContract.kt, RouteRequestActivity.kt L95–178
29. Reading own records: "The Read permission of the required data type must be granted for your app unless you're using your app's package name for your dataOriginFilter" (test-cases page); Android 14+: "No historical limit on an app reading its own data. 30-day limit on an app reading other data"; Android 13-: 30-day limit on any data; `PERMISSION_READ_HEALTH_DATA_HISTORY` lifts it. [official-doc] https://developer.android.com/health-and-fitness/guides/health-connect/test/test-cases ; https://developer.android.com/health-and-fitness/health-connect/read-data

### How the Health Connect app displays a session with a route

30. Data entries list (HC app → Data and access → Activity → Exercise → See all entries): each session card shows header (time), title (formatted duration + type from `ExerciseSessionFormatter`), optional notes, a delete button, and — **only when `record.route != null`** — a rounded `MapView` thumbnail (`R.id.map_round_view`). `MapView.setRoute` sorts locations by time, normalises around the mean lat/lon, fits them into the view with padding, draws a single stroked polyline in the primary text colour on `colorSurfaceVariant`, and draws 4 px dots at the first and last point. **No map tiles, no markers, no distance labels** — it is a bare line sketch. The same `MapView` is used in the route-consent dialog. Tapping a card opens details (segments/laps via `SessionDetailViewBinder`). [source-code] ExerciseSessionItemViewBinder.kt L63–80, MapView.kt L79–140, ExerciseSessionFormatter.kt L115–135
31. Associated metrics are **not** shown on the session card; they appear under their own data types (Distance, Calories burned, Heart rate, Steps), attributed to the writing app. (Inference from the HC controller structure: per-permission-type entry lists, `LoadEntryDetailsUseCase` reads per data type.) [source-code, inference] LoadEntryDetailsUseCase.kt L42–43

### Play policy

32. "In the Play Console, declare access to the Health Connect data types that your app reads from **and writes to**." Declaration is required for new apps and for updates that change the data-type set; a published app that did not request the data types shows users a dialog that it "can't access Health Connect". The Play Health policy does not distinguish write-only from read access — same approved-use-case list, justification per data type, privacy policy and "request only the minimum data types". [official-doc] https://developer.android.com/health-and-fitness/health-connect/get-started ; https://developer.android.com/health-and-fitness/guides/health-connect/publish/declare-access ; https://support.google.com/googleplay/android-developer/answer/9888170 ; https://support.google.com/googleplay/android-developer/answer/12991134
33. Docs do not state whether unpublished/debug/sideloaded builds are gated by the declaration; the wording scopes the "can't access" dialog to apps "published in the Play store and released to the public". [official-doc] declare-access page ; [unverified] behaviour for internal-testing tracks.
34. Google provides a "Health Connect Toolbox" app for logging/inspecting test data. [official-doc] https://developer.android.com/health-and-fitness/guides/health-connect/test/test-cases

## 2. API sketch relevant to our library

Minimal Kotlin (Expo Module would wrap this in a `Module` with `AsyncFunction`s; coroutine-based):

```kotlin
// Gradle: implementation("androidx.health.connect:connect-client:1.2.0-alpha05") // or 1.1.0 stable

// AndroidManifest.xml (only what we actually write)
// <uses-permission android:name="android.permission.health.WRITE_EXERCISE"/>
// <uses-permission android:name="android.permission.health.WRITE_EXERCISE_ROUTE"/>
// <uses-permission android:name="android.permission.health.WRITE_DISTANCE"/>
// <uses-permission android:name="android.permission.health.WRITE_TOTAL_CALORIES_BURNED"/>   // or WRITE_ACTIVE_CALORIES_BURNED
// <uses-permission android:name="android.permission.health.WRITE_ELEVATION_GAINED"/>
// <uses-permission android:name="android.permission.health.WRITE_HEART_RATE"/>
// <uses-permission android:name="android.permission.health.WRITE_STEPS"/>
// + <queries><package android:name="com.google.android.apps.healthdata"/></queries>
// + rationale Activity (ACTION_SHOW_PERMISSIONS_RATIONALE) and activity-alias (VIEW_PERMISSION_USAGE / HEALTH_PERMISSIONS)

import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.*
import androidx.health.connect.client.records.metadata.Device
import androidx.health.connect.client.records.metadata.Metadata
import androidx.health.connect.client.time.TimeRangeFilter
import androidx.health.connect.client.units.Energy
import androidx.health.connect.client.units.Length
import java.time.Instant
import java.time.ZoneId
import java.time.ZoneOffset

data class RoutePoint(val t: Instant, val lat: Double, val lon: Double,
                      val altM: Double? = null, val hAccM: Double? = null, val vAccM: Double? = null)
data class HrSample(val t: Instant, val bpm: Long)
data class WorkoutInput(
    val clientId: String, val version: Long,          // app's own workout id + monotonically increasing version
    val type: Int,                                    // ExerciseSessionRecord.EXERCISE_TYPE_*
    val start: Instant, val end: Instant,
    val route: List<RoutePoint>, val title: String? = null,
    val distanceM: Double? = null, val energyKcal: Double? = null,
    val elevationGainM: Double? = null, val steps: Long? = null,
    val heartRate: List<HrSample> = emptyList(),
)

class HealthConnectWorkoutWriter(private val client: HealthConnectClient) {
    private val device = Device(type = Device.TYPE_PHONE)
    private fun off(i: Instant): ZoneOffset = ZoneId.systemDefault().rules.getOffset(i)
    private fun meta(w: WorkoutInput, suffix: String) =
        Metadata.activelyRecorded(device, clientRecordId = "${w.clientId}#$suffix", clientRecordVersion = w.version)

    fun requiredPermissions(w: WorkoutInput): Set<String> = buildSet {
        add(HealthPermission.getWritePermission(ExerciseSessionRecord::class))          // WRITE_EXERCISE
        if (w.route.isNotEmpty()) add(HealthPermission.PERMISSION_WRITE_EXERCISE_ROUTE)
        if (w.distanceM != null) add(HealthPermission.getWritePermission(DistanceRecord::class))
        if (w.energyKcal != null) add(HealthPermission.getWritePermission(TotalCaloriesBurnedRecord::class))
        if (w.elevationGainM != null) add(HealthPermission.getWritePermission(ElevationGainedRecord::class))
        if ((w.steps ?: 0) > 0) add(HealthPermission.getWritePermission(StepsRecord::class))
        if (w.heartRate.isNotEmpty()) add(HealthPermission.getWritePermission(HeartRateRecord::class))
    }

    /** Normalise route: valid coords, strictly increasing distinct times, start <= t < end. */
    private fun route(w: WorkoutInput): ExerciseRoute? {
        val lastOk = w.end.minusMillis(1)
        val pts = w.route.asSequence()
            .filter { it.lat in -90.0..90.0 && it.lon in -180.0..180.0 }
            .map { it.copy(t = it.t.coerceIn(w.start, lastOk)) }
            .sortedBy { it.t }.distinctBy { it.t }
            .map { p -> ExerciseRoute.Location(
                time = p.t, latitude = p.lat, longitude = p.lon,
                horizontalAccuracy = p.hAccM?.coerceAtLeast(0.0)?.let(Length::meters),
                verticalAccuracy = p.vAccM?.coerceAtLeast(0.0)?.let(Length::meters),
                altitude = p.altM?.let(Length::meters)) }
            .toList()
        return if (pts.isEmpty()) null else ExerciseRoute(pts)
    }

    suspend fun upsert(w: WorkoutInput): List<String> {
        require(w.start.isBefore(w.end))
        val (so, eo) = off(w.start) to off(w.end)
        val records = buildList<Record> {
            add(ExerciseSessionRecord(w.start, so, w.end, eo, meta(w, "session"), w.type,
                title = w.title, exerciseRoute = route(w)))
            w.distanceM?.takeIf { it >= 0 }?.let { add(DistanceRecord(w.start, so, w.end, eo, Length.meters(it), meta(w, "distance"))) }
            w.energyKcal?.takeIf { it >= 0 }?.let { add(TotalCaloriesBurnedRecord(w.start, so, w.end, eo, Energy.kilocalories(it), meta(w, "energy"))) }
            w.elevationGainM?.let { add(ElevationGainedRecord(w.start, so, w.end, eo, Length.meters(it), meta(w, "elevation"))) }
            w.steps?.takeIf { it >= 1 }?.let { add(StepsRecord(w.start, so, w.end, eo, it, meta(w, "steps"))) }   // count 0 is invalid
            val hr = w.heartRate.filter { it.bpm in 1..300 && !it.t.isBefore(w.start) && !it.t.isAfter(w.end) }
                .sortedBy { it.t }.map { HeartRateRecord.Sample(it.t, it.bpm) }
            if (hr.isNotEmpty()) add(HeartRateRecord(w.start, so, w.end, eo, hr, meta(w, "hr")))
        }
        // single transaction; same clientRecordId => upsert (version must increase)
        return client.insertRecords(records).recordIdsList
    }

    suspend fun delete(clientId: String) {
        // delete by clientRecordId per type (ids we may have written); missing ids => IPC failure, so keep the list precise
        client.deleteRecords(ExerciseSessionRecord::class, emptyList(), listOf("$clientId#session"))
        client.deleteRecords(DistanceRecord::class, emptyList(), listOf("$clientId#distance"))
        // ... one call per type actually written (store the written set alongside clientId)
    }

    /** Read back own session + route (WRITE_EXERCISE_ROUTE suffices for own routes). */
    suspend fun readOwn(recordId: String): ExerciseRoute? =
        (client.readRecord(ExerciseSessionRecord::class, recordId).record.exerciseRouteResult as? ExerciseRouteResult.Data)?.exerciseRoute
}
```

Permission request (Activity side): `registerForActivityResult(PermissionController.createRequestPermissionResultContract()) { granted -> … }.launch(requiredPermissions)`; gate everything on `HealthConnectClient.getSdkStatus(context) == SDK_AVAILABLE`.

## 3. Design implications for a minimal-options unified API

**Expose (JS surface)**
- `writeWorkout({ id, version?, activity: 'running'|'walking'|'hiking'|'cycling'|'other', start, end, route: [{t, lat, lon, alt?, hAcc?, vAcc?}], title?, distanceMeters?, energyKcal?, elevationGainMeters?, steps?, heartRate?: [{t, bpm}] }) → { platformId }`. `id` is the app's stable workout id (→ `clientRecordId` prefix); `version` defaults to a monotonically increasing number the library derives (e.g. `updatedAt` epoch ms) so upserts always win.
- `deleteWorkout(id)` — by `clientRecordId` across every type the library writes (track the written set; deleting an id that doesn't exist is an IPC failure, not a no-op).
- `requiredPermissions(options)` / `requestPermissions()` / `getGrantedPermissions()` that only list the write permissions for fields the app actually supplies (Play "minimum necessary" rule; fewer declared data types in Play Console).
- `availability()` mapping `SDK_AVAILABLE | SDK_UNAVAILABLE | SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED` (the last means "send user to Play to update the HC APK" on Android ≤13).

**Hide (library decides)**
- `Metadata`: always `Metadata.activelyRecorded(Device(TYPE_PHONE))` for GPS-recorded workouts (exactly the documented example for routes); device type is not worth an option unless a watch source exists.
- Zone offsets: derive from `ZoneId.systemDefault()` at start/end (document that the JS side passes instants, optionally an IANA tz for historical imports).
- Record fan-out: one `insertRecords` transaction with session + N metric records, clientRecordIds `"${id}#session"`, `"${id}#distance"`, … . No `updateRecords` path at all (upsert covers it and avoids `metadata.id` bookkeeping).
- Route normalisation: drop invalid lat/lon, clamp accuracies ≥ 0, sort, `distinctBy(time)`, clamp times to `[start, end − 1 ms]` (satisfies both the Jetpack and platform checks), skip the route entirely if empty.
- Metric normalisation: skip `StepsRecord` when steps ≤ 0 (count 0 throws); skip negative distance/energy; drop HR samples outside 1..300 bpm or outside the session window.
- Error mapping: `IllegalArgumentException` (validation) → `INVALID_ARGUMENT`; `SecurityException` → `PERMISSION_DENIED`; `RemoteException`/`IOException` → `UNAVAILABLE`/`IO`, retryable; rate-limit → `RATE_LIMITED` (mapping TBD, see open questions).

**Normalise across platforms**
- Activity enum → `EXERCISE_TYPE_RUNNING/WALKING/HIKING/BIKING/OTHER_WORKOUT` (treadmill is a separate int 57 — decide whether `running` with no route maps to it).
- Energy: HC wants kcal via `Energy.kilocalories`; HealthKit uses kcal too, so the JS unit can be kcal everywhere. Distance/elevation in metres; HR in bpm.
- A "workout" on Android is several independent records linked only by time; document that third-party apps will see them separately and that deleting through the Health Connect UI deletes one record at a time.

## 4. Pitfalls / gotchas

1. Route point at exactly `endTime` throws on Android ≤13 / Android 14 without ext 21 ("route can not be out of parent time range.") but passes on newer platform validation — clamp to `end − 1 ms`. Duplicate timestamps throw everywhere.
2. `StepsRecord(count = 0)` throws; HR bpm outside 1..300 throws; negative energy/distance throws; `start == end` throws. Validate before the native call or the whole transaction fails.
3. Holding `WRITE_EXERCISE_ROUTE` and upserting the same session without a route **deletes the stored route**. Always resend the route on every upsert.
4. Losing `WRITE_EXERCISE_ROUTE` later makes the app's own sessions return `ConsentRequired` for the route (route stays stored, just unreadable).
5. Same `clientRecordVersion`: docs say ignored, platform code overwrites (`>=`). Never write with an equal version — bump it.
6. `deleteRecords` with a non-existent id or clientRecordId is an IPC failure, not idempotent.
7. Play Console Health-apps declaration is required for write-only apps too; an undeclared published app shows the "can't access Health Connect" dialog. Declare only the data types you write.
8. Rate limit: 1000 write calls per 15 min per app (fg/bg), 8000/day; single record ≤ 1 MB, request ≤ 5 MB. A dense route (e.g. 1 Hz for 4 h ≈ 14 400 points) is the one place we could hit the memory cap — downsample before writing; verify on device.
9. The `Metadata(...)` constructor is internal since 1.1.0-alpha12; copy-pasted snippets (including the official workouts guide) won't compile.
10. Permission string trap: write is `WRITE_EXERCISE_ROUTE` (singular), read is `READ_EXERCISE_ROUTES` (plural); the data-types page's `READ_EXERCISE_ROUTE` is the system-UI permission.
11. Manifest extras are mandatory: `<queries>` for `com.google.android.apps.healthdata`, rationale Activity (`androidx.health.ACTION_SHOW_PERMISSIONS_RATIONALE`) and Android 14 `activity-alias` (`VIEW_PERMISSION_USAGE` + `HEALTH_PERMISSIONS`). Missing alias = permission screen can't show the privacy link.
12. Android 14+ defers validation to the platform: error messages and edge-case acceptance differ from Android 13 — test both (Pixel_9a AVD is 14+; need an Android 13 image + HC APK for the other path).
13. Deleting a session does not delete Distance/Calories/HR/Steps written alongside — delete each type explicitly.
14. Reading other apps' routes is impossible in background and needs per-session user consent — don't promise "sync all routes" for Android without a foreground consent UX.
15. Background writes need no special permission but count against the same 1000/15 min quota; readers in background need `READ_HEALTH_DATA_IN_BACKGROUND`.

## 5. Open questions

**Needs a USER decision**
- `TotalCaloriesBurnedRecord` (what Google's workout guide/sample writes) vs `ActiveCaloriesBurnedRecord` (semantic match for HealthKit `activeEnergyBurned`) — or write both? Each is a separate Play-declared data type.
- Which metrics to write at all (distance, energy, elevation, steps, HR) — every extra type is another permission to justify in Play Console.
- Device type fixed to `TYPE_PHONE`, or allow `watch` for imported data?
- Support Android 9–13 (APK path, `SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED` redirect) or Android 14+ only?
- Should the library also request `READ_EXERCISE` so the app can read back its own sessions without relying on the `dataOriginFilter` own-package rule?

**Needs a hands-on device test**
- Exception type Jetpack surfaces for `ERROR_RATE_LIMIT_EXCEEDED` (via `wrapPlatformException`) and for validation failures on Android 14+ (platform `IllegalArgumentException` vs Jetpack message).
- Maximum practical route size before Binder/`TransactionTooLargeException` or the 1 MB record cap (try 5 k / 15 k / 50 k points on Pixel_9a).
- Confirm equal-version upsert overwrites on a real device (platform `>=`).
- Confirm the HC app thumbnail rendering and that metric records show up under their own types with the app's attribution.
- `HeartRateRecord` samples outside the record window — platform acceptance (Jetpack does not check).

**Needs more research (other dimensions / later)**
- Expo config-plugin mechanics for adding the manifest permissions, `<queries>`, and the two rationale activities.
- Whether unpublished / internal-testing builds are gated by the Play declaration (docs only mention published apps).
- `SpeedRecord` / `StepsCadenceRecord` value if the app has pace data.

## 6. Sources

- https://dl.google.com/android/maven2/androidx/health/connect/connect-client/maven-metadata.xml (versions, lastUpdated 20260812)
- https://developer.android.com/jetpack/androidx/releases/health-connect
- https://developer.android.com/health-and-fitness/health-connect/get-started
- https://developer.android.com/health-and-fitness/health-connect/features/exercise-routes
- https://developer.android.com/health-and-fitness/health-connect/write-data
- https://developer.android.com/health-and-fitness/health-connect/read-data
- https://developer.android.com/health-and-fitness/health-connect/experiences/workouts
- https://developer.android.com/health-and-fitness/health-connect/data-types
- https://developer.android.com/health-and-fitness/health-connect/rate-limiting
- https://developer.android.com/health-and-fitness/guides/health-connect/test/test-cases
- https://developer.android.com/health-and-fitness/guides/health-connect/publish/declare-access
- https://developer.android.com/health-and-fitness/guides/health-connect/publish/request-access
- https://support.google.com/googleplay/android-developer/answer/9888170 (Health apps policy)
- https://support.google.com/googleplay/android-developer/answer/12991134 (Android health permissions FAQ)
- Jetpack source (androidx-main): https://github.com/androidx/androidx/tree/androidx-main/health/connect/connect-client/src/main/java/androidx/health/connect/client — `HealthConnectClient.kt`, `PermissionController.kt`, `permission/HealthPermission.kt`, `records/ExerciseSessionRecord.kt`, `records/ExerciseRoute.kt`, `records/ExerciseRouteResult.kt`, `records/Utils.kt`, `records/{Distance,ElevationGained,HeartRate,Steps,TotalCaloriesBurned,ActiveCaloriesBurned}Record.kt`, `records/metadata/{Metadata,Device}.kt`, `contracts/ExerciseRouteRequestContract.kt`, `impl/HealthConnectClientUpsideDownImpl.kt`, `impl/platform/records/RecordConverters.kt`, `impl/converters/records/{RecordToProto,ProtoToRecord}Converters.kt`; tests `ExerciseRouteTest.kt`, `ExerciseSessionRecordTest.kt`
- Platform source (packages/modules/HealthFitness, main): https://android.googlesource.com/platform/packages/modules/HealthFitness/+/refs/heads/main/ — `framework/java/android/health/connect/datatypes/{ExerciseSessionRecord,ExerciseRoute}.java`, `framework/java/android/health/connect/datatypes/validation/ExerciseSessionTypesValidation.java`, `framework/java/android/health/connect/ratelimiter/RateLimiter.java`, `framework/java/android/health/connect/Constants.java`, `service/java/com/android/server/healthconnect/storage/datatypehelpers/{RecordHelper,ExerciseSessionRecordHelper,ExerciseRouteRecordHelper}.java`, `apk/src/com/android/healthconnect/controller/{dataentries/ExerciseSessionItemViewBinder.kt,dataentries/formatters/ExerciseSessionFormatter.kt,shared/map/MapView.kt,route/RouteRequestActivity.kt,entrydetails/LoadEntryDetailsUseCase.kt}`
- Sample app: https://github.com/android/health-samples (via Context7 `/android/health-samples`)
