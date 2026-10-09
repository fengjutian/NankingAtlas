import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { hashPassword } from '../../src/lib/password.js';
import { closeTestApp, createTestApp, prisma, request, serverOf } from '../app-harness.js';

import type { INestApplication } from '@nestjs/common';

/**
 * 公开读接口与首页槽位的集成测试（P2-01 / P2-02）。
 *
 * 核心安全断言（技术方案 §7.2）：
 *   「公开接口只返回已发布字段，不泄露内部备注、未公开来源附件、
 *     人员邮箱或审核记录。」
 *
 * 所以每个用例都同时检查两件事：
 *   1. 已发布内容**能**看到
 *   2. 未发布 / 已归档内容**看不到**（404）
 */

const PASSWORD = 'public-content-test-password-2026';

const VALID_BODY = {
  type: 'doc',
  content: [
    { type: 'paragraph', content: [{ type: 'text', text: '公开可见的正文（示例 / 待核验）。' }] },
  ],
};

let app: INestApplication | undefined;
const ids: Record<string, string> = {};

function liveApp(): INestApplication {
  if (app === undefined) {
    throw new Error('app not initialised');
  }
  return app;
}

async function createUser(email: string, roles: string[]): Promise<string> {
  const passwordHash = await hashPassword(PASSWORD);
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash,
      displayName: email,
      userRoles: { create: roles.map((role) => ({ role })) },
    },
  });
  const login = await request(serverOf(liveApp()))
    .post('/api/v1/auth/login')
    .send({ email, password: PASSWORD });
  ids[user.id] = (login.body as { data: { accessToken: string } }).data.accessToken;
  return user.id;
}

function tokenOf(userId: string): string {
  const token = ids[userId];
  if (token === undefined) {
    throw new Error(`no token for ${userId}`);
  }
  return token;
}

interface CreateResult {
  id: string;
  slug: string;
}

let counter = 0;
function slug(prefix: string): string {
  counter += 1;
  return `${prefix}-${String(counter)}`;
}

/**
 * 审核者：与作者是**不同的人**。
 *
 * 内容由 editor 建稿，审核者必须是另一个账号 —— 服务端禁止自审
 * （技术方案 §6「审核自己的稿件在 MVP 默认禁止」）。若用同一个 admin
 * 建稿再审核，会在 APPROVE 处被 403 挡掉，测不到真正的发布链路。
 */
let reviewerId = '';
let reviewerToken = '';

/** 建内容 → 挂来源 → 送审 → （可选）审核并发布。 */
async function makeContent(
  authorId: string,
  prefix: string,
  opts: { publish?: boolean; type?: 'TOPIC' | 'PLACE'; accuracy?: string } = {},
): Promise<CreateResult> {
  const contentSlug = slug(prefix);
  const type = opts.type ?? 'TOPIC';
  const authorToken = tokenOf(authorId);
  const created = await request(serverOf(liveApp()))
    .post('/api/v1/admin/contents')
    .set('Authorization', `Bearer ${authorToken}`)
    .send({
      type,
      slug: contentSlug,
      title: `示例 ${contentSlug}`,
      summary: '示例摘要（待核验）',
      body: VALID_BODY,
      extension:
        type === 'PLACE'
          ? {
              kind: 'PLACE',
              accuracy: opts.accuracy ?? 'APPROXIMATE',
              verificationStatus: opts.accuracy === 'EXACT' ? 'VERIFIED' : 'UNVERIFIED',
              // accuracy=UNKNOWN 时**不填坐标** —— readiness 会拒绝
              // 「未核验却带精确坐标」（AGENTS.md §3.5）
              ...(opts.accuracy === 'UNKNOWN' ? {} : { lon: 118.78, lat: 32.06 }),
            }
          : { kind: 'TOPIC' },
    });
  expect(created.status).toBe(201);
  const data = (created.body as { data: { id: string; slug: string } }).data;

  if (opts.publish !== true) {
    return data;
  }

  // 来源是发布的前置条件
  const source = await request(serverOf(liveApp()))
    .post('/api/v1/admin/sources')
    .set('Authorization', `Bearer ${authorToken}`)
    .send({ kind: 'OTHER', title: `示例来源 ${contentSlug}`, verificationNote: '未核验' });
  const sourceId = (source.body as { data: { id: string } }).data.id;
  await request(serverOf(liveApp()))
    .post(`/api/v1/admin/contents/${data.id}/sources`)
    .set('Authorization', `Bearer ${authorToken}`)
    .send({ sourceId, claimScope: '整体（待核验）', isPrimary: true });

  await request(serverOf(liveApp()))
    .post(`/api/v1/admin/contents/${data.id}/transition`)
    .set('Authorization', `Bearer ${authorToken}`)
    .send({ action: 'SUBMIT' });

  // 审核与发布由**另一个账号**执行，绕开自审拦截
  const approved = await request(serverOf(liveApp()))
    .post(`/api/v1/admin/contents/${data.id}/transition`)
    .set('Authorization', `Bearer ${reviewerToken}`)
    .send({ action: 'APPROVE' });
  expect(approved.status).toBe(200);

  const published = await request(serverOf(liveApp()))
    .post(`/api/v1/admin/contents/${data.id}/transition`)
    .set('Authorization', `Bearer ${reviewerToken}`)
    .send({ action: 'PUBLISH' });
  expect(published.status).toBe(200);

  return data;
}

