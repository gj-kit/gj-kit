# Unified workout + route data model across HealthKit and Health Connect, and server-sync considerations

Researched 2026-08-22 against live sources (Apple doc JSON API, developer.android.com reference + AOSP Kotlin source, local iPhoneOS 26.5 SDK headers/compiled Swift, npm registry, vendor support pages). Confidence tags: [official-doc] [source-code] [secondary] [computed] [unverified].

Scope: running / walking / hiking (GPS-route) workouts; read + write; NestJS backend sync.

---

## 1. Facts

### A. Identifiers and source identity

1. HealthKit assigns every `HKObject` a `uuid: UUID` at creation; apps may attach their own id via metadata key `HKMetadataKeyExternalUUID` (string value `"HKExternalUUID"`), documented as "typically the UUID from the corresponding entry on your server". [official-doc] https://developer.apple.com/documentation/healthkit/hkobject/uuid , https://developer.apple.com/documentation/healthkit/hkmetadatakeyexternaluuid ; string values confirmed by compiled Swift against iPhoneOS 26.5 SDK [source-code].
2. HealthKit upsert: saving an object with `HKMetadataKeySyncIdentifier` (string) + `HKMetadataKeySyncVersion` (NSNumber) replaces an existing object with the same sync identifier if the new version is greater; both keys must be present together; replacement also swaps the object inside a workout/correlation. iOS 11+. [official-doc] https://developer.apple.com/documentation/healthkit/hkmetadatakeysyncidentifier
3. HealthKit source identity: `HKObject.sourceRevision: HKSourceRevision` (set only on objects read back from the store) → `.source.bundleIdentifier` (app bundle id, or a UUID for BLE devices), `.source.name`, `.version`, `.productType`, `.operatingSystemVersion`; plus optional `HKObject.device: HKDevice?` (name, manufacturer, model, hardwareVersion, firmwareVersion, softwareVersion, localIdentifier, udiDeviceIdentifier). [official-doc] https://developer.apple.com/documentation/healthkit/hksourcerevision , https://developer.apple.com/documentation/healthkit/hksource/bundleidentifier , https://developer.apple.com/documentation/healthkit/hkdevice
4. Apple Watch (first-party Workout app) workouts carry a source bundle identifier of the form `com.apple.health.<UUID>` (one UUID per paired watch), per a third-party export-format page showing real data. [secondary] https://support.mydatahelps.org/hc/en-us/articles/4412890806419-Apple-HealthKitV2-Workouts-Export-Format
5. Health Connect `Metadata` (on every `Record`): `id: String` assigned at insertion (sentinel before insert), `dataOrigin: DataOrigin(packageName)` auto-populated with the writing app's package, `lastModifiedTime: Instant`, `clientRecordId: String?`, `clientRecordVersion: Long` (starts at 0), `device: Device?` (`type: Int` e.g. TYPE_WATCH=1, TYPE_PHONE=2; `manufacturer?`, `model?`), `recordingMethod: Int` (UNKNOWN=0, ACTIVELY_RECORDED=1, AUTOMATICALLY_RECORDED=2, MANUAL_ENTRY=3). Factory helpers: `Metadata.activelyRecorded(device, clientRecordId, clientRecordVersion)`, `Metadata.activelyRecordedWithId(id, device)` (for updates). [official-doc] https://developer.android.com/reference/kotlin/androidx/health/connect/client/records/metadata/Metadata
6. Health Connect upsert: for a given client (package), there is guaranteed to be a single record per `clientRecordId`; a new insert with the same `clientRecordId` replaces or is ignored depending on `clientRecordVersion` (highest wins). [official-doc] same URL as 5.
7. Health Connect record ids observed in the wild are UUID-formatted strings (e.g. `6bd8109d-349b-319a-890a-c5a20902b530` in react-native-health-connect docs). Format is not contractually documented. [secondary] https://github.com/matinzd/react-native-health-connect/blob/main/docs/docs/api/methods/16-requestExerciseRoute.md

### B. Activity types

8. `HKWorkoutActivityType` raw values (compiled against iPhoneOS 26.5 SDK): `.running = 37`, `.walking = 52`, `.hiking = 24`, `.cycling = 13`, `.crossCountrySkiing = 60`, `.stairs = 68`, `.stairClimbing = 44`, `.elliptical = 16`, `.wheelchairWalkPace = 70`, `.wheelchairRunPace = 71`, `.swimBikeRun = 82`, `.transition = 83`, `.other = 3000`. There is NO trail-running and NO treadmill/indoor-running constant; indoor is expressed by metadata `HKMetadataKeyIndoorWorkout` (`"HKIndoorWorkout"`, Bool). [source-code] local SDK + [official-doc] https://developer.apple.com/documentation/healthkit/hkworkoutactivitytype , https://developer.apple.com/documentation/healthkit/hkmetadatakeyindoorworkout
9. Health Connect `ExerciseSessionRecord.EXERCISE_TYPE_*` ints: `RUNNING = 56`, `RUNNING_TREADMILL = 57`, `WALKING = 79`, `HIKING = 37`, `BIKING = 8`, `BIKING_STATIONARY = 9`, `WHEELCHAIR = 82`, `SKIING = 61` (no cross-country distinction), `STAIR_CLIMBING = 68`, `STAIR_CLIMBING_MACHINE = 69`, `OTHER_WORKOUT = 0` (any unknown future value also maps to 0). No trail-running, no treadmill-walking constant. "Next Id: 84". [official-doc] https://developer.android.com/reference/kotlin/androidx/health/connect/client/records/ExerciseSessionRecord ; [source-code] https://android.googlesource.com/platform/frameworks/support/+/refs/heads/androidx-main/health/connect/connect-client/src/main/java/androidx/health/connect/client/records/ExerciseSessionRecord.kt
10. iOS 16+ `HKWorkout.workoutActivities: [HKWorkoutActivity]` partitions a workout into sub-activities (each with uuid, start/end, duration, statistics, events, workoutConfiguration); every workout has at least one. Health Connect has no multisport container; the nearest analogue is `segments`. [official-doc] https://developer.apple.com/documentation/healthkit/hkworkoutactivity

### C. Time, duration, pauses, laps, segments, events

