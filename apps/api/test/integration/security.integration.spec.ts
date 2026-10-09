import { createHash, createHmac } from 'node:crypto';

import { getStorageToken, type ThrottlerStorageService } from '@nestjs/throttler';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { env } from '../../src/lib/env.js';
import { hashPassword } from '../../src/lib/password.js';
import { issueAccessToken } from '../../src/lib/token.js';
import { closeTestApp, createTestApp, prisma, request, serverOf } from '../app-harness.js';

import type { INestApplication } from '@nestjs/common';

/**
 * P4-02 应用安全测试。
 *
 * 这是**攻击测试**而不是"功能跑通"测试：每条用例都假设攻击者已经拿到请求
 * 构造能力（能改 JSON、能伪造 header、能控制 query），断言的是服务端
 * 边界是否真的挡住了。跑通一次不代表安全，改动任何一条白名单都必须让
 * 对应用例变红。
 *
 * 依据：AGENTS.md §4（认证授权 / DTO 白名单 / XSS / 注入 / 上传校验 /
 * 错误信息不泄露）+ §7.1（API 权限必须有真实数据库集成测试）。
 *
 * 本文件只做攻击面测试，功能正确性由 content / auth / media / places
 * 各自的集成测试负责，这里不重复。
 */

const PASSWORD = 'security-integration-password-2026';

/** 登录端点在测试配置下有独立配额；其余端点共享全局 120 次/分钟。 */
const LOGIN_ROUTE = '/api/v1/auth/login';

let app: INestApplication | undefined;

function liveApp(): INestApplication {
  if (app === undefined) {
    throw new Error('app not initialised — beforeAll likely failed');
  }
  return app;
}

let seq = 0;
function nextId(): string {
  seq += 1;
  return `${String(seq)}${String(Date.now()).slice(-6)}`;
}

interface TestUser {
  id: string;
  email: string;
  roles: string[];
}

async function createUser(roles: readonly string[], disabled = false): Promise<TestUser> {
  const email = `sec-${nextId()}@security.test`;
  const passwordHash = await hashPassword(PASSWORD);
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash,
      displayName: '安全测试用户',
      disabledAt: disabled ? new Date() : null,
      userRoles: { create: roles.map((role) => ({ role })) },
    },
    include: { userRoles: true },
  });
  return { id: user.id, email, roles: user.userRoles.map((r) => r.role) };
}

/**
 * 直接签发 access token，不走 HTTP 登录。
 *
 * 签名用的是服务端真实 secret，守卫会正常接受 —— 这样几百条安全用例
 * 不会把登录限流桶打爆（登录走独立配额，全局限流只有 120 次/分钟）。
 */
function tokenFor(user: TestUser): string {
  return issueAccessToken({ userId: user.id, roles: user.roles }).token;
}

function bearer(token: string): string {
  return `Bearer ${token}`;
}

const VALID_BODY = {
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text: '示例 / 待核验正文' }] }],
};

async function createContentRow(input: {
  authorId: string;
  status: string;
}): Promise<{ id: string; slug: string; version: number }> {
  const slug = `sec-content-${nextId()}`;
  const row = await prisma.content.create({
    data: {
      type: 'TOPIC',
      slug,
      title: `安全测试内容 ${nextId()}`,
      summary: '示例摘要，待核验',
      bodyJson: JSON.stringify(VALID_BODY),
      status: input.status,
      language: 'ZH',
      createdById: input.authorId,
      updatedById: input.authorId,
      ...(input.status === 'PUBLISHED' ? { publishedAt: new Date() } : {}),
    },
  });
  return { id: row.id, slug: row.slug, version: row.version };
}

/** 采集任意 JSON 的**键名**（不采集值），用来精确断言字段级泄露。 */
function collectKeys(value: unknown, into: Set<string>): void {
  if (Array.isArray(value)) {
    for (const item of value) {
      collectKeys(item, into);
    }
    return;
  }
  if (typeof value === 'object' && value !== null) {
    for (const [key, item] of Object.entries(value)) {
      into.add(key);
      collectKeys(item, into);
    }
  }
}

/** 公开接口绝不能出现的字段（AGENTS.md §4.7 + 技术方案 §7.2）。 */
const FORBIDDEN_PUBLIC_KEYS: readonly string[] = [
  'createdById',
  'updatedById',
  'version',
  'status',
  'archivedAt',
  'createdAt',
  'updatedAt',
  'passwordHash',
  'tokenHash',
  'revokedAt',
  'ipHash',
];

function expectNoInternalKeys(payload: unknown, context: string): void {
  const keys = new Set<string>();
  collectKeys(payload, keys);
  for (const forbidden of FORBIDDEN_PUBLIC_KEYS) {
    expect(keys.has(forbidden), `${context} 泄露了内部字段 ${forbidden}`).toBe(false);
  }
}

// ---------------------------------------------------------------------------
// JWT 伪造工具
// ---------------------------------------------------------------------------

function b64u(input: string): string {
  return Buffer.from(input, 'utf8').toString('base64url');
}

function hmacSha256(secret: string, data: string): string {
  return createHmac('sha256', secret).update(data).digest('base64url');
}

interface ForgedTokenOptions {
  header: unknown;
  payload: unknown;
  secret: string;
}

function forgeToken(options: ForgedTokenOptions): string {
  const header = b64u(JSON.stringify(options.header));
  const payload = b64u(JSON.stringify(options.payload));
  return `${header}.${payload}.${hmacSha256(options.secret, `${header}.${payload}`)}`;
}

function claimsFor(userId: string, roles: string[]): Record<string, unknown> {
  const nowSec = Math.floor(Date.now() / 1000);
  return { sub: userId, roles, iat: nowSec - 10, exp: nowSec + 900, jti: 'forged-jti' };
}

function splitToken(token: string): [string, string, string] {
  const parts = token.split('.');
  const [header, payload, signature] = parts;
  if (header === undefined || payload === undefined || signature === undefined) {
    throw new Error(`expected a 3-part JWT, got ${String(parts.length)}`);
  }
  return [header, payload, signature];
}

/** 取 set-cookie 里的某一条（用于 cookie 属性断言）。 */
function cookieHeaders(res: { headers: Record<string, unknown> }): string[] {
  const raw = res.headers['set-cookie'];
  if (Array.isArray(raw)) {
    return raw.filter((item): item is string => typeof item === 'string');
  }
  return typeof raw === 'string' ? [raw] : [];
}

function requireRefreshCookie(res: { headers: Record<string, unknown> }): string {
  for (const item of cookieHeaders(res)) {
    if (item.startsWith('nla_rt=')) {
      const value = item.split(';')[0] ?? '';
      return value.slice('nla_rt='.length);
    }
  }
  throw new Error('expected an nla_rt cookie, got none');
}

/** 深度 40 的嵌套文档（blockquote 可自嵌套），超过 MAX_TIPTAP_DEPTH=32。 */
function deepDoc(depth: number): unknown {
  let node: Record<string, unknown> = {
    type: 'paragraph',
    content: [{ type: 'text', text: '底部' }],
  };
  for (let i = 0; i < depth; i += 1) {
    node = { type: 'blockquote', content: [node] };
  }
  return { type: 'doc', content: [node] };
}

/** 节点数远超 MAX_TIPTAP_NODE_COUNT=5000 的宽文档。 */
function wideDoc(count: number): unknown {
  return {
    type: 'doc',
    content: Array.from({ length: count }, () => ({ type: 'paragraph' })),
  };
}

// ---------------------------------------------------------------------------
// 共享 fixture 与限流桶隔离
// ---------------------------------------------------------------------------

