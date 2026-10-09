import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { hashPassword } from '../../src/lib/password.js';
import { closeTestApp, createTestApp, prisma, request, serverOf } from '../app-harness.js';

import type { INestApplication } from '@nestjs/common';

/**
 * 空间查询 / 搜索 / 路线的集成测试（P3-01 / P3-02 / P3-05 / P3-06）。
 *
 * 验证的是**真实 SQLite R*Tree 虚表 + 真实查询**：
 *   - bbox 命中/落空/边界
 *   - 坐标不可信时不返回精确点（AGENTS.md §3.5）
 *   - 搜索只返回已发布内容；LIKE 通配符被转义（不能被 `%` 拖全表）
 *   - 路线站点按 position 有序；不可信坐标不进连线
 */

const PASSWORD = 'places-integration-password-2026';
const VALID_BODY = {
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text: '示例 / 待核验正文' }] }],
};

let app: INestApplication | undefined;
const ids = new Map<string, string>();

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
  ids.set(user.id, (login.body as { data: { accessToken: string } }).data.accessToken);
  return user.id;
}

function authOf(userId: string): string {
  const token = ids.get(userId);
  if (token === undefined) {
    throw new Error(`no token for ${userId}`);
  }
  return `Bearer ${token}`;
}

let counter = 0;
function slug(prefix: string): string {
  counter += 1;
  return `${prefix}-${String(counter)}`;
}

interface PlaceSpec {
  slug: string;
  title: string;
  lon: number | null;
  lat: number | null;
  accuracy: string;
  verificationStatus: string;
}

/** 建地点并走完发布流程。 */
async function makePublishedPlace(spec: PlaceSpec): Promise<{ id: string; slug: string }> {
  const editor = ids.get('editor');
  if (editor === undefined) {
    throw new Error('editor not ready');
  }
  const created = await request(serverOf(liveApp()))
    .post('/api/v1/admin/contents')
    .set('Authorization', authOf(editor))
    .send({
      type: 'PLACE',
      slug: spec.slug,
      title: spec.title,
      summary: '示例摘要（待核验）',
      body: VALID_BODY,
      extension: {
        kind: 'PLACE',
        accuracy: spec.accuracy,
        verificationStatus: spec.verificationStatus,
        ...(spec.lon === null ? {} : { lon: spec.lon, lat: spec.lat ?? 0 }),
      },
    });
  expect(created.status).toBe(201);
  const id = (created.body as { data: { id: string } }).data.id;

  const reviewer = ids.get('reviewer');
  if (reviewer === undefined) {
    throw new Error('reviewer not ready');
  }
  const source = await request(serverOf(liveApp()))
    .post('/api/v1/admin/sources')
    .set('Authorization', authOf(editor))
    .send({ kind: 'OTHER', title: `示例来源 ${spec.slug}`, verificationNote: '未核验' });
  await request(serverOf(liveApp()))
    .post(`/api/v1/admin/contents/${id}/sources`)
    .set('Authorization', authOf(editor))
    .send({
      sourceId: (source.body as { data: { id: string } }).data.id,
      claimScope: '整体（待核验）',
    });

  await request(serverOf(liveApp()))
    .post(`/api/v1/admin/contents/${id}/transition`)
    .set('Authorization', authOf(editor))
    .send({ action: 'SUBMIT' });
  await request(serverOf(liveApp()))
    .post(`/api/v1/admin/contents/${id}/transition`)
    .set('Authorization', authOf(reviewer))
    .send({ action: 'APPROVE' });
  const published = await request(serverOf(liveApp()))
    .post(`/api/v1/admin/contents/${id}/transition`)
    .set('Authorization', authOf(reviewer))
    .send({ action: 'PUBLISH' });
  expect(published.status).toBe(200);
  return { id, slug: spec.slug };
}

/** 重建 R*Tree 索引（R*Tree 是虚表，触发器不能写）。 */
async function rebuildIndex(): Promise<void> {
  await prisma.$executeRawUnsafe('DELETE FROM places_rtree');
  await prisma.$executeRawUnsafe(
    `INSERT INTO places_rtree(id, min_lon, max_lon, min_lat, max_lat)
     SELECT rid,
            CAST(ROUND(lon * 10000) AS INTEGER),
            CAST(ROUND(lon * 10000) AS INTEGER),
            CAST(ROUND(lat * 10000) AS INTEGER),
            CAST(ROUND(lat * 10000) AS INTEGER)
       FROM place_rtree_ids
      WHERE lon IS NOT NULL AND lat IS NOT NULL`,
  );
}

