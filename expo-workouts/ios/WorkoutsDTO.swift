// @gj-kit/expo-workouts — iOS DTOs (design section 3.3).
//
// These are the ONLY types that cross the `HealthStoring` protocol. Deliberately:
//   * no HealthKit type appears here, so `XCTest` can drive the whole module against an
//     in-memory conformer with no device and no entitlement (index f56);
//   * no ExpoModulesCore type appears here either, so this file type-checks standalone;
//   * every struct is `Sendable`, because `HealthStoring` is `Sendable` and every call site is
//     a Swift-concurrency `AsyncFunction` body running off the shared serial queue (index f8).
//
// `toDictionary()` produces the exact flat, JSON-serialisable shape declared in
// `src/core/native-contract.ts`. An absent optional is an ABSENT KEY, never `NSNull`:
// `./core` folds "key missing" and `null` to `undefined` in one place, and the key-absent form
// is the cheaper of the two across the bridge.

import Foundation

// MARK: - dictionary helpers

/// Sets `key` only when `value` is non-nil. Absent optional -> absent key (see file header).
internal func putIfPresent(_ dictionary: inout [String: Any], _ key: String, _ value: Any?) {
  if let value {
    dictionary[key] = value
  }
}

// MARK: - windows and enumerations

/// A half-open window over START INSTANTS: `[fromMs, toMs)`. Never an overlap window (f87).
public struct WindowQueryDTO: Sendable, Equatable {
  public let fromMs: Double
  public let toMs: Double

  public init(fromMs: Double, toMs: Double) {
    self.fromMs = fromMs
    self.toMs = toMs
  }

  /// Fails when the caller handed us something `./core` should already have rejected.
  public init?(dictionary: [String: Any]) {
    guard let fromMs = dictionary["fromMs"] as? Double ?? (dictionary["fromMs"] as? NSNumber)?.doubleValue,
          let toMs = dictionary["toMs"] as? Double ?? (dictionary["toMs"] as? NSNumber)?.doubleValue
    else {
      return nil
    }
    self.init(fromMs: fromMs, toMs: toMs)
  }
}

/// The two quantities whose iOS provenance has to be discriminated (RESULTS 206 / f71).
public enum QuantityKind: String, Sendable, CaseIterable {
  case distance
  case activeEnergy
}

/// The four metric record types `./core` asks for, one call per type per PAGE WINDOW (section 8.4).
public enum MetricTypeDTO: String, Sendable, CaseIterable {
  case distance
  case activeEnergy
  case elevation
  case steps
}

/// `'associated'` requires a positive `predicateForObjects(from:)` sample count — a tier-1 value
/// with zero associated samples is a synthesised legacy total and MUST be tagged `total` (f71).
/// Tier 3 is always `derived`, which f74 showed can be a number unrelated to the workout.
public enum MetricProvenanceDTO: String, Sendable {
  case associated
  case total
  case derived
}

/// Mirrors `RouteState` in `src/core/types.ts`. Recomputed on every read, never cached (f114).
public enum RouteStateDTO: String, Sendable {
  case available
  case consentRequired
  case none
}

/// Mirrors `RouteWriteOutcome` in `src/core/types.ts`.
public enum RouteWriteOutcomeDTO: String, Sendable {
  case stored
  case none
  case dropped
  case notPermitted
  case deferred
}

// MARK: - availability and authorization

public struct AvailabilityDTO: Sendable {
  public enum Status: String, Sendable {
    case available
    case unavailable
    case updateRequired
  }

  /// iOS only ever reports `notSupported` — there is no provider to update and the deployment
  /// target already rules out `platformTooOld` (design section 5.7 rows 1 and 3).
  public enum Reason: String, Sendable {
    case platformTooOld
    case notSupported
  }

  public let status: Status
  public let reason: Reason?

  public init(status: Status, reason: Reason? = nil) {
    self.status = status
    self.reason = reason
  }

