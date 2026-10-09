import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';

import { UsersService } from './users/users.service.js';
import { UsersController } from './users/users.controller.js';
import { AuthService } from './auth/auth.service.js';
import { AuthController } from './auth/auth.controller.js';
import { AuthGuard } from '../../common/auth/auth.guard.js';
import { RolesGuard } from '../../common/auth/roles.guard.js';

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
 */
@Global()
@Module({
  controllers: [UsersController, AuthController],
  providers: [
    UsersService,
    AuthService,
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
  exports: [UsersService, AuthService],
})
export class UsersAuthModule {}