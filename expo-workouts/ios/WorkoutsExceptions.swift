// @gj-kit/expo-workouts — the 14 typed exceptions (design section 5.6).
//
// The Expo runtime derives the JavaScript error code from the EXCEPTION CLASS NAME, not from
// anything we write down (index f8). `CodedError.errorCodeFromString` strips a trailing
// `Exception`, inserts an underscore before every capital and uppercases the result, so
// `WorkoutsRouteTooLargeException` becomes `ERR_WORKOUTS_ROUTE_TOO_LARGE` — which is exactly what
// `nativeErrorCodeFor('routeTooLarge')` produces on the TypeScript side.
//
// That correspondence is silent when it drifts, so `error-code-parity` (design section 9.3) reads
// the class names out of this file and out of the Kotlin module and asserts a 1:1 match against
// `WORKOUTS_ERROR_CODES`. Kotlin uses the SAME 14 names.
//
// Nothing below ever interpolates a health value. `reason` is built from a bounded template plus,
// at most, a member name — never coordinates, heart rates, distances, energies, step counts, titles
// or notes. `redaction-guard` enforces that across Swift, Kotlin and TypeScript.

import ExpoModulesCore
import HealthKit

// MARK: - the 14 codes

/// `unavailable` — no usable health store in this runtime. The consumer hides the feature.
public final class WorkoutsUnavailableException: Exception, @unchecked Sendable {
  private let detail: String

  public init(_ detail: String = "This runtime has no usable health store.",
              file: String = #fileID, line: UInt = #line, function: String = #function) {
    self.detail = detail
    super.init(file: file, line: line, function: function)
  }

  override public var reason: String { detail }
}

/// `updateRequired` — Android-only in practice. Declared on iOS so both platforms carry all 14
/// names and the parity guard can compare two identical sets.
public final class WorkoutsUpdateRequiredException: Exception, @unchecked Sendable {
  private let detail: String

  public init(_ detail: String = "The health data provider must be updated.",
              file: String = #fileID, line: UInt = #line, function: String = #function) {
    self.detail = detail
    super.init(file: file, line: line, function: function)
  }

  override public var reason: String { detail }
}

/// `notAuthorized` — the platform positively refused for lack of permission.
/// NEVER thrown by an iOS READ: a denied read returns an empty result, not an error (index f14).
public final class WorkoutsNotAuthorizedException: Exception, @unchecked Sendable {
  private let detail: String

  public init(_ detail: String = "The requested health permission was not granted.",
              file: String = #fileID, line: UInt = #line, function: String = #function) {
    self.detail = detail
    super.init(file: file, line: line, function: function)
  }

  override public var reason: String { detail }
}

/// `consentRequired` — Android-only in practice (iOS has no per-route consent step).
public final class WorkoutsConsentRequiredException: Exception, @unchecked Sendable {
  private let detail: String

  public init(_ detail: String = "The route exists but is not readable without consent.",
              file: String = #fileID, line: UInt = #line, function: String = #function) {
    self.detail = detail
    super.init(file: file, line: line, function: function)
  }

  override public var reason: String { detail }
}

/// `historyRequired` — Android-only: iOS has no 30-day history wall.
public final class WorkoutsHistoryRequiredException: Exception, @unchecked Sendable {
  private let detail: String

  public init(_ detail: String = "The window reaches past the history wall.",
              file: String = #fileID, line: UInt = #line, function: String = #function) {
    self.detail = detail
    super.init(file: file, line: line, function: function)
  }

  override public var reason: String { detail }
}

/// `rateLimited` — read quota exhausted. Neither platform publishes a retry delay, so any
/// `retryAfterMs` is our own budget's estimate and is attached on the TypeScript side.
public final class WorkoutsRateLimitedException: Exception, @unchecked Sendable {
  private let detail: String

  public init(_ detail: String = "The health store rate limit was exceeded.",
              file: String = #fileID, line: UInt = #line, function: String = #function) {
    self.detail = detail
    super.init(file: file, line: line, function: function)
  }

  override public var reason: String { detail }
}

/// `busy` — the store is busy, or a UI-bound operation is already in flight.
public final class WorkoutsBusyException: Exception, @unchecked Sendable {
  private let detail: String

