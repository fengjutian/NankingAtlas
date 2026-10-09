import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';

import { HealthController } from './common/health/health.controller.js';
import { RequestIdMiddleware } from './common/request-id/request-id.middleware.js';
import { env } from './lib/env.js';

import type { Params } from 'nestjs-pino';

const pinoParams: Params = {
  pinoHttp: {
    level: env.LOG_LEVEL,
    // P0 阶段人类可读；P4 上线时切到 prettyPrint: false 走 JSON 上 ELK / Loki。
    ...(env.APP_ENV !== 'production'
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

@Module({
  imports: [LoggerModule.forRoot(pinoParams)],
  controllers: [HealthController],
  providers: [],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}
