import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { hashPassword } from '../../src/lib/password.js';
import { closeTestApp, createTestApp, prisma, request, serverOf } from '../app-harness.js';

import type { INestApplication } from '@nestjs/common';

/**
 * FD-007 首页槽位管理的集成测试。
 *
 * 服务端已有 `GET/PATCH /admin/homepage-slots`，写侧校验（草稿不能上首页、
 * 时间窗合法、审计）本轮补测试锁住；读侧本轮新增两件事：
 *   - 槽位列表要能看出**为什么首页上不显示**（未开始 / 已过期 / 内容被撤回）
 *   - 提供「可挂载内容」检索，编辑不必手填 contentId
 */

const PASSWORD = 'homepage-slot-integration-pw-2026';

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
  const email = `slot-${String(counter)}-${String(Date.now())}@example.test`;
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash: await hashPassword(PASSWORD),
      displayName: `槽位用户 ${String(counter)}`,
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

interface AdminSlot {
  slotKey: string;
  contentId: string | null;
  contentTitle: string | null;
  contentStatus: string | null;
  position: number;
  startsAt: string | null;
  endsAt: string | null;
  /** ACTIVE / SCHEDULED / EXPIRED —— 当前是否在时间窗内。 */
  activeState: string;
  /** 内容是否已撤回 / 归档 —— 即使槽位在窗口内也不会上首页。 */
  contentUnavailable: boolean;
  /** 同一内容是否被挂在多个槽位上。 */
  conflictWith: string[];
  updatedAt: string;
}

/** 直接建内容，绕过状态机（状态机只管流转，不管初始状态）。 */
async function createContent(
  userId: string,
  status: 'DRAFT' | 'PUBLISHED',
  title?: string,
): Promise<string> {
  counter += 1;
  const row = await prisma.content.create({
    data: {
      type: 'TOPIC',
      slug: `slot-content-${String(counter)}-${String(Date.now())}`,
      title: title ?? `槽位内容 ${String(counter)}（示例）`,
      bodyJson: JSON.stringify({
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: '示例正文。' }] }],
      }),
      status,
      publishedAt: status === 'PUBLISHED' ? new Date() : null,
      createdById: userId,
      updatedById: userId,
    },
  });
  return row.id;
}

async function putSlot(
  userId: string,
  body: {
    slotKey: string;
    contentId: string | null;
    position?: number;
    startsAt?: string | null;
    endsAt?: string | null;
  },
): Promise<{ status: number; body: unknown }> {
  const res = await request(serverOf(ensureApp()))
    .patch('/api/v1/admin/homepage-slots')
    .set('Authorization', authHeader(userId))
    .send({
      position: 0,
      startsAt: null,
      endsAt: null,
      ...body,
    });
  return { status: res.status, body: res.body };
}

async function listSlots(userId: string): Promise<{ status: number; body: unknown }> {
  const res = await request(serverOf(ensureApp()))
    .get('/api/v1/admin/homepage-slots')
    .set('Authorization', authHeader(userId));
  return { status: res.status, body: res.body };
}

beforeAll(async () => {
  app = await createTestApp();
});

afterAll(async () => {
  await closeTestApp(app);
});

describe('FD-007: 写侧规则（服务端最终校验）', () => {
  it('草稿不能挂到首页槽位', async () => {
    const adminId = await createUser(['ADMIN']);
    const draftId = await createContent(adminId, 'DRAFT');

    const res = await putSlot(adminId, { slotKey: 'hero', contentId: draftId });
    expect(res.status).toBe(403);
    expect((res.body as { error: { message: string } }).error.message).toContain('已发布');
  });

  it('已归档内容不能挂到首页槽位', async () => {
    const adminId = await createUser(['ADMIN']);
    const publishedId = await createContent(adminId, 'PUBLISHED');
    await prisma.content.update({
      where: { id: publishedId },
      data: { archivedAt: new Date() },
    });

    const res = await putSlot(adminId, { slotKey: 'hero', contentId: publishedId });
    expect(res.status).toBe(403);
  });

  it('时间窗不合法（startsAt 晚于 endsAt）被拒绝', async () => {
    const adminId = await createUser(['ADMIN']);
    const res = await putSlot(adminId, {
      slotKey: 'featured',
      contentId: null,
      startsAt: '2030-01-02T00:00:00.000Z',
      endsAt: '2030-01-01T00:00:00.000Z',
    });
    expect(res.status).toBe(403);
    expect((res.body as { error: { message: string } }).error.message).toContain('startsAt');
  });

  it('未知槽位键被拒绝（受控字典）', async () => {
    const adminId = await createUser(['ADMIN']);
    const res = await putSlot(adminId, { slotKey: 'not_a_slot', contentId: null });
    expect(res.status).toBe(400);
  });

  it('未知字段被 DTO 白名单拒绝', async () => {
    const adminId = await createUser(['ADMIN']);
    const res = await request(serverOf(ensureApp()))
      .patch('/api/v1/admin/homepage-slots')
      .set('Authorization', authHeader(adminId))
      .send({ slotKey: 'hero', contentId: null, position: 0, bypassStatusCheck: true });
    expect(res.status).toBe(400);
  });

  it('配置槽位写入审计', async () => {
    const adminId = await createUser(['ADMIN']);
    const contentId = await createContent(adminId, 'PUBLISHED');
    await putSlot(adminId, { slotKey: 'routes', contentId, position: 2 });

    const audit = await prisma.auditLog.findFirst({
      where: { action: 'homepage.configure_slot', entityType: 'homepage_slot' },
      orderBy: { createdAt: 'desc' },
    });
    expect(audit).not.toBeNull();
    expect(audit?.afterJson).toContain(contentId);
  });
});

