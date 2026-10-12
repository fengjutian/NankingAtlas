import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { hashPassword } from '../../src/lib/password.js';
import { closeTestApp, createTestApp, prisma, request, serverOf } from '../app-harness.js';

import type { INestApplication } from '@nestjs/common';

/**
 * FD-001：Revision 历史读取的集成测试。
 *
 * 验证的是**只读追溯链路**（AGENTS.md §5.4「revision / review action / audit log
 * 只增不改」）与**服务端鉴权**（§4.1），这些在单元测试里看不到：
 *   - 未认证 401、无编辑角色 403（不是靠 UI 隐藏按钮）
 *   - 分页有上限、非法分页 / 非法游标被白名单拒绝（400），不退化成第一页
 *   - 排序稳定：同一游标重放得到同一页，翻页不重不漏
 *   - revision / review action 保持只读：不存在修改或删除端点
 *   - 快照摘要只含白名单字段，不泄露 email / passwordHash / token
 *   - 状态流转后 revision、review action、audit log 同事务可见
 */

const PASSWORD = 'revision-integration-password-2026';

const VALID_BODY = {
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      content: [{ type: 'text', text: '示例正文，标记为待核验。' }],
    },
  ],
};

interface RevisionEntry {
  revisionNo: number;
  createdAt: string;
  action: string;
  actor: { id: string; displayName: string };
  snapshot: {
    title: string;
    subtitle: string | null;
    summary: string | null;
    slug: string;
    bodyText: string;
    bodyTextLength: number;
    bodyTextTruncated: boolean;
  };
}

interface RevisionPage {
  items: RevisionEntry[];
  nextCursor: string | null;
  hasMore: boolean;
}

interface ReviewActionEntry {
  action: string;
  fromStatus: string;
  toStatus: string;
  reason: string | null;
  createdAt: string;
  actor: { id: string; displayName: string };
}

let app: INestApplication | undefined;
const tokens = new Map<string, string>();

function ensureApp(): INestApplication {
  if (app === undefined) {
    throw new Error('app not initialised');
  }
  return app;
}

let userCounter = 0;

async function createUser(email: string, roles: string[]): Promise<string> {
  const passwordHash = await hashPassword(PASSWORD);
  userCounter += 1;
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash,
      // displayName 刻意**不含** email：下面的安全断言要证明响应里不出现
      // email，如果 displayName 本身就是 email 派生，断言就失去意义了。
      displayName: `测试编辑者 ${String(userCounter)}`,
      userRoles: { create: roles.map((role) => ({ role })) },
    },
  });
  const login = await request(serverOf(ensureApp()))
    .post('/api/v1/auth/login')
    .send({ email, password: PASSWORD });
  const accessToken = (login.body as { data: { accessToken: string } }).data.accessToken;
  tokens.set(user.id, accessToken);
  return user.id;
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

/** 建一份带 n 次编辑的内容，返回 content id；每次编辑产生一个 revision。 */
async function createContentWithEdits(
  editorId: string,
  edits: string[],
): Promise<string> {
  const created = await request(serverOf(ensureApp()))
    .post('/api/v1/admin/contents')
    .set('Authorization', authHeader(editorId))
    .send({
      type: 'TOPIC',
      slug: uniqueSlug('rev-topic'),
      title: '秦淮风光带',
      summary: '明城墙与秦淮河沿岸的历史街区。（示例 / 待核验）',
      body: VALID_BODY,
      extension: { kind: 'TOPIC', curatorNote: '策展笔记（示例）' },
    });
  expect(created.status).toBe(201);
  const id = (created.body as { data: { id: string; version: number } }).data.id;
  let version = (created.body as { data: { version: number } }).data.version;

  for (const title of edits) {
    const patched = await request(serverOf(ensureApp()))
      .patch(`/api/v1/admin/contents/${id}`)
      .set('Authorization', authHeader(editorId))
      .set('If-Match', `W/"${String(version)}"`)
      .send({ title });
    expect(patched.status).toBe(200);
    version = (patched.body as { data: { version: number } }).data.version;
  }

  return id;
}

