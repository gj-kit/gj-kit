// @gj-kit/expo-workouts — the HealthKit seam (design section 3.3).
//
// `GjKitWorkoutsModule` owns a `HealthStoring`. The shipping conformer is `HKHealthStoreAdapter`,
// which lives in `HKHealthStoreAdapter.swift` plus the three `WorkoutsReadPath` /
// `WorkoutsRoutePath` / `WorkoutsWritePath` extensions; XCTest injects an in-memory conformer
// through `WorkoutsStoreInjection`. No HealthKit type crosses this protocol — only the `Sendable`
// structs of `WorkoutsDTO.swift`. That is what makes the whole module testable with no device, no
// entitlement and no Health app (index f56).
//
// This file imports ExpoModulesCore NOWHERE, on purpose: it type-checks with `swiftc -typecheck`
// against the bare iphonesimulator SDK, so a mistake here is caught without a pod install.
//
// ── The five bans this file exists to keep out of reach ─────────────────────────────────────────
//   * the workout-builder series builder — one insert error yields a route-less workout with NO
//     error at finish (f64), discarding it destroys the workout save itself (f65), and it cannot
//     attach to an already-saved workout, which `pendingUnlock` retry requires (f66). Path B only.
//   * force-unwrapped `try` — index f47 (the crash mode of the incumbent library).
//   * the main-queue run modifier, and the closure-style `AsyncFunction` — both put HealthKit work
//     on the process-wide serial queue where a 36 000-point route read (1.1 s, f79) blocks the
//     whole app (index f8). Every async member below is a Swift-concurrency member for that reason.
//   * the strict-end-date predicate option — a midnight-crossing workout then belongs to no day
//     at all, and the default overlap predicate double-counts it into two (f87).
//   * a shared route sync identifier — a replacement route inherits the replaced route's workout
//     association and cross-links both workouts (f68). `WorkoutWriteDTO.routeSyncIdentifier` is the
//     only producer.

import Foundation
import HealthKit

// MARK: - errors raised by the seam itself

/// Errors the STORE can raise. `GjKitWorkoutsModule` is the only place that turns one of these into
/// a `Workouts*Exception`, so the seam stays free of ExpoModulesCore and stays unit-testable.
public enum HealthStoringError: Error, Sendable {
  /// This device has no health store at all (iPad and friends, index f19).
  case healthDataUnavailable
  /// Protected data is unavailable — the device is locked (index f24).
  case protectedDataUnavailable
  /// Caller input this layer refused before touching HealthKit. `HKQuantitySample.init` raises an
  /// Objective-C exception on bad input, which is a CRASH and not a rejected promise (index f28),
  /// so validation MUST happen before construction, never as error handling around it.
  case invalidArgument(String)
  /// The stored `HKMetadataKeySyncVersion` is newer than the one supplied (index f26).
  case staleVersion
  /// A route insert failed. That builder is poisoned and is abandoned immediately (f64).
  case routeInsertFailed
  /// A route handle that was never opened, or was already closed.
  case unknownRouteHandle
  /// A delete or a replace was aimed at a record another app owns. Symmetrical with Android:
  /// deleting someone else's workout is `notAuthorized` on both platforms (design section 8.6).
  case foreignRecord
  /// The route step of a save was refused for lack of the workout-route SHARE permission. Non-fatal:
  /// the workout itself is already saved, so this becomes `route: 'notPermitted'`, never a throw.
  case routeNotPermitted
}

// MARK: - the seam

public protocol HealthStoring: Sendable {
  // ── availability and authorization ───────────────────────────────────────────────────────────
  func isHealthDataAvailable() -> Bool
  /// The `storeLocked` pre-check that stops a `pendingUnlock` retry from double-writing (index f24).
  func isProtectedDataAvailable() -> Bool
  /// `authorizationStatus(for:)` per type identifier, as its raw `Int`. SHARING only — HealthKit
  /// never discloses read authorization, which is why every iOS read scope stays `'unknown'` (f14).
  func sharingStatus(for types: [String]) -> [String: Int]
  /// `getRequestStatusForAuthorization` ONLY (index f14). Never inferred from `authorizationStatus`.
  func wouldPrompt(read: Set<String>, share: Set<String>) async throws -> Bool
  func requestAuthorization(read: Set<String>, share: Set<String>) async throws

