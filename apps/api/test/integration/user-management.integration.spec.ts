import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { hashPassword } from '../../src/lib/password.js';
import { closeTestApp, createTestApp, prisma, request, serverOf } from '../app-harness.js';

import type { INestApplication } from '@nestjs/common';

/**
 * FD-005 用户与角色管理后台的集成测试。
 *
 * 服务端已有 `GET/POST/PATCH /admin/users`（技术方案 §7.3）。本文件锁住
 * **安全规则**（它们最容易被后续改动悄悄破坏），并覆盖本轮新增的检索分页。
 *
 * 重点规则：
 *   - 全部端点仅 ADMIN 可用（Editor / Reviewer 不得进入或调用写接口）
 *   - 禁用用户的 refresh token 立即失效
 *   - 禁止禁用自己；禁止禁用 / 降级最后一个启用的管理员（否则系统锁死）
 *   - 未知字段被 DTO 白名单拒绝（`verified: true` 这种"偷偷加权限"必须 400）
 *   - 角色变更写入 audit log，且**不含密码哈希**
 *   - 密码只在创建 / 重置时输入，任何响应都不回显
 */

const PASSWORD = 'user-management-integration-pw-2026';

let app: INestApplication | undefined;
const tokens = new Map<string, string>();

function ensureApp(): INestApplication {
  if (app === undefined) {
    throw new Error('app not initialised');
  }
  return app;
}

let counter = 0;

/**
 * 建用户并登录拿 token。
 *
 * 禁用账号**不能**登录（这正是被测语义之一），无差别登录会让 body.data
 * 变成 undefined，后面取 token 直接炸掉，掩盖真正的断言失败。
 */
async function createUser(
  roles: string[],
  opts: { email?: string; displayName?: string; disabled?: boolean } = {},
): Promise<string> {
  counter += 1;
  const email = opts.email ?? `um-${String(counter)}-${String(Date.now())}@example.test`;
  const passwordHash = await hashPassword(PASSWORD);
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash,
      displayName: opts.displayName ?? `用户 ${String(counter)}`,
      ...(opts.disabled === true ? { disabledAt: new Date() } : {}),
      userRoles: { create: roles.map((role) => ({ role })) },
    },
  });
  if (opts.disabled === true) {
    return user.id;
  }
  const login = await request(serverOf(ensureApp()))
    .post('/api/v1/auth/login')
    .send({ email, password: PASSWORD });
  // 登录端点显式 @HttpCode(OK) → 200，不是 201。
  expect(login.status).toBe(200);
  tokens.set(user.id, (login.body as { data: { accessToken: string } }).data.accessToken);
  return user.id;
}

function authHeader(userId: string): string {
  const token = tokens.get(userId);
  if (token === undefined) {
    throw new Error(`no token for user ${userId}`);
  }
  return `Bearer ${token}`;
}

interface UserListPage {
  items: {
    id: string;
    email: string;
    displayName: string;
    roles: string[];
    disabledAt: string | null;
  }[];
  nextCursor: string | null;
  hasMore: boolean;
}

async function listUsers(userId: string, query = ''): Promise<{ status: number; body: unknown }> {
  const res = await request(serverOf(ensureApp()))
    .get(`/api/v1/admin/users${query}`)
    .set('Authorization', authHeader(userId));
  return { status: res.status, body: res.body };
}

/** supertest 的 set-cookie 类型上是 any；显式收窄成 string[]。 */
function readCookies(headers: Record<string, unknown>): string[] {
  const raw: unknown = headers['set-cookie'];
  if (Array.isArray(raw)) {
    return raw.filter((item): item is string => typeof item === 'string');
  }
  return typeof raw === 'string' ? [raw] : [];
}

beforeAll(async () => {
  app = await createTestApp();
});

afterAll(async () => {
  await closeTestApp(app);
});

