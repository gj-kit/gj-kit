# Follow-up verification batch 1 — Health Connect routes/upsert/minSdk, HealthKit route builder, Play & privacy declarations

Date: 2026-08-22. Method: primary sources only — AOSP `packages/modules/HealthFitness` (branch `main`, HEAD 45168a88, 2025-03-11; cross-checked against `android17-release` a292a16 where files were resolvable), androidx `frameworks/support` (`androidx-main`), the published AARs from `dl.google.com`, the local Xcode 26.6 iOS 26.5 SDK headers, Apple doc JSON endpoints, Play Console help pages, and a headless boot of the local `Pixel_9a` AVD (Android 16 / API 36, `google_apis_playstore`, Health Connect controller APEX versionName 16 / versionCode 36).

Confidence tags: [official-doc] [source-code] [device-test] [secondary] [unverified].

---

## Verdict table

| Item | Verdict | One-line corrected statement |
|---|---|---|
| 1 | **CONFIRMED** (two refinements) | `READ_EXERCISE_ROUTES` exists (API 35; API 34 via SDK ext 12), is `dangerous`, is dropped by the **platform's** permission-request UI (not by the SDK), the route dialog returns `RESULT_CANCELED` → `null` when the permission is not in the manifest, foreign routes in background are never attached regardless of `READ_HEALTH_DATA_IN_BACKGROUND`, and own routes are attached only while `WRITE_EXERCISE_ROUTE` **or** `READ_EXERCISE_ROUTES` is held. |
| 2 | **PARTIALLY** | Same `clientRecordId` ⇒ same name-based UUID ⇒ conflict ⇒ update when `newVersion >= oldVersion`, silently skipped when lower — never duplicated. Re-upsert without a route while holding `WRITE_EXERCISE_ROUTE` deletes the stored route. Route rows cascade on session delete; metric records do not. **Unknown id on `deleteRecords` is documented as an IPC failure in the SDK KDoc but the Android 14+ AOSP path does not throw for it** (only for ids owned by another app) — needs a device test. |
| 3 | **RESOLVED — B wins (minSdk 26)** | Both `connect-client-1.1.0.aar` and `1.2.0-alpha05.aar` declare `minSdkVersion="26"`; `build.gradle` on `androidx-main` pins `minSdk { version = release(26) }`. The "minSdk 24" release note points at a repo-wide default change (commit 07cc6ea, 2026-07-28) that connect-client overrides. alpha05 additionally requires `minCompileSdk=37` and AGP ≥ 9.1.0. |
| 4 | **UNRESOLVABLE-WITHOUT-DEVICE-TEST** | Apple's own sources contradict each other (header: "never call finishRoute with a workout builder"; web article: call `finishRoute(with:)` after saving the workout, using a `seriesBuilder(for:)`-obtained builder). Test plan in §5. The domain-model order (`seriesBuilder(for:)` **after** `finishWorkout()`) is unsupported by any source. |
| 5 | **RESOLVED — B wins** | `getExerciseRouteReadAccessType` returns `NONE` when the caller holds none of `{READ_EXERCISE_ROUTE(signature), READ_EXERCISE_ROUTES, WRITE_EXERCISE_ROUTE}`; own routes are attached only when at least one is held; the SDK then maps `route == null && hasRoute()` → `ConsentRequired` even for the caller's own session. |
| 6 | **PARTIALLY** (gap narrowed) | Declaration is required for closed testing, open testing and production (internal testing is not listed); enforcement dialog is described only for apps "published in the Play store and released to the public"; a changed data-type set requires re-declaring and is reviewed "as part of the app review process". No official review SLA exists. Whether internal-testing/sideloaded builds are gated remains a device test. |
| 7 | **RESOLVED** | The library's `PrivacyInfo.xcprivacy` must not claim collected data for the app; the **app** declares `NSPrivacyCollectedDataTypeHealth` (and `…Fitness`, `…PreciseLocation` if routes are uploaded), linked = true, tracking = false, purpose `NSPrivacyCollectedDataTypePurposeAppFunctionality`, and answers the App Store Connect questionnaire identically. On Play, "Health info"/"Fitness info" (+ "Approximate/Precise location" for routes) must be declared as *collected* in Data safety because "collected" = transmitted off device. |

---

## 1. Facts (numbered; each ends with [confidence] + source URL)

### Item 1 — `android.permission.health.READ_EXERCISE_ROUTES`

