// @gj-kit/expo-workouts — the iOS read path (design section 8.7, RESULTS 205 to 206).
//
// Everything here obeys four measured rules and nothing else:
//
//   1. every window is `.strictStartDate` — "start instant in `[from, to)`" (f87). The default
//      overlap predicate counts a midnight-crossing workout in two day windows and the strict-end
//      option puts it in none. `WorkoutsPredicates.startInstantWindow` is the only producer.
//   2. totals come from the three-tier ladder: `statistics(for:)` -> the deprecated per-workout
//      totals -> a time-window `HKStatisticsQueryDescriptor` (f71, f73, f74). Tier 2 is unreachable
//      on iOS 26.5 and is kept on purpose for older OS versions.
//   3. a tier-1 total is `associated` ONLY when a `predicateForObjects(from:)` sample query returns
//      something; otherwise HealthKit synthesised it from a legacy workout's deprecated totals and
//      it MUST be tagged `total` (f71). Tier 3 is always `derived`, which f74 showed can be a
//      number with nothing to do with the workout (999 m where the workout held 4321 m).
//   4. `activeDurationS` is `workout.duration`; the wall clock is `endDate - startDate`. The same
//      workout measured 1500 s and 1800 s for those two (f75), so they are never mixed.
//
// No judgement is made here. Activity mapping, sentinel folding and heart-rate hygiene are `./core`'s
// (they are pure TypeScript so they can be fuzzed in Node), and this file sends raw facts.

import Foundation
import HealthKit

extension HKHealthStoreAdapter {
  // ── window pages ───────────────────────────────────────────────────────────────────────────

  public func readWorkoutWindow(_ query: WindowQueryDTO, limit: Int, cursor: String?) async throws -> WorkoutPageDTO {
    let pageSize = limit > 0 ? limit : 200
    let anchor = try WorkoutsPageCursor.decode(cursor)

    // The upper bound narrows to the previous page's last item, so each page reads strictly less
    // than the one before it. `+ 1` keeps the anchor's own millisecond inside the window: two
    // workouts can share a start instant, and the uuid tiebreak below is what separates them.
    let upperMs = anchor.map { Swift.min(query.toMs, $0.startMs + 1) } ?? query.toMs
    if upperMs <= query.fromMs {
      return WorkoutPageDTO(items: [], nextPageToken: nil)
    }

    // Deliberately no query `limit`. A server-side limit picks an ARBITRARY subset of the workouts
    // that share the boundary instant, and the next page would then skip whichever tied workout the
    // first page did not happen to receive. Reading the remaining window and cutting it here is the
    // only ordering that is both total and stable; the expensive part of a page is the totals
    // ladder below, and that still runs `pageSize` times at most.
    let descriptor = HKSampleQueryDescriptor(
      predicates: [.workout(WorkoutsPredicates.startInstantWindow(fromMs: query.fromMs, toMs: upperMs))],
      sortDescriptors: [SortDescriptor(\HKWorkout.startDate, order: .reverse)]
    )
    let found = try await descriptor.result(for: store)

    // The ordering and the cut are a PURE function over `(startMs, uuid)` keys, in
    // `WorkoutsPaging`, so the property that actually matters — page N + page N+1 covers everything
    // exactly once, ties included — is proven by a fuzz test instead of by a device that happened
    // not to have two workouts starting in the same millisecond.
    var byUuid: [String: HKWorkout] = [:]
    var keys: [WorkoutsPageKey] = []
    keys.reserveCapacity(found.count)
    for workout in found {
      let uuid = workout.uuid.uuidString
      byUuid[uuid] = workout
      keys.append(WorkoutsPageKey(startMs: WorkoutsTime.epochMs(workout.startDate), uuid: uuid))
    }
    let walk = WorkoutsPaging.walk(keys, anchor: anchor, pageSize: pageSize)

    let page = walk.page.compactMap { byUuid[$0.uuid] }
    let items = try await mapWorkouts(page)
    let nextToken = walk.next.map { WorkoutsPageCursor.encode(startMs: $0.startMs, uuid: $0.uuid) }
    return WorkoutPageDTO(items: items, nextPageToken: nextToken)
  }

  // ── the anchored drain (design section 4.4) ────────────────────────────────────────────────

