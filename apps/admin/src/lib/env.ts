import { z } from 'zod';

/**
 * 管理后台环境变量校验。
 *
 * 设计：
 * - Vite 仅会把 VITE_ 前缀的变量暴露给客户端代码；其他敏感值只能在构建期使用。
 * - 解析在模块加载阶段完成，启动期失败立即抛错。
 */

const APP_ENV = z.enum(['development', 'test', 'staging', 'production']);

const schema = z.object({
  VITE_APP_ENV: APP_ENV,
  VITE_API_BASE_URL: z.string().url().optional(),
});

const rawEnv = import.meta.env as unknown as Record<string, string | undefined>;

const parsed = schema.safeParse({
  VITE_APP_ENV: rawEnv['VITE_APP_ENV'],
  VITE_API_BASE_URL: rawEnv['VITE_API_BASE_URL'],
});

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
    .join('; ');
  throw new Error(`[admin] invalid environment configuration: ${issues}`);
}

export const env = Object.freeze({
  APP_ENV: parsed.data.VITE_APP_ENV,
  API_BASE_URL: parsed.data.VITE_API_BASE_URL ?? null,
});

export type AdminEnv = typeof env;
