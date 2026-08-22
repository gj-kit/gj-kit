#!/usr/bin/env node
/**
 * Release-only consumer smoke test for the packed @gj-kit/expo-workouts artifact.
 *
 * This package publishes more than an export map: autolinking reads
 * `expo-module.config.json`, prebuild reads `app.plugin.js`, and the `node` /
 * `browser` fork exists so a web bundle, an `app.config.ts`, or a Node test
 * runner can import the package without `expo` ever being loaded. None of that
 * is observable from the workspace source tree, so the shared harness hands the
 * real npm tarball to clean Expo SDK 56 and 57 apps and asks the actual tools:
 *
 *   (a) Metro exports web with the native branch absent,
 *   (b) `expo-modules-autolinking resolve` discovers the module for apple and
 *       android from the packed layout,
 *   (c) `expo config --type introspect` shows the config plugin's entitlement,
 *       Info.plist and AndroidManifest output,
 *   (d) `app.plugin.js` loads under the packed layout — T9, which Phase 0 never
 *       ran. `tests/unit/guards/packaging-guards.test.ts` is the first gate for
 *       it; this is the second, and the only one that sees a real install.
 *
 * It stays out of `pnpm test` because it installs two Expo SDKs and takes
 * minutes rather than milliseconds.
 */
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runPackedExpoConsumerSmoke } from './check-packed-expo-consumer.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const workoutsDirectory = join(root, 'expo-workouts');

const fixture = (name, directory) => ({
  name,
  fixtureDirectory: join(workoutsDirectory, 'tests', 'fixtures', directory),
  placeholder: 'file:__GJ_KIT_EXPO_WORKOUTS_TARBALL__',
  platforms: ['web', 'ios', 'android'],
  // (a) The web bundle must not carry the native branch. Its unique runtime
  // boundary is `requireOptionalNativeModule`; the module name itself also
  // occurs in the public config-plugin guidance (`withGjKitWorkouts`), so it is
  // not a valid branch sentinel. Native SDK bundles are Hermes bytecode, so
  // text-searching those would be a false negative — successful Metro
  // resolution is the native-branch proof there.
  forbiddenBundleText: { web: ['requireOptionalNativeModule'] },
  // (b) Importing the package specifier under plain Node must not throw, and
  // all twelve members must settle as `unavailable`.
  nodeChecks: [{ name: 'import safety', args: ['./checks/import-safety.cjs'] }],
  commandChecks: [
    {
      name: 'autolinking (apple)',
      command: 'npx',
      args: ['expo-modules-autolinking', 'resolve', '--platform', 'apple', '--json'],
      expect: '@gj-kit/expo-workouts',
    },
    {
      name: 'autolinking (apple) sees the module class',
      command: 'npx',
      args: ['expo-modules-autolinking', 'resolve', '--platform', 'apple', '--json'],
      expect: 'GjKitWorkoutsModule',
    },
    {
      name: 'autolinking (android)',
      command: 'npx',
      args: ['expo-modules-autolinking', 'resolve', '--platform', 'android', '--json'],
      expect: 'kit.gj.workouts',
    },
    {
      name: 'introspect: entitlement',
      command: 'npx',
      args: ['expo', 'config', '--type', 'introspect'],
      expect: 'com.apple.developer.healthkit',
    },
    {
      name: 'introspect: Info.plist usage string',
      command: 'npx',
      args: ['expo', 'config', '--type', 'introspect'],
      expect: 'NSHealthShareUsageDescription',
    },
    {
      name: 'introspect: route permission',
      command: 'npx',
      args: ['expo', 'config', '--type', 'introspect'],
      expect: 'android.permission.health.READ_EXERCISE_ROUTES',
    },
    {
      name: 'introspect: rationale alias',
      command: 'npx',
      args: ['expo', 'config', '--type', 'introspect'],
      expect: 'android.intent.action.VIEW_PERMISSION_USAGE',
    },
    // (d) T9. Phase 0 never ran it; a wrong `type` field or a missing
    // `plugin/build` would only surface in a consumer's prebuild.
    {
      name: 'T9: app.plugin.js loads from the packed layout',
      command: 'node',
      args: [
        '-e',
        "const p = require('@gj-kit/expo-workouts/app.plugin.js'); if (typeof p !== 'function' && typeof p?.default !== 'function') { console.error('app.plugin.js exported ' + typeof p); process.exit(1); } console.log('T9 ok');",
      ],
      expect: 'T9 ok',
    },
  ],
});

runPackedExpoConsumerSmoke({
  packageDirectory: workoutsDirectory,
  packageName: '@gj-kit/expo-workouts',
  requiredBuildFile: 'dist/index.js',
  keepEnvironmentVariable: 'KEEP_EXPO_WORKOUTS_CONSUMER_SMOKE',
  fixtures: [fixture('expo-sdk-56', 'expo-consumer'), fixture('expo-sdk-57', 'expo-consumer-57')],
});