  // ── reads ────────────────────────────────────────────────────────────────────────────────────
  /// Start instant in `[fromMs, toMs)`, always via the strict-start-date predicate (f87).
  func readWorkoutWindow(_ query: WindowQueryDTO, limit: Int, cursor: String?) async throws -> WorkoutPageDTO
  /// `anchor == nil` reads everything. Returns the NSKeyedArchiver base64 of the NEW anchor (f17).
  func drainWorkouts(anchor: String?, limit: Int) async throws -> AnchoredBatchDTO
  func routeSampleCount(workoutUUID: UUID) async throws -> Int
  /// RESULTS 206: a tier-1 total is `associated` only when this returns `true`; otherwise the value
  /// is a synthesised legacy total and MUST be tagged `total` (f71).
  func hasAssociatedSamples(workoutUUID: UUID, quantity: QuantityKind) async throws -> Bool
  /// Tier 1 `statistics(for:)` -> tier 2 deprecated totals (kept for older OS, f73) -> tier 3
  /// window statistics. Tier 2 is defensive and unreachable on iOS 26.5; do not delete it.
  func statistics(_ request: StatisticsRequestDTO) async throws -> StatisticsDTO
  func readHeartRateSamples(_ query: WindowQueryDTO) async throws -> [HeartRateDTO]
  /// Per-origin metric rows for ONE page window — never one call per session (design section 8.4).
  func readMetricRecords(_ query: WindowQueryDTO, type: MetricTypeDTO, origins: Set<String>) async throws -> [MetricRowDTO]

  // ── routes: pull-based streaming ─────────────────────────────────────────────────────────────
  func openRoute(workoutUUID: UUID) async throws -> RouteHandle
  /// `nil` ends the stream. Convert and release every chunk; never accumulate the whole
  /// `[CLLocation]` array — that costs 415 B/point, 26x the converted form (f78).
  func readRouteChunk(_ handle: RouteHandle, maxPoints: Int) async throws -> [RoutePointDTO]?
  func closeRoute(_ handle: RouteHandle) async

  // ── writes ───────────────────────────────────────────────────────────────────────────────────
  func findWorkout(syncIdentifier: String) async throws -> ExistingWorkoutDTO?
  func associatedSampleIds(workoutUUID: UUID) async throws -> [UUID]
  /// Path B only. `(nil workout, nil error)` from `finishWorkout()` becomes `.pendingUnlock`
  /// (index f24, f70) — a third outcome that is neither success nor failure.
  func saveWorkout(_ write: WorkoutWriteDTO) async throws -> SaveOutcomeDTO
  /// A replacement re-attaches the previous workout's samples to the new one (index f26).
  func reattachSamples(_ ids: [UUID], toWorkout uuid: UUID) async throws
  /// ALWAYS a fresh route builder (f63). 1000-point inserts; ANY insert error aborts the route (f64).
  func attachRoute(workoutUUID: UUID, points: [RoutePointDTO], syncIdentifier: String, syncVersion: Int) async throws
  func deleteWorkoutAndAssociated(uuid: UUID) async throws -> Bool
}

// MARK: - route chunk size

/// 1000 points per chunk (f78). Deliberately NOT part of any public surface — exporting it would
/// make a 1000 -> 2000 adjustment a breaking change (decision D8). The equivalent TypeScript
/// constant carries the same rule and the same guard.
internal let routeChunkPoints = 1000

// MARK: - scope tables (design section 8.8, pinned by tests/fixtures/scope-mapping.json)

/// The split scope vocabulary. HealthKit already authorizes per object type, so the split vocabulary
/// is strictly MORE faithful here than a coarse one would be.
public enum WorkoutsScope: String, Sendable, CaseIterable {
  case workouts
  case distance
  case activeEnergy
  case elevation
  case routes
  case heartRate
  case steps
}

