import 'reflect-metadata';

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Logger as PinoLogger } from 'nestjs-pino';

import { AppModule } from './app.module';
import { env } from './lib/env.js';
import { disconnectPrisma } from './lib/prisma.js';

import type { NestExpressApplication } from '@nestjs/platform-express';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
  });
  app.getHttpAdapter().getInstance().disable('x-powered-by');
  app.useLogger(app.get(PinoLogger));

  // 业务接口使用 /api/v1 前缀；health 走顶层
  app.setGlobalPrefix('api/v1', {
    exclude: ['health', 'health/(.*)'],
  });

  // P1-02：CORS 白名单来自 WEB_ORIGIN / ADMIN_ORIGIN；禁止通配符携带凭据
  // （技术方案 §8：「CORS 仅允许配置中的公开站/后台源，禁止通配符携带凭据」）。
  const allowedOrigins = [env.WEB_ORIGIN, env.ADMIN_ORIGIN].filter(
    (value): value is string => typeof value === 'string',
  );
  if (allowedOrigins.length > 0) {
    app.enableCors({
      origin: allowedOrigins,
      credentials: true,
      methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: [
        'Content-Type',
        'Authorization',
        'If-Match',
        'Idempotency-Key',
        env.REQUEST_ID_HEADER,
      ],
      // 暴露自定义响应头，否则浏览器 JS 读不到 requestId / ETag。
      exposedHeaders: [env.REQUEST_ID_HEADER, 'ETag'],
      maxAge: 600,
    });
  }

  await app.listen(env.API_PORT);
  app
    .get(PinoLogger)
    .log(
      `Nanking Atlas API listening on http://localhost:${String(env.API_PORT)} (appEnv=${env.APP_ENV})`,
    );
  // 显式 import Logger 是为了在 IDE 跳转时容易找到；运行时不直接调用。
  void Logger;

  // 优雅关闭：释放 Prisma 连接池，避免进程挂住。
  // NestJS 的 enableShutdownHooks 让 SIGTERM / SIGINT 走 onApplicationShutdown。
  app.enableShutdownHooks();
  process.on('SIGINT', () => {
    void disconnectPrisma().finally(() => process.exit(0));
  });
  process.on('SIGTERM', () => {
    void disconnectPrisma().finally(() => process.exit(0));
  });
}

bootstrap().catch((error: unknown) => {
  // 启动期失败：直接退出，避免半运行态
  console.error('[api] bootstrap failed', error);
  process.exit(1);
});