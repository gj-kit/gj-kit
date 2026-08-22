// Shared fixture loading for the XCTest half of design section 9.4.
//
// The four `tests/fixtures/*.json` files are the ONLY place the mapping tables, the route rules and
// the cursor fingerprint are written down. TypeScript reads them in `pnpm test`, Kotlin reads them
// in JUnit, and this target reads them here — so a table can only change in one place, and when it
// does, three test suites fail together instead of one language drifting silently.
//
// The files are located from `#filePath` rather than bundled as SPM resources on purpose: a bundled
// copy is a COPY, and a stale copy of a golden vector table is worse than no table at all.

import Foundation
import XCTest

enum Fixtures {
  /// `<repo>/expo-workouts`.
  static let packageRoot = URL(fileURLWithPath: #filePath)
    .deletingLastPathComponent()
    .deletingLastPathComponent()

  static func object(_ name: String, file: StaticString = #filePath, line: UInt = #line) throws -> [String: Any] {
    let url = packageRoot
      .appendingPathComponent("tests")
      .appendingPathComponent("fixtures")
      .appendingPathComponent(name)
    let data = try Data(contentsOf: url)
    guard let object = try JSONSerialization.jsonObject(with: data) as? [String: Any] else {
      XCTFail("\(name) is not a JSON object", file: file, line: line)
      throw FixtureError.notAnObject(name)
    }
    return object
  }

  static func array(_ object: [String: Any], _ key: String) throws -> [[String: Any]] {
    guard let value = object[key] as? [[String: Any]] else {
      throw FixtureError.missing(key)
    }
    return value
  }

  enum FixtureError: Error {
    case notAnObject(String)
    case missing(String)
  }
}

/// JSON has no `undefined`, so every fixture in this repository uses `null` for "unknown". This is
/// the one place that convention is decoded.
func optionalDouble(_ value: Any?) -> Double? {
  guard let number = value as? NSNumber else { return nil }
  return number.doubleValue
}