  public static let available = AvailabilityDTO(status: .available)
  public static let notSupported = AvailabilityDTO(status: .unavailable, reason: .notSupported)

  public func toDictionary() -> [String: Any] {
    var dictionary: [String: Any] = ["status": status.rawValue]
    putIfPresent(&dictionary, "reason", reason?.rawValue)
    return dictionary
  }
}

/// Raw facts only — this DTO makes NO judgement. `./core` derives every `ScopeStatus` from it.
public struct AuthorizationSnapshotDTO: Sendable {
  /// Share-authorized HealthKit type identifiers. iOS never reveals READ authorization (index f14),
  /// which is why `./core` reports every iOS read scope as `'unknown'` forever.
  public let granted: [String]
  /// The Info.plist-declared set. A scope outside it becomes `invalidArgument` naming the missing
  /// config-plugin prop (design section 5.7 row 58).
  public let declared: [String]
  /// `statusForAuthorizationRequest` said a sheet would still appear for at least one type (f14).
  public let wouldPrompt: Bool
  /// Phase 3: `authorizationStatus(for:)` per declared identifier, reduced to our vocabulary
  /// (`sharingAuthorized` -> `granted`, `sharingDenied` -> `denied`, `notDetermined` ->
  /// `undetermined`). SHARE side only — HealthKit has no read status at all, which is precisely why
  /// every iOS read scope is permanently `'unknown'`. Without this, `write.*` could never say
  /// `'denied'` and a settings screen could never honestly offer `openSettings()`.
  public let statuses: [String: String]
  public let availability: AvailabilityDTO

  public init(
    granted: [String],
    declared: [String],
    wouldPrompt: Bool,
    statuses: [String: String] = [:],
    availability: AvailabilityDTO
  ) {
    self.granted = granted
    self.declared = declared
    self.wouldPrompt = wouldPrompt
    self.statuses = statuses
    self.availability = availability
  }

  public func toDictionary() -> [String: Any] {
    return [
      "platform": "ios",
      "availability": availability.toDictionary(),
      "granted": granted,
      "declared": declared,
      "wouldPrompt": wouldPrompt,
      "statuses": statuses,
      // iOS has no process-importance precondition and no per-route consent: routes are readable
      // whenever the route type is authorized, so `routeAccess` is always `'all'`.
      "foreground": true,
      "routeAccess": "all",
      // iOS has no 30-day history wall. `null` is the honest answer, not `false`.
      "history": NSNull(),
    ]
  }
}

/// The raw before/after granted sets. `conclusive: false` means the platform told us nothing and
/// scope state MUST stay unchanged (design section 5.7 row 53).
public struct PermissionOutcomeDTO: Sendable {
  public let before: [String]
  public let after: [String]
  public let conclusive: Bool

  public init(before: [String], after: [String], conclusive: Bool) {
    self.before = before
    self.after = after
    self.conclusive = conclusive
  }

  public func toDictionary() -> [String: Any] {
    return ["before": before, "after": after, "conclusive": conclusive]
  }
}

// MARK: - workout payload

public struct SourceDTO: Sendable {
  public let id: String
  public let name: String?
  public let version: String?
  public let deviceModel: String?

  public init(id: String, name: String? = nil, version: String? = nil, deviceModel: String? = nil) {
    self.id = id
    self.name = name
    self.version = version
    self.deviceModel = deviceModel
  }

  public func toDictionary() -> [String: Any] {
    var dictionary: [String: Any] = ["id": id]
    putIfPresent(&dictionary, "name", name)
    putIfPresent(&dictionary, "version", version)
    putIfPresent(&dictionary, "deviceModel", deviceModel)
    return dictionary
  }
}

public struct PauseDTO: Sendable {
  public let startMs: Double
  public let endMs: Double
  public let auto: Bool?

  public init(startMs: Double, endMs: Double, auto: Bool? = nil) {
    self.startMs = startMs
    self.endMs = endMs
    self.auto = auto
  }