async function fetchRevisions(
  contentId: string,
  userId: string,
  query = '',
): Promise<{ status: number; body: unknown }> {
  const res = await request(serverOf(ensureApp()))
    .get(`/api/v1/admin/contents/${contentId}/revisions${query}`)
    .set('Authorization', authHeader(userId));
  return { status: res.status, body: res.body };
}

async function fetchReviewActions(
  contentId: string,
  userId: string,
  query = '',
): Promise<{ status: number; body: unknown }> {
  const res = await request(serverOf(ensureApp()))
    .get(`/api/v1/admin/contents/${contentId}/review-actions${query}`)
    .set('Authorization', authHeader(userId));
  return { status: res.status, body: res.body };
}

beforeAll(async () => {
  app = await createTestApp();
});

afterAll(async () => {
  await closeTestApp(app);
});

describe('FD-001: revisions 读取的鉴权边界', () => {
  it('未认证返回 401', async () => {
    const editorId = await createUser('rev-anon-editor@example.test', ['EDITOR']);
    const contentId = await createContentWithEdits(editorId, []);

    const res = await request(serverOf(ensureApp())).get(
      `/api/v1/admin/contents/${contentId}/revisions`,
    );
    expect(res.status).toBe(401);
    const body = res.body as { error: { code: string; requestId: string } };
    expect(body.error.code).toBe('UNAUTHORIZED');
    expect(body.error.requestId).toBeTruthy();
  });

  it('无编辑角色的登录用户返回 403（服务端拦截，不是前端隐藏）', async () => {
    const editorId = await createUser('rev-norole-editor@example.test', ['EDITOR']);
    const contentId = await createContentWithEdits(editorId, []);
    const noRoleId = await createUser('rev-norole-user@example.test', []);

    const revisions = await fetchRevisions(contentId, noRoleId);
    expect(revisions.status).toBe(403);
    expect((revisions.body as { error: { code: string } }).error.code).toBe('FORBIDDEN');

    const reviewActions = await fetchReviewActions(contentId, noRoleId);
    expect(reviewActions.status).toBe(403);
    expect((reviewActions.body as { error: { code: string } }).error.code).toBe('FORBIDDEN');
  });

  it('EDITOR / REVIEWER / ADMIN 都能读取审核历史', async () => {
    const editorId = await createUser('rev-roles-editor@example.test', ['EDITOR']);
    const contentId = await createContentWithEdits(editorId, []);
    const reviewerId = await createUser('rev-roles-reviewer@example.test', ['REVIEWER']);
    const adminId = await createUser('rev-roles-admin@example.test', ['ADMIN']);

    for (const userId of [editorId, reviewerId, adminId]) {
      const revisions = await fetchRevisions(contentId, userId);
      expect(revisions.status).toBe(200);
      const reviewActions = await fetchReviewActions(contentId, userId);
      expect(reviewActions.status).toBe(200);
    }
  });

  it('内容不存在返回 404，且不泄露资源存在性细节', async () => {
    const editorId = await createUser('rev-404-editor@example.test', ['EDITOR']);
    const contentId = await createContentWithEdits(editorId, []);

    // 对照组：同一端点、同一凭据，对已存在内容必须 200 —— 否则下面的 404
    // 只能证明"路由不存在"，证明不了"资源不存在被正确处理"。
    expect((await fetchRevisions(contentId, editorId)).status).toBe(200);

    const revisions = await fetchRevisions('content-does-not-exist', editorId);
    expect(revisions.status).toBe(404);
    expect((revisions.body as { error: { code: string } }).error.code).toBe('NOT_FOUND');

    const reviewActions = await fetchReviewActions('content-does-not-exist', editorId);
    expect(reviewActions.status).toBe(404);
    expect((reviewActions.body as { error: { code: string } }).error.code).toBe('NOT_FOUND');
  });
});

