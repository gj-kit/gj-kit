package kit.gj.workouts

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.net.Uri

/**
 * 플랫폼 통합 두 개(f119, f260). **모든 `startActivity`는 resolve 가드를 통과한다** — Phase 0에서
 * 가드 없는 호출이 `ActivityNotFoundException`으로 앱을 죽이는 것을 확인했다.
 *
 * ⚠ androidx의 레거시 설정 액션 상수(`HealthConnectClient`가 deprecated로 노출하는 것)는 **쓰지
 *   않는다.** API 34+에서 resolve되지 않는다(f119). §9.3의 `android-forbidden-api-guard`가 그
 *   식별자가 소스에 0건임을 강제하므로, 이 주석에도 그 문자열을 그대로 적지 않는다 — 가드가 주석을
 *   벗기지 않더라도 통과해야 한다.
 */
internal object WorkoutsIntents {

  /** 플랫폼 Health Connect 홈. API 34+에서 이것이 resolve된다(f119). */
  const val ACTION_HEALTH_HOME_SETTINGS = "android.health.connect.action.HEALTH_HOME_SETTINGS"

  /** 앱별 권한 화면. `android.intent.extra.PACKAGE_NAME`과 함께 쓴다(f119). */
  const val ACTION_MANAGE_HEALTH_PERMISSIONS =
    "android.health.connect.action.MANAGE_HEALTH_PERMISSIONS"

  const val EXTRA_PACKAGE_NAME = "android.intent.extra.PACKAGE_NAME"

  const val PROVIDER_PACKAGE = "com.google.android.apps.healthdata"

  private const val MARKET_URI = "market://details?id=$PROVIDER_PACKAGE"
  private const val WEB_URI = "https://play.google.com/store/apps/details?id=$PROVIDER_PACKAGE"

  fun resolves(context: Context, intent: Intent): Boolean =
    intent.resolveActivity(context.packageManager) != null

  /**
   * 앱별 권한 화면을 먼저, 없으면 Health Connect 홈을 연다.
   *
   * PHASE 3: API 28–33의 provider 앱 경로는 Phase 0에서 **측정되지 않았다**(§9.5-7). 지금은 둘 다
   * resolve되지 않으면 `unavailable`로 정직하게 실패한다. 그 경로를 열려면 provider 앱을 직접 여는
   * 세 번째 후보가 필요하고, 그것은 실기 확인 뒤에 넣는다.
   */
  fun openSettings(context: Context, activity: Activity?) {
    val perApp = Intent(ACTION_MANAGE_HEALTH_PERMISSIONS)
      .putExtra(EXTRA_PACKAGE_NAME, context.packageName)
    val home = Intent(ACTION_HEALTH_HOME_SETTINGS)

    val chosen = listOf(perApp, home).firstOrNull { resolves(context, it) }
      ?: throw WorkoutsUnavailableException("noHealthConnectSettingsActivity")

    start(context, activity, chosen)
  }

  /** `market://`를 그대로, 실패하면 `https://play.google.com` 폴백(f119). */
  fun openStoreListing(context: Context, activity: Activity?) {
    val market = Intent(Intent.ACTION_VIEW, Uri.parse(MARKET_URI))
    val web = Intent(Intent.ACTION_VIEW, Uri.parse(WEB_URI))

    val chosen = listOf(market, web).firstOrNull { resolves(context, it) }
      ?: throw WorkoutsUnavailableException("noStoreActivity")

    start(context, activity, chosen)
  }

  private fun start(context: Context, activity: Activity?, intent: Intent) {
    if (activity != null) {
      activity.startActivity(intent)
    } else {
      // Activity 밖에서 시작할 때만 NEW_TASK를 붙인다. Activity가 있을 때 붙이면 최근 앱 목록에
      // 우리 태스크와 분리된 항목이 남는다.
      context.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }
  }
}
