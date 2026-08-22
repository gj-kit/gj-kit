// The `HealthStoring` seam itself (index f56) and the flat bridge shape it produces.
//
// Two things are proven here that nothing else can prove:
//
//   1. **The protocol is implementable with no HealthKit at all.** `InMemoryHealthStore` below is a
//      complete conformer written without a health store, a device or an entitlement. That is the
//      whole reason the seam exists, and a compiler error in this file is the alarm that the seam has
//      grown a platform dependency.
//   2. **The dictionaries `toDictionary()` emits are exactly the DTOs `src/core/native-contract.ts`
//      declares.** The bridge is untyped in both directions: a renamed key compiles, links, ships,
//      and then reads as `undefined` on the JavaScript side. The key lists below are transcribed
//      from that file and are the only thing standing between a typo and a silent `undefined`.

import Foundation
import XCTest

@testable import GjKitWorkoutsSeam

// MARK: - a conformer with no HealthKit in it

/// An in-memory `HealthStoring`. Deliberately simple: it exists to prove the seam is free of
/// platform types, not to imitate HealthKit's behaviour — the behavioural fake that `pnpm test`
/// drives lives in `src/testing.ts` and runs the real `./core` on top of it.
final class InMemoryHealthStore: HealthStoring, @unchecked Sendable {
  var protectedData = true
  var granted: Set<String> = []
  var workouts: [String: WorkoutDTO] = [:]
  var versions: [String: Int] = [:]
  var routes: [String: [RoutePointDTO]] = [:]
  private var streams: [String: [RoutePointDTO]] = [:]
  private(set) var attachedRouteSyncIdentifiers: [String] = []

  func isHealthDataAvailable() -> Bool { return true }
  func isProtectedDataAvailable() -> Bool { return protectedData }

  func sharingStatus(for types: [String]) -> [String: Int] {
    var out: [String: Int] = [:]
    for type in types { out[type] = granted.contains(type) ? 2 : 0 }
    return out
  }

  func wouldPrompt(read: Set<String>, share: Set<String>) async throws -> Bool {
    return !read.union(share).subtracting(granted).isEmpty
  }

  func requestAuthorization(read: Set<String>, share: Set<String>) async throws {
    granted.formUnion(share)
  }

  func readWorkoutWindow(_ query: WindowQueryDTO, limit: Int, cursor: String?) async throws -> WorkoutPageDTO {
    let items = workouts.values
      .filter { $0.startMs >= query.fromMs && $0.startMs < query.toMs }
      .sorted { $0.startMs > $1.startMs }
    return WorkoutPageDTO(items: Array(items.prefix(limit > 0 ? limit : items.count)), nextPageToken: nil)
  }

  func drainWorkouts(anchor: String?, limit: Int) async throws -> AnchoredBatchDTO {
    return AnchoredBatchDTO(added: [], removed: [], anchor: "anchor-0", hasMore: false)
  }

  func routeSampleCount(workoutUUID: UUID) async throws -> Int {
    return routes[workoutUUID.uuidString] == nil ? 0 : 1
  }

  func hasAssociatedSamples(workoutUUID: UUID, quantity: QuantityKind) async throws -> Bool {
    return false
  }

  func statistics(_ request: StatisticsRequestDTO) async throws -> StatisticsDTO {
    return StatisticsDTO(value: nil, provenance: .derived)
  }

  func readHeartRateSamples(_ query: WindowQueryDTO) async throws -> [HeartRateDTO] { return [] }

  func readMetricRecords(
    _ query: WindowQueryDTO,
    type: MetricTypeDTO,
    origins: Set<String>
  ) async throws -> [MetricRowDTO] {
    return []
  }

  func openRoute(workoutUUID: UUID) async throws -> RouteHandle {
    let handle = UUID().uuidString
    let points = routes[workoutUUID.uuidString] ?? []
    streams[handle] = points
    return RouteHandle(id: handle, state: points.isEmpty ? RouteStateDTO.none : .available)
  }

  func readRouteChunk(_ handle: RouteHandle, maxPoints: Int) async throws -> [RoutePointDTO]? {
    guard var remaining = streams[handle.id] else { throw HealthStoringError.unknownRouteHandle }
    guard !remaining.isEmpty else { return nil }
    let size = Swift.min(maxPoints, remaining.count)
    let chunk = Array(remaining.prefix(size))
    remaining.removeFirst(size)
    streams[handle.id] = remaining
    return chunk
  }

