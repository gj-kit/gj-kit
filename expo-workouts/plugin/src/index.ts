// ═══════════════ config plugin — `withGjKitWorkouts` (설계 §7) ═══════════════
//
// 분할 규칙 (§7.1): **introspect 스냅샷이 증명해야 하는 것은 전부 이 플러그인이 쓴다.**
// 라이브러리 자신의 `AndroidManifest.xml`에 놓인 항목은 Gradle 병합 시점에는 합쳐지지만
// `expo config --type introspect`에는 보이지 않는다(idx f10). 릴리스 게이트가 못 보는 자리에
// 둔 것은 어떤 CI도 지키지 못한다. 그래서 라이브러리 매니페스트에는
// `PermissionUsageActivity` **하나만** 남고, 나머지 전부가 여기서 나온다.
//
// 이 플러그인이 등록하는 mod는 정확히 3개다 — `ios.entitlements` · `ios.infoPlist` ·
// `android.manifest`. gradle 계열 mod와 dangerous mod는 **하나도** 없다. 그것이 D7
// ("플러그인은 minSdk를 건드리지 않는다")의 관측 가능한 형태이고,
// `plugin/__tests__/no-forbidden-mutations.test.ts`가 그 집합을 단언한다.
//
// `createRunOncePlugin`을 **쓰지 않는다**: 모든 mod가 멱등하게(권한은 이름으로 dedupe,
// alias는 이름으로 upsert, meta-data는 expo 헬퍼가 dedupe) 작성돼 있어서 두 번 적용돼도
// 결과가 같다. run-once 래퍼는 `_internal.pluginHistory`에 의존하는데, 그 상태가 없는
// 호출 경로(우리 스냅샷 테스트 포함)를 굳이 만들 이유가 없다.

import type { ConfigPlugin } from 'expo/config-plugins';

import { resolveProps, type GjKitWorkoutsPluginProps } from './props';
import { withGjKitWorkoutsAndroid } from './withGjKitWorkoutsAndroid';
import { withGjKitWorkoutsIos } from './withGjKitWorkoutsIos';

/**
 * ```json
 * {
 *   "plugins": [
 *     ["@gj-kit/expo-workouts", {
 *       "privacyPolicyUrl": "https://example.com/privacy",
 *       "read": ["workouts", "distance", "activeEnergy", "elevation", "routes"],
 *       "write": ["workouts", "routes"]
 *     }]
 *   ]
 * }
 * ```
 *
 * ⚠ `read: ['workouts']`는 `<uses-permission android:name="…READ_EXERCISE">` **한 줄만** 낸다
 *   (소유자 결정 ②). 총합까지 원하면 네 멤버를 다 적거나, `app.config.ts`에서
 *   `WORKOUT_TOTALS_SCOPES`(`@gj-kit/expo-workouts/core`, peer 0)를 펼쳐 쓴다.
 */
export const withGjKitWorkouts: ConfigPlugin<GjKitWorkoutsPluginProps> = (config, props) => {
  // 검증은 mod **바깥**에서, 즉 `app.config.ts` 평가 직후에 한 번만 한다 — mod 안에서 던지면
  // 에러가 `[android.manifest]: …`로 감싸여 원인이 흐려진다.
  const resolved = resolveProps(props);
  config = withGjKitWorkoutsIos(config, resolved);
  config = withGjKitWorkoutsAndroid(config, resolved);
  return config;
};

export type { GjKitWorkoutsPluginProps } from './props';
export { SCOPES, type Scope } from './scopes';

export default withGjKitWorkouts;
