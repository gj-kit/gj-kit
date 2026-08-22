import type { ExpoConfig } from 'expo/config';
// `./plugin` is the TYPES-only subpath: zero peers, so importing it from a config file that runs
// under plain Node (before Metro exists) is safe. The plugin ITSELF is applied by module name in
// `plugins` below — Expo resolves `@gj-kit/expo-workouts` to the package's `app.plugin.js`, which
// re-exports `withGjKitWorkouts` from `plugin/build`.
import type { GjKitWorkoutsPluginProps } from '@gj-kit/expo-workouts/plugin';
// `./core` is also peer-free, so the coarse-recipe constant is importable here. This is the recipe
// the README documents: `'workouts'` alone is the SESSION ONLY — it does not include totals.
import { WORKOUT_TOTALS_SCOPES } from '@gj-kit/expo-workouts/core';

const workoutsProps: GjKitWorkoutsPluginProps = {
  read: [...WORKOUT_TOTALS_SCOPES, 'routes', 'heartRate', 'steps'],
  write: [...WORKOUT_TOTALS_SCOPES, 'routes', 'heartRate', 'steps'],
  history: true,
  privacyPolicyUrl: 'https://gj-kit.example/privacy',
  ios: {
    shareUsageDescription:
      'This example app reads your workouts and routes so it can demonstrate @gj-kit/expo-workouts.',
    updateUsageDescription:
      'This example app writes a demo workout so it can demonstrate @gj-kit/expo-workouts.',
  },
};

const config: ExpoConfig = {
  name: 'gj-kit workouts example',
  slug: 'gj-kit-expo-workouts-example',
  version: '0.1.0',
  orientation: 'portrait',
  userInterfaceStyle: 'light',
  ios: {
    bundleIdentifier: 'kit.gj.workouts.example',
    supportsTablet: false,
  },
  android: {
    package: 'kit.gj.workouts.example',
  },
  plugins: [
    // The library's `android/build.gradle` sets `minSdk 26` (Health Connect's floor), and design
    // decision D7 says the config plugin must NOT silently raise a consumer's `minSdkVersion` —
    // so raising it is the CONSUMER's job, and this is what that looks like. Without it the build
    // fails at manifest-merge with:
    //   uses-sdk:minSdkVersion 24 cannot be smaller than version 26 declared in library
    //   [:gj-kit-expo-workouts] … as the library might be using APIs not available in 24
    ['expo-build-properties', { android: { minSdkVersion: 26 } }],
    ['@gj-kit/expo-workouts', workoutsProps],
  ],
};

export default config;