  func closeRoute(_ handle: RouteHandle) async {
    streams.removeValue(forKey: handle.id)
  }

  func findWorkout(syncIdentifier: String) async throws -> ExistingWorkoutDTO? {
    guard let version = versions[syncIdentifier] else { return nil }
    return ExistingWorkoutDTO(nativeId: syncIdentifier, version: version)
  }

  func associatedSampleIds(workoutUUID: UUID) async throws -> [UUID] { return [] }

  func saveWorkout(_ write: WorkoutWriteDTO) async throws -> SaveOutcomeDTO {
    try WorkoutsWriteValidation.check(write, earliestPermitted: Date(timeIntervalSince1970: 0))
    guard protectedData else { throw HealthStoringError.protectedDataUnavailable }
    if let stored = versions[write.clientId], stored > write.version {
      throw HealthStoringError.staleVersion
    }
    versions[write.clientId] = write.version
    if !write.route.isEmpty {
      try await attachRoute(
        workoutUUID: UUID(),
        points: write.route,
        syncIdentifier: write.routeSyncIdentifier,
        syncVersion: write.version
      )
    }
    return SaveOutcomeDTO(
      status: .saved,
      nativeId: write.clientId,
      route: write.route.isEmpty ? RouteWriteOutcomeDTO.none : .stored,
      routePointsWritten: write.route.count
    )
  }

  func reattachSamples(_ ids: [UUID], toWorkout uuid: UUID) async throws {}

  func attachRoute(
    workoutUUID: UUID,
    points: [RoutePointDTO],
    syncIdentifier: String,
    syncVersion: Int
  ) async throws {
    guard !points.isEmpty else { throw HealthStoringError.invalidArgument("route") }
    attachedRouteSyncIdentifiers.append(syncIdentifier)
    routes[workoutUUID.uuidString] = points
  }

  func deleteWorkoutAndAssociated(uuid: UUID) async throws -> Bool {
    return routes.removeValue(forKey: uuid.uuidString) != nil
  }
}

// MARK: - tests

final class SeamContractTests: XCTestCase {
  func testTheSeamIsImplementableWithoutAHealthStore() async throws {
    // The assertion IS that this file compiles and this call sequence runs. Index f56 is the reason
    // the protocol exists at all.
    let store: any HealthStoring = InMemoryHealthStore()
    XCTAssertTrue(store.isHealthDataAvailable())
    let page = try await store.readWorkoutWindow(
      WindowQueryDTO(fromMs: 0, toMs: 1),
      limit: 10,
      cursor: nil
    )
    XCTAssertEqual(page.items.count, 0)
  }

  func testASaveRefusesWhileProtectedDataIsUnavailableAndWritesNothing() async throws {
    let store = InMemoryHealthStore()
    store.protectedData = false
    let write = WorkoutWriteDTO(
      clientId: "w-1",
      version: 1,
      activityTypeRaw: 37,
      startMs: 1_700_000_000_000,
      endMs: 1_700_000_600_000,
      route: [RoutePointDTO(t: 1_700_000_001_000, lat: 37.5, lon: 127.0)]
    )
    do {
      _ = try await store.saveWorkout(write)
      XCTFail("a locked store must refuse before writing anything")
    } catch HealthStoringError.protectedDataUnavailable {
      // The pre-check is the ONLY thing stopping a `pendingUnlock` retry from double writing (f24).
      XCTAssertTrue(store.attachedRouteSyncIdentifiers.isEmpty)
      XCTAssertTrue(store.versions.isEmpty)
    }
  }

  func testALowerVersionIsStaleVersionRatherThanASecondCopy() async throws {
    let store = InMemoryHealthStore()
    let base = WorkoutWriteDTO(
      clientId: "w-1",
      version: 3,
      activityTypeRaw: 37,
      startMs: 1_700_000_000_000,
      endMs: 1_700_000_600_000
    )
    _ = try await store.saveWorkout(base)
    let older = WorkoutWriteDTO(
      clientId: "w-1",
      version: 2,
      activityTypeRaw: 37,
      startMs: 1_700_000_000_000,
      endMs: 1_700_000_600_000
    )
    do {
      _ = try await store.saveWorkout(older)
      XCTFail("a lower sync version must be refused")
    } catch HealthStoringError.staleVersion {
      XCTAssertEqual(store.versions["w-1"], 3)
    }
  }