1. Local Android SDK `platforms/android-36/data/api-versions.xml` (and `android-36.1`) contains `field name="READ_EXERCISE_ROUTES" since="35" sdks="34:12,35:12,0:35"` — i.e. base API 35, and API 34 with SDK extension 12. `WRITE_EXERCISE_ROUTE` has no `since` attribute beyond the platform default (API 34). [source-code] file: `$ANDROID_HOME/platforms/android-36/data/api-versions.xml`
2. AOSP `apk/HealthPermissionsManifest.xml` L68-72: `<permission android:name="android.permission.health.READ_EXERCISE_ROUTES" … android:protectionLevel="dangerous" android:permissionGroup="android.permission-group.HEALTH" />`; L74-77 `READ_EXERCISE_ROUTE` (singular) is `protectionLevel="signature"`; L390-394 `WRITE_EXERCISE_ROUTE` is `dangerous` in group HEALTH. `android17-release` adds `android:permissionFlags="allowedInPrivateComputeCore"` to `READ_EXERCISE_ROUTES`, otherwise identical. [source-code] https://android.googlesource.com/platform/packages/modules/HealthFitness/+/refs/heads/main/apk/HealthPermissionsManifest.xml
3. Framework javadoc (`HealthPermissions.java` L208-223): "This permission can only be granted manually by a user in Health Connect settings or in the route request activity which can be launched using `ACTION_REQUEST_EXERCISE_ROUTE`. **Attempts to request the permission by applications will be ignored.** … Protection level: dangerous." Annotated `@FlaggedApi("com.android.healthconnect.flags.read_exercise_routes_all_enabled")` on both `main` and `android17-release`. [source-code] https://android.googlesource.com/platform/packages/modules/HealthFitness/+/refs/heads/main/framework/java/android/health/connect/HealthPermissions.java
4. Where it is ignored: platform UI `RequestPermissionViewModel.kt` — L461-465 `additionalNotGrantedPermissions = filteredPermissions.filter { isAdditionalPermission(…) }.filterNot { permission.toString() == HealthPermissions.READ_EXERCISE_ROUTES }` and L352-355 `requestAdditionalPermissions(): requestedPermissions.filterKeys { it is AdditionalPermission }.filterKeys { it != AdditionalPermission.READ_EXERCISE_ROUTES }`. Also L428-431 `// Do not show undeclared or invalid permissions` `.filter { validPermissions.contains(permission) }` (manifest-declared only) and unparsable strings are dropped with `Log.e(TAG, "Unrecognized health exception!")`. So the drop happens in the Health Connect module UI, silently; the returned granted set simply lacks it. [source-code] https://android.googlesource.com/platform/packages/modules/HealthFitness/+/refs/heads/main/apk/src/com/android/healthconnect/controller/permissions/request/RequestPermissionViewModel.kt
5. The SDK contract does **not** filter it client-side: `HealthPermissionsRequestContract.createIntent` only `require(input.all { it.startsWith("android.permission.health.") })`; on API ≥ 34 it delegates to `HealthPermissionsRequestModuleContract`, below to `HealthPermissionsRequestAppContract(providerPackageName)`. [source-code] https://android.googlesource.com/platform/frameworks/support/+/refs/heads/androidx-main/health/connect/connect-client/src/main/java/androidx/health/connect/client/contracts/HealthPermissionsRequestContract.kt
6. SDK KDoc for `PERMISSION_READ_EXERCISE_ROUTES`: "This permission can't be granted via the standard permission request mechanism, and can only be granted by a user in Settings, or via the dialog launched by `ExerciseRouteRequestContract`. When this permission is granted, the app can read exercise routes without user interaction, however reading apps must be in the foreground unless `android.permission.health.READ_HEALTH_DATA_IN_BACKGROUND` is also granted." (The last clause is contradicted by the service code — see fact 9.) [source-code] https://android.googlesource.com/platform/frameworks/support/+/refs/heads/androidx-main/health/connect/connect-client/src/main/java/androidx/health/connect/client/permission/HealthPermission.kt
7. Route dialog (`RouteRequestActivity.kt`): L95-99 `if (!viewModel.isReadRoutesPermissionDeclared(callingPackageName)) { Log.e(TAG, "Read permission not declared"); finishCancelled(); return }` where `isReadRoutesPermissionDeclared` = `packageInfo.requestedPermissions.contains(READ_EXERCISE_ROUTES)` (manifest `<uses-permission>`); `finishCancelled()` sets `RESULT_CANCELED`. Then in `setupRequestDialog`: no/empty route → cancelled; `dataOrigin.packageName == callingPackage && (READ_EXERCISE_ROUTES || WRITE_EXERCISE_ROUTE granted)` → route returned **without dialog**; `isSessionInaccessible` → cancelled; `READ_EXERCISE_ROUTES` granted → returned; permission `FLAG_PERMISSION_USER_FIXED` → cancelled **silently**; otherwise the dialog with "Allow" (one-time) and "Allow all" (`grantReadRoutesPermission` → grants `READ_EXERCISE_ROUTES`). [source-code] https://android.googlesource.com/platform/packages/modules/HealthFitness/+/refs/heads/main/apk/src/com/android/healthconnect/controller/route/RouteRequestActivity.kt
8. SDK `ExerciseRouteRequestContract.parseResult`: "@return null if the user didn't grant access to the exercise route or if there's no exercise route for the session id passed on createIntent"; `createIntent` throws `IllegalArgumentException` for an empty session id; delegates to `ExerciseRouteRequestModuleContract` (API ≥ 34) or `ExerciseRouteRequestAppContract` (HC APK, closed source). [source-code] https://android.googlesource.com/platform/frameworks/support/+/refs/heads/androidx-main/health/connect/connect-client/src/main/java/androidx/health/connect/client/contracts/ExerciseRouteRequestContract.kt
9. Service read path: `HealthConnectServiceImpl.readRecords` L693 `final boolean isInForeground = mAppOpsManagerLocal.isUidInForeground(uid);` — `READ_HEALTH_DATA_IN_BACKGROUND` is only enforced as the gate for background reads (L706-710); it does **not** change the `isInForeground` value passed to the route logic (L767). [source-code] https://android.googlesource.com/platform/packages/modules/HealthFitness/+/refs/heads/main/service/java/com/android/server/healthconnect/HealthConnectServiceImpl.java
10. `ExerciseSessionRecordHelper.getExerciseRouteReadAccessType` (L547-573): `if (grantedExtraReadPermissions.isEmpty()) return NONE; if (contains(READ_EXERCISE_ROUTE)) return ALL /* HC UI Controller */; … canReadAllRoutes = isInForeground && contains(READ_EXERCISE_ROUTES); return canReadAllRoutes ? ALL : OWN;` and `getExtraReadPermissions()` = `List.of(READ_EXERCISE_ROUTE, READ_EXERCISE_ROUTES, WRITE_EXERCISE_ROUTE)` with the comment "WRITE_EXERCISE_ROUTE is in fact a read permission as it allows reading own routes." Identical on `main` (2025-03-11); the `android17-release` copy of this file could not be fetched at the same path (moved), manifest/framework were fetched and agree. [source-code] https://android.googlesource.com/platform/packages/modules/HealthFitness/+/refs/heads/main/service/java/com/android/server/healthconnect/storage/datatypehelpers/ExerciseSessionRecordHelper.java
11. SDK mapping to the tri-state: API ≥ 34 `RecordConverters.kt` L422-425 `exerciseRouteResult = route?.let { ExerciseRouteResult.Data(it.toSdkExerciseRoute()) } ?: if (hasRoute()) ExerciseRouteResult.ConsentRequired() else ExerciseRouteResult.NoData()`; pre-34 `ProtoToRecordConverters.kt` L458-464 same logic on `valuesMap["hasRoute"]`. [source-code] https://android.googlesource.com/platform/frameworks/support/+/refs/heads/androidx-main/health/connect/connect-client/src/main/java/androidx/health/connect/client/impl/platform/records/RecordConverters.kt
12. Device: Pixel_9a AVD (fingerprint `google/sdk_gphone64_arm64/emu64a:16/BP22.250325.006/13344233:user/release-keys`, `ro.build.version.sdk=36`). `pm list permissions -g -d` lists under `group:android.permission-group.HEALTH`: `READ_EXERCISE_ROUTES`, `WRITE_EXERCISE_ROUTE`, `READ_HEALTH_DATA_IN_BACKGROUND`, `READ_HEALTH_DATA_HISTORY`, `READ_EXERCISE`, `WRITE_EXERCISE`, …; `dumpsys package permission android.permission.health.READ_EXERCISE_ROUTES` → `sourcePackage=com.google.android.healthconnect.controller … prot=dangerous`; `device_config list health_fitness` contains `exercise_routes_enable=true`. Controller APK path `/apex/com.android.healthfitness/priv-app/HealthConnectControllerGoogle@360915160/…`, `versionName=16 versionCode=36`. Quirk: `pm list permissions -f` (no `-g`) printed only the signature `READ_EXERCISE_ROUTE`; use `-g -d` or `dumpsys`. [device-test]
13. `ALL_PERMISSIONS` in the SDK includes `PERMISSION_READ_EXERCISE_ROUTES` unconditionally (no SDK-level gate), so passing it through `getGrantedPermissions()`/the contract on an API 33 HC-APK device is legal; what the closed-source HC APK does with it is not verifiable from source. [source-code]/[unverified] https://android.googlesource.com/platform/frameworks/support/+/refs/heads/androidx-main/health/connect/connect-client/src/main/java/androidx/health/connect/client/permission/HealthPermission.kt

### Item 2 — clientRecordId / clientRecordVersion, route deletion on upsert, deleteRecords, cascade

