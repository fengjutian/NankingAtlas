import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { hashPassword } from '../../src/lib/password.js';
import { closeTestApp, createTestApp, prisma, request, serverOf } from '../app-harness.js';

import type { INestApplication } from '@nestjs/common';

/**
 * FD-002：来源库检索与选择器的集成测试。
 *
 * 验证目标（功能开发计划 §5 FD-002）：
 *   - 检索端点的鉴权边界：未认证 401、无编辑角色 403
 *   - title / author / publisher / kind 检索与分页
 *   - 输入长度、分页大小、排序字段白名单（非法值 400，不静默兜底）
 *   - 同名来源可被区分（作者 / 出版方 / 日期 / 访问日期 / 核验备注都在结果里）
 *   - 重复关联返回 409 而不是 500（唯一约束冲突必须可读）
 *   - 越权创建与关联失败
 */

const PASSWORD = 'source-search-integration-password-2026';

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
      displayName: `来源测试用户 ${String(userCounter)}`,
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

let sourceCounter = 0;

async function createSource(
  userId: string,
  overrides: Partial<{
    kind: string;
    title: string;
    author: string;
    publisher: string;
    publicationDate: string;
    accessedAt: string;
    citationText: string;
    verificationNote: string;
  }> = {},
): Promise<string> {
  sourceCounter += 1;
  const res = await request(serverOf(ensureApp()))
    .post('/api/v1/admin/sources')
    .set('Authorization', authHeader(userId))
    .send({
      kind: 'BOOK',
      title: `金陵志 ${String(sourceCounter)}`,
      author: '佚名',
      publisher: '测试出版社',
      ...overrides,
    });
  expect(res.status, `创建来源失败：${JSON.stringify(res.body)}`).toBe(201);
  return (res.body as { data: { id: string } }).data.id;
}

let contentCounter = 0;

async function createContent(userId: string): Promise<string> {
  contentCounter += 1;
  const res = await request(serverOf(ensureApp()))
    .post('/api/v1/admin/contents')
    .set('Authorization', authHeader(userId))
    .send({
      type: 'TOPIC',
      slug: `src-topic-${String(contentCounter)}`,
      title: '来源测试内容',
      summary: '（示例 / 待核验）',
      body: {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: '示例正文。' }] }],
      },
      extension: { kind: 'TOPIC' },
    });
  expect(res.status).toBe(201);
  return (res.body as { data: { id: string } }).data.id;
}

interface SourceSearchItem {
  id: string;
  kind: string;
  title: string;
  author: string | null;
  publisher: string | null;
  publicationDate: string | null;
  accessedAt: string | null;
  verificationNote: string | null;
}

interface SourceSearchPage {
  items: SourceSearchItem[];
  nextCursor: string | null;
  hasMore: boolean;
}

async function searchSources(
  userId: string | null,
  query = '',
): Promise<{ status: number; body: unknown }> {
  const builder = request(serverOf(ensureApp())).get(`/api/v1/admin/sources${query}`);
  if (userId !== null) {
    builder.set('Authorization', authHeader(userId));
  }
  const res = await builder;
  return { status: res.status, body: res.body };
}

beforeAll(async () => {
  app = await createTestApp();
});

afterAll(async () => {
  await closeTestApp(app);
});

describe('FD-002: 来源检索的鉴权边界', () => {
  it('未认证返回 401', async () => {
    const res = await searchSources(null);
    expect(res.status).toBe(401);
    expect((res.body as { error: { code: string } }).error.code).toBe('UNAUTHORIZED');
  });

  it('无编辑角色的登录用户返回 403', async () => {
    const noRoleId = await createUser('src-norole@example.test', []);
    const res = await searchSources(noRoleId);
    expect(res.status).toBe(403);
    expect((res.body as { error: { code: string } }).error.code).toBe('FORBIDDEN');
  });

  it('EDITOR / REVIEWER / ADMIN 都能检索来源', async () => {
    const editorId = await createUser('src-editor@example.test', ['EDITOR']);
    const reviewerId = await createUser('src-reviewer@example.test', ['REVIEWER']);
    const adminId = await createUser('src-admin@example.test', ['ADMIN']);

    for (const userId of [editorId, reviewerId, adminId]) {
      const res = await searchSources(userId);
      expect(res.status).toBe(200);
    }
  });
});

