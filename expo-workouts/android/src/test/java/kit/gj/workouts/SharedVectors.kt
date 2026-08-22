package kit.gj.workouts

import org.json.JSONArray
import org.json.JSONObject
import java.io.File

/**
 * `tests/fixtures` 아래의 JSON 벡터들 — TS 단위 테스트 · XCTest · 이 JUnit을 **동시에** 구동하는 공유 골든 벡터
 * (설계 §9.4). 네 구현이 같은 표에서 같은 결론을 내지 못하면 CI가 실패한다.
 *
 * 경로는 `android/build.gradle`의 `gjkit.fixtures` 시스템 프로퍼티로 들어온다. 없으면 **건너뛰지
 * 않고 실패한다** — 조용히 통과하는 공유 벡터 테스트는 벡터가 없는 것보다 나쁘다.
 */
internal object SharedVectors {

  private val root: File by lazy {
    val configured = System.getProperty("gjkit.fixtures")
      ?: error("gjkit.fixtures system property is not set; android/build.gradle must set it")
    val dir = File(configured)
    check(dir.isDirectory) { "shared vector directory not found: $configured" }
    dir
  }

  fun json(name: String): JSONObject = JSONObject(File(root, name).readText(Charsets.UTF_8))

  fun JSONObject.array(key: String): JSONArray = getJSONArray(key)

  fun JSONArray.objects(): List<JSONObject> = (0 until length()).map { getJSONObject(it) }

  fun JSONArray.strings(): List<String> = (0 until length()).map { getString(it) }
}