  public func drainWorkouts(anchor: String?, limit: Int) async throws -> AnchoredBatchDTO {
    let decoded = try WorkoutsAnchorCodec.decode(anchor)
    // `limit <= 0` is `takeCheckpoint()`: run the query for its ANCHOR only and consume nothing.
    // It has to read the whole stream — an anchor only ever advances past what was delivered, so a
    // limited query would hand back a checkpoint that re-delivers the entire history on the first
    // drain. Nothing is mapped in that case, which is what keeps it cheap: the totals ladder never
    // runs and no route query is issued.
    let unlimited = limit <= 0
    let descriptor = HKAnchoredObjectQueryDescriptor(
      predicates: [.workout(nil)],
      anchor: decoded,
      limit: unlimited ? nil : limit
    )
    let result = try await descriptor.result(for: store)
    let checkpoint = try WorkoutsAnchorCodec.encode(result.newAnchor)
    if unlimited {
      return AnchoredBatchDTO(added: [], removed: [], anchor: checkpoint, hasMore: false)
    }

    let added = try await mapWorkouts(result.addedSamples)
    let removed = try await mapDeleted(result.deletedObjects, added: result.addedSamples)
    let delivered = result.addedSamples.count + result.deletedObjects.count
    return AnchoredBatchDTO(added: added, removed: removed, anchor: checkpoint, hasMore: delivered >= limit)
  }

  /// `replaced` per design section 4.6: the deleted object's own sync identifier, matched first
  /// against the same batch's additions and then — because a replacement can straddle a batch
  /// boundary — against one sync-identifier lookup. No sync identifier at all (an Apple Watch
  /// workout, say) means `false`, which is the honest answer rather than a guess.
  private func mapDeleted(
    _ deleted: [HKDeletedObject],
    added: [HKWorkout]
  ) async throws -> [RemovedDTO] {
    let addedSyncIds = Set(added.compactMap { $0.metadata?[HKMetadataKeySyncIdentifier] as? String })
    var out: [RemovedDTO] = []
    out.reserveCapacity(deleted.count)
    for object in deleted {
      let syncId = object.metadata?[HKMetadataKeySyncIdentifier] as? String
      var replaced = false
      if let syncId {
        replaced = addedSyncIds.contains(syncId)
        if !replaced {
          replaced = try await fetchOwnWorkout(syncIdentifier: syncId) != nil
        }
      }
      out.append(RemovedDTO(id: object.uuid.uuidString, replaced: replaced))
    }
    return out
  }

  // ── metric records and heart rate ──────────────────────────────────────────────────────────

  public func readHeartRateSamples(_ query: WindowQueryDTO) async throws -> [HeartRateDTO] {
    guard let type = HKQuantityType.quantityType(forIdentifier: .heartRate) else {
      return []
    }
    let descriptor = HKSampleQueryDescriptor(
      predicates: [
        .quantitySample(
          type: type,
          predicate: WorkoutsPredicates.startInstantWindow(fromMs: query.fromMs, toMs: query.toMs)
        )
      ],
      sortDescriptors: [SortDescriptor(\HKQuantitySample.startDate, order: .forward)]
    )
    let unit = HKUnit.count().unitDivided(by: .minute())
    let samples = try await WorkoutsErrors.emptyOnUnauthorized([]) { try await descriptor.result(for: store) }
    return samples.map { sample in
      HeartRateDTO(t: WorkoutsTime.epochMs(sample.startDate), bpm: sample.quantity.doubleValue(for: unit))
    }
  }

  public func readMetricRecords(
    _ query: WindowQueryDTO,
    type: MetricTypeDTO,
    origins: Set<String>
  ) async throws -> [MetricRowDTO] {
    // ONE query per metric type per PAGE WINDOW — never one per session (design section 8.4).
    var out: [MetricRowDTO] = []
    for quantityType in WorkoutsMetricTypes.quantityTypes(for: type) {
      let descriptor = HKSampleQueryDescriptor(
        predicates: [
          .quantitySample(
            type: quantityType,
            predicate: WorkoutsPredicates.startInstantWindow(fromMs: query.fromMs, toMs: query.toMs)
          )
        ],
        sortDescriptors: [SortDescriptor(\HKQuantitySample.startDate, order: .forward)]
      )
      let unit = WorkoutsMetricTypes.unit(for: type)
      let samples = try await WorkoutsErrors.emptyOnUnauthorized([]) { try await descriptor.result(for: store) }
      for sample in samples {
        let origin = sample.sourceRevision.source.bundleIdentifier
        // An empty `origins` means "every source" — `readSteps` uses that form and then keeps the
        // largest single-origin total, so a phone and a watch are never added together.
        if !origins.isEmpty && !origins.contains(origin) { continue }
        out.append(
          MetricRowDTO(
            type: type,
            startMs: WorkoutsTime.epochMs(sample.startDate),
            endMs: WorkoutsTime.epochMs(sample.endDate),
            value: sample.quantity.doubleValue(for: unit),
            origin: origin
          )
        )
      }
    }
    return out
  }

