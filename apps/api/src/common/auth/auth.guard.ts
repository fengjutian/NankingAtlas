import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { type Request } from 'express';

import { env } from '../../lib/env.js';
import { verifyAccessToken } from '../../lib/token.js';
import { IS_PUBLIC_KEY } from './roles.decorator.js';

/**
 * 认证守卫：校验 access token，把身份挂到 request 上。
 *
 * 与 `RolesGuard` 的分工：
 *   - 本守卫回答"你是谁"（401）
 *   - RolesGuard 回答"你能做什么"（403）
 *
 * 拆分让 401/403 语义清晰，也便于对未认证场景单独限流。
 */

export interface AuthenticatedUser {
  id: string;
  roles: readonly string[];
}

/** request 上扩展字段；用模块增强而不是 `any`。 */
declare module 'express' {
  interface Request {
    /** 认证通过后由 AuthGuard 写入。 */
    user?: AuthenticatedUser;
    /** RequestIdMiddleware 写入。 */
    requestId?: string;
  }
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic === true) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const header = extractBearer(request.headers.authorization);
    if (header === null) {
      throw new UnauthorizedError('缺少 access token');
    }

    const result = verifyAccessToken(header);
    if (!result.ok) {
      throw new UnauthorizedError(
        result.reason === 'expired' ? 'access token 已过期' : 'access token 无效',
      );
    }

    request.user = { id: result.claims.sub, roles: result.claims.roles };
    return true;
  }
}

export function extractBearer(header: string | string[] | undefined): string | null {
  const raw = Array.isArray(header) ? header[0] : header;
  if (raw === undefined || raw === '') {
    return null;
  }
  const match = /^Bearer\s+(\S+)$/i.exec(raw.trim());
  if (match === null || match[1] === undefined) {
    return null;
  }
  return match[1];
}

/** 401 错误；由全局异常过滤器映射为 `{ error: { code: 'UNAUTHORIZED', ... } }`。 */
export class UnauthorizedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnauthorizedError';
  }
}

/** 从 request 取已认证用户；未认证时抛 401（供 service 层复用）。 */
export function requireUser(request: Request): AuthenticatedUser {
  const user = request.user;
  if (user === undefined) {
    throw new UnauthorizedError('需要认证');
  }
  return user;
}

/** dev 环境提示：生产不应泄露 env。 */
export function assertAuthEnvPresent(): void {
  if (env.APP_ENV === 'production' && env.AUTH_ACCESS_SECRET.startsWith('dev-only')) {
    throw new Error('生产环境必须配置真实 AUTH_ACCESS_SECRET');
  }
}