/**
 * 数据库 seed 入口（P1-01.b 占位）。
 *
 * 设计原则（AGENTS.md §3.5 / TECHNICAL_IMPLEMENTATION.md §14）：
 *   - seed 必须**幂等**：每次执行结果一致；多次跑不创建重复行。
 *   - 仅含**安全的演示数据**：所有示例内容必须显式标记"示例 / 待核验"，
 *     不得自动发布到生产（实际由环境变量 + 业务守卫把关）。
 *   - 当前阶段（schema 已建但 P1-02 之前业务表暂无任何数据）不插入任何行；
 *     保留入口供 P1-02 users/roles 落地后接入示例账户与示例 content。
 *
 * 执行方式：
 *   pnpm --filter @nanking-atlas/database seed
 *
 * 等价于：DATABASE_URL=file:./prisma/dev.db tsx prisma/seed.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  // 故意为空：P1-02 起按 users / roles / contents 等模块逐个写入示例数据。
  // 此处保留可被 Prisma seed / CI 调用的稳定入口。
  // eslint-disable-next-line no-console
  console.log('[seed] no sample data inserted (P1-01.b placeholder)');
}

main()
  .catch((error: unknown) => {
    // eslint-disable-next-line no-console
    console.error('[seed] failed', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
