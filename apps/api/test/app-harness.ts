import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module.js';
import { GlobalExceptionFilter } from '../src/common/http/global-exception.filter.js';
import { prisma } from '../src/lib/prisma.js';

import type { Server } from 'node:http';

/**
 * 集成测试的 Nest app 引导。
 *
 * 与单元测试分开：集成测试要真连 SQLite（由 global-setup 在空库上跑迁移建表），
 * 起真实 Nest 容器 + 全局守卫 + 异常过滤器，因此耗时显著更长。
 */
export async function createTestApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleRef.createNestApplication();
  // 与 main.ts 保持一致的路由前缀，否则测不到真实路径。
  app.setGlobalPrefix('api/v1', { exclude: ['health', 'health/(.*)'] });
  app.useGlobalFilters(new GlobalExceptionFilter());
  await app.init();
  return app;
}

/** 关库 + 断开 Prisma，避免 vitest 进程挂住。 */
export async function closeTestApp(app: INestApplication | undefined): Promise<void> {
  await prisma.$disconnect();
  // app 可能是 undefined（beforeAll 里 createTestApp 就失败了）——
  // 这时静默跳过，让真正的失败原因（前面的异常）暴露出来。
  if (app !== undefined) {
    await app.close();
  }
}

/** 拿底层 http server 给 supertest 用。 */
export function serverOf(app: INestApplication): Server {
  return app.getHttpServer() as Server;
}

export { prisma, request };
