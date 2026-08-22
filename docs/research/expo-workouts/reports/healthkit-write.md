# iOS HealthKit — writing a completed GPS workout from an iPhone app (no Apple Watch)

Scope: an Expo/RN app records a run/hike/walk itself with CoreLocation and, when the activity is over, saves it to HealthKit as one `HKWorkout` + associated quantity samples + one `HKWorkoutRoute`. Live `HKWorkoutSession` tracking is covered only to scope it out. Researched 2026-08-22 against live Apple doc JSON endpoints (`developer.apple.com/tutorials/data/documentation/...`), the iPhoneOS 26.5 SDK headers, Apple forum answers by DTS staff, and Apple's WWDC25 iPhone sample project. Where the live page contradicted my prior knowledge the live page wins and it is called out.

Confidence tags: [official-doc] Apple developer documentation / App Review Guidelines / docs.expo.dev · [source-code] SDK header or real repository source · [secondary] Apple forum / WWDC transcript mirror / npm+GitHub metadata · [unverified] not confirmed by a live source.

---

## 1. Facts

### Builder API (the supported write path)

1. `HKWorkoutBuilder` is available iOS 12.0+ / iPadOS 12.0+ / visionOS 1.0+ / watchOS 5.0+. Overview: "Incrementally collect samples and events associated with a workout. When the workout ends, call finishWorkout(completion:) to create an HKWorkout sample and save it to the HealthKit store. For watchOS, use an HKWorkoutSession and an HKLiveWorkoutBuilder instead." [official-doc] https://developer.apple.com/documentation/healthkit/hkworkoutbuilder
2. `init(healthStore:configuration:device:)` "Returns a new workout builder object that is not connected to a workout session or other data source." The store "is retained until the builder is finished and a workout has been saved or discarded." [official-doc][source-code] https://developer.apple.com/documentation/healthkit/hkworkoutbuilder/init(healthstore:configuration:device:) · HKWorkoutBuilder.h
3. Exact Swift signatures (all async variants throw on `success == false`):
   - `func beginCollection(at startDate: Date) async throws` — header: "Calling this method is required before any samples, events or metadata can be added to the builder." [official-doc][source-code]
   - `func addSamples(_ samples: [HKSample]) async throws` (ObjC `addSamples:completion:`, Swift completion form `add(_:completion:)`).
   - `func addWorkoutEvents(_ workoutEvents: [HKWorkoutEvent]) async throws`
   - `func addMetadata(_ metadata: [String : Any]) async throws` — merged "in the same manner as -[NSMutableDictionary addEntriesFromDictionary:]"; on error "the builder's metadata property will remain unchanged."
   - `func addWorkoutActivity(_:) async throws` (iOS 16+), `updateActivity(uuid:end:)`, `updateActivity(uuid:adding:)`.
   - `func endCollection(at endDate: Date) async throws` — "Calling this method is required before you finish a workout builder."
   - `func finishWorkout() async throws -> HKWorkout?`
   - `func discardWorkout()`
   - `func seriesBuilder(for seriesType: HKSeriesType) -> HKSeriesBuilder?`
   [official-doc] https://developer.apple.com/documentation/healthkit/hkworkoutbuilder (topic pages linked from it) · [source-code] HKWorkoutBuilder.h (iPhoneOS26.5.sdk)
4. `addSamples` constraints (header, verbatim): "The samples will be saved to the database if they have not already been saved. The constraints of -[HKHealthStore saveObject:withCompletion:] apply to this method as well. The start date of the samples must be later than the start date of the receiver. It is an error to call this method after finishWorkoutWithCompletion: has been called." A DTS example that works uses samples whose `start` equals the `beginCollection` start date, so "later than" is in practice "not earlier than" [secondary]. [source-code] https://raw.githubusercontent.com/xybp888/iOS-SDKs/master/iPhoneOS26.5.sdk/System/Library/Frameworks/HealthKit.framework/Headers/HKWorkoutBuilder.h · https://developer.apple.com/forums/thread/771878
5. `finishWorkout` returns `nil` workout AND `nil` error when "finishing the workout succeeded but the workout sample is not available because the device is locked." [official-doc][source-code] https://developer.apple.com/documentation/healthkit/hkworkoutbuilder/finishworkout(completion:)
6. `discardWorkout()` header: "Finishes building the workout and discards the result instead of saving it. Samples that were added to the workout will not be deleted." (i.e. samples pushed via `addSamples` are already persisted and become orphans on discard/failure). [source-code] HKWorkoutBuilder.h
7. `seriesBuilder(for:)` header: "Retrieves, and creates if it does not already exist, the series builder for the specified type. The series constructed with the returned builder will be associated with the workout when it is finished." [source-code][official-doc] https://developer.apple.com/documentation/healthkit/hkworkoutbuilder/seriesbuilder(for:)
8. `HKWorkoutConfiguration` (iOS 10+): `activityType: HKWorkoutActivityType`, `locationType: HKWorkoutSessionLocationType` (`.unknown`, `.indoor`, `.outdoor`), `swimmingLocationType`, `lapLength`. "don't subclass." [official-doc] https://developer.apple.com/documentation/healthkit/hkworkoutconfiguration · https://developer.apple.com/documentation/healthkit/hkworkoutsessionlocationtype
9. Relevant `HKWorkoutActivityType` cases: `.running`, `.walking`, `.cycling` (group "Exercise and fitness"), `.hiking` (group "Outdoor activities"); `.other` exists. [official-doc] https://developer.apple.com/documentation/healthkit/hkworkoutactivitytype
10. `HKWorkoutActivity` (iOS 16+): "All HKWorkout instances have at least one associated HKWorkoutActivity. If you don't explicitly set workout activities, HealthKit assigns a workout activity that matches the HKWorkout object's activity type." [official-doc] https://developer.apple.com/documentation/healthkit/hkworkoutactivity
11. `HKWorkoutEvent`: "Workouts start in an active state. A pause event switches it to an inactive state; a resume event switches it back ... Adding a pause event when the workout is already inactive, or a resume event when the workout is already active ... These events are ignored." Lap/segment/marker mark periods/points of interest. Create with `HKWorkoutEvent(type:dateInterval:metadata:)` (iOS 11+); `init(type:date:)` is deprecated. Event types: `pause, resume, motionPaused, motionResumed, pauseOrResumeRequest, lap, segment, marker`. [official-doc] https://developer.apple.com/documentation/healthkit/hkworkoutevent · https://developer.apple.com/documentation/healthkit/hkworkouteventtype
12. `HKDevice.local()` "returns a device object that represents the current device" (iOS 9+). [official-doc] https://developer.apple.com/documentation/healthkit/hkdevice/local()

### Route builder