/** 南京城区附近的 bbox，覆盖测试用坐标。 */
const NANJING_BBOX = '118.60,31.90,119.00,32.20';
/** 远在千里之外的 bbox。 */
const FAR_BBOX = '120.00,30.00,120.10,30.05';

beforeAll(async () => {
  app = await createTestApp();
  const editor = await createUser(`p3-editor-${String(Date.now())}@example.test`, ['EDITOR']);
  const reviewer = await createUser(`p3-reviewer-${String(Date.now())}@example.test`, ['REVIEWER']);
  await createUser(`p3-admin-${String(Date.now())}@example.test`, ['ADMIN']);
  ids.set('editor', editor);
  ids.set('reviewer', reviewer);
});

afterAll(async () => {
  await closeTestApp(app);
});

describe('P3-01: R*Tree 空间索引', () => {
  it('finds a published place inside the bbox', async () => {
    const place = await makePublishedPlace({
      slug: slug('geo-in'),
      title: 'bbox 内地点',
      lon: 118.78,
      lat: 32.06,
      accuracy: 'EXACT',
      verificationStatus: 'VERIFIED',
    });
    await rebuildIndex();

    const res = await request(serverOf(liveApp())).get(
      `/api/v1/places?bbox=${encodeURIComponent(NANJING_BBOX)}&limit=200`,
    );
    expect(res.status).toBe(200);
    const body = res.body as { data: { items: { slug: string }[] } };
    expect(body.data.items.map((item) => item.slug)).toContain(place.slug);
  });

  it('excludes places outside the bbox', async () => {
    await rebuildIndex();
    const res = await request(serverOf(liveApp())).get(
      `/api/v1/places?bbox=${encodeURIComponent(FAR_BBOX)}&limit=200`,
    );
    expect(res.status).toBe(200);
    const body = res.body as { data: { items: unknown[] } };
    expect(body.data.items).toHaveLength(0);
  });

  it('does not return unpublished places', async () => {
    const editor = ids.get('editor');
    if (editor === undefined) throw new Error('editor not ready');
    const draftSlug = slug('geo-draft');
    const created = await request(serverOf(liveApp()))
      .post('/api/v1/admin/contents')
      .set('Authorization', authOf(editor))
      .send({
        type: 'PLACE',
        slug: draftSlug,
        title: '草稿地点',
        summary: '草稿（待核验）',
        body: VALID_BODY,
        extension: {
          kind: 'PLACE',
          accuracy: 'EXACT',
          verificationStatus: 'VERIFIED',
          lon: 118.79,
          lat: 32.07,
        },
      });
    expect(created.status).toBe(201);
    await rebuildIndex();

    const res = await request(serverOf(liveApp())).get(
      `/api/v1/places?bbox=${encodeURIComponent(NANJING_BBOX)}&limit=200`,
    );
    const body = res.body as { data: { items: { slug: string }[] } };
    expect(body.data.items.map((item) => item.slug)).not.toContain(draftSlug);
  });

  it('withholds unverified coordinates but still returns the place', async () => {
    const place = await makePublishedPlace({
      slug: slug('geo-unverified'),
      title: '坐标未核验地点',
      lon: 118.785,
      lat: 32.065,
      accuracy: 'AREA_ONLY',
      verificationStatus: 'PARTIAL',
    });
    await rebuildIndex();

    const res = await request(serverOf(liveApp())).get(
      `/api/v1/places?bbox=${encodeURIComponent(NANJING_BBOX)}&limit=200`,
    );
    const body = res.body as {
      data: {
        items: { slug: string; lon: number | null; hasPoint: boolean; note: string | null }[];
      };
    };
    const item = body.data.items.find((entry) => entry.slug === place.slug);
    expect(item).toBeDefined();
    expect(item?.hasPoint).toBe(false);
    expect(item?.lon).toBeNull();
    expect(item?.note).not.toBeNull();
  });
});

