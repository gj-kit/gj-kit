package kit.gj.workouts

import kit.gj.workouts.SharedVectors.objects
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * 설계 §5.7 3–5번 행 — 측정된 세 상태 x API 레벨을 전수로 돈다(f88, idx f31).
 * `WorkoutsAvailability`는 Context를 받지 않는 순수 함수이므로 기기 없이 전수가 가능하다.
 */
class WorkoutsAvailabilityTest {

  private val sdkAvailable = 3
  private val sdkUnavailable = 1
  private val sdkUpdateRequired = 2

  @Test
  fun `API below 28 is permanently unavailable, whatever getSdkStatus says`() {
    for (status in listOf(sdkUnavailable, sdkUpdateRequired, sdkAvailable, 99)) {
      val result = WorkoutsAvailability.classify(27, status)
      assertTrue(result is AvailabilityDto.Unavailable)
      assertEquals(AvailabilityDto.REASON_PLATFORM_TOO_OLD, (result as AvailabilityDto.Unavailable).reason)
    }
  }

  @Test
  fun `the three measured states fold to exactly three outcomes`() {
    assertTrue(WorkoutsAvailability.classify(36, sdkAvailable) is AvailabilityDto.Available)
    assertTrue(WorkoutsAvailability.classify(36, sdkUpdateRequired) is AvailabilityDto.UpdateRequired)
    val unavailable = WorkoutsAvailability.classify(36, sdkUnavailable)
    assertEquals(
      AvailabilityDto.REASON_NOT_SUPPORTED,
      (unavailable as AvailabilityDto.Unavailable).reason,
    )
  }

  @Test
  fun `an unknown fourth status hides the feature rather than claiming data`() {
    val result = WorkoutsAvailability.classify(36, 99)
    assertTrue(result is AvailabilityDto.Unavailable)
  }

  @Test
  fun `the bridge shape is the one the TS contract expects`() {
    assertEquals(mapOf("status" to "available"), AvailabilityDto.Available.toMap())
    assertEquals(mapOf("status" to "updateRequired"), AvailabilityDto.UpdateRequired.toMap())
    assertEquals(
      mapOf("status" to "unavailable", "reason" to "notSupported"),
      AvailabilityDto.Unavailable("notSupported").toMap(),
    )
  }
}
