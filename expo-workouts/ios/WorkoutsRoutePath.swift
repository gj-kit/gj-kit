// @gj-kit/expo-workouts — the iOS route read path (design section 8.7, f77 to f83).
//
// One rule dominates this file: **convert and release every 1000 points, never accumulate the whole
// `[CLLocation]`.** A held `CLLocation` costs 415 B against 16 B for its converted form, so the
// whole-array read peaks 26x higher on a 36 000-point route (f78) while being no faster at all —
// chunked and unchunked reads were within noise of each other (f79). The chunk size is
// `routeChunkPoints` and is deliberately not on any public surface (decision D8).
//
// The second rule is what the handle table exists for: a route read is ~31 us/point of unavoidable
// HealthKit IPC (f79), i.e. 1.1 s for a 10-hour route. That work runs on the Swift-concurrency
// `AsyncFunction` overload and never on the process-wide serial queue, where it would block every
// other Expo module in the app (index f8).
//
// There is deliberately no teardown ceremony: 310 consecutive full reads of a 36 000-point route
// showed no growth in either route-read API (f77).

import CoreLocation
import Foundation
import HealthKit

/// One parked route read. An actor, so two `readRouteChunk` calls on the same handle cannot
/// interleave into the same iterator, while two DIFFERENT handles still stream concurrently.
internal actor RouteStream {
  /// A reference box around the descriptor's iterator.
  ///
  /// The iterator is a STRUCT with a mutating `next()`, and an actor is reentrant: a second
  /// `readRouteChunk` on the same handle can enter while the first is suspended inside `next()`. A
  /// copy-out/copy-back of the struct would then replay points from a stale copy. A box mutates in
  /// place, so the worst a reentrant caller can do is interleave chunk boundaries — which loses and
  /// duplicates nothing.
  private final class IteratorBox {
    var iterator: HKWorkoutRouteQueryDescriptor.Results.Iterator
    init(_ iterator: HKWorkoutRouteQueryDescriptor.Results.Iterator) {
      self.iterator = iterator
    }
  }

  private let store: HKHealthStore
  private var pending: [HKWorkoutRoute]
  private var current: IteratorBox?
  /// The last timestamp handed out, in epoch ms. A workout carries 0..n route samples (index f13)
  /// and they can overlap in time, so the merge is "strictly increasing t, first occurrence wins".
  private var lastEmittedMs: Double?

  init(routes: [HKWorkoutRoute], store: HKHealthStore) {
    self.store = store
    self.pending = routes
  }

  /// Up to `maxPoints` converted points, or `nil` once the stream is exhausted.
  func next(maxPoints: Int) async throws -> [RoutePointDTO]? {
    let cap = maxPoints > 0 ? maxPoints : routeChunkPoints
    var out: [RoutePointDTO] = []
    out.reserveCapacity(cap)
    while out.count < cap {
      guard let location = try await nextLocation() else {
        return out.isEmpty ? nil : out
      }
      let timestampMs = (location.timestamp.timeIntervalSince1970 * 1000).rounded()
      if let last = lastEmittedMs, timestampMs <= last { continue }
      lastEmittedMs = timestampMs
      out.append(WorkoutsRoutePoints.dto(from: location, timestampMs: timestampMs))
    }
    return out
  }

  private func nextLocation() async throws -> CLLocation? {
    while true {
      if let box = current {
        if let location = try await box.iterator.next() {
          return location
        }
        if current === box { current = nil }
        continue
      }
      guard !pending.isEmpty else { return nil }
      let route = pending.removeFirst()
      current = IteratorBox(HKWorkoutRouteQueryDescriptor(route).results(for: store).makeAsyncIterator())
    }
  }
}

/// `CLLocation` -> `RoutePointDTO`.
///
/// Values are passed through EXACTLY as CoreLocation reports them, negative sentinels and all (f83).
/// `./core`'s `sanitizeRoutePointFromNative` is the single place `-1` becomes `undefined`, so the
/// fold happens once, in a language we can fuzz — and `tests/fixtures/route-vectors.json` pins the
/// pair from both ends.
internal enum WorkoutsRoutePoints {
  static func dto(from location: CLLocation, timestampMs: Double? = nil) -> RoutePointDTO {
    return RoutePointDTO(
      t: timestampMs ?? (location.timestamp.timeIntervalSince1970 * 1000).rounded(),
      lat: location.coordinate.latitude,
      lon: location.coordinate.longitude,
      altM: location.altitude,
      hAccM: location.horizontalAccuracy,
      vAccM: location.verticalAccuracy,
      speedMps: location.speed,
      courseDeg: location.course
    )
  }
}

/// The handle table. `openRoute` parks a stream here and hands JavaScript the key; a `break` out of
/// the JavaScript `for await` arrives as `closeRoute`, which is why this must tolerate an unknown
/// key and a double close without complaint.
internal actor RouteStreamRegistry {
  private var streams: [String: RouteStream] = [:]

  func put(_ stream: RouteStream, for handle: String) {
    streams[handle] = stream
  }

  func stream(for handle: String) -> RouteStream? {
    return streams[handle]
  }

  func remove(_ handle: String) {
    streams.removeValue(forKey: handle)
  }
}

extension HKHealthStoreAdapter {
  public func openRoute(workoutUUID: UUID) async throws -> RouteHandle {
    let handle = UUID().uuidString
    var routes: [HKWorkoutRoute] = []
    if let workout = try await fetchWorkout(uuid: workoutUUID) {
      routes = try await routeSamples(for: workout)
    }

    // iOS has no per-route consent step, so the only two states reachable here are `available` and
    // `none` (index f13). `consentRequired` is an Android-only state (f114, f118).
    //
    // The empty stream is registered too, on purpose: "this workout has no route" must arrive as an
    // EMPTY STREAM and never as an error (design section 5.7 row 25), and an unregistered handle
    // would make the very next `readRouteChunk` an `invalidArgument`.
    let stream = RouteStream(routes: routes, store: store)
    await routeStreams.put(stream, for: handle)
    return RouteHandle(id: handle, state: routes.isEmpty ? RouteStateDTO.none : .available)
  }

  public func readRouteChunk(_ handle: RouteHandle, maxPoints: Int) async throws -> [RoutePointDTO]? {
    guard let stream = await routeStreams.stream(for: handle.id) else {
      throw HealthStoringError.unknownRouteHandle
    }
    let chunk = try await stream.next(maxPoints: maxPoints)
    if chunk == nil {
      // Self-closing at the end of the stream: the JavaScript side also calls `closeRoute`, and
      // both paths have to be safe, but an exhausted stream should not wait for it.
      await routeStreams.remove(handle.id)
    }
    return chunk
  }

  public func closeRoute(_ handle: RouteHandle) async {
    await routeStreams.remove(handle.id)
  }
}