  public init?(dictionary: [String: Any]) {
    guard let startMs = (dictionary["startMs"] as? NSNumber)?.doubleValue,
          let endMs = (dictionary["endMs"] as? NSNumber)?.doubleValue
    else {
      return nil
    }
    self.init(startMs: startMs, endMs: endMs, auto: dictionary["auto"] as? Bool)
  }

  public func toDictionary() -> [String: Any] {
    var dictionary: [String: Any] = ["startMs": startMs, "endMs": endMs]
    putIfPresent(&dictionary, "auto", auto)
    return dictionary
  }
}

public struct LapDTO: Sendable {
  public let startMs: Double
  public let endMs: Double
  public let distanceM: Double?

  public init(startMs: Double, endMs: Double, distanceM: Double? = nil) {
    self.startMs = startMs
    self.endMs = endMs
    self.distanceM = distanceM
  }

  public init?(dictionary: [String: Any]) {
    guard let startMs = (dictionary["startMs"] as? NSNumber)?.doubleValue,
          let endMs = (dictionary["endMs"] as? NSNumber)?.doubleValue
    else {
      return nil
    }
    self.init(startMs: startMs, endMs: endMs, distanceM: (dictionary["distanceM"] as? NSNumber)?.doubleValue)
  }

  public func toDictionary() -> [String: Any] {
    var dictionary: [String: Any] = ["startMs": startMs, "endMs": endMs]
    putIfPresent(&dictionary, "distanceM", distanceM)
    return dictionary
  }
}

public struct HeartRateSummaryDTO: Sendable {
  public let avgBpm: Double?
  public let minBpm: Double?
  public let maxBpm: Double?

  public init(avgBpm: Double? = nil, minBpm: Double? = nil, maxBpm: Double? = nil) {
    self.avgBpm = avgBpm
    self.minBpm = minBpm
    self.maxBpm = maxBpm
  }

  public func toDictionary() -> [String: Any] {
    var dictionary: [String: Any] = [:]
    putIfPresent(&dictionary, "avgBpm", avgBpm)
    putIfPresent(&dictionary, "minBpm", minBpm)
    putIfPresent(&dictionary, "maxBpm", maxBpm)
    return dictionary
  }
}

/// The iOS escape hatch the common model deliberately does not fold in (`IosWorkoutData`).
public struct IosWorkoutDataDTO: Sendable {
  public let activityTypeRaw: Int
  public let bundleIdentifier: String
  public let productType: String?
  public let osVersion: String?
  /// From `HKMetadataKeyTimeZone`, present only when the writer supplied one. An offset alone
  /// cannot name a zone, so we never synthesise this key (design section 8.1 step 3).
  public let timeZoneId: String?
  public let elevationDescendedM: Double?
  /// `(endMs - startMs) / 1000`. NOT `activeDurationS` — the same workout measured 1800 s here and
  /// 1500 s there (f75), and the two must never be mixed.
  public let wallClockS: Double
  public let syncIdentifier: String?
  public let syncVersion: Int?
  public let activityCount: Int
  /// Whether `HKMetadataKeyIndoorWorkout` was PRESENT — the only honest indoor discriminator,
  /// because writing `@NO` makes "outdoor" and "unknown" indistinguishable forever (f76).
  public let hasIndoorMetadataKey: Bool
  public let routeSampleCount: Int

  public init(
    activityTypeRaw: Int,
    bundleIdentifier: String,
    productType: String? = nil,
    osVersion: String? = nil,
    timeZoneId: String? = nil,
    elevationDescendedM: Double? = nil,
    wallClockS: Double,
    syncIdentifier: String? = nil,
    syncVersion: Int? = nil,
    activityCount: Int,
    hasIndoorMetadataKey: Bool,
    routeSampleCount: Int
  ) {
    self.activityTypeRaw = activityTypeRaw
    self.bundleIdentifier = bundleIdentifier
    self.productType = productType
    self.osVersion = osVersion
    self.timeZoneId = timeZoneId
    self.elevationDescendedM = elevationDescendedM
    self.wallClockS = wallClockS
    self.syncIdentifier = syncIdentifier
    self.syncVersion = syncVersion
    self.activityCount = activityCount
    self.hasIndoorMetadataKey = hasIndoorMetadataKey
    self.routeSampleCount = routeSampleCount
  }

