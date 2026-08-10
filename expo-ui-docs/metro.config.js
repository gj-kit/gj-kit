const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// expo-ui는 워크스페이스 패키지다. 문서 앱과 패키지가 같은 React Native 사본을
// 사용하도록 루트 node_modules를 함께 해석한다.
config.watchFolders = [path.resolve(__dirname, '..')];
config.resolver.nodeModulesPaths = [
  path.resolve(__dirname, 'node_modules'),
  path.resolve(__dirname, '../node_modules'),
];
config.resolver.extraNodeModules = {
  react: path.resolve(__dirname, 'node_modules/react'),
  'react-dom': path.resolve(__dirname, 'node_modules/react-dom'),
  'react-native': path.resolve(__dirname, 'node_modules/react-native'),
  'react-native-web': path.resolve(__dirname, 'node_modules/react-native-web'),
};

module.exports = config;
