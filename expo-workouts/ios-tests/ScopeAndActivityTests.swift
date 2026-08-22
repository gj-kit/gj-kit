// The two mapping tables, asserted against the same golden vectors TypeScript and Kotlin read.
//
// These are the assertions only a Swift test can make: that every identifier and every activity
// integer in the shared tables is a REAL symbol in the installed iPhoneOS SDK. A TypeScript test can
// prove the table is self-consistent; only this one can prove the table is not fiction.

import HealthKit
import XCTest

@testable import GjKitWorkoutsSeam

final class ScopeMappingTests: XCTestCase {
  private func iosTable() throws -> [String: [String]] {
    let fixture = try Fixtures.object("scope-mapping.json")
    guard let table = fixture["ios"] as? [String: [String]] else {
      throw Fixtures.FixtureError.missing("ios")
    }
    return table
  }

  func testScopeVocabularyMatchesTheFixture() throws {
    let table = try iosTable()
    XCTAssertEqual(Set(table.keys), Set(WorkoutsScope.allCases.map { $0.rawValue }))
    XCTAssertEqual(WorkoutsScope.allCases.count, 7)
  }

  func testEveryScopeMapsToTheSameIdentifiersAsTheFixture() throws {
    for (scope, expected) in try iosTable() {
      guard let parsed = WorkoutsScope(rawValue: scope) else {
        return XCTFail("unknown scope in fixture: \(scope)")
      }
      let actual = WorkoutsScopeTypes.identifiers[parsed] ?? []
      XCTAssertEqual(actual.sorted(), expected.sorted(), "scope \(scope)")
    }
  }

  func testDistanceAsksForBothTypesAtOnce() throws {
    // Authorization happens once, BEFORE any workout has been read, so the activity is unknowable at
    // that moment. A scope that asked for only one distance type would leave `distanceM` permanently
    // undefined for exactly one class of workout (design section 8.8).
    XCTAssertEqual(WorkoutsScopeTypes.identifiers[.distance]?.count, 2)
  }

  func testElevationIsDeliberatelyEmpty() throws {
    // `HKMetadataKeyElevationAscended` is metadata on the workout object and has no `HKObjectType`,
    // so on iOS this scope aliases `workouts`. The empty list is the fact, not an omission.
    XCTAssertEqual(WorkoutsScopeTypes.identifiers[.elevation], [])
  }

  func testEveryIdentifierIsARealTypeInThisSDK() throws {
    for (scope, identifiers) in try iosTable() {
      for identifier in identifiers {
        XCTAssertNotNil(
          healthObjectType(forIdentifier: identifier),
          "\(scope): \(identifier) does not resolve to an HKObjectType in this SDK"
        )
        XCTAssertNotNil(
          healthSampleType(forIdentifier: identifier),
          "\(scope): \(identifier) does not resolve to an HKSampleType, so it can never be shared"
        )
      }
    }
  }

  func testAnUnknownIdentifierResolvesToNilInsteadOfTrapping() {
    // A future type added to the table degrades on an older OS instead of crashing.
    XCTAssertNil(healthObjectType(forIdentifier: "HKQuantityTypeIdentifierNotARealThing"))
  }
}

final class ActivityVectorTests: XCTestCase {
  private struct Kind {
    let kind: String
    let ios: Int
  }

  private func kinds() throws -> [Kind] {
    let fixture = try Fixtures.object("activity-vectors.json")
    return try Fixtures.array(fixture, "kinds").compactMap { row in
      guard let kind = row["kind"] as? String, let ios = row["ios"] as? Int else { return nil }
      return Kind(kind: kind, ios: ios)
    }
  }

  func testTheFixtureCarriesTheNineKindsDecisionD11Settled() throws {
    XCTAssertEqual(try kinds().count, 9)
  }

  func testEveryActivityIntegerIsARealHKWorkoutActivityType() throws {
    for row in try kinds() {
      XCTAssertNotNil(
        HKWorkoutActivityType(rawValue: UInt(row.ios)),
        "\(row.kind): \(row.ios) is not an HKWorkoutActivityType in this SDK"
      )
    }
    // The two READ-ALIASES the write direction never emits (design section 8.3).
    let fixture = try Fixtures.object("activity-vectors.json")
    for alias in try Fixtures.array(fixture, "iosReadAliases") {
      guard let raw = alias["raw"] as? Int else { continue }
      XCTAssertNotNil(HKWorkoutActivityType(rawValue: UInt(raw)), "read alias \(raw)")
    }
  }

