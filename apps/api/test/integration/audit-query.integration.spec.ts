import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { redactAuditJson } from '../../src/lib/audit-redaction.js';
import { hashPassword } from '../../src/lib/password.js';
import { prisma } from '../../src/lib/prisma.js';
import { closeTestApp, createTestApp, request, serverOf } from '../app-harness.js';

import type { INestApplication } from '@nestjs/common';

/**
 * FD-006 审计日志查询后台的集成测试。
 *
 * 两组验证：
 *   1. **写入前脱敏**（§5 FD-006「敏感字段在写入前脱敏，不能只在 UI 隐藏」）
 *      —— 直接往 audit_log 写含密码/token 的载荷，验证落库时已被脱敏。
 *      这组测试不依赖查询端点：即便没有任何 UI，脱敏也必须成立。
 *   2. **查询端点**：权限、筛选、分页、敏感字段不出现在响应里。
 */

const PASSWORD = 'audit-query-integration-pw-2026';

let app: INestApplication | undefined;
const tokens = new Map<string, string>();
let counter = 0;

function ensureApp(): INestApplication {
  if (app === undefined) {
    throw new Error('app not initialised');
  }
  return app;
}

async function createUser(roles: string[]): Promise<string> {
  counter += 1;
  const email = `audit-${String(counter)}-${String(Date.now())}@example.test`;
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash: await hashPassword(PASSWORD),
      displayName: `审计用户 ${String(counter)}`,
      userRoles: { create: roles.map((role) => ({ role })) },
    },
  });
  const login = await request(serverOf(ensureApp()))
    .post('/api/v1/auth/login')
    .send({ email, password: PASSWORD });
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

interface AuditPage {
  items: {
    id: string;
    actorId: string | null;
    actorDisplayName: string | null;
    requestId: string | null;
    action: string;
    entityType: string;
    entityId: string;
    before: unknown;
    after: unknown;
    createdAt: string;
  }[];
  nextCursor: string | null;
  hasMore: boolean;
}

async function queryAudit(userId: string, query = ''): Promise<{ status: number; body: unknown }> {
  const res = await request(serverOf(ensureApp()))
    .get(`/api/v1/admin/audit-logs${query}`)
    .set('Authorization', authHeader(userId));
  return { status: res.status, body: res.body };
}

beforeAll(async () => {
  app = await createTestApp();
});

afterAll(async () => {
  await closeTestApp(app);
});

describe('FD-006: 写入前脱敏（不依赖任何 UI）', () => {
  it('直接写 audit_log 也会脱敏 password / token 类字段', async () => {
    const adminId = await createUser(['ADMIN']);

    await prisma.auditLog.create({
      data: {
        actorId: adminId,
        requestId: 'req-redact-1',
        action: 'test.sensitive',
        entityType: 'user',
        entityId: 'entity-1',
        afterJson: JSON.stringify({
          email: 'safe@example.test',
          password: 'plaintext-password',
          passwordHash: '$argon2id$v=19$m=1$hash',
          accessToken: 'eyJhbGciOi',
          refreshToken: 'nla_rt-value',
          cookie: 'nla_rt=abc',
          authorization: 'Bearer secret',
          apiSecret: 'shhh',
          nested: { secretKey: 'deep-secret', keep: 'visible' },
        }),
      },
    });

    const row = await prisma.auditLog.findFirst({
      where: { requestId: 'req-redact-1' },
    });
    expect(row).not.toBeNull();

    const stored = row?.afterJson ?? '';
    // 敏感值一个都不能落库
    expect(stored).not.toContain('plaintext-password');
    expect(stored).not.toContain('$argon2id$v=19$m=1$hash');
    expect(stored).not.toContain('eyJhbGciOi');
    expect(stored).not.toContain('nla_rt-value');
    expect(stored).not.toContain('shhh');
    expect(stored).not.toContain('deep-secret');
    // 非敏感字段照常保留 —— 脱敏不是把整条记录抹掉
    expect(stored).toContain('safe@example.test');
    expect(stored).toContain('visible');
  });

  it('beforeJson 同样脱敏', async () => {
    const adminId = await createUser(['ADMIN']);
    await prisma.auditLog.create({
      data: {
        actorId: adminId,
        requestId: 'req-redact-2',
        action: 'test.sensitive.before',
        entityType: 'user',
        entityId: 'entity-2',
        beforeJson: JSON.stringify({ password: 'old-plaintext', role: 'ADMIN' }),
      },
    });
    const row = await prisma.auditLog.findFirst({ where: { requestId: 'req-redact-2' } });
    expect(row?.beforeJson ?? '').not.toContain('old-plaintext');
    expect(row?.beforeJson ?? '').toContain('ADMIN');
  });

  it('脱敏函数本身的边界行为', () => {
    expect(redactAuditJson(null)).toBeNull();
    // 不是 JSON 时原样返回，绝不因为脱敏把数据搞丢
    expect(redactAuditJson('not json')).toBe('not json');
    // 数组里的敏感字段也要脱敏
    const redacted = redactAuditJson(JSON.stringify([{ password: 'p1' }, { ok: 'fine' }]));
    expect(redacted).not.toContain('p1');
    expect(redacted).toContain('fine');
    // 大小写与常见变体
    expect(redactAuditJson(JSON.stringify({ PASSWORD: 'x', Password: 'y' }))).not.toContain('"x"');
  });
});

