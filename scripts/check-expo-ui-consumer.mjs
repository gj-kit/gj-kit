#!/usr/bin/env node
/**
 * Release-only consumer smoke test for the packed @gj-kit/expo-ui artifact.
 *
 * Two fresh Expo SDK 56 apps make the optional-peer boundary executable:
 * native iOS/Android deliberately omit react-native-web, while web/Node SSR
 * explicitly install it and verify both ESM and CJS imports without DOM globals.
 */
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runPackedExpoConsumerSmoke } from './check-packed-expo-consumer.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const uiDirectory = join(root, 'expo-ui');

const ssrEsmCheck = [
  '--input-type=module',
  '--eval',
  "delete globalThis.window; delete globalThis.document; const ui = await import('@gj-kit/expo-ui'); if (typeof ui.UiProvider !== 'function' || typeof ui.DataTable !== 'function') process.exit(2); if (typeof window !== 'undefined' || typeof document !== 'undefined') process.exit(3);",
];
const ssrCjsCheck = [
  '--eval',
  "delete global.window; delete global.document; const ui = require('@gj-kit/expo-ui'); if (typeof ui.UiProvider !== 'function' || typeof ui.DataTable !== 'function') process.exit(2); if (typeof window !== 'undefined' || typeof document !== 'undefined') process.exit(3);",
];

runPackedExpoConsumerSmoke({
  packageDirectory: uiDirectory,
  packageName: '@gj-kit/expo-ui',
  requiredBuildFile: 'dist/index.js',
  keepEnvironmentVariable: 'KEEP_EXPO_UI_CONSUMER_SMOKE',
  fixtures: [
    {
      name: 'native-without-react-native-web',
      fixtureDirectory: join(uiDirectory, 'tests', 'fixtures', 'expo-native-consumer'),
      placeholder: 'file:__GJ_KIT_EXPO_UI_TARBALL__',
      platforms: ['ios', 'android'],
      // pnpm must not install an optional peer just because it is declared by
      // the package. The native fixture still exercises the optional safe-area
      // entry with its explicitly installed peer.
      installArgs: ['--no-optional'],
      forbiddenInstalledPackages: ['react-native-web'],
    },
    {
      name: 'web-and-node-ssr',
      fixtureDirectory: join(uiDirectory, 'tests', 'fixtures', 'expo-web-consumer'),
      placeholder: 'file:__GJ_KIT_EXPO_UI_TARBALL__',
      platforms: ['web'],
      nodeChecks: [
        { name: 'ESM SSR import without DOM globals', args: ssrEsmCheck },
        { name: 'CJS SSR import without DOM globals', args: ssrCjsCheck },
      ],
    },
  ],
});