  // ── the totals ladder ──────────────────────────────────────────────────────────────────────

  public func statistics(_ request: StatisticsRequestDTO) async throws -> StatisticsDTO {
    guard let workout = try await fetchWorkout(uuid: request.workoutUUID) else {
      return StatisticsDTO(value: nil, provenance: .derived)
    }
    return try await resolveStatistics(workout, quantity: request.quantity)
  }

  internal func resolveStatistics(_ workout: HKWorkout, quantity: QuantityKind) async throws -> StatisticsDTO {
    let activityRaw = Int(workout.workoutActivityType.rawValue)
    guard let type = WorkoutsQuantityTypes.readQuantityType(for: quantity, activityTypeRaw: activityRaw) else {
      return StatisticsDTO(value: nil, provenance: .derived)
    }
    let unit = WorkoutsQuantityTypes.unit(for: quantity)

    // Tier 1. On iOS 26.5 this also answers for legacy totals-only workouts (f71), so it cannot
    // decide provenance by itself — the associated-sample query does.
    if let sum = workout.statistics(for: type)?.sumQuantity()?.doubleValue(for: unit) {
      let associated = try await hasAssociatedSamples(workout, type: type)
      return StatisticsDTO(value: sum, provenance: associated ? .associated : .total)
    }

    // Tier 2. UNREACHABLE on iOS 26.5 (f73): whenever a total exists, tier 1 already returned the
    // same number. Kept deliberately for older OS versions — do not delete it.
    if let legacy = WorkoutsLegacyTotals.value(of: workout, quantity: quantity, unit: unit) {
      return StatisticsDTO(value: legacy, provenance: .total)
    }

    // Tier 3. Always `derived`: f74 measured 999 m from unassociated samples planted in the same
    // window where the workout itself held 4321 m.
    let descriptor = HKStatisticsQueryDescriptor(
      predicate: .quantitySample(
        type: type,
        predicate: WorkoutsPredicates.startInstantWindow(
          fromMs: WorkoutsTime.epochMs(workout.startDate),
          toMs: WorkoutsTime.epochMs(workout.endDate)
        )
      ),
      options: .cumulativeSum
    )
    let outcome = try await WorkoutsErrors.emptyOnUnauthorized(nil) {
      try await WorkoutsErrors.nilOnNoData { try await descriptor.result(for: store) }
    }
    let statistics: HKStatistics? = outcome ?? nil
    guard let value = statistics?.sumQuantity()?.doubleValue(for: unit) else {
      return StatisticsDTO(value: nil, provenance: .derived)
    }
    return StatisticsDTO(value: value, provenance: .derived)
  }

  // ── HKWorkout -> WorkoutDTO ────────────────────────────────────────────────────────────────

  /// Maps a page of workouts, enriching at most `WorkoutsReadConcurrency.maxInFlight` at a time.
  ///
  /// Each workout costs up to three small queries (route count and the two provenance
  /// discriminators). Sequentially that is ~600 ms for a 200-item page of HealthKit IPC round trips
  /// with the CPU idle; a bounded task group turns it into ~80 ms. The bound exists so a page can
  /// never open 600 concurrent queries against the store.
  internal func mapWorkouts(_ workouts: [HKWorkout]) async throws -> [WorkoutDTO] {
    if workouts.isEmpty { return [] }
    var out = [WorkoutDTO?](repeating: nil, count: workouts.count)
    try await withThrowingTaskGroup(of: (Int, WorkoutDTO).self) { group in
      let first = Swift.min(WorkoutsReadConcurrency.maxInFlight, workouts.count)
      for index in 0..<first {
        group.addTask { [self] in
          let dto = try await makeWorkoutDTO(workouts[index])
          return (index, dto)
        }
      }
      var next = first
      while let (index, dto) = try await group.next() {
        out[index] = dto
        if next < workouts.count {
          let pending = next
          next += 1
          group.addTask { [self] in
            let dto = try await makeWorkoutDTO(workouts[pending])
            return (pending, dto)
          }
        }
      }
    }
    return out.compactMap { $0 }
  }

