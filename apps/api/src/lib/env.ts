import { z } from 'zod';

/**
 * API 环境变量校验。
 *
 * 设计：
 * - 仅校验 API 自身需要的变量；不要在前端创建真实凭据或生产数据库 URL。
 * - 解析在模块加载阶段完成，启动期失败立即抛错。
 *
 * 后续阶段会逐步扩展：
 * - DATABASE_URL（Prisma + PostGIS，P1）
 * - AUTH_ACCESS_SECRET / AUTH_REFRESH_SECRET（P1）
 * - S3_* / REVALIDATION_*（P2+）
 */

const APP_ENV = z.enum(['development', 'test', 'staging', 'production']);

const schema = z.object({
  APP_ENV,
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().positive().max(65535).default(4000),
  WEB_ORIGIN: z.string().url().optional(),
  ADMIN_ORIGIN: z.string().url().optional(),
});

const parsed = schema.safeParse({
  APP_ENV: process.env['APP_ENV'],
  NODE_ENV: process.env['NODE_ENV'],
  API_PORT: process.env['API_PORT'],
  WEB_ORIGIN: process.env['WEB_ORIGIN'],
  ADMIN_ORIGIN: process.env['ADMIN_ORIGIN'],
});

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
    .join('; ');
  throw new Error(`[api] invalid environment configuration: ${issues}`);
}

export const env = Object.freeze({
  APP_ENV: parsed.data.APP_ENV,
  NODE_ENV: parsed.data.NODE_ENV,
  API_PORT: parsed.data.API_PORT,
  WEB_ORIGIN: parsed.data.WEB_ORIGIN ?? null,
  ADMIN_ORIGIN: parsed.data.ADMIN_ORIGIN ?? null,
});

export type ApiEnv = typeof env;
