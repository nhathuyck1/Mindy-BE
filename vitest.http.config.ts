import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { environment: 'node', include: ['test/http/**/*.spec.ts'], testTimeout: 20000 },
});
