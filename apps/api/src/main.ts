import 'reflect-metadata';

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';
import { env } from './lib/env';

import type { NestExpressApplication } from '@nestjs/platform-express';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  // 业务接口使用 /api/v1 前缀
  app.setGlobalPrefix('api/v1', {
    exclude: ['health'],
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
  Logger.log(
    `Nanking Atlas API listening on http://localhost:${String(env.API_PORT)} (appEnv=${env.APP_ENV})`,
    'Bootstrap',
  );
}

bootstrap().catch((error: unknown) => {
  // 启动期失败：直接退出，避免半运行态
  console.error('[api] bootstrap failed', error);
  process.exit(1);
});
