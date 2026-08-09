import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'integration',
    include: ['tests/integration/**/*.integration.test.ts'],
    // 토스 테스트 환경 분당 100건 제한 — 반드시 직렬 실행
    fileParallelism: false,
    // 골격 단계: 통합 테스트 파일이 아직 없음 — Phase 3에서 테스트 추가 후 이 옵션 제거
    passWithNoTests: true,
    testTimeout: 30_000,
    setupFiles: ['tests/integration/setup.ts'],
  },
});
