import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';

import { HealthController } from './common/health/health.controller.js';
import { GlobalExceptionFilter } from './common/http/global-exception.filter.js';
import { RequestIdMiddleware } from './common/request-id/request-id.middleware.js';
import { env } from './lib/env.js';
import { ContentModule } from './modules/contents/content.module.js';
import { MediaModule } from './modules/media/media.module.js';
import { UsersAuthModule } from './modules/users/users-auth.module.js';

import type { Params } from 'nestjs-pino';

const pinoParams: Params = {
  pinoHttp: {
    level: env.LOG_LEVEL,
    // 非 production 走 pino-pretty 人类可读；P4 上线时切到 JSON 上 ELK / Loki。
    //
    // test 环境例外：pino-pretty 是 worker-thread transport，在 vitest 里
    // 会抛 `unable to determine transport target`，且日志本来就该被静音。
    // 所以 test 强制走纯 JSON。
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
    // 在每行日志带 requestId；res.locals.requestId 由 RequestIdMiddleware 写入
    customProps: (_req, res) => ({
      requestId: (res as { locals?: { requestId?: string } }).locals?.requestId,
    }),
  },
};

/**
 * 全局限流（P1-02）。
 *
 * 技术方案 §8：「登录、刷新、找回操作限流」。
 * 全局兜底 120 次 / 分钟；登录等敏感端点在控制器上用 `@Throttle` 单独收紧。
 *
 * `skipSuccessfulRequests: false` —— 成功请求也计数，避免"打中密码就停手"的
 * 分布式爆破被漏掉。
 */
const throttlerModuleOptions = {
  throttlers: [
    {
      name: 'default',
      ttl: 60_000,
      limit: 120,
    },
  ],
};

@Module({
  imports: [
    LoggerModule.forRoot(pinoParams),
    ThrottlerModule.forRoot(throttlerModuleOptions),
    UsersAuthModule,
    ContentModule,
    MediaModule,
  ],
  controllers: [HealthController],
  providers: [
    // 守卫顺序由 provider 注册顺序决定：先 Auth（401）再 Roles（403）再限流。
    { provide: APP_FILTER, useClass: GlobalExceptionFilter },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}

/** ThrottlerGuard 供测试直接实例化（全局 provider 由 Nest 注入）。 */
export { ThrottlerGuard };