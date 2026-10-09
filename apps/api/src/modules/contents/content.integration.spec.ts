import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  closeTestApp,
  createTestApp,
  prisma,
  request,
  serverOf,
} from '../../../test/app-harness.js';
import { hashPassword } from '../../lib/password.js';

import type { INestApplication } from '@nestjs/common';

/**
 * 内容 CRUD + 状态机 + 发布前校验的集成测试（P1-04 / P1-05 / P1-07 / P1-08）。
 *
 * 验证的是**事务边界与约束**（AGENTS.md §5.3）—— 这些在单元测试里看不到：
 *   - 乐观锁：并发更新必须 409，不得静默覆盖
 *   - 事务一致性：正文保存与 revision / audit 必须同时成功或同时失败
 *   - 状态机：服务端拦截非法流转（不依赖前端隐藏按钮）
 *   - 发布前校验：缺来源 / 版权未澄清 / 坐标未核验 → 422 结构化
 *   - 软删除：不物理删除，archived_at 生效
 */

const PASSWORD = 'content-integration-password-2026';

const VALID_BODY = {
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      content: [{ type: 'text', text: '示例正文，标记为待核验。' }],
    },
  ],
};

let app: INestApplication | undefined;
const tokens = new Map<string, string>();

async function createUser(email: string, roles: string[]): Promise<string> {
  const passwordHash = await hashPassword(PASSWORD);
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash,
      displayName: email,
      userRoles: { create: roles.map((role) => ({ role })) },
    },
    include: { userRoles: true },
  });
  const login = await request(serverOf(ensureApp()))
    .post('/api/v1/auth/login')
    .send({ email, password: PASSWORD });
  const accessToken = (login.body as { data: { accessToken: string } }).data.accessToken;
  tokens.set(user.id, accessToken);
  return user.id;
}

function ensureApp(): INestApplication {
  if (app === undefined) {
    throw new Error('app not initialised');
  }
  return app;
}

function authHeader(userId: string): string {
  const token = tokens.get(userId);
  if (token === undefined) {
    throw new Error(`no token for user ${userId}`);
  }
  return `Bearer ${token}`;
}

let counter = 0;
function uniqueSlug(prefix: string): string {
  counter += 1;
  return `${prefix}-${String(counter)}`;
}

beforeAll(async () => {
  app = await createTestApp();
});

afterAll(async () => {
  await closeTestApp(app);
});

