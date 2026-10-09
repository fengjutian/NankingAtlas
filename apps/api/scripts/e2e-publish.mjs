/**
 * 端到端验收脚本（一次性，不属于交付产物）。
 *
 * 目的：验证「编辑建稿 → 送审 → 他人审核 → 发布 → 公开站稳定 URL 可访问」
 * 这条 P2 验收链路在**真实 HTTP 上**跑通，而不只是单测里模拟。
 *
 * 用法（API 与 web 均已启动）：
 *   node scripts/e2e-publish.mjs http://localhost:4000
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
  let parsed = null;
  if (text !== '') {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
  }
  return { status: res.status, body: parsed };
}

async function login(email) {
  const res = await call('/auth/login', { method: 'POST', body: { email, password: PASSWORD } });
  if (res.status !== 200) {
    throw new Error(`login failed for ${email}: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return res.body.data.accessToken;
}

const slug = `e2e-place-${Date.now().toString(36)}`;

const editor = await login('editor@demo.local');
const reviewer = await login('reviewer@demo.local');
console.log('1. 两个不同账号登录成功（编辑 + 审核者）');

const created = await call('/admin/contents', {
  method: 'POST',
  token: editor,
  body: {
    type: 'PLACE',
    slug,
    title: `端到端验收条目 ${slug}`,
    subtitle: '示例 / 待核验',
    summary: '这是端到端验收创建的内容，标记为示例与待核验。',
    body: {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: '概述' }] },
        {
          type: 'paragraph',
          content: [{ type: 'text', text: '示例 / 待核验：用于验证发布链路。' }],
        },
      ],
    },
    extension: {
      kind: 'PLACE',
      accuracy: 'AREA_ONLY',
      verificationStatus: 'PARTIAL',
      address: '示例地址',
    },
  },
});
if (created.status !== 201) {
  throw new Error(`create failed: ${created.status} ${JSON.stringify(created.body)}`);
}
const contentId = created.body.data.id;
console.log('2. 编辑建稿成功 →', created.status);

const source = await call('/admin/sources', {
  method: 'POST',
  token: editor,
  body: { kind: 'OTHER', title: `示例来源 ${slug}`, verificationNote: '未核验' },
});
await call(`/admin/contents/${contentId}/sources`, {
  method: 'POST',
  token: editor,
  body: { sourceId: source.body.data.id, claimScope: '整体（待核验）', isPrimary: true },
});
console.log('3. 补来源成功');

const submit = await call(`/admin/contents/${contentId}/transition`, {
  method: 'POST',
  token: editor,
  body: { action: 'SUBMIT' },
});
if (submit.status !== 200) {
  throw new Error(`submit failed: ${submit.status}`);
}
console.log('4. 送审成功');

// 自审拦截必须生效：编辑自己审核
const selfApprove = await call(`/admin/contents/${contentId}/transition`, {
  method: 'POST',
  token: editor,
  body: { action: 'APPROVE' },
});
if (selfApprove.status !== 403) {
  throw new Error(`self-approve should be 403, got ${selfApprove.status}`);
}
console.log('5. 自审被拒（403）✓');

const approve = await call(`/admin/contents/${contentId}/transition`, {
  method: 'POST',
  token: reviewer,
  body: { action: 'APPROVE' },
});
if (approve.status !== 200) {
  throw new Error(`approve failed: ${approve.status} ${JSON.stringify(approve.body)}`);
}
console.log('6. 他人审核通过');

const publish = await call(`/admin/contents/${contentId}/transition`, {
  method: 'POST',
  token: reviewer,
  body: { action: 'PUBLISH' },
});
if (publish.status !== 200) {
  throw new Error(`publish failed: ${publish.status} ${JSON.stringify(publish.body)}`);
}
console.log('7. 发布成功');

const publicDetail = await call(`/contents/${slug}`);
if (publicDetail.status !== 200) {
  throw new Error(`public detail should be 200, got ${publicDetail.status}`);
}
const leaked = ['createdById', 'updatedById', 'archivedAt', 'version', 'status'].filter(
  (key) => key in publicDetail.body.data,
);
if (leaked.length > 0) {
  throw new Error(`public detail leaked internal fields: ${leaked.join(', ')}`);
}
console.log('8. 公开详情可访问且未泄露内部字段 ✓');

const publicPlace = await call(`/places/${slug}`);
if (publicPlace.status !== 200) {
  throw new Error(`public place should be 200, got ${publicPlace.status}`);
}
if (publicPlace.body.data.lon !== null) {
  throw new Error('unverified coordinates must be withheld');
}
console.log('9. 地点详情可访问且未核验坐标已扣留 ✓');

const archive = await call(`/admin/contents/${contentId}/transition`, {
  method: 'POST',
  token: reviewer,
  body: { action: 'ARCHIVE' },
});
if (archive.status !== 200) {
  throw new Error(`archive failed: ${archive.status}`);
}
const afterArchive = await call(`/contents/${slug}`);
if (afterArchive.status !== 404) {
  throw new Error(`archived content should 404, got ${afterArchive.status}`);
}
console.log('10. 撤回后公开 URL 返回 404 ✓');

console.log(`\nE2E PASS · slug=${slug}`);