14. `UpsertTransactionRequest.createForInsert` (L64-75): "For insert, we should generate a fresh UUID. Don't let the client choose it." → `addNameBasedUUIDTo(recordInternal)`; `StorageUtils.addNameBasedUUIDTo` (L138-151): `clientRecordId` empty → `UUID.randomUUID()`, otherwise `getUUID(packageName, clientRecordId, recordType)` (deterministic name-based UUID). [source-code] https://android.googlesource.com/platform/packages/modules/HealthFitness/+/refs/heads/main/service/java/com/android/server/healthconnect/storage/utils/StorageUtils.java
15. `RecordHelper` L99-102 `UNIQUE_COLUMNS_INFO = (dedupe_hash BLOB, uuid BLOB)`; `getUpsertTableRequest` L258-305 installs `IRequiresUpdate`: if the conflicting row's UUID differs (dedupe-hash collision) → "Use old UUID in case of conflicts on de-dupe … we want to update in this case" → `return true`; else `return newClientRecordVersion >= clientRecordVersion;`. [source-code] https://android.googlesource.com/platform/packages/modules/HealthFitness/+/refs/heads/main/service/java/com/android/server/healthconnect/storage/datatypehelpers/RecordHelper.java
16. `TransactionManager.insertOrReplaceOnConflict` (L249-281): `db.insertWithOnConflict(…, CONFLICT_FAIL)`; on `SQLiteConstraintException` → read the existing row → `updateEntriesIfRequired` (L932-954): `if (!request.requiresUpdate(cursor, request)) return -1;` otherwise `db.update(...)`, then `deleteChildTableRequest` + `insertChildTableRequest` for the row. So a lower `clientRecordVersion` is a **silent no-op** (no insert, no duplicate, no error); equal or higher overwrites; insertRecords takes this branch when `shouldPreferNewRecord()` is true. [source-code] https://android.googlesource.com/platform/packages/modules/HealthFitness/+/refs/heads/main/service/java/com/android/server/healthconnect/storage/TransactionManager.java
17. Dedupe without `clientRecordId`: `StorageUtils.getDedupeByteBuffer` — `if (!isEmpty(record.getClientRecordId())) return null; // If dedupe by clientRecordId then don't dedupe by hash`; interval records hash `(appInfoId, deviceInfoId, startTimeMillis, endTimeMillis)` (hydration/nutrition exempt); instant records `(appInfoId, deviceInfoId, timeMillis)`. A retried write of the same session **without** a clientRecordId therefore also collides and updates the existing row (keeping the old UUID). [source-code] same URL as fact 14
18. SDK KDoc `insertRecords`: "When a subsequent insertRecords is called with the same clientRecordId, whichever Record with the higher clientRecordVersion takes precedence." `Metadata.clientRecordVersion` defaults to 0. [source-code] https://android.googlesource.com/platform/frameworks/support/+/refs/heads/androidx-main/health/connect/connect-client/src/main/java/androidx/health/connect/client/HealthConnectClient.kt
19. Official sync-data guide: "Upserting data means that any existing data in Health Connect gets overwritten as long as the clientRecordId values exist in the Health Connect datastore, and the clientRecordVersion is higher than the existing value. **Otherwise, the upserted data is written as new data.**" — the last sentence is contradicted by the source (facts 14-16): an equal version overwrites and a lower version is dropped; nothing is "written as new data" while the clientRecordId matches. The live source code wins over my memory and over this doc sentence. [official-doc, contradicted by source-code] https://developer.android.com/health-and-fitness/guides/health-connect/develop/sync-data
20. Route deletion on re-upsert: `ExerciseSessionRecordHelper.getChildTablesWithRowsToBeDeletedDuringUpdate` (L219-233) always deletes laps & segments child rows and adds the route table **only** `if (canWriteExerciseRoute(extraWritePermissionToState))` — comment: "If on session update app doesn't have granted write_route, then we leave the route as is." `updateUpsertValuesIfRequired` (L235-247) removes `HAS_ROUTE` from the update when the permission is missing. `getRequiredExtraWritePermissions` returns `[WRITE_EXERCISE_ROUTE]` when `session.getRoute() != null`. [source-code] same URL as fact 10
21. SDK KDoc `PERMISSION_WRITE_EXERCISE_ROUTE`: "An attempt to insert/update a session with a set route without the permission granted will result in a failed call and the session insertion/update will be rejected. If the permission is not granted the previously written route will not be deleted if the session gets updated with no route set." (⇒ with the permission granted, an update with no route **does** delete the stored route.) [source-code] same URL as fact 6
22. `deleteRecords` unknown id — SDK KDoc: "Deleting by invalid identifiers such as a non-existing identifier or deleting the same record multiple times will result in IPC failure." [source-code] same URL as fact 18
23. `deleteRecords` unknown id — AOSP (API ≥ 34): `DeleteTransactionRequest` (L67-86) derives the UUID via `StorageUtils.getUUIDFor(recordId, packageName)` (name-based for clientRecordId), de-duplicates repeated ids ("id has been already been processed; continue"), and `RecordHelper.getDeleteTableRequest(List<UUID>)` sets `setRequiresUuId + setEnforcePackageCheck` → `requiresRead()`; `TransactionManager.deleteAllRecords` (L351-420) reads the matching rows, throws `IllegalArgumentException("<appId> is not the owner for <uuid>")` only for rows owned by **another** app, counts `numberOfUuidsToDelete` (0 for unknown ids) and runs `db.execSQL(delete)` — no exception for a non-existing id. The KDoc sentence appears stale for the module path; the pre-34 HC APK path is closed source. [source-code] https://android.googlesource.com/platform/packages/modules/HealthFitness/+/refs/heads/main/service/java/com/android/server/healthconnect/storage/request/DeleteTransactionRequest.java
24. Cascade: `CreateTableRequest.getFkConstraint()` emits `FOREIGN KEY (…) REFERENCES <parent>(…) ON DELETE CASCADE` (L283-291); `ExerciseRouteRecordHelper.getCreateRouteTableRequest(parentTableName)` uses `addForeignKey(parentTableName, [parent_key], [row_id])`. Heart-rate/distance/etc. records are separate top-level tables with no FK to the session. [source-code] https://android.googlesource.com/platform/packages/modules/HealthFitness/+/refs/heads/main/service/java/com/android/server/healthconnect/storage/request/CreateTableRequest.java

### Item 3 — connect-client minSdk / compileSdk / AGP

