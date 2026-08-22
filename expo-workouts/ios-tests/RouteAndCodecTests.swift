// Route points, chunking and the two codecs, against the shared golden vectors.
//
// The interesting half is the WRITE direction of the sentinel table. `route-vectors.json` pins what
// a `-1` coming OUT of HealthKit means; `ios-native-vectors.json` pins what an absent optional
// GOING IN turns into — and those two rules have to be each other's inverse or a user's own route
// comes back with different numbers than they wrote (f81, f83).

import CoreLocation
import HealthKit
import XCTest

@testable import GjKitWorkoutsSeam

final class RouteChunkingTests: XCTestCase {
  func testTheChunkSequenceMatchesTheSharedFixture() throws {
    let fixture = try Fixtures.object("route-vectors.json")
    let vectors = try Fixtures.array(fixture, "chunking")
    XCTAssertGreaterThanOrEqual(vectors.count, 5)
    for vector in vectors {
      guard let points = vector["points"] as? Int, let expected = vector["chunkSizes"] as? [Int] else {
        return XCTFail("malformed chunking vector")
      }
      XCTAssertEqual(WorkoutsChunking.sizes(pointCount: points), expected, "\(points) points")
      XCTAssertEqual(WorkoutsChunking.sizes(pointCount: points).reduce(0, +), points)
    }
  }

  func testTheChunkSizeIsNotOnAnyPublicSurface() {
    // Decision D8: exporting the 1000 would make a 1000 -> 2000 adjustment a breaking change. The
    // observable SEQUENCE is the contract, and the fixture above is where it lives.
    XCTAssertEqual(routeChunkPoints, 1000)
    XCTAssertEqual(WorkoutsChunking.sizes(pointCount: 3600), [1000, 1000, 1000, 600])
  }
}

final class RouteSentinelTests: XCTestCase {
  private struct Vector {
    let name: String
    let point: RoutePointDTO
    let location: [String: Double]
  }

  private func vectors() throws -> [Vector] {
    let fixture = try Fixtures.object("ios-native-vectors.json")
    return try Fixtures.array(fixture, "writeLocations").compactMap { entry in
      guard let name = entry["name"] as? String,
            let raw = entry["point"] as? [String: Any],
            let location = entry["location"] as? [String: Double],
            let point = RoutePointDTO(dictionary: raw)
      else {
        return nil
      }
      return Vector(name: name, point: point, location: location)
    }
  }

  func testAbsentOptionalsBecomeCoreLocationsOwnSentinels() throws {
    let vectors = try vectors()
    XCTAssertGreaterThanOrEqual(vectors.count, 5)
    for vector in vectors {
      let location = WorkoutsSamples.location(from: vector.point)
      XCTAssertEqual(location.altitude, vector.location["altitude"] ?? .nan, accuracy: 1e-9, vector.name)
      XCTAssertEqual(
        location.horizontalAccuracy,
        vector.location["horizontalAccuracy"] ?? .nan,
        accuracy: 1e-9,
        vector.name
      )
      XCTAssertEqual(
        location.verticalAccuracy,
        vector.location["verticalAccuracy"] ?? .nan,
        accuracy: 1e-9,
        vector.name
      )
      XCTAssertEqual(location.course, vector.location["course"] ?? .nan, accuracy: 1e-9, vector.name)
      XCTAssertEqual(location.speed, vector.location["speed"] ?? .nan, accuracy: 1e-9, vector.name)
      XCTAssertEqual(location.coordinate.latitude, vector.point.lat, accuracy: 1e-12, vector.name)
      XCTAssertEqual(location.coordinate.longitude, vector.point.lon, accuracy: 1e-12, vector.name)
      XCTAssertEqual(
        (location.timestamp.timeIntervalSince1970 * 1000).rounded(),
        vector.point.t,
        accuracy: 0.5,
        vector.name
      )
    }
  }