let admin: TestUser;
let editor: TestUser;
let reviewer: TestUser;
let viewer: TestUser;
let otherEditor: TestUser;

/**
 * 限流桶复位开关。
 *
 * 全局限流是 120 次/分钟、按 IP 计，supertest 全部走 127.0.0.1 —— 一份
 * 90 条的安全测试必然打爆。这里在每个用例前清空**当前 app 实例**的限流
 * 存储（每个测试文件独立进程，桶本来就不共享），只有第 9 组"验证限流本身"
 * 才会关掉复位。
 */
let keepThrottleBuckets = false;

beforeAll(async () => {
  app = await createTestApp();
  admin = await createUser(['ADMIN']);
  editor = await createUser(['EDITOR']);
  reviewer = await createUser(['REVIEWER']);
  viewer = await createUser(['VIEWER']);
  otherEditor = await createUser(['EDITOR']);
});

afterAll(async () => {
  await closeTestApp(app);
});

beforeEach(() => {
  if (keepThrottleBuckets) {
    return;
  }
  const storage = liveApp().get<ThrottlerStorageService>(getStorageToken());
  storage.storage.clear();
});

// ===========================================================================
// 1. 未认证 / 认证绕过
//    防的是：匿名打后台端点、伪造 / 过期 / alg:none / 换密钥签名的 JWT。
// ===========================================================================

describe('1. 未认证与 JWT 伪造', () => {
  it('无 token 访问 /auth/me → 401', async () => {
    const res = await request(serverOf(liveApp())).get('/api/v1/auth/me');
    expect(res.status).toBe(401);
    expect((res.body as { error: { code: string } }).error.code).toBe('UNAUTHORIZED');
  });

  it('无 token 访问 /admin/users → 401', async () => {
    const res = await request(serverOf(liveApp())).get('/api/v1/admin/users');
    expect(res.status).toBe(401);
  });

  it('无 token 创建内容 → 401（写接口同样受保护）', async () => {
    const res = await request(serverOf(liveApp()))
      .post('/api/v1/admin/contents')
      .send({
        type: 'TOPIC',
        slug: 'nope',
        title: 'x',
        body: VALID_BODY,
        extension: { kind: 'TOPIC' },
      });
    expect(res.status).toBe(401);
  });

  it('无 token 发起上传意图 → 401', async () => {
    const res = await request(serverOf(liveApp()))
      .post('/api/v1/admin/media/upload-intents')
      .send({ fileName: 'a.png', mimeType: 'image/png', sizeBytes: 1024 });
    expect(res.status).toBe(401);
  });

  it('错误 scheme 的 Authorization 头（Basic）→ 401', async () => {
    const res = await request(serverOf(liveApp()))
      .get('/api/v1/auth/me')
      .set('Authorization', `Basic ${Buffer.from('a:b').toString('base64')}`);
    expect(res.status).toBe(401);
  });

  it('结构非法的 token → 401', async () => {
    const res = await request(serverOf(liveApp()))
      .get('/api/v1/auth/me')
      .set('Authorization', bearer('not-a-jwt'));
    expect(res.status).toBe(401);
  });

  it('签名被篡改（结构合法）→ 401', async () => {
    const token = tokenFor(editor);
    const [header, payload, signature] = splitToken(token);
    // 必须改**首字符**：43 个 base64url 字符只承载 256 bit，最后一个字符有 4 bit
    // 是冗余的 —— 改它解码出来是同一串字节，签名根本没变。
    const replacement = signature.startsWith('A') ? 'B' : 'A';
    const tampered = `${replacement}${signature.slice(1)}`;
    expect(tampered).not.toBe(signature);
    const res = await request(serverOf(liveApp()))
      .get('/api/v1/auth/me')
      .set('Authorization', bearer(`${header}.${payload}.${tampered}`));
    expect(res.status).toBe(401);
  });

  it('过期的 access token → 401', async () => {
    const issued = issueAccessToken({
      userId: admin.id,
      roles: ['ADMIN'],
      now: new Date(Date.now() - (env.AUTH_ACCESS_TTL_SECONDS + 120) * 1000),
    });
    expect(issued.claims.exp * 1000).toBeLessThan(Date.now());
    const res = await request(serverOf(liveApp()))
      .get('/api/v1/auth/me')
      .set('Authorization', bearer(issued.token));
    expect(res.status).toBe(401);
    expect((res.body as { error: { message: string } }).error.message).toContain('过期');
  });

  it('alg:none 的 JWT → 401', async () => {
    const forged = `${b64u(JSON.stringify({ alg: 'none', typ: 'JWT' }))}.${b64u(
      JSON.stringify(claimsFor(admin.id, ['ADMIN'])),
    )}.`;
    const res = await request(serverOf(liveApp()))
      .get('/api/v1/admin/users')
      .set('Authorization', bearer(forged));
    expect(res.status).toBe(401);
  });

  it('用另一个 secret 签名的完整合法 token → 401', async () => {
    const forged = forgeToken({
      header: { alg: 'HS256', typ: 'JWT' },
      payload: claimsFor(admin.id, ['ADMIN']),
      secret: 'an-entirely-different-signing-secret-32b',
    });
    const res = await request(serverOf(liveApp()))
      .get('/api/v1/admin/users')
      .set('Authorization', bearer(forged));
    expect(res.status).toBe(401);
  });

  it('把 secret 塞进 payload 再自签 → 401（payload 里的 secret 不算数）', async () => {
    const guessed = 'i-guessed-the-secret';
    const forged = forgeToken({
      header: { alg: 'HS256', typ: 'JWT' },
      payload: { ...claimsFor(admin.id, ['ADMIN']), secret: guessed, alg: 'HS256' },
      secret: guessed,
    });
    const res = await request(serverOf(liveApp()))
      .get('/api/v1/admin/users')
      .set('Authorization', bearer(forged));
    expect(res.status).toBe(401);
  });

  it('篡改 roles 为小写 admin → 401（签名失效，改一字节就废）', async () => {
    const token = tokenFor(editor);
    const [header, payloadPart, signature] = splitToken(token);
    const claims = JSON.parse(Buffer.from(payloadPart, 'base64url').toString('utf8')) as Record<
      string,
      unknown
    >;
    claims.roles = ['admin'];
    const tampered = `${header}.${b64u(JSON.stringify(claims))}.${signature}`;
    const res = await request(serverOf(liveApp()))
      .get('/api/v1/admin/users')
      .set('Authorization', bearer(tampered));
    // 预期是 401 而不是 403：改动 payload 会让签名失配，守卫根本读不到角色。
    expect(res.status).toBe(401);
  });

  it('合法 token 仍能通过（对照组：上面的 401 不是守卫坏了）', async () => {
    const res = await request(serverOf(liveApp()))
      .get('/api/v1/auth/me')
      .set('Authorization', bearer(tokenFor(editor)));
    expect(res.status).toBe(200);
    expect((res.body as { data: { id: string } }).data.id).toBe(editor.id);
  });
});

// ===========================================================================
// 2. 越权（IDOR / 角色绕过）
//    防的是：低权限角色调管理端点、把别人的用户改角色、用客户端参数假装高权限。
// ===========================================================================

