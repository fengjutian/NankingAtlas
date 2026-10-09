import { z } from 'zod';

/**
 * 公开站环境变量校验。
 *
 * 设计：
 * - 仅校验公开（NEXT_PUBLIC_*）变量；服务端密钥由 API 单独校验。
 * - 解析在模块加载阶段完成，启动期失败立即抛错。
 * - 校验通过后导出强类型对象，调用方无需再做空值判断。
 *
 * 兼容约定：process.env 中空串（''）视为"未设置"，与 undefined 等价。
 */

const APP_ENV = z.enum(['development', 'test', 'staging', 'production']);

/** 把 '' 归一化为 undefined，与 zod 校验层的约定保持一致。 */
const blankToUndefined = (val: unknown): unknown =>
  val === '' || val === undefined ? undefined : val;

const optionalUrl = z.preprocess(blankToUndefined, z.string().url().optional());

// `next dev` always sets NODE_ENV=development. Use that safe local default so
// a fresh checkout starts without requiring an untracked .env.local file.
// Non-development runtimes must still declare the public environment.
const appEnv =
  (blankToUndefined(process.env.NEXT_PUBLIC_APP_ENV) as string | undefined) ??
  (process.env.NODE_ENV === 'development' ? 'development' : undefined);

const schema = z.object({
  NEXT_PUBLIC_APP_ENV: APP_ENV,
  NEXT_PUBLIC_API_BASE_URL: optionalUrl.describe('API 基础 URL；P0 阶段可选，业务接入后必须配置'),
});

const parsed = schema.safeParse({
  NEXT_PUBLIC_APP_ENV: appEnv,
  NEXT_PUBLIC_API_BASE_URL: process.env.NEXT_PUBLIC_API_BASE_URL,
});

if (!parsed.success) {
  // 启动期 fail-fast：缺少关键环境变量直接退出进程
  const issues = parsed.error.issues
    .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
    .join('; ');
  throw new Error(`[web] invalid environment configuration: ${issues}`);
}

export const env = Object.freeze({
  APP_ENV: parsed.data.NEXT_PUBLIC_APP_ENV,
  API_BASE_URL: parsed.data.NEXT_PUBLIC_API_BASE_URL ?? null,
});

export type WebEnv = typeof env;
