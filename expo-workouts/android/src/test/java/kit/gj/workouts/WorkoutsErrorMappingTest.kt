package kit.gj.workouts

import expo.modules.kotlin.exception.CodedException
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.IOException

/**
 * 설계 §5.7의 Android 행을 **실행 가능한 표**로 만든다 — 6·7·37·38·40·41·42·51.
 *
 * `android.health.connect.HealthConnectException`은 API 34+ 클래스이고 JVM 테스트 클래스패스에 없다.
 * 그래서 `WorkoutsErrorMapping`은 errorCode 추출을 주입 가능한 함수로 두었고, 여기서는 그 자리에
 * 테스트용 추출기를 넣어 표 전체를 기기 없이 돈다. f101의 오버로드된 코드 7이 이 파일의 중심이다.
 */
class WorkoutsErrorMappingTest {

  /** 플랫폼 예외를 흉내내는 최소 타입 — 이름이 아니라 우리가 주입하는 추출기가 코드를 준다. */
  private class PlatformFailure(val code: Int, message: String) : RuntimeException(message)

  private val extractor: (Throwable) -> Int? = { (it as? PlatformFailure)?.code }

  private fun map(t: Throwable): Throwable = WorkoutsErrorMapping.map(t, extractor)

  @Test
  fun `row 37 — errorCode 7 with the size marker is routeTooLarge, never rateLimited`() {
    // f99/f101: 같은 코드가 두 의미를 겸한다. 메시지만이 둘을 가른다.
    val platform = PlatformFailure(7, "Record size exceeded the single record size limit: 1000000, was: 1000004")
    val wrapped = IllegalStateException("insert failed", platform)
    assertTrue(map(wrapped) is WorkoutsRouteTooLargeException)
  }

  @Test
  fun `row 38 — errorCode 7 without the size marker is rateLimited`() {
    val platform = PlatformFailure(7, "API call quota exceeded")
    assertTrue(map(IllegalStateException("read failed", platform)) is WorkoutsRateLimitedException)
  }

  @Test
  fun `row 40 — errorCode 8 is busy`() {
    assertTrue(map(PlatformFailure(8, "data sync in progress")) is WorkoutsBusyException)
  }

  @Test
  fun `row 41 — errorCode 9 and every other code is internal`() {
    assertTrue(map(PlatformFailure(9, "unknown")) is WorkoutsInternalException)
    assertTrue(map(PlatformFailure(42, "future code")) is WorkoutsInternalException)
  }

  @Test
  fun `row 51 — errorCode 3 is invalidArgument`() {
    val platform = PlatformFailure(3, "Error at index 0")
    val wrapped = IllegalArgumentException("delete failed", platform)
    assertTrue(map(wrapped) is WorkoutsInvalidArgumentException)
  }

  @Test
  fun `row 7 — SecurityException anywhere in the chain is notAuthorized`() {
    assertTrue(map(SecurityException("denied")) is WorkoutsNotAuthorizedException)
    assertTrue(map(RuntimeException("wrapped", SecurityException("denied"))) is WorkoutsNotAuthorizedException)
  }

  @Test
  fun `row 42 — IOException is io`() {
    assertTrue(map(IOException("binder")) is WorkoutsIoException)
  }

  @Test
  fun `our own exceptions pass through untouched — re-wrapping would erase the code`() {
    // Defect A와 같은 부류의 버그다: 코드를 이미 가진 예외를 다시 감싸면 `internal`로 떨어진다.
    val mine = WorkoutsHistoryRequiredException()
    assertSame(mine, map(mine))
    val nested: Throwable = RuntimeException("bridge", WorkoutsStaleVersionException("x"))
    assertTrue(map(nested) is WorkoutsStaleVersionException)
  }

  @Test
  fun `an unrecognised throwable becomes internal and names only its class`() {
    val mapped = map(IllegalStateException("some platform text with a title in it"))
    assertTrue(mapped is WorkoutsInternalException)
    val message = mapped.message ?: ""
    assertTrue(message.contains("IllegalStateException"))
    // 프라이버시: 플랫폼 메시지를 **보간하지 않는다**(미션 §4.2).
    assertFalse(message.contains("title in it"))
  }

  @Test
  fun `a cyclic cause chain terminates`() {
    val a = RuntimeException("a")
    val b = RuntimeException("b", a)
    a.initCause(b)
    assertTrue(map(a) is WorkoutsInternalException)
  }

  @Test
  fun `the size marker is recovered even when no error code survives the wrapping`() {
    val wrapped = RuntimeException(
      "outer",
      RuntimeException("Record size exceeded the single record size limit: 1000000, was: 1000052"),
    )
    assertTrue(map(wrapped) is WorkoutsRouteTooLargeException)
  }

  @Test
  fun `every exception this file produces is a CodedException — that is the JS contract`() {
    // Expo 런타임이 **클래스 이름에서** `ERR_WORKOUTS_*`를 만든다(idx f8). CodedException이 아니면
    // 그 유도 자체가 일어나지 않고 `mapErrors.ts`는 `internal`로 떨어진다.
    val produced = listOf(
      map(PlatformFailure(3, "x")),
      map(PlatformFailure(7, "single record size limit")),
      map(PlatformFailure(7, "quota")),
      map(PlatformFailure(8, "x")),
      map(PlatformFailure(9, "x")),
      map(SecurityException("x")),
      map(IOException("x")),
      map(RuntimeException("x")),
    )
    for (error in produced) assertTrue(error.javaClass.name, error is CodedException)
    assertEquals(8, produced.size)
    for (error in produced) {
      assertTrue(error.javaClass.simpleName.startsWith("Workouts"))
      assertTrue(error.javaClass.simpleName.endsWith("Exception"))
    }
  }
}