  public func toDictionary() -> [String: Any] {
    var dictionary: [String: Any] = [
      "activityTypeRaw": activityTypeRaw,
      "bundleIdentifier": bundleIdentifier,
      "wallClockS": wallClockS,
      "activityCount": activityCount,
      "hasIndoorMetadataKey": hasIndoorMetadataKey,
      "routeSampleCount": routeSampleCount,
    ]
    putIfPresent(&dictionary, "productType", productType)
    putIfPresent(&dictionary, "osVersion", osVersion)
    putIfPresent(&dictionary, "timeZoneId", timeZoneId)
    putIfPresent(&dictionary, "elevationDescendedM", elevationDescendedM)
    putIfPresent(&dictionary, "syncIdentifier", syncIdentifier)
    putIfPresent(&dictionary, "syncVersion", syncVersion)
    return dictionary
  }
}

/// One workout, flat.
///
/// There is NO `kind` field on purpose: the activity mapping lives in `src/core/activity.ts` so the
/// table is fuzzable on Node in three languages against `tests/fixtures/activity-vectors.json`.
/// Native sends `activityTypeRaw` and nothing else about the activity.
public struct WorkoutDTO: Sendable {
  public let id: String
  public let clientId: String?
  public let isOwn: Bool
  public let activityTypeRaw: Int
  /// iOS DOES supply this (the `HKIndoorWorkout` metadata ladder of f76). `nil` means "unknown",
  /// which is a different fact from `false` and must survive as such.
  public let indoor: Bool?
  public let startMs: Double
  public let endMs: Double
  /// `workout.duration` — the writer's own active duration, not the wall clock (f75).
  public let activeDurationS: Double
  public let utcOffsetMin: Int?
  public let source: SourceDTO
  public let distanceM: Double?
  public let distanceProvenance: MetricProvenanceDTO?
  public let activeEnergyKcal: Double?
  public let activeEnergyProvenance: MetricProvenanceDTO?
  public let elevationGainM: Double?
  public let heartRate: HeartRateSummaryDTO?
  public let steps: Double?
  public let pauses: [PauseDTO]
  public let laps: [LapDTO]
  public let routeState: RouteStateDTO
  public let lastModifiedMs: Double?
  public let ios: IosWorkoutDataDTO

  public init(
    id: String,
    clientId: String? = nil,
    isOwn: Bool,
    activityTypeRaw: Int,
    indoor: Bool? = nil,
    startMs: Double,
    endMs: Double,
    activeDurationS: Double,
    utcOffsetMin: Int? = nil,
    source: SourceDTO,
    distanceM: Double? = nil,
    distanceProvenance: MetricProvenanceDTO? = nil,
    activeEnergyKcal: Double? = nil,
    activeEnergyProvenance: MetricProvenanceDTO? = nil,
    elevationGainM: Double? = nil,
    heartRate: HeartRateSummaryDTO? = nil,
    steps: Double? = nil,
    pauses: [PauseDTO] = [],
    laps: [LapDTO] = [],
    routeState: RouteStateDTO,
    lastModifiedMs: Double? = nil,
    ios: IosWorkoutDataDTO
  ) {
    self.id = id
    self.clientId = clientId
    self.isOwn = isOwn
    self.activityTypeRaw = activityTypeRaw
    self.indoor = indoor
    self.startMs = startMs
    self.endMs = endMs
    self.activeDurationS = activeDurationS
    self.utcOffsetMin = utcOffsetMin
    self.source = source
    self.distanceM = distanceM
    self.distanceProvenance = distanceProvenance
    self.activeEnergyKcal = activeEnergyKcal
    self.activeEnergyProvenance = activeEnergyProvenance
    self.elevationGainM = elevationGainM
    self.heartRate = heartRate
    self.steps = steps
    self.pauses = pauses
    self.laps = laps
    self.routeState = routeState
    self.lastModifiedMs = lastModifiedMs
    self.ios = ios
  }