13. `HKWorkoutRouteBuilder` is iOS 11.0+ / watchOS 4.0+ (subclass of `HKSeriesBuilder`). Overview: "use seriesBuilder(for:) to instantiate a HKWorkoutRouteBuilder ... Instantiating a HKWorkoutRouteBuilder directly is discouraged." Header: "If the discard method is called, collected data will be deleted ... If the builder is deleted, or the client goes away before calling the finish method, data will be lost." [official-doc][source-code] https://developer.apple.com/documentation/healthkit/hkworkoutroutebuilder
14. `init(healthStore:device:)` — `device`: "Pass nil if the app is generating its own location data (for example, using CoreLocation)." "Use of this initializer is discouraged. Use seriesBuilder(for:) instead." (discouraged, NOT deprecated — no `API_DEPRECATED` in the 26.5 header). [official-doc][source-code] https://developer.apple.com/documentation/healthkit/hkworkoutroutebuilder/init(healthstore:device:)
15. `func insertRouteData(_ routeData: [CLLocation]) async throws` — "The CLLocation objects may be inserted in any order; the builder sorts them by date when finalizing the route." Header adds: "If the completion handler success is NO, then error is non-nil. An error here is considered fatal and the series builder will be complete." [official-doc][source-code] https://developer.apple.com/documentation/healthkit/hkworkoutroutebuilder/insertroutedata(_:completion:)
16. `func finishRoute(with workout: HKWorkout, metadata: [String : Any]?) async throws -> HKWorkoutRoute` — "You must have already saved this workout to the HealthKit store." "This method fails if you haven't added any location data." "this method invalidates the builder." "You cannot associate the route with another workout." Note box: "You must call finishRoute(with:metadata:completion:) before the system deallocates the builder. Failure to do so results in a loss of all route data added to the builder." Header: the error can indicate "database inaccessibility during device lock." [official-doc][source-code] https://developer.apple.com/documentation/healthkit/hkworkoutroutebuilder/finishroute(with:metadata:completion:)
17. CONFLICT between two official sources on the `seriesBuilder(for:)` path. Header (HKWorkoutRouteBuilder.h, `finishRouteWithWorkout:`): "If you are using this route builder with a workout builder, you should never call this method. The route will be finished when you finish the workout builder." Article "Creating a workout route": obtains the builder via `workoutBuilder.seriesBuilder(for: HKSeriesType.workoutRoute())` and then, "After saving the workout, add any remaining locations to the route builder and call finishRoute(with:metadata:completion:)". The WWDC18 transcript does not settle it. Unresolved → device test (see §5). [source-code] vs [official-doc] https://developer.apple.com/documentation/healthkit/creating-a-workout-route
18. Route data quality rules are client-side guidance, not documented server-side filtering: "Because raw Core Location data can contain a significant amount of noise, your app needs to filter out any inaccurate locations before adding them to the route builder. Don't add any locations whose accuracy is greater than 50 meters. For best results, try to keep the time between locations to 3 seconds or less." Apple's snippet filters `location.horizontalAccuracy <= 50.0` and uses `kCLLocationAccuracyBest`. The reading article says "Locations from the HealthKit store are accurate within 50 meters, but they may need additional smoothing" — whether HealthKit itself drops worse points is not stated anywhere I could find. WWDC17 demo filtered at ≤10 m and said "Location data is added asynchronously and it's sorted by date, by HealthKit when the series is finalized." [official-doc][secondary] https://developer.apple.com/documentation/healthkit/creating-a-workout-route · https://developer.apple.com/documentation/healthkit/reading-route-data · https://asciiwwdc.com/2017/sessions/221
19. `HKWorkoutRoute` persists only this subset of `CLLocation`: `timestamp, coordinate, altitude, speed, course, horizontalAccuracy, verticalAccuracy, speedAccuracy, courseAccuracy`. Routes are read back with `HKWorkoutRouteQuery` in batches. [official-doc] https://developer.apple.com/documentation/healthkit/reading-route-data
20. No documented maximum batch size or point count for `insertRouteData`. `HKError.Code.errorDataSizeExceeded` (iOS 17+) exists: "The provided data's size exceeds the maximum allowed" (API not specified). One forum report mentions "Unable to find location series" on very long routes. [source-code][secondary] HKDefines.h · https://developer.apple.com/forums/thread/83855
21. Route timestamps must sit inside the workout window or Fitness won't draw it. Apple DTS (Ziqiao Chen): "Regarding the workout route issue, it is typically because the route data has something wrong. One example is that the timestamps in the track points of the route are not set or are not consistent with the workout start / end time." A forum user adds that only running/walking/cycling-type outdoor workouts get maps (not Apple-confirmed). [secondary] https://developer.apple.com/forums/thread/773069 · https://developer.apple.com/forums/thread/83855
22. Apple DTS on indoor/route-less workouts: "There is currently no public API for 3rd party developers to access the location of an indoor workout ... you can probably consider creating a workout route with a single location." [secondary] https://developer.apple.com/forums/thread/773408
23. "The workout needs to be saved before the route." (WWDC17) and the reading article: "an app must save a workout before associating route data with it. This means there is a brief period when the workout exists in the HealthKit store, but it doesn't yet have a route sample associated with it." [secondary][official-doc] https://asciiwwdc.com/2017/sessions/221 · https://developer.apple.com/documentation/healthkit/reading-route-data

### Permissions, plist, entitlements

24. "Specifically for route data, you must request permission to read and share both HKWorkout and HKWorkoutRoute samples." `requestAuthorization(toShare:read:)` takes `Set<HKSampleType>` for share; `HKObjectType.workoutType()` and `HKSeriesType.workoutRoute()` are both valid share types. [official-doc] https://developer.apple.com/documentation/healthkit/creating-a-workout-route · https://developer.apple.com/documentation/healthkit/hkhealthstore/requestauthorization(toshare:read:completion:)
25. Missing `workoutType()` / `workoutRoute()` share permission surfaces as an opaque XPC error when inserting route data ("connection to service named com.apple.healthd.server was interrupted"). Forum posters fixed it by adding those two permissions. [secondary] https://developer.apple.com/forums/thread/83855 · https://developer.apple.com/forums/thread/82657
26. Every quantity type you attach (e.g. `distanceWalkingRunning`, `activeEnergyBurned`, `heartRate`, `stepCount`) needs its own share permission; save fails with `errorAuthorizationNotDetermined` / `errorAuthorizationDenied` otherwise. `authorizationStatus(for:)` reports share status only; read denial is never observable. `requestAuthorization`'s `success` "doesn't indicate whether the user actually granted permission." [official-doc] https://developer.apple.com/documentation/healthkit/authorizing-access-to-health-data · https://developer.apple.com/documentation/healthkit/hkhealthstore/authorizationstatus(for:)
27. `NSHealthShareUsageDescription` (read) and `NSHealthUpdateUsageDescription` (write) are mandatory: "You must set the usage keys, or your app will crash when you request authorization." Entitlement `com.apple.developer.healthkit` (boolean) is required; `com.apple.developer.healthkit.access` only for extra-sensitive types (not needed for workouts/routes). Enabling the capability adds `healthkit` to `UIRequiredDeviceCapabilities` — "If HealthKit isn't required for the correct operation of your app, delete the healthkit entry". [official-doc] https://developer.apple.com/documentation/healthkit/setting-up-healthkit · https://developer.apple.com/documentation/bundleresources/entitlements/com.apple.developer.healthkit
28. Expo: `ios.entitlements` and `ios.infoPlist` are "Dictionary of arbitrary configuration to add to your standalone app's native *.entitlements / Info.plist"; "Plugins that add modifications can only be used with prebuilding and managed EAS Build." → the library needs a config plugin (or documented app.json keys) for the entitlement + two usage strings. [official-doc] https://docs.expo.dev/versions/latest/config/app/
29. `HKHealthStore.isHealthDataAvailable()` is true on iOS, watchOS, visionOS and iPadOS 17+; false on iPadOS ≤16 and macOS. [official-doc] https://developer.apple.com/documentation/healthkit/hkhealthstore/ishealthdataavailable()