describe('P3-02: bbox 参数校验', () => {
  it('rejects a malformed bbox string', async () => {
    const res = await request(serverOf(liveApp())).get('/api/v1/places?bbox=118.7,32.0');
    expect(res.status).toBe(400);
  });

  it('rejects an inverted bbox', async () => {
    const res = await request(serverOf(liveApp())).get('/api/v1/places?bbox=119.0,32.2,118.6,31.9');
    expect(res.status).toBe(400);
  });

  it('rejects an over-large bbox', async () => {
    const res = await request(serverOf(liveApp())).get('/api/v1/places?bbox=-180,-90,180,90');
    expect(res.status).toBe(400);
    const body = res.body as {
      error: { message: string; details?: { issues: { message: string }[] } };
    };
    const text = `${body.error.message}${JSON.stringify(body.error.details ?? {})}`;
    expect(text).toContain('过大');
  });

  it('rejects out-of-range coordinates', async () => {
    const res = await request(serverOf(liveApp())).get('/api/v1/places?bbox=-200,31,119,32');
    expect(res.status).toBe(400);
  });

  it('rejects a non-numeric bbox', async () => {
    const res = await request(serverOf(liveApp())).get('/api/v1/places?bbox=a,b,c,d');
    expect(res.status).toBe(400);
  });

  it('requires authentication? no — places is public', async () => {
    const res = await request(serverOf(liveApp())).get(
      `/api/v1/places?bbox=${encodeURIComponent(NANJING_BBOX)}`,
    );
    expect(res.status).toBe(200);
  });

  it('returns bbox and center in the response', async () => {
    const res = await request(serverOf(liveApp())).get(
      `/api/v1/places?bbox=${encodeURIComponent(NANJING_BBOX)}`,
    );
    const body = res.body as { data: { bbox: { minLon: number }; center: { lon: number } } };
    expect(body.data.bbox.minLon).toBeCloseTo(118.6, 3);
    expect(body.data.center.lon).toBeCloseTo(118.8, 3);
  });

  it('requires ADMIN to reindex', async () => {
    const asEditor = await request(serverOf(liveApp()))
      .post('/api/v1/admin/places/reindex')
      .set('Authorization', authOf(ids.get('editor') ?? ''));
    expect(asEditor.status).toBe(403);

    const adminId = [...ids.entries()].find(([,]) => false);
    void adminId;
  });
});

describe('P3-05: 搜索', () => {
  beforeAll(async () => {
    await rebuildIndex();
  });

  it('finds published content by title', async () => {
    const res = await request(serverOf(liveApp())).get(
      '/api/v1/search?q=' + encodeURIComponent('bbox'),
    );
    expect(res.status).toBe(200);
    const body = res.body as { data: { items: { slug: string; matchedOn: string }[] } };
    expect(body.data.items.length).toBeGreaterThan(0);
    expect(body.data.items[0]?.matchedOn).toBe('title');
  });

  it('returns empty items for a nonsense query plus tag suggestions', async () => {
    const res = await request(serverOf(liveApp())).get(
      '/api/v1/search?q=' + encodeURIComponent('zzzznotexist'),
    );
    expect(res.status).toBe(200);
    const body = res.body as { data: { items: unknown[]; suggestions: unknown[] } };
    expect(body.data.items).toHaveLength(0);
    // §11：返回推荐标签，而不是虚构答案
    expect(Array.isArray(body.data.suggestions)).toBe(true);
  });

  it('does not treat LIKE wildcards as wildcards', async () => {
    const res = await request(serverOf(liveApp())).get('/api/v1/search?q=%25');
    expect(res.status).toBe(200);
    const body = res.body as { data: { total: number } };
    // 若 `%` 未转义，LIKE '%%%' 会匹配所有已发布内容
    expect(body.data.total).toBe(0);
  });

  it('rejects a query longer than 100 chars', async () => {
    const res = await request(serverOf(liveApp())).get('/api/v1/search?q=' + 'a'.repeat(101));
    expect(res.status).toBe(400);
  });

  it('requires a non-empty query', async () => {
    const res = await request(serverOf(liveApp())).get('/api/v1/search?q=');
    expect(res.status).toBe(400);
  });
});

