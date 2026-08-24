import { defineConfig } from 'tsup';

export default defineConfig({
  // 엔트리 4 = 공개 서브패스 3 + 비네이티브 조건 포크 1 (설계 문서 §2.1 개수 정본).
  // 포크(storage.web)는 서브패스가 아니다 — package.json exports의 node/browser 조건이
  // 같은 `./storage` 서브패스를 두 파일로 라우팅한다(§2.3).
  entry: ['src/index.ts', 'src/storage.ts', 'src/storage.web.ts', 'src/testing.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  target: 'es2022',
  treeshake: true,
  platform: 'neutral',
  // 엔트리 자기완결 (expo-media §0.4 기각 10 계승) — 코드 스플리팅이 만드는 확장자 포함
  // chunk import는 플랫폼 포크를 무력화하고 dist-peer-graph 검사를 복잡하게 만든다.
  // 대가(엔트리마다 코어 복제)는 AuthError의 Symbol.for 태그가 상쇄한다(§3.7).
  splitting: false,
  external: ['expo-secure-store'],
});