describe('2. 越权与角色绕过', () => {
  it('EDITOR 访问 /admin/users → 403', async () => {
    const res = await request(serverOf(liveApp()))
      .get('/api/v1/admin/users')
      .set('Authorization', bearer(tokenFor(editor)));
    expect(res.status).toBe(403);
    expect((res.body as { error: { code: string } }).error.code).toBe('FORBIDDEN');
  });

  it('VIEWER 编辑内容 → 403', async () => {
    const draft = await createContentRow({ authorId: editor.id, status: 'DRAFT' });
    const res = await request(serverOf(liveApp()))
      .patch(`/api/v1/admin/contents/${draft.id}`)
      .set('Authorization', bearer(tokenFor(viewer)))
      .set('If-Match', `W/"${String(draft.version)}"`)
      .send({ title: '被篡改的标题' });
    expect(res.status).toBe(403);
  });

  it('VIEWER 创建内容 → 403', async () => {
    const res = await request(serverOf(liveApp()))
      .post('/api/v1/admin/contents')
      .set('Authorization', bearer(tokenFor(viewer)))
      .send({
        type: 'TOPIC',
        slug: `sec-v-${nextId()}`,
        title: 'viewer 越权创建',
        body: VALID_BODY,
        extension: { kind: 'TOPIC' },
      });
    expect(res.status).toBe(403);
  });

  it('VIEWER 触发状态流转 → 403', async () => {
    const draft = await createContentRow({ authorId: editor.id, status: 'DRAFT' });
    const res = await request(serverOf(liveApp()))
      .post(`/api/v1/admin/contents/${draft.id}/transition`)
      .set('Authorization', bearer(tokenFor(viewer)))
      .send({ action: 'SUBMIT' });
    expect(res.status).toBe(403);
  });

  it('VIEWER 发起上传 → 403', async () => {
    const res = await request(serverOf(liveApp()))
      .post('/api/v1/admin/media/upload-intents')
      .set('Authorization', bearer(tokenFor(viewer)))
      .send({ fileName: 'a.png', mimeType: 'image/png', sizeBytes: 1024 });
    expect(res.status).toBe(403);
  });

  it('REVIEWER 重建空间索引（仅 ADMIN）→ 403', async () => {
    const res = await request(serverOf(liveApp()))
      .post('/api/v1/admin/places/reindex')
      .set('Authorization', bearer(tokenFor(reviewer)));
    expect(res.status).toBe(403);
  });

  it('EDITOR 查看首页槽位（仅 ADMIN）→ 403', async () => {
    const res = await request(serverOf(liveApp()))
      .get('/api/v1/admin/homepage-slots')
      .set('Authorization', bearer(tokenFor(editor)));
    expect(res.status).toBe(403);
  });

  it('普通用户改别人 roles → 403（且角色数据不变）', async () => {
    const before = await prisma.userRoleAssignment.findMany({
      where: { userId: otherEditor.id },
      select: { role: true },
    });
    const res = await request(serverOf(liveApp()))
      .patch(`/api/v1/admin/users/${otherEditor.id}`)
      .set('Authorization', bearer(tokenFor(editor)))
      .send({ roles: ['ADMIN'] });
    expect(res.status).toBe(403);
    const after = await prisma.userRoleAssignment.findMany({
      where: { userId: otherEditor.id },
      select: { role: true },
    });
    expect(after).toEqual(before);
    expect(after.some((row) => row.role === 'ADMIN')).toBe(false);
  });

  it('客户端伪造的 role 参数不会提升权限 → 403', async () => {
    const res = await request(serverOf(liveApp()))
      .get('/api/v1/admin/users?role=ADMIN&roles=ADMIN&isAdmin=true')
      .set('Authorization', bearer(tokenFor(editor)));
    expect(res.status).toBe(403);
  });

  it('VIEWER 读 /auth/me 可用，但读后台内容列表 → 403', async () => {
    const me = await request(serverOf(liveApp()))
      .get('/api/v1/auth/me')
      .set('Authorization', bearer(tokenFor(viewer)));
    expect(me.status).toBe(200);
    const list = await request(serverOf(liveApp()))
      .get('/api/v1/admin/contents')
      .set('Authorization', bearer(tokenFor(viewer)));
    expect(list.status).toBe(403);
  });
});

// ===========================================================================
// 3. 状态机绕过（AGENTS.md §4.2）
//    防的是：Editor 自审自发、DRAFT 直发 PUBLISH、跳过理由、自审。
// ===========================================================================

describe('3. 内容状态机绕过', () => {
  it('EDITOR 直接 APPROVE → 403', async () => {
    const inReview = await createContentRow({ authorId: editor.id, status: 'IN_REVIEW' });
    const res = await request(serverOf(liveApp()))
      .post(`/api/v1/admin/contents/${inReview.id}/transition`)
      .set('Authorization', bearer(tokenFor(editor)))
      .send({ action: 'APPROVE' });
    expect(res.status).toBe(403);
    expect((res.body as { error: { code: string } }).error.code).toBe('FORBIDDEN');
  });

  it('EDITOR 直接 PUBLISH → 403', async () => {
    const approved = await createContentRow({ authorId: editor.id, status: 'APPROVED' });
    const res = await request(serverOf(liveApp()))
      .post(`/api/v1/admin/contents/${approved.id}/transition`)
      .set('Authorization', bearer(tokenFor(editor)))
      .send({ action: 'PUBLISH' });
    expect(res.status).toBe(403);
  });

  it('EDITOR ARCHIVE → 403（归档也是审核类动作）', async () => {
    const draft = await createContentRow({ authorId: editor.id, status: 'DRAFT' });
    const res = await request(serverOf(liveApp()))
      .post(`/api/v1/admin/contents/${draft.id}/transition`)
      .set('Authorization', bearer(tokenFor(editor)))
      .send({ action: 'ARCHIVE' });
    expect(res.status).toBe(403);
  });

  it('审核者审核自己创建的内容 → 403', async () => {
    const inReview = await createContentRow({ authorId: reviewer.id, status: 'IN_REVIEW' });
    const res = await request(serverOf(liveApp()))
      .post(`/api/v1/admin/contents/${inReview.id}/transition`)
      .set('Authorization', bearer(tokenFor(reviewer)))
      .send({ action: 'APPROVE' });
    expect(res.status).toBe(403);
    expect((res.body as { error: { message: string } }).error.message).toContain('自己');
  });

  it('REJECT 不带 reason → 403', async () => {
    const inReview = await createContentRow({ authorId: editor.id, status: 'IN_REVIEW' });
    const res = await request(serverOf(liveApp()))
      .post(`/api/v1/admin/contents/${inReview.id}/transition`)
      .set('Authorization', bearer(tokenFor(reviewer)))
      .send({ action: 'REJECT' });
    expect(res.status).toBe(403);
  });

  it('REJECT 带空白 reason → 403（trim 后为空仍然拒绝）', async () => {
    const inReview = await createContentRow({ authorId: editor.id, status: 'IN_REVIEW' });
    const res = await request(serverOf(liveApp()))
      .post(`/api/v1/admin/contents/${inReview.id}/transition`)
      .set('Authorization', bearer(tokenFor(reviewer)))
      .send({ action: 'REJECT', reason: '   \n\t ' });
    expect(res.status).toBe(403);
  });

  it('绕过状态机：DRAFT 直接 PUBLISH → 403', async () => {
    const draft = await createContentRow({ authorId: editor.id, status: 'DRAFT' });
    const res = await request(serverOf(liveApp()))
      .post(`/api/v1/admin/contents/${draft.id}/transition`)
      .set('Authorization', bearer(tokenFor(admin)))
      .send({ action: 'PUBLISH' });
    expect(res.status).toBe(403);
  });

  it('ARCHIVED 直接 APPROVE → 403', async () => {
    const archived = await createContentRow({ authorId: editor.id, status: 'ARCHIVED' });
    const res = await request(serverOf(liveApp()))
      .post(`/api/v1/admin/contents/${archived.id}/transition`)
      .set('Authorization', bearer(tokenFor(admin)))
      .send({ action: 'APPROVE' });
    expect(res.status).toBe(403);
  });

  it('非法 transition action 值 "HACK" → 400', async () => {
    const draft = await createContentRow({ authorId: editor.id, status: 'DRAFT' });
    const res = await request(serverOf(liveApp()))
      .post(`/api/v1/admin/contents/${draft.id}/transition`)
      .set('Authorization', bearer(tokenFor(admin)))
      .send({ action: 'HACK' });
    expect(res.status).toBe(400);
    expect((res.body as { error: { code: string } }).error.code).toBe('VALIDATION_FAILED');
  });

  it('大小写错误的 action "approve" → 400（状态机不接受模糊匹配）', async () => {
    const inReview = await createContentRow({ authorId: editor.id, status: 'IN_REVIEW' });
    const res = await request(serverOf(liveApp()))
      .post(`/api/v1/admin/contents/${inReview.id}/transition`)
      .set('Authorization', bearer(tokenFor(admin)))
      .send({ action: 'approve' });
    expect(res.status).toBe(400);
  });

  it('transition body 里塞未知字段（直接写 status）→ 400', async () => {
    const draft = await createContentRow({ authorId: editor.id, status: 'DRAFT' });
    const res = await request(serverOf(liveApp()))
      .post(`/api/v1/admin/contents/${draft.id}/transition`)
      .set('Authorization', bearer(tokenFor(admin)))
      .send({ action: 'SUBMIT', status: 'PUBLISHED', version: 99 });
    expect(res.status).toBe(400);
    const row = await prisma.content.findUnique({
      where: { id: draft.id },
      select: { status: true },
    });
    expect(row?.status).toBe('DRAFT');
  });

  it('EDITOR 提交别人的草稿 → 200（对照组：403 不是一刀切）', async () => {
    const draft = await createContentRow({ authorId: otherEditor.id, status: 'DRAFT' });
    const res = await request(serverOf(liveApp()))
      .post(`/api/v1/admin/contents/${draft.id}/transition`)
      .set('Authorization', bearer(tokenFor(editor)))
      .send({ action: 'SUBMIT' });
    expect(res.status).toBe(200);
    expect((res.body as { data: { status: string } }).data.status).toBe('IN_REVIEW');
  });

  it('ADMIN 发布齐备内容 → 200（对照组：状态机不是永远拒绝）', async () => {
    const approved = await createContentRow({ authorId: editor.id, status: 'APPROVED' });
    const source = await prisma.source.create({
      data: { kind: 'BOOK', title: '示例来源（待核验）', author: '示例' },
    });
    await prisma.contentSource.create({
      data: { contentId: approved.id, sourceId: source.id, claimScope: 'BODY', isPrimary: true },
    });
    const res = await request(serverOf(liveApp()))
      .post(`/api/v1/admin/contents/${approved.id}/transition`)
      .set('Authorization', bearer(tokenFor(admin)))
      .send({ action: 'PUBLISH' });
    expect(res.status).toBe(200);
    expect((res.body as { data: { status: string } }).data.status).toBe('PUBLISHED');
  });
});