### Upsert / identity / delete

30. `HKMetadataKeySyncIdentifier` (String, iOS 11+): "When you save an HKObject with a sync identifier, the system looks for any existing objects with the same sync identifier. If it finds a match, the system compares the objects' HKMetadataKeySyncVersion values. If the new object has a greater sync version, the system replaces the old object with the new one. If the old object is associated with a workout or part of a correlation, the system also replaces the old object in the workout or correlation." `HKMetadataKeySyncVersion` (NSNumber) "must be provided if HKMetadataKeySyncIdentifier is provided" and "may not be provided if HKMetadataKeySyncIdentifier is not provided." [official-doc][source-code] https://developer.apple.com/documentation/healthkit/hkmetadatakeysyncidentifier · https://developer.apple.com/documentation/healthkit/hkmetadatakeysyncversion · HKMetadata.h
31. Routes are explicitly designed to be replaced via sync identifier: "the app updates the route sample using a sync identifier, replacing the original sample with the new, updated version." Readers are told to use `HKAnchoredObjectQuery` for routes because of that. [official-doc] https://developer.apple.com/documentation/healthkit/reading-route-data
32. `HKMetadataKeyExternalUUID` (String, iOS 8+): "Uniqueness of objects with the same value of this key is not enforced by HealthKit." It is a label for your server id, not an upsert key. [source-code][official-doc] HKMetadata.h · https://developer.apple.com/documentation/healthkit/hkmetadatakeyexternaluuid
33. Plain `save`: "Saving an object with the same unique identifier as an object already in the HealthKit store fails with an errorInvalidArgument error. When saving multiple objects, if any object cannot be saved, none of them are saved." `sourceRevision` is set to the saving app on retrieval. [official-doc] https://developer.apple.com/documentation/healthkit/hkhealthstore/save(_:withcompletion:)-47iwb
34. Delete: `delete(_ object: HKObject)`, `delete(_ objects: [HKObject])`, `deleteObjects(of:predicate:) -> Int`. "Your app can delete only those objects that it has previously saved to the HealthKit store. If the user revokes sharing permission, you can no longer delete the object." Errors: `errorAuthorizationNotDetermined`, `errorAuthorizationDenied`, `errorInvalidArgument` for objects not in the store or an empty array; batch deletes are atomic. Deleted objects leave temporary `HKDeletedObject` entries. NOTHING in the docs says deleting a workout cascades to its associated samples or route. [official-doc] https://developer.apple.com/documentation/healthkit/hkhealthstore/delete(_:withcompletion:)-78l1m · https://developer.apple.com/documentation/healthkit/hkhealthstore/deleteobjects(of:predicate:withcompletion:)
35. `earliestPermittedSampleDate()` (iOS 9+): "Attempts to save samples earlier than this date fail with an errorInvalidArgument error." [official-doc] https://developer.apple.com/documentation/healthkit/hkhealthstore/earliestpermittedsampledate()
36. Sample duration guidance: "avoid saving samples that are 24 hours long or longer"; "Most sample types have restrictions on duration. If you attempt to save a sample that doesn't meet those restrictions, it fails to save." Workout detail samples: "high frequency data (a minute or less per sample)"; five-minute vs five-second trade-off discussed. [official-doc] https://developer.apple.com/documentation/healthkit/saving-data-to-healthkit · https://developer.apple.com/documentation/healthkit/adding-samples-to-a-workout
37. `HKQuantitySample(type:quantity:start:end:device:metadata:)` throws an Objective-C `NSInvalidArgumentException` (a crash in Swift, not a thrown error) if the unit is incompatible with the type or `start > end`. [official-doc] https://developer.apple.com/documentation/healthkit/hkquantitysample/init(type:quantity:start:end:device:metadata:)

### Deprecations and newer APIs

38. All `HKWorkout(activityType:start:end:...)` convenience initialisers are deprecated iOS 8.0–17.0 / watchOS 2.0–10.0 / visionOS 1.0–1.0 with the message "Use HKWorkoutBuilder". `HKHealthStore.add(_:to:completion:)` is deprecated on the same schedule. The live page contradicts any memory of these being "still fine" — they are formally deprecated since iOS 17. [official-doc][source-code] https://developer.apple.com/documentation/healthkit/hkworkout/init(activitytype:start:end:) · https://developer.apple.com/documentation/healthkit/hkworkout/init(activitytype:start:end:workoutevents:totalenergyburned:totaldistance:metadata:) · HKWorkout.h
39. `HKWorkout.totalEnergyBurned`, `totalFlightsClimbed`, `totalSwimmingStrokeCount` are deprecated iOS 18.0 ("Use statisticsForType:"). `totalDistance`: the live doc shows "iOS 8.0–27.0" deprecated; the 26.5 header still says `API_TO_BE_DEPRECATED`, so it becomes formally deprecated in iOS 27 (beta as of today). Use `statistics(for:)` / `allStatistics` (iOS 16+). [official-doc][source-code] https://developer.apple.com/documentation/healthkit/hkworkout/totaldistance · https://developer.apple.com/documentation/healthkit/hkworkout/statistics(for:)
40. Activity rings on iOS — doc: "In iOS. No additional work is necessary. Workout objects automatically contribute to both the Move and Exercise rings. The Exercise ring increases by the workout's total duration, and the Move ring increases by the number of calories in the associated active energy burned samples." DTS in practice: rings did not move until the workout had both `.activeEnergyBurned` and `.distanceWalkingRunning` samples ("The green ring not changing is probably because your workout doesn't have the .distanceWalkingRunning sample"); "HealthKit should generate the exercise minute sample for you with the workout duration." [official-doc][secondary] https://developer.apple.com/documentation/healthkit/hkworkout · https://developer.apple.com/forums/thread/771878
41. iOS 18 effort score: `HKQuantityTypeIdentifier.workoutEffortScore` and `.estimatedWorkoutEffortScore`, `HKUnit.appleEffortScore()`, `HKHealthStore.relateWorkoutEffortSample(_:with:activity:) async throws -> Bool`, `unrelateWorkoutEffortSample(_:from:activity:)`, `HKQuery.predicateForWorkoutEffortSamplesRelated(workout:activity:)` — all iOS 18.0+. DTS: the sample must be RELATED, not added through the builder ("Sample of type HKQuantityTypeIdentifierWorkoutEffortScore must be related to a workout"); "you need to have the authentication to read and share the sample types"; "The range of a workout score needs to be from 0 to 10." [official-doc][secondary] https://developer.apple.com/documentation/healthkit/hkhealthstore/relateworkouteffortsample(_:with:activity:completion:) · https://developer.apple.com/documentation/updates/healthkit · https://developer.apple.com/forums/thread/763539
42. iOS 27 beta (HealthKit updates, June 2026): workout zones — `HKWorkoutBuilder.setCustomZoneConfiguration(_:for:)` ("Call this method before calling beginCollection"), `HKWorkoutZoneConfiguration`, `HKWorkoutZoneGroup`. Beta only; not relevant to a phone-recorded GPS workout. [official-doc] https://developer.apple.com/documentation/updates/healthkit · https://developer.apple.com/documentation/healthkit/hkworkoutbuilder/setcustomzoneconfiguration(_:for:)
43. Metadata keys useful for GPS workouts: `HKMetadataKeyIndoorWorkout` (Bool), `HKMetadataKeyElevationAscended` / `ElevationDescended` (HKQuantity length, iOS 11.2), `HKMetadataKeyAverageSpeed` / `MaximumSpeed` (HKQuantity m/s, iOS 11.2; "average speed while moving"), `HKMetadataKeyAverageMETs` (iOS 13), `HKMetadataKeyWeatherTemperature`, `HKMetadataKeyWorkoutBrandName` (String), `HKMetadataKeyTimeZone` (String, NSTimeZone name). Metadata values may be `NSString`, `NSNumber`, `NSDate`, `HKQuantity`. [official-doc] https://developer.apple.com/documentation/healthkit/hkmetadatakeyindoorworkout · https://developer.apple.com/documentation/healthkit/hkmetadatakeyelevationascended · https://developer.apple.com/documentation/healthkit/hkmetadatakeyaveragespeed

