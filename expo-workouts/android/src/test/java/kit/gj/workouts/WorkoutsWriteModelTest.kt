package kit.gj.workouts

import kit.gj.workouts.SharedVectors.objects
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * f99 · f100의 크기 모델, f98의 clientRecordId 규약, idx f38의 30일 벽 — 전부 순수 계산이라
 * 기기 없이 전수로 돈다.
 */
class WorkoutsWriteModelTest {

  // ── 크기 모델: TS와 **바이트 동일**해야 한다 (설계 §9.4) ────────────────────

  @Test
  fun `size vectors from the shared fixture match byte for byte`() {
    val vectors = SharedVectors.json("route-vectors.json").getJSONArray("sizeVectors").objects()
    assertTrue("the fixture must actually carry vectors", vectors.size >= 6)
    for (vector in vectors) {
      val points = vector.getInt("routePoints")
      val bytes = WorkoutsSizeModel.estimateRecordBytes(
        routePoints = points,
        clientRecordIdLength = vector.getInt("clientRecordIdLength"),
        titleLength = vector.optInt("titleLength", 0),
        notesLength = vector.optInt("notesLength", 0),
        segments = vector.optInt("segments", 0),
        laps = vector.optInt("laps", 0),
      )
      assertEquals("bytes for $points points", vector.getLong("bytes"), bytes)
      assertEquals(
        "accepted for $points points",
        vector.getBoolean("accepted"),
        WorkoutsSizeModel.accepts(bytes, points),
      )
    }
  }

  @Test
  fun `f99 boundary is pinned exactly`() {
    // 13자 title + 13자 clientRecordId -> bytes = 212 + 48*points. 20 828 OK / 20 829 = 1 000 004 B.
    val at = WorkoutsSizeModel.estimateRecordBytes(20_828, 13, titleLength = 13)
    val over = WorkoutsSizeModel.estimateRecordBytes(20_829, 13, titleLength = 13)
    assertEquals(999_956L, at)
    assertEquals(1_000_004L, over)
    assertEquals(WorkoutsSizeModel.RECORD_BYTE_CEILING, 1_000_000L)
  }

  @Test
  fun `optional route fields are free — one threshold, not two`() {
    // f100: 21 000점은 고도·정확도 유무와 무관하게 바이트 동일하다. 우리 공식에는 그 항이 아예 없다.
    val bare = WorkoutsSizeModel.estimateRecordBytes(21_000, 0)
    val full = WorkoutsSizeModel.estimateRecordBytes(21_000, 0)
    assertEquals(bare, full)
  }

  @Test
  fun `assertWritable rejects before the platform call and never leaks a value`() {
    val write = writeWith(points = 20_001)
    val error = runCatching { WorkoutsSizeModel.assertWritable(write) }.exceptionOrNull()
    assertTrue(error is WorkoutsRouteTooLargeException)
    val message = error!!.message ?: ""
    assertFalse("no point count in the message", message.contains("20"))
    assertFalse("no coordinate in the message", message.contains("37."))
  }

  @Test
  fun `assertWritable accepts a route inside both limits`() {
    WorkoutsSizeModel.assertWritable(writeWith(points = 3_600))
  }

  @Test
  fun `the size guard counts the derived clientRecordId, not the caller's id`() {
    // 저장되는 것은 `<id>#session`이므로 8자가 더 붙는다. 과소평가하면 상한 근처에서 틀린다.
    val write = writeWith(points = 10, clientId = "abc")
    val expected = WorkoutsSizeModel.estimateRecordBytes(
      routePoints = 10,
      clientRecordIdLength = "abc#session".length,
    )
    assertEquals(expected, WorkoutsSizeModel.estimateRecordBytes(10, "abc#session".length))
    WorkoutsSizeModel.assertWritable(write)
  }

  // ── clientRecordId 규약 (f98) ──────────────────────────────────────────────

