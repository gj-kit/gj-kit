package kit.gj.workouts

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Bundle

/**
 * 설계 §7.1의 마지막 행 — 라이브러리 매니페스트가 담는 **유일한** 컴포넌트.
 *
 * config plugin이 두 개의 `activity-alias`를 이 클래스로 겨눈다:
 *   - `android.intent.action.VIEW_PERMISSION_USAGE` + category `android.intent.category.HEALTH_PERMISSIONS`,
 *     `android:permission="android.permission.START_VIEW_PERMISSION_USAGE"`로 보호
 *     -> **f123: Android 14+ UI가 실제로 띄우는 것이 이것이다.**
 *   - `androidx.health.ACTION_SHOW_PERMISSIONS_RATIONALE`
 *     -> API 28–33 경로용. 34+에서는 한 번도 발화하지 않았지만 제거 대상이 **아니다**(RESULTS 261).
 *
 * 왜 alias가 플러그인 쪽인가: 라이브러리 매니페스트의 항목은 `expo config --type introspect`에
 * 보이지 않는다(index f10). 게이트가 단언해야 하는 것은 전부 플러그인이 쓴다. 게이트가 증명할 것은
 * alias의 존재이고, alias와 타깃은 병합 시점에 함께 검증된다.
 *
 * 하는 일: 플러그인이 써 넣은 `kit.gj.workouts.PRIVACY_POLICY_URL` meta-data를 열고 즉시 끝난다.
 * UI를 그리지 않는다.
 */
class PermissionUsageActivity : Activity() {

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)

    val url = HealthConnectManifest.privacyPolicyUrl(this)
    if (url != null) {
      val view = Intent(Intent.ACTION_VIEW, Uri.parse(url))
      // 브라우저가 없는 기기(일부 TV/워치 이미지)에서 크래시하지 않는다 — f119의 resolve 가드 규칙은
      // 우리가 시작하는 **모든** Intent에 적용된다.
      if (WorkoutsIntents.resolves(this, view)) {
        startActivity(view)
      }
    }

    finish()
  }
}