  func testTheRouteStreamEndsWithNilAndTheHandleIsSafeToCloseTwice() async throws {
    let store = InMemoryHealthStore()
    let workoutId = UUID()
    let points = (0..<2500).map { index in
      RoutePointDTO(t: 1_700_000_000_000 + Double(index) * 1000, lat: 37.5, lon: 127.0)
    }
    try await store.attachRoute(workoutUUID: workoutId, points: points, syncIdentifier: "w-1/route", syncVersion: 1)

    let handle = try await store.openRoute(workoutUUID: workoutId)
    XCTAssertEqual(handle.state, .available)
    var sizes: [Int] = []
    while let chunk = try await store.readRouteChunk(handle, maxPoints: routeChunkPoints) {
      sizes.append(chunk.count)
    }
    XCTAssertEqual(sizes, WorkoutsChunking.sizes(pointCount: 2500))
    await store.closeRoute(handle)
    await store.closeRoute(handle)
  }

  func testAWorkoutWithNoRouteOpensAnEmptyStreamRatherThanFailing() async throws {
    let store = InMemoryHealthStore()
    let handle = try await store.openRoute(workoutUUID: UUID())
    // Design section 5.7 row 25: no route is an EMPTY STREAM, never an error.
    XCTAssertEqual(handle.state, RouteStateDTO.none)
    let chunk = try await store.readRouteChunk(handle, maxPoints: routeChunkPoints)
    XCTAssertNil(chunk)
  }
}

// MARK: - the flat bridge shape

final class BridgeShapeTests: XCTestCase {
  func testAuthorizationSnapshotCarriesEveryFieldTheContractDeclares() {
    let dictionary = AuthorizationSnapshotDTO(
      granted: ["HKWorkoutTypeIdentifier"],
      declared: ["HKWorkoutTypeIdentifier"],
      wouldPrompt: true,
      statuses: ["HKWorkoutTypeIdentifier": "granted"],
      availability: .available
    ).toDictionary()

    XCTAssertEqual(
      Set(dictionary.keys),
      [
        "platform", "availability", "granted", "declared", "wouldPrompt",
        "statuses", "foreground", "routeAccess", "history",
      ]
    )
    XCTAssertEqual(dictionary["platform"] as? String, "ios")
    // iOS has no process-importance precondition and no per-route consent step.
    XCTAssertEqual(dictionary["foreground"] as? Bool, true)
    XCTAssertEqual(dictionary["routeAccess"] as? String, "all")
    // iOS has no 30-day history wall. `null` is the honest answer, not `false`.
    XCTAssertTrue(dictionary["history"] is NSNull)
    // Without `statuses`, `write.*` could never be `'denied'` — only `'granted'` or a permanent
    // `'undetermined'` — and a settings screen could never honestly offer `openSettings()`.
    XCTAssertEqual((dictionary["statuses"] as? [String: String])?["HKWorkoutTypeIdentifier"], "granted")
  }

  func testAvailabilityOmitsTheReasonWhenThereIsNone() {
    XCTAssertEqual(Set(AvailabilityDTO.available.toDictionary().keys), ["status"])
    XCTAssertEqual(Set(AvailabilityDTO.notSupported.toDictionary().keys), ["status", "reason"])
    XCTAssertEqual(AvailabilityDTO.notSupported.toDictionary()["reason"] as? String, "notSupported")
  }

  func testAnAbsentOptionalIsAnAbsentKeyAndNeverNSNull() {
    // `./core` folds "key missing" and `null` to `undefined` in one place, and the key-absent form is
    // the cheaper of the two across the bridge — but a stray `NSNull` in a NUMERIC field would reach
    // `Number(null) === 0`, which is exactly the "0 instead of unknown" bug the whole read path is
    // built to avoid.
    let point = RoutePointDTO(t: 1, lat: 2, lon: 3).toDictionary()
    XCTAssertEqual(Set(point.keys), ["t", "lat", "lon"])
    for value in point.values {
      XCTAssertFalse(value is NSNull)
    }

    let summary = HeartRateSummaryDTO().toDictionary()
    XCTAssertTrue(summary.isEmpty)
  }