// ===========================================================================
// 4. 注入（SQL / LIKE 通配符 / 参数走私）
//    防的是：slug、搜索词、bbox 里的注入串打通数据层或拖全表。
// ===========================================================================

describe('4. 注入', () => {
  it('slug 注入 "OR 1=1 --" → 404 且不返回任何内容', async () => {
    const res = await request(serverOf(liveApp())).get(
      `/api/v1/contents/${encodeURIComponent("' OR 1=1 --")}`,
    );
    expect(res.status).toBe(404);
    expect((res.body as { data?: unknown }).data).toBeUndefined();
  });

  it('slug 注入 "; DROP TABLE contents; --" → 404 且 contents 表仍存在', async () => {
    const res = await request(serverOf(liveApp())).get(
      `/api/v1/contents/${encodeURIComponent("'; DROP TABLE contents; --")}`,
    );
    expect(res.status).toBe(404);
    // 表还在 = 参数化确实生效
    await expect(prisma.content.count()).resolves.toBeGreaterThan(0);
  });

  it('slug 路径穿越 ../../etc/passwd → 404', async () => {
    const res = await request(serverOf(liveApp())).get(
      `/api/v1/contents/${encodeURIComponent('../../../etc/passwd')}`,
    );
    expect(res.status).toBe(404);
  });

  it('后台创建内容时注入 slug → 400', async () => {
    const res = await request(serverOf(liveApp()))
      .post('/api/v1/admin/contents')
      .set('Authorization', bearer(tokenFor(editor)))
      .send({
        type: 'TOPIC',
        slug: "'; DROP TABLE contents; --",
        title: '注入',
        body: VALID_BODY,
        extension: { kind: 'TOPIC' },
      });
    expect(res.status).toBe(400);
  });

  it("搜索词 '1' OR '1'='1 → 0 结果", async () => {
    const res = await request(serverOf(liveApp())).get(
      `/api/v1/search?q=${encodeURIComponent("1' OR '1'='1")}`,
    );
    expect(res.status).toBe(200);
    expect((res.body as { data: { total: number } }).data.total).toBe(0);
  });

  it("搜索词单引号 ' → 0 结果（不报 SQL 错）", async () => {
    const res = await request(serverOf(liveApp())).get(
      `/api/v1/search?q=${encodeURIComponent("'")}`,
    );
    expect(res.status).toBe(200);
    expect((res.body as { data: { total: number } }).data.total).toBe(0);
  });

  it('搜索 LIKE 通配符 %% → 0 结果（不能拖全表）', async () => {
    // 先确保库里有已发布内容，否则"返回 0"证明不了任何事
    await createContentRow({ authorId: admin.id, status: 'PUBLISHED' });
    await createContentRow({ authorId: admin.id, status: 'PUBLISHED' });
    const res = await request(serverOf(liveApp())).get(
      `/api/v1/search?q=${encodeURIComponent('%%')}`,
    );
    expect(res.status).toBe(200);
    expect((res.body as { data: { total: number } }).data.total).toBe(0);
  });

  it('搜索 LIKE 通配符 __ → 0 结果（不能拖全表）', async () => {
    await createContentRow({ authorId: admin.id, status: 'PUBLISHED' });
    const res = await request(serverOf(liveApp())).get(
      `/api/v1/search?q=${encodeURIComponent('__')}`,
    );
    expect(res.status).toBe(200);
    expect((res.body as { data: { total: number } }).data.total).toBe(0);
  });

  it('URL 编码的 %25（即字面 %）→ 0 结果', async () => {
    await createContentRow({ authorId: admin.id, status: 'PUBLISHED' });
    const res = await request(serverOf(liveApp())).get('/api/v1/search?q=%25');
    expect(res.status).toBe(200);
    expect((res.body as { data: { total: number } }).data.total).toBe(0);
  });

  it('搜索反斜杠 \\%% → 0 结果且不报错', async () => {
    const res = await request(serverOf(liveApp())).get(
      `/api/v1/search?q=${encodeURIComponent('\\%')}`,
    );
    expect(res.status).toBe(200);
    expect((res.body as { data: { total: number } }).data.total).toBe(0);
  });

  it('bbox 注入 "1); DROP TABLE places; --" → 400 且 places 表仍存在', async () => {
    const res = await request(serverOf(liveApp())).get(
      `/api/v1/places?bbox=${encodeURIComponent('1); DROP TABLE places; --')}`,
    );
    expect(res.status).toBe(400);
    await expect(prisma.place.count()).resolves.toBeGreaterThanOrEqual(0);
    await expect(prisma.$queryRawUnsafe('SELECT COUNT(*) AS n FROM places')).resolves.toBeTruthy();
  });

  it('bbox 注入 "118.7,32.0,119,32.1 OR 1=1" → 400', async () => {
    const res = await request(serverOf(liveApp())).get(
      `/api/v1/places?bbox=${encodeURIComponent('118.7,32.0,119,32.1 OR 1=1')}`,
    );
    expect(res.status).toBe(400);
  });

  it('bbox 非数字 → 400', async () => {
    const res = await request(serverOf(liveApp())).get('/api/v1/places?bbox=a,b,c,d');
    expect(res.status).toBe(400);
  });

  it('bbox 超长字符串（5000 字符）→ 400', async () => {
    const res = await request(serverOf(liveApp())).get(
      `/api/v1/places?bbox=${encodeURIComponent('1'.repeat(5000))}`,
    );
    expect(res.status).toBe(400);
  });

  it('bbox limit 走私 "1;DROP" → 400', async () => {
    const res = await request(serverOf(liveApp())).get(
      `/api/v1/places?bbox=118.6,31.9,119,32.2&limit=${encodeURIComponent('1;DROP TABLE places')}`,
    );
    expect(res.status).toBe(400);
  });

  it('搜索 type 参数走私 → 400（枚举白名单）', async () => {
    const res = await request(serverOf(liveApp())).get(
      `/api/v1/search?q=${encodeURIComponent('测试')}&type=${encodeURIComponent("PLACE' OR '1'='1")}`,
    );
    expect(res.status).toBe(400);
  });

  it('对照组：转义之后正常关键词仍能命中（防"把搜索打瞎"这种假修复）', async () => {
    const marker = `qidian${nextId()}`;
    await prisma.content.create({
      data: {
        type: 'TOPIC',
        slug: `sec-search-${nextId()}`,
        title: `起 点 ${marker}`,
        summary: '示例摘要，待核验',
        bodyJson: JSON.stringify(VALID_BODY),
        status: 'PUBLISHED',
        language: 'ZH',
        createdById: admin.id,
        updatedById: admin.id,
        publishedAt: new Date(),
      },
    });
    const res = await request(serverOf(liveApp())).get(
      `/api/v1/search?q=${encodeURIComponent(marker)}`,
    );
    expect(res.status).toBe(200);
    const body = res.body as { data: { total: number; items: { title: string }[] } };
    expect(body.data.total).toBe(1);
    expect(body.data.items[0]?.title).toContain(marker);
  });

  it('对照组：type 过滤在改写查询后仍然生效', async () => {
    const marker = `leixing${nextId()}`;
    for (const type of ['TOPIC', 'EVENT'] as const) {
      await prisma.content.create({
        data: {
          type,
          slug: `sec-type-${nextId()}`,
          title: `类型探针 ${marker}`,
          summary: '示例摘要，待核验',
          bodyJson: JSON.stringify(VALID_BODY),
          status: 'PUBLISHED',
          language: 'ZH',
          createdById: admin.id,
          updatedById: admin.id,
          publishedAt: new Date(),
        },
      });
    }
    const res = await request(serverOf(liveApp())).get(
      `/api/v1/search?q=${encodeURIComponent(marker)}&type=EVENT`,
    );
    expect(res.status).toBe(200);
    const body = res.body as { data: { total: number; items: { type: string }[] } };
    expect(body.data.total).toBe(1);
    expect(body.data.items[0]?.type).toBe('EVENT');
  });

  it('对照组：标签命中仍能判定 matchedOn=tag', async () => {
    const marker = `biaoqian${nextId()}`;
    const content = await createContentRow({ authorId: admin.id, status: 'PUBLISHED' });
    const tagSlug = `sec-tag-${nextId()}`;
    await prisma.tag.create({ data: { slug: tagSlug, displayName: `标签 ${marker}` } });
    await prisma.contentTag.create({ data: { contentId: content.id, tagSlug } });
    const res = await request(serverOf(liveApp())).get(
      `/api/v1/search?q=${encodeURIComponent(marker)}`,
    );
    expect(res.status).toBe(200);
    const body = res.body as { data: { total: number; items: { matchedOn: string }[] } };
    expect(body.data.total).toBe(1);
    expect(body.data.items[0]?.matchedOn).toBe('tag');
  });
});

