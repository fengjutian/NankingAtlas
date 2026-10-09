import { Controller, Get } from '@nestjs/common';
import { env } from './lib/env';

@Controller()
export class AppController {
  /**
   * 最小存活端点。仅确认进程在运行，不连接数据库或外部服务。
   * 完整的 liveness/readiness 拆分会作为 P0-08 单独引入。
   */
  @Get('health')
  health(): { status: 'ok'; service: 'api'; appEnv: string } {
    return { status: 'ok', service: 'api', appEnv: env.APP_ENV };
  }
}