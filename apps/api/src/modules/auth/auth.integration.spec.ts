import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { INestApplication } from '@nestjs/common';

import {
  closeTestApp,
  createTestApp,
  prisma,
  request,
  serverOf,
} from '../../../test/app-harness.js';
import { hashPassword } from '../../lib/password.js';

/**
 * 认证集成测试（P1-02 / P1-03）。
 *
 * AGENTS.md §7.1 要求「API 权限和事务有真实数据库集成测试」。
 * 本文件对真实 SQLite 库（global-setup 已跑迁移）验证：
 *   - 登录成功 / 失败（统一文案防枚举）
 *   - refresh token 旋转 + 重放检测
 *   - 禁用账号不可登录
 *   - 限流（5 次/分钟）
 *   - 401 / 403 的真实 HTTP 响应
 */

const PASSWORD = 'integration-test-password-2026';

interface TestUser {
  id: string;
  email: string;
  roles: string[];
}

let app: INestApplication | undefined;

async function createUser(email: string, roles: string[], disabled = false): Promise<TestUser> {
  const passwordHash = await hashPassword(PASSWORD);
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash,
      displayName: `测试 ${email}`,
      disabledAt: disabled ? new Date() : null,
      userRoles: { create: roles.map((role) => ({ role })) },
    },
    include: { userRoles: true },
  });
  return {
    id: user.id,
    email: user.email,
    roles: user.userRoles.map((r) => r.role),
  };
}

beforeAll(async () => {
  app = await createTestApp();
});

afterAll(async () => {
  await closeTestApp(app);
});

