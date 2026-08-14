import { defineConfig } from 'tsup';

export default defineConfig({
  // 엔트리 11 = 공개 서브패스 9 + 비네이티브 조건 포크 2.
  // 포크(.web)는 서브패스가 아니다 — package.json exports의 node/browser 조건이
  // 같은 서브패스를 두 파일로 라우팅한다(§8).
  entry: [
    'src/core.ts',
    'src/index.ts',
    'src/picker.ts',
    'src/device.ts',
    'src/device.web.ts',
    'src/save.ts',
    'src/save.web.ts',
    'src/video.ts',
    'src/web.ts',
    'src/testing.ts',
    'src/storage.ts',
  ],
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  target: 'es2022',
  treeshake: true,
  platform: 'neutral',
  // §0.4 기각 10 — 엔트리 자기완결. 코드 스플리팅이 만드는 확장자 포함 chunk import는
  // 플랫폼 포크를 무력화하고(§8.2 케이스 B) dist-peer-graph 검사도 복잡하게 만든다.
  // 대가(엔트리마다 코어 복제)는 MediaError의 Symbol.for 태그가 상쇄한다(§5.2).
  splitting: false,
  external: [/^expo-/, 'react-native'],
  // dts.compilerOptions는 쓰지 않는다 — tsup 8.5.1이 지원은 하나(§2.4 후보 (d) 실측)
  // 산출물이 (a)와 동일하면서 typecheck용 tsconfig만 하나 더 늘어난다.
});