  public init(_ detail: String = "The health store is busy.",
              file: String = #fileID, line: UInt = #line, function: String = #function) {
    self.detail = detail
    super.init(file: file, line: line, function: function)
  }

  override public var reason: String { detail }
}

/// `invalidArgument` — a caller bug, refused before HealthKit is touched. Refusing early is not a
/// nicety here: `HKQuantitySample.init` raises an Objective-C exception on bad input, which crashes
/// the process rather than rejecting the promise (index f28).
public final class WorkoutsInvalidArgumentException: Exception, @unchecked Sendable {
  private let detail: String

  public init(_ detail: String = "The call was refused before reaching the health store.",
              file: String = #fileID, line: UInt = #line, function: String = #function) {
    self.detail = detail
    super.init(file: file, line: line, function: function)
  }

  override public var reason: String { detail }
}

/// `routeTooLarge` — Android's single-record ceiling. Declared here for name parity only; the iOS
/// write path deliberately applies no size cap (design section 0.4, rejection 8).
public final class WorkoutsRouteTooLargeException: Exception, @unchecked Sendable {
  private let detail: String

  public init(_ detail: String = "The record would exceed the platform size limit.",
              file: String = #fileID, line: UInt = #line, function: String = #function) {
    self.detail = detail
    super.init(file: file, line: line, function: function)
  }

  override public var reason: String { detail }
}

/// `staleVersion` — the stored sync version is newer than the one supplied. Raised by our own
/// pre-lookup rather than by waiting for the platform's opaque SQLite failure (index f26).
public final class WorkoutsStaleVersionException: Exception, @unchecked Sendable {
  private let detail: String

  public init(_ detail: String = "A newer version of this record is already stored.",
              file: String = #fileID, line: UInt = #line, function: String = #function) {
    self.detail = detail
    super.init(file: file, line: line, function: function)
  }

  override public var reason: String { detail }
}

/// `storeLocked` — protected data is unavailable. Caught by the write pre-check so a retry cannot
/// double-write (index f24).
public final class WorkoutsStoreLockedException: Exception, @unchecked Sendable {
  private let detail: String

  public init(_ detail: String = "Protected data is unavailable while the device is locked.",
              file: String = #fileID, line: UInt = #line, function: String = #function) {
    self.detail = detail
    super.init(file: file, line: line, function: function)
  }

  override public var reason: String { detail }
}

/// `cancelled` — a UI-bound operation was ended by lifecycle before it could answer (index f9).
public final class WorkoutsCancelledException: Exception, @unchecked Sendable {
  private let detail: String

  public init(_ detail: String = "The operation was cancelled before it could complete.",
              file: String = #fileID, line: UInt = #line, function: String = #function) {
    self.detail = detail
    super.init(file: file, line: line, function: function)
  }

  override public var reason: String { detail }
}

/// `io` — the platform failed to deliver. On iOS the canonical case is a failed route insert, which
/// poisons its builder and must abort the whole route rather than continue (f64).
public final class WorkoutsIoException: Exception, @unchecked Sendable {
  private let detail: String

  public init(_ detail: String = "The health store failed to deliver.",
              file: String = #fileID, line: UInt = #line, function: String = #function) {
    self.detail = detail
    super.init(file: file, line: line, function: function)
  }

  override public var reason: String { detail }
}

/// `internal` — an outcome this library does not model. Always a bug report.
public final class WorkoutsInternalException: Exception, @unchecked Sendable {
  private let detail: String

  public init(_ detail: String = "An unmodelled platform outcome occurred.",
              file: String = #fileID, line: UInt = #line, function: String = #function) {
    self.detail = detail
    super.init(file: file, line: line, function: function)
  }

  override public var reason: String { detail }
}

// MARK: - seam error -> exception