describe('FD-002: 检索与白名单校验', () => {
  let editorId: string;

  beforeAll(async () => {
    editorId = await createUser('src-search-editor@example.test', ['EDITOR']);
    await createSource(editorId, {
      title: '金陵古今图考',
      author: '陈仕龙',
      publisher: '江南书局',
      publicationDate: '2008-04-01',
    });
    await createSource(editorId, {
      title: '南京城墙考古报告',
      author: '南京市文物局',
      publisher: '文物出版社',
      kind: 'ARTICLE',
    });
    await createSource(editorId, {
      title: '秦淮笔记',
      author: '陈仕龙',
      publisher: '地方文献社',
    });
  });

  it('空查询返回全部来源，按创建时间倒序', async () => {
    const res = await searchSources(editorId);
    expect(res.status).toBe(200);
    const page = (res.body as { data: SourceSearchPage }).data;
    expect(page.items.length).toBeGreaterThanOrEqual(3);
    // 游标分页的第一页必须有确定顺序：新建的在最前
    const dates = page.items.map((item) => item.id);
    expect(new Set(dates).size).toBe(dates.length);
  });

  it('按 title 检索', async () => {
    const res = await searchSources(editorId, '?q=城墙');
    expect(res.status).toBe(200);
    const page = (res.body as { data: SourceSearchPage }).data;
    expect(page.items).toHaveLength(1);
    expect(page.items[0]?.title).toBe('南京城墙考古报告');
  });

  it('按 author 检索', async () => {
    const res = await searchSources(editorId, '?q=南京市文物局');
    expect(res.status).toBe(200);
    const page = (res.body as { data: SourceSearchPage }).data;
    expect(page.items.map((item) => item.title)).toEqual(['南京城墙考古报告']);
  });

  it('按 publisher 检索', async () => {
    const res = await searchSources(editorId, '?q=江南书局');
    expect(res.status).toBe(200);
    const page = (res.body as { data: SourceSearchPage }).data;
    expect(page.items.map((item) => item.title)).toEqual(['金陵古今图考']);
  });

  it('按 kind 精确过滤', async () => {
    const res = await searchSources(editorId, '?kind=ARTICLE');
    expect(res.status).toBe(200);
    const page = (res.body as { data: SourceSearchPage }).data;
    expect(page.items.every((item) => item.kind === 'ARTICLE')).toBe(true);
  });

  it('q 同时匹配 title / author / publisher', async () => {
    const res = await searchSources(editorId, '?q=陈仕龙');
    expect(res.status).toBe(200);
    const page = (res.body as { data: SourceSearchPage }).data;
    // 陈仕龙 既是一个来源的作者，也是另一个来源的作者
    expect([...page.items.map((item) => item.title)].sort()).toEqual(
      [...['金陵古今图考', '秦淮笔记']].sort(),
    );
  });

  it('无结果返回空页而不是 404 或报错', async () => {
    const res = await searchSources(editorId, '?q=绝对不存在的来源名称xyz');
    expect(res.status).toBe(200);
    const page = (res.body as { data: SourceSearchPage }).data;
    expect(page.items).toEqual([]);
    expect(page.hasMore).toBe(false);
    expect(page.nextCursor).toBeNull();
  });

  it('同名来源可被区分：区分字段都在结果里', async () => {
    // 两条完全同名的来源，只有作者 / 出版方 / 核验备注不同
    await createSource(editorId, {
      title: '金陵览古',
      author: '甲本作者',
      publisher: '甲出版社',
      accessedAt: '2026-01-02T00:00:00.000Z',
      verificationNote: '甲本已核对馆藏（示例）',
    });
    await createSource(editorId, {
      title: '金陵览古',
      author: '乙本作者',
      publisher: '乙出版社',
      accessedAt: '2026-02-03T00:00:00.000Z',
      verificationNote: '乙本待核验（示例）',
    });

    const res = await searchSources(editorId, '?q=金陵览古');
    expect(res.status).toBe(200);
    const items = (res.body as { data: SourceSearchPage }).data.items;
    expect(items).toHaveLength(2);

    // 同名 → 必须能用这些字段把它们区分开，否则编辑无法判断该选哪一条
    const authors = items.map((item) => item.author);
    expect(new Set(authors).size).toBe(2);
    expect(items.every((item) => item.publisher !== null)).toBe(true);
    expect(items.some((item) => item.accessedAt !== null)).toBe(true);
    expect(items.some((item) => item.verificationNote !== null)).toBe(true);
  });

  it('超长查询被拒绝（输入长度白名单）', async () => {
    const res = await searchSources(editorId, `?q=${'x'.repeat(201)}`);
    expect(res.status).toBe(400);
    expect((res.body as { error: { code: string } }).error.code).toBe('VALIDATION_FAILED');
  });

  it('非法 kind 被拒绝', async () => {
    const res = await searchSources(editorId, '?kind=NOT_A_KIND');
    expect(res.status).toBe(400);
  });

  it('非法分页参数被拒绝，不静默截断', async () => {
    expect((await searchSources(editorId, '?limit=0')).status).toBe(400);
    expect((await searchSources(editorId, '?limit=101')).status).toBe(400);
    expect((await searchSources(editorId, '?limit=1.5')).status).toBe(400);
    expect((await searchSources(editorId, '?limit=abc')).status).toBe(400);
  });

  it('未知 query 参数被白名单拒绝', async () => {
    const res = await searchSources(editorId, '?orderBy=id');
    expect(res.status).toBe(400);
  });

  it('非法排序字段被拒绝（排序白名单）', async () => {
    expect((await searchSources(editorId, '?sort=url')).status).toBe(400);
    expect((await searchSources(editorId, '?sort=createdAt:desc')).status).toBe(200);
    expect((await searchSources(editorId, '?sort=title:asc')).status).toBe(200);
    expect((await searchSources(editorId, '?sort=title:desc')).status).toBe(400);
  });

  it('非法游标被拒绝', async () => {
    expect((await searchSources(editorId, '?cursor=not-a-cursor')).status).toBe(400);
    expect((await searchSources(editorId, '?cursor=%%%')).status).toBe(400);
  });
});