describe('FD-006: 查询端点权限', () => {
  it('未认证返回 401', async () => {
    const res = await request(serverOf(ensureApp())).get('/api/v1/admin/audit-logs');
    expect(res.status).toBe(401);
  });

  it('EDITOR / REVIEWER 返回 403', async () => {
    const editorId = await createUser(['EDITOR']);
    const reviewerId = await createUser(['REVIEWER']);
    for (const id of [editorId, reviewerId]) {
      const res = await queryAudit(id);
      expect(res.status).toBe(403);
      expect((res.body as { error: { code: string } }).error.code).toBe('FORBIDDEN');
    }
  });

  it('ADMIN 可读', async () => {
    const adminId = await createUser(['ADMIN']);
    expect((await queryAudit(adminId)).status).toBe(200);
  });
});

describe('FD-006: 查询端点筛选', () => {
  it('按 action 精确筛选', async () => {
    const adminId = await createUser(['ADMIN']);
    await prisma.auditLog.create({
      data: {
        actorId: adminId,
        requestId: 'req-filter-action',
        action: 'filter.marker.action',
        entityType: 'user',
        entityId: 'e1',
      },
    });
    const res = await queryAudit(adminId, '?action=filter.marker.action');
    expect(res.status).toBe(200);
    const page = (res.body as { data: AuditPage }).data;
    expect(page.items.every((item) => item.action === 'filter.marker.action')).toBe(true);
    expect(page.items.length).toBeGreaterThan(0);
  });

  it('按 entityType 与 entityId 筛选', async () => {
    const adminId = await createUser(['ADMIN']);
    await prisma.auditLog.create({
      data: {
        actorId: adminId,
        requestId: 'req-filter-entity',
        action: 'filter.marker.entity',
        entityType: 'custom_type',
        entityId: 'entity-xyz',
      },
    });

    const byType = await queryAudit(adminId, '?entityType=custom_type');
    const typePage = (byType.body as { data: AuditPage }).data;
    expect(typePage.items.every((item) => item.entityType === 'custom_type')).toBe(true);

    const byId = await queryAudit(adminId, '?entityId=entity-xyz');
    const idPage = (byId.body as { data: AuditPage }).data;
    expect(idPage.items.every((item) => item.entityId === 'entity-xyz')).toBe(true);
  });

  it('按 actorId 筛选', async () => {
    const adminId = await createUser(['ADMIN']);
    const otherId = await createUser(['EDITOR']);
    await prisma.auditLog.create({
      data: {
        actorId: otherId,
        requestId: 'req-filter-actor',
        action: 'filter.marker.actor',
        entityType: 'user',
        entityId: 'e2',
      },
    });

    const res = await queryAudit(adminId, `?actorId=${otherId}`);
    expect(res.status).toBe(200);
    const page = (res.body as { data: AuditPage }).data;
    expect(page.items.every((item) => item.actorId === otherId)).toBe(true);
  });

  it('按时间范围筛选', async () => {
    const adminId = await createUser(['ADMIN']);
    const past = new Date('2020-01-01T00:00:00.000Z');
    const future = new Date('2099-01-01T00:00:00.000Z');
    await prisma.auditLog.create({
      data: {
        actorId: adminId,
        requestId: 'req-filter-time',
        action: 'filter.marker.time',
        entityType: 'user',
        entityId: 'e3',
        createdAt: new Date('2021-06-01T00:00:00.000Z'),
      },
    });

    /**
     * 必须同时按 action 收窄。
     *
     * 只按时间范围筛会命中**全库** 2020~2099 的所有审计记录，而返回的是按
     * createdAt 倒序的第一页 —— 2021 年那条早已被更新的记录挤出第一页。
     * 这不是实现的 bug，是"未收窄的筛选 + 分页"必然的结果；
     * 测试若不加 action 就会单跑绿、全量跑红（依赖库里恰好没那么多记录）。
     */
    const hit = await queryAudit(
      adminId,
      `?action=filter.marker.time&from=${encodeURIComponent(past.toISOString())}` +
        `&to=${encodeURIComponent(future.toISOString())}`,
    );
    expect(hit.status).toBe(200);
    const page = (hit.body as { data: AuditPage }).data;
    expect(page.items.some((item) => item.action === 'filter.marker.time')).toBe(true);

    // 范围排除了 2021 年 → 一条都不该命中
    const miss = await queryAudit(
      adminId,
      `?action=filter.marker.time&from=${encodeURIComponent(future.toISOString())}` +
        `&to=${encodeURIComponent(future.toISOString())}`,
    );
    expect(miss.status).toBe(200);
    const missPage = (miss.body as { data: AuditPage }).data;
    expect(missPage.items).toEqual([]);
  });

  it('非法参数被拒绝', async () => {
    const adminId = await createUser(['ADMIN']);
    expect((await queryAudit(adminId, '?limit=0')).status).toBe(400);
    expect((await queryAudit(adminId, '?limit=101')).status).toBe(400);
    expect((await queryAudit(adminId, '?from=not-a-date')).status).toBe(400);
    expect((await queryAudit(adminId, '?from=2026-13-45T00:00:00Z')).status).toBe(400);
    expect((await queryAudit(adminId, '?cursor=bad-cursor')).status).toBe(400);
    expect((await queryAudit(adminId, '?unknown=1')).status).toBe(400);
  });

  it('无结果返回空页', async () => {
    const adminId = await createUser(['ADMIN']);
    const res = await queryAudit(adminId, '?action=definitely.not.exists.action');
    expect(res.status).toBe(200);
    const page = (res.body as { data: AuditPage }).data;
    expect(page.items).toEqual([]);
    expect(page.nextCursor).toBeNull();
  });
});

