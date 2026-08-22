// ═══════════════ scope → 플랫폼 권한 (설계 §8.8 정본의 **플러그인 측 사본**) ═══════════════
//
// ⚠ 왜 `../../src/core/authorization.ts`를 import하지 않고 복제하는가:
//   `plugin/tsconfig.json`의 `rootDir`이 `src`(= `plugin/src`)라서 그 경계를 넘는 import는
//   TS6059로 컴파일 자체가 실패한다. `plugin/`은 CJS로 따로 컴파일되는 별도 프로그램이다.
//   대신 표류를 **테스트로 막는다** — `plugin/__tests__/scope-mapping-parity.test.ts`가
//   이 파일 · `src/core/authorization.ts` · `tests/fixtures/scope-mapping.json` 세 곳이
//   문자 단위로 같은지 단언한다. 셋 중 하나만 고치면 `pnpm test`가 빨개진다.

/** 소유자 결정 ② 이후의 **7종** 어휘. `'workouts'`는 세션 **단독**을 뜻한다 (총합 포함 아님). */
export const SCOPES = [
  'workouts',
  'distance',
  'activeEnergy',
  'elevation',
  'routes',
  'heartRate',
  'steps',
] as const;

export type Scope = (typeof SCOPES)[number];

const ANDROID_PERMISSION_PREFIX = 'android.permission.health.';

/**
 * Health Connect READ 권한 (설계 §8.8 Android 표).
 *
 * 증거 등급 — 이 표에서 가장 약한 줄을 정직하게 표기한다:
 * - `[device]` READ_EXERCISE · READ_DISTANCE (f52에서 `pm grant`로 실제 부여됨)
 * - `[device]` READ_EXERCISE_ROUTES (f52)
 * - `[official-doc]` READ_ACTIVE_CALORIES_BURNED · READ_ELEVATION_GAINED · READ_HEART_RATE ·
 *   READ_STEPS (idx f32 — 문서만, 기기 부여 미확인)
 */
export const ANDROID_READ_PERMISSIONS: Readonly<Record<Scope, string>> = {
  workouts: `${ANDROID_PERMISSION_PREFIX}READ_EXERCISE`,
  distance: `${ANDROID_PERMISSION_PREFIX}READ_DISTANCE`,
  activeEnergy: `${ANDROID_PERMISSION_PREFIX}READ_ACTIVE_CALORIES_BURNED`,
  elevation: `${ANDROID_PERMISSION_PREFIX}READ_ELEVATION_GAINED`,
  routes: `${ANDROID_PERMISSION_PREFIX}READ_EXERCISE_ROUTES`,
  heartRate: `${ANDROID_PERMISSION_PREFIX}READ_HEART_RATE`,
  steps: `${ANDROID_PERMISSION_PREFIX}READ_STEPS`,
};

/**
 * Health Connect WRITE 권한. `routes`만 **단수형**(`WRITE_EXERCISE_ROUTE`)이다.
 *
 * ⚠ **`[unverified]`** — WRITE_DISTANCE · WRITE_ACTIVE_CALORIES_BURNED · WRITE_ELEVATION_GAINED ·
 *   WRITE_HEART_RATE · WRITE_STEPS 5종은 Health Connect의 **문서화된 명명 규칙에서 파생**한
 *   문자열이고 Phase 0가 개별적으로 `adb shell pm grant`를 한 적이 **없다**(설계 §8.8 증거 등급,
 *   §11-24). WRITE_EXERCISE · WRITE_EXERCISE_ROUTE만 기기에서 실제로 부여됐다(f52).
 *   오타가 있으면 매니페스트 병합은 통과하고 런타임 요청만 조용히 실패한다 —
 *   설계 §9.5 기기 게이트에 문자열당 `pm grant` 한 줄씩 추가하면 몇 초에 닫힌다.
 */
export const ANDROID_WRITE_PERMISSIONS: Readonly<Record<Scope, string>> = {
  workouts: `${ANDROID_PERMISSION_PREFIX}WRITE_EXERCISE`,
  distance: `${ANDROID_PERMISSION_PREFIX}WRITE_DISTANCE`,
  activeEnergy: `${ANDROID_PERMISSION_PREFIX}WRITE_ACTIVE_CALORIES_BURNED`,
  elevation: `${ANDROID_PERMISSION_PREFIX}WRITE_ELEVATION_GAINED`,
  routes: `${ANDROID_PERMISSION_PREFIX}WRITE_EXERCISE_ROUTE`,
  heartRate: `${ANDROID_PERMISSION_PREFIX}WRITE_HEART_RATE`,
  steps: `${ANDROID_PERMISSION_PREFIX}WRITE_STEPS`,
};

/** D10. `history: true`일 때만. 기본 off가 계약이다 — 30일 벽이 기본 현실이다. */
export const ANDROID_HISTORY_PERMISSION = `${ANDROID_PERMISSION_PREFIX}READ_HEALTH_DATA_HISTORY`;

/**
 * f110 — 매니페스트 전용. 선언은 **필수**지만(미선언이면 route 요청이 조용히 null, f112)
 * 런타임 요청 집합에는 절대 들어가지 않는다. 플러그인은 선언만 담당한다.
 */
export const ANDROID_ROUTES_MANIFEST_ONLY_PERMISSION = ANDROID_READ_PERMISSIONS.routes;