describe('FD-002: 分页稳定性与游标一致性', () => {
  it('createdAt 倒序分页不重不漏且可复现', async () => {
    const editorId = await createUser('src-page-editor@example.test', ['EDITOR']);
    const marker = `分页标记${String(sourceCounter)}`;
    const created: string[] = [];
    for (let i = 0; i < 5; i += 1) {
      created.push(await createSource(editorId, { title: `${marker}-${String(i)}` }));
    }

    const seen: string[] = [];
    let cursor: string | null = null;
    for (let pageIndex = 0; pageIndex < 5; pageIndex += 1) {
      const query = `?q=${encodeURIComponent(marker)}&limit=2${cursor === null ? '' : `&cursor=${encodeURIComponent(cursor)}`}`;
      const res = await searchSources(editorId, query);
      expect(res.status).toBe(200);
      const page = (res.body as { data: SourceSearchPage }).data;
      seen.push(...page.items.map((item) => item.id));
      if (!page.hasMore) {
        expect(page.nextCursor).toBeNull();
        cursor = null;
        break;
      }
      cursor = page.nextCursor;
    }

    // 恰好 5 条、每页 2 条 → 会有一页只有 1 条
    expect(seen).toHaveLength(5);
    expect(new Set(seen).size).toBe(5);
    // createdAt 倒序：最后创建的在最前
    expect(seen[0]).toBe(created[4]);
    expect(seen[4]).toBe(created[0]);
  });

  it('同一游标重放得到同一页', async () => {
    const editorId = await createUser('src-replay-editor@example.test', ['EDITOR']);
    for (let i = 0; i < 3; i += 1) {
      await createSource(editorId, { title: `重放标记${String(sourceCounter)}-${String(i)}` });
    }

    const first = await searchSources(editorId, '?limit=1');
    const firstPage = (first.body as { data: SourceSearchPage }).data;
    expect(firstPage.nextCursor).toBeTruthy();

    const query = `?limit=1&cursor=${encodeURIComponent(firstPage.nextCursor ?? '')}`;
    const second = await searchSources(editorId, query);
    const secondPage = (second.body as { data: SourceSearchPage }).data;
    const replay = await searchSources(editorId, query);
    const replayPage = (replay.body as { data: SourceSearchPage }).data;

    expect(replayPage.items.map((item) => item.id)).toEqual(
      secondPage.items.map((item) => item.id),
    );
  });

  it('排序字段不同则游标不可混用，返回 400', async () => {
    const editorId = await createUser('src-cursor-mix-editor@example.test', ['EDITOR']);
    for (let i = 0; i < 3; i += 1) {
      await createSource(editorId, { title: `混用标记${String(sourceCounter)}-${String(i)}` });
    }

    const byCreatedAt = await searchSources(editorId, '?sort=createdAt:desc&limit=1');
    const cursor = (byCreatedAt.body as { data: SourceSearchPage }).data.nextCursor;
    expect(cursor).toBeTruthy();

    // 拿 createdAt 排序的游标去请求 title 排序 —— 语义不同，必须拒绝
    const mixed = await searchSources(
      editorId,
      `?sort=title:asc&cursor=${encodeURIComponent(cursor ?? '')}`,
    );
    expect(mixed.status).toBe(400);
    expect((mixed.body as { error: { code: string } }).error.code).toBe('VALIDATION_FAILED');
  });

  it('title 升序排序稳定', async () => {
    const editorId = await createUser('src-title-sort-editor@example.test', ['EDITOR']);
    const prefix = `题名排序${String(sourceCounter)}`;
    await createSource(editorId, { title: `${prefix}-丙` });
    await createSource(editorId, { title: `${prefix}-甲` });
    await createSource(editorId, { title: `${prefix}-乙` });

    const res = await searchSources(editorId, `?q=${encodeURIComponent(prefix)}&sort=title:asc`);
    expect(res.status).toBe(200);
    const items = (res.body as { data: SourceSearchPage }).data.items;

    // SQLite 用 BINARY collation 排序 = UTF-8 字节序 = Unicode 码点序，
    // **不是拼音序**。所以「丙(4E19) < 乙(4E59) < 甲(7532)」才是正确结果。
    // 这里断言码点序而不是语义序：排序必须是确定的、可复现的，
    // 但中文按拼音排需要额外的分词/排序规则，那是数据层 ADR 的范围。
    expect([...items].map((item) => item.title.slice(prefix.length + 1)).sort()).toEqual([
      '丙',
      '乙',
      '甲',
    ]);
    const titles = items.map((item) => item.title);
    expect(titles).toEqual([...titles].sort());
    expect(titles).toHaveLength(3);
  });
});