describe('FD-005: 权限边界（仅 ADMIN）', () => {
  it('EDITOR / REVIEWER 都不能读用户列表', async () => {
    const editorId = await createUser(['EDITOR']);
    const reviewerId = await createUser(['REVIEWER']);
    const adminId = await createUser(['ADMIN']);

    for (const id of [editorId, reviewerId]) {
      const res = await listUsers(id);
      expect(res.status, '非管理员不应能读用户列表').toBe(403);
      expect((res.body as { error: { code: string } }).error.code).toBe('FORBIDDEN');
    }

    expect((await listUsers(adminId)).status).toBe(200);
  });

  it('EDITOR 不能创建用户', async () => {
    const editorId = await createUser(['EDITOR']);
    const res = await request(serverOf(ensureApp()))
      .post('/api/v1/admin/users')
      .set('Authorization', authHeader(editorId))
      .send({
        email: `forbidden-${String(counter)}@example.test`,
        password: 'whatever-password',
        displayName: '越权创建',
        roles: ['ADMIN'],
      });
    expect(res.status).toBe(403);
  });

  it('EDITOR 不能改角色', async () => {
    await createUser(['EDITOR']);
    const targetId = await createUser(['EDITOR']);

    const res = await request(serverOf(ensureApp()))
      .patch(`/api/v1/admin/users/${targetId}`)
      .set('Authorization', authHeader(targetId))
      .send({ roles: ['ADMIN'] });
    expect(res.status).toBe(403);

    // 确认目标用户角色确实没被改动
    const after = await request(serverOf(ensureApp()))
      .get('/api/v1/auth/me')
      .set('Authorization', authHeader(targetId));
    expect((after.body as { data: { roles: string[] } }).data.roles).toEqual(['EDITOR']);
  });

  it('未认证返回 401', async () => {
    const res = await request(serverOf(ensureApp())).get('/api/v1/admin/users');
    expect(res.status).toBe(401);
  });
});

describe('FD-005: DTO 白名单', () => {
  it('创建用户时未知字段被拒绝', async () => {
    const adminId = await createUser(['ADMIN']);
    const res = await request(serverOf(ensureApp()))
      .post('/api/v1/admin/users')
      .set('Authorization', authHeader(adminId))
      .send({
        email: `sneaky-${String(counter)}@example.test`,
        password: 'some-password-value',
        displayName: '偷偷加字段',
        roles: ['EDITOR'],
        verified: true,
        disabledAt: null,
      });
    expect(res.status).toBe(400);
    expect((res.body as { error: { code: string } }).error.code).toBe('VALIDATION_FAILED');
  });

  it('修改用户时未知字段被拒绝', async () => {
    const adminId = await createUser(['ADMIN']);
    const targetId = await createUser(['EDITOR']);
    const res = await request(serverOf(ensureApp()))
      .patch(`/api/v1/admin/users/${targetId}`)
      .set('Authorization', authHeader(adminId))
      .send({ roles: ['ADMIN'], isSuperUser: true });
    expect(res.status).toBe(400);
  });

  it('创建用户必须带至少一个角色', async () => {
    const adminId = await createUser(['ADMIN']);
    const res = await request(serverOf(ensureApp()))
      .post('/api/v1/admin/users')
      .set('Authorization', authHeader(adminId))
      .send({
        email: `norole-${String(counter)}@example.test`,
        password: 'some-password-value',
        displayName: '没有角色',
        roles: [],
      });
    expect(res.status).toBe(400);
  });

  it('非法角色被拒绝', async () => {
    const adminId = await createUser(['ADMIN']);
    const res = await request(serverOf(ensureApp()))
      .post('/api/v1/admin/users')
      .set('Authorization', authHeader(adminId))
      .send({
        email: `badrole-${String(counter)}@example.test`,
        password: 'some-password-value',
        displayName: '非法角色',
        roles: ['SUPERUSER'],
      });
    expect(res.status).toBe(400);
  });
});