  internal func makeWorkoutDTO(_ workout: HKWorkout) async throws -> WorkoutDTO {
    let metadata = workout.metadata ?? [:]
    let bundleIdentifier = workout.sourceRevision.source.bundleIdentifier
    let isOwn = bundleIdentifier == ownBundleIdentifier
    let syncIdentifier = metadata[HKMetadataKeySyncIdentifier] as? String
    let syncVersion = (metadata[HKMetadataKeySyncVersion] as? NSNumber)?.intValue
    let startMs = WorkoutsTime.epochMs(workout.startDate)
    let endMs = WorkoutsTime.epochMs(workout.endDate)
    let activityRaw = Int(workout.workoutActivityType.rawValue)

    async let routeCountTask = routeSamples(for: workout).count
    async let distanceTask = resolveStatistics(workout, quantity: .distance)
    async let energyTask = resolveStatistics(workout, quantity: .activeEnergy)
    let routeCount = try await routeCountTask
    let distance = try await distanceTask
    let energy = try await energyTask

    let timeZoneId = metadata[HKMetadataKeyTimeZone] as? String
    let elevationAscended = (metadata[HKMetadataKeyElevationAscended] as? HKQuantity)?.doubleValue(for: .meter())
    let elevationDescended = (metadata[HKMetadataKeyElevationDescended] as? HKQuantity)?.doubleValue(for: .meter())

    let events = WorkoutsEvents.split(workout.workoutEvents ?? [], endDate: workout.endDate)

    return WorkoutDTO(
      id: workout.uuid.uuidString,
      // Only our own sync identifier is a `clientId`. A foreign app's sync identifier is ITS key,
      // not ours, and the upsert rule ("key on clientId when isOwn") would collide on it.
      clientId: isOwn ? syncIdentifier : nil,
      isOwn: isOwn,
      activityTypeRaw: activityRaw,
      indoor: WorkoutsIndoor.read(metadata: metadata, workout: workout),
      startMs: startMs,
      endMs: endMs,
      // `workout.duration` is the WRITER's active time, not the wall clock (f75).
      activeDurationS: workout.duration,
      utcOffsetMin: WorkoutsTime.utcOffsetMin(timeZoneId: timeZoneId, at: workout.startDate),
      source: SourceDTO(
        id: bundleIdentifier,
        name: workout.sourceRevision.source.name,
        version: workout.sourceRevision.version,
        deviceModel: workout.device?.model
      ),
      distanceM: distance.value,
      distanceProvenance: distance.value == nil ? nil : distance.provenance,
      activeEnergyKcal: energy.value,
      activeEnergyProvenance: energy.value == nil ? nil : energy.provenance,
      elevationGainM: elevationAscended,
      heartRate: WorkoutsSummaries.heartRate(of: workout),
      // Tier 1 only, and on purpose: there is no `stepsProvenance` field, so a time-window fallback
      // would hand back the wearer's unrelated walking steps with no way to say where they came from.
      steps: WorkoutsSummaries.steps(of: workout),
      pauses: events.pauses,
      laps: events.laps,
      routeState: routeCount > 0 ? .available : RouteStateDTO.none,
      lastModifiedMs: nil,
      ios: IosWorkoutDataDTO(
        activityTypeRaw: activityRaw,
        bundleIdentifier: bundleIdentifier,
        productType: workout.sourceRevision.productType,
        osVersion: WorkoutsTime.osVersion(workout.sourceRevision.operatingSystemVersion),
        timeZoneId: timeZoneId,
        elevationDescendedM: elevationDescended,
        wallClockS: (endMs - startMs) / 1000,
        syncIdentifier: syncIdentifier,
        syncVersion: syncVersion,
        activityCount: workout.workoutActivities.count,
        // The ONLY honest indoor discriminator: writing `@NO` makes "outdoor" and "unknown"
        // indistinguishable for every future reader (f76).
        hasIndoorMetadataKey: metadata[HKMetadataKeyIndoorWorkout] != nil,
        routeSampleCount: routeCount
      )
    )
  }
}

// MARK: - small helpers, kept out of the flow above

internal enum WorkoutsReadConcurrency {
  /// Concurrent per-workout enrichments. Not a knob on any public surface.
  static let maxInFlight = 8
}