// ===========================================================================
// 5. XSS / 内容注入（Tiptap 白名单）
//    防的是：存储型 XSS —— script / javascript: / data: / 实体编码绕过。
// ===========================================================================

describe('5. Tiptap 正文 XSS', () => {
  async function postBody(
    body: unknown,
  ): Promise<{ status: number; body: Record<string, unknown> }> {
    const res = await request(serverOf(liveApp()))
      .post('/api/v1/admin/contents')
      .set('Authorization', bearer(tokenFor(editor)))
      .send({
        type: 'TOPIC',
        slug: `sec-xss-${nextId()}`,
        title: 'XSS 试探',
        body,
        extension: { kind: 'TOPIC' },
      });
    return { status: res.status, body: res.body as Record<string, unknown> };
  }

  it('script 节点 → 400', async () => {
    const res = await postBody({
      type: 'doc',
      content: [{ type: 'script', content: [{ type: 'text', text: 'alert(1)' }] }],
    });
    expect(res.status).toBe(400);
  });

  it('正文直接塞 HTML 字符串 <script>alert(1)</script> → 400', async () => {
    const res = await postBody('<script>alert(1)</script>');
    expect(res.status).toBe(400);
  });

  it('link href = javascript:alert(1) → 400', async () => {
    const res = await postBody({
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
    });
    expect(res.status).toBe(400);
  });

  it('link href = JaVaScRiPt:alert(1)（大小写混淆）→ 400', async () => {
    const res = await postBody({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'x',
              marks: [{ type: 'link', attrs: { href: 'JaVaScRiPt:alert(1)' } }],
            },
          ],
        },
      ],
    });
    expect(res.status).toBe(400);
  });

  it('link href = &#106;avascript:alert(1)（HTML 实体绕过）→ 400', async () => {
    const res = await postBody({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'x',
              marks: [{ type: 'link', attrs: { href: '&#106;avascript:alert(1)' } }],
            },
          ],
        },
      ],
    });
    expect(res.status).toBe(400);
  });

  it('image src = data:text/html;base64 → 400', async () => {
    const res = await postBody({
      type: 'doc',
      content: [
        {
          type: 'image',
          attrs: { src: 'data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==', alt: 'x' },
        },
      ],
    });
    expect(res.status).toBe(400);
  });

  it('node type = img 且带 onerror → 400', async () => {
    const res = await postBody({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'img', attrs: { src: 'x', onerror: 'alert(1)' } }] },
      ],
    });
    expect(res.status).toBe(400);
  });

  it('mark type = script → 400', async () => {
    const res = await postBody({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'x', marks: [{ type: 'script' }] }],
        },
      ],
    });
    expect(res.status).toBe(400);
  });

  it('超深嵌套（深度 40 > 上限 32）→ 400', async () => {
    const res = await postBody(deepDoc(40));
    expect(res.status).toBe(400);
  });

  it('超大文档（6000 节点）→ 被拒绝，且未落库', async () => {
    // 注意：Express 的 JSON body 上限（100kb）比 Tiptap 的 5000 节点上限更早触发，
    // 所以这里观测到的是 413 而不是 400。两者都是拒绝，且 100kb 更严格 —— 详见交付说明。
    const before = await prisma.content.count();
    const res = await postBody(wideDoc(6000));
    expect(res.status).toBe(413);
    await expect(prisma.content.count()).resolves.toBe(before);
  });

  it('PATCH 正文注入 → 400 且原文未被改动', async () => {
    const draft = await createContentRow({ authorId: editor.id, status: 'DRAFT' });
    const before = await prisma.content.findUniqueOrThrow({
      where: { id: draft.id },
      select: { bodyJson: true },
    });
    const res = await request(serverOf(liveApp()))
      .patch(`/api/v1/admin/contents/${draft.id}`)
      .set('Authorization', bearer(tokenFor(editor)))
      .set('If-Match', `W/"${String(draft.version)}"`)
      .send({
        body: {
          type: 'doc',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'a' }] }],
        },
        extension: { kind: 'TOPIC' },
      });
    // 合法 patch 的对照组：同样的结构这次应该成功
    expect(res.status).toBe(200);

    const evil = await request(serverOf(liveApp()))
      .patch(`/api/v1/admin/contents/${draft.id}`)
      .set('Authorization', bearer(tokenFor(editor)))
      .set('If-Match', 'W/"2"')
      .send({
        body: {
          type: 'doc',
          content: [
            { type: 'paragraph', content: [{ type: 'text', text: 'a' }] },
            {
              type: 'paragraph',
              content: [
                {
                  type: 'text',
                  text: 'b',
                  marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }],
                },
              ],
            },
          ],
        },
      });
    expect(evil.status).toBe(400);
    const after = await prisma.content.findUniqueOrThrow({
      where: { id: draft.id },
      select: { bodyJson: true },
    });
    expect(after.bodyJson).not.toBe(before.bodyJson);
    expect(after.bodyJson).not.toContain('javascript:');
  });
});