25. Downloaded `https://dl.google.com/android/maven2/androidx/health/connect/connect-client/1.1.0/connect-client-1.1.0.aar` (1,315,867 B) and `…/1.2.0-alpha05/connect-client-1.2.0-alpha05.aar` (1,316,807 B). Both `AndroidManifest.xml`: `<uses-sdk android:minSdkVersion="26" />`. `META-INF/com/android/build/gradle/aar-metadata.properties`: 1.1.0 → `minCompileSdk=36`, `minAndroidGradlePluginVersion=8.9.1`; 1.2.0-alpha05 → `minCompileSdk=37`, `minCompileMinorSdk=0`, `minAndroidGradlePluginVersion=9.1.0`. [source-code] `group-index.xml` lists alpha05 as the newest connect-client version as of today. https://dl.google.com/android/maven2/androidx/health/connect/group-index.xml
26. `androidx-main` `health/connect/connect-client/build.gradle` L65-73: `android { defaultConfig { minSdk { version = release(26) } } … compileSdk { version = release(37) } }`. [source-code] https://android.googlesource.com/platform/frameworks/support/+/refs/heads/androidx-main/health/connect/connect-client/build.gradle
27. Release notes: "Version 1.2.0-alpha05 — August 12, 2026 — New Features: The minimum SDK requirement for this library is now API 24 (minSdk 24). (07cc6ea)". Commit 07cc6ea ("Move to default minSdk 24", 2026-07-28) changes `buildSrc/…/AndroidXConfig.kt` `minSdk: Int = 23 → 24` and lint baselines — a **repo-wide default**, overridden by connect-client's explicit 26. The note is auto-generated and misleading. [official-doc + source-code] https://developer.android.com/jetpack/androidx/releases/health-connect and https://android.googlesource.com/platform/frameworks/support/+/07cc6ea9413a439370e4baccae250d842acff222%5E%21/
28. Get-started guide: "The Health Connect SDK supports Android 8 (API level 26) or higher, while the Health Connect app is only compatible with Android 9 (API level 28) or higher." [official-doc] https://developer.android.com/health-and-fitness/health-connect/get-started
29. Expo SDK 57 `expo-modules-core/android/ExpoModulesCorePlugin.gradle`: `compileSdkVersion safeExtGet("compileSdkVersion", 36)`, `minSdkVersion safeExtGet("minSdkVersion", 24)`, `targetSdkVersion 36`; RN 0.86 `packages/gradle-plugin/gradle/libs.versions.toml` `agp = "8.12.0"`. ⇒ `1.2.0-alpha05` cannot be consumed by a default Expo 57 / RN 0.86 build (AGP rejects AAR metadata requiring 9.1.0 / compileSdk 37); `1.1.0` (minCompileSdk 36, AGP 8.9.1) is compatible. [source-code] https://raw.githubusercontent.com/expo/expo/sdk-57/packages/expo-modules-core/android/ExpoModulesCorePlugin.gradle and https://raw.githubusercontent.com/facebook/react-native/0.86-stable/packages/gradle-plugin/gradle/libs.versions.toml

### Item 4 — HKWorkoutRouteBuilder finish semantics

30. Local header `iPhoneOS26.5.sdk/…/HealthKit.framework/Headers/HKWorkoutRouteBuilder.h`: class discussion "Calling finishRouteWithWorkout:metadata: will stop and complete the route. If the builder is deleted, or the client goes away before calling the finish method, data will be lost."; `initWithHealthStore:device:` — "If you are using an HKWorkoutBuilder , you should not create an HKWorkoutRouteBuilder, instead use -[HKWorkoutBuilder seriesBuilderForType:]"; `finishRouteWithWorkout:metadata:completion:` — "**If you are using this route builder with a workout builder, you should never call this method. The route will be finished when you finish the workout builder.**" and "The receiver will be considered invalid afterwards and any further calls to it will result in an error." [source-code: SDK header]
31. `HKWorkoutBuilder.h` `seriesBuilderForType:`: "Retrieves, and creates if it does not already exist, the series builder for the specified type. **The series constructed with the returned builder will be associated with the workout when it is finished.**" `addSamples:` "It is an error to call this method after finishWorkoutWithCompletion: has been called." `finishWorkoutWithCompletion:` "Creates and saves an HKWorkout using samples and events that have been added to workout previously." (no mention of series builders). [source-code: SDK header]
32. Apple web doc `HKWorkoutRouteBuilder`: "To create a workout route, use seriesBuilder(for:) to instantiate a HKWorkoutRouteBuilder … After the workout ends, call the builder's finishRoute(with:metadata:completion:) method to construct the route. Instantiating a HKWorkoutRouteBuilder directly is discouraged." `init(healthStore:device:)`: "Use of this initializer is discouraged. Use HKWorkoutBuilder.seriesBuilder(for:) instead." Availability iOS 11+, **not deprecated**. [official-doc] https://developer.apple.com/documentation/healthkit/hkworkoutroutebuilder and https://developer.apple.com/documentation/healthkit/hkworkoutroutebuilder/init(healthstore:device:)
33. Apple web doc `finishRoute(with:metadata:completion:)`: "You must call finishRoute(with:metadata:completion:) before the system deallocates the builder. Failure to do so results in a loss of all route data added to the builder." "This method fails if you haven't added any location data to the builder." "workout: … You must have already saved this workout to the HealthKit store." [official-doc] https://developer.apple.com/documentation/healthkit/hkworkoutroutebuilder/finishroute(with:metadata:completion:)
34. Apple article "Creating a workout route": obtains the builder with `workoutBuilder.seriesBuilder(for: HKSeriesType.workoutRoute()) as? HKWorkoutRouteBuilder`, and step 5 "Finish the route — After saving the workout, add any remaining locations to the route builder and call finishRoute(with:metadata:completion:)". Also: "Don't add any locations whose accuracy is greater than 50 meters. For best results, try to keep the time between locations to 3 seconds or less." and "you must request permission to read and share both HKWorkout and HKWorkoutRoute samples." [official-doc] https://developer.apple.com/documentation/healthkit/creating-a-workout-route
35. `HKWorkoutBuilder.seriesBuilder(for:)` web doc abstract only: "Returns the series builder for the specified type, creating a new builder, if necessary." — no statement about calling it after `finishWorkout()`. [official-doc] https://developer.apple.com/documentation/healthkit/hkworkoutbuilder/seriesbuilder(for:)

### Item 5 — own routes after `WRITE_EXERCISE_ROUTE` revocation

36. See facts 10-11: with `grantedExtraReadPermissions` empty the access type is `NONE`, no route rows are read for any session (own included), and the SDK reports `ConsentRequired` because the session row still has `has_route = 1`. With only `WRITE_EXERCISE_ROUTE` held → `OWN`; with `READ_EXERCISE_ROUTES` held → `ALL` in foreground, `OWN` in background. [source-code]
37. Route dialog fallback for own sessions: `RouteRequestActivity` returns the route without a dialog only when the session is the caller's **and** `READ_EXERCISE_ROUTES || WRITE_EXERCISE_ROUTE` is granted; otherwise the own session goes through the same accessibility check / consent dialog as a foreign one. [source-code] same URL as fact 7

### Item 6 — Play Console Health apps declaration