describe('P1-04: content create / update / optimistic lock', () => {
  it('creates a draft with revision v1 and an audit record', async () => {
    const authorId = await createUser('crud-author@example.test', ['EDITOR']);

    const res = await request(serverOf(ensureApp()))
      .post('/api/v1/admin/contents')
      .set('Authorization', authHeader(authorId))
      .send({
        type: 'TOPIC',
        slug: uniqueSlug('topic'),
        title: '秦淮风光带',
        summary: '明城墙与秦淮河沿岸的历史街区。（示例 / 待核验）',
        body: VALID_BODY,
        extension: { kind: 'TOPIC', curatorNote: '策展笔记（示例）' },
      });

    expect(res.status).toBe(201);
    const body = res.body as { data: { id: string; status: string; version: number } };
    expect(body.data.status).toBe('DRAFT');
    expect(body.data.version).toBe(1);

    // revision 与 audit 必须在同一事务里落库
    const [revision, audit] = await Promise.all([
      prisma.revision.findMany({ where: { contentId: body.data.id } }),
      prisma.auditLog.findMany({ where: { entityId: body.data.id, action: 'content.create' } }),
    ]);
    expect(revision).toHaveLength(1);
    expect(revision[0]?.revisionNo).toBe(1);
    expect(audit).toHaveLength(1);
  });

  it('creates the matching type extension row', async () => {
    const authorId = await createUser('crud-ext@example.test', ['EDITOR']);

    const res = await request(serverOf(ensureApp()))
      .post('/api/v1/admin/contents')
      .set('Authorization', authHeader(authorId))
      .send({
        type: 'TOPIC',
        slug: uniqueSlug('topic-ext'),
        title: '带策展笔记的专题',
        summary: '摘要',
        body: VALID_BODY,
        extension: { kind: 'TOPIC', curatorNote: '策展笔记' },
      });

    expect(res.status).toBe(201);
    const id = (res.body as { data: { id: string } }).data.id;
    const topic = await prisma.topic.findUnique({ where: { contentId: id } });
    expect(topic?.curatorNote).toBe('策展笔记');
  });

  it('rejects an XSS payload in the Tiptap body', async () => {
    const authorId = await createUser('crud-xss@example.test', ['EDITOR']);

    const res = await request(serverOf(ensureApp()))
      .post('/api/v1/admin/contents')
      .set('Authorization', authHeader(authorId))
      .send({
        type: 'TOPIC',
        slug: uniqueSlug('topic-xss'),
        title: 'XSS 尝试',
        summary: '摘要',
        body: {
          type: 'doc',
          content: [{ type: 'paragraph', content: [{ type: 'script', text: 'alert(1)' }] }],
        },
        extension: { kind: 'TOPIC' },
      });

    // 白名单校验应拒绝 script 节点
    expect(res.status).toBe(400);
  });

  it('rejects a javascript: href in a link mark', async () => {
    const authorId = await createUser('crud-js@example.test', ['EDITOR']);

    const res = await request(serverOf(ensureApp()))
      .post('/api/v1/admin/contents')
      .set('Authorization', authHeader(authorId))
      .send({
        type: 'TOPIC',
        slug: uniqueSlug('topic-js'),
        title: 'JS 协议尝试',
        summary: '摘要',
        body: {
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              content: [
                {
                  type: 'text',
                  text: '点我',
                  marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }],
                },
              ],
            },
          ],
        },
        extension: { kind: 'TOPIC' },
      });

    expect(res.status).toBe(400);
  });

  it('increments version and adds a revision on update', async () => {
    const authorId = await createUser('crud-update@example.test', ['EDITOR']);
    const created = await createContent(authorId, 'topic-update');

    const res = await request(serverOf(ensureApp()))
      .patch(`/api/v1/admin/contents/${created.id}`)
      .set('Authorization', authHeader(authorId))
      .set('If-Match', 'W/"1"')
      .send({ title: '改过的标题' });

    expect(res.status).toBe(200);
    const body = res.body as { data: { version: number; title: string } };
    expect(body.data.version).toBe(2);
    expect(body.data.title).toBe('改过的标题');

    const revisions = await prisma.revision.findMany({
      where: { contentId: created.id },
      orderBy: { revisionNo: 'asc' },
    });
    expect(revisions).toHaveLength(2);
    expect(revisions[1]?.revisionNo).toBe(2);
  });

  it('returns 409 when If-Match carries a stale version', async () => {
    const authorId = await createUser('crud-conflict@example.test', ['EDITOR']);
    const created = await createContent(authorId, 'topic-conflict');

    const first = await request(serverOf(ensureApp()))
      .patch(`/api/v1/admin/contents/${created.id}`)
      .set('Authorization', authHeader(authorId))
      .set('If-Match', 'W/"1"')
      .send({ title: '第一次修改' });
    expect(first.status).toBe(200);

    // 第二次仍用 v1 → 必须 409，且不得静默覆盖
    const stale = await request(serverOf(ensureApp()))
      .patch(`/api/v1/admin/contents/${created.id}`)
      .set('Authorization', authHeader(authorId))
      .set('If-Match', 'W/"1"')
      .send({ title: '基于旧版本的修改' });

    expect(stale.status).toBe(409);
    const body = stale.body as { error: { code: string; details?: { currentVersion: number } } };
    expect(body.error.code).toBe('CONTENT_VERSION_CONFLICT');
    expect(body.error.details?.currentVersion).toBe(2);

    // 数据必须仍是第一次修改的结果
    const after = await prisma.content.findUniqueOrThrow({ where: { id: created.id } });
    expect(after.title).toBe('第一次修改');
    expect(after.version).toBe(2);
  });

  it('rejects an update without If-Match', async () => {
    const authorId = await createUser('crud-noetag@example.test', ['EDITOR']);
    const created = await createContent(authorId, 'topic-noetag');

    const res = await request(serverOf(ensureApp()))
      .patch(`/api/v1/admin/contents/${created.id}`)
      .set('Authorization', authHeader(authorId))
      .send({ title: '没有 If-Match' });

    expect(res.status).toBe(400);
  });

  it('rejects an invalid slug on create', async () => {
    const authorId = await createUser('crud-slug@example.test', ['EDITOR']);
    const res = await request(serverOf(ensureApp()))
      .post('/api/v1/admin/contents')
      .set('Authorization', authHeader(authorId))
      .send({
        type: 'TOPIC',
        slug: 'Bad Slug!',
        title: '非法 slug',
        summary: '摘要',
        body: VALID_BODY,
        extension: { kind: 'TOPIC' },
      });
    expect(res.status).toBe(400);
  });
});

