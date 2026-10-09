import { z } from 'zod';

/**
 * 应用环境标识。AGENTS.md 没有定义集中枚举；
 * 三个应用各自的 src/lib/env.ts 都要使用同一个 schema 保持一致。
 */
export const APP_ENV = z.enum(['development', 'test', 'staging', 'production']);

export type AppEnv = z.infer<typeof APP_ENV>;

/**
 * 把任意环境字符串安全归一化为 AppEnv。无法识别时返回 null，让调用方决定 fail-fast 还是回退。
 */
export function parseAppEnv(value: unknown): AppEnv | null {
  const result = APP_ENV.safeParse(value);
  return result.success ? result.data : null;
}