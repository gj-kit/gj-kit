import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        extends: true,
        test: {
          // 코어는 DOM 무관 — 기본 환경은 node다 (설계 문서 §5.2).
          // vi.mock·expo 모킹 0: 전 시나리오가 "./testing"의 페이크 4종으로 돈다.
          // test-purity-guard가 이 규율을 정적으로 강제한다(§5.3).
          name: 'unit',
          environment: 'node',
          include: ['tests/unit/**/*.test.ts'],
        },
      },
      {
        // 네이티브 분기(src/storage.ts)만 expo-secure-store를 vitest alias 한 개로 대체한다 —
        // 유일한 모킹 허용 지점이다 (설계 문서 §5.2 말미).
        extends: true,
        resolve: {
          alias: {
            'expo-secure-store': fileURLToPath(
              new URL('./tests/native/secure-store.fake.ts', import.meta.url),
            ),
          },
        },
        test: {
          name: 'native',
          environment: 'node',
          include: ['tests/native/**/*.test.ts'],
        },
      },
      {
        extends: true,
        test: {
          // storage.web.ts는 jsdom 프로젝트로 분리해 실제 localStorage/sessionStorage를 시험한다 (§5.2).
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
