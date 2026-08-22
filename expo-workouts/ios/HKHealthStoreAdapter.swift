// @gj-kit/expo-workouts — the shipping `HealthStoring` conformer (design sections 3.3, 8.1, 8.7).
//
// This file holds the class itself: one `HKHealthStore` for the process lifetime, the protected-data
// flag, the route handle registry, and the availability/authorization half of the protocol. The
// three heavy halves live next door so no single file has to be read whole to change one of them:
//
//   * `WorkoutsReadPath.swift`  — window pages, the anchored drain, the totals ladder, provenance.
//   * `WorkoutsRoutePath.swift` — the pull-based route stream (1000 points per chunk, f78).
//   * `WorkoutsWritePath.swift` — path B in full (f61 to f70).
//
// One store instance for the process lifetime: 310 consecutive route reads showed no leak in either
// route-read API (f77), so there is no per-call teardown, no `autoreleasepool` gymnastics and no
// store recycling here. The incumbent library's leak report is a bug in its retain graph.
//
// Nothing in this file imports ExpoModulesCore. `GjKitWorkoutsModule` is the only place a
// `HealthStoringError` becomes a JavaScript-visible code.

import Foundation
import HealthKit
import UIKit

public final class HKHealthStoreAdapter: HealthStoring, @unchecked Sendable {
  internal let store = HKHealthStore()
  internal let routeStreams = RouteStreamRegistry()

  private let lock = NSLock()
  private var protectedDataAvailable = true
  private var observers: [NSObjectProtocol] = []

  public init(notificationCenter: NotificationCenter = .default) {
    // Cache the protected-data flag from the two lifecycle notifications rather than reading
    // `UIApplication.shared.isProtectedDataAvailable` on every write, which is main-actor isolated
    // and would force each write pre-check to hop to the main actor.
    //
    // Evidence status: index f24 is [unverified] — no simulator mechanism forces protected-data
    // unavailability and no physical device was available in Phase 0 (f70). Everything here is the
    // defensive design that fact demands, not measured behaviour.
    let available = notificationCenter.addObserver(
      forName: UIApplication.protectedDataDidBecomeAvailableNotification,
      object: nil,
      queue: nil
    ) { [weak self] _ in
      self?.setProtectedDataAvailable(true)
    }
    let unavailable = notificationCenter.addObserver(
      forName: UIApplication.protectedDataWillBecomeUnavailableNotification,
      object: nil,
      queue: nil
    ) { [weak self] _ in
      self?.setProtectedDataAvailable(false)
    }
    observers = [available, unavailable]

    // A cold launch onto a locked device must not start out optimistically `true`. The initial read
    // is the only place `UIApplication` is touched, and it hops to the main actor to do it.
    Task { @MainActor [weak self] in
      self?.setProtectedDataAvailable(UIApplication.shared.isProtectedDataAvailable)
    }
  }

  deinit {
    for observer in observers {
      NotificationCenter.default.removeObserver(observer)
    }
  }

  private func setProtectedDataAvailable(_ value: Bool) {
    lock.lock()
    protectedDataAvailable = value
    lock.unlock()
  }

  // ── availability and authorization ───────────────────────────────────────────────────────────

  public func isHealthDataAvailable() -> Bool {
    // `false` on iPad and anywhere else without a health store (index f19).
    return HKHealthStore.isHealthDataAvailable()
  }

  public func isProtectedDataAvailable() -> Bool {
    lock.lock()
    defer { lock.unlock() }
    return protectedDataAvailable
  }

  public func sharingStatus(for types: [String]) -> [String: Int] {
    var result: [String: Int] = [:]
    for identifier in types {
      guard let type = healthObjectType(forIdentifier: identifier) else {
        continue
      }
      result[identifier] = store.authorizationStatus(for: type).rawValue
    }
    return result
  }

  public func wouldPrompt(read: Set<String>, share: Set<String>) async throws -> Bool {
    guard isHealthDataAvailable() else {
      throw HealthStoringError.healthDataUnavailable
    }
    let readTypes = Set(read.compactMap(healthObjectType(forIdentifier:)))
    let shareTypes = Set(share.compactMap(healthSampleType(forIdentifier:)))
    // A scope whose identifier list is empty (`elevation`, design section 8.8) must not keep this
    // `true` forever: asking about NO types can never produce a sheet.
    if readTypes.isEmpty && shareTypes.isEmpty {
      return false
    }
    return try await withCheckedThrowingContinuation { continuation in
      store.getRequestStatusForAuthorization(toShare: shareTypes, read: readTypes) { status, error in
        if let error {
          continuation.resume(throwing: error)
          return
        }
        continuation.resume(returning: status == .shouldRequest)
      }
    }
  }

  public func requestAuthorization(read: Set<String>, share: Set<String>) async throws {
    guard isHealthDataAvailable() else {
      throw HealthStoringError.healthDataUnavailable
    }
    let readTypes = Set(read.compactMap(healthObjectType(forIdentifier:)))
    let shareTypes = Set(share.compactMap(healthSampleType(forIdentifier:)))
    if readTypes.isEmpty && shareTypes.isEmpty {
      return
    }
    // A missing NSHealthShareUsageDescription / NSHealthUpdateUsageDescription CRASHES right here
    // and cannot be caught (index f19). The config plugin is the structural defence, and the
    // plugin introspect snapshot asserts both keys exist.
    try await store.requestAuthorization(toShare: shareTypes, read: readTypes)
  }

