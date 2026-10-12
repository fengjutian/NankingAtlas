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

/** 单条路线最多 100 个站点。DTO 与 service 共用同一来源，避免两边写死不一致。 */
export const MAX_ROUTE_STOPS = 100;

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

/** 管理端站点视图：比公开视图多带内容状态与核验信息，供编排界面判断。 */
export interface AdminRouteStopView {
  position: number;
  note: string | null;
  place: {
    contentId: string;
    title: string;
    slug: string;
    status: string;
    archivedAt: string | null;
    verificationStatus: string;
    accuracy: string;
    hasPoint: boolean;
    pointNote: string | null;
  } | null;
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
            // 必须显式取发布状态：公开接口只返回已发布且未归档的内容
            // （技术方案 §7.2）。少了这两个字段，归档地点就会继续出现在公开路线页。
            status: true,
            archivedAt: true,
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
      const place = stop.place;
      // 站点引用的地点可能未发布 / 已归档 —— 保留序号并标记，
      // 静默丢弃会让「第 3 站」变成「第 2 站」，破坏策展语义。
      // 两个判据都写成"取反后再比较"，避免在可选链之后还要重复 `!place`。
      const unavailable = place?.status !== 'PUBLISHED' || (place?.archivedAt ?? null) !== null;
      if (place == null || unavailable) {
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
   * 管理端：读取路线站点（供编排界面展示）。
   *
   * 与 `getPublicRoute` 的区别：这里**不过滤发布状态**，编辑要能看到草稿路线的
   * 站点才能继续编排；同时返回地点的核验状态，让编排者知道哪些站点
   * **不会**画到地图上（FD-009：「无可靠坐标的站点保留列表内容，但不画精确点」）。
   */
  async listStopsForAdmin(routeId: string): Promise<AdminRouteStopView[]> {
    await this.assertRoute(routeId);
    const stops = await prisma.routeStop.findMany({
      where: { routeId },
      orderBy: { position: 'asc' },
      select: {
        position: true,
        note: true,
        // `place` 是指向 Content 的 relation：这里选的是**内容自身的标量字段**，
        // 不是外键 placeId —— 写成 contentId 会因为 relation 上不存在该字段而报错。
        place: {
          select: {
            id: true,
            title: true,
            slug: true,
            status: true,
            archivedAt: true,
            place: {
              select: { lon: true, lat: true, accuracy: true, verificationStatus: true },
            },
          },
        },
      },
    });

    return stops.map((stop) => {
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
          contentId: stop.place.id,
          title: stop.place.title,
          slug: stop.place.slug,
          status: stop.place.status,
          archivedAt: stop.place.archivedAt?.toISOString() ?? null,
          verificationStatus: coords.verificationStatus,
          accuracy: coords.accuracy,
          hasPoint: display.hasPoint,
          pointNote: display.note,
        },
      };
    });
  }

  /** 校验 routeId 存在且确实是**带 Route 扩展**的 ROUTE 内容。 */
  private async assertRoute(routeId: string): Promise<void> {
    const route = await prisma.content.findUnique({
      where: { id: routeId },
      select: { id: true, type: true, route: { select: { contentId: true } } },
    });
    if (route === null) {
      throw new ForbiddenError('路线不存在');
    }
    if (route.type !== 'ROUTE') {
      throw new ForbiddenError('只有 ROUTE 类型的内容可以有站点');
    }
    // 内容类型对了、但 Route 扩展行缺失（数据不完整）也要拦在这里。
    // 不拦的话会一路走到 createMany 触发外键 P2003，客户端收到的是
    // 「引用的对象不存在」—— 完全指不到真正的原因（缺的是这条内容的路线扩展）。
    if (route.route === null) {
      throw new ForbiddenError('该内容缺少路线扩展数据，请先补全路线的时长 / 距离字段');
    }
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
    if (input.stops.length > MAX_ROUTE_STOPS) {
      throw new ForbiddenError(`单条路线最多 ${String(MAX_ROUTE_STOPS)} 个站点`);
    }

    return prisma.$transaction(async (tx) => {
      await this.assertRoute(input.routeId);

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
