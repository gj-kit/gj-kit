package kit.gj.workouts

import android.content.Context
import android.os.Build
import expo.modules.kotlin.activityresult.AppContextActivityResultLauncher
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/**
 * `@gj-kit/expo-workouts`의 Android 네이티브 모듈.
 *
 * 네이티브 모듈 문자열은 **`GjKitWorkouts`**이고 JS 쪽 유일한 진입점은
 * `requireOptionalNativeModule('GjKitWorkouts')`다(설계 §3.1). 클래스 이름 · 패키지 · namespace는
 * 미션 §4.1의 `naming-guard`가 문자열로 단언한다.
 *
 * ── 계약 ──────────────────────────────────────────────────────────────────────
 * 19개 seam 함수가 전부 실물이다. 이 클래스가 하는 일은 **Record -> DTO 변환과 위임**뿐이며, 규칙은
 * 두 층 아래에 산다: 순수 오케스트레이션은 `WorkoutsOperations`(JUnit이 페이크 게이트웨이로 돌린다),
 * androidx를 만지는 것은 `RealHealthConnectGateway` 하나다. 판정(활동 매핑 · 루트 위생 · 커서 ·
 * 합산 · 창 검증)은 전부 `./core`의 순수 TS다 — 네이티브는 **원시 사실만 보낸다**.
 *
 * ── 모든 AsyncFunction이 `Coroutine`인 이유 ──────────────────────────────────
 * 클로저 스타일 `AsyncFunction`은 프로세스 전역 직렬 큐에서 돈다(index f8). 36 000포인트 루트
 * 읽기(1.1 s, f79)나 41.6 s짜리 권한 온보딩(f120)이 거기 들어가면 앱 전체가 멈춘다.
 */
class GjKitWorkoutsModule : Module() {

  /** `RegisterActivityContracts`가 채운다. 등록 전에는 null이며 그 상태는 `cancelled`로 정착한다. */
  private var permissionLauncher: AppContextActivityResultLauncher<HashSet<String>, Set<String>>? = null
  private var routeConsentLauncher: AppContextActivityResultLauncher<String, RouteOutcomeDto>? = null

  private val gateway: HealthConnectGateway by lazy {
    RealHealthConnectGateway(
      context = requireContext(),
      permissionLauncher = { permissionLauncher },
      routeConsentLauncher = { routeConsentLauncher },
    )
  }

  /**
   * seam 위의 순수 오케스트레이션(§8.4·§8.5·§8.6). 이 모듈은 Record -> DTO 변환과 위임만 한다 —
   * 규칙이 여기 있으면 JUnit이 그것을 볼 수 없다.
   */
  private val operations: WorkoutsOperations by lazy {
    WorkoutsOperations(
      gateway = gateway,
      ownPackageName = requireContext().packageName,
      foregroundImportance = RealHealthConnectGateway.FOREGROUND_IMPORTANCE,
    )
  }

  private fun requireContext(): Context =
    appContext.reactContext ?: throw WorkoutsUnavailableException("noReactContext")

