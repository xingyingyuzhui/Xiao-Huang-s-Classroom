import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    coverage: {
      include: ['src/**'],
      exclude: ['dist/**', 'coverage/**', 'test/**', '**/*.config.*'],
      thresholds: {
        branches: 90,
        statements: 90,
      },
    },
  },
});