public enum WorkoutsScopeTypes {
  /// Type identifiers per scope. Identical for READ and SHARE on iOS.
  ///
  /// `distance` deliberately names TWO quantity types. Authorization happens once, before any
  /// workout has been read, so the activity is unknowable at that moment: a scope that asked for
  /// only one type would leave `distanceM` permanently `undefined` for exactly one class of
  /// workout. The scope names a CAPABILITY, not a type.
  ///
  /// `elevation` is deliberately EMPTY: `HKMetadataKeyElevationAscended` is metadata on the workout
  /// object and has no `HKObjectType` of its own, so on iOS this scope aliases `workouts`. It is the
  /// only place in the model where two scopes are not independent, and it is written down here
  /// rather than modelled as a fourth `ScopeStatus`.
  ///
  /// The D11 amendment added swimming, rowing and wheelchair WITHOUT widening this set — those
  /// distance types are used on the WRITE path only (design section 8.3 C1..C4). [unverified] on
  /// device: a foreign-authored swim's `distanceM` should then arrive as tier-3 `derived`.
  public static let identifiers: [WorkoutsScope: [String]] = [
    .workouts: ["HKWorkoutTypeIdentifier"],
    .distance: [
      "HKQuantityTypeIdentifierDistanceWalkingRunning",
      "HKQuantityTypeIdentifierDistanceCycling",
    ],
    .activeEnergy: ["HKQuantityTypeIdentifierActiveEnergyBurned"],
    .elevation: [],
    .routes: ["HKWorkoutRouteTypeIdentifier"],
    .heartRate: ["HKQuantityTypeIdentifierHeartRate"],
    .steps: ["HKQuantityTypeIdentifierStepCount"],
  ]
}

// MARK: - scope fingerprint (design section 4.2)

public enum WorkoutsScopeFingerprint {
  /// FNV-1a over the SORTED granted permission strings, joined by a single space, rendered base 36.
  ///
  /// Byte-for-byte the same function as `scopeFingerprint` in `src/core/sync/cursor.ts`, including
  /// its two deliberate quirks: it iterates UTF-16 code units, and it masks each one to its low
  /// byte. Both are load-bearing for cross-language equality, not accidents.
  ///
  /// The fingerprint is over PERMISSION STRINGS, never over scope names, which is why the split
  /// scope vocabulary did not invalidate a single existing cursor. When the user later grants one
  /// more type, the fingerprint flips, `syncWorkouts` returns `reset: true` with reason
  /// `scopesChanged`, and the re-backfill fills in the field that was silently empty before — the
  /// mechanism that makes a read trap self-healing after one more ask.
  public static func compute(_ permissions: [String]) -> String {
    let joined = permissions.sorted().joined(separator: " ")
    var hash: UInt32 = 0x811c_9dc5
    for unit in joined.utf16 {
      hash ^= UInt32(unit & 0x00ff)
      hash = hash &* 0x0100_0193
    }
    return String(hash, radix: 36)
  }
}

// MARK: - activity-driven quantity types (design section 8.1 step 3, section 8.3 C1..C4)

public enum WorkoutsQuantityTypes {
  private static let cycling = 13
  private static let swimming = 46
  private static let rowing = 35
  private static let strengthTraining = 50
  private static let wheelchairWalkPace = 70

