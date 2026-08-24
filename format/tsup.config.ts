import { defineConfig } from 'tsup';

export default defineConfig({
  // 단일 '.' 엔트리 — 서브패스 분리를 정당화하는 세 조건(optional peer 격리 · 플랫폼 조건
  // 포크 · 무거운 선택 표면)이 전부 없다 (설계 문서 §2.1).
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  // 형제 패키지 동일 — Expo 소비자는 Metro/babel이 node_modules를 변환한다.
  target: 'es2022',
  // peer 0 · Node/DOM API 0 — admin(브라우저/RNW) · mobile(Hermes) · 서버(Node)가
  // 같은 산출물을 소비한다.
  platform: 'neutral',
  treeshake: true,
});