  public func toDictionary() -> [String: Any] {
    var dictionary: [String: Any] = [
      "platform": "ios",
      "id": id,
      "isOwn": isOwn,
      "activityTypeRaw": activityTypeRaw,
      "startMs": startMs,
      "endMs": endMs,
      "activeDurationS": activeDurationS,
      "source": source.toDictionary(),
      "pauses": pauses.map { $0.toDictionary() },
      "laps": laps.map { $0.toDictionary() },
      "routeState": routeState.rawValue,
      "ios": ios.toDictionary(),
    ]
    putIfPresent(&dictionary, "clientId", clientId)
    putIfPresent(&dictionary, "indoor", indoor)
    putIfPresent(&dictionary, "utcOffsetMin", utcOffsetMin)
    putIfPresent(&dictionary, "distanceM", distanceM)
    putIfPresent(&dictionary, "distanceProvenance", distanceProvenance?.rawValue)
    putIfPresent(&dictionary, "activeEnergyKcal", activeEnergyKcal)
    putIfPresent(&dictionary, "activeEnergyProvenance", activeEnergyProvenance?.rawValue)
    putIfPresent(&dictionary, "elevationGainM", elevationGainM)
    putIfPresent(&dictionary, "heartRate", heartRate?.toDictionary())
    putIfPresent(&dictionary, "steps", steps)
    putIfPresent(&dictionary, "lastModifiedMs", lastModifiedMs)
    return dictionary
  }
}

public struct WorkoutPageDTO: Sendable {
  public let items: [WorkoutDTO]
  /// HealthKit's own paging token, opaque to us. `./core` wraps it in the `gjp1.` page-token magic
  /// so a sync cursor handed to a page-token parameter fails loudly (design section 5.7 row 56).
  public let nextPageToken: String?

  public init(items: [WorkoutDTO], nextPageToken: String? = nil) {
    self.items = items
    self.nextPageToken = nextPageToken
  }

  public func toDictionary() -> [String: Any] {
    var dictionary: [String: Any] = ["items": items.map { $0.toDictionary() }]
    putIfPresent(&dictionary, "nextPageToken", nextPageToken)
    return dictionary
  }
}

public struct RemovedDTO: Sendable {
  public let id: String
  /// iOS mints a NEW uuid for a replacement, so a replacement always appears as a removal plus an
  /// addition in the same batch (design section 4.6).
  public let replaced: Bool

  public init(id: String, replaced: Bool) {
    self.id = id
    self.replaced = replaced
  }

  public func toDictionary() -> [String: Any] {
    return ["id": id, "replaced": replaced]
  }
}

/// One `HKAnchoredObjectQuery` drain. `anchor` is the NSKeyedArchiver base64 of the NEW anchor,
/// captured BEFORE this batch was produced (index f17).
public struct AnchoredBatchDTO: Sendable {
  public let added: [WorkoutDTO]
  public let removed: [RemovedDTO]
  public let anchor: String
  public let hasMore: Bool

  public init(added: [WorkoutDTO], removed: [RemovedDTO], anchor: String, hasMore: Bool) {
    self.added = added
    self.removed = removed
    self.anchor = anchor
    self.hasMore = hasMore
  }

  public func toDictionary() -> [String: Any] {
    return [
      "added": added.map { $0.toDictionary() },
      "removed": removed.map { $0.toDictionary() },
      "checkpoint": anchor,
      "hasMore": hasMore,
      // iOS anchors do not expire. Only Health Connect's change token does (index f38).
      "expired": false,
    ]
  }
}