internal enum WorkoutsExceptionMapper {
  /// The ONE place a `HealthStoringError` — or a raw HealthKit `NSError` — becomes a
  /// JavaScript-visible code. Keeping it here is what lets every other Swift file stay free of
  /// ExpoModulesCore and stay unit-testable.
  ///
  /// ⚠ Nothing below reads `localizedDescription`. HealthKit's own strings are outside our control
  /// and the whole message chain is copied verbatim into `WorkoutsError.nativeMessage` on the
  /// JavaScript side, so only bounded templates and the numeric platform code are ever included.
  static func exception(for error: Error, member memberName: String) -> Exception {
    if let exception = error as? Exception {
      return exception
    }
    if let storeError = error as? HealthStoringError {
      return exception(for: storeError, member: memberName)
    }
    return platformException(for: error as NSError)
  }

  private static func exception(for storeError: HealthStoringError, member memberName: String) -> Exception {
    switch storeError {
    case .healthDataUnavailable:
      return WorkoutsUnavailableException("This device has no health store.")
    case .protectedDataUnavailable:
      return WorkoutsStoreLockedException()
    case .invalidArgument(let field):
      // `field` is one of a bounded set of literal field names declared in this package — never a
      // value read out of the health store.
      return WorkoutsInvalidArgumentException("Invalid value for field: \(field)")
    case .staleVersion:
      return WorkoutsStaleVersionException()
    case .routeInsertFailed:
      return WorkoutsIoException("A route insert failed; the route was abandoned.")
    case .unknownRouteHandle:
      return WorkoutsInvalidArgumentException("Invalid value for field: routeHandle")
    case .foreignRecord:
      return WorkoutsNotAuthorizedException("This record belongs to another app and cannot be changed here.")
    case .routeNotPermitted:
      // Reaching the mapper at all means a caller let this escape instead of folding it into
      // `route: 'notPermitted'`, which is the only correct handling (design section 5.7 row 49).
      return WorkoutsNotAuthorizedException("Saving a workout route needs the route write permission.")
    }
  }

  /// HealthKit's own `NSError`s, per design section 5.7 rows 8, 9, 11, 13, 15, 20, 21 and 43.
  private static func platformException(for error: NSError) -> Exception {
    if error.domain == HKError.errorDomain {
      // `errorDataSizeExceeded` is an iOS 17 symbol against a 16.4 deployment target, so it cannot
      // sit in the switch below. The iOS write path applies no size cap of its own (design section
      // 0.4, rejection 8), which makes this the PLATFORM's own ceiling — and `routeTooLarge` is the
      // code whose documented consumer action (downsample and retry) is the correct one.
      if #available(iOS 17.0, *), error.code == HKError.Code.errorDataSizeExceeded.rawValue {
        return WorkoutsRouteTooLargeException()
      }
      switch error.code {
      case HKError.Code.errorHealthDataUnavailable.rawValue:
        return WorkoutsUnavailableException("This device has no health store.")
      case HKError.Code.errorHealthDataRestricted.rawValue,
           HKError.Code.errorAuthorizationDenied.rawValue,
           HKError.Code.errorAuthorizationNotDetermined.rawValue,
           HKError.Code.errorRequiredAuthorizationDenied.rawValue:
        // Row 8 and row 9. A denied READ never lands here — it is an empty result, not an error
        // (index f14) — so this is always a write or a route attach.
        return WorkoutsNotAuthorizedException()
      case HKError.Code.errorInvalidArgument.rawValue:
        // Row 21. Also the code behind the two unreachable route failures (f63, f84), which the
        // fresh-builder and non-empty-points preconditions already rule out.
        return WorkoutsInvalidArgumentException("The health store refused the request as malformed.")
      case HKError.Code.errorDatabaseInaccessible.rawValue:
        return WorkoutsStoreLockedException()
      case HKError.Code.errorUserCanceled.rawValue:
        return WorkoutsCancelledException()
      default:
        // An unmodelled HealthKit failure is still the store failing to deliver, and `io`'s
        // documented action (retry) is the right one. The numeric code travels for diagnostics; no
        // platform string does.
        return WorkoutsIoException("The health store failed to deliver. Platform code: \(error.code)")
      }
    }
    if error.domain == "com.apple.healthd.SQLite" {
      // Row 13: the opaque failure a LOWER sync version produces (index f26). Our own pre-lookup
      // normally catches it first, so reaching here means the stored version changed underneath us.
      return WorkoutsStaleVersionException()
    }
    return WorkoutsInternalException("An unmodelled platform outcome occurred.")
  }
}