describe('P1-08: state machine is enforced server-side', () => {
  it('allows DRAFT → IN_REVIEW for the author (submit)', async () => {
    const authorId = await createUser('sm-submit@example.test', ['EDITOR']);
    const created = await createContent(authorId, 'topic-submit');

    const res = await request(serverOf(ensureApp()))
      .post(`/api/v1/admin/contents/${created.id}/transition`)
      .set('Authorization', authHeader(authorId))
      .send({ action: 'SUBMIT' });

    expect(res.status).toBe(200);
    expect((res.body as { data: { status: string } }).data.status).toBe('IN_REVIEW');
  });

  it('records a review_actions row for every transition', async () => {
    const authorId = await createUser('sm-audit@example.test', ['EDITOR']);
    const created = await createContent(authorId, 'topic-audit');

    await request(serverOf(ensureApp()))
      .post(`/api/v1/admin/contents/${created.id}/transition`)
      .set('Authorization', authHeader(authorId))
      .send({ action: 'SUBMIT' });

    const actions = await prisma.reviewAction.findMany({
      where: { contentId: created.id },
    });
    expect(actions).toHaveLength(1);
    expect(actions[0]?.action).toBe('SUBMIT');
    expect(actions[0]?.fromStatus).toBe('DRAFT');
    expect(actions[0]?.toStatus).toBe('IN_REVIEW');
  });

  it('rejects EDITOR approving (AGENTS.md §4.2)', async () => {
    const authorId = await createUser('sm-editor@example.test', ['EDITOR']);
    await createUser('sm-reviewer@example.test', ['REVIEWER']);
    const created = await createContent(authorId, 'sm-editor');

    await request(serverOf(ensureApp()))
      .post(`/api/v1/admin/contents/${created.id}/transition`)
      .set('Authorization', authHeader(authorId))
      .send({ action: 'SUBMIT' });

    const res = await request(serverOf(ensureApp()))
      .post(`/api/v1/admin/contents/${created.id}/transition`)
      .set('Authorization', authHeader(authorId))
      .send({ action: 'APPROVE' });

    expect(res.status).toBe(403);
  });

  it('rejects a reviewer approving their own content (self-review ban)', async () => {
    const reviewerId = await createUser('sm-self@example.test', ['REVIEWER']);
    const created = await createContent(reviewerId, 'sm-self');

    await request(serverOf(ensureApp()))
      .post(`/api/v1/admin/contents/${created.id}/transition`)
      .set('Authorization', authHeader(reviewerId))
      .send({ action: 'SUBMIT' });

    const res = await request(serverOf(ensureApp()))
      .post(`/api/v1/admin/contents/${created.id}/transition`)
      .set('Authorization', authHeader(reviewerId))
      .send({ action: 'APPROVE' });

    expect(res.status).toBe(403);
    const body = res.body as { error: { message: string } };
    expect(body.error.message).toContain('自己创建的内容');
  });

  it('rejects REJECT without a reason', async () => {
    const authorId = await createUser('sm-reject@example.test', ['EDITOR']);
    const reviewerId = await createUser('sm-reject-r@example.test', ['REVIEWER']);
    // 作者是 editor，审核者是 reviewer —— 不同人，否则先被自审拦截挡住
    const created = await createContent(authorId, 'sm-reject');

    await request(serverOf(ensureApp()))
      .post(`/api/v1/admin/contents/${created.id}/transition`)
      .set('Authorization', authHeader(authorId))
      .send({ action: 'SUBMIT' });

    const res = await request(serverOf(ensureApp()))
      .post(`/api/v1/admin/contents/${created.id}/transition`)
      .set('Authorization', authHeader(reviewerId))
      .send({ action: 'REJECT' });

    expect(res.status).toBe(403);
    expect((res.body as { error: { message: string } }).error.message).toContain(
      '退回必须填写理由',
    );
  });

  it('rejects DRAFT → PUBLISHED (must pass review)', async () => {
    const authorId = await createUser('sm-skip@example.test', ['EDITOR']);
    const reviewerId = await createUser('sm-skip-r@example.test', ['REVIEWER']);
    const created = await createContent(authorId, 'sm-skip');

    const res = await request(serverOf(ensureApp()))
      .post(`/api/v1/admin/contents/${created.id}/transition`)
      .set('Authorization', authHeader(reviewerId))
      .send({ action: 'PUBLISH' });

    expect(res.status).toBe(403);
  });
});