describe('FD-007: 读侧权限', () => {
  it('未认证 401；EDITOR / REVIEWER 403', async () => {
    const anon = await request(serverOf(ensureApp())).get('/api/v1/admin/homepage-slots');
    expect(anon.status).toBe(401);

    const editorId = await createUser(['EDITOR']);
    const reviewerId = await createUser(['REVIEWER']);
    expect((await listSlots(editorId)).status).toBe(403);
    expect((await listSlots(reviewerId)).status).toBe(403);
  });

  it('ADMIN 可读', async () => {
    const adminId = await createUser(['ADMIN']);
    expect((await listSlots(adminId)).status).toBe(200);
  });
});

describe('FD-007: 槽位列表要能解释"为什么首页上不显示"', () => {
  it('未开始的槽位标记为 SCHEDULED', async () => {
    const adminId = await createUser(['ADMIN']);
    const contentId = await createContent(adminId, 'PUBLISHED');
    await putSlot(adminId, {
      slotKey: 'hero',
      contentId,
      startsAt: '2099-01-01T00:00:00.000Z',
      endsAt: '2099-12-31T00:00:00.000Z',
    });

    const res = await listSlots(adminId);
    const slots = (res.body as { data: AdminSlot[] }).data;
    const hero = slots.find((slot) => slot.slotKey === 'hero');
    expect(hero?.activeState).toBe('SCHEDULED');
  });

  it('已过期的槽位标记为 EXPIRED', async () => {
    const adminId = await createUser(['ADMIN']);
    const contentId = await createContent(adminId, 'PUBLISHED');
    await putSlot(adminId, {
      slotKey: 'featured',
      contentId,
      startsAt: '2020-01-01T00:00:00.000Z',
      endsAt: '2020-12-31T00:00:00.000Z',
    });

    const res = await listSlots(adminId);
    const slots = (res.body as { data: AdminSlot[] }).data;
    const featured = slots.find((slot) => slot.slotKey === 'featured');
    expect(featured?.activeState).toBe('EXPIRED');
  });

  it('窗口内的槽位是 ACTIVE，并带内容当前状态', async () => {
    const adminId = await createUser(['ADMIN']);
    const contentId = await createContent(adminId, 'PUBLISHED');
    await putSlot(adminId, { slotKey: 'latest', contentId });

    const res = await listSlots(adminId);
    const slots = (res.body as { data: AdminSlot[] }).data;
    const latest = slots.find((slot) => slot.slotKey === 'latest');
    expect(latest?.activeState).toBe('ACTIVE');
    expect(latest?.contentStatus).toBe('PUBLISHED');
    expect(latest?.contentUnavailable).toBe(false);
  });

  it('内容被撤回后，槽位标出 contentUnavailable（撤回是独立于时间窗的原因）', async () => {
    const adminId = await createUser(['ADMIN']);
    const contentId = await createContent(adminId, 'PUBLISHED');
    await putSlot(adminId, { slotKey: 'places', contentId });

    // 内容退回草稿：槽位本身还在时间窗内，但公开接口会把它置空
    await prisma.content.update({ where: { id: contentId }, data: { status: 'DRAFT' } });

    const res = await listSlots(adminId);
    const slots = (res.body as { data: AdminSlot[] }).data;
    const places = slots.find((slot) => slot.slotKey === 'places');
    expect(places?.activeState).toBe('ACTIVE');
    expect(places?.contentStatus).toBe('DRAFT');
    expect(places?.contentUnavailable).toBe(true);
  });

  it('内容被删除后槽位被级联删除，列表里不再出现（不留下悬空引用）', async () => {
    const adminId = await createUser(['ADMIN']);
    const contentId = await createContent(adminId, 'PUBLISHED');
    await putSlot(adminId, { slotKey: 'routes', contentId });

    await prisma.content.delete({ where: { id: contentId } });

    const res = await listSlots(adminId);
    const slots = (res.body as { data: AdminSlot[] }).data;
    expect(slots.find((slot) => slot.contentId === contentId)).toBeUndefined();
  });

  it('同一内容挂在多个槽位上时给出冲突提示', async () => {
    const adminId = await createUser(['ADMIN']);
    const contentId = await createContent(adminId, 'PUBLISHED');

    await putSlot(adminId, { slotKey: 'hero', contentId, position: 0 });
    await putSlot(adminId, { slotKey: 'featured', contentId, position: 1 });

    const res = await listSlots(adminId);
    const slots = (res.body as { data: AdminSlot[] }).data;
    const hero = slots.find((slot) => slot.slotKey === 'hero');
    const featured = slots.find((slot) => slot.slotKey === 'featured');
    expect(hero?.conflictWith).toEqual(['featured']);
    expect(featured?.conflictWith).toEqual(['hero']);
  });
});

