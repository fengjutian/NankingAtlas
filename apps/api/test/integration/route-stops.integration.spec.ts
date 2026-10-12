import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { hashPassword } from '../../src/lib/password.js';
import { closeTestApp, createTestApp, prisma, request, serverOf } from '../app-harness.js';

import type { INestApplication } from '@nestjs/common';

/**
 * FD-009 路线编排的集成测试。
 *
 * ## 为什么写这一组
 *
 * `RoutesService.replaceStops` 早就实现了（position 按 index 写入 → 天然连续唯一、
 * 地点必须是 PLACE、写入审计），但**没有任何 controller 调用它** —— 站点编排的
 * HTTP 链路根本不存在。结果是 `route_stops` 表永远为空，公开路线页的
 * `stops` 永远是 `[]`，路线功能形同虚设。
 *
 * 本文件锁住接通后的契约：position 连续、删除地点不破坏已发布路线、
 * 无可靠坐标的站点保留在列表但不参与连线。
 */

const PASSWORD = 'route-stop-integration-pw-2026';

let app: INestApplication | undefined;
const tokens = new Map<string, string>();
let counter = 0;

function ensureApp(): INestApplication {
  if (app === undefined) {
    throw new Error('app not initialised');
  }
  return app;
}

async function createUser(roles: string[]): Promise<string> {
  counter += 1;
  const email = `route-${String(counter)}-${String(Date.now())}@example.test`;
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash: await hashPassword(PASSWORD),
      displayName: `路线用户 ${String(counter)}`,
      userRoles: { create: roles.map((role) => ({ role })) },
    },
  });
  const login = await request(serverOf(ensureApp()))
    .post('/api/v1/auth/login')
    .send({ email, password: PASSWORD });
  tokens.set(user.id, (login.body as { data: { accessToken: string } }).data.accessToken);
  return user.id;
}

function authHeader(userId: string): string {
  const token = tokens.get(userId);
  if (token === undefined) {
    throw new Error(`no token for user ${userId}`);
  }
  return `Bearer ${token}`;
}

let seq = 0;

/** 建一条内容（默认 DRAFT）。 */
async function createContent(
  userId: string,
  type: 'ROUTE' | 'PLACE' | 'TOPIC',
  overrides: { status?: 'DRAFT' | 'PUBLISHED' } = {},
): Promise<string> {
  seq += 1;
  const row = await prisma.content.create({
    data: {
      type,
      slug: `route-it-${String(seq)}-${String(Date.now())}`,
      title: `${type}-${String(seq)} 示例内容`,
      bodyJson: JSON.stringify({
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: '示例正文。' }] }],
      }),
      status: overrides.status ?? 'DRAFT',
      publishedAt: overrides.status === 'PUBLISHED' ? new Date() : null,
      createdById: userId,
      updatedById: userId,
    },
  });
  return row.id;
}

/** 建一条 ROUTE 内容，并补上 Route 扩展行 —— 站点写入依赖它。 */
async function createRouteContent(
  userId: string,
  overrides: { status?: 'DRAFT' | 'PUBLISHED' } = {},
): Promise<string> {
  const contentId = await createContent(userId, 'ROUTE', overrides);
  await prisma.route.create({
    data: { contentId, durationMinutes: 60, distanceMeters: 3000 },
  });
  return contentId;
}

/** 建一个地点，并按需写坐标核验状态。 */
async function createPlace(
  userId: string,
  coords?: { lon: number; lat: number; accuracy: string; verificationStatus: string },
): Promise<string> {
  const contentId = await createContent(userId, 'PLACE', { status: 'PUBLISHED' });
  await prisma.place.create({
    data: {
      contentId,
      address: '示例地址',
      lon: coords?.lon ?? null,
      lat: coords?.lat ?? null,
      accuracy: coords?.accuracy ?? 'UNKNOWN',
      verificationStatus: coords?.verificationStatus ?? 'UNVERIFIED',
    },
  });
  return contentId;
}

async function putStops(
  userId: string,
  routeId: string,
  stops: { placeContentId: string; note?: string | null }[],
): Promise<{ status: number; body: unknown }> {
  const res = await request(serverOf(ensureApp()))
    .put(`/api/v1/admin/routes/${routeId}/stops`)
    .set('Authorization', authHeader(userId))
    .send({ stops });
  return { status: res.status, body: res.body };
}

async function getStops(
  userId: string,
  routeId: string,
): Promise<{ status: number; body: unknown }> {
  const res = await request(serverOf(ensureApp()))
    .get(`/api/v1/admin/routes/${routeId}/stops`)
    .set('Authorization', authHeader(userId));
  return { status: res.status, body: res.body };
}