38. Play Console Help 14738291 ("Provide information for the Health apps declaration form"): "All developers that have an app published on Google Play must complete the Health apps declaration, **including apps on closed testing, open testing, or production tracks.**" "System services and private apps do not need to complete the Health apps declaration." "After you complete and submit the Health apps declaration, the information that you provided will be reviewed by Google as part of the app review process." Internal testing is not mentioned; no review duration is given. [official-doc] https://support.google.com/googleplay/android-developer/answer/14738291
39. Android docs "Declare access to Health Connect data types": "This process must be completed for all publishing requests, both for a new app that has not been published yet, or when updating an existing, already published app that now uses a different set of data types." "If your health app is **published in the Play store and released to the public**, but you didn't request for data type accesses, your end users receive the following dialog when attempting to link with Health Connect: [A dialog showing users that the app can't access Health Connect.]" "If your app has a new data type requirement, or if your app no longer supports a data type, fill out the Health apps declaration form again." "If your app does not require access to specific data types, you must not request access to them." "As part of your app publishing process, you must provide information for Google Play's Data safety section." [official-doc] https://developer.android.com/health-and-fitness/guides/health-connect/publish/declare-access
40. Get-started: "Note: If you are applying for another request in case your app requires new data types, you need to include both new and existing data types, and exclude any data types you no longer need." [official-doc] https://developer.android.com/health-and-fitness/health-connect/get-started
41. Play policy 9888170 (Health Connect by Android permissions): "Access to Health Connect data is restricted to apps with approved health, fitness, medical care, or health research core use cases." "Submit a declaration form in your Play Console and provide a clear and detailed justification…" "Request only the minimum necessary data types". [official-doc] https://support.google.com/googleplay/android-developer/answer/9888170
42. Play policy 16679511 (Health Content and Services): "Data accessed through Health Connect Permissions is regarded as personal and sensitive user data subject to the User Data policy." "Permissions that are not required for a health app to perform its core functionality should not be requested and unused permissions must be removed." [official-doc] https://support.google.com/googleplay/android-developer/answer/16679511
43. Play help 12991134 (Android Health Permissions FAQ): "All access requests for health & fitness and body sensor permissions will be subject to review so that the use of this sensitive data aligns with approved use cases." No timeline. [official-doc] https://support.google.com/googleplay/android-developer/answer/12991134
44. Review duration: no official figure anywhere above; third-party blogs cite "about 7 days"; Play community threads (e.g. thread 398224811 "Health Connect App rejected – Excessive data access for declared feature", 288434034 "Repeated rejection (Inaccurate Health Apps Declaration)") exist but their bodies could not be fetched. [unverified]
45. Sideloaded/debug builds: one secondary article states debug/sideloaded builds are not gated while Play installs are; this is consistent with fact 39's wording but is not an official statement. [secondary] https://www.aifitnessapi.com/fix/health-connect-no-data

### Item 7 — Privacy manifest / privacy label / Data safety

46. Apple "Describing data use in privacy manifests": "`NSPrivacyCollectedDataTypes` — A list of dictionaries that report the categories of private data your app or third-party SDK collects." Sub-keys `NSPrivacyCollectedDataType` (string), `NSPrivacyCollectedDataTypeLinked` (Boolean, "links this data type to the user's identity"), `NSPrivacyCollectedDataTypeTracking` (Boolean), `NSPrivacyCollectedDataTypePurposes` (array). "**Third-party SDKs need to provide their own privacy manifest files that record the types of data they collect. Your app's privacy manifest file doesn't need to cover data collected by third-party SDKs that your app links to.**" "Xcode can create a privacy report by aggregating the privacy manifests from your app and the third-party SDKs it links to." "Xcode won't generate a privacy report correctly if you define your own collected data types…" [official-doc] https://developer.apple.com/documentation/bundleresources/describing-data-use-in-privacy-manifests
47. Allowed values: `NSPrivacyCollectedDataTypeHealth` — "Health and medical data, including but not limited to data from the Clinical Health Records API, HealthKit API, MovementDisorderAPIs, or health-related human subject research or any other user provided health or medical data."; `NSPrivacyCollectedDataTypeFitness` — "Fitness and exercise data, including but not limited to the Motion and Fitness API."; `NSPrivacyCollectedDataTypePreciseLocation` — "…latitude and longitude with three or more decimal places"; `NSPrivacyCollectedDataTypeUserID`. Purposes: `NSPrivacyCollectedDataTypePurposeAppFunctionality` — "App functionality; such as to authenticate the user, enable features…", plus `…Analytics`, `…ProductPersonalization`, `…DeveloperAdvertising`, `…ThirdPartyAdvertising`, `…Other`. [official-doc] https://developer.apple.com/documentation/bundleresources/app-privacy-configuration/nsprivacycollecteddatatypes/nsprivacycollecteddatatype and …/nsprivacycollecteddatatypepurposes
48. Apple "Privacy manifest files": an SDK must include a manifest if it is on the listed-SDK list, "or if it uses a required reasons API, collects data about the person using apps that include the third-party SDK, enables the app to collect data about people using the app, or contacts tracking domains." [official-doc] https://developer.apple.com/documentation/bundleresources/privacy-manifest-files
49. App Store "App privacy details": "'Collect' refers to transmitting data off the device in a way that allows you and/or your third-party partners to access it for a period longer than what is necessary to service the transmitted request in real time." Health = "…HealthKit API…"; Fitness = "Fitness and exercise data, including but not limited to the Motion and Fitness API". Data is "linked to the user" unless direct identifiers are stripped before collection and re-linking is prevented. [official-doc] https://developer.apple.com/app-store/app-privacy-details/
50. Play Data safety (10787469): "Health info — Information about a user's health, such as medical records or symptoms." "Fitness info — Information about a user's fitness, such as exercise or other physical activity." Collected = "transmitting data from your app off a user's device", including via SDKs; ephemeral-processing exemption only when data is "only stored in memory and retained for no longer than necessary to service the specific request in real-time." No Health-Connect-specific consistency rule in that page; the requirement to fill Data safety comes from fact 39. [official-doc] https://support.google.com/googleplay/android-developer/answer/10787469

---

## 2. API sketch relevant to our library (real identifiers, minimal code)

### Android (Kotlin, Expo Module) — permission model that matches the platform

```kotlin
// Manifest (library AndroidManifest.xml, merged into the app):
// <uses-permission android:name="android.permission.health.READ_EXERCISE" />
// <uses-permission android:name="android.permission.health.WRITE_EXERCISE" />
// <uses-permission android:name="android.permission.health.WRITE_EXERCISE_ROUTE" />
// <uses-permission android:name="android.permission.health.READ_EXERCISE_ROUTES" />  // required or the route dialog returns RESULT_CANCELED (fact 7)
// <uses-permission android:name="android.permission.health.READ_HEALTH_DATA_HISTORY" /> // optional, v1.1?
// Do NOT put READ_EXERCISE_ROUTES in the request set shown to users — it is filtered by the platform UI (fact 4).

val requestable = setOf(
  HealthPermission.getReadPermission(ExerciseSessionRecord::class),
  HealthPermission.getWritePermission(ExerciseSessionRecord::class),
  HealthPermission.PERMISSION_WRITE_EXERCISE_ROUTE,
)
// Contract: PermissionController.createRequestPermissionResultContract() (== HealthPermissionsRequestContract)
// Result: Set<String> granted ⊆ requestable.

// Route read: ExerciseSessionRecord.exerciseRouteResult is
//   ExerciseRouteResult.Data(exerciseRoute)   -> route attached
//   ExerciseRouteResult.ConsentRequired        -> hasRoute && not attached (foreign in bg / no route perm / own after revoke)
//   ExerciseRouteResult.NoData                 -> hasRoute == false
// Per-session consent: ExerciseRouteRequestContract() : ActivityResultContract<String /*sessionId*/, ExerciseRoute?>
//   null  => denied / no route / perm not declared / USER_FIXED
```

### Android — idempotent write

```kotlin
val session = ExerciseSessionRecord(
  metadata = Metadata.activelyRecorded(           // or manualEntry()/autoRecorded(device)
    clientRecordId = workoutId,                   // our stable id => deterministic platform UUID (fact 14)
    clientRecordVersion = revision,               // monotonically increasing; equal re-sends overwrite (fact 15)
    device = Device(type = Device.TYPE_PHONE)),
  startTime = start, startZoneOffset = off, endTime = end, endZoneOffset = off,
  exerciseType = ExerciseSessionRecord.EXERCISE_TYPE_RUNNING,
  exerciseRoute = ExerciseRoute(locations),       // requires WRITE_EXERCISE_ROUTE or the whole insert is rejected (fact 21)
)
client.insertRecords(listOf(session))             // upsert-by-clientRecordId semantics on the module path (facts 14-16)
// Delete: client.deleteRecords(ExerciseSessionRecord::class, recordIdsList = emptyList(), clientRecordIdsList = listOf(workoutId))
// route rows cascade (fact 24); DistanceRecord/HeartRateRecord written alongside must be deleted explicitly by their own clientRecordIds.
```