11. `HKWorkout.duration` is ACTIVE time: when a workout is built with events, HealthKit computes duration as the active time between start and end, where `pause` (raw 1) switches to inactive and `resume` (2) back to active; redundant pause/resume events are ignored. `HKWorkoutEventType` raw values: pause=1, resume=2, lap=3, marker=4, motionPaused=5, motionResumed=6, segment=7, pauseOrResumeRequest=8. [official-doc] https://developer.apple.com/documentation/healthkit/hkworkout/duration , https://developer.apple.com/documentation/healthkit/hkworkoutevent ; raw values [source-code] compiled Swift.
12. `motionPaused`/`motionResumed` are generated by Apple Watch auto-pause during running (user setting Workout > Autopause). Apple's duration text only names pause/resume; whether motion pauses are subtracted from `duration` is not stated. [official-doc] https://developer.apple.com/documentation/healthkit/hkworkouteventtype/motionpaused ; subtraction behaviour [unverified].
13. HK events carry `dateInterval: DateInterval`; only `lap` and `segment` support non-zero duration (header comment). Lap intervals: pre-iOS 11 laps have zero duration marking lap END (laps assumed contiguous); newer laps have non-zero duration and need not fill the workout. Laps cannot overlap; segments may overlap; markers are points in time. [official-doc] https://developer.apple.com/documentation/healthkit/hkworkouteventtype/lap , .../segment , .../marker ; [source-code] HKWorkout.h line 144.
14. Health Connect `ExerciseSessionRecord(startTime, startZoneOffset?, endTime, endZoneOffset?, metadata, exerciseType, title?, notes?, segments, laps, exerciseRoute?, plannedExerciseSessionId?, rateOfPerceivedExertion? 0–10)`; read-side exposes `exerciseRouteResult: ExerciseRouteResult`. Sessions need not be back-to-back. [official-doc] ExerciseSessionRecord URL above (constructor "Added in 1.2.0-alpha05" shape; 1.1.0 shape lacks RPE/planned id).
15. Health Connect has no pause/resume EVENT. A pause is an `ExerciseSegment(startTime, endTime, segmentType = EXERCISE_SEGMENT_TYPE_PAUSE /*39*/)`; `EXERCISE_SEGMENT_TYPE_REST = 44`. Both are "universal" segment types accepted by every session type, together with `OTHER_WORKOUT=38`, `STRETCHING=54`, `UNKNOWN=0`. Sport segments for our domain: `RUNNING=46`, `RUNNING_TREADMILL=47`, `WALKING=64`, `WHEELCHAIR=66`; `EXERCISE_TYPE_WALKING` sessions accept only `WALKING` (+ universal) segments; compatibility is checked by `ExerciseSegment.isSegmentTypeCompatibleWithSessionType`. [source-code] https://android.googlesource.com/platform/frameworks/support/+/refs/heads/androidx-main/health/connect/connect-client/src/main/java/androidx/health/connect/client/records/ExerciseSegment.kt ; [official-doc] https://developer.android.com/reference/kotlin/androidx/health/connect/client/records/ExerciseSegment
16. Client-side validation (Kotlin `init`, applied when NOT on Android 14 + SDK-extension ≥ 21, where validation is deferred to the platform via `toPlatformRecord()`): `startTime < endTime`; segments sorted must not overlap and must lie within [start, end]; laps likewise; route points must satisfy `minTime >= startTime` AND `maxTime < endTime` (strictly before end). [source-code] ExerciseSessionRecord.kt lines 127–187.
17. `ExerciseRoute(route: List<Location>)` requires strictly increasing timestamps after sorting (`isBefore`, so two points with equal `time` are rejected). [source-code] https://android.googlesource.com/platform/frameworks/support/+/refs/heads/androidx-main/health/connect/connect-client/src/main/java/androidx/health/connect/client/records/ExerciseRoute.kt lines 32–35.
18. `ExerciseLap(startTime, endTime, length: Length? /* 0–1,000,000 m */)`. [official-doc] https://developer.android.com/reference/kotlin/androidx/health/connect/client/records/ExerciseLap
19. Health Connect has no stored "active duration" field on the session. The aggregate `ExerciseSessionRecord.EXERCISE_DURATION_TOTAL` is defined on dataTypeName `"ActiveTime"` with a source comment that exercise duration must be computed from events/sessions rather than a plain duration sum. Whether the platform subtracts PAUSE segments is not documented. [source-code] ExerciseSessionRecord.kt lines 226–239; subtraction [unverified].

### D. Distance, energy, elevation, heart rate, steps

20. `HKWorkout.totalEnergyBurned` is deprecated since iOS 18 / watchOS 11 and `totalDistance` is marked deprecated in iOS 27 (header: `API_TO_BE_DEPRECATED`); replacement is `statistics(for: HKQuantityType) -> HKStatistics?` / `allStatistics` (iOS 16+), computed from the quantity samples associated with the workout; returns nil if none. [official-doc] https://developer.apple.com/documentation/healthkit/hkworkout/totalenergyburned , https://developer.apple.com/documentation/healthkit/hkworkout/totaldistance , https://developer.apple.com/documentation/healthkit/hkworkout/statistics(for:) ; [source-code] HKWorkout.h lines 219, 226.
21. HK energy semantics: `totalEnergyBurned` = total ACTIVE energy; `.activeEnergyBurned` samples exclude resting energy; resting energy is `.basalEnergyBurned`; `HKHealthStore.splitTotalEnergy(_:start:end:)` splits a total into active/resting. [official-doc] https://developer.apple.com/documentation/healthkit/hkquantitytypeidentifier/activeenergyburned
22. Health Connect energy: `ActiveCaloriesBurnedRecord(energy: Energy)` (aggregate `ACTIVE_CALORIES_TOTAL`) and `TotalCaloriesBurnedRecord(energy)` (aggregate `ENERGY_TOTAL`, total = active + basal); `Energy` exposes `inCalories/inKilocalories/inJoules/inKilojoules`. [official-doc] https://developer.android.com/reference/kotlin/androidx/health/connect/client/records/ActiveCaloriesBurnedRecord , .../TotalCaloriesBurnedRecord , .../units/Energy
23. HK distance for our sports: `.distanceWalkingRunning` cumulative samples (auto-recorded on iPhone/Watch; may be condensed); HC: `DistanceRecord(distance: Length)` with aggregate `DISTANCE_TOTAL`; `Length` exposes `inMeters/inKilometers/inMiles/inFeet/inInches`. [official-doc] https://developer.apple.com/documentation/healthkit/hkquantitytypeidentifier/distancewalkingrunning , https://developer.android.com/reference/kotlin/androidx/health/connect/client/records/DistanceRecord
24. HK elevation: metadata `HKMetadataKeyElevationAscended` (`"HKElevationAscended"`) and `HKMetadataKeyElevationDescended` (`"HKElevationDescended"`), iOS 11.2+, value is an `HKQuantity` with a length unit, settable on a workout, a segment event, or a distance sample. Health Connect: `ElevationGainedRecord(elevation: Length)` (aggregate `ELEVATION_GAINED_TOTAL`); there is NO elevation-lost record type. [official-doc] https://developer.apple.com/documentation/healthkit/hkmetadatakeyelevationascended , https://developer.android.com/reference/kotlin/androidx/health/connect/client/records/ElevationGainedRecord , data-type list https://developer.android.com/health-and-fitness/guides/health-connect/data-and-data-types/data-types
25. HK speed metadata: `HKMetadataKeyAverageSpeed` (`"HKAverageSpeed"`, average while moving, may differ from distance/duration) and `HKMetadataKeyMaximumSpeed` (`"HKMaximumSpeed"`), HKQuantity length/time; iOS 16+ `.runningSpeed`, `.runningPower` discrete samples auto-recorded on Watch during outdoor runs. HC: `SpeedRecord(samples: List<Sample(time, speed: Velocity)>)` with `SPEED_AVG/MAX/MIN`; `Velocity` exposes `inMetersPerSecond/inKilometersPerHour/inMilesPerHour`. [official-doc] https://developer.apple.com/documentation/healthkit/hkmetadatakeyaveragespeed , https://developer.android.com/reference/kotlin/androidx/health/connect/client/records/SpeedRecord
26. Heart rate — HK: `.heartRate` discrete samples in count/time; avg/min/max via `workout.statistics(for: heartRateType)` → `averageQuantity()/minimumQuantity()/maximumQuantity()`; HealthKit condenses/coalesces first-party workout series (distanceWalkingRunning, activeEnergyBurned, heartRate, …) for workouts a few months old into series samples, so raw sample counts are not stable over time and statistics queries are the recommended path. [official-doc] https://developer.apple.com/documentation/healthkit/accessing-condensed-workout-samples , https://developer.apple.com/documentation/healthkit/hkstatistics
27. Heart rate — HC: `HeartRateRecord(startTime, …, samples: List<Sample(time: Instant, beatsPerMinute: Long 1–300)>)`; aggregates `BPM_AVG/BPM_MAX/BPM_MIN/MEASUREMENTS_COUNT` over a `TimeRangeFilter`; related records are associated with a session ONLY by time overlap (official workout guide reads `HeartRateRecord` with `TimeRangeFilter.between(session.startTime, session.endTime)`). [official-doc] https://developer.android.com/reference/kotlin/androidx/health/connect/client/records/HeartRateRecord , https://developer.android.com/health-and-fitness/health-connect/experiences/workouts
28. Steps — HK `.stepCount` cumulative count samples (auto-recorded on iPhone and Watch; may be condensed); HC `StepsRecord(count: 1–1,000,000)` with `COUNT_TOTAL`. Neither platform links steps to a workout structurally; both are time-range reads. [official-doc] https://developer.apple.com/documentation/healthkit/hkquantitytypeidentifier/stepcount , https://developer.android.com/reference/kotlin/androidx/health/connect/client/records/StepsRecord
29. HC aggregate de-duplication: only Activity and Sleep data types are de-duped by user-set app priority inside the Aggregate API; `readRecords` returns everything from every app. [official-doc] https://developer.android.com/health-and-fitness/guides/health-connect/develop/aggregate-data

