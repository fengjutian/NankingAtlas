import { z } from 'zod';

/**
 * API 环境变量校验。
 *
 * 设计：
 *   - 仅校验 API 自身需要的变量；不要在前端创建真实凭据或生产数据库 URL。
 *   - 解析在模块加载阶段完成，启动期失败立即抛错。
 *
 * 兼容约定：空串（''）视为"未设置"，与 undefined 等价。
 *
 * 后续阶段会逐步扩展：
 *   - AUTH_ACCESS_SECRET / AUTH_REFRESH_SECRET（P1-02）
 *   - S3_* / REVALIDATION_*（P2+）
 */

const APP_ENV = z.enum(['development', 'test', 'staging', 'production']);

const blankToUndefined = (val: unknown): unknown =>
  val === '' || val === undefined ? undefined : val;

const optionalUrl = z.preprocess(blankToUndefined, z.string().url().optional());

const apiPort = z.preprocess(
  blankToUndefined,
  z.coerce.number().int().positive().max(65535).default(4000),
);

const logLevel = z.preprocess(
  blankToUndefined,
  z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
);

const requestIdHeader = z.preprocess(
  blankToUndefined,
  z
    .string()
    .min(1)
    .max(64)
    .regex(/^[A-Za-z0-9_-]+$/u, {
      message: 'request id header 只能包含 ASCII 字母、数字、连字符与下划线',
    })
    .default('x-request-id'),
);

/**
 * Prisma `file:` SQLite 连接串。
 *
 * 校验目标：URL 结构合法（Prisma sqlite provider 要求 `file:./relative/path`
 * 或 `file:/absolute/path`）；具体文件是否可写由启服后 `$connect()` 决定。
 * 测试环境（APP_ENV=test）允许为空——Vitest 单测不连数据库；连库的集成测试
 * 由 vitest.config.ts 注入 DATABASE_URL。
 */
const databaseUrl = z.preprocess(
  blankToUndefined,
  z
    .string()
    .refine((value) => value.startsWith('file:'), {
      message: 'DATABASE_URL 必须以 file: 开头（SQLite provider）',
    })
    .optional(),
);

const schema = z
  .object({
    APP_ENV,
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    API_PORT: apiPort,
    WEB_ORIGIN: optionalUrl,
    ADMIN_ORIGIN: optionalUrl,
    LOG_LEVEL: logLevel,
    REQUEST_ID_HEADER: requestIdHeader,
    DATABASE_URL: databaseUrl,
  })
  .superRefine((data, ctx) => {
    if (data.APP_ENV !== 'test' && !data.DATABASE_URL) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['DATABASE_URL'],
        message: '非 test 环境必须配置 DATABASE_URL',
      });
    }
  });

const parsed = schema.safeParse({
  APP_ENV: process.env.APP_ENV,
  NODE_ENV: process.env.NODE_ENV,
  API_PORT: process.env.API_PORT,
  WEB_ORIGIN: process.env.WEB_ORIGIN,
  ADMIN_ORIGIN: process.env.ADMIN_ORIGIN,
  LOG_LEVEL: process.env.LOG_LEVEL,
  REQUEST_ID_HEADER: process.env.REQUEST_ID_HEADER,
  DATABASE_URL: process.env.DATABASE_URL,
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
  LOG_LEVEL: parsed.data.LOG_LEVEL,
  REQUEST_ID_HEADER: parsed.data.REQUEST_ID_HEADER,
  DATABASE_URL: parsed.data.DATABASE_URL ?? null,
});

export type ApiEnv = typeof env;
