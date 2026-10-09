import { Inject, Injectable } from '@nestjs/common';

import { env } from '../../lib/env.js';
import { hashPassword, verifyPassword } from '../../lib/password.js';
import { prisma } from '../../lib/prisma.js';
import { hashIp } from '../../lib/token.js';
import {
  generateRefreshToken,
  hashRefreshToken,
  issueAccessToken,
} from '../../lib/token.js';
import { getPasswordHashByEmail, UsersService, type UserWithRoles } from '../users/users.service.js';

/**
 * 认证业务。
 *
 * 关键安全规则（docs/TECHNICAL_IMPLEMENTATION.md §8）：
 *   1. 统一失败文案 —— 登录失败只回 INVALID_CREDENTIALS，不区分
 *      「邮箱不存在」/「密码错误」/「账号已禁用」，防账号枚举。
 *   2. refresh token 旋转 —— 每次刷新都撤销旧 token 并发新 token；
 *      重放旧 token 时整条链一起撤销（reuse detection）。
 *   3. refresh token 只存哈希 + HttpOnly Cookie，明文不进日志不进 DB。
 *   4. 审计：登录/刷新/登出都写 audit_logs（只增不改）。
 */

export interface AuthSession {
  accessToken: string;
  accessTokenExpiresAt: Date;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
  user: UserWithRoles;
}

export interface RequestContext {
  ip: string | null;
  userAgent: string | null;
  requestId: string;
}

export class AuthError extends Error {
  constructor(
    public readonly code:
      | 'INVALID_CREDENTIALS'
      | 'TOKEN_EXPIRED'
      | 'TOKEN_REVOKED'
      | 'ACCOUNT_DISABLED'
      | 'UNAUTHORIZED',
    message: string,
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

/**
 * 统一失败文案。
 *
 * 所有登录失败路径都必须抛这个 code，前端据此显示同一句提示。
 * 措辞刻意不暗示"邮箱是否存在"。
 */
export const GENERIC_LOGIN_FAILURE_MESSAGE = '邮箱或密码不正确，或账号不可用';

@Injectable()
export class AuthService {
  /**
   * 显式 `@Inject` 而非靠构造函数反射。
   *
   * vitest 用 esbuild 做 TS transform，不保证产出 `design:paramtypes`；
   * 只写 `constructor(private readonly users: UsersService)` 在测试环境下
   * 会得到 `this.users === undefined`，表现为运行时 500。
   * 显式 `@Inject` 不依赖反射，tsc 与 vitest 下行为一致。
   */
  constructor(@Inject(UsersService) private readonly users: UsersService) {}

  /**
   * 登录：校验密码 → 签发 access + refresh。
   *
   * 失败时**先跑一次 dummy verify**（verifyPassword 对 null hash 已经这样做），
   * 保证「邮箱不存在」和「密码错误」的耗时接近。
   */
  async login(email: string, password: string, ctx: RequestContext): Promise<AuthSession> {
    const hash = await getPasswordHashByEmail(email);
    const passwordOk = await verifyPassword(hash, password);

    // 即使密码不对也要走到这里才算完成等时路径。
    if (!passwordOk || hash === null) {
      await this.writeAudit({
        actorId: null,
        requestId: ctx.requestId,
        action: 'auth.login.failed',
        entityType: 'user',
        entityId: email.trim().toLowerCase(),
        beforeJson: null,
        afterJson: null,
        ipHash: ctx.ip === null ? null : hashIp(ctx.ip),
      });
      throw new AuthError('INVALID_CREDENTIALS', GENERIC_LOGIN_FAILURE_MESSAGE);
    }

    const user = await this.users.findByEmail(email);
    if (user === null) {
      throw new AuthError('INVALID_CREDENTIALS', GENERIC_LOGIN_FAILURE_MESSAGE);
    }
    if (user.disabledAt !== null) {
      // 禁用账号同样用统一文案，避免通过"禁用"状态探测账号存在性。
      await this.writeAudit({
        actorId: user.id,
        requestId: ctx.requestId,
        action: 'auth.login.disabled',
        entityType: 'user',
        entityId: user.id,
        beforeJson: null,
        afterJson: null,
        ipHash: ctx.ip === null ? null : hashIp(ctx.ip),
      });
      throw new AuthError('INVALID_CREDENTIALS', GENERIC_LOGIN_FAILURE_MESSAGE);
    }

    const session = await this.issueSession(user, ctx);
    await this.writeAudit({
      actorId: user.id,
      requestId: ctx.requestId,
      action: 'auth.login.success',
      entityType: 'user',
      entityId: user.id,
      beforeJson: null,
      afterJson: JSON.stringify({ roles: user.roles }),
      ipHash: ctx.ip === null ? null : hashIp(ctx.ip),
    });
    return session;
  }

  /**
   * 刷新：验证旧 refresh token → 撤销旧 → 发新（旋转）。
   *
   * 若旧 token 已被撤销（意味着可能泄露后被重放），把该用户**所有**
   * 活跃 refresh token 一起撤销，强制重新登录。
   */
  async refresh(refreshToken: string, ctx: RequestContext): Promise<AuthSession> {
    if (refreshToken.length === 0 || refreshToken.length > 128) {
      throw new AuthError('TOKEN_REVOKED', 'refresh token 无效');
    }

    const tokenHash = hashRefreshToken(refreshToken);
    const row = await prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: { include: { userRoles: true } } },
    });

