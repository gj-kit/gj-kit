package kit.gj.workouts

import kit.gj.workouts.SharedVectors.strings
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * 설계 §8.8의 Android 표가 `tests/fixtures/scope-mapping.json`과 **1:1**임을 단언한다. 이것이 없으면
 * 매핑 변경이 TS · Swift · Kotlin 3방향으로 조용히 표류한다(§9.4).
 */
class ScopeMappingTest {

  private val mapping = SharedVectors.json("scope-mapping.json")

  @Test
  fun `read permissions match the shared table exactly`() {
    val expected = mapping.getJSONObject("androidRead")
    val keys = expected.keys().asSequence().toSet()
    assertEquals(keys, WorkoutsPermissions.READ_BY_SCOPE.keys)
    for (scope in keys) {
      assertEquals(scope, expected.getString(scope), WorkoutsPermissions.READ_BY_SCOPE[scope])
    }
  }

  @Test
  fun `write permissions match the shared table exactly`() {
    val expected = mapping.getJSONObject("androidWrite")
    val keys = expected.keys().asSequence().toSet()
    assertEquals(keys, WorkoutsPermissions.WRITE_BY_SCOPE.keys)
    for (scope in keys) {
      assertEquals(scope, expected.getString(scope), WorkoutsPermissions.WRITE_BY_SCOPE[scope])
    }
  }

  @Test
  fun `the history permission string matches`() {
    assertEquals(
      mapping.getString("androidHistory"),
      WorkoutsPermissions.READ_HEALTH_DATA_HISTORY,
    )
  }

  @Test
  fun `READ_EXERCISE_ROUTES is manifest-only and can never enter a runtime contract set`() {
    // f110: contract 집합에 넣어 "요청"하면 안 되고, 결과에 없다고 거부로 추론해서도 안 된다.
    assertEquals(
      mapping.getJSONArray("manifestOnly").strings().toSet(),
      WorkoutsPermissions.MANIFEST_ONLY,
    )
    val requested = setOf(
      WorkoutsPermissions.READ_EXERCISE,
      WorkoutsPermissions.READ_EXERCISE_ROUTES,
      WorkoutsPermissions.WRITE_EXERCISE_ROUTE,
    )
    val requestable = WorkoutsPermissions.runtimeRequestable(requested)
    assertFalse(requestable.contains(WorkoutsPermissions.READ_EXERCISE_ROUTES))
    // 단수형 WRITE_EXERCISE_ROUTE는 **요청 가능하다**. 복수/단수 혼동이 여기서 잡힌다.
    assertTrue(requestable.contains(WorkoutsPermissions.WRITE_EXERCISE_ROUTE))
    assertEquals(2, requestable.size)
  }

  @Test
  fun `the directed request record folds to the union — Android carries direction in the string`() {
    val record = PermissionRequestRecord()
    record.read = listOf(WorkoutsPermissions.READ_EXERCISE, WorkoutsPermissions.READ_DISTANCE)
    record.write = listOf(WorkoutsPermissions.WRITE_EXERCISE)
    assertEquals(
      setOf(
        WorkoutsPermissions.READ_EXERCISE,
        WorkoutsPermissions.READ_DISTANCE,
        WorkoutsPermissions.WRITE_EXERCISE,
      ),
      record.requested(),
    )
  }

  @Test
  fun `the five per-type WRITE strings are now device-verified, not derived`() {
    // §8.8 증거 등급 · §9.5 기기 게이트 6 · §11-24. Phase 3에서 `adb shell pm grant`를 다섯 줄
    // 실행해 전부 rc=0 · dumpsys `granted=true`로 확인했다. 그래서 fixture의 `unverified`는 비었고
    // 다섯 문자열은 `deviceGranted`로 옮겨졌다. 이 단언이 그 이동을 되돌릴 수 없게 한다.
    val evidence = mapping.getJSONObject("\$evidence")
    val unverified = evidence.getJSONArray("unverified").strings()
    assertEquals(emptyList<String>(), unverified)
    val deviceGranted = evidence.getJSONArray("deviceGranted").strings().toSet()
    for (write in WorkoutsPermissions.WRITE_BY_SCOPE.values) {
      assertTrue("$write must be device-verified", deviceGranted.contains(write))
    }
  }

  @Test
  fun `the granted fingerprint source is a sorted comma list of permission strings`() {
    // §4.2의 `g` 지문은 **권한 문자열**의 정렬 목록이지 scope 이름이 아니다 — 그래서 어휘 변경이
    // 기존 커서를 무효화하지 않는다(§8.8 마지막 문단).
    val source = WorkoutsPermissions.grantedFingerprintSource(
      setOf(WorkoutsPermissions.WRITE_EXERCISE, WorkoutsPermissions.READ_EXERCISE),
    )
    assertEquals(
      "android.permission.health.READ_EXERCISE,android.permission.health.WRITE_EXERCISE",
      source,
    )
  }
}
