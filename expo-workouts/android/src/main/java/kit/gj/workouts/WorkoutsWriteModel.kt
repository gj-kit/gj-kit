package kit.gj.workouts

/**
 * 쓰기 경로의 **순수** 계산 세 가지 — clientRecordId 규약 · 레코드 크기 모델 · 30일 히스토리 벽.
 *
 * 여기에 androidx도 expo도 들어오지 않는다. 그래서 `android/src/test`의 JUnit이 `tests/fixtures/
 * route-vectors.json`의 `sizeVectors`를 그대로 읽어 TS와 **바이트 동일한** 판정을 단언한다(설계 §9.4).
 * 이 파일이 없으면 f100 공식이 TS·Swift·Kotlin에 세 번 구현되고 그 표류는 기기에서만 보인다.
 */

/**
 * clientRecordId 규약 (설계 §8.5-2). f98이 기기에서 검증한 패턴 그대로:
 * `"<id>#session"` · `":distance"` · `":kcal"` · `":elev"` · `":steps"` · `":hr"`.
 */
internal object WorkoutsRecordIds {

  const val SESSION_SUFFIX = "#session"

  fun sessionId(clientId: String): String = clientId + SESSION_SUFFIX

  fun recordId(clientId: String, type: RecordType): String = sessionId(clientId) + type.suffix

  /** 한 워크아웃이 만드는 여섯 개의 id 전부. 삭제는 이 목록을 타입별로 한 번씩 돈다(§8.6). */
  fun allRecordIds(clientId: String): List<Pair<RecordType, String>> =
    RecordType.entries.map { it to recordId(clientId, it) }

  /**
   * 저장된 clientRecordId -> 호출자가 우리에게 준 id. 우리 규약이 아니면 null.
   *
   * 공개 표면의 `Workout.clientId`는 "쓴 앱이 쓴 id"다. 우리가 쓴 레코드에서 그 id는 `#session`
   * 접미사가 붙기 **전의** 값이므로, 되읽을 때 벗겨야 `saveWorkout(id) -> sync -> deleteWorkout
   * ({clientId: id})` 왕복이 성립한다. 남의 앱 레코드는 접미사를 벗기지 않는다 — 그 앱의 규약을
   * 우리가 알 수 없기 때문이다.
   */
  fun clientIdOf(stored: String?): String? {
    if (stored == null) return null
    if (!stored.endsWith(SESSION_SUFFIX)) return null
    if (stored.length <= SESSION_SUFFIX.length) return null
    return stored.substring(0, stored.length - SESSION_SUFFIX.length)
  }
}

/**
 * f99 · f100의 레코드 크기 모델. 잔차 0으로 적합된 값이며 **한 Mainline 빌드의 parcel 인코딩**이다.
 *
 * `bytes = 160 + 48·points + 2·(title + notes + clientRecordId 글자수) + 24·(segments + laps)`
 *
 * 상한은 1 000 000 B이지만 우리가 거절하는 임계값은 **960 000 B**다(96 %, 인코딩 변경 대비 여유).
 * 점 수 상한 20 000도 함께 건다 — 두 조건 중 하나라도 걸리면 `routeTooLarge`다.
 * 임계값 두 개는 `src/core/size.ts`의 `ANDROID_RECORD_BYTE_LIMIT` · `MAX_ANDROID_ROUTE_POINTS`와
 * 같은 값이어야 하고, JUnit이 공유 벡터로 그것을 단언한다.
 */
internal object WorkoutsSizeModel {

  const val BASE_BYTES = 160L
  const val BYTES_PER_POINT = 48L
  const val BYTES_PER_CHAR = 2L
  const val BYTES_PER_ROW = 24L

  /** 측정된 절대 상한(f99). 여기까지 가지 않는다. */
  const val RECORD_BYTE_CEILING = 1_000_000L

  /** 우리가 플랫폼 호출 **전에** 거절하는 임계값. */
  const val RECORD_BYTE_LIMIT = 960_000L

  const val MAX_ROUTE_POINTS = 20_000

  fun estimateRecordBytes(
    routePoints: Int,
    clientRecordIdLength: Int,
    titleLength: Int = 0,
    notesLength: Int = 0,
    segments: Int = 0,
    laps: Int = 0,
  ): Long =
    BASE_BYTES +
      BYTES_PER_POINT * routePoints.toLong() +
      BYTES_PER_CHAR * (clientRecordIdLength + titleLength + notesLength).toLong() +
      BYTES_PER_ROW * (segments + laps).toLong()

  fun accepts(bytes: Long, routePoints: Int): Boolean =
    routePoints <= MAX_ROUTE_POINTS && bytes <= RECORD_BYTE_LIMIT

  /**
   * `insertRecords` **전에** 부른다(§5.7 47번 행). 메시지에는 상수 토큰만 담는다 — 점 수도 좌표도
   * 넣지 않는다.
   */
  fun assertWritable(write: WorkoutWriteDto) {
    val clientRecordId = WorkoutsRecordIds.sessionId(write.clientId)
    val bytes = estimateRecordBytes(
      routePoints = write.route.size,
      clientRecordIdLength = clientRecordId.length,
      segments = write.pauses.size,
      laps = write.laps.size,
    )
    if (!accepts(bytes, write.route.size)) {
      throw WorkoutsRouteTooLargeException("estimateExceedsSingleRecordLimit")
    }
  }
}

/**
 * Health Connect의 30일 히스토리 벽(idx f38 · D10 · 설계 §5.7 44·45번 행).
 *
 * 벽 밖을 건드리는 읽기는 by-id면 throw하고 대량 읽기면 **조용히 잘린다**. 조용한 절단은 소비자가
 * 감지할 수 없으므로, `READ_HEALTH_DATA_HISTORY` 없이 벽 밖을 읽으려 하면 **읽기 전에** 거절한다.
 *
 * ⚠ 이 규칙은 과다 거절할 수 있다 — 자기가 쓴 30일 이전 데이터는 권한 없이도 읽힌다. 그럼에도
 *   §5.7 45번 행이 조용한 절단보다 정직한 실패를 택했다. `history: true` prop 하나로 열린다.
 * ⚠ `GRACE_MS`는 JS가 `Date.now()`로 만든 창을 네이티브가 `System.currentTimeMillis()`로 검사하는
 *   사이의 시차를 흡수한다. 이것이 없으면 정확히 "지난 30일"을 요청한 창이 몇 ms 차이로 벽 밖이 된다.
 */
internal object WorkoutsHistoryWall {

  const val WALL_MS = 30L * 24L * 60L * 60L * 1000L

  const val GRACE_MS = 5L * 60L * 1000L

  fun reachesPastWall(fromMs: Double, nowMs: Long): Boolean =
    fromMs < (nowMs - WALL_MS - GRACE_MS).toDouble()

  fun assertReadable(window: WindowDto, nowMs: Long, hasHistoryPermission: Boolean) {
    if (!hasHistoryPermission && reachesPastWall(window.fromMs, nowMs)) {
      throw WorkoutsHistoryRequiredException()
    }
  }
}
