import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/core.ts', 'src/testing.ts'],
  // Nest 생태계는 CJS 프로젝트가 여전히 다수 — ESM+CJS 듀얼 필수.
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  target: 'node20',
  platform: 'node',
  treeshake: true,
  // peer는 번들에 넣지 않는다 — 앱과 단일 인스턴스 공유(이중 로드 방지, 형제 동일).
  external: [/^@nestjs\//, 'reflect-metadata', 'rxjs'],
  // dist/core.* 가 실제로 peer를 참조하지 않는지는 external 설정이 아니라
  // tests/unit/guards/peer-graph.test.ts가 산출물 문자열로 확인한다.
});
