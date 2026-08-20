#!/usr/bin/env node
/**
 * Release-only Metro smoke test for the packed @gj-kit/expo-media artifact.
 *
 * The shared harness hands the actual npm tarball to clean Expo SDK 56 and 57
 * apps, so Metro resolves web/iOS/Android conditions instead of this
 * repository's workspace source. This remains separate from ordinary unit
 * tests because it installs Expo and takes minutes rather than milliseconds.
 */
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runPackedExpoConsumerSmoke } from './check-packed-expo-consumer.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const mediaDirectory = join(root, 'expo-media');

runPackedExpoConsumerSmoke({
  packageDirectory: mediaDirectory,
  packageName: '@gj-kit/expo-media',
  requiredBuildFile: 'dist/index.js',
  keepEnvironmentVariable: 'KEEP_EXPO_MEDIA_CONSUMER_SMOKE',
  fixtures: [
    {
      name: 'expo-sdk-56',
      fixtureDirectory: join(mediaDirectory, 'tests', 'fixtures', 'expo-consumer'),
      placeholder: 'file:__GJ_KIT_EXPO_MEDIA_TARBALL__',
      platforms: ['web', 'ios', 'android'],
      // Native SDK 56 exports are Hermes bytecode, so text-searching their
      // bundle would be a false negative. Successful Metro resolution above is
      // the native branch proof; web remains readable and must not pull in the
      // device-only media-library peer.
      forbiddenBundleText: { web: ['expo-media-library'] },
    },
    {
      name: 'expo-sdk-57',
      fixtureDirectory: join(mediaDirectory, 'tests', 'fixtures', 'expo-consumer-57'),
      placeholder: 'file:__GJ_KIT_EXPO_MEDIA_TARBALL__',
      platforms: ['web', 'ios', 'android'],
      forbiddenBundleText: { web: ['expo-media-library'] },
    },
  ],
});