// ===========================================================================
// 6. 上传攻击
//    防的是：伪装扩展名、危险类型、超限体积、空 alt、伪造 checksum。
// ===========================================================================

describe('6. 上传攻击', () => {
  async function createIntent(
    payload: Record<string, unknown>,
  ): Promise<{ status: number; mediaId?: string }> {
    const res = await request(serverOf(liveApp()))
      .post('/api/v1/admin/media/upload-intents')
      .set('Authorization', bearer(tokenFor(editor)))
      .send(payload);
    const body = res.body as { data?: { mediaId?: string } };
    return {
      status: res.status,
      ...(body.data?.mediaId !== undefined ? { mediaId: body.data.mediaId } : {}),
    };
  }

  it('声明 image/png 但扩展名 .html → 403', async () => {
    const res = await createIntent({
      fileName: 'payload.html',
      mimeType: 'image/png',
      sizeBytes: 1024,
    });
    expect(res.status).toBe(403);
  });

  it('扩展名 .php → 403', async () => {
    const res = await createIntent({
      fileName: 'shell.php',
      mimeType: 'image/png',
      sizeBytes: 1024,
    });
    expect(res.status).toBe(403);
  });

  it('扩展名 .exe → 403', async () => {
    const res = await createIntent({
      fileName: 'tool.exe',
      mimeType: 'image/jpeg',
      sizeBytes: 1024,
    });
    expect(res.status).toBe(403);
  });

  it('扩展名 .svg → 403', async () => {
    const res = await createIntent({
      fileName: 'vector.svg',
      mimeType: 'image/png',
      sizeBytes: 1024,
    });
    expect(res.status).toBe(403);
  });

  it('MIME image/svg+xml（XSS 载体）→ 400（不在白名单）', async () => {
    const res = await createIntent({
      fileName: 'vector.svg',
      mimeType: 'image/svg+xml',
      sizeBytes: 1024,
    });
    expect(res.status).toBe(400);
  });

  it('超大 sizeBytes（> 10 MiB）→ 400', async () => {
    const res = await createIntent({
      fileName: 'huge.png',
      mimeType: 'image/png',
      sizeBytes: 10 * 1024 * 1024 + 1,
    });
    expect(res.status).toBe(400);
  });

  it('sizeBytes = 0 / 负数 → 400', async () => {
    expect(
      (await createIntent({ fileName: 'a.png', mimeType: 'image/png', sizeBytes: 0 })).status,
    ).toBe(400);
    expect(
      (await createIntent({ fileName: 'a.png', mimeType: 'image/png', sizeBytes: -1 })).status,
    ).toBe(400);
  });

  it('complete 时 altText 只有空白 → 403', async () => {
    const intent = await createIntent({
      fileName: 'ok.png',
      mimeType: 'image/png',
      sizeBytes: 2048,
    });
    expect(intent.mediaId).toBeDefined();
    const res = await request(serverOf(liveApp()))
      .post(`/api/v1/admin/media/${String(intent.mediaId)}/complete`)
      .set('Authorization', bearer(tokenFor(editor)))
      .send({
        checksum: 'a'.repeat(64),
        altText: '   ',
        rightsStatus: 'CC_BY',
      });
    expect(res.status).toBe(403);
  });

  it('complete 时 checksum 非 sha256 hex → 400', async () => {
    const intent = await createIntent({
      fileName: 'ok.png',
      mimeType: 'image/png',
      sizeBytes: 2048,
    });
    const res = await request(serverOf(liveApp()))
      .post(`/api/v1/admin/media/${String(intent.mediaId)}/complete`)
      .set('Authorization', bearer(tokenFor(editor)))
      .send({ checksum: 'not-a-sha256', altText: '说明', rightsStatus: 'CC_BY' });
    expect(res.status).toBe(400);
  });

  it('rightsStatus=UNKNOWN 完成上传 → 201 但 usableInPublic=false', async () => {
    const intent = await createIntent({
      fileName: 'unknown.png',
      mimeType: 'image/png',
      sizeBytes: 2048,
    });
    const res = await request(serverOf(liveApp()))
      .post(`/api/v1/admin/media/${String(intent.mediaId)}/complete`)
      .set('Authorization', bearer(tokenFor(editor)))
      .send({ checksum: 'b'.repeat(64), altText: '版权未澄清', rightsStatus: 'UNKNOWN' });
    expect(res.status).toBe(201);
    const body = res.body as { data: { usableInPublic: boolean; rightsStatus: string } };
    expect(body.data.rightsStatus).toBe('UNKNOWN');
    expect(body.data.usableInPublic).toBe(false);
  });

  it('rightsStatus=RESTRICTED 完成上传 → 201 但 usableInPublic=false', async () => {
    const intent = await createIntent({
      fileName: 'restricted.png',
      mimeType: 'image/png',
      sizeBytes: 2048,
    });
    const res = await request(serverOf(liveApp()))
      .post(`/api/v1/admin/media/${String(intent.mediaId)}/complete`)
      .set('Authorization', bearer(tokenFor(editor)))
      .send({ checksum: 'c'.repeat(64), altText: '受限', rightsStatus: 'RESTRICTED' });
    expect(res.status).toBe(201);
    expect((res.body as { data: { usableInPublic: boolean } }).data.usableInPublic).toBe(false);
  });

  it('rightsStatus=CC_BY 完成上传 → 201 且 usableInPublic=true（对照组）', async () => {
    const intent = await createIntent({
      fileName: 'good.png',
      mimeType: 'image/png',
      sizeBytes: 2048,
    });
    const res = await request(serverOf(liveApp()))
      .post(`/api/v1/admin/media/${String(intent.mediaId)}/complete`)
      .set('Authorization', bearer(tokenFor(editor)))
      .send({ checksum: 'd'.repeat(64), altText: '示意图', rightsStatus: 'CC_BY' });
    expect(res.status).toBe(201);
    expect((res.body as { data: { usableInPublic: boolean } }).data.usableInPublic).toBe(true);
  });

  it('重复确认同一个上传意图 → 403（不可二次置 CONFIRMED）', async () => {
    const intent = await createIntent({
      fileName: 'dup.png',
      mimeType: 'image/png',
      sizeBytes: 2048,
    });
    const payload = { checksum: 'e'.repeat(64), altText: '重复确认', rightsStatus: 'CC_BY' };
    const first = await request(serverOf(liveApp()))
      .post(`/api/v1/admin/media/${String(intent.mediaId)}/complete`)
      .set('Authorization', bearer(tokenFor(editor)))
      .send(payload);
    expect(first.status).toBe(201);
    const second = await request(serverOf(liveApp()))
      .post(`/api/v1/admin/media/${String(intent.mediaId)}/complete`)
      .set('Authorization', bearer(tokenFor(editor)))
      .send(payload);
    expect(second.status).toBe(403);
  });

  it('B 角色的 EDITOR 不能完成 A 角色创建的意图之外的角色越权（VIEWER 完成）→ 403', async () => {
    const intent = await createIntent({
      fileName: 'viewer.png',
      mimeType: 'image/png',
      sizeBytes: 2048,
    });
    const res = await request(serverOf(liveApp()))
      .post(`/api/v1/admin/media/${String(intent.mediaId)}/complete`)
      .set('Authorization', bearer(tokenFor(viewer)))
      .send({ checksum: 'f'.repeat(64), altText: '越权完成', rightsStatus: 'CC_BY' });
    expect(res.status).toBe(403);
  });

  it('上传 DTO 里的未知字段（objectKey 走私）→ 400', async () => {
    const res = await createIntent({
      fileName: 'sneaky.png',
      mimeType: 'image/png',
      sizeBytes: 2048,
      objectKey: '../../etc/passwd',
    });
    expect(res.status).toBe(400);
  });
});