### iOS (Swift) — the two candidate route paths to A/B on device (Item 4)

```swift
// Path A (Apple article, "discouraged" initializer avoided): seriesBuilder before finishWorkout, explicit finishRoute after.
let wb = HKWorkoutBuilder(healthStore: store, configuration: cfg, device: .local())
try await wb.beginCollection(at: start)
let rb = wb.seriesBuilder(for: .workoutRoute()) as! HKWorkoutRouteBuilder   // must be obtained BEFORE finishWorkout
try await rb.insertRouteData(locations)
try await wb.addSamples(samples); try await wb.endCollection(at: end)
let workout = try await wb.finishWorkout()                                    // header: "route will be finished" here
let route = try await rb.finishRoute(with: workout!, metadata: nil)           // header: "you should never call this method"  <-- test: error? duplicate? no-op?

// Path B (header-sanctioned for a standalone builder; what Apple's older sample apps did): direct builder.
let rb = HKWorkoutRouteBuilder(healthStore: store, device: nil)               // discouraged, NOT deprecated (fact 32)
try await rb.insertRouteData(locations)
let workout = try await wb.finishWorkout()                                    // or HKHealthStore.save(HKWorkout) for legacy
let route = try await rb.finishRoute(with: workout!, metadata: nil)           // fully specified; workout must already be saved (fact 33)

// Verification query for both:
let pred = HKQuery.predicateForObjects(from: workout!)
let routes: [HKWorkoutRoute] = try await HKSampleQueryDescriptor(predicates: [.workoutRoute(pred)], sortDescriptors: []).result(for: store)
```

### iOS — privacy manifest (library side)

```xml
<!-- ios/PrivacyInfo.xcprivacy of the library: required-reason APIs only; the SDK itself transmits nothing. -->
<key>NSPrivacyTracking</key><false/>
<key>NSPrivacyCollectedDataTypes</key><array/>
<key>NSPrivacyAccessedAPITypes</key><array> … (UserDefaults/FileTimestamp reasons if actually used) … </array>
```
App side (documented in README, not shipped by the library): `NSPrivacyCollectedDataTypeHealth` (+ `…Fitness`, `…PreciseLocation` when routes are uploaded), `NSPrivacyCollectedDataTypeLinked=true`, `NSPrivacyCollectedDataTypeTracking=false`, purposes `[NSPrivacyCollectedDataTypePurposeAppFunctionality]`; App Store Connect questionnaire answered identically.

---

## 3. Design implications for a minimal-options unified API

1. **Keep the tri-state route result** (`route | "consentRequired" | null`) and `requestRouteAccess(workoutId)` — both are now grounded in source (facts 7, 10, 11). Document the two silent-null cases that look like bugs: manifest missing `READ_EXERCISE_ROUTES` (library must merge it) and `FLAG_PERMISSION_USER_FIXED` (user denied permanently → `null` with no dialog). Surface the latter as a distinct reason if feasible (`PackageManager.getPermissionFlags` is not available to third-party apps, so at best: "dialog returned immediately").
2. **Never include `READ_EXERCISE_ROUTES` in the request set** we show; never report it as "denied" after a normal request. Expose it only as a *status* (`routes: "all" | "own" | "none"`) derived from `getGrantedPermissions()`, and document that "all" can only be obtained through "Allow all" in the per-session dialog or Settings.
3. **Background reads cannot return foreign routes** even with `READ_HEALTH_DATA_IN_BACKGROUND` (fact 9-10). If the library ever offers background sync, make route fetching foreground-only (or fetch sessions in background and hydrate routes on next foreground).
4. **Own-route durability depends on keeping `WRITE_EXERCISE_ROUTE`** (fact 36). Don't let the app request `WRITE_EXERCISE` without `WRITE_EXERCISE_ROUTE` if it writes routes; after a user revokes it, our own workouts become `consentRequired` — cache routes locally; never rely on HC as the source of truth for the app's own GPS traces.
5. **`saveWorkout` idempotency on Android**: always set `clientRecordId` (our workout id) and a monotonic `clientRecordVersion` (e.g. `updatedAt` epoch ms). Retrying the same payload is safe (equal version overwrites, identical content). A *lower* version is silently ignored — surface nothing; this is the desired behaviour. Android 14+ semantics verified from source; API 28-33 (HC APK) only from KDoc.
6. **Re-saving a workout without its route deletes the stored route** when we hold `WRITE_EXERCISE_ROUTE` (fact 20-21). Therefore `saveWorkout` must be "full-state": always send the route if the workout has one; never offer a partial-update option.
7. **`deleteWorkout`**: delete by `clientRecordId`; treat "not found" as success on Android 14+ (fact 23) but guard with try/catch for `RemoteException` on the HC-APK path (fact 22) — i.e. map "unknown id" → `{ deleted: false }` rather than throwing. Metric records written with the workout need their own deterministic `clientRecordId`s (`${workoutId}:distance`, `${workoutId}:hr`) so cleanup is one call per type.
8. **Android minSdk = 26 and pin `androidx.health.connect:connect-client:1.1.0`** (facts 25-29). Declare `minSdkVersion 26` in the module's `build.gradle` and document that the app must raise `minSdkVersion` to 26 (Expo default 24). Do not track the 1.2.0 alphas until Expo/RN move to compileSdk 37 + AGP 9.1. Also gate `HealthConnectClient.getSdkStatus()` and short-circuit on API < 28 (HC app unavailable, fact 28).
9. **iOS route write path**: choose after the device test (Item 4). Until then prefer **Path B** (direct `HKWorkoutRouteBuilder` + `finishRoute` after `finishWorkout`) for *importing finished workouts*: every step is specified in the header and web docs, it has no ordering ambiguity, and it is "discouraged" not deprecated. Keep Path A's `seriesBuilder(for:)` behind a flag only if the test shows Path B produces errors on iOS 26.
10. **Privacy**: the library's `PrivacyInfo.xcprivacy` declares `NSPrivacyCollectedDataTypes = []` (it transmits nothing) and only required-reason APIs; the README must instruct the app to declare Health/Fitness(/Precise Location) as collected, linked, not tracking, App Functionality — and to mirror this in App Store Connect and in Play Data safety ("Health info", "Fitness info", location). Keep the Android permission set minimal and final for v1 because every change to the set re-triggers the Play declaration (facts 38-42).

---

## 4. Pitfalls / gotchas