describe('FD-001: revision 分页与排序', () => {
  it('按 revisionNo 倒序返回完整历史', async () => {
    const editorId = await createUser('rev-order-editor@example.test', ['EDITOR']);
    const contentId = await createContentWithEdits(editorId, ['标题一', '标题二', '标题三']);

    const { status, body } = await fetchRevisions(contentId, editorId);
    expect(status).toBe(200);
    const page = body as { data: RevisionPage };
    expect(page.data.items.map((item) => item.revisionNo)).toEqual([4, 3, 2, 1]);
    expect(page.data.hasMore).toBe(false);
    expect(page.data.nextCursor).toBeNull();
  });

  it('limit 有上限，翻页不重不漏且可复现', async () => {
    const editorId = await createUser('rev-page-editor@example.test', ['EDITOR']);
    const contentId = await createContentWithEdits(editorId, ['一', '二', '三', '四', '五']);

    const first = await fetchRevisions(contentId, editorId, '?limit=2');
    expect(first.status).toBe(200);
    const firstPage = (first.body as { data: RevisionPage }).data;
    expect(firstPage.items.map((item) => item.revisionNo)).toEqual([6, 5]);
    expect(firstPage.hasMore).toBe(true);
    expect(firstPage.nextCursor).toBeTruthy();

    const secondQuery = `?limit=2&cursor=${encodeURIComponent(firstPage.nextCursor ?? '')}`;
    const second = await fetchRevisions(contentId, editorId, secondQuery);
    const secondPage = (second.body as { data: RevisionPage }).data;
    expect(secondPage.items.map((item) => item.revisionNo)).toEqual([4, 3]);

    // 同一游标重放必须得到同一页（确定性，否则翻页会重复/漏读）
    const replay = await fetchRevisions(contentId, editorId, secondQuery);
    expect(replay.status).toBe(200);
    const replayPage = (replay.body as { data: RevisionPage }).data;
    expect(replayPage.items.map((item) => item.revisionNo)).toEqual(
      secondPage.items.map((item) => item.revisionNo),
    );

    const third = await fetchRevisions(
      contentId,
      editorId,
      `?limit=2&cursor=${encodeURIComponent(secondPage.nextCursor ?? '')}`,
    );
    const thirdPage = (third.body as { data: RevisionPage }).data;
    expect(thirdPage.items.map((item) => item.revisionNo)).toEqual([2, 1]);
    expect(thirdPage.hasMore).toBe(false);
    expect(thirdPage.nextCursor).toBeNull();

    // 三页合起来正好覆盖 1..6，不重不漏
    const seen = [
      ...firstPage.items,
      ...secondPage.items,
      ...thirdPage.items,
    ].map((item) => item.revisionNo);
    expect(seen).toEqual([6, 5, 4, 3, 2, 1]);
  });

  it('拒绝非法分页与非法游标，不静默退化成第一页', async () => {
    const editorId = await createUser('rev-invalid-editor@example.test', ['EDITOR']);
    const contentId = await createContentWithEdits(editorId, ['一']);

    const tooLarge = await fetchRevisions(contentId, editorId, '?limit=101');
    expect(tooLarge.status).toBe(400);
    expect((tooLarge.body as { error: { code: string } }).error.code).toBe('VALIDATION_FAILED');

    const zero = await fetchRevisions(contentId, editorId, '?limit=0');
    expect(zero.status).toBe(400);

    const fraction = await fetchRevisions(contentId, editorId, '?limit=1.5');
    expect(fraction.status).toBe(400);

    const unknownParam = await fetchRevisions(contentId, editorId, '?unknown=1');
    expect(unknownParam.status).toBe(400);

    const badCursor = await fetchRevisions(contentId, editorId, '?cursor=not-a-real-cursor');
    expect(badCursor.status).toBe(400);
    expect((badCursor.body as { error: { code: string } }).error.code).toBe('VALIDATION_FAILED');

    const badReviewCursor = await fetchReviewActions(
      contentId,
      editorId,
      '?cursor=%%%',
    );
    expect(badReviewCursor.status).toBe(400);
  });
});