// ===========================================================================
// 7. 信息泄露
//    防的是：未发布内容存在性、内部字段（作者 / 版本 / 状态 / 密码哈希）外泄，
//    以及 5xx 把堆栈 / SQL / 文件路径吐给客户端。
// ===========================================================================

describe('7. 信息泄露', () => {
  it('未发布内容的公开 URL → 404', async () => {
    const draft = await createContentRow({ authorId: admin.id, status: 'DRAFT' });
    const res = await request(serverOf(liveApp())).get(`/api/v1/contents/${draft.slug}`);
    expect(res.status).toBe(404);
  });

  it('已归档内容的公开 URL → 404', async () => {
    const archived = await createContentRow({ authorId: admin.id, status: 'ARCHIVED' });
    const res = await request(serverOf(liveApp())).get(`/api/v1/contents/${archived.slug}`);
    expect(res.status).toBe(404);
  });

  it('未发布 vs 不存在的 404 响应体完全一致（不泄露存在性）', async () => {
    const draft = await createContentRow({ authorId: admin.id, status: 'DRAFT' });
    const unpublished = await request(serverOf(liveApp())).get(`/api/v1/contents/${draft.slug}`);
    const missing = await request(serverOf(liveApp())).get(
      `/api/v1/contents/sec-definitely-missing-${nextId()}`,
    );
    expect(unpublished.status).toBe(missing.status);
    const strip = (res: { body: unknown }): unknown => {
      const body = res.body as { error: { requestId: string } };
      return { ...body.error, requestId: '<redacted>' };
    };
    expect(strip(unpublished)).toEqual(strip(missing));
  });

  it('公开内容详情不含 createdById / version / status / archivedAt', async () => {
    const published = await createContentRow({ authorId: admin.id, status: 'PUBLISHED' });
    const res = await request(serverOf(liveApp())).get(`/api/v1/contents/${published.slug}`);
    expect(res.status).toBe(200);
    expectNoInternalKeys(res.body, 'GET /contents/:slug');
  });

  it('公开内容列表不含内部字段', async () => {
    await createContentRow({ authorId: admin.id, status: 'PUBLISHED' });
    const res = await request(serverOf(liveApp())).get('/api/v1/contents?limit=50');
    expect(res.status).toBe(200);
    expectNoInternalKeys(res.body, 'GET /contents');
  });

  it('公开地点详情不含内部字段', async () => {
    const place = await createContentRow({ authorId: admin.id, status: 'PUBLISHED' });
    await prisma.place.create({
      data: {
        contentId: place.id,
        address: '示例地址（待核验）',
        lon: 118.78,
        lat: 32.04,
        accuracy: 'EXACT',
        verificationStatus: 'VERIFIED',
      },
    });
    const res = await request(serverOf(liveApp())).get(`/api/v1/places/${place.slug}`);
    expect(res.status).toBe(200);
    expectNoInternalKeys(res.body, 'GET /places/:slug');
  });

  it('公开搜索结果不含内部字段', async () => {
    await createContentRow({ authorId: admin.id, status: 'PUBLISHED' });
    const res = await request(serverOf(liveApp())).get(
      `/api/v1/search?q=${encodeURIComponent('安全测试内容')}`,
    );
    expect(res.status).toBe(200);
    expectNoInternalKeys(res.body, 'GET /search');
  });

  it('5xx 响应不含堆栈 / SQL / 文件路径 / 内部错误文案', async () => {
    // 管理员禁用自己会走到一条未归类的 throw，是一条真实的 500 路径。
    const res = await request(serverOf(liveApp()))
      .patch(`/api/v1/admin/users/${admin.id}`)
      .set('Authorization', bearer(tokenFor(admin)))
      .send({ disabled: true });
    expect(res.status).toBe(500);
    const text = JSON.stringify(res.body);
    expect((res.body as { error: { code: string } }).error.code).toBe('INTERNAL_ERROR');
    expect(text).not.toContain('stack');
    expect(text).not.toContain('SQLITE');
    expect(text).not.toContain('prisma');
    expect(text).not.toContain('.ts');
    expect(text).not.toContain('\\');
    // 内部异常文案本身也不能外泄
    expect(text).not.toContain('不能禁用');
    expect(text).not.toContain('Error:');
    expect((res.body as { error: { requestId: string } }).error.requestId).toBeTruthy();
  });

  it('登录失败文案统一：账号不存在 vs 密码错误 完全一致', async () => {
    const existing = await createUser(['EDITOR']);
    const wrongPassword = await request(serverOf(liveApp()))
      .post(LOGIN_ROUTE)
      .send({ email: existing.email, password: 'definitely-wrong' });
    const noSuchUser = await request(serverOf(liveApp()))
      .post(LOGIN_ROUTE)
      .send({ email: `nobody-${nextId()}@security.test`, password: PASSWORD });
    expect(wrongPassword.status).toBe(401);
    expect(noSuchUser.status).toBe(401);
    const pick = (res: { body: unknown }): unknown => {
      const body = res.body as { error: { code: string; message: string } };
      return { code: body.error.code, message: body.error.message };
    };
    expect(pick(wrongPassword)).toEqual(pick(noSuchUser));
  });

  it('禁用账号的登录文案与普通失败一致（不可枚举）', async () => {
    const disabled = await createUser(['EDITOR'], true);
    const res = await request(serverOf(liveApp()))
      .post(LOGIN_ROUTE)
      .send({ email: disabled.email, password: PASSWORD });
    expect(res.status).toBe(401);
    expect((res.body as { error: { message: string } }).error.message).toBe(
      '邮箱或密码不正确，或账号不可用',
    );
  });

  it('401 响应不含"用户不存在"之类可枚举信息', async () => {
    const res = await request(serverOf(liveApp())).get('/api/v1/auth/me');
    const text = JSON.stringify(res.body);
    expect(res.status).toBe(401);
    expect(text).not.toContain('用户不存在');
    expect(text).not.toContain('user not found');
  });
});

// ===========================================================================
// 8. Cookie / 会话
//    防的是：refresh token 明文落库、被盗后重放长期有效、cookie 属性缺失。
// ===========================================================================