/** 读已发布路线的公开视图。 */
async function getPublicRoute(routeId: string): Promise<{
  status: number;
  stops: unknown[];
  line: unknown[];
}> {
  const routeRow = await prisma.content.findUnique({
    where: { id: routeId },
    select: { slug: true },
  });
  const res = await request(serverOf(ensureApp())).get(`/api/v1/routes/${routeRow?.slug ?? ''}`);
  if (res.status !== 200) {
    return { status: res.status, stops: [], line: [] };
  }
  const view = (res.body as { data: { stops: unknown[]; line: unknown[] } }).data;
  return { status: res.status, stops: view.stops, line: view.line };
}

interface AdminStop {
  position: number;
  note: string | null;
  place: {
    contentId: string;
    title: string;
    slug: string;
    status: string;
    /** 与 status 是**两个独立维度**：归档后 status 仍是 PUBLISHED。 */
    archivedAt: string | null;
    verificationStatus: string;
    accuracy: string;
    hasPoint: boolean;
  } | null;
}

beforeAll(async () => {
  app = await createTestApp();
});

afterAll(async () => {
  await closeTestApp(app);
});

describe('FD-009: 站点编排的 HTTP 链路', () => {
  it('未认证 401；EDITOR 可用（编排是编辑日常操作）', async () => {
    const userId = await createUser(['EDITOR']);
    const routeId = await createRouteContent(userId);

    const anon = await request(serverOf(ensureApp())).get(`/api/v1/admin/routes/${routeId}/stops`);
    expect(anon.status).toBe(401);

    expect((await getStops(userId, routeId)).status).toBe(200);
  });

  it('空路线返回空数组而不是 404', async () => {
    const userId = await createUser(['EDITOR']);
    const routeId = await createRouteContent(userId);
    const res = await getStops(userId, routeId);
    expect(res.status).toBe(200);
    expect((res.body as { data: { stops: AdminStop[] } }).data.stops).toEqual([]);
  });

  it('整条替换站点，position 从 0 连续递增', async () => {
    const userId = await createUser(['EDITOR']);
    const routeId = await createRouteContent(userId);
    const a = await createPlace(userId);
    const b = await createPlace(userId);
    const c = await createPlace(userId);

    const put = await putStops(userId, routeId, [
      { placeContentId: a, note: '起点示例' },
      { placeContentId: b },
      { placeContentId: c },
    ]);
    expect(put.status, `响应体：${JSON.stringify(put.body)}`).toBe(200);
    expect((put.body as { data: { stopCount: number } }).data.stopCount).toBe(3);

    const res = await getStops(userId, routeId);
    const stops = (res.body as { data: { stops: AdminStop[] } }).data.stops;
    expect(stops.map((stop) => stop.position)).toEqual([0, 1, 2]);
    expect(stops[0]?.note).toBe('起点示例');
    expect(stops.map((stop) => stop.place?.contentId)).toEqual([a, b, c]);
  });

  it('重排后 position 仍连续、无重复无空洞', async () => {
    const userId = await createUser(['EDITOR']);
    const routeId = await createRouteContent(userId);
    const a = await createPlace(userId);
    const b = await createPlace(userId);
    const c = await createPlace(userId);

    await putStops(userId, routeId, [
      { placeContentId: a },
      { placeContentId: b },
      { placeContentId: c },
    ]);
    const reorder = await putStops(userId, routeId, [
      { placeContentId: c },
      { placeContentId: a },
      { placeContentId: b },
    ]);
    expect(reorder.status).toBe(200);

    const res = await getStops(userId, routeId);
    const stops = (res.body as { data: { stops: AdminStop[] } }).data.stops;
    expect(stops.map((stop) => stop.position)).toEqual([0, 1, 2]);
    expect(stops.map((stop) => stop.place?.contentId)).toEqual([c, a, b]);
  });

  it('清空站点（传空数组）是合法操作', async () => {
    const userId = await createUser(['EDITOR']);
    const routeId = await createRouteContent(userId);
    const a = await createPlace(userId);

    await putStops(userId, routeId, [{ placeContentId: a }]);
    const cleared = await putStops(userId, routeId, []);
    expect(cleared.status).toBe(200);
    expect((cleared.body as { data: { stopCount: number } }).data.stopCount).toBe(0);

    const res = await getStops(userId, routeId);
    expect((res.body as { data: { stops: AdminStop[] } }).data.stops).toEqual([]);
  });

  it('站点必须是 PLACE：挂 TOPIC 被拒绝', async () => {
    const userId = await createUser(['EDITOR']);
    const routeId = await createRouteContent(userId);
    const topic = await createContent(userId, 'TOPIC');

    const res = await putStops(userId, routeId, [{ placeContentId: topic }]);
    expect(res.status).toBe(403);
    expect((res.body as { error: { message: string } }).error.message).toContain('地点');
  });

  it('站点不存在被拒绝', async () => {
    const userId = await createUser(['EDITOR']);
    const routeId = await createRouteContent(userId);
    const res = await putStops(userId, routeId, [{ placeContentId: 'place-does-not-exist' }]);
    expect(res.status).toBe(403);
  });

  it('只能给 ROUTE 类型配站点', async () => {
    const userId = await createUser(['EDITOR']);
    const notRoute = await createContent(userId, 'PLACE');
    const place = await createPlace(userId);
    const res = await putStops(userId, notRoute, [{ placeContentId: place }]);
    expect(res.status).toBe(403);
    expect((res.body as { error: { message: string } }).error.message).toContain('ROUTE');
  });

  it('缺少 Route 扩展的内容给出明确错误，而不是误导的外键 404', async () => {
    const userId = await createUser(['EDITOR']);
    // 只有内容、没有 Route 扩展行 —— 数据不完整的真实可能
    const bareRoute = await createContent(userId, 'ROUTE');
    const place = await createPlace(userId);
    const res = await putStops(userId, bareRoute, [{ placeContentId: place }]);
    expect(res.status).toBe(403);
    expect((res.body as { error: { message: string } }).error.message).toContain('路线扩展');
  });

  it('站点数超过上限被拒绝（DTO 层 400，早于业务校验）', async () => {
    const userId = await createUser(['EDITOR']);
    const routeId = await createRouteContent(userId);
    const place = await createPlace(userId);
    const stops = Array.from({ length: 101 }, () => ({ placeContentId: place }));
    const res = await putStops(userId, routeId, stops);
    // 请求体本身超限属于**请求格式问题** → 400，不是 403。
    expect(res.status).toBe(400);
  });

  it('客户端不许自己传 position（否则能造出跳号的路线）', async () => {
    const userId = await createUser(['EDITOR']);
    const routeId = await createRouteContent(userId);
    const place = await createPlace(userId);
    const res = await request(serverOf(ensureApp()))
      .put(`/api/v1/admin/routes/${routeId}/stops`)
      .set('Authorization', authHeader(userId))
      .send({ stops: [{ placeContentId: place, position: 99 }] });
    expect(res.status).toBe(400);
  });

  it('写入站点会留审计', async () => {
    const userId = await createUser(['EDITOR']);
    const routeId = await createRouteContent(userId);
    const place = await createPlace(userId);
    await putStops(userId, routeId, [{ placeContentId: place }]);

    const audit = await prisma.auditLog.findFirst({
      where: { entityId: routeId, action: 'route.replace_stops' },
      orderBy: { createdAt: 'desc' },
    });
    expect(audit).not.toBeNull();
    expect(audit?.afterJson).toContain('stopCount');
  });
});

