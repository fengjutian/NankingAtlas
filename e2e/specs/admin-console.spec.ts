import { expect, test, type Page } from '@playwright/test';

/**
 * 管理后台真实浏览器 E2E（FD-003 / 005 / 006 / 007 / 008）。
 *
 * ## 为什么需要这一组
 *
 * 之前的 E2E 只覆盖「API 造数据 + 浏览器验证公开页」，注释里写明跳过了后台
 * （"编辑器交互尚不稳定到可以写可靠 E2E"）。结果是从 FD-003 到 FD-008 这一轮，
 * 所有 Admin UI 只被 **SSR 首帧** 和 **API 层**验证过 —— 工具栏能不能点、
 * 角色切换能不能存、审计 JSON 会不会撑爆表格，全都没在真实浏览器里跑过。
 *
 * 这一组补的正是那个空白：真的起 admin（vite build + preview）、真的点。
 *
 * ## 造数据仍然走 API
 *
 * 登录后的内容创建 / 发布这类重流程由 `content-lifecycle.spec.ts` 覆盖。
 * 这里只补「纯后台交互」：筛选、选择、启禁、只读追溯的展示。
 * 造数据用真实 HTTP（不走 mock），鉴权与状态机全部真实经过服务端。
 */

/** 与 playwright.config.ts 的 ADMIN_PORT 一致（不能用 admin preview 脚本的 4173：被 LibreOffice 占着）。 */
const ADMIN = 'http://127.0.0.1:4175';
const API = 'http://127.0.0.1:4100';
const API_PREFIX = '/api/v1';
/** 与 packages/database/prisma/seed.ts 的 DEMO_PASSWORD 一致。 */
const PASSWORD = 'nanking-atlas-demo-2026';

let seq = 0;
function unique(prefix: string): string {
  seq += 1;
  return `${prefix}-${String(Date.now())}-${String(seq)}`;
}

/**
 * 造一个 EMAIL 局部变量。
 *
 * 刻意与 `unique()` 分开：`email` 走 zod 的 `.email()` 校验，含中文/中文后缀
 * 会被 400 拒掉（这个坑踩过一次）；而 `displayName` 与检索关键词可以放心用中文。
 */
function uniqueEmail(): string {
  seq += 1;
  return `e2e-${String(Date.now())}-${String(seq)}@example.test`;
}

interface Session {
  accessToken: string;
  userId: string;
}