public struct MetricRowDTO: Sendable {
  public let type: MetricTypeDTO
  public let startMs: Double
  public let endMs: Double
  public let value: Double
  /// The source bundle identifier, so `./core` can sum per origin instead of double-counting.
  public let origin: String

  public init(type: MetricTypeDTO, startMs: Double, endMs: Double, value: Double, origin: String) {
    self.type = type
    self.startMs = startMs
    self.endMs = endMs
    self.value = value
    self.origin = origin
  }

  public func toDictionary() -> [String: Any] {
    return [
      "type": type.rawValue,
      "startMs": startMs,
      "endMs": endMs,
      "value": value,
      "origin": origin,
    ]
  }
}

public struct HeartRateDTO: Sendable {
  public let t: Double
  public let bpm: Double

  public init(t: Double, bpm: Double) {
    self.t = t
    self.bpm = bpm
  }

  public init?(dictionary: [String: Any]) {
    guard let t = (dictionary["t"] as? NSNumber)?.doubleValue,
          let bpm = (dictionary["bpm"] as? NSNumber)?.doubleValue
    else {
      return nil
    }
    self.init(t: t, bpm: bpm)
  }

  public func toDictionary() -> [String: Any] {
    return ["t": t, "bpm": bpm]
  }
}

/// One of the three total tiers, already resolved (design section 8.7 / RESULTS 205-206).
public struct StatisticsRequestDTO: Sendable {
  public let workoutUUID: UUID
  public let quantity: QuantityKind
  /// The distance quantity type is chosen FROM THE ACTIVITY, not hard-coded to walking/running —
  /// otherwise a cycling workout's `distanceM` is `undefined` forever (design section 8.7).
  public let activityTypeRaw: Int
  public let startMs: Double
  public let endMs: Double

  public init(workoutUUID: UUID, quantity: QuantityKind, activityTypeRaw: Int, startMs: Double, endMs: Double) {
    self.workoutUUID = workoutUUID
    self.quantity = quantity
    self.activityTypeRaw = activityTypeRaw
    self.startMs = startMs
    self.endMs = endMs
  }
}

public struct StatisticsDTO: Sendable {
  public let value: Double?
  public let provenance: MetricProvenanceDTO

  public init(value: Double?, provenance: MetricProvenanceDTO) {
    self.value = value
    self.provenance = provenance
  }
}

// MARK: - routes

/// An opaque, pull-based route cursor. The HealthKit query state it names lives INSIDE the
/// conformer, keyed by `id`, so no HealthKit type crosses the protocol.
public struct RouteHandle: Sendable, Hashable {
  public let id: String
  public let state: RouteStateDTO

  public init(id: String, state: RouteStateDTO) {
    self.id = id
    self.state = state
  }

  public func toDictionary() -> [String: Any] {
    return ["handle": id, "state": state.rawValue]
  }

  public static func == (lhs: RouteHandle, rhs: RouteHandle) -> Bool {
    return lhs.id == rhs.id
  }

  public func hash(into hasher: inout Hasher) {
    hasher.combine(id)
  }
}

/// One route point. On READ, the `-1` sentinels are already folded to `nil` by `./core`'s
/// `route.ts`; native passes CoreLocation's values through unchanged so the fold happens in exactly
/// one place, in a language we can fuzz (f83).
public struct RoutePointDTO: Sendable {
  public let t: Double
  public let lat: Double
  public let lon: Double
  public let altM: Double?
  public let hAccM: Double?
  public let vAccM: Double?
  public let speedMps: Double?
  public let courseDeg: Double?

  public init(
    t: Double,
    lat: Double,
    lon: Double,
    altM: Double? = nil,
    hAccM: Double? = nil,
    vAccM: Double? = nil,
    speedMps: Double? = nil,
    courseDeg: Double? = nil
  ) {
    self.t = t
    self.lat = lat
    self.lon = lon
    self.altM = altM
    self.hAccM = hAccM
    self.vAccM = vAccM
    self.speedMps = speedMps
    self.courseDeg = courseDeg
  }

