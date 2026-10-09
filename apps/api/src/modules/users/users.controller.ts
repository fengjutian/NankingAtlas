import { Controller, Get, Inject, Patch, Post, Body, Param, Req } from '@nestjs/common';
import { type Request } from 'express';
import { z } from 'zod';

import { USER_ROLES } from '@nanking-atlas/database';

import {
  UsersService,
  InvalidRoleError,
  UserNotFoundError,
  normalizeRoles,
} from './users.service.js';
import { requireUser } from '../../common/auth/auth.guard.js';
import { RequireRoles } from '../../common/auth/roles.decorator.js';
import { ForbiddenError } from '../../common/auth/roles.guard.js';
import { hashPassword } from '../../lib/password.js';
import { prisma } from '../../lib/prisma.js';

/**
 * 后台用户管理（技术方案 §7.3：`GET/POST/PATCH /admin/users`）。
 *
 * 权限：全部需要 ADMIN。
 * AGENTS.md §4.1「Editor 不得审核或发布」+ §6 角色矩阵
 * 「用户和角色管理：仅 Admin」。
 */

const createUserSchema = z
  .object({
    email: z.string().min(3).max(320).email(),
    password: z.string().min(1).max(1024),
    displayName: z.string().min(1).max(80),
    roles: z.array(z.enum(USER_ROLES)).min(1),
  })
  .strict();

const patchUserSchema = z
  .object({
    displayName: z.string().min(1).max(80).optional(),
    roles: z.array(z.enum(USER_ROLES)).min(1).optional(),
    disabled: z.boolean().optional(),
    password: z.string().min(1).max(1024).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: '至少提供一个要修改的字段',
  });

@Controller('admin/users')
export class UsersController {
  /** 显式 @Inject：见 auth.controller.ts 的同款说明（vitest 不产出 paramtypes）。 */
  constructor(@Inject(UsersService) private readonly users: UsersService) {}

  /** GET /admin/users —— 列出用户。 */
  @Get()
  @RequireRoles('ADMIN')
  async list(): Promise<{ data: unknown }> {
    const rows = await this.users.list(100);
    return {
      data: rows.map((user) => ({
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        roles: user.roles,
        disabledAt: user.disabledAt?.toISOString() ?? null,
      })),
    };
  }

  /** POST /admin/users —— 创建用户。 */
  @Post()
  @RequireRoles('ADMIN')
  async create(@Body() rawBody: unknown): Promise<{ data: unknown }> {
    const body = createUserSchema.parse(rawBody);
    const passwordHash = await hashPassword(body.password);
    const created = await this.users.create({
      email: body.email,
      passwordHash,
      displayName: body.displayName,
      roles: body.roles,
    });
    return {
      data: {
        id: created.id,
        email: created.email,
        displayName: created.displayName,
        roles: created.roles,
      },
    };
  }