describe('FD-007: 可挂载内容检索', () => {
  it('只返回已发布且未归档的内容', async () => {
    const adminId = await createUser(['ADMIN']);
    const marker = `可挂载${String(counter)}`;
    const publishedId = await createContent(adminId, 'PUBLISHED', `${marker}-可挂载`);
    const draftId = await createContent(adminId, 'DRAFT', `${marker}-草稿`);
    const archivedId = await createContent(adminId, 'PUBLISHED', `${marker}-已归档`);
    await prisma.content.update({
      where: { id: archivedId },
      data: { archivedAt: new Date() },
    });

    const res = await request(serverOf(ensureApp()))
      .get(`/api/v1/admin/homepage-slots/candidates?q=${encodeURIComponent(marker)}`)
      .set('Authorization', authHeader(adminId));
    expect(res.status).toBe(200);

    const ids = (res.body as { data: { items: { id: string }[] } }).data.items.map(
      (item) => item.id,
    );
    expect(ids).toContain(publishedId);
    expect(ids).not.toContain(draftId);
    expect(ids).not.toContain(archivedId);
  });

  it('返回内容类型与状态，便于编辑判断', async () => {
    const adminId = await createUser(['ADMIN']);
    const marker = `字段${String(counter)}`;
    await createContent(adminId, 'PUBLISHED', `${marker}-条目`);

    const res = await request(serverOf(ensureApp()))
      .get(`/api/v1/admin/homepage-slots/candidates?q=${encodeURIComponent(marker)}`)
      .set('Authorization', authHeader(adminId));
    const item = (res.body as { data: { items: Record<string, unknown>[] } }).data.items[0];
    expect(item).toBeDefined();
    expect(Object.keys(item ?? {}).sort()).toEqual([
      'id',
      'publishedAt',
      'slug',
      'status',
      'title',
      'type',
    ]);
    expect(item?.status).toBe('PUBLISHED');
  });

  it('非 ADMIN 不能检索候选内容', async () => {
    const editorId = await createUser(['EDITOR']);
    const res = await request(serverOf(ensureApp()))
      .get('/api/v1/admin/homepage-slots/candidates')
      .set('Authorization', authHeader(editorId));
    expect(res.status).toBe(403);
  });

  it('超长关键词与非法分页被拒绝', async () => {
    const adminId = await createUser(['ADMIN']);
    const long = await request(serverOf(ensureApp()))
      .get(`/api/v1/admin/homepage-slots/candidates?q=${'x'.repeat(201)}`)
      .set('Authorization', authHeader(adminId));
    expect(long.status).toBe(400);

    const badLimit = await request(serverOf(ensureApp()))
      .get('/api/v1/admin/homepage-slots/candidates?limit=101')
      .set('Authorization', authHeader(adminId));
    expect(badLimit.status).toBe(400);
  });

  it('候选检索与槽位配置端点共存（路由不冲突）', async () => {
    const adminId = await createUser(['ADMIN']);
    // PATCH /admin/homepage-slots 仍然可用
    const contentId = await createContent(adminId, 'PUBLISHED');
    const res = await putSlot(adminId, { slotKey: 'hero', contentId });
    expect(res.status).toBe(200);
  });
});

describe('FD-007: 首页预览不得绕过发布状态', () => {
  it('公开首页不返回草稿槽位内容', async () => {
    const adminId = await createUser(['ADMIN']);
    const draftId = await createContent(adminId, 'DRAFT');
    // 直接写库绕过 API（模拟历史脏数据 / 未来回归）
    await prisma.homepageSlot.upsert({
      where: { slotKey: 'latest' },
      create: {
        slotKey: 'latest',
        contentId: draftId,
        position: 0,
        updatedBy: adminId,
      },
      update: { contentId: draftId, updatedBy: adminId },
    });

    const res = await request(serverOf(ensureApp())).get('/api/v1/homepage');
    expect(res.status).toBe(200);
    const slots = (res.body as { data: { slots: { slotKey: string; content: unknown }[] } }).data
      .slots;
    const latest = slots.find((slot) => slot.slotKey === 'latest');
    // 公开接口把不可用内容置空，而不是把草稿标题漏出去
    expect(latest?.content).toBeNull();
  });

  it('公开首页不返回过期槽位', async () => {
    const adminId = await createUser(['ADMIN']);
    const contentId = await createContent(adminId, 'PUBLISHED');
    await putSlot(adminId, {
      slotKey: 'hero',
      contentId,
      startsAt: '2020-01-01T00:00:00.000Z',
      endsAt: '2020-12-31T00:00:00.000Z',
    });

    const res = await request(serverOf(ensureApp())).get('/api/v1/homepage');
    const slots = (res.body as { data: { slots: { slotKey: string }[] } }).data.slots;
    expect(slots.find((slot) => slot.slotKey === 'hero')).toBeUndefined();
  });
});