describe('P1-08: publication readiness (structured 422)', () => {
  it('reports every unmet requirement at once', async () => {
    const authorId = await createUser('rd-missing@example.test', ['EDITOR']);
    const reviewerId = await createUser('rd-missing-r@example.test', ['REVIEWER']);
    const created = await createContent(authorId, 'rd-missing');

    // 走完 DRAFT → IN_REVIEW → APPROVED
    await request(serverOf(ensureApp()))
      .post(`/api/v1/admin/contents/${created.id}/transition`)
      .set('Authorization', authHeader(authorId))
      .send({ action: 'SUBMIT' });
    await request(serverOf(ensureApp()))
      .post(`/api/v1/admin/contents/${created.id}/transition`)
      .set('Authorization', authHeader(reviewerId))
      .send({ action: 'APPROVE' });

    const res = await request(serverOf(ensureApp()))
      .post(`/api/v1/admin/contents/${created.id}/transition`)
      .set('Authorization', authHeader(reviewerId))
      .send({ action: 'PUBLISH' });

    expect(res.status).toBe(422);
    const body = res.body as {
      error: { code: string; details: { issues: { code: string; field: string }[] } };
    };
    expect(body.error.code).toBe('PUBLICATION_NOT_READY');
    // 缺来源 → 至少报 SOURCE_REQUIRED
    const codes = body.error.details.issues.map((issue) => issue.code);
    expect(codes).toContain('SOURCE_REQUIRED');
  });

  it('publishes successfully once a source is attached', async () => {
    const authorId = await createUser('rd-ok@example.test', ['EDITOR']);
    const reviewerId = await createUser('rd-ok-r@example.test', ['REVIEWER']);
    const created = await createContent(authorId, 'rd-ok');

    // 建来源并挂上
    const source = await request(serverOf(ensureApp()))
      .post('/api/v1/admin/sources')
      .set('Authorization', authHeader(authorId))
      .send({
        kind: 'BOOK',
        title: '示例来源（待核验）',
        author: '示例作者',
        citationText: '示例引用文本',
      });
    expect(source.status).toBe(201);
    const sourceId = (source.body as { data: { id: string } }).data.id;

    const attach = await request(serverOf(ensureApp()))
      .post(`/api/v1/admin/contents/${created.id}/sources`)
      .set('Authorization', authHeader(authorId))
      .send({ sourceId, claimScope: '正文整体（示例 / 待核验）', isPrimary: true });
    expect(attach.status).toBe(201);

    await request(serverOf(ensureApp()))
      .post(`/api/v1/admin/contents/${created.id}/transition`)
      .set('Authorization', authHeader(authorId))
      .send({ action: 'SUBMIT' });
    await request(serverOf(ensureApp()))
      .post(`/api/v1/admin/contents/${created.id}/transition`)
      .set('Authorization', authHeader(reviewerId))
      .send({ action: 'APPROVE' });

    const res = await request(serverOf(ensureApp()))
      .post(`/api/v1/admin/contents/${created.id}/transition`)
      .set('Authorization', authHeader(reviewerId))
      .send({ action: 'PUBLISH' });

    expect(res.status).toBe(200);
    expect((res.body as { data: { status: string } }).data.status).toBe('PUBLISHED');

    // publishedAt 必须落库
    const after = await prisma.content.findUniqueOrThrow({ where: { id: created.id } });
    expect(after.publishedAt).not.toBeNull();
  });
});