describe('FD-001: 快照摘要的安全性', () => {
  it('返回白名单字段，不泄露 email / 密码哈希 / 内部字段', async () => {
    const editorId = await createUser('rev-safe-editor@example.test', ['EDITOR']);
    const contentId = await createContentWithEdits(editorId, ['标题一']);

    const { status, body } = await fetchRevisions(contentId, editorId);
    expect(status).toBe(200);
    const serialized = JSON.stringify(body);

    expect(serialized).not.toContain('passwordHash');
    expect(serialized).not.toContain('password_hash');
    expect(serialized).not.toContain('rev-safe-editor@example.test');
    expect(serialized).not.toContain('token');
    expect(serialized).not.toContain('snapshotJson');

    const page = body as { data: RevisionPage };
    for (const item of page.data.items) {
      expect(Object.keys(item).sort()).toEqual(
        ['action', 'actor', 'createdAt', 'revisionNo', 'snapshot'].sort(),
      );
      expect(Object.keys(item.actor).sort()).toEqual(['displayName', 'id']);
      expect(Object.keys(item.snapshot).sort()).toEqual([
        'bodyText',
        'bodyTextLength',
        'bodyTextTruncated',
        'slug',
        'subtitle',
        'summary',
        'title',
      ]);
    }
  });

  it('正文以纯文本摘要返回，超长时截断并标记', async () => {
    const editorId = await createUser('rev-body-editor@example.test', ['EDITOR']);
    const longText = '长'.repeat(6000);
    const created = await request(serverOf(ensureApp()))
      .post('/api/v1/admin/contents')
      .set('Authorization', authHeader(editorId))
      .send({
        type: 'TOPIC',
        slug: uniqueSlug('rev-long'),
        title: '长正文示例',
        body: {
          type: 'doc',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: longText }] }],
        },
        extension: { kind: 'TOPIC' },
      });
    expect(created.status).toBe(201);
    const contentId = (created.body as { data: { id: string } }).data.id;

    const { body } = await fetchRevisions(contentId, editorId);
    const page = body as { data: RevisionPage };
    const snapshot = page.data.items[0]?.snapshot;
    expect(snapshot?.bodyTextLength).toBe(longText.length);
    expect(snapshot?.bodyTextTruncated).toBe(true);
    expect((snapshot?.bodyText.length ?? 0)).toBeLessThan(longText.length);

    // 摘要里不得出现 Tiptap 结构标记
    expect(snapshot?.bodyText).not.toContain('"type"');
    expect(snapshot?.bodyText).not.toContain('<');
  });

  it('版本 1 标记为 CREATE，后续为 UPDATE', async () => {
    const editorId = await createUser('rev-action-editor@example.test', ['EDITOR']);
    const contentId = await createContentWithEdits(editorId, ['标题一']);

    const { body } = await fetchRevisions(contentId, editorId);
    const page = body as { data: RevisionPage };
    const actions = page.data.items.map((item) => [item.revisionNo, item.action]);
    expect(actions).toEqual([
      [2, 'UPDATE'],
      [1, 'CREATE'],
    ]);
  });
});

describe('FD-001: 只读性', () => {
  it('revision 与 review action 没有修改 / 删除端点', async () => {
    const editorId = await createUser('rev-readonly-editor@example.test', ['EDITOR']);
    const contentId = await createContentWithEdits(editorId, ['标题一']);

    const patch = await request(serverOf(ensureApp()))
      .patch(`/api/v1/admin/contents/${contentId}/revisions`)
      .set('Authorization', authHeader(editorId))
      .send({ revisionNo: 1 });
    expect(patch.status).toBe(404);

    const remove = await request(serverOf(ensureApp()))
      .delete(`/api/v1/admin/contents/${contentId}/revisions/1`)
      .set('Authorization', authHeader(editorId));
    expect(remove.status).toBe(404);

    const patchAction = await request(serverOf(ensureApp()))
      .patch(`/api/v1/admin/contents/${contentId}/review-actions`)
      .set('Authorization', authHeader(editorId))
      .send({ action: 'APPROVE' });
    expect(patchAction.status).toBe(404);
  });
});