    if (row === null) {
      throw new AuthError('TOKEN_REVOKED', 'refresh token 无效');
    }

    if (row.revokedAt !== null) {
      // 重放检测：这条链可能已泄露。
      await prisma.refreshToken.updateMany({
        where: { userId: row.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await this.writeAudit({
        actorId: row.userId,
        requestId: ctx.requestId,
        action: 'auth.refresh.reuse_detected',
        entityType: 'user',
        entityId: row.userId,
        beforeJson: null,
        afterJson: null,
        ipHash: ctx.ip === null ? null : hashIp(ctx.ip),
      });
      throw new AuthError('TOKEN_REVOKED', 'refresh token 已失效，请重新登录');
    }

    if (row.expiresAt.getTime() <= Date.now()) {
      throw new AuthError('TOKEN_EXPIRED', 'refresh token 已过期，请重新登录');
    }

    if (row.user.disabledAt !== null) {
      throw new AuthError('ACCOUNT_DISABLED', GENERIC_LOGIN_FAILURE_MESSAGE);
    }

    const user: UserWithRoles = {
      id: row.user.id,
      email: row.user.email,
      displayName: row.user.displayName,
      disabledAt: row.user.disabledAt,
      createdAt: row.user.createdAt,
      updatedAt: row.user.updatedAt,
      roles: row.user.userRoles.map((assignment) => assignment.role) as UserWithRoles['roles'],
    };

    // 旋转：撤销旧 + 发新，在同一事务内。
    const next = await this.rotateRefreshToken(row.id, user, ctx);
    await this.writeAudit({
      actorId: user.id,
      requestId: ctx.requestId,
      action: 'auth.refresh.success',
      entityType: 'user',
      entityId: user.id,
      beforeJson: null,
      afterJson: null,
      ipHash: ctx.ip === null ? null : hashIp(ctx.ip),
    });
    return next;
  }

  /** 登出：撤销该 refresh token。幂等 —— 已撤销的不报错。 */
  async logout(refreshToken: string, ctx: RequestContext): Promise<void> {
    if (refreshToken.length === 0) {
      return;
    }
    const tokenHash = hashRefreshToken(refreshToken);
    const row = await prisma.refreshToken.findUnique({
      where: { tokenHash },
      select: { userId: true, revokedAt: true },
    });
    if (row === null) {
      return;
    }
    if (row.revokedAt === null) {
      await prisma.refreshToken.update({
        where: { tokenHash },
        data: { revokedAt: new Date() },
      });
      await this.writeAudit({
        actorId: row.userId,
        requestId: ctx.requestId,
        action: 'auth.logout',
        entityType: 'user',
        entityId: row.userId,
        beforeJson: null,
        afterJson: null,
        ipHash: ctx.ip === null ? null : hashIp(ctx.ip),
      });
    }
  }

  /** 签发 access + refresh 并落库。 */
  private async issueSession(
    user: UserWithRoles,
    ctx: RequestContext,
  ): Promise<AuthSession> {
    return this.rotateRefreshToken(null, user, ctx);
  }

  /**
   * 旋转 refresh token。
   *
   * `revokeTokenHash` 为 null 表示首次签发；否则撤销指定 token 后发新的。
   * 整个过程在一个事务里，避免"旧 token 已撤销但新 token 没发出去"。
   */
  private async rotateRefreshToken(
    revokeTokenHash: string | null,
    user: UserWithRoles,
    ctx: RequestContext,
  ): Promise<AuthSession> {
    const refreshToken = generateRefreshToken();
    const refreshTokenHash = hashRefreshToken(refreshToken);
    const expiresAt = new Date(Date.now() + env.AUTH_REFRESH_TTL_SECONDS * 1000);

    await prisma.$transaction(async (tx) => {
      if (revokeTokenHash !== null) {
        await tx.refreshToken.update({
          where: { tokenHash: revokeTokenHash },
          data: { revokedAt: new Date() },
        });
      }
      await tx.refreshToken.create({
        data: {
          userId: user.id,
          tokenHash: refreshTokenHash,
          expiresAt,
          userAgent: ctx.userAgent,
          ipHash: ctx.ip === null ? null : hashIp(ctx.ip),
        },
      });
    });

    const { token: accessToken, claims } = issueAccessToken({
      userId: user.id,
      roles: user.roles,
    });

    return {
      accessToken,
      accessTokenExpiresAt: new Date(claims.exp * 1000),
      refreshToken,
      refreshTokenExpiresAt: expiresAt,
      user,
    };
  }

  /** 审计写入（SQLite 下 JSON 列为 TEXT）。 */
  private async writeAudit(entry: {
    actorId: string | null;
    requestId: string;
    action: string;
    entityType: string;
    entityId: string;
    beforeJson: string | null;
    afterJson: string | null;
    ipHash: string | null;
  }): Promise<void> {
    await prisma.auditLog.create({
      data: {
        actorId: entry.actorId,
        requestId: entry.requestId,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        beforeJson: entry.beforeJson,
        afterJson: entry.afterJson,
        ipHash: entry.ipHash,
      },
    });
  }
}

/** 供 admin 用户管理用：改密码。 */
export async function setUserPassword(userId: string, newPassword: string): Promise<void> {
  const passwordHash = await hashPassword(newPassword);
  await prisma.user.update({ where: { id: userId }, data: { passwordHash } });
}