import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    // unit 테스트는 react-native-web으로 렌더한다 (설계 문서 §9).
    // 네이티브 렌더러 특유 동작은 소비 앱(jest-expo)이 간접 보완 — §12 잔존 리스크 2.
    alias: {
      'react-native': 'react-native-web',
    },
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          environment: 'jsdom',
          // globals — @testing-library/react의 afterEach auto-cleanup 등록에 필요
          // (누락 시 테스트 간 DOM 누적으로 오탐 — 테스트 작성 단계 실측).
          globals: true,
          // reduce-motion 플랫폼 응답을 결정적 pending으로 고정 — setup.ts 참고.
          setupFiles: ['tests/unit/setup.ts'],
          include: ['tests/unit/**/*.test.{ts,tsx}'],
        },
      },
      {
        extends: true,
        test: {
          name: 'types',
          include: ['tests/types/**/*.test-d.{ts,tsx}'],
          typecheck: {
            enabled: true,
            only: true,
            include: ['tests/types/**/*.test-d.{ts,tsx}'],
            tsconfig: './tsconfig.tests.json',
          },
        },
      },
    ],
  },
});
