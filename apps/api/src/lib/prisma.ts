import { PrismaClient } from '@nanking-atlas/database';

import { redactAuditJson } from './audit-redaction.js';
import { env } from './env.js';

/**
 * Prisma client 单例。
 *
 * 关键点：
 *   - NestJS 热重载 / Vitest 多次 require 时，模块顶层 new PrismaClient 会泄漏连接。
 *   - 通过 globalThis 缓存一份，仅在首次实例化；生产构建不会带 dev 缓存。
 *   - log 选项与 nestjs-pino 的日志级别保持一致；prod 减少噪音。
 *
 * ## 审计脱敏扩展（FD-006）
 *
 * `auditLog.create` 被挂了 client extension，在**写入前**把
 * before/after JSON 里的敏感字段脱敏（见 audit-redaction.ts）。
 *
 * 用扩展而不是逐个改 15 处调用点，是因为"每个调用点自觉"迟早会漏；
 * 挂在 client 上则**事务内的 `tx.auditLog.create` 同样生效**，结构上不可能绕过。
 */

const isProduction = env.APP_ENV === 'production';
const isTest = env.APP_ENV === 'test';

const baseClient = new PrismaClient({
  log: isProduction ? ['error'] : isTest ? [] : ['warn', 'error'],
});

const extendedClient = baseClient.$extends({
  query: {
    auditLog: {
      create({ args, query }) {
        const data = args.data;
        return query({
          ...args,
          data: {
            ...data,
            beforeJson: redactAuditJson(data.beforeJson),
            afterJson: redactAuditJson(data.afterJson),
          },
        });
      },
    },
  },
});

/**
 * 对外暴露带扩展的 client。
 *
 * `$extends` 的返回类型**不满足** `PrismaClient`：它少了 `$on` / `$use`
 * 这两个"旧的"中间件 API（Prisma 5 已弃用，但类型上仍在）。
 * 直接标注成 `PrismaClient` 会让 `globalThis` 缓存拿到基础 client 类型，
 * 与扩展后的实例对不上。
 *
 * 所以：缓存存**扩展后的类型**，导出标注成"基础类型减去 `$on`/`$use`"。
 * 既有的 `Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$use' | '$transaction' | '$extends'>`
 * 推导（content.service.ts 的 `PrismaTransactionClient`）仍然成立。
 */
type ExportedPrismaClient = Omit<PrismaClient, '$on' | '$use'>;

const globalForPrisma = globalThis as unknown as {
  __nlaPrisma?: ExportedPrismaClient;
};

export const prisma: ExportedPrismaClient =
  globalForPrisma.__nlaPrisma ?? (extendedClient as unknown as ExportedPrismaClient);

if (!isProduction) {
  globalForPrisma.__nlaPrisma = prisma;
}

/** 应用关闭时优雅释放；NestJS 启服入口在 main.ts 调用。 */
export async function disconnectPrisma(): Promise<void> {
  await prisma.$disconnect();
}
