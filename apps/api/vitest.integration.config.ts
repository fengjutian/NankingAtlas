import { join } from 'node:path';

import { defineConfig } from 'vitest/config';

/**
 * 集成测试配置（AGENTS.md §7.1：「API 权限和事务有真实数据库集成测试」）。
 *
 * 与单元测试分开的原因：
 *   1. 要真建 SQLite 库并在空库上跑 `prisma migrate deploy`（global-setup）
 *   2. 要起完整 Nest app（全局守卫 + 异常过滤器 + Prisma）
 *   3. SQLite 单写者模型下并发写会 SQLITE_BUSY，必须串行
 *
 * 数据库：SQLite（P1-01.a 起；用户决策，不再使用 PostgreSQL/PostGIS）
 */

/**
 * 集成测试的 DATABASE_URL 必须是**绝对路径**。
 *
 * Prisma 5 把 SQLite `file:` 相对路径解析到 **schema.prisma 所在目录**
 * （`packages/database/prisma`），而不是进程 cwd。相对路径会指向
 * `packages/database/prisma/prisma-test/integration.db`，而 global-setup
 * 建库用的是 `apps/api/prisma-test/integration.db`，两者不一致 →
 * `Error code 14: Unable to open the database file`。
 */
const integrationDatabaseUrl = (() => {
  const abs = join(process.cwd(), 'prisma-test', 'integration.db').replace(/\\/gu, '/');
  return `file:${abs}`;
})();

export default defineConfig({
  // esbuild 需要显式开启 emitDecoratorMetadata，否则 Nest 的构造函数注入
  // 在测试环境下拿不到 design:paramtypes，表现为 `this.xxx === undefined`
  // 的运行时 500（tsc 侧由 apps/api/tsconfig.json 的 emitDecoratorMetadata 保证）。
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
    include: ['src/**/*.integration.spec.ts'],
    globalSetup: ['./test/global-setup.ts'],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
    env: {
      APP_ENV: 'test',
      NODE_ENV: 'test',
      // 故意开 debug：失败时 GlobalExceptionFilter 会把 5xx 堆栈打进日志，
      // 这是排查"500 INTERNAL_ERROR 但看不到原因"的唯一途径。
      LOG_LEVEL: 'debug',
      REQUEST_ID_HEADER: 'x-request-id',
      DATABASE_URL: integrationDatabaseUrl,
      AUTH_ACCESS_SECRET: 'test-access-secret-value-long-enough-over-32b',
      AUTH_REFRESH_SECRET: 'test-refresh-secret-value-long-enough-over-32b',
      // 集成测试里所有登录用例共享 127.0.0.1，固定 5 次/分钟会被前面的
      // 用例吃光配额。测试放宽到 1000；生产默认仍是 5（见 .env.example）。
      AUTH_LOGIN_RATE_LIMIT: '1000',
    },
  },
});
