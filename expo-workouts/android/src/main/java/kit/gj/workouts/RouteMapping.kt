package kit.gj.workouts

import androidx.health.connect.client.records.ExerciseRoute

/**
 * `ExerciseRoute.Location` -> `RoutePointDto`. androidx 타입이 seam을 건너지 않게 하는 경계 함수다.
 *
 * 하지 않는 것 (전부 `./core`의 일이다 — 세 언어가 세 번 구현하면 표류가 **기기에서만** 보인다):
 *  - §8.2의 루트 위생 8규칙 (좌표 범위 · hAcc 임계 · 중복 타임스탬프 dedupe · 창 밖 포인트 · f83 sentinel)
 *  - 정렬과 병합
 *  - 크기 추정 (f100 공식)
 * 여기서는 단위 변환과 null 보존만 한다. `tests/fixtures/route-vectors.json`이 정본이다(§9.4).
 *
 * Health Connect의 Location은 속도·방위를 **갖지 않는다**. iOS의 `CLLocation`은 갖는다. 그 비대칭은
 * `speedMps` / `courseDeg`가 Android에서 언제나 null이라는 형태로 정직하게 드러난다.
 */
internal fun ExerciseRoute.Location.toDto(): RoutePointDto = RoutePointDto(
  t = time.toEpochMilli().toDouble(),
  lat = latitude,
  lon = longitude,
  altM = altitude?.inMeters,
  hAccM = horizontalAccuracy?.inMeters,
  vAccM = verticalAccuracy?.inMeters,
  speedMps = null,
  courseDeg = null,
)

internal fun ExerciseRoute.toDtos(): List<RoutePointDto> = route.map { it.toDto() }
