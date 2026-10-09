import { Global, Module } from '@nestjs/common';
import { APP_GUARD, Reflector } from '@nestjs/core';

import { UsersController } from './users.controller.js';
import { UsersService } from './users.service.js';
import { AuthGuard } from '../../common/auth/auth.guard.js';
import { RolesGuard } from '../../common/auth/roles.guard.js';
import { AuthController } from '../auth/auth.controller.js';
import { AuthService } from '../auth/auth.service.js';

/**
 * 用户 + 认证模块（P1-02 / P1-03）。
 *
 * 全局守卫顺序很关键：
 *   1. AuthGuard  —— 回答"你是谁"，未认证 → 401
 *   2. RolesGuard —— 回答"你能做什么"，角色不足 → 403
 *
 * 顺序反了会让未认证请求收到 403 而不是 401，语义错误且掩盖认证问题。
 *
 * `@Public()` 端点由 AuthGuard 放行且**不进入** RolesGuard 判定
 * （RolesGuard 只在有 `@RequireRoles` 元数据时生效）。
 *
 * 注意：`APP_GUARD` 注册的守卫是普通 provider，**不会**自动拿到
 * `Reflector`（只有 controller / middleware 才会被自动注入）。
 * 必须显式 `useFactory` 注入，否则运行时会抛
 * `Cannot read properties of undefined (reading 'getAllAndOverride')`。
 */
@Global()
@Module({
  controllers: [UsersController, AuthController],
  providers: [
    UsersService,
    AuthService,
    {
      provide: APP_GUARD,
      useFactory: (reflector: Reflector) => new AuthGuard(reflector),
      inject: [Reflector],
    },
    {
      provide: APP_GUARD,
      useFactory: (reflector: Reflector) => new RolesGuard(reflector),
      inject: [Reflector],
    },
  ],
  exports: [UsersService, AuthService],
})
export class UsersAuthModule {}