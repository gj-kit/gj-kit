# Follow-up 4 — sync-identifier semantics, release gating, HC upsert/error mapping, initial-sync protocol

Date: 2026-08-22. Tags: [official-doc] [source-code] [secondary] [unverified] plus **[sim-test]** = run by me today on the iOS 26.5 *simulator* (iPhone 17, Xcode 26.6) with a purpose-built probe app (see §1 Item 1 for the harness; raw output in `hkprobe-run1.txt` / `hkprobe-run2.txt` next to this file). Sim-test results are empirical but not yet confirmed on a physical iPhone.

Where a live source contradicted a prior report or my memory, the live source wins and I say so.

## 1. Facts

### Item 1 — HK sync identifier replace / cascade / ExternalUUID — verdict: **PARTIALLY** (replace ✔, carry ✘, orphan ✔, no delete cascade ✔, ExternalUUID non-unique ✔, "greater version" ✘ — equal also replaces)

1. `HKMetadataKeySyncIdentifier` (String; iOS 11+): "When you save an HKObject with a sync identifier, the system looks for any existing objects with the same sync identifier. If it finds a match, the system compares the objects' HKMetadataKeySyncVersion values. If the new object has a greater sync version, the system replaces the old object with the new one. If the old object is associated with a workout or part of a correlation, the system also replaces the old object in the workout or correlation." The cascade sentence is about a *sample inside* a workout being swapped; nothing says a replaced *workout* keeps its samples/route. [official-doc] https://developer.apple.com/documentation/healthkit/hkmetadatakeysyncidentifier
2. `HKMetadataKeySyncVersion` (NSNumber): "the new object replaces any matching objects (existing objects with a matching HKMetadataKeySyncIdentifier value) with a *lower* sync version." [official-doc] https://developer.apple.com/documentation/healthkit/hkmetadatakeysyncversion
3. `HKMetadataKeyExternalUUID` live page: "You typically use the UUID from the corresponding data entry on your server. This lets you create multiple copies of that data across multiple devices. Each copy shares the same external UUID." (no uniqueness; the stronger "Uniqueness … is not enforced by HealthKit" sentence quoted in healthkit-write fact 32 is from HKMetadata.h, not the live page). [official-doc] https://developer.apple.com/documentation/healthkit/hkmetadatakeyexternaluuid
4. `delete(_:)` / `deleteObjects(of:predicate:)`: "Your app can delete only those objects that it has previously saved… HealthKit stores a temporary HKDeletedObject entry… the deleted objects are periodically removed to save storage space." No cascade is documented. [official-doc] https://developer.apple.com/documentation/healthkit/hkhealthstore/delete(_:withcompletion:)-78l1m · https://developer.apple.com/documentation/healthkit/hkhealthstore/deleteobjects(of:predicate:withcompletion:)
5. `add(_:to:)`: "You must save the workout to the HealthKit store before you can add any samples to it. You can save the samples before calling this method, but doing so is not required. This method automatically saves any unsaved samples when it successfully adds them to the workout." [official-doc] https://developer.apple.com/documentation/healthkit/hkhealthstore/add(_:to:completion:)
6. Forum thread 658843 contains **no Apple staff answer**; it is a self-answered tip that `HKLiveWorkoutBuilder.addMetadata` needed `NSString` for the sync identifier value (Aug 2020). It is not evidence for cascade semantics. [secondary] https://developer.apple.com/forums/thread/658843
7. **[sim-test] run 1** (workout via `HKWorkoutBuilder` + 2 samples + `HKWorkoutRouteBuilder` route; sync id S, version 1 → re-save version 2 with *no* samples/route):
   - v2 got a **new UUID**; v1 no longer queryable (`predicateForObject(with: v1.uuid)` → none).
   - **Not carried:** `predicateForObjects(from: v2)` returned dist=[] energy=[] routes=[]; `v2.statistics(for: distance)` = nil.
   - **Orphaned, not deleted:** v1's distance sample, energy sample and route all still exist by UUID and no longer match `predicateForObjects(from:)` of either workout.
   - Anchored workout query delta: added `[v2 v=2]`, deleted `[v1]` **and the `HKDeletedObject.metadata` carried `HKMetadataKeySyncIdentifier`/`SyncVersion` of v1**. Route/distance anchored deltas: empty (orphans untouched).
   - **Equal version replaces:** saving version 2 again (with samples) replaced v2 with v3 (new UUID). This contradicts the doc wording "greater"/"lower" (facts 1–2) — live behaviour wins: `>=`.
   - **Lower version fails loudly:** `finishWorkout()` threw `Error Domain=com.apple.healthd.SQLite Code=1 "Transaction block failed without an error."`; store unchanged.
   - **ExternalUUID not unique:** two workouts with the same `HKMetadataKeyExternalUUID` both saved; predicate count = 2.
   - **Delete does not cascade:** after `store.delete(v3)` the orphan samples/route and v3's own samples still existed (`predicateForObjects(from: HKSource.default())` → 2 distance, 1 route); anchored deltas showed only workout deletions.
   Harness: `/private/tmp/claude-501/-Users-apeltop-project-service-gj-kit/b6be1602-1eae-490e-96b9-ab07f2be21f7/scratchpad/hkprobe` (`HKProbe.xcodeproj`, `HKProbe/ProbeApp.swift`, `HKProbeUITests/` taps the Health sheet). Re-run: `xcodebuild test -project HKProbe.xcodeproj -scheme HKProbe -destination 'platform=iOS Simulator,id=F852C6FF-2BA6-40C2-A36F-ED0C9E47AC42'`; output: `$(xcrun simctl get_app_container <udid> com.gjkit.hkprobe data)/Documents/probe.txt`. [sim-test]
