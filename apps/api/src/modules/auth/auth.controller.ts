import {
  Controller,
  Get,
  Post,
  Req,
  Res,
  Body,
  HttpCode,
  HttpStatus,
  Inject,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { type Request, type Response } from 'express';
import { z } from 'zod';

import { AuthService, AuthError, type RequestContext } from './auth.service.js';
import { REFRESH_COOKIE } from './refresh-cookie.js';
import { requireUser } from '../../common/auth/auth.guard.js';
import { Public, RequireRoles } from '../../common/auth/roles.decorator.js';
import { env } from '../../lib/env.js';

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
/**
 * 从 request 头里取第一个字符串值。
 *
 * `@types/express@5` 把 header 值放宽成了 `any`，直接赋值会触发
 * `no-unsafe-assignment`。这里显式收窄成 `string | undefined`，
 * 不靠类型断言掩盖。
 */
function firstHeaderValue(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    // Array.isArray 会把 unknown 收窄成 any[]；显式标注元素类型避免
    // no-unsafe-assignment 把 any 传染出去。
    const items: unknown[] = value;
    const first = items[0];
    return typeof first === 'string' ? first : undefined;
  }
  return typeof value === 'string' ? value : undefined;
}

function buildContext(req: Request): RequestContext {
  const forwarded = firstHeaderValue(req.headers['x-forwarded-for']);
  const remote = req.socket.remoteAddress;
  const rawIp = (forwarded ?? remote ?? '').split(',')[0]?.trim() ?? '';
  const rawUserAgent = firstHeaderValue(req.headers['user-agent']);
  return {
    ip: rawIp === '' ? null : rawIp,
    userAgent: rawUserAgent ?? null,
    requestId: req.requestId ?? 'unknown',
  };
}

/**
 * 登录限流：默认 5 次 / 分钟 / IP（可由 `AUTH_LOGIN_RATE_LIMIT` 覆盖）。
 *
 * 为什么做成 env 而不是硬编码：集成测试里所有登录用例共享同一个 IP
 * （supertest 走 127.0.0.1），固定 5 次/分钟会被前面的用例吃光配额。
 * 做成 env 后测试可以放宽而不放松生产值 —— 生产默认仍是 5。
 *
 * `env` 对象在模块加载期冻结（`Object.freeze`），所以阈值也只在加载期读取。
 * 测试要验证"限流真的拦得住"，见 `auth.integration.spec.ts` 里用独立
 * `AppModule` 副本 + 独立 env 的做法，而不是改这里的常量。
 */
const LOGIN_THROTTLE = { default: { limit: env.AUTH_LOGIN_RATE_LIMIT, ttl: 60_000 } };
const REFRESH_THROTTLE = {
  default: { limit: env.AUTH_LOGIN_RATE_LIMIT * 6, ttl: 60_000 },
};

@Controller('auth')
export class AuthController {
  /**
   * 显式 `@Inject` 而非靠构造函数反射。
   *
   * 原因：vitest 用 esbuild 做 TS transform，不产出 `design:paramtypes`
   * 元数据（那是 tsc 的 `emitDecoratorMetadata` 产物）。只写
   * `constructor(private readonly auth: AuthService)` 在测试环境下
   * 会得到 `this.auth === undefined`，表现为运行时 500。
   * 显式 `@Inject` 不依赖任何反射，tsc 与 vitest 下行为一致。
   */
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  /**
   * POST /auth/login
   *
   * 限流 5 次 / 分钟（按 IP）。生产建议再叠加账号维度限流。
   */
  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle(LOGIN_THROTTLE)
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
  @Throttle(REFRESH_THROTTLE)
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
  @Throttle(REFRESH_THROTTLE)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    const cookieToken = readRefreshCookie(req);
    if (cookieToken !== null) {
      await this.auth.logout(cookieToken, buildContext(req));
    }
    clearRefreshCookie(res);
  }

  /**
   * GET /auth/me —— 需要认证 + 任一后台角色。
   *
   * 显式声明 `@RequireRoles` 是必要的：RolesGuard 对未声明角色的端点
   * fail-closed（默认 403），`/auth/me` 属于"登录即可访问"，必须显式说明。
   */
  @Get('me')
  @RequireRoles('ADMIN', 'EDITOR', 'REVIEWER', 'VIEWER')
  me(@Req() req: Request): { data: unknown } {
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
    secure: isProduction(),
    path: '/api/v1/auth',
    expires: expiresAt,
  });
}

function clearRefreshCookie(res: Response): void {
  res.clearCookie(REFRESH_COOKIE, {
    httpOnly: true,
    sameSite: 'strict',
    secure: isProduction(),
    path: '/api/v1/auth',
  });
}

/**
 * 是否处于生产。
 *
 * 用 `env.APP_ENV` 而不是 `process.env.NODE_ENV`：本项目所有生产强校验
 * （secret 必填、REVALIDATION_URL 必填）都按 `APP_ENV` 判定，而
 * `NODE_ENV` 缺省是 `development`。按 NODE_ENV 判断会让
 * 「只设 APP_ENV=production」的部署发出不带 `Secure` 的 cookie，
 * refresh token 就能走明文 HTTP。
 */
function isProduction(): boolean {
  return env.APP_ENV === 'production';
}

/**
 * 从 `Cookie` 头解析 refresh token。
 *
 * 不用 `req.cookies`：那需要 `cookie-parser` 中间件，而 Nest 默认不带。
 * 为一个 cookie 引入新依赖不值（AGENTS.md §6.5「能用现有依赖解决时不新增」），
 * 这里手动解析 —— Cookie 头格式简单（`k=v; k2=v2`），没有嵌套场景。
 */
function readRefreshCookie(req: Request): string | null {
  // 优先用中间件已解析的结果（若将来引入了 cookie-parser）。
  const parsed = (req.cookies as Record<string, string | undefined> | undefined)?.[REFRESH_COOKIE];
  if (parsed !== undefined && parsed !== '') {
    return parsed;
  }

  const raw = firstHeaderValue(req.headers.cookie) ?? '';
  for (const part of raw.split(';')) {
    const eq = part.indexOf('=');
    if (eq <= 0) {
      continue;
    }
    const name = part.slice(0, eq).trim();
    if (name === REFRESH_COOKIE) {
      const value = part.slice(eq + 1).trim();
      if (value === '') {
        return null;
      }
      try {
        return decodeURIComponent(value);
      } catch {
        // 畸形百分号编码（`%`、`%zz`、`%E0%A4` 等）会让 decodeURIComponent 抛
        // URIError。不接住的话它会一路冒到异常过滤器变成 500 —— 把**客户端
        // 传错 cookie** 记成服务端故障，还会污染 5xx 告警。这里当作"没有
        // cookie"，走标准的 TOKEN_REVOKED 401。
        return null;
      }
    }
  }
  return null;
}