  override fun definition() = ModuleDefinition {
    Name("GjKitWorkouts")

    /**
     * index f9 — Android 액티비티 결과는 여기서 등록하고 `suspend launch(input)`으로 기다린다.
     * 두 컨트랙트 다 Phase 2에서 **실제로 등록된다**. 배선이 컴파일되고 등록까지 도달하는 것이
     * 이 레인의 위험한 부분이었고, 그것을 Phase 3로 미루지 않는다.
     */
    RegisterActivityContracts {
      permissionLauncher = registerForActivityResult(HealthPermissionsContract())
      routeConsentLauncher = registerForActivityResult(ExerciseRouteConsentContract())
    }

    // ── 가용성 · 인가 (데이터 읽기 예산을 소비하지 않는다) ────────────────────

    /**
     * **실제 구현이다.** `getSdkStatus(context)` tri-state + API < 28 단락 + Play 딥링크.
     * `PackageManager`는 이 경로에 오지 않는다 — f88이 Health Connect가 완벽히 동작하는 기기에서
     * PackageManager가 "provider 없음"을 보고하는 것을 측정했다.
     */
    AsyncFunction("availability") Coroutine { ->
      WorkoutsAvailability.classify(Build.VERSION.SDK_INT, gateway.sdkStatus()).toMap()
    }

    /**
     * 원시 사실만 넘긴다. `Record<Scope, ScopeStatus>` 판정은 전부 `./core`가 한다(설계 §8.8).
     * `wouldPrompt`는 iOS 전용이라 언제나 false다.
     */
    AsyncFunction("authorizationSnapshot") Coroutine { ->
      val availability = WorkoutsAvailability.classify(Build.VERSION.SDK_INT, gateway.sdkStatus())
      if (availability !is AvailabilityDto.Available) {
        // 스토어를 열 수 없으면 부여 집합을 물어볼 수도 없다. 빈 사실이 정직한 답이다.
        AuthorizationSnapshotDto(
          availability = availability,
          granted = emptyList(),
          declared = gateway.declaredHealthPermissions().sorted(),
          foreground = isForeground(),
          routeAccess = "perRoute",
          history = false,
        ).toMap()
      } else {
        val granted = gateway.grantedPermissions()
        val foreground = isForeground()
        AuthorizationSnapshotDto(
          availability = availability,
          granted = granted.sorted(),
          declared = gateway.declaredHealthPermissions().sorted(),
          foreground = foreground,
          routeAccess = routeAccess(granted, foreground),
          history = granted.contains(WorkoutsPermissions.READ_HEALTH_DATA_HISTORY),
        ).toMap()
      }
    }

    /**
     * **내부 타임아웃 없음**(f120, f122). 원시 before/after 집합을 그대로 돌려준다.
     *
     * ⚠ Phase 3 결함 B로 시그니처가 `{ read, write }`로 바뀌었다 — iOS가 read/share를 구분해야
     *   하기 때문이다(§3.2). Android에서는 방향이 권한 문자열에 이미 있으므로 합집합이 요청이고,
     *   `requested()`가 그 합집합을 준다.
     */
    AsyncFunction("requestPermissions") Coroutine { request: PermissionRequestRecord ->
      gateway.requestPermissions(request.requested()).toMap()
    }

    /**
     * 커서의 `g` 지문 재료(§4.2). 부여된 **권한 문자열**의 정렬 목록이지 scope 이름이 아니다 —
     * 그래서 어휘가 바뀌어도 기존 커서가 무효화되지 않는다(§8.8 마지막 문단).
     * FNV-1a 자체는 TS가 계산한다.
     */
    AsyncFunction("grantedScopeFingerprint") Coroutine { ->
      WorkoutsPermissions.grantedFingerprintSource(gateway.grantedPermissions())
    }

    // ── 읽기 원시 연산 ────────────────────────────────────────────────────────

    AsyncFunction("readWorkoutPage") Coroutine { query: WorkoutPageQueryRecord ->
      operations.readWorkoutPage(query.window(), query.pageSize, query.pageToken).toMap()
    }

    AsyncFunction("readMetricRecords") Coroutine { query: MetricQueryRecord ->
      gateway
        .readMetricRecords(query.metricType(), query.window(), query.origins.toSet())
        .map { it.toMap() }
    }

    AsyncFunction("readHeartRateSamples") Coroutine { window: WindowRecord ->
      gateway.readHeartRateRecords(window.toDto()).map { it.toMap() }
    }

    /**
     * **iOS 전용 판별자다**(RESULTS 206 / f71 — tier 1의 값이 합성된 legacy total인지 구별한다).
     * Health Connect에는 "워크아웃에 연관된 샘플"이라는 개념이 없다. 세션과 메트릭 레코드는 시간과
     * dataOrigin으로만 이어진다. `false`가 정직한 답이며 스텁이 아니다 — `./core`는 Android에서
     * provenance를 이 값으로 판정하지 않는다.
     */
    AsyncFunction("hasAssociatedSamples") Coroutine { _: String, _: String ->
      false
    }

    // ── 동기화 원시 연산 ──────────────────────────────────────────────────────

    AsyncFunction("takeCheckpoint") Coroutine { ->
      gateway.changesToken()
    }

    AsyncFunction("drainCheckpoint") Coroutine { checkpoint: String, limit: Int ->
      operations.drainCheckpoint(checkpoint, limit).toMap()
    }

    // ── 루트: pull 기반 핸들 ──────────────────────────────────────────────────

    /**
     * 설계 §8.4 · f113 · f116 · f118. 규칙은 전부 `WorkoutsOperations.openRoute`에 있다 —
     * 페이지 캐시 우선 · 인라인 결과 · 전경 전제 · `'prompt'`일 때만 컨트랙트.
     */
    AsyncFunction("openRoute") Coroutine { nativeId: String, consent: String ->
      operations.openRoute(nativeId, consent).toMap()
    }

    /**
     * 핸들 뒤의 스냅샷에서 `maxPoints`씩 꺼낸다. 더 없으면 **null**(스트림 종료)이다.
     * TS의 `for await`에서 나온 `break`가 `closeRoute`로 매핑된다.
     */
    AsyncFunction("readRouteChunk") Coroutine { handle: String, maxPoints: Int ->
      operations.readRouteChunk(handle, maxPoints)?.map { it.toMap() }
    }

    /** 핸들의 스냅샷을 놓는다. 이미 닫힌 핸들에 대해 조용하다(멱등) — 던지면 원래 에러가 가려진다. */
    AsyncFunction("closeRoute") Coroutine { handle: String ->
      operations.closeRoute(handle)
    }

    // ── 쓰기 원시 연산 ────────────────────────────────────────────────────────

    /**
     * iOS 전용이다(index f26 — 같은 version 재저장이 새 uuid를 만들어 이전 샘플·루트를 고아로
     * 만든다). Health Connect는 `clientRecordId` 업서트가 그 문제를 구조적으로 갖지 않으므로
     * **언제나 null**이다. 설계 §3.2가 명시한 값이며 스텁이 아니다.
     */
    AsyncFunction("findBySyncIdentifier") Coroutine { _: String ->
      NO_EXISTING_WORKOUT
    }

    AsyncFunction("saveWorkout") Coroutine { spec: WorkoutWriteRecord ->
      operations.saveWorkout(spec.toDto()).toMap()
    }

    /** **항상** 불린다. `verifyWrite` 노브는 존재하지 않는다(소유자 결정 ④, f93/f94). */
    AsyncFunction("readBackVersion") Coroutine { clientId: String ->
      operations.readBackVersion(clientId)?.toDouble()
    }

    /**
     * §8.6. `{ nativeId }` 경로는 먼저 세션을 조회해 소유권과 clientRecordId를 확인해야 메트릭
     * 고아가 생기지 않는다. UUID 형식 검증은 `./core`가 이미 끝냈다(f96).
     */
    AsyncFunction("deleteWorkout") Coroutine { ref: DeleteRefRecord ->
      operations.deleteWorkout(DeleteRefDto(nativeId = ref.nativeId, clientId = ref.clientId))
    }

    // ── 플랫폼 통합 (실제 구현) ───────────────────────────────────────────────

    AsyncFunction("openSettings") Coroutine { ->
      withContext(Dispatchers.Main) {
        WorkoutsIntents.openSettings(requireContext(), appContext.currentActivity)
      }
    }

    AsyncFunction("openStoreListing") Coroutine { ->
      withContext(Dispatchers.Main) {
        WorkoutsIntents.openStoreListing(requireContext(), appContext.currentActivity)
      }
    }
  }

