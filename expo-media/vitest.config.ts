import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        extends: true,
        test: {
          // 코어는 DOM 무관 — 기본 환경은 node다 (설계 문서 §10.1).
          // expo·react-native 모킹 0: "./testing"의 인메모리 어댑터만으로
          // 전 파이프라인(pick → stat → hash → intent → PUT → complete → cleanup)을 돈다.
          // test-purity-guard가 이 규율을 정적으로 강제한다(§10.3).
          name: 'unit',
          environment: 'node',
          include: ['tests/unit/**/*.test.ts'],
        },
      },
      {
        extends: true,
        test: {
          // src/web/** 테스트만 jsdom으로 분리 (§10.1).
          name: 'web',
          environment: 'jsdom',
          include: ['tests/web/**/*.test.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'types',
          include: ['tests/types/**/*.test-d.ts'],
          typecheck: {
            enabled: true,
            only: true,
            include: ['tests/types/**/*.test-d.ts'],
            tsconfig: './tsconfig.tests.json',
          },
        },
      },
    ],
  },
});
