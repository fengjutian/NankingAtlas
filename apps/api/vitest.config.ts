import { defineConfig } from 'vitest/config';

export default defineConfig({
  // esbuild 需要显式开启 emitDecoratorMetadata，否则 Nest 的构造函数注入
  // 在测试环境下拿不到 design:paramtypes，表现为 `this.xxx === undefined` 的
  // 运行时 500（tsc 侧由 apps/api/tsconfig.json 的 emitDecoratorMetadata 保证）。
  esbuild: {
    target: 'es2022',
    tsconfigRaw: {
      compilerOptions: {
        experimentalDecorators: true,
        emitDecoratorMetadata: true,
      },
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    // 默认注入一组最小可用的环境变量，避免 env 校验模块在测试加载时抛错
    env: {
      APP_ENV: 'test',
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
      REQUEST_ID_HEADER: 'x-request-id',
      // 占位 SQLite 文件：单测不需要真建文件；集成测试时另写迁移脚本。
      DATABASE_URL: 'file:../packages/database/prisma/test.db',
      AUTH_ACCESS_SECRET: 'test-access-secret-value-long-enough-over-32b',
      AUTH_REFRESH_SECRET: 'test-refresh-secret-value-long-enough-over-32b',
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