describe('FD-001: 状态流转后的追溯一致性', () => {
  it('流转后 review action、audit log 同事务可见，revision 不被伪造', async () => {
    const editorId = await createUser('rev-flow-editor@example.test', ['EDITOR']);
    const reviewerId = await createUser('rev-flow-reviewer@example.test', ['REVIEWER']);
    const contentId = await createContentWithEdits(editorId, ['标题一']);

    const submitted = await request(serverOf(ensureApp()))
      .post(`/api/v1/admin/contents/${contentId}/transition`)
      .set('Authorization', authHeader(editorId))
      .send({ action: 'SUBMIT' });
    expect(submitted.status).toBe(200);

    const rejected = await request(serverOf(ensureApp()))
      .post(`/api/v1/admin/contents/${contentId}/transition`)
      .set('Authorization', authHeader(reviewerId))
      .send({ action: 'REJECT', reason: '缺少可核验来源' });
    expect(rejected.status).toBe(200);

    // review action 可见，且带退回理由
    const actions = await fetchReviewActions(contentId, reviewerId);
    expect(actions.status).toBe(200);
    const actionPage = actions.body as { data: { items: ReviewActionEntry[] } };
    const mapped = actionPage.data.items.map((item) => [item.action, item.fromStatus, item.toStatus]);
    expect(mapped).toEqual([
      ['REJECT', 'IN_REVIEW', 'DRAFT'],
      ['SUBMIT', 'DRAFT', 'IN_REVIEW'],
    ]);
    const rejectEntry = actionPage.data.items[0];
    expect(rejectEntry?.reason).toBe('缺少可核验来源');
    expect(rejectEntry?.actor.id).toBe(reviewerId);

    // audit log 与 review action 同事务落库
    const audits = await prisma.auditLog.findMany({
      where: { entityId: contentId, action: { in: ['content.submit', 'content.reject'] } },
    });
    expect(audits).toHaveLength(2);

    // 流转本身不产生 revision —— 历史仍是两次编辑
    const revisions = await fetchRevisions(contentId, editorId);
    const revisionPage = (revisions.body as { data: RevisionPage }).data;
    expect(revisionPage.items.map((item) => item.revisionNo)).toEqual([2, 1]);
  });

  it('review action 分页同样稳定且有上限', async () => {
    const editorId = await createUser('rev-action-page-editor@example.test', ['EDITOR']);
    const reviewerId = await createUser('rev-action-page-reviewer@example.test', ['REVIEWER']);
    const contentId = await createContentWithEdits(editorId, []);

    // APPROVE 后进入 APPROVED，无法再 SUBMIT；这里走 DRAFT ⇄ IN_REVIEW 的
    // 提交 / 退回循环（退回理由必填，且 Reviewer 不能审核自己创建的稿件）。
    for (let i = 0; i < 3; i += 1) {
      const submitted = await request(serverOf(ensureApp()))
        .post(`/api/v1/admin/contents/${contentId}/transition`)
        .set('Authorization', authHeader(editorId))
        .send({ action: 'SUBMIT' });
      expect(submitted.status).toBe(200);
      const rejected = await request(serverOf(ensureApp()))
        .post(`/api/v1/admin/contents/${contentId}/transition`)
        .set('Authorization', authHeader(reviewerId))
        .send({ action: 'REJECT', reason: `第 ${String(i + 1)} 次退回：来源待补` });
      expect(rejected.status).toBe(200);
    }

    const first = await fetchReviewActions(contentId, reviewerId, '?limit=2');
    const firstPage = (first.body as { data: { items: ReviewActionEntry[]; nextCursor: string | null } })
      .data;
    expect(firstPage.items.map((item) => item.action)).toEqual(['REJECT', 'SUBMIT']);
    expect(firstPage.nextCursor).toBeTruthy();

    const secondQuery = `?limit=2&cursor=${encodeURIComponent(firstPage.nextCursor ?? '')}`;
    const second = await fetchReviewActions(contentId, reviewerId, secondQuery);
    const secondPage = (second.body as { data: { items: ReviewActionEntry[]; nextCursor: string | null } })
      .data;
    expect(secondPage.items.map((item) => item.action)).toEqual(['REJECT', 'SUBMIT']);
    expect(secondPage.nextCursor).toBeTruthy();

    const third = await fetchReviewActions(
      contentId,
      reviewerId,
      `?limit=2&cursor=${encodeURIComponent(secondPage.nextCursor ?? '')}`,
    );
    const thirdPage = (third.body as { data: { items: ReviewActionEntry[]; nextCursor: string | null } })
      .data;
    expect(thirdPage.items.map((item) => item.action)).toEqual(['REJECT', 'SUBMIT']);
    expect(thirdPage.nextCursor).toBeNull();

    // 三页合起来正好是 6 次流转，不重不漏
    expect(
      [...firstPage.items, ...secondPage.items, ...thirdPage.items].map((item) => item.action),
    ).toEqual(['REJECT', 'SUBMIT', 'REJECT', 'SUBMIT', 'REJECT', 'SUBMIT']);
  });
});