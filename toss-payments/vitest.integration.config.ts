import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'integration',
    include: ['tests/integration/**/*.integration.test.ts'],
    // 토스 테스트 환경 분당 100건 제한 — 반드시 직렬 실행
    fileParallelism: false,
    testTimeout: 30_000,
    setupFiles: ['tests/integration/setup.ts'],
  },
});
