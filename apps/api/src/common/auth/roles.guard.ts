import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { type Request } from 'express';

import { ROLES_METADATA_KEY, IS_PUBLIC_KEY } from './roles.decorator.js';

/**
 * 角色守卫（RBAC）。
 *
 * 规则：
 *   - `@Public()` 端点直接放行（认证守卫已放行，无需再判角色）
 *   - 有 `@RequireRoles(...)` → 角色必须命中其一
 *   - 两者都没有 → **默认拒绝**（fail-closed）
 *
 * 为什么默认拒绝而不是默认放行：忘记加装饰器应该是"接口不可用"
 * 这种安全失败，而不是"接口裸奔"。这是 AGENTS.md §4.1「禁止只靠隐藏按钮」
 * 在服务端的对应实现。
 */

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    // @Public() 端点不进角色判定。少了这一步，登录接口会被
    // "未声明 @RequireRoles → fail-closed" 误伤成 403。
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic === true) {
      return true;
    }

    const required = this.reflector.getAllAndOverride<readonly string[] | undefined>(
      ROLES_METADATA_KEY,
      [context.getHandler(), context.getClass()],
    );

    // 未声明角色要求 → 默认拒绝（fail-closed）
    if (required === undefined || required.length === 0) {
      throw new ForbiddenError('该端点未声明所需角色，默认拒绝访问');
    }

    const request = context.switchToHttp().getRequest<Request>();
    const user = request.user;
    if (user === undefined) {
      // AuthGuard 应该在前面挡住；走到这里说明守卫顺序被改坏了。
      throw new ForbiddenError('需要认证');
    }

    const allowed = new Set(required.map((role) => role.toUpperCase()));
    const hasRole = user.roles.some((role) => allowed.has(role.toUpperCase()));
    if (!hasRole) {
      throw new ForbiddenError('当前角色无权执行该操作');
    }
    return true;
  }
}

/** 403 错误；映射为 `{ error: { code: 'FORBIDDEN', ... } }`。 */
export class ForbiddenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ForbiddenError';
  }
}

/** 供 service 层复用：断言 actor 拥有指定角色之一。 */
export function assertAnyRole(userRoles: readonly string[], allowed: readonly string[]): void {
  const allowedSet = new Set(allowed.map((role) => role.toUpperCase()));
  const ok = userRoles.some((role) => allowedSet.has(role.toUpperCase()));
  if (!ok) {
    throw new ForbiddenError('当前角色无权执行该操作');
  }
}