describe('FD-009: 核验状态对编排的影响', () => {
  it('管理端能看出站点是否已核验、能否定位', async () => {
    const userId = await createUser(['EDITOR']);
    const routeId = await createRouteContent(userId);
    const verified = await createPlace(userId, {
      lon: 118.78,
      lat: 32.06,
      accuracy: 'EXACT',
      verificationStatus: 'VERIFIED',
    });
    const unverified = await createPlace(userId);

    await putStops(userId, routeId, [{ placeContentId: verified }, { placeContentId: unverified }]);

    const res = await getStops(userId, routeId);
    const stops = (res.body as { data: { stops: AdminStop[] } }).data.stops;
    expect(stops[0]?.place?.verificationStatus).toBe('VERIFIED');
    expect(stops[0]?.place?.hasPoint).toBe(true);
    // 未核验地点：仍在列表里（不能静默丢弃），但明确标出不可定位
    expect(stops[1]?.place?.verificationStatus).toBe('UNVERIFIED');
    expect(stops[1]?.place?.hasPoint).toBe(false);
  });

  it('未核验站点不参与地图连线，但保留在列表中', async () => {
    const userId = await createUser(['EDITOR']);
    const routeId = await createRouteContent(userId, { status: 'PUBLISHED' });
    const verified = await createPlace(userId, {
      lon: 118.78,
      lat: 32.06,
      accuracy: 'EXACT',
      verificationStatus: 'VERIFIED',
    });
    const unverified = await createPlace(userId);

    await putStops(userId, routeId, [{ placeContentId: verified }, { placeContentId: unverified }]);

    const view = await getPublicRoute(routeId);
    expect(view.status).toBe(200);
    expect(view.stops).toHaveLength(2);
    // 有未核验站点 → 整条线不画（画一半比不画更误导）
    expect(view.line).toEqual([]);
  });

  it('全部站点都核验时才画连线', async () => {
    const userId = await createUser(['EDITOR']);
    const routeId = await createRouteContent(userId, { status: 'PUBLISHED' });
    const a = await createPlace(userId, {
      lon: 118.78,
      lat: 32.06,
      accuracy: 'EXACT',
      verificationStatus: 'VERIFIED',
    });
    const b = await createPlace(userId, {
      lon: 118.8,
      lat: 32.05,
      accuracy: 'EXACT',
      verificationStatus: 'VERIFIED',
    });
    await putStops(userId, routeId, [{ placeContentId: a }, { placeContentId: b }]);

    const view = await getPublicRoute(routeId);
    const line = view.line as { lon: number; lat: number }[];
    expect(line).toHaveLength(2);
    expect(line[0]).toEqual({ lon: 118.78, lat: 32.06 });
  });
});

