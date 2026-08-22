package kit.gj.workouts

import android.os.Build
import androidx.health.connect.client.HealthConnectClient

/**
 * 설계 §5.7 3–5번 행 — 측정된 세 가지 상태를 정확히 세 가지 결과로 접는다.
 *
 * 이 파일은 **순수**하다(Context를 받지 않는다). 그래서 JUnit이 세 상태 x API 레벨을 device 없이
 * 전수로 돌린다 — Phase 2에서 실제로 검증 가능한 몇 안 되는 네이티브 로직이다.
 */
object WorkoutsAvailability {

  /** Health Connect는 API 28(Android 9)부터다. 그 아래는 영구 불가다(D6). */
  const val MIN_SDK_INT = Build.VERSION_CODES.P

  /**
   * @param sdkInt   `Build.VERSION.SDK_INT`
   * @param sdkStatus `HealthConnectClient.getSdkStatus(context)`의 반환값
   *
   * 판정 순서가 중요하다:
   *  1. API < 28  -> `{unavailable, platformTooOld}`. **`getSdkStatus`를 부르기도 전에** 끊는다.
   *  2. SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED -> `{updateRequired}` (index f31, D6).
   *     `openStoreListing()` CTA가 붙는 유일한 상태다.
   *  3. SDK_UNAVAILABLE -> `{unavailable, notSupported}` (f88).
   *  4. SDK_AVAILABLE -> `{available}`.
   *  5. 그 외 정수 -> 보수적으로 `{unavailable, notSupported}`. androidx가 넷째 상태를 추가하면
   *     기능을 숨기는 쪽이 없는 데이터를 있다고 말하는 쪽보다 안전하다.
   */
  fun classify(sdkInt: Int, sdkStatus: Int): AvailabilityDto = when {
    sdkInt < MIN_SDK_INT ->
      AvailabilityDto.Unavailable(AvailabilityDto.REASON_PLATFORM_TOO_OLD)

    sdkStatus == HealthConnectClient.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED ->
      AvailabilityDto.UpdateRequired

    sdkStatus == HealthConnectClient.SDK_AVAILABLE ->
      AvailabilityDto.Available

    else ->
      AvailabilityDto.Unavailable(AvailabilityDto.REASON_NOT_SUPPORTED)
  }
}
