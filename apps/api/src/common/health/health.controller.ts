import { Controller, Get } from '@nestjs/common';

import { env } from '../../lib/env.js';
import { Public } from '../auth/roles.decorator.js';

/**
 * 健康检查端点（AGENTS.md §4 + TECHNICAL_IMPLEMENTATION §13）：
 * - `/health/live` 只检查进程存活（k8s liveness probe）
 * - `/health/ready` 检查依赖就绪（k8s readiness probe）
 *
 * 两个端点都标 `@Public()`：探针由基础设施发起，不携带 access token。
 * 忘了这行会让整个集群在首次 AuthGuard 落地后集体判定为不健康 ——
 * 这正是 P1 接入全局守卫时暴露的问题（探针返回 401）。
 *
 * live / ready 的区别很关键：
 *   - `live` **永远不查依赖**。数据库抖动时若 liveness 失败，会触发
 *     本不该发生的容器重启，把一次短暂故障放大成可用性事故。
 *   - `ready` 查依赖。数据库不可用时返回 503，让流量被摘走但不重启。
 */
@Controller('health')
export class HealthController {
  @Public()
  @Get('live')
  live(): { status: 'ok'; service: 'api' } {
    return { status: 'ok', service: 'api' };
  }

  @Public()
  @Get('ready')
  async ready(): Promise<{
    status: 'ok' | 'degraded';
    service: 'api';
    appEnv: string;
    checks: Record<string, 'ok' | 'error'>;
  }> {
    const checks: Record<string, 'ok' | 'error'> = { process: 'ok' };
    // P1 接入 Prisma 后在此 ping 数据库。
    // 失败只标记 error 而不抛 —— 由 readiness 探针根据 status 决定是否摘流量。
    try {
      const { prisma } = await import('../../lib/prisma.js');
      await prisma.$queryRaw`SELECT 1`;
      checks.database = 'ok';
    } catch {
      checks.database = 'error';
    }

    const degraded = Object.values(checks).includes('error');
    return {
      status: degraded ? 'degraded' : 'ok',
      service: 'api',
      appEnv: env.APP_ENV,
      checks,
    };
  }
}
