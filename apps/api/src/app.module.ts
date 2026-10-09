import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';

import { HealthController } from './common/health/health.controller.js';
import { RequestIdMiddleware } from './common/request-id/request-id.middleware.js';
import { env } from './lib/env.js';

@Module({
  imports: [
    LoggerModule.forRoot({
      pinoHttp: {
        level: env.LOG_LEVEL,
        // P0 阶段人类可读；P4 上线时切到 prettyPrint: false 走 JSON 上 ELK / Loki。
        transport:
          env.APP_ENV === 'production'
            ? undefined
            : {
                target: 'pino-pretty',
                options: {
                  singleLine: true,
                  translateTime: 'SYS:HH:MM:ss.l',
                  ignore: 'pid,hostname,req.headers,res.headers',
                },
              },
        // 请求生命周期：到达 → 完成（success / error）
        customLogLevel: (_req, res, err) => {
          if (err || res.statusCode >= 500) return 'error';
          if (res.statusCode >= 400) return 'warn';
          return 'info';
        },
        // 字段重命名 + 透传 requestId
        customProps: (req) => ({ requestId: (req as { requestId?: string }).requestId }),
        // 不在生产日志里打印完整 req/res（可能含 token / cookie）
        redact: {
          paths: [
            'req.headers.authorization',
            'req.headers.cookie',
            'req.headers["x-forwarded-for"]',
            'res.headers["set-cookie"]',
          ],
          censor: '[REDACTED]',
        },
      },
    }),
  ],
  controllers: [HealthController],
  providers: [],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}