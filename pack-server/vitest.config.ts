import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    env: {
      NODE_ENV: 'test',
    },
    // Run test files sequentially to avoid DB conflicts
    fileParallelism: false,
  },
});
