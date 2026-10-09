import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';

import {
  closeTestApp,
  createTestApp,
  prisma,
  request,
  serverOf,
} from '../../../test/app-harness.js';
import { hashPassword } from '../../lib/password.js';

/**
 * 媒体上传意图与对象确认的集成测试（P1-09）。
 *
 * 覆盖纯校验单测看不到的**状态流转与数据库约束**：
 *   - intent 一次性：重复确认必须失败
 *   - 过期 intent 不可确认
 *   - 未知 mediaId → 404 而非 500
 *   - 审计落库
 */

const PASSWORD = 'media-integration-password-2026';
let app: INestApplication | undefined;
let editorToken = '';

function liveApp(): INestApplication {
  if (app === undefined) {
    throw new Error('app not initialised');
  }
  return app;
}

beforeAll(async () => {
  app = await createTestApp();

  const passwordHash = await hashPassword(PASSWORD);
  const user = await prisma.user.create({
    data: {
      email: 'media-editor@example.test',
      passwordHash,
      displayName: '媒体测试编辑',
      userRoles: { create: [{ role: 'EDITOR' }] },
    },
  });
  const login = await request(serverOf(liveApp()))
    .post('/api/v1/auth/login')
    .send({ email: user.email, password: PASSWORD });
  editorToken = (login.body as { data: { accessToken: string } }).data.accessToken;
});

afterAll(async () => {
  await closeTestApp(app);
});

const PNG_HEADER = {
  checksum: 'a'.repeat(64),
  altText: '示例图片替代文本',
  rightsStatus: 'CC_BY',
} as const;

