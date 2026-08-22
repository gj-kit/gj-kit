// @gj-kit/expo-workouts — the iOS write path (design section 8.1, path B, f61 to f70).
//
// The shape of this file is not a preference. Phase 0 measured every alternative and each one loses
// data silently:
//
//   * `workoutBuilder.seriesBuilder(for:)` (path A) auto-associates its route on `finishWorkout()`,
//     but ONE failed insert poisons that builder invisibly: the next two inserts return `ok`, the
//     workout finishes, and the route is simply not there — 60 accepted points gone with no error
//     anywhere (f64). `discard()` on such a builder destroys the workout save itself (f65). And it
//     cannot attach to an already-saved workout, which is exactly what the `pendingUnlock` retry
//     needs (f66). So: path B, always, and the static source guard keeps both symbols out of reach.
//   * a route builder reused for a second `finishRoute` throws (f63), so every attach makes a FRESH
//     `HKWorkoutRouteBuilder` — which is also what makes the retry idempotent.
//   * `finishRoute` on zero points throws (f84), so an empty point list is refused here rather than
//     handed to the platform. `./core` has already reported `route: 'dropped'` by then.
//   * one route sync identifier shared across workouts cross-links them (f68), so the only producer
//     is `WorkoutWriteDTO.routeSyncIdentifier`.
//
// And the reason every number is re-validated before a single `HKQuantitySample` is constructed:
// that initialiser raises an Objective-C exception on bad input, which is a CRASH and not a rejected
// promise (index f28). Validation is a precondition here, never error handling.

import CoreLocation
import Foundation
import HealthKit

extension HKHealthStoreAdapter {
  // ── lookup ─────────────────────────────────────────────────────────────────────────────────

  public func findWorkout(syncIdentifier: String) async throws -> ExistingWorkoutDTO? {
    guard let workout = try await fetchOwnWorkout(syncIdentifier: syncIdentifier) else {
      return nil
    }
    let version = (workout.metadata?[HKMetadataKeySyncVersion] as? NSNumber)?.intValue ?? 0
    return ExistingWorkoutDTO(nativeId: workout.uuid.uuidString, version: version)
  }

  public func associatedSampleIds(workoutUUID: UUID) async throws -> [UUID] {
    guard let workout = try await fetchWorkout(uuid: workoutUUID) else { return [] }
    return try await associatedSamples(of: workout).map { $0.uuid }
  }

  /// Every sample of a type this library writes that is associated with `workout`.
  ///
  /// `store.delete(workout)` does not cascade to these (index f26), and neither does a sync-identifier
  /// replacement — which is what makes them orphans that keep counting towards the user's daily
  /// totals in Health until something removes them.
  internal func associatedSamples(of workout: HKWorkout) async throws -> [HKSample] {
    let predicate = HKQuery.predicateForObjects(from: workout)
    var out: [HKSample] = []
    for type in WorkoutsManagedTypes.quantityTypes() {
      let descriptor = HKSampleQueryDescriptor(
        predicates: [.quantitySample(type: type, predicate: predicate)],
        sortDescriptors: []
      )
      // A type this app may not touch is SKIPPED, not fatal. Measured on device (Phase 3): the
      // sweep asks about the swimming, rowing and wheelchair distance types, which design section
      // 8.8 deliberately never authorizes, and HealthKit answers an un-requested type with
      // `errorAuthorizationNotDetermined` rather than an empty result — which turned every
      // replacement and every delete into `notAuthorized` until this fold existed. A sample we
      // cannot see is also a sample we could never have written.
      let found = try await WorkoutsErrors.emptyOnUnauthorized([]) { try await descriptor.result(for: store) }
      out.append(contentsOf: found)
    }
    return out
  }

  /// Design section 8.1 step 3's re-attachment primitive (index f26).
  ///
  /// ⚠ The shipping save path deliberately does NOT call this — see the note on `saveWorkout` below.
  /// It stays on the seam because the seam is the design's, and because it is the only operation
  /// that can rescue samples orphaned by a replacement written by an older build of this library.
  public func reattachSamples(_ ids: [UUID], toWorkout uuid: UUID) async throws {
    guard !ids.isEmpty, let workout = try await fetchWorkout(uuid: uuid) else { return }
    var samples: [HKSample] = []
    for type in WorkoutsManagedTypes.quantityTypes() {
      let query = HKSampleQueryDescriptor(
        predicates: [.quantitySample(type: type, predicate: HKQuery.predicateForObjects(with: Set(ids)))],
        sortDescriptors: []
      )
      samples.append(contentsOf: try await WorkoutsErrors.emptyOnUnauthorized([]) { try await query.result(for: store) })
    }
    guard !samples.isEmpty else { return }
    try await WorkoutsLegacyAssociation.add(samples, to: workout, store: store)
  }

