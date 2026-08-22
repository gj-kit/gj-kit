// `"./plugin"` — 1심볼 (설계 §5.5).
//
// `ConfigPlugin`은 **일부러 재export하지 않는다**: `expo`를 설치하지 않은 저장소에서도
// `app.config.ts`가 타입 체크되어야 한다. peer 0 · DOM 0.

import type { Scope } from './core/types';

export interface GjKitWorkoutsPluginProps {
  /**
   * The scopes this app will ever ask for. Drives the iOS entitlement and every Android
   * `<uses-permission>` line. `'routes'` in either list additionally emits the manifest-only
   * READ_EXERCISE_ROUTES entry, which is MANDATORY: undeclared, route requests silently return
   * nothing with no error at all.
   *
   * ⚠ Since owner decision ② the vocabulary is SEVEN scopes and `'workouts'` means the session
   *   ALONE. `read: ['workouts']` in `app.json` now emits ONE `<uses-permission>` line instead of
   *   four, and the failure shows up at runtime as `undefined` totals — far from the file that
   *   caused it. For the old (coarse) behaviour write the four members out, or import
   *   `WORKOUT_TOTALS_SCOPES` from `@gj-kit/expo-workouts/core` in an `app.config.ts`.
   *   `./core` has zero peers, so importing it from a config file is safe.
   */
  readonly read?: readonly Scope[] | undefined;
  readonly write?: readonly Scope[] | undefined;
  /** D10. Adds READ_HEALTH_DATA_HISTORY. Default false — the 30-day wall is the default reality. */
  readonly history?: boolean | undefined;
  /**
   * REQUIRED. Android 14+ launches `VIEW_PERMISSION_USAGE` + category `HEALTH_PERMISSIONS` at the
   * app when the user taps "privacy policy" in the permission dialog, and the activity-alias this
   * plugin registers needs somewhere to go. A dead link there is a user-visible defect, and Play's
   * Health apps declaration requires a policy URL anyway — so this is not optional.
   */
  readonly privacyPolicyUrl: string;
  readonly ios?:
    | {
        /**
         * NSHealthShareUsageDescription. An English default is supplied; localise via
         * `ios.infoPlist`/locales.
         * ⚠ A missing usage string CRASHES at `requestAuthorization` — the plugin makes that
         *   unreachable.
         */
        readonly shareUsageDescription?: string | undefined;
        /** NSHealthUpdateUsageDescription. */
        readonly updateUsageDescription?: string | undefined;
      }
    | undefined;
}