describe('FD-005: 密码安全', () => {
  it('创建用户的响应不回显密码或密码哈希', async () => {
    const adminId = await createUser(['ADMIN']);
    const res = await request(serverOf(ensureApp()))
      .post('/api/v1/admin/users')
      .set('Authorization', authHeader(adminId))
      .send({
        email: `secret-${String(counter)}@example.test`,
        password: 'top-secret-password-value',
        displayName: '密码不应回显',
        roles: ['EDITOR'],
      });
    expect(res.status).toBe(201);
    const serialized = JSON.stringify(res.body);
    expect(serialized).not.toContain('top-secret-password-value');
    expect(serialized).not.toContain('passwordHash');
  });

  it('用户列表不含密码哈希', async () => {
    const adminId = await createUser(['ADMIN']);
    const res = await listUsers(adminId);
    expect(res.status).toBe(200);
    const serialized = JSON.stringify(res.body);
    expect(serialized).not.toContain('passwordHash');
    expect(serialized).not.toContain(PASSWORD);
  });

  it('重置密码写入 audit log 时不记录明文或哈希', async () => {
    const adminId = await createUser(['ADMIN']);
    const targetId = await createUser(['EDITOR']);

    const res = await request(serverOf(ensureApp()))
      .patch(`/api/v1/admin/users/${targetId}`)
      .set('Authorization', authHeader(adminId))
      .send({ password: 'reset-password-secret' });
    expect(res.status).toBe(200);

    const audits = await prisma.auditLog.findMany({
      where: { entityId: targetId, action: 'admin.user.update' },
    });
    expect(audits.length).toBeGreaterThan(0);
    const serialized = JSON.stringify(audits);
    expect(serialized).not.toContain('reset-password-secret');
    expect(serialized).not.toContain('passwordHash');
    // 只记录"改过密码"这个事实，不记录内容
    expect(serialized).toContain('passwordChanged');
  });
});

describe('FD-005: 禁用语义与会话撤销', () => {
  it('禁用用户的 refresh token 立即失效', async () => {
    const adminId = await createUser(['ADMIN']);
    const targetEmail = `revoke-${String(counter)}-${String(Date.now())}@example.test`;
    const targetId = await createUser(['EDITOR'], { email: targetEmail });

    const login = await request(serverOf(ensureApp()))
      .post('/api/v1/auth/login')
      .send({ email: targetEmail, password: PASSWORD });
    expect(login.status).toBe(200);

    const cookies = readCookies(login.headers);
    expect(cookies.length).toBeGreaterThan(0);
    expect(cookies[0]).toContain('nla_rt');

    // 禁用前 refresh 可用
    const before = await request(serverOf(ensureApp()))
      .post('/api/v1/auth/refresh')
      .set('Cookie', cookies);
    expect(before.status).toBe(200);

    const disabled = await request(serverOf(ensureApp()))
      .patch(`/api/v1/admin/users/${targetId}`)
      .set('Authorization', authHeader(adminId))
      .send({ disabled: true });
    expect(disabled.status).toBe(200);

    // 禁用后 refresh 必须失效
    const after = await request(serverOf(ensureApp()))
      .post('/api/v1/auth/refresh')
      .set('Cookie', cookies);
    expect(after.status).toBe(401);
  });

  it('被禁用的用户不能登录', async () => {
    const adminId = await createUser(['ADMIN']);
    const email = `disabled-login-${String(counter)}-${String(Date.now())}@example.test`;
    const targetId = await createUser(['EDITOR'], { email });

    await request(serverOf(ensureApp()))
      .patch(`/api/v1/admin/users/${targetId}`)
      .set('Authorization', authHeader(adminId))
      .send({ disabled: true });

    const login = await request(serverOf(ensureApp()))
      .post('/api/v1/auth/login')
      .send({ email, password: PASSWORD });
    expect(login.status).toBe(401);
  });

  it('禁用用户后可以被重新启用', async () => {
    const adminId = await createUser(['ADMIN']);
    const targetId = await createUser(['EDITOR']);

    await request(serverOf(ensureApp()))
      .patch(`/api/v1/admin/users/${targetId}`)
      .set('Authorization', authHeader(adminId))
      .send({ disabled: true });
    const enabled = await request(serverOf(ensureApp()))
      .patch(`/api/v1/admin/users/${targetId}`)
      .set('Authorization', authHeader(adminId))
      .send({ disabled: false });
    expect(enabled.status).toBe(200);
    expect((enabled.body as { data: { disabledAt: string | null } }).data.disabledAt).toBeNull();
  });
});

