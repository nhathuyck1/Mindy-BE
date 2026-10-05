import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.spec.ts', 'test/**/*.spec.ts'],
    exclude: ['test/http/**'],
    clearMocks: true,
    restoreMocks: true,
    // Avoid partial shared-module evaluation in parallel Windows integration suites.
    // Concurrency within each business test still runs through Promise.all.
    fileParallelism: false,
  },
});