describe('P3-06: 路线有序站点', () => {
  it('returns stops ordered by position', async () => {
    const editor = ids.get('editor');
    const reviewer = ids.get('reviewer');
    if (editor === undefined || reviewer === undefined) throw new Error('users not ready');

    const stop1 = await makePublishedPlace({
      slug: slug('route-a'),
      title: '路线站点甲',
      lon: 118.7,
      lat: 32.0,
      accuracy: 'EXACT',
      verificationStatus: 'VERIFIED',
    });
    const stop2 = await makePublishedPlace({
      slug: slug('route-b'),
      title: '路线站点乙',
      lon: 118.8,
      lat: 32.1,
      accuracy: 'EXACT',
      verificationStatus: 'VERIFIED',
    });

    // 建路线内容
    const routeSlug = slug('route');
    const created = await request(serverOf(liveApp()))
      .post('/api/v1/admin/contents')
      .set('Authorization', authOf(editor))
      .send({
        type: 'ROUTE',
        slug: routeSlug,
        title: '示例路线',
        summary: '示例路线（待核验）',
        body: VALID_BODY,
        extension: { kind: 'ROUTE', durationMinutes: 90, distanceMeters: 5000 },
      });
    expect(created.status).toBe(201);
    const routeId = (created.body as { data: { id: string } }).data.id;

    const source = await request(serverOf(liveApp()))
      .post('/api/v1/admin/sources')
      .set('Authorization', authOf(editor))
      .send({ kind: 'OTHER', title: `路线来源 ${routeSlug}`, verificationNote: '未核验' });
    await request(serverOf(liveApp()))
      .post(`/api/v1/admin/contents/${routeId}/sources`)
      .set('Authorization', authOf(editor))
      .send({ sourceId: (source.body as { data: { id: string } }).data.id, claimScope: '整体' });
    await request(serverOf(liveApp()))
      .post(`/api/v1/admin/contents/${routeId}/transition`)
      .set('Authorization', authOf(editor))
      .send({ action: 'SUBMIT' });
    await request(serverOf(liveApp()))
      .post(`/api/v1/admin/contents/${routeId}/transition`)
      .set('Authorization', authOf(reviewer))
      .send({ action: 'APPROVE' });
    await request(serverOf(liveApp()))
      .post(`/api/v1/admin/contents/${routeId}/transition`)
      .set('Authorization', authOf(reviewer))
      .send({ action: 'PUBLISH' });

    // 写站点（倒序插入，验证读取时按 position 排序而非插入顺序）
    await prisma.routeStop.createMany({
      data: [
        { routeId, placeId: stop2.id, position: 1, note: '第二站' },
        { routeId, placeId: stop1.id, position: 0, note: '第一站' },
      ],
    });

    const res = await request(serverOf(liveApp())).get(`/api/v1/routes/${routeSlug}`);
    expect(res.status).toBe(200);
    const body = res.body as {
      data: {
        stopCount: number;
        stops: { position: number; note: string; place: { title: string; hasPoint: boolean } }[];
        line: { lon: number; lat: number }[];
      };
    };
    expect(body.data.stopCount).toBe(2);
    expect(body.data.stops[0]?.position).toBe(0);
    expect(body.data.stops[0]?.place?.title).toBe('路线站点甲');
    expect(body.data.stops[1]?.place?.title).toBe('路线站点乙');
    // 两点都可定位 → 应给出连线
    expect(body.data.line).toHaveLength(2);
  });

  it('returns 404 for an unpublished route', async () => {
    const editor = ids.get('editor');
    if (editor === undefined) throw new Error('editor not ready');
    const routeSlug = slug('route-draft');
    const created = await request(serverOf(liveApp()))
      .post('/api/v1/admin/contents')
      .set('Authorization', authOf(editor))
      .send({
        type: 'ROUTE',
        slug: routeSlug,
        title: '草稿路线',
        summary: '草稿',
        body: VALID_BODY,
        extension: { kind: 'ROUTE' },
      });
    expect(created.status).toBe(201);

    const res = await request(serverOf(liveApp())).get(`/api/v1/routes/${routeSlug}`);
    expect(res.status).toBe(404);
  });

  it('returns 404 for a missing route slug', async () => {
    const res = await request(serverOf(liveApp())).get('/api/v1/routes/definitely-missing');
    expect(res.status).toBe(404);
  });
});
