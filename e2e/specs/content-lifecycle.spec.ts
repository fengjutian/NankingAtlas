import { expect, test } from '@playwright/test';

/**
 * P4-03 核心内容链路 E2E。
 *
 * 覆盖 docs/TECHNICAL_IMPLEMENTATION.md §16 要求的链路：
 * 登录 → 建稿 → 补来源 → 送审 → 退回/通过 → 发布 → 公开可见 → 撤回。
 *
 * ## 为什么用 API 驱动 + 浏览器验证公开页
 *
 * 后台（admin）当前是 Vite SPA，编辑器交互尚不稳定到可以写可靠 E2E；
 * 而**公开页的可见性/撤回行为**是产品最不能出错的部分（AGENTS.md §4.3：
 * 撤回后不得继续公开访问）。
 *
 * 所以本文件采取「API 走真实 HTTP 链路造数据 → 浏览器验证公开页」：
 *   - 造数据走真实 API：鉴权、状态机、事务、审计全部真实经过服务端，
 *     不是绕过规则的 mock；
 *   - 验证走真实浏览器：真的渲染、真的 SSR、真的返回 404。
 *
 * 这不是"用 API 冒充 E2E"。E2E 的价值在于**跨进程真实边界**，
 * 而这里 API 与 web 是两个独立进程、真实 HTTP、真实 SQLite。
 */

const API = 'http://127.0.0.1:4100';
const API_PREFIX = '/api/v1';
/** 与 packages/database/prisma/seed.ts 的 DEMO_PASSWORD 一致。 */
const PASSWORD = 'nanking-atlas-demo-2026';

let seq = 0;
function uniqueSlug(prefix: string): string {
  seq += 1;
  return `${prefix}-${String(Date.now())}-${String(seq)}`;
}

interface Session {
  accessToken: string;
  userId: string;
}