  // ── the save ───────────────────────────────────────────────────────────────────────────────

  /// Path B in full.
  ///
  /// ⚠ **Deliberate deviation from design section 8.1 step 3, reported rather than hidden.** The
  /// design says a replacement should re-attach the previous version's associated samples to the new
  /// workout. Doing that DOUBLE COUNTS: the builder below already writes the payload's own distance,
  /// energy, heart-rate and step samples, so re-attaching version 1's distance sample next to
  /// version 2's would make `statistics(for:)` report their sum. The samples are deleted instead, so
  /// the stored workout equals the payload that was written — which is what "upsert" has to mean —
  /// and no orphan is left counting towards the user's daily totals in Health (index f26).
  public func saveWorkout(_ write: WorkoutWriteDTO) async throws -> SaveOutcomeDTO {
    guard isHealthDataAvailable() else {
      throw HealthStoringError.healthDataUnavailable
    }
    try WorkoutsWriteValidation.check(write, earliestPermitted: store.earliestPermittedSampleDate())

    // The ONLY thing standing between a `pendingUnlock` retry and a double write (index f24). It
    // comes before every platform call, so a locked device writes nothing at all.
    guard isProtectedDataAvailable() else {
      throw HealthStoringError.protectedDataUnavailable
    }

    let existing = try await fetchOwnWorkout(syncIdentifier: write.clientId)
    let existingVersion = existing.flatMap { ($0.metadata?[HKMetadataKeySyncVersion] as? NSNumber)?.intValue }

    if let version = existingVersion, version > write.version {
      // Raised by our own pre-lookup rather than by waiting for the platform's opaque
      // `com.apple.healthd.SQLite Code=1` (index f26).
      throw HealthStoringError.staleVersion
    }

    let target: HKWorkout
    if let existing, let version = existingVersion, version == write.version {
      // The resume path — a `pendingUnlock` or crash retry. Re-saving at an EQUAL version would
      // mint a NEW uuid and orphan the previous samples and route (index f26), which turns a crash
      // retry into data corruption. So the workout is not rewritten at all and only the route step
      // runs, exactly as f66 proved it can.
      target = existing
    } else {
      // A replacement's samples and route become orphans the moment the new workout lands, so they
      // are captured BEFORE the write and removed after it.
      var orphans: [HKSample] = []
      if let existing {
        orphans = try await associatedSamples(of: existing)
        for route in try await routeSamples(for: existing) {
          orphans.append(route)
        }
      }

      guard let saved = try await buildAndFinishWorkout(write) else {
        // `(nil workout, nil error)` is a THIRD outcome, neither success nor failure (index f24,
        // f70). The route is not attempted at all — and because path B never finishes a route
        // without a saved workout, a locked device cannot produce an orphaned route.
        return SaveOutcomeDTO(status: .pendingUnlock, nativeId: nil, route: .deferred, routePointsWritten: 0)
      }
      target = saved

      if !orphans.isEmpty {
        do {
          // Removing the old route here also removes f68's inheritance hazard: with nothing left to
          // replace, the new route cannot inherit the old one's workout association.
          try await store.delete(orphans as [HKObject])
        } catch {
          // The workout itself is already saved. Failing the whole call because a cleanup delete
          // failed would turn a successful write into an error the caller cannot act on.
          WorkoutsLog.cleanupFailed()
        }
      }
    }

    let nativeId = target.uuid.uuidString
    guard !write.route.isEmpty else {
      return SaveOutcomeDTO(status: .saved, nativeId: nativeId, route: RouteWriteOutcomeDTO.none, routePointsWritten: 0)
    }

    do {
      try await attachRoute(
        workoutUUID: target.uuid,
        points: write.route,
        syncIdentifier: write.routeSyncIdentifier,
        syncVersion: write.version
      )
    } catch HealthStoringError.routeNotPermitted {
      // Non-fatal, and symmetrical with Android (design section 5.7 row 49): the workout is saved,
      // the route is not. Design section 8.1 step 0 already excludes `'routes'` from the write
      // pre-flight for exactly this reason.
      return SaveOutcomeDTO(status: .saved, nativeId: nativeId, route: .notPermitted, routePointsWritten: 0)
    }
    return SaveOutcomeDTO(
      status: .saved,
      nativeId: nativeId,
      route: .stored,
      routePointsWritten: write.route.count
    )
  }