internal enum WorkoutsTime {
  static func epochMs(_ date: Date) -> Double {
    return (date.timeIntervalSince1970 * 1000).rounded()
  }

  static func date(epochMs: Double) -> Date {
    return Date(timeIntervalSince1970: epochMs / 1000)
  }

  /// The offset only exists when the writer named a zone. An offset cannot be recovered from
  /// anything else — a bare timestamp does not carry one — so `nil` is the honest answer.
  static func utcOffsetMin(timeZoneId: String?, at date: Date) -> Int? {
    guard let timeZoneId, let zone = TimeZone(identifier: timeZoneId) else { return nil }
    return zone.secondsFromGMT(for: date) / 60
  }

  static func osVersion(_ version: OperatingSystemVersion) -> String {
    return "\(version.majorVersion).\(version.minorVersion).\(version.patchVersion)"
  }
}

internal enum WorkoutsIndoor {
  /// The f76 ladder: the metadata key first, then the activity's location type, then UNKNOWN.
  ///
  /// `nil` is a different fact from `false` and must survive as such — location type raw 3 is the
  /// coerced default for "the writer said nothing", not evidence of an outdoor workout.
  static func read(metadata: [String: Any], workout: HKWorkout) -> Bool? {
    if let flag = metadata[HKMetadataKeyIndoorWorkout] as? NSNumber {
      return flag.boolValue
    }
    if workout.workoutActivities.first?.workoutConfiguration.locationType == .indoor {
      return true
    }
    return nil
  }
}

internal enum WorkoutsSummaries {
  static func heartRate(of workout: HKWorkout) -> HeartRateSummaryDTO? {
    guard let type = HKQuantityType.quantityType(forIdentifier: .heartRate),
          let statistics = workout.statistics(for: type)
    else {
      return nil
    }
    let unit = HKUnit.count().unitDivided(by: .minute())
    let average = statistics.averageQuantity()?.doubleValue(for: unit)
    let minimum = statistics.minimumQuantity()?.doubleValue(for: unit)
    let maximum = statistics.maximumQuantity()?.doubleValue(for: unit)
    if average == nil && minimum == nil && maximum == nil { return nil }
    return HeartRateSummaryDTO(avgBpm: average, minBpm: minimum, maxBpm: maximum)
  }

  static func steps(of workout: HKWorkout) -> Double? {
    guard let type = HKQuantityType.quantityType(forIdentifier: .stepCount) else { return nil }
    return workout.statistics(for: type)?.sumQuantity()?.doubleValue(for: .count())
  }
}

internal enum WorkoutsEvents {
  /// Pauses and laps out of the raw event list. An unterminated pause is closed at the workout end
  /// rather than dropped — a workout that was paused and never resumed really was paused until it
  /// ended.
  static func split(
    _ events: [HKWorkoutEvent],
    endDate: Date
  ) -> (pauses: [PauseDTO], laps: [LapDTO]) {
    var pauses: [PauseDTO] = []
    var laps: [LapDTO] = []
    var openPause: (start: Date, auto: Bool)?
    for event in events.sorted(by: { $0.dateInterval.start < $1.dateInterval.start }) {
      switch event.type {
      case .pause:
        if openPause == nil { openPause = (event.dateInterval.start, false) }
      case .motionPaused:
        if openPause == nil { openPause = (event.dateInterval.start, true) }
      case .resume, .motionResumed:
        if let open = openPause {
          pauses.append(
            PauseDTO(
              startMs: WorkoutsTime.epochMs(open.start),
              endMs: WorkoutsTime.epochMs(event.dateInterval.start),
              // `auto` is only ever asserted for the motion events, which ARE the platform saying
              // "I paused this myself". A plain pause event says nothing about who caused it.
              auto: open.auto ? true : nil
            )
          )
          openPause = nil
        }
      case .lap, .segment:
        laps.append(
          LapDTO(
            startMs: WorkoutsTime.epochMs(event.dateInterval.start),
            endMs: WorkoutsTime.epochMs(event.dateInterval.end),
            distanceM: nil
          )
        )
      default:
        continue
      }
    }
    if let open = openPause {
      pauses.append(
        PauseDTO(
          startMs: WorkoutsTime.epochMs(open.start),
          endMs: WorkoutsTime.epochMs(endDate),
          auto: open.auto ? true : nil
        )
      )
    }
    return (pauses, laps)
  }
}

