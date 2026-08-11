import { defineConfig, type Options } from 'tsup';

type BuildPlatform = 'native' | 'web';

const nativeExtensions = [
  '.native.tsx',
  '.native.ts',
  '.native.jsx',
  '.native.js',
  '.tsx',
  '.ts',
  '.jsx',
  '.js',
  '.json',
];

const webExtensions = [
  '.web.tsx',
  '.web.ts',
  '.web.jsx',
  '.web.js',
  '.tsx',
  '.ts',
  '.jsx',
  '.js',
  '.json',
];

function platformResolutionGuard(platform: BuildPlatform): NonNullable<Options['esbuildPlugins']>[number] {
  return {
    name: `guard-${platform}-resolution`,
    setup(build) {
      build.onEnd((result) => {
        const candidates = Object.keys(result.metafile?.inputs ?? {}).filter((input) =>
          /platform-resolution(?:\.(?:native|web))?\.ts$/.test(input),
        );
        const suffix = `platform-resolution.${platform}.ts`;
        if (candidates.length !== 1 || !candidates[0]?.endsWith(suffix)) {
          throw new Error(
            `${platform} build resolved ${candidates.join(', ') || 'no platform marker'}; expected ${suffix}`,
          );
        }
      });
    },
  };
}

function externalReactNativeWeb(): NonNullable<Options['esbuildPlugins']>[number] {
  return {
    name: 'external-react-native-web',
    setup(build) {
      build.onResolve({ filter: /^react-native$/ }, () => ({
        path: 'react-native-web',
        external: true,
      }));
    },
  };
}

const common = {
  format: ['esm', 'cjs'],
  sourcemap: true,
  target: 'es2022',
  treeshake: true,
  splitting: true,
  // react/react-native/safe-area-context/react-native-web은 peer이며 번들에 포함하지 않는다.
  platform: 'neutral',
} satisfies Options;

const nativeConfig = {
  ...common,
  name: 'native',
  // 기존 공개 엔트리 4개. 루트는 React Native 및 조건 미지원 번들러의 기본값이다.
  entry: ['src/index.ts', 'src/theme.ts', 'src/insets.ts', 'src/tailwind.ts'],
  dts: true,
  clean: true,
  banner: { js: '/* @gj-kit/expo-ui build: native */' },
  esbuildPlugins: [platformResolutionGuard('native')],
  esbuildOptions(options) {
    options.resolveExtensions = nativeExtensions;
  },
} satisfies Options;

const webConfig = {
  ...common,
  name: 'web',
  // 공개 서브패스를 늘리지 않는 browser·Node SSR용 조건 타깃.
  entry: ['src/index.web.ts'],
  // 공개 타입은 index.shared에서 하나로 관리하며 모든 조건이 native build의 같은
  // index.d.ts/index.d.cts를 선택한다. 별도 web 선언을 만들지 않는다.
  dts: false,
  clean: false,
  banner: { js: '/* @gj-kit/expo-ui build: web */' },
  // react-native는 peer라 tsup이 먼저 external 처리한다. noExternal로 그 결정을
  // 넘긴 뒤 플러그인이 bare specifier를 optional peer인 react-native-web으로 바꾼다.
  noExternal: ['react-native'],
  esbuildPlugins: [platformResolutionGuard('web'), externalReactNativeWeb()],
  esbuildOptions(options) {
    options.resolveExtensions = webExtensions;
  },
} satisfies Options;

export default defineConfig((options) => {
  const target = options.env?.BUILD_TARGET;
  if (target === 'native') return nativeConfig;
  if (target === 'web') return webConfig;
  throw new Error('BUILD_TARGET must be native or web; run the package build script.');
});