  public init?(dictionary: [String: Any]) {
    guard let t = (dictionary["t"] as? NSNumber)?.doubleValue,
          let lat = (dictionary["lat"] as? NSNumber)?.doubleValue,
          let lon = (dictionary["lon"] as? NSNumber)?.doubleValue
    else {
      return nil
    }
    self.init(
      t: t,
      lat: lat,
      lon: lon,
      altM: (dictionary["altM"] as? NSNumber)?.doubleValue,
      hAccM: (dictionary["hAccM"] as? NSNumber)?.doubleValue,
      vAccM: (dictionary["vAccM"] as? NSNumber)?.doubleValue,
      speedMps: (dictionary["speedMps"] as? NSNumber)?.doubleValue,
      courseDeg: (dictionary["courseDeg"] as? NSNumber)?.doubleValue
    )
  }

  public func toDictionary() -> [String: Any] {
    var dictionary: [String: Any] = ["t": t, "lat": lat, "lon": lon]
    putIfPresent(&dictionary, "altM", altM)
    putIfPresent(&dictionary, "hAccM", hAccM)
    putIfPresent(&dictionary, "vAccM", vAccM)
    putIfPresent(&dictionary, "speedMps", speedMps)
    putIfPresent(&dictionary, "courseDeg", courseDeg)
    return dictionary
  }
}

// MARK: - writes

public struct ExistingWorkoutDTO: Sendable {
  public let nativeId: String
  public let version: Int

  public init(nativeId: String, version: Int) {
    self.nativeId = nativeId
    self.version = version
  }

  public func toDictionary() -> [String: Any] {
    return ["nativeId": nativeId, "version": version]
  }
}

/// A write request that has ALREADY passed `./core`: window validation, route hygiene
/// (design section 8.2), heart-rate hygiene, the `steps <= 0` drop, and the activity mapping.
/// Swift still re-validates before touching HealthKit, because `HKQuantitySample.init` raises an
/// Objective-C exception on bad input — a CRASH, not a rejected promise (index f28).
public struct WorkoutWriteDTO: Sendable {
  public let clientId: String
  public let version: Int
  public let activityTypeRaw: Int
  /// `nil` means "do not write the `HKMetadataKeyIndoorWorkout` key at all". Writing `@NO` instead
  /// would destroy the outdoor/unknown distinction for every future reader (f76).
  public let indoor: Bool?
  public let startMs: Double
  public let endMs: Double
  public let utcOffsetMin: Int?
  public let timeZoneId: String?
  public let pauses: [PauseDTO]
  public let laps: [LapDTO]
  public let distanceM: Double?
  public let activeEnergyKcal: Double?
  public let elevationGainM: Double?
  public let steps: Double?
  public let heartRate: [HeartRateDTO]
  /// Already hygiene-passed. Empty means "no route" (design section 8.2 rules 1, 2 and 7).
  public let route: [RoutePointDTO]

  public init(
    clientId: String,
    version: Int,
    activityTypeRaw: Int,
    indoor: Bool? = nil,
    startMs: Double,
    endMs: Double,
    utcOffsetMin: Int? = nil,
    timeZoneId: String? = nil,
    pauses: [PauseDTO] = [],
    laps: [LapDTO] = [],
    distanceM: Double? = nil,
    activeEnergyKcal: Double? = nil,
    elevationGainM: Double? = nil,
    steps: Double? = nil,
    heartRate: [HeartRateDTO] = [],
    route: [RoutePointDTO] = []
  ) {
    self.clientId = clientId
    self.version = version
    self.activityTypeRaw = activityTypeRaw
    self.indoor = indoor
    self.startMs = startMs
    self.endMs = endMs
    self.utcOffsetMin = utcOffsetMin
    self.timeZoneId = timeZoneId
    self.pauses = pauses
    self.laps = laps
    self.distanceM = distanceM
    self.activeEnergyKcal = activeEnergyKcal
    self.elevationGainM = elevationGainM
    self.steps = steps
    self.heartRate = heartRate
    self.route = route
  }