beforeAll(async () => {
  app = await createTestApp();
  reviewerId = await createUser(`pub-reviewer-${String(Date.now())}@example.test`, ['REVIEWER']);
  reviewerToken = tokenOf(reviewerId);
});

afterAll(async () => {
  await closeTestApp(app);
});

describe('P2-01: public content endpoints', () => {
  it('returns published content from GET /contents', async () => {
    const authorId = await createUser(`pub-list-${String(Date.now())}@example.test`, ['EDITOR']);
    const published = await makeContent(authorId, 'pub-list', { publish: true });

    const res = await request(serverOf(liveApp())).get('/api/v1/contents?limit=100');
    expect(res.status).toBe(200);
    const items = (res.body as { data: { slug: string }[] }).data;
    expect(items.some((item) => item.slug === published.slug)).toBe(true);
  });

  it('does NOT return draft content from GET /contents', async () => {
    const authorId = await createUser(`pub-draft-${String(Date.now())}@example.test`, ['EDITOR']);
    const draft = await makeContent(authorId, 'pub-draft');

    const res = await request(serverOf(liveApp())).get('/api/v1/contents?limit=100');
    const items = (res.body as { data: { slug: string }[] }).data;
    expect(items.some((item) => item.slug === draft.slug)).toBe(false);
  });

  it('returns 404 for a draft slug on GET /contents/:slug', async () => {
    const authorId = await createUser(`pub-404-${String(Date.now())}@example.test`, ['EDITOR']);
    const draft = await makeContent(authorId, 'pub-404');

    const res = await request(serverOf(liveApp())).get(`/api/v1/contents/${draft.slug}`);
    expect(res.status).toBe(404);
  });

  it('returns the published detail with body JSON', async () => {
    const authorId = await createUser(`pub-detail-${String(Date.now())}@example.test`, ['EDITOR']);
    const published = await makeContent(authorId, 'pub-detail', { publish: true });

    const res = await request(serverOf(liveApp())).get(`/api/v1/contents/${published.slug}`);
    expect(res.status).toBe(200);
    const body = res.body as {
      data: { slug: string; body: { type: string }; publishedAt: string };
    };
    expect(body.data.slug).toBe(published.slug);
    expect(body.data.body.type).toBe('doc');
    expect(body.data.publishedAt).not.toBeNull();
  });

  it('never leaks internal fields (createdById / updatedById / archivedAt)', async () => {
    const authorId = await createUser(`pub-leak-${String(Date.now())}@example.test`, ['EDITOR']);
    const published = await makeContent(authorId, 'pub-leak', { publish: true });

    const res = await request(serverOf(liveApp())).get(`/api/v1/contents/${published.slug}`);
    const body = res.body as { data: Record<string, unknown> };
    // §7.2：公开接口只返回已发布字段
    for (const forbidden of ['createdById', 'updatedById', 'archivedAt', 'version', 'status']) {
      expect(body.data).not.toHaveProperty(forbidden);
    }
  });

  it('requires no authentication', async () => {
    const res = await request(serverOf(liveApp())).get('/api/v1/contents');
    expect(res.status).toBe(200);
  });

  it('rejects an out-of-range limit', async () => {
    const res = await request(serverOf(liveApp())).get('/api/v1/contents?limit=500');
    expect(res.status).toBe(400);
  });
});