### HKWorkoutSession on iPhone (scoped OUT)

44. Availability split (header + docs agree): `HKWorkoutSession` class, delegate, `prepare/startActivity/pause/resume/stopActivity/end` carry `API_AVAILABLE(ios(17.0))` but `init(healthStore:configuration:)` and `associatedWorkoutBuilder()` are `API_AVAILABLE(ios(26.0), watchos(5.0))`; `HKLiveWorkoutBuilder` and `HKLiveWorkoutDataSource` are iOS 26.0+ / watchOS 5.0+; `recoverActiveWorkoutSession` iOS 26.0+. On iOS 17–18 a session object can only arrive via `workoutSessionMirroringStartHandler` from a watch; `startMirroringToCompanionDevice` is `API_AVAILABLE(watchos(10.0)) API_UNAVAILABLE(ios)`. HealthKit updates page, June 2025: "Start workout sessions on iOS using HKLiveWorkoutBuilder." This contradicts older memory that sessions are watch-only: since iOS 26 they are not. [official-doc][source-code] https://developer.apple.com/documentation/healthkit/hkworkoutsession · https://developer.apple.com/documentation/healthkit/hkliveworkoutbuilder · https://developer.apple.com/documentation/healthkit/hkworkoutsession/startmirroringtocompaniondevice(completion:) · HKWorkoutSession.h · HKLiveWorkoutBuilder.h
45. Session constraints on iPhone: `HKErrorBackgroundWorkoutSessionNotAllowed` — "A workout session is not allowed to start or prepare when this app is in the background." (iOS 17+). HKWorkoutSession doc: "iPhone typically locks during workouts ... the system can prompt someone to provide your app access to workout data even when their device is locked ... Collecting heart rate data on iPhone or iPad requires pairing with an external heart rate sensor." WWDC25: "Unlike Apple Watch, your iPhone will most likely lock while a workout is running." [source-code][official-doc][secondary] HKDefines.h · https://developer.apple.com/documentation/healthkit/hkworkoutsession · https://nonstrict.eu/wwdcindex/wwdc2025/322/
46. Apple's own WWDC25 iPhone sample ("Building a workout app for iPhone and iPad", Xcode 26 / iOS 26 target) contains no `CLLocationManager`, no `HKWorkoutRouteBuilder`, no `seriesBuilder` — it does not write routes at all. Its `typesToShare` is only `[HKQuantityType.workoutType()]` (the `HKLiveWorkoutDataSource` generates energy/distance samples itself); flow is `HKWorkoutSession(healthStore:configuration:)` → `associatedWorkoutBuilder()` → `dataSource = HKLiveWorkoutDataSource(...)` → `session.prepare()` → `startActivity(with:)` + `beginCollection(at:)` → on `.stopped`: `endCollection(at:)` → `finishWorkout()` → `session.end()`. It ships `UIBackgroundModes = [processing]`, `NSSupportsLiveActivities`, entitlements `com.apple.developer.healthkit` + `com.apple.developer.siri`, and `INFOPLIST_KEY_NSHealthShareUsageDescription` / `NSHealthUpdateUsageDescription`. [source-code] https://developer.apple.com/documentation/healthkit/building-a-workout-app-for-iphone-and-ipad (zip 28a0ce913504/BuildingAWorkoutAppForIPhoneAndIPad.zip)
47. Known iOS 26 beta defect: with `HKLiveWorkoutBuilder` on iPhone, `HKWorkoutRouteBuilder.insertRouteData` "never returns" while a session is running on the iPhone 16 Pro simulator (Xcode 26 beta 2); works on a physical iPhone 13 Pro; FB18603581; no Apple reply. Not reported for plain `HKWorkoutBuilder`. [secondary] https://developer.apple.com/forums/thread/791715

### Locked device, review rules

48. "the device encrypts the HealthKit store when the user locks the device. As a result, your app may not be able to read data from the store when it runs in the background. However, your app can still write to the store, even when the phone is locked. HealthKit temporarily caches the data and saves it to the encrypted store as soon as the user unlocks the phone." But see facts 5 and 16: `finishWorkout` returns nil and `finishRoute` can fail with `HKErrorDatabaseInaccessible` ("Protected health data is inaccessible because the device is locked") while locked. [official-doc][source-code] https://developer.apple.com/documentation/healthkit/protecting-user-privacy · HKDefines.h
49. App Review Guideline 5.1.3(ii): "Apps must not write false or inaccurate data into HealthKit or any other medical research or health management apps, and may not store personal health information in iCloud." 5.1.3(i)/5.1.2(vi): no advertising / data-mining use of HealthKit data. 2.5.1: "HealthKit should be used for health and fitness purposes and integrate with the Health app." A privacy policy is mandatory for HealthKit apps. [official-doc] https://developer.apple.com/app-store/review/guidelines/ · https://developer.apple.com/documentation/healthkit/protecting-user-privacy

### Status quo in the RN ecosystem (motivation check)

50. `react-native-health`: npm latest 1.19.0 published 2024-10-15; GitHub 157 open issues, last push 2026-04-27. `saveWorkout` calls the deprecated `HKWorkout workoutWithActivityType:startDate:endDate:workoutEvents:totalEnergyBurned:totalDistance:metadata:`; the repo contains no `HKWorkoutRouteBuilder` (routes are read-only via `workout_getRoute`). [source-code][secondary] https://raw.githubusercontent.com/agencyenterprise/react-native-health/master/RCTAppleHealthKit/RCTAppleHealthKit+Methods_Workout.m · https://registry.npmjs.org/react-native-health
51. `@kingstinct/react-native-healthkit`: npm 14.0.2 published 2026-08-19; 28 open issues, pushed 2026-07-27. `saveWorkoutSample` uses the deprecated `HKWorkout(activityType:start:end:workoutEvents:totalEnergyBurned:totalDistance:...)` initialisers + `store.save`; `saveWorkoutRoute` uses the discouraged direct `HKWorkoutRouteBuilder(healthStore:device:nil)`, one `insertRouteData` call for all points, `finishRoute(with:metadata:nil)`; no sync identifier / upsert, no accuracy filtering, no timestamp clamping. [source-code][secondary] https://raw.githubusercontent.com/kingstinct/react-native-healthkit/master/packages/react-native-healthkit/ios/WorkoutProxy.swift · https://raw.githubusercontent.com/kingstinct/react-native-healthkit/master/packages/react-native-healthkit/ios/WorkoutsModule.swift

