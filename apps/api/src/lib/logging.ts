import { env } from './env.js';

import type { Params } from 'nestjs-pino';

/**
 * 结构化日志配置（P4-04 日志脱敏）。
 *
 * AGENTS.md §4.7「日志必须脱敏并带 request ID」与技术方案 §8
 * 「日志不得记录密码、token、Cookie、对象存储密钥和完整个人信息」。
 *
 * 为什么要单独成文件：这份配置必须**可被测试直接消费**。
 * 如果它埋在 app.module.ts 的模块级常量里，测试就只能去断言"对象里有个
 * redact 字段"——那既证明不了 pino 真会脱敏，也拦不住路径写错。
 * 抽出来后，测试可以用同一份配置建一个真实 pino 实例往内存流写日志，
 * 再断言敏感值确实没出现。
 */

/**
 * 脱敏路径。
 *
 * 规则是**按数据来源枚举**，不是按字段名猜：
 *   - 请求头：认证与对象存储凭据可能出现的头
 *   - 响应头：set-cookie 里就是 refresh token 明文
 *   - 业务字段：登录/建稿/上传接口的敏感入参
 *
 * `*.password` 这类通配符覆盖嵌套一层的情况（`user.password`）。
 * pino 的 redact 是在序列化阶段生效的，所以**业务代码不需要记得脱敏**——
 * 这是它相对"记得别打日志"的关键优势：后者一定会漏。
 */
export const REDACT_PATHS: readonly string[] = [
  // ---- 请求头 ----
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["set-cookie"]',
  'req.headers["x-api-key"]',
  'req.headers["x-auth-token"]',
  'req.headers["proxy-authorization"]',
  'res.headers["set-cookie"]',
  // ---- 业务字段（含一层嵌套）----
  'password',
  '*.password',
  'accessToken',
  '*.accessToken',
  'refreshToken',
  '*.refreshToken',
  'token',
  '*.token',
  'secret',
  '*.secret',
  'authorization',
  'cookie',
  'apiKey',
  '*.apiKey',
  // ---- 基础设施凭据（AGENTS.md §4.6）----
  's3SecretAccessKey',
  '*.s3SecretAccessKey',
  'passwordHash',
  '*.passwordHash',
  'tokenHash',
  '*.tokenHash',
];

/** 脱敏后的占位符。与 pino 默认一致，便于日志检索时识别。 */
export const REDACT_REPLACEMENT = '[Redacted]';

/**
 * pino 的序列化配置。
 *
 * `redact` 在这里配置，nestjs-pino 会把同一份配置同时用于
 * 请求日志（pino-http 的 child logger）与应用内 logger。
 *
 * 刻意**不加** `as const`：pino 的 `redact.paths` 类型是可变 `string[]`
 * 且开启了 `exactOptionalPropertyTypes`，`readonly` 数组传不进去。
 */
export const PINO_BASE_OPTIONS = {
  level: env.LOG_LEVEL,
  redact: {
    paths: [...REDACT_PATHS],
    censor: REDACT_REPLACEMENT,
  },
};

/**
 * 完整 nestjs-pino 参数。
 *
 * test 环境强制走纯 JSON：pino-pretty 是 worker-thread transport，
 * 在 vitest 里会抛 `unable to determine transport target`，
 * 且测试期间的日志本来就该被静音。
 */
export const pinoParams: Params = {
  pinoHttp: {
    ...PINO_BASE_OPTIONS,
    ...(env.APP_ENV !== 'production' && env.APP_ENV !== 'test'
      ? {
          transport: {
            target: 'pino-pretty',
            options: {
              singleLine: true,
              translateTime: 'SYS:HH:MM:ss.l',
              ignore: 'pid,hostname',
            },
          },
        }
      : {}),
    customLogLevel: (_req, res, err) => {
      if (err || res.statusCode >= 500) return 'error';
      if (res.statusCode >= 400) return 'warn';
      return 'info';
    },
    // 每行日志带 requestId；res.locals.requestId 由 RequestIdMiddleware 写入。
    customProps: (_req, res) => ({
      requestId: (res as { locals?: { requestId?: string } }).locals?.requestId,
    }),
  },
};