describe('8. Cookie 与会话', () => {
  it('refresh token 在库里是 sha256 哈希而非明文', async () => {
    const user = await createUser(['EDITOR']);
    const login = await request(serverOf(liveApp()))
      .post(LOGIN_ROUTE)
      .send({ email: user.email, password: PASSWORD });
    expect(login.status).toBe(200);
    const plain = requireRefreshCookie(login);

    const rows = await prisma.refreshToken.findMany({ where: { userId: user.id } });
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.tokenHash).toMatch(/^[0-9a-f]{64}$/);
      expect(row.tokenHash).not.toBe(plain);
    }
    // 不是"随便一个 64 位十六进制"——必须正好等于明文的 sha256。
    const expected = createHash('sha256').update(plain, 'utf8').digest('hex');
    expect(rows.map((row) => row.tokenHash)).toContain(expected);
  });

  it('refresh cookie 带 HttpOnly', async () => {
    const user = await createUser(['EDITOR']);
    const res = await request(serverOf(liveApp()))
      .post(LOGIN_ROUTE)
      .send({ email: user.email, password: PASSWORD });
    const cookies = cookieHeaders(res);
    expect(cookies.some((c) => c.includes('HttpOnly'))).toBe(true);
  });

  it('refresh cookie 带 SameSite=Strict', async () => {
    const user = await createUser(['EDITOR']);
    const res = await request(serverOf(liveApp()))
      .post(LOGIN_ROUTE)
      .send({ email: user.email, password: PASSWORD });
    const cookies = cookieHeaders(res);
    expect(cookies.some((c) => /SameSite=Strict/i.test(c))).toBe(true);
  });

  it('refresh cookie 的 Path 限制在 /api/v1/auth', async () => {
    const user = await createUser(['EDITOR']);
    const res = await request(serverOf(liveApp()))
      .post(LOGIN_ROUTE)
      .send({ email: user.email, password: PASSWORD });
    const cookies = cookieHeaders(res);
    expect(cookies.some((c) => c.includes('Path=/api/v1/auth'))).toBe(true);
  });

  it('access token 不通过 Cookie 下发（只在 JSON body 里）', async () => {
    const user = await createUser(['EDITOR']);
    const res = await request(serverOf(liveApp()))
      .post(LOGIN_ROUTE)
      .send({ email: user.email, password: PASSWORD });
    const accessToken = (res.body as { data: { accessToken: string } }).data.accessToken;
    expect(accessToken.split('.')).toHaveLength(3);
    for (const cookie of cookieHeaders(res)) {
      expect(cookie).not.toContain(accessToken);
    }
  });

  it('重放已撤销的 refresh token → 401，且该用户全部会话被撤销', async () => {
    const user = await createUser(['EDITOR']);
    const first = await request(serverOf(liveApp()))
      .post(LOGIN_ROUTE)
      .send({ email: user.email, password: PASSWORD });
    const second = await request(serverOf(liveApp()))
      .post(LOGIN_ROUTE)
      .send({ email: user.email, password: PASSWORD });
    const cookieA = `nla_rt=${requireRefreshCookie(first)}`;
    const cookieB = `nla_rt=${requireRefreshCookie(second)}`;

    const rotate = await request(serverOf(liveApp()))
      .post('/api/v1/auth/refresh')
      .set('Cookie', cookieA);
    expect(rotate.status).toBe(200);

    const replay = await request(serverOf(liveApp()))
      .post('/api/v1/auth/refresh')
      .set('Cookie', cookieA);
    expect(replay.status).toBe(401);
    expect((replay.body as { error: { code: string } }).error.code).toBe('TOKEN_REVOKED');

    // 另一条独立会话也必须被牵连撤销（reuse detection）
    const other = await request(serverOf(liveApp()))
      .post('/api/v1/auth/refresh')
      .set('Cookie', cookieB);
    expect(other.status).toBe(401);

    const stillActive = await prisma.refreshToken.count({
      where: { userId: user.id, revokedAt: null },
    });
    expect(stillActive).toBe(0);
  });

  it('伪造的 refresh cookie → 401', async () => {
    const res = await request(serverOf(liveApp()))
      .post('/api/v1/auth/refresh')
      .set('Cookie', 'nla_rt=not-a-real-refresh-token-000000000000000000');
    expect(res.status).toBe(401);
  });

  it('refresh cookie 里畸形百分号编码 → 401 而不是 500', async () => {
    const res = await request(serverOf(liveApp()))
      .post('/api/v1/auth/refresh')
      .set('Cookie', 'nla_rt=%');
    expect(res.status).toBe(401);
    expect((res.body as { error: { code: string } }).error.code).toBe('TOKEN_REVOKED');
  });

  it('refresh 请求体里塞 token 字段（想让 refresh token 走 JSON）→ 400', async () => {
    const res = await request(serverOf(liveApp()))
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: 'whatever' });
    expect(res.status).toBe(400);
  });
});

// ===========================================================================
// 9. 限流
//    防的是：登录爆破。用独立 app 实例 + 收紧阈值，不污染其它用例的配额。
// ===========================================================================

describe('9. 登录限流', () => {
  let strictApp: INestApplication | undefined;
  let previousLimit: string | undefined;

  beforeAll(() => {
    // 本组专用：关掉每个用例前的限流桶复位。
    keepThrottleBuckets = true;
    previousLimit = process.env.AUTH_LOGIN_RATE_LIMIT;
    process.env.AUTH_LOGIN_RATE_LIMIT = '3';
    vi.resetModules();
  });

  afterAll(async () => {
    await closeTestApp(strictApp);
    if (previousLimit === undefined) {
      delete process.env.AUTH_LOGIN_RATE_LIMIT;
    } else {
      process.env.AUTH_LOGIN_RATE_LIMIT = previousLimit;
    }
    keepThrottleBuckets = false;
    vi.resetModules();
  });

  async function ensureStrictApp(): Promise<INestApplication> {
    if (strictApp === undefined) {
      const harness = await import('../app-harness.js');
      strictApp = await harness.createTestApp();
    }
    return strictApp;
  }

  it('连续失败超过阈值 → 429 且带 RATE_LIMITED', async () => {
    const instance = await ensureStrictApp();
    const statuses: number[] = [];
    let rateLimitedCode = '';
    for (let i = 0; i < 6; i += 1) {
      const res = await request(serverOf(instance))
        .post(LOGIN_ROUTE)
        .send({ email: `brute-${nextId()}@security.test`, password: 'wrong-on-purpose' });
      statuses.push(res.status);
      if (res.status === 429) {
        rateLimitedCode = (res.body as { error: { code: string } }).error.code;
      }
    }
    expect(statuses.slice(0, 3)).toEqual([401, 401, 401]);
    expect(statuses).toContain(429);
    expect(rateLimitedCode).toBe('RATE_LIMITED');
  });

  it('429 响应仍带 requestId（可追溯）', async () => {
    const instance = await ensureStrictApp();
    const res = await request(serverOf(instance))
      .post(LOGIN_ROUTE)
      .send({ email: `brute2-${nextId()}@security.test`, password: 'wrong-on-purpose' });
    expect(res.status).toBe(429);
    expect((res.body as { error: { requestId: string } }).error.requestId).toBeTruthy();
  });

  it('限流生效时错误体不含凭据或用户信息', async () => {
    const instance = await ensureStrictApp();
    const res = await request(serverOf(instance))
      .post(LOGIN_ROUTE)
      .send({ email: `brute3-${nextId()}@security.test`, password: 'wrong-on-purpose' });
    expect(res.status).toBe(429);
    const text = JSON.stringify(res.body);
    expect(text).not.toContain('password');
    expect(text).not.toContain('@security.test');
  });
});