describe('FD-005: 系统锁死保护', () => {
  it('不能禁用自己', async () => {
    const adminId = await createUser(['ADMIN']);
    const res = await request(serverOf(ensureApp()))
      .patch(`/api/v1/admin/users/${adminId}`)
      .set('Authorization', authHeader(adminId))
      .send({ disabled: true });
    expect(res.status).toBe(403);
    expect((res.body as { error: { message: string } }).error.message).toContain('当前登录账号');
  });

  it('不能降级最后一个启用的管理员', async () => {
    // 造一个"系统里只剩一个启用 Admin"的场景：先禁用所有其他 Admin
    const admins = await prisma.user.findMany({
      where: { userRoles: { some: { role: 'ADMIN' } }, disabledAt: null },
      include: { userRoles: true },
    });
    for (const admin of admins) {
      await prisma.user.update({
        where: { id: admin.id },
        data: { disabledAt: new Date() },
      });
    }

    const lastAdminId = await createUser(['ADMIN']);
    const res = await request(serverOf(ensureApp()))
      .patch(`/api/v1/admin/users/${lastAdminId}`)
      .set('Authorization', authHeader(lastAdminId))
      .send({ roles: ['EDITOR'] });
    expect(res.status).toBe(403);
    expect((res.body as { error: { message: string } }).error.message).toContain('最后一个');
  });

  it('还有别的管理员时可以降级', async () => {
    const spare = await createUser(['ADMIN']);
    const target = await createUser(['EDITOR']);
    await prisma.userRoleAssignment.create({ data: { userId: target, role: 'ADMIN' } });

    const res = await request(serverOf(ensureApp()))
      .patch(`/api/v1/admin/users/${target}`)
      .set('Authorization', authHeader(spare))
      .send({ roles: ['EDITOR'] });
    expect(res.status).toBe(200);
  });
});

describe('FD-005: 角色变更的审计', () => {
  it('角色变更写入 audit log，含前后对比', async () => {
    const adminId = await createUser(['ADMIN']);
    const targetId = await createUser(['EDITOR']);

    await request(serverOf(ensureApp()))
      .patch(`/api/v1/admin/users/${targetId}`)
      .set('Authorization', authHeader(adminId))
      .send({ roles: ['EDITOR', 'REVIEWER'] });

    const audit = await prisma.auditLog.findFirst({
      where: { entityId: targetId, action: 'admin.user.update' },
      orderBy: { createdAt: 'desc' },
    });
    expect(audit).not.toBeNull();
    expect(audit?.actorId).toBe(adminId);
    expect(audit?.beforeJson).toContain('EDITOR');
    expect(audit?.afterJson).toContain('REVIEWER');
    expect(audit?.requestId).toBeTruthy();
  });

  it('创建用户也写审计', async () => {
    const adminId = await createUser(['ADMIN']);
    const res = await request(serverOf(ensureApp()))
      .post('/api/v1/admin/users')
      .set('Authorization', authHeader(adminId))
      .send({
        email: `audited-${String(counter)}-${String(Date.now())}@example.test`,
        password: 'audit-password-value',
        displayName: '带审计的用户',
        roles: ['EDITOR'],
      });
    expect(res.status).toBe(201);
    const createdId = (res.body as { data: { id: string } }).data.id;
    const audit = await prisma.auditLog.findFirst({
      where: { entityId: createdId, action: 'user.create' },
    });
    expect(audit).not.toBeNull();
  });
});