  /// WRITE path. Picking the distance type from the activity is a table, not a ternary, since the
  /// D11 amendment took the vocabulary to nine kinds.
  ///
  /// `nil` means "write no distance sample at all". That is the correct answer for strength
  /// training, and it is also the correct answer for rowing below iOS 18: falling back to
  /// walking/running distance there would silently pollute the user's own walking totals.
  public static func writeDistanceIdentifier(forActivityTypeRaw raw: Int) -> String? {
    switch raw {
    case cycling:
      return "HKQuantityTypeIdentifierDistanceCycling"
    case swimming:
      return "HKQuantityTypeIdentifierDistanceSwimming"
    case wheelchairWalkPace:
      return "HKQuantityTypeIdentifierDistanceWheelchair"
    case rowing:
      // Rowing distance is an iOS 18.0 type against a 16.4 deployment target — the one narrow
      // availability amendment in this package. Below 18.0 we write no distance sample.
      if #available(iOS 18.0, *) {
        return "HKQuantityTypeIdentifierDistanceRowing"
      }
      return nil
    case strengthTraining:
      return nil
    default:
      return "HKQuantityTypeIdentifierDistanceWalkingRunning"
    }
  }

  /// WRITE path. Wheelchair propulsion is counted by HealthKit as push count, not step count, so
  /// writing it into step count would make the user's own step totals wrong. There is deliberately
  /// no `pushes` input field on the public surface either.
  public static func writesStepSamples(forActivityTypeRaw raw: Int) -> Bool {
    return raw != wheelchairWalkPace
  }

  /// READ path (design section 8.7). Only two distance types are ever authorized for reading, so
  /// only two are ever queried.
  public static func readDistanceIdentifier(forActivityTypeRaw raw: Int) -> String {
    return raw == cycling
      ? "HKQuantityTypeIdentifierDistanceCycling"
      : "HKQuantityTypeIdentifierDistanceWalkingRunning"
  }
}

// MARK: - HealthKit plumbing shared by every read

public enum WorkoutsPredicates {
  /// The ONLY time-window predicate this package builds.
  ///
  /// Every window on both platforms means "start instant in `[from, to)`". The default overlap
  /// predicate counts a midnight-crossing workout in two day windows, and adding the strict end
  /// option puts it in none. Both were measured at both boundaries (f87).
  public static func startInstantWindow(fromMs: Double, toMs: Double) -> NSPredicate {
    let start = Date(timeIntervalSince1970: fromMs / 1000)
    let end = Date(timeIntervalSince1970: toMs / 1000)
    return HKQuery.predicateForSamples(withStart: start, end: end, options: [.strictStartDate])
  }
}

/// Resolves one of the pinned identifier strings to a live `HKObjectType`.
/// Returns `nil` for an identifier this OS does not know, which is how a future type added to the
/// table degrades on an older OS instead of trapping.
internal func healthObjectType(forIdentifier identifier: String) -> HKObjectType? {
  if identifier == HKObjectType.workoutType().identifier {
    return HKObjectType.workoutType()
  }
  if identifier == HKSeriesType.workoutRoute().identifier {
    return HKSeriesType.workoutRoute()
  }
  return HKObjectType.quantityType(forIdentifier: HKQuantityTypeIdentifier(rawValue: identifier))
}

/// The share half of the same resolution. `HKObjectType.workoutType()` and the route series type are
/// both `HKSampleType`s, so the downcast covers every identifier in the table.
internal func healthSampleType(forIdentifier identifier: String) -> HKSampleType? {
  return healthObjectType(forIdentifier: identifier) as? HKSampleType
}

// MARK: - injection point

/// How XCTest swaps in an in-memory `HealthStoring` without the module owning a `var`.
///
/// A lock-guarded holder rather than a mutable `static var`, so this file carries no concurrency
/// opt-outs and compiles identically under every Swift language mode.
public final class WorkoutsStoreInjection: @unchecked Sendable {
  public static let shared = WorkoutsStoreInjection()

  private let lock = NSLock()
  private var factory: () -> any HealthStoring = { HKHealthStoreAdapter() }

  private init() {}

  /// Replaces the store factory. Test-only; the shipping app never calls this.
  public func setFactory(_ factory: @escaping () -> any HealthStoring) {
    lock.lock()
    self.factory = factory
    lock.unlock()
  }

  public func reset() {
    setFactory { HKHealthStoreAdapter() }
  }

  public func make() -> any HealthStoring {
    lock.lock()
    let factory = self.factory
    lock.unlock()
    return factory()
  }
}