- **`READ_EXERCISE_ROUTES` in the request set is silently dropped by the system UI** and the app's "granted" set will never contain it — code that waits for it will hang on "permission never granted" (fact 4). Conversely, listing it in the manifest is mandatory or the route dialog is a no-op (fact 7).
- **`pm list permissions -f` without `-g` does not list the dangerous HEALTH permissions** on the Android 16 Play image — a test script that greps that output will wrongly conclude the permission doesn't exist; use `-g -d` or `dumpsys package permission …` (fact 12).
- **`isInForeground` comes from AppOps, not from the background permission** (fact 9): a foreground-service-driven sync may still count as foreground; a WorkManager job will not. Foreign routes then come back as `consentRequired` — not an error, easy to misreport as "no route".
- **Equal `clientRecordVersion` overwrites** (fact 15) — a retried stale payload with the same version will clobber newer data written in between; generate the version from the record's own `updatedAt`, not from the retry time.
- **Official sync-data doc says lower versions are "written as new data" — it is wrong for the module path** (fact 19). Don't design around duplicates.
- **Writes without a `clientRecordId` still dedupe** on `(app, device, start, end)` (fact 17): two distinct workouts with identical start/end (e.g. a device clock bug) collapse into one row.
- **Session update with route while missing `WRITE_EXERCISE_ROUTE` fails the whole insert** (fact 21) — check the granted set before calling `insertRecords`, and strip the route (with a warning) rather than failing the write.
- **`HKWorkoutRouteBuilder` data is lost if the builder is deallocated before `finishRoute`** (facts 30, 33) — in an Expo Module keep the builder in a strong reference table keyed by workout id across the JS call boundary.
- **Apple rejects `finishRoute` with zero locations** (fact 33): skip the route builder entirely for workouts with empty/filtered-out location arrays; pre-filter `horizontalAccuracy > 50 m` as Apple recommends (fact 34).
- **Play declaration scope creep**: adding `READ_HEART_RATE`/`READ_HEALTH_DATA_HISTORY` later forces a new declaration that is reviewed with the release (facts 39-40); keep the v1 manifest minimal and make optional permissions a separate build-time config-plugin option so unused `<uses-permission>` entries never reach the manifest (fact 42: "unused permissions must be removed").
- **"Collect" means transmit** on both stores (facts 49-50): a fitness app that uploads HealthKit-derived workouts must declare Health (Apple) / Fitness info (Play) even if it never shows the raw data; mismatched labels are a removal vector independent of the HealthKit-specific guideline.

---

## 5. Open questions