internal enum WorkoutsMetricTypes {
  /// `elevation` is deliberately EMPTY: `HKMetadataKeyElevationAscended` is metadata on the workout
  /// object and has no `HKObjectType` of its own, so there is no record to read. The read path
  /// takes it off the workout instead.
  static func quantityTypes(for type: MetricTypeDTO) -> [HKQuantityType] {
    let identifiers: [HKQuantityTypeIdentifier]
    switch type {
    case .distance:
      identifiers = [.distanceWalkingRunning, .distanceCycling]
    case .activeEnergy:
      identifiers = [.activeEnergyBurned]
    case .elevation:
      identifiers = []
    case .steps:
      identifiers = [.stepCount]
    }
    return identifiers.compactMap { HKQuantityType.quantityType(forIdentifier: $0) }
  }

  static func unit(for type: MetricTypeDTO) -> HKUnit {
    switch type {
    case .distance:
      return .meter()
    case .activeEnergy:
      return .kilocalorie()
    case .elevation:
      return .meter()
    case .steps:
      return .count()
    }
  }
}

/// Tier 2 of the totals ladder, behind a deprecation-suppressing wrapper.
///
/// `totalEnergyBurned` is deprecated since iOS 18 and `totalDistance` is `API_TO_BE_DEPRECATED`;
/// declaring this helper deprecated is what stops the compiler warning about them without hiding
/// the fact that they are deprecated. f73 measured that this tier is unreachable on iOS 26.5 — it is
/// kept for older OS versions on explicit instruction and must not be deleted.
internal enum WorkoutsLegacyTotals {
  @available(iOS, deprecated: 18.0, message: "Tier 2 of the totals ladder — kept for OS versions where tier 1 does not synthesise totals (f73).")
  static func value(of workout: HKWorkout, quantity: QuantityKind, unit: HKUnit) -> Double? {
    switch quantity {
    case .distance:
      return workout.totalDistance?.doubleValue(for: unit)
    case .activeEnergy:
      return workout.totalEnergyBurned?.doubleValue(for: unit)
    }
  }
}

/// The opaque page token. HealthKit has no paging cursor of its own, so this is ours: the last
/// delivered item's start instant and uuid, which together are a total order over the page sequence.
/// `./core` wraps it again in the `gjp1.` page-token magic, so a sync cursor handed to a page-token
/// parameter still fails loudly.
/// One workout's position in the page order: its start instant and its uuid.
internal struct WorkoutsPageKey: Equatable, Sendable {
  let startMs: Double
  let uuid: String
}

/// The page walk, as a pure function.
///
/// Two properties matter and neither is obvious:
///
///   1. **The order is TOTAL.** `WorkoutPage.items` promises descending start instants, and two
///      workouts really can share one — so the uuid breaks the tie. Without a total order, "the page
///      after this one" is not a well-defined thing and a multi-launch backfill cannot resume.
///   2. **Ties do not fall through the crack between pages.** A server-side `limit` would hand back
///      an ARBITRARY subset of the workouts sharing the boundary instant, and the next page would
///      then skip whichever tied workout the first page did not happen to receive. That is why
///      `readWorkoutWindow` asks for the whole remaining window and cuts it here.
internal enum WorkoutsPaging {
  /// Descending by start instant, then descending by uuid.
  static func isBefore(_ left: WorkoutsPageKey, _ right: WorkoutsPageKey) -> Bool {
    if left.startMs != right.startMs { return left.startMs > right.startMs }
    return left.uuid > right.uuid
  }

  /// Was `key` already delivered by the page that ended at `anchor`?
  static func isDelivered(_ key: WorkoutsPageKey, anchor: WorkoutsPageKey) -> Bool {
    if key.startMs > anchor.startMs { return true }
    if key.startMs < anchor.startMs { return false }
    return key.uuid >= anchor.uuid
  }

  /// `page` is at most `pageSize` keys; `next` is the token anchor, present only when more remain.
  static func walk(
    _ keys: [WorkoutsPageKey],
    anchor: (startMs: Double, uuid: String)?,
    pageSize: Int
  ) -> (page: [WorkoutsPageKey], next: WorkoutsPageKey?) {
    let ordered = keys.sorted(by: isBefore)
    let remaining: [WorkoutsPageKey]
    if let anchor {
      let anchorKey = WorkoutsPageKey(startMs: anchor.startMs, uuid: anchor.uuid)
      remaining = ordered.filter { !isDelivered($0, anchor: anchorKey) }
    } else {
      remaining = ordered
    }
    let page = Array(remaining.prefix(Swift.max(0, pageSize)))
    // A token is emitted ONLY when something is left. Emitting one for an exhausted window would
    // make the caller ask again forever.
    return (page, remaining.count > page.count ? page.last : nil)
  }
}