  private func buildAndFinishWorkout(_ write: WorkoutWriteDTO) async throws -> HKWorkout? {
    let configuration = HKWorkoutConfiguration()
    configuration.activityType = HKWorkoutActivityType(rawValue: UInt(write.activityTypeRaw)) ?? .other
    if let indoor = write.indoor {
      configuration.locationType = indoor ? .indoor : .outdoor
    }

    let start = WorkoutsTime.date(epochMs: write.startMs)
    let end = WorkoutsTime.date(epochMs: write.endMs)
    let builder = HKWorkoutBuilder(healthStore: store, configuration: configuration, device: nil)

    try await builder.beginCollection(at: start)
    let samples = WorkoutsSamples.build(write, start: start, end: end)
    if !samples.isEmpty {
      try await builder.addSamples(samples)
    }
    let events = WorkoutsSamples.events(write)
    if !events.isEmpty {
      try await builder.addWorkoutEvents(events)
    }
    try await builder.addMetadata(WorkoutsSamples.metadata(write))
    try await builder.endCollection(at: end)
    return try await builder.finishWorkout()
  }

  // ── the route ──────────────────────────────────────────────────────────────────────────────

  public func attachRoute(
    workoutUUID: UUID,
    points: [RoutePointDTO],
    syncIdentifier: String,
    syncVersion: Int
  ) async throws {
    // f84: `finishRoute` with zero inserted points throws. `./core` has already collapsed that case
    // into `route: 'dropped'`, so reaching here with an empty list is a caller bug.
    guard !points.isEmpty else {
      throw HealthStoringError.invalidArgument("route")
    }
    // Checked up front rather than discovered as an opaque XPC failure mid-insert (index f29).
    guard store.authorizationStatus(for: HKSeriesType.workoutRoute()) == .sharingAuthorized else {
      throw HealthStoringError.routeNotPermitted
    }
    guard let workout = try await fetchWorkout(uuid: workoutUUID) else {
      throw HealthStoringError.invalidArgument("nativeId")
    }

    // ALWAYS a brand-new builder (f63) — a second `finishRoute` on the same one throws, and a fresh
    // builder is what makes the retry idempotent.
    let builder = HKWorkoutRouteBuilder(healthStore: store, device: nil)
    var index = 0
    for size in WorkoutsChunking.sizes(pointCount: points.count) {
      let batch = points[index..<(index + size)].map(WorkoutsSamples.location(from:))
      do {
        try await builder.insertRouteData(batch)
      } catch {
        // ANY insert error is fatal for this builder. Continuing after one silently loses every
        // point that follows and finishes with no error at all (f64).
        throw WorkoutsRouteErrors.classify(error)
      }
      index += size
    }

    do {
      _ = try await builder.finishRoute(
        with: workout,
        metadata: [
          HKMetadataKeySyncIdentifier: syncIdentifier,
          HKMetadataKeySyncVersion: NSNumber(value: syncVersion),
        ]
      )
    } catch {
      throw WorkoutsRouteErrors.classify(error)
    }
  }

  // ── delete (design section 8.6) ────────────────────────────────────────────────────────────

  public func deleteWorkoutAndAssociated(uuid: UUID) async throws -> Bool {
    guard let workout = try await fetchWorkout(uuid: uuid) else {
      // An unknown id is not an error on either platform — it is `{ deleted: false }`.
      return false
    }
    guard workout.sourceRevision.source.bundleIdentifier == ownBundleIdentifier else {
      throw HealthStoringError.foreignRecord
    }
    // The associated samples and the route go FIRST: `store.delete(workout)` cascades to neither
    // (index f26), so deleting the workout first would leave both behind with nothing left to find
    // them by.
    var associated: [HKObject] = try await associatedSamples(of: workout)
    for route in try await routeSamples(for: workout) {
      associated.append(route)
    }
    if !associated.isEmpty {
      try await store.delete(associated)
    }
    try await store.delete(workout)
    return true
  }
}