  func testTheWriteDistanceTypeComesFromTheActivity() throws {
    var byKind: [String: Int] = [:]
    for row in try kinds() { byKind[row.kind] = row.ios }

    XCTAssertEqual(
      WorkoutsQuantityTypes.writeDistanceIdentifier(forActivityTypeRaw: byKind["cycling"] ?? -1),
      HKQuantityTypeIdentifier.distanceCycling.rawValue
    )
    XCTAssertEqual(
      WorkoutsQuantityTypes.writeDistanceIdentifier(forActivityTypeRaw: byKind["swimming"] ?? -1),
      HKQuantityTypeIdentifier.distanceSwimming.rawValue
    )
    XCTAssertEqual(
      WorkoutsQuantityTypes.writeDistanceIdentifier(forActivityTypeRaw: byKind["wheelchair"] ?? -1),
      HKQuantityTypeIdentifier.distanceWheelchair.rawValue
    )
    XCTAssertEqual(
      WorkoutsQuantityTypes.writeDistanceIdentifier(forActivityTypeRaw: byKind["running"] ?? -1),
      HKQuantityTypeIdentifier.distanceWalkingRunning.rawValue
    )
    // Strength training gets NO distance sample rather than a walking/running one — writing it there
    // would pollute the user's own walking totals (design section 8.3 C2).
    XCTAssertNil(WorkoutsQuantityTypes.writeDistanceIdentifier(forActivityTypeRaw: byKind["strength"] ?? -1))

    let rowing = WorkoutsQuantityTypes.writeDistanceIdentifier(forActivityTypeRaw: byKind["rowing"] ?? -1)
    if #available(iOS 18.0, *) {
      XCTAssertEqual(rowing, HKQuantityTypeIdentifier.distanceRowing.rawValue)
    } else {
      // Below iOS 18 there is no rowing distance type, and falling back to walking/running would be
      // worse than writing nothing (design section 8.3 C1).
      XCTAssertNil(rowing)
    }
  }

  func testEveryWriteDistanceIdentifierResolvesInThisSDK() throws {
    for row in try kinds() {
      guard let identifier = WorkoutsQuantityTypes.writeDistanceIdentifier(forActivityTypeRaw: row.ios) else {
        continue
      }
      XCTAssertNotNil(
        HKQuantityType.quantityType(forIdentifier: HKQuantityTypeIdentifier(rawValue: identifier)),
        "\(row.kind): \(identifier)"
      )
    }
  }

  func testOnlyWheelchairSkipsStepSamples() throws {
    for row in try kinds() {
      let writes = WorkoutsQuantityTypes.writesStepSamples(forActivityTypeRaw: row.ios)
      // HealthKit counts wheelchair propulsion as push count, not step count, so writing it into
      // step count would make the user's own step totals wrong (design section 8.3 C3).
      XCTAssertEqual(writes, row.kind != "wheelchair", "\(row.kind)")
    }
  }

  func testTheReadPathOnlyEverQueriesTwoDistanceTypes() throws {
    for row in try kinds() {
      let identifier = WorkoutsQuantityTypes.readDistanceIdentifier(forActivityTypeRaw: row.ios)
      let expected = row.kind == "cycling"
        ? HKQuantityTypeIdentifier.distanceCycling.rawValue
        : HKQuantityTypeIdentifier.distanceWalkingRunning.rawValue
      XCTAssertEqual(identifier, expected, "\(row.kind)")
    }
  }

  func testTheSwimmingConstantTheMetadataBranchUsesMatchesTheFixture() throws {
    // `WorkoutsSwimming.activityTypeRaw` decides whether `HKMetadataKeySwimmingLocationType` is
    // written. If it drifted from the table, pool/open-water would silently stop being recorded.
    let swimming = try kinds().first { $0.kind == "swimming" }
    XCTAssertEqual(WorkoutsSwimming.activityTypeRaw, swimming?.ios)
  }

  func testTheManagedTypeListCoversEveryTypeTheWritePathCanProduce() throws {
    let managed = Set(WorkoutsManagedTypes.quantityTypes().map { $0.identifier })
    for row in try kinds() {
      guard let identifier = WorkoutsQuantityTypes.writeDistanceIdentifier(forActivityTypeRaw: row.ios) else {
        continue
      }
      // A distance type the write path can create but the cleanup list does not know about would be
      // an orphan nothing ever deletes after a replacement.
      XCTAssertTrue(managed.contains(identifier), "\(row.kind): \(identifier) is not in the managed list")
    }
    XCTAssertTrue(managed.contains(HKQuantityTypeIdentifier.activeEnergyBurned.rawValue))
    XCTAssertTrue(managed.contains(HKQuantityTypeIdentifier.heartRate.rawValue))
    XCTAssertTrue(managed.contains(HKQuantityTypeIdentifier.stepCount.rawValue))
  }
}