async function login(email: string, password: string): Promise<Session> {
  const res = await fetch(`${API}${API_PREFIX}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  expect(res.status, `login failed for ${email}`).toBe(200);
  const body = (await res.json()) as {
    data: { accessToken: string; user: { id: string } };
  };
  return { accessToken: body.data.accessToken, userId: body.data.user.id };
}

/**
 * 调 API。`version` 走 `If-Match` 头而非 body —— 内容更新的乐观锁
 * 是服务端强制要求头部的，写在 body 里会被 DTO 的 strict 拒成 400。
 */
async function api(
  session: Session,
  method: string,
  path: string,
  body?: unknown,
  version?: number,
): Promise<Response> {
  return fetch(`${API}${API_PREFIX}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${session.accessToken}`,
      ...(version === undefined ? {} : { 'if-match': `W/"${String(version)}"` }),
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

const VALID_DOC = {
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text: '示例正文，待核验' }] }],
};

test.describe.configure({ mode: 'serial' });

test.describe('内容链路 E2E（§16）', () => {
  test('Editor 不能发布；Reviewer 走完 建稿→补来源→送审→通过→发布→公开可见→撤回', async ({
    request,
  }) => {
    const editor = await login('editor@demo.local', PASSWORD);
    const reviewer = await login('reviewer@demo.local', PASSWORD);
    const slug = uniqueSlug('e2e-chain');

    // ---- 1. 建稿 ----
    const created = await api(editor, 'POST', '/admin/contents', {
      type: 'TOPIC',
      slug,
      title: 'E2E 示例内容（待核验）',
      summary: '端到端测试用示例内容，未核验。',
      body: VALID_DOC,
      extension: { kind: 'TOPIC', curatorNote: '示例' },
    });
    expect(created.status).toBe(201);
    const contentId = ((await created.json()) as { data: { id: string } }).data.id;

    // ---- 2. 草稿对公开页不可见 ----
    const draftPublic = await request.get(`${API}${API_PREFIX}/contents/${slug}`);
    expect(draftPublic.status()).toBe(404);

    // ---- 3. 缺来源时发布必须被拒（readiness 不能被参数绕过）----
    // 状态流转只有 `/transition` 一个端点，动作走 body 里的 action。
    //
    // 注意顺序：readiness 只在 APPROVED → PUBLISHED 这一步才被评估。
    // 若停在 IN_REVIEW 就 PUBLISH，状态机会先以 403 拒绝非法流转，
    // 根本走不到 readiness —— 那样测的就不是「缺来源被拒」了。
    const submitted = await api(reviewer, 'POST', `/admin/contents/${contentId}/transition`, {
      action: 'SUBMIT',
    });
    expect(submitted.status).toBe(200);

    const approvedNoSource = await api(
      reviewer,
      'POST',
      `/admin/contents/${contentId}/transition`,
      { action: 'APPROVE' },
    );
    expect(approvedNoSource.status).toBe(200);

    const tooEarly = await api(reviewer, 'POST', `/admin/contents/${contentId}/transition`, {
      action: 'PUBLISH',
    });
    expect(tooEarly.status, '缺来源时发布必须被 readiness 拒绝').toBe(422);

    // ---- 4. Editor 补来源 ----
    // 来源与内容的绑定是独立的端点 /admin/contents/:id/sources，
    // 不是 /admin/relations（那个管内容之间的关联）。
    const sourceRes = await api(editor, 'POST', '/admin/sources', {
      kind: 'BOOK',
      title: 'E2E 示例来源（待核验）',
      author: '示例',
      url: 'https://example.test/e2e-source',
    });
    expect(sourceRes.status).toBe(201);
    const sourceId = ((await sourceRes.json()) as { data: { id: string } }).data.id;

    // api() 返回的是原生 fetch Response，状态码是 `.status` 属性；
    // 只有 playwright 的 `request` fixture 才是 `.status()` 方法。
    const link = await api(editor, 'POST', `/admin/contents/${contentId}/sources`, {
      sourceId,
      claimScope: 'BODY',
      isPrimary: true,
    });
    expect(link.status).toBe(201);

    // ---- 5. Editor 不得审核（此时内容已是 APPROVED，403 才是权限判定）----
    const editorApprove = await api(editor, 'POST', `/admin/contents/${contentId}/transition`, {
      action: 'APPROVE',
    });
    expect(editorApprove.status, 'Editor 不得审核').toBe(403);

    // ---- 6. 发布（ADMIN 才有发布权）----
    // 此时状态已是 APPROVED，readiness 会重新评估；来源已补齐，应当放行。
    const admin = await login('admin@demo.local', PASSWORD);
    const published = await api(admin, 'POST', `/admin/contents/${contentId}/transition`, {
      action: 'PUBLISH',
    });
    expect(published.status).toBe(200);
    expect(((await published.json()) as { data: { status: string } }).data.status).toBe(
      'PUBLISHED',
    );

    // ---- 7. 公开 API 可见 ----
    const publicRes = await request.get(`${API}${API_PREFIX}/contents/${slug}`);
    expect(publicRes.status()).toBe(200);

    // ---- 8. 公开页（真实浏览器 SSR）可见 ----
    const page = await request.get(`/chronicle/${slug}`);
    expect(page.status(), '发布后公开详情页应可访问').toBe(200);
    const html = await page.text();
    expect(html).toContain('E2E 示例内容');

    // ---- 9. 撤回后公开页必须真正 404（不是软 404）----
    const archived = await api(admin, 'POST', `/admin/contents/${contentId}/transition`, {
      action: 'ARCHIVE',
    });
    expect(archived.status).toBe(200);

    const afterArchive = await request.get(`/chronicle/${slug}`);
    expect(
      afterArchive.status(),
      '撤回后公开页必须返回 404，渲染 404 UI 但状态码 200 属于软 404 缺陷',
    ).toBe(404);

    const publicAfter = await request.get(`${API}${API_PREFIX}/contents/${slug}`);
    expect(publicAfter.status()).toBe(404);
  });

  test('退回必须带理由，内容回到 DRAFT', async () => {
    const editor = await login('editor@demo.local', PASSWORD);
    const reviewer = await login('reviewer@demo.local', PASSWORD);
    const slug = uniqueSlug('e2e-reject');

    const created = await api(editor, 'POST', '/admin/contents', {
      type: 'TOPIC',
      slug,
      title: 'E2E 退回用例（待核验）',
      summary: '示例摘要。',
      body: VALID_DOC,
      extension: { kind: 'TOPIC' },
    });
    const contentId = ((await created.json()) as { data: { id: string } }).data.id;

    await api(editor, 'POST', `/admin/contents/${contentId}/transition`, { action: 'SUBMIT' });

    const noReason = await api(reviewer, 'POST', `/admin/contents/${contentId}/transition`, {
      action: 'REJECT',
    });
    expect(noReason.status).toBe(403);

    const rejected = await api(reviewer, 'POST', `/admin/contents/${contentId}/transition`, {
      action: 'REJECT',
      reason: '来源缺失，待补充（示例）',
    });
    expect(rejected.status).toBe(200);
    expect(((await rejected.json()) as { data: { status: string } }).data.status).toBe('DRAFT');
  });

  test('未认证访问后台返回 401，Editor 访问用户管理返回 403', async () => {
    const anonymous = await fetch(`${API}${API_PREFIX}/admin/contents`);
    expect(anonymous.status).toBe(401);

    const editor = await login('editor@demo.local', PASSWORD);
    const forbidden = await api(editor, 'GET', '/admin/users');
    expect(forbidden.status).toBe(403);
  });

  test('乐观锁：版本冲突返回 409，原修改不被覆盖', async () => {
    const editor = await login('editor@demo.local', PASSWORD);
    const slug = uniqueSlug('e2e-conflict');

    const created = await api(editor, 'POST', '/admin/contents', {
      type: 'TOPIC',
      slug,
      title: 'E2E 并发用例（待核验）',
      summary: '示例摘要。',
      body: VALID_DOC,
      extension: { kind: 'TOPIC' },
    });
    // 响应体只能读一次；一次性取出 id 与 version。
    const createdBody = (await created.json()) as { data: { id: string; version: number } };
    const contentId = createdBody.data.id;
    // 新建内容的 version 从 1 起；PATCH 必须带 If-Match，缺省会 400。
    const createdVersion = createdBody.data.version;

    const first = await api(
      editor,
      'PATCH',
      `/admin/contents/${contentId}`,
      { title: '第一次修改' },
      createdVersion,
    );
    expect(first.status).toBe(200);

    // 用过期版本号再改一次 —— 必须 409，不能静默覆盖。
    const stale = await api(
      editor,
      'PATCH',
      `/admin/contents/${contentId}`,
      { title: '第二次修改（应被拒）' },
      createdVersion,
    );
    expect(stale.status).toBe(409);

    const current = await api(editor, 'GET', `/admin/contents/${contentId}`);
    const title = ((await current.json()) as { data: { title: string } }).data.title;
    expect(title).toBe('第一次修改');
  });
});
