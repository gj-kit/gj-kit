# iOS HealthKit — reading workouts and workout routes (research, 2026-08-22)

Scope: what an Expo native module (Swift) must do to read existing workouts + GPS routes + heart-rate summaries from HealthKit, sync incrementally, identify the writer, and stay inside Apple's authorization/App Review rules. Verified against live Apple doc JSON (`developer.apple.com/tutorials/data/documentation/...json`), the **iOS 26.5 SDK headers installed on this machine** (Xcode 26.6, `iPhoneOS26.5.sdk`), the installed simulator runtimes (iOS 18.1, iOS 26.5), Apple forum threads, and the kingstinct RN library docs for comparison. Web docs currently reflect the **iOS 27 beta SDK** (WWDC June 2026); where web docs and the installed 26.5 SDK disagree I say so.

Confidence tags: [official-doc] Apple doc page · [source-code] SDK header / repo source / local machine check · [secondary] blog/forum/third-party · [unverified] my memory or inference, not confirmed.

---

## 1. Facts

### Modern Swift-concurrency query API
1. `HKSampleQueryDescriptor<Sample: HKSample>`, `HKAnchoredObjectQueryDescriptor<Sample>`, `HKWorkoutRouteQueryDescriptor`, `HKStatisticsQueryDescriptor`, and `HKSamplePredicate<Sample>` are all **iOS 15.4+ / iPadOS 15.4+ / watchOS 8.5+ / macOS 13+**. [official-doc] https://developer.apple.com/documentation/healthkit/hksamplequerydescriptor , .../hkanchoredobjectquerydescriptor , .../hkworkoutroutequerydescriptor , .../hkstatisticsquerydescriptor , .../hksamplepredicate
2. `HKSampleQueryDescriptor(predicates: [HKSamplePredicate<Sample>], sortDescriptors: [SortDescriptor<Sample>], limit: Int?)` → `try await descriptor.result(for: store) -> [Sample]`. It wraps an `HKSampleQuery` internally. [official-doc] https://developer.apple.com/documentation/healthkit/hksamplequerydescriptor
3. `HKAnchoredObjectQueryDescriptor(predicates:anchor:limit:)`; one-shot `result(for:)` returns `Result { addedSamples: [Sample], deletedObjects: [HKDeletedObject], newAnchor: HKQueryAnchor }`; long-running `results(for:)` returns an `AsyncSequence` whose first element is the current delta and later elements are live changes. `anchor == nil` reads everything. Apple's documented batch loop: start with nil anchor, `limit: 100`, loop until no added/deleted. Tip in the doc: "Because HKQueryAnchor instances adopt the NSSecureCoding protocol, you can save the most recent anchor and use it the next time your app launches." [official-doc] https://developer.apple.com/documentation/healthkit/hkanchoredobjectquerydescriptor
4. `HKWorkoutRouteQueryDescriptor(_ route: HKWorkoutRoute).results(for: store)` returns a **finite** `AsyncSequence` of individual `CLLocation` values that terminates after the last location. It has **no dateInterval filter**; the closure-based `HKWorkoutRouteQuery(route:dateInterval:dataHandler:)` (iOS 16+) does. [official-doc] https://developer.apple.com/documentation/healthkit/hkworkoutroutequerydescriptor , https://developer.apple.com/documentation/healthkit/hkworkoutroutequery/init(route:dateinterval:datahandler:)
5. `HKStatisticsQueryDescriptor(predicate: HKSamplePredicate<HKQuantitySample>, options: HKStatisticsOptions).result(for:) -> HKStatistics?`. Options: `.discreteAverage`, `.discreteMin`, `.discreteMax`, `.cumulativeSum`, `.mostRecent`, `.duration`, `.separateBySource`; discrete and cumulative options cannot be combined; accessor must match option (`averageQuantity()`, `minimumQuantity()`, `maximumQuantity()`, `sumQuantity()`, `mostRecentQuantity()`, `duration()`). [official-doc] https://developer.apple.com/documentation/healthkit/hkstatisticsoptions , https://developer.apple.com/documentation/healthkit/hkstatistics
6. `HKSamplePredicate` constructors relevant here: `.workout(_ predicate: NSPredicate?)`, `.workoutRoute(_:)`, `.quantitySample(type:predicate:)`, `.sample(type:predicate:)`. [official-doc] https://developer.apple.com/documentation/healthkit/hksamplepredicate
7. Predicates: `HKQuery.predicateForWorkouts(with: HKWorkoutActivityType)`; `predicateForWorkouts(activityPredicate:)` (iOS 16, matches multisport sub-activities via `predicateForWorkoutActivities(workoutActivityType:)`); `predicateForSamples(withStart:end:options:)` (`.strictStartDate`/`.strictEndDate`); `predicateForObjects(from: HKWorkout)` = "objects that have been **associated** with the workout"; `predicateForObjects(from: HKSource)` / `from: Set<HKSource>` / `from: Set<HKSourceRevision>` / `from: Set<HKDevice>`; `predicateForObject(with: UUID)`; `predicateForObjects(withMetadataKey:allowedValues:)`. Predicates compile to SQL, so only HealthKit key paths are allowed. [official-doc] https://developer.apple.com/documentation/healthkit/hkquery