// MARK: - chunk arithmetic (shared with the read path, pinned by route-vectors.json)

internal enum WorkoutsChunking {
  /// The observable chunk sequence for `count` points: full `routeChunkPoints` chunks and then the
  /// remainder. Both directions use it — inserts on the way in, `readRouteChunk` on the way out —
  /// so `tests/fixtures/route-vectors.json` pins one sequence for three languages while the 1000
  /// itself stays off every public surface (decision D8).
  static func sizes(pointCount: Int) -> [Int] {
    guard pointCount > 0 else { return [] }
    var out: [Int] = []
    var remaining = pointCount
    while remaining > 0 {
      let size = Swift.min(routeChunkPoints, remaining)
      out.append(size)
      remaining -= size
    }
    return out
  }
}

// MARK: - the types this library writes

internal enum WorkoutsManagedTypes {
  /// Every quantity type this library can attach to a workout. The list is the union of the read
  /// side (design section 8.8) and the write side's activity-driven distance types (section 8.3),
  /// because a workout written by an older version of this library may carry any of them.
  static func quantityTypes() -> [HKQuantityType] {
    let identifiers: [HKQuantityTypeIdentifier] = [
      .distanceWalkingRunning,
      .distanceCycling,
      .distanceSwimming,
      .distanceWheelchair,
      .activeEnergyBurned,
      .heartRate,
      .stepCount,
    ]
    var types = identifiers.compactMap { HKQuantityType.quantityType(forIdentifier: $0) }
    if #available(iOS 18.0, *) {
      if let rowing = HKQuantityType.quantityType(forIdentifier: .distanceRowing) {
        types.append(rowing)
      }
    }
    return types
  }
}

// MARK: - sample, event and metadata construction

internal enum WorkoutsSamples {
  static func build(_ write: WorkoutWriteDTO, start: Date, end: Date) -> [HKSample] {
    var out: [HKSample] = []

    // The distance quantity type comes from the ACTIVITY, not from a ternary: the vocabulary is nine
    // kinds since decision D11 (design section 8.3 C1..C4). `nil` means "write no distance sample",
    // which is the correct answer for strength training and for rowing below iOS 18 — falling back
    // to walking/running distance there would silently pollute the user's own walking totals.
    if let distanceM = write.distanceM, distanceM > 0,
       let identifier = WorkoutsQuantityTypes.writeDistanceIdentifier(forActivityTypeRaw: write.activityTypeRaw),
       let type = HKQuantityType.quantityType(forIdentifier: HKQuantityTypeIdentifier(rawValue: identifier)) {
      out.append(
        HKQuantitySample(
          type: type,
          quantity: HKQuantity(unit: .meter(), doubleValue: distanceM),
          start: start,
          end: end
        )
      )
    }

    if let energy = write.activeEnergyKcal, energy > 0,
       let type = HKQuantityType.quantityType(forIdentifier: .activeEnergyBurned) {
      out.append(
        HKQuantitySample(
          type: type,
          quantity: HKQuantity(unit: .kilocalorie(), doubleValue: energy),
          start: start,
          end: end
        )
      )
    }

    // Wheelchair propulsion is counted by HealthKit as push count, not step count, so writing it
    // into step count would make the user's own step totals wrong (design section 8.3 C3).
    if let steps = write.steps, steps > 0,
       WorkoutsQuantityTypes.writesStepSamples(forActivityTypeRaw: write.activityTypeRaw),
       let type = HKQuantityType.quantityType(forIdentifier: .stepCount) {
      out.append(
        HKQuantitySample(
          type: type,
          quantity: HKQuantity(unit: .count(), doubleValue: steps),
          start: start,
          end: end
        )
      )
    }

    if let type = HKQuantityType.quantityType(forIdentifier: .heartRate) {
      let unit = HKUnit.count().unitDivided(by: .minute())
      for sample in write.heartRate {
        let instant = WorkoutsTime.date(epochMs: sample.t)
        out.append(
          HKQuantitySample(
            type: type,
            quantity: HKQuantity(unit: unit, doubleValue: sample.bpm),
            start: instant,
            end: instant
          )
        )
      }
    }

    return out
  }