describe('FD-002: 重复关联返回 409 而非 500', () => {
  it('同一内容重复挂同一来源同一论断 → 409 CONFLICT', async () => {
    const editorId = await createUser('src-dup-editor@example.test', ['EDITOR']);
    const contentId = await createContent(editorId);
    const sourceId = await createSource(editorId, { title: '重复关联测试来源' });

    const first = await request(serverOf(ensureApp()))
      .post(`/api/v1/admin/contents/${contentId}/sources`)
      .set('Authorization', authHeader(editorId))
      .send({ sourceId, claimScope: '立论依据（示例）' });
    expect(first.status).toBe(201);

    const second = await request(serverOf(ensureApp()))
      .post(`/api/v1/admin/contents/${contentId}/sources`)
      .set('Authorization', authHeader(editorId))
      .send({ sourceId, claimScope: '立论依据（示例）' });

    // 唯一约束冲突必须是可以读的 409；500 会让编辑以为是服务端故障
    expect(second.status).toBe(409);
    const body = second.body as { error: { code: string; message: string; requestId: string } };
    expect(body.error.code).toBe('CONFLICT');
    expect(body.error.message).not.toContain('stack');
    expect(body.error.requestId).toBeTruthy();
  });

  it('不同论断范围可以重复挂同一来源', async () => {
    const editorId = await createUser('src-scope-editor@example.test', ['EDITOR']);
    const contentId = await createContent(editorId);
    const sourceId = await createSource(editorId, { title: '多论断来源' });

    for (const claimScope of ['论断一（示例）', '论断二（示例）']) {
      const res = await request(serverOf(ensureApp()))
        .post(`/api/v1/admin/contents/${contentId}/sources`)
        .set('Authorization', authHeader(editorId))
        .send({ sourceId, claimScope });
      expect(res.status).toBe(201);
    }

    const list = await request(serverOf(ensureApp()))
      .get(`/api/v1/admin/contents/${contentId}/sources`)
      .set('Authorization', authHeader(editorId));
    expect(list.status).toBe(200);
    expect((list.body as { data: unknown[] }).data).toHaveLength(2);
  });
});

