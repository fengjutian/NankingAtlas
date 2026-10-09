import { Controller, Get, Post, Req, Res, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { type Request, type Response } from 'express';
import { z } from 'zod';

import { AuthService, AuthError, type RequestContext } from './auth.service.js';
import { Public } from '../../common/auth/roles.decorator.js';
import { requireUser } from '../../common/auth/auth.guard.js';
import { REFRESH_COOKIE } from './refresh-cookie.js';

/**
 * 认证控制器。
 *
 * 路由与技术方案 §7.3 一致：`POST /auth/login` `/auth/refresh` `/auth/logout` `GET /auth/me`
 *
 * 限流：
 *   - login / refresh 用 `@Throttle` 单独收紧（AGENTS.md §4.4 + 技术方案 §8
 *     「登录、刷新、找回操作限流」）
 *   - 全局限流由 ThrottlerModule 在 AppModule 配置
 */

// ---------------------------------------------------------------------------
// DTO：全部 zod 白名单校验 + forbid unknown（AGENTS.md §4.5）
// ---------------------------------------------------------------------------

const loginSchema = z
  .object({
    email: z.string().min(3).max(320).email(),
    password: z.string().min(1).max(1024),
  })
  .strict();

const refreshSchema = z.object({}).strict();

export type LoginDto = z.infer<typeof loginSchema>;

/**
 * 取请求上下文：IP / UA / requestId。
 *
 * IP 只用于审计哈希，**不进日志明文**（技术方案 §8「日志不得记录…完整个人信息」）。
 */
function buildContext(req: Request): RequestContext {
  const forwarded = req.headers['x-forwarded-for'];
  const firstForwarded = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  const ip = (firstForwarded ?? req.socket.remoteAddress ?? '').split(',')[0]?.trim() ?? null;
  const userAgentHeader = req.headers['user-agent'];
  const userAgent = (Array.isArray(userAgentHeader) ? userAgentHeader[0] : userAgentHeader) ?? null;
  return {
    ip: ip === '' ? null : ip,
    userAgent,
    requestId: req.requestId ?? 'unknown',
  };
}

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  /**
   * POST /auth/login
   *
   * 限流 5 次 / 分钟（按 IP）。生产建议再叠加账号维度限流。
   */
  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async login(
    @Body() rawBody: unknown,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ data: unknown }> {
    const body = loginSchema.parse(rawBody);
    const session = await this.auth.login(body.email, body.password, buildContext(req));
    setRefreshCookie(res, session.refreshToken, session.refreshTokenExpiresAt);
    return {
      data: {
        accessToken: session.accessToken,
        accessTokenExpiresAt: session.accessTokenExpiresAt.toISOString(),
        user: {
          id: session.user.id,
          email: session.user.email,
          displayName: session.user.displayName,
          roles: session.user.roles,
        },
      },
    };
  }

  /** POST /auth/refresh —— 旋转 refresh token。 */
  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async refresh(
    @Body() rawBody: unknown,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ data: unknown }> {
    refreshSchema.parse(rawBody ?? {});
    const cookieToken = readRefreshCookie(req);
    if (cookieToken === null) {
      throw new AuthError('TOKEN_REVOKED', '缺少 refresh token cookie');
    }
    const session = await this.auth.refresh(cookieToken, buildContext(req));
    setRefreshCookie(res, session.refreshToken, session.refreshTokenExpiresAt);
    return {
      data: {
        accessToken: session.accessToken,
        accessTokenExpiresAt: session.accessTokenExpiresAt.toISOString(),
        user: {
          id: session.user.id,
          email: session.user.email,
          displayName: session.user.displayName,
          roles: session.user.roles,
        },
      },
    };
  }

  /** POST /auth/logout —— 幂等；总是清 cookie。 */
  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    const cookieToken = readRefreshCookie(req);
    if (cookieToken !== null) {
      await this.auth.logout(cookieToken, buildContext(req));
    }
    clearRefreshCookie(res);
  }

  /** GET /auth/me —— 需要认证（由全局 AuthGuard 保证）。 */
  @Get('me')
  async me(@Req() req: Request): Promise<{ data: unknown }> {
    const user = requireUser(req);
    return { data: { id: user.id, roles: user.roles } };
  }
}

// ---------------------------------------------------------------------------
// Cookie 处理：HttpOnly + SameSite + (prod) Secure
// ---------------------------------------------------------------------------

function setRefreshCookie(res: Response, token: string, expiresAt: Date): void {
  res.cookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env['NODE_ENV'] === 'production',
    path: '/api/v1/auth',
    expires: expiresAt,
  });
}

function clearRefreshCookie(res: Response): void {
  res.clearCookie(REFRESH_COOKIE, {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env['NODE_ENV'] === 'production',
    path: '/api/v1/auth',
  });
}

function readRefreshCookie(req: Request): string | null {
  const raw = (req.cookies as Record<string, string | undefined> | undefined)?.[REFRESH_COOKIE];
  if (raw === undefined || raw === '') {
    return null;
  }
  return raw;
}