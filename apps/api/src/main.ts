import 'reflect-metadata';

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Logger as PinoLogger } from 'nestjs-pino';

import { AppModule } from './app.module';
import { env } from './lib/env.js';

import type { NestExpressApplication } from '@nestjs/platform-express';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
  });
  app.useLogger(app.get(PinoLogger));

  // 业务接口使用 /api/v1 前缀；health 走顶层
  app.setGlobalPrefix('api/v1', {
    exclude: ['health', 'health/(.*)'],
  });

  // P0-02 阶段：仅启用最小 CORS 占位；正式白名单来自 WEB_ORIGIN / ADMIN_ORIGIN（P1）
  const allowedOrigins = [env.WEB_ORIGIN, env.ADMIN_ORIGIN].filter(
    (value): value is string => typeof value === 'string',
  );
  if (allowedOrigins.length > 0) {
    app.enableCors({
      origin: allowedOrigins,
      credentials: true,
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
}

bootstrap().catch((error: unknown) => {
  // 启动期失败：直接退出，避免半运行态
  console.error('[api] bootstrap failed', error);
  process.exit(1);
});