### E. Route point schema

30. HK `HKWorkoutRoute` (iOS 11+, `HKSeriesSample`, type id `HKWorkoutRouteTypeIdentifier`) persists this CLLocation subset: `timestamp`, `coordinate` (lat/lng), `altitude`, `speed`, `course`, `horizontalAccuracy`, `verticalAccuracy`, `speedAccuracy`, `courseAccuracy`. Apple notes store locations are "accurate within 50 meters" and may need smoothing. [official-doc] https://developer.apple.com/documentation/healthkit/reading-route-data
31. CLLocation semantics: `altitude` = metres above mean sea level (EGM2008 geoid; `ellipsoidalAltitude` is the WGS84 ellipsoid height, iOS 15+, NOT persisted by HK); `verticalAccuracy <= 0` ⇒ altitude invalid; `horizontalAccuracy < 0` ⇒ lat/lng invalid; `speed < 0`, `speedAccuracy < 0`, `course < 0`, `courseAccuracy < 0` ⇒ invalid; `course` degrees clockwise from true north; speed m/s. [official-doc] https://developer.apple.com/documentation/corelocation/cllocation/altitude , .../verticalaccuracy , .../horizontalaccuracy , .../speed , .../course , .../speedaccuracy , .../courseaccuracy
32. HC `ExerciseRoute.Location(time: Instant, latitude: Double [-90,90], longitude: Double [-180,180], horizontalAccuracy: Length? ≥0, verticalAccuracy: Length? ≥0, altitude: Length?)`. No speed, no course, no accuracy for them; altitude datum unspecified. [official-doc] https://developer.android.com/reference/kotlin/androidx/health/connect/client/records/ExerciseRoute.Location
33. HC `exerciseRouteResult` is a sealed result: `ExerciseRouteResult.Data(exerciseRoute)`, `.NoData()` (session has no route), `.ConsentRequired()` (route exists but belongs to another app and no per-route consent yet). Reading another app's route requires launching `ExerciseRouteRequestContract` (ActivityResultContract: input = session record id, output = `ExerciseRoute?`, null on denial). `PERMISSION_READ_EXERCISE_ROUTES` (`android.permission.health.READ_EXERCISE_ROUTES`) cannot be requested through the normal permission contract; it is granted only in Settings or via that dialog. In background, third-party routes always return ConsentRequired even with "Always allow". [official-doc] https://developer.android.com/reference/kotlin/androidx/health/connect/client/records/ExerciseRouteResult , https://developer.android.com/reference/kotlin/androidx/health/connect/client/contracts/ExerciseRouteRequestContract , https://developer.android.com/reference/kotlin/androidx/health/connect/client/permission/HealthPermission , https://developer.android.com/health-and-fitness/guides/health-connect/develop/exercise-routes
34. HC route write: `android.permission.health.WRITE_EXERCISE_ROUTE` (singular) + `WRITE_EXERCISE`; a route is not an independent record — it is written as a field of the session; if an app with route-write permission updates a session WITHOUT a route, the existing route is deleted. The data-types overview page prints `READ_EXERCISE_ROUTE` (singular) but the reference constant and the routes guide say `READ_EXERCISE_ROUTES` — the reference wins. [official-doc] exercise-routes guide + HealthPermission reference above; https://developer.android.com/health-and-fitness/health-connect/experiences/workouts
35. HK route read is a two-step: (1) `HKAnchoredObjectQuery(type: HKSeriesType.workoutRoute(), predicate: HKQuery.predicateForObjects(from: workout), anchor: nil, limit: HKObjectQueryNoLimit)` — an ARRAY of `HKWorkoutRoute` samples; (2) per route, `HKWorkoutRouteQuery(route:) { query, [CLLocation]?, done, error }` delivers locations in batches until `done == true`. Apple explicitly warns the workout can exist before its route is attached, and that apps replace routes later via sync identifier after smoothing, so a one-shot query may return nothing or a stale route. [official-doc] https://developer.apple.com/documentation/healthkit/reading-route-data , https://developer.apple.com/documentation/healthkit/hkworkoutroutequery/init(route:datahandler:)
36. HK route write: `HKWorkoutBuilder.seriesBuilder(for: HKSeriesType.workoutRoute()) as HKWorkoutRouteBuilder`, `insertRouteData([CLLocation])` (any order; sorted by date on finish), `finishRoute(with: HKWorkout, metadata:)` only after the workout is saved; fails if no locations were inserted; builder is single-use. Apple's guidance: drop locations with `horizontalAccuracy > 50 m`, keep ≤ 3 s between points. Direct `HKWorkout(...)` initialisers are deprecated since iOS 17 in favour of `HKWorkoutBuilder`. [official-doc] https://developer.apple.com/documentation/healthkit/creating-a-workout-route , https://developer.apple.com/documentation/healthkit/hkworkoutroutebuilder/finishroute(with:metadata:completion:) , https://developer.apple.com/documentation/healthkit/hkworkoutbuilder

### F. Deletion signals, paging, change tracking