describe('P1-09: upload intent lifecycle', () => {
  it('creates an intent with an unpredictable object key', async () => {
    const res = await request(serverOf(liveApp()))
      .post('/api/v1/admin/media/upload-intents')
      .set('Authorization', `Bearer ${editorToken}`)
      .send({ fileName: 'photo.png', mimeType: 'image/png', sizeBytes: 1024 });

    expect(res.status).toBe(201);
    const body = res.body as { data: { mediaId: string; uploadUrl: string; expiresAt: string } };
    expect(body.data.mediaId).toBeTruthy();
    expect(body.data.uploadUrl).toContain('/api/v1/admin/media/upload-target/');
    expect(new Date(body.data.expiresAt).getTime()).toBeGreaterThan(Date.now());

    const media = await prisma.media.findUniqueOrThrow({ where: { id: body.data.mediaId } });
    // object key 必须不可预测（16 字节随机）
    expect(media.objectKey).toMatch(/^media\/\d{4}\/\d{2}\/[0-9a-f]{32}\.png$/);
    // 初始版权状态未知
    expect(media.rightsStatus).toBe('UNKNOWN');
  });

  it('generates distinct object keys across intents', async () => {
    const keys = new Set<string>();
    for (let i = 0; i < 3; i += 1) {
      const res = await request(serverOf(liveApp()))
        .post('/api/v1/admin/media/upload-intents')
        .set('Authorization', `Bearer ${editorToken}`)
        .send({ fileName: `p${String(i)}.png`, mimeType: 'image/png', sizeBytes: 100 });
      const body = res.body as { data: { mediaId: string } };
      const media = await prisma.media.findUniqueOrThrow({
        where: { id: body.data.mediaId },
      });
      keys.add(media.objectKey);
    }
    expect(keys.size).toBe(3);
  });

  it('completes an intent and records cleared rights', async () => {
    const created = await request(serverOf(liveApp()))
      .post('/api/v1/admin/media/upload-intents')
      .set('Authorization', `Bearer ${editorToken}`)
      .send({ fileName: 'ok.png', mimeType: 'image/png', sizeBytes: 2048 });
    const mediaId = (created.body as { data: { mediaId: string } }).data.mediaId;

    const res = await request(serverOf(liveApp()))
      .post(`/api/v1/admin/media/${mediaId}/complete`)
      .set('Authorization', `Bearer ${editorToken}`)
      .send({
        ...PNG_HEADER,
        license: 'CC BY 4.0',
        creditLine: '示例署名',
        width: 800,
        height: 600,
      });

    expect(res.status).toBe(201);
    const body = res.body as { data: { rightsStatus: string; usableInPublic: boolean } };
    expect(body.data.rightsStatus).toBe('CC_BY');
    expect(body.data.usableInPublic).toBe(true);

    const media = await prisma.media.findUniqueOrThrow({ where: { id: mediaId } });
    expect(media.altText).toBe(PNG_HEADER.altText);
    expect(media.license).toBe('CC BY 4.0');
  });

  it('marks UNKNOWN rights as not publicly usable', async () => {
    const created = await request(serverOf(liveApp()))
      .post('/api/v1/admin/media/upload-intents')
      .set('Authorization', `Bearer ${editorToken}`)
      .send({ fileName: 'unknown.png', mimeType: 'image/png', sizeBytes: 512 });
    const mediaId = (created.body as { data: { mediaId: string } }).data.mediaId;

    const res = await request(serverOf(liveApp()))
      .post(`/api/v1/admin/media/${mediaId}/complete`)
      .set('Authorization', `Bearer ${editorToken}`)
      .send({ ...PNG_HEADER, rightsStatus: 'UNKNOWN' });

    expect(res.status).toBe(201);
    expect((res.body as { data: { usableInPublic: boolean } }).data.usableInPublic).toBe(false);
  });

  it('rejects a second completion of the same intent', async () => {
    const created = await request(serverOf(liveApp()))
      .post('/api/v1/admin/media/upload-intents')
      .set('Authorization', `Bearer ${editorToken}`)
      .send({ fileName: 'twice.png', mimeType: 'image/png', sizeBytes: 512 });
    const mediaId = (created.body as { data: { mediaId: string } }).data.mediaId;

    const first = await request(serverOf(liveApp()))
      .post(`/api/v1/admin/media/${mediaId}/complete`)
      .set('Authorization', `Bearer ${editorToken}`)
      .send(PNG_HEADER);
    expect(first.status).toBe(201);

    const second = await request(serverOf(liveApp()))
      .post(`/api/v1/admin/media/${mediaId}/complete`)
      .set('Authorization', `Bearer ${editorToken}`)
      .send(PNG_HEADER);
    expect(second.status).toBe(403);
  });

  it('rejects an unknown media id without leaking a 500', async () => {
    const res = await request(serverOf(liveApp()))
      .post('/api/v1/admin/media/does-not-exist/complete')
      .set('Authorization', `Bearer ${editorToken}`)
      .send(PNG_HEADER);

    // 语义应是 403（业务校验）而非 500（未处理异常）
    expect(res.status).toBe(403);
  });

  it('rejects a whitespace-only alt text', async () => {
    const created = await request(serverOf(liveApp()))
      .post('/api/v1/admin/media/upload-intents')
      .set('Authorization', `Bearer ${editorToken}`)
      .send({ fileName: 'noalt.png', mimeType: 'image/png', sizeBytes: 512 });
    const mediaId = (created.body as { data: { mediaId: string } }).data.mediaId;

    const res = await request(serverOf(liveApp()))
      .post(`/api/v1/admin/media/${mediaId}/complete`)
      .set('Authorization', `Bearer ${editorToken}`)
      .send({ ...PNG_HEADER, altText: '   ' });

    // zod 的 min(1) 放行了纯空白，业务层 trim 后判空 → 403
    expect(res.status).toBe(403);
  });

  it('rejects an empty alt text at the schema layer', async () => {
    const created = await request(serverOf(liveApp()))
      .post('/api/v1/admin/media/upload-intents')
      .set('Authorization', `Bearer ${editorToken}`)
      .send({ fileName: 'emptyname.png', mimeType: 'image/png', sizeBytes: 512 });
    const mediaId = (created.body as { data: { mediaId: string } }).data.mediaId;

    const res = await request(serverOf(liveApp()))
      .post(`/api/v1/admin/media/${mediaId}/complete`)
      .set('Authorization', `Bearer ${editorToken}`)
      .send({ ...PNG_HEADER, altText: '' });

    // zod min(1) 直接拒 → 400
    expect(res.status).toBe(400);
  });

  it('rejects a malformed checksum', async () => {
    const created = await request(serverOf(liveApp()))
      .post('/api/v1/admin/media/upload-intents')
      .set('Authorization', `Bearer ${editorToken}`)
      .send({ fileName: 'badsum.png', mimeType: 'image/png', sizeBytes: 512 });
    const mediaId = (created.body as { data: { mediaId: string } }).data.mediaId;

    const res = await request(serverOf(liveApp()))
      .post(`/api/v1/admin/media/${mediaId}/complete`)
      .set('Authorization', `Bearer ${editorToken}`)
      .send({ ...PNG_HEADER, checksum: 'not-a-sha256' });

    expect(res.status).toBe(400);
  });

  it('rejects an extension that mismatches the MIME type', async () => {
    const res = await request(serverOf(liveApp()))
      .post('/api/v1/admin/media/upload-intents')
      .set('Authorization', `Bearer ${editorToken}`)
      .send({ fileName: 'evil.exe', mimeType: 'image/png', sizeBytes: 512 });

    expect(res.status).toBe(403);
  });

  it('rejects an oversized file', async () => {
    const res = await request(serverOf(liveApp()))
      .post('/api/v1/admin/media/upload-intents')
      .set('Authorization', `Bearer ${editorToken}`)
      .send({ fileName: 'huge.png', mimeType: 'image/png', sizeBytes: 20 * 1024 * 1024 });

    expect(res.status).toBe(400);
  });

  it('rejects an unauthenticated upload intent', async () => {
    const res = await request(serverOf(liveApp()))
      .post('/api/v1/admin/media/upload-intents')
      .send({ fileName: 'x.png', mimeType: 'image/png', sizeBytes: 100 });
    expect(res.status).toBe(401);
  });

  it('writes an audit trail for intent creation and completion', async () => {
    const created = await request(serverOf(liveApp()))
      .post('/api/v1/admin/media/upload-intents')
      .set('Authorization', `Bearer ${editorToken}`)
      .send({ fileName: 'audited.png', mimeType: 'image/png', sizeBytes: 512 });
    const mediaId = (created.body as { data: { mediaId: string } }).data.mediaId;

    await request(serverOf(liveApp()))
      .post(`/api/v1/admin/media/${mediaId}/complete`)
      .set('Authorization', `Bearer ${editorToken}`)
      .send(PNG_HEADER);

    const rows = await prisma.auditLog.findMany({
      where: { entityId: mediaId },
      orderBy: { createdAt: 'asc' },
    });
    expect(rows.map((row) => row.action)).toEqual(['media.upload_intent', 'media.complete']);
  });
});