### HKWorkout model
8. `HKWorkout` (iOS 8) fields: `duration: TimeInterval`, `workoutActivityType`, `workoutActivities: [HKWorkoutActivity]` (iOS 16), `workoutEvents: [HKWorkoutEvent]?`, `statistics(for: HKQuantityType) -> HKStatistics?` and `allStatistics: [HKQuantityType: HKStatistics]` (both iOS 16; computed from samples **associated** with the workout, `nil` if none), plus inherited `uuid`, `startDate`, `endDate`, `metadata`, `sourceRevision`, `device`. [official-doc] https://developer.apple.com/documentation/healthkit/hkworkout , .../hkworkout/statistics(for:) , .../hkworkout/allstatistics
9. `duration` is the **active** duration as defined at creation (either end−start, an explicit value, or start/end minus pause/resume events). It is therefore not guaranteed to equal `endDate − startDate`. [official-doc] https://developer.apple.com/documentation/healthkit/hkworkout/duration
10. Deprecations (installed SDK 26.5 header `HKWorkout.h`): `totalEnergyBurned` deprecated `ios(8.0, 18.0)`, `totalSwimmingStrokeCount` `ios(10.0, 18.0)`, `totalFlightsClimbed` `ios(11.0, 18.0)`, all with message "Use statisticsForType:"; `totalDistance` is `API_TO_BE_DEPRECATED` in SDK 26.5 but the live web doc (iOS 27 beta) shows **deprecated 27.0** ("Use allStatistics or statistics(for:)"). All `HKWorkout.init(...)` initializers deprecated `ios(8.0/9.0, 17.0)` → "Use HKWorkoutBuilder". Also deprecated: `HKPredicateKeyPathWorkoutTotalDistance/TotalEnergyBurned`, `predicateForWorkouts(with:totalDistance:)` etc. [source-code] `$(xcrun --sdk iphoneos --show-sdk-path)/System/Library/Frameworks/HealthKit.framework/Headers/HKWorkout.h`; [official-doc] https://developer.apple.com/documentation/healthkit/hkworkout/totaldistance
11. `HKWorkoutActivity` (iOS 16): `uuid`, `startDate`, `endDate`, `duration`, `metadata`, `workoutConfiguration` (`activityType`, `locationType: HKWorkoutSessionLocationType` (.unknown/.indoor/.outdoor), `swimmingLocationType`, `lapLength`), `workoutEvents`, `allStatistics`, `statistics(for:)`. "All HKWorkout instances have at least one associated HKWorkoutActivity. If you don't explicitly set workout activities, HealthKit assigns a workout activity that matches the HKWorkout object's activity type." [official-doc] https://developer.apple.com/documentation/healthkit/hkworkoutactivity
12. `HKWorkoutActivityType`: 84 documented cases = 81 live + 3 deprecated (`.dance`, `.danceInspiredTraining`, `.mixedMetabolicCardioTraining`, deprecated iOS 14 per header). Multisport: `.swimBikeRun = 82` and `.transition` (iOS 16). Newest: `.underwaterDiving` (iOS 17). `.other = 3000`. **No new activity types in iOS 26** (no `ios(26` annotation in `HKWorkoutActivityType` enum in SDK 26.5). Running/hiking/walking are iOS 8 cases: `.running` (=37), `.hiking` (=24), `.walking` (=52) [raw values unverified except .swimBikeRun/.other which are in the header]. [official-doc] https://developer.apple.com/documentation/healthkit/hkworkoutactivitytype ; [source-code] `HKWorkout.h`
13. `HKWorkoutEvent`: `type: HKWorkoutEventType`, `dateInterval: DateInterval`, `metadata`; `date` is deprecated. Types and versions: `.pause`/`.resume` (iOS 8), `.lap`/`.marker`/`.motionPaused`/`.motionResumed` (iOS 10), `.segment`/`.pauseOrResumeRequest` (iOS 11). Semantics: pause/resume toggle active state (redundant ones ignored); lap = equal-distance partitions, may not overlap; segment = period of interest, may overlap; marker = instant. **Lap events created before iOS 11/watchOS 4 have zero-duration intervals marking the END of the lap** (laps assumed contiguous); newer ones carry start+duration. `.motionPaused/.motionResumed` are Apple Watch auto-pause. `.pauseOrResumeRequest` is a user hardware-button request (not a state change). [official-doc] https://developer.apple.com/documentation/healthkit/hkworkoutevent , https://developer.apple.com/documentation/healthkit/hkworkouteventtype/lap , .../motionpaused , .../segment , .../pauseorresumerequest
14. Workout metadata keys (all `String` constants; values in `metadata: [String: Any]?`):
   - `HKMetadataKeyIndoorWorkout` (iOS 8, Bool)
   - `HKMetadataKeyTimeZone` (iOS 8, String accepted by `TimeZone(identifier:)`)
   - `HKMetadataKeyExternalUUID` (iOS 8, String; caller-chosen id, independent of HK `uuid`)
   - `HKMetadataKeySyncIdentifier` + `HKMetadataKeySyncVersion` (iOS 11; String + NSNumber; must be set together; saving an object with the same sync id and **greater** version **replaces** the old object, including inside its workout association)
   - `HKMetadataKeyElevationAscended` / `HKMetadataKeyElevationDescended` (iOS 11.2, `HKQuantity` with length unit)
   - `HKMetadataKeyAverageSpeed` / `HKMetadataKeyMaximumSpeed` (iOS 11.2, `HKQuantity` length/time, e.g. m/s; "average speed **while moving**", so not distance/duration)
   - Newer workout-adjacent keys in SDK 26.5 header: `HKMetadataKeyAppleFitnessPlusSession` (17.0), `HKMetadataKeyAppleFitnessPlusCatalogIdentifier` (18.2), `HKMetadataKeyActivityType`, `HKMetadataKeyPhysicalEffortEstimationType` (17.0). No workout metadata keys were added in iOS 26.
   [official-doc] https://developer.apple.com/documentation/healthkit/hkmetadatakeysyncidentifier , .../hkmetadatakeyaveragespeed , .../hkmetadatakeyelevationascended , .../hkmetadatakeyindoorworkout , .../hkmetadatakeytimezone , .../hkmetadatakeyexternaluuid ; [source-code] `HKMetadata.h`
15. Zones (iOS **27 beta**, WWDC June 2026): `HKWorkout.zoneGroupsByType: [HKQuantityType: HKWorkoutZoneGroup]?`, `zoneGroup(for:)`, same on `HKWorkoutActivity`; `HKWorkoutZoneGroup { configuration: HKWorkoutZoneConfiguration, zoneDurations }`; `HKHealthStore.preferredWorkoutZoneConfiguration(for:)`. Not in the installed SDK 26.5. [official-doc] https://developer.apple.com/documentation/healthkit/hkworkoutzonegroup , https://developer.apple.com/documentation/updates/healthkit