---

## 2. API sketch

Native identifiers only; the JS shape is suggested in §3. Minimum deployment for everything below except effort score is iOS 12 (HKWorkoutBuilder); Expo SDK 57 targets well above that.

```swift
import HealthKit
import CoreLocation

struct RoutePoint { var lat: Double; var lng: Double; var alt: Double?; var t: Date
                    var hAcc: Double?; var vAcc: Double?; var speed: Double?; var course: Double? }
struct PauseInterval { var start: Date; var end: Date }

enum SaveResult { case saved(workoutUUID: UUID, routeUUID: UUID?); case savedWhileLocked }

final class HealthKitWorkoutWriter {
    private let store = HKHealthStore()

    // 1. Permissions — every type you will write must be in `toShare`.
    func requestWriteAuthorization(withEffort: Bool) async throws {
        var share: Set<HKSampleType> = [
            HKObjectType.workoutType(),
            HKSeriesType.workoutRoute(),
            HKQuantityType(.distanceWalkingRunning),   // use .distanceCycling for cycling
            HKQuantityType(.activeEnergyBurned),
        ]
        if #available(iOS 18, *), withEffort { share.insert(HKQuantityType(.workoutEffortScore)) }
        // reading workouts+routes back needs read permission for the same two types
        try await store.requestAuthorization(toShare: share,
                                             read: [HKObjectType.workoutType(), HKSeriesType.workoutRoute()])
    }

    // 2. Save a finished, self-recorded workout with its route.
    func save(activity: HKWorkoutActivityType, start: Date, end: Date,
              distanceMeters: Double?, activeKcal: Double?, pauses: [PauseInterval],
              points: [RoutePoint], clientId: String, version: Int,
              elevationAscendedMeters: Double?) async throws -> SaveResult {

        // Validate BEFORE touching HealthKit: HKQuantitySample throws NSException on bad input.
        guard start < end, end <= Date(), start >= store.earliestPermittedSampleDate() else {
            throw WriterError.invalidTimeRange
        }

        let config = HKWorkoutConfiguration()
        config.activityType = activity          // .running / .walking / .hiking / .cycling
        config.locationType = .outdoor

        let builder = HKWorkoutBuilder(healthStore: store, configuration: config, device: .local())
        try await builder.beginCollection(at: start)

        var samples: [HKSample] = []
        if let d = distanceMeters, d > 0 {
            let type: HKQuantityType = activity == .cycling ? HKQuantityType(.distanceCycling)
                                                            : HKQuantityType(.distanceWalkingRunning)
            samples.append(HKQuantitySample(type: type,
                quantity: HKQuantity(unit: .meter(), doubleValue: d),
                start: start, end: end, device: .local(), metadata: nil))
        }
        if let k = activeKcal, k > 0 {
            samples.append(HKQuantitySample(type: HKQuantityType(.activeEnergyBurned),
                quantity: HKQuantity(unit: .kilocalorie(), doubleValue: k),
                start: start, end: end, device: .local(), metadata: nil))
        }
        do {
            if !samples.isEmpty { try await builder.addSamples(samples) }   // persisted immediately

            let events = pauses.flatMap { p in [
                HKWorkoutEvent(type: .pause,  dateInterval: DateInterval(start: p.start, duration: 0), metadata: nil),
                HKWorkoutEvent(type: .resume, dateInterval: DateInterval(start: p.end,   duration: 0), metadata: nil),
            ]}
            if !events.isEmpty { try await builder.addWorkoutEvents(events) }

            var meta: [String: Any] = [
                HKMetadataKeySyncIdentifier: clientId,          // upsert key
                HKMetadataKeySyncVersion: version,              // must accompany the identifier
                HKMetadataKeyExternalUUID: clientId,            // informational only
                HKMetadataKeyIndoorWorkout: false,
            ]
            if let e = elevationAscendedMeters {
                meta[HKMetadataKeyElevationAscended] = HKQuantity(unit: .meter(), doubleValue: e)
            }
            try await builder.addMetadata(meta)
            try await builder.endCollection(at: end)
        } catch {
            builder.discardWorkout()
            try? await store.delete(samples)     // discard does NOT delete already-added samples
            throw error
        }

        guard let workout = try await builder.finishWorkout() else {
            return .savedWhileLocked             // nil workout + nil error == device locked
        }

        // 3. Route — separate builder, attached AFTER the workout exists.
        let locations = points
            .filter { p in
                let acc = p.hAcc ?? -1
                return acc >= 0 && acc <= 50 && p.t >= start && p.t <= end
            }
            .sorted { $0.t < $1.t }
            .map { p in CLLocation(coordinate: .init(latitude: p.lat, longitude: p.lng),
                                   altitude: p.alt ?? 0,
                                   horizontalAccuracy: p.hAcc ?? -1,
                                   verticalAccuracy: p.alt == nil ? -1 : (p.vAcc ?? -1),
                                   course: p.course ?? -1, speed: p.speed ?? -1, timestamp: p.t) }
        guard !locations.isEmpty else { return .saved(workoutUUID: workout.uuid, routeUUID: nil) }

        let routeBuilder = HKWorkoutRouteBuilder(healthStore: store, device: nil) // nil per Apple doc for CoreLocation data
        for chunk in stride(from: 0, to: locations.count, by: 1_000)
            .map({ Array(locations[$0 ..< min($0 + 1_000, locations.count)]) }) {
            try await routeBuilder.insertRouteData(chunk)          // any error is fatal for this builder
        }
        let route = try await routeBuilder.finishRoute(with: workout, metadata: [
            HKMetadataKeySyncIdentifier: clientId + "#route",
            HKMetadataKeySyncVersion: version,
        ])
        return .saved(workoutUUID: workout.uuid, routeUUID: route.uuid)
    }

    // 4. Optional iOS 18+ perceived effort (1–10). Must be related, never added via the builder.
    @available(iOS 18, *)
    func relateEffort(_ score: Double, to workout: HKWorkout) async throws {
        let sample = HKQuantitySample(type: HKQuantityType(.workoutEffortScore),
                                      quantity: HKQuantity(unit: .appleEffortScore(), doubleValue: score),
                                      start: workout.startDate, end: workout.endDate)
        _ = try await store.relateWorkoutEffortSample(sample, with: workout, activity: nil)
    }

    // 5. Delete only what we wrote; cascade to associated objects is undocumented, so do it explicitly.
    func delete(workoutUUID: UUID) async throws {
        let descriptor = HKSampleQueryDescriptor(
            predicates: [.workout(HKQuery.predicateForObject(with: workoutUUID))],
            sortDescriptors: [], limit: 1)
        guard let workout = try await descriptor.result(for: store).first else { throw WriterError.notFound }
        let assoc = HKQuery.predicateForObjects(from: workout)
        for type in [HKSeriesType.workoutRoute(), HKQuantityType(.distanceWalkingRunning),
                     HKQuantityType(.distanceCycling), HKQuantityType(.activeEnergyBurned)] as [HKSampleType] {
            _ = try await store.deleteObjects(of: type, predicate: assoc)   // only our own objects match
        }
        try await store.delete(workout)
    }
}
```

