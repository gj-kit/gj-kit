import { defineConfig } from 'tsup';

export default defineConfig({
  // 공개 서브패스 4 (`.` · `./core` · `./testing` · `./plugin`) + `.`의 조건 포크 1.
  //
  // ⚠ 설계 §2.1은 "tsup 엔트리 = 4, `./plugin`은 tsc(CJS)가 만든다"라고 적었지만, 같은 문서의
  //   §2.3 exports 맵은 `./plugin`에 `dist/plugin.mjs`·`dist/plugin.d.mts`(= 듀얼 포맷 + 모든
  //   조건 브랜치의 `types`)를 요구한다. tsc 한 번으로는 그 네 산출물이 나오지 않고,
  //   `src/plugin-types.ts`가 `./core/types`의 `Scope`를 참조하므로 손으로 쓴 d.ts는 표류한다.
  //   그래서 `./plugin`도 tsup 엔트리로 둔다 — exports 규칙 3(모든 브랜치에 `types`)이
  //   엔트리 개수보다 우선한다. `plugin/`(config plugin 구현)은 여전히 tsc(CJS)가 만든다.
  entry: {
    index: 'src/index.ts',
    'index.unsupported': 'src/index.unsupported.ts',
    core: 'src/core.ts',
    testing: 'src/testing.ts',
    plugin: 'src/plugin-types.ts',
  },
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  target: 'es2022',
  treeshake: true,
  platform: 'neutral',
  // 엔트리 자기완결 = `dist-peer-graph`가 볼 그래프가 단순해진다(설계 §2.4-C).
  // 대가로 `instanceof WorkoutsError`가 엔트리 간에 깨지며, 그것을 `Symbol.for` 태그가 상쇄한다.
  splitting: false,
  external: ['expo', 'expo-modules-core', 'react-native'],
});
