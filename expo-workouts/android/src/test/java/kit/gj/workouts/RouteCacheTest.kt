package kit.gj.workouts

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Test

/**
 * 설계 §8.4의 네이티브 루트 캐시 — 프로세스 수명 · LRU · 최근 1페이지 + 총 200 000포인트 상한.
 * f116이 강제한 구조이며, 여기 있는 규칙은 전부 "이미 지불한 비용을 두 번 내지 않는다"의 형태다.
 */
class RouteCacheTest {

  private fun points(n: Int, base: Double = 0.0): List<RoutePointDto> =
    (0 until n).map { RoutePointDto(t = base + it, lat = 37.5, lon = 127.0) }

  @Test
  fun `a page replaces the cache — only the most recent page is kept`() {
    val cache = RouteCache()
    cache.replaceWithPage(listOf("a" to points(3), "b" to points(4)))
    assertEquals(2, cache.size())
    cache.replaceWithPage(listOf("c" to points(5)))
    assertNull(cache.get("a"))
    assertNotNull(cache.get("c"))
    assertEquals(1, cache.size())
  }

  @Test
  fun `the total point budget evicts the least recently used entry`() {
    val cache = RouteCache(maxPoints = 10)
    cache.put("a", points(5))
    cache.put("b", points(5))
    // "a"를 만져 최근으로 올린다.
    assertNotNull(cache.get("a"))
    cache.put("c", points(5))
    assertNull("b was the least recently used", cache.get("b"))
    assertNotNull(cache.get("a"))
    assertNotNull(cache.get("c"))
    assertEquals(10, cache.pointCount())
  }

  @Test
  fun `a route larger than the whole budget is not cached — it would evict everything`() {
    val cache = RouteCache(maxPoints = 10)
    cache.put("a", points(5))
    cache.put("huge", points(50))
    assertNull(cache.get("huge"))
    assertNotNull(cache.get("a"))
  }

  @Test
  fun `the default budget is the two hundred thousand points §8_4 fixes`() {
    assertEquals(200_000, RouteCache.MAX_CACHED_POINTS)
  }

  @Test
  fun `an open stream keeps its own snapshot — a later page cannot shorten it`() {
    val streams = RouteStreams()
    val handle = streams.open("native-1", points(2500))
    assertEquals(1000, streams.next(handle, 1000)?.size)
    // 이 사이에 캐시가 통째로 갈려도 스트림은 자기 스냅샷을 계속 읽는다.
    assertEquals(1000, streams.next(handle, 1000)?.size)
    assertEquals(500, streams.next(handle, 1000)?.size)
    assertNull(streams.next(handle, 1000))
  }

  @Test
  fun `the observable chunk sequence matches the shared vector`() {
    // `route-vectors.json`의 `chunking`은 `getRoute()`가 내야 하는 청크 수열이다. 1000 상수 자체는
    // TS가 소유하지만(chunk-constant-guard), 수열은 계약이며 네이티브가 그것을 낼 수 있어야 한다.
    val chunking = SharedVectors.json("route-vectors.json").getJSONArray("chunking")
    for (i in 0 until chunking.length()) {
      val vector = chunking.getJSONObject(i)
      val total = vector.getInt("points")
      val expected = vector.getJSONArray("chunkSizes")
      val streams = RouteStreams()
      val handle = streams.open("native-$i", points(total))
      val actual = ArrayList<Int>()
      while (true) {
        val chunk = streams.next(handle, 1000) ?: break
        actual.add(chunk.size)
      }
      assertEquals("chunk sizes for $total points", (0 until expected.length()).map { expected.getInt(it) }, actual)
    }
  }

  @Test
  fun `closing is idempotent and closing twice never throws`() {
    val streams = RouteStreams()
    val handle = streams.open("native-1", points(10))
    streams.close(handle)
    streams.close(handle)
    assertEquals(0, streams.openCount())
    // 닫힌 핸들에서 읽으면 **null**이다 — 스트림 종료이지 에러가 아니다.
    assertNull(streams.next(handle, 100))
  }

  @Test
  fun `each open produces a distinct handle so two readers cannot share a cursor`() {
    val streams = RouteStreams()
    val first = streams.open("native-1", points(10))
    val second = streams.open("native-1", points(10))
    assertEquals(2, streams.openCount())
    assertEquals(10, streams.next(first, 100)?.size)
    assertEquals(10, streams.next(second, 100)?.size)
    assert(first != second)
  }
}