  func testTheReadConversionHandsBackExactlyWhatWasWritten() throws {
    // HealthKit stores route points verbatim (f81), so the write conversion followed by the read
    // conversion is the whole round trip minus the platform. `./core` is the ONLY place a `-1`
    // becomes `undefined`, so nothing may be folded here.
    for vector in try vectors() {
      let location = WorkoutsSamples.location(from: vector.point)
      let round = WorkoutsRoutePoints.dto(from: location)
      XCTAssertEqual(round.lat, vector.point.lat, accuracy: 1e-12, vector.name)
      XCTAssertEqual(round.lon, vector.point.lon, accuracy: 1e-12, vector.name)
      XCTAssertEqual(round.altM ?? .nan, vector.location["altitude"] ?? .nan, accuracy: 1e-9, vector.name)
      XCTAssertEqual(
        round.hAccM ?? .nan,
        vector.location["horizontalAccuracy"] ?? .nan,
        accuracy: 1e-9,
        vector.name
      )
      XCTAssertEqual(round.speedMps ?? .nan, vector.location["speed"] ?? .nan, accuracy: 1e-9, vector.name)
      XCTAssertEqual(round.courseDeg ?? .nan, vector.location["course"] ?? .nan, accuracy: 1e-9, vector.name)
    }
  }

  func testTheReadConversionNeverFoldsANegativeSentinelItself() throws {
    // The same table `route-vectors.json` uses for the read direction — but asserted from the other
    // end: native must PASS THROUGH the `-1`s that `sanitizeRoutePointFromNative` will fold.
    let fixture = try Fixtures.object("route-vectors.json")
    for entry in try Fixtures.array(fixture, "sentinels") {
      guard let raw = entry["input"] as? [String: Any], let point = RoutePointDTO(dictionary: raw) else {
        continue
      }
      let round = WorkoutsRoutePoints.dto(from: WorkoutsSamples.location(from: point))
      if let hAcc = optionalDouble(raw["hAccM"]), hAcc < 0 {
        XCTAssertLessThan(round.hAccM ?? 0, 0, "a negative accuracy must survive to JavaScript unfolded")
      }
      if let speed = optionalDouble(raw["speedMps"]), speed == 0 {
        XCTAssertEqual(round.speedMps, 0, "an explicit zero is a value, not a sentinel (f83)")
      }
      if let course = optionalDouble(raw["courseDeg"]), course == 0 {
        XCTAssertEqual(round.courseDeg, 0)
      }
    }
  }
}

final class CursorCodecTests: XCTestCase {
  func testTheScopeFingerprintMatchesTheTypeScriptImplementation() throws {
    let fixture = try Fixtures.object("ios-native-vectors.json")
    let vectors = try Fixtures.array(fixture, "scopeFingerprints")
    XCTAssertGreaterThanOrEqual(vectors.count, 7)
    for vector in vectors {
      guard let permissions = vector["permissions"] as? [String],
            let expected = vector["fingerprint"] as? String,
            let name = vector["name"] as? String
      else {
        return XCTFail("malformed fingerprint vector")
      }
      // One byte of drift here and every cursor a device makes resets on the next call, forever.
      XCTAssertEqual(WorkoutsScopeFingerprint.compute(permissions), expected, name)
    }
  }

  func testThePageCursorRoundTrips() throws {
    let token = WorkoutsPageCursor.encode(startMs: 1_755_000_000_000, uuid: "A1B2C3D4-0000-4000-8000-000000000000")
    let decoded = try WorkoutsPageCursor.decode(token)
    XCTAssertEqual(decoded?.startMs, 1_755_000_000_000)
    XCTAssertEqual(decoded?.uuid, "A1B2C3D4-0000-4000-8000-000000000000")
  }

  func testAnAbsentPageCursorIsTheFirstPage() throws {
    XCTAssertNil(try WorkoutsPageCursor.decode(nil))
    XCTAssertNil(try WorkoutsPageCursor.decode(""))
  }