### Routes
16. `HKWorkoutRoute` (iOS 11) is an `HKSeriesSample` (has `count: Int` = number of locations) of type `HKSeriesType.workoutRoute()`. Routes are built with `HKWorkoutRouteBuilder` and linked to a workout via `finishRoute(with:metadata:)`. [official-doc] https://developer.apple.com/documentation/healthkit/hkworkoutroute , https://developer.apple.com/documentation/healthkit/hkseriessample/count , https://developer.apple.com/documentation/healthkit/hkseriestype/workoutroute()
17. Apple's "Reading route data": routes **aren't static** — an app must save the workout first, so there is a window where the workout exists without a route; apps (incl. Apple's own Watch→iPhone smoothing) later **replace** the route using a sync identifier. Therefore "use an anchored object query to both get the current route, and to track any additions or updates" with `HKQuery.predicateForObjects(from: workout)` on type `HKSeriesType.workoutRoute()`. [official-doc] https://developer.apple.com/documentation/healthkit/reading-route-data
18. Same page, verbatim list of what a route preserves: "HKWorkoutRoute saves a subset of CLLocation properties including: timestamp, coordinate, altitude, speed, course, horizontalAccuracy, verticalAccuracy, speedAccuracy, courseAccuracy", and "Locations from the HealthKit store are accurate within 50 meters, but they may need additional smoothing". Not preserved (by omission): `floor`, `ellipsoidalAltitude`, `sourceInformation`. [official-doc] same URL
19. Location batches: `HKWorkoutRouteQuery(route:dataHandler:)` calls the handler one or more times with `[CLLocation]` and `done: Bool`; `store.stop(query)` cancels. The descriptor flattens this into single locations. [official-doc] https://developer.apple.com/documentation/healthkit/hkworkoutroutequery
20. Writing routes ("Creating a workout route"): `workoutBuilder.seriesBuilder(for: HKSeriesType.workoutRoute()) as? HKWorkoutRouteBuilder`; `insertRouteData([CLLocation]) async throws` (any order; builder sorts by date when finalizing); `finishRoute(with: workout, metadata:)` after the workout is saved. Apple: "Don't add any locations whose accuracy is greater than 50 meters. For best results, try to keep the time between locations to 3 seconds or less." Must request read **and** share for both `HKObjectType.workoutType()` and `HKSeriesType.workoutRoute()`. [official-doc] https://developer.apple.com/documentation/healthkit/creating-a-workout-route , https://developer.apple.com/documentation/healthkit/hkworkoutroutebuilder/insertroutedata(_:completion:)

### Heart rate and other per-workout series
21. `HKQuantityTypeIdentifier.heartRate`: unit count/time (`HKUnit.count().unitDivided(by: .minute())`), discrete aggregation, optional `HKMetadataKeyHeartRateMotionContext`. "Sample data may be condensed and/or coalesced by HealthKit." [official-doc] https://developer.apple.com/documentation/healthkit/hkquantitytypeidentifier/heartrate
22. Condensing: for **first-party** workouts at least a few months old, HealthKit rewrites `distanceWalkingRunning`, `distanceCycling`, `basalEnergyBurned`, `activeEnergyBurned`, `heartRate` (and more) into `HKCumulativeQuantitySample` / `HKDiscreteQuantitySample` **series** (sample `count > 1`) and deletes the originals; equal-value neighbouring HR samples are merged into interval samples. Recommendation: use statistics queries (they handle series transparently); use `HKQuantitySeriesSampleQuery(quantityType:predicate:quantityHandler:)` only if raw points are needed. Consequence for sync: an anchored query on heartRate will report those deletions + new series objects. [official-doc] https://developer.apple.com/documentation/healthkit/accessing-condensed-workout-samples , https://developer.apple.com/documentation/healthkit/hkquantityseriessamplequery
23. Two ways to get HR avg/min/max for a workout: (a) `workout.statistics(for: HKQuantityType(.heartRate))` → `averageQuantity()/minimumQuantity()/maximumQuantity()` — iOS 16+, only from samples **associated** with the workout (Apple Watch and well-behaved apps); (b) `HKStatisticsQueryDescriptor(predicate: .quantitySample(type: hr, predicate: HKQuery.predicateForObjects(from: workout)), options: [.discreteAverage,.discreteMin,.discreteMax])`, or fall back to `predicateForSamples(withStart: w.startDate, end: w.endDate, options: [])` for third-party workouts that never associated samples (that fallback can pick up samples from other sources/overlapping workouts). [official-doc] facts 5, 7, 8; fallback caveat is [unverified] inference.
24. Associated samples never change the workout's own totals; "adding associated samples leads to some duplication between the workout's properties and these samples". [official-doc] https://developer.apple.com/documentation/healthkit/adding-samples-to-a-workout

### Incremental sync, identity, deletions
25. `HKQueryAnchor` (iOS 9) conforms to `NSSecureCoding`; `init(fromValue: Int)` exists for legacy integer anchors. Serialize with `NSKeyedArchiver.archivedData(withRootObject: anchor, requiringSecureCoding: true)` → base64 string; restore with `NSKeyedUnarchiver.unarchivedObject(ofClass: HKQueryAnchor.self, from:)`. [official-doc] https://developer.apple.com/documentation/healthkit/hkqueryanchor ; archiver pattern [secondary] https://matteing.com/posts/storing-anchors-for-hkanchoredobjectquery-and-other-fun-stuff (kingstinct also exposes anchors as base64 strings [source-code] Context7 docs)
26. `HKDeletedObject { uuid: UUID, metadata: [String: Any]? }` — metadata contains **only** `HKMetadataKeySyncIdentifier` and `HKMetadataKeySyncVersion` copied from the original (iOS 11). "Deleted objects are temporary; the system may remove them from the HealthKit store at any time to free up space." To guarantee you see deletions, register an `HKObserverQuery` with background delivery and run an anchored query from its update handler. [official-doc] https://developer.apple.com/documentation/healthkit/hkdeletedobject , .../hkdeletedobject/metadata
27. `HKObjectQueryNoLimit` = "return all matching samples" sentinel for the closure APIs; the descriptor APIs take `limit: Int?` (nil = no limit). [official-doc] https://developer.apple.com/documentation/healthkit/hkobjectquerynolimit
28. Writer identity: `HKObject.sourceRevision: HKSourceRevision { source: HKSource { name, bundleIdentifier }, version: String?, productType: String?, operatingSystemVersion: OperatingSystemVersion }` (iOS 9; set by HealthKit on save; nil on unsaved objects). `HKObject.device: HKDevice? { name, manufacturer, model, hardwareVersion, firmwareVersion, softwareVersion, localIdentifier, udiDeviceIdentifier }`. `HKSource.default()` = the current app's source. To skip your own writes on import: compare `workout.sourceRevision.source.bundleIdentifier` with `HKSource.default().bundleIdentifier` (or `Bundle.main.bundleIdentifier`), or exclude at query time with `NSCompoundPredicate(notPredicateWithSubpredicate: HKQuery.predicateForObjects(from: HKSource.default()))`. [official-doc] https://developer.apple.com/documentation/healthkit/hksourcerevision , .../hksource , .../hkdevice , .../hkobject/sourcerevision
29. `HKObject.uuid` is assigned by HealthKit; your own cross-device id goes in `HKMetadataKeyExternalUUID`. [official-doc] https://developer.apple.com/documentation/healthkit/hkobject/uuid

### Authorization model
30. `func requestAuthorization(toShare: Set<HKSampleType>, read: Set<HKObjectType>) async throws` (iOS 15; completion variant since iOS 8). Shows the sheet only for types not yet decided; if everything was already decided it returns without UI. The app appears in Health → Sources even if the user denied everything. **Missing usage-description keys crash the app at request time.** [official-doc] https://developer.apple.com/documentation/healthkit/hkhealthstore/requestauthorization(toshare:read:)
31. `authorizationStatus(for:) -> HKAuthorizationStatus` (.notDetermined / .sharingDenied / .sharingAuthorized) "checks the authorization status for **saving** data"; "your app cannot determine whether or not a user has granted permission to read data. If you are not given permission, it simply appears as if there is no data … If your app is given share permission but not read permission, you see only the data that your app has written." [official-doc] https://developer.apple.com/documentation/healthkit/hkhealthstore/authorizationstatus(for:) , https://developer.apple.com/documentation/healthkit/hkauthorizationstatus
32. `getRequestStatusForAuthorization(toShare:read:completion:)` (iOS 12) / Swift async `statusForAuthorizationRequest(toShare:read:) async throws -> HKAuthorizationRequestStatus` (.unknown / .shouldRequest / .unnecessary) tells you whether calling request would show a sheet — it does **not** reveal grant/deny. [official-doc] https://developer.apple.com/documentation/healthkit/hkhealthstore/getrequeststatusforauthorization(toshare:read:completion:)
33. Limited-access window (new): HKHealthStore overview now says "People can grant your app full access to a data type, limited access restricted to a recent window of data, or no access at all." `earliestAuthorizedSampleDate(for: Set<HKObjectType>) async throws -> [HKObjectType: Date]` (and `getEarliestAuthorizedSampleDate(for:completion:)`) is **iOS 27.0 beta**; it returns an entry only for types with limited access (full access and denied both return no entry — still indistinguishable); the boundary is evaluated against sample **end** date; "Treat all data before that date as unknown — not an absence of data". `earliestPermittedSampleDate()` (iOS 9) is the unrelated system-wide floor. [official-doc] https://developer.apple.com/documentation/healthkit/hkhealthstore/earliestauthorizedsampledate(for:) , .../earliestpermittedsampledate() , https://developer.apple.com/documentation/healthkit/hkhealthstore , https://developer.apple.com/documentation/healthkit/authorizing-access-to-health-data
34. `HKHealthStore.isHealthDataAvailable()`: true on iOS, watchOS, visionOS, **iPadOS 17+**, and iOS apps on Vision Pro; false on iPadOS ≤ 16 and macOS (framework links but every call fails with `errorHealthDataUnavailable`); enterprise restriction → `errorHealthDataRestricted`. Health data syncs between iPhone, iPad and Watch since iPadOS 17. [official-doc] https://developer.apple.com/documentation/healthkit/hkhealthstore/ishealthdataavailable() , https://developer.apple.com/documentation/healthkit/setting-up-healthkit , https://developer.apple.com/documentation/updates/healthkit (June 2023)
35. Info.plist: `NSHealthShareUsageDescription` (read), `NSHealthUpdateUsageDescription` (write). Entitlements: `com.apple.developer.healthkit` (Bool, added by the HealthKit capability), `com.apple.developer.healthkit.access` (array of extra-sensitive capability strings such as `health-records`; only add what you use — App Review rejects otherwise; **not needed for workouts/routes/HR**), `com.apple.developer.healthkit.background-delivery` (Bool, iOS 15+; without it `enableBackgroundDelivery` fails with `errorAuthorizationDenied`). Enabling the capability also adds `healthkit` to `UIRequiredDeviceCapabilities`; remove it if HealthKit is optional for your app. [official-doc] https://developer.apple.com/documentation/bundleresources/information-property-list/nshealthshareusagedescription , .../nshealthupdateusagedescription , https://developer.apple.com/documentation/bundleresources/entitlements/com.apple.developer.healthkit , .../com.apple.developer.healthkit.access , .../com.apple.developer.healthkit.background-delivery , https://developer.apple.com/documentation/healthkit/setting-up-healthkit
36. Background: `enableBackgroundDelivery(for: HKObjectType, frequency: HKUpdateFrequency) async throws` (HKWorkoutType supported; HKCorrelationType not); `HKUpdateFrequency` `.immediate/.hourly/.daily/.weekly`; some types are capped at hourly (e.g. stepCount on iOS); `HKObserverQuery(sampleType:predicate:updateHandler:)` or `init(queryDescriptors:updateHandler:)`; set observers up in `application(_:didFinishLaunchingWithOptions:)`; you **must** call the delivered completion handler or HealthKit backs off and stops after 3 failures; "Background server queries aren't supported on the Simulator." Also: the store is encrypted while the device is locked, so background **reads** can fail while writes are cached. [official-doc] https://developer.apple.com/documentation/healthkit/hkhealthstore/enablebackgrounddelivery(for:frequency:withcompletion:) , https://developer.apple.com/documentation/healthkit/hkobserverquery , https://developer.apple.com/documentation/healthkit/protecting-user-privacy

### App Store / policy
37. App Store Review Guideline 5.1.3 (quoted live): (i) no use/disclosure of HealthKit (or Motion & Fitness, etc.) data "for advertising, marketing, or other use-based data mining purposes other than improving health management, or for the purpose of health research, and then only with permission"; "You must disclose the specific health data that you are collecting from the device." (ii) "Apps must not write false or inaccurate data into HealthKit … and may not store personal health information in iCloud." (iii)/(iv) consent + IRB for human-subject research. 5.1.2(vi): HealthKit data "may not be used for marketing, advertising or use-based data mining, including by third parties." [official-doc] https://developer.apple.com/app-store/review/guidelines/
38. Apple's "Protecting user privacy": a privacy policy is mandatory for any HealthKit app; HealthKit use must be for health/fitness and obvious in marketing text and UI; no selling to brokers; third-party sharing only with express permission and only to parties that also provide a health/fitness service. [official-doc] https://developer.apple.com/documentation/healthkit/protecting-user-privacy

### iOS 18 / iOS 26 / iOS 27 changes relevant to workouts
39. iOS 18 (June 2024): `HKQuantityTypeIdentifier.workoutEffortScore` and `.estimatedWorkoutEffortScore` (iOS 18, unit `HKUnit.appleEffortScore()`), `HKHealthStore.relateWorkoutEffortSample(_:with:activity:) async throws -> Bool` / `unrelateWorkoutEffortSample`, `HKWorkoutEffortRelationshipQuery(predicate:anchor:options:resultsHandler:)` → `[HKWorkoutEffortRelationship { workout, activity, samples }]`, options `.default`/`.mostRelevant`, `HKQuery.predicateForWorkoutEffortSamplesRelated(workout:activity:)`. Effort scale is 1–10 (easy→all-out) and feeds Training Load [secondary]. Also iOS 18: `HKStateOfMind`, `waterTemperature` for swims; Sept 2024 `underwaterDepth`. [official-doc] https://developer.apple.com/documentation/updates/healthkit , https://developer.apple.com/documentation/healthkit/hkworkouteffortrelationshipquery , .../hkhealthstore/relateworkouteffortsample(_:with:activity:completion:) , .../hkunit/appleeffortscore() ; [secondary] https://sasq.ca/blog/2025/4/28/reading-writing-workout-effort-scores
40. iOS 26 (June 2025): live workout **recording on iPhone/iPad** — `HKWorkoutSession(healthStore:configuration:)` (`ios(26.0)` in header; the class existed since iOS 17 only for mirrored sessions), `HKLiveWorkoutBuilder` and `HKLiveWorkoutDataSource` now `ios(26.0)`, `HKHealthStore.recoverActiveWorkoutSession(completion:)` `ios(26.0)`, scene-delegate crash recovery (`shouldHandleActiveWorkoutRecovery`), Live Activities + Siri intents. On iPhone, HR needs an external BLE monitor. Medications APIs also new. **Nothing changed for reading workouts/routes**; no new activity types; `HKCategoryTypeIdentifierHypertensionEvent` is iOS 26.2. [source-code] `HKWorkoutSession.h`, `HKLiveWorkoutBuilder.h`, `HKLiveWorkoutDataSource.h`, `HKHealthStore.h`, `HKTypeIdentifiers.h` in SDK 26.5; [official-doc] https://developer.apple.com/videos/play/wwdc2025/322/ , https://developer.apple.com/documentation/healthkit/hkworkoutsession
41. iOS 27 beta (June 2026 updates page): workout zones (fact 15), limited-access `earliestAuthorizedSampleDate` (fact 33), `totalDistance` formally deprecated, menopause APIs. Expect GA ~September 2026; treat as `#available(iOS 27, *)` extras. [official-doc] https://developer.apple.com/documentation/updates/healthkit

### Simulator
42. Both simulator runtimes installed here (iOS 18.1 `22B81`, iOS 26.5 `23F77`) ship `Health.app`, `Fitness.app`, `HealthKit.framework`, `HealthKitUI.framework` in `RuntimeRoot`, i.e. HealthKit reads/writes work on the Simulator (the blog claim "HealthKit cannot be used in the Simulator" is wrong; Apple's own docs only exclude **background delivery** on the Simulator). `xcrun simctl` has no health subcommand. [source-code] local `ls` of `/Library/Developer/CoreSimulator/Volumes/iOS_*/…/iOS 26.5.simruntime/Contents/Resources/RuntimeRoot/Applications`; [official-doc] fact 36
43. Seeding workouts **with routes** on the Simulator: the simulator Health app's manual "Add Data" cannot attach a route [unverified — needs hands-on]; `hkimport` (ashtom, 53★, pushed 2026-05-13) imports from Health `export.xml` — `Importer.swift` parses `Workout` and `WorkoutStatistics` elements, but the source contains no route handling (no "route" string in any Swift file; the GPX files under `workout-routes/` in an export are ignored), and its README says "Not all HealthKit record types are supported." Practical path: a debug-only native method / XCTest that runs `HKWorkoutBuilder` → `seriesBuilder(for: .workoutRoute())` → `insertRouteData` from a GPX/array → `finishWorkout` → `finishRoute(with:)`. Caveat from a July 2025 forum report (FB18603581): with an **active iOS 26 `HKWorkoutSession`** running, `insertRouteData` never returns on the iPhone 16 Pro Simulator (Xcode 26 beta 2) but works on device; the poster notes it works fine when no session is running/collecting — which is exactly the seeding path. [source-code] https://api.github.com/repos/ashtom/hkimport (tree + raw files); [secondary] https://developer.apple.com/forums/thread/791715
44. For comparison, kingstinct/react-native-healthkit exposes `queryWorkoutSamplesWithAnchor({anchor?: string, limit, filter})` → `{workouts, deletedSamples, newAnchor: string}` and `workout.getWorkoutRoute()` → `{locations: [{date, latitude, longitude, altitude, course, speed, speedAccuracy, horizontalAccuracy, verticalAccuracy, distance?}], HKMetadataKeySyncIdentifier?, HKMetadataKeySyncVersion?}` — i.e. it also treats anchors as base64 strings, but it loads the whole route into one array and still surfaces deprecated `totalDistance`/`totalEnergyBurned`. [source-code] Context7 `/kingstinct/react-native-healthkit`

---

## 2. API sketch (Swift side of the Expo module)

```swift
import HealthKit
import CoreLocation

let store = HKHealthStore()
let workoutType = HKObjectType.workoutType()
let routeType   = HKSeriesType.workoutRoute()
let hrType      = HKQuantityType(.heartRate)

// --- availability + authorization --------------------------------------
guard HKHealthStore.isHealthDataAvailable() else { throw HKError(.errorHealthDataUnavailable) }
try await store.requestAuthorization(
  toShare: [workoutType, routeType, HKQuantityType(.distanceWalkingRunning), HKQuantityType(.activeEnergyBurned)],
  read:    [workoutType, routeType, hrType, HKQuantityType(.distanceWalkingRunning), HKQuantityType(.activeEnergyBurned)])
let status = try await store.statusForAuthorizationRequest(toShare: [], read: [workoutType, routeType])
// .unnecessary means "already asked"; grant/deny for READ is never observable.

// --- incremental workout sync (added / deleted / anchor) ----------------
func decodeAnchor(_ b64: String?) -> HKQueryAnchor? {
  guard let b64, let data = Data(base64Encoded: b64) else { return nil }
  return try? NSKeyedUnarchiver.unarchivedObject(ofClass: HKQueryAnchor.self, from: data)
}
func encodeAnchor(_ a: HKQueryAnchor) throws -> String {
  try NSKeyedArchiver.archivedData(withRootObject: a, requiringSecureCoding: true).base64EncodedString()
}

let notMine = NSCompoundPredicate(notPredicateWithSubpredicate:
                HKQuery.predicateForObjects(from: HKSource.default()))   // optional: skip own writes
let window  = HKQuery.predicateForSamples(withStart: since, end: nil, options: [.strictStartDate])
let pred    = NSCompoundPredicate(andPredicateWithSubpredicates: [notMine, window])

let sync = HKAnchoredObjectQueryDescriptor(
  predicates: [.workout(pred)], anchor: decodeAnchor(anchorB64), limit: 100)
let r = try await sync.result(for: store)
// r.addedSamples: [HKWorkout], r.deletedObjects: [HKDeletedObject], r.newAnchor
// loop while !(r.addedSamples.isEmpty && r.deletedObjects.isEmpty)

// --- one-shot listing, newest first --------------------------------------
let list = HKSampleQueryDescriptor(
  predicates: [.workout(HKQuery.predicateForWorkouts(with: .running))],
  sortDescriptors: [SortDescriptor(\.startDate, order: .reverse)], limit: 50)
let workouts: [HKWorkout] = try await list.result(for: store)

// --- per-workout summary ----------------------------------------------
func summary(_ w: HKWorkout) {
  _ = w.uuid; _ = w.workoutActivityType.rawValue; _ = w.startDate; _ = w.endDate; _ = w.duration
  let distance = w.statistics(for: HKQuantityType(.distanceWalkingRunning))?.sumQuantity()?.doubleValue(for: .meter())
  let kcal     = w.statistics(for: HKQuantityType(.activeEnergyBurned))?.sumQuantity()?.doubleValue(for: .kilocalorie())
  let hr       = w.statistics(for: hrType)
  let bpm      = HKUnit.count().unitDivided(by: .minute())
  _ = hr?.averageQuantity()?.doubleValue(for: bpm); _ = hr?.minimumQuantity()?.doubleValue(for: bpm); _ = hr?.maximumQuantity()?.doubleValue(for: bpm)
  let ascended = (w.metadata?[HKMetadataKeyElevationAscended] as? HKQuantity)?.doubleValue(for: .meter())
  let indoor   = w.metadata?[HKMetadataKeyIndoorWorkout] as? Bool
  let tz       = w.metadata?[HKMetadataKeyTimeZone] as? String
  let writer   = w.sourceRevision.source.bundleIdentifier   // e.g. "com.apple.health.<uuid>" for Apple Watch [unverified]
  for a in w.workoutActivities { _ = a.workoutConfiguration.activityType; _ = a.workoutConfiguration.locationType }
  for e in w.workoutEvents ?? [] { _ = e.type; _ = e.dateInterval }
}

// --- fallback HR stats for workouts with no associated samples ---------
let hrStats = try await HKStatisticsQueryDescriptor(
  predicate: .quantitySample(type: hrType, predicate: HKQuery.predicateForObjects(from: w)),
  options: [.discreteAverage, .discreteMin, .discreteMax]).result(for: store)

// --- routes: find (anchored, so later replacements are seen) ------------
let routes = try await HKAnchoredObjectQueryDescriptor(
  predicates: [.workoutRoute(HKQuery.predicateForObjects(from: w))], anchor: nil).result(for: store)
for route in routes.addedSamples {            // usually 0 or 1; treat >1 as concatenable
  let total = route.count                     // for progress
  var batch: [CLLocation] = []
  for try await loc in HKWorkoutRouteQueryDescriptor(route).results(for: store) {
    // loc.timestamp, loc.coordinate, loc.altitude, loc.horizontalAccuracy, loc.verticalAccuracy,
    // loc.speed, loc.speedAccuracy, loc.course, loc.courseAccuracy  (negative accuracy/speed/course = invalid)
    batch.append(loc)
    if batch.count == 500 { emit(batch); batch.removeAll() }   // stream to JS in chunks
  }
  emit(batch)
}

// --- optional background observation ------------------------------------
try await store.enableBackgroundDelivery(for: workoutType, frequency: .immediate)
let obs = HKObserverQuery(sampleType: workoutType, predicate: nil) { _, completion, _ in
  // run the anchored sync, then ALWAYS call completion()
  completion()
}
store.execute(obs)
```

---

## 3. Design implications for a minimal-options unified API

**Expose (JS surface):**
- `isAvailable(): Promise<boolean>` → `HKHealthStore.isHealthDataAvailable()`.
- `requestAuthorization({ read: ('workouts'|'routes'|'heartRate'|'distance'|'energy')[], write?: [...] }): Promise<void>` — returns nothing meaningful about reads (by design); add `getAuthorizationRequestStatus(...)` → `'shouldRequest' | 'unnecessary' | 'unknown'` so the app knows whether a sheet will appear.
- `getWorkouts({ from?, to?, activityTypes?, limit?, excludeOwn?: boolean })` (one-shot, newest-first) and `syncWorkouts({ anchor?: string, limit? })` → `{ added, deleted: {id, syncId?}[], anchor }` where `anchor` is an opaque base64 string. Never expose `HKQueryAnchor` or predicates.
- `getRoute(workoutId)` as an **async iterator / chunked event stream** of `RoutePoint[]` (plus `total` from `route.count`), not one giant array: a 10-hour hike at 1 Hz is ~36k points, and JSON-bridging that in one message is the kind of thing that makes the old libraries feel flaky. Also offer a convenience `getRouteAll()` with a documented size cap.
- `Workout` record (normalised): `id` (HK uuid), `externalId?` (`HKMetadataKeyExternalUUID`), `syncId?`/`syncVersion?`, `activityType` (shared cross-platform enum + `platformActivityType: { ios: number }` raw value, with `'other'` fallback for unknown raw values), `startTime`, `endTime`, `activeDurationSec` (= `duration`), `wallClockSec` (= end−start), `isIndoor?` (metadata → else `workoutActivities[0].workoutConfiguration.locationType`), `timeZone?`, `distanceMeters?`, `activeEnergyKcal?`, `elevationAscendedMeters?`/`Descended?`, `averageSpeedMps?`/`maxSpeedMps?`, `heartRate?: { avg, min, max }`, `events[]` (`pause|resume|lap|segment|marker|autoPause|autoResume` with `{start, end}`; drop `pauseOrResumeRequest`), `activities[]` only when `workoutActivities.count > 1` (multisport), `hasRoute` (cheap: run the route anchored query with `limit: 1` — or compute lazily), `source: { bundleId, name, appVersion?, productType?, osVersion? }`, `device?: { name?, manufacturer?, model? }`, `isOwn: boolean`.
- `RoutePoint`: `{ t (epoch ms), lat, lon, altM?, hAccM?, vAccM?, speedMps?, speedAccMps?, courseDeg?, courseAccDeg? }` — convert HealthKit's negative "invalid" sentinels to `undefined` so JS never has to know CLLocation conventions.
- Optional, clearly separate subpath: `observeWorkouts()` (observer + background delivery) because it needs an extra entitlement and can't be tested on the Simulator.

**Hide:** HKUnit, HKQuantity, HKStatisticsOptions, predicates/key paths, the difference between associated-sample statistics and time-window statistics (do the fallback internally and tag the result `heartRateSource: 'associated' | 'timeWindow'`), condensed series handling, NSKeyedArchiver anchor coding, `HKWorkoutRouteQuery` batching, deprecated `total*` properties (read everything via `statistics(for:)`; only touch `totalDistance` under `#available(iOS 16)` negative branch if you support iOS 15).

**Normalise:** SI units (m, s, m/s, kcal, bpm); epoch-ms timestamps + IANA zone string when present; event types; activity-type enum shared with Health Connect (running/hiking/walking map 1:1; keep the raw HK value for round-tripping on write); `distance` = sum over whichever distance quantity type the activity uses (iterate `allStatistics` and pick the first `HKQuantityTypeIdentifier.distance*` present rather than hard-coding `distanceWalkingRunning`).

**Minimum OS:** the descriptor APIs need iOS 15.4, `statistics(for:)`/`workoutActivities` need iOS 16. Recommend **deployment target iOS 16** for the module (Expo SDK 57's own minimum must be checked — see open questions); this removes every `#available` branch except the iOS 18 effort score and iOS 27 zones/limited-access extras.

**Write path (if included):** `HKWorkoutBuilder` + `seriesBuilder(for: .workoutRoute())`, always set `HKMetadataKeySyncIdentifier`/`SyncVersion` (= your server id + revision) so re-saves replace rather than duplicate, and `HKMetadataKeyExternalUUID`; write distance/energy as associated samples that sum to the totals (fact 24); filter route points to `horizontalAccuracy <= 50`.

---

## 4. Pitfalls / gotchas

1. **Crash on missing plist keys** — `requestAuthorization` throws an ObjC exception if `NSHealthShareUsageDescription` (read) or `NSHealthUpdateUsageDescription` (write) is missing; the Expo config plugin must inject both. (fact 30)
2. **Read denial is invisible** — empty results ≠ "no workouts". Don't build UI that says "no data"; say "no data, or access not granted — check Health › Sharing › Apps". `authorizationStatus(for:)` only tells you about **write** permission. (facts 31–32)
3. **Forgetting `HKSeriesType.workoutRoute()` in the read set** silently yields zero routes for every workout. Same for `heartRate`. (fact 20)
4. **Route arrives after the workout, and can be replaced later** (sync identifier). A one-shot `SampleQuery` per workout right after import will miss Apple Watch routes that haven't synced/smoothed yet; re-query on next sync or use the anchored route query. (fact 17)
5. **Anchored query gotchas**: results are in store-insertion order, not date order (sort in JS) [unverified]; `limit` applies per call so you must loop; Apple's sample loop condition uses `&&` on *both* arrays being non-empty — use "stop when both are empty"; `deletedObjects` can be **purged** by the system, so a client offline for a long time may never learn about deletions → provide a `fullResync()` escape hatch that diffs by uuid. (facts 3, 26)
6. **Anchors are per HealthKit store**: an anchor from another device/reinstall/restore is meaningless; if unarchiving fails or the store changed, fall back to `anchor: nil` (full read) rather than throwing. [unverified beyond "per-store" nature]
7. **iOS 27 limited-access window**: from iOS 27 the user can grant "recent data only"; queries then silently start at a date. Surface `earliestAuthorizedDate` per type under `#available(iOS 27, *)` and never interpret "nothing before date X" as "no history". (fact 33)
8. **Condensed first-party workouts**: HR/distance/energy samples for older Apple Watch workouts are rewritten as series; per-sample queries return few objects with `count > 1`; statistics are still correct. Anchored syncs on those quantity types will show deletes+adds that aren't user actions. (fact 22)
9. **Third-party workouts may have no associated samples**, so `statistics(for:)` is `nil` and `allStatistics` is empty even when the app also wrote HR samples in the same window; the time-window fallback can double-count overlapping sources — tag the provenance. (facts 8, 23)
10. **`duration` ≠ `endDate − startDate`** when pauses exist; pick one for "moving time" vs "elapsed time" and name them explicitly. Pre-iOS-11 lap events are zero-duration end markers. (facts 9, 13)
11. **Deprecated totals**: `totalEnergyBurned`/`totalFlightsClimbed`/`totalSwimmingStrokeCount` deprecated since iOS 18, `totalDistance` in iOS 27; building with Xcode 26+ prints warnings and future SDKs may remove them. (fact 10)
12. **Distance quantity type depends on activity** (walking/running vs cycling vs swimming vs wheelchair vs snow sports…); hard-coding `distanceWalkingRunning` returns `nil` distance for cycling/hiking-with-cycling multisport. (fact 8)
13. **Background delivery**: needs the separate `background-delivery` entitlement (else `errorAuthorizationDenied`), observers must be created at launch, the completion handler must be called (3 misses → HealthKit stops waking you), reads can fail while the device is locked (encrypted store), and **none of it runs on the Simulator**. Keep it out of the core subpath. (facts 35–36)
14. **Simulator**: HealthKit itself works (Health.app present), but there's no CLI to seed data and the iOS 26 live-session + route builder path hangs on Simulator; seed with a non-live `HKWorkoutBuilder` instead. (facts 42–43)
15. **`UIRequiredDeviceCapabilities: healthkit`** is auto-added by the capability; it blocks installs on unsupported devices (and historically iPads). Remove if HealthKit is optional. (fact 35)
16. **App Review**: privacy policy URL mandatory; no ads/analytics use of HK data; don't request types you don't use (reviewers check the sheet); `com.apple.developer.healthkit.access` must stay empty unless you really use clinical records; never write fabricated workouts (5.1.3 ii) — a debug seeding path must be compiled out of release builds; don't put PHI in iCloud (relevant if the app backs up imported workouts to iCloud). (facts 35, 37–38)
17. **CLLocation sentinels**: `speed`, `course`, `speedAccuracy`, `courseAccuracy`, `horizontalAccuracy`, `verticalAccuracy` are negative when invalid; `altitude` is MSL metres (ellipsoidal altitude isn't stored). Route accuracy is "within 50 m" and unsmoothed. (fact 18)
18. **iPad**: works on iPadOS 17+, but `isHealthDataAvailable()` must still gate everything; iPadOS ≤ 16 links fine and fails at runtime. (fact 34)

---

## 5. Open questions

**Needs a USER decision**
- Deployment target: iOS 16 (clean, uses `statistics(for:)`/`workoutActivities`) vs iOS 15.4 (descriptors only, needs deprecated `total*` fallbacks). Check Expo SDK 57's minimum first.
- Scope of v1: read-only (workouts + routes + HR summary) vs also write-back (workout + route + distance/energy samples). Effort score (iOS 18) and zones (iOS 27) in or out?
- Should `excludeOwn` (skip workouts whose source is this app) be the default for import?
- Expose raw per-sample heart-rate series (needs `HKQuantitySeriesSampleQuery` + condensed-sample handling) or only avg/min/max?
- Route delivery shape: async iterator/events with chunk size (proposal 500 pts) vs single array with a hard cap.
- Background observation subpath in v1 or later (extra entitlement, device-only testing).
- Whether "all activity types" means a full 84-case shared enum or `running|hiking|walking|cycling|other` + raw value passthrough.

**Needs a hands-on device test**
- Seed workouts+routes on the iOS 26.5 Simulator via `HKWorkoutBuilder` + `HKWorkoutRouteBuilder` (no live session) and confirm the Health app shows the map.
- Apple Watch workouts on a paired iPhone: `sourceRevision.source.bundleIdentifier` format (memory says `com.apple.health.<UUID>`, name = watch name — unverified), whether routes appear with delay, and whether the smoothed route shows up as delete+add in the anchored route query.
- Anchored query ordering and whether `limit` counts deleted objects.
- Behaviour of `HKWorkoutRouteQueryDescriptor` on Task cancellation (does it stop the underlying query?).
- `statistics(for: .heartRate)` being non-nil for Apple Watch workouts vs nil for Strava/Garmin-imported workouts.
- iOS 27 beta: limited-access sheet and `earliestAuthorizedSampleDate` values for `workoutType()`/`workoutRoute()`.

**Needs more research**
- Full list of `HKQuantityTypeIdentifier.distance*` types (iOS 18 added several) to drive the "pick the distance type per activity" rule.
- Apple Watch source bundle-id format (above) from an authoritative source.
- Expo config-plugin mechanics for entitlements/plist (other research dimension), and Health Connect `ExerciseSessionRecord`/`ExerciseRoute` mapping to this model (other dimension).
- Whether the simulator Health app's manual "Add Data → Workout" exists in iOS 26.5 and what fields it supports.

---

## 6. Sources

Apple documentation (fetched as JSON, 2026-08-22)
- https://developer.apple.com/documentation/healthkit/hksamplequerydescriptor
- https://developer.apple.com/documentation/healthkit/hkanchoredobjectquerydescriptor (+ `/result`)
- https://developer.apple.com/documentation/healthkit/hkworkoutroutequerydescriptor
- https://developer.apple.com/documentation/healthkit/hkstatisticsquerydescriptor
- https://developer.apple.com/documentation/healthkit/hksamplepredicate
- https://developer.apple.com/documentation/healthkit/hkquery
- https://developer.apple.com/documentation/healthkit/hkquery/predicateforobjects(from:)-5irg9 (workout) and -7j3p2 (source)
- https://developer.apple.com/documentation/healthkit/hkquery/predicateforworkouts(with:) , .../predicateforworkouts(activitypredicate:)
- https://developer.apple.com/documentation/healthkit/hkworkout , .../hkworkout/duration , .../hkworkout/statistics(for:) , .../hkworkout/allstatistics , .../hkworkout/totaldistance , .../hkworkout/workoutactivities , .../hkworkout/zonegroupsbytype
- https://developer.apple.com/documentation/healthkit/hkworkoutactivity
- https://developer.apple.com/documentation/healthkit/hkworkoutactivitytype (+ /running, /transition, /swimbikerun, /underwaterdiving)
- https://developer.apple.com/documentation/healthkit/hkworkoutevent , https://developer.apple.com/documentation/healthkit/hkworkouteventtype (+ /pause, /lap, /marker, /motionpaused, /segment, /pauseorresumerequest)
- https://developer.apple.com/documentation/healthkit/hkworkoutroute , https://developer.apple.com/documentation/healthkit/hkseriessample/count , https://developer.apple.com/documentation/healthkit/hkseriestype/workoutroute()
- https://developer.apple.com/documentation/healthkit/hkworkoutroutequery (+ init(route:dataHandler:), init(route:dateInterval:dataHandler:))
- https://developer.apple.com/documentation/healthkit/reading-route-data
- https://developer.apple.com/documentation/healthkit/creating-a-workout-route
- https://developer.apple.com/documentation/healthkit/hkworkoutroutebuilder , .../insertroutedata(_:completion:)
- https://developer.apple.com/documentation/healthkit/hkworkoutbuilder
- https://developer.apple.com/documentation/healthkit/adding-samples-to-a-workout
- https://developer.apple.com/documentation/healthkit/accessing-condensed-workout-samples
- https://developer.apple.com/documentation/healthkit/hkquantityseriessamplequery
- https://developer.apple.com/documentation/healthkit/hkquantitytypeidentifier/heartrate
- https://developer.apple.com/documentation/healthkit/hkstatistics , https://developer.apple.com/documentation/healthkit/hkstatisticsoptions
- https://developer.apple.com/documentation/healthkit/hkqueryanchor
- https://developer.apple.com/documentation/healthkit/hkdeletedobject (+ /metadata)
- https://developer.apple.com/documentation/healthkit/hkobjectquerynolimit
- https://developer.apple.com/documentation/healthkit/hksourcerevision , .../hksource , .../hkdevice , .../hkobject/sourcerevision , .../hkobject/device , .../hkobject/metadata , .../hkobject/uuid
- Metadata keys: .../hkmetadatakeyelevationascended , .../hkmetadatakeyelevationdescended , .../hkmetadatakeyindoorworkout , .../hkmetadatakeyaveragespeed , .../hkmetadatakeymaximumspeed , .../hkmetadatakeytimezone , .../hkmetadatakeysyncidentifier , .../hkmetadatakeysyncversion , .../hkmetadatakeyexternaluuid
- https://developer.apple.com/documentation/healthkit/hkhealthstore (+ requestauthorization(toshare:read:), authorizationstatus(for:), getrequeststatusforauthorization(toshare:read:completion:), ishealthdataavailable(), enablebackgrounddelivery(for:frequency:withcompletion:), earliestauthorizedsampledate(for:), earliestpermittedsampledate(), relateworkouteffortsample(_:with:activity:completion:))
- https://developer.apple.com/documentation/healthkit/hkauthorizationstatus , .../hkauthorizationrequeststatus , .../hkupdatefrequency , .../hkobserverquery
- https://developer.apple.com/documentation/healthkit/authorizing-access-to-health-data , .../setting-up-healthkit , .../protecting-user-privacy
- https://developer.apple.com/documentation/healthkit/hkworkouteffortrelationshipquery (+ init), .../hkworkouteffortrelationship , .../hkworkouteffortrelationshipqueryoptions , .../hkquantitytypeidentifier/workouteffortscore , .../estimatedworkouteffortscore , .../hkunit/appleeffortscore()
- https://developer.apple.com/documentation/healthkit/hkworkoutsession , .../hkliveworkoutbuilder , .../hkliveworkoutdatasource , .../hkworkoutsessiontype , .../hkworkoutconfiguration , .../hkworkoutzonegroup
- https://developer.apple.com/documentation/updates/healthkit
- https://developer.apple.com/documentation/bundleresources/entitlements/com.apple.developer.healthkit , .../com.apple.developer.healthkit.access , .../com.apple.developer.healthkit.background-delivery
- https://developer.apple.com/documentation/bundleresources/information-property-list/nshealthshareusagedescription , .../nshealthupdateusagedescription
- https://developer.apple.com/app-store/review/guidelines/ (5.1.2(vi), 5.1.3)
- https://developer.apple.com/videos/play/wwdc2025/322/ (Track workouts with HealthKit on iOS and iPadOS)

Local machine (source-code evidence)
- `/Applications/Xcode.app/Contents/Developer/Platforms/iPhoneOS.platform/Developer/SDKs/iPhoneOS26.5.sdk/System/Library/Frameworks/HealthKit.framework/Headers/{HKWorkout.h,HKMetadata.h,HKWorkoutSession.h,HKLiveWorkoutBuilder.h,HKLiveWorkoutDataSource.h,HKHealthStore.h,HKTypeIdentifiers.h,HKQuery.h}`
- `/Library/Developer/CoreSimulator/Volumes/iOS_22B81/.../iOS 18.1.simruntime` and `/Library/Developer/CoreSimulator/Volumes/iOS_23F77/.../iOS 26.5.simruntime` → `RuntimeRoot/Applications/Health.app`, `RuntimeRoot/System/Library/Frameworks/HealthKit.framework`

Forums / third party
- https://developer.apple.com/forums/thread/791715 (route builder hang on Simulator with live session, FB18603581, 0 replies)
- https://developer.apple.com/forums/thread/790321 (HKLiveWorkoutDataSource on iOS 26 typesToCollect inconsistency, 0 replies)
- https://developer.apple.com/forums/thread/739682 (import swim workout into Simulator — unanswered)
- https://developer.apple.com/forums/thread/732944 , https://developer.apple.com/forums/thread/732150 (iPadOS 17 `isHealthDataAvailable` reports)
- https://github.com/ashtom/hkimport (export.xml importer; no route support) via https://api.github.com/repos/ashtom/hkimport
- https://matteing.com/posts/storing-anchors-for-hkanchoredobjectquery-and-other-fun-stuff (anchor archiving pattern)
- https://sasq.ca/blog/2025/4/28/reading-writing-workout-effort-scores (effort score 1–10)
- Context7 `/kingstinct/react-native-healthkit` (workouts module docs: anchors as base64, `getWorkoutRoute()` shape)
