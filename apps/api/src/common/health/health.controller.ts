import { Controller, Get } from '@nestjs/common';

import { env } from '../../lib/env.js';

/**
 * 健康检查端点。AGENTS.md §4 + TECHNICAL_IMPLEMENTATION §13：
 * - /health/live 只检查进程；
 * - /health/ready 检查必要依赖（DB、对象存储等）；P0 阶段无依赖，仅返回 ok。
 *   P1 接入 Prisma 时此处加 ping。
 */
@Controller('health')
export class HealthController {
  @Get('live')
  live(): { status: 'ok'; service: 'api' } {
    return { status: 'ok', service: 'api' };
  }

  @Get('ready')
  ready(): { status: 'ok'; service: 'api'; appEnv: string; checks: Record<string, 'ok'> } {
    // P0 阶段无外部依赖；P1 起在此处汇总 db / s3 / mail 等 ping 结果。
    return {
      status: 'ok',
      service: 'api',
      appEnv: env.APP_ENV,
      checks: { process: 'ok' },
    };
  }
}