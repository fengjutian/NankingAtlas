import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { HealthController } from './health.controller.js';
import { IS_PUBLIC_KEY } from '../auth/roles.decorator.js';

describe('HealthController', () => {
  let controller: HealthController;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
    }).compile();
    controller = moduleRef.get(HealthController);
  });

  it('live returns ok without dependencies', () => {
    expect(controller.live()).toEqual({ status: 'ok', service: 'api' });
  });

  it('ready reports the current app env and probes the database', async () => {
    const result = await controller.ready();
    expect(result.service).toBe('api');
    expect(typeof result.appEnv).toBe('string');
    expect(result.checks.process).toBe('ok');
    // P1 起 ready 会 ping 数据库；探测失败时标记 error 而不是抛异常
    expect(['ok', 'error']).toContain(result.checks.database);
    expect(['ok', 'degraded']).toContain(result.status);
  });

  /**
   * 回归测试：P1 引入全局 AuthGuard 后，探针曾因缺 token 而返回 401，
   * 会让集群把健康的 API 判为不可用。这里锁住"两个端点都标 @Public()"。
   */
  it('marks both probe endpoints as public', () => {
    const reflector = new Reflector();
    // 用 Reflect.get 取方法引用：直接取 prototype 上的方法会被 unbound-method 规则
    // 判为「可能误用 this」。这里只读元数据，不调用它，所以是安全的。
    for (const method of ['live', 'ready'] as const) {
      const handler = Reflect.get(HealthController.prototype, method) as () => unknown;
      const isPublic = reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
        handler,
        HealthController,
      ]);
      expect(isPublic).toBe(true);
    }
  });
});
