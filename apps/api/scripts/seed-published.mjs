/**
 * 创建一条**保持发布状态**的演示内容（用于本地验收时页面有真实数据可渲染）。
 *
 * 与 e2e-publish.mjs 的区别：那个跑完会归档（验证撤回 → 404），
 * 这个留下 PUBLISHED 内容，供首页/列表页/详情页的肉眼验收。
 *
 * 用法：node scripts/seed-published.mjs http://localhost:4000
 */
const API = process.argv[2] ?? 'http://localhost:4000';
const PASSWORD = 'nanking-atlas-demo-2026';

async function call(path, options = {}) {
  const res = await fetch(`${API}/api/v1${path}`, {
    method: options.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
    },
    ...(options.body ? { body: JSON.stringify(options.body) } : {}),
  });
  const text = await res.text();
  return { status: res.status, body: text === '' ? null : JSON.parse(text) };
}

async function login(email) {
  const res = await call('/auth/login', { method: 'POST', body: { email, password: PASSWORD } });
  if (res.status !== 200) throw new Error(`login ${email}: ${res.status}`);
  return res.body.data.accessToken;
}

const editor = await login('editor@demo.local');
const reviewer = await login('reviewer@demo.local');
const stamp = Date.now().toString(36);

const entries = [
  {
    type: 'PLACE',
    slug: `demo-qinhuai-${stamp}`,
    title: `示例：秦淮风光带（${stamp}）`,
    subtitle: '演示数据 · 示例 / 待核验',
    summary: '演示条目：用于验证列表页、详情页、TOC 与来源渲染。所有内容均为示例且未经人工核查。',
    extension: {
      kind: 'PLACE',
      accuracy: 'AREA_ONLY',
      verificationStatus: 'PARTIAL',
      address: '示例地址（未核验）',
    },
    body: {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: '概述' }] },
        {
          type: 'paragraph',
          content: [{ type: 'text', text: '示例 / 待核验：本段用于验证正文渲染与纯文本提取。' }],
        },
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: '来源与版权' }] },
        {
          type: 'paragraph',
          content: [{ type: 'text', text: '示例 / 待核验：真实条目必须在此标注来源与授权状态。' }],
        },
        {
          type: 'bulletList',
          content: [
            {
              type: 'listItem',
              content: [{ type: 'paragraph', content: [{ type: 'text', text: '待核验要点一' }] }],
            },
            {
              type: 'listItem',
              content: [{ type: 'paragraph', content: [{ type: 'text', text: '待核验要点二' }] }],
            },
          ],
        },
      ],
    },
  },
  {
    type: 'TOPIC',
    slug: `demo-topic-${stamp}`,
    title: `示例：城市记忆专题（${stamp}）`,
    subtitle: '演示数据 · 示例 / 待核验',
    summary: '演示专题：用于验证专题类型详情与策展笔记展示。',
    extension: { kind: 'TOPIC', curatorNote: '示例策展笔记（待核验）' },
    body: {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: '示例 / 待核验：专题正文。' }] },
      ],
    },
  },
];

for (const entry of entries) {
  const created = await call('/admin/contents', { method: 'POST', token: editor, body: entry });
  if (created.status !== 201)
    throw new Error(`create ${entry.slug}: ${created.status} ${JSON.stringify(created.body)}`);
  const id = created.body.data.id;

  const source = await call('/admin/sources', {
    method: 'POST',
    token: editor,
    body: {
      kind: 'OTHER',
      title: `示例来源 ${entry.slug}`,
      verificationNote: '未核验：seed 生成的占位来源。',
    },
  });
  await call(`/admin/contents/${id}/sources`, {
    method: 'POST',
    token: editor,
    body: { sourceId: source.body.data.id, claimScope: '整体（示例 / 待核验）', isPrimary: true },
  });

  await call(`/admin/contents/${id}/transition`, {
    method: 'POST',
    token: editor,
    body: { action: 'SUBMIT' },
  });
  const approve = await call(`/admin/contents/${id}/transition`, {
    method: 'POST',
    token: reviewer,
    body: { action: 'APPROVE' },
  });
  if (approve.status !== 200)
    throw new Error(`approve ${entry.slug}: ${approve.status} ${JSON.stringify(approve.body)}`);
  const publish = await call(`/admin/contents/${id}/transition`, {
    method: 'POST',
    token: reviewer,
    body: { action: 'PUBLISH' },
  });
  if (publish.status !== 200)
    throw new Error(`publish ${entry.slug}: ${publish.status} ${JSON.stringify(publish.body)}`);

  console.log(`published: ${entry.type} ${entry.slug}`);
}

// 配一个首页槽位，验证首页按后台配置渲染。
// 槽位仅 ADMIN 可配（技术方案 §6 角色矩阵），所以用 admin 账号。
const admin = await login('admin@demo.local');
const topicId = await call('/admin/contents?type=TOPIC&limit=1', { token: admin });
const first = topicId.body.data[0];
if (first !== undefined) {
  const slot = await call('/admin/homepage-slots', {
    method: 'PATCH',
    token: admin,
    body: { slotKey: 'hero', contentId: first.id, position: 0 },
  });
  if (slot.status !== 200)
    throw new Error(`homepage slot: ${slot.status} ${JSON.stringify(slot.body)}`);
  console.log(`homepage slot configured (ADMIN) -> ${first.slug}`);

  // 反向验证：Editor 配槽位必须 403
  const denied = await call('/admin/homepage-slots', {
    method: 'PATCH',
    token: editor,
    body: { slotKey: 'featured', contentId: first.id, position: 0 },
  });
  if (denied.status !== 403) throw new Error(`editor slot should be 403, got ${denied.status}`);
  console.log('homepage slot as EDITOR -> 403（符合预期：仅 ADMIN 可配）');
}

console.log(`\nDONE · published ${entries.length} 条演示内容（均标注 示例/待核验）`);