  // ── shared plumbing the three path files use ─────────────────────────────────────────────────

  /// One workout by uuid, or `nil`. Used by every seam member that takes a `nativeId` — the seam
  /// carries uuids, never HealthKit objects (index f56).
  internal func fetchWorkout(uuid: UUID) async throws -> HKWorkout? {
    let descriptor = HKSampleQueryDescriptor(
      predicates: [.workout(HKQuery.predicateForObjects(with: [uuid]))],
      sortDescriptors: [],
      limit: 1
    )
    return try await descriptor.result(for: store).first
  }

  /// The workout carrying `syncIdentifier` **among our own writes**. Restricting to our own source
  /// is not a nicety: sync identifiers are not namespaced by app, so another app's identical string
  /// would otherwise look like our own record and a save would try to replace something we do not
  /// own.
  internal func fetchOwnWorkout(syncIdentifier: String) async throws -> HKWorkout? {
    let predicate = NSCompoundPredicate(andPredicateWithSubpredicates: [
      HKQuery.predicateForObjects(withMetadataKey: HKMetadataKeySyncIdentifier, allowedValues: [syncIdentifier]),
      HKQuery.predicateForObjects(from: HKSource.default()),
    ])
    let descriptor = HKSampleQueryDescriptor(
      predicates: [.workout(predicate)],
      sortDescriptors: [SortDescriptor(\HKWorkout.startDate, order: .reverse)],
      limit: 1
    )
    return try await descriptor.result(for: store).first
  }

  /// Every route sample attached to `workout`, oldest first. A workout carries 0..n of them
  /// (index f13) — Apple Watch smoothing replaces a route later — which is why the read path merges
  /// them in time order instead of assuming one.
  internal func routeSamples(for workout: HKWorkout) async throws -> [HKWorkoutRoute] {
    let descriptor = HKSampleQueryDescriptor(
      predicates: [.workoutRoute(HKQuery.predicateForObjects(from: workout))],
      sortDescriptors: [SortDescriptor(\HKWorkoutRoute.startDate, order: .forward)]
    )
    // An app that never asked for the `routes` scope gets `routeState: 'none'` and an empty stream,
    // not a rejected promise — iOS has no `consentRequired` (index f13) and no way to tell "no route"
    // apart from "not allowed to look", so `none` is the whole truth this platform can offer.
    return try await WorkoutsErrors.emptyOnUnauthorized([]) { try await descriptor.result(for: store) }
  }

  /// `true` when at least one sample of `type` is associated with `workout`.
  ///
  /// RESULTS 206 / f71: this is the ONLY discriminator between a tier-1 total that is genuinely
  /// `associated` and one HealthKit synthesised from a legacy workout's deprecated totals.
  internal func hasAssociatedSamples(_ workout: HKWorkout, type: HKQuantityType) async throws -> Bool {
    let descriptor = HKSampleQueryDescriptor(
      predicates: [.quantitySample(type: type, predicate: HKQuery.predicateForObjects(from: workout))],
      sortDescriptors: [],
      limit: 1
    )
    // A type this app may not read cannot be shown to have associated samples, so the tier-1 value
    // is reported as a synthesised `total` rather than failing the whole page.
    let found = try await WorkoutsErrors.emptyOnUnauthorized([]) { try await descriptor.result(for: store) }
    return found.isEmpty == false
  }

  /// Bundle identifier of this app. `isOwn` and the delete guard both hang off it.
  internal var ownBundleIdentifier: String {
    return Bundle.main.bundleIdentifier ?? ""
  }

  public func routeSampleCount(workoutUUID: UUID) async throws -> Int {
    guard let workout = try await fetchWorkout(uuid: workoutUUID) else {
      return 0
    }
    return try await routeSamples(for: workout).count
  }

  public func hasAssociatedSamples(workoutUUID: UUID, quantity: QuantityKind) async throws -> Bool {
    guard let workout = try await fetchWorkout(uuid: workoutUUID) else {
      return false
    }
    let activityRaw = Int(workout.workoutActivityType.rawValue)
    guard let type = WorkoutsQuantityTypes.readQuantityType(for: quantity, activityTypeRaw: activityRaw) else {
      return false
    }
    return try await hasAssociatedSamples(workout, type: type)
  }
}

// MARK: - quantity type resolution shared by the read and write paths

extension WorkoutsQuantityTypes {
  /// The READ-side quantity type for one of the two provenance-discriminated quantities.
  ///
  /// Only two distance types are ever authorized for reading (design section 8.8), so only two are
  /// ever queried — a swim's `distanceM` therefore arrives as tier-3 `derived` unless we wrote it.
  static func readQuantityType(for quantity: QuantityKind, activityTypeRaw: Int) -> HKQuantityType? {
    switch quantity {
    case .distance:
      return HKQuantityType.quantityType(
        forIdentifier: HKQuantityTypeIdentifier(
          rawValue: WorkoutsQuantityTypes.readDistanceIdentifier(forActivityTypeRaw: activityTypeRaw)
        )
      )
    case .activeEnergy:
      return HKQuantityType.quantityType(forIdentifier: .activeEnergyBurned)
    }
  }

  /// The unit each quantity is reported in on the public surface. Metres and kilocalories are the
  /// units `WorkoutDto` declares; nothing else is ever handed to `doubleValue(for:)`.
  static func unit(for quantity: QuantityKind) -> HKUnit {
    switch quantity {
    case .distance:
      return .meter()
    case .activeEnergy:
      return .kilocalorie()
    }
  }
}
