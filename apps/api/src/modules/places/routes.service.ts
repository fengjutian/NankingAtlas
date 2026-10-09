import { Injectable } from '@nestjs/common';

import { pointDisplay, type PointLike } from './places-query.service.js';
import { ForbiddenError } from '../../common/auth/roles.guard.js';
import { prisma } from '../../lib/prisma.js';

/**
 * 路线有序站点（P3-06）。
 *
 * 技术方案 §4：`route_stops` | route_id、place_id、position、note；
 * `(route_id, position)` unique
 * §9.1：`/routes/[slug]` ISR —— 策展内容与有序站点
 *
 * 「有序」是硬要求：position 决定顺序，前端必须按 position 升序渲染，
 * 不能按创建时间或拼音排 —— 策展路线的时间顺序本身就是内容。
 */

export interface RouteStopView {
  position: number;
  note: string | null;
  place: {
    slug: string;
    title: string;
    accuracy: string;
    verificationStatus: string;
    lon: number | null;
    lat: number | null;
    hasPoint: boolean;
    pointNote: string | null;
  } | null;
}

export interface RouteView {
  slug: string;
  title: string;
  summary: string | null;
  durationMinutes: number | null;
  distanceMeters: number | null;
  stopCount: number;
  /** 按 position 升序；place 缺失的站点保留位置并标记（而不是丢弃）。 */
  stops: RouteStopView[];
  /** 所有站点都可定位时，用于地图连线；否则为空数组让地图降级为点列表。 */
  line: { lon: number; lat: number }[];
}

@Injectable()
export class RoutesService {
  /**
   * 读取路线的有序站点。
   *
   * 已发布才可见 —— 与其它公开接口一致。
   */
  async getPublicRoute(slug: string): Promise<RouteView | null> {
    const route = await prisma.content.findFirst({
      where: { slug, type: 'ROUTE', status: 'PUBLISHED', archivedAt: null },
      select: {
        id: true,
        slug: true,
        title: true,
        summary: true,
        route: {
          select: { durationMinutes: true, distanceMeters: true },
        },
      },
    });
    if (route === null) {
      return null;
    }

    const stops = await prisma.routeStop.findMany({
      where: { routeId: route.id },
      orderBy: { position: 'asc' },
      select: {
        position: true,
        note: true,
        place: {
          select: {
            slug: true,
            title: true,
            place: {
              select: {
                lon: true,
                lat: true,
                accuracy: true,
                verificationStatus: true,
              },
            },
          },
        },
      },
    });

    const views: RouteStopView[] = stops.map((stop) => {
      // 站点引用的地点可能未发布 / 已归档 —— 保留序号并标记，
      // 静默丢弃会让"第 3 站"变成"第 2 站"，破坏策展语义。
      if (stop.place === null) {
        return { position: stop.position, note: stop.note, place: null };
      }
      const coords: PointLike = {
        lon: stop.place.place?.lon ?? null,
        lat: stop.place.place?.lat ?? null,
        accuracy: stop.place.place?.accuracy ?? 'UNKNOWN',
        verificationStatus: stop.place.place?.verificationStatus ?? 'UNVERIFIED',
      };
      const display = pointDisplay(coords);
      return {
        position: stop.position,
        note: stop.note,
        place: {
          slug: stop.place.slug,
          title: stop.place.title,
          accuracy: coords.accuracy,
          verificationStatus: coords.verificationStatus,
          lon: display.hasPoint ? coords.lon : null,
          lat: display.hasPoint ? coords.lat : null,
          hasPoint: display.hasPoint,
          pointNote: display.note,
        },
      };
    });

    // 连线只含可信坐标的点；含不可信点时不连线（画错线比不画更糟）
    const line = views
      .map((stop) =>
        stop.place?.hasPoint === true
          ? { lon: stop.place.lon ?? 0, lat: stop.place.lat ?? 0 }
          : null,
      )
      .filter((point): point is { lon: number; lat: number } => point !== null);

    const complete = views.every((stop) => stop.place?.hasPoint === true);

    return {
      slug: route.slug,
      title: route.title,
      summary: route.summary,
      durationMinutes: route.route?.durationMinutes ?? null,
      distanceMeters: route.route?.distanceMeters ?? null,
      stopCount: views.length,
      stops: views,
      line: complete ? line : [],
    };
  }

  /**
   * 管理端：整条替换路线站点（按 position 排序写入）。
   *
   * 整条替换而非增量增删：策展路线是**整体语义**，
   * 逐个改 position 会产生重复或空洞的中间态。
   */
  async replaceStops(input: {
    routeId: string;
    stops: readonly { placeContentId: string; note?: string | null }[];
    actorId: string;
    requestId: string;
  }): Promise<{ stopCount: number }> {
    if (input.stops.length > 100) {
      throw new ForbiddenError('单条路线最多 100 个站点');
    }

    return prisma.$transaction(async (tx) => {
      const route = await tx.content.findUnique({
        where: { id: input.routeId },
        select: { id: true, type: true },
      });
      if (route === null) {
        throw new ForbiddenError('路线不存在');
      }
      if (route.type !== 'ROUTE') {
        throw new ForbiddenError('只有 ROUTE 类型的内容可以有站点');
      }

      // 所有引用的地点必须存在且是 PLACE
      const placeIds = input.stops.map((stop) => stop.placeContentId);
      const places = await tx.place.findMany({
        where: { contentId: { in: placeIds } },
        select: { contentId: true },
      });
      const validIds = new Set(places.map((place) => place.contentId));
      const invalid = placeIds.filter((id) => !validIds.has(id));
      if (invalid.length > 0) {
        throw new ForbiddenError(`以下站点不是有效的地点条目：${invalid.join(', ')}`);
      }

      // 整条替换
      await tx.routeStop.deleteMany({ where: { routeId: input.routeId } });
      await tx.routeStop.createMany({
        data: input.stops.map((stop, index) => ({
          routeId: input.routeId,
          placeId: stop.placeContentId,
          position: index,
          note: stop.note ?? null,
        })),
      });

      await tx.auditLog.create({
        data: {
          actorId: input.actorId,
          requestId: input.requestId,
          action: 'route.replace_stops',
          entityType: 'content',
          entityId: input.routeId,
          afterJson: JSON.stringify({ stopCount: input.stops.length }),
        },
      });

      return { stopCount: input.stops.length };
    });
  }
}