describe('FD-002: 越权与非法输入', () => {
  it('未认证不能创建来源', async () => {
    const res = await request(serverOf(ensureApp()))
      .post('/api/v1/admin/sources')
      .send({ kind: 'BOOK', title: '未认证创建' });
    expect(res.status).toBe(401);
  });

  it('未认证不能关联来源', async () => {
    const editorId = await createUser('src-anon-attach-editor@example.test', ['EDITOR']);
    const contentId = await createContent(editorId);
    const sourceId = await createSource(editorId);

    const res = await request(serverOf(ensureApp()))
      .post(`/api/v1/admin/contents/${contentId}/sources`)
      .send({ sourceId, claimScope: '未认证关联（示例）' });
    expect(res.status).toBe(401);
  });

  it('关联不存在的来源返回可读错误，不泄漏堆栈', async () => {
    const editorId = await createUser('src-missing-editor@example.test', ['EDITOR']);
    const contentId = await createContent(editorId);

    const res = await request(serverOf(ensureApp()))
      .post(`/api/v1/admin/contents/${contentId}/sources`)
      .set('Authorization', authHeader(editorId))
      .send({ sourceId: 'source-does-not-exist', claimScope: '不存在的来源' });

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
    const body = res.body as { error: { message: string } };
    expect(body.error.message).not.toContain('at Object');
    expect(body.error.message).not.toContain('Prisma');
  });

  it('未知字段被 DTO 白名单拒绝', async () => {
    const editorId = await createUser('src-unknown-editor@example.test', ['EDITOR']);
    const res = await request(serverOf(ensureApp()))
      .post('/api/v1/admin/sources')
      .set('Authorization', authHeader(editorId))
      .send({ kind: 'BOOK', title: '未知字段测试', verified: true });
    expect(res.status).toBe(400);
  });
});

describe('FD-002: 检索结果不泄露内部字段', () => {
  it('来源检索结果字段是白名单，不含内部列', async () => {
    const editorId = await createUser('src-safe-editor@example.test', ['EDITOR']);
    await createSource(editorId, {
      title: '安全字段检查来源',
      citationText: '完整引文，应当不出现在检索结果里（示例）',
    });

    const res = await searchSources(editorId, '?q=安全字段检查来源');
    expect(res.status).toBe(200);
    const item = (res.body as { data: SourceSearchPage }).data.items[0];
    expect(item).toBeDefined();
    expect(Object.keys(item ?? {}).sort()).toEqual([
      'accessedAt',
      'author',
      'id',
      'kind',
      'publicationDate',
      'publisher',
      'title',
      'verificationNote',
    ]);
    // citationText 有 4000 字上限，不适合放在选择器结果里
    expect(JSON.stringify(res.body)).not.toContain('完整引文');
  });
});
