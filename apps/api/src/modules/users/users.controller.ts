import { Controller, Get, Patch, Post, Body, Param, Req, HttpCode } from '@nestjs/common';
import { type Request } from 'express';
import { z } from 'zod';

import { USER_ROLES } from '@nanking-atlas/database';

import { UsersService, InvalidRoleError, UserNotFoundError, normalizeRoles } from './users.service.js';
import { RequireRoles } from '../../common/auth/roles.decorator.js';
import { requireUser } from '../../common/auth/auth.guard.js';
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
  constructor(private readonly users: UsersService) {}

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
      throw new Error('不能禁用当前登录账号');
    }

    // 规则 2：最后一个启用管理员不能被禁用。
    if (body.disabled === true && target.disabledAt === null) {
      const wasAdmin = target.roles.includes('ADMIN');
      if (wasAdmin && (await this.users.countActiveAdmins()) <= 1) {
        throw new Error('不能禁用最后一个启用的管理员');
      }
    }

    // 规则 3：最后一个启用管理员不能被降级（去掉 ADMIN 角色）。
    if (body.roles !== undefined) {
      const nextRoles = normalizeRoles(body.roles);
      const losesAdmin = target.roles.includes('ADMIN') && !nextRoles.includes('ADMIN');
      if (losesAdmin && target.disabledAt === null) {
        if ((await this.users.countActiveAdmins()) <= 1) {
          throw new Error('不能移除最后一个启用管理员的管理员角色');
        }
      }
      await this.users.setRoles(id, nextRoles);
    }

    if (body.displayName !== undefined) {
      await prisma.user.update({ where: { id }, data: { displayName: body.displayName } });
    }

    if (body.disabled !== undefined) {
      await this.users.setDisabled(id, body.disabled);
      if (body.disabled) {
        // 禁用即刻撤销所有 refresh token，强制下线。
        await prisma.refreshToken.updateMany({
          where: { userId: id, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }
    }

    if (body.password !== undefined) {
      const passwordHash = await hashPassword(body.password);
      await prisma.user.update({ where: { id }, data: { passwordHash } });
      // 改密码后强制重新登录（所有会话失效）。
      await prisma.refreshToken.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }

    await prisma.auditLog.create({
      data: {
        actorId: actor.id,
        requestId: req.requestId ?? 'unknown',
        action: 'admin.user.update',
        entityType: 'user',
        entityId: id,
        beforeJson: JSON.stringify({ roles: target.roles, disabledAt: target.disabledAt?.toISOString() ?? null }),
        afterJson: JSON.stringify({ roles: body.roles ?? target.roles, disabled: body.disabled ?? null }),
      },
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