### Needs a USER decision
- v1 Android permission set: `READ_EXERCISE`, `WRITE_EXERCISE`, `WRITE_EXERCISE_ROUTE`, `READ_EXERCISE_ROUTES` (manifest-only) — include `READ_HEALTH_DATA_HISTORY` (reads older than 30 days) now or never? Changing later costs a re-declaration (fact 39).
- Accept `minSdk 26` for the consumer app (Expo default 24)?
- Whether routes are uploaded to the NestJS server at all (drives Precise Location in both privacy labels) and whether HealthKit-imported workouts (foreign apps' data) are uploaded — Apple 5.1.3 and Play policy treat that as sharing health data off-device.
- iOS write path default (Path A vs B) once the test result is in.

### Needs a hands-on device test (next session)
1. **Item 4 — route finish semantics** on iOS 26.5 simulator (iPhone 17) and a physical device: run Path A (seriesBuilder + rely on finishWorkout, **no** finishRoute), Path A′ (seriesBuilder + explicit finishRoute after finishWorkout), Path B (direct builder + finishRoute), and the domain-model order (`seriesBuilder(for:)` *after* `finishWorkout()` — expect nil/error). For each: count `HKWorkoutRoute` via `HKQuery.predicateForObjects(from: workout)`, capture thrown errors, and check the route's `metadata`/`device`. Pass criterion: exactly one route per workout, no error.
2. **Item 1/5 — background + revoke matrix** on Pixel_9a (API 36, Play image) with a second test APK that writes a session+route: read as (a) foreground with `READ_EXERCISE_ROUTES` granted via "Allow all", (b) background (WorkManager) with `READ_HEALTH_DATA_IN_BACKGROUND` also granted → expect foreign `ConsentRequired`, (c) after `adb shell pm revoke <pkg> android.permission.health.WRITE_EXERCISE_ROUTE` (and without `READ_EXERCISE_ROUTES`) → expect own session `ConsentRequired`. Also run the request contract with `READ_EXERCISE_ROUTES` in the set and confirm it is absent from the returned set and from the dialog.
3. **Item 2 — upsert/delete matrix** on Pixel_9a and, if available, an API 33 device with the Play Health Connect APK: insert `clientRecordId=X` with versions 1, 1, 0, 2 → expect one row, final content = v2; re-insert without route while holding `WRITE_EXERCISE_ROUTE` → expect `NoData`; revoke `WRITE_EXERCISE_ROUTE`, re-insert without route → expect `ConsentRequired` (route kept, unreadable); `deleteRecords(clientRecordIdsList=["does-not-exist"])` → record whether it throws (`RemoteException`/`IllegalArgumentException`) or returns normally on each OS.
4. **Item 6 — Play gating**: upload an **internal-testing** build with no Health apps declaration, install from Play on a Play-image device, open the HC permission flow and record whether the "can't access Health Connect" dialog appears; repeat with a sideloaded debug build of the same applicationId. Record timestamps of declaration submission → approval status change for the SLA.
5. Verify on Pixel_9a whether the `read_exercise_routes_all_enabled` aconfig flag is on (`pm list permissions -g -d` already shows the permission; `aflags`/`printflags` are not available on this image).

### Needs more research
- The `android17-release` copy of `ExerciseSessionRecordHelper.java`/`RecordHelper.java` lives at a moved path (fetch returned empty); re-locate and diff to confirm the route-access and `>=` version logic are unchanged in Android 17.
- The closed-source Health Connect APK (API 28-33) behaviour for: `READ_EXERCISE_ROUTES` handling, lower-version upserts, and unknown-id deletes — only KDoc-level evidence exists.
- The exact mechanism by which Health Connect learns an app's Play approval status (server-side allowlist vs. Play-signed install check) — no official description found.
- Play Console review SLA for Health apps declarations — only anecdotal ("~7 days") sources; community threads could not be fetched (blocked by page truncation).

---

## 6. Sources

AOSP / androidx source (fetched 2026-08-22):
- https://android.googlesource.com/platform/packages/modules/HealthFitness/+/refs/heads/main/apk/HealthPermissionsManifest.xml
- https://android.googlesource.com/platform/packages/modules/HealthFitness/+/refs/heads/android17-release/apk/HealthPermissionsManifest.xml
- https://android.googlesource.com/platform/packages/modules/HealthFitness/+/refs/heads/main/framework/java/android/health/connect/HealthPermissions.java
- https://android.googlesource.com/platform/packages/modules/HealthFitness/+/refs/heads/main/framework/java/android/health/connect/datatypes/ExerciseSessionRecord.java
- https://android.googlesource.com/platform/packages/modules/HealthFitness/+/refs/heads/main/apk/src/com/android/healthconnect/controller/permissions/request/RequestPermissionViewModel.kt
- https://android.googlesource.com/platform/packages/modules/HealthFitness/+/refs/heads/main/apk/src/com/android/healthconnect/controller/permissions/data/HealthPermission.kt
- https://android.googlesource.com/platform/packages/modules/HealthFitness/+/refs/heads/main/apk/src/com/android/healthconnect/controller/route/RouteRequestActivity.kt
- https://android.googlesource.com/platform/packages/modules/HealthFitness/+/refs/heads/main/apk/src/com/android/healthconnect/controller/route/ExerciseRouteViewModel.kt
- https://android.googlesource.com/platform/packages/modules/HealthFitness/+/refs/heads/main/service/java/com/android/server/healthconnect/HealthConnectServiceImpl.java
- https://android.googlesource.com/platform/packages/modules/HealthFitness/+/refs/heads/main/service/java/com/android/server/healthconnect/storage/datatypehelpers/ExerciseSessionRecordHelper.java
- https://android.googlesource.com/platform/packages/modules/HealthFitness/+/refs/heads/main/service/java/com/android/server/healthconnect/storage/datatypehelpers/ExerciseRouteRecordHelper.java
- https://android.googlesource.com/platform/packages/modules/HealthFitness/+/refs/heads/main/service/java/com/android/server/healthconnect/storage/datatypehelpers/RecordHelper.java
- https://android.googlesource.com/platform/packages/modules/HealthFitness/+/refs/heads/main/service/java/com/android/server/healthconnect/storage/TransactionManager.java
- https://android.googlesource.com/platform/packages/modules/HealthFitness/+/refs/heads/main/service/java/com/android/server/healthconnect/storage/request/UpsertTransactionRequest.java
- https://android.googlesource.com/platform/packages/modules/HealthFitness/+/refs/heads/main/service/java/com/android/server/healthconnect/storage/request/DeleteTransactionRequest.java
- https://android.googlesource.com/platform/packages/modules/HealthFitness/+/refs/heads/main/service/java/com/android/server/healthconnect/storage/request/DeleteTableRequest.java
- https://android.googlesource.com/platform/packages/modules/HealthFitness/+/refs/heads/main/service/java/com/android/server/healthconnect/storage/request/CreateTableRequest.java
- https://android.googlesource.com/platform/packages/modules/HealthFitness/+/refs/heads/main/service/java/com/android/server/healthconnect/storage/utils/StorageUtils.java
- https://android.googlesource.com/platform/frameworks/support/+/refs/heads/androidx-main/health/connect/connect-client/build.gradle
- https://android.googlesource.com/platform/frameworks/support/+/refs/heads/androidx-main/health/connect/connect-client/src/main/java/androidx/health/connect/client/HealthConnectClient.kt
- https://android.googlesource.com/platform/frameworks/support/+/refs/heads/androidx-main/health/connect/connect-client/src/main/java/androidx/health/connect/client/permission/HealthPermission.kt
- https://android.googlesource.com/platform/frameworks/support/+/refs/heads/androidx-main/health/connect/connect-client/src/main/java/androidx/health/connect/client/contracts/ExerciseRouteRequestContract.kt
- https://android.googlesource.com/platform/frameworks/support/+/refs/heads/androidx-main/health/connect/connect-client/src/main/java/androidx/health/connect/client/contracts/HealthPermissionsRequestContract.kt
- https://android.googlesource.com/platform/frameworks/support/+/refs/heads/androidx-main/health/connect/connect-client/src/main/java/androidx/health/connect/client/records/ExerciseRouteResult.kt
- https://android.googlesource.com/platform/frameworks/support/+/refs/heads/androidx-main/health/connect/connect-client/src/main/java/androidx/health/connect/client/impl/platform/records/RecordConverters.kt
- https://android.googlesource.com/platform/frameworks/support/+/refs/heads/androidx-main/health/connect/connect-client/src/main/java/androidx/health/connect/client/impl/converters/records/ProtoToRecordConverters.kt
- https://android.googlesource.com/platform/frameworks/support/+/refs/heads/androidx-main/health/connect/connect-client/src/main/java/androidx/health/connect/client/impl/HealthConnectClientUpsideDownImpl.kt
- https://android.googlesource.com/platform/frameworks/support/+/07cc6ea9413a439370e4baccae250d842acff222%5E%21/

Artifacts / registries:
- https://dl.google.com/android/maven2/androidx/health/connect/group-index.xml
- https://dl.google.com/android/maven2/androidx/health/connect/connect-client/1.1.0/connect-client-1.1.0.aar
- https://dl.google.com/android/maven2/androidx/health/connect/connect-client/1.2.0-alpha05/connect-client-1.2.0-alpha05.aar
- https://raw.githubusercontent.com/expo/expo/sdk-57/packages/expo-modules-core/android/ExpoModulesCorePlugin.gradle
- https://raw.githubusercontent.com/facebook/react-native/0.86-stable/packages/gradle-plugin/gradle/libs.versions.toml
- Local: `$ANDROID_HOME/platforms/android-36/data/api-versions.xml`, `$ANDROID_HOME/platforms/android-36.1/data/api-versions.xml`
- Local: `/Applications/Xcode.app/Contents/Developer/Platforms/iPhoneOS.platform/Developer/SDKs/iPhoneOS26.5.sdk/System/Library/Frameworks/HealthKit.framework/Headers/{HKWorkoutRouteBuilder.h,HKWorkoutBuilder.h,HKSeriesBuilder.h}`
- Device: Pixel_9a AVD, Android 16 / API 36, `google_apis_playstore` arm64, HC controller APEX 360915160 (versionName 16)

Official docs:
- https://developer.android.com/jetpack/androidx/releases/health-connect
- https://developer.android.com/health-and-fitness/guides/health-connect/develop/sync-data
- https://developer.android.com/health-and-fitness/guides/health-connect/publish/declare-access
- https://developer.android.com/health-and-fitness/health-connect/publish
- https://developer.android.com/health-and-fitness/health-connect/get-started
- https://support.google.com/googleplay/android-developer/answer/14738291
- https://support.google.com/googleplay/android-developer/answer/9888170
- https://support.google.com/googleplay/android-developer/answer/12991134
- https://support.google.com/googleplay/android-developer/answer/16679511
- https://support.google.com/googleplay/android-developer/answer/10787469
- https://developer.apple.com/documentation/healthkit/hkworkoutroutebuilder
- https://developer.apple.com/documentation/healthkit/hkworkoutroutebuilder/init(healthstore:device:)
- https://developer.apple.com/documentation/healthkit/hkworkoutroutebuilder/finishroute(with:metadata:completion:)
- https://developer.apple.com/documentation/healthkit/hkworkoutbuilder/seriesbuilder(for:)
- https://developer.apple.com/documentation/healthkit/hkworkoutbuilder/finishworkout(completion:)
- https://developer.apple.com/documentation/healthkit/creating-a-workout-route
- https://developer.apple.com/documentation/bundleresources/privacy-manifest-files
- https://developer.apple.com/documentation/bundleresources/describing-data-use-in-privacy-manifests
- https://developer.apple.com/documentation/bundleresources/app-privacy-configuration/nsprivacycollecteddatatypes/nsprivacycollecteddatatype
- https://developer.apple.com/documentation/bundleresources/app-privacy-configuration/nsprivacycollecteddatatypes/nsprivacycollecteddatatypepurposes
- https://developer.apple.com/app-store/app-privacy-details/

Secondary / unverified:
- https://www.aifitnessapi.com/fix/health-connect-no-data (sideloaded vs Play gating claim)
- https://support.google.com/googleplay/android-developer/thread/398224811 and …/thread/288434034 (rejection threads; bodies not retrievable)
