import { PrismaClient } from '@nanking-atlas/database';
import { env } from './env.js';

/**
 * Prisma client 单例。
 *
 * 关键点：
 *   - NestJS 热重载 / Vitest 多次 require 时，模块顶层 new PrismaClient 会泄漏连接。
 *   - 通过 globalThis 缓存一份，仅在首次实例化；生产构建不会带 dev 缓存。
 *   - log 选项与 nestjs-pino 的日志级别保持一致；prod 减少噪音。
 */

const globalForPrisma = globalThis as unknown as {
  __nlaPrisma?: PrismaClient;
};

const isProduction = env.APP_ENV === 'production';
const isTest = env.APP_ENV === 'test';

export const prisma: PrismaClient =
  globalForPrisma.__nlaPrisma ??
  new PrismaClient({
    log: isProduction ? ['error'] : isTest ? [] : ['warn', 'error'],
  });

if (!isProduction) {
  globalForPrisma.__nlaPrisma = prisma;
}

/** 应用关闭时优雅释放；NestJS 启服入口在 main.ts 调用。 */
export async function disconnectPrisma(): Promise<void> {
  await prisma.$disconnect();
}