describe('POST /api/v1/auth/login', () => {
  it('issues an access token for valid credentials', async () => {
    const user = await createUser('editor-ok@example.test', ['EDITOR']);

    const res = await request(serverOf(app))
      .post('/api/v1/auth/login')
      .send({ email: user.email, password: PASSWORD });

    expect(res.status).toBe(200);
    const body = res.body as { data: { accessToken: string; user: { id: string; roles: string[] } } };
    expect(body.data.accessToken.split('.')).toHaveLength(3);
    expect(body.data.user.id).toBe(user.id);
    expect(body.data.user.roles).toEqual(['EDITOR']);
  });

  it('is case-insensitive on email', async () => {
    const user = await createUser('case-test@example.test', ['EDITOR']);
    const res = await request(serverOf(app))
      .post('/api/v1/auth/login')
      .send({ email: 'CASE-TEST@EXAMPLE.TEST', password: PASSWORD });
    expect(res.status).toBe(200);
  });

  it('returns 401 with a generic message for a wrong password (no account enumeration)', async () => {
    const user = await createUser('wrong-pw@example.test', ['EDITOR']);
    const res = await request(serverOf(app))
      .post('/api/v1/auth/login')
      .send({ email: user.email, password: 'definitely-the-wrong-password' });

    expect(res.status).toBe(401);
    const body = res.body as { error: { code: string; message: string; requestId: string } };
    expect(body.error.code).toBe('INVALID_CREDENTIALS');
    expect(body.error.message).toBe('邮箱或密码不正确，或账号不可用');
    expect(body.error.requestId).toBeTruthy();
  });

  it('returns the SAME message for a non-existent account', async () => {
    const res = await request(serverOf(app))
      .post('/api/v1/auth/login')
      .send({ email: 'nobody-at-all@example.test', password: PASSWORD });

    expect(res.status).toBe(401);
    const body = res.body as { error: { code: string; message: string } };
    expect(body.error.message).toBe('邮箱或密码不正确，或账号不可用');
  });

  it('rejects a disabled account with the same generic message', async () => {
    const user = await createUser('disabled@example.test', ['EDITOR'], true);
    const res = await request(serverOf(app))
      .post('/api/v1/auth/login')
      .send({ email: user.email, password: PASSWORD });

    expect(res.status).toBe(401);
    const body = res.body as { error: { message: string } };
    expect(body.error.message).toBe('邮箱或密码不正确，或账号不可用');
  });

  it('rejects a non-object body (DTO whitelist)', async () => {
    const res = await request(serverOf(app))
      .post('/api/v1/auth/login')
      .send({ email: 'a@b.test', password: PASSWORD, isAdmin: true });
    expect(res.status).toBe(400);
    const body = res.body as { error: { code: string } };
    expect(body.error.code).toBe('VALIDATION_FAILED');
  });

  it('rejects a malformed email', async () => {
    const res = await request(serverOf(app))
      .post('/api/v1/auth/login')
      .send({ email: 'not-an-email', password: PASSWORD });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/v1/auth/refresh', () => {
  it('rotates the refresh token (old one becomes invalid)', async () => {
    const user = await createUser('rotate@example.test', ['EDITOR']);

    const login = await request(serverOf(app))
      .post('/api/v1/auth/login')
      .send({ email: user.email, password: PASSWORD });
    expect(login.status).toBe(200);

    const firstCookie = extractCookie(login);
    expect(firstCookie).toBeTruthy();

    const firstRefresh = await request(serverOf(app))
      .post('/api/v1/auth/refresh')
      .set('Cookie', firstCookie!);
    expect(firstRefresh.status).toBe(200);

    // 重放旧 token → 应被识别为 reuse 并拒绝
    const replay = await request(serverOf(app))
      .post('/api/v1/auth/refresh')
      .set('Cookie', firstCookie!);
    expect(replay.status).toBe(401);
    const body = replay.body as { error: { code: string } };
    expect(body.error.code).toBe('TOKEN_REVOKED');
  });

  it('rejects a refresh with no cookie', async () => {
    const res = await request(serverOf(app)).post('/api/v1/auth/refresh').send({});
    expect(res.status).toBe(401);
    const body = res.body as { error: { code: string } };
    expect(body.error.code).toBe('TOKEN_REVOKED');
  });

  it('rejects a forged refresh cookie', async () => {
    const res = await request(serverOf(app))
      .post('/api/v1/auth/refresh')
      .set('Cookie', 'nla_rt=forged-token-that-never-existed-000000');
    expect(res.status).toBe(401);
  });
});

describe('POST /api/v1/auth/logout', () => {
  it('revokes the session and is idempotent', async () => {
    const user = await createUser('logout@example.test', ['EDITOR']);
    const login = await request(serverOf(app))
      .post('/api/v1/auth/login')
      .send({ email: user.email, password: PASSWORD });
    const cookie = extractCookie(login);
    expect(cookie).toBeTruthy();

    const first = await request(serverOf(app)).post('/api/v1/auth/logout').set('Cookie', cookie!);
    expect(first.status).toBe(204);

    // 幂等：第二次仍 204
    const second = await request(serverOf(app)).post('/api/v1/auth/logout').set('Cookie', cookie!);
    expect(second.status).toBe(204);

    // token 已撤销，refresh 失败
    const refresh = await request(serverOf(app))
      .post('/api/v1/auth/refresh')
      .set('Cookie', cookie!);
    expect(refresh.status).toBe(401);
  });
});

describe('GET /api/v1/auth/me — 401 / 403', () => {
  it('returns 401 without a token', async () => {
    const res = await request(serverOf(app)).get('/api/v1/auth/me');
    expect(res.status).toBe(401);
    const body = res.body as { error: { code: string; requestId: string } };
    expect(body.error.code).toBe('UNAUTHORIZED');
    expect(body.error.requestId).toBeTruthy();
  });

  it('returns 401 for a malformed bearer token', async () => {
    const res = await request(serverOf(app))
      .get('/api/v1/auth/me')
      .set('Authorization', 'Bearer not-a-jwt');
    expect(res.status).toBe(401);
  });

  it('returns 401 for a token signed with a different secret', async () => {
    // 结构合法但签名不对
    const res = await request(serverOf(app))
      .get('/api/v1/auth/me')
      .set('Authorization', 'Bearer aGVhZGVy.cGF5bG9hZA.bm90LWEtc2lnbmF0dXJl');
    expect(res.status).toBe(401);
  });

  it('returns 200 with a valid token', async () => {
    const user = await createUser('me-ok@example.test', ['EDITOR']);
    const login = await request(serverOf(app))
      .post('/api/v1/auth/login')
      .send({ email: user.email, password: PASSWORD });
    const accessToken = (login.body as { data: { accessToken: string } }).data.accessToken;

    const res = await request(serverOf(app))
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
    const body = res.body as { data: { id: string; roles: string[] } };
    expect(body.data.id).toBe(user.id);
  });
});

describe('RBAC — 403 for insufficient role (AGENTS.md §4.2)', () => {
  it('rejects EDITOR from admin-only user management', async () => {
    const editor = await createUser('rbac-editor@example.test', ['EDITOR']);
    const login = await request(serverOf(app))
      .post('/api/v1/auth/login')
      .send({ email: editor.email, password: PASSWORD });
    const accessToken = (login.body as { data: { accessToken: string } }).data.accessToken;

    const res = await request(serverOf(app))
      .get('/api/v1/admin/users')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(403);
    const body = res.body as { error: { code: string } };
    expect(body.error.code).toBe('FORBIDDEN');
  });

  it('allows ADMIN into admin-only endpoints', async () => {
    const admin = await createUser('rbac-admin@example.test', ['ADMIN']);
    const login = await request(serverOf(app))
      .post('/api/v1/auth/login')
      .send({ email: admin.email, password: PASSWORD });
    const accessToken = (login.body as { data: { accessToken: string } }).data.accessToken;

    const res = await request(serverOf(app))
      .get('/api/v1/admin/users')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
  });

  it('returns 401 (not 403) when unauthenticated on an admin endpoint', async () => {
    // 守卫顺序：Auth 先跑，所以未认证是 401 而不是 403
    const res = await request(serverOf(app)).get('/api/v1/admin/users');
    expect(res.status).toBe(401);
  });

  it('allows any authenticated role into /auth/me', async () => {
    const editor = await createUser('me-editor@example.test', ['EDITOR']);
    const login = await request(serverOf(app))
      .post('/api/v1/auth/login')
      .send({ email: editor.email, password: PASSWORD });
    expect(login.status).toBe(200);
    const accessToken = (login.body as { data: { accessToken: string } }).data.accessToken;

    const res = await request(serverOf(app))
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
  });
});

describe('rate limiting', () => {
  it('returns 429 after exceeding the login rate limit', async () => {
    // 集成测试配置把 AUTH_LOGIN_RATE_LIMIT 放宽到 1000，避免与其它用例
    // 抢配额（它们都走 127.0.0.1）。所以这里不能靠"多打几次"触发 429。
    //
    // 正确做法：用**独立进程语义**验证 —— 起一个 env 收紧到 3 的新 app。
    // 因为 throttle 阈值在模块加载期从 env 读取，`vi.resetModules()` +
    // 动态 import 才能让新阈值生效。
    const previous = process.env['AUTH_LOGIN_RATE_LIMIT'];
    process.env['AUTH_LOGIN_RATE_LIMIT'] = '3';
    vi.resetModules();

    // 动态 import 会重新执行 auth.controller.ts，此时读到 limit=3。
    const strictApp = await (async () => {
      const { createTestApp: create } = await import('../../../test/app-harness.js');
      return create();
    })();

    try {
      const statuses: number[] = [];
      for (let i = 0; i < 6; i += 1) {
        const res = await request(serverOf(strictApp))
          .post('/api/v1/auth/login')
          .send({ email: `ratelimit-${String(Date.now())}-${String(i)}@example.test`, password: PASSWORD });
        statuses.push(res.status);
        if (res.status === 429) {
          const body = res.body as { error: { code: string } };
          expect(body.error.code).toBe('RATE_LIMITED');
        }
      }
      expect(statuses).toContain(429);
      // 前 3 次应当仍是 401（凭据错误），第 4 次起被限流
      expect(statuses.slice(0, 3)).toEqual([401, 401, 401]);
    } finally {
      await closeTestApp(strictApp);
      if (previous === undefined) {
        delete process.env['AUTH_LOGIN_RATE_LIMIT'];
      } else {
        process.env['AUTH_LOGIN_RATE_LIMIT'] = previous;
      }
      vi.resetModules();
    }
  });
});

describe('audit trail (P1-07 — append-only)', () => {
  it('writes an audit record for login success', async () => {
    const user = await createUser('audit-login@example.test', ['EDITOR']);
    await request(serverOf(app))
      .post('/api/v1/auth/login')
      .send({ email: user.email, password: PASSWORD });

    const rows = await prisma.auditLog.findMany({
      where: { actorId: user.id, action: 'auth.login.success' },
    });
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });

  it('writes an audit record for login failure with actorId=null', async () => {
    await request(serverOf(app))
      .post('/api/v1/auth/login')
      .send({ email: 'audit-fail@example.test', password: 'wrong-password-entirely' });

    const rows = await prisma.auditLog.findMany({
      where: { action: 'auth.login.failed' },
    });
    expect(rows.length).toBeGreaterThanOrEqual(1);
    // 失败记录的 actorId 必须为 null（此时还没认证）
    expect(rows[0]?.actorId).toBeNull();
  });

  it('never stores the plaintext refresh token in the DB', async () => {
    const user = await createUser('audit-secret@example.test', ['EDITOR']);
    const login = await request(serverOf(app))
      .post('/api/v1/auth/login')
      .send({ email: user.email, password: PASSWORD });
    const cookie = extractCookie(login);
    const plain = /nla_rt=([^;]+)/.exec(cookie ?? '')?.[1];

    expect(plain).toBeTruthy();
    const rows = await prisma.refreshToken.findMany({ where: { userId: user.id } });
    for (const row of rows) {
      expect(row.tokenHash).not.toBe(plain);
      expect(row.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    }
  });
});

/** 从 set-cookie 里取出 refresh token cookie 头。 */
function extractCookie(res: { headers: Record<string, unknown> }): string | null {
  const raw = res.headers['set-cookie'];
  const list = Array.isArray(raw) ? raw : typeof raw === 'string' ? [raw] : [];
  for (const item of list) {
    if (typeof item === 'string' && item.startsWith('nla_rt=')) {
      return item.split(';')[0] ?? null;
    }
  }
  return null;
}