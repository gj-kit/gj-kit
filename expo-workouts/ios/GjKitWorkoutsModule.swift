// @gj-kit/expo-workouts — the Expo module (mission section 4.1, design sections 3.1 to 3.3).
//
// Every member of the native seam declared in `src/core/native-contract.ts` exists here with its
// final signature, and every one of them is a thin adapter: decode the flat bridge dictionary, call
// one `HealthStoring` member, encode the flat result, and turn any error into one of the 14 typed
// exceptions. There is no HealthKit call in this file at all — that is what keeps the whole module
// drivable from XCTest against an in-memory conformer (index f56).
//
// ── Two rules that are not optional even in a skeleton ──────────────────────────────────────────
//
// 1. EVERY member below uses the Swift-concurrency `AsyncFunction` overload — the `async throws`
//    closure, resolved by the compiler to `ConcurrentFunctionDefinition`. The closure-style overload
//    runs its body on one process-wide serial queue (index f8), where a 36 000-point route read
//    (1.1 s, f79) would block every other module in the app. HealthKit work must never go there, so
//    no member here takes a `Promise` parameter.
//
// 2. The module never talks to `HKHealthStore` directly. It holds a `HealthStoring` obtained from
//    `WorkoutsStoreInjection`, so XCTest drives this exact code against an in-memory conformer with
//    no device and no entitlement (index f56).
//
// Naming is load-bearing and is asserted by `naming-guard`: the native module string is
// `GjKitWorkouts`, the Swift class is `GjKitWorkoutsModule`, and the Kotlin class is
// `kit.gj.workouts.GjKitWorkoutsModule`.

import ExpoModulesCore
import HealthKit
import UIKit