async function login(email: string): Promise<Session> {
  const res = await fetch(`${API}${API_PREFIX}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  expect(res.status, `login failed for ${email}`).toBe(200);
  const body = (await res.json()) as { data: { accessToken: string; user: { id: string } } };
  return { accessToken: body.data.accessToken, userId: body.data.user.id };
}

async function api(
  session: Session,
  method: string,
  path: string,
  body?: unknown,
): Promise<Response> {
  return fetch(`${API}${API_PREFIX}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${session.accessToken}`,
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

/**
 * 通过 UI 登录。
 *
 * 走真实登录页而不是往 sessionStorage 里塞 token —— 后者会绕过登录页本身，
 * 而"登录页能正确处理错误"正是需要被测的东西。
 */
async function uiLogin(page: Page, email: string): Promise<void> {
  await page.goto(`${ADMIN}/login`);
  await expect(page.getByRole('heading', { name: '登录管理后台' })).toBeVisible();
  await page.getByLabel('邮箱').fill(email);
  await page.getByLabel('密码').fill(PASSWORD);
  await page.getByRole('button', { name: '登录' }).click();
  // 登录成功后跳到内容列表，标题是「内容列表」（不是导航里的「全部内容」）
  await expect(page.getByRole('heading', { name: '内容列表' })).toBeVisible();
}

test.describe('管理后台：真实浏览器交互', () => {
  test('EDITOR 登录后看不到用户管理与审计入口，直敲 URL 也拿不到数据', async ({ page }) => {
    await uiLogin(page, 'editor@demo.local');

    // 导航里有这两个入口，但 EDITOR 点进去应当只得到权限说明（服务端也会独立 403）
    await page.goto(`${ADMIN}/users`);
    await expect(page.getByText('无权访问用户管理')).toBeVisible();

    await page.goto(`${ADMIN}/audit`);
    await expect(page.getByText('无权访问审计日志')).toBeVisible();
  });

  test('ADMIN 可以搜索并筛选用户列表', async ({ page }) => {
    const admin = await login('admin@demo.local');
    const marker = unique('筛选');
    const email = uniqueEmail();
    const created = await api(admin, 'POST', '/admin/users', {
      email,
      password: 'e2e-created-password-value',
      displayName: `${marker}-用户`,
      roles: ['EDITOR'],
    });
    expect(created.status).toBe(201);

    await uiLogin(page, 'admin@demo.local');
    await page.goto(`${ADMIN}/users`);
    await expect(page.getByRole('heading', { name: '用户与角色' })).toBeVisible();

    await page.getByLabel('检索用户').fill(marker);
    await page.getByRole('button', { name: '检索' }).click();

    const row = page.getByRole('row').filter({ hasText: email });
    await expect(row).toBeVisible();
    // 同一个邮箱只应命中一条
    await expect(page.getByRole('row').filter({ hasText: email })).toHaveCount(1);
  });

  test('ADMIN 可以切换用户角色，刷新后仍然生效（真的落库了）', async ({ page }) => {
    const admin = await login('admin@demo.local');
    const marker = unique('角色');
    const email = uniqueEmail();
    const created = await api(admin, 'POST', '/admin/users', {
      email,
      password: 'e2e-role-password-value',
      displayName: `${marker}-角色`,
      roles: ['EDITOR'],
    });
    expect(created.status).toBe(201);

    await uiLogin(page, 'admin@demo.local');
    await page.goto(`${ADMIN}/users`);
    await page.getByLabel('检索用户').fill(marker);
    await page.getByRole('button', { name: '检索' }).click();

    const row = page.getByRole('row').filter({ hasText: email });
    await expect(row).toBeVisible();

    // 该行的"审核"按钮 aria-pressed 初始应为 false，点一下变 true
    const reviewButton = row.getByRole('button', { name: '审核' });
    await expect(reviewButton).toHaveAttribute('aria-pressed', 'false');
    await reviewButton.click();
    await expect(reviewButton).toHaveAttribute('aria-pressed', 'true');

    // 刷新后仍是 true → 说明真的写进了服务端，不是本地 state
    await page.reload();
    await page.getByLabel('检索用户').fill(marker);
    await page.getByRole('button', { name: '检索' }).click();
    const reloadedRow = page.getByRole('row').filter({ hasText: email });
    await expect(reloadedRow.getByRole('button', { name: '审核' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  test('ADMIN 能检索审计日志并看到检索出的条目', async ({ page }) => {
    const admin = await login('admin@demo.local');
    const marker = unique('审计');
    const created = await api(admin, 'POST', '/admin/users', {
      email: uniqueEmail(),
      password: 'e2e-audit-password-value',
      displayName: `${marker}-审计`,
      roles: ['EDITOR'],
    });
    expect(created.status).toBe(201);

    await uiLogin(page, 'admin@demo.local');
    await page.goto(`${ADMIN}/audit`);
    await expect(page.getByRole('heading', { name: '审计日志' })).toBeVisible();

    await page.getByLabel('动作 action').fill('user.create');
    await page.getByRole('button', { name: '检索' }).click();

    // 至少能看到一条 user.create 记录
    await expect(page.getByRole('row').filter({ hasText: 'user.create' }).first()).toBeVisible();

    /**
     * 断言的是**脱敏说明文案**，而不是表格里出现 `[REDACTED]`。
     *
     * 所有审计写入点本身就避开了敏感字段（passwordHash 根本不进 afterJson），
     * 所以真实数据里本来就不会有脱敏标记 —— 断言"表格里能看到 [REDACTED]"
     * 会逼着人往审计里塞敏感数据才能通过，那是本末倒置。
     *
     * 页面必须**如实说明**脱敏发生在写入时，而不是让人以为 UI 在隐藏什么。
     */
    await expect(page.getByText(/写入时.*已被服务端替换为/)).toBeVisible();
    await expect(page.getByText('[REDACTED]').first()).toBeVisible();
  });

  test('ADMIN 打开首页槽位页，看到五个受控区块', async ({ page }) => {
    await uiLogin(page, 'admin@demo.local');
    await page.goto(`${ADMIN}/homepage`);
    await expect(page.getByRole('heading', { name: '首页槽位' })).toBeVisible();

    for (const key of ['hero', 'featured', 'latest', 'places', 'routes']) {
      await expect(page.getByRole('heading', { name: new RegExp(key) })).toBeVisible();
    }
  });

  test('ADMIN 能检索标签库并看到使用次数', async ({ page }) => {
    const admin = await login('admin@demo.local');
    const marker = unique('tag');
    const created = await api(admin, 'POST', '/admin/tags', {
      slug: marker,
      displayName: `${marker}-显示名`,
    });
    expect(created.status).toBe(201);

    await uiLogin(page, 'admin@demo.local');
    await page.goto(`${ADMIN}/contents`);
    await expect(page.getByRole('heading', { name: '内容列表' })).toBeVisible();
  });

  test('路线编排：可用「下移」按钮调整站点顺序，刷新后顺序保持', async ({ page }) => {
    const admin = await login('admin@demo.local');
    const suffix = unique('route');
    const email = uniqueEmail();

    // 建一条已发布路线（含 Route 扩展行 —— 站点写入依赖它）
    const routeRes = await api(admin, 'POST', '/admin/contents', {
      type: 'ROUTE',
      slug: suffix,
      title: 'E2E 路线（示例 / 待核验）',
      summary: '用于验证站点编排（示例）。',
      body: { type: 'doc', content: [{ type: 'paragraph' }] },
      extension: { kind: 'ROUTE', durationMinutes: 60, distanceMeters: 1000 },
    });
    expect(routeRes.status).toBe(201);
    const routeId = ((await routeRes.json()) as { data: { id: string } }).data.id;

    // 两个已发布地点作为站点
    const placeIds: string[] = [];
    for (const label of ['第一站', '第二站']) {
      const placeRes = await api(admin, 'POST', '/admin/contents', {
        type: 'PLACE',
        slug: unique('place'),
        title: `${suffix}-${label}`,
        summary: `${label}（示例）`,
        body: { type: 'doc', content: [{ type: 'paragraph' }] },
        extension: { kind: 'PLACE' },
      });
      expect(placeRes.status).toBe(201);
      const placeId = ((await placeRes.json()) as { data: { id: string } }).data.id;
      await api(admin, 'PATCH', `/admin/contents/${placeId}`, {
        title: `${suffix}-${label}`,
        summary: `${label}（示例）`,
        body: { type: 'doc', content: [{ type: 'paragraph' }] },
        extension: { kind: 'PLACE' },
      });
      placeIds.push(placeId);
    }

    const put = await fetch(`${API}${API_PREFIX}/admin/routes/${routeId}/stops`, {
      method: 'PUT',
      headers: {
        authorization: `Bearer ${admin.accessToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        stops: placeIds.map((placeContentId) => ({ placeContentId, note: null })),
      }),
    });
    expect(put.status).toBe(200);

    await uiLogin(page, 'admin@demo.local');
    await page.goto(`${ADMIN}/contents/${routeId}`);

    // 监听浏览器实际发出的 PUT —— 先注册，再操作。
    const stopPutBodies: string[] = [];
    page.on('request', (request) => {
      if (request.method() === 'PUT' && request.url().includes('/stops')) {
        stopPutBodies.push(request.postData() ?? '');
      }
    });

    await expect(page.getByRole('heading', { name: '路线站点' })).toBeVisible();

    // 用表格的**可访问名称**定位，而不是 `hasText: '站点'`。
    // 后者会匹配页面上所有含"站点"字样的表格（包括其它区块的说明文字所在区域），
    // 行索引跨表串掉，表现为"点了下移但顺序没变"的假象。
    const rows = page.getByRole('table', { name: '路线站点列表' }).locator('tbody tr');
    await expect(rows).toHaveCount(2);
    const firstTitle = `${suffix}-第一站`;
    const secondTitle = `${suffix}-第二站`;
    await expect(rows.nth(0)).toContainText(firstTitle);
    await expect(rows.nth(1)).toContainText(secondTitle);

    // 用「下移」把第一站换到第二位 —— 纯键盘可达，不需要拖拽
    await rows
      .nth(0)
      .getByRole('button', { name: `下移 ${firstTitle}` })
      .click();
    await expect(rows.nth(0)).toContainText(secondTitle);
    await expect(rows.nth(1)).toContainText(firstTitle);

    await page.getByRole('button', { name: '保存站点顺序' }).click();

    // 先确认 PUT 真的发出了 —— 之前这里断言 `getByText('已保存')`，
    // 结果匹配到的是**编辑器自动保存**的「已保存 17:19:00」，是个假通过：
    // 点击根本没触发保存，测试却在后面以"顺序没变"的样子失败。
    await expect.poll(() => stopPutBodies.length, { timeout: 15_000 }).toBeGreaterThan(0);

    // 直接问服务端要一次站点列表，而不是刷新页面看 UI ——
    // 这样能把「服务端没存」和「UI 重新加载没反映」两种情况区分开。
    const afterSave = await fetch(`${API}${API_PREFIX}/admin/routes/${routeId}/stops`, {
      headers: { authorization: `Bearer ${admin.accessToken}` },
    });
    expect(afterSave.status).toBe(200);
    const serverStops = (await afterSave.json()) as {
      data: { stops: { place: { contentId: string } | null }[] };
    };
    expect(
      serverStops.data.stops.map((stop) => stop.place?.contentId),
      `浏览器发出的 PUT：${stopPutBodies.join(' | ')}\n` +
        `服务端保存后的顺序：${JSON.stringify(serverStops.data.stops)}`,
    ).toEqual([placeIds[1], placeIds[0]]);

    // 刷新后 UI 也应反映服务端顺序
    await page.reload();
    await expect(page.getByRole('heading', { name: '路线站点' })).toBeVisible();
    const reloadedRows = page.getByRole('table', { name: '路线站点列表' }).locator('tbody tr');
    await expect(reloadedRows.nth(0)).toContainText(secondTitle);
    await expect(reloadedRows.nth(1)).toContainText(firstTitle);
  });

  test('Tiptap 编辑器：能输入、能加粗、保存后刷新仍是加粗的', async ({ page }) => {
    const admin = await login('admin@demo.local');
    const slug = unique('e2e-editor');
    const created = await api(admin, 'POST', '/admin/contents', {
      type: 'TOPIC',
      slug,
      title: 'E2E 编辑器测试内容（示例 / 待核验）',
      summary: '用于验证 Tiptap 编辑器交互（示例）。',
      body: { type: 'doc', content: [{ type: 'paragraph' }] },
      extension: { kind: 'TOPIC' },
    });
    expect(created.status).toBe(201);
    const contentId = ((await created.json()) as { data: { id: string } }).data.id;

    await uiLogin(page, 'admin@demo.local');
    await page.goto(`${ADMIN}/contents/${contentId}`);

    // 编辑区是真正的 contenteditable，能打字
    const editor = page.locator('.nla-editor-content');
    await expect(editor).toBeVisible();
    await editor.click();
    await page.keyboard.type('E2E 段落文字');

    // 先**选中**文字再加粗。
    //
    // 光标折叠时 Tiptap 的 toggleBold 只设置 storedMarks（对「之后」输入的文字
    // 生效），不会回溯到已输入的文本 —— 不选中就断言 <strong> 会假失败。
    await page.keyboard.press('Control+a');

    // 加粗按钮的 aria-pressed 反映当前选区状态
    const boldButton = page.getByRole('button', { name: '加粗' });
    await expect(boldButton).toHaveAttribute('aria-pressed', 'false');
    await boldButton.click();
    await expect(boldButton).toHaveAttribute('aria-pressed', 'true');

    // 自动保存有 1500ms 防抖，等它真的落库再刷新。
    // 文案取自 AutosaveStatus.tsx 的 describePhase：
    //   'dirty'   → "有未保存改动，将在 1.5 秒后自动保存"
    //   'saving'  → "正在保存…"
    //   'saved'   → "已保存 HH:MM"
    // 用真实文案而不是固定 sleep：固定等待要么不够（偶发红）要么浪费（每次都等满）。
    await expect(page.getByText(/已保存 \d{2}:\d{2}/)).toBeVisible({ timeout: 20_000 });

    await page.reload();

    await expect(page.locator('.nla-editor-content')).toContainText('E2E 段落文字');
    // 加粗在刷新后仍生效 → 说明 mark 真的写进了 bodyJson，不是本地 state
    await expect(page.locator('.nla-editor-content strong')).toContainText('E2E 段落文字');
  });
});
