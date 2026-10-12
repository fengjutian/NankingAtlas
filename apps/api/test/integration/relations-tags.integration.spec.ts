import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { hashPassword } from '../../src/lib/password.js';
import { closeTestApp, createTestApp, prisma, request, serverOf } from '../app-harness.js';

import type { INestApplication } from '@nestjs/common';

/**
 * FD-008 标签与关系管理的集成测试。
 *
 * 重点是**方向语义**（产品需求 §4.2「记录关系类型、方向和说明」）：
 * 从关系的任意一端看，都必须看到**对方**，并知道自己处于关系的哪一侧。
 * FD-008 要求「双向/有向关系的展示语义由服务端统一定义」，所以方向由服务端
 * 给出结构化字段，前端不自己推断。
 */

const PASSWORD = 'relation-integration-pw-2026';

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
  const email = `rel-${String(counter)}-${String(Date.now())}@example.test`;
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash: await hashPassword(PASSWORD),
      displayName: `关系用户 ${String(counter)}`,
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

let contentCounter = 0;

async function createContent(
  userId: string,
  type: 'TOPIC' | 'PLACE' | 'PERSON' | 'ROUTE' = 'TOPIC',
  title?: string,
): Promise<string> {
  contentCounter += 1;
  const row = await prisma.content.create({
    data: {
      type,
      slug: `rel-content-${String(contentCounter)}-${String(Date.now())}`,
      title: title ?? `关系内容 ${String(contentCounter)}（示例）`,
      bodyJson: JSON.stringify({
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: '示例正文。' }] }],
      }),
      status: 'DRAFT',
      createdById: userId,
      updatedById: userId,
    },
  });
  return row.id;
}

/** 建立关系：source 走**路径**，target 走 body —— 契约就是这样。 */
async function createRelation(
  userId: string,
  body: { sourceContentId: string; targetContentId: string; relationType: string },
): Promise<{ status: number; body: unknown }> {
  const res = await request(serverOf(ensureApp()))
    .post(`/api/v1/admin/contents/${body.sourceContentId}/relations`)
    .set('Authorization', authHeader(userId))
    .send({ targetContentId: body.targetContentId, relationType: body.relationType });
  return { status: res.status, body: res.body };
}

async function listRelations(
  userId: string,
  contentId: string,
): Promise<{ status: number; body: unknown }> {
  const res = await request(serverOf(ensureApp()))
    .get(`/api/v1/admin/contents/${contentId}/relations`)
    .set('Authorization', authHeader(userId));
  return { status: res.status, body: res.body };
}

async function upsertTag(userId: string, slug: string, displayName: string): Promise<void> {
  const res = await request(serverOf(ensureApp()))
    .post('/api/v1/admin/tags')
    .set('Authorization', authHeader(userId))
    .send({ slug, displayName });
  expect(res.status).toBe(201);
}

beforeAll(async () => {
  app = await createTestApp();
});

afterAll(async () => {
  await closeTestApp(app);
});