8. **[sim-test] run 2** (route saved with its *own* sync id R v1; workout re-saved v2 without samples):
   - `store.addSamples(oldSamples, to: v2)` **succeeded** and re-associated the orphaned v1 samples with v2 (`predicateForObjects(from: v2)` → both samples; total distance samples from self stayed 1 → no duplication).
   - Route re-saved with sync id R **v2 attached to v2**: r1 gone, r2 associated with v2, `HKWorkoutRouteQuery(r2)` returned the new 3 locations; route anchored delta: added `[r2 v=2]`, deleted `[r1 (metadata sync=R v=1)]`.
   - Route **equal version (2 again) replaced** r2 with r3. Route **lower version (1)**: `finishRoute` returned an `HKWorkoutRoute` whose UUID **equals the existing r3** (silently ignored, no error — differs from the workout builder's error in fact 7).
   [sim-test] raw: `hkprobe-run2.txt`

### Item 2 — release gating — verdict: **PARTIALLY** (Apple items ✔ with two corrections; Play "read AND write" ✔; test-track gating still undocumented but internal testing is *not* in Google's list)

9. App Store Review Guideline 5.1.3 (live): "(ii) Apps must not write false or inaccurate data into HealthKit or any other medical research or health management apps, and may not store personal health information in iCloud." (i) forbids advertising/marketing/data-mining use and says "You must disclose the specific health data that you are collecting from the device." (iii)/(iv) consent + ethics board for human-subject research. 2.5.1: "HealthKit should be used for health and fitness purposes and integrate with the Health app." 2.5.11(vi) repeats the no-marketing rule. [official-doc] https://developer.apple.com/app-store/review/guidelines/
10. "You must also provide a privacy policy for any app that uses the HealthKit framework." and "your app must not access the HealthKit APIs unless the use is for health or fitness purposes and this usage is clear in both your marketing text and your user interface." [official-doc] https://developer.apple.com/documentation/healthkit/protecting-user-privacy
11. `com.apple.developer.healthkit.access`: "Only add values for data types that your app needs to access. App Review may reject apps that don't use the data appropriately." — i.e. the key must not carry `health-records` unless used; an *empty array* (what `react-native-health`'s plugin writes) is not prohibited by the text, "absent" is the cleanest. [official-doc] https://developer.apple.com/documentation/bundleresources/entitlements/com.apple.developer.healthkit.access · [source-code] https://raw.githubusercontent.com/agencyenterprise/react-native-health/master/app.plugin.js
12. `UIRequiredDeviceCapabilities`: "When you enable the HealthKit capabilities on an iOS app, **Xcode** adds HealthKit to the list of required device capabilities… If HealthKit isn't required… delete the `healthkit` entry." This is an Xcode-UI side effect. In an Expo prebuild flow nothing adds it: `@expo/config-plugins@56.0.15` Info.plist template has `UIRequiredDeviceCapabilities: ['armv7']`, the bare template ships `['arm64']`, and neither `@kingstinct/react-native-healthkit`'s nor `react-native-health`'s plugin touches the key. Correction to the claim: **"auto-adds" is false for config-plugin-driven projects**. [official-doc] https://developer.apple.com/documentation/healthkit/setting-up-healthkit · [source-code] `node_modules/.pnpm/@expo+config-plugins@56.0.15_typescript@6.0.3/.../build/plugins/withIosBaseMods.js` L135 · https://raw.githubusercontent.com/expo/expo/main/templates/expo-template-bare-minimum/ios/HelloWorld/Info.plist · https://raw.githubusercontent.com/kingstinct/react-native-healthkit/master/packages/react-native-healthkit/app.plugin.ts
13. EAS capability sync lists HealthKit ↔ `com.apple.developer.healthkit` only; `healthkit.access` is not mentioned (behaviour if present: [unverified]). [official-doc] https://docs.expo.dev/build-reference/ios-capabilities/
14. Health Connect declare-access: "This process must be completed for all publishing requests, both for a new app that has not been published yet, or when updating an existing, already published app that now uses a different set of data types." and "If your health app is published in the Play store and released to the public, but you didn't request for data type accesses, your end users receive the following dialog when attempting to link with Health Connect" (dialog: app can't access Health Connect). [official-doc] https://developer.android.com/health-and-fitness/guides/health-connect/publish/declare-access
15. Get-started: "In the Play Console, declare access to the Health Connect data types that your app reads from **and writes to**." [official-doc] https://developer.android.com/health-and-fitness/health-connect/get-started
16. Play Console help: "All developers that have an app published on Google Play must complete the Health apps declaration, including apps on **closed testing, open testing, or production tracks**." Internal testing is not listed; what the HC app does for an internal-testing install is still undocumented. [official-doc] https://support.google.com/googleplay/android-developer/answer/14738291
17. A third-party page claims "The declaration must be submitted and approved for the release track you are testing" — unsupported by any Google page I found. [secondary, treat as unverified] https://www.aifitnessapi.com/fix/health-connect-no-data

### Item 3 — HC `clientRecordVersion` equal/lower — verdict: **PARTIALLY → resolved from source**: same (package, clientRecordId, type) with version **≥** existing → overwrite; **<** → ignored (nothing inserted, nothing updated). "Written as new data" applies only when no record with that client id exists.

18. sync-data guide: "Upserting data means that any existing data in Health Connect gets overwritten as long as the clientRecordId values exist in the Health Connect datastore, and the clientRecordVersion is higher than the existing value. Otherwise, the upserted data is written as new data." [official-doc] https://developer.android.com/health-and-fitness/guides/health-connect/common-workflows/sync-data
19. write-data guide: "If the version from the inserted data is higher than the version from the existing data, the upsert happens. Otherwise, the process ignores the change and the value remains the same." and "Upserts don't automatically increment version… you have to manually supply it with a higher value." [official-doc] https://developer.android.com/health-and-fitness/guides/health-connect/develop/write-data
20. Platform source (`RecordHelper.getUpsertTableRequest`, identical in `android15-release` L298, `android16-release` L330, `main`): `return newClientRecordVersion >= clientRecordVersion;` — preceded by "if UUIDs differ → duplication conflict, update". [source-code] https://android.googlesource.com/platform/packages/modules/HealthFitness/+/refs/heads/android16-release/service/java/com/android/server/healthconnect/storage/datatypehelpers/RecordHelper.java
21. `TransactionManager.insertOrReplaceOnConflict` (a16 L174–203): `insertWithOnConflict(..., CONFLICT_FAIL)`; on `SQLiteConstraintException` it reads the existing row and calls `updateEntriesIfRequired`, which does `if (!request.requiresUpdate(cursor, request)) return -1;` — no second insert. Therefore lower version = silent no-op. [source-code] https://android.googlesource.com/platform/packages/modules/HealthFitness/+/refs/heads/android16-release/service/java/com/android/server/healthconnect/storage/TransactionManager.java
22. "Exists" means: unique columns are `dedupe_hash` + `uuid`; when `clientRecordId` is set the dedupe hash is null and the record UUID is **name-based from (packageName, clientRecordId, recordType)** (`StorageUtils.addNameBasedUUIDTo`, `getUUID`), so the same client id from another app never collides. [source-code] https://android.googlesource.com/platform/packages/modules/HealthFitness/+/refs/heads/android16-release/service/java/com/android/server/healthconnect/storage/utils/StorageUtils.java
23. Pre-API-34 path (Play-distributed `com.google.android.apps.healthdata` provider on Android 9–13) is closed source; its equal-version behaviour is [unverified].

### Item 4 — HC rate-limit surfacing in Jetpack — verdict: **CONFIRMED for API 34+** (read report was right): rate limit → `IllegalStateException(cause = HealthConnectException(errorCode 7))`.

24. `ExceptionConverter.toKtException()` (androidx-main, `@RequiresApi(34)`): `ERROR_IO → IOException(this)`, `ERROR_REMOTE → RemoteException(message)`, `ERROR_SECURITY → SecurityException(this)`, `ERROR_INVALID_ARGUMENT → IllegalArgumentException(this)`, `else → IllegalStateException(this)`. [source-code] https://android.googlesource.com/platform/frameworks/support/+/refs/heads/androidx-main/health/connect/connect-client/src/main/java/androidx/health/connect/client/impl/platform/ExceptionConverter.kt
25. `HealthConnectClientUpsideDownImpl.wrapPlatformException`: `catch (e: HealthConnectException) { throw e.toKtException() }` wraps insert/update/delete/read. Its private `getChanges` additionally maps `ERROR_INVALID_ARGUMENT` → `ChangesResponse(changesTokenExpired = true)` and everything else through `toKtException()`. [source-code] same repo, `impl/HealthConnectClientUpsideDownImpl.kt`
26. Platform constants: `ERROR_UNKNOWN=1, ERROR_INTERNAL=2, ERROR_INVALID_ARGUMENT=3, ERROR_IO=4, ERROR_SECURITY=5, ERROR_REMOTE=6, ERROR_RATE_LIMIT_EXCEEDED=7 ("The caller exhausted the allotted rate limit"), ERROR_DATA_SYNC_IN_PROGRESS=8 ("Caller should try this api call again later"), ERROR_UNSUPPORTED_OPERATION=9`. [official-doc] https://developer.android.com/reference/android/health/connect/HealthConnectException
27. Pre-API-34 IPC client (`ErrorStatusConverter.kt`): maps provider codes `PROVIDER_NOT_INSTALLED/NOT_ENABLED/NEEDS_UPDATE → UnsupportedOperationException`, `NO_PERMISSION/INVALID_OWNERSHIP/NOT_ALLOWED/PERMISSION_NOT_DECLARED → SecurityException`, `DATABASE_ERROR → IOException`, `INVALID_UID/INTERNAL_ERROR/CHANGES_TOKEN_OUTDATED/TRANSACTION_TOO_LARGE → RemoteException`, unknown → `UnsupportedOperationException`. There is **no rate-limit code** in `ErrorCode.kt`; the rate-limiting guide does not scope itself to Android 14+. Whether the APK provider rate-limits at all: [unverified]. [source-code] https://android.googlesource.com/platform/frameworks/support/+/refs/heads/androidx-main/health/connect/connect-client/src/main/java/androidx/health/platform/client/impl/error/ErrorStatusConverter.kt · https://developer.android.com/health-and-fitness/health-connect/rate-limiting

### Item 5 — kingstinct publish date — verdict: **existing-libraries.md is right (2026-06-05); healthkit-write.md mis-read `time.modified`.**

28. `https://registry.npmjs.org/@kingstinct/react-native-healthkit` → `time["14.0.2"] = 2026-06-05T07:56:15Z`, `dist-tags.latest = 14.0.2`, `time.modified = 2026-08-19T11:36:26Z` (a metadata touch, not a publish). [source-code]

### Item 6 — initial-sync protocol — verdict: **resolved from docs + sim-test** (state machine in §3)

29. `getChangesToken` "Retrieves a changes-token, representing a point in time in the underlying Android Health Platform… Changes-tokens are only valid for 30 days after they're generated. Calls to getChanges with an expired changes-token will lead to ChangesResponse.changesTokenExpired". [official-doc] https://developer.android.com/reference/kotlin/androidx/health/connect/client/HealthConnectClient
30. Guide ordering: get token → `getChanges` loop until `!hasMore` → store `nextChangesToken`; "For UpsertionChange, only take changes that didn't come from the calling app to make sure you're not re-importing data."; "We recommend getting separate tokens per data type"; "If your app needs to read data… you must store the id… DeletionChange notifications only provide the record id." [official-doc] https://developer.android.com/health-and-fitness/guides/health-connect/common-workflows/sync-data
31. Token expiry strategies, best first: "Read and dedupe all data… On token expiry, re-read all data from the most recent timestamp or for the last 30 days. Then, dedupe it against the previously read data using identifiers." [official-doc] same page
32. Read window: "By default, all applications can read data from Health Connect for up to 30 days prior to when any permission was first granted… without [PERMISSION_READ_HEALTH_DATA_HISTORY], an attempt to read records older than 30 days results in an error." Reinstall resets the window. [official-doc] https://developer.android.com/health-and-fitness/guides/health-connect/develop/read-data
33. `HKAnchoredObjectQuery.init`: "The first time you call this method, pass nil as the anchor parameter. This method returns all matching objects currently in the HealthKit store… The system calls the update handler… whenever a matching sample is saved to or deleted from the HealthKit store." `HKAnchoredObjectQueryDescriptor`: batch with `limit`, loop until no added/deleted; anchors are `Codable`/`NSSecureCoding`. [official-doc] https://developer.apple.com/documentation/healthkit/hkanchoredobjectquery/init(type:predicate:anchor:limit:resultshandler:) · https://developer.apple.com/documentation/healthkit/hkanchoredobjectquerydescriptor
34. `HKDeletedObject`: "Deleted objects are temporary; the system may remove them from the HealthKit store at any time to free up space." [official-doc] https://developer.apple.com/documentation/healthkit/hkdeletedobject
35. matinzd/react-native-health-connect #243 (open, 2025-12-18, pinged again 2026-07-07, no maintainer reply): user called `getChanges` with no token and expected history; the library returned an empty page + token — exactly the documented semantics. [secondary] https://api.github.com/repos/matinzd/react-native-health-connect/issues/243

### Item 7 — iOS own-write echo — verdict: **CONFIRMED [sim-test]**: own saves echo in own anchored queries; a sync-id re-save appears as delete(old uuid, with sync metadata) + add(new uuid); same for routes.

36. Run 1 step 2: immediately after `finishWorkout`/`finishRoute`, anchored queries (workout, route, distance) returned the new objects as `added`; `sourceRevision.source.bundleIdentifier == "com.gjkit.hkprobe"` (own bundle id) is a reliable own-write marker. [sim-test]
37. Run 1 step 4 / Run 2 D–G: re-save → `added=[newUUID v=N]`, `deleted=[oldUUID(sync=S v=N-1)]`. `HKDeletedObject.metadata` includes `HKMetadataKeySyncIdentifier` and `HKMetadataKeySyncVersion`, so "replaced" vs "user-deleted" can be distinguished by checking whether a live object with the same sync id now exists. [sim-test]

## 2. API sketch relevant to our library

```swift
// iOS — upsert that never orphans (derived from facts 7–8)
let cfg = HKWorkoutConfiguration(); cfg.activityType = .running; cfg.locationType = .outdoor
let b = HKWorkoutBuilder(healthStore: store, configuration: cfg, device: .local())
try await b.beginCollection(at: start)
try await b.addSamples([distanceSample, energySample])           // fresh samples for this version
try await b.addMetadata([HKMetadataKeySyncIdentifier: NSString(string: id),
                         HKMetadataKeySyncVersion: NSNumber(value: version)])
try await b.endCollection(at: end)
let w = try await b.finishWorkout()                               // version <= existing → throws (healthd.SQLite code 1)
// Previous version's samples are now orphans → either delete them (predicateForObjects(from: oldWorkout) captured *before* the save)
// or re-attach: try await store.addSamples(oldSamples, to: w)      // works, no duplication
let rb = HKWorkoutRouteBuilder(healthStore: store, device: nil)
try await rb.insertRouteData(locations)
_ = try await rb.finishRoute(with: w, metadata: [HKMetadataKeySyncIdentifier: NSString(string: id + "/route"),
                                                 HKMetadataKeySyncVersion: NSNumber(value: version)])
// route lower-version → silently returns the existing route (no error); equal → replaces.

// iOS — change feed
let q = HKAnchoredObjectQuery(type: .workoutType(), predicate: nil, anchor: saved, limit: HKObjectQueryNoLimit) { _, added, deleted, newAnchor, _ in
  for d in deleted ?? [] { let sid = d.metadata?[HKMetadataKeySyncIdentifier] as? String /* replaced vs removed */ }
  for s in added ?? [] { let own = s.sourceRevision.source.bundleIdentifier == Bundle.main.bundleIdentifier }
}
```

```kotlin
// Android — upsert & errors (facts 20–26)
val md = Metadata.manualEntry(clientRecordId = id, clientRecordVersion = version)   // version must be strictly monotonic per id
client.insertRecords(listOf(ExerciseSessionRecord(..., metadata = md, exerciseRoute = route)))
// equal version overwrites (source) — docs say ignore; lower version is a silent no-op.
try { ... } catch (e: IllegalStateException) {
  val code = (e.cause as? android.health.connect.HealthConnectException)?.errorCode
  when (code) { 7 -> RATE_LIMITED; 8 -> BUSY_RETRY_LATER; 9 -> UNSUPPORTED; else -> INTERNAL }
} catch (e: SecurityException) { PERMISSION } catch (e: IOException) { STORAGE_RETRY } catch (e: RemoteException) { IPC_RETRY }
catch (e: UnsupportedOperationException) { PROVIDER_UNAVAILABLE /* pre-34 APK path: not installed/disabled/needs update */ }
val token = client.getChangesToken(ChangesTokenRequest(setOf(ExerciseSessionRecord::class)))   // BEFORE the backfill read
val page = client.getChanges(token)        // page.changesTokenExpired → full re-read + dedupe by id
```

```ts
// unified surface (TS)
type HealthErrorCode = 'permission' | 'rateLimited' | 'busy' | 'unsupported' | 'providerUnavailable' | 'storage' | 'ipc' | 'staleVersion' | 'internal';
saveWorkout({ id, version, ...}) // throws { code: 'staleVersion' } when version <= stored (iOS: mapped from healthd error; Android: detected by reading back clientRecordVersion)
syncWorkouts({ cursor }) → { added: Workout[], removed: { id: string, replaced: boolean }[], cursor, resetRequired: boolean }
```

## 3. Design implications for a minimal-options unified API

- **Version contract:** require `version` to be a strictly increasing integer per `id`. Both stores treat *equal* as overwrite (iOS: new UUID; HC: in-place update), so "retry the same version" is safe only if the payload is identical — document that and prefer idempotent retries with the same version rather than bumping.
- **Never orphan on iOS:** before saving version N+1, capture `predicateForObjects(from: old)` samples/route; after `finishWorkout`, either re-attach with `addSamples(_:to:)` (cheap, proven) or delete the old samples and re-save fresh ones. Routes: always re-save the route with its own sync id (`${id}/route`) and the same version — this is the only way the new workout gets a route, and it yields a clean delete+add in the route feed.
- **`deleteWorkout(id)` must fan out:** delete route + associated samples (query `predicateForObjects(from:)` *before* deleting the workout, because the association is the only link) then the workout; on Android deleting the `ExerciseSessionRecord` by `clientRecordId` suffices for session+route, but distance/energy records you wrote separately need their own delete.
- **Stale-version handling:** iOS throws (workout) or silently returns the existing object (route); HC silently no-ops. Normalise to a `staleVersion` error by reading back the stored version after the write on Android and by comparing the returned route UUID on iOS.
- **Echo suppression:** iOS — drop `added` whose `sourceRevision.source.bundleIdentifier` is ours (or whose sync id is in our outbox); Android — drop `UpsertionChange` whose `metadata.dataOrigin.packageName == context.packageName`. Expose `isOwn: boolean` instead of hiding them, so the app can reconcile UUIDs.
- **Replaced vs removed:** for each `deleted` UUID, report `replaced: true` if a live object with the same sync id / clientRecordId exists in the same batch or store; otherwise `removed`.
- **Initial-sync state machine (both platforms):** (1) take the cursor first — HC `getChangesToken`, HK `anchor = nil` query *is* the backfill and returns `newAnchor`; (2) HC only: backfill with `readRecords` over the window the app wants (≤30 days unless `PERMISSION_READ_HEALTH_DATA_HISTORY` is granted); (3) drain `getChanges` until `!hasMore`; (4) persist cursor only after the app acknowledged the page. Token taken after the backfill loses writes made in between — this is why step 1 precedes step 2.
- **Cursor reset rule:** HC `changesTokenExpired` (token idle > 30 days) and HK anchor unarchive failure both → `resetRequired: true`; the module restarts at step 1 and the app dedupes by `id`. HK deletions can be purged before the app syncs (fact 34) — tell users the feed is "best effort for deletions older than the purge window"; optionally pair with `HKObserverQuery` + background delivery.
- **Hide:** per-type tokens (HC recommends them — keep one token per record type internally, expose one cursor blob), sync-identifier plumbing, HC name-based UUIDs, `HKMetadataKeyExternalUUID` (do not use it as an upsert key).
- **Config plugin:** write only `com.apple.developer.healthkit` (+ `background-delivery` when `backgroundSync: true`), never `healthkit.access`; do not add `healthkit` to `UIRequiredDeviceCapabilities` (nothing does today — keep it that way so iPad/Mac Catalyst installs are not blocked); Android manifest must carry exactly the declared read/write permissions.
- **Debug seeding:** compile it out (`#if DEBUG` / `BuildConfig.DEBUG`) — writing synthetic workouts in a store build is exactly 5.1.3(ii).

## 4. Pitfalls / gotchas

- Replacing a workout on iOS strands its samples and route; Health.app will show the new workout with 0 distance and the old distance still counts in daily totals (double counting + "inaccurate data").
- Equal-version re-save on iOS creates a *new UUID* every time — any app-side cache keyed by HK UUID is invalidated on retries.
- `HKWorkoutRouteBuilder.finishRoute` with a lower version silently returns the *existing* route; callers that assume "returned route == what I sent" will mis-report success.
- HC: `readRecords` older than 30 days errors without the history permission — the backfill must clamp or request the permission; uninstall/reinstall resets the window.
- HC: an unused token dies after 30 days; the first `getChanges` after `getChangesToken` is legitimately empty (issue #243 is user error, but our API should make the backfill explicit so nobody repeats it).
- HC `IllegalStateException` is a grab-bag (codes 1, 2, 7, 8, 9) — always inspect `cause.errorCode`; pre-34 devices throw `UnsupportedOperationException` for provider-missing cases.
- Play: the declaration must cover write types too; Google's list omits internal testing — do not assume internal-track builds are exempt, and do not assume they are blocked either (untested).
- Apple: no `healthkit.access`; privacy policy URL in App Store Connect; HealthKit purpose visible in UI/marketing; no synthetic writes in release.
- Expo prebuild never adds `healthkit` to `UIRequiredDeviceCapabilities` — good — but the Xcode-UI path does; if someone opens the workspace and toggles the capability, the plist changes and iPad/Mac Catalyst installs break.

## 5. Open questions

**Needs a USER decision**
- On iOS re-save, re-attach old samples (`addSamples(_:to:)`) or delete-and-rewrite? Re-attach is cheaper and keeps UUIDs; rewrite guarantees the samples match the new payload.
- Should `syncWorkouts` surface own writes (`isOwn`) or filter them?
- Request `PERMISSION_READ_HEALTH_DATA_HISTORY` by default (extra permission prompt + Play declaration) or cap backfill at 30 days?

**Needs a hands-on device test**
- Repeat probe runs 1–2 on a **physical iPhone (iOS 26.x)** — simulator HealthKit shares the daemon code but route builder / locked-device paths differ.
- Android Pixel_9a (API 36): insert `ExerciseSessionRecord` with clientRecordId X v1 → v1 again (equal) → v0 (lower) → v2; count via `readRecords` and compare `metadata.lastModifiedTime`/`clientRecordVersion` to confirm facts 20–21 end-to-end. Harness sketch: tiny Kotlin app, grant with `adb shell pm grant <pkg> android.permission.health.WRITE_EXERCISE` (verify `pm grant` works for health permissions on 14+), drive with `adb shell input tap` only if the permission UI appears. Also exceed 1000 background reads / 15 min to observe `IllegalStateException(cause.errorCode == 7)`.
- An API 33 device with the Play HC APK: same upsert matrix + provider-missing errors (`UnsupportedOperationException`).
- Upload an **internal-testing** build without the Play declaration and try to link HC, to close fact 16's gap.
- iOS: whether an HK anchor survives app reinstall/OS upgrade (expected: reinstall → new store view, anchor meaningless → must reset).

**Needs more research**
- Whether EAS capability sync errors, strips, or ignores `com.apple.developer.healthkit.access = []`.
- Exact HC behaviour when `updateRecords` is called with a *lower* `clientRecordVersion` (same `>=` helper is used, but the update entry point may validate differently).
- Whether HK's equal-version replacement is iOS-26-specific or long-standing (check on an iOS 17/18 device).

## 6. Sources

- https://developer.apple.com/documentation/healthkit/hkmetadatakeysyncidentifier
- https://developer.apple.com/documentation/healthkit/hkmetadatakeysyncversion
- https://developer.apple.com/documentation/healthkit/hkmetadatakeyexternaluuid
- https://developer.apple.com/documentation/healthkit/hkhealthstore/delete(_:withcompletion:)-78l1m
- https://developer.apple.com/documentation/healthkit/hkhealthstore/deleteobjects(of:predicate:withcompletion:)
- https://developer.apple.com/documentation/healthkit/hkhealthstore/add(_:to:completion:)
- https://developer.apple.com/documentation/healthkit/hkhealthstore/save(_:withcompletion:)-47iwb
- https://developer.apple.com/documentation/healthkit/hkworkoutbuilder/finishworkout(completion:)
- https://developer.apple.com/documentation/healthkit/hkworkoutroutebuilder/finishroute(with:metadata:completion:)
- https://developer.apple.com/documentation/healthkit/reading-route-data
- https://developer.apple.com/documentation/healthkit/hkanchoredobjectquerydescriptor
- https://developer.apple.com/documentation/healthkit/hkanchoredobjectquery/init(type:predicate:anchor:limit:resultshandler:)
- https://developer.apple.com/documentation/healthkit/hkdeletedobject
- https://developer.apple.com/documentation/healthkit/hkqueryanchor
- https://developer.apple.com/documentation/healthkit/setting-up-healthkit
- https://developer.apple.com/documentation/healthkit/protecting-user-privacy
- https://developer.apple.com/documentation/bundleresources/entitlements/com.apple.developer.healthkit
- https://developer.apple.com/documentation/bundleresources/entitlements/com.apple.developer.healthkit.access
- https://developer.apple.com/documentation/bundleresources/information-property-list/uirequireddevicecapabilities
- https://developer.apple.com/app-store/review/guidelines/
- https://developer.apple.com/forums/thread/658843
- https://developer.apple.com/forums/thread/115186
- https://docs.expo.dev/build-reference/ios-capabilities/
- https://raw.githubusercontent.com/expo/expo/main/templates/expo-template-bare-minimum/ios/HelloWorld/Info.plist
- https://raw.githubusercontent.com/kingstinct/react-native-healthkit/master/packages/react-native-healthkit/app.plugin.ts
- https://raw.githubusercontent.com/agencyenterprise/react-native-health/master/app.plugin.js
- local: `node_modules/.pnpm/@expo+config-plugins@56.0.15_typescript@6.0.3/node_modules/@expo/config-plugins/build/plugins/withIosBaseMods.js`
- https://developer.android.com/health-and-fitness/guides/health-connect/publish/declare-access
- https://developer.android.com/health-and-fitness/health-connect/get-started
- https://support.google.com/googleplay/android-developer/answer/14738291
- https://developer.android.com/health-and-fitness/guides/health-connect/common-workflows/sync-data
- https://developer.android.com/health-and-fitness/guides/health-connect/develop/write-data
- https://developer.android.com/health-and-fitness/guides/health-connect/develop/read-data
- https://developer.android.com/health-and-fitness/health-connect/rate-limiting
- https://developer.android.com/reference/android/health/connect/HealthConnectException
- https://developer.android.com/reference/kotlin/androidx/health/connect/client/HealthConnectClient
- https://android.googlesource.com/platform/packages/modules/HealthFitness/+/refs/heads/android16-release/service/java/com/android/server/healthconnect/storage/datatypehelpers/RecordHelper.java (also android15-release, main)
- https://android.googlesource.com/platform/packages/modules/HealthFitness/+/refs/heads/android16-release/service/java/com/android/server/healthconnect/storage/TransactionManager.java
- https://android.googlesource.com/platform/packages/modules/HealthFitness/+/refs/heads/android16-release/service/java/com/android/server/healthconnect/storage/request/UpsertTableRequest.java
- https://android.googlesource.com/platform/packages/modules/HealthFitness/+/refs/heads/android16-release/service/java/com/android/server/healthconnect/storage/utils/StorageUtils.java
- https://android.googlesource.com/platform/frameworks/support/+/refs/heads/androidx-main/health/connect/connect-client/src/main/java/androidx/health/connect/client/impl/platform/ExceptionConverter.kt
- https://android.googlesource.com/platform/frameworks/support/+/refs/heads/androidx-main/health/connect/connect-client/src/main/java/androidx/health/connect/client/impl/HealthConnectClientUpsideDownImpl.kt
- https://android.googlesource.com/platform/frameworks/support/+/refs/heads/androidx-main/health/connect/connect-client/src/main/java/androidx/health/platform/client/impl/error/ErrorStatusConverter.kt
- https://android.googlesource.com/platform/frameworks/support/+/refs/heads/androidx-main/health/connect/connect-client/src/main/java/androidx/health/platform/client/error/ErrorCode.kt
- https://registry.npmjs.org/@kingstinct/react-native-healthkit
- https://api.github.com/repos/matinzd/react-native-health-connect/issues/243
- https://www.aifitnessapi.com/fix/health-connect-no-data (secondary, unverified)
- Simulator probe: `/private/tmp/claude-501/-Users-apeltop-project-service-gj-kit/b6be1602-1eae-490e-96b9-ab07f2be21f7/scratchpad/hkprobe/` ; raw results `hkprobe-run1.txt`, `hkprobe-run2.txt` in this directory