  func testAMalformedPageCursorIsInvalidArgumentAndNotACrash() {
    for token in ["not base64 at all !!", Data("no-separator".utf8).base64EncodedString(), Data("|".utf8).base64EncodedString()] {
      XCTAssertThrowsError(try WorkoutsPageCursor.decode(token)) { error in
        guard case HealthStoringError.invalidArgument(let field)? = error as? HealthStoringError else {
          return XCTFail("expected invalidArgument, got \(error)")
        }
        XCTAssertEqual(field, "pageToken")
      }
    }
  }

  func testTheAnchorCodecRoundTripsThroughNSKeyedArchiver() throws {
    let anchor = HKQueryAnchor(fromValue: 42)
    let encoded = try WorkoutsAnchorCodec.encode(anchor)
    let decoded = try WorkoutsAnchorCodec.decode(encoded)
    XCTAssertEqual(decoded, anchor)
  }

  func testAnAbsentAnchorMeansReadEverything() throws {
    XCTAssertNil(try WorkoutsAnchorCodec.decode(nil))
    XCTAssertNil(try WorkoutsAnchorCodec.decode(""))
  }

  func testACorruptAnchorIsInvalidArgumentAndNotACrash() {
    XCTAssertThrowsError(try WorkoutsAnchorCodec.decode("Ym9ndXM=")) { error in
      guard case HealthStoringError.invalidArgument(let field)? = error as? HealthStoringError else {
        return XCTFail("expected invalidArgument, got \(error)")
      }
      XCTAssertEqual(field, "checkpoint")
    }
  }
}

final class TimeAndEventTests: XCTestCase {
  func testEveryWindowIsAStrictStartDatePredicate() {
    // f87: the default overlap predicate counts a midnight-crossing workout in two day windows, and
    // `.strictStartDate + .strictEndDate` puts it in none. The static source guard forbids the second
    // spelling; this asserts the first is actually what gets built.
    let predicate = WorkoutsPredicates.startInstantWindow(fromMs: 1_755_000_000_000, toMs: 1_755_003_600_000)
    XCTAssertTrue(predicate.predicateFormat.contains("startDate"))
    XCTAssertFalse(predicate.predicateFormat.contains("endDate"))
  }

  func testEpochMillisecondsRoundTrip() {
    let ms: Double = 1_755_000_123_456
    XCTAssertEqual(WorkoutsTime.epochMs(WorkoutsTime.date(epochMs: ms)), ms, accuracy: 0.5)
  }

  func testTheUtcOffsetOnlyExistsWhenTheWriterNamedAZone() {
    let instant = WorkoutsTime.date(epochMs: 1_755_000_000_000)
    XCTAssertEqual(WorkoutsTime.utcOffsetMin(timeZoneId: "Asia/Seoul", at: instant), 540)
    XCTAssertNil(WorkoutsTime.utcOffsetMin(timeZoneId: nil, at: instant))
    XCTAssertNil(WorkoutsTime.utcOffsetMin(timeZoneId: "Not/AZone", at: instant))
  }

  func testPausesArePairedAndAnUnterminatedOneClosesAtTheWorkoutEnd() {
    let start = WorkoutsTime.date(epochMs: 1_755_000_000_000)
    let end = start.addingTimeInterval(600)
    let events = [
      HKWorkoutEvent(type: .pause, dateInterval: DateInterval(start: start.addingTimeInterval(60), duration: 0), metadata: nil),
      HKWorkoutEvent(type: .resume, dateInterval: DateInterval(start: start.addingTimeInterval(120), duration: 0), metadata: nil),
      HKWorkoutEvent(type: .motionPaused, dateInterval: DateInterval(start: start.addingTimeInterval(300), duration: 0), metadata: nil),
    ]
    let split = WorkoutsEvents.split(events, endDate: end)
    XCTAssertEqual(split.pauses.count, 2)
    XCTAssertEqual(split.pauses[0].endMs - split.pauses[0].startMs, 60_000)
    XCTAssertNil(split.pauses[0].auto)
    // An auto-pause the platform reported itself is the only case `auto` is ever asserted for.
    XCTAssertEqual(split.pauses[1].auto, true)
    XCTAssertEqual(split.pauses[1].endMs, WorkoutsTime.epochMs(end))
  }
}