Alternative route path (Apple article): `let rb = builder.seriesBuilder(for: HKSeriesType.workoutRoute()) as! HKWorkoutRouteBuilder` before `finishWorkout()`, `insertRouteData` during/after, then either rely on `finishWorkout()` (header) or call `finishRoute(with: workout, metadata:)` (article). Pick after the device test in §5.

CLLocation note: `CLLocation(coordinate:altitude:horizontalAccuracy:verticalAccuracy:course:courseAccuracy:speed:speedAccuracy:timestamp:)` (iOS 13.4+) carries `speedAccuracy`/`courseAccuracy`, which HealthKit persists (fact 19). Negative accuracy values mean "invalid" in CoreLocation; keep that convention when a field is absent.

---

## 3. Design implications for a minimal-options unified API

What to EXPOSE (one call, few fields):
- `saveWorkout({ id, activity: 'running'|'walking'|'hiking'|'cycling', start, end, distanceMeters?, activeKcal?, pauses?: [{start,end}], route?: [{lat, lng, alt?, t, accuracy?, speed?, course?}], elevationGainMeters?, effort?: 1..10, version? }) → { id (HealthKit UUID), routeSaved: boolean, pending: boolean }` — `pending: true` maps to `finishWorkout()` returning nil (device locked); the route was NOT attached in that case and the caller must retry attachment later (see pitfall 3).
- `deleteWorkout(id)` — only succeeds for our own objects; implement the explicit associated-object cleanup from §2.
- `requestAuthorization({ write: true })` that internally requests the fixed set `workoutType, workoutRoute, distanceWalkingRunning (+distanceCycling when cycling is enabled), activeEnergyBurned (+workoutEffortScore on iOS 18+ when `effort` is part of the API)`. Do not let callers pass arbitrary HK type strings.
- A typed error enum mirroring `HKError.Code` subsets that matter to a writer: `notAvailable`, `notDetermined`, `denied`, `invalidArgument`, `databaseLocked`, `dataTooLarge`, plus library-level `invalidRoute`, `invalidTimeRange`.

What to HIDE (fixed policy, no options):
- `HKWorkoutConfiguration` (always `locationType = .outdoor` for GPS activities; `HKMetadataKeyIndoorWorkout = false`), `HKDevice` (`.local()` on the workout, `nil` on the route per Apple doc), units (metres, kcal, bpm, count, m/s), metadata keys, builder lifecycle ordering, chunking of `insertRouteData`, `HKWorkoutActivity` (let HealthKit auto-assign), zones, mirroring, `HKWorkoutSession`.
- The deprecated `HKWorkout(activityType:...)` initialisers and `HKHealthStore.add(_:to:)` — never use them (deprecated iOS 17, fact 38). This is the concrete thing both incumbent RN libraries still do (facts 50–51).

What to NORMALISE:
- Identity: `id` from the caller becomes `HKMetadataKeySyncIdentifier` (+ `SyncVersion`, default 1); re-saving the same `id` with a higher `version` is the documented replace mechanism (fact 30). Also stamp `HKMetadataKeyExternalUUID` for readers that key on it, but never rely on it for uniqueness (fact 32). Return the HealthKit `uuid` so `delete` can use `predicateForObject(with:)`.
- Route points: drop `accuracy < 0` or `> 50 m`, drop points outside `[start, end]`, sort by time, de-duplicate identical timestamps. Apply these even though HealthKit sorts itself — Fitness silently hides routes whose timestamps disagree with the workout window (fact 21). Make 50 m the non-configurable default; a stricter optional `maxAccuracyMeters` is the only knob worth considering.
- Time: reject `end > now`, `start >= end`, `start < earliestPermittedSampleDate()`; reject samples ≥ 24 h (fact 36).
- Samples: one `distance` and one `activeEnergyBurned` sample spanning the workout is enough for Health/Fitness and rings (fact 40). Sub-interval splits (per km, per 5 min) are an optional future add, not v1. Heart rate and steps are not available from a phone-only GPS recording and should not be part of the write surface; if the app ever has a BLE strap, that is a separate feature.
- Pauses: accept `[{start,end}]` and emit `.pause`/`.resume` `HKWorkoutEvent`s; `duration` then reflects active time only (fact 11).
- Atomicity: the builder is not transactional — `addSamples` persists immediately and `discardWorkout()` keeps them (fact 6). The module must delete already-saved samples on any failure before `finishWorkout`.

Platform gating:
- `HKWorkoutBuilder` iOS 12+, route builder iOS 11+, effort iOS 18+ (`#available`), `HKSampleQueryDescriptor` iOS 15.4+; nothing here needs iOS 26, and `HKWorkoutSession` on iPhone (iOS 26+) is explicitly out of scope for a "save a finished workout" library — it changes the app's lifecycle (session mode, foreground-only start, Live Activity, `UIBackgroundModes processing`, crash recovery via scene delegate) and Apple's own iPhone sample does not even write routes with it (facts 44–47).
- Expo: ship a config plugin that sets `com.apple.developer.healthkit = true`, `NSHealthShareUsageDescription`, `NSHealthUpdateUsageDescription`, and (optionally) removes `healthkit` from `UIRequiredDeviceCapabilities` (facts 27–28).

---

## 4. Pitfalls / gotchas

1. Missing share permission for `workoutType()` or `workoutRoute()` does not give `errorAuthorizationNotDetermined` on route insert; it gives an XPC interruption error. Request both up front and check `authorizationStatus(for: .workoutType())` before starting a builder (facts 24–26).
2. Missing `NSHealthShareUsageDescription`/`NSHealthUpdateUsageDescription` crashes at `requestAuthorization` (fact 27). In Expo this must come from app.json/config plugin (fact 28).
3. Device locked at finish time: `finishWorkout()` returns `nil/nil` (workout saved but unavailable) and `finishRoute` can fail with `errorDatabaseInaccessible` — the route is then lost unless you kept the points and retry after unlock (facts 5, 16, 48). The JS contract must surface `pending` and support a later `attachRoute(id, points)` or a full re-save with `version + 1`.
4. `insertRouteData` errors are fatal for that builder ("the series builder will be complete"); you need a fresh builder to retry (fact 15). Letting a route builder deallocate before `finishRoute` loses the route silently (fact 16).
5. `discardWorkout()` and thrown errors leave the quantity samples you already added in the store (fact 6) — orphan distance/energy samples pollute Health and may double-count.
6. `HKQuantitySample` init with a wrong unit or `start > end` raises an NSException → native crash, not a JS rejection (fact 37). Validate in Swift first.
7. Route not visible in Fitness: timestamps outside the workout window, no `.outdoor`/`IndoorWorkout=false`, or an activity type Fitness doesn't map (DTS statement + user reports; facts 21–22). Route does exist in Health → Browse → Workouts → Routes regardless.
8. Ordering: the workout must be saved before `finishRoute(with:)`; routes can't be re-parented (facts 16, 23). Readers have to use an anchored query because the route appears after the workout (fact 31) — tell consumers of the read side.
9. Sync identifier ≠ external UUID: only `HKMetadataKeySyncIdentifier` + `SyncVersion` replaces; `ExternalUUID` duplicates freely (facts 30, 32). A re-save with the same version is ignored (must be greater).
10. Deleting a workout is only possible for objects your app saved and after share permission is still granted; cascade to samples/route is undocumented (fact 34). If the user revokes write permission, your own earlier data becomes undeletable by the app.
11. `earliestPermittedSampleDate()` and ≥24 h samples cause `errorInvalidArgument` (facts 35–36) — historical imports need that check.
12. Deprecated initialisers compile without warnings in Objective-C bridges (what react-native-health uses) but are deprecated since iOS 17 (fact 38); `totalDistance` is on the deprecation path (iOS 27 beta) so the read side must use `statistics(for:)` (fact 39).
13. Effort score must be related with `relateWorkoutEffortSample`, not added via `addSamples`, and needs its own share+read permission; out-of-range values are rejected (fact 41).
14. App Review: "must not write false or inaccurate data into HealthKit" (fact 49) — do not fabricate kcal when the app has no model for it; leave `activeKcal` nil rather than guessing. Declare HealthKit use in the app description (2.5.1).
15. `healthkit` in `UIRequiredDeviceCapabilities` blocks install on devices without HealthKit (iPads on iPadOS ≤16, etc.); remove it if the feature is optional (fact 27).
16. iOS 26 beta: route insert hang with `HKLiveWorkoutBuilder` on simulator (fact 47) — another reason to stay on plain `HKWorkoutBuilder`.