  /** f113: 남의 루트를 읽기 위한 하드 전제조건. 백그라운드 읽기 권한은 도움이 되지 않는다. */
  private fun isForeground(): Boolean =
    gateway.processImportance() <= RealHealthConnectGateway.FOREGROUND_IMPORTANCE

  /**
   * `RouteAccess` 축약.
   *
   * 정본은 AOSP의 `getExerciseRouteReadAccessType`이지만 connect-client 1.1.0에는 그
   * 질의가 없다. 아래는 f110/f113/f114가 측정한 것에서 파생한 보수적 유도이며, 그 API에 닿을 수
   * 있게 되면 **그것으로 교체한다**. 이 값은 절대 캐시하지 않는다 — 앱은 자기가 쓴 루트에 대한
   * 접근도 잃을 수 있다(f114).
   */
  private fun routeAccess(granted: Set<String>, foreground: Boolean): String = when {
    granted.contains(WorkoutsPermissions.READ_EXERCISE_ROUTES) && foreground -> "all"
    granted.contains(WorkoutsPermissions.WRITE_EXERCISE_ROUTE) -> "own"
    else -> "perRoute"
  }
}

/** Android에는 sync-identifier 조회가 없다(설계 §3.2). 타입을 명시해야 reify가 된다. */
private val NO_EXISTING_WORKOUT: Map<String, Any?>? = null

/** `WorkoutWriteRecord`(브리지) -> `WorkoutWriteDto`(seam). expo 타입이 seam을 건너지 않게 한다. */
private fun WorkoutWriteRecord.toDto(): WorkoutWriteDto = WorkoutWriteDto(
  clientId = clientId,
  version = version.toLong(),
  activityTypeRaw = activityTypeRaw,
  startMs = startMs,
  endMs = endMs,
  utcOffsetMin = utcOffsetMin,
  timeZoneId = timeZoneId,
  pauses = pauses.map { it.toDto() },
  laps = laps.map { it.toDto() },
  distanceM = distanceM,
  activeEnergyKcal = activeEnergyKcal,
  elevationGainM = elevationGainM,
  steps = steps?.toLong(),
  heartRate = heartRate.map { it.toDto() },
  route = route.map { it.toDto() },
)
