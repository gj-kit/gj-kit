package kit.gj.workouts

import kit.gj.workouts.SharedVectors.objects
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * `tests/fixtures/sync-scenarios.json`이 **Android에 대해 주장하는 것**과 Kotlin이 실제로 내는 것이
 * 같은지 본다(설계 §9.4).
 *
 * 그 파일의 시나리오 자체는 커서 코덱과 리듀서를 도는 TS 드라이버가 실행한다 — 그것을 Kotlin에
 * 다시 구현하면 파일이 막으려는 표류를 정확히 만들어낸다. 그래서 여기서는 **Android 고유 주장**만
 * 교차 검증한다: §4.6의 "Android의 removal은 언제나 진짜 삭제다"와 6종 reset 사유의 어휘.
 */
class SyncContractTest {

  private val scenarios = SharedVectors.json("sync-scenarios.json")

  @Test
  fun `no Android expectation in the shared table ever asks for a replaced removal`() {
    // §4.6: 업서트가 같은 UUID를 재사용하므로 삭제가 발생하지 않는다(f92, f93, f97). 그래서 게이트웨이는
    // `replaced = false`를 **하드코딩**하고, 그것은 "모름"이 아니라 정확히 옳다. 이 단언이 그 두 사실을
    // 묶는다 — fixture가 android에 대해 replaced를 기대하기 시작하면 이 테스트가 먼저 깨진다.
    var androidExpectations = 0
    for (scenario in scenarios.getJSONArray("scenarios").objects()) {
      val platforms = scenario.getJSONArray("platforms")
      val hasAndroid = (0 until platforms.length()).any { platforms.getString(it) == "android" }
      if (!hasAndroid) continue
      for (step in scenario.getJSONArray("steps").objects()) {
        val expect = step.optJSONObject("expectByPlatform")?.optJSONObject("android")
          ?: step.optJSONObject("expect")
          ?: continue
        if (!expect.has("removedReplaced")) continue
        androidExpectations += 1
        assertFalse(
          "${scenario.getString("name")} expects a replaced removal on Android",
          expect.getBoolean("removedReplaced"),
        )
      }
    }
    assertTrue("the table must actually carry an Android removal expectation", androidExpectations > 0)
  }

  @Test
  fun `the replace scenario expects zero removals on Android`() {
    val scenario = scenarios.getJSONArray("scenarios").objects()
      .first { it.getString("name").contains("교체") }
    val step = scenario.getJSONArray("steps").objects()
      .first { it.has("expectByPlatform") }
    val android = step.getJSONObject("expectByPlatform").getJSONObject("android")
    assertEquals(0, android.getInt("removed"))
    assertEquals(1, android.getInt("added"))
  }

  @Test
  fun `an expired token is not an error — it is reset with a named reason`() {
    val reasons = scenarios.getJSONArray("resetReasons")
    val names = (0 until reasons.length()).map { reasons.getString(it) }
    assertTrue(names.contains("expired"))
    assertEquals(6, names.size)

    // 게이트웨이가 만드는 만료 배치의 모양: 비어 있고 `expired = true`이며 던지지 않는다.
    val expired = ChangeBatchDto(
      added = emptyList(),
      removed = emptyList(),
      checkpoint = "token-1",
      hasMore = false,
      expired = true,
    )
    val map = expired.toMap()
    assertEquals(true, map["expired"])
    assertEquals(emptyList<Any>(), map["added"])
    assertEquals(emptyList<Any>(), map["removed"])
  }

  @Test
  fun `a deletion change carries only a record id — replaced is always false`() {
    // f97: `DeletionChange`의 declaredFields는 `[recordId]` 하나뿐이다. 남의 앱 삭제는 타입으로
    // 되짚을 수 없고, 그래서 `RemovedDto`가 실을 수 있는 것도 id 하나다.
    val removed = RemovedDto(id = "0ee91e13-fe90-3ebb-9b17-fb5725d6ca40", replaced = false)
    assertEquals(
      mapOf("id" to "0ee91e13-fe90-3ebb-9b17-fb5725d6ca40", "replaced" to false),
      removed.toMap(),
    )
  }

  @Test
  fun `the bridge payload of a workout never carries the materialised route`() {
    // f116: 139 423포인트를 브리지로 넘기는 것은 캐시가 막으려는 바로 그 비용이다.
    val page = WorkoutPageDto(
      items = emptyList(),
      nextPageToken = null,
      materialisedRoutes = listOf("native-1" to listOf(RoutePointDto(1.0, 37.5, 127.0))),
    )
    assertEquals(setOf("items", "nextPageToken"), page.toMap().keys)
  }
}