  func testTheDrainBatchUsesTheContractKeyNames() {
    let batch = AnchoredBatchDTO(
      added: [],
      removed: [RemovedDTO(id: "A", replaced: true)],
      anchor: "anchor-1",
      hasMore: true
    ).toDictionary()
    // `checkpoint`, NOT `anchor`: the TypeScript `DrainBatchDto` names it that, and the bridge is
    // untyped in both directions.
    XCTAssertEqual(Set(batch.keys), ["added", "removed", "checkpoint", "hasMore", "expired"])
    XCTAssertEqual(batch["checkpoint"] as? String, "anchor-1")
    // iOS anchors do not expire. Only Health Connect's change token does (index f38).
    XCTAssertEqual(batch["expired"] as? Bool, false)
    let removed = (batch["removed"] as? [[String: Any]])?.first
    XCTAssertEqual(removed?["id"] as? String, "A")
    XCTAssertEqual(removed?["replaced"] as? Bool, true)
  }

  func testPendingUnlockCarriesNoNativeIdAndDefersTheRoute() {
    let outcome = SaveOutcomeDTO(status: .pendingUnlock, nativeId: nil, route: .deferred, routePointsWritten: 0)
      .toDictionary()
    XCTAssertEqual(Set(outcome.keys), ["status", "route", "routePointsWritten"])
    XCTAssertEqual(outcome["status"] as? String, "pendingUnlock")
    XCTAssertEqual(outcome["route"] as? String, "deferred")
  }

  func testTheRouteHandleShapeIsHandlePlusState() {
    let handle = RouteHandle(id: "h1", state: .available).toDictionary()
    XCTAssertEqual(Set(handle.keys), ["handle", "state"])
    XCTAssertEqual(handle["state"] as? String, "available")
  }

  func testTheWorkoutDtoCarriesThePlatformBlockAndNoKindField() {
    let workout = WorkoutDTO(
      id: "A",
      isOwn: true,
      activityTypeRaw: 37,
      startMs: 1,
      endMs: 2,
      activeDurationS: 1,
      source: SourceDTO(id: "kit.gj.example"),
      routeState: .available,
      ios: IosWorkoutDataDTO(
        activityTypeRaw: 37,
        bundleIdentifier: "kit.gj.example",
        wallClockS: 0.001,
        activityCount: 0,
        hasIndoorMetadataKey: false,
        routeSampleCount: 1
      )
    ).toDictionary()

    // There is deliberately NO `kind`: the activity mapping lives in `src/core/activity.ts` so the
    // table can be fuzzed in Node against `activity-vectors.json`.
    XCTAssertNil(workout["kind"])
    XCTAssertEqual(workout["platform"] as? String, "ios")
    XCTAssertNotNil(workout["ios"])
    XCTAssertNil(workout["android"])
    // Unknown is an ABSENT key, never `false` (f76).
    XCTAssertNil(workout["indoor"])
    XCTAssertNil(workout["distanceM"])
    XCTAssertNil(workout["distanceProvenance"])
    let ios = workout["ios"] as? [String: Any]
    XCTAssertEqual(ios?["hasIndoorMetadataKey"] as? Bool, false)
    XCTAssertEqual(ios?["routeSampleCount"] as? Int, 1)
  }

  func testMetricRowAndHeartRateShapes() {
    let row = MetricRowDTO(type: .steps, startMs: 1, endMs: 2, value: 3, origin: "kit.gj.example").toDictionary()
    XCTAssertEqual(Set(row.keys), ["type", "startMs", "endMs", "value", "origin"])
    XCTAssertEqual(row["type"] as? String, "steps")
    XCTAssertEqual(Set(HeartRateDTO(t: 1, bpm: 2).toDictionary().keys), ["t", "bpm"])
  }

  func testTheEnumSpellingsMatchTheTypeScriptUnions() {
    XCTAssertEqual([RouteStateDTO.available, .consentRequired, .none].map { $0.rawValue },
                   ["available", "consentRequired", "none"])
    XCTAssertEqual([RouteWriteOutcomeDTO.stored, .none, .dropped, .notPermitted, .deferred].map { $0.rawValue },
                   ["stored", "none", "dropped", "notPermitted", "deferred"])
    XCTAssertEqual([MetricProvenanceDTO.associated, .total, .derived].map { $0.rawValue },
                   ["associated", "total", "derived"])
    XCTAssertEqual(MetricTypeDTO.allCases.map { $0.rawValue },
                   ["distance", "activeEnergy", "elevation", "steps"])
    XCTAssertEqual(QuantityKind.allCases.map { $0.rawValue }, ["distance", "activeEnergy"])
  }
}
