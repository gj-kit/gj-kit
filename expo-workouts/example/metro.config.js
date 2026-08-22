// Learn more: https://docs.expo.dev/guides/customizing-metro/
//
// The library is consumed by relative path (`"@gj-kit/expo-workouts": "file:.."`), the
// create-expo-module convention, so `node_modules/@gj-kit/expo-workouts` is a SYMLINK to the
// package root. Two consequences, both handled here:
//
//  1. That package root has its OWN pnpm `node_modules` carrying the **SDK 56** devDependency
//     copies of `expo`, `expo-modules-core`, `react` and `react-native`. Resolving any of them
//     would put two copies of Expo in one bundle. The whole directory is blocked, and the app's
//     own `node_modules` is the only search path.
//  2. Metro has to watch the package root, or an edit to the library's `dist/` never reaches
//     Fast Refresh.
//
// The library declares ZERO runtime dependencies, so nothing legitimate is lost by blocking it.
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const libraryRoot = path.resolve(__dirname, '..');
const config = getDefaultConfig(__dirname);

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const libraryNodeModules = path.join(libraryRoot, 'node_modules');

config.resolver.blockList = [
  ...Array.from(config.resolver.blockList ?? []),
  new RegExp(`^${escapeRegExp(libraryNodeModules)}(${escapeRegExp(path.sep)}.*)?$`),
];

config.resolver.nodeModulesPaths = [path.resolve(__dirname, 'node_modules')];
config.watchFolders = [libraryRoot];

module.exports = config;
