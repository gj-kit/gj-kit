import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  // Nest 생태계는 CJS 프로젝트가 여전히 다수 — ESM+CJS 듀얼 필수 (설계 §4.1)
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  target: 'node20',
  // 코어와 달리 Node 전용 패키지 — Nest 자체가 Node 런타임 전제
  platform: 'node',
  treeshake: true,
  // peer는 번들에 넣지 않는다(앱과 단일 인스턴스 공유 — 이중 로드 방지, 설계 §4.1).
  // 서브패스(@gj-kit/toss-payments/server 등)까지 걸리도록 정규식 사용.
  external: [/^@nestjs\//, /^@gj-kit\/toss-payments/, 'reflect-metadata', 'rxjs'],
});