describe('FD-006: 分页稳定性与敏感字段', () => {
  it('分页不重不漏且顺序稳定（createdAt + id 全序）', async () => {
    const adminId = await createUser(['ADMIN']);
    const marker = `分页标记${String(counter)}`;
    const created: string[] = [];
    for (let i = 0; i < 5; i += 1) {
      const row = await prisma.auditLog.create({
        data: {
          actorId: adminId,
          requestId: `req-page-${String(counter)}-${String(i)}`,
          action: marker,
          entityType: 'user',
          entityId: `page-entity-${String(i)}`,
        },
      });
      created.push(row.id);
    }

    const seen: string[] = [];
    let cursor: string | null = null;
    for (let i = 0; i < 5; i += 1) {
      const query = `?action=${encodeURIComponent(marker)}&limit=2${cursor === null ? '' : `&cursor=${encodeURIComponent(cursor)}`}`;
      const res = await queryAudit(adminId, query);
      expect(res.status).toBe(200);
      const page = (res.body as { data: AuditPage }).data;
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

  it('同一游标重放得到同一页', async () => {
    const adminId = await createUser(['ADMIN']);
    const marker = `重放标记${String(counter)}`;
    for (let i = 0; i < 3; i += 1) {
      await prisma.auditLog.create({
        data: {
          actorId: adminId,
          requestId: `req-replay-${String(counter)}-${String(i)}`,
          action: marker,
          entityType: 'user',
          entityId: `replay-${String(i)}`,
        },
      });
    }

    const first = await queryAudit(adminId, `?action=${encodeURIComponent(marker)}&limit=1`);
    const firstPage = (first.body as { data: AuditPage }).data;
    expect(firstPage.nextCursor).toBeTruthy();

    const query = `?action=${encodeURIComponent(marker)}&limit=1&cursor=${encodeURIComponent(firstPage.nextCursor ?? '')}`;
    const second = await queryAudit(adminId, query);
    const replay = await queryAudit(adminId, query);
    expect((replay.body as { data: AuditPage }).data.items.map((item) => item.id)).toEqual(
      (second.body as { data: AuditPage }).data.items.map((item) => item.id),
    );
  });

  it('响应里没有密码 / token 的**值**（字段名保留、值替换）', async () => {
    const adminId = await createUser(['ADMIN']);
    await prisma.auditLog.create({
      data: {
        actorId: adminId,
        requestId: `req-sensitive-${String(counter)}`,
        action: 'sensitive.check',
        entityType: 'user',
        entityId: 'sensitive-entity',
        afterJson: JSON.stringify({ password: 'leak-me', nested: { token: 'tok' } }),
      },
    });

    const res = await queryAudit(adminId, '?action=sensitive.check');
    expect(res.status).toBe(200);
    const item = (res.body as { data: AuditPage }).data.items[0];

    // 值不能出现
    expect(JSON.stringify(res.body)).not.toContain('leak-me');
    expect(JSON.stringify(res.body)).not.toContain('"tok"');
    expect(JSON.stringify(res.body)).not.toContain('passwordHash');

    // 字段名保留、值替换：审计要能让人看出"这里原本有个敏感字段"，
    // 保留 key 但不给值，才是既可追溯又不泄露的形态。
    const after = item?.after as { password?: unknown; nested?: { token?: unknown } };
    expect(after?.password).toBe('[REDACTED]');
    expect(after?.nested?.token).toBe('[REDACTED]');
  });

  it('before / after 以已解析的 JSON 返回（不是字符串）', async () => {
    const adminId = await createUser(['ADMIN']);
    await prisma.auditLog.create({
      data: {
        actorId: adminId,
        requestId: `req-json-${String(counter)}`,
        action: 'json.shape',
        entityType: 'user',
        entityId: 'json-entity',
        beforeJson: JSON.stringify({ version: 1 }),
        afterJson: JSON.stringify({ version: 2, note: '（示例）' }),
      },
    });

    const res = await queryAudit(adminId, '?action=json.shape');
    const item = (res.body as { data: AuditPage }).data.items[0];
    expect(item?.before).toEqual({ version: 1 });
    expect(item?.after).toEqual({ version: 2, note: '（示例）' });
    // 空的一侧是 null，不是字符串 "null"
    expect(item?.before === null || typeof item?.before === 'object').toBe(true);
  });

  it('日志只读：没有修改或删除端点', async () => {
    const adminId = await createUser(['ADMIN']);

    const patched = await request(serverOf(ensureApp()))
      .patch('/api/v1/admin/audit-logs')
      .set('Authorization', authHeader(adminId))
      .send({ action: 'tampered' });
    expect(patched.status).toBe(404);

    const deleted = await request(serverOf(ensureApp()))
      .delete('/api/v1/admin/audit-logs/some-id')
      .set('Authorization', authHeader(adminId));
    expect(deleted.status).toBe(404);
  });
});