describe('P1-05: sources / tags / relations integrity', () => {
  it('rejects a self-referencing relation', async () => {
    const authorId = await createUser('rel-self@example.test', ['EDITOR']);
    const created = await createContent(authorId, 'rel-self');

    const res = await request(serverOf(ensureApp()))
      .post(`/api/v1/admin/contents/${created.id}/relations`)
      .set('Authorization', authHeader(authorId))
      .send({ targetContentId: created.id, relationType: 'RELATED_TO' });

    expect(res.status).toBe(403);
    expect((res.body as { error: { message: string } }).error.message).toContain('自身');
  });

  it('rejects an unknown relation type', async () => {
    const authorId = await createUser('rel-type@example.test', ['EDITOR']);
    const a = await createContent(authorId, 'rel-type-a');
    const b = await createContent(authorId, 'rel-type-b');

    const res = await request(serverOf(ensureApp()))
      .post(`/api/v1/admin/contents/${a.id}/relations`)
      .set('Authorization', authHeader(authorId))
      .send({ targetContentId: b.id, relationType: 'IS_A' });

    expect(res.status).toBe(403);
    expect((res.body as { error: { message: string } }).error.message).toContain('关系类型');
  });

  it('creates a valid relation', async () => {
    const authorId = await createUser('rel-ok@example.test', ['EDITOR']);
    const a = await createContent(authorId, 'rel-ok-a');
    const b = await createContent(authorId, 'rel-ok-b');

    const res = await request(serverOf(ensureApp()))
      .post(`/api/v1/admin/contents/${a.id}/relations`)
      .set('Authorization', authHeader(authorId))
      .send({ targetContentId: b.id, relationType: 'PART_OF' });

    expect(res.status).toBe(201);
  });

  it('rejects attaching a tag that does not exist', async () => {
    const authorId = await createUser('tag-missing@example.test', ['EDITOR']);
    const created = await createContent(authorId, 'tag-missing');

    const res = await request(serverOf(ensureApp()))
      .post(`/api/v1/admin/contents/${created.id}/tags`)
      .set('Authorization', authHeader(authorId))
      .send({ tagSlug: 'never-created' });

    expect(res.status).toBe(403);
  });

  it('is idempotent when attaching the same tag twice', async () => {
    const authorId = await createUser('tag-idem@example.test', ['EDITOR']);
    const created = await createContent(authorId, 'tag-idem');

    await request(serverOf(ensureApp()))
      .post('/api/v1/admin/tags')
      .set('Authorization', authHeader(authorId))
      .send({ slug: 'architecture', displayName: '建筑' });

    const first = await request(serverOf(ensureApp()))
      .post(`/api/v1/admin/contents/${created.id}/tags`)
      .set('Authorization', authHeader(authorId))
      .send({ tagSlug: 'architecture' });
    expect(first.status).toBe(201);

    const second = await request(serverOf(ensureApp()))
      .post(`/api/v1/admin/contents/${created.id}/tags`)
      .set('Authorization', authHeader(authorId))
      .send({ tagSlug: 'architecture' });
    expect(second.status).toBe(201);

    const rows = await prisma.contentTag.findMany({ where: { contentId: created.id } });
    expect(rows).toHaveLength(1);
  });
});

describe('public read endpoints', () => {
  it('hides drafts from the public list', async () => {
    const authorId = await createUser('pub-draft@example.test', ['EDITOR']);
    await createContent(authorId, 'pub-draft');

    const res = await request(serverOf(ensureApp())).get('/api/v1/contents?limit=100');
    expect(res.status).toBe(200);
    const items = (res.body as { data: { slug: string }[] }).data;
    expect(items.some((item) => item.slug === 'pub-draft-1')).toBe(false);
  });

  it('returns 404 for a draft slug on the public detail endpoint', async () => {
    const authorId = await createUser('pub-404@example.test', ['EDITOR']);
    const created = await createContent(authorId, 'pub-404');

    const res = await request(serverOf(ensureApp())).get(`/api/v1/contents/${created.slug}`);
    expect(res.status).toBe(404);
  });

  it('does not require authentication for public reads', async () => {
    const res = await request(serverOf(ensureApp())).get('/api/v1/contents');
    expect(res.status).toBe(200);
  });
});

/**
 * 造一个 DRAFT 内容。
 *
 * `submitterId` 是**执行送审的人**，`authorId` 是内容的 `createdById`。
 * 两者分开才能构造"编辑建稿、他人审核"的正常审核场景 —— 默认相同
 * 会触发自审拦截（reviewer 审自己的稿），让后续断言测不到真正的东西。
 */
async function createContent(
  submitterId: string,
  slugPrefix: string,
  authorId?: string,
): Promise<{ id: string; slug: string; version: number }> {
  const slug = uniqueSlug(slugPrefix);
  const res = await request(serverOf(ensureApp()))
    .post('/api/v1/admin/contents')
    .set('Authorization', authHeader(authorId ?? submitterId))
    .send({
      type: 'TOPIC',
      slug,
      title: `示例内容 ${slug}`,
      summary: '示例摘要，标记为待核验。',
      body: VALID_BODY,
      extension: { kind: 'TOPIC' },
    });
  expect(res.status).toBe(201);
  return (res.body as { data: { id: string; slug: string; version: number } }).data;
}