---

## 5. Open questions

Needs a USER decision
- Which activities to support in v1: running/walking/hiking only, or also cycling (changes the distance type to `distanceCycling`)?
- Upsert policy: expose `version` (replace via sync identifier) or keep `saveWorkout` idempotent on `id` and offer only `deleteWorkout` + re-save?
- Whether to write `activeEnergyBurned` at all (requires the app to compute kcal honestly; rings depend on it — facts 40, 49).
- Expose `effort` (iOS 18+) in v1 or defer.
- Route accuracy threshold: fixed 50 m (Apple) vs stricter default (WWDC demo used 10 m).
- Whether the module should keep the route points itself to retry after a locked-device finish, or push that responsibility to the app.

Needs a hands-on device test (iPhone 17 sim + a physical iPhone; GPX playback in Xcode for the simulator)
- `seriesBuilder(for:)` path: does `finishWorkout()` auto-finish the route (header) or is `finishRoute(with:)` still required (article)? Does calling both error? (fact 17)
- Does deleting the `HKWorkout` remove its associated samples/route? (fact 34)
- Does re-saving with the same sync identifier and a higher version carry over / replace the associated samples and route, or orphan them? (fact 30)
- Behaviour when the device is locked at `finishWorkout`/`finishRoute`, and whether the workout can be re-fetched by sync identifier after unlock to attach the route (facts 5, 16, 48).
- Does HealthKit silently drop points with `horizontalAccuracy > 50` or negative accuracy, or store them verbatim? (fact 18)
- Practical limits: 10k–50k points in one `insertRouteData` vs 1 000-point chunks; does `errorDataSizeExceeded` ever fire? (fact 20)
- Whether a sample whose `start == workout start` is accepted by `addSamples` ("must be later than") (fact 4).
- Fitness app map rendering for a third-party `.hiking` workout written from iPhone (facts 21–22).
- HealthKit + route builder on the iOS 26 simulator with plain `HKWorkoutBuilder` (facts 46–47). [unverified] that route writing works on the simulator at all.

Needs more research
- Exact Expo config-plugin mechanics for the HealthKit entitlement/usage strings in SDK 56–57 (`withEntitlementsPlist`/`withInfoPlist`) — outside this dimension.
- Health Connect counterpart semantics (client record id/version ↔ sync identifier; ExerciseRoute write rules) to confirm the unified `id`/`version` contract — other dimension.
- Whether any documented cap exists for `HKWorkoutRoute` size on the read side (`HKWorkoutRouteQuery` batch semantics) — relevant to the read dimension.

---

## 6. Sources