  static func events(_ write: WorkoutWriteDTO) -> [HKWorkoutEvent] {
    var out: [HKWorkoutEvent] = []
    for pause in write.pauses {
      out.append(
        HKWorkoutEvent(
          type: .pause,
          dateInterval: DateInterval(start: WorkoutsTime.date(epochMs: pause.startMs), duration: 0),
          metadata: nil
        )
      )
      out.append(
        HKWorkoutEvent(
          type: .resume,
          dateInterval: DateInterval(start: WorkoutsTime.date(epochMs: pause.endMs), duration: 0),
          metadata: nil
        )
      )
    }
    for lap in write.laps {
      let start = WorkoutsTime.date(epochMs: lap.startMs)
      let end = WorkoutsTime.date(epochMs: lap.endMs)
      out.append(
        HKWorkoutEvent(
          type: .lap,
          dateInterval: DateInterval(start: start, end: Swift.max(start, end)),
          metadata: nil
        )
      )
    }
    return out
  }

  static func metadata(_ write: WorkoutWriteDTO) -> [String: Any] {
    // Both sync keys, always together: HealthKit rejects a sync identifier without a sync version.
    var out: [String: Any] = [
      HKMetadataKeySyncIdentifier: write.clientId,
      HKMetadataKeySyncVersion: NSNumber(value: write.version),
    ]
    // The key is written ONLY when the caller said something. Writing `@NO` for "unknown" would
    // destroy the outdoor/unknown distinction for every future reader (f76).
    if let indoor = write.indoor {
      out[HKMetadataKeyIndoorWorkout] = NSNumber(value: indoor)
      if write.activityTypeRaw == WorkoutsSwimming.activityTypeRaw {
        // Keeps a fact we already hold rather than losing it on the way into Apple Health
        // (design section 8.3): pool when indoor, open water when not.
        out[HKMetadataKeySwimmingLocationType] = NSNumber(
          value: (indoor ? HKWorkoutSwimmingLocationType.pool : .openWater).rawValue
        )
      }
    }
    if let gain = write.elevationGainM {
      out[HKMetadataKeyElevationAscended] = HKQuantity(unit: .meter(), doubleValue: gain)
    }
    // Only when the writer named a zone. An offset alone cannot name one, so the key is never
    // synthesised from `utcOffsetMin`.
    if let timeZoneId = write.timeZoneId {
      out[HKMetadataKeyTimeZone] = timeZoneId
    }
    return out
  }

  /// `RoutePointDTO` -> `CLLocation`.
  ///
  /// An absent optional becomes CoreLocation's OWN "unknown" sentinel, `-1`, rather than a
  /// fabricated number: HealthKit stores it verbatim (f81) and the read path folds `-1` back to
  /// `undefined` (f83), so "I do not know this field" survives the round trip intact. `altM` is the
  /// one exception — CoreLocation has no altitude sentinel, so an absent altitude is written as `0`
  /// with `verticalAccuracy = -1`, which is CoreLocation's own way of saying the altitude is invalid.
  static func location(from point: RoutePointDTO) -> CLLocation {
    return CLLocation(
      coordinate: CLLocationCoordinate2D(latitude: point.lat, longitude: point.lon),
      altitude: point.altM ?? 0,
      horizontalAccuracy: point.hAccM ?? -1,
      verticalAccuracy: point.altM == nil ? -1 : (point.vAccM ?? -1),
      course: point.courseDeg ?? -1,
      speed: point.speedMps ?? -1,
      timestamp: WorkoutsTime.date(epochMs: point.t)
    )
  }
}

internal enum WorkoutsSwimming {
  /// `HKWorkoutActivityTypeSwimming`. Pinned by `tests/fixtures/activity-vectors.json`.
  static let activityTypeRaw = 46
}

// MARK: - validation (index f28 — this is a precondition, not error handling)

internal enum WorkoutsWriteValidation {
  /// HealthKit refuses a sample whose span reaches 24 h.
  private static let maxSampleSpanS: TimeInterval = 24 * 60 * 60

