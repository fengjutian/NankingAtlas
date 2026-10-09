import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    // 默认注入一组最小可用的环境变量，避免 env 校验模块在测试加载时抛错
    env: {
      APP_ENV: 'test',
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
      REQUEST_ID_HEADER: 'x-request-id',
      // 占位连接串：单测不需要真连库；集成测试时另写 docker compose + 单独 suite。
      DATABASE_URL:
        'postgresql://nanking_atlas:nanking_atlas@localhost:5432/nanking_atlas_test?schema=public',
    },
    coverage: {
      reporter: ['text', 'html'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.{test,spec}.{ts,tsx}'],
    },
  },
  resolve: {
    alias: {
      '@': new URL('./src', import.meta.url).pathname,
    },
  },
});
