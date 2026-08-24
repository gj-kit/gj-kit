import { defineConfig } from 'tsup';

export default defineConfig({
  // 서브패스 4종 (설계 §2.1): `.`(Nest 어댑터) · `./core`(프레임워크·전송 free 파이프라인)
  // · `./expo`(Expo 지식, SDK 무의존) · `./testing`(인메모리 저장소·적합성 케이스).
  entry: ['src/index.ts', 'src/core.ts', 'src/expo.ts', 'src/testing.ts'],
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
  // dist/core.*·dist/expo.*가 실제로 peer/전송을 참조하지 않는지는 external 설정이 아니라
  // tests/unit/guards/peer-graph.test.ts와 transport-free-core.test.ts가 산출물 문자열로 본다.
});