describe('FD-008: 关系创建的约束', () => {
  it('禁止自关联', async () => {
    const userId = await createUser(['EDITOR']);
    const contentId = await createContent(userId);
    const res = await createRelation(userId, {
      sourceContentId: contentId,
      targetContentId: contentId,
      relationType: 'RELATED_TO',
    });
    expect(res.status).toBe(403);
    expect((res.body as { error: { message: string } }).error.message).toContain('自身');
  });

  it('禁止重复关系', async () => {
    const userId = await createUser(['EDITOR']);
    const a = await createContent(userId);
    const b = await createContent(userId);

    const first = await createRelation(userId, {
      sourceContentId: a,
      targetContentId: b,
      relationType: 'RELATED_TO',
    });
    expect(first.status).toBe(201);

    const second = await createRelation(userId, {
      sourceContentId: a,
      targetContentId: b,
      relationType: 'RELATED_TO',
    });
    expect(second.status).toBe(403);
  });

  it('不同关系类型可以重复建立', async () => {
    const userId = await createUser(['EDITOR']);
    const a = await createContent(userId);
    const b = await createContent(userId);

    for (const relationType of ['RELATED_TO', 'REFERENCES']) {
      const res = await createRelation(userId, {
        sourceContentId: a,
        targetContentId: b,
        relationType,
      });
      expect(res.status).toBe(201);
    }
  });

  it('关系两端必须都存在', async () => {
    const userId = await createUser(['EDITOR']);
    const a = await createContent(userId);
    const res = await createRelation(userId, {
      sourceContentId: a,
      targetContentId: 'content-does-not-exist',
      relationType: 'RELATED_TO',
    });
    expect(res.status).toBe(403);
  });

  it('未知关系类型被拒绝（受控字典）', async () => {
    const userId = await createUser(['EDITOR']);
    const a = await createContent(userId);
    const b = await createContent(userId);
    const res = await createRelation(userId, {
      sourceContentId: a,
      targetContentId: b,
      relationType: 'NOT_A_RELATION',
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });

  it('未知字段被 DTO 白名单拒绝', async () => {
    const userId = await createUser(['EDITOR']);
    const a = await createContent(userId);
    const b = await createContent(userId);
    const res = await request(serverOf(ensureApp()))
      .post(`/api/v1/admin/contents/${a}/relations`)
      .set('Authorization', authHeader(userId))
      .send({ targetContentId: b, relationType: 'RELATED_TO', force: true });
    expect(res.status).toBe(400);
  });
});

describe('FD-008: 方向语义由服务端统一给出', () => {
  it('从关系两端看，都能看到对方而不是自己', async () => {
    const userId = await createUser(['EDITOR']);
    const a = await createContent(userId, 'PLACE', '甲地点（示例）');
    const b = await createContent(userId, 'TOPIC', '乙专题（示例）');

    await createRelation(userId, {
      sourceContentId: a,
      targetContentId: b,
      relationType: 'REFERENCES',
    });

    const fromA = await listRelations(userId, a);
    expect(fromA.status).toBe(200);
    const aItems = (fromA.body as { data: { otherContentId: string; direction: string }[] }).data;
    expect(aItems).toHaveLength(1);
    expect(aItems[0]?.otherContentId).toBe(b);
    expect(aItems[0]?.direction).toBe('OUTGOING');

    const fromB = await listRelations(userId, b);
    const bItems = (fromB.body as { data: { otherContentId: string; direction: string }[] }).data;
    expect(bItems).toHaveLength(1);
    // 关键：B 是目标端，看到的必须是 A，而不是自己
    expect(bItems[0]?.otherContentId).toBe(a);
    expect(bItems[0]?.direction).toBe('INCOMING');
    expect(bItems[0]?.otherContentId).not.toBe(b);
  });

  it('对称关系（RELATED_TO）两端方向不同但都是有效关联', async () => {
    const userId = await createUser(['EDITOR']);
    const a = await createContent(userId, 'TOPIC', '对称甲（示例）');
    const b = await createContent(userId, 'TOPIC', '对称乙（示例）');

    await createRelation(userId, {
      sourceContentId: a,
      targetContentId: b,
      relationType: 'RELATED_TO',
    });

    const fromA = (await listRelations(userId, a)).body as {
      data: { otherContentId: string; symmetric: boolean }[];
    };
    const fromB = (await listRelations(userId, b)).body as {
      data: { otherContentId: string; symmetric: boolean }[];
    };

    expect(fromA.data[0]?.symmetric).toBe(true);
    expect(fromB.data[0]?.symmetric).toBe(true);
    expect(fromA.data[0]?.otherContentId).toBe(b);
    expect(fromB.data[0]?.otherContentId).toBe(a);
  });

  it('有向关系（PART_OF 等）标为非对称', async () => {
    const userId = await createUser(['EDITOR']);
    const building = await createContent(userId, 'TOPIC', '某建筑（示例）');
    const place = await createContent(userId, 'PLACE', '某地点（示例）');

    await createRelation(userId, {
      sourceContentId: building,
      targetContentId: place,
      relationType: 'PART_OF',
    });

    const res = await listRelations(userId, building);
    const items = (res.body as { data: { symmetric: boolean }[] }).data;
    expect(items[0]?.symmetric).toBe(false);
  });

  it('关系项携带对方的类型与标题，便于直接渲染', async () => {
    const userId = await createUser(['EDITOR']);
    const a = await createContent(userId, 'TOPIC', '关联甲（示例）');
    const b = await createContent(userId, 'PERSON', '关联乙（示例）');

    await createRelation(userId, {
      sourceContentId: a,
      targetContentId: b,
      relationType: 'RELATED_TO',
    });

    const res = await listRelations(userId, a);
    const items = (res.body as { data: Record<string, unknown>[] }).data;
    expect(items[0]?.otherTitle).toBe('关联乙（示例）');
    expect(items[0]?.otherType).toBe('PERSON');
  });

  it('对方被删除后不会留下悬空引用', async () => {
    const userId = await createUser(['EDITOR']);
    const a = await createContent(userId);
    const b = await createContent(userId);

    await createRelation(userId, {
      sourceContentId: a,
      targetContentId: b,
      relationType: 'RELATED_TO',
    });

    await prisma.content.delete({ where: { id: b } });

    const res = await listRelations(userId, a);
    expect(res.status).toBe(200);
    expect((res.body as { data: unknown[] }).data).toEqual([]);
  });
});

describe('FD-008: 标签列表与使用次数', () => {
  it('标签列表带使用次数，且能按关键词检索', async () => {
    const userId = await createUser(['EDITOR']);
    const marker = `标签${String(counter)}`;
    // slug 走 slugSchema：小写 ASCII + 单连字符，所以用 ASCII 段而不是中文
    await upsertTag(userId, `list-a-${String(counter)}`, `${marker}-显示名甲`);
    await upsertTag(userId, `list-b-${String(counter)}`, `${marker}-显示名乙`);
    await upsertTag(userId, 'other-tag', '无关标签');

    const res = await request(serverOf(ensureApp()))
      .get(`/api/v1/admin/tags?q=${encodeURIComponent(marker)}`)
      .set('Authorization', authHeader(userId));
    expect(res.status).toBe(200);

    const page = (res.body as { data: { items: { slug: string; usageCount: number }[] } }).data;
    expect(page.items).toHaveLength(2);
    expect(page.items.every((item) => item.usageCount === 0)).toBe(true);
  });

  it('使用次数随挂载变化', async () => {
    const userId = await createUser(['EDITOR']);
    const slug = `usage-${String(counter)}`;
    await upsertTag(userId, slug, '计数标签');

    const contentA = await createContent(userId);
    const contentB = await createContent(userId);
    for (const contentId of [contentA, contentB]) {
      const attach = await request(serverOf(ensureApp()))
        .post(`/api/v1/admin/contents/${contentId}/tags`)
        .set('Authorization', authHeader(userId))
        .send({ tagSlug: slug });
      expect(attach.status).toBe(201);
    }

    const res = await request(serverOf(ensureApp()))
      .get(`/api/v1/admin/tags?q=${encodeURIComponent(slug)}`)
      .set('Authorization', authHeader(userId));
    const page = (res.body as { data: { items: { usageCount: number }[] } }).data;
    expect(page.items[0]?.usageCount).toBe(2);
  });

  it('slug 不可变：同名不同 slug 是两个标签', async () => {
    const userId = await createUser(['EDITOR']);
    const base = `immutable-${String(counter)}`;
    await upsertTag(userId, base, '同一显示名');

    // 用不同 slug、同一 displayName 再建一次
    const second = await request(serverOf(ensureApp()))
      .post('/api/v1/admin/tags')
      .set('Authorization', authHeader(userId))
      .send({ slug: `${base}-b`, displayName: '同一显示名' });
    expect(second.status).toBe(201);

    const res = await request(serverOf(ensureApp()))
      .get(`/api/v1/admin/tags?q=${encodeURIComponent('同一显示名')}`)
      .set('Authorization', authHeader(userId));
    const page = (res.body as { data: { items: { slug: string }[] } }).data;
    // 同名必须能靠 slug 区分，否则编辑无法判断该用哪个
    expect(page.items).toHaveLength(2);
    expect(new Set(page.items.map((item) => item.slug)).size).toBe(2);
  });

  it('重命名只改显示名，不动 slug（slug 变了会断掉所有引用）', async () => {
    const userId = await createUser(['EDITOR']);
    const slug = `rename-${String(counter)}`;
    await upsertTag(userId, slug, '旧显示名');

    const contentId = await createContent(userId);
    await request(serverOf(ensureApp()))
      .post(`/api/v1/admin/contents/${contentId}/tags`)
      .set('Authorization', authHeader(userId))
      .send({ tagSlug: slug });

    // 再次 upsert 同一 slug + 新显示名
    await upsertTag(userId, slug, '新显示名');

    const res = await request(serverOf(ensureApp()))
      .get(`/api/v1/admin/contents/${contentId}/tags`)
      .set('Authorization', authHeader(userId));
    const tags = (res.body as { data: { slug: string; displayName: string }[] }).data;
    // slug 不变 → 引用没断；显示名已更新
    expect(tags[0]?.slug).toBe(slug);
    expect(tags[0]?.displayName).toBe('新显示名');
  });

  it('标签列表对编辑角色开放（不是 ADMIN 专属）', async () => {
    // 标签是编辑日常操作，锁到 ADMIN 会让日常打标签变成找管理员代办。
    // 真正的 ADMIN 专属是用户/角色管理（FD-005）。
    const anon = await request(serverOf(ensureApp())).get('/api/v1/admin/tags');
    expect(anon.status).toBe(401);

    for (const role of ['EDITOR', 'REVIEWER', 'ADMIN']) {
      const userId = await createUser([role]);
      const res = await request(serverOf(ensureApp()))
        .get('/api/v1/admin/tags')
        .set('Authorization', authHeader(userId));
      expect(res.status, `${role} 应能列标签`).toBe(200);
    }
  });

  it('非法检索参数被拒绝', async () => {
    const adminId = await createUser(['ADMIN']);
    const long = await request(serverOf(ensureApp()))
      .get(`/api/v1/admin/tags?q=${'x'.repeat(201)}`)
      .set('Authorization', authHeader(adminId));
    expect(long.status).toBe(400);

    const unknown = await request(serverOf(ensureApp()))
      .get('/api/v1/admin/tags?sort=displayName')
      .set('Authorization', authHeader(adminId));
    expect(unknown.status).toBe(400);
  });
});

describe('FD-008: 关系创建时提供内容检索', () => {
  it('可按关键词检索可选目标内容', async () => {
    const userId = await createUser(['EDITOR']);
    const marker = `目标${String(counter)}`;
    await createContent(userId, 'PLACE', `${marker}-可被关联`);

    const res = await request(serverOf(ensureApp()))
      .get(`/api/v1/admin/relation-targets?q=${encodeURIComponent(marker)}`)
      .set('Authorization', authHeader(userId));
    expect(res.status).toBe(200);

    const page = (res.body as { data: { items: { id: string; title: string }[] } }).data;
    expect(page.items.length).toBeGreaterThan(0);
    expect(page.items[0]?.title).toContain(marker);
  });

  it('检索结果包含内容类型与状态，便于判断', async () => {
    const userId = await createUser(['EDITOR']);
    const marker = `目标类型${String(counter)}`;
    await createContent(userId, 'PERSON', `${marker}-人物`);

    const res = await request(serverOf(ensureApp()))
      .get(`/api/v1/admin/relation-targets?q=${encodeURIComponent(marker)}`)
      .set('Authorization', authHeader(userId));
    const item = (res.body as { data: { items: Record<string, unknown>[] } }).data.items[0];
    expect(item?.type).toBe('PERSON');
    expect(item?.status).toBe('DRAFT');
  });

  it('超长关键词与非法分页被拒绝', async () => {
    const userId = await createUser(['EDITOR']);
    const long = await request(serverOf(ensureApp()))
      .get(`/api/v1/admin/relation-targets?q=${'x'.repeat(201)}`)
      .set('Authorization', authHeader(userId));
    expect(long.status).toBe(400);

    const badLimit = await request(serverOf(ensureApp()))
      .get('/api/v1/admin/relation-targets?limit=101')
      .set('Authorization', authHeader(userId));
    expect(badLimit.status).toBe(400);
  });

  it('未认证不能检索关系目标', async () => {
    const res = await request(serverOf(ensureApp())).get('/api/v1/admin/relation-targets');
    expect(res.status).toBe(401);
  });
});