37. HK: `HKAnchoredObjectQuery.init(type:predicate:anchor:limit:resultsHandler:)` handler receives `(query, [HKSample]?, [HKDeletedObject]?, HKQueryAnchor?, Error?)`; `HKDeletedObject` has `uuid` + `metadata` only. Deleted-object records are temporary and may be purged by the system; anchors (`HKQueryAnchor`, NSSecureCoding, also `init(fromValue:)`) must be persisted by the app. `updateHandler` makes it long-running. [official-doc] https://developer.apple.com/documentation/healthkit/hkdeletedobject , https://developer.apple.com/documentation/healthkit/hkanchoredobjectquery/init(type:predicate:anchor:limit:resultshandler:)
38. HC: `getChangesToken(ChangesTokenRequest(recordTypes: Set<KClass<Record>>, dataOriginFilters))` → `getChanges(token)` or `getChanges(token, pageSize 1..5000 /*soft limit*/)` → `ChangesResponse { changes: List<Change>, hasMore, nextChangesToken, changesTokenExpired }`; `UpsertionChange.record`, `DeletionChange.recordId` (id only — no record type, for privacy). Tokens expire after 30 days unused. [official-doc] https://developer.android.com/reference/kotlin/androidx/health/connect/client/HealthConnectClient , .../changes/DeletionChange , .../response/ChangesResponse ; sync guide https://developer.android.com/health-and-fitness/guides/health-connect/common-workflows/sync-data
39. HC paging: `ReadRecordsRequest(recordType, timeRangeFilter, dataOriginFilter = ∅, ascendingOrder = true, pageSize = 1000, pageToken = null)` → `ReadRecordsResponse { records, pageToken? }`; quota exhaustion surfaces as `IllegalStateException` (back off). `TimeRangeFilter.between(Instant, Instant)` is [start, end); `LocalDateTime` overloads match "user-experienced" time and assume the current system offset for records lacking zone offsets. [official-doc] https://developer.android.com/reference/kotlin/androidx/health/connect/client/request/ReadRecordsRequest , .../time/TimeRangeFilter , read guide https://developer.android.com/health-and-fitness/guides/health-connect/develop/read-data
40. HC history window: by default an app can only read data from 30 days before its first permission grant; older data needs `PERMISSION_READ_HEALTH_DATA_HISTORY`; uninstall/reinstall resets the window. Background reads need `PERMISSION_READ_HEALTH_DATA_IN_BACKGROUND`. [official-doc] read guide above; HealthPermission reference.
41. HC delete: `deleteRecords(recordType, recordIdsList, clientRecordIdsList)` or by `timeRangeFilter` (auto-filtered to the caller's own records); `updateRecords(records)` requires the HC `id` in metadata. [official-doc] HealthConnectClient reference.
42. HC library state: `androidx.health.connect:connect-client` latest listed 1.2.0-alpha05 (2026-08-12, minSdk 24); every ExerciseRoute/ExerciseRouteResult/ExerciseLap/Changes API is "Added in 1.1.0". 1.2.0-alpha03 (2026-03-25) added `getChanges(token, pageSize)`, RPE and planned-session fields, and defers record validation to the platform on Android 14+. [official-doc] https://developer.android.com/jetpack/androidx/releases/health-connect

### G. Time zones

43. HK time zone is optional metadata `HKMetadataKeyTimeZone` (`"HKTimeZone"`), an NSTimeZone name string (IANA id, e.g. `America/New_York`); Apple Watch workouts in a real export carry `HKTimeZone` and `HKIndoorWorkout` ("0"/"1"). [official-doc] https://developer.apple.com/documentation/healthkit/hkmetadatakeytimezone ; presence on Watch workouts [secondary] mydatahelps page (fact 4).
44. HC stores `startZoneOffset: ZoneOffset?` and `endZoneOffset: ZoneOffset?` (fixed UTC offsets, not IANA ids) on every interval record, nullable. [official-doc] ExerciseSessionRecord / DistanceRecord references.

### H. Units

45. HK quantities are `HKQuantity` + `HKUnit` (e.g. `HKUnit.meter()`, `.kilocalorie()`, `HKUnit(from: "m/s")`, `count/min`); you choose the unit at read time. HC uses typed value classes `Length`, `Energy`, `Velocity`, `Mass` with explicit `inX` accessors; `HeartRateRecord.Sample.beatsPerMinute` is a Long. [official-doc] https://developer.apple.com/documentation/healthkit/hkquantitytypeidentifier/walkingspeed (unit example) ; HC units references above.
46. Interchange formats all use metres, seconds, m/s, bpm and kcal: TCX `Calories` is `xsd:unsignedShort` kcal, `DistanceMeters`, `AltitudeMeters`; GPX `ele` is metres; Strava API `calories`/`distance` (m). [official-doc] https://www8.garmin.com/xmlschemas/TrainingCenterDatabasev2.xsd , https://www.topografix.com/GPX/1/1/ , https://developers.strava.com/docs/reference/

### I. Data-quality quirks

47. Strava ↔ Apple Health: Strava imports only workouts recorded by the native Apple Workout app within the past 30 days (third-party-written workouts are ignored); Strava writes route, activity type, distance, time and calories to Apple Health (but not routes of third-party-origin activities like Garmin/Zwift); Strava refuses duplicate activities with the same date/time. [official-doc (vendor)] https://support.strava.com/en-us/articles/15402024-apple-health-and-strava
48. Strava ↔ Health Connect: Android only; Strava writes time, distance and calorie data for GPS-based activities and reads weight; routes are not mentioned. [official-doc (vendor)] https://support.strava.com/en-us/articles/15401554-health-connect-and-strava
49. Garmin Connect → Health Connect (since Garmin Connect 5.14.x, July 2025): one-way, Android 14+, opt-in; published activity data list = active/total calories, cycling cadence, distance, elevation gained, heart rate, speed, steps, swimming strokes; GPS routes are not in the published list. [secondary] https://www.androidcentral.com/wearables/garmin/heres-everything-garmin-will-and-wont-share-with-google-health-connect , https://forums.garmin.com/sports-fitness/running-multisport/f/forerunner-265-series/412657/garmin-sync-with-google-health-connect-june-2025
50. Strava upload API: accepts `fit, fit.gz, tcx, tcx.gz, gpx, gpx.gz`; `external_id` is a caller-supplied unique id (defaults to filename); a second upload of the same activity fails with a "duplicate of activity <id>" error. Activities expose `map.polyline` and `map.summary_polyline` (Google encoded polylines), `start_date`, `start_date_local`, `timezone`, `utc_offset`, `moving_time`, `elapsed_time`, `total_elevation_gain`, `external_id`, `device_name`, `sport_type`. [official-doc (vendor)] https://developers.strava.com/docs/uploads/ , https://developers.strava.com/docs/reference/

### J. Server-sync numbers and formats

51. Payload size (synthetic 1 h run, 3,600 points at 1 Hz, lat/lng 6 dp) — JSON object per point with 8 short keys + epoch-ms: 108 B/pt ≈ 390 KB/h, gzip-9 → 18 B/pt ≈ 65 KB/h; JSON with ISO-8601 strings and long HC-style keys: 167 B/pt ≈ 603 KB/h, gzip → 70 KB/h; positional arrays `[t,lat,lng,alt]`: 42 B/pt ≈ 150 KB/h, gzip → 35 KB/h; Google polyline 1e5 (2D): 2.0 B/pt ≈ 7 KB/h; polyline 1e6: 3.35 B/pt; zig-zag varint deltas of (t_ms, lat·1e6, lng·1e6, alt·10): 5.0 B/pt ≈ 18 KB/h (gzip → 9 KB/h). Real GPS noise will make compressed sizes somewhat larger. [computed]
52. Google encoded polyline: latitude/longitude only, scaled by 1e5 (≈1.1 m), delta-coded from the previous point, 5-bit chunks + 63 offset, two's-complement sign trick — no altitude, no time, no accuracy. [official-doc] https://developers.google.com/maps/documentation/utilities/polylinealgorithm ; JS: `@mapbox/polyline` 1.2.1 (2023-09-14, supports a precision argument) [secondary] https://registry.npmjs.org/@mapbox/polyline
53. Simplification: Douglas–Peucker keeps points whose perpendicular deviation exceeds a distance tolerance (preserves extrema, recursive); Visvalingam–Whyatt removes the point with the smallest effective triangle area first (least-perceptible change, heap-based, supports progressive/zoom-dependent simplification by storing area as a rank). `simplify-js` 1.2.4 (radial-distance pre-pass + DP, tolerance in coordinate units, `highQuality` flag). On the synthetic smooth track DP kept 287/181/102/65/41 of 3,600 points at ε = 1/2/5/10/20 m; real tracks keep more. [secondary] https://bost.ocks.org/mike/simplify/ , https://github.com/mourner/simplify-js ; numbers [computed].
54. GPX 1.1 (`http://www.topografix.com/GPX/1/1`): `trk > trkseg > trkpt[@lat,@lon]` with children `ele` (decimal, m), `time` (xsd:dateTime, UTC), accuracy-ish `hdop/vdop/pdop`, and `extensions` (lax, foreign namespace). Garmin TrackPointExtension v2 (`http://www.garmin.com/xmlschemas/TrackPointExtension/v2`) adds `hr` (unsignedByte ≥ 1), `cad` (≤ 254), `atemp`, `wtemp`, `depth`, `speed` (m/s), `course`/`bearing` (0–360). [official-doc] https://www.topografix.com/GPX/1/1/ , https://www8.garmin.com/xmlschemas/TrackPointExtensionv2.xsd
55. TCX v2 (`http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2`): `Activity[@Sport ∈ {Running, Biking, Other}] > Lap(TotalTimeSeconds, DistanceMeters, Calories, AverageHeartRateBpm?, MaximumHeartRateBpm?) > Track > Trackpoint(Time, Position(LatitudeDegrees, LongitudeDegrees), AltitudeMeters?, DistanceMeters?, HeartRateBpm?, Cadence?)`. No hiking/walking sport enum. [official-doc] https://www8.garmin.com/xmlschemas/TrainingCenterDatabasev2.xsd
56. FIT: binary; `record` messages store `position_lat/position_long` as semicircles (`deg = semicircles × 180 / 2^31`, ~1 cm at equator) and timestamps as seconds since 1989-12-31T00:00:00Z (Unix offset 631,065,600 s). `@garmin/fitsdk` 21.213.0 (npm, 2026-08-11) ships Decoder (`applyScaleAndOffset`, `convertDateTimesToDates`, `expandSubFields`, `expandComponents`, `convertTypesToStrings`) and Encoder. [secondary] Garmin staff answer https://forums.garmin.com/developer/fit-sdk/f/discussion/325061/what-crs-does-the-python-sdk-decode-to-eg-position_lat-485072248-position_long--882385675 , https://raw.githubusercontent.com/garmin/fit-javascript-sdk/main/README.md , https://registry.npmjs.org/@garmin/fitsdk
57. Existing RN libs: `react-native-health` 1.19.0 last published 2024-10-15; `react-native-health-connect` 4.1.3 (2026-08-06) models the route as `exercise.exerciseRoute.type` ∈ {DATA, NO_DATA, CONSENT_REQUIRED} plus `requestExerciseRoute(recordId): Promise<{route|null}>`. [secondary] npm registry; Context7 `/matinzd/react-native-health-connect`.

---

## 2. API sketch relevant to our library

### iOS (Swift, Expo Module)

```swift
// read workouts incrementally (+ deletions)
let q = HKAnchoredObjectQuery(type: .workoutType(), predicate: pred, anchor: savedAnchor,
                              limit: HKObjectQueryNoLimit) { _, samples, deleted, anchor, err in
  // samples as? [HKWorkout]; deleted: [HKDeletedObject] (uuid only); persist anchor (NSKeyedArchiver)
}
// per workout
w.uuid; w.workoutActivityType.rawValue; w.startDate; w.endDate; w.duration /* active s */
w.workoutEvents?.map { ($0.type.rawValue, $0.dateInterval) }            // 1 pause,2 resume,3 lap,5/6 motion
w.metadata?[HKMetadataKeyIndoorWorkout] as? Bool
w.metadata?[HKMetadataKeyTimeZone] as? String                          // "Asia/Seoul"
(w.metadata?[HKMetadataKeyElevationAscended] as? HKQuantity)?.doubleValue(for: .meter())
w.statistics(for: HKQuantityType(.distanceWalkingRunning))?.sumQuantity()?.doubleValue(for: .meter())
w.statistics(for: HKQuantityType(.activeEnergyBurned))?.sumQuantity()?.doubleValue(for: .kilocalorie())
let hr = w.statistics(for: HKQuantityType(.heartRate)); hr?.averageQuantity()?.doubleValue(for: HKUnit(from: "count/min"))
w.sourceRevision.source.bundleIdentifier; w.sourceRevision.productType; w.device?.model
// routes: array, possibly empty now / appended later
HKAnchoredObjectQuery(type: HKSeriesType.workoutRoute(), predicate: HKQuery.predicateForObjects(from: w), anchor: nil, limit: HKObjectQueryNoLimit) { ... [HKWorkoutRoute] ... }
HKWorkoutRouteQuery(route: r) { _, locs, done, err in /* batches; CLLocation fields per fact 30/31 */ }
// write
let b = HKWorkoutBuilder(healthStore: store, configuration: cfg, device: .local())
b.beginCollection(withStart:); b.add(samples); b.addWorkoutEvents([pause, resume]); b.addMetadata([HKMetadataKeyExternalUUID: serverId, HKMetadataKeyIndoorWorkout: false, HKMetadataKeyTimeZone: tz])
b.endCollection(withEnd:); let workout = try await b.finishWorkout()
let rb = b.seriesBuilder(for: .workoutRoute()) as! HKWorkoutRouteBuilder; try await rb.insertRouteData(locs); try await rb.finishRoute(with: workout, metadata: nil)
```

### Android (Kotlin, Expo Module)

```kotlin
val token = client.getChangesToken(ChangesTokenRequest(setOf(ExerciseSessionRecord::class)))   // one token per type
val resp = client.getChanges(token, pageSize = 1000)   // UpsertionChange(record) | DeletionChange(recordId); loop while hasMore; handle changesTokenExpired
val page = client.readRecords(ReadRecordsRequest(ExerciseSessionRecord::class, TimeRangeFilter.between(s, e), pageSize = 1000, pageToken = tok))
val rec = client.readRecord(ExerciseSessionRecord::class, id).record
rec.exerciseType; rec.startTime; rec.startZoneOffset; rec.segments /* PAUSE=39 */; rec.laps; rec.metadata.dataOrigin.packageName
when (val r = rec.exerciseRouteResult) { is ExerciseRouteResult.Data -> r.exerciseRoute.route; is ExerciseRouteResult.NoData -> ...; is ExerciseRouteResult.ConsentRequired -> launcher.launch(id) /* ExerciseRouteRequestContract */ }
client.aggregate(AggregateRequest(setOf(DistanceRecord.DISTANCE_TOTAL, ActiveCaloriesBurnedRecord.ACTIVE_CALORIES_TOTAL, ElevationGainedRecord.ELEVATION_GAINED_TOTAL, HeartRateRecord.BPM_AVG, HeartRateRecord.BPM_MIN, HeartRateRecord.BPM_MAX, StepsRecord.COUNT_TOTAL), TimeRangeFilter.between(rec.startTime, rec.endTime)))
// write (own session + route + metrics in one transaction)
client.insertRecords(listOf(
  ExerciseSessionRecord(start, off, end, off, Metadata.activelyRecorded(Device(Device.TYPE_PHONE), clientRecordId = serverId, clientRecordVersion = v),
    ExerciseSessionRecord.EXERCISE_TYPE_RUNNING, segments = pauses.map { ExerciseSegment(it.s, it.e, ExerciseSegment.EXERCISE_SEGMENT_TYPE_PAUSE) },
    exerciseRoute = ExerciseRoute(points.map { ExerciseRoute.Location(it.t, it.lat, it.lng, Length.meters(hAcc), Length.meters(vAcc), Length.meters(alt)) })),
  DistanceRecord(start, off, end, off, Length.meters(d), meta), ActiveCaloriesBurnedRecord(...), ElevationGainedRecord(...), HeartRateRecord(..., samples)))
```

### JS surface the native layer should feed (names illustrative)

```ts
readWorkouts({ since?: Cursor, limit? }): Promise<{ workouts: Workout[]; deletedIds: string[]; cursor: Cursor }>
readRoute(workoutId): Promise<Route | { state: 'consentRequired' } | null>
requestRouteAccess(workoutId): Promise<Route | null>        // Android only; resolves null on denial, iOS returns readRoute()
writeWorkout(input: WorkoutWrite): Promise<{ nativeId: string }>
deleteOwnWorkout(nativeId): Promise<void>
```

---

## 3. Design implications for a minimal-options unified API

### Field-by-field mapping (what the unified model should carry)

| Unified field | HealthKit | Health Connect | Normalisation |
|---|---|---|---|
| `nativeId` | `HKObject.uuid` (UUID string) | `metadata.id` | string; key = `${platform}:${nativeId}` |
| `kind` | `workoutActivityType` 37/52/24/13/else | `exerciseType` 56·57/79/37/8·9/else | enum `running|walking|hiking|cycling|other`; keep raw under `platform` |
| `indoor` | `metadata.HKIndoorWorkout == true` | `exerciseType ∈ {RUNNING_TREADMILL, BIKING_STATIONARY, STAIR_CLIMBING_MACHINE}` | boolean; default false |
| `startMs`, `endMs` | `startDate`/`endDate` | `startTime`/`endTime` | epoch ms UTC |
| `activeDurationS` | `duration` | `(end-start) − Σ PAUSE segments` (computed by us) | seconds; document HC is derived |
| `pauses[]` | pairs of pause(1)/resume(2) events (+ motionPaused/Resumed flagged `auto`) | segments with type PAUSE (39) (REST 44 → `auto:false`, flagged `rest`) | `{startMs,endMs,auto?}`; non-overlapping, clipped to session |
| `laps[]` | lap events (`dateInterval`; legacy zero-duration → reconstruct from previous lap end) | `laps[]` (`length?`) | `{startMs,endMs,distanceM?}` |
| `distanceM` | `statistics(for: distanceWalkingRunning).sum` (fallback `totalDistance` pre-iOS 16) | `DISTANCE_TOTAL` aggregate over session range (or own `DistanceRecord`) | metres |
| `activeEnergyKcal` | `statistics(for: activeEnergyBurned).sum` (fallback `totalEnergyBurned`) | `ACTIVE_CALORIES_TOTAL` (NOT `ENERGY_TOTAL`) | kcal |
| `elevationGainM` | metadata `HKElevationAscended` (HKQuantity → m); else compute from route | `ELEVATION_GAINED_TOTAL`; else compute from route | metres; mark `derived:true` when computed |
| `heartRate{avg,min,max}` | `statistics(for: heartRate)` avg/min/max | `BPM_AVG/MIN/MAX` aggregate over range | bpm; optional |
| `steps` | `stepCount` sum over range (time-range query, not associated) | `COUNT_TOTAL` over range | optional; warn about multi-source double count |
| `utcOffsetMin` | from `HKTimeZone` IANA id resolved at `startDate` | `startZoneOffset` | minutes; `timeZoneId` iOS-only under `platform.ios` |
| `source{id,name,version,deviceModel}` | `sourceRevision.source.bundleIdentifier/name`, `.version`, `device?.model`/`productType` | `dataOrigin.packageName`, `device?.manufacturer/model`, `recordingMethod` | `source.id` = bundle id or package name |
| `isOwn` | `bundleIdentifier == Bundle.main.bundleIdentifier` | `packageName == context.packageName` | boolean |
| `route.state` | `none` (0 route samples) / `available` | `NoData` / `Data` / `ConsentRequired` | `'none'|'available'|'consentRequired'`; iOS never `consentRequired` |
| `RoutePoint` | `{t, lat, lng, alt?, hAcc?, vAcc?, speed?, course?}` (negative sentinels → undefined; `vAcc<=0` ⇒ drop `alt`) | `{t, lat, lng, alt?, hAcc?, vAcc?}` | SI; `speed`/`course` optional and in practice iOS-only |

### Expose / hide / normalise

- Expose exactly one read cursor abstraction (`Cursor` = opaque string). iOS: archived `HKQueryAnchor`; Android: changes token **plus** a "last read instant" fallback because tokens expire after 30 days and HC `DeletionChange` carries only the id. Return `deletedIds` alongside upserts on both platforms so the server sync is the same loop.
- Hide `HKStatistics`/`HKUnit`, HC `Length/Energy/Velocity`, zone-offset objects, raw enums; surface SI numbers (m, s, m/s, bpm) and **kcal for energy** (every platform API, TCX, GPX-ext and Strava use kcal natively; kJ would only add 4.184 rounding drift). Name the field with its unit (`activeEnergyKcal`, `distanceM`) so there is no ambiguity.
- Do NOT fake fields: `heartRate`, `steps`, `elevationGainM`, `utcOffsetMin`, `route` are optional. Fields with no counterpart go under `platform.ios` / `platform.android` (see §5 list) instead of being emulated.
- Route is a separate call (`readRoute`), never eagerly attached: HK needs a second streaming query per route sample; HC may need a consent dialog and forbids third-party route reads in background. Merge multiple `HKWorkoutRoute` samples for one workout by concatenating and sorting by `t`, deduping identical timestamps.
- Activity mapping should be a frozen table in TS shared by both native layers; unknown raw types map to `other` but the raw value is preserved in `platform` so nothing is lost.
- Write path mirrors the read model (`WorkoutWrite` = kind, indoor, startMs, endMs, pauses, laps, distanceM, activeEnergyKcal, elevationGainM, heartRateSamples?, route?, clientId). The library sets `HKMetadataKeyExternalUUID`/`HKMetadataKeySyncIdentifier`+`SyncVersion` (iOS) and `clientRecordId`/`clientRecordVersion` (Android) to `clientId` so re-writes are upserts and re-reads can be recognised as `isOwn` + `clientId` (echo suppression).
- Server idempotency key: `(platform, nativeId)` is the primary key of the native store; add a secondary dedupe index `(source.id, kind, round(startMs,1s), round(endMs,1s))` for cross-source duplicates (Watch + Strava, Garmin + phone) and surface them as "possible duplicate" rather than auto-merging. For own workouts, `clientId` (server id) is the key.
- Transport: send the full point list as positional arrays or varint-delta binary, gzip the request body (≈ 9–35 KB per hour of 1 Hz data); keep the canonical full-resolution route on the server; derive `summaryPolyline` (Google polyline 1e5, 2D) server-side for thumbnails; apply Visvalingam/DP only to derived copies (ε ≈ 2–5 m running, 5–10 m hiking as a starting point, tune on real traces).
- GPX export in pure TS is cheap and dependency-free (string building; `trkpt lat/lon`, `ele`, `time` UTC, `extensions > gpxtpx:TrackPointExtension > hr`), so offer it as an optional subpath (`@gj-kit/<pkg>/gpx`) not in the native core. TCX/FIT are out of scope for the library (FIT needs the profile; use `@garmin/fitsdk` on the server if ever needed).

---

## 4. Pitfalls / gotchas

1. HC route write validation: last point must be strictly before `endTime` and timestamps strictly increasing; duplicate-timestamp points or a point at `endTime` throw `IllegalArgumentException` on Android < 14 (and platform-side errors on 14+). Clamp/dedupe before insert. [source-code]
2. HC updating a session without passing the route (while holding route-write permission) silently deletes the route. Always re-send the route on `updateRecords`. [official-doc]
3. HC `READ_EXERCISE_ROUTES` is not grantable through the normal permission launcher; third-party routes need the per-route consent dialog (`ExerciseRouteRequestContract`) and always come back `ConsentRequired` in background, so background sync on Android can sync metadata but not other apps' routes. [official-doc]
4. HC 30-day history window without `PERMISSION_READ_HEALTH_DATA_HISTORY`; token expiry after 30 days; `DeletionChange` lacks the record type → one token per record type and a dedupe-on-reread fallback. [official-doc]
5. HK `deletedObjects` are transient; if the app has not run an anchored query for a long time, deletions may be missing → server should tolerate "tombstone never arrives" (reconcile by re-listing ids for a window). [official-doc]
6. HK routes arrive asynchronously after the workout (and may be replaced later via sync identifier); reading a just-finished third-party workout immediately yields zero routes. Re-check with the anchored route query or on next sync; never cache `route.state = 'none'` as final for recent workouts. [official-doc]
7. `HKWorkout.totalDistance/totalEnergyBurned` are deprecated; use `statistics(for:)`, which returns nil when the writer did not associate samples (common for third-party apps that only set totals on old OSes) → fall back to the deprecated totals when statistics are nil on iOS 16+. [official-doc]
8. HK first-party workout series get condensed months later, so sample counts/timestamps change; never use raw HR sample count as a change signal. [official-doc]
9. Steps and heart rate are time-range joins on both platforms; overlapping sources (phone + watch + chest strap) double count unless you pick one source (HK `HKStatisticsOptions.separateBySource`; HC aggregate dedupes only activity/sleep types by user priority). [official-doc]
10. Indoor workouts: no route on either platform; `kind` still says running — expose `indoor` so the UI does not request maps. HK indoor flag is metadata that third-party writers often omit. [official-doc]
11. Cross-source duplicates are normal (Strava writes imported Watch runs back to Health; Garmin one-way to HC; Strava writes GPS activities to HC). Strava itself dedupes by same date/time. Do not auto-delete; flag. [vendor docs]
12. Time zones differ in kind: IANA id (HK metadata, optional) vs fixed offset (HC, nullable). Store instants in UTC plus offset minutes; never store local wall-clock as the primary time.
13. Energy: HC `TotalCaloriesBurned` includes basal; comparing it to HK `activeEnergyBurned` under-/over-states by resting energy. Always map to ACTIVE. [official-doc]
14. Binder IPC: HC reads/writes go through a 1 MB Binder transaction buffer; very long routes (multi-hour hikes at 1 Hz) may need paging or client-side thinning on write — no documented point limit exists. [unverified]
15. Apple requires an explanation for `.other`/swimming energy calculations; review guidelines also require usage descriptions (NSHealthShareUsageDescription/NSHealthUpdateUsageDescription) — covered by the permissions dimension, but writing `.other` for trail runs instead of `.running` is a product mistake, not just a mapping one.

---

## 5. Open questions

**Needs a USER decision**
- Energy unit in the public model: kcal (recommended above) vs kJ (pure SI).
- Include `steps` and `heartRate{avg,min,max}` in the default read (extra queries + permissions on both platforms) or make them opt-in (`include: ['heartRate','steps']`)? Minimal-options bias says opt-in.
- Treat HK `motionPaused`/HC `REST` as pauses in `pauses[]` (with `auto`/`rest` flags) or only manual pauses?
- Keep `elevationLossM` in the common model (computed from route on both platforms) or only expose HK's `HKElevationDescended` under `platform.ios`?
- Should the library compute `elevationGainM`/`distanceM` from the route when the store lacks them (derived values), or leave that to the server?
- Ship GPX export as a subpath export or a separate package.

**Needs a hands-on device test**
- Does HK `duration` subtract `motionPaused` intervals for Apple Watch auto-paused runs?
- Does HC `EXERCISE_DURATION_TOTAL` subtract `PAUSE` segments on Android 14/15/16?
- How many `HKWorkoutRoute` samples does a real Apple Watch outdoor run produce (1 vs several), and do third-party apps (Strava, Nike Run Club) attach routes at all?
- Do HR/distance samples of third-party HK workouts come back via `predicateForObjects(from:)` or only via time-range predicates?
- Largest `ExerciseRoute` that inserts/reads without `TransactionTooLargeException` on the Pixel_9a AVD (target: 4 h at 1 Hz ≈ 14,400 points).
- Does Garmin Connect → HC actually attach an `ExerciseRoute` to its sessions (published list omits routes)?
- HC `metadata.id` stability across app reinstall and across HC APK vs Android 14 platform module.

**Needs more research**
- Whether Apple Watch sets `HKElevationAscended` on every outdoor run/hike (observed in exports but not documented).
- Health Connect altitude datum (MSL vs ellipsoid) for Samsung/Garmin-written routes.
- Real-world GPS-noise simplification ratios (my numbers are from a smooth synthetic track).
- Health Connect platform-side (Android 14+) validation differences vs the Kotlin client checks, since 1.2.0-alpha03 defers validation to the platform.

---

## 6. Sources

Apple (developer.apple.com/documentation/healthkit/…): hkworkout, hkworkout/duration, hkworkout/totaldistance, hkworkout/totalenergyburned, hkworkout/statistics(for:), hkworkout/allstatistics, hkworkout/workoutevents, hkworkout/workoutactivities, hkworkoutactivity, hkworkoutactivitytype (+ running/walking/hiking/cycling/crosscountryskiing/other), hkworkoutevent, hkworkouteventtype (+ pause/lap/segment/marker/motionpaused/pauseorresumerequest), hkworkoutroute, hkworkoutroutequery/init(route:datahandler:), hkworkoutroutebuilder (+ insertroutedata, finishroute), hkworkoutbuilder, reading-route-data, creating-a-workout-route, accessing-condensed-workout-samples, hkanchoredobjectquery (+ init), hkdeletedobject, hkqueryanchor, hksourcerevision, hksource/bundleidentifier, hkobject/uuid, hkobject/sourcerevision, hkobject/device, hkdevice, hkstatistics, hkmetadatakey{elevationascended,elevationdescended,indoorworkout,timezone,syncidentifier,syncversion,externaluuid,averagespeed,maximumspeed,wasuserentered}, hkquantitytypeidentifier/{activeenergyburned,basalenergyburned,heartrate,distancewalkingrunning,stepcount,runningspeed,runningpower,walkingspeed}; developer.apple.com/documentation/corelocation/cllocation (+ altitude, ellipsoidalaltitude, horizontalaccuracy, verticalaccuracy, speed, speedaccuracy, course, courseaccuracy, sourceinformation). Local: iPhoneOS26.5.sdk HealthKit headers (HKWorkout.h, HKMetadata.h, HKWorkoutRoute.h) and compiled Swift for raw values.

Android (developer.android.com): reference/kotlin/androidx/health/connect/client/{HealthConnectClient, HealthConnectFeatures, records/ExerciseSessionRecord, records/ExerciseRoute, records/ExerciseRoute.Location, records/ExerciseRouteResult(.Data/.NoData/.ConsentRequired), records/ExerciseSegment, records/ExerciseLap, records/metadata/{Metadata,DataOrigin,Device}, records/{DistanceRecord,TotalCaloriesBurnedRecord,ActiveCaloriesBurnedRecord,ElevationGainedRecord,HeartRateRecord,HeartRateRecord.Sample,StepsRecord,SpeedRecord}, changes/{DeletionChange,UpsertionChange}, response/{ChangesResponse,ReadRecordsResponse}, request/{ChangesTokenRequest,ReadRecordsRequest}, permission/{HealthPermission,PermissionController}, contracts/ExerciseRouteRequestContract, time/TimeRangeFilter, units/{Length,Energy,Velocity}}; health-and-fitness/guides/health-connect/{develop/exercise-routes, develop/read-data, develop/aggregate-data, common-workflows/sync-data, data-and-data-types/data-types}; health-and-fitness/health-connect/{features/exercise-routes, experiences/workouts}; jetpack/androidx/releases/health-connect. AOSP source: android.googlesource.com/platform/frameworks/support/+/refs/heads/androidx-main/health/connect/connect-client/src/main/java/androidx/health/connect/client/records/{ExerciseSessionRecord,ExerciseSegment,ExerciseRoute}.kt

Formats / sync: developers.google.com/maps/documentation/utilities/polylinealgorithm ; topografix.com/GPX/1/1/ ; www8.garmin.com/xmlschemas/TrackPointExtensionv2.xsd ; www8.garmin.com/xmlschemas/TrainingCenterDatabasev2.xsd ; forums.garmin.com/developer/fit-sdk/f/discussion/325061 ; raw.githubusercontent.com/garmin/fit-javascript-sdk/main/README.md ; registry.npmjs.org/{@garmin/fitsdk,simplify-js,@mapbox/polyline,react-native-health-connect,react-native-health} ; github.com/mourner/simplify-js ; bost.ocks.org/mike/simplify/ ; developers.strava.com/docs/{reference,uploads} ; support.strava.com/en-us/articles/15402024-apple-health-and-strava ; support.strava.com/en-us/articles/15401554-health-connect-and-strava ; androidcentral.com/wearables/garmin/heres-everything-garmin-will-and-wont-share-with-google-health-connect ; forums.garmin.com/…/412657/garmin-sync-with-google-health-connect-june-2025 ; support.mydatahelps.org/hc/en-us/articles/4412890806419-Apple-HealthKitV2-Workouts-Export-Format ; Context7 /matinzd/react-native-health-connect.

---

## Appendix A. Proposed minimal unified model (TypeScript sketch)

```ts
export type Platform = 'ios' | 'android';
export type WorkoutKind = 'running' | 'walking' | 'hiking' | 'cycling' | 'other';
export type RouteState = 'none' | 'available' | 'consentRequired';

export interface Interval { startMs: number; endMs: number }
export interface Pause extends Interval { auto?: boolean }          // HK motionPaused / HC REST flagged
export interface Lap extends Interval { distanceM?: number }

export interface WorkoutSource {
  id: string;            // HK bundleIdentifier | HC packageName
  name?: string;         // HK source.name
  version?: string;      // HK sourceRevision.version
  deviceModel?: string;  // HK device.model ?? productType | HC device.model
}

export interface Workout {
  id: string;                    // `${platform}:${nativeId}` — idempotency key
  platform: Platform;
  nativeId: string;              // HK uuid | HC metadata.id
  clientId?: string;             // our own id round-tripped (HKExternalUUID / clientRecordId)
  isOwn: boolean;
  kind: WorkoutKind;
  indoor: boolean;
  startMs: number;
  endMs: number;
  activeDurationS: number;       // HK duration | HC (end-start) − pauses
  utcOffsetMin?: number;
  source: WorkoutSource;
  distanceM?: number;
  activeEnergyKcal?: number;
  elevationGainM?: number;
  heartRate?: { avgBpm?: number; minBpm?: number; maxBpm?: number };
  steps?: number;
  pauses: Pause[];
  laps: Lap[];
  route: RouteState;
  lastModifiedMs?: number;       // HC metadata.lastModifiedTime; iOS undefined
  platformData: IosWorkoutData | AndroidWorkoutData;   // discriminated by `platform`
}

export interface RoutePoint {
  t: number; lat: number; lng: number;
  alt?: number; hAcc?: number; vAcc?: number;          // metres; sentinel-cleaned
  speed?: number; course?: number;                     // m/s, degrees; iOS-only in practice
}
export interface Route { workoutId: string; points: RoutePoint[]; segmentBreaks?: number[] }  // indices where HK route samples were joined

export interface IosWorkoutData {
  activityTypeRaw: number; bundleIdentifier: string; productType?: string; osVersion?: string;
  timeZoneId?: string; elevationDescendedM?: number; averageSpeedMps?: number; maxSpeedMps?: number;
  events: { type: number; startMs: number; endMs: number }[]; activityCount: number; metadata: Record<string, unknown>;
}
export interface AndroidWorkoutData {
  exerciseType: number; packageName: string; recordingMethod: number; deviceType?: number;
  clientRecordId?: string; clientRecordVersion?: number; endUtcOffsetMin?: number;
  title?: string; notes?: string; rpe?: number; segments: { type: number; startMs: number; endMs: number }[];
}
```

## Appendix B. Platform-specific fields that must stay under `platformData` (do not fake)

iOS only: `HKTimeZone` IANA id; `HKElevationDescended`; `HKAverageSpeed`/`HKMaximumSpeed`; `HKAverageMETs`; `HKWeatherTemperature`; `workoutActivities` (multisport sub-activities); `marker`/`segment`/`pauseOrResumeRequest` events; `sourceRevision.productType`/`operatingSystemVersion`; route point `speed`, `course`, `speedAccuracy`, `courseAccuracy`; `HKWorkoutRoute` sample uuids; `HKWasUserEntered`.

Android only: `exerciseType` int incl. TREADMILL/STATIONARY distinctions; `title`, `notes`, `rateOfPerceivedExertion`, `plannedExerciseSessionId`; `segments` with sport segment types/repetitions/weight/setIndex; `endZoneOffset`; `metadata.recordingMethod`, `device.type`, `clientRecordId/Version`, `lastModifiedTime`; `ExerciseRouteResult.ConsentRequired` state; `TotalCaloriesBurned` (basal-inclusive); `SpeedRecord` series.