describe('P2-02: homepage', () => {
  it('returns slots, featured and latest', async () => {
    const res = await request(serverOf(liveApp())).get('/api/v1/homepage');
    expect(res.status).toBe(200);
    const body = res.body as {
      data: { slots: unknown[]; featured: unknown[]; latest: unknown[] };
    };
    expect(Array.isArray(body.data.slots)).toBe(true);
    expect(Array.isArray(body.data.featured)).toBe(true);
    expect(Array.isArray(body.data.latest)).toBe(true);
  });

  it('returns only published content in latest', async () => {
    const authorId = await createUser(`home-draft-${String(Date.now())}@example.test`, ['EDITOR']);
    const draft = await makeContent(authorId, 'home-draft');

    const res = await request(serverOf(liveApp())).get('/api/v1/homepage');
    const body = res.body as { data: { latest: { slug: string }[] } };
    expect(body.data.latest.some((item) => item.slug === draft.slug)).toBe(false);
  });

  it('configures a slot and exposes it on the public homepage', async () => {
    const adminId = await createUser(`home-admin-${String(Date.now())}@example.test`, ['ADMIN']);
    const content = await makeContent(adminId, 'home-slot', { publish: true });

    const patch = await request(serverOf(liveApp()))
      .patch('/api/v1/admin/homepage-slots')
      .set('Authorization', `Bearer ${tokenOf(adminId)}`)
      .send({ slotKey: 'hero', contentId: content.id, position: 0 });
    expect(patch.status).toBe(200);

    const res = await request(serverOf(liveApp())).get('/api/v1/homepage');
    const body = res.body as {
      data: { slots: { slotKey: string; content: { slug: string } | null }[] };
    };
    const hero = body.data.slots.find((slot) => slot.slotKey === 'hero');
    expect(hero?.content?.slug).toBe(content.slug);
  });

  it('refuses to slot a draft', async () => {
    const adminId = await createUser(`home-draftslot-${String(Date.now())}@example.test`, [
      'ADMIN',
    ]);
    const draft = await makeContent(adminId, 'home-draftslot');

    const res = await request(serverOf(liveApp()))
      .patch('/api/v1/admin/homepage-slots')
      .set('Authorization', `Bearer ${tokenOf(adminId)}`)
      .send({ slotKey: 'featured', contentId: draft.id, position: 0 });

    expect(res.status).toBe(403);
    expect((res.body as { error: { message: string } }).error.message).toContain('已发布');
  });

  it('hides a slot once its content is archived', async () => {
    const adminId = await createUser(`home-arch-${String(Date.now())}@example.test`, ['ADMIN']);
    const content = await makeContent(adminId, 'home-arch', { publish: true });

    await request(serverOf(liveApp()))
      .patch('/api/v1/admin/homepage-slots')
      .set('Authorization', `Bearer ${tokenOf(adminId)}`)
      .send({ slotKey: 'featured', contentId: content.id, position: 0 });

    // 归档内容 → 槽位应自动失效（content 变 null），而不是继续指向 404
    const archive = await request(serverOf(liveApp()))
      .post(`/api/v1/admin/contents/${content.id}/transition`)
      .set('Authorization', `Bearer ${reviewerToken}`)
      .send({ action: 'ARCHIVE' });
    expect(archive.status).toBe(200);

    const res = await request(serverOf(liveApp())).get('/api/v1/homepage');
    const body = res.body as {
      data: { slots: { slotKey: string; content: unknown }[] };
    };
    const featured = body.data.slots.find((slot) => slot.slotKey === 'featured');
    expect(featured?.content ?? null).toBeNull();
  });

  it('rejects an unknown slot key', async () => {
    const adminId = await createUser(`home-bad-${String(Date.now())}@example.test`, ['ADMIN']);
    const res = await request(serverOf(liveApp()))
      .patch('/api/v1/admin/homepage-slots')
      .set('Authorization', `Bearer ${tokenOf(adminId)}`)
      .send({ slotKey: 'unknown-slot', contentId: null, position: 0 });
    expect(res.status).toBe(400);
  });

  it('rejects a non-admin configuring slots', async () => {
    const editorId = await createUser(`home-editor-${String(Date.now())}@example.test`, ['EDITOR']);
    const res = await request(serverOf(liveApp()))
      .patch('/api/v1/admin/homepage-slots')
      .set('Authorization', `Bearer ${tokenOf(editorId)}`)
      .send({ slotKey: 'hero', contentId: null, position: 0 });
    expect(res.status).toBe(403);
  });

  it('rejects an inverted time window', async () => {
    const adminId = await createUser(`home-window-${String(Date.now())}@example.test`, ['ADMIN']);
    const res = await request(serverOf(liveApp()))
      .patch('/api/v1/admin/homepage-slots')
      .set('Authorization', `Bearer ${tokenOf(adminId)}`)
      .send({
        slotKey: 'latest',
        contentId: null,
        position: 0,
        startsAt: '2030-01-01T00:00:00.000Z',
        endsAt: '2020-01-01T00:00:00.000Z',
      });
    expect(res.status).toBe(403);
  });

  it('hides a slot whose window has not started yet', async () => {
    const adminId = await createUser(`home-future-${String(Date.now())}@example.test`, ['ADMIN']);
    await request(serverOf(liveApp()))
      .patch('/api/v1/admin/homepage-slots')
      .set('Authorization', `Bearer ${tokenOf(adminId)}`)
      .send({
        slotKey: 'routes',
        contentId: null,
        position: 0,
        startsAt: '2999-01-01T00:00:00.000Z',
        endsAt: null,
      });

    const res = await request(serverOf(liveApp())).get('/api/v1/homepage');
    const body = res.body as { data: { slots: { slotKey: string }[] } };
    expect(body.data.slots.some((slot) => slot.slotKey === 'routes')).toBe(false);
  });
});

