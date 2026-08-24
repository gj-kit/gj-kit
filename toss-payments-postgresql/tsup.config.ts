import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/nestjs.ts', 'src/testing.ts'],
  // Nest 생태계는 CJS 프로젝트가 여전히 다수 — ESM+CJS 듀얼 필수 (형제 패키지 선례)
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  target: 'node20',
  // DB 접점은 서버 전용 — Node 런타임 전제 (설계 §1)
  platform: 'node',
  treeshake: true,
  // peer는 번들에 넣지 않는다(앱과 단일 인스턴스 공유 — 이중 로드 방지).
  // 서브패스(@gj-kit/toss-payments/server 등)까지 걸리도록 정규식 사용.
  external: [/^@nestjs\//, /^@gj-kit\/toss-payments/, 'reflect-metadata', 'rxjs'],
});