Apple documentation (fetched as JSON from developer.apple.com/tutorials/data/documentation/… on 2026-08-22)
- https://developer.apple.com/documentation/healthkit/hkworkoutbuilder
- https://developer.apple.com/documentation/healthkit/hkworkoutbuilder/init(healthstore:configuration:device:)
- https://developer.apple.com/documentation/healthkit/hkworkoutbuilder/begincollection(withstart:completion:)
- https://developer.apple.com/documentation/healthkit/hkworkoutbuilder/add(_:completion:)
- https://developer.apple.com/documentation/healthkit/hkworkoutbuilder/addmetadata(_:completion:)
- https://developer.apple.com/documentation/healthkit/hkworkoutbuilder/addworkoutevents(_:completion:)
- https://developer.apple.com/documentation/healthkit/hkworkoutbuilder/addworkoutactivity(_:completion:)
- https://developer.apple.com/documentation/healthkit/hkworkoutbuilder/endcollection(withend:completion:)
- https://developer.apple.com/documentation/healthkit/hkworkoutbuilder/finishworkout(completion:)
- https://developer.apple.com/documentation/healthkit/hkworkoutbuilder/discardworkout()
- https://developer.apple.com/documentation/healthkit/hkworkoutbuilder/seriesbuilder(for:)
- https://developer.apple.com/documentation/healthkit/hkworkoutbuilder/setcustomzoneconfiguration(_:for:)
- https://developer.apple.com/documentation/healthkit/hkworkoutroutebuilder
- https://developer.apple.com/documentation/healthkit/hkworkoutroutebuilder/init(healthstore:device:)
- https://developer.apple.com/documentation/healthkit/hkworkoutroutebuilder/insertroutedata(_:completion:)
- https://developer.apple.com/documentation/healthkit/hkworkoutroutebuilder/finishroute(with:metadata:completion:)
- https://developer.apple.com/documentation/healthkit/hkworkoutroute
- https://developer.apple.com/documentation/healthkit/hkseriesbuilder
- https://developer.apple.com/documentation/healthkit/creating-a-workout-route
- https://developer.apple.com/documentation/healthkit/reading-route-data
- https://developer.apple.com/documentation/healthkit/hkworkoutconfiguration
- https://developer.apple.com/documentation/healthkit/hkworkoutsessionlocationtype
- https://developer.apple.com/documentation/healthkit/hkworkoutactivitytype
- https://developer.apple.com/documentation/healthkit/hkworkoutactivity
- https://developer.apple.com/documentation/healthkit/hkworkoutevent
- https://developer.apple.com/documentation/healthkit/hkworkouteventtype
- https://developer.apple.com/documentation/healthkit/hkworkout
- https://developer.apple.com/documentation/healthkit/hkworkout/init(activitytype:start:end:)
- https://developer.apple.com/documentation/healthkit/hkworkout/init(activitytype:start:end:workoutevents:totalenergyburned:totaldistance:metadata:)
- https://developer.apple.com/documentation/healthkit/hkworkout/totaldistance
- https://developer.apple.com/documentation/healthkit/hkworkout/statistics(for:)
- https://developer.apple.com/documentation/healthkit/hkhealthstore/add(_:to:completion:)
- https://developer.apple.com/documentation/healthkit/hkhealthstore/save(_:withcompletion:)-47iwb
- https://developer.apple.com/documentation/healthkit/hkhealthstore/delete(_:withcompletion:)-78l1m
- https://developer.apple.com/documentation/healthkit/hkhealthstore/delete(_:withcompletion:)-17hzm
- https://developer.apple.com/documentation/healthkit/hkhealthstore/deleteobjects(of:predicate:withcompletion:)
- https://developer.apple.com/documentation/healthkit/hkhealthstore/earliestpermittedsampledate()
- https://developer.apple.com/documentation/healthkit/hkhealthstore/requestauthorization(toshare:read:completion:)
- https://developer.apple.com/documentation/healthkit/hkhealthstore/authorizationstatus(for:)
- https://developer.apple.com/documentation/healthkit/hkhealthstore/ishealthdataavailable()
- https://developer.apple.com/documentation/healthkit/hkhealthstore/relateworkouteffortsample(_:with:activity:completion:)
- https://developer.apple.com/documentation/healthkit/hkhealthstore/unrelateworkouteffortsample(_:from:activity:completion:)
- https://developer.apple.com/documentation/healthkit/hkhealthstore/recoveractiveworkoutsession(completion:)
- https://developer.apple.com/documentation/healthkit/hkhealthstore/workoutsessionmirroringstarthandler
- https://developer.apple.com/documentation/healthkit/hkhealthstore/startwatchapp(with:completion:)
- https://developer.apple.com/documentation/healthkit/hkquantitytypeidentifier/workouteffortscore
- https://developer.apple.com/documentation/healthkit/hkquantitytypeidentifier/estimatedworkouteffortscore
- https://developer.apple.com/documentation/healthkit/hkunit/appleeffortscore()
- https://developer.apple.com/documentation/healthkit/hkquery/predicateforworkouteffortsamplesrelated(workout:activity:)
- https://developer.apple.com/documentation/healthkit/hkquantitysample/init(type:quantity:start:end:device:metadata:)
- https://developer.apple.com/documentation/healthkit/hkdevice/local()
- https://developer.apple.com/documentation/healthkit/hkmetadatakeysyncidentifier
- https://developer.apple.com/documentation/healthkit/hkmetadatakeysyncversion
- https://developer.apple.com/documentation/healthkit/hkmetadatakeyexternaluuid
- https://developer.apple.com/documentation/healthkit/hkmetadatakeyindoorworkout
- https://developer.apple.com/documentation/healthkit/hkmetadatakeyelevationascended
- https://developer.apple.com/documentation/healthkit/hkmetadatakeyaveragespeed
- https://developer.apple.com/documentation/healthkit/hkmetadatakeyaveragemets
- https://developer.apple.com/documentation/healthkit/hkmetadatakeyworkoutbrandname
- https://developer.apple.com/documentation/healthkit/hkmetadatakeytimezone
- https://developer.apple.com/documentation/healthkit/hkworkoutsession
- https://developer.apple.com/documentation/healthkit/hkworkoutsession/init(healthstore:configuration:)
- https://developer.apple.com/documentation/healthkit/hkworkoutsession/associatedworkoutbuilder()
- https://developer.apple.com/documentation/healthkit/hkworkoutsession/startmirroringtocompaniondevice(completion:)
- https://developer.apple.com/documentation/healthkit/hkliveworkoutbuilder
- https://developer.apple.com/documentation/healthkit/hkliveworkoutdatasource
- https://developer.apple.com/documentation/healthkit/running-workout-sessions
- https://developer.apple.com/documentation/healthkit/building-a-workout-app-for-iphone-and-ipad (sample zip: https://docs-assets.developer.apple.com/published/28a0ce913504/BuildingAWorkoutAppForIPhoneAndIPad.zip)
- https://developer.apple.com/documentation/healthkit/saving-data-to-healthkit
- https://developer.apple.com/documentation/healthkit/adding-samples-to-a-workout
- https://developer.apple.com/documentation/healthkit/authorizing-access-to-health-data
- https://developer.apple.com/documentation/healthkit/setting-up-healthkit
- https://developer.apple.com/documentation/healthkit/protecting-user-privacy
- https://developer.apple.com/documentation/healthkit/hkerror/code
- https://developer.apple.com/documentation/updates/healthkit
- https://developer.apple.com/documentation/bundleresources/information-property-list/nshealthupdateusagedescription
- https://developer.apple.com/documentation/bundleresources/information-property-list/nshealthshareusagedescription
- https://developer.apple.com/documentation/bundleresources/entitlements/com.apple.developer.healthkit
- https://developer.apple.com/documentation/bundleresources/entitlements/com.apple.developer.healthkit.access
- https://developer.apple.com/app-store/review/guidelines/ (5.1.3, 5.1.2(vi), 2.5.1)
- https://docs.expo.dev/versions/latest/config/app/

SDK headers (iPhoneOS26.5.sdk, mirrored)
- https://raw.githubusercontent.com/xybp888/iOS-SDKs/master/iPhoneOS26.5.sdk/System/Library/Frameworks/HealthKit.framework/Headers/HKWorkoutBuilder.h
- …/HKWorkoutRouteBuilder.h · …/HKHealthStore.h · …/HKMetadata.h · …/HKWorkoutSession.h · …/HKLiveWorkoutBuilder.h · …/HKWorkout.h · …/HKDefines.h

Apple forums (DTS answers where noted) and transcripts
- https://developer.apple.com/forums/thread/773069 (DTS: route timestamps vs workout window; rings)
- https://developer.apple.com/forums/thread/771878 (DTS: rings need activeEnergyBurned + distanceWalkingRunning; HKWorkoutBuilder example)
- https://developer.apple.com/forums/thread/773408 (DTS: single-location route for indoor)
- https://developer.apple.com/forums/thread/763539 (DTS: effort score must be related; auth; range)
- https://developer.apple.com/forums/thread/83855 · https://developer.apple.com/forums/thread/82657 (route builder permission/XPC errors)
- https://developer.apple.com/forums/thread/791715 (iOS 26 beta route insert hang with HKLiveWorkoutBuilder, FB18603581)
- https://developer.apple.com/forums/thread/658843 (sync identifier metadata on live builder)
- https://asciiwwdc.com/2017/sessions/221 (WWDC17 What's New in Health)
- https://asciiwwdc.com/2018/sessions/707 (WWDC18 New Ways to Work with Workouts)
- https://developer.apple.com/videos/play/wwdc2025/322/ · https://nonstrict.eu/wwdcindex/wwdc2025/322/ (WWDC25 Track workouts with HealthKit on iOS and iPadOS)

Ecosystem status quo
- https://registry.npmjs.org/react-native-health · https://api.github.com/repos/agencyenterprise/react-native-health · https://raw.githubusercontent.com/agencyenterprise/react-native-health/master/RCTAppleHealthKit/RCTAppleHealthKit+Methods_Workout.m
- https://registry.npmjs.org/@kingstinct/react-native-healthkit · https://api.github.com/repos/kingstinct/react-native-healthkit · https://raw.githubusercontent.com/kingstinct/react-native-healthkit/master/packages/react-native-healthkit/ios/WorkoutProxy.swift · …/WorkoutsModule.swift