  /**
   * PATCH /admin/users/:id —— 改角色 / 禁用 / 改密码。
   *
   * 保护规则：**禁止禁用或降级最后一个启用的管理员**。
   * 否则系统会被锁死，没有任何账号能恢复。
   */
  @Patch(':id')
  @RequireRoles('ADMIN')
  async patch(
    @Param('id') id: string,
    @Body() rawBody: unknown,
    @Req() req: Request,
  ): Promise<{ data: unknown }> {
    const body = patchUserSchema.parse(rawBody);
    const actor = requireUser(req);

    const target = await this.users.findById(id);
    if (target === null) {
      throw new UserNotFoundError(id);
    }

    const isSelf = actor.id === id;

    // 规则 1：禁用自己等于自杀式锁号。
    if (body.disabled === true && isSelf) {
      throw new SelfDisableForbiddenError();
    }

    // 规则 2：最后一个启用管理员不能被禁用。
    if (body.disabled === true && target.disabledAt === null) {
      const wasAdmin = target.roles.includes('ADMIN');
      if (wasAdmin && (await this.users.countActiveAdmins()) <= 1) {
        throw new LastAdminForbiddenError('禁用');
      }
    }

    // 规则 3：最后一个启用管理员不能被降级（去掉 ADMIN 角色）。
    if (body.roles !== undefined) {
      const nextRoles = normalizeRoles(body.roles);
      const losesAdmin = target.roles.includes('ADMIN') && !nextRoles.includes('ADMIN');
      if (losesAdmin && target.disabledAt === null) {
        if ((await this.users.countActiveAdmins()) <= 1) {
          throw new LastAdminForbiddenError('降级');
        }
      }
    }

    // 密码哈希**先算好再进事务** —— argon2 是 CPU 密集的（~50ms），
    // 放进事务会长时间占着 SQLite 的写锁。
    const passwordHash = body.password === undefined ? null : await hashPassword(body.password);

    /**
     * 角色 / 显示名 / 禁用 / 密码 / 会话撤销 / 审计必须在**同一事务**里。
     *
     * 之前是六次独立写：任何一步失败（磁盘满、SQLITE_BUSY、进程退出）都会
     * 留下"权限已改但没有审计记录"的中间态 —— 而审计是权限变更的追溯依据
     * （AGENTS.md §5.4）。这里用交互式事务串起来。
     */
    await prisma.$transaction(async (tx) => {
      if (body.roles !== undefined) {
        await tx.userRoleAssignment.deleteMany({ where: { userId: id } });
        await tx.userRoleAssignment.createMany({
          data: normalizeRoles(body.roles).map((role) => ({ userId: id, role })),
        });
      }

      const userData: {
        displayName?: string;
        disabledAt?: Date | null;
        passwordHash?: string;
      } = {};
      if (body.displayName !== undefined) {
        userData.displayName = body.displayName;
      }
      if (body.disabled !== undefined) {
        userData.disabledAt = body.disabled ? new Date() : null;
      }
      if (passwordHash !== null) {
        userData.passwordHash = passwordHash;
      }
      if (Object.keys(userData).length > 0) {
        await tx.user.update({ where: { id }, data: userData });
      }

      // 禁用或改密码后强制下线（撤销所有活跃 refresh token）
      const shouldRevokeSessions = body.disabled === true || passwordHash !== null;
      if (shouldRevokeSessions) {
        await tx.refreshToken.updateMany({
          where: { userId: id, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }

      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          requestId: req.requestId ?? 'unknown',
          action: 'admin.user.update',
          entityType: 'user',
          entityId: id,
          beforeJson: JSON.stringify({
            roles: target.roles,
            disabledAt: target.disabledAt?.toISOString() ?? null,
          }),
          afterJson: JSON.stringify({
            roles: body.roles ?? target.roles,
            disabled: body.disabled ?? null,
            passwordChanged: passwordHash !== null,
          }),
        },
      });
    });

    const updated = await this.users.findById(id);
    if (updated === null) {
      throw new UserNotFoundError(id);
    }
    return {
      data: {
        id: updated.id,
        email: updated.email,
        displayName: updated.displayName,
        roles: updated.roles,
        disabledAt: updated.disabledAt?.toISOString() ?? null,
      },
    };
  }
}

export { InvalidRoleError };

/**
 * 管理员不能禁用自己。
 *
 * 用业务错误类而非裸 `Error`：裸 Error 落进全局 filter 的兜底分支 →
 * 500 INTERNAL_ERROR。业务规则失败被记成"服务端故障"，污染 5xx 告警，
 * 也让前端无法区分"操作被拒"与"系统坏了"。
 */
export class SelfDisableForbiddenError extends ForbiddenError {
  constructor() {
    super('不能禁用当前登录账号');
  }
}

/** 不能禁用 / 降级最后一个启用的管理员（否则系统会被锁死）。 */
export class LastAdminForbiddenError extends ForbiddenError {
  constructor(operation: string) {
    super(`不能${operation}最后一个启用的管理员`);
  }
}
