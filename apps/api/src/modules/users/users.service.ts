import { Injectable } from '@nestjs/common';

import { CONTENT_STATUSES, USER_ROLES, type UserRole } from '@nanking-atlas/database';

import { prisma } from '../../lib/prisma.js';

/**
 * 用户数据访问 + 业务规则。
 *
 * 设计依据：
 *   - docs/TECHNICAL_IMPLEMENTATION.md §4 `users` / `user_roles` 表定义
 *   - §6 「服务端守卫同时检查身份、角色、资源当前状态和动作」
 *   - AGENTS.md §4.1 「所有后台写接口必须服务端鉴权并检查角色、资源状态和动作权限」
 *
 * 软删除：`users` 不做物理删除，用 `disabledAt` 表达禁用；
 * 历史数据（audit_logs / revisions）通过 onDelete: Restrict 保留。
 */

export interface UserWithRoles {
  id: string;
  email: string;
  displayName: string;
  disabledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  roles: UserRole[];
}

export interface CreateUserInput {
  email: string;
  passwordHash: string;
  displayName: string;
  roles: readonly UserRole[];
}

@Injectable()
export class UsersService {
  /**
   * 按 email 查用户（含角色）。
   *
   * email 统一 lowercase 后查询；schema 的 unique 约束保证唯一。
   */
  async findByEmail(email: string): Promise<UserWithRoles | null> {
    const row = await prisma.user.findUnique({
      where: { email: email.trim().toLowerCase() },
      include: { userRoles: true },
    });
    return row === null ? null : toUserWithRoles(row);
  }

  async findById(id: string): Promise<UserWithRoles | null> {
    const row = await prisma.user.findUnique({
      where: { id },
      include: { userRoles: true },
    });
    return row === null ? null : toUserWithRoles(row);
  }

  /**
   * 创建用户。
   *
   * 角色写入与用户创建在**同一事务**里，避免出现"用户存在但角色为空"的中间态
   * （AGENTS.md §5.3 要求状态变更在事务边界内一致）。
   */
  async create(input: CreateUserInput): Promise<UserWithRoles> {
    const roles = normalizeRoles(input.roles);
    const row = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          email: input.email.trim().toLowerCase(),
          passwordHash: input.passwordHash,
          displayName: input.displayName.trim(),
        },
      });
      if (roles.length > 0) {
        await tx.userRoleAssignment.createMany({
          data: roles.map((role) => ({ userId: created.id, role })),
        });
      }
      return tx.user.findUniqueOrThrow({
        where: { id: created.id },
        include: { userRoles: true },
      });
    });
    return toUserWithRoles(row);
  }

  /**
   * 禁用 / 启用用户。
   *
   * 用 `disabledAt` 表达禁用而非删除：审计与历史修订必须可追溯
   * （AGENTS.md §5.4 「revision、review action、audit log 只增不改；
   * 普通删除不得级联破坏追溯记录」）。
   */
  async setDisabled(id: string, disabled: boolean): Promise<UserWithRoles> {
    const row = await prisma.user.update({
      where: { id },
      data: { disabledAt: disabled ? new Date() : null },
      include: { userRoles: true },
    });
    return toUserWithRoles(row);
  }

  /**
   * 替换用户角色集合。
   *
   * 用 delete + createMany 而不是 upsert 逐条：
   * 语义是"设置为你给的这一组"，而不是"增量追加"。
   */
  async setRoles(id: string, roles: readonly UserRole[]): Promise<UserWithRoles> {
    const normalized = normalizeRoles(roles);
    await prisma.$transaction(async (tx) => {
      const exists = await tx.user.findUnique({ where: { id }, select: { id: true } });
      if (exists === null) {
        throw new UserNotFoundError(id);
      }
      await tx.userRoleAssignment.deleteMany({ where: { userId: id } });
      if (normalized.length > 0) {
        await tx.userRoleAssignment.createMany({
          data: normalized.map((role) => ({ userId: id, role })),
        });
      }
    });
    const updated = await this.findById(id);
    if (updated === null) {
      throw new UserNotFoundError(id);
    }
    return updated;
  }

  /** 用户是否为管理员（用于"最后一个管理员"保护）。 */
  async isAdmin(id: string): Promise<boolean> {
    const row = await prisma.userRoleAssignment.findUnique({
      where: { userId_role: { userId: id, role: 'ADMIN' } },
      select: { userId: true },
    });
    return row !== null;
  }

  /**
   * 统计当前启用的管理员数量。
   *
   * 用于"禁止禁用/降级最后一个管理员"这条业务规则。
   */
  async countActiveAdmins(): Promise<number> {
    const rows = await prisma.userRoleAssignment.findMany({
      where: { role: 'ADMIN', user: { disabledAt: null } },
      select: { userId: true },
    });
    return new Set(rows.map((row) => row.userId)).size;
  }

  /** 列表（后台用户管理用）。 */
  async list(limit: number): Promise<UserWithRoles[]> {
    const rows = await prisma.user.findMany({
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: { userRoles: true },
    });
    return rows.map(toUserWithRoles);
  }
}

/** 角色规范化：去空白、去重、校验取值、排序（保证集合稳定）。 */
export function normalizeRoles(roles: readonly string[]): UserRole[] {
  const valid = new Set<string>(USER_ROLES);
  const cleaned = new Set<string>();
  for (const role of roles) {
    const trimmed = role.trim().toUpperCase();
    if (!valid.has(trimmed)) {
      throw new InvalidRoleError(role);
    }
    cleaned.add(trimmed);
  }
  // 按 USER_ROLES 声明顺序输出，保证同样的输入集合总是同样的数组顺序。
  return USER_ROLES.filter((role) => cleaned.has(role));
}

export class UserNotFoundError extends Error {
  constructor(public readonly userId: string) {
    super('user not found');
    this.name = 'UserNotFoundError';
  }
}

export class InvalidRoleError extends Error {
  constructor(public readonly role: string) {
    super(`invalid role: ${role}`);
    this.name = 'InvalidRoleError';
  }
}

/** 允许登录时的状态判断：禁用账号不可登录，但错误文案要统一（防枚举）。 */
export function isDisabled(user: UserWithRoles): boolean {
  return user.disabledAt !== null;
}

// 内容状态字面量从 database 包导出，避免 API 层硬编码字符串。
export { CONTENT_STATUSES };

interface UserRowWithRoles {
  id: string;
  email: string;
  displayName: string;
  disabledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  passwordHash: string;
  userRoles: { role: string }[];
}

function toUserWithRoles(row: UserRowWithRoles): UserWithRoles {
  return {
    id: row.id,
    email: row.email,
    displayName: row.displayName,
    disabledAt: row.disabledAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    roles: normalizeRoles(row.userRoles.map((assignment) => assignment.role)),
  };
}

/**
 * 取密码哈希。单独方法避免把 passwordHash 泄漏到 UserWithRoles 之外。
 */
export async function getPasswordHashByEmail(email: string): Promise<string | null> {
  const row = await prisma.user.findUnique({
    where: { email: email.trim().toLowerCase() },
    select: { passwordHash: true },
  });
  return row?.passwordHash ?? null;
}