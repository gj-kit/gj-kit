package kit.gj.workouts

import android.content.Context
import android.content.Intent
import androidx.health.connect.client.PermissionController
import androidx.health.connect.client.contracts.ExerciseRouteRequestContract
import expo.modules.kotlin.activityresult.AppContextActivityResultContract

// Android 액티비티 결과는 `RegisterActivityContracts { launcher = registerForActivityResult(...) }`로
// 등록하고 `suspend launch(input)`으로 기다린다(index f9). Expo의 컨트랙트 인터페이스는 androidx의
// 것과 모양이 달라서(입력이 parseResult에도 전달된다, 입력은 Serializable이어야 한다) 아래 두
// 래퍼가 필요하다. 래퍼 안에서만 androidx 타입이 산다 — `HealthConnectGateway`는 그것을 보지 않는다.
//
// ⚠ 프로세스 사망 시 fallback 콜백은 동작하지 않는다는 것이 문서화된 한계다(index f9). 대기 중
//   액티비티가 소멸하면 promise를 반드시 `cancelled`로 정착시킨다 — 영원히 대기하지 않는다.

/**
 * `PermissionController.createRequestPermissionResultContract()`의 Expo 래퍼.
 *
 * 입력은 `HashSet<String>`이다 — Expo가 요구하는 `Serializable` 경계이고, `Set<String>` 인터페이스
 * 자체는 Serializable이 아니다.
 *
 * ⚠ 이 컨트랙트에 넣는 집합은 반드시 `WorkoutsPermissions.runtimeRequestable()`을 통과한 것이어야
 *   한다. `READ_EXERCISE_ROUTES`를 여기에 넣어 "요청"하면 안 되고, 결과에 없다고 거부로 추론해서도
 *   안 된다(f110).
 * ⚠ **타임아웃을 걸지 않는다**(f120, f122). 온보딩 + 추가 접근 화면이 41.6 s를 먹었다.
 */
class HealthPermissionsContract :
  AppContextActivityResultContract<HashSet<String>, Set<String>> {

  private val delegate = PermissionController.createRequestPermissionResultContract()

  override fun createIntent(context: Context, input: HashSet<String>): Intent =
    delegate.createIntent(context, input)

  override fun parseResult(input: HashSet<String>, resultCode: Int, intent: Intent?): Set<String> =
    delegate.parseResult(resultCode, intent)
}

/**
 * `ExerciseRouteRequestContract`의 Expo 래퍼(index f9). 입력은 세션 id 문자열이다.
 *
 * 결과 해석 (설계 §5.7 31·32번 행):
 *  - 루트를 받았다            -> `available` + 포인트
 *  - null                     -> **원인을 알 수 없다.** 거부(22 117 ms 뒤 null) · 루트 없음 ·
 *                                잘못된 id · 없는 id · 매니페스트 미선언이 f112에서 **바이트 동일**한
 *                                결과를 냈다. `denied` 코드를 지어내지 않는다.
 *                                "루트는 있는데 지금 못 본다"를 유지하기 위해 `consentRequired` +
 *                                빈 포인트로 정착시키고, `./core`가 그것을 **빈 스트림**으로 낸다.
 *
 * ⚠ 이 컨트랙트의 launch는 **10 s 타임아웃**(f104) 안에서, **프로세스당 직렬화**(f105)되어야 한다.
 *   그 두 규칙은 호출부(`HealthConnectGateway.requestRouteConsent`)가 강제한다.
 */
class ExerciseRouteConsentContract :
  AppContextActivityResultContract<String, RouteOutcomeDto> {

  private val delegate = ExerciseRouteRequestContract()

  override fun createIntent(context: Context, input: String): Intent =
    delegate.createIntent(context, input)

  override fun parseResult(input: String, resultCode: Int, intent: Intent?): RouteOutcomeDto {
    val route = delegate.parseResult(resultCode, intent)
      ?: return RouteOutcomeDto.consentRequired()

    val points = route.toDtos()
    // 0포인트 루트는 "루트 없음"이다 — `NoData`와 같은 결과로 접는다(f118).
    return if (points.isEmpty()) RouteOutcomeDto.none() else RouteOutcomeDto.data(points)
  }
}