  /// Decodes the flat bridge dictionary. Returns `nil` only for shapes `./core` cannot produce.
  public init?(dictionary: [String: Any]) {
    guard let clientId = dictionary["clientId"] as? String,
          let version = (dictionary["version"] as? NSNumber)?.intValue,
          let activityTypeRaw = (dictionary["activityTypeRaw"] as? NSNumber)?.intValue,
          let startMs = (dictionary["startMs"] as? NSNumber)?.doubleValue,
          let endMs = (dictionary["endMs"] as? NSNumber)?.doubleValue
    else {
      return nil
    }
    let pauses = (dictionary["pauses"] as? [[String: Any]] ?? []).compactMap(PauseDTO.init(dictionary:))
    let laps = (dictionary["laps"] as? [[String: Any]] ?? []).compactMap(LapDTO.init(dictionary:))
    let heartRate = (dictionary["heartRate"] as? [[String: Any]] ?? []).compactMap(HeartRateDTO.init(dictionary:))
    let route = (dictionary["route"] as? [[String: Any]] ?? []).compactMap(RoutePointDTO.init(dictionary:))
    self.init(
      clientId: clientId,
      version: version,
      activityTypeRaw: activityTypeRaw,
      indoor: dictionary["indoor"] as? Bool,
      startMs: startMs,
      endMs: endMs,
      utcOffsetMin: (dictionary["utcOffsetMin"] as? NSNumber)?.intValue,
      timeZoneId: dictionary["timeZoneId"] as? String,
      pauses: pauses,
      laps: laps,
      distanceM: (dictionary["distanceM"] as? NSNumber)?.doubleValue,
      activeEnergyKcal: (dictionary["activeEnergyKcal"] as? NSNumber)?.doubleValue,
      elevationGainM: (dictionary["elevationGainM"] as? NSNumber)?.doubleValue,
      steps: (dictionary["steps"] as? NSNumber)?.doubleValue,
      heartRate: heartRate,
      route: route
    )
  }

  /// The ONLY way a route sync identifier is ever produced. Sharing one across workouts makes a
  /// replacement route inherit the previous route's workout association and cross-link both (f68).
  public var routeSyncIdentifier: String {
    return "\(clientId)/route"
  }
}

public struct SaveOutcomeDTO: Sendable {
  public enum Status: String, Sendable {
    case saved
    /// `finishWorkout()` returned `(nil workout, nil error)` — a THIRD outcome, neither success nor
    /// failure. Never reproduced on a simulator (f70); the retry shape is proven by f66.
    case pendingUnlock
  }

  public let status: Status
  public let nativeId: String?
  public let route: RouteWriteOutcomeDTO
  public let routePointsWritten: Int

  public init(status: Status, nativeId: String? = nil, route: RouteWriteOutcomeDTO, routePointsWritten: Int) {
    self.status = status
    self.nativeId = nativeId
    self.route = route
    self.routePointsWritten = routePointsWritten
  }

  public func toDictionary() -> [String: Any] {
    var dictionary: [String: Any] = [
      "status": status.rawValue,
      "route": route.rawValue,
      "routePointsWritten": routePointsWritten,
    ]
    putIfPresent(&dictionary, "nativeId", nativeId)
    return dictionary
  }
}

public struct DeleteRefDTO: Sendable {
  public let nativeId: String?
  public let clientId: String?

  public init(nativeId: String? = nil, clientId: String? = nil) {
    self.nativeId = nativeId
    self.clientId = clientId
  }

  public init(dictionary: [String: Any]) {
    self.init(nativeId: dictionary["nativeId"] as? String, clientId: dictionary["clientId"] as? String)
  }
}
