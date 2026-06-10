import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    // Only pure-logic units are unit-tested; React components + Tauri-backed
    // db/ai layers are covered by typecheck + manual in-app verification.
    include: ['src/**/*.test.ts'],
  },
});
