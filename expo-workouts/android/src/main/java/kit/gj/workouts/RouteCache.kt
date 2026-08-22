package kit.gj.workouts

/**
 * f116을 손해가 아니라 자산으로 바꾸는 두 조각 — 네이티브 루트 캐시와 열린 스트림 레지스트리.
 *
 * f116: 루트 권한을 쥔 상태에서 `readRecords` 한 페이지는 그 안의 **모든 루트를 즉시 materialise**
 * 한다(139 423포인트 -> 435–792 ms vs 23–55 ms, 12x–19x, 억제 옵션이 **없다**). 이미 값을 치른
 * 그 포인트들을 버리고 `getRoute`에서 다시 읽으면 같은 비용을 두 번 낸다. 그래서 페이지가 실어 온
 * `Data` 루트만 여기에 담고, 직후의 `openRoute`가 추가 읽기 없이 끝나게 한다.
 *
 * 설계 §8.4가 정한 형태: **프로세스 수명 · LRU · `Data`만 · 최근 1페이지 + 총 200 000포인트 상한**.
 *
 * ⚠ 캐시는 **포인트만** 담는다. `routeState`는 절대 캐시하지 않는다 — 앱은 자기가 쓴 루트에 대한
 *   접근도 잃을 수 있고(f114) 상태는 매 읽기마다 재계산되어야 한다. 캐시 적중은 "직전 페이지에서
 *   이 루트를 실제로 받았다"는 사실이지 "지금도 읽을 수 있다"는 주장이 아니다.
 *
 * 스레드 안전: `synchronized`. 열린 스트림과 페이지 캐시를 동시에 만지는 코루틴이 여럿이다.
 */
internal class RouteCache(private val maxPoints: Int = MAX_CACHED_POINTS) {

  private val entries = LinkedHashMap<String, List<RoutePointDto>>(16, 0.75f, true)
  private var points = 0

  /**
   * 한 페이지가 materialise한 루트들로 캐시를 **교체**한다("최근 1페이지"). `Data`가 아닌 것은
   * 애초에 여기 오지 않는다 — 호출부가 `Data`만 넘긴다.
   */
  @Synchronized
  fun replaceWithPage(page: List<Pair<String, List<RoutePointDto>>>) {
    entries.clear()
    points = 0
    for ((id, route) in page) put(id, route)
  }

  @Synchronized
  fun put(id: String, route: List<RoutePointDto>) {
    if (route.isEmpty()) return
    if (route.size > maxPoints) return
    entries.remove(id)?.let { points -= it.size }
    entries[id] = route
    points += route.size
    evict()
  }

  @Synchronized
  fun get(id: String): List<RoutePointDto>? = entries[id]

  @Synchronized
  fun remove(id: String) {
    entries.remove(id)?.let { points -= it.size }
  }

  @Synchronized
  fun size(): Int = entries.size

  @Synchronized
  fun pointCount(): Int = points

  /** LRU: 접근 순서 맵의 앞이 가장 오래된 항목이다. */
  private fun evict() {
    while (points > maxPoints && entries.isNotEmpty()) {
      val oldest = entries.keys.first()
      entries.remove(oldest)?.let { points -= it.size }
    }
  }

  companion object {
    const val MAX_CACHED_POINTS = 200_000
  }
}

/**
 * `openRoute` -> `readRouteChunk`* -> `closeRoute`의 상태. 핸들 하나가 **불변 스냅샷 + 커서**다.
 *
 * 스냅샷을 뜨는 이유: 스트림이 도는 도중에 다음 페이지 읽기가 캐시를 갈아 끼워도 이미 열린 스트림이
 * 조용히 짧아지면 안 된다. `for await ... break`가 `closeRoute`로 매핑되므로(설계 §3.2) 핸들 누수는
 * TS 쪽에서 구조적으로 막히고, 여기서는 **이미 닫힌 핸들에 조용해야 한다**는 멱등성만 지키면 된다.
 */
internal class RouteStreams {

  private class Stream(val points: List<RoutePointDto>) {
    var cursor: Int = 0
  }

  private val streams = HashMap<String, Stream>()
  private var counter = 0L

  @Synchronized
  fun open(nativeId: String, points: List<RoutePointDto>): String {
    counter += 1
    val handle = "$nativeId#route$counter"
    streams[handle] = Stream(points)
    return handle
  }

  /** 남은 것이 없으면 **null** — TS 쪽에서 스트림 종료다. */
  @Synchronized
  fun next(handle: String, maxPoints: Int): List<RoutePointDto>? {
    val stream = streams[handle] ?: return null
    if (maxPoints <= 0) throw WorkoutsInvalidArgumentException("maxPointsMustBePositive")
    if (stream.cursor >= stream.points.size) return null
    val end = minOf(stream.cursor + maxPoints, stream.points.size)
    val chunk = stream.points.subList(stream.cursor, end).toList()
    stream.cursor = end
    return chunk
  }

  /** 멱등 — `./core`가 finally 경로에서 부르므로 여기서 던지면 원래 에러가 가려진다. */
  @Synchronized
  fun close(handle: String) {
    streams.remove(handle)
  }

  @Synchronized
  fun openCount(): Int = streams.size
}