public final class GjKitWorkoutsModule: Module {
  public func definition() -> ModuleDefinition {
    // Resolved once per module instance. No `self` is captured by any closure below: the factory
    // result is a `Sendable` existential and the `AsyncFunction` overload takes a `@Sendable`
    // closure, so capturing the module itself would be wrong as well as unnecessary.
    let store = WorkoutsStoreInjection.shared.make()

    Name("GjKitWorkouts")

    // ── availability and authorization ─────────────────────────────────────────────────────────

    // REAL. This is the one answer that must be true in the skeleton, because it is what tells a
    // consuming app whether to show the feature at all. `false` on iPad and anywhere else without a
    // health store (index f19, design section 5.7 row 1). iOS never reports `platformTooOld`
    // (the deployment target rules it out) and never `updateRequired` (no provider to update).
    AsyncFunction("availability") { () async throws -> [String: Any] in
      let availability = store.isHealthDataAvailable()
        ? AvailabilityDTO.available
        : AvailabilityDTO.notSupported
      return availability.toDictionary()
    }

    // REAL, and deliberately judgement-free: it reports raw facts and `./core` derives every
    // `ScopeStatus` from them.
    //
    // `granted` holds SHARE-authorized type identifiers only. HealthKit never discloses read
    // authorization — that is the whole reason every iOS read scope is reported as `'unknown'`
    // forever and a denied read yields an empty result instead of an error (index f14).
    AsyncFunction("authorizationSnapshot") { () async throws -> [String: Any] in
      guard store.isHealthDataAvailable() else {
        return AuthorizationSnapshotDTO(
          granted: [],
          declared: [],
          wouldPrompt: false,
          availability: .notSupported
        ).toDictionary()
      }

      let allIdentifiers = WorkoutsScope.allCases.flatMap { WorkoutsScopeTypes.identifiers[$0] ?? [] }
      let statuses = store.sharingStatus(for: allIdentifiers)
      let granted = statuses
        .filter { $0.value == HKAuthorizationStatus.sharingAuthorized.rawValue }
        .map { $0.key }
        .sorted()

      // `wouldPrompt` comes from `getRequestStatusForAuthorization` and NOTHING else — inferring it
      // from `authorizationStatus` is exactly the mistake index f14 documents.
      //
      // It asks about the READ direction ONLY, and that is load-bearing rather than a shortcut. The
      // share direction already has per-type truth in `statuses` below, while READ has none at all
      // (index f14) — `wouldPrompt` is the single bit `./core` turns into `'undetermined'` ("ask")
      // versus `'unknown'` ("the platform will never say"). Including the share side made that bit
      // STICKY TRUE, measured on device: an app that asks to write four scopes but read seven never
      // asks to SHARE heart rate or steps, so a sheet would always still be pending for those two,
      // and every read scope stayed `'undetermined'` forever even after the user granted everything.
      let identifierSet = Set(allIdentifiers)
      let wouldPrompt = (try? await store.wouldPrompt(read: identifierSet, share: [])) ?? true

      // On iOS there is no per-type manifest declaration to enumerate: authorization is gated by
      // the two Info.plist usage-description keys plus the HealthKit entitlement, and a missing key
      // CRASHES inside `requestAuthorization` rather than failing (index f19). The config plugin is
      // the structural defence and the plugin introspect snapshot asserts both keys exist, so the
      // honest answer here is "every type this build knows about".
      // `authorizationStatus(for:)` per identifier, so `./core` can tell a SHARE denial apart from
      // "never asked". `HKAuthorizationStatus`: 0 notDetermined, 1 sharingDenied, 2 sharingAuthorized.
      // Without this, `write.*` could only ever be `'granted'` or a permanent `'undetermined'`, and
      // a settings screen could never honestly offer `openSettings()`.
      var reduced: [String: String] = [:]
      for (identifier, raw) in statuses {
        reduced[identifier] =
          raw == HKAuthorizationStatus.sharingAuthorized.rawValue
            ? "granted"
            : raw == HKAuthorizationStatus.sharingDenied.rawValue ? "denied" : "undetermined"
      }

      return AuthorizationSnapshotDTO(
        granted: granted,
        declared: allIdentifiers.sorted(),
        wouldPrompt: wouldPrompt,
        statuses: reduced,
        availability: .available
      ).toDictionary()
    }

    // The seam takes TWO sets since Phase 3 (defect B). That is not a nicety: the SAME HealthKit
    // type identifier serves read and share, so one flat array cannot express what
    // `requestAuthorization(toShare:read:)` needs — it could only over-request share access or
    // silently drop it. `./core` (`iosRequestIdentifiers`) builds both sets from the public
    // `AuthorizationRequest`, so the public surface is unchanged.
    //
    // `conclusive` is always `true` on iOS: the empty-result case that forces `conclusive: false`
    // is the Android permission contract bouncing off onboarding (f120), which has no iOS twin.
    AsyncFunction("requestPermissions") { (request: [String: [String]]) async throws -> [String: Any] in
      let read = Set(request["read"] ?? [])
      let share = Set(request["write"] ?? [])
      let watched = Array(read.union(share)).sorted()

      func shareAuthorized() -> [String] {
        store.sharingStatus(for: watched)
          .filter { $0.value == HKAuthorizationStatus.sharingAuthorized.rawValue }
          .map { $0.key }
          .sorted()
      }

      let before = shareAuthorized()
      do {
        try await store.requestAuthorization(read: read, share: share)
      } catch {
        throw WorkoutsExceptionMapper.exception(for: error, member: "requestPermissions")
      }
      return PermissionOutcomeDTO(
        before: before,
        after: shareAuthorized(),
        conclusive: true
      ).toDictionary()
    }

    // REAL. FNV-1a over the sorted granted permission strings, byte-identical to
    // `scopeFingerprint` in `src/core/sync/cursor.ts` — the two must agree or every cursor
    // resets on every call.
    AsyncFunction("grantedScopeFingerprint") { () async throws -> String in
      guard store.isHealthDataAvailable() else {
        return WorkoutsScopeFingerprint.compute([])
      }
      let allIdentifiers = WorkoutsScope.allCases.flatMap { WorkoutsScopeTypes.identifiers[$0] ?? [] }
      let granted = store.sharingStatus(for: allIdentifiers)
        .filter { $0.value == HKAuthorizationStatus.sharingAuthorized.rawValue }
        .map { $0.key }
      return WorkoutsScopeFingerprint.compute(granted)
    }

    // ── read primitives ────────────────────────────────────────────────────────────────────────

    AsyncFunction("readWorkoutPage") { (query: [String: Any]) async throws -> [String: Any] in
      // Design section 8.7: a `.strictStartDate` window query, the three-tier totals ladder per
      // workout, and the `predicateForObjects(from:)` provenance discriminator all live behind
      // `readWorkoutWindow` (RESULTS 205 to 206, f71, f73, f74, f75, f87).
      guard let window = WindowQueryDTO(dictionary: query) else {
        throw WorkoutsInvalidArgumentException("Invalid value for field: window")
      }
      let pageSize = (query["pageSize"] as? NSNumber)?.intValue ?? 0
      let pageToken = query["pageToken"] as? String
      do {
        return try await store.readWorkoutWindow(window, limit: pageSize, cursor: pageToken).toDictionary()
      } catch {
        throw WorkoutsExceptionMapper.exception(for: error, member: "readWorkoutPage")
      }
    }

    AsyncFunction("readMetricRecords") { (query: [String: Any]) async throws -> [[String: Any]] in
      // Design section 8.4: ONE query per metric type per PAGE WINDOW, tagged with the source
      // bundle identifier so `./core` sums per origin instead of double-counting two apps that both
      // recorded the same run.
      guard let window = WindowQueryDTO(dictionary: query),
            let rawType = query["type"] as? String,
            let type = MetricTypeDTO(rawValue: rawType)
      else {
        throw WorkoutsInvalidArgumentException("Invalid value for field: metricQuery")
      }
      let origins = Set(query["origins"] as? [String] ?? [])
      do {
        return try await store.readMetricRecords(window, type: type, origins: origins).map { $0.toDictionary() }
      } catch {
        throw WorkoutsExceptionMapper.exception(for: error, member: "readMetricRecords")
      }
    }

    AsyncFunction("readHeartRateSamples") { (query: [String: Any]) async throws -> [[String: Any]] in
      // A `.strictStartDate` window query over heart rate. Hygiene (window bounds and the 1..300 bpm
      // range) belongs to `./core` so both platforms drop the same samples.
      guard let window = WindowQueryDTO(dictionary: query) else {
        throw WorkoutsInvalidArgumentException("Invalid value for field: window")
      }
      do {
        return try await store.readHeartRateSamples(window).map { $0.toDictionary() }
      } catch {
        throw WorkoutsExceptionMapper.exception(for: error, member: "readHeartRateSamples")
      }
    }

    AsyncFunction("hasAssociatedSamples") { (nativeId: String, quantity: String) async throws -> Bool in
      // RESULTS 206 / f71. The ONLY discriminator between a tier-1 value that is genuinely
      // `associated` and one HealthKit synthesised from a legacy workout's deprecated totals.
      guard let uuid = UUID(uuidString: nativeId), let kind = QuantityKind(rawValue: quantity) else {
        throw WorkoutsInvalidArgumentException("Invalid value for field: nativeId")
      }
      do {
        return try await store.hasAssociatedSamples(workoutUUID: uuid, quantity: kind)
      } catch {
        throw WorkoutsExceptionMapper.exception(for: error, member: "hasAssociatedSamples")
      }
    }

    // ── sync primitives ────────────────────────────────────────────────────────────────────────

    AsyncFunction("takeCheckpoint") { () async throws -> String in
      // Design section 4.4: an `HKAnchoredObjectQueryDescriptor` run for its ANCHOR only, with no
      // results consumed (`limit: 0` means exactly that to the adapter). That is what makes the
      // initial backfill provably gap-free — the checkpoint is taken BEFORE the first page is read,
      // so anything written during the backfill still shows up in the first drain.
      do {
        return try await store.drainWorkouts(anchor: nil, limit: 0).anchor
      } catch {
        throw WorkoutsExceptionMapper.exception(for: error, member: "takeCheckpoint")
      }
    }

    AsyncFunction("drainCheckpoint") { (checkpoint: String, limit: Int) async throws -> [String: Any] in
      // Unarchive the anchor (index f17), run the anchored query, and return the added and deleted
      // objects plus the NEW anchor. iOS anchors never expire, so `expired` is always false here —
      // only Health Connect's change token expires (index f38).
      do {
        return try await store.drainWorkouts(anchor: checkpoint, limit: limit).toDictionary()
      } catch {
        throw WorkoutsExceptionMapper.exception(for: error, member: "drainCheckpoint")
      }
    }

    // ── routes ─────────────────────────────────────────────────────────────────────────────────

    AsyncFunction("openRoute") { (nativeId: String, consent: String) async throws -> [String: Any] in
      // Parks a `HKWorkoutRouteQueryDescriptor(route).results(for:)` iterator in a handle table.
      // `consent` is accepted for signature parity and ignored: iOS has no per-route consent step,
      // so `state` is `available` when a route sample exists and `none` when none does (index f13).
      // `consentRequired` is an Android-only state (f114, f118).
      _ = consent
      guard let uuid = UUID(uuidString: nativeId) else {
        throw WorkoutsInvalidArgumentException("Invalid value for field: nativeId")
      }
      do {
        return try await store.openRoute(workoutUUID: uuid).toDictionary()
      } catch {
        throw WorkoutsExceptionMapper.exception(for: error, member: "openRoute")
      }
    }

    AsyncFunction("readRouteChunk") { (handle: String, maxPoints: Int) async throws -> [[String: Any]]? in
      // Converts and RELEASES each chunk; the whole `[CLLocation]` array is never accumulated
      // (415 B/point against 16 B/point converted — a 26x peak, f78). `nil` ends the stream.
      do {
        let chunk = try await store.readRouteChunk(RouteHandle(id: handle, state: .available), maxPoints: maxPoints)
        return chunk?.map { $0.toDictionary() }
      } catch {
        throw WorkoutsExceptionMapper.exception(for: error, member: "readRouteChunk")
      }
    }

    AsyncFunction("closeRoute") { (handle: String) async throws -> Void in
      // A `break` out of the JavaScript `for await` lands here, so this must be safe to call twice
      // and safe to call with a handle that was never opened. It never throws.
      await store.closeRoute(RouteHandle(id: handle, state: .available))
    }

    // ── write primitives ───────────────────────────────────────────────────────────────────────

    AsyncFunction("findBySyncIdentifier") { (clientId: String) async throws -> [String: Any]? in
      // Design section 8.1 step 2. This lookup is what makes a re-save idempotent — re-saving at an
      // EQUAL version mints a new uuid and orphans the previous samples and route (index f26), so a
      // crash retry would otherwise become data corruption.
      do {
        return try await store.findWorkout(syncIdentifier: clientId)?.toDictionary()
      } catch {
        throw WorkoutsExceptionMapper.exception(for: error, member: "findBySyncIdentifier")
      }
    }

    AsyncFunction("saveWorkout") { (spec: [String: Any]) async throws -> [String: Any] in
      // Design section 8.1 path B in full — pre-validate, protected-data pre-check, workout builder,
      // then a SEPARATE fresh route builder. The series builder is never used:
      // one insert error there yields a route-less workout with no error at finish (f64),
      // discarding it destroys the workout save itself (f65), and it cannot attach to an
      // already-saved workout, which the `pendingUnlock` retry requires (f66).
      guard let write = WorkoutWriteDTO(dictionary: spec) else {
        throw WorkoutsInvalidArgumentException("Invalid value for field: workoutWrite")
      }
      do {
        return try await store.saveWorkout(write).toDictionary()
      } catch {
        throw WorkoutsExceptionMapper.exception(for: error, member: "saveWorkout")
      }
    }

    AsyncFunction("readBackVersion") { (clientId: String) async throws -> Int? in
      // Android-only by contract (f93, f94): Health Connect silently no-ops a lower client record
      // version, so that platform must always read back. HealthKit reports a stale version instead
      // of swallowing it, and our own pre-lookup catches it first (index f26). `nil` is the correct,
      // permanent iOS answer — not a stub.
      _ = clientId
      return nil
    }

    AsyncFunction("deleteWorkout") { (ref: [String: Any]) async throws -> Bool in
      // Design section 8.6: associated samples and the route sample go FIRST, then the workout, so a
      // partial failure can never leave an orphan behind. `{ clientId }` resolves through the sync
      // identifier — that one step is what stops a clientId delete from leaving metric orphans.
      let reference = DeleteRefDTO(dictionary: ref)
      do {
        if let nativeId = reference.nativeId {
          guard let uuid = UUID(uuidString: nativeId) else {
            throw WorkoutsInvalidArgumentException("Invalid value for field: nativeId")
          }
          return try await store.deleteWorkoutAndAssociated(uuid: uuid)
        }
        guard let clientId = reference.clientId, !clientId.isEmpty else {
          throw WorkoutsInvalidArgumentException("Invalid value for field: workoutRef")
        }
        guard let existing = try await store.findWorkout(syncIdentifier: clientId),
              let uuid = UUID(uuidString: existing.nativeId)
        else {
          // An unknown id is `{ deleted: false }` on both platforms, never a throw.
          return false
        }
        return try await store.deleteWorkoutAndAssociated(uuid: uuid)
      } catch {
        throw WorkoutsExceptionMapper.exception(for: error, member: "deleteWorkout")
      }
    }

    // ── platform integration ───────────────────────────────────────────────────────────────────

    AsyncFunction("openSettings") { () async throws -> Void in
      // The app's own Settings page, opened on the main actor and guarded by `canOpenURL`.
      //
      // ⚠ Asymmetry the README carries: on iOS the per-type health toggles do NOT live here. They
      // live in the Health app under Sources, and no URL scheme opens that page — so this is the
      // closest honest destination, not an equivalent of Android's Health Connect settings screen.
      try await MainActor.run {
        guard let url = URL(string: UIApplication.openSettingsURLString),
              UIApplication.shared.canOpenURL(url)
        else {
          throw WorkoutsUnavailableException("This runtime cannot open the app settings screen.")
        }
        UIApplication.shared.open(url)
      }
    }

    AsyncFunction("openStoreListing") { () async throws -> Void in
      // Android-only by contract: it exists to send the user to the Play listing for a Health
      // Connect provider update, and iOS has no provider to update. Raising `unavailable` is the
      // permanent iOS answer — not a stub.
      throw WorkoutsUnavailableException("There is no health data provider to update on this platform.")
    }
  }
}