describe('P2-01: place coordinates respect verification rules', () => {
  it('returns coordinates when accuracy is EXACT and verified', async () => {
    const authorId = await createUser(`place-ok-${String(Date.now())}@example.test`, ['EDITOR']);
    const place = await makeContent(authorId, 'place-ok', {
      publish: true,
      type: 'PLACE',
      accuracy: 'EXACT',
    });

    const res = await request(serverOf(liveApp())).get(`/api/v1/places/${place.slug}`);
    expect(res.status).toBe(200);
    const body = res.body as { data: { lon: number | null; lat: number | null; accuracy: string } };
    expect(body.data.lon).toBeCloseTo(118.78, 2);
    expect(body.data.lat).toBeCloseTo(32.06, 2);
    expect(body.data.accuracy).toBe('EXACT');
  });

  it('refuses to publish UNKNOWN-accuracy content that carries coordinates', async () => {
    const authorId = await createUser(`place-bad-${String(Date.now())}@example.test`, ['EDITOR']);
    const contentSlug = slug('place-bad');
    const authorToken = tokenOf(authorId);

    const created = await request(serverOf(liveApp()))
      .post('/api/v1/admin/contents')
      .set('Authorization', `Bearer ${authorToken}`)
      .send({
        type: 'PLACE',
        slug: contentSlug,
        title: `示例 ${contentSlug}`,
        summary: '示例摘要（待核验）',
        body: VALID_BODY,
        // accuracy=UNKNOWN 却填了精确坐标 —— AGENTS.md §3.5 明令禁止
        extension: { kind: 'PLACE', accuracy: 'UNKNOWN', lon: 118.78, lat: 32.06 },
      });
    const id = (created.body as { data: { id: string } }).data.id;

    const source = await request(serverOf(liveApp()))
      .post('/api/v1/admin/sources')
      .set('Authorization', `Bearer ${authorToken}`)
      .send({ kind: 'OTHER', title: `示例来源 ${contentSlug}`, verificationNote: '未核验' });
    const sourceId = (source.body as { data: { id: string } }).data.id;
    await request(serverOf(liveApp()))
      .post(`/api/v1/admin/contents/${id}/sources`)
      .set('Authorization', `Bearer ${authorToken}`)
      .send({ sourceId, claimScope: '整体（待核验）', isPrimary: true });

    await request(serverOf(liveApp()))
      .post(`/api/v1/admin/contents/${id}/transition`)
      .set('Authorization', `Bearer ${authorToken}`)
      .send({ action: 'SUBMIT' });
    await request(serverOf(liveApp()))
      .post(`/api/v1/admin/contents/${id}/transition`)
      .set('Authorization', `Bearer ${reviewerToken}`)
      .send({ action: 'APPROVE' });

    const published = await request(serverOf(liveApp()))
      .post(`/api/v1/admin/contents/${id}/transition`)
      .set('Authorization', `Bearer ${reviewerToken}`)
      .send({ action: 'PUBLISH' });

    expect(published.status).toBe(422);
    const body = published.body as {
      error: { code: string; details: { issues: { code: string }[] } };
    };
    expect(body.error.code).toBe('PUBLICATION_NOT_READY');
    expect(body.error.details.issues.map((issue) => issue.code)).toContain('COORDINATE_UNVERIFIED');
  });

  it('publishes UNKNOWN-accuracy place without coordinates and withholds them', async () => {
    const authorId = await createUser(`place-unk2-${String(Date.now())}@example.test`, ['EDITOR']);
    // 正确做法：未核验就不填坐标（宁可少给，不可给错）
    const place = await makeContent(authorId, 'place-unk2', {
      publish: true,
      type: 'PLACE',
      accuracy: 'UNKNOWN',
    });

    const res = await request(serverOf(liveApp())).get(`/api/v1/places/${place.slug}`);
    expect(res.status).toBe(200);
    const body = res.body as {
      data: { lon: number | null; lat: number | null; verificationStatus: string };
    };
    expect(body.data.lon).toBeNull();
    expect(body.data.lat).toBeNull();
    expect(body.data.verificationStatus).toBe('UNVERIFIED');
  });

  it('returns 404 for an unpublished place', async () => {
    const authorId = await createUser(`place-draft-${String(Date.now())}@example.test`, ['EDITOR']);
    const draft = await makeContent(authorId, 'place-draft', { type: 'PLACE' });

    const res = await request(serverOf(liveApp())).get(`/api/v1/places/${draft.slug}`);
    expect(res.status).toBe(404);
  });

  it('returns 404 for a non-place slug', async () => {
    const res = await request(serverOf(liveApp())).get('/api/v1/places/definitely-not-a-place');
    expect(res.status).toBe(404);
  });
});