final class PagingTests: XCTestCase {
  private func key(_ startMs: Double, _ uuid: String) -> WorkoutsPageKey {
    return WorkoutsPageKey(startMs: startMs, uuid: uuid)
  }

  func testTheOrderIsDescendingAndTotal() {
    let keys = [key(100, "B"), key(200, "A"), key(100, "C"), key(100, "A")]
    let walk = WorkoutsPaging.walk(keys, anchor: nil, pageSize: 10)
    XCTAssertEqual(walk.page.map { $0.uuid }, ["A", "C", "B", "A"])
    XCTAssertEqual(walk.page.map { $0.startMs }, [200, 100, 100, 100])
    // Nothing is left, so no token — a token for an exhausted window makes the caller ask forever.
    XCTAssertNil(walk.next)
  }

  func testAFullPageEmitsATokenAndTheNextPageStartsWhereItStopped() {
    let keys = (0..<7).map { key(Double(100 - $0), "W\($0)") }
    let first = WorkoutsPaging.walk(keys, anchor: nil, pageSize: 3)
    XCTAssertEqual(first.page.count, 3)
    XCTAssertNotNil(first.next)
    let second = WorkoutsPaging.walk(
      keys,
      anchor: (startMs: first.next?.startMs ?? 0, uuid: first.next?.uuid ?? ""),
      pageSize: 3
    )
    XCTAssertEqual(second.page.map { $0.uuid }, ["W3", "W4", "W5"])
  }

  func testAPageThatExactlyExhaustsTheWindowEmitsNoToken() {
    let keys = (0..<3).map { key(Double(100 - $0), "W\($0)") }
    XCTAssertNil(WorkoutsPaging.walk(keys, anchor: nil, pageSize: 3).next)
  }

  func testEveryWorkoutIsDeliveredExactlyOnceEvenWhenTheyShareAStartInstant() {
    // The whole reason the uuid is in the key. Heavy collisions on purpose: 200 workouts across
    // only 8 distinct instants means pages routinely cut THROUGH a tie group, which is exactly where
    // a start-instant-only cursor loses a workout or repeats one.
    var generator = SystemRandomNumberGenerator()
    for pageSize in [1, 3, 7, 50] {
      var keys: [WorkoutsPageKey] = []
      for index in 0..<200 {
        let instant = Double(1_755_000_000_000 + (Int.random(in: 0..<8, using: &generator) * 1000))
        keys.append(key(instant, "\(index)-\(UUID().uuidString)"))
      }
      var delivered: [WorkoutsPageKey] = []
      var anchor: (startMs: Double, uuid: String)?
      var guardCount = 0
      while true {
        guardCount += 1
        XCTAssertLessThan(guardCount, 1000, "the walk must terminate")
        let walk = WorkoutsPaging.walk(keys, anchor: anchor, pageSize: pageSize)
        delivered.append(contentsOf: walk.page)
        guard let next = walk.next else { break }
        anchor = (startMs: next.startMs, uuid: next.uuid)
      }
      XCTAssertEqual(delivered.count, keys.count, "pageSize \(pageSize): every workout exactly once")
      XCTAssertEqual(Set(delivered.map { $0.uuid }).count, keys.count, "pageSize \(pageSize): no duplicates")
      XCTAssertEqual(delivered, keys.sorted(by: WorkoutsPaging.isBefore), "pageSize \(pageSize): order")
    }
  }

  func testAnEmptyWindowIsAnEmptyPage() {
    let walk = WorkoutsPaging.walk([], anchor: nil, pageSize: 200)
    XCTAssertTrue(walk.page.isEmpty)
    XCTAssertNil(walk.next)
  }
}
