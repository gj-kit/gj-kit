import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'integration',
    include: ['tests/integration/**/*.integration.test.ts'],
    // 실 PostgreSQL 공유(루트 .env TOSS_PG_TEST_DATABASE_URL) — 스키마 격리·advisory lock
    // 경합이 파일 간에 얽히지 않도록 반드시 직렬 실행 (설계 §8)
    fileParallelism: false,
    testTimeout: 30_000,
    setupFiles: ['tests/integration/setup.ts'],
  },
});
