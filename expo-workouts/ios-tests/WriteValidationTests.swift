// The Swift half of the write pre-validation (design section 8.1 step 1, index f28).
//
// This is not defence in depth for its own sake. `HKQuantitySample.init` raises an OBJECTIVE-C
// exception on bad input, and an Objective-C exception in Swift is a process abort, not a rejected
// promise — so by the time a bad number reaches the initialiser it is already too late to report it.
// Every assertion below is therefore about refusing BEFORE construction.
//
// The coordinate rules come from the same `route-vectors.json` that drives `./core`, because f85
// measured that HealthKit stores `lat = 91` verbatim while Health Connect throws on it: the two
// platforms only answer identically if BOTH layers refuse the same inputs.

import HealthKit
import XCTest

@testable import GjKitWorkoutsSeam

final class WriteValidationTests: XCTestCase {
  private let start: Double = 1_700_000_000_000
  private let end: Double = 1_700_000_600_000
  private var earliest: Date { Date(timeIntervalSince1970: 0) }

  private func write(
    route: [RoutePointDTO] = [],
    heartRate: [HeartRateDTO] = [],
    distanceM: Double? = nil,
    steps: Double? = nil,
    startMs: Double? = nil,
    endMs: Double? = nil
  ) -> WorkoutWriteDTO {
    return WorkoutWriteDTO(
      clientId: "vector-1",
      version: 1,
      activityTypeRaw: 37,
      startMs: startMs ?? start,
      endMs: endMs ?? end,
      distanceM: distanceM,
      steps: steps,
      heartRate: heartRate,
      route: route
    )
  }

  private func expectInvalid(_ field: String, _ subject: WorkoutWriteDTO, _ message: String) {
    XCTAssertThrowsError(try WorkoutsWriteValidation.check(subject, earliestPermitted: earliest), message) { error in
      guard case HealthStoringError.invalidArgument(let named)? = error as? HealthStoringError else {
        return XCTFail("expected invalidArgument, got \(error) — \(message)")
      }
      XCTAssertEqual(named, field, message)
    }
  }

  func testAHygienicPayloadPasses() throws {
    XCTAssertNoThrow(
      try WorkoutsWriteValidation.check(
        write(
          route: [RoutePointDTO(t: start + 1000, lat: 37.5, lon: 127.0)],
          heartRate: [HeartRateDTO(t: start + 1000, bpm: 120)],
          distanceM: 1500,
          steps: 2000
        ),
        earliestPermitted: earliest
      )
    )
  }

  func testTheCoordinateVectorsTheSharedFixtureRejectsAreRejectedHereToo() throws {
    let fixture = try Fixtures.object("route-vectors.json")
    var checked = 0
    for vector in try Fixtures.array(fixture, "hygiene") {
      guard vector["throws"] as? String == "invalidArgument",
            let raw = vector["points"] as? [[String: Any]],
            !raw.isEmpty
      else {
        // The empty-array vector is `./core`'s rule ("say `route: 'none'` instead"), not a number
        // this layer can see: an empty route simply means no route step runs.
        continue
      }
      let points = raw.compactMap(RoutePointDTO.init(dictionary:))
      expectInvalid("route", write(route: points), (vector["name"] as? String) ?? "coordinate vector")
      checked += 1
    }
    // Never let this loop pass vacuously.
    XCTAssertGreaterThanOrEqual(checked, 2)
  }

  func testTheVectorsTheSharedFixtureKeepsAreAcceptedHere() throws {
    // Hygiene DROPS (out-of-window points, bad accuracy, duplicate timestamps) belong to `./core` so
    // both platforms drop the same points. This layer must not second-guess them: by the time a
    // point arrives here it has already survived that pass.
    let fixture = try Fixtures.object("route-vectors.json")
    guard let window = fixture["window"] as? [String: Double] else {
      return XCTFail("route-vectors.json has no window")
    }
    for vector in try Fixtures.array(fixture, "hygiene") where vector["throws"] == nil {
      guard let raw = vector["points"] as? [[String: Any]] else { continue }
      let points = raw.compactMap(RoutePointDTO.init(dictionary:))
      guard !points.isEmpty else { continue }
      XCTAssertNoThrow(
        try WorkoutsWriteValidation.check(
          write(route: points, startMs: window["startMs"], endMs: window["endMs"]),
          earliestPermitted: earliest
        ),
        (vector["name"] as? String) ?? "kept vector"
      )
    }
  }

  func testTheWindowRules() {
    expectInvalid("window", write(startMs: end, endMs: start), "end before start")
    expectInvalid("window", write(startMs: start, endMs: start), "zero-length window")
    expectInvalid(
      "endMs",
      write(startMs: Date().timeIntervalSince1970 * 1000, endMs: (Date().timeIntervalSince1970 + 600) * 1000),
      "a workout that has not finished yet"
    )
  }