describe('FD-005: 用户检索与分页', () => {
  it('按关键词检索 email 与显示名', async () => {
    const adminId = await createUser(['ADMIN']);
    const marker = `检索标记${String(counter)}`;
    await createUser(['EDITOR'], {
      email: `findme-${String(counter)}-${String(Date.now())}@example.test`,
      displayName: `${marker}-命中`,
    });
    await createUser(['EDITOR'], {
      email: `miss-${String(counter)}-${String(Date.now())}@example.test`,
      displayName: '无关用户',
    });

    const res = await listUsers(adminId, `?q=${encodeURIComponent(marker)}`);
    expect(res.status).toBe(200);
    const page = (res.body as { data: UserListPage }).data;
    expect(page.items).toHaveLength(1);
    expect(page.items[0]?.displayName).toContain(marker);
  });

  it('按角色筛选', async () => {
    const adminId = await createUser(['ADMIN']);
    const targetId = await createUser(['EDITOR']);
    const res = await listUsers(adminId, '?role=EDITOR');
    expect(res.status).toBe(200);
    const page = (res.body as { data: UserListPage }).data;
    expect(page.items.every((item) => item.roles.includes('EDITOR'))).toBe(true);
    expect(page.items.some((item) => item.id === targetId)).toBe(true);
  });

  it('按启用状态筛选', async () => {
    const adminId = await createUser(['ADMIN']);
    await createUser(['EDITOR'], { disabled: true });

    const enabled = await listUsers(adminId, '?status=enabled');
    const enabledPage = (enabled.body as { data: UserListPage }).data;
    expect(enabledPage.items.every((item) => item.disabledAt === null)).toBe(true);

    const disabled = await listUsers(adminId, '?status=disabled');
    const disabledPage = (disabled.body as { data: UserListPage }).data;
    expect(disabledPage.items.every((item) => item.disabledAt !== null)).toBe(true);
    expect(disabledPage.items.length).toBeGreaterThan(0);
  });

  it('分页有上限且翻页不重不漏', async () => {
    const adminId = await createUser(['ADMIN']);
    const marker = `分页${String(counter)}`;
    const created: string[] = [];
    for (let i = 0; i < 5; i += 1) {
      created.push(
        await createUser(['EDITOR'], {
          email: `page-${String(counter)}-${String(i)}-${String(Date.now())}@example.test`,
          displayName: `${marker}-${String(i)}`,
        }),
      );
    }

    const seen: string[] = [];
    let cursor: string | null = null;
    for (let i = 0; i < 5; i += 1) {
      const query = `?q=${encodeURIComponent(marker)}&limit=2${cursor === null ? '' : `&cursor=${encodeURIComponent(cursor)}`}`;
      const res = await listUsers(adminId, query);
      expect(res.status).toBe(200);
      const page = (res.body as { data: UserListPage }).data;
      seen.push(...page.items.map((item) => item.id));
      cursor = page.nextCursor;
      if (!page.hasMore) {
        expect(cursor).toBeNull();
        break;
      }
    }

    expect(seen).toHaveLength(5);
    expect(new Set(seen).size).toBe(5);
    expect([...seen].sort()).toEqual([...created].sort());
  });

  it('非法参数被拒绝', async () => {
    const adminId = await createUser(['ADMIN']);
    expect((await listUsers(adminId, '?limit=0')).status).toBe(400);
    expect((await listUsers(adminId, '?limit=101')).status).toBe(400);
    expect((await listUsers(adminId, '?role=SUPERUSER')).status).toBe(400);
    expect((await listUsers(adminId, '?status=bogus')).status).toBe(400);
    expect((await listUsers(adminId, '?cursor=not-a-cursor')).status).toBe(400);
    expect((await listUsers(adminId, '?unknown=1')).status).toBe(400);
    expect((await listUsers(adminId, `?q=${'x'.repeat(201)}`)).status).toBe(400);
  });

  it('无结果返回空页而不是 404', async () => {
    const adminId = await createUser(['ADMIN']);
    const res = await listUsers(adminId, `?q=${encodeURIComponent(`绝无此人${String(counter)}`)}`);
    expect(res.status).toBe(200);
    const page = (res.body as { data: UserListPage }).data;
    expect(page.items).toEqual([]);
    expect(page.hasMore).toBe(false);
  });
});
