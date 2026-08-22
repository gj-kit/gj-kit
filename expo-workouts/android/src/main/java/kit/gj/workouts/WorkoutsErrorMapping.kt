package kit.gj.workouts

import expo.modules.kotlin.exception.CodedException
import java.io.IOException

/**
 * 플랫폼 예외 -> 14종 중 하나 (설계 §5.6 · §5.7 6·7·37·38·40·41·42·51번 행).
 *
 * **왜 별도 파일이고 왜 순수한가.** `android.health.connect.HealthConnectException`은 API 34+ 클래스이고
 * JVM 단위 테스트 클래스패스에 없다. 그래서 errorCode 추출을 주입 가능한 함수로 두고, 기본 구현만
 * 리플렉션으로 그 클래스를 만진다. JUnit은 자기 추출기를 넣어 표 전체를 기기 없이 돈다.
 *
 * **프라이버시(미션 §4.2).** 만들어지는 예외의 `message`에는 **플랫폼 메시지를 절대 보간하지 않는다** —
 * 상수 토큰과 errorCode 정수만 담는다. 원본은 `cause`로 달아 디버깅에 남기되, 그 텍스트를 우리가
 * 다시 쓰지는 않는다.
 */
internal object WorkoutsErrorMapping {

  /** f101: 코드 7은 rate-limit과 "레코드가 너무 큼"을 겸한다. 메시지만이 둘을 가른다. */
  const val SINGLE_RECORD_SIZE_LIMIT_MARKER = "single record size limit"

  const val ERROR_CODE_INVALID_ARGUMENT = 3
  const val ERROR_CODE_RATE_LIMIT_OR_SIZE = 7
  const val ERROR_CODE_DATA_SYNC_IN_PROGRESS = 8

  /** connect-client가 감싸는 깊이는 얕지만, 상한을 두어 순환 cause에서 멈춘다. */
  private const val MAX_DEPTH = 8

  /** 기본 추출기 — 클래스 이름으로 식별하고 `getErrorCode()`를 리플렉션으로 읽는다. */
  fun platformErrorCode(t: Throwable): Int? {
    if (t.javaClass.name != "android.health.connect.HealthConnectException") return null
    return try {
      t.javaClass.getMethod("getErrorCode").invoke(t) as? Int
    } catch (e: ReflectiveOperationException) {
      null
    }
  }

  private fun chain(t: Throwable): List<Throwable> {
    val out = ArrayList<Throwable>(MAX_DEPTH)
    var current: Throwable? = t
    var depth = 0
    while (current != null && depth < MAX_DEPTH && out.none { it === current }) {
      out.add(current)
      current = current.cause
      depth += 1
    }
    return out
  }

  /**
   * 이미 우리 코드가 만든 `CodedException`이면 **그대로 통과시킨다** — 다시 감싸면 코드가 사라진다.
   * (`mapErrors.ts`가 Phase 3에서 고친 것과 같은 부류의 버그다.)
   */
  fun map(
    t: Throwable,
    errorCodeOf: (Throwable) -> Int? = ::platformErrorCode,
  ): Throwable {
    if (t is CodedException) return t

    val links = chain(t)
    for (link in links) {
      if (link is CodedException) return link
      if (link is SecurityException) return WorkoutsNotAuthorizedException("platformSecurityException")

      val code = errorCodeOf(link)
      if (code != null) {
        return when (code) {
          ERROR_CODE_INVALID_ARGUMENT -> WorkoutsInvalidArgumentException("platformErrorCode3")
          ERROR_CODE_RATE_LIMIT_OR_SIZE ->
            if (mentionsRecordSizeLimit(links)) {
              WorkoutsRouteTooLargeException("platformSingleRecordSizeLimit")
            } else {
              WorkoutsRateLimitedException("platformErrorCode7")
            }
          ERROR_CODE_DATA_SYNC_IN_PROGRESS -> WorkoutsBusyException("platformErrorCode8")
          else -> WorkoutsInternalException("platformErrorCode$code", t)
        }
      }

      if (link is IOException) return WorkoutsIoException("platformIoException", t)
      if (isRemoteFailure(link)) return WorkoutsIoException("platformRemoteException", t)
    }

    // 크기 초과는 errorCode를 실어 오지 못하는 래핑에서도 메시지로 식별 가능하다(f99/f101).
    if (mentionsRecordSizeLimit(links)) {
      return WorkoutsRouteTooLargeException("platformSingleRecordSizeLimit")
    }
    return WorkoutsInternalException("platform${t.javaClass.simpleName}", t)
  }

  private fun mentionsRecordSizeLimit(links: List<Throwable>): Boolean =
    links.any { it.message?.contains(SINGLE_RECORD_SIZE_LIMIT_MARKER) == true }

  /**
   * `RemoteException` / `DeadObjectException`은 `android.os`에 있고 단위 테스트 클래스패스 밖이다 —
   * f105(컨트롤러 프로세스 크래시)의 여파가 정확히 이 모양으로 온다. 이름으로 식별한다.
   */
  private fun isRemoteFailure(t: Throwable): Boolean {
    var klass: Class<*>? = t.javaClass
    while (klass != null) {
      if (klass.name == "android.os.RemoteException") return true
      klass = klass.superclass
    }
    return false
  }
}
