package kit.gj.workouts

/**
 * 설계 §3.4 — Kotlin 쪽 seam.
 *
 * **androidx.health 타입이 이 인터페이스를 하나도 건너오지 않는다.** 그래야 JUnit이 이것을 직접
 * 페이크한다(index f56: Robolectric에는 Health Connect 섀도가 없고, `HealthConnectClient`는 Kotlin
 * **인터페이스**이지만 그것을 페이크하면 record 타입·Metadata·TimeRangeFilter가 전부 테스트로
 * 새어 들어온다). 이 seam이 그 경계다.
 *
 * `tests/fixtures/sync-scenarios.json` · `route-vectors.json` · `activity-vectors.json` ·
 * `scope-mapping.json` 네 파일이 TS 단위 테스트 · XCTest · **이 인터페이스에 대한 JUnit 페이크**를
 * 동시에 구동한다(§9.4). 네 구현이 같은 표에서 같은 결론을 내지 못하면 CI가 실패한다.
 */
interface HealthConnectGateway {

  // ── 동기 사실 (IPC 없음, 예산 소비 없음) ──

  /**
   * `HealthConnectClient.getSdkStatus(context)`의 값 그대로.
   * **`PackageManager`는 금지다** — f88이 Health Connect가 완벽히 동작하는 기기에서 PackageManager가
   * "provider 없음"을 보고하는 것을 측정했다. `getSdkStatus`만이 근거다.
   */
  fun sdkStatus(): Int

  /**
   * `ActivityManager.RunningAppProcessInfo.importance`.
   * 포그라운드는 남의 루트를 읽기 위한 **하드 전제조건**이다(f113). `READ_HEALTH_DATA_IN_BACKGROUND`는
   * 여기서 도움이 되지 않는다.
   */
  fun processImportance(): Int

  /**
   * 설치된 매니페스트에 실제로 들어 있는 `android.permission.health.*` 전부.
   * f112: 선언되지 않은 `READ_EXERCISE_ROUTES`는 route 요청이 **조용히 null**을 돌려주게 만든다 —
   * 거부와 구별할 수 없는 실패다. 선언 밖 scope 요청은 `invalidArgument`가 된다(§5.7 58번 행).
   */
  fun declaredHealthPermissions(): Set<String>

  /** 모든 `startActivity`는 resolve 가드를 통과해야 한다(f119). */
  fun resolves(intentAction: String): Boolean

  // ── 인가 ──

  /** `READ_EXERCISE_ROUTES`에 대한 유일하게 진실된 읽기다(f110). */
  suspend fun grantedPermissions(): Set<String>

  /**
   * **내부 타임아웃 없음**(f120, f122 — 온보딩 + 추가 접근 화면이 41.6 s의 스크립트 탭을 먹었다).
   * 빈 결과 집합은 `conclusive = false`이지 거부가 아니다. 판정은 before/after 비교뿐이다.
   */
  suspend fun requestPermissions(request: Set<String>): PermissionOutcomeDto

  // ── 읽기 ──

  suspend fun readSessions(window: WindowDto, pageSize: Int, pageToken: String?): SessionPageDto

  suspend fun readSession(id: String): SessionDto?

  /**
   * **페이지 창당 메트릭 종류별 1회.** 세션당이 아니다(§8.4 — 40일·200세션 백필이 세션당이면
   * 15분 예산 전체를 먹는다. 27배 차이).
   *
   * ⚠ Health Connect의 집계 API는 **절대 호출하지 않는다**. f109: 모든 지표가 빈 dataOrigins와
   *   함께 null을 돌려줬다 — 좁은 창과 4일 창에서, 필터를 넣고 빼고, 두 시간 오버로드 양쪽에서,
   *   앱이 몇 초 전에 직접 쓴 레코드에 대해, 예외 없이. §9.3의 `android-forbidden-api-guard`가
   *   소스에 그 호출이 0건임을 강제한다. 두 경로를 유지하면 같은 창이 기기마다 다른 숫자를 낸다.
   */
  suspend fun readMetricRecords(
    type: MetricType,
    window: WindowDto,
    origins: Set<String>,
  ): List<MetricRowDto>

  suspend fun readHeartRateRecords(window: WindowDto): List<HeartRateRowDto>

  // ── 동기화 ──

  /** `ExerciseSessionRecord`만 구독한다. */
  suspend fun changesToken(): String

  /** `changesTokenExpired`를 그대로 실어 나른다 — 에러가 아니라 `reset: true`의 재료다. */
  suspend fun changes(token: String, pageSize: Int): ChangeBatchDto

  // ── 루트 ──

  /**
   * 레코드 자신의 `exerciseRouteResult` 필드에서 읽는다 — **추가 호출도 추가 권한 검사도 없다**(f118).
   */
  suspend fun inlineRoute(sessionId: String): RouteOutcomeDto

  /**
   * `ExerciseRouteRequestContract`를 감싼다.
   * **반드시 10 s 타임아웃을 건다**(f104: Intent 오버플로 시 콜백이 영원히 오지 않는다. 성공은 전부
   * 200 ms 안에 돌아왔다) **그리고 프로세스당 직렬화한다**(f105: 동시 2건이 Health Connect 컨트롤러
   * 프로세스를 죽이고 호출 Activity까지 데려간다). 절대 루프에서 팬아웃하지 않는다.
   */
  suspend fun requestRouteConsent(sessionId: String, timeoutMs: Long): RouteOutcomeDto

  // ── 쓰기 ──

  suspend fun insertWorkout(w: WorkoutWriteDto): InsertOutcomeDto

  /**
   * **의무적인 read-back**(§8.5-3 · 소유자 결정 ④). 옵션이 아니고 `verifyWrite` 노브는 존재하지 않는다.
   * f93/f94: 낮은 version은 `insertRecords`에서 정상 반환하고 같은 UUID를 돌려주며, 직후의 드레인은
   * **바뀌지 않은 레코드**를 담은 upsertion 1건을 낸다. 읽어보는 것 말고 탐지 수단이 없다.
   *
   * `type`은 읽을 레코드 종류다. `SESSION`을 마지막에 두는 이유는 세션 read-back이 루트를 강제로
   * materialise하기 때문이다(f116). 없으면 null.
   *
   * ⚠ Phase 3 편차: §3.4는 `type: MetricType?`(null = 세션)이었다. `RecordType`으로 넓힌 이유는
   *   `WorkoutsDtos.kt`의 그 열거형 주석에 적었다 — §8.6이 요구하는 6회 삭제에 심박이 들어간다.
   */
  suspend fun readBackVersion(clientRecordId: String, type: RecordType): Long?

  /**
   * 한 레코드 종류에 대한 `deleteRecords` 1회.
   * 메트릭 레코드는 세션 삭제로 **cascade되지 않는다**(f98). 루트는 cascade된다.
   * 알 수 없는 id는 조용하므로(f96) 여분의 삭제 호출은 무해하다.
   */
  suspend fun deleteByClientRecordIds(type: RecordType, ids: List<String>)

  /**
   * `{ nativeId }` 삭제 경로에서, 우리 패키지가 썼지만 우리 clientRecordId 규약이 아닌 세션을 지운다.
   * 그런 세션에는 우리 이름 규약으로 묶인 메트릭 레코드가 존재할 수 없으므로 고아가 생기지 않는다.
   */
  suspend fun deleteSessionsByRecordIds(ids: List<String>)
}