  func testASampleMayNotSpanTwentyFourHours() {
    // `earliestPermittedSampleDate` and the 24 h rule both fail with `errorInvalidArgument` at the
    // platform (index f28) — named here instead.
    let day: Double = 24 * 60 * 60 * 1000
    expectInvalid("window", write(distanceM: 100, startMs: start, endMs: start + day), "24 h with a sample")
    XCTAssertNoThrow(
      try WorkoutsWriteValidation.check(write(startMs: start, endMs: start + day), earliestPermitted: earliest),
      "24 h with NO cumulative sample is fine — only the samples are bound by the rule"
    )
  }

  func testTheEarliestPermittedSampleDateIsHonoured() {
    let subject = write()
    XCTAssertThrowsError(
      try WorkoutsWriteValidation.check(subject, earliestPermitted: Date(timeIntervalSince1970: 1_800_000_000))
    ) { error in
      guard case HealthStoringError.invalidArgument(let field)? = error as? HealthStoringError else {
        return XCTFail("expected invalidArgument, got \(error)")
      }
      XCTAssertEqual(field, "startMs")
    }
  }

  func testHeartRateBoundsMatchTheSharedRule() {
    expectInvalid("heartRate", write(heartRate: [HeartRateDTO(t: start, bpm: 0)]), "0 bpm")
    expectInvalid("heartRate", write(heartRate: [HeartRateDTO(t: start, bpm: 301)]), "301 bpm")
    expectInvalid("heartRate", write(heartRate: [HeartRateDTO(t: start, bpm: .nan)]), "NaN bpm")
    XCTAssertNoThrow(
      try WorkoutsWriteValidation.check(
        write(heartRate: [HeartRateDTO(t: start, bpm: 1), HeartRateDTO(t: start, bpm: 300)]),
        earliestPermitted: earliest
      )
    )
  }

  func testNegativeAndNonFiniteQuantitiesAreRefused() {
    expectInvalid("distanceM", write(distanceM: -1), "negative distance")
    expectInvalid("distanceM", write(distanceM: .infinity), "infinite distance")
    expectInvalid("steps", write(steps: -5), "negative steps")
  }

  func testAnEmptyClientIdIsRefusedBeforeHealthKitSeesIt() {
    let subject = WorkoutWriteDTO(clientId: "", version: 1, activityTypeRaw: 37, startMs: start, endMs: end)
    expectInvalid("clientId", subject, "empty sync identifier")
  }

  func testTheRouteSyncIdentifierIsDerivedPerWorkoutAndHasOneProducer() {
    // f68: one sync identifier shared across workouts makes a replacement route inherit the replaced
    // route's workout association and cross-links both. This derivation is the only producer.
    XCTAssertEqual(write().routeSyncIdentifier, "vector-1/route")
    let other = WorkoutWriteDTO(clientId: "vector-2", version: 1, activityTypeRaw: 37, startMs: start, endMs: end)
    XCTAssertNotEqual(write().routeSyncIdentifier, other.routeSyncIdentifier)
  }

  func testTheWrittenMetadataSaysOnlyWhatTheCallerSaid() {
    // f76: writing `HKIndoorWorkout = @NO` for "unknown" would destroy the outdoor/unknown
    // distinction for every future reader, so the key is absent unless the caller set it.
    let unknown = WorkoutsSamples.metadata(write())
    XCTAssertNil(unknown[HKMetadataKeyIndoorWorkout])
    XCTAssertNil(unknown[HKMetadataKeyTimeZone])
    XCTAssertNil(unknown[HKMetadataKeyElevationAscended])
    XCTAssertNotNil(unknown[HKMetadataKeySyncIdentifier])
    // A sync identifier without a sync version is rejected by HealthKit, so they always travel
    // together.
    XCTAssertNotNil(unknown[HKMetadataKeySyncVersion])

    let indoor = WorkoutWriteDTO(
      clientId: "vector-1",
      version: 2,
      activityTypeRaw: WorkoutsSwimming.activityTypeRaw,
      indoor: true,
      startMs: start,
      endMs: end,
      timeZoneId: "Asia/Seoul",
      elevationGainM: 12
    )
    let stated = WorkoutsSamples.metadata(indoor)
    XCTAssertEqual((stated[HKMetadataKeyIndoorWorkout] as? NSNumber)?.boolValue, true)
    XCTAssertEqual(stated[HKMetadataKeyTimeZone] as? String, "Asia/Seoul")
    XCTAssertNotNil(stated[HKMetadataKeyElevationAscended])
    // Pool, because the caller said indoor — a fact we already hold and would otherwise lose on the
    // way into Apple Health (design section 8.3).
    XCTAssertEqual((stated[HKMetadataKeySwimmingLocationType] as? NSNumber)?.intValue, 1)

    // A swim with NO indoor answer gets no swimming location type at all rather than a fabricated
    // "open water" — the same rule f76 forces for the indoor key itself.
    let unknownSwim = WorkoutWriteDTO(
      clientId: "vector-1",
      version: 2,
      activityTypeRaw: WorkoutsSwimming.activityTypeRaw,
      startMs: start,
      endMs: end
    )
    XCTAssertNil(WorkoutsSamples.metadata(unknownSwim)[HKMetadataKeySwimmingLocationType])
  }
}
