import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          include: ['tests/unit/**/*.test.ts'],
        },
      },
      {
        test: {
          name: 'types',
          include: ['tests/types/**/*.test-d.ts'],
          typecheck: {
            enabled: true,
            only: true,
            include: ['tests/types/**/*.test-d.ts'],
            tsconfig: 'tsconfig.tests.json',
          },
        },
      },
    ],
  },
});