  static func check(_ write: WorkoutWriteDTO, earliestPermitted: Date) throws {
    guard write.clientId.count > 0 else {
      throw HealthStoringError.invalidArgument("clientId")
    }
    guard write.version >= 1 else {
      throw HealthStoringError.invalidArgument("version")
    }
    guard write.startMs.isFinite, write.endMs.isFinite, write.endMs > write.startMs else {
      throw HealthStoringError.invalidArgument("window")
    }
    let start = WorkoutsTime.date(epochMs: write.startMs)
    let end = WorkoutsTime.date(epochMs: write.endMs)
    guard end.timeIntervalSinceNow <= 1 else {
      throw HealthStoringError.invalidArgument("endMs")
    }
    guard start >= earliestPermitted else {
      throw HealthStoringError.invalidArgument("startMs")
    }
    // Only the cumulative samples span the whole workout, so only they are bound by the 24 h rule.
    let spansWholeWorkout = write.distanceM != nil || write.activeEnergyKcal != nil || write.steps != nil
    if spansWholeWorkout && end.timeIntervalSince(start) >= maxSampleSpanS {
      throw HealthStoringError.invalidArgument("window")
    }

    try positive(write.distanceM, field: "distanceM")
    try positive(write.activeEnergyKcal, field: "activeEnergyKcal")
    try positive(write.steps, field: "steps")
    if let gain = write.elevationGainM, !gain.isFinite {
      throw HealthStoringError.invalidArgument("elevationGainM")
    }

    for sample in write.heartRate {
      guard sample.t.isFinite, sample.bpm.isFinite, sample.bpm >= 1, sample.bpm <= 300 else {
        throw HealthStoringError.invalidArgument("heartRate")
      }
    }
    for pause in write.pauses {
      guard pause.startMs.isFinite, pause.endMs.isFinite, pause.endMs >= pause.startMs else {
        throw HealthStoringError.invalidArgument("pauses")
      }
    }
    for lap in write.laps {
      guard lap.startMs.isFinite, lap.endMs.isFinite, lap.endMs >= lap.startMs else {
        throw HealthStoringError.invalidArgument("laps")
      }
    }
    for point in write.route {
      guard point.t.isFinite, point.lat.isFinite, point.lon.isFinite else {
        throw HealthStoringError.invalidArgument("route")
      }
      guard point.lat >= -90, point.lat <= 90, point.lon >= -180, point.lon <= 180 else {
        // HealthKit stores `lat = 91` verbatim (f85) and Health Connect throws on it. Refusing here
        // is what makes the two platforms answer identically.
        throw HealthStoringError.invalidArgument("route")
      }
    }
  }

  private static func positive(_ value: Double?, field: String) throws {
    guard let value else { return }
    guard value.isFinite, value >= 0 else {
      throw HealthStoringError.invalidArgument(field)
    }
  }
}

// MARK: - route error classification

internal enum WorkoutsRouteErrors {
  /// A route step that fails for lack of the workout-route SHARE permission is NOT fatal: the
  /// workout is already saved and the caller gets `route: 'notPermitted'`, the same answer Android
  /// gives (design section 5.7 row 49). Everything else is `io` — the builder is abandoned and a
  /// retry, which builds a fresh one, is idempotent.
  static func classify(_ error: Error) -> HealthStoringError {
    let nsError = error as NSError
    guard nsError.domain == HKError.errorDomain else {
      return .routeInsertFailed
    }
    switch nsError.code {
    case HKError.Code.errorAuthorizationDenied.rawValue,
         HKError.Code.errorAuthorizationNotDetermined.rawValue,
         HKError.Code.errorRequiredAuthorizationDenied.rawValue,
         HKError.Code.errorHealthDataRestricted.rawValue:
      return .routeNotPermitted
    case HKError.Code.errorDatabaseInaccessible.rawValue:
      return .protectedDataUnavailable
    default:
      return .routeInsertFailed
    }
  }
}

/// `addSamples(_:to:)` is deprecated since iOS 17 and is still the ONLY way to attach an existing
/// sample to an existing workout (index f26). The wrapper carries the deprecation so the call site
/// does not have to silence anything.
internal enum WorkoutsLegacyAssociation {
  @available(iOS, deprecated: 17.0, message: "The only API that can re-attach an existing sample to an existing workout (index f26).")
  static func add(_ samples: [HKSample], to workout: HKWorkout, store: HKHealthStore) async throws {
    try await store.addSamples(samples, to: workout)
  }
}

/// Diagnostics that must never carry a health value, a coordinate, a title or a note. There is
/// exactly one message and it has no interpolation at all.
internal enum WorkoutsLog {
  static func cleanupFailed() {
    NSLog("[gj-kit/expo-workouts] a post-replacement cleanup delete failed; the workout itself was saved.")
  }
}
