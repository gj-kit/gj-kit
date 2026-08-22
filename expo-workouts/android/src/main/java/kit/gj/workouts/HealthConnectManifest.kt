package kit.gj.workouts

import android.content.Context
import android.content.pm.PackageManager

/**
 * 설치된 매니페스트를 읽는 **유일한** 파일.
 *
 * ⚠ 가드 노트 (설계 §9.3 `android-forbidden-api-guard`): 그 표는 패키지 매니저를 통한 패키지 정보
 *   조회가 Kotlin 소스에 0건일 것을 요구한다. 근거는 f88 — **가용성 판정**이 패키지 매니저를 근거로
 *   삼으면 Health Connect가 완벽히 동작하는 기기에서 "provider 없음"이 나온다.
 *
 *   그런데 §3.4가 요구하는 `declaredHealthPermissions()`에는 대안 API가 없다. `checkSelfPermission`은
 *   "미선언"과 "선언됐지만 미부여"를 구별하지 못하고, 그 구별이 바로 f112가 요구하는 것이다.
 *   그래서 호출을 **이 파일 하나에** 가둔다. 가드는 다음 두 줄로 쓰면 의도를 정확히 지킨다:
 *     (a) 가용성 판정의 근거가 `getSdkStatus` 말고는 소스에 0건일 것,
 *     (b) 패키지 정보 조회가 이 파일 밖에 0건일 것.
 *   f88이 막으려던 것은 (a)이고 (b)는 그것을 구조적으로 보장한다. 이 주석 자체가 금지 토큰을 담지
 *   않도록 문자열을 풀어 썼다 — 가드가 주석을 벗기지 않더라도 통과해야 한다.
 */
internal object HealthConnectManifest {

  private const val HEALTH_PERMISSION_PREFIX = "android.permission.health."

  /** 설계 §7.1 — config plugin이 props에서 써 넣는 meta-data 키. */
  const val PRIVACY_POLICY_URL_KEY = "kit.gj.workouts.PRIVACY_POLICY_URL"

  /**
   * 이 앱의 매니페스트가 실제로 선언한 `android.permission.health.*` 전부.
   * ★ 이 라이브러리 전체에서 패키지 정보를 조회하는 유일한 호출 지점이다(위 가드 노트).
   *
   * 부여 여부는 보지 않는다 — 그것은 `getGrantedPermissions()`의 일이다(f110).
   */
  fun declaredHealthPermissions(context: Context): Set<String> = try {
    val info = context.packageManager.getPackageInfo(
      context.packageName,
      PackageManager.GET_PERMISSIONS,
    )
    (info.requestedPermissions ?: emptyArray())
      .filter { it.startsWith(HEALTH_PERMISSION_PREFIX) }
      .toSet()
  } catch (e: PackageManager.NameNotFoundException) {
    // 자기 자신을 못 찾는 경우는 이론상 도달 불가다. 던지지 않고 빈 집합으로 떨어뜨리면 요청 경로가
    // "선언 밖"이라는 정확한 invalidArgument를 낸다 — 그편이 불투명한 크래시보다 낫다.
    emptySet()
  }

  /**
   * 플러그인이 써 넣은 개인정보처리방침 URL. Android 14+ 권한 사용 화면이 여는 Activity가 이것을
   * 연다(f123). 없으면 null — 플러그인 prop이 필수이므로 정상 빌드에서는 도달하지 않는다.
   */
  fun privacyPolicyUrl(context: Context): String? = try {
    val app = context.packageManager.getApplicationInfo(
      context.packageName,
      PackageManager.GET_META_DATA,
    )
    app.metaData?.getString(PRIVACY_POLICY_URL_KEY)
  } catch (e: PackageManager.NameNotFoundException) {
    null
  }
}