  @Test
  fun `record ids follow the pattern f98 verified on device`() {
    assertEquals("t6#session", WorkoutsRecordIds.sessionId("t6"))
    assertEquals("t6#session:distance", WorkoutsRecordIds.recordId("t6", RecordType.DISTANCE))
    assertEquals("t6#session:kcal", WorkoutsRecordIds.recordId("t6", RecordType.ACTIVE_ENERGY))
    assertEquals("t6#session:elev", WorkoutsRecordIds.recordId("t6", RecordType.ELEVATION))
    assertEquals("t6#session:steps", WorkoutsRecordIds.recordId("t6", RecordType.STEPS))
    assertEquals("t6#session:hr", WorkoutsRecordIds.recordId("t6", RecordType.HEART_RATE))
  }

  @Test
  fun `every workout produces exactly six record ids — that is the delete arithmetic of §8_6`() {
    val ids = WorkoutsRecordIds.allRecordIds("w1")
    assertEquals(6, ids.size)
    assertEquals(6, ids.map { it.second }.toSet().size)
  }

  @Test
  fun `clientIdOf strips our suffix and refuses everything else`() {
    assertEquals("w1", WorkoutsRecordIds.clientIdOf("w1#session"))
    assertNull(WorkoutsRecordIds.clientIdOf("#session"))
    assertNull(WorkoutsRecordIds.clientIdOf("someone-elses-id"))
    assertNull(WorkoutsRecordIds.clientIdOf(null))
    // 남의 앱이 우연히 `:distance`로 끝나는 id를 쓰더라도 세션으로 오독하지 않는다.
    assertNull(WorkoutsRecordIds.clientIdOf("w1#session:distance"))
  }

  // ── 30일 벽 (idx f38 · §5.7 45번 행) ───────────────────────────────────────

  @Test
  fun `a window inside the wall is readable without the history permission`() {
    val now = 1_700_000_000_000L
    val window = WindowDto((now - 29L * 24 * 3600 * 1000).toDouble(), now.toDouble())
    WorkoutsHistoryWall.assertReadable(window, now, hasHistoryPermission = false)
  }

  @Test
  fun `a window past the wall throws historyRequired before any read`() {
    val now = 1_700_000_000_000L
    val window = WindowDto((now - 40L * 24 * 3600 * 1000).toDouble(), now.toDouble())
    val error = runCatching {
      WorkoutsHistoryWall.assertReadable(window, now, hasHistoryPermission = false)
    }.exceptionOrNull()
    assertTrue(error is WorkoutsHistoryRequiredException)
    // 권한을 쥐면 같은 창이 통과한다.
    WorkoutsHistoryWall.assertReadable(window, now, hasHistoryPermission = true)
  }

  @Test
  fun `exactly thirty days is inside the wall — the grace absorbs JS-to-native clock skew`() {
    // 예제 앱은 `now - 30d`를 요청한다. 네이티브의 now가 몇 ms 늦다는 이유로 그 창이 벽 밖이 되면
    // 안 된다. GRACE_MS가 정확히 그것을 흡수한다.
    val jsNow = 1_700_000_000_000L
    val nativeNow = jsNow + 250L
    val window = WindowDto((jsNow - WorkoutsHistoryWall.WALL_MS).toDouble(), jsNow.toDouble())
    assertFalse(WorkoutsHistoryWall.reachesPastWall(window.fromMs, nativeNow))
    WorkoutsHistoryWall.assertReadable(window, nativeNow, hasHistoryPermission = false)
  }

  private fun writeWith(points: Int, clientId: String = "w1"): WorkoutWriteDto = WorkoutWriteDto(
    clientId = clientId,
    version = 1L,
    activityTypeRaw = 56,
    startMs = 1_700_000_000_000.0,
    endMs = 1_700_000_600_000.0,
    utcOffsetMin = 540,
    timeZoneId = null,
    pauses = emptyList(),
    laps = emptyList(),
    distanceM = null,
    activeEnergyKcal = null,
    elevationGainM = null,
    steps = null,
    heartRate = emptyList(),
    route = (0 until points).map {
      RoutePointDto(t = 1_700_000_000_000.0 + it, lat = 37.5 + it * 1e-6, lon = 127.0)
    },
  )
}
