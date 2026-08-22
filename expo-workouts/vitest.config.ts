import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        extends: true,
        test: {
          // `expo`·`react-native` 모킹 0 (설계 §9.1). `./testing`의 **네이티브 seam 페이크**만으로
          // 파이프라인을 돈다 — 페이크 위에서 도는 것은 `src/core/api.ts`의 진짜 코드다.
          name: 'unit',
          environment: 'node',
          include: ['tests/unit/**/*.test.ts'],
        },
      },
      {
        extends: true,
        test: {
          // 네이티브 seam 계약 테스트 — DTO 모양과 페이크의 전수 구현을 단언한다.
          name: 'native',
          environment: 'node',
          include: ['tests/native/**/*.test.ts'],
        },
      },
      {
        extends: true,
        test: {
          // config plugin introspect 스냅샷 (설계 §7.3). `expo/config-plugins`를 **실제로** 부른다 —
          // 여기서만 peer를 쓰며, 그것이 `plugin/`이 라이브러리 소스와 분리돼 있는 이유다.
          name: 'plugin',
          environment: 'node',
          include: ['plugin/__tests__/**/*.test.ts'],
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