internal enum WorkoutsPageCursor {
  static func encode(startMs: Double, uuid: String) -> String {
    return Data("\(Int(startMs))|\(uuid)".utf8).base64EncodedString()
  }

  static func decode(_ token: String?) throws -> (startMs: Double, uuid: String)? {
    guard let token, !token.isEmpty else { return nil }
    guard let data = Data(base64Encoded: token),
          let text = String(data: data, encoding: .utf8)
    else {
      throw HealthStoringError.invalidArgument("pageToken")
    }
    let parts = text.split(separator: "|", maxSplits: 1, omittingEmptySubsequences: false)
    guard parts.count == 2, let startMs = Double(parts[0]), !parts[1].isEmpty else {
      throw HealthStoringError.invalidArgument("pageToken")
    }
    return (startMs, String(parts[1]))
  }
}

/// `HKQueryAnchor` is `NSSecureCoding` (index f17). The base64 of its archive is what travels inside
/// the sync cursor, and iOS anchors never expire — only Health Connect's change token does.
internal enum WorkoutsAnchorCodec {
  static func encode(_ anchor: HKQueryAnchor) throws -> String {
    let data = try NSKeyedArchiver.archivedData(withRootObject: anchor, requiringSecureCoding: true)
    return data.base64EncodedString()
  }

  static func decode(_ value: String?) throws -> HKQueryAnchor? {
    guard let value, !value.isEmpty else { return nil }
    guard let data = Data(base64Encoded: value),
          let anchor = try? NSKeyedUnarchiver.unarchivedObject(ofClass: HKQueryAnchor.self, from: data)
    else {
      throw HealthStoringError.invalidArgument("checkpoint")
    }
    return anchor
  }
}

internal enum WorkoutsErrors {
  /// `HKErrorNoData` means "there was nothing to compute", which is an ABSENCE and not a failure.
  /// Folding it to `nil` here is what keeps an empty window from becoming a rejected promise.
  static func nilOnNoData<T>(_ run: () async throws -> T) async throws -> T? {
    do {
      return try await run()
    } catch let error as NSError where error.domain == HKError.errorDomain
      && error.code == HKError.Code.errorNoData.rawValue {
      return nil
    }
  }

  /// `true` for the four HealthKit codes that mean "this app may not touch that type".
  static func isAuthorization(_ error: Error) -> Bool {
    let nsError = error as NSError
    guard nsError.domain == HKError.errorDomain else { return false }
    return [
      HKError.Code.errorAuthorizationDenied.rawValue,
      HKError.Code.errorAuthorizationNotDetermined.rawValue,
      HKError.Code.errorRequiredAuthorizationDenied.rawValue,
      HKError.Code.errorHealthDataRestricted.rawValue,
    ].contains(nsError.code)
  }

  /// An AUXILIARY read of a type this app may not touch is an ABSENCE, not a failure.
  ///
  /// ⚠ This is the difference between the design's rule and what the platform actually does, and it
  /// was measured on device in Phase 3. Design section 5.7 row 10 says a denied iOS read is "not an
  /// error — an empty result", and that is true for a read the user DENIED. It is NOT true for a
  /// type the app never REQUESTED: HealthKit fails that query with `errorAuthorizationNotDetermined`
  /// instead of returning nothing. Without this fold, an app that asked for `read: ['workouts']`
  /// alone would have `listWorkouts` reject outright, and — the way it actually showed up — a
  /// replacement or a delete would fail with `notAuthorized` because the ORPHAN SWEEP queries the
  /// swimming, rowing and wheelchair distance types, which design section 8.8 deliberately never
  /// authorizes.
  ///
  /// It is applied to auxiliary reads only. The workout window query and the anchored drain still
  /// surface their error: an app that cannot read workouts at all has nothing to page through, and
  /// silently handing it an empty history would hide the one fact it needs.
  static func emptyOnUnauthorized<T>(_ fallback: T, _ run: () async throws -> T) async throws -> T {
    do {
      return try await run()
    } catch where isAuthorization(error) {
      return fallback
    }
  }
}