describe('FD-009: 删除地点不破坏已发布路线的追溯', () => {
  it('物理删除被路线引用的地点会被数据库拒绝 —— 追溯记录受保护', async () => {
    const userId = await createUser(['EDITOR']);
    const routeId = await createRouteContent(userId, { status: 'PUBLISHED' });
    const only = await createPlace(userId, {
      lon: 118.78,
      lat: 32.06,
      accuracy: 'EXACT',
      verificationStatus: 'VERIFIED',
    });
    await putStops(userId, routeId, [{ placeContentId: only }]);

    // `route_stops.place_id` 的外键是 onDelete: Restrict：
    // 直接物理删除会被数据库挡下。这正是 AGENTS.md §5.4 要的 ——
    // 追溯记录不被级联删除。所以产品的"删除"语义必须是**归档**。
    await expect(prisma.content.delete({ where: { id: only } })).rejects.toThrow();

    // 站点与路线都还在
    const res = await getStops(userId, routeId);
    expect((res.body as { data: { stops: AdminStop[] } }).data.stops).toHaveLength(1);
  });

  it('归档地点后，路线仍保留该站点并标出内容已归档', async () => {
    const userId = await createUser(['EDITOR']);
    const routeId = await createRouteContent(userId, { status: 'PUBLISHED' });
    const a = await createPlace(userId, {
      lon: 118.78,
      lat: 32.06,
      accuracy: 'EXACT',
      verificationStatus: 'VERIFIED',
    });
    const b = await createPlace(userId, {
      lon: 118.8,
      lat: 32.05,
      accuracy: 'EXACT',
      verificationStatus: 'VERIFIED',
    });
    await putStops(userId, routeId, [{ placeContentId: a }, { placeContentId: b }]);

    // 归档（产品的"删除"语义）：站点记录保留，序号不被重排
    await prisma.content.update({
      where: { id: a },
      data: { archivedAt: new Date() },
    });

    const res = await getStops(userId, routeId);
    const stops = (res.body as { data: { stops: AdminStop[] } }).data.stops;
    expect(stops).toHaveLength(2);
    expect(stops.map((stop) => stop.position)).toEqual([0, 1]);
    expect(stops[0]?.place?.contentId).toBe(a);
    // 归档与发布状态是两个独立维度：status 仍是 PUBLISHED，archivedAt 非空
    expect(stops[0]?.place?.archivedAt).not.toBeNull();

    // 公开路线页仍可访问；**已归档地点不出现在公开视图里**（技术方案 §7.2）
    //
    // 注意这里保留的是**站点占位**（position 不变），内容被置 null ——
    // 静默丢弃站点会让「第 1 站」变成「第 2 站」，破坏策展语义。
    const view = await getPublicRoute(routeId);
    expect(view.status).toBe(200);
    const publicStops = view.stops as { position: number; place: { title: string } | null }[];
    expect(publicStops).toHaveLength(2);
    expect(publicStops.map((stop) => stop.position)).toEqual([0, 1]);
    expect(publicStops[0]?.place).toBeNull();
    expect(publicStops[1]?.place?.title).toBeTruthy();
    // 有内容被置空 → 不连线（画一半比不画更误导）
    expect(view.line).toHaveLength(0);
  });

  it('公开路线页在归档唯一站点后仍可访问', async () => {
    const userId = await createUser(['EDITOR']);
    const routeId = await createRouteContent(userId, { status: 'PUBLISHED' });
    const only = await createPlace(userId, {
      lon: 118.78,
      lat: 32.06,
      accuracy: 'EXACT',
      verificationStatus: 'VERIFIED',
    });
    await putStops(userId, routeId, [{ placeContentId: only }]);

    await prisma.content.update({ where: { id: only }, data: { archivedAt: new Date() } });

    const view = await getPublicRoute(routeId);
    expect(view.status).toBe(200);
    // 站点占位保留，内容被置 null（见上一个用例的说明）
    expect(view.stops).toHaveLength(1);
    expect((view.stops[0] as { place: unknown }).place).toBeNull();
    expect(view.line).toHaveLength(0);
  });
